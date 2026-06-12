import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { DEFAULT_CONFIG } from "../src/config.js";
import { explain } from "../src/engine/explain.js";
import type { NarrateClient } from "../src/explain/client.js";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "necro-narrate-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

async function write(rel: string, contents: string): Promise<void> {
  const path = join(dir, rel);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, contents);
}

async function fixture(): Promise<void> {
  await write("src/index.ts", `import { live } from "./util";\nlive();\n`);
  await write("src/util.ts", `export function live() {\n  helper();\n}\nfunction helper() {}\n`);
}

const fakeClient = (text: string): NarrateClient => ({
  narrate: async () => text,
});

const throwingClient = (): NarrateClient => ({
  narrate: async () => {
    throw new Error("boom");
  },
});

describe("explain narrative layer", () => {
  test("AC-1: a resolved symbol gets the narrator's prose attached", async () => {
    await fixture();
    const result = await explain(dir, DEFAULT_CONFIG, "helper", {
      narrate: fakeClient("helper is alive because the entry calls live(), which calls it."),
    });
    if (result.status !== "resolved") throw new Error(`expected resolved, got ${result.status}`);
    expect(result.narrative).toContain("helper is alive");
  });

  test("AC-1: without a narrate client the result has no prose (null)", async () => {
    await fixture();
    const result = await explain(dir, DEFAULT_CONFIG, "helper");
    if (result.status !== "resolved") throw new Error(`expected resolved, got ${result.status}`);
    expect(result.narrative ?? null).toBeNull();
  });

  test("AC-1: an unresolved query is never narrated", async () => {
    await fixture();
    const result = await explain(dir, DEFAULT_CONFIG, "doesNotExist", {
      narrate: fakeClient("should never be called"),
    });
    expect(result.status).toBe("not-found");
  });

  test("AC-2: a narrator error degrades to null, the verdict survives", async () => {
    await fixture();
    const result = await explain(dir, DEFAULT_CONFIG, "helper", { narrate: throwingClient() });
    if (result.status !== "resolved") throw new Error(`expected resolved, got ${result.status}`);
    expect(result.reachability).toBe("alive"); // static verdict intact
    expect(result.narrative ?? null).toBeNull(); // prose degraded, no throw
  });
});
