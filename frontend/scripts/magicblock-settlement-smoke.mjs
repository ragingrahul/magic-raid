#!/usr/bin/env node
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction
} from "@solana/web3.js";
import {
  ConnectionMagicRouter,
  DELEGATION_PROGRAM_ID,
  MAGIC_CONTEXT_ID,
  MAGIC_PROGRAM_ID,
  delegateBufferPdaFromDelegatedAccountAndOwnerProgram,
  delegationMetadataPdaFromDelegatedAccount,
  delegationRecordPdaFromDelegatedAccount
} from "@magicblock-labs/ephemeral-rollups-sdk";

const MAGICBLOCK_DEVNET = {
  routerRpc: "https://devnet-router.magicblock.app",
  solanaDevnetRpc: "https://api.devnet.solana.com",
  asiaValidator: "MAS1Dt9qreoRMQ14YQuhg8UTZMMzDdKhmkZMECCzk57"
};

const RAID_SETTLEMENT_PROGRAM_ID = new PublicKey(
  "2644KGiENvPpHYbktoMUz2y6TWeQsxz8MpcRhmrakW72"
);
const RAID_STATE_SEED = "raid-state";
const SETTLEMENT_RECORD_SEED = "settlement-record";
const RAID_BOSS_MAX_HP = 1_200;
const MAX_HIT_DAMAGE = 250;
const PLAYER_COUNT = 1;

const RAID_STATE_DISCRIMINATOR = Buffer.from([165, 3, 135, 214, 253, 242, 9, 61]);
const RAID_STATE_MIN_BYTES = 346;
const SETTLEMENT_RECORD_DISCRIMINATOR = Buffer.from([
  172, 159, 67, 74, 96, 85, 37, 205
]);

const DISCRIMINATORS = {
  initializeRaid: Buffer.from([65, 9, 122, 58, 90, 95, 56, 90]),
  delegateRaid: Buffer.from([174, 195, 73, 226, 108, 195, 141, 39]),
  applyPlayerHit: Buffer.from([84, 105, 136, 224, 243, 30, 205, 71]),
  commitAndUndelegateRaid: Buffer.from([210, 80, 139, 197, 32, 249, 30, 199]),
  settleRaid: Buffer.from([29, 86, 124, 165, 207, 146, 238, 155])
};

const raidId = randomBytes(16);
const [raidStatePda, raidStateBump] = PublicKey.findProgramAddressSync(
  [new TextEncoder().encode(RAID_STATE_SEED), raidId],
  RAID_SETTLEMENT_PROGRAM_ID
);
const [settlementRecordPda, settlementRecordBump] = PublicKey.findProgramAddressSync(
  [new TextEncoder().encode(SETTLEMENT_RECORD_SEED), raidStatePda.toBuffer()],
  RAID_SETTLEMENT_PROGRAM_ID
);
const asiaValidator = new PublicKey(MAGICBLOCK_DEVNET.asiaValidator);
const baseConnection = new Connection(MAGICBLOCK_DEVNET.solanaDevnetRpc, "confirmed");
const routerConnection = new ConnectionMagicRouter(MAGICBLOCK_DEVNET.routerRpc, "confirmed");

function configuredKeypairSource() {
  return (
    process.env.MAGICRAID_MAGICBLOCK_KEYPAIR ??
    process.env.MAGICRAID_SETTLEMENT_KEYPAIR ??
    process.env.SOLANA_KEYPAIR ??
    "~/.config/solana/id.json"
  );
}

function resolveKeypairPath(source) {
  if (source.startsWith("~/")) {
    return resolve(homedir(), source.slice(2));
  }
  return resolve(source);
}

function loadAuthority() {
  const source = configuredKeypairSource();
  if (source.trim().startsWith("[")) {
    return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(source)));
  }

  const path = resolveKeypairPath(source);
  if (!existsSync(path)) {
    throw new Error(`Missing keypair at ${path}. Set MAGICRAID_MAGICBLOCK_KEYPAIR to a funded devnet keypair.`);
  }

  const secret = JSON.parse(readFileSync(path, "utf8"));
  return Keypair.fromSecretKey(Uint8Array.from(secret));
}

