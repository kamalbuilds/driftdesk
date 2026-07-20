import type { Fixture, ScoreEvent } from "../client/types";
import { eventAction, eventSeq, eventTimestamp } from "../math/index";
import { makeFixtureLabel } from "./proofcast";

export type PropKind = "final-winner" | "total-goals-over" | "team-goals-over" | "red-card-shown";

export interface PropMarket {
  id: string;
  fixtureId: number;
  fixtureLabel: string;
  kind: PropKind;
  label: string;
  statKeys: number[];
  threshold?: number;
  team?: "home" | "away";
  txlineValidationHint: string;
}

export interface SettlementDecision {
  marketId: string;
  fixtureId: number;
  resolved: boolean;
  outcome: "yes" | "no" | "pending";
  reason: string;
  proofRequests: Array<{ seq: number; statKeys: number[]; endpoint: string }>;
}

export interface ProvenStat {
  key: number;
  value: number;
  period: number;
}

export interface StatValidationResponse {
  ts: number;
  statsToProve: ProvenStat[];
  eventStatRoot: number[];
  summary: { fixtureId: number; eventStatsSubTreeRoot?: number[] };
  statProofs: unknown[];
}

export interface ProvenSettlement extends SettlementDecision {
  provedStats: ProvenStat[];
  merkleRootHex: string;
  proofNodeCount: number;
}

/**
 * Soccer stat keys from TxLINE docs include goals/cards/corners by participant
 * with period prefixes. Base keys vary by endpoint, so markets carry keys
 * explicitly and settlement discloses the exact validation request.
 */
export function defaultPropMarkets(fixture: Fixture): PropMarket[] {
  const label = makeFixtureLabel(fixture);
  return [
    {
      id: `${fixture.FixtureId}-total-goals-over-2-5`,
      fixtureId: fixture.FixtureId,
      fixtureLabel: label,
      kind: "total-goals-over",
      label: `${label}: total goals over 2.5`,
      statKeys: [1, 2],
      threshold: 2.5,
      txlineValidationHint: "Validate final goal stats for both participants via /api/scores/stat-validation.",
    },
    {
      id: `${fixture.FixtureId}-red-card`,
      fixtureId: fixture.FixtureId,
      fixtureLabel: label,
      kind: "red-card-shown",
      label: `${label}: red card shown`,
      statKeys: [5, 6],
      threshold: 0,
      txlineValidationHint: "Validate red-card stats for both participants at final seq.",
    },
  ];
}

export function settleMarket(market: PropMarket, events: ScoreEvent[]): SettlementDecision {
  const finalEvents = events.filter((event) => eventAction(event).includes("final"));
  const candidates = finalEvents.length ? finalEvents : events;
  const latestEvent = [...candidates].sort((a, b) => eventSeq(b) - eventSeq(a))[0];
  if (!latestEvent) {
    return {
      marketId: market.id,
      fixtureId: market.fixtureId,
      resolved: false,
      outcome: "pending",
      reason: "No game_finalised event observed yet.",
      proofRequests: [],
    };
  }
  const seq = eventSeq(latestEvent);
  const proofEndpoint = `/api/scores/stat-validation?fixtureId=${market.fixtureId}&seq=${seq}&statKeys=${market.statKeys.join(",")}`;
  const reason = `Settlement event observed at ${eventTimestamp(latestEvent)}. Settlement requires TxLINE stat proof for keys ${market.statKeys.join(", ")}.`;
  return {
    marketId: market.id,
    fixtureId: market.fixtureId,
    resolved: false,
    outcome: "pending",
    reason,
    proofRequests: [{ seq, statKeys: market.statKeys, endpoint: proofEndpoint }],
  };
}

function bytesToHex(bytes: number[]): string {
  return bytes.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Deterministic resolution from TxLINE proven stat values. The Merkle root and
 * proof nodes come straight from /api/scores/stat-validation so a keeper (or the
 * txoracle validate_stat instruction) can re-verify the same numbers on-chain.
 */
export function resolveMarketWithStats(market: PropMarket, validation: StatValidationResponse): ProvenSettlement {
  const stats = validation.statsToProve;
  const byKey = new Map(stats.map((stat) => [stat.key, stat.value] as const));
  let outcome: "yes" | "no" = "no";
  let reason = "";

  if (market.kind === "total-goals-over") {
    const total = market.statKeys.reduce((sum, key) => sum + (byKey.get(key) ?? 0), 0);
    const threshold = market.threshold ?? 2.5;
    outcome = total > threshold ? "yes" : "no";
    reason = `Proven goals total ${total} vs threshold ${threshold}. Outcome ${outcome}.`;
  } else if (market.kind === "red-card-shown") {
    const anyRed = market.statKeys.some((key) => (byKey.get(key) ?? 0) > 0);
    outcome = anyRed ? "yes" : "no";
    reason = `Proven red cards ${market.statKeys.map((key) => `${key}=${byKey.get(key) ?? 0}`).join(", ")}. Outcome ${outcome}.`;
  } else if (market.kind === "team-goals-over") {
    const key = market.statKeys[0] ?? 0;
    const value = byKey.get(key) ?? 0;
    const threshold = market.threshold ?? 0.5;
    outcome = value > threshold ? "yes" : "no";
    reason = `Proven team goals ${value} vs threshold ${threshold}. Outcome ${outcome}.`;
  } else {
    const [homeKey, awayKey] = market.statKeys;
    const home = byKey.get(homeKey ?? 0) ?? 0;
    const away = byKey.get(awayKey ?? 0) ?? 0;
    outcome = home > away ? "yes" : "no";
    reason = `Proven score ${home}-${away}. Outcome ${outcome}.`;
  }

  return {
    marketId: market.id,
    fixtureId: market.fixtureId,
    resolved: true,
    outcome,
    reason,
    proofRequests: [],
    provedStats: stats,
    merkleRootHex: bytesToHex(validation.eventStatRoot ?? []),
    proofNodeCount: Array.isArray(validation.statProofs) ? validation.statProofs.length : 0,
  };
}
