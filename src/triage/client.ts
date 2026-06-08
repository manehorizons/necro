import type Anthropic from "@anthropic-ai/sdk";
import type { LlmOptions } from "../config.js";
import { parseVerdict, VERDICT_SCHEMA, type TriagePrompt, type TriageResult } from "./prompt.js";

/** Thrown — before any SDK import or network call — when no API key is available.
 * `command` names the entry point (e.g. `triage`, `refactor`) for the message. */
export class MissingApiKeyError extends Error {
  constructor(command = "triage") {
    super(
      `necro ${command} needs an Anthropic API key. Set ANTHROPIC_API_KEY (or llm.apiKey in necro.config.json). No request was made.`,
    );
    this.name = "MissingApiKeyError";
  }
}

/**
 * A memoized factory for the runtime SDK client. `@anthropic-ai/sdk` is loaded
 * via dynamic `import()` on first use only, so importing this helper never
 * pulls the SDK into `scan`/`fix`. Shared by every LLM-backed command.
 */
export function lazyAnthropic(apiKey: string): () => Promise<Anthropic> {
  let clientPromise: Promise<Anthropic> | undefined;
  return () => {
    if (!clientPromise) {
      clientPromise = import("@anthropic-ai/sdk").then((m) => new m.default({ apiKey }));
    }
    return clientPromise;
  };
}

/** The one capability triage needs from a model backend — injectable so tests
 * run against a mock with no network. */
export interface TriageClient {
  classify(prompt: TriagePrompt): Promise<TriageResult>;
}

/** Resolve the API key: `ANTHROPIC_API_KEY` (env) wins, then `llm.apiKey`. */
export function resolveApiKey(llm: LlmOptions): string | undefined {
  const fromEnv = process.env.ANTHROPIC_API_KEY?.trim();
  if (fromEnv) return fromEnv;
  const fromConfig = llm.apiKey?.trim();
  return fromConfig || undefined;
}

/** A short verdict + a sentence or two of reasoning fit comfortably here. */
const MAX_TOKENS = 2048;

/**
 * Build the real Claude-backed client. The key is resolved up front and a
 * {@link MissingApiKeyError} is thrown **before** the SDK is imported or any
 * request is made. The `@anthropic-ai/sdk` runtime module is loaded via dynamic
 * `import()` only on the first `classify` call, so `scan`/`fix` never pull it in.
 */
export function createTriageClient(llm: LlmOptions): TriageClient {
  const apiKey = resolveApiKey(llm);
  if (!apiKey) throw new MissingApiKeyError();

  const getClient = lazyAnthropic(apiKey);

  return {
    async classify(prompt: TriagePrompt): Promise<TriageResult> {
      const client = await getClient();
      const res = await client.messages.create({
        model: llm.model,
        max_tokens: MAX_TOKENS,
        thinking: { type: "adaptive" },
        output_config: {
          format: { type: "json_schema", schema: VERDICT_SCHEMA as Record<string, unknown> },
        },
        system: prompt.system,
        messages: [{ role: "user", content: prompt.user }],
      });
      const text = res.content.find((b) => b.type === "text");
      if (!text || text.type !== "text") return parseVerdict(undefined);
      let parsed: unknown;
      try {
        parsed = JSON.parse(text.text);
      } catch {
        parsed = text.text;
      }
      return parseVerdict(parsed);
    },
  };
}
