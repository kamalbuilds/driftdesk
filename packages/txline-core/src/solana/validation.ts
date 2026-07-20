import { PublicKey } from "@solana/web3.js";
import { resolveNetwork, type Network } from "../config";

export const MS_PER_DAY = 86_400_000;

export function epochDayFromTimestampMs(ts: number): number {
  if (!Number.isFinite(ts) || ts < 0) throw new Error("Timestamp must be a non-negative Unix millisecond value.");
  return Math.floor(ts / MS_PER_DAY);
}

function u16Le(value: number): Buffer {
  if (!Number.isInteger(value) || value < 0 || value > 65535) throw new Error(`Epoch day ${value} does not fit in u16.`);
  const buf = Buffer.alloc(2);
  buf.writeUInt16LE(value, 0);
  return buf;
}

export function deriveDailyScoresRootsPda(timestampMs: number, network?: Network): PublicKey {
  const config = resolveNetwork(network);
  const epochDay = epochDayFromTimestampMs(timestampMs);
  return PublicKey.findProgramAddressSync([Buffer.from("daily_scores_roots"), u16Le(epochDay)], config.programId)[0];
}

export function deriveDailyBatchRootsPda(timestampMs: number, network?: Network): PublicKey {
  const config = resolveNetwork(network);
  const epochDay = epochDayFromTimestampMs(timestampMs);
  return PublicKey.findProgramAddressSync([Buffer.from("daily_batch_roots"), u16Le(epochDay)], config.programId)[0];
}

export function deriveTenDailyFixturesRootsPda(timestampMs: number, network?: Network): PublicKey {
  const config = resolveNetwork(network);
  const epochDay = epochDayFromTimestampMs(timestampMs);
  const alignedEpochDay = Math.floor(epochDay / 10) * 10;
  return PublicKey.findProgramAddressSync([Buffer.from("ten_daily_fixtures_roots"), u16Le(alignedEpochDay)], config.programId)[0];
}

export function validationSourceNote(kind: "scores" | "odds" | "fixtures", timestampMs: number, network?: Network): string {
  const epochDay = epochDayFromTimestampMs(timestampMs);
  const pda = kind === "scores"
    ? deriveDailyScoresRootsPda(timestampMs, network)
    : kind === "odds"
      ? deriveDailyBatchRootsPda(timestampMs, network)
      : deriveTenDailyFixturesRootsPda(timestampMs, network);
  return `${kind} proof timestamp ${timestampMs}, epochDay ${epochDay}, PDA ${pda.toBase58()}`;
}
