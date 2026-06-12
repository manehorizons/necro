import { describe, expect, test } from "vitest";
import type { ExplainResult } from "../src/engine/explain.js";
import { buildNarratePrompt, type NarrateSnippet } from "../src/explain/prompt.js";

type Resolved = Extract<ExplainResult, { status: "resolved" }>;

const aliveResult: Resolved = {
  query: "helper",
  status: "resolved",
  symbol: { id: "src/util.ts:3:helper", name: "helper", file: "src/util.ts", line: 3 },
  reachability: "alive",
  tainted: false,
  witness: [
    { id: "src/index.ts", name: "index.ts", file: null, line: null },
    { id: "src/util.ts:1:live", name: "live", file: "src/util.ts", line: 1 },
    { id: "src/util.ts:3:helper", name: "helper", file: "src/util.ts", line: 3 },
  ],
  inbound: [],
};

const snippets: NarrateSnippet[] = [
  { name: "helper", location: "src/util.ts:3", code: "function helper() {}" },
];

describe("buildNarratePrompt (AC-1)", () => {
  test("system prompt forbids re-judging reachability", () => {
    const { system } = buildNarratePrompt(aliveResult, snippets);
    expect(system.toLowerCase()).toMatch(/do not.*(re-?judge|re-?derive|decide)|given verdict|already dec/);
  });

  test("user message carries the verdict, the witness chain names, and the snippet", () => {
    const { user } = buildNarratePrompt(aliveResult, snippets);
    expect(user).toContain("helper");
    expect(user).toContain("alive");
    expect(user).toContain("live"); // a witness-chain hop
    expect(user).toContain("function helper() {}"); // the snippet body
  });
});
