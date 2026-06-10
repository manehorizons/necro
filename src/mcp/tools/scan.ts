import { resolve } from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { loadConfig } from "../../config.js";
import { scan } from "../../engine/index.js";
import { toJson } from "../../report/json.js";

/**
 * Register `necro_scan` — a read-only wrapper over the engine. It calls
 * `scan()` and serializes with `toJson()`; there is deliberately no scanning
 * logic here (the golden-equality test forbids a fork). Paths resolve against
 * the server's cwd, which is the agent's project root.
 */
export function registerScanTool(server: McpServer): void {
  server.registerTool(
    "necro_scan",
    {
      title: "Scan for dead/anti-pattern code",
      description:
        "Read-only. Find dead code (with confidence tiers + evidence chains), complexity, hotspots, and duplication. Returns the same JSON as `necro scan --json`. Never edits files.",
      inputSchema: {
        path: z.string().optional().describe("directory or file to scan (default: cwd)"),
        top: z.number().int().positive().optional().describe("show only the worst N dead-code findings"),
        coverage: z.string().optional().describe("path to an lcov report"),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ path, top, coverage }) => {
      const target = resolve(process.cwd(), path ?? ".");
      const config = await loadConfig(process.cwd());
      if (coverage) config.coveragePath = coverage;
      const { findings, complexity, hotspots, duplication } = await scan(target, config);
      const shown = top && top > 0 ? findings.slice(0, top) : findings;
      return { content: [{ type: "text", text: toJson({ findings: shown, complexity, hotspots, duplication }) }] };
    },
  );
}