function u16le(value) {
  const buffer = Buffer.alloc(2);
  buffer.writeUInt16LE(value, 0);
  return buffer;
}

function u32le(value) {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32LE(value, 0);
  return buffer;
}

function initializeRaidInstruction(authority) {
  return new TransactionInstruction({
    programId: RAID_SETTLEMENT_PROGRAM_ID,
    keys: [
      { pubkey: raidStatePda, isSigner: false, isWritable: true },
      { pubkey: authority, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }
    ],
    data: Buffer.concat([
      DISCRIMINATORS.initializeRaid,
      raidId,
      authority.toBuffer(),
      Buffer.from([0])
    ])
  });
}

function delegateRaidInstruction(authority) {
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
      { pubkey: asiaValidator, isSigner: false, isWritable: false }
    ],
    data: Buffer.concat([DISCRIMINATORS.delegateRaid, raidId])
  });
}

function applyPlayerHitInstruction(authority, damage, elapsedDeltaSeconds) {
  return new TransactionInstruction({
    programId: RAID_SETTLEMENT_PROGRAM_ID,
    keys: [
      { pubkey: raidStatePda, isSigner: false, isWritable: true },
      { pubkey: authority, isSigner: true, isWritable: false }
    ],
    data: Buffer.concat([
      DISCRIMINATORS.applyPlayerHit,
      Buffer.from([0]),
      u16le(damage),
      u16le(elapsedDeltaSeconds)
    ])
  });
}

function commitAndUndelegateRaidInstruction(authority) {
  return new TransactionInstruction({
    programId: RAID_SETTLEMENT_PROGRAM_ID,
    keys: [
      { pubkey: raidStatePda, isSigner: false, isWritable: true },
      { pubkey: authority, isSigner: true, isWritable: true },
      { pubkey: MAGIC_CONTEXT_ID, isSigner: false, isWritable: true },
      { pubkey: MAGIC_PROGRAM_ID, isSigner: false, isWritable: false }
    ],
    data: DISCRIMINATORS.commitAndUndelegateRaid
  });
}

function settleRaidInstruction(authority, finalState) {
  return new TransactionInstruction({
    programId: RAID_SETTLEMENT_PROGRAM_ID,
    keys: [
      { pubkey: raidStatePda, isSigner: false, isWritable: true },
      { pubkey: settlementRecordPda, isSigner: false, isWritable: true },
      { pubkey: authority, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }
    ],
    data: Buffer.concat([
      DISCRIMINATORS.settleRaid,
      Buffer.from([0]),
      u16le(finalState.elapsedSeconds),
      u16le(finalState.bossHp),
      u32le(PLAYER_COUNT),
      authority.toBuffer(),
      u16le(finalState.contributionDamage[0]),
      u16le(0),
      u16le(1_000),
      u16le(1_000)
    ])
  });
}

async function sendBaseInstruction(label, authority, instruction) {
  const transaction = new Transaction().add(instruction);
  transaction.feePayer = authority.publicKey;
  const signature = await sendAndConfirmTransaction(baseConnection, transaction, [authority], {
    commitment: "confirmed",
    skipPreflight: false
  });
  return { label, signature };
}

async function sendRouterInstruction(label, authority, instruction) {
  const transaction = new Transaction().add(instruction);
  transaction.feePayer = authority.publicKey;
  const signature = await routerConnection.sendAndConfirmTransaction(transaction, [authority], {
    commitment: "confirmed",
    skipPreflight: false
  });
  return { label, signature };
}

