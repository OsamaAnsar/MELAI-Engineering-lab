import { describe, expect, test } from "vitest";
import { Bm25Index } from "../bm25.js";

const docs = [
  { id: "d1", content: "The quick brown fox jumps over the lazy dog" },
  { id: "d2", content: "A fast fox runs through the forest" },
  { id: "d3", content: "The stock market closed higher today" },
];

describe("Bm25Index", () => {
  test("ranks documents containing the query terms above unrelated ones", () => {
    const index = new Bm25Index(docs);
    const results = index.search("fox", 3);
    const ids = results.map((r) => r.id);
    expect(ids).toContain("d1");
    expect(ids).toContain("d2");
    expect(ids).not.toContain("d3");
  });

  test("scores an exact multi-term match higher than a partial one", () => {
    const index = new Bm25Index(docs);
    const [top] = index.search("quick fox", 3);
    expect(top?.id).toBe("d1");
  });

  test("respects topK", () => {
    const index = new Bm25Index(docs);
    expect(index.search("the", 1)).toHaveLength(1);
  });

  test("returns no matches for a query with no overlapping terms", () => {
    const index = new Bm25Index(docs);
    expect(index.search("unrelated gibberish zzz", 3)).toEqual([]);
  });

  test("is case-insensitive", () => {
    const index = new Bm25Index(docs);
    const results = index.search("FOX", 3);
    expect(results.map((r) => r.id)).toContain("d1");
  });

  test("handles an empty corpus without throwing", () => {
    const index = new Bm25Index([]);
    expect(index.search("anything", 5)).toEqual([]);
  });

  test("a rarer term contributes more score than a common one (IDF)", () => {
    // "the" appears in all 3 docs; "market" appears in only 1.
    const index = new Bm25Index(docs);
    const [commonTop] = index.search("the", 1);
    const [rareTop] = index.search("market", 1);
    expect(rareTop!.score).toBeGreaterThan(commonTop!.score);
  });

  test("custom k1/b options change scores", () => {
    const defaultIndex = new Bm25Index(docs);
    const tunedIndex = new Bm25Index(docs, { k1: 3, b: 0 });
    const [defaultTop] = defaultIndex.search("fox", 1);
    const [tunedTop] = tunedIndex.search("fox", 1);
    expect(tunedTop!.score).not.toBeCloseTo(defaultTop!.score, 5);
  });
});
