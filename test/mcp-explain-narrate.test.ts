import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import type { NarrateClient } from "../src/explain/client.js";
import { createNecroServer } from "../src/mcp/server.js";

function textOf(result: { content?: Array<{ type: string; text?: string }> }): string {
  return result.content?.find((c) => c.type === "text")?.text ?? "";
}

async function connectClient(deps?: Parameters<typeof createNecroServer>[0]): Promise<Client> {
  const server = createNecroServer(deps);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test", version: "0" });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return client;
}

let dir: string;
let narrateCalls: number;

async function write(rel: string, contents: string): Promise<void> {
  const path = join(dir, rel);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, contents);
}

const fakeNarrator: NarrateClient = {
  narrate: async () => {
    narrateCalls += 1;
    return "helper is alive: the entry reaches it through live().";
  },
};

beforeEach(async () => {
  narrateCalls = 0;
  dir = await mkdtemp(join(tmpdir(), "necro-mcp-narrate-"));
  await write("package.json", JSON.stringify({ name: "fx" }));
  await write("src/index.ts", `import { live } from "./util.js";\nlive();\n`);
  await write("src/util.ts", `export function live() {\n  helper();\n}\nfunction helper() {}\n`);
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("necro_explain narrate param", () => {
  test("AC-4: narrate:true returns the injected narrator's prose in the JSON", async () => {
    const client = await connectClient({ narrateClientFactory: () => fakeNarrator });
    const result = await client.callTool({
      name: "necro_explain",
      arguments: { symbol: "helper", path: dir, narrate: true },
    });
    const parsed = JSON.parse(textOf(result as { content?: Array<{ type: string; text?: string }> }));
    expect(parsed.status).toBe("resolved");
    expect(parsed.narrative).toContain("helper is alive");
    expect(narrateCalls).toBe(1);
  });

  test("AC-4: without narrate the tool makes no LLM call and attaches no prose", async () => {
    const client = await connectClient({ narrateClientFactory: () => fakeNarrator });
    const result = await client.callTool({
      name: "necro_explain",
      arguments: { symbol: "helper", path: dir },
    });
    const parsed = JSON.parse(textOf(result as { content?: Array<{ type: string; text?: string }> }));
    expect(parsed.status).toBe("resolved");
    expect(parsed.narrative ?? null).toBeNull();
    expect(narrateCalls).toBe(0);
  });
});
