import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import { DEFAULT_LLM } from "../src/config.js";
import { MissingApiKeyError, createTriageClient, resolveApiKey } from "../src/triage/client.js";

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

  test("the triage client loads the SDK only via `import type` + dynamic import (AC-5)", async () => {
    const text = await readFile(join(root, "src/triage/client.ts"), "utf8");
    // a runtime static import would be `import X from "@anthropic-ai/sdk"`
    expect(text).not.toMatch(/^import\s+(?!type\b)[^\n]*@anthropic-ai\/sdk/m);
    expect(text).toContain('import("@anthropic-ai/sdk")'); // lazy
  });
});
