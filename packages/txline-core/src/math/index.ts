import type { OddsSnapshot, ScoreEvent } from "../client/types";

export interface MarketPrice {
  label: string;
  decimalOdds: number | null;
  impliedProbability: number | null;
  raw: number;
}

/**
 * TxLINE Prices are integer encoded. Most observed football odds APIs encode
 * decimal odds as price / 1000. Keep raw field so UI can disclose uncertainty.
 */
export function decodePrices(snapshot: OddsSnapshot, scale = 1000): MarketPrice[] {
  const names = snapshot.PriceNames ?? [];
  const prices = snapshot.Prices ?? [];
  const pct = snapshot.Pct ?? [];
  return prices.map((raw, index) => {
    const decimalOdds = raw > 0 ? raw / scale : null;
    const parsedPct = pct[index] === undefined ? null : Number(pct[index]);
    const impliedProbability = Number.isFinite(parsedPct) && parsedPct !== null
      ? parsedPct / (parsedPct > 1 ? 100 : 1)
      : decimalOdds
        ? 1 / decimalOdds
        : null;
    return { label: names[index] ?? `Outcome ${index + 1}`, decimalOdds, impliedProbability, raw };
  });
}

function samePriceShape(before: OddsSnapshot, after: OddsSnapshot): boolean {
  const beforeNames = before.PriceNames ?? [];
  const afterNames = after.PriceNames ?? [];
  if ((before.Prices ?? []).length !== (after.Prices ?? []).length) return false;
  if (beforeNames.length !== afterNames.length) return beforeNames.length === 0 || afterNames.length === 0;
  return beforeNames.every((name, index) => name === afterNames[index]);
}

export function probabilityMove(before: OddsSnapshot, after: OddsSnapshot): number {
  if (!samePriceShape(before, after)) return 0;
  const a = decodePrices(before).map((p) => p.impliedProbability ?? 0);
  const b = decodePrices(after).map((p) => p.impliedProbability ?? 0);
  return Math.max(0, ...b.map((v, i) => Math.abs(v - (a[i] ?? 0))));
}

export function eventTimestamp(event: ScoreEvent): number {
  return Number(event.ts ?? event.Ts ?? 0);
}

export function eventSeq(event: ScoreEvent): number {
  return Number(event.seq ?? event.Seq ?? 0);
}

export function eventAction(event: ScoreEvent): string {
  return String(event.action ?? event.Action ?? "unknown").toLowerCase();
}

export function isMeaningfulFootballEvent(event: ScoreEvent): boolean {
  const action = eventAction(event);
  return [
    "goal",
    "card",
    "red_card",
    "yellow_card",
    "period_start",
    "period_end",
    "game_started",
    "game_finalised",
    "substitution",
    "penalty",
  ].some((needle) => action.includes(needle));
}

export function classifyOddsMove(before: OddsSnapshot, after: OddsSnapshot, scoreEvents: ScoreEvent[] = [], windowMs = 5 * 60_000): string {
  const move = probabilityMove(before, after);
  const recentGoal = scoreEvents.some((event) => {
    const ts = eventTimestamp(event);
    return eventAction(event).includes("goal") && ts <= after.Ts && ts >= after.Ts - windowMs;
  });
  const inRunning = Boolean(after.InRunning);
  if (recentGoal) return "score-driven";
  if (move >= 0.12 && inRunning) return "market shock";
  if (move >= 0.06) return "drift";
  return "watch";
}


export function isGameFinalisedEvent(event: ScoreEvent): boolean {
  const action = eventAction(event);
  const statusId = Number((event as { StatusId?: unknown; statusId?: unknown }).StatusId ?? (event as { statusId?: unknown }).statusId ?? 0);
  const period = Number((event as { Period?: unknown; period?: unknown }).Period ?? (event as { period?: unknown }).period ?? 0);
  return action === "game_finalised" || (statusId === 100 && period === 100);
}

export function finalScoreEvent(events: ScoreEvent[]): ScoreEvent | undefined {
  const finals = events.filter(isGameFinalisedEvent);
  return [...finals].sort((a, b) => eventSeq(b) - eventSeq(a))[0];
}
