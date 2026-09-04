export const PACKAGE_NAME = "@melai/shared";

export { resolveTemplate, templateVariables, MissingTemplateVariableError } from "./template";

export { experimentSpecSchema, type ExperimentSpec, type RunStatus } from "./experiment";

export {
  fixedChunkParamsSchema,
  sentenceChunkParamsSchema,
  chunkingConfigSpecSchema,
  bm25ParamsSchema,
  vectorParamsSchema,
  hybridRrfParamsSchema,
  retrievalConfigSpecSchema,
  retrievalRunSpecSchema,
  type FixedChunkParams,
  type SentenceChunkParams,
  type ChunkingConfigSpec,
  type Bm25Params,
  type VectorParams,
  type HybridRrfParams,
  type RetrievalConfigSpec,
  type RetrievalRunSpec,
} from "./rag";

export type {
  ProviderKind,
  ModelSummary,
  ProviderHealth,
  ExperimentSummary,
  RunModelInfo,
  RunDetail,
  ExperimentDetail,
  ChunkingStrategy,
  RetrievalMethod,
  DocumentSummary,
  ChunkingConfigSummary,
  ChunkDetail,
  EmbeddingModelSummary,
  RetrievalConfigSummary,
  RetrievalCandidateDto,
  RetrievalResultDetail,
  RetrievalRunDetail,
  RetrievalRunSummary,
} from "./dto";
