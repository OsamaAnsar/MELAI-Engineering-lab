import { describe, expect, test } from "vitest";
import { chunkBySentence, chunkFixed } from "../chunking.js";

describe("chunkFixed", () => {
  test("splits text into overlapping windows", () => {
    const chunks = chunkFixed("abcdefghij", { chunkSize: 4, overlap: 2 });
    expect(chunks.map((c) => c.content)).toEqual(["abcd", "cdef", "efgh", "ghij"]);
    expect(chunks.map((c) => c.index)).toEqual([0, 1, 2, 3]);
  });

  test("returns a single chunk when text is shorter than chunkSize", () => {
    const chunks = chunkFixed("hi", { chunkSize: 100, overlap: 10 });
    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.content).toBe("hi");
  });

  test("returns an empty array for empty text", () => {
    expect(chunkFixed("   ", { chunkSize: 10, overlap: 2 })).toEqual([]);
  });

  test("sets an approximate word-count tokenCount per chunk", () => {
    const [chunk] = chunkFixed("one two three", { chunkSize: 100, overlap: 0 });
    expect(chunk?.tokenCount).toBe(3);
  });

  test("throws on a non-positive chunkSize", () => {
    expect(() => chunkFixed("x", { chunkSize: 0, overlap: 0 })).toThrow(/chunkSize/);
  });

  test("throws when overlap is not smaller than chunkSize", () => {
    expect(() => chunkFixed("x", { chunkSize: 10, overlap: 10 })).toThrow(/overlap/);
  });
});

describe("chunkBySentence", () => {
  test("packs sentences greedily up to maxChunkSize", () => {
    const text = "One. Two. Three. Four.";
    const chunks = chunkBySentence(text, { maxChunkSize: 9 });
    expect(chunks.map((c) => c.content)).toEqual(["One. Two.", "Three.", "Four."]);
  });

  test("keeps an oversized single sentence as its own chunk", () => {
    const chunks = chunkBySentence("This sentence alone is long.", { maxChunkSize: 5 });
    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.content).toBe("This sentence alone is long.");
  });

  test("returns an empty array for empty text", () => {
    expect(chunkBySentence("  ", { maxChunkSize: 100 })).toEqual([]);
  });

  test("assigns sequential indices", () => {
    const chunks = chunkBySentence("One. Two. Three.", { maxChunkSize: 4 });
    expect(chunks.map((c) => c.index)).toEqual(chunks.map((_, i) => i));
  });

  test("throws on a non-positive maxChunkSize", () => {
    expect(() => chunkBySentence("x.", { maxChunkSize: 0 })).toThrow(/maxChunkSize/);
  });
});
