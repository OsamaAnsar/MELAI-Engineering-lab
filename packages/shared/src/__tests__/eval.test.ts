import { describe, expect, test } from "vitest";
import {
  datasetSpecSchema,
  retrievalCaseSchema,
  caseSchemaForTarget,
  retrievalScorerSpecSchema,
  evalConfigSpecSchema,
  evalRunSpecSchema,
} from "../eval.js";

const uuid = "00000000-0000-0000-0000-000000000001";

describe("datasetSpecSchema", () => {
  test("accepts a retrieval dataset and leaves description optional", () => {
    const parsed = datasetSpecSchema.parse({ name: "policy", target: "retrieval" });
    expect(parsed).toEqual({ name: "policy", target: "retrieval" });
  });

  test("rejects an unknown target", () => {
    expect(datasetSpecSchema.safeParse({ name: "x", target: "toxicity" }).success).toBe(false);
  });
});

describe("retrievalCaseSchema", () => {
  test("requires a query and at least one relevantText substring", () => {
    const parsed = retrievalCaseSchema.parse({
      input: { query: "How long do refunds take?" },
      expected: { relevantText: ["within 14 business days"] },
    });
    expect(parsed.expected.relevantText).toHaveLength(1);
  });

  test("rejects an empty relevantText array", () => {
    expect(
      retrievalCaseSchema.safeParse({ input: { query: "q" }, expected: { relevantText: [] } })
        .success,
    ).toBe(false);
  });
});

describe("caseSchemaForTarget", () => {
  test("routes retrieval and generation to different shapes", () => {
    expect(caseSchemaForTarget("retrieval")).toBe(retrievalCaseSchema);
    const gen = caseSchemaForTarget("generation").safeParse({
      input: { variables: { topic: "cats" } },
      expected: { reference: "Cats are mammals." },
    });
    expect(gen.success).toBe(true);
  });
});

describe("retrievalScorerSpecSchema", () => {
  test("defaults k to 10 for rank-cutoff metrics", () => {
    expect(retrievalScorerSpecSchema.parse({ kind: "recall_at_k" })).toEqual({
      kind: "recall_at_k",
      params: { k: 10 },
    });
  });

  test("mrr takes no k", () => {
    expect(retrievalScorerSpecSchema.parse({ kind: "mrr" })).toEqual({ kind: "mrr", params: {} });
  });

  test("rejects a generation scorer kind (added in M3b)", () => {
    expect(retrievalScorerSpecSchema.safeParse({ kind: "llm_judge" }).success).toBe(false);
  });
});

describe("evalConfigSpecSchema", () => {
  test("requires at least one scorer", () => {
    expect(
      evalConfigSpecSchema.safeParse({ name: "c", target: "retrieval", scorers: [] }).success,
    ).toBe(false);
  });

  test("accepts a full retrieval config", () => {
    const parsed = evalConfigSpecSchema.parse({
      name: "recall + mrr",
      target: "retrieval",
      scorers: [{ kind: "recall_at_k", params: { k: 5 } }, { kind: "mrr" }],
    });
    expect(parsed.scorers).toHaveLength(2);
  });
});

describe("evalRunSpecSchema", () => {
  test("parses a retrieval subject with a default topK", () => {
    const parsed = evalRunSpecSchema.parse({
      name: "bm25 baseline",
      datasetId: uuid,
      evalConfigId: uuid,
      subject: {
        kind: "retrieval",
        documentId: uuid,
        chunkingConfigId: uuid,
        retrievalConfigId: uuid,
      },
    });
    expect(parsed.subject.topK).toBe(10);
  });

  test("rejects a non-uuid dataset id", () => {
    expect(
      evalRunSpecSchema.safeParse({
        name: "x",
        datasetId: "nope",
        evalConfigId: uuid,
        subject: {
          kind: "retrieval",
          documentId: uuid,
          chunkingConfigId: uuid,
          retrievalConfigId: uuid,
        },
      }).success,
    ).toBe(false);
  });
});
