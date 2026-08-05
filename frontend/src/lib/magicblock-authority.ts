import { Buffer } from "node:buffer";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";
import {
  Connection,
  Keypair,
  PublicKey,
  sendAndConfirmTransaction,
  SystemProgram,
  Transaction,
  TransactionInstruction
} from "@solana/web3.js";
import {
  ConnectionMagicRouter,
  DELEGATION_PROGRAM_ID,
  delegateBufferPdaFromDelegatedAccountAndOwnerProgram,
  delegationMetadataPdaFromDelegatedAccount,
  delegationRecordPdaFromDelegatedAccount
} from "@magicblock-labs/ephemeral-rollups-sdk";
import {
  type CriticalAuthorityAdapter,
  type CriticalAuthorityReadback,
  type CriticalCombatMutation
} from "@/game/room-authority";
import {
  deriveRaidStatePda,
  MAGICBLOCK_DEVNET,
  roomCodeToRaidId,
  RAID_SETTLEMENT_PROGRAM_ID
} from "@/lib/magicblock";
import {
  buildInitializeRaidInstruction,
  decodeRaidStateAccount
} from "@/lib/room-chain";

const APPLY_PLAYER_HIT_DISCRIMINATOR = Buffer.from([
  84, 105, 136, 224, 243, 30, 205, 71
]);
const DELEGATE_RAID_DISCRIMINATOR = Buffer.from([
  174, 195, 73, 226, 108, 195, 141, 39
]);

export function createMagicBlockCriticalAuthorityAdapter():
  | CriticalAuthorityAdapter
  | undefined {
  if (process.env.MAGICRAID_MAGICBLOCK_AUTHORITY !== "live") {
    return undefined;
  }

  const authority = loadMagicBlockAuthority();
  const baseConnection = new Connection(MAGICBLOCK_DEVNET.solanaDevnetRpc, "confirmed");
  const routerConnection = new ConnectionMagicRouter(MAGICBLOCK_DEVNET.routerRpc, "confirmed");

  return {
    applyPlayerHit: (mutation) =>
      applyPlayerHitThroughMagicBlock(baseConnection, routerConnection, authority, mutation)
  };
}

async function applyPlayerHitThroughMagicBlock(
  baseConnection: Connection,
  routerConnection: ConnectionMagicRouter,
  authority: Keypair,
  mutation: CriticalCombatMutation
): Promise<CriticalAuthorityReadback> {
  const raidId = roomCodeToRaidId(mutation.roomCode);
  const [raidStatePda] = deriveRaidStatePda(raidId);
  await ensureRoomRaidStatePrepared(
    baseConnection,
    routerConnection,
    authority,
    raidId,
    raidStatePda,
    mutation
  );
  const transaction = new Transaction().add(
    applyPlayerHitInstruction(authority.publicKey, raidStatePda, mutation)
  );
  transaction.feePayer = authority.publicKey;
  const signature = await routerConnection.sendAndConfirmTransaction(transaction, [authority], {
    commitment: "confirmed",
    skipPreflight: false
  });
  const readback = decodeRaidStateAccount(await routerConnection.getAccountInfo(raidStatePda));

  return {
    mode: "magicblock_live",
    raidStatePda: raidStatePda.toBase58(),
    transactionSignature: signature,
    lifecycle: readback?.lifecycle,
    bossHp: readback?.bossHp,
    elapsedSeconds: readback?.elapsedSeconds,
    contributionDamage: readback?.players.map((player) => player.contributionDamage),
    playerCount: readback?.playerCount ?? mutation.playerCount
  };
}

