import { PublicKey } from "@solana/web3.js";
import { z } from "zod";

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
  bossMaxHp: 1200,
  maxHitDamage: 250,
  durationSeconds: 180,
  maxPlayers: 8
} as const;

export const BossStrategySchema = z.enum([
  "area_denial",
  "leap_to_ranged",
  "magic_resistance",
  "focus_healer",
  "melee_retaliation"
]);

export const BOSS_STRATEGIES = BossStrategySchema.options;

export type BossStrategy = z.infer<typeof BossStrategySchema>;

export function deriveRaidStatePda(
  programId: PublicKey = RAID_SETTLEMENT_PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [new TextEncoder().encode(RAID_STATE_SEED)],
    programId
  );
}
