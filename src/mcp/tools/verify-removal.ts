import { resolve } from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { loadConfig, resolveConfigDir } from "../../config.js";
import { verifyRemovals } from "../../engine/verify-removal.js";
import type { VerifyToolDeps } from "./verify.js";

/**
 * Register `necro_verify_removal` — for each named symbol, plan its deletion
 * with the ts-morph removal engine and verify it independently in a throwaway
 * git worktree: does deleting symbol X keep the build green? Read-only w.r.t.
 * the working tree (each removal is checked in its own scratch worktree, always
 * torn down). Reuses the same injected runner as `necro_verify`.
 */
export function registerVerifyRemovalTool(server: McpServer, deps: VerifyToolDeps = {}): void {
  server.registerTool(
    "necro_verify_removal",
    {
      title: "Verify whether deleting symbols keeps the build green",
      description:
        "Read-only w.r.t. your working tree. For each symbol, plan its removal and verify it in its own throwaway git worktree (checks default: typecheck + tests). Returns a per-symbol verdict: green (safe to delete), red (breaks the build), or unresolved. Runs a full typecheck+test cycle per symbol, so this can take from seconds to minutes depending on repo size and check commands — supports MCP progress notifications (send a progressToken) so long calls don't hit a client's default timeout. Use to confirm dead-code removals before you apply them.",
      inputSchema: {
        symbols: z
          .array(z.string())
          .min(1)
          .describe("symbols to test-remove: name, file:name, or file:line:name"),
        path: z.string().optional().describe("directory or file to analyze (default: cwd)"),
        checks: z.array(z.string()).optional().describe("commands to run (default: typecheck + tests)"),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ symbols, path, checks }, extra) => {
      const target = resolve(process.cwd(), path ?? ".");
      const config = await loadConfig(await resolveConfigDir(target));
      const progressToken = extra._meta?.progressToken;
      const results = await verifyRemovals(target, config, symbols, {
        repoRoot: process.cwd(),
        runnerFactory: deps.runnerFactory,
        checks: checks ?? deps.checks,
        onProgress:
          progressToken === undefined
            ? undefined
            : (symbol, index, total) =>
                void extra.sendNotification({
                  method: "notifications/progress",
                  params: { progressToken, progress: index, total, message: symbol },
                }),
      });
      return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
    },
  );
}
