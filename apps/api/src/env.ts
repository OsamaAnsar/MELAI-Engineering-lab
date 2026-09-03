import { z } from "zod";

/** Treats "" / whitespace-only env vars as unset (dotenv keeps empty keys as ""). */
const optional = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    schema.optional(),
  );

const EnvSchema = z.object({
  API_PORT: z.coerce.number().int().positive().default(4000),
  DB_DRIVER: z.enum(["postgres", "pglite"]).default("postgres"),
  DATABASE_URL: optional(z.string().url()),
  ANTHROPIC_API_KEY: optional(z.string().min(1)),
  OPENAI_API_KEY: optional(z.string().min(1)),
  OLLAMA_BASE_URL: z.preprocess(
    (v) => (typeof v === "string" && v.trim() !== "" ? v : "http://localhost:11434"),
    z.string().url(),
  ),
});

export type Env = z.infer<typeof EnvSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = EnvSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return parsed.data;
}
