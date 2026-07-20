import type { Fixture, ScoreEvent } from "../client/types";
import { eventAction, eventSeq, eventTimestamp } from "../math/index";
import { makeFixtureLabel } from "./proofcast";

/**
 * VAR audit. The raw score feed can briefly show goals that VAR later overturns.
 * This module reconstructs each VAR decision from the `var` / `var_end` events so
 * a settlement product can show the difference between the noisy running feed and
 * the proven final outcome. This is the core "verifiable settlement" story.
 */

export interface VarDecision {
  id: string;
  varSeq: number;
  endSeq: number | null;
  type: string;
  outcome: "Stands" | "Overturned" | "Pending" | string;
  minute: number;
  relatedGoalSeq: number | null;
}

function clockMinute(event: ScoreEvent): number {
  const clock = (event as { Clock?: { Seconds?: number } }).Clock;
  return clock && typeof clock.Seconds === "number" ? Math.floor(clock.Seconds / 60) : 0;
}

function dataField(event: ScoreEvent, key: string): string | undefined {
  const data = (event as { Data?: Record<string, unknown> }).Data;
  const value = data?.[key];
  return value === undefined || value === null ? undefined : String(value);
}

export function detectVarDecisions(events: ScoreEvent[]): VarDecision[] {
  const ordered = [...events].sort((a, b) => eventSeq(a) - eventSeq(b));
  const decisions: VarDecision[] = [];
  for (let i = 0; i < ordered.length; i += 1) {
    const event = ordered[i];
    if (!event || eventAction(event) !== "var") continue;
    const end = ordered.slice(i + 1).find((candidate) => eventAction(candidate) === "var_end");
    const priorGoal = [...ordered.slice(0, i)].reverse().find((candidate) => eventAction(candidate) === "goal");
    decisions.push({
      id: `var-${eventSeq(event)}`,
      varSeq: eventSeq(event),
      endSeq: end ? eventSeq(end) : null,
      type: dataField(event, "Type") ?? "Review",
      outcome: (end ? dataField(end, "Outcome") : "Pending") ?? "Pending",
      minute: clockMinute(event),
      relatedGoalSeq: priorGoal ? eventSeq(priorGoal) : null,
    });
  }
  return decisions;
}

export interface VarAudit {
  fixtureId: number;
  fixtureLabel: string;
  decisions: VarDecision[];
  overturnedGoalCount: number;
  headline: string;
}

export function buildVarAudit(fixture: Fixture, events: ScoreEvent[]): VarAudit {
  const decisions = detectVarDecisions(events);
  const overturnedGoals = decisions.filter((decision) => decision.outcome === "Overturned" && decision.type.toLowerCase().includes("goal"));
  const headline = overturnedGoals.length
    ? `VAR overturned ${overturnedGoals.length} goal${overturnedGoals.length > 1 ? "s" : ""}. The running feed was wrong. Settlement uses the proven final.`
    : decisions.length
      ? `${decisions.length} VAR review${decisions.length > 1 ? "s" : ""} observed, all stood. Feed and proof agree.`
      : "No VAR reviews on this fixture.";
  return {
    fixtureId: fixture.FixtureId,
    fixtureLabel: makeFixtureLabel(fixture),
    decisions,
    overturnedGoalCount: overturnedGoals.length,
    headline,
  };
}