async function ensureRoomRaidStatePrepared(
  baseConnection: Connection,
  routerConnection: ConnectionMagicRouter,
  authority: Keypair,
  raidId: Uint8Array,
  raidStatePda: PublicKey,
  mutation: CriticalCombatMutation
) {
  let delegationStatus = await routerConnection.getDelegationStatus(raidStatePda);
  let accountInfo = delegationStatus?.isDelegated
    ? await routerConnection.getAccountInfo(raidStatePda)
    : await baseConnection.getAccountInfo(raidStatePda);
  let state = decodeRaidStateAccount(accountInfo);

  if (!accountInfo && !delegationStatus?.isDelegated) {
    if (!mutation.playerWallet) {
      throw new Error("Live devnet combat requires the attacking player wallet on the on-chain roster.");
    }

    await sendBaseInstruction(
      baseConnection,
      authority,
      buildInitializeRaidInstruction(
        authority.publicKey,
        raidStatePda,
        raidId,
        new PublicKey(mutation.playerWallet),
        mutation.playerClass
      )
    );
    accountInfo = await baseConnection.getAccountInfo(raidStatePda);
    state = decodeRaidStateAccount(accountInfo);
  }

  if (!state) {
    throw new Error("Room RaidState could not be initialized or decoded on devnet.");
  }

  if (state.lifecycle !== "active") {
    throw new Error(`Room RaidState is ${state.lifecycle}; create a new room code.`);
  }

  if (state.playerCount !== mutation.playerCount) {
    throw new Error(
      `Room RaidState player count is ${state.playerCount}, but room has ${mutation.playerCount}.`
    );
  }

  if (
    mutation.playerWallet &&
    state.players[mutation.playerIndex]?.wallet !== mutation.playerWallet
  ) {
    throw new Error("Room RaidState roster does not match the attacking player wallet.");
  }

  if (!delegationStatus?.isDelegated) {
    await sendBaseInstruction(
      baseConnection,
      authority,
      delegateRaidInstruction(authority.publicKey, raidStatePda, raidId)
    );
    delegationStatus = await waitForDelegation(routerConnection, raidStatePda, true);
  }

  if (!delegationStatus?.isDelegated) {
    throw new Error("Room RaidState did not delegate to MagicBlock.");
  }
}

async function sendBaseInstruction(
  connection: Connection,
  authority: Keypair,
  instruction: TransactionInstruction
) {
  const transaction = new Transaction().add(instruction);
  transaction.feePayer = authority.publicKey;
  await sendAndConfirmTransaction(connection, transaction, [authority], {
    commitment: "confirmed",
    skipPreflight: false
  });
}

async function waitForDelegation(
  routerConnection: ConnectionMagicRouter,
  raidStatePda: PublicKey,
  expected: boolean,
  attempts = 30
) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const status = await routerConnection.getDelegationStatus(raidStatePda);
    if (status?.isDelegated === expected) {
      return status;
    }
    await new Promise((resolveWait) => {
      setTimeout(resolveWait, 1_000);
    });
  }

  throw new Error(`Timed out waiting for room RaidState delegation ${expected}.`);
}

function delegateRaidInstruction(
  authority: PublicKey,
  raidStatePda: PublicKey,
  raidId: Uint8Array
) {
  return new TransactionInstruction({
    programId: RAID_SETTLEMENT_PROGRAM_ID,
    keys: [
      { pubkey: authority, isSigner: true, isWritable: true },
      {
        pubkey: delegateBufferPdaFromDelegatedAccountAndOwnerProgram(
          raidStatePda,
          RAID_SETTLEMENT_PROGRAM_ID
        ),
        isSigner: false,
        isWritable: true
      },
      {
        pubkey: delegationRecordPdaFromDelegatedAccount(raidStatePda),
        isSigner: false,
        isWritable: true
      },
      {
        pubkey: delegationMetadataPdaFromDelegatedAccount(raidStatePda),
        isSigner: false,
        isWritable: true
      },
      { pubkey: raidStatePda, isSigner: false, isWritable: true },
      { pubkey: RAID_SETTLEMENT_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: DELEGATION_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: new PublicKey(MAGICBLOCK_DEVNET.asiaValidator), isSigner: false, isWritable: false }
    ],
    data: Buffer.concat([DELEGATE_RAID_DISCRIMINATOR, Buffer.from(raidId)])
  });
}

function applyPlayerHitInstruction(
  authority: PublicKey,
  raidStatePda: PublicKey,
  mutation: CriticalCombatMutation
) {
  return new TransactionInstruction({
    programId: RAID_SETTLEMENT_PROGRAM_ID,
    keys: [
      { pubkey: raidStatePda, isSigner: false, isWritable: true },
      { pubkey: authority, isSigner: true, isWritable: false }
    ],
    data: Buffer.concat([
      APPLY_PLAYER_HIT_DISCRIMINATOR,
      Buffer.from([mutation.playerIndex]),
      u16le(mutation.damage),
      u16le(mutation.elapsedDeltaSeconds)
    ])
  });
}

function loadMagicBlockAuthority(): Keypair {
  const configured =
    process.env.MAGICRAID_MAGICBLOCK_KEYPAIR ??
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
      "MagicBlock authority keypair is missing. Set MAGICRAID_MAGICBLOCK_KEYPAIR or disable live authority."
    );
  }

  return Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(readFileSync(path, "utf8")) as number[])
  );
}

function u16le(value: number): Buffer {
  const buffer = Buffer.alloc(2);
  buffer.writeUInt16LE(Math.max(0, Math.min(65_535, Math.trunc(value))), 0);
  return buffer;
}

function expandHomePath(path: string) {
  if (path.startsWith("~/")) {
    return resolve(homedir(), path.slice(2));
  }

  return resolve(path);
}