function decodeRaidState(accountInfo) {
  if (!accountInfo) {
    return null;
  }
  const data = accountInfo.data;
  if (data.length < RAID_STATE_MIN_BYTES || !data.subarray(0, 8).equals(RAID_STATE_DISCRIMINATOR)) {
    return { raw: true, owner: accountInfo.owner.toBase58(), dataLength: data.length };
  }

  let offset = 8;
  const decodedRaidId = data.subarray(offset, offset + 16).toString("hex");
  offset += 16;
  const authority = new PublicKey(data.subarray(offset, offset + 32)).toBase58();
  offset += 32;
  const lifecycle = ["active", "victory", "timeout", "defeat"][data[offset++]] ?? "unknown";
  const bossHp = data.readUInt16LE(offset);
  offset += 2;
  const bossMaxHp = data.readUInt16LE(offset);
  offset += 2;
  const playerCount = data[offset++];
  const elapsedSeconds = data.readUInt16LE(offset);
  offset += 2;
  const strategy = [
    "area_denial",
    "leap_to_ranged",
    "magic_resistance",
    "focus_healer",
    "melee_retaliation"
  ][data[offset++]] ?? "unknown";
  const contributionDamage = [];
  for (let i = 0; i < 8; i += 1) {
    contributionDamage.push(data.readUInt16LE(offset));
    offset += 2;
  }

  const playerWallets = [];
  for (let i = 0; i < 8; i += 1) {
    playerWallets.push(new PublicKey(data.subarray(offset, offset + 32)).toBase58());
    offset += 32;
  }

  const playerClasses = [];
  for (let i = 0; i < 8; i += 1) {
    playerClasses.push(["warrior", "ranger", "mage"][data[offset++]] ?? "unknown");
  }
  const bump = data[offset];

  return {
    owner: accountInfo.owner.toBase58(),
    raidId: decodedRaidId,
    authority,
    lifecycle,
    bossHp,
    bossMaxHp,
    playerCount,
    elapsedSeconds,
    strategy,
    contributionDamage,
    playerWallets: playerWallets.slice(0, playerCount),
    playerClasses: playerClasses.slice(0, playerCount),
    bump
  };
}

function decodeSettlementRecord(accountInfo) {
  if (!accountInfo) {
    return null;
  }
  const data = accountInfo.data;
  if (!data.subarray(0, 8).equals(SETTLEMENT_RECORD_DISCRIMINATOR)) {
    return { raw: true, owner: accountInfo.owner.toBase58(), dataLength: data.length };
  }

  let offset = 8;
  const decodedRaidId = data.subarray(offset, offset + 16).toString("hex");
  offset += 16;
  const authority = new PublicKey(data.subarray(offset, offset + 32)).toBase58();
  offset += 32;
  const result = ["victory", "defeat", "timeout"][data[offset++]] ?? "unknown";
  const durationSeconds = data.readUInt16LE(offset);
  offset += 2;
  const bossFinalHp = data.readUInt16LE(offset);
  offset += 2;
  const playerCount = data[offset++];
  const settledSlot = data.readBigUInt64LE(offset).toString();
  offset += 8;
  const settled = data[offset++] === 1;
  const bump = data[offset++];
  const contributionCount = data.readUInt32LE(offset);
  offset += 4;
  const contributions = [];
  for (let i = 0; i < contributionCount; i += 1) {
    const player = new PublicKey(data.subarray(offset, offset + 32)).toBase58();
    offset += 32;
    const damage = data.readUInt16LE(offset);
    offset += 2;
    const support = data.readUInt16LE(offset);
    offset += 2;
    const survival = data.readUInt16LE(offset);
    offset += 2;
    const objective = data.readUInt16LE(offset);
    offset += 2;
    contributions.push({ player, damage, support, survival, objective });
  }

  return {
    owner: accountInfo.owner.toBase58(),
    raidId: decodedRaidId,
    authority,
    result,
    durationSeconds,
    bossFinalHp,
    playerCount,
    settledSlot,
    settled,
    bump,
    contributions
  };
}

async function sleep(ms) {
  await new Promise((resolveSleep) => {
    setTimeout(resolveSleep, ms);
  });
}

async function waitForDelegation(expected, attempts = 45) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const status = await routerConnection.getDelegationStatus(raidStatePda);
    if (status?.isDelegated === expected) {
      return { attempt, status };
    }
    await sleep(1_000);
  }
  throw new Error(`Timed out waiting for isDelegated:${expected}`);
}

