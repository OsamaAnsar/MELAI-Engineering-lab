import { describe, expect, test } from "vitest";
import { reciprocalRankFusion, toRanked } from "../rrf.js";

describe("toRanked", () => {
  test("converts score-descending matches into 1-based ranks", () => {
    const ranked = toRanked([
      { id: "a", score: 0.2 },
      { id: "b", score: 0.9 },
      { id: "c", score: 0.5 },
    ]);
    expect(ranked).toEqual([
      { id: "b", rank: 1 },
      { id: "c", rank: 2 },
      { id: "a", rank: 3 },
    ]);
  });
});

describe("reciprocalRankFusion", () => {
  test("an item ranked first in every list scores highest", () => {
    const fused = reciprocalRankFusion([
      [
        { id: "a", rank: 1 },
        { id: "b", rank: 2 },
      ],
      [
        { id: "a", rank: 1 },
        { id: "b", rank: 2 },
      ],
    ]);
    expect(fused[0]?.id).toBe("a");
  });

  test("rewards an item ranked well across lists over one ranked #1 in only one", () => {
    // "b" is #2 in both lists; "a" is #1 in list one but absent from list two.
    const fused = reciprocalRankFusion([
      [
        { id: "a", rank: 1 },
        { id: "b", rank: 2 },
      ],
      [
        { id: "c", rank: 1 },
        { id: "b", rank: 2 },
      ],
    ]);
    const byId = Object.fromEntries(fused.map((f) => [f.id, f.score]));
    expect(byId.b).toBeGreaterThan(byId.a!);
    expect(byId.b).toBeGreaterThan(byId.c!);
  });

  test("sums contributions when an id appears in multiple lists", () => {
    const single = reciprocalRankFusion([[{ id: "a", rank: 1 }]]);
    const doubled = reciprocalRankFusion([[{ id: "a", rank: 1 }], [{ id: "a", rank: 1 }]]);
    expect(doubled[0]!.score).toBeCloseTo(single[0]!.score * 2);
  });

  test("a larger k shrinks every score", () => {
    const lowK = reciprocalRankFusion([[{ id: "a", rank: 1 }]], 10);
    const highK = reciprocalRankFusion([[{ id: "a", rank: 1 }]], 1000);
    expect(highK[0]!.score).toBeLessThan(lowK[0]!.score);
  });

  test("returns an empty array for no rankings", () => {
    expect(reciprocalRankFusion([])).toEqual([]);
  });
});
