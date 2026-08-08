import { Buffer } from "node:buffer";
import {
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction
} from "@solana/web3.js";
import {
  SettlementSummarySchema,
  type RaidResult,
  type SettlementContribution,
  type SettlementSummary
} from "@/game/schemas";
import {
  deriveRaidStatePda,
  deriveSettlementRecordPda,
  raidIdHexToBytes,
  RAID_SETTLEMENT_PROGRAM_ID
} from "@/lib/magicblock";

export const SETTLE_RAID_DISCRIMINATOR = Buffer.from([
  29, 86, 124, 165, 207, 146, 238, 155
]);

export const RAID_RESULT_INDEX: Record<RaidResult, number> = {
  victory: 0,
  defeat: 1,
  timeout: 2
};

export function buildSettleRaidInstruction(
  rawSummary: SettlementSummary,
  authority = new PublicKey(rawSummary.authority),
  options: {
    raidIdHex?: string;
  } = {}
): TransactionInstruction {
  const summary = SettlementSummarySchema.parse(rawSummary);
  const [raidStatePda] = options.raidIdHex
    ? deriveRaidStatePda(raidIdHexToBytes(options.raidIdHex))
    : deriveRaidStatePda();
  const [settlementRecordPda] = deriveSettlementRecordPda(raidStatePda);

  return new TransactionInstruction({
    programId: RAID_SETTLEMENT_PROGRAM_ID,
    keys: [
      { pubkey: raidStatePda, isSigner: false, isWritable: true },
      { pubkey: settlementRecordPda, isSigner: false, isWritable: true },
      { pubkey: authority, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }
    ],
    data: encodeSettleRaidData(summary)
  });
}

export function buildSettleRaidTransaction(
  summary: SettlementSummary,
  authority: PublicKey,
  options: {
    raidIdHex?: string;
  } = {}
): Transaction {
  const transaction = new Transaction().add(
    buildSettleRaidInstruction(summary, authority, options)
  );
  transaction.feePayer = authority;
  return transaction;
}

export function settlementExplorerUrl(signature: string) {
  return `https://explorer.solana.com/tx/${signature}?cluster=devnet`;
}

export function encodeSettleRaidData(rawSummary: SettlementSummary): Buffer {
  const summary = SettlementSummarySchema.parse(rawSummary);
  return Buffer.concat([
    SETTLE_RAID_DISCRIMINATOR,
    Buffer.from([RAID_RESULT_INDEX[summary.result]]),
    u16le(summary.durationSeconds),
    u16le(summary.bossFinalHp),
    u32le(summary.contributions.length),
    ...summary.contributions.map(encodeContribution)
  ]);
}

function encodeContribution(contribution: SettlementContribution): Buffer {
  return Buffer.concat([
    new PublicKey(contribution.wallet).toBuffer(),
    u16le(contribution.damage),
    u16le(contribution.support),
    u16le(contribution.survival),
    u16le(contribution.objective)
  ]);
}

function u16le(value: number): Buffer {
  const buffer = Buffer.alloc(2);
  buffer.writeUInt16LE(value, 0);
  return buffer;
}

function u32le(value: number): Buffer {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32LE(value, 0);
  return buffer;
}
