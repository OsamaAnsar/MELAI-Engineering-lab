/**
 * Live smoke test — NOT run by vitest/CI. Hits the real Anthropic API once to
 * catch SDK drift. Needs ANTHROPIC_API_KEY in the environment (or ../../.env).
 *
 *   pnpm --filter @melai/ai-core smoke:anthropic
 */
import { AnthropicProvider } from "../src/providers/index.js";

const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
  console.error("ANTHROPIC_API_KEY not set — skipping live smoke.");
  process.exit(0);
}

const model = process.env.SMOKE_MODEL ?? "claude-opus-5";
const provider = new AnthropicProvider({ apiKey });

const request = {
  model,
  messages: [
    { role: "user" as const, content: "In one sentence, what is Reciprocal Rank Fusion?" },
  ],
  maxOutputTokens: 300,
};

console.log(`model: ${model}`);
console.log(`healthCheck: ${await provider.healthCheck()}`);

console.log("\n--- generate ---");
const result = await provider.generate(request);
console.log(result.text);
console.log({
  latencyMs: result.latencyMs,
  usage: result.usage,
  finishReason: result.finishReason,
});

console.log("\n--- stream ---");
for await (const chunk of provider.stream(request)) {
  if (chunk.textDelta) process.stdout.write(chunk.textDelta);
  if (chunk.usage) console.log("\n[usage]", chunk.usage);
}
