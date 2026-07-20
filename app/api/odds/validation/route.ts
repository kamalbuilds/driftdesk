export const dynamic = "force-dynamic";
import { jsonError, jsonOk, withRouteErrors } from "@/lib/api";
import { loadTxLineClient } from "@/lib/data";

function parseTimestamp(value: string | null): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error("ts must be a positive Unix millisecond timestamp.");
  return parsed;
}

export const GET = withRouteErrors(async (req: Request) => {
  const url = new URL(req.url);
  const messageId = url.searchParams.get("messageId")?.trim();
  let ts: number;
  try {
    if (!messageId) throw new Error("messageId is required.");
    if (messageId.startsWith("sample-")) {
      return jsonOk({
        ok: false,
        verifiable: false,
        source: "replay-odds-sample",
        messageId,
        error: "Replay odds use sample message IDs and are not on-chain verifiable.",
      }, { status: 202 });
    }
    ts = parseTimestamp(url.searchParams.get("ts"));
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Invalid request.", 400);
  }

  const client = await loadTxLineClient();
  if (!client) return jsonError("TxLINE credentials unavailable. Configure server-side credentials to validate odds.", 503);
  const raw = await client.oddsValidation({ messageId, ts });
  return jsonOk({ ok: true, verifiable: true, source: "txline-devnet-odds-validation", messageId, ts, raw });
});
