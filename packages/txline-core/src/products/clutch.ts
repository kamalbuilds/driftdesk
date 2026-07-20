import type { Fixture, ScoreEvent } from "../client/types";
import { eventAction, eventSeq, eventTimestamp } from "../math/index";
import { makeFixtureLabel } from "./proofcast";

/**
 * Clutch is the viral consumer engine: short live-moment prediction rounds
 * (a Trepa-style "Second Slider"), clutch receipts for verified events, and
 * a sharpest-fan leaderboard. It is deterministic so it runs from historical
 * replay when no covered match is live.
 */

export interface GoalMoment {
  seq: number;
  minute: number;
  ts: number;
  team: "home" | "away" | "unknown";
  homeGoals: number;
  awayGoals: number;
}

export interface ClutchRound {
  id: string;
  fixtureId: number;
  fixtureLabel: string;
  kind: "next-goal-minute";
  prompt: string;
  min: number;
  max: number;
  unit: string;
  openedAtMinute: number;
  answerMinute: number;
  answerSeq: number;
}

export interface ClutchGuess {
  roundId: string;
  player: string;
  value: number;
}

export interface ClutchResult {
  roundId: string;
  player: string;
  guess: number;
  answer: number;
  errorMinutes: number;
  points: number;
  bullseye: boolean;
}

export interface LeaderboardRow {
  player: string;
  points: number;
  rounds: number;
  bestStreak: number;
  accuracy: number;
}

function soccerClockMinute(event: ScoreEvent): number | null {
  const clock = (event as { Clock?: { Seconds?: number } }).Clock;
  if (clock && typeof clock.Seconds === "number") return Math.floor(clock.Seconds / 60);
  return null;
}

function readGoals(event: ScoreEvent): { home: number; away: number } | null {
  const score = (event as { Score?: { Participant1?: { Total?: { Goals?: number } }; Participant2?: { Total?: { Goals?: number } } } }).Score;
  if (!score) return null;
  const home = score.Participant1?.Total?.Goals ?? 0;
  const away = score.Participant2?.Total?.Goals ?? 0;
  return { home, away };
}

/** Extract goal moments by watching the running total goals increase. */
export function extractGoalMoments(events: ScoreEvent[]): GoalMoment[] {
  const ordered = [...events].sort((a, b) => eventSeq(a) - eventSeq(b));
  const moments: GoalMoment[] = [];
  let prevHome = 0;
  let prevAway = 0;
  let seenAny = false;
  for (const event of ordered) {
    const goals = readGoals(event);
    if (!goals) continue;
    if (!seenAny) {
      prevHome = goals.home;
      prevAway = goals.away;
      seenAny = true;
      continue;
    }
    const homeUp = goals.home > prevHome;
    const awayUp = goals.away > prevAway;
    if (homeUp || awayUp) {
      const minute = soccerClockMinute(event) ?? Math.max(0, moments.length ? moments[moments.length - 1]!.minute + 10 : 15);
      moments.push({
        seq: eventSeq(event),
        minute,
        ts: eventTimestamp(event),
        team: homeUp ? "home" : "away",
        homeGoals: goals.home,
        awayGoals: goals.away,
      });
    }
    prevHome = goals.home;
    prevAway = goals.away;
  }
  return moments;
}

/**
 * Build "predict the minute of the next goal" rounds. Each round opens just
 * before a real goal so a player slides to a minute and gets scored on it.
 */
export function buildClutchRounds(fixture: Fixture, events: ScoreEvent[]): ClutchRound[] {
  const label = makeFixtureLabel(fixture);
  const goals = extractGoalMoments(events);
  const rounds: ClutchRound[] = [];
  let openedAt = 0;
  goals.forEach((goal, index) => {
    rounds.push({
      id: `${fixture.FixtureId}-clutch-${goal.seq}`,
      fixtureId: fixture.FixtureId,
      fixtureLabel: label,
      kind: "next-goal-minute",
      prompt: `Goal ${index + 1}: slide to the minute you think the next goal lands.`,
      min: Math.max(0, openedAt),
      max: 120,
      unit: "minute",
      openedAtMinute: openedAt,
      answerMinute: goal.minute,
      answerSeq: goal.seq,
    });
    openedAt = goal.minute;
  });
  return rounds;
}

/** Precision scoring: bullseye 100, decaying to 0 by 20 minutes of error. */
export function scoreGuess(round: ClutchRound, guessMinute: number): ClutchResult & { player: string } {
  const answer = round.answerMinute;
  const errorMinutes = Math.abs(guessMinute - answer);
  const points = Math.max(0, Math.round(100 * (1 - Math.min(errorMinutes, 20) / 20)));
  return {
    roundId: round.id,
    player: "you",
    guess: guessMinute,
    answer,
    errorMinutes,
    points,
    bullseye: errorMinutes <= 1,
  };
}

export function computeStreak(results: ClutchResult[]): number {
  let best = 0;
  let current = 0;
  for (const result of results) {
    if (result.points >= 60) {
      current += 1;
      best = Math.max(best, current);
    } else {
      current = 0;
    }
  }
  return best;
}

export function buildLeaderboard(resultsByPlayer: Record<string, ClutchResult[]>): LeaderboardRow[] {
  const rows: LeaderboardRow[] = Object.entries(resultsByPlayer).map(([player, results]) => {
    const points = results.reduce((sum, r) => sum + r.points, 0);
    const accuracy = results.length ? Math.round(points / results.length) : 0;
    return { player, points, rounds: results.length, bestStreak: computeStreak(results), accuracy };
  });
  return rows.sort((a, b) => b.points - a.points);
}

export interface ClutchReceipt {
  id: string;
  fixtureId: number;
  fixtureLabel: string;
  headline: string;
  minute: number;
  score: string;
  seq: number;
  latencyBadge: string;
  validationEndpoint: string;
}

/** Shareable, verifiable moment card for each goal. */
export function goalReceipts(fixture: Fixture, events: ScoreEvent[]): ClutchReceipt[] {
  return extractGoalMoments(events).map((goal) => ({
    id: `${fixture.FixtureId}-goal-${goal.seq}`,
    fixtureId: fixture.FixtureId,
    fixtureLabel: makeFixtureLabel(fixture),
    headline: `${goal.team === "home" ? fixture.Participant1 ?? "Home" : fixture.Participant2 ?? "Away"} score`,
    minute: goal.minute,
    score: `${goal.homeGoals}-${goal.awayGoals}`,
    seq: goal.seq,
    latencyBadge: "TxLINE verified",
    validationEndpoint: `/api/scores/stat-validation?fixtureId=${fixture.FixtureId}&seq=${goal.seq}&statKeys=1,2`,
  }));
}

export function isClutchEvent(event: ScoreEvent): boolean {
  const action = eventAction(event);
  return action.includes("goal") || action.includes("red");
}
