import { z } from "zod";

export const MAGICBLOCK_DEVNET = {
  routerRpc: "https://devnet-router.magicblock.app",
  routerWs: "wss://devnet-router.magicblock.app/",
  erAsiaRpc: "https://devnet-as.magicblock.app",
  erAsiaWs: "wss://devnet-as.magicblock.app/",
  asiaValidator: "MAS1Dt9qreoRMQ14YQuhg8UTZMMzDdKhmkZMECCzk57",
  delegationProgram: "DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh"
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
