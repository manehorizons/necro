import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import { DEFAULT_LLM } from "../src/config.js";
import { MissingApiKeyError, resolveApiKey } from "../src/llm/client.js";
import { createTriageClient } from "../src/triage/client.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("resolveApiKey (AC-5)", () => {
  test("env ANTHROPIC_API_KEY takes precedence over config (AC-5)", () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-env");
    expect(resolveApiKey({ ...DEFAULT_LLM, apiKey: "sk-config" })).toBe("sk-env");
  });

  test("falls back to llm.apiKey when env is absent (AC-5)", () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    expect(resolveApiKey({ ...DEFAULT_LLM, apiKey: "sk-config" })).toBe("sk-config");
  });

  test("undefined when neither is set (AC-5)", () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    expect(resolveApiKey(DEFAULT_LLM)).toBeUndefined();
  });
});

describe("createTriageClient offline guard (AC-5)", () => {
  test("throws MissingApiKeyError synchronously when no key — before any network call (AC-5)", () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    expect(() => createTriageClient(DEFAULT_LLM)).toThrow(MissingApiKeyError);
  });

  test("does not throw when a key is present (AC-5)", () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-present");
    expect(() => createTriageClient(DEFAULT_LLM)).not.toThrow();
  });
});

describe("SDK isolation (AC-5)", () => {
  test("scan/fix/cli code paths never statically import the SDK (AC-5)", async () => {
    for (const rel of ["src/cli.ts", "src/engine/index.ts", "src/fix/index.ts"]) {
      const text = await readFile(join(root, rel), "utf8");
      expect(text).not.toContain("@anthropic-ai/sdk");
    }
  });

  test("the triage client never references the SDK directly — only via src/llm/client.ts (AC-5)", async () => {
    const text = await readFile(join(root, "src/triage/client.ts"), "utf8");
    expect(text).not.toContain("@anthropic-ai/sdk");
  });

  test("src/llm/client.ts loads the SDK only via `import type` + dynamic import (AC-5)", async () => {
    const text = await readFile(join(root, "src/llm/client.ts"), "utf8");
    // a runtime static import would be `import X from "@anthropic-ai/sdk"`
    expect(text).not.toMatch(/^import\s+(?!type\b)[^\n]*@anthropic-ai\/sdk/m);
    expect(text).toContain('import("@anthropic-ai/sdk")'); // lazy
  });
});

vi.mock("@anthropic-ai/sdk", () => ({
  default: class FakeAnthropic {
    messages = {
      create: vi.fn(async () => ({
        content: [{ type: "text", text: JSON.stringify({ verdict: "likely-dead", reasoning: "r" }) }],
        usage: { input_tokens: 11, output_tokens: 22 },
      })),
    };
  },
}));

vi.mock("../src/llm/host-cli-client.js", () => ({
  hostCliStructuredCall: vi.fn(async (o: { parse: (raw: unknown) => unknown }) => ({
    result: o.parse({ verdict: "likely-alive", reasoning: "host-cli r" }),
    usage: { inputTokens: 3, outputTokens: 4 },
  })),
}));

describe("onUsage callback (AC-4)", () => {
  test("classify() reports token usage from the mocked response (AC-4)", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-present");
    const usages: Array<{ inputTokens: number; outputTokens: number }> = [];
    const client = createTriageClient(DEFAULT_LLM, { onUsage: (u) => usages.push(u) });
    const result = await client.classify({ system: "sys", user: "usr" });
    expect(result).toEqual({ verdict: "likely-dead", reasoning: "r" });
    expect(usages).toEqual([{ inputTokens: 11, outputTokens: 22 }]);
  });
});

describe("createTriageClient host-cli provider (AC-1, AC-3)", () => {
  test("does not throw MissingApiKeyError with no API key set (AC-1)", () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    expect(() => createTriageClient({ ...DEFAULT_LLM, provider: "host-cli" })).not.toThrow();
  });

  test("classify() routes through the host-cli transport, not the Anthropic SDK (AC-1)", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    const usages: Array<{ inputTokens: number; outputTokens: number }> = [];
    const client = createTriageClient({ ...DEFAULT_LLM, provider: "host-cli" }, { onUsage: (u) => usages.push(u) });
    const result = await client.classify({ system: "sys", user: "usr" });
    expect(result).toEqual({ verdict: "likely-alive", reasoning: "host-cli r" });
    expect(usages).toEqual([{ inputTokens: 3, outputTokens: 4 }]);
  });

  test("the anthropic-path default is unaffected by the host-cli branch (AC-3)", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-present");
    const client = createTriageClient(DEFAULT_LLM);
    const result = await client.classify({ system: "sys", user: "usr" });
    expect(result).toEqual({ verdict: "likely-dead", reasoning: "r" });
  });
});
