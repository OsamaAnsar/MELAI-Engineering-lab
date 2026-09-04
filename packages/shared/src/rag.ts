import { z } from "zod";

export const fixedChunkParamsSchema = z
  .object({
    chunkSize: z.number().int().positive().max(20_000).default(512),
    overlap: z.number().int().min(0).default(64),
  })
  .refine((p) => p.overlap < p.chunkSize, { message: "overlap must be smaller than chunkSize" });
export type FixedChunkParams = z.infer<typeof fixedChunkParamsSchema>;

export const sentenceChunkParamsSchema = z.object({
  maxChunkSize: z.number().int().positive().max(20_000).default(512),
});
export type SentenceChunkParams = z.infer<typeof sentenceChunkParamsSchema>;

/** What the user submits to create a named chunking strategy. */
export const chunkingConfigSpecSchema = z.object({
  name: z.string().min(1).max(200),
  strategy: z.enum(["fixed", "sentence"]),
  params: z.record(z.unknown()).default({}),
});
export type ChunkingConfigSpec = z.infer<typeof chunkingConfigSpecSchema>;

export const bm25ParamsSchema = z.object({
  k1: z.number().positive().default(1.5),
  b: z.number().min(0).max(1).default(0.75),
});
export type Bm25Params = z.infer<typeof bm25ParamsSchema>;

export const vectorParamsSchema = z.object({
  embeddingModelId: z.string().uuid(),
});
export type VectorParams = z.infer<typeof vectorParamsSchema>;

export const hybridRrfParamsSchema = z.object({
  embeddingModelId: z.string().uuid(),
  rrfK: z.number().positive().default(60),
});
export type HybridRrfParams = z.infer<typeof hybridRrfParamsSchema>;

/** What the user submits to create a named retrieval method. */
export const retrievalConfigSpecSchema = z.object({
  name: z.string().min(1).max(200),
  method: z.enum(["bm25", "vector", "hybrid_rrf"]),
  params: z.record(z.unknown()).default({}),
});
export type RetrievalConfigSpec = z.infer<typeof retrievalConfigSpecSchema>;

/** What the user submits to run one query against a set of retrieval configs. */
export const retrievalRunSpecSchema = z.object({
  query: z.string().min(1).max(2000),
  documentId: z.string().uuid(),
  chunkingConfigId: z.string().uuid(),
  topK: z.number().int().positive().max(50).default(5),
  retrievalConfigIds: z.array(z.string().uuid()).min(1).max(8),
});
export type RetrievalRunSpec = z.infer<typeof retrievalRunSpecSchema>;
