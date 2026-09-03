import { describe, expect, test } from "vitest";
import { barWidths, formatCost, formatLatency } from "./metrics";

describe("barWidths", () => {
  test("scales values against the max", () => {
    expect(barWidths([100, 50, 25])).toEqual([100, 50, 25]);
  });

  test("treats null/undefined/NaN as 0", () => {
    expect(barWidths([null, 10, undefined, NaN])).toEqual([0, 100, 0, 0]);
  });

  test("all-zero (or empty) inputs yield all zeros", () => {
    expect(barWidths([0, 0])).toEqual([0, 0]);
    expect(barWidths([])).toEqual([]);
  });
});

describe("formatters", () => {
  test("formatCost", () => {
    expect(formatCost(null)).toBe("n/a");
    expect(formatCost(0)).toBe("free");
    expect(formatCost(0.00016)).toBe("$0.000160");
    expect(formatCost(0.25)).toBe("$0.2500");
  });

  test("formatLatency", () => {
    expect(formatLatency(null)).toBe("—");
    expect(formatLatency(830)).toBe("830 ms");
    expect(formatLatency(2400)).toBe("2.40 s");
  });
});
