import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
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

/** A fake runner recording orchestration and returning a fixed check outcome. */
function recordingRunner(checkOk: boolean) {
  const events: string[] = [];
  const runner = {
    async createWorktree() {
      events.push("create");
      return "/wt";
    },
    async writeEdit(_wt: string, edit: { file: string; content: string }) {
      events.push(`write:${edit.file}`);
    },
    async runCheck(_wt: string, command: string) {
      events.push(`check:${command}`);
      return { ok: checkOk, output: checkOk ? "" : "tsc: error TS1234" };
    },
    async removeWorktree() {
      events.push("remove");
    },
  };
  return { runner, events };
}

let dir: string;

async function write(rel: string, contents: string): Promise<void> {
  const path = join(dir, rel);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, contents);
}

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "necro-mcp-verify-removal-"));
  await write("package.json", JSON.stringify({ name: "fx" }));
  await write("src/index.ts", `import { live } from "./util.js";\nlive();\n`);
  await write("src/util.ts", `export function live() {}\nexport function orphan() {}\n`);
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("necro_verify_removal MCP tool", () => {
  test("AC-5: is listed with a read-only hint", async () => {
    const client = await connectClient();
    const { tools } = await client.listTools();
    const tool = tools.find((t) => t.name === "necro_verify_removal");
    expect(tool).toBeDefined();
    expect(tool?.annotations?.readOnlyHint).toBe(true);
  });

  test("AC-5: returns per-symbol JSON badges; worktree torn down", async () => {
    const { runner, events } = recordingRunner(true);
    const client = await connectClient({ runnerFactory: () => runner });
    const result = await client.callTool({
      name: "necro_verify_removal",
      arguments: { symbols: ["orphan", "doesNotExist"], path: dir, checks: ["typecheck"] },
    });
    const parsed = JSON.parse(textOf(result as { content?: Array<{ type: string; text?: string }> }));
    expect(parsed.map((r: { symbol: string; status: string }) => [r.symbol, r.status])).toEqual([
      ["orphan", "green"],
      ["doesNotExist", "unresolved"],
    ]);
    // the (faked) worktree was torn down for the resolved symbol
    expect(events).toContain("remove");
  });

  test("AC-3: description carries a duration hint for the per-symbol typecheck+test cycle", async () => {
    const client = await connectClient();
    const { tools } = await client.listTools();
    const tool = tools.find((t) => t.name === "necro_verify_removal");
    expect(tool?.description).toMatch(/minutes/);
  });

  test("AC-1: streams a progress notification per symbol when the caller opts in", async () => {
    const { runner } = recordingRunner(true);
    const client = await connectClient({ runnerFactory: () => runner });
    const progress: Array<{ progress: number; total?: number; message?: string }> = [];

    await client.callTool(
      { name: "necro_verify_removal", arguments: { symbols: ["orphan", "doesNotExist"], path: dir, checks: ["typecheck"] } },
      CallToolResultSchema,
      { onprogress: (p) => progress.push(p) },
    );

    expect(progress).toHaveLength(2);
    expect(progress[0]).toMatchObject({ progress: 1, total: 2, message: "orphan" });
    expect(progress[1]).toMatchObject({ progress: 2, total: 2, message: "doesNotExist" });
  });

  test("AC-2: resolves necro.config.json from the target dir, not the server cwd", async () => {
    await write("necro.config.json", JSON.stringify({ ignore: ["**/node_modules/**", "**/dist/**", "src/util.ts"] }));
    const { runner } = recordingRunner(true);
    const client = await connectClient({ runnerFactory: () => runner });
    const result = await client.callTool({
      name: "necro_verify_removal",
      arguments: { symbols: ["orphan"], path: dir, checks: ["typecheck"] },
    });
    const parsed = JSON.parse(textOf(result as { content?: Array<{ type: string; text?: string }> }));
    // src/util.ts (where `orphan` lives) is now ignored by the target's own config.
    expect(parsed[0].status).toBe("unresolved");
  });

  test("AC-1: sends no progress notification when the caller does not opt in", async () => {
    const { runner } = recordingRunner(true);
    const client = await connectClient({ runnerFactory: () => runner });
    const onerror = vi.fn();
    client.onerror = onerror;

    await client.callTool({
      name: "necro_verify_removal",
      arguments: { symbols: ["orphan"], path: dir, checks: ["typecheck"] },
    });

    // no onprogress opt-in was supplied, so the client never registered a progress
    // token; if the server sent one anyway it would surface as a protocol onerror.
    expect(onerror).not.toHaveBeenCalled();
  });
});
