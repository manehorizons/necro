import type Anthropic from "@anthropic-ai/sdk";
import type { LlmOptions } from "../config.js";

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
      clientPromise = import("@anthropic-ai/sdk").then(
        (m) => new m.default({ apiKey }),
      );
    }
    return clientPromise;
  };
}

/** Resolve the API key: `ANTHROPIC_API_KEY` (env) wins, then `llm.apiKey`. */
export function resolveApiKey(llm: LlmOptions): string | undefined {
  const fromEnv = process.env.ANTHROPIC_API_KEY?.trim();
  if (fromEnv) return fromEnv;
  const fromConfig = llm.apiKey?.trim();
  return fromConfig || undefined;
}

/** Token accounting for one `messages.create` call. */
export interface LlmUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface StructuredCallOptions<T> {
  model: string;
  maxTokens: number;
  system: string;
  user: string;
  /** JSON-schema-constrained output via `output_config.format`; omit for free-form text. */
  schema?: Record<string, unknown>;
  /** Adaptive extended thinking. */
  thinking?: boolean;
  /** Turn the raw response (JSON-parsed when it parses, else the raw string,
   * else `undefined` when there's no text block) into the caller's result type.
   * Never expected to throw — malformed input should degrade to a failure-shaped
   * result, same as every existing `parse*` function in this codebase. */
  parse: (raw: unknown) => T;
}

export interface StructuredCallResult<T> {
  result: T;
  usage: LlmUsage;
}

/**
 * The shared request→find-text-block→parse sequence for every LLM-backed
 * command: sends one `messages.create` request, extracts the first text
 * content block, hands it to `parse`, and reads `response.usage` — so every
 * caller gets token accounting for free.
 */
export async function structuredCall<T>(
  getClient: () => Promise<Anthropic>,
  opts: StructuredCallOptions<T>,
): Promise<StructuredCallResult<T>> {
  const client = await getClient();
  const res = await client.messages.create({
    model: opts.model,
    max_tokens: opts.maxTokens,
    ...(opts.thinking ? { thinking: { type: "adaptive" } } : {}),
    ...(opts.schema
      ? {
          output_config: {
            format: { type: "json_schema", schema: opts.schema },
          },
        }
      : {}),
    system: opts.system,
    messages: [{ role: "user", content: opts.user }],
  });

  const block = res.content.find((b) => b.type === "text");
  // Only schema-constrained calls (triage/refactor) get their text block JSON-parsed;
  // free-form calls (narrate) hand `parse` the raw prose untouched, matching each
  // client's pre-extraction behavior.
  const raw =
    block && block.type === "text"
      ? opts.schema
        ? jsonOrText(block.text)
        : block.text
      : undefined;

  return {
    result: opts.parse(raw),
    usage: {
      inputTokens: res.usage.input_tokens,
      outputTokens: res.usage.output_tokens,
    },
  };
}

/** Parse text as JSON, falling back to the raw string (so the caller's parser
 * can record a precise failure reason rather than crashing). */
function jsonOrText(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
