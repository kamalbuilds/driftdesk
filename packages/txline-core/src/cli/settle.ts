import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { TxLineClient } from "../client/txline-client";
import { defaultPropMarkets, resolveMarketWithStats, type StatValidationResponse } from "../products/varifiable";

function loadCreds(): { jwt: string; apiToken: string } {
  if (process.env.TXLINE_JWT && process.env.TXLINE_API_TOKEN) {
    return { jwt: process.env.TXLINE_JWT, apiToken: process.env.TXLINE_API_TOKEN };
  }
  const path = "data/live/txline-devnet-credentials.json";
  const parsed = JSON.parse(readFileSync(path, "utf8")) as { jwt?: string; apiToken?: string };
  if (!parsed.jwt || !parsed.apiToken) throw new Error(`${path} missing jwt or apiToken`);
  return { jwt: parsed.jwt, apiToken: parsed.apiToken };
}

async function main(): Promise<void> {
  const fixtureId = Number(process.argv[2] ?? 18222446);
  const seq = Number(process.argv[3] ?? 1306);
  const creds = loadCreds();
  const client = new TxLineClient({ network: "devnet", jwt: creds.jwt, apiToken: creds.apiToken });
  const fixtures = await client.fixturesSnapshot();
  const fixture = fixtures.find((candidate) => candidate.FixtureId === fixtureId) ?? {
    FixtureId: fixtureId,
    Participant1: "Argentina",
    Participant2: "Switzerland",
    Competition: "World Cup",
  };
  const markets = defaultPropMarkets(fixture);
  const results = [];
  for (const market of markets) {
    const validation = await client.statValidation({ fixtureId, seq, statKeys: market.statKeys }) as StatValidationResponse;
    results.push({ market, settlement: resolveMarketWithStats(market, validation), validation });
  }
  mkdirSync("data/live", { recursive: true });
  writeFileSync(`data/live/settlement-${fixtureId}-${seq}.json`, JSON.stringify({ fixture, seq, results }, null, 2));
  console.log(JSON.stringify({
    ok: true,
    fixtureId,
    seq,
    markets: results.map((result) => ({
      label: result.market.label,
      outcome: result.settlement.outcome,
      reason: result.settlement.reason,
      root: result.settlement.merkleRootHex.slice(0, 16),
    })),
  }, null, 2));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
