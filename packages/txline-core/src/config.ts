/**
 * Network configuration for TxLINE. Values sourced from the official
 * TxLINE Quickstart and World Cup Free Tier docs.
 */
import { PublicKey } from "@solana/web3.js";

export type Network = "mainnet" | "devnet";

export interface NetworkConfig {
  network: Network;
  rpcUrl: string;
  apiOrigin: string;
  apiBaseUrl: string;
  guestAuthUrl: string;
  programId: PublicKey;
  txlTokenMint: PublicKey;
  /** Free World Cup service levels enabled on this network. */
  freeServiceLevels: number[];
}

export const NETWORKS: Record<Network, NetworkConfig> = {
  mainnet: {
    network: "mainnet",
    rpcUrl: process.env.SOLANA_RPC_MAINNET ?? "https://api.mainnet-beta.solana.com",
    apiOrigin: "https://txline.txodds.com",
    apiBaseUrl: "https://txline.txodds.com/api",
    guestAuthUrl: "https://txline.txodds.com/auth/guest/start",
    programId: new PublicKey("9ExbZjAapQww1vfcisDmrngPinHTEfpjYRWMunJgcKaA"),
    txlTokenMint: new PublicKey("Zhw9TVKp68a1QrftncMSd6ELXKDtpVMNuMGr1jNwdeL"),
    freeServiceLevels: [1, 12],
  },
  devnet: {
    network: "devnet",
    rpcUrl: process.env.SOLANA_RPC_DEVNET ?? "https://api.devnet.solana.com",
    apiOrigin: "https://txline-dev.txodds.com",
    apiBaseUrl: "https://txline-dev.txodds.com/api",
    guestAuthUrl: "https://txline-dev.txodds.com/auth/guest/start",
    programId: new PublicKey("6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J"),
    txlTokenMint: new PublicKey("4Zao8ocPhmMgq7PdsYWyxvqySMGx7xb9cMftPMkEokRG"),
    freeServiceLevels: [1],
  },
};

export function resolveNetwork(input?: string): NetworkConfig {
  const key = (input ?? process.env.TXLINE_NETWORK ?? "devnet").toLowerCase();
  if (key !== "mainnet" && key !== "devnet") {
    throw new Error(`Unknown network "${key}". Use "mainnet" or "devnet".`);
  }
  return NETWORKS[key];
}
