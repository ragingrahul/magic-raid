import {
  BOSS_STRATEGIES,
  BossStrategyDecisionSchema,
  BossStrategySchema,
  GAME_LIMITS,
  RaidAnalyticsSummarySchema,
  type BossStrategy,
  type BossStrategyDecision,
  type RaidAnalyticsSummary
} from "@/game/schemas";

export const DEFAULT_OPENAI_STRATEGY_MODEL = "gpt-5.6";
export const OPENAI_RESPONSES_ENDPOINT = "https://api.openai.com/v1/responses";

const LlmStrategyOutputSchema = BossStrategyDecisionSchema.pick({
  strategy: true,
  reason: true,
  confidence: true
});

type FetchLike = (
  input: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    signal?: AbortSignal;
  }
) => Promise<{
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}>;

export type StrategySelectionOptions = {
  apiKey?: string;
  model?: string;
  endpoint?: string;
  timeoutMs?: number;
  fetchFn?: FetchLike;
  createdAtMs?: number;
};

export async function selectBossStrategyDecision(
  rawAnalytics: RaidAnalyticsSummary,
  options: StrategySelectionOptions = {}
): Promise<BossStrategyDecision> {
  const analytics = RaidAnalyticsSummarySchema.parse(rawAnalytics);
  const createdAtMs = options.createdAtMs ?? analytics.generatedAtMs;
  const apiKey = options.apiKey ?? process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return createFallbackStrategyDecision(analytics, createdAtMs, "OpenAI API key is not configured.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    options.timeoutMs ??
      parsePositiveInteger(process.env.OPENAI_STRATEGY_TIMEOUT_MS) ??
      GAME_LIMITS.ai.requestTimeoutMs
  );

  try {
    const fetchFn = options.fetchFn ?? fetch;
    const response = await fetchFn(options.endpoint ?? OPENAI_RESPONSES_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(
        buildOpenAiStrategyRequest(
          analytics,
          options.model ?? process.env.OPENAI_STRATEGY_MODEL ?? DEFAULT_OPENAI_STRATEGY_MODEL
        )
      ),
      signal: controller.signal
    });

    if (!response.ok) {
      return createFallbackStrategyDecision(
        analytics,
        createdAtMs,
        `OpenAI strategy request failed with status ${response.status}.`
      );
    }

    const payload = await response.json();
    const outputText = extractResponseText(payload);
    if (!outputText) {
      return createFallbackStrategyDecision(analytics, createdAtMs, "OpenAI response did not include text output.");
    }

    const llmOutput = LlmStrategyOutputSchema.parse(JSON.parse(outputText));
    return BossStrategyDecisionSchema.parse({
      raidId: analytics.raidId,
      strategy: llmOutput.strategy,
      reason: llmOutput.reason,
      confidence: llmOutput.confidence,
      source: "llm",
      createdAtMs
    });
  } catch (error) {
    const reason =
      error instanceof Error && error.name === "AbortError"
        ? "OpenAI strategy request timed out."
        : "OpenAI strategy response failed validation.";

    return createFallbackStrategyDecision(analytics, createdAtMs, reason);
  } finally {
    clearTimeout(timeout);
  }
}

export function createFallbackStrategyDecision(
  rawAnalytics: RaidAnalyticsSummary,
  createdAtMs = rawAnalytics.generatedAtMs,
  reason = "Deterministic fallback selected a safe counter-strategy."
): BossStrategyDecision {
  const analytics = RaidAnalyticsSummarySchema.parse(rawAnalytics);

  return BossStrategyDecisionSchema.parse({
    raidId: analytics.raidId,
    strategy: chooseFallbackStrategy(analytics),
    reason,
    confidence: 0.62,
    source: "fallback",
    createdAtMs
  });
}

export function chooseFallbackStrategy(analytics: RaidAnalyticsSummary): BossStrategy {
  if (analytics.signals.clusteredPlayers) {
    return "area_denial";
  }

  if (analytics.signals.rangedDominance) {
    return "leap_to_ranged";
  }

  if (analytics.signals.magicDominance) {
    return "magic_resistance";
  }

  if (analytics.signals.frequentHealing) {
    return "focus_healer";
  }

  if (analytics.signals.meleeDominance) {
    return "melee_retaliation";
  }

  return analytics.currentStrategy;
}

export function buildOpenAiStrategyRequest(
  rawAnalytics: RaidAnalyticsSummary,
  model = DEFAULT_OPENAI_STRATEGY_MODEL
) {
  const analytics = RaidAnalyticsSummarySchema.parse(rawAnalytics);

  return {
    model,
    input: [
      {
        role: "system",
        content: [
          {
            type: "input_text",
            text:
              "You select one approved MagicRaid boss strategy. Return only JSON that matches the schema. Never invent damage, HP, cooldown, settlement, credentials, or secret fields."
          }
        ]
      },
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: JSON.stringify({
              approvedStrategies: BOSS_STRATEGIES,
              analytics
            })
          }
        ]
      }
    ],
    text: {
      format: {
        type: "json_schema",
        name: "boss_strategy_decision",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          required: ["strategy", "reason", "confidence"],
          properties: {
            strategy: {
              type: "string",
              enum: BossStrategySchema.options
            },
            reason: {
              type: "string"
            },
            confidence: {
              type: "number"
            }
          }
        }
      }
    },
    max_output_tokens: 220
  };
}

export function extractResponseText(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const record = payload as Record<string, unknown>;
  if (typeof record.output_text === "string") {
    return record.output_text;
  }

  if (!Array.isArray(record.output)) {
    return null;
  }

  for (const item of record.output) {
    if (!item || typeof item !== "object") {
      continue;
    }

    const itemRecord = item as Record<string, unknown>;
    if (!Array.isArray(itemRecord.content)) {
      continue;
    }

    for (const contentItem of itemRecord.content) {
      if (!contentItem || typeof contentItem !== "object") {
        continue;
      }

      const contentRecord = contentItem as Record<string, unknown>;
      if (
        (contentRecord.type === "output_text" || contentRecord.type === "text") &&
        typeof contentRecord.text === "string"
      ) {
        return contentRecord.text;
      }
    }
  }

  return null;
}

function parsePositiveInteger(value: string | undefined): number | undefined {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}
