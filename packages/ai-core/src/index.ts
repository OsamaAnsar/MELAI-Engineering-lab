export const PACKAGE_NAME = "@melai/ai-core";

export type {
  ProviderKind,
  ChatMessage,
  GenerationRequest,
  TokenUsage,
  FinishReason,
  GenerationResult,
  GenerationChunk,
  ModelProvider,
  ModelPricing,
} from "./types.js";

export {
  estimateCost,
  formatUsd,
  parseModelPricing,
  COST_PRECISION,
  type RawPricing,
} from "./cost.js";

export { MockProvider, type MockProviderOptions } from "./mock-provider.js";
