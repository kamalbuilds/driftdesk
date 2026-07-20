export const dynamic = "force-dynamic";
import { backtestDriftStrategy } from "@txline/core";
import { findFixture, resolveActiveFixtureId, loadDemoScoresWithSource, loadOddsWithSource } from "@/lib/data";
import { jsonOk, withRouteErrors } from "@/lib/api";

export const GET = withRouteErrors(async () => {
  const fixture = await findFixture(await resolveActiveFixtureId());
  const [scoreData, oddsData] = await Promise.all([loadDemoScoresWithSource(fixture.FixtureId), loadOddsWithSource(fixture.FixtureId)]);
  const report = backtestDriftStrategy(fixture, oddsData.odds, scoreData.scores);
  return jsonOk({ ok: true, fixture, sources: { scores: scoreData.source, odds: oddsData.source, trading: report.source }, ...report });
});
