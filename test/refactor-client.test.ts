import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import { DEFAULT_LLM } from "../src/config.js";
import { MissingApiKeyError } from "../src/llm/client.js";
import { createRefactorClient } from "../src/refactor/client.js";
import type { DuplicationFinding } from "../src/syntactic/types.js";

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

  test("the refactor client never references the SDK directly — only via src/llm/client.ts (AC-6)", async () => {
    const text = await readFile(join(root, "src/refactor/client.ts"), "utf8");
    expect(text).not.toContain("@anthropic-ai/sdk");
  });
});

vi.mock("@anthropic-ai/sdk", () => ({
  default: class FakeAnthropic {
    messages = {
      create: vi.fn(async () => ({
        content: [
          {
            type: "text",
            text: JSON.stringify({ summary: "s", newFunctions: ["f"], replacement: "code", rationale: "r" }),
          },
        ],
        usage: { input_tokens: 111, output_tokens: 222 },
      })),
    };
  },
}));

describe("onUsage callback (AC-4)", () => {
  test("propose() reports token usage from the mocked response (AC-4)", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-present");
    const usages: Array<{ inputTokens: number; outputTokens: number }> = [];
    const client = createRefactorClient(DEFAULT_LLM, { onUsage: (u) => usages.push(u) });
    const result = await client.propose({ system: "sys", user: "usr" });
    expect(result).toEqual({
      ok: true,
      proposal: { summary: "s", newFunctions: ["f"], replacement: "code", rationale: "r" },
    });
    expect(usages).toEqual([{ inputTokens: 111, outputTokens: 222 }]);
  });

  test("proposeDuplicate() reports token usage even on a malformed response (AC-4)", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-present");
    // The shared mock above returns a god-function-shaped payload, which fails
    // duplicate-proposal validation (no sharedFunction/edits) — usage must still
    // be reported on that failed-parse path (AC-4's "including malformed responses").
    const finding: DuplicationFinding = { tokens: 50, locations: [{ file: "a.ts", startLine: 1, endLine: 5 }] };
    const usages: Array<{ inputTokens: number; outputTokens: number }> = [];
    const client = createRefactorClient(DEFAULT_LLM, { onUsage: (u) => usages.push(u) });
    const result = await client.proposeDuplicate({ system: "sys", user: "usr" }, finding);
    expect(result.ok).toBe(false);
    expect(usages).toEqual([{ inputTokens: 111, outputTokens: 222 }]);
  });
});

vi.mock("../src/llm/host-cli-client.js", () => ({
  hostCliStructuredCall: vi.fn(async (o: { parse: (raw: unknown) => unknown }) => ({
    result: o.parse({ summary: "hc-s", newFunctions: ["hc-f"], replacement: "hc-code", rationale: "hc-r" }),
    usage: { inputTokens: 3, outputTokens: 4 },
  })),
}));

describe("createRefactorClient host-cli provider (AC-1, AC-3)", () => {
  test("does not throw MissingApiKeyError with no API key set (AC-1)", () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    expect(() => createRefactorClient({ ...DEFAULT_LLM, provider: "host-cli" })).not.toThrow();
  });

  test("propose() routes through the host-cli transport, not the Anthropic SDK (AC-1)", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    const usages: Array<{ inputTokens: number; outputTokens: number }> = [];
    const client = createRefactorClient({ ...DEFAULT_LLM, provider: "host-cli" }, { onUsage: (u) => usages.push(u) });
    const result = await client.propose({ system: "sys", user: "usr" });
    expect(result).toEqual({
      ok: true,
      proposal: { summary: "hc-s", newFunctions: ["hc-f"], replacement: "hc-code", rationale: "hc-r" },
    });
    expect(usages).toEqual([{ inputTokens: 3, outputTokens: 4 }]);
  });

  test("the anthropic-path default is unaffected by the host-cli branch (AC-3)", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-present");
    const client = createRefactorClient(DEFAULT_LLM);
    const result = await client.propose({ system: "sys", user: "usr" });
    expect(result).toEqual({
      ok: true,
      proposal: { summary: "s", newFunctions: ["f"], replacement: "code", rationale: "r" },
    });
  });
});
