import type { Metadata, Viewport } from "next";
import "./globals.css";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3026";
const title = process.env.NEXT_PUBLIC_PRODUCT_TITLE ?? "TxLINE Football App";
const description = "A live TxLINE-powered football product with proof-backed data and no wallet required for judges.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title,
  description,
  openGraph: { title, description, url: siteUrl, siteName: title, type: "website" },
  twitter: { card: "summary_large_image", title, description },
};
export const viewport: Viewport = { themeColor: "#0a0a14", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en"><body><main className="shell">
      <nav className="nav"><a href="/" className="brand"><span className="brand-mark">TX</span><span>{title}</span></a><div className="nav-links"><a href="/api/health">Health</a><a href="/docs">Docs</a></div></nav>
      {children}
      <footer className="legal-footer"><p>Demonstration only. No real-money wagering, betting, or financial products are offered. All stakes are play-money points.</p><p>Not affiliated with, endorsed by, or sponsored by FIFA or any tournament organiser.</p></footer>
    </main></body></html>
  );
}
