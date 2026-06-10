import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, test } from "vitest";
import { createNecroServer } from "../src/mcp/server.js";

/** Connect a fresh in-process client to a fresh necro MCP server over a linked
 * in-memory transport pair (no stdio, no subprocess). */
async function connectClient(): Promise<Client> {
  const server = createNecroServer();
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test", version: "0" });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return client;
}

describe("necro MCP server", () => {
  test("completes the MCP handshake exposing the necro server identity (AC-1)", async () => {
    const client = await connectClient();
    expect(client.getServerVersion()?.name).toBe("necro");
  });
});
