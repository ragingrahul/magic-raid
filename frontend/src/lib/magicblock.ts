import { PublicKey } from "@solana/web3.js";
import {
  BossStrategySchema,
  GAME_LIMITS,
  type BossStrategy
} from "@/game/schemas";

export const MAGICBLOCK_DEVNET = {
  routerRpc: "https://devnet-router.magicblock.app",
  routerWs: "wss://devnet-router.magicblock.app/",
  solanaDevnetRpc: "https://api.devnet.solana.com",
  erAsiaRpc: "https://devnet-as.magicblock.app",
  erAsiaWs: "wss://devnet-as.magicblock.app/",
  asiaValidator: "MAS1Dt9qreoRMQ14YQuhg8UTZMMzDdKhmkZMECCzk57",
  delegationProgram: "DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh"
} as const;

export const RAID_SETTLEMENT_PROGRAM_ID = new PublicKey(
  "2644KGiENvPpHYbktoMUz2y6TWeQsxz8MpcRhmrakW72"
);
export const RAID_STATE_SEED = "raid-state";
export const SETTLEMENT_RECORD_SEED = "settlement-record";
export const DEFAULT_RAID_ID_BYTES = new TextEncoder().encode("magicraid:DEMO00");

export const RAID_STATE_RULES = {
  bossMaxHp: GAME_LIMITS.boss.maxHp,
  maxHitDamage: GAME_LIMITS.attacks.maxHitDamage,
  durationSeconds: GAME_LIMITS.raid.durationSeconds,
  maxPlayers: GAME_LIMITS.players.max
} as const;

export const BOSS_STRATEGIES = BossStrategySchema.options;

export { BossStrategySchema, type BossStrategy };

export function deriveRaidStatePda(
  raidIdOrProgramId: Uint8Array | string | PublicKey = DEFAULT_RAID_ID_BYTES,
  programId: PublicKey = RAID_SETTLEMENT_PROGRAM_ID
): [PublicKey, number] {
  const raidId =
    raidIdOrProgramId instanceof PublicKey
      ? DEFAULT_RAID_ID_BYTES
      : normalizeRaidIdBytes(raidIdOrProgramId);
  const resolvedProgramId =
    raidIdOrProgramId instanceof PublicKey ? raidIdOrProgramId : programId;

  return PublicKey.findProgramAddressSync(
    [new TextEncoder().encode(RAID_STATE_SEED), raidId],
    resolvedProgramId
  );
}

export function deriveSettlementRecordPda(
  raidStatePda = deriveRaidStatePda(DEFAULT_RAID_ID_BYTES)[0],
  programId: PublicKey = RAID_SETTLEMENT_PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [new TextEncoder().encode(SETTLEMENT_RECORD_SEED), raidStatePda.toBuffer()],
    programId
  );
}

export function roomCodeToRaidId(roomCode: string): Uint8Array {
  const normalized = roomCode.trim().toUpperCase().slice(0, 6).padEnd(6, "0");
  return normalizeRaidIdBytes(`magicraid:${normalized}`);
}

export function appRaidIdToRoomCode(raidId: string): string | undefined {
  const match = /^raid-([A-Z0-9]{4,8})$/.exec(raidId.trim().toUpperCase());
  return match?.[1];
}

export function raidIdBytesToHex(raidId: Uint8Array): string {
  return Array.from(normalizeRaidIdBytes(raidId), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}

export function raidIdHexToBytes(hex: string): Uint8Array {
  if (!/^[0-9a-fA-F]{32}$/.test(hex)) {
    throw new Error("Raid id hex must be 16 bytes.");
  }

  return Uint8Array.from(hex.match(/../g)?.map((byte) => Number.parseInt(byte, 16)) ?? []);
}

export function normalizeRaidIdBytes(raidId: Uint8Array | string): Uint8Array {
  const bytes = typeof raidId === "string" ? new TextEncoder().encode(raidId) : raidId;
  if (bytes.length !== 16) {
    throw new Error("Raid id must be exactly 16 bytes.");
  }

  return bytes;
}
