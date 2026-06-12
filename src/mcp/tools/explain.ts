import { resolve } from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { LlmOptions } from "../../config.js";
import { loadConfig } from "../../config.js";
import { explain } from "../../engine/explain.js";
import { createNarrateClient, type NarrateClient } from "../../explain/client.js";
import { MissingApiKeyError } from "../../triage/client.js";

/** Injectable dependencies for the explain tool (the narrator is faked in tests). */
export interface ExplainToolDeps {
  /** Build the narrate client for an llm config (default: the real Claude client). */
  narrateClientFactory?: (llm: LlmOptions) => NarrateClient;
}

/**
 * Register `necro_explain` — a read-only wrapper over the engine's `explain()`.
 * Returns the same structured JSON as `necro explain --json`; there is no
 * tracing logic here (the parity test forbids a fork). Paths resolve against
 * the server's cwd, which is the agent's project root. `narrate:true` adds an
 * additive LLM prose layer — it never fails the call if the key is missing.
 */
export function registerExplainTool(server: McpServer, deps: ExplainToolDeps = {}): void {
  const narrateFactory = deps.narrateClientFactory ?? createNarrateClient;

  server.registerTool(
    "necro_explain",
    {
      title: "Explain why a symbol is alive, test-only, or dead",
      description:
        "Read-only. Trace the reachability witness chain for a symbol (or, for dead symbols, its inbound referrers annotated by verdict). Returns the same JSON as `necro explain --json`. Set narrate:true for an additive LLM plain-English explanation. Never edits files.",
      inputSchema: {
        symbol: z
          .string()
          .describe("symbol to explain: name, file:name, or file:line:name"),
        path: z.string().optional().describe("directory or file to analyze (default: cwd)"),
        narrate: z
          .boolean()
          .optional()
          .describe("add an LLM plain-English explanation of the verdict (needs an API key)"),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ symbol, path, narrate }) => {
      const target = resolve(process.cwd(), path ?? ".");
      const config = await loadConfig(process.cwd());

      // Additive: a missing key degrades to the deterministic trace, never a failure.
      let narrateClient: NarrateClient | undefined;
      if (narrate) {
        try {
          narrateClient = narrateFactory(config.llm);
        } catch (err) {
          if (!(err instanceof MissingApiKeyError)) throw err;
        }
      }

      const result = await explain(target, config, symbol, { narrate: narrateClient });
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    },
  );
}
