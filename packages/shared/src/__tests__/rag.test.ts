import { describe, expect, test } from "vitest";
import {
  bm25ParamsSchema,
  chunkingConfigSpecSchema,
  fixedChunkParamsSchema,
  hybridRrfParamsSchema,
  retrievalConfigSpecSchema,
  retrievalRunSpecSchema,
  sentenceChunkParamsSchema,
  vectorParamsSchema,
} from "../rag.js";

describe("fixedChunkParamsSchema", () => {
  test("fills defaults when omitted", () => {
    expect(fixedChunkParamsSchema.parse({})).toEqual({ chunkSize: 512, overlap: 64 });
  });

  test("rejects overlap >= chunkSize", () => {
    expect(fixedChunkParamsSchema.safeParse({ chunkSize: 100, overlap: 100 }).success).toBe(false);
  });
});

describe("sentenceChunkParamsSchema", () => {
  test("fills the default maxChunkSize", () => {
    expect(sentenceChunkParamsSchema.parse({})).toEqual({ maxChunkSize: 512 });
  });
});

describe("chunkingConfigSpecSchema", () => {
  test("accepts a fixed strategy with params", () => {
    const parsed = chunkingConfigSpecSchema.parse({
      name: "fixed-256",
      strategy: "fixed",
      params: { chunkSize: 256, overlap: 32 },
    });
    expect(parsed.strategy).toBe("fixed");
  });

  test("rejects an unknown strategy", () => {
    expect(chunkingConfigSpecSchema.safeParse({ name: "x", strategy: "recursive" }).success).toBe(
      false,
    );
  });

  test("defaults params to an empty object", () => {
    expect(chunkingConfigSpecSchema.parse({ name: "x", strategy: "sentence" }).params).toEqual({});
  });
});

describe("bm25ParamsSchema", () => {
  test("defaults match the conventional k1/b values", () => {
    expect(bm25ParamsSchema.parse({})).toEqual({ k1: 1.5, b: 0.75 });
  });

  test("rejects b outside [0, 1]", () => {
    expect(bm25ParamsSchema.safeParse({ b: 1.5 }).success).toBe(false);
  });
});

describe("vectorParamsSchema", () => {
  test("requires a valid embeddingModelId uuid", () => {
    expect(vectorParamsSchema.safeParse({}).success).toBe(false);
    expect(vectorParamsSchema.safeParse({ embeddingModelId: "not-a-uuid" }).success).toBe(false);
  });
});

describe("hybridRrfParamsSchema", () => {
  test("defaults rrfK to 60", () => {
    const parsed = hybridRrfParamsSchema.parse({
      embeddingModelId: "1e5e2c1a-1111-4444-8888-abcdefabcdef",
    });
    expect(parsed.rrfK).toBe(60);
  });
});

describe("retrievalConfigSpecSchema", () => {
  test("accepts each method", () => {
    for (const method of ["bm25", "vector", "hybrid_rrf"] as const) {
      expect(retrievalConfigSpecSchema.safeParse({ name: "x", method }).success).toBe(true);
    }
  });
});

describe("retrievalRunSpecSchema", () => {
  const valid = {
    query: "What is the refund window?",
    documentId: "1e5e2c1a-1111-4444-8888-abcdefabcdef",
    chunkingConfigId: "1e5e2c1a-2222-4444-8888-abcdefabcdef",
    retrievalConfigIds: ["1e5e2c1a-3333-4444-8888-abcdefabcdef"],
  };

  test("defaults topK to 5", () => {
    expect(retrievalRunSpecSchema.parse(valid).topK).toBe(5);
  });

  test("rejects an empty retrievalConfigIds array", () => {
    expect(retrievalRunSpecSchema.safeParse({ ...valid, retrievalConfigIds: [] }).success).toBe(
      false,
    );
  });

  test("rejects more than 8 retrievalConfigIds", () => {
    const tooMany = Array.from({ length: 9 }, () => "1e5e2c1a-3333-4444-8888-abcdefabcdef");
    expect(
      retrievalRunSpecSchema.safeParse({ ...valid, retrievalConfigIds: tooMany }).success,
    ).toBe(false);
  });

  test("rejects an empty query", () => {
    expect(retrievalRunSpecSchema.safeParse({ ...valid, query: "" }).success).toBe(false);
  });
});
