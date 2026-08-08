import { Buffer } from "node:buffer";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction
} from "@solana/web3.js";
import {
  ConnectionMagicRouter,
  MAGIC_CONTEXT_ID,
  MAGIC_PROGRAM_ID
} from "@magicblock-labs/ephemeral-rollups-sdk";
import {
  RoomSettlementStatusSchema,
  SettlementSummarySchema,
  type RoomAuthorityStatus,
  type RoomSettlementStatus,
  type SettlementSummary
} from "@/game/schemas";
import {
  deriveRaidStatePda,
  deriveSettlementRecordPda,
  raidIdHexToBytes,
  MAGICBLOCK_DEVNET,
  RAID_SETTLEMENT_PROGRAM_ID
} from "@/lib/magicblock";
import { decodeRaidStateAccount } from "@/lib/room-chain";
import {
  buildSettleRaidTransaction,
  settlementExplorerUrl,
  RAID_RESULT_INDEX
} from "@/lib/settlement";

const COMMIT_AND_UNDELEGATE_RAID_DISCRIMINATOR = Buffer.from([
  210, 80, 139, 197, 32, 249, 30, 199
]);
// sha256("global:finalize_raid")[0..8] — brings RaidState.lifecycle from Active
// to a terminal state on-chain when the local raid ended in a way that never
// routed a hit through MagicBlock (e.g. a Defeat from the boss's own attacks,
// or a Timeout the boss's tick decided rather than a player hit).
const FINALIZE_RAID_DISCRIMINATOR = Buffer.from([149, 188, 177, 247, 200, 129, 0, 166]);

export async function submitSettlementSummary(
  rawSummary: SettlementSummary,
  authorityStatus?: RoomAuthorityStatus
): Promise<RoomSettlementStatus> {
  const [raidStatePda] = authorityStatus?.raidIdHex
    ? deriveRaidStatePda(raidIdHexToBytes(authorityStatus.raidIdHex))
    : deriveRaidStatePda();
  const [settlementRecordPda] = deriveSettlementRecordPda(raidStatePda);

  if (process.env.MAGICRAID_SETTLEMENT_MODE === "local") {
    return RoomSettlementStatusSchema.parse({
      status: "local_verified",
      summary: rawSummary,
      settlementRecordPda: settlementRecordPda.toBase58(),
      message: "Local settlement summary verified; devnet submission is disabled.",
      authority: authorityStatus
    });
  }

  try {
    const authority = loadSettlementAuthority();
    const summary = SettlementSummarySchema.parse({
      ...rawSummary,
      authority: authority.publicKey.toBase58()
    });
    const connection = new Connection(MAGICBLOCK_DEVNET.solanaDevnetRpc, "confirmed");
    await commitAndUndelegateRoomRaidState(raidStatePda, authority);
    await ensureRaidStateFinalized(connection, authority, raidStatePda, summary);
    const transaction = buildSettleRaidTransaction(summary, authority.publicKey, {
      raidIdHex: authorityStatus?.raidIdHex
    });
    const signature = await sendAndConfirmTransaction(connection, transaction, [authority], {
      commitment: "confirmed",
      skipPreflight: false
    });

    return RoomSettlementStatusSchema.parse({
      status: "success",
      summary: {
        ...summary,
        transactionSignature: signature
      },
      transactionSignature: signature,
      explorerUrl: settlementExplorerUrl(signature),
      settlementRecordPda: settlementRecordPda.toBase58(),
      message: "Settlement recorded on Solana devnet.",
      authority: authorityStatus
    });
  } catch (error) {
    return RoomSettlementStatusSchema.parse({
      status: "failed",
      summary: rawSummary,
      settlementRecordPda: settlementRecordPda.toBase58(),
      message: truncateMessage(
        error instanceof Error ? error.message : "Settlement transaction failed."
      ),
      authority: authorityStatus
    });
  }
}

async function commitAndUndelegateRoomRaidState(
  raidStatePda: PublicKey,
  authority: Keypair
) {
  const routerConnection = new ConnectionMagicRouter(MAGICBLOCK_DEVNET.routerRpc, "confirmed");
  const delegationStatus = await routerConnection.getDelegationStatus(raidStatePda);

  if (!delegationStatus?.isDelegated) {
    return;
  }

  const transaction = new Transaction().add(
    commitAndUndelegateRaidInstruction(authority.publicKey, raidStatePda)
  );
  transaction.feePayer = authority.publicKey;
  await routerConnection.sendAndConfirmTransaction(transaction, [authority], {
    commitment: "confirmed",
    skipPreflight: false
  });
  await waitForUndelegation(routerConnection, raidStatePda);
}

