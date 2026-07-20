import type { Fixture, ScoreEvent } from "../client/types";
import type { StatValidationResponse } from "./varifiable";
import { extractGoalMoments, type GoalMoment } from "./clutch";
import { makeFixtureLabel } from "./proofcast";

/**
 * Prediction game engine. This is what makes a fan bot sticky: short,
 * repeatable rounds people lock a pick on, then verified settlement,
 * points, streaks, and a group leaderboard that pulls them back.
 */

export type PredictionKind = "who-scores-next" | "next-goal-band" | "total-goals-line";

export interface PredictionOption {
  id: string;
  label: string;
}

export interface PredictionRound {
  id: string;
  fixtureId: number;
  fixtureLabel: string;
  kind: PredictionKind;
  question: string;
  options: PredictionOption[];
  openMinute: number;
  lockMinute: number;
  correctOptionId: string;
  correctLabel: string;
  resolveSeq: number;
  statValidationEndpoint: string;
  points: number;
  previousHomeGoals: number;
  previousAwayGoals: number;
  answerMinute: number;
}

export interface Pick {
  roundId: string;
  userId: string;
  optionId: string;
}

export interface PlayerStats {
  userId: string;
  name: string;
  points: number;
  correct: number;
  played: number;
  streak: number;
  bestStreak: number;
}

export interface RoundSettlement {
  roundId: string;
  question: string;
  correctOptionId: string;
  correctLabel: string;
  resolveSeq: number;
  statValidationEndpoint: string;
  winners: string[];
  verified: boolean;
  proofSource?: string;
}

export interface RoundResolutionProof {
  fixtureId: number;
  seq: number;
  statKeys: number[];
  source: string;
  fetchedAtMs: number;
  verified: boolean;
  currentHomeGoals: number;
  currentAwayGoals: number;
  previousHomeGoals: number;
  previousAwayGoals: number;
  minute: number;
  correctOptionId: string;
  correctLabel: string;
  reason: string;
  raw: StatValidationResponse;
}

const BAND_SIZE = 15;
const BASE_POINTS = 100;
const STREAK_BONUS = 25;

function bandFor(minute: number): { id: string; label: string } {
  const start = Math.floor(minute / BAND_SIZE) * BAND_SIZE;
  const end = start + BAND_SIZE;
  return { id: `band-${start}`, label: `${start} to ${end}'` };
}

function statEndpoint(fixtureId: number, seq: number): string {
  return `/api/scores/stat-validation?fixtureId=${fixtureId}&seq=${seq}&statKeys=1,2`;
}

function teamName(fixture: Fixture, side: "home" | "away"): string {
  return side === "home" ? fixture.Participant1 ?? "Home" : fixture.Participant2 ?? "Away";
}

/**
 * Build prediction rounds from a fixture's goal moments. Each real goal
 * produces rounds that lock just before it and resolve on its TxLINE seq,
 * so settlement is always verifiable.
 */
export function buildPredictionRounds(fixture: Fixture, events: ScoreEvent[]): PredictionRound[] {
  const goals = extractGoalMoments(events);
  const label = makeFixtureLabel(fixture);
  const rounds: PredictionRound[] = [];
  let openMinute = 0;
  let previousHomeGoals = 0;
  let previousAwayGoals = 0;

  goals.forEach((goal: GoalMoment, index: number) => {
    const lockMinute = Math.max(openMinute, goal.minute - 1);
    const scorerId = goal.team === "away" ? "away" : "home";

    rounds.push({
      id: `${fixture.FixtureId}-scorer-${goal.seq}`,
      fixtureId: fixture.FixtureId,
      fixtureLabel: label,
      kind: "who-scores-next",
      question: `Goal ${index + 1}: who scores next?`,
      options: [
        { id: "home", label: teamName(fixture, "home") },
        { id: "away", label: teamName(fixture, "away") },
      ],
      openMinute,
      lockMinute,
      correctOptionId: scorerId,
      correctLabel: teamName(fixture, scorerId),
      resolveSeq: goal.seq,
      statValidationEndpoint: statEndpoint(fixture.FixtureId, goal.seq),
      points: BASE_POINTS,
      previousHomeGoals,
      previousAwayGoals,
      answerMinute: goal.minute,
    });

    const band = bandFor(goal.minute);
    const bandStarts = [0, 15, 30, 45, 60, 75, 90];
    rounds.push({
      id: `${fixture.FixtureId}-band-${goal.seq}`,
      fixtureId: fixture.FixtureId,
      fixtureLabel: label,
      kind: "next-goal-band",
      question: `Goal ${index + 1}: which 15 minute window does it land in?`,
      options: bandStarts.map((start) => ({ id: `band-${start}`, label: `${start} to ${start + BAND_SIZE}'` })),
      openMinute,
      lockMinute,
      correctOptionId: band.id,
      correctLabel: band.label,
      resolveSeq: goal.seq,
      statValidationEndpoint: statEndpoint(fixture.FixtureId, goal.seq),
      points: BASE_POINTS + 50,
      previousHomeGoals,
      previousAwayGoals,
      answerMinute: goal.minute,
    });

    openMinute = goal.minute;
    previousHomeGoals = goal.homeGoals;
    previousAwayGoals = goal.awayGoals;
  });

  return rounds;
}

