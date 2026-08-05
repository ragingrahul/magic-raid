import { Buffer } from "node:buffer";
import { PublicKey } from "@solana/web3.js";
import { describe, expect, it } from "vitest";
import {
  buildInitializeRaidInstruction,
  decodeRaidStateAccount
} from "@/lib/room-chain";
import {
  deriveRaidStatePda,
  raidIdBytesToHex,
  roomCodeToRaidId,
  RAID_SETTLEMENT_PROGRAM_ID
} from "@/lib/magicblock";

const RAID_STATE_DISCRIMINATOR = Buffer.from([165, 3, 135, 214, 253, 242, 9, 61]);
const INITIALIZE_RAID_DISCRIMINATOR = Buffer.from([65, 9, 122, 58, 90, 95, 56, 90]);
const RAID_STATE_BYTES = 346;
const authority = new PublicKey("11111111111111111111111111111112");
const playerOne = new PublicKey("11111111111111111111111111111113");
const playerTwo = new PublicKey("11111111111111111111111111111114");

describe("on-chain room roster codec", () => {
  it("encodes initialize_raid with first player wallet and class", () => {
    const raidId = roomCodeToRaidId("CHAIN1");
    const [raidStatePda] = deriveRaidStatePda(raidId);
    const instruction = buildInitializeRaidInstruction(
      authority,
      raidStatePda,
      raidId,
      playerOne,
      "mage"
    );

    expect(instruction.programId.equals(RAID_SETTLEMENT_PROGRAM_ID)).toBe(true);
    expect(instruction.keys[0].pubkey.equals(raidStatePda)).toBe(true);
    expect(instruction.data.subarray(0, 8).equals(INITIALIZE_RAID_DISCRIMINATOR)).toBe(true);
    expect(instruction.data.subarray(8, 24).equals(Buffer.from(raidId))).toBe(true);
    expect(instruction.data.subarray(24, 56).equals(playerOne.toBuffer())).toBe(true);
    expect(instruction.data[56]).toBe(2);
  });

  it("decodes the bounded RaidState roster fields", () => {
    const raidId = roomCodeToRaidId("CHAIN2");
    const data = Buffer.alloc(RAID_STATE_BYTES);
    let offset = 0;
    RAID_STATE_DISCRIMINATOR.copy(data, offset);
    offset += 8;
    Buffer.from(raidId).copy(data, offset);
    offset += 16;
    authority.toBuffer().copy(data, offset);
    offset += 32;
    data[offset++] = 0;
    data.writeUInt16LE(1_176, offset);
    offset += 2;
    data.writeUInt16LE(1_200, offset);
    offset += 2;
    data[offset++] = 2;
    data.writeUInt16LE(12, offset);
    offset += 2;
    data[offset++] = 1;
    data.writeUInt16LE(24, offset);
    offset += 2;
    data.writeUInt16LE(0, offset);
    offset += 14;
    playerOne.toBuffer().copy(data, offset);
    offset += 32;
    playerTwo.toBuffer().copy(data, offset);
    offset += 32 * 7;
    data[offset++] = 0;
    data[offset++] = 2;
    offset += 6;
    data[offset] = 251;

    const decoded = decodeRaidStateAccount({
      data,
      owner: RAID_SETTLEMENT_PROGRAM_ID
    } as never);

    expect(decoded?.raidIdHex).toBe(raidIdBytesToHex(raidId));
    expect(decoded?.playerCount).toBe(2);
    expect(decoded?.players).toEqual([
      {
        wallet: playerOne.toBase58(),
        class: "warrior",
        contributionDamage: 24
      },
      {
        wallet: playerTwo.toBase58(),
        class: "mage",
        contributionDamage: 0
      }
    ]);
  });
});
