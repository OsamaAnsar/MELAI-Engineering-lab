import { describe, expect, test } from "vitest";
import { recallAtK, precisionAtK, reciprocalRank, hitRate, ndcgAtK } from "../retrieval-metrics.js";

const retrieved = ["a", "b", "c", "d", "e"];
const relevant = ["b", "d", "x"]; // "x" is relevant but never retrievable

describe("recallAtK", () => {
  test("counts relevant ids found in the top k over total relevant", () => {
    expect(recallAtK(retrieved, relevant, 3)).toBeCloseTo(1 / 3);
    expect(recallAtK(retrieved, relevant, 5)).toBeCloseTo(2 / 3);
  });
  test("is vacuously 1 when nothing is relevant", () => {
    expect(recallAtK(retrieved, [], 5)).toBe(1);
  });
  test("accepts a Set", () => {
    expect(recallAtK(retrieved, new Set(["b", "d"]), 5)).toBe(1);
  });
});

describe("precisionAtK", () => {
  test("divides relevant hits by min(k, retrieved length)", () => {
    expect(precisionAtK(retrieved, relevant, 3)).toBeCloseTo(1 / 3);
    expect(precisionAtK(retrieved, relevant, 5)).toBeCloseTo(2 / 5);
  });
  test("k beyond the list length uses the list length as denominator", () => {
    expect(precisionAtK(["a", "b"], ["b"], 10)).toBeCloseTo(1 / 2);
  });
  test("is 0 when nothing was retrieved", () => {
    expect(precisionAtK([], relevant, 5)).toBe(0);
  });
});

describe("reciprocalRank", () => {
  test("is 1 / rank of the first relevant id", () => {
    expect(reciprocalRank(retrieved, relevant)).toBe(1 / 2);
    expect(reciprocalRank(["b", "a"], relevant)).toBe(1);
  });
  test("is 0 when no relevant id is retrieved", () => {
    expect(reciprocalRank(["a", "c", "e"], relevant)).toBe(0);
  });
});

describe("hitRate", () => {
  test("is 1 when any relevant id is in the top k, else 0", () => {
    expect(hitRate(retrieved, relevant, 3)).toBe(1);
    expect(hitRate(retrieved, relevant, 1)).toBe(0);
  });
});

describe("ndcgAtK", () => {
  test("matches the hand-computed graded example", () => {
    const grades = { b: 3, d: 2, a: 0, c: 0 };
    // DCG  = 7/log2(3) + 3/log2(5) = 4.416508 + 1.292030 = 5.708538
    // IDCG = 7/log2(2) + 3/log2(3) = 7 + 1.892790         = 8.892790
    expect(ndcgAtK(["a", "b", "c", "d"], grades, 4)).toBeCloseTo(0.641932, 5);
  });
  test("is 1 for a perfectly ordered result", () => {
    expect(ndcgAtK(["b", "d"], { b: 2, d: 1 }, 5)).toBe(1);
  });
  test("is 0 when no id carries a positive grade", () => {
    expect(ndcgAtK(retrieved, {}, 5)).toBe(0);
  });
  test("accepts a Map", () => {
    const grades = new Map([
      ["b", 1],
      ["d", 1],
    ]);
    expect(ndcgAtK(["b", "d"], grades, 5)).toBe(1);
  });
});
