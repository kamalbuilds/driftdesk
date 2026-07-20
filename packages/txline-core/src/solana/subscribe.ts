import { AnchorProvider, Program, Wallet, type Idl } from "@coral-xyz/anchor";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  getOrCreateAssociatedTokenAccount,
} from "@solana/spl-token";
import { Connection, Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import txoracleDevnet from "../idl/txoracle-devnet.json" assert { type: "json" };
import { NETWORKS, resolveNetwork, type Network } from "../config";
import { loadKeypair, signMessageBase64 } from "./wallet";

export interface SubscribeResult {
  txSig: string;
  walletPubkey: string;
  message: string;
  walletSignature: string;
  network: Network;
  serviceLevelId: number;
  durationWeeks: number;
}

export interface SubscribeOptions {
  network?: Network;
  serviceLevelId?: number;
  durationWeeks?: number;
  leagues?: number[];
  jwt: string;
  keypairPath?: string;
}

interface SubscribeMethodProgram {
  methods: {
    subscribe: (serviceLevelId: number, durationWeeks: number) => {
      accounts: (accounts: Record<string, unknown>) => { rpc: () => Promise<string> };
    };
  };
}

export function createAnchorProgram(network: Network, keypair: Keypair): Program {
  if (network !== "devnet") {
    throw new Error("Bundled IDL is devnet-only. Add mainnet IDL before mainnet on-chain subscribe.");
  }
  const config = NETWORKS.devnet;
  const connection = new Connection(config.rpcUrl, "confirmed");
  const provider = new AnchorProvider(connection, new Wallet(keypair), { commitment: "confirmed" });
  const program = new Program(txoracleDevnet as Idl, provider);
  if (!program.programId.equals(config.programId)) {
    throw new Error(`IDL program ${program.programId.toBase58()} does not match ${config.programId.toBase58()}`);
  }
  return program;
}

export async function subscribeFreeTier(options: SubscribeOptions): Promise<SubscribeResult> {
  const config = resolveNetwork(options.network ?? "devnet");
  if (config.network !== "devnet") {
    throw new Error("Use devnet for automated local subscribe. Mainnet requires explicit mainnet IDL and funded wallet.");
  }
  const serviceLevelId = options.serviceLevelId ?? 1;
  if (!config.freeServiceLevels.includes(serviceLevelId)) {
    throw new Error(`Service level ${serviceLevelId} is not marked free for ${config.network}.`);
  }
  const durationWeeks = options.durationWeeks ?? 4;
  const leagues = options.leagues ?? [];
  const keypair = loadKeypair(options.keypairPath);
  const program = createAnchorProgram(config.network, keypair);
  const walletPubkey = keypair.publicKey;

  const [tokenTreasuryPda] = PublicKey.findProgramAddressSync([Buffer.from("token_treasury_v2")], program.programId);
  const tokenTreasuryVault = getAssociatedTokenAddressSync(
    config.txlTokenMint,
    tokenTreasuryPda,
    true,
    TOKEN_2022_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID,
  );
  const [pricingMatrixPda] = PublicKey.findProgramAddressSync([Buffer.from("pricing_matrix")], program.programId);
  const userTokenAccount = getAssociatedTokenAddressSync(
    config.txlTokenMint,
    walletPubkey,
    false,
    TOKEN_2022_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID,
  );
  await getOrCreateAssociatedTokenAccount(
    program.provider.connection,
    keypair,
    config.txlTokenMint,
    walletPubkey,
    false,
    "confirmed",
    undefined,
    TOKEN_2022_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID,
  );

  const subscribeProgram = program as unknown as SubscribeMethodProgram;
  const txSig = await subscribeProgram.methods
    .subscribe(serviceLevelId, durationWeeks)
    .accounts({
      user: walletPubkey,
      pricingMatrix: pricingMatrixPda,
      tokenMint: config.txlTokenMint,
      userTokenAccount,
      tokenTreasuryVault,
      tokenTreasuryPda,
      tokenProgram: TOKEN_2022_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  const message = `${txSig}:${leagues.join(",")}:${options.jwt}`;
  const walletSignature = signMessageBase64(keypair, message);

  return {
    txSig,
    walletPubkey: walletPubkey.toBase58(),
    message,
    walletSignature,
    network: config.network,
    serviceLevelId,
    durationWeeks,
  };
}
