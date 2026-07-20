export const dynamic = "force-dynamic";
import { loadFixtures, loadTxLineClient } from "@/lib/data";
import { jsonOk, withRouteErrors } from "@/lib/api";

const startedAt = Date.now();

/**
 * Liveness plus readiness probe. Reports whether TxLINE credentials are wired
 * and whether the fixture data path resolves, without exposing any secrets.
 */
export const GET = withRouteErrors(async () => {
  const client = await loadTxLineClient();
  let fixtures = 0;
  let source: "live" | "sample" | "unavailable" = "unavailable";
  try {
    const loaded = await loadFixtures();
    fixtures = loaded.fixtures.length;
    source = loaded.source;
  } catch (error) {
    console.error("Health fixture load failed:", error);
  }

  return jsonOk({
    ok: fixtures > 0,
    app: process.env.NEXT_PUBLIC_PRODUCT_TITLE ?? "driftdesk",
    uptimeMs: Date.now() - startedAt,
    credentials: Boolean(client),
    fixtures,
    dataSource: source,
    time: new Date().toISOString(),
  });
});
