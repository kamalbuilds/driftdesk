export const dynamic = "force-dynamic";
import {
  buildPredictionRounds,
  resolveRoundFromValidation,
  type StatValidationResponse,
} from "@txline/core";
import { findFixture, loadDemoScores, loadTxLineClient } from "@/lib/data";
import { jsonError, jsonOk, withRouteErrors } from "@/lib/api";

function parsePositiveInt(value: string | null, name: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`${name} must be a positive integer.`);
  return parsed;
}

function parseStatKeys(value: string | null): number[] {
  if (!value) return [1, 2];
  const keys = value.split(",").map((item) => Number(item.trim())).filter((item) => Number.isInteger(item) && item > 0);
  if (!keys.length) throw new Error("statKeys must contain at least one positive integer.");
  return keys;
}

export const GET = withRouteErrors(async (req: Request) => {
  const url = new URL(req.url);
  let fixtureId: number;
  let seq: number;
  let statKeys: number[];
  try {
    fixtureId = parsePositiveInt(url.searchParams.get("fixtureId"), "fixtureId");
    seq = parsePositiveInt(url.searchParams.get("seq"), "seq");
    statKeys = parseStatKeys(url.searchParams.get("statKeys") ?? url.searchParams.get("statKey"));
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Invalid request.", 400);
  }

  const [fixture, scores, client] = await Promise.all([findFixture(fixtureId), loadDemoScores(fixtureId), loadTxLineClient()]);
  if (!client) {
    return jsonError("TxLINE credentials unavailable. Run pnpm core:activate.", 503);
  }

  const fetchedAtMs = Date.now();
  const raw = (await client.statValidation({ fixtureId, seq, statKeys })) as StatValidationResponse;
  const rounds = buildPredictionRounds(fixture, scores);
  const round = rounds.find((candidate) => candidate.resolveSeq === seq);
  const resolution = round
    ? resolveRoundFromValidation(round, raw, scores, "txline-devnet-stat-validation", fetchedAtMs)
    : null;

  return jsonOk({
    ok: true,
    fixture,
    fixtureId,
    seq,
    statKeys,
    source: "txline-devnet-stat-validation",
    fetchedAtMs,
    resolution,
    raw,
  });
});
