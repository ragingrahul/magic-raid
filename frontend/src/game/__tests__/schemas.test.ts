import { describe, expect, it } from "vitest";
import {
  BOSS_STRATEGIES,
  deriveRaidStatePda,
  MAGICBLOCK_DEVNET,
  RAID_SETTLEMENT_PROGRAM_ID,
  RAID_STATE_RULES,
  RAID_STATE_SEED
} from "@/lib/magicblock";
import { RaidSummarySchema } from "@/game/schemas";

describe("frontend scaffold schemas", () => {
  it("validates the minimal raid summary contract", () => {
    const summary = RaidSummarySchema.parse({
      raidId: "raid-demo",
      status: "active",
      playerCount: 4,
      bossHp: 1200,
      strategy: "area_denial",
      durationSeconds: 45
    });

    expect(summary.playerCount).toBe(4);
  });

  it("rejects unsupported boss strategies", () => {
    expect(() =>
      RaidSummarySchema.parse({
        raidId: "raid-demo",
        status: "active",
        playerCount: 4,
        bossHp: 1200,
        strategy: "rewrite_damage_values",
        durationSeconds: 45
      })
    ).toThrow();
  });

  it("pins MagicBlock devnet constants for APP-001", () => {
    expect(MAGICBLOCK_DEVNET.routerRpc).toBe("https://devnet-router.magicblock.app");
    expect(MAGICBLOCK_DEVNET.solanaDevnetRpc).toBe("https://api.devnet.solana.com");
    expect(MAGICBLOCK_DEVNET.asiaValidator).toBe(
      "MAS1Dt9qreoRMQ14YQuhg8UTZMMzDdKhmkZMECCzk57"
    );
    expect(BOSS_STRATEGIES).toContain("magic_resistance");
  });

  it("derives the compact RaidState PDA used by the MagicBlock spike", () => {
    const [raidStatePda, bump] = deriveRaidStatePda();
    const [secondDerivation] = deriveRaidStatePda(RAID_SETTLEMENT_PROGRAM_ID);

    expect(RAID_STATE_SEED).toBe("raid-state");
    expect(RAID_STATE_RULES).toMatchObject({
      bossMaxHp: 1200,
      durationSeconds: 180,
      maxHitDamage: 250,
      maxPlayers: 8
    });
    expect(raidStatePda.toBase58()).toBe(secondDerivation.toBase58());
    expect(raidStatePda.toBase58()).not.toBe(RAID_SETTLEMENT_PROGRAM_ID.toBase58());
    expect(bump).toBeGreaterThanOrEqual(0);
    expect(bump).toBeLessThanOrEqual(255);
  });
});
