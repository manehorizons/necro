import type { LlmOptions } from "../config.js";
import { lazyAnthropic, MissingApiKeyError, resolveApiKey } from "../triage/client.js";
import { parseProposal, PROPOSAL_SCHEMA, type ProposalResult, type RefactorPrompt } from "./prompt.js";

/** The one capability refactor needs from a model backend — injectable so tests
 * run against a mock with no network. */
export interface RefactorClient {
  propose(prompt: RefactorPrompt): Promise<ProposalResult>;
}

/** A unified diff plus rationale is larger than a triage verdict. */
const MAX_TOKENS = 8192;

/**
 * Build the real Claude-backed refactor client. The key is resolved up front and
 * a {@link MissingApiKeyError} is thrown **before** the SDK is imported or any
 * request is made. The SDK is loaded lazily via the shared {@link lazyAnthropic}
 * helper, so `scan`/`fix` never pull it in.
 */
export function createRefactorClient(llm: LlmOptions): RefactorClient {
  const apiKey = resolveApiKey(llm);
  if (!apiKey) throw new MissingApiKeyError("refactor");

  const getClient = lazyAnthropic(apiKey);

  return {
    async propose(prompt: RefactorPrompt): Promise<ProposalResult> {
      const client = await getClient();
      const res = await client.messages.create({
        model: llm.model,
        max_tokens: MAX_TOKENS,
        thinking: { type: "adaptive" },
        output_config: {
          format: { type: "json_schema", schema: PROPOSAL_SCHEMA as Record<string, unknown> },
        },
        system: prompt.system,
        messages: [{ role: "user", content: prompt.user }],
      });
      const text = res.content.find((b) => b.type === "text");
      if (!text || text.type !== "text") return parseProposal(undefined);
      let parsed: unknown;
      try {
        parsed = JSON.parse(text.text);
      } catch {
        parsed = text.text;
      }
      return parseProposal(parsed);
    },
  };
}
