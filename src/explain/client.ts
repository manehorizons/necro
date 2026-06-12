import type { LlmOptions } from "../config.js";
import { lazyAnthropic, MissingApiKeyError, resolveApiKey } from "../triage/client.js";
import type { NarratePrompt } from "./prompt.js";

/** The one capability the narrator needs — injectable so tests run with no network. */
export interface NarrateClient {
  narrate(prompt: NarratePrompt): Promise<string>;
}

/** A few sentences of prose fit comfortably here. */
const MAX_TOKENS = 1024;

/**
 * Build the real Claude-backed narrator. The key is resolved up front and a
 * {@link MissingApiKeyError} is thrown **before** the SDK is imported or any
 * request is made (reusing the triage scaffolding). The SDK loads via dynamic
 * `import()` on the first `narrate` call only.
 */
export function createNarrateClient(llm: LlmOptions): NarrateClient {
  const apiKey = resolveApiKey(llm);
  if (!apiKey) throw new MissingApiKeyError("explain --narrate");

  const getClient = lazyAnthropic(apiKey);

  return {
    async narrate(prompt: NarratePrompt): Promise<string> {
      const client = await getClient();
      const res = await client.messages.create({
        model: llm.model,
        max_tokens: MAX_TOKENS,
        system: prompt.system,
        messages: [{ role: "user", content: prompt.user }],
      });
      const text = res.content.find((b) => b.type === "text");
      return text && text.type === "text" ? text.text.trim() : "";
    },
  };
}
