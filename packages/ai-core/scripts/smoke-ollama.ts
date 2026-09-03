/**
 * Live smoke test — NOT run by vitest/CI. Hits a local Ollama at
 * OLLAMA_BASE_URL (default http://localhost:11434). Needs the model pulled:
 *
 *   ollama pull qwen2.5:7b-instruct
 *   pnpm --filter @melai/ai-core smoke:ollama
 */
import { OllamaProvider } from "../src/providers/index.js";

const host = process.env.OLLAMA_BASE_URL ?? "http://localhost:11434";
const model = process.env.SMOKE_MODEL ?? "qwen2.5:7b-instruct";
const provider = new OllamaProvider({ host });

console.log(`host: ${host}  model: ${model}`);

const healthy = await provider.healthCheck();
console.log(`healthCheck: ${healthy}`);
if (!healthy) {
  console.error("Ollama not reachable — is `ollama serve` running?");
  process.exit(0);
}

const request = {
  model,
  messages: [
    { role: "user" as const, content: "In one sentence, what is Reciprocal Rank Fusion?" },
  ],
  maxOutputTokens: 300,
};

console.log("\n--- generate ---");
const result = await provider.generate(request);
console.log(result.text);
console.log({
  latencyMs: result.latencyMs,
  usage: result.usage,
  finishReason: result.finishReason,
  providerMetrics: result.providerMetrics,
});

console.log("\n--- stream ---");
for await (const chunk of provider.stream(request)) {
  if (chunk.textDelta) process.stdout.write(chunk.textDelta);
  if (chunk.usage) console.log("\n[usage]", chunk.usage);
}
