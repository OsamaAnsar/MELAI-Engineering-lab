import { z } from "zod";

/** What the user submits to run one prompt version against a set of models. */
export const experimentSpecSchema = z.object({
  name: z.string().min(1).max(200),
  promptVersionId: z.string().uuid(),
  inputVariables: z.record(z.string()).default({}),
  config: z
    .object({
      temperature: z.number().min(0).max(2).default(0.2),
      maxOutputTokens: z.number().int().positive().max(128_000).default(1024),
    })
    .default({ temperature: 0.2, maxOutputTokens: 1024 }),
  modelIds: z.array(z.string().uuid()).min(1).max(12),
});

export type ExperimentSpec = z.infer<typeof experimentSpecSchema>;

export type RunStatus = "pending" | "running" | "success" | "error";
