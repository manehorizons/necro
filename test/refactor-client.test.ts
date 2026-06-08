import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import { DEFAULT_LLM } from "../src/config.js";
import { MissingApiKeyError } from "../src/triage/client.js";
import { createRefactorClient } from "../src/refactor/client.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("createRefactorClient offline guard (AC-6)", () => {
  test("throws MissingApiKeyError synchronously when no key — before any network call (AC-6)", () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    expect(() => createRefactorClient(DEFAULT_LLM)).toThrow(MissingApiKeyError);
  });

  test("does not throw when a key is present (AC-6)", () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-present");
    expect(() => createRefactorClient(DEFAULT_LLM)).not.toThrow();
  });
});

describe("SDK isolation — refactor path (AC-6)", () => {
  test("scan/fix/engine/cli code paths never statically import the SDK (AC-6)", async () => {
    for (const rel of ["src/cli.ts", "src/engine/index.ts", "src/fix/index.ts"]) {
      const text = await readFile(join(root, rel), "utf8");
      expect(text).not.toContain("@anthropic-ai/sdk");
    }
  });

  test("the refactor client never statically imports the SDK (AC-6)", async () => {
    const text = await readFile(join(root, "src/refactor/client.ts"), "utf8");
    // a runtime static import would be `import X from "@anthropic-ai/sdk"`
    expect(text).not.toMatch(/^import\s+(?!type\b)[^\n]*@anthropic-ai\/sdk/m);
  });
});
