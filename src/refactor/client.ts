import type { LlmOptions } from "../config.js";
import type { DuplicationFinding } from "../syntactic/types.js";
import { lazyAnthropic, MissingApiKeyError, resolveApiKey } from "../triage/client.js";
import {
  DUP_PROPOSAL_SCHEMA,
  type DuplicateProposalResult,
  parseDuplicateProposal,
  parseProposal,
  PROPOSAL_SCHEMA,
  type ProposalResult,
  type RefactorPrompt,
} from "./prompt.js";

/** The capabilities refactor needs from a model backend — injectable so tests
 * run against a mock with no network. One method per refactor type. */
export interface RefactorClient {
  /** Propose a god-function split. */
  propose(prompt: RefactorPrompt): Promise<ProposalResult>;
  /** Propose an extract-duplicate refactor for `finding` (used to validate the
   * response covers the actual clone group). */
  proposeDuplicate(prompt: RefactorPrompt, finding: DuplicationFinding): Promise<DuplicateProposalResult>;
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
      return parseProposal(jsonOrText(text.text));
    },

    async proposeDuplicate(prompt: RefactorPrompt, finding: DuplicationFinding): Promise<DuplicateProposalResult> {
      const client = await getClient();
      const res = await client.messages.create({
        model: llm.model,
        max_tokens: MAX_TOKENS,
        thinking: { type: "adaptive" },
        output_config: {
          format: { type: "json_schema", schema: DUP_PROPOSAL_SCHEMA as Record<string, unknown> },
        },
        system: prompt.system,
        messages: [{ role: "user", content: prompt.user }],
      });
      const text = res.content.find((b) => b.type === "text");
      if (!text || text.type !== "text") return parseDuplicateProposal(undefined, finding);
      return parseDuplicateProposal(jsonOrText(text.text), finding);
    },
  };
}

/** Parse model text as JSON, falling back to the raw string (so the schema
 * parser can record a precise failure reason rather than crashing). */
function jsonOrText(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
