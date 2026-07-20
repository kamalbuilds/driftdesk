import type { Fixture, OddsSnapshot, ScoreEvent } from "../client/types";
import { decodePrices } from "../math/index";
import { detectDriftSignals, oddsMarketKey, type DriftSignal } from "./driftdesk";

export interface BacktestTrade {
  signalId: string;
  market: string;
  classification: string;
  entryTs: number;
  exitTs: number;
  signalStrength: number;
  /** @deprecated use signalStrength. */
  confidence: number;
  movePct: number;
  label: "followed-move" | "faded-move";
  moveMagnitudeScore: number;
  /** @deprecated use moveMagnitudeScore. */
  score: number;
  clvPct: number | null;
  baselineClvPct: number | null;
}

export interface BacktestReport {
  fixtureId: number;
  fixtureLabel: string;
  source: "historical-odds-backtest";
  signals: DriftSignal[];
  trades: BacktestTrade[];
  largeMoveShare: number;
  /** @deprecated use largeMoveShare. */
  hitRate: number;
  averageMoveScore: number;
  /** @deprecated use averageMoveScore. */
  averageScore: number;
  averageClvPct: number | null;
  baselineAverageClvPct: number | null;
  caveat: string;
}

function firstProbability(snapshot: OddsSnapshot): number | null {
  return decodePrices(snapshot).find((price) => price.impliedProbability !== null)?.impliedProbability ?? null;
}

function clvFor(signal: DriftSignal, odds: OddsSnapshot[]): { clvPct: number | null; baselineClvPct: number | null } {
  const sameMarket = odds
    .filter((snapshot) => oddsMarketKey(snapshot) === signal.marketKey)
    .sort((a, b) => a.Ts - b.Ts);
  const entry = sameMarket.find((snapshot) => snapshot.Ts === signal.afterTs);
  const close = sameMarket.at(-1);
  const baseline = sameMarket[0];
  const entryProb = entry ? firstProbability(entry) : null;
  const closeProb = close ? firstProbability(close) : null;
  const baselineProb = baseline ? firstProbability(baseline) : null;
  return {
    clvPct: entryProb !== null && closeProb !== null ? Number(((closeProb - entryProb) * 100).toFixed(2)) : null,
    baselineClvPct: baselineProb !== null && closeProb !== null ? Number(((closeProb - baselineProb) * 100).toFixed(2)) : null,
  };
}

function average(values: Array<number | null>): number | null {
  const valid = values.filter((value): value is number => value !== null && Number.isFinite(value));
  if (!valid.length) return null;
  return Number((valid.reduce((sum, value) => sum + value, 0) / valid.length).toFixed(2));
}

/**
 * Honest replay backtest. This does not claim live execution or profit. It
 * measures move strength and closing-line movement inside a historical or
 * synthetic odds sequence.
 */
export function backtestDriftStrategy(fixture: Fixture, odds: OddsSnapshot[], scores: ScoreEvent[]): BacktestReport {
  const fixtureLabel = `${fixture.Participant1 ?? "Team A"} vs ${fixture.Participant2 ?? "Team B"}`;
  const signals = detectDriftSignals(fixture, odds, scores, 0.05);
  const trades: BacktestTrade[] = signals.map((signal, index) => {
    const next = signals[index + 1];
    const followed = signal.classification === "score-driven" || signal.classification === "market shock";
    const moveMagnitudeScore = followed ? Math.round(signal.maxMovePct * signal.signalStrength) : Math.round(signal.maxMovePct * 0.4);
    const clv = clvFor(signal, odds);
    return {
      signalId: signal.id,
      market: signal.market,
      classification: signal.classification,
      entryTs: signal.afterTs,
      exitTs: next?.afterTs ?? signal.afterTs + 5 * 60_000,
      signalStrength: signal.signalStrength,
      confidence: signal.signalStrength,
      movePct: signal.maxMovePct,
      label: followed ? "followed-move" : "faded-move",
      moveMagnitudeScore,
      score: moveMagnitudeScore,
      ...clv,
    };
  });
  const largeMoveShare = trades.length ? Math.round((trades.filter((trade) => trade.moveMagnitudeScore >= 10).length / trades.length) * 100) : 0;
  const averageMoveScore = trades.length ? Math.round(trades.reduce((sum, trade) => sum + trade.moveMagnitudeScore, 0) / trades.length) : 0;
  return {
    fixtureId: fixture.FixtureId,
    fixtureLabel,
    source: "historical-odds-backtest",
    signals,
    trades,
    largeMoveShare,
    hitRate: largeMoveShare,
    averageMoveScore,
    averageScore: averageMoveScore,
    averageClvPct: average(trades.map((trade) => trade.clvPct)),
    baselineAverageClvPct: average(trades.map((trade) => trade.baselineClvPct)),
    caveat: "Backtest only. Large-move share and CLV are descriptive replay metrics, not live PnL or profit claims.",
  };
}
