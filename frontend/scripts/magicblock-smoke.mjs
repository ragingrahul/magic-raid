#!/usr/bin/env node
import { Connection, PublicKey } from "@solana/web3.js";
import { ConnectionMagicRouter } from "@magicblock-labs/ephemeral-rollups-sdk";

const MAGICBLOCK_DEVNET = {
  routerRpc: "https://devnet-router.magicblock.app",
  solanaDevnetRpc: "https://api.devnet.solana.com",
  erAsiaRpc: "https://devnet-as.magicblock.app",
  asiaValidator: "MAS1Dt9qreoRMQ14YQuhg8UTZMMzDdKhmkZMECCzk57"
};

const RAID_SETTLEMENT_PROGRAM_ID = new PublicKey(
  "2644KGiENvPpHYbktoMUz2y6TWeQsxz8MpcRhmrakW72"
);
const RAID_STATE_SEED = "raid-state";
const [raidStatePda, bump] = PublicKey.findProgramAddressSync(
  [new TextEncoder().encode(RAID_STATE_SEED)],
  RAID_SETTLEMENT_PROGRAM_ID
);

async function capture(label, run) {
  try {
    return { label, ok: true, value: await run() };
  } catch (error) {
    return {
      label,
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

const router = new ConnectionMagicRouter(MAGICBLOCK_DEVNET.routerRpc, "confirmed");
const solanaDevnet = new Connection(MAGICBLOCK_DEVNET.solanaDevnetRpc, "confirmed");
const erAsia = new Connection(MAGICBLOCK_DEVNET.erAsiaRpc, "confirmed");

const [closestValidator, delegationStatus, solanaDevnetVersion, erAsiaVersion] =
  await Promise.all([
    capture("closestValidator", () => router.getClosestValidator()),
    capture("raidStateDelegationStatus", () => router.getDelegationStatus(raidStatePda)),
    capture("solanaDevnetVersion", () => solanaDevnet.getVersion()),
    capture("erAsiaVersion", () => erAsia.getVersion())
  ]);

const result = {
  programId: RAID_SETTLEMENT_PROGRAM_ID.toBase58(),
  raidStatePda: raidStatePda.toBase58(),
  bump,
  expectedAsiaValidator: MAGICBLOCK_DEVNET.asiaValidator,
  checks: {
    closestValidator,
    delegationStatus,
    solanaDevnetVersion,
    erAsiaVersion
  }
};

console.log(JSON.stringify(result, null, 2));

if (!closestValidator.ok || !delegationStatus.ok || !solanaDevnetVersion.ok || !erAsiaVersion.ok) {
  process.exitCode = 1;
}
