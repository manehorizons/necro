import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { loadConfig } from "../src/config.js";
import { explain } from "../src/engine/explain.js";
import { createNecroServer } from "../src/mcp/server.js";

function textOf(result: { content?: Array<{ type: string; text?: string }> }): string {
  return result.content?.find((c) => c.type === "text")?.text ?? "";
}

async function connectClient(): Promise<Client> {
  const server = createNecroServer();
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test", version: "0" });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return client;
}

let dir: string;

async function write(rel: string, contents: string): Promise<void> {
  const path = join(dir, rel);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, contents);
}

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "necro-mcp-explain-"));
  await write("package.json", JSON.stringify({ name: "fx" }));
  await write("src/index.ts", `import { live } from "./util.js";\nlive();\n`);
  await write(
    "src/util.ts",
    `export function live() {\n  helper();\n}\nfunction helper() {}\n`,
  );
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("necro_explain MCP tool", () => {
  test("AC-4: is registered alongside the other read-only tools", async () => {
    const client = await connectClient();
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name)).toContain("necro_explain");
    const explainTool = tools.find((t) => t.name === "necro_explain");
    expect(explainTool?.annotations?.readOnlyHint).toBe(true);
  });

  test("AC-4: returns the same structured result as the engine (CLI --json parity)", async () => {
    const client = await connectClient();
    const result = (await client.callTool({
      name: "necro_explain",
      arguments: { symbol: "helper", path: dir },
    })) as { content?: Array<{ type: string; text?: string }> };

    const viaTool = JSON.parse(textOf(result));
    // The tool (like necro_scan / the CLI) loads config from the server cwd.
    const viaEngine = JSON.parse(
      JSON.stringify(await explain(dir, await loadConfig(process.cwd()), "helper")),
    );
    expect(viaTool).toEqual(viaEngine);
    expect(viaTool.status).toBe("resolved");
    expect(viaTool.reachability).toBe("alive");
  });
});
