import {
  buildClutchRounds,
  buildLeaderboard,
  demoMarketBooks,
  scoreGuess,
  settleMarketBook,
  eventSeq,
  finalScoreEvent,
  type ClutchResult,
  type LeaderboardRow,
  type MarketBook,
  type Payout,
  type StatValidationResponse,
} from "@txline/core";
import { findFixture, resolveActiveFixtureId, loadDemoScoresWithSource, loadTxLineClient } from "@/lib/data";

export type StudioMarketBook = MarketBook & { proofEndpoint?: string; error?: string };

const demoPlayers = [
  { name: "Kamal", drift: 1 },
  { name: "Mina", drift: -4 },
  { name: "Leo", drift: 7 },
  { name: "Nora", drift: -10 },
];

/** Deterministic demo leaderboard used until a real room backend exists. */
export function demoLeaderboard(rounds: ReturnType<typeof buildClutchRounds>): LeaderboardRow[] {
  const resultsByPlayer: Record<string, ClutchResult[]> = {};
  for (const player of demoPlayers) {
    resultsByPlayer[player.name] = rounds.map((round, index) => ({
      ...scoreGuess(round, Math.max(round.min, Math.min(round.max, round.answerMinute + player.drift + index))),
      player: player.name,
    }));
  }
  return buildLeaderboard(resultsByPlayer);
}

/**
 * Build market books for a fixture and settle them against the real TxLINE
 * stat-validation response when credentials are available. Falls back to an
 * open, unsettled book with a proof endpoint so the response is always valid.
 */
export async function settledBooksAndPayouts(fixtureId?: number): Promise<{
  fixture: Awaited<ReturnType<typeof findFixture>>;
  marketBooks: StudioMarketBook[];
  payouts: Payout[];
  source: string;
  scoresSource: "live" | "sample";
}> {
  const resolvedId = fixtureId ?? (await resolveActiveFixtureId());
  const fixture = await findFixture(resolvedId);
  const { scores, source: scoresSource } = await loadDemoScoresWithSource(fixture.FixtureId);
  const books = demoMarketBooks(fixture);
  const client = await loadTxLineClient();
  const finalEvent = finalScoreEvent(scores);
  const seq = finalEvent ? eventSeq(finalEvent) : 0;
  const marketBooks: StudioMarketBook[] = [];
  const payouts: Payout[] = [];
  let settledAny = false;

  for (const book of books) {
    const proofEndpoint = seq > 0
      ? `/api/scores/stat-validation?fixtureId=${fixture.FixtureId}&seq=${seq}&statKeys=${book.prop.statKeys.join(",")}`
      : `/api/varifiable/markets`;
    if (!client || !Number.isFinite(seq) || seq <= 0) {
      marketBooks.push({ ...book, proofEndpoint });
      continue;
    }
    try {
      const validation = (await client.statValidation({
        fixtureId: fixture.FixtureId,
        seq,
        statKeys: book.prop.statKeys,
      })) as StatValidationResponse;
      const result = settleMarketBook(book, validation);
      marketBooks.push({ ...result.book, proofEndpoint });
      payouts.push(...result.payouts);
      settledAny = true;
    } catch (error) {
      marketBooks.push({ ...book, proofEndpoint, error: error instanceof Error ? error.message : "Proof fetch failed." });
    }
  }

  return {
    fixture,
    marketBooks,
    payouts,
    source: settledAny ? "txline-devnet-stat-validation" : "market-room-preview",
    scoresSource,
  };
}
