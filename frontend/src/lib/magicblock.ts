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

export const RAID_STATE_RULES = {
  bossMaxHp: GAME_LIMITS.boss.maxHp,
  maxHitDamage: GAME_LIMITS.attacks.maxHitDamage,
  durationSeconds: GAME_LIMITS.raid.durationSeconds,
  maxPlayers: GAME_LIMITS.players.max
} as const;

export const BOSS_STRATEGIES = BossStrategySchema.options;

export { BossStrategySchema, type BossStrategy };

export function deriveRaidStatePda(
  programId: PublicKey = RAID_SETTLEMENT_PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [new TextEncoder().encode(RAID_STATE_SEED)],
    programId
  );
}
