import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { TxLineClient, type Fixture, type OddsSnapshot, type ScoreEvent } from "@txline/core";

const repoRoot = process.cwd();
const sampleDir = join(repoRoot, "data/samples");
const liveCredsPath = join(repoRoot, "data/live/txline-devnet-credentials.json");

interface StoredCreds {
  jwt: string;
  apiToken: string;
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}

async function loadCreds(): Promise<StoredCreds | null> {
  if (process.env.TXLINE_JWT && process.env.TXLINE_API_TOKEN) {
    return { jwt: process.env.TXLINE_JWT, apiToken: process.env.TXLINE_API_TOKEN };
  }
  try {
    return await readJson<StoredCreds>(liveCredsPath);
  } catch (error) {
    if (error instanceof Error) console.warn(`TxLINE creds unavailable: ${error.message}`);
    return null;
  }
}

export async function loadTxLineClient(): Promise<TxLineClient | null> {
  const creds = await loadCreds();
  if (!creds) return null;
  return new TxLineClient({ network: "devnet", jwt: creds.jwt, apiToken: creds.apiToken });
}

export async function loadFixtures(): Promise<{ source: "live" | "sample"; fixtures: Fixture[] }> {
  const creds = await loadCreds();
  if (creds) {
    try {
      const client = new TxLineClient({ network: "devnet", jwt: creds.jwt, apiToken: creds.apiToken });
      const fixtures = await client.fixturesSnapshot();
      return { source: "live", fixtures };
    } catch (error) {
      if (error instanceof Error) console.warn(`Live fixtures failed: ${error.message}`);
    }
  }
  return { source: "sample", fixtures: await readJson<Fixture[]>(join(sampleDir, "fixtures.devnet.sample.json")) };
}

export async function loadDemoScoresWithSource(fixtureId = 18222446): Promise<{ source: "live" | "sample"; scores: ScoreEvent[] }> {
  const creds = await loadCreds();
  if (creds) {
    try {
      const client = new TxLineClient({ network: "devnet", jwt: creds.jwt, apiToken: creds.apiToken });
      const scores = await client.scoreSnapshot(fixtureId);
      if (scores.length) return { source: "live", scores };
    } catch (error) {
      if (error instanceof Error) console.warn(`Live scores failed: ${error.message}`);
    }
  }
  try {
    return { source: "sample", scores: await readJson<ScoreEvent[]>(join(sampleDir, `scores-${fixtureId}.devnet.sample.json`)) };
  } catch (error) {
    if (fixtureId !== 18222446 && error instanceof Error) {
      console.warn(`Sample scores unavailable for ${fixtureId}: ${error.message}. Falling back to proven fixture 18222446.`);
      return { source: "sample", scores: await readJson<ScoreEvent[]>(join(sampleDir, "scores-18222446.devnet.sample.json")) };
    }
    throw error;
  }
}

export async function loadDemoScores(fixtureId = 18222446): Promise<ScoreEvent[]> {
  return (await loadDemoScoresWithSource(fixtureId)).scores;
}

export async function loadReplayOdds(): Promise<OddsSnapshot[]> {
  return readJson<OddsSnapshot[]>(join(sampleDir, "odds-replay.sample.json"));
}

export async function loadReplayOddsWithSource(): Promise<{ source: "replay"; odds: OddsSnapshot[] }> {
  return { source: "replay", odds: await loadReplayOdds() };
}

export async function loadOddsWithSource(fixtureId: number): Promise<{ source: "live" | "replay"; odds: OddsSnapshot[] }> {
  const creds = await loadCreds();
  if (creds) {
    try {
      const client = new TxLineClient({ network: "devnet", jwt: creds.jwt, apiToken: creds.apiToken });
      const odds = await client.oddsSnapshot(fixtureId);
      if (odds.length) return { source: "live", odds };
    } catch (error) {
      if (error instanceof Error) console.warn(`Live odds failed: ${error.message}`);
    }
  }
  return loadReplayOddsWithSource();
}

const SAMPLE_FIXTURE_ID = 18222446;
let cachedActiveFixtureId: { id: number; at: number } | null = null;
const ACTIVE_FIXTURE_TTL_MS = 5 * 60_000;

/**
 * Pick the most demo-worthy fixture: prefer a live TxLINE fixture that actually
 * has score events (most events wins, World Cup weighted), so the whole app
 * shows real match data instead of a bundled sample. Cached briefly to avoid
 * re-probing every request. Falls back to the proven sample fixture.
 */
export async function resolveActiveFixtureId(): Promise<number> {
  if (cachedActiveFixtureId && Date.now() - cachedActiveFixtureId.at < ACTIVE_FIXTURE_TTL_MS) {
    return cachedActiveFixtureId.id;
  }
  const creds = await loadCreds();
  if (creds) {
    try {
      const client = new TxLineClient({ network: "devnet", jwt: creds.jwt, apiToken: creds.apiToken });
      const fixtures = await client.fixturesSnapshot();
      // Known score-rich fixtures (finished matches roll out of the forward
      // snapshot window, so probe them explicitly to keep the demo strong).
      const KNOWN_RICH = [18257739, 18222446];
      const candidateIds = Array.from(new Set([...KNOWN_RICH, ...fixtures.slice(0, 12).map((f) => f.FixtureId)]));
      const competitionById = new Map(fixtures.map((f) => [f.FixtureId, (f.Competition ?? "").toLowerCase()]));
      const scored = await Promise.all(
        candidateIds.map(async (id) => {
          try {
            const scores = await client.scoreSnapshot(id);
            const isWorldCup = (competitionById.get(id) ?? "").includes("world cup") || id === 18257739;
            const weight = isWorldCup ? 1000 : 0;
            return { id, rank: scores.length ? scores.length + weight : 0 };
          } catch {
            return { id, rank: 0 };
          }
        }),
      );
      const best = scored.filter((entry) => entry.rank > 0).sort((a, b) => b.rank - a.rank)[0];
      if (best) {
        cachedActiveFixtureId = { id: best.id, at: Date.now() };
        return best.id;
      }
    } catch (error) {
      if (error instanceof Error) console.warn(`Active fixture resolve failed: ${error.message}`);
    }
  }
  cachedActiveFixtureId = { id: SAMPLE_FIXTURE_ID, at: Date.now() };
  return SAMPLE_FIXTURE_ID;
}

const KNOWN_FIXTURES: Record<number, { Participant1: string; Participant2: string; Competition: string }> = {
  18257739: { Participant1: "Spain", Participant2: "Argentina", Competition: "World Cup" },
  18222446: { Participant1: "Argentina", Participant2: "Switzerland", Competition: "International Football" },
};

export async function findFixture(fixtureId = 18222446): Promise<Fixture> {
  const { fixtures } = await loadFixtures();
  const found = fixtures.find((fixture) => fixture.FixtureId === fixtureId);
  if (found) return found;
  const known = KNOWN_FIXTURES[fixtureId];
  if (known) return { FixtureId: fixtureId, ...known };
  return {
    FixtureId: fixtureId,
    Participant1: "Team A",
    Participant2: "Team B",
    Competition: "International Football",
  };
}
