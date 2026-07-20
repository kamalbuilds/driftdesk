import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { Keypair } from "@solana/web3.js";
import nacl from "tweetnacl";

export function loadKeypair(path = process.env.SOLANA_KEYPAIR ?? "~/.config/solana/id.json"): Keypair {
  const expanded = path.startsWith("~/") ? resolve(homedir(), path.slice(2)) : resolve(path);
  const raw = JSON.parse(readFileSync(expanded, "utf8")) as number[];
  return Keypair.fromSecretKey(Uint8Array.from(raw));
}

export function signMessageBase64(keypair: Keypair, message: string): string {
  const signature = nacl.sign.detached(new TextEncoder().encode(message), keypair.secretKey);
  return Buffer.from(signature).toString("base64");
}
