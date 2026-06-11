import { resolve } from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { loadConfig } from "../../config.js";
import { explain } from "../../engine/explain.js";

/**
 * Register `necro_explain` — a read-only wrapper over the engine's `explain()`.
 * Returns the same structured JSON as `necro explain --json`; there is no
 * tracing logic here (the parity test forbids a fork). Paths resolve against
 * the server's cwd, which is the agent's project root.
 */
export function registerExplainTool(server: McpServer): void {
  server.registerTool(
    "necro_explain",
    {
      title: "Explain why a symbol is alive, test-only, or dead",
      description:
        "Read-only. Trace the reachability witness chain for a symbol (or, for dead symbols, its inbound referrers annotated by verdict). Returns the same JSON as `necro explain --json`. Never edits files.",
      inputSchema: {
        symbol: z
          .string()
          .describe("symbol to explain: name, file:name, or file:line:name"),
        path: z.string().optional().describe("directory or file to analyze (default: cwd)"),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ symbol, path }) => {
      const target = resolve(process.cwd(), path ?? ".");
      const config = await loadConfig(process.cwd());
      const result = await explain(target, config, symbol);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    },
  );
}
