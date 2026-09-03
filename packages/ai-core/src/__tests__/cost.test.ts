import { describe, expect, test } from "vitest";
import { COST_PRECISION, estimateCost, formatUsd, parseModelPricing } from "../cost.js";
import type { ModelPricing, TokenUsage } from "../types.js";

describe("estimateCost", () => {
  const claude: ModelPricing = { inputPerMTok: 3, outputPerMTok: 15, cachedInputPerMTok: 0.3 };

  const cases: { name: string; usage: TokenUsage; pricing: ModelPricing; expected: number }[] = [
    {
      name: "input + output",
      usage: { inputTokens: 1_000, outputTokens: 500 },
      pricing: { inputPerMTok: 3, outputPerMTok: 15 },
      expected: 0.003 + 0.0075,
    },
    {
      name: "cached input is priced at the cached rate",
      usage: { inputTokens: 1_000, cachedInputTokens: 9_000 },
      pricing: claude,
      expected: 0.003 + 0.0027,
    },
    {
      name: "cached falls back to the input rate when no cached rate is set",
      usage: { cachedInputTokens: 1_000_000 },
      pricing: { inputPerMTok: 3, outputPerMTok: 15 },
      expected: 3,
    },
    {
      name: "empty usage costs nothing",
      usage: {},
      pricing: claude,
      expected: 0,
    },
    {
      name: "a local model with zero pricing costs nothing",
      usage: { inputTokens: 5_000, outputTokens: 5_000 },
      pricing: { inputPerMTok: 0, outputPerMTok: 0 },
      expected: 0,
    },
  ];

  for (const c of cases) {
    test(c.name, () => {
      expect(estimateCost(c.usage, c.pricing)).toBeCloseTo(c.expected, COST_PRECISION);
    });
  }

  test("rounds to COST_PRECISION decimal places", () => {
    const cost = estimateCost({ inputTokens: 1 }, { inputPerMTok: 3, outputPerMTok: 15 });
    // 1/1e6 * 3 = 0.000003 exactly at 6 dp
    expect(cost).toBe(0.000003);
  });
});

describe("formatUsd", () => {
  test("formats to fixed precision", () => {
    expect(formatUsd(0.0042)).toBe("$0.004200");
  });
});

describe("parseModelPricing", () => {
  test("parses numeric strings straight from Postgres", () => {
    expect(
      parseModelPricing({
        inputPerMTok: "3.000000",
        outputPerMTok: "15.000000",
        cachedInputPerMTok: "0.300000",
      }),
    ).toEqual({ inputPerMTok: 3, outputPerMTok: 15, cachedInputPerMTok: 0.3 });
  });

  test("omits cachedInputPerMTok when it is null/absent", () => {
    expect(parseModelPricing({ inputPerMTok: "1", outputPerMTok: "2" })).toEqual({
      inputPerMTok: 1,
      outputPerMTok: 2,
    });
    expect(
      parseModelPricing({ inputPerMTok: 1, outputPerMTok: 2, cachedInputPerMTok: null }),
    ).toEqual({ inputPerMTok: 1, outputPerMTok: 2 });
  });

  test("returns null when a required rate is missing", () => {
    expect(parseModelPricing({ inputPerMTok: null, outputPerMTok: "15" })).toBeNull();
    expect(parseModelPricing({ inputPerMTok: "", outputPerMTok: "15" })).toBeNull();
  });

  test("returns null for negative or non-numeric rates", () => {
    expect(parseModelPricing({ inputPerMTok: "-1", outputPerMTok: "2" })).toBeNull();
    expect(parseModelPricing({ inputPerMTok: "abc", outputPerMTok: "2" })).toBeNull();
  });
});
