import { z } from "zod";
import { BossStrategySchema } from "@/lib/magicblock";

export const PlayerClassSchema = z.enum(["warrior", "ranger", "mage"]);

export const RaidStatusSchema = z.enum([
  "lobby",
  "active",
  "victory",
  "defeat",
  "timeout",
  "settled"
]);

export const RaidSummarySchema = z.object({
  raidId: z.string().min(1),
  status: RaidStatusSchema,
  playerCount: z.number().int().min(2).max(8),
  bossHp: z.number().int().min(0),
  strategy: BossStrategySchema,
  durationSeconds: z.number().int().min(0).max(180)
});

export type PlayerClass = z.infer<typeof PlayerClassSchema>;
export type RaidStatus = z.infer<typeof RaidStatusSchema>;
export type RaidSummary = z.infer<typeof RaidSummarySchema>;