function emptyStats(userId: string, name: string): PlayerStats {
  return { userId, name, points: 0, correct: 0, played: 0, streak: 0, bestStreak: 0 };
}

/**
 * Settle a single round against locked picks. Correct picks earn base points
 * plus a streak bonus that grows while a player keeps hitting, then resets on
 * a miss. Streaks are the core return hook.
 */
export function settleRound(
  round: PredictionRound,
  picks: Pick[],
  stats: Map<string, PlayerStats>,
  names: Map<string, string>,
  resolution?: {
    correctOptionId: string;
    correctLabel: string;
    verified: boolean;
    source?: string;
  },
): RoundSettlement {
  const winners: string[] = [];
  const correctOptionId = resolution?.correctOptionId ?? round.correctOptionId;
  const correctLabel = resolution?.correctLabel ?? round.correctLabel;
  const canScore = resolution ? resolution.verified : true;
  for (const pick of picks) {
    if (pick.roundId !== round.id) continue;
    const player = stats.get(pick.userId) ?? emptyStats(pick.userId, names.get(pick.userId) ?? pick.userId);
    player.played += 1;
    if (!canScore) {
      // Count the participation, but do not award or reset streaks when the
      // proof does not uniquely determine an outcome.
    } else if (pick.optionId === correctOptionId) {
      player.streak += 1;
      player.bestStreak = Math.max(player.bestStreak, player.streak);
      player.correct += 1;
      player.points += round.points + (player.streak - 1) * STREAK_BONUS;
      winners.push(player.userId);
    } else {
      player.streak = 0;
    }
    stats.set(pick.userId, player);
  }
  return {
    roundId: round.id,
    question: round.question,
    correctOptionId,
    correctLabel,
    resolveSeq: round.resolveSeq,
    statValidationEndpoint: round.statValidationEndpoint,
    winners,
    verified: resolution?.verified ?? false,
    proofSource: resolution?.source,
  };
}

function scoreEventMinute(event: ScoreEvent | undefined, fallback: number): number {
  const clock = (event as { Clock?: { Seconds?: number } } | undefined)?.Clock;
  if (clock && typeof clock.Seconds === "number") return Math.floor(clock.Seconds / 60);
  return fallback;
}

function findScoreEventBySeq(events: ScoreEvent[], seq: number): ScoreEvent | undefined {
  return events.find((event) => Number(event.Seq ?? event.seq ?? 0) === seq);
}

function statValue(raw: StatValidationResponse, key: number): number {
  return raw.statsToProve.find((stat) => stat.key === key)?.value ?? 0;
}

export function resolveRoundFromValidation(
  round: PredictionRound,
  raw: StatValidationResponse,
  events: ScoreEvent[],
  source = "txline-stat-validation",
  fetchedAtMs = Date.now(),
): RoundResolutionProof {
  const currentHomeGoals = statValue(raw, 1);
  const currentAwayGoals = statValue(raw, 2);
  const homeDelta = currentHomeGoals - round.previousHomeGoals;
  const awayDelta = currentAwayGoals - round.previousAwayGoals;
  const event = findScoreEventBySeq(events, round.resolveSeq);
  const minute = scoreEventMinute(event, round.answerMinute);
  const band = bandFor(minute);
  let correctOptionId = round.correctOptionId;
  let correctLabel = round.correctLabel;
  let verified = true;
  let reason = "Resolved from TxLINE stat-validation response.";

  if (round.kind === "who-scores-next") {
    if ((homeDelta > 0 && awayDelta > 0) || (homeDelta <= 0 && awayDelta <= 0)) {
      verified = false;
      reason = `Ambiguous scorer proof: home delta ${homeDelta}, away delta ${awayDelta}.`;
    } else {
      correctOptionId = awayDelta > homeDelta ? "away" : "home";
      correctLabel = round.options.find((option) => option.id === correctOptionId)?.label ?? correctOptionId;
      reason = `Resolved scorer from proven goal delta: home ${homeDelta}, away ${awayDelta}.`;
    }
  } else if (round.kind === "next-goal-band") {
    correctOptionId = band.id;
    correctLabel = band.label;
    reason = `Resolved minute band from score event seq ${round.resolveSeq} and TxLINE stat proof.`;
  }

  return {
    fixtureId: round.fixtureId,
    seq: round.resolveSeq,
    statKeys: [1, 2],
    source,
    fetchedAtMs,
    verified,
    currentHomeGoals,
    currentAwayGoals,
    previousHomeGoals: round.previousHomeGoals,
    previousAwayGoals: round.previousAwayGoals,
    minute,
    correctOptionId,
    correctLabel,
    reason,
    raw,
  };
}

export function leaderboard(stats: Map<string, PlayerStats>): PlayerStats[] {
  return [...stats.values()].sort((a, b) => b.points - a.points || b.bestStreak - a.bestStreak);
}

export function accuracy(player: PlayerStats): number {
  return player.played ? Math.round((player.correct / player.played) * 100) : 0;
}

/** Run an entire session (rounds + picks) to a leaderboard. Used by demo and tests. */
export function runSession(
  rounds: PredictionRound[],
  picks: Pick[],
  names: Map<string, string>,
): { settlements: RoundSettlement[]; table: PlayerStats[] } {
  const stats = new Map<string, PlayerStats>();
  const settlements = rounds.map((round) => settleRound(round, picks, stats, names));
  return { settlements, table: leaderboard(stats) };
}
