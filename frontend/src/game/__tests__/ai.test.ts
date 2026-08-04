import { describe, expect, it } from "vitest";
import {
  buildOpenAiStrategyRequest,
  chooseFallbackStrategy,
  createFallbackStrategyDecision,
  extractResponseText,
  selectBossStrategyDecision
} from "@/game/ai-strategy";
import { summarizeRaidAnalytics } from "@/game/analytics";
import { type RaidAnalyticsSummary } from "@/game/schemas";
import { createLocalRaidSnapshot } from "@/game/rules";

describe("AI-002 structured LLM strategy selection", () => {
  it("builds an OpenAI request from approved analytics only", () => {
    const analytics = analyticsFixture();
    const requestText = JSON.stringify(buildOpenAiStrategyRequest(analytics, "gpt-test"));

    expect(requestText).toContain("approvedStrategies");
    expect(requestText).toContain("clusterScore");
    expect(requestText).not.toContain("privateKey");
    expect(requestText).not.toContain("wallet");
    expect(requestText).not.toContain("bossFinalHp");
  });

  it("validates a structured OpenAI response into a strategy decision", async () => {
    const decision = await selectBossStrategyDecision(analyticsFixture(), {
      apiKey: "sk-test",
      createdAtMs: 12_345,
      fetchFn: async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          output_text: JSON.stringify({
            strategy: "magic_resistance",
            reason: "Magic damage is dominating the recent window.",
            confidence: 0.82
          })
        })
      })
    });

    expect(decision).toMatchObject({
      strategy: "magic_resistance",
      source: "llm",
      createdAtMs: 12_345
    });
  });

  it("falls back when the response tries to set unsupported state", async () => {
    const analytics = analyticsFixture();
    const decision = await selectBossStrategyDecision(analytics, {
      apiKey: "sk-test",
      fetchFn: async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          output: [
            {
              content: [
                {
                  type: "output_text",
                  text: JSON.stringify({
                    strategy: "rewrite_damage_values",
                    bossHp: 1,
                    damage: 999,
                    reason: "Trying to mutate restricted state.",
                    confidence: 1
                  })
                }
              ]
            }
          ]
        })
      })
    });

    expect(decision.source).toBe("fallback");
    expect(decision.strategy).toBe(chooseFallbackStrategy(analytics));
  });

  it("uses deterministic fallback priority when no API key exists", async () => {
    const analytics = analyticsFixture({
      signals: {
        clusteredPlayers: false,
        rangedDominance: true,
        magicDominance: true,
        frequentHealing: true,
        meleeDominance: false
      },
      dominantDamageType: "ranged"
    });

    const fallback = createFallbackStrategyDecision(analytics);
    const missingKey = await selectBossStrategyDecision(analytics, {
      apiKey: ""
    });

    expect(fallback.strategy).toBe("leap_to_ranged");
    expect(missingKey).toMatchObject({
      strategy: "leap_to_ranged",
      source: "fallback"
    });
  });

  it("extracts text from the Responses API output array shape", () => {
    expect(
      extractResponseText({
        output: [
          {
            content: [
              {
                type: "output_text",
                text: "{\"strategy\":\"area_denial\"}"
              }
            ]
          }
        ]
      })
    ).toBe("{\"strategy\":\"area_denial\"}");
  });
});

function analyticsFixture(
  overrides: Partial<RaidAnalyticsSummary> = {}
): RaidAnalyticsSummary {
  const snapshot = createLocalRaidSnapshot("mage", "area_denial");
  snapshot.serverTimeMs = 10_000;
  const analytics = summarizeRaidAnalytics(
    snapshot,
    [
      {
        type: "player_damage",
        atMs: 9_000,
        playerId: "player-1",
        playerClass: "mage",
        damageType: "magic",
        damage: 120
      }
    ],
    { nowMs: 10_000 }
  );

  return {
    ...analytics,
    ...overrides
  };
}
