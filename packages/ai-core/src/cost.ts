import type { ModelPricing, TokenUsage } from "./types.js";

/** Decimal places we keep on a computed cost (matches the DB's numeric(12,6)). */
export const COST_PRECISION = 6;

function round(value: number, dp: number): number {
  const factor = 10 ** dp;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

/**
 * USD cost of one generation.
 *
 * Cache-discounted input is priced at `cachedInputPerMTok`; if that isn't set,
 * it falls back to the full input rate. Empty usage costs 0. A model with all-
 * zero pricing (a local model) also costs 0. The caller decides what to show
 * when pricing is unknown — see {@link parseModelPricing}, which returns null.
 */
export function estimateCost(usage: TokenUsage, pricing: ModelPricing): number {
  const input = usage.inputTokens ?? 0;
  const output = usage.outputTokens ?? 0;
  const cached = usage.cachedInputTokens ?? 0;
  const cachedRate = pricing.cachedInputPerMTok ?? pricing.inputPerMTok;

  const cost =
    (input / 1_000_000) * pricing.inputPerMTok +
    (output / 1_000_000) * pricing.outputPerMTok +
    (cached / 1_000_000) * cachedRate;

  return round(cost, COST_PRECISION);
}

export function formatUsd(amount: number): string {
  return `$${amount.toFixed(COST_PRECISION)}`;
}

export interface RawPricing {
  inputPerMTok: string | number | null | undefined;
  outputPerMTok: string | number | null | undefined;
  cachedInputPerMTok?: string | number | null | undefined;
}

function toRate(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/**
 * Turns loosely-typed pricing (e.g. numeric strings straight from Postgres) into
 * a {@link ModelPricing}. Returns null if either required rate is missing or
 * invalid — that's the "we don't know the price" signal.
 */
export function parseModelPricing(raw: RawPricing): ModelPricing | null {
  const inputPerMTok = toRate(raw.inputPerMTok);
  const outputPerMTok = toRate(raw.outputPerMTok);
  if (inputPerMTok === null || outputPerMTok === null) return null;

  const cachedInputPerMTok = toRate(raw.cachedInputPerMTok);
  return {
    inputPerMTok,
    outputPerMTok,
    ...(cachedInputPerMTok !== null ? { cachedInputPerMTok } : {}),
  };
}
