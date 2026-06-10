import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

/**
 * Build the necro MCP server: a read-only, agent-callable surface over the
 * existing engine. Tools are registered here; the server itself never mutates
 * the user's working tree and never wraps an LLM.
 */
export function createNecroServer(): McpServer {
  const server = new McpServer({ name: "necro", version: "0.0.0" });
  // Tools are registered by the tool modules (necro_scan, necro_verify).
  return server;
}

/** Start the server on stdio — the entry point for the `necro mcp` command. */
export async function runStdio(): Promise<void> {
  const server = createNecroServer();
  await server.connect(new StdioServerTransport());
}
