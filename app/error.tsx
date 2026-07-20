"use client";

import { useEffect } from "react";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("Studio route error:", error);
  }, [error]);

  return (
    <section className="section panel">
      <div className="kicker">Something broke</div>
      <h1>The room hit an unexpected error.</h1>
      <p className="lead">This page failed to render. The rest of the studio is still available.</p>
      <div className="actions">
        <button className="button primary" type="button" onClick={() => reset()}>Try again</button>
        <a className="button" href="/">Back to studio home</a>
      </div>
    </section>
  );
}
