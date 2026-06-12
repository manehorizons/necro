import { afterEach, describe, expect, test, vi } from "vitest";
import { DEFAULT_LLM } from "../src/config.js";
import { createNarrateClient } from "../src/explain/client.js";
import { MissingApiKeyError } from "../src/triage/client.js";

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
