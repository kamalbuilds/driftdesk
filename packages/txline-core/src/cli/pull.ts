import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { TxLineClient } from "../client/txline-client";

function loadCreds(): { jwt?: string; apiToken?: string } {
  try {
    const parsed = JSON.parse(readFileSync("data/live/txline-devnet-credentials.json", "utf8")) as { jwt?: string; apiToken?: string };
    return parsed;
  } catch (error) {
    if (error instanceof Error) {
      console.error(`Credential file not loaded: ${error.message}`);
    }
    return {};
  }
}

async function main(): Promise<void> {
  const creds = loadCreds();
  const client = new TxLineClient({ network: "devnet", jwt: creds.jwt, apiToken: creds.apiToken });
  const fixtures = await client.fixturesSnapshot();
  mkdirSync("data/live", { recursive: true });
  writeFileSync("data/live/fixtures.json", JSON.stringify(fixtures, null, 2));
  const first = fixtures.find((fixture) => fixture.FixtureId);
  if (first) {
    const [odds, scores] = await Promise.allSettled([
      client.oddsSnapshot(first.FixtureId),
      client.scoreSnapshot(first.FixtureId),
    ]);
    if (odds.status === "fulfilled") writeFileSync("data/live/odds.json", JSON.stringify(odds.value, null, 2));
    if (scores.status === "fulfilled") writeFileSync("data/live/scores.json", JSON.stringify(scores.value, null, 2));
  }
  console.log(JSON.stringify({ ok: true, fixtures: fixtures.length, firstFixtureId: first?.FixtureId }, null, 2));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
