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
const RAID_STATE_DISCRIMINATOR = Buffer.from([165, 3, 135, 214, 253, 242, 9, 61]);

const DISCRIMINATORS = {
  initializeRaid: Buffer.from([65, 9, 122, 58, 90, 95, 56, 90]),
  delegateRaid: Buffer.from([174, 195, 73, 226, 108, 195, 141, 39]),
  applyPlayerHit: Buffer.from([84, 105, 136, 224, 243, 30, 205, 71]),
  commitAndUndelegateRaid: Buffer.from([210, 80, 139, 197, 32, 249, 30, 199])
};

const [raidStatePda, raidStateBump] = PublicKey.findProgramAddressSync(
  [new TextEncoder().encode(RAID_STATE_SEED)],
  RAID_SETTLEMENT_PROGRAM_ID
);
const asiaValidator = new PublicKey(MAGICBLOCK_DEVNET.asiaValidator);
const baseConnection = new Connection(MAGICBLOCK_DEVNET.solanaDevnetRpc, "confirmed");
const routerConnection = new ConnectionMagicRouter(MAGICBLOCK_DEVNET.routerRpc, "confirmed");

function keypairPath() {
  const configuredPath = process.env.SOLANA_KEYPAIR ?? "~/.config/solana/id.json";
  if (configuredPath.startsWith("~/")) {
    return resolve(homedir(), configuredPath.slice(2));
  }
  return resolve(configuredPath);
}

function loadAuthority() {
  const path = keypairPath();
  if (!existsSync(path)) {
    throw new Error(`Missing keypair at ${path}. Set SOLANA_KEYPAIR to a funded devnet keypair.`);
  }

  const secret = JSON.parse(readFileSync(path, "utf8"));
  return Keypair.fromSecretKey(Uint8Array.from(secret));
}

function u16le(value) {
  const buffer = Buffer.alloc(2);
  buffer.writeUInt16LE(value, 0);
  return buffer;
}

function initializeRaidInstruction(authority, raidId, playerCount) {
  return new TransactionInstruction({
    programId: RAID_SETTLEMENT_PROGRAM_ID,
    keys: [
      { pubkey: raidStatePda, isSigner: false, isWritable: true },
      { pubkey: authority, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }
    ],
    data: Buffer.concat([DISCRIMINATORS.initializeRaid, raidId, Buffer.from([playerCount])])
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
    data: DISCRIMINATORS.delegateRaid
  });
}

function applyPlayerHitInstruction(authority) {
  return new TransactionInstruction({
    programId: RAID_SETTLEMENT_PROGRAM_ID,
    keys: [
      { pubkey: raidStatePda, isSigner: false, isWritable: true },
      { pubkey: authority, isSigner: true, isWritable: false }
    ],
    data: Buffer.concat([
      DISCRIMINATORS.applyPlayerHit,
      Buffer.from([0]),
      u16le(1),
      u16le(0)
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
  if (data.length < 82 || !data.subarray(0, 8).equals(RAID_STATE_DISCRIMINATOR)) {
    return { raw: true, owner: accountInfo.owner.toBase58(), dataLength: data.length };
  }

  let offset = 8;
  const raidId = data.subarray(offset, offset + 16).toString("hex");
  offset += 16;
  const authority = new PublicKey(data.subarray(offset, offset + 32)).toBase58();
  offset += 32;
  const lifecycle = ["active", "victory", "timeout"][data[offset++]] ?? "unknown";
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
  const bump = data[offset];

  return {
    owner: accountInfo.owner.toBase58(),
    raidId,
    authority,
    lifecycle,
    bossHp,
    bossMaxHp,
    playerCount,
    elapsedSeconds,
    strategy,
    contributionDamage,
    bump
  };
}

async function sleep(ms) {
  await new Promise((resolveSleep) => {
    setTimeout(resolveSleep, ms);
  });
}

async function waitForDelegation(expected, attempts = 30) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const status = await routerConnection.getDelegationStatus(raidStatePda);
    if (status?.isDelegated === expected) {
      return { attempt, status };
    }
    await sleep(1000);
  }
  throw new Error(`Timed out waiting for isDelegated:${expected}`);
}

async function main() {
  const authority = loadAuthority();
  const result = {
    programId: RAID_SETTLEMENT_PROGRAM_ID.toBase58(),
    raidStatePda: raidStatePda.toBase58(),
    raidStateBump,
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

    const initialDelegationStatus = await routerConnection.getDelegationStatus(raidStatePda);
    result.steps.push({ label: "initialDelegationStatus", ok: true, value: initialDelegationStatus });

    const initialBaseAccount = await baseConnection.getAccountInfo(raidStatePda);
    if (!initialBaseAccount && !initialDelegationStatus?.isDelegated) {
      const initialize = await sendBaseInstruction(
        "initializeRaid",
        authority,
        initializeRaidInstruction(authority.publicKey, randomBytes(16), 4)
      );
      result.steps.push({ ...initialize, ok: true });
    } else {
      result.steps.push({
        label: "initializeRaid",
        ok: true,
        skipped: true,
        reason: "RaidState PDA already exists or is delegated"
      });
    }

    let delegationStatus = await routerConnection.getDelegationStatus(raidStatePda);
    if (!delegationStatus?.isDelegated) {
      const delegate = await sendBaseInstruction(
        "delegateRaid",
        authority,
        delegateRaidInstruction(authority.publicKey)
      );
      result.steps.push({ ...delegate, ok: true });
      const delegated = await waitForDelegation(true);
      result.steps.push({ label: "delegated", ok: true, value: delegated.status });
    } else {
      result.steps.push({ label: "delegateRaid", ok: true, skipped: true });
    }

    const stateBeforeHit = decodeRaidState(await routerConnection.getAccountInfo(raidStatePda));
    result.steps.push({ label: "stateBeforeHit", ok: true, value: stateBeforeHit });

    if (stateBeforeHit && "lifecycle" in stateBeforeHit && stateBeforeHit.lifecycle !== "active") {
      throw new Error(`RaidState is terminal (${stateBeforeHit.lifecycle}); cannot apply live hit.`);
    }

    const hit = await sendRouterInstruction(
      "applyPlayerHit",
      authority,
      applyPlayerHitInstruction(authority.publicKey)
    );
    result.steps.push({ ...hit, ok: true });

    const stateAfterHit = decodeRaidState(await routerConnection.getAccountInfo(raidStatePda));
    result.steps.push({ label: "stateAfterHit", ok: true, value: stateAfterHit });

    const commit = await sendRouterInstruction(
      "commitAndUndelegateRaid",
      authority,
      commitAndUndelegateRaidInstruction(authority.publicKey)
    );
    result.steps.push({ ...commit, ok: true });

    const undelegated = await waitForDelegation(false, 45);
    result.steps.push({ label: "undelegated", ok: true, value: undelegated.status });

    const finalState = decodeRaidState(await baseConnection.getAccountInfo(raidStatePda));
    result.steps.push({ label: "finalDevnetState", ok: true, value: finalState });

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
