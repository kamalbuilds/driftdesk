import type { Fixture, OddsSnapshot, ScoreEvent } from "../client/types";
import { classifyOddsMove, decodePrices, probabilityMove } from "../math/index";
import { makeFixtureLabel } from "./proofcast";

export interface DriftSignal {
  id: string;
  fixtureId: number;
  fixtureLabel: string;
  market: string;
  marketKey: string;
  signalStrength: number;
  /** @deprecated use signalStrength. Kept for backward compatibility. */
  confidence: number;
  classification: string;
  summary: string;
  beforeTs?: number;
  afterTs: number;
  maxMovePct: number;
  prices: ReturnType<typeof decodePrices>;
  proof: {
    oddsMessageId?: string;
    txlineEndpoint: string;
    verifiable: boolean;
    sourceNote: string;
  };
}

export function oddsMarketKey(snapshot: OddsSnapshot): string {
  return [
    snapshot.FixtureId,
    snapshot.BookmakerId ?? snapshot.Bookmaker ?? "book",
    snapshot.SuperOddsType ?? "market",
    snapshot.MarketPeriod ?? "period",
    snapshot.MarketParameters ?? "params",
    (snapshot.PriceNames ?? []).join("|"),
  ].join("::");
}

function marketLabel(snapshot: OddsSnapshot): string {
  return [snapshot.SuperOddsType, snapshot.MarketPeriod, snapshot.MarketParameters].filter(Boolean).join(" / ") || "Observed market";
}

export function detectDriftSignals(fixture: Fixture, odds: OddsSnapshot[], scores: ScoreEvent[] = [], minMove = 0.06): DriftSignal[] {
  const grouped = new Map<string, OddsSnapshot[]>();
  for (const snapshot of odds) {
    const key = oddsMarketKey(snapshot);
    grouped.set(key, [...(grouped.get(key) ?? []), snapshot]);
  }

  const signals: DriftSignal[] = [];
  for (const [marketKey, snapshots] of grouped.entries()) {
    const sorted = [...snapshots].sort((a, b) => a.Ts - b.Ts);
    for (let i = 1; i < sorted.length; i += 1) {
      const before = sorted[i - 1];
      const after = sorted[i];
      if (!before || !after) continue;
      const move = probabilityMove(before, after);
      if (move < minMove) continue;
      const classification = classifyOddsMove(before, after, scores);
      const prices = decodePrices(after);
      const signalStrength = scoreSignalStrength(move, Boolean(after.InRunning), scores.length);
      const oddsMessageId = after.MessageId;
      const verifiable = Boolean(oddsMessageId && !oddsMessageId.startsWith("sample-"));
      signals.push({
        id: `${fixture.FixtureId}-${oddsMessageId ?? after.Ts}`,
        fixtureId: fixture.FixtureId,
        fixtureLabel: makeFixtureLabel(fixture),
        market: marketLabel(after),
        marketKey,
        signalStrength,
        confidence: signalStrength,
        classification,
        summary: `${classification} on ${makeFixtureLabel(fixture)}. Max probability move ${(move * 100).toFixed(1)}%.`,
        beforeTs: before.Ts,
        afterTs: after.Ts,
        maxMovePct: move * 100,
        prices,
        proof: {
          oddsMessageId,
          txlineEndpoint: `/api/odds/validation?messageId=${oddsMessageId ?? ""}&ts=${after.Ts}`,
          verifiable,
          sourceNote: verifiable ? "live TxLINE odds message" : "replay odds sample, not on-chain verifiable",
        },
      });
    }
  }

  return signals.sort((a, b) => b.signalStrength - a.signalStrength);
}

function scoreSignalStrength(move: number, inRunning: boolean, scoreEventCount: number): number {
  const base = Math.min(0.95, move * 4);
  const liveBoost = inRunning ? 0.08 : 0;
  const contextBoost = scoreEventCount ? 0.05 : 0;
  return Math.min(0.99, Number((base + liveBoost + contextBoost).toFixed(2)));
}
