import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { DEFAULT_CHECKS } from "../../refactor/index.js";
import {
  gitWorktreeRunner,
  type VerifyRunner,
  verifyEdits,
} from "../../refactor/verify.js";

export interface VerifyToolDeps {
  /** Build the worktree runner for a repo root (injected for tests). */
  runnerFactory?: (repoRoot: string) => VerifyRunner;
  /** Checks run in the throwaway worktree (default: typecheck + tests). */
  checks?: string[];
}

/**
 * Register `necro_verify` — apply a set of full-file edits in a throwaway git
 * worktree, run the checks, and report pass/fail. Reuses `verifyEdits` +
 * `gitWorktreeRunner` as-is: the user's working tree is never touched and the
 * worktree is always torn down.
 */
export function registerVerifyTool(
  server: McpServer,
  deps: VerifyToolDeps = {},
): void {
  const runnerFactory = deps.runnerFactory ?? gitWorktreeRunner;
  const defaultChecks = deps.checks ?? DEFAULT_CHECKS;

  server.registerTool(
    "necro_verify",
    {
      title: "Verify edits in an isolated worktree",
      description:
        "Read-only w.r.t. your working tree. Apply full-file edits in a throwaway git worktree, run checks (default: typecheck + tests), and report pass/fail. Runs a full typecheck+test cycle, so this can take from seconds to minutes depending on repo size and check commands. Use to confirm an edit before you apply it yourself.",
      inputSchema: {
        edits: z
          .array(z.object({ file: z.string(), content: z.string() }))
          .min(1)
          .describe(
            "full-file replacements, file paths relative to the repo root",
          ),
        checks: z
          .array(z.string())
          .optional()
          .describe("commands to run (default: typecheck + tests)"),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ edits, checks }) => {
      const badge = await verifyEdits(
        edits,
        checks ?? defaultChecks,
        runnerFactory(process.cwd()),
      );
      const result =
        badge.status === "green"
          ? { ok: true, output: "" }
          : { ok: false, output: badge.output };
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    },
  );
}
