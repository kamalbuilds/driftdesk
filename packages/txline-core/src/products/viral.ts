import type { Fixture } from "../client/types";
import type { BacktestReport } from "./backtest";
import type { ClutchReceipt, ClutchRound, LeaderboardRow } from "./clutch";
import type { MarketBook, Payout } from "./markets";
import { makeFixtureLabel } from "./proofcast";

export type ViralTrack = "consumer" | "settlement" | "trading";

export interface ViralLoop {
  exactUser: string;
  tenSecondAction: string;
  returnTrigger: string;
  shareTrigger: string;
  proofArtifact: string;
  technicalEdge: string;
  killList: string[];
}

export interface ViralShareCard {
  id: string;
  track: ViralTrack;
  roomCode: string;
  title: string;
  body: string;
  callToAction: string;
  shareText: string;
  viralityScore: number;
  proof: {
    label: string;
    endpoint: string;
    source: string;
  };
  loop: ViralLoop;
}

export interface BuildViralCardsInput {
  fixture: Fixture;
  clutchRounds: ClutchRound[];
  clutchReceipts: ClutchReceipt[];
  leaderboard: LeaderboardRow[];
  marketBooks: MarketBook[];
  payouts: Payout[];
  backtest: BacktestReport;
}

function fixtureRoomCode(fixtureId: number, suffix: string): string {
  return `TX${fixtureId.toString(36).toUpperCase()}-${suffix}`;
}

function firstSettlementEndpoint(book: MarketBook | undefined): string {
  const withProof = book as (MarketBook & { proofEndpoint?: string }) | undefined;
  return withProof?.proofEndpoint ?? book?.settlement?.proofRequests[0]?.endpoint ?? "/api/varifiable/markets";
}

function settledMarketTitle(book: MarketBook | undefined): string {
  if (!book) return "Open a verified market room";
  if (!book.settlement) return `Back ${book.label}`;
  return `${book.label} resolved ${book.settlement.outcome}`;
}

function payoutSummary(payouts: Payout[]): string {
  const winners = payouts.filter((payout) => payout.won);
  if (!winners.length) return "No payout table yet. Open the market room and lock a side before proof settlement.";
  const top = winners.sort((a, b) => b.payout - a.payout)[0];
  return `${top?.userName ?? "A fan"} tops the payout table with ${top?.payout ?? 0} play tokens.`;
}

function scoreVirality(loop: ViralLoop, hasProof: boolean): number {
  const hooks = [loop.tenSecondAction, loop.returnTrigger, loop.shareTrigger, loop.proofArtifact, loop.technicalEdge]
    .filter((value) => value.length > 20).length;
  const proofBoost = hasProof ? 17 : 0;
  const killListBoost = Math.min(9, loop.killList.length * 3);
  return Math.min(96, 35 + hooks * 6 + proofBoost + killListBoost);
}

export function buildConsumerViralCard(
  fixture: Fixture,
  rounds: ClutchRound[],
  receipts: ClutchReceipt[],
  leaderboard: LeaderboardRow[],
): ViralShareCard {
  const firstRound = rounds[0];
  const firstReceipt = receipts[0];
  const leader = leaderboard[0];
  const fixtureLabel = makeFixtureLabel(fixture);
  const loop: ViralLoop = {
    exactUser: "A football group chat watching a live World Cup match on mobile.",
    tenSecondAction: "Join a room, slide to the next goal minute, and lock the pick with one thumb.",
    returnTrigger: "Every verified goal or red-card moment opens the next round and can move the leaderboard.",
    shareTrigger: "A receipt card says who was closest and carries the TxLINE validation endpoint.",
    proofArtifact: firstReceipt?.validationEndpoint ?? "/api/clutch",
    technicalEdge: "TxLINE score sequences turn real match events into verifiable prediction rounds.",
    killList: ["passive feeds", "generic group chat", "unverified social claims"],
  };
  const title = firstRound ? `Beat the room on ${fixtureLabel}` : `Start the first verified room for ${fixtureLabel}`;
  const body = firstRound
    ? `${firstRound.prompt} Current leader: ${leader?.player ?? "Nobody yet"} with ${leader?.points ?? 0} points.`
    : "The room is waiting for a verified goal before the first slider opens.";
  return {
    id: `${fixture.FixtureId}-consumer-card`,
    track: "consumer",
    roomCode: fixtureRoomCode(fixture.FixtureId, "FANS"),
    title,
    body,
    callToAction: "Lock a slider pick",
    shareText: `Join my TxLINE Clutch room for ${fixtureLabel}. Closest fan wins the verified goal receipt. Room ${fixtureRoomCode(fixture.FixtureId, "FANS")}`,
    viralityScore: scoreVirality(loop, Boolean(firstReceipt)),
    proof: {
      label: "goal receipt",
      endpoint: firstReceipt?.validationEndpoint ?? "/api/clutch",
      source: "txline-score-sequence",
    },
    loop,
  };
}

