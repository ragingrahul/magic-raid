import { describe, expect, it } from "vitest";
import { BOSS_STRATEGIES, MAGICBLOCK_DEVNET } from "@/lib/magicblock";
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
    expect(MAGICBLOCK_DEVNET.asiaValidator).toBe(
      "MAS1Dt9qreoRMQ14YQuhg8UTZMMzDdKhmkZMECCzk57"
    );
    expect(BOSS_STRATEGIES).toContain("magic_resistance");
  });
});
