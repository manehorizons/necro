import type { LlmOptions } from "../config.js";
import {
  type LlmUsage,
  lazyAnthropic,
  MissingApiKeyError,
  resolveApiKey,
  structuredCall,
} from "../llm/client.js";
import { hostCliStructuredCall } from "../llm/host-cli-client.js";
import type { DuplicationFinding } from "../syntactic/types.js";
import {
  DUP_PROPOSAL_SCHEMA,
  type DuplicateProposalResult,
  PROPOSAL_SCHEMA,
  type ProposalResult,
  parseDuplicateProposal,
  parseProposal,
  type RefactorPrompt,
} from "./prompt.js";

/** The capabilities refactor needs from a model backend — injectable so tests
 * run against a mock with no network. One method per refactor type. */
export interface RefactorClient {
  /** Propose a god-function split. */
  propose(prompt: RefactorPrompt): Promise<ProposalResult>;
  /** Propose an extract-duplicate refactor for `finding` (used to validate the
   * response covers the actual clone group). */
  proposeDuplicate(
    prompt: RefactorPrompt,
    finding: DuplicationFinding,
  ): Promise<DuplicateProposalResult>;
}

export interface RefactorClientOptions {
  /** Called once per model call with that call's token usage. */
  onUsage?: (usage: LlmUsage) => void;
}

/** A unified diff plus rationale is larger than a triage verdict. */
const MAX_TOKENS = 8192;

/**
 * Build the real Claude-backed refactor client. When `llm.provider` is
 * `"host-cli"`, calls shell out to an already-authenticated `claude` binary
 * headlessly and no API key is required. Otherwise (the default) the key is
 * resolved up front and a {@link MissingApiKeyError} is thrown **before** the
 * SDK is imported or any request is made. The SDK is loaded lazily via the
 * shared `../llm/client.js` helpers, so `scan`/`fix` never pull it in.
 */
export function createRefactorClient(
  llm: LlmOptions,
  opts: RefactorClientOptions = {},
): RefactorClient {
  if (llm.provider === "host-cli") {
    return {
      async propose(prompt: RefactorPrompt): Promise<ProposalResult> {
        const { result, usage } = await hostCliStructuredCall({
          bin: llm.hostCliBin,
          model: llm.model,
          schema: PROPOSAL_SCHEMA,
          system: prompt.system,
          user: prompt.user,
          parse: parseProposal,
        });
        opts.onUsage?.(usage);
        return result;
      },

      async proposeDuplicate(
        prompt: RefactorPrompt,
        finding: DuplicationFinding,
      ): Promise<DuplicateProposalResult> {
        const { result, usage } = await hostCliStructuredCall({
          bin: llm.hostCliBin,
          model: llm.model,
          schema: DUP_PROPOSAL_SCHEMA,
          system: prompt.system,
          user: prompt.user,
          parse: (raw) => parseDuplicateProposal(raw, finding),
        });
        opts.onUsage?.(usage);
        return result;
      },
    };
  }

  const apiKey = resolveApiKey(llm);
  if (!apiKey) throw new MissingApiKeyError("refactor");

  const getClient = lazyAnthropic(apiKey);

  return {
    async propose(prompt: RefactorPrompt): Promise<ProposalResult> {
      const { result, usage } = await structuredCall(getClient, {
        model: llm.model,
        maxTokens: MAX_TOKENS,
        thinking: true,
        schema: PROPOSAL_SCHEMA,
        system: prompt.system,
        user: prompt.user,
        parse: parseProposal,
      });
      opts.onUsage?.(usage);
      return result;
    },

    async proposeDuplicate(
      prompt: RefactorPrompt,
      finding: DuplicationFinding,
    ): Promise<DuplicateProposalResult> {
      const { result, usage } = await structuredCall(getClient, {
        model: llm.model,
        maxTokens: MAX_TOKENS,
        thinking: true,
        schema: DUP_PROPOSAL_SCHEMA,
        system: prompt.system,
        user: prompt.user,
        parse: (raw) => parseDuplicateProposal(raw, finding),
      });
      opts.onUsage?.(usage);
      return result;
    },
  };
}