export function buildSettlementViralCard(fixture: Fixture, books: MarketBook[], payouts: Payout[]): ViralShareCard {
  const firstBook = books[0];
  const fixtureLabel = makeFixtureLabel(fixture);
  const endpoint = firstSettlementEndpoint(firstBook);
  const loop: ViralLoop = {
    exactUser: "A fan who wants a play-money prop with friends, not a full sportsbook account.",
    tenSecondAction: "Pick yes or no on a single football prop and lock a small play-money stake.",
    returnTrigger: "The room reopens after final whistle with payouts, winning side, and proof metadata.",
    shareTrigger: "The winner shares a settlement card that shows the pool, outcome, and proof endpoint.",
    proofArtifact: endpoint,
    technicalEdge: "TxLINE stat-validation resolves pool payouts from proven score stats instead of admin judgement.",
    killList: ["endpoint-only settlement", "fake escrow", "broad sportsbook clone"],
  };
  return {
    id: `${fixture.FixtureId}-settlement-card`,
    track: "settlement",
    roomCode: fixtureRoomCode(fixture.FixtureId, "POOL"),
    title: settledMarketTitle(firstBook),
    body: payoutSummary(payouts),
    callToAction: "Challenge a friend to a side",
    shareText: `I opened a verified TxLINE prop room for ${fixtureLabel}. Pick a side before settlement. Room ${fixtureRoomCode(fixture.FixtureId, "POOL")}`,
    viralityScore: scoreVirality(loop, Boolean(endpoint)),
    proof: {
      label: "settlement request",
      endpoint,
      source: firstBook?.settlement ? "txline-stat-validation" : "market-room-preview",
    },
    loop,
  };
}

export function buildTradingViralCard(fixture: Fixture, backtest: BacktestReport): ViralShareCard {
  const fixtureLabel = makeFixtureLabel(fixture);
  const topSignal = backtest.trades[0];
  const loop: ViralLoop = {
    exactUser: "A football trader or sharp fan who wants to prove they can beat an odds-move agent.",
    tenSecondAction: "Tap follow or fade on the top DriftDesk signal and compare against the backtest result.",
    returnTrigger: "New odds shocks create fresh agent calls and a follow-or-fade leaderboard.",
    shareTrigger: "A duel card shows whether the user beat the agent call, with source labels intact.",
    proofArtifact: "/api/driftdesk/signals",
    technicalEdge: "The agent combines implied-probability movement with TxLINE score context and proof IDs.",
    killList: ["fake PnL", "unlabelled replay", "static odds chart"],
  };
  const call = topSignal ? `${topSignal.label} ${topSignal.market}` : "wait for the first shock";
  return {
    id: `${fixture.FixtureId}-trading-card`,
    track: "trading",
    roomCode: fixtureRoomCode(fixture.FixtureId, "DUEL"),
    title: `Follow or fade DriftDesk on ${fixtureLabel}`,
    body: `Top call: ${call}. Backtest hit rate ${backtest.hitRate}%.`,
    callToAction: "Enter the agent duel",
    shareText: `I challenged the DriftDesk agent on ${fixtureLabel}. Follow or fade the same TxLINE odds shock. Room ${fixtureRoomCode(fixture.FixtureId, "DUEL")}`,
    viralityScore: scoreVirality(loop, Boolean(topSignal)),
    proof: {
      label: "agent signal board",
      endpoint: "/api/driftdesk/signals",
      source: backtest.source,
    },
    loop,
  };
}

export function buildTrackViralCards(input: BuildViralCardsInput): ViralShareCard[] {
  return [
    buildConsumerViralCard(input.fixture, input.clutchRounds, input.clutchReceipts, input.leaderboard),
    buildSettlementViralCard(input.fixture, input.marketBooks, input.payouts),
    buildTradingViralCard(input.fixture, input.backtest),
  ];
}
