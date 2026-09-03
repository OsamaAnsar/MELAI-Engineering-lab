import { describe, expect, test } from "vitest";
import { loadEnv } from "../env.js";

describe("loadEnv", () => {
  test("applies defaults when optional vars are absent", () => {
    const env = loadEnv({});
    expect(env.API_PORT).toBe(4000);
    expect(env.OLLAMA_BASE_URL).toBe("http://localhost:11434");
    expect(env.DATABASE_URL).toBeUndefined();
    expect(env.ANTHROPIC_API_KEY).toBeUndefined();
  });

  test("treats empty-string vars as unset", () => {
    const env = loadEnv({ ANTHROPIC_API_KEY: "", DATABASE_URL: "  ", OLLAMA_BASE_URL: "" });
    expect(env.ANTHROPIC_API_KEY).toBeUndefined();
    expect(env.DATABASE_URL).toBeUndefined();
    expect(env.OLLAMA_BASE_URL).toBe("http://localhost:11434");
  });

  test("parses provided values", () => {
    const env = loadEnv({
      API_PORT: "5555",
      DATABASE_URL: "postgres://u:p@localhost:5432/db",
      ANTHROPIC_API_KEY: "sk-ant-xxx",
    });
    expect(env.API_PORT).toBe(5555);
    expect(env.DATABASE_URL).toBe("postgres://u:p@localhost:5432/db");
    expect(env.ANTHROPIC_API_KEY).toBe("sk-ant-xxx");
  });

  test("rejects an invalid port", () => {
    expect(() => loadEnv({ API_PORT: "-1" })).toThrow(/Invalid environment configuration/);
  });
});
