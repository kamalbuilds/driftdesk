import {
  backtestDriftStrategy,
  buildClutchRounds,
  buildReplayTimeline,
  goalReceipts,
  oddsReceipt,
  scoreReceipt,
  type ProductHistoryItem,
  sortHistory,
} from "@txline/core";
import { findFixture, resolveActiveFixtureId, loadDemoScoresWithSource, loadOddsWithSource } from "@/lib/data";
import { settledBooksAndPayouts } from "@/lib/studio";

export async function clutchHistory(fixtureId?: number): Promise<ProductHistoryItem[]> {
  const fixture = await findFixture(fixtureId ?? (await resolveActiveFixtureId()));
  const { scores, source } = await loadDemoScoresWithSource(fixture.FixtureId);
  const rounds = buildClutchRounds(fixture, scores);
  const receipts = goalReceipts(fixture, scores);
  const items: ProductHistoryItem[] = receipts.map((receipt, index) => ({
    id: receipt.id,
    product: "clutch",
    title: `${receipt.headline} at ${receipt.minute}'`,
    body: `${receipt.fixtureLabel} reached ${receipt.score}. Round ${index + 1} of ${rounds.length} resolved on this verified goal.`,
    timestamp: Number((receipt as { ts?: number }).ts ?? Date.now() - (receipts.length - index) * 60_000),
    source,
    proofEndpoint: receipt.validationEndpoint,
    status: "receipt",
    meta: { minute: receipt.minute, seq: receipt.seq, score: receipt.score },
  }));
  return sortHistory(items);
}

export async function varifiableHistory(fixtureId?: number): Promise<ProductHistoryItem[]> {
  const { marketBooks } = await settledBooksAndPayouts(fixtureId);
  const items: ProductHistoryItem[] = marketBooks.map((book) => ({
    id: `${book.id}-history`,
    product: "varifiable",
    title: book.settlement ? `${book.label} settled ${book.settlement.outcome}` : `${book.label} open`,
    body: book.settlement
      ? book.settlement.reason
      : `${book.positions.length} positions locked, waiting for a finalised score sequence.`,
    timestamp: Date.now(),
    source: book.settlement ? "derived" : "sample",
    proofEndpoint: book.proofEndpoint,
    status: book.settlement ? "settled" : "open",
    meta: { statKeys: book.prop.statKeys.join(","), positions: book.positions.length, outcome: book.settlement?.outcome ?? null },
  }));
  return sortHistory(items);
}

export async function driftdeskHistory(fixtureId?: number): Promise<ProductHistoryItem[]> {
  const fixture = await findFixture(fixtureId ?? (await resolveActiveFixtureId()));
  const [{ scores }, oddsData] = await Promise.all([loadDemoScoresWithSource(fixture.FixtureId), loadOddsWithSource(fixture.FixtureId)]);
  const report = backtestDriftStrategy(fixture, oddsData.odds, scores);
  const items: ProductHistoryItem[] = report.signals.map((signal) => ({
    id: signal.id,
    product: "driftdesk",
    title: `${signal.classification} on ${signal.market}`,
    body: `${signal.summary} Signal strength ${Math.round(signal.signalStrength * 100)}%.`,
    timestamp: signal.afterTs,
    source: oddsData.source,
    proofEndpoint: signal.proof.txlineEndpoint,
    status: "backtest",
    meta: {
      movePct: Number(signal.maxMovePct.toFixed(1)),
      verifiable: signal.proof.verifiable,
      oddsMessageId: signal.proof.oddsMessageId ?? null,
    },
  }));
  return sortHistory(items);
}

export async function proofcastHistory(fixtureId?: number): Promise<ProductHistoryItem[]> {
  const fixture = await findFixture(fixtureId ?? (await resolveActiveFixtureId()));
  const [{ scores, source: scoresSource }, oddsData] = await Promise.all([
    loadDemoScoresWithSource(fixture.FixtureId),
    loadOddsWithSource(fixture.FixtureId),
  ]);
  const timeline = buildReplayTimeline(scores, oddsData.odds, 0.05).slice(0, 20);
  const items: ProductHistoryItem[] = timeline.map((item) => {
    const receipt = item.kind === "score" ? scoreReceipt(fixture, item.event) : oddsReceipt(fixture, item.before, item.after, scores);
    return {
      id: receipt.id,
      product: "proofcast" as const,
      title: receipt.title,
      body: receipt.body,
      timestamp: receipt.timestamp,
      source: item.kind === "score" ? scoresSource : oddsData.source,
      proofEndpoint: receipt.txline.oddsMessageId
        ? `/api/odds/validation?messageId=${receipt.txline.oddsMessageId}&ts=${receipt.timestamp}`
        : receipt.seq
          ? `/api/scores/stat-validation?fixtureId=${receipt.fixtureId}&seq=${receipt.seq}&statKeys=1,2`
          : undefined,
      status: "receipt" as const,
      meta: { eventType: receipt.eventType, seq: receipt.seq ?? null },
    };
  });
  return sortHistory(items);
}
