import { describe, expect, test } from "vitest";
import { renderDiff } from "../src/fix/diff.js";
import type { Edit } from "../src/fix/remove.js";

describe("renderDiff (AC-2)", () => {
  test("renders a unified diff with removed lines and the symbol name", () => {
    const edit: Edit = {
      file: "/repo/src/util.ts",
      before: "export function live() {}\nfunction deadFn() {}\n",
      after: "export function live() {}\n",
    };
    const out = renderDiff([edit], "/repo");

    expect(out).toContain("src/util.ts");
    expect(out).toContain("-function deadFn() {}");
    expect(out).toContain("@@");
  });

  test("no edits → empty string", () => {
    expect(renderDiff([], "/repo")).toBe("");
  });
});
