import { writeFileSync } from "node:fs";
import { mkdirSync } from "node:fs";
import { TxLineClient } from "../client/txline-client";
import { subscribeFreeTier } from "../solana/subscribe";

async function main(): Promise<void> {
  const client = new TxLineClient({ network: "devnet" });
  const { token: jwt } = await client.startGuestSession();
  const subscription = await subscribeFreeTier({ network: "devnet", jwt });
  const apiToken = await client.activate({
    txSig: subscription.txSig,
    walletSignature: subscription.walletSignature,
    leagues: [],
  });
  mkdirSync("data/live", { recursive: true });
  writeFileSync("data/live/txline-devnet-credentials.json", JSON.stringify({
    network: "devnet",
    walletPubkey: subscription.walletPubkey,
    txSig: subscription.txSig,
    jwt,
    apiToken,
    activatedAt: new Date().toISOString(),
  }, null, 2));
  console.log(JSON.stringify({
    ok: true,
    network: "devnet",
    walletPubkey: subscription.walletPubkey,
    subscribeTx: subscription.txSig,
    credentialsPath: "data/live/txline-devnet-credentials.json",
    env: {
      TXLINE_NETWORK: "devnet",
      TXLINE_JWT: jwt,
      TXLINE_API_TOKEN: apiToken,
    },
  }, null, 2));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
