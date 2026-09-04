import { describe, expect, test } from "vitest";
import { cosineSimilarity, vectorSearch } from "../vector-search.js";

describe("cosineSimilarity", () => {
  test("identical vectors score 1", () => {
    expect(cosineSimilarity([1, 2, 3], [1, 2, 3])).toBeCloseTo(1);
  });

  test("orthogonal vectors score 0", () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
  });

  test("opposite vectors score -1", () => {
    expect(cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1);
  });

  test("a zero vector scores 0 rather than NaN", () => {
    expect(cosineSimilarity([0, 0], [1, 1])).toBe(0);
  });

  test("throws on a dimension mismatch", () => {
    expect(() => cosineSimilarity([1, 2], [1, 2, 3])).toThrow(/dimension mismatch/i);
  });
});

describe("vectorSearch", () => {
  const candidates = [
    { id: "close", vector: [1, 0] },
    { id: "far", vector: [0, 1] },
    { id: "opposite", vector: [-1, 0] },
  ];

  test("ranks candidates by descending cosine similarity", () => {
    const results = vectorSearch([1, 0], candidates, 3);
    expect(results.map((r) => r.id)).toEqual(["close", "far", "opposite"]);
  });

  test("respects topK", () => {
    expect(vectorSearch([1, 0], candidates, 1)).toHaveLength(1);
  });
});