// Local raid resolution (rules.ts) can reach victory/defeat/timeout without
// ever calling apply_player_hit on-chain (e.g. defeat comes from the boss's
// own attack tick, not a player hit). Bring RaidState.lifecycle from Active to
// the matching terminal state before settle_raid runs, or it fails with
// RaidNotTerminal. Skipped when already terminal (finalize_raid requires
// Active and is not re-callable) or when the account was never initialized
// on-chain, in which case settle_raid will surface its own account error.
async function ensureRaidStateFinalized(
  connection: Connection,
  authority: Keypair,
  raidStatePda: PublicKey,
  summary: SettlementSummary
) {
  const accountInfo = await connection.getAccountInfo(raidStatePda);
  const state = decodeRaidStateAccount(accountInfo);

  if (!state || state.lifecycle !== "active") {
    return;
  }

  const elapsedDeltaSeconds = clampU16(summary.durationSeconds - state.elapsedSeconds);
  const transaction = new Transaction().add(
    finalizeRaidInstruction(authority.publicKey, raidStatePda, summary.result, elapsedDeltaSeconds)
  );
  transaction.feePayer = authority.publicKey;
  await sendAndConfirmTransaction(connection, transaction, [authority], {
    commitment: "confirmed",
    skipPreflight: false
  });
}

function finalizeRaidInstruction(
  authority: PublicKey,
  raidStatePda: PublicKey,
  result: SettlementSummary["result"],
  elapsedDeltaSeconds: number
) {
  return new TransactionInstruction({
    programId: RAID_SETTLEMENT_PROGRAM_ID,
    keys: [
      { pubkey: raidStatePda, isSigner: false, isWritable: true },
      { pubkey: authority, isSigner: true, isWritable: false }
    ],
    data: Buffer.concat([
      FINALIZE_RAID_DISCRIMINATOR,
      Buffer.from([RAID_RESULT_INDEX[result]]),
      u16le(elapsedDeltaSeconds)
    ])
  });
}

function commitAndUndelegateRaidInstruction(authority: PublicKey, raidStatePda: PublicKey) {
  return new TransactionInstruction({
    programId: RAID_SETTLEMENT_PROGRAM_ID,
    keys: [
      { pubkey: raidStatePda, isSigner: false, isWritable: true },
      { pubkey: authority, isSigner: true, isWritable: true },
      { pubkey: MAGIC_CONTEXT_ID, isSigner: false, isWritable: true },
      { pubkey: MAGIC_PROGRAM_ID, isSigner: false, isWritable: false }
    ],
    data: COMMIT_AND_UNDELEGATE_RAID_DISCRIMINATOR
  });
}

async function waitForUndelegation(
  routerConnection: ConnectionMagicRouter,
  raidStatePda: PublicKey,
  attempts = 45
) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const status = await routerConnection.getDelegationStatus(raidStatePda);
    if (!status?.isDelegated) {
      return;
    }
    await new Promise((resolveWait) => {
      setTimeout(resolveWait, 1_000);
    });
  }

  throw new Error("Timed out waiting for room RaidState commit and undelegation.");
}

export function settlementAuthorityAddress(): string | undefined {
  try {
    return loadSettlementAuthority().publicKey.toBase58();
  } catch {
    return undefined;
  }
}

function loadSettlementAuthority(): Keypair {
  const configured =
    process.env.MAGICRAID_SETTLEMENT_KEYPAIR ??
    process.env.SOLANA_KEYPAIR ??
    "~/.config/solana/id.json";

  const trimmed = configured.trim();
  if (trimmed.startsWith("[")) {
    return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(trimmed) as number[]));
  }

  const path = expandHomePath(trimmed);
  if (!existsSync(path)) {
    throw new Error(
      "Settlement authority keypair is missing. Set MAGICRAID_SETTLEMENT_MODE=local or MAGICRAID_SETTLEMENT_KEYPAIR."
    );
  }

  return Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(readFileSync(path, "utf8")) as number[])
  );
}

function expandHomePath(path: string) {
  if (path.startsWith("~/")) {
    return resolve(homedir(), path.slice(2));
  }

  return resolve(path);
}

function clampU16(value: number): number {
  return Math.max(0, Math.min(65_535, Math.trunc(value)));
}

function u16le(value: number): Buffer {
  const buffer = Buffer.alloc(2);
  buffer.writeUInt16LE(clampU16(value), 0);
  return buffer;
}

function truncateMessage(message: string, maxLength = 180) {
  return message.length <= maxLength ? message : `${message.slice(0, maxLength - 3)}...`;
}