async function main() {
  const authority = loadAuthority();
  const result = {
    programId: RAID_SETTLEMENT_PROGRAM_ID.toBase58(),
    raidId: raidId.toString("hex"),
    raidStatePda: raidStatePda.toBase58(),
    raidStateBump,
    settlementRecordPda: settlementRecordPda.toBase58(),
    settlementRecordBump,
    authority: authority.publicKey.toBase58(),
    expectedAsiaValidator: asiaValidator.toBase58(),
    steps: []
  };

  try {
    const programAccount = await baseConnection.getAccountInfo(RAID_SETTLEMENT_PROGRAM_ID);
    if (!programAccount?.executable) {
      throw new Error("Settlement program is not deployed/executable on Solana devnet.");
    }
    result.steps.push({ label: "programDeployed", ok: true });

    const initialize = await sendBaseInstruction(
      "initializeRaid",
      authority,
      initializeRaidInstruction(authority.publicKey)
    );
    result.steps.push({ ...initialize, ok: true });

    const delegate = await sendBaseInstruction(
      "delegateRaid",
      authority,
      delegateRaidInstruction(authority.publicKey)
    );
    result.steps.push({ ...delegate, ok: true });
    const delegated = await waitForDelegation(true);
    result.steps.push({ label: "delegated", ok: true, value: delegated.status });

    let state = decodeRaidState(await routerConnection.getAccountInfo(raidStatePda));
    result.steps.push({ label: "stateBeforeHits", ok: true, value: state });

    for (let hitIndex = 1; hitIndex <= Math.ceil(RAID_BOSS_MAX_HP / MAX_HIT_DAMAGE); hitIndex += 1) {
      if (!state || state.lifecycle !== "active") {
        break;
      }
      const hit = await sendRouterInstruction(
        `applyPlayerHit${hitIndex}`,
        authority,
        applyPlayerHitInstruction(authority.publicKey, MAX_HIT_DAMAGE, 1)
      );
      state = decodeRaidState(await routerConnection.getAccountInfo(raidStatePda));
      result.steps.push({ ...hit, ok: true, value: state });
    }

    if (!state || state.lifecycle !== "victory" || state.bossHp !== 0) {
      throw new Error("Live MagicBlock hits did not produce a terminal victory RaidState.");
    }

    const commit = await sendRouterInstruction(
      "commitAndUndelegateRaid",
      authority,
      commitAndUndelegateRaidInstruction(authority.publicKey)
    );
    result.steps.push({ ...commit, ok: true });

    const undelegated = await waitForDelegation(false);
    result.steps.push({ label: "undelegated", ok: true, value: undelegated.status });

    const finalState = decodeRaidState(await baseConnection.getAccountInfo(raidStatePda));
    result.steps.push({ label: "finalDevnetState", ok: true, value: finalState });
    if (
      !finalState ||
      finalState.lifecycle !== "victory" ||
      finalState.bossHp !== 0 ||
      finalState.contributionDamage[0] !== RAID_BOSS_MAX_HP
    ) {
      throw new Error("Base devnet RaidState readback does not match the MagicBlock victory.");
    }

    const settle = await sendBaseInstruction(
      "settleRaid",
      authority,
      settleRaidInstruction(authority.publicKey, finalState)
    );
    result.steps.push({ ...settle, ok: true });

    const settlementRecord = decodeSettlementRecord(
      await baseConnection.getAccountInfo(settlementRecordPda)
    );
    result.steps.push({ label: "settlementRecord", ok: true, value: settlementRecord });
    if (
      !settlementRecord ||
      settlementRecord.result !== "victory" ||
      !settlementRecord.settled ||
      settlementRecord.contributions[0]?.damage !== RAID_BOSS_MAX_HP
    ) {
      throw new Error("Settlement record readback does not match the committed victory.");
    }

    console.log(JSON.stringify({ ok: true, ...result }, null, 2));
  } catch (error) {
    console.error(
      JSON.stringify(
        {
          ok: false,
          ...result,
          blocker: error instanceof Error ? error.message : String(error)
        },
        null,
        2
      )
    );
    process.exitCode = 1;
  }
}

await main();
