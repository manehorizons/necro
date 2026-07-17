import type { LlmOptions } from "../config.js";
import { lazyAnthropic, type LlmUsage, MissingApiKeyError, resolveApiKey, structuredCall } from "../llm/client.js";
import type { NarratePrompt } from "./prompt.js";

/** The one capability the narrator needs — injectable so tests run with no network. */
export interface NarrateClient {
  narrate(prompt: NarratePrompt): Promise<string>;
}

export interface NarrateClientOptions {
  /** Called once per model call with that call's token usage. */
  onUsage?: (usage: LlmUsage) => void;
}

/** A few sentences of prose fit comfortably here. */
const MAX_TOKENS = 1024;

/**
 * Build the real Claude-backed narrator. The key is resolved up front and a
 * {@link MissingApiKeyError} is thrown **before** the SDK is imported or any
 * request is made (reusing the shared `../llm/client.js` plumbing). The SDK
 * loads via dynamic `import()` on the first `narrate` call only.
 */
export function createNarrateClient(llm: LlmOptions, opts: NarrateClientOptions = {}): NarrateClient {
  const apiKey = resolveApiKey(llm);
  if (!apiKey) throw new MissingApiKeyError("explain --narrate");

  const getClient = lazyAnthropic(apiKey);

  return {
    async narrate(prompt: NarratePrompt): Promise<string> {
      const { result, usage } = await structuredCall(getClient, {
        model: llm.model,
        maxTokens: MAX_TOKENS,
        system: prompt.system,
        user: prompt.user,
        parse: (raw: unknown) => (typeof raw === "string" ? raw.trim() : ""),
      });
      opts.onUsage?.(usage);
      return result;
    },
  };
}
