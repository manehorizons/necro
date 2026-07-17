import { describe, expect, test } from "vitest";
import { toRelativePath } from "../src/report/paths.js";

describe("toRelativePath", () => {
  test("makes an absolute path relative to root", () => {
    expect(toRelativePath("/repo/src/a.ts", "/repo")).toBe("src/a.ts");
  });

  test("passes an already-relative path through unchanged", () => {
    expect(toRelativePath("src/a.ts", "/repo")).toBe("src/a.ts");
  });

  test("normalizes backslashes to forward slashes", () => {
    expect(toRelativePath("/repo/src/a.ts", "/repo")).not.toContain("\\");
  });
});
