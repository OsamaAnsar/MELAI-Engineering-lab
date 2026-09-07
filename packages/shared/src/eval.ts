import { z } from "zod";

export const evalTargetSchema = z.enum(["retrieval", "generation"]);
export type EvalTarget = z.infer<typeof evalTargetSchema>;

/** Create a dataset. Cases are added separately so a large set doesn't ride in one body. */
export const datasetSpecSchema = z.object({
  name: z.string().min(1).max(200),
  target: evalTargetSchema,
  description: z.string().max(2000).optional(),
});
export type DatasetSpec = z.infer<typeof datasetSpecSchema>;

/**
 * A retrieval test case: a query plus the substrings that a correct chunk must
 * contain. Matching substrings against chunk text (rather than pinning chunk
 * indexes) keeps a case valid across chunking configs.
 */
export const retrievalCaseSchema = z.object({
  label: z.string().max(200).optional(),
  input: z.object({ query: z.string().min(1).max(2000) }),
  expected: z.object({ relevantText: z.array(z.string().min(1)).min(1).max(20) }),
});
export type RetrievalCase = z.infer<typeof retrievalCaseSchema>;

/** A generation test case (used from M3b). */
export const generationCaseSchema = z.object({
  label: z.string().max(200).optional(),
  input: z.object({ variables: z.record(z.string()) }),
  expected: z
    .object({
      reference: z.string().optional(),
      mustContain: z.array(z.string().min(1)).optional(),
      mustMatch: z.string().optional(),
    })
    .default({}),
});
export type GenerationCase = z.infer<typeof generationCaseSchema>;

/** Picks the case schema for a dataset's target. */
export function caseSchemaForTarget(target: EvalTarget) {
  return target === "retrieval" ? retrievalCaseSchema : generationCaseSchema;
}

export const addCasesSpecSchema = z.object({
  cases: z.array(z.record(z.unknown())).min(1).max(500),
});
export type AddCasesSpec = z.infer<typeof addCasesSpecSchema>;

const kParams = z.object({ k: z.number().int().positive().max(50).default(10) });

/**
 * A retrieval scorer. `mrr` takes no params; the rank-cutoff metrics take `k`.
 * M3b adds the generation scorers (exact_match, contains, regex, json_valid,
 * embedding_similarity, llm_judge) to this union.
 */
export const retrievalScorerSpecSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("recall_at_k"), params: kParams.default({ k: 10 }) }),
  z.object({ kind: z.literal("precision_at_k"), params: kParams.default({ k: 10 }) }),
  z.object({ kind: z.literal("ndcg"), params: kParams.default({ k: 10 }) }),
  z.object({ kind: z.literal("hit_rate"), params: kParams.default({ k: 10 }) }),
  z.object({ kind: z.literal("mrr"), params: z.object({}).default({}) }),
]);
export type RetrievalScorerSpec = z.infer<typeof retrievalScorerSpecSchema>;

/** Create a named scoring setup. Retrieval-only until M3b widens `target`. */
export const evalConfigSpecSchema = z.object({
  name: z.string().min(1).max(200),
  target: z.literal("retrieval"),
  scorers: z.array(retrievalScorerSpecSchema).min(1).max(10),
});
export type EvalConfigSpec = z.infer<typeof evalConfigSpecSchema>;

/** What a retrieval eval run scores: an M2 (document, chunking, retrieval) config. */
export const retrievalSubjectSchema = z.object({
  kind: z.literal("retrieval"),
  documentId: z.string().uuid(),
  chunkingConfigId: z.string().uuid(),
  retrievalConfigId: z.string().uuid(),
  topK: z.number().int().positive().max(50).default(10),
});
export type RetrievalSubject = z.infer<typeof retrievalSubjectSchema>;

/** Start an evaluation run. `subject` becomes a discriminated union in M3b. */
export const evalRunSpecSchema = z.object({
  name: z.string().min(1).max(200),
  datasetId: z.string().uuid(),
  evalConfigId: z.string().uuid(),
  subject: retrievalSubjectSchema,
});
export type EvalRunSpec = z.infer<typeof evalRunSpecSchema>;
