export const dynamic = "force-dynamic";
export default function DocsPage() {
  return (
    <section className="section panel">
      <div className="kicker">Docs</div>
      <h1>Project documentation</h1>
      <p className="lead">Open the repository docs folder for setup, API routes, environment variables, and demo guidance.</p>
      <div className="actions"><a className="button primary" href="/api/health">Check health</a><a className="button" href="/">Back to app</a></div>
    </section>
  );
}
