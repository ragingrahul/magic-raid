import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { SystemProgram } from "@solana/web3.js";
import {
  deriveRaidStatePda,
  deriveSettlementRecordPda,
  RAID_SETTLEMENT_PROGRAM_ID,
  SETTLEMENT_RECORD_SEED
} from "@/lib/magicblock";
import {
  buildSettleRaidInstruction,
  encodeSettleRaidData,
  SETTLE_RAID_DISCRIMINATOR
} from "@/lib/settlement";
import { type SettlementSummary } from "@/game/schemas";

const authority = "11111111111111111111111111111112";

const settlementSummary: SettlementSummary = {
  raidId: "raid-settlement",
  authority,
  result: "victory",
  durationSeconds: 95,
  bossFinalHp: 0,
  contributions: [
    {
      playerId: "player-1",
      wallet: authority,
      class: "warrior",
      damage: 120,
      support: 40,
      survival: 300,
      objective: 500,
      total: 960
    }
  ]
};

describe("SOL-003 settlement transaction builder", () => {
  it("encodes the settle_raid instruction discriminator and bounded scores", () => {
    const expectedDiscriminator = createHash("sha256")
      .update("global:settle_raid")
      .digest()
      .subarray(0, 8);
    const encoded = encodeSettleRaidData(settlementSummary);

    expect(SETTLE_RAID_DISCRIMINATOR.equals(expectedDiscriminator)).toBe(true);
    expect(encoded.subarray(0, 8).equals(expectedDiscriminator)).toBe(true);
    expect(encoded[8]).toBe(0);
    expect(encoded.readUInt16LE(9)).toBe(95);
    expect(encoded.readUInt16LE(11)).toBe(0);
    expect(encoded.readUInt32LE(13)).toBe(1);
  });

  it("builds the expected Anchor account list", () => {
    const [raidStatePda] = deriveRaidStatePda();
    const [settlementRecordPda] = deriveSettlementRecordPda(raidStatePda);
    const instruction = buildSettleRaidInstruction(settlementSummary);

    expect(SETTLEMENT_RECORD_SEED).toBe("settlement-record");
    expect(instruction.programId.equals(RAID_SETTLEMENT_PROGRAM_ID)).toBe(true);
    expect(instruction.keys[0].pubkey.equals(raidStatePda)).toBe(true);
    expect(instruction.keys[0].isSigner).toBe(false);
    expect(instruction.keys[0].isWritable).toBe(true);
    expect(instruction.keys[1].pubkey.equals(settlementRecordPda)).toBe(true);
    expect(instruction.keys[1].isSigner).toBe(false);
    expect(instruction.keys[1].isWritable).toBe(true);
    expect(instruction.keys[2].isSigner).toBe(true);
    expect(instruction.keys[3].pubkey.equals(SystemProgram.programId)).toBe(true);
  });
});
