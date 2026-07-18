import type { LlmOptions } from "../config.js";
import { lazyAnthropic, type LlmUsage, MissingApiKeyError, resolveApiKey, structuredCall } from "../llm/client.js";
import { hostCliStructuredCall } from "../llm/host-cli-client.js";
import { parseVerdict, VERDICT_SCHEMA, type TriagePrompt, type TriageResult } from "./prompt.js";

/** The one capability triage needs from a model backend — injectable so tests
 * run against a mock with no network. */
export interface TriageClient {
  classify(prompt: TriagePrompt): Promise<TriageResult>;
}

export interface TriageClientOptions {
  /** Called once per model call with that call's token usage. */
  onUsage?: (usage: LlmUsage) => void;
}

/** A short verdict + a sentence or two of reasoning fit comfortably here. */
const MAX_TOKENS = 2048;

/**
 * Build the real Claude-backed client. When `llm.provider` is `"host-cli"`,
 * calls shell out to an already-authenticated `claude` binary headlessly and
 * no API key is required. Otherwise (the default) the key is resolved up
 * front and a {@link MissingApiKeyError} is thrown **before** the SDK is
 * imported or any request is made; the runtime SDK module is loaded lazily
 * (via `../llm/client.js`) only on the first `classify` call, so `scan`/`fix`
 * never pull it in.
 */
export function createTriageClient(llm: LlmOptions, opts: TriageClientOptions = {}): TriageClient {
  if (llm.provider === "host-cli") {
    return {
      async classify(prompt: TriagePrompt): Promise<TriageResult> {
        const { result, usage } = await hostCliStructuredCall({
          bin: llm.hostCliBin,
          model: llm.model,
          schema: VERDICT_SCHEMA,
          system: prompt.system,
          user: prompt.user,
          parse: parseVerdict,
        });
        opts.onUsage?.(usage);
        return result;
      },
    };
  }

  const apiKey = resolveApiKey(llm);
  if (!apiKey) throw new MissingApiKeyError();

  const getClient = lazyAnthropic(apiKey);

  return {
    async classify(prompt: TriagePrompt): Promise<TriageResult> {
      const { result, usage } = await structuredCall(getClient, {
        model: llm.model,
        maxTokens: MAX_TOKENS,
        thinking: true,
        schema: VERDICT_SCHEMA,
        system: prompt.system,
        user: prompt.user,
        parse: parseVerdict,
      });
      opts.onUsage?.(usage);
      return result;
    },
  };
}
