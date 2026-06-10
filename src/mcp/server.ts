import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerScanTool } from "./tools/scan.js";
import { registerVerifyTool, type VerifyToolDeps } from "./tools/verify.js";

/** Injectable dependencies (the verify worktree runner is faked in tests). */
export type ServerDeps = VerifyToolDeps;

/**
 * Build the necro MCP server: a read-only, agent-callable surface over the
 * existing engine. Tools are registered here; the server itself never mutates
 * the user's working tree and never wraps an LLM.
 */
export function createNecroServer(deps: ServerDeps = {}): McpServer {
  const server = new McpServer({ name: "necro", version: "0.0.0" });
  registerScanTool(server);
  registerVerifyTool(server, deps);
  return server;
}

/** Start the server on stdio — the entry point for the `necro mcp` command. */
export async function runStdio(): Promise<void> {
  const server = createNecroServer();
  await server.connect(new StdioServerTransport());
}
