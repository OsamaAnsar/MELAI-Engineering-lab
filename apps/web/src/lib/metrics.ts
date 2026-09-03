/** Bar widths (0–100) for comparing one metric across experiment runs. */
export function barWidths(values: (number | null | undefined)[]): number[] {
  const nums = values.map((v) => (typeof v === "number" && Number.isFinite(v) ? v : 0));
  const max = Math.max(0, ...nums);
  if (max === 0) return nums.map(() => 0);
  return nums.map((n) => Math.round((n / max) * 1000) / 10);
}

export function formatCost(usd: number | null): string {
  if (usd === null) return "n/a";
  if (usd === 0) return "free";
  if (usd < 0.01) return `$${usd.toFixed(6)}`;
  return `$${usd.toFixed(4)}`;
}

export function formatLatency(ms: number | null): string {
  if (ms === null) return "—";
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(2)} s`;
}
