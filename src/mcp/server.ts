import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { VERSION } from "../version.js";
import { type ExplainToolDeps, registerExplainTool } from "./tools/explain.js";
import { registerScanTool } from "./tools/scan.js";
import { registerVerifyTool, type VerifyToolDeps } from "./tools/verify.js";
import { registerVerifyRemovalTool } from "./tools/verify-removal.js";

/** Injectable dependencies (the verify runner + narrator are faked in tests). */
export type ServerDeps = VerifyToolDeps & ExplainToolDeps;

/**
 * Build the necro MCP server: a read-only, agent-callable surface over the
 * existing engine. Tools are registered here; the server itself never mutates
 * the user's working tree and never wraps an LLM.
 */
export function createNecroServer(deps: ServerDeps = {}): McpServer {
  const server = new McpServer({ name: "necro", version: VERSION });
  registerScanTool(server);
  registerVerifyTool(server, deps);
  registerVerifyRemovalTool(server, deps);
  registerExplainTool(server, deps);
  return server;
}

/** Start the server on stdio — the entry point for the `necro mcp` command. */
export async function runStdio(): Promise<void> {
  const server = createNecroServer();
  await server.connect(new StdioServerTransport());
}
