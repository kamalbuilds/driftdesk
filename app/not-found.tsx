import Link from "next/link";

export default function NotFound() {
  return (
    <section className="section panel">
      <div className="kicker">Off the pitch</div>
      <h1>That room does not exist.</h1>
      <p className="lead">The page you asked for is not part of the studio. Pick a build below.</p>
      <div className="actions">
        <Link className="button primary" href="/viral">Open viral rooms</Link>
        <Link className="button" href="/">Studio home</Link>
      </div>
    </section>
  );
}
