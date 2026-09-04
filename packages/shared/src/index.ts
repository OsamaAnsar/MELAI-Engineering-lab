export const PACKAGE_NAME = "@melai/shared";

export { resolveTemplate, templateVariables, MissingTemplateVariableError } from "./template";

export { experimentSpecSchema, type ExperimentSpec, type RunStatus } from "./experiment";

export type {
  ProviderKind,
  ModelSummary,
  ProviderHealth,
  ExperimentSummary,
  RunModelInfo,
  RunDetail,
  ExperimentDetail,
} from "./dto";
