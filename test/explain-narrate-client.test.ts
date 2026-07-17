import { afterEach, describe, expect, test, vi } from "vitest";
import { DEFAULT_LLM } from "../src/config.js";
import { createNarrateClient } from "../src/explain/client.js";
import { MissingApiKeyError } from "../src/llm/client.js";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("createNarrateClient offline guard (AC-1)", () => {
  test("throws MissingApiKeyError synchronously when no key — before any SDK import", () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    expect(() => createNarrateClient(DEFAULT_LLM)).toThrow(MissingApiKeyError);
  });

  test("does not throw when a key is present", () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-present");
    expect(() => createNarrateClient(DEFAULT_LLM)).not.toThrow();
  });
});

vi.mock("@anthropic-ai/sdk", () => ({
  default: class FakeAnthropic {
    messages = {
      create: vi.fn(async () => ({
        content: [{ type: "text", text: "  a plain-English explanation.  " }],
        usage: { input_tokens: 7, output_tokens: 9 },
      })),
    };
  },
}));

describe("onUsage callback (AC-4)", () => {
  test("narrate() reports token usage from the mocked response (AC-4)", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-present");
    const usages: Array<{ inputTokens: number; outputTokens: number }> = [];
    const client = createNarrateClient(DEFAULT_LLM, { onUsage: (u) => usages.push(u) });
    const prose = await client.narrate({ system: "sys", user: "usr" });
    expect(prose).toBe("a plain-English explanation.");
    expect(usages).toEqual([{ inputTokens: 7, outputTokens: 9 }]);
  });
});
