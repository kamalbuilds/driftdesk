import type { Fixture, OddsSnapshot, ScoreEvent } from "../client/types";
import { classifyOddsMove, decodePrices, eventAction, eventSeq, eventTimestamp, probabilityMove } from "../math/index";

export interface ProofCastReceipt {
  id: string;
  fixtureId: number;
  fixtureLabel: string;
  eventType: "score" | "odds";
  title: string;
  body: string;
  timestamp: number;
  seq?: number;
  txline: {
    scoreAction?: string;
    oddsMessageId?: string;
    proofStatus: "not-requested" | "requested" | "verified" | "failed";
  };
  raw: unknown;
}

export function makeFixtureLabel(fixture: Fixture): string {
  return `${fixture.Participant1 ?? "Team A"} vs ${fixture.Participant2 ?? "Team B"}`;
}

export function scoreReceipt(fixture: Fixture, event: ScoreEvent): ProofCastReceipt {
  const action = eventAction(event);
  const seq = eventSeq(event);
  return {
    id: `${fixture.FixtureId}-score-${seq || eventTimestamp(event)}`,
    fixtureId: fixture.FixtureId,
    fixtureLabel: makeFixtureLabel(fixture),
    eventType: "score",
    title: humanizeAction(action),
    body: `${makeFixtureLabel(fixture)} update: ${humanizeAction(action)}. Seq ${seq || "unknown"}.`,
    timestamp: eventTimestamp(event),
    seq,
    txline: { scoreAction: action, proofStatus: "not-requested" },
    raw: event,
  };
}

export function oddsReceipt(fixture: Fixture, before: OddsSnapshot | undefined, after: OddsSnapshot, relatedScores: ScoreEvent[] = []): ProofCastReceipt {
  const move = before ? probabilityMove(before, after) : 0;
  const classification = before ? classifyOddsMove(before, after, relatedScores) : "opening line";
  const prices = decodePrices(after);
  const priceLine = prices
    .map((p) => `${p.label}: ${p.decimalOdds?.toFixed(2) ?? p.raw}`)
    .join(", ");
  return {
    id: `${fixture.FixtureId}-odds-${after.MessageId ?? after.Ts}`,
    fixtureId: fixture.FixtureId,
    fixtureLabel: makeFixtureLabel(fixture),
    eventType: "odds",
    title: `${classification} odds move`,
    body: `${makeFixtureLabel(fixture)} ${classification}. Max implied probability move ${(move * 100).toFixed(1)}%. ${priceLine}`,
    timestamp: after.Ts,
    txline: { oddsMessageId: after.MessageId, proofStatus: "not-requested" },
    raw: after,
  };
}

function humanizeAction(action: string): string {
  return action.replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
}
