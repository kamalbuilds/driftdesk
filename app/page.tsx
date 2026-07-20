export const dynamic = "force-dynamic";
import { backtestDriftStrategy } from "@txline/core";
import { findFixture, resolveActiveFixtureId, loadDemoScores, loadOddsWithSource } from "@/lib/data";
import { ProductHistory } from "@/app/ProductHistory";
import { driftdeskHistory } from "@/lib/histories";

export default async function DriftDeskPage() {
  const fixture = await findFixture(await resolveActiveFixtureId());
  const [scores, oddsData] = await Promise.all([loadDemoScores(fixture.FixtureId), loadOddsWithSource(fixture.FixtureId)]);
  const odds = oddsData.odds;
  const report = backtestDriftStrategy(fixture, odds, scores);
  const history = await driftdeskHistory(fixture.FixtureId);

  return (
    <>
      <section className="hero">
        <div>
          <div className="kicker">Trading Tools and Agents</div>
          <h1>DriftDesk is a score-aware odds movement agent.</h1>
          <div className="compliance-badge">Historical backtest demo. Not financial advice.</div>
          <p className="lead">
            It watches TxLINE odds and scores, detects implied-probability shocks, classifies each signal,
            and exposes proof-ready message IDs for validation.
          </p>
          <div className="actions">
            <a className="button primary" href="/api/signals">View signals API</a>
            <a className="button" href="#signals">Inspect agent calls</a>
          </div>
        </div>
        <div className="panel">
          <div className="kicker">Agent board</div>
          <div className="stat-row">
            <div className="stat"><strong>{report.signals.length}</strong><span>signals found</span></div>
            <div className="stat"><strong>{scores.length}</strong><span>score events</span></div>
            <div className="stat"><strong>{report.largeMoveShare}%</strong><span>large-move share</span></div>
          </div>
          <p className="muted">Historical odds replay only when no active live odds stream exists. The hit rate is illustrative on a small replay sample, not a performance or profit claim.</p>
        </div>
      </section>

      <section id="signals" className="section panel">
        <div className="kicker">Signals</div>
        <table className="table">
          <thead>
            <tr>
              <th>Market</th>
              <th>Classification</th>
              <th>Confidence</th>
              <th>Move</th>
              <th>Proof</th>
            </tr>
          </thead>
          <tbody>
            {report.trades.map((trade) => (
              <tr key={trade.signalId}>
                <td>{trade.market}</td>
                <td>{trade.classification}</td>
                <td className="mono">{Math.round(trade.confidence * 100)}%</td>
                <td className="mono">{trade.movePct.toFixed(1)}%</td>
                <td className="mono">{trade.label}, score {trade.score}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <ProductHistory title="Sharp signal history" items={history} />
    </>
  );
}
