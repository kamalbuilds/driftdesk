import type { ProductHistoryItem } from "@txline/core";

const statusLabel: Record<ProductHistoryItem["status"], string> = {
  open: "Open",
  locked: "Locked",
  settled: "Settled",
  verified: "Verified",
  backtest: "Backtest",
  receipt: "Receipt",
};

export function ProductHistory({ title, items }: { title: string; items: ProductHistoryItem[] }) {
  return (
    <section className="section panel">
      <div className="kicker">Product history</div>
      <h2>{title}</h2>
      {items.length ? (
        <div className="history-list">
          {items.map((item) => (
            <article className="history-item" key={item.id}>
              <div className="meta">
                <span className="accent">{statusLabel[item.status]}</span>
                <span>{item.source}</span>
                <span>{new Date(item.timestamp).toISOString().replace("T", " ").slice(0, 19)}</span>
              </div>
              <h3>{item.title}</h3>
              <p className="muted">{item.body}</p>
              {item.proofEndpoint ? <a className="proof-link" href={item.proofEndpoint}>{item.proofEndpoint}</a> : null}
            </article>
          ))}
        </div>
      ) : (
        <p className="muted">No history yet for this product. Trigger the first verified event to populate it.</p>
      )}
    </section>
  );
}
