import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { ClassifiedFinding, Tier } from "../src/analyze/classify.js";
import { DEFAULT_LLM } from "../src/config.js";
import type { TriageClient } from "../src/triage/client.js";
import { runTriage } from "../src/triage/index.js";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "necro-triage-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

async function findingAt(name: string, tier: Tier): Promise<ClassifiedFinding> {
  const file = join(dir, `${name}.ts`);
  await writeFile(file, `export function ${name}() {\n  return 1;\n}\n`);
  return {
    node: { id: `${file}:1:${name}`, name, file, line: 1, exported: true },
    verdict: "dead",
    tier,
    autoFixEligible: tier === "certain",
    evidence: [{ ok: true, text: "0 static references (TS compiler)" }],
  };
}

function mockClient(): TriageClient & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    async classify(prompt) {
      // record the symbol name from the user message
      const m = prompt.user.match(/Symbol: (\w+)/);
      calls.push(m?.[1] ?? "?");
      return { verdict: "likely-dead", reasoning: "mock verdict" };
    },
  };
}

describe("runTriage (AC-1, AC-4)", () => {
  test("sends only maybe-tier findings to the client (AC-1)", async () => {
    const findings = [
      await findingAt("certainFn", "certain"),
      await findingAt("likelyFn", "likely"),
      await findingAt("maybeFn", "maybe"),
    ];
    const client = mockClient();

    const res = await runTriage(findings, DEFAULT_LLM, client);

    expect(client.calls).toEqual(["maybeFn"]); // certain/likely never sent
    expect(res.triaged).toHaveLength(1);
    expect(res.triaged[0]?.verdict).toBe("likely-dead");
    expect(res.triaged[0]?.model).toBe(DEFAULT_LLM.model);
  });

  test("zero maybe findings → no client calls, empty result (AC-1)", async () => {
    const findings = [await findingAt("a", "certain"), await findingAt("b", "likely")];
    const client = mockClient();

    const res = await runTriage(findings, DEFAULT_LLM, client);

    expect(client.calls).toEqual([]);
    expect(res.triaged).toEqual([]);
    expect(res.consideredMaybe).toBe(0);
  });

  test("never mutates tier or autoFixEligible — verdict is advisory (AC-4)", async () => {
    const maybe = await findingAt("maybeFn", "maybe");
    const client = mockClient();

    const res = await runTriage([maybe], DEFAULT_LLM, client);

    // original object untouched
    expect(maybe.tier).toBe("maybe");
    expect(maybe.autoFixEligible).toBe(false);
    // carried-through finding untouched too
    expect(res.triaged[0]?.finding.tier).toBe("maybe");
    expect(res.triaged[0]?.finding.autoFixEligible).toBe(false);
  });

  test("respects the maxFindings spend cap and reports dropped (AC-1)", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const findings = [
      await findingAt("m1", "maybe"),
      await findingAt("m2", "maybe"),
      await findingAt("m3", "maybe"),
    ];
    const client = mockClient();

    const res = await runTriage(findings, { ...DEFAULT_LLM, maxFindings: 2 }, client);

    expect(client.calls).toHaveLength(2);
    expect(res.consideredMaybe).toBe(3);
    expect(res.dropped).toBe(1);
  });
});
