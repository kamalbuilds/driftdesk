import { Connection } from "@solana/web3.js";
import { TxLineClient, resolveNetwork } from "../index";

async function main(): Promise<void> {
  const config = resolveNetwork();
  const client = new TxLineClient({ network: config.network });
  const guest = await client.startGuestSession();
  const connection = new Connection(config.rpcUrl, "confirmed");
  const version = await connection.getVersion();
  const slot = await connection.getSlot("confirmed");
  console.log(JSON.stringify({
    ok: true,
    network: config.network,
    apiOrigin: config.apiOrigin,
    programId: config.programId.toBase58(),
    guestJwtReceived: Boolean(guest.token),
    rpc: { slot, version },
  }, null, 2));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
