import { describe, expect, test } from "vitest";
import type { HotspotEntry } from "../src/analyze/hotspots.js";
import { renderHotspots } from "../src/report/hotspots.js";

const entry: HotspotEntry = {
  name: "risky",
  file: "/src/risky.ts",
  line: 1,
  complexity: 5,
  coverage: 0,
  crap: 30,
  churn: null,
  risk: 30,
};

describe("renderHotspots (AC-6)", () => {
  test("renders the auditable columns, worst-first", () => {
    const out = renderHotspots([entry], "/");
    expect(out).toContain("Risk hotspots");
    expect(out).toContain("risky");
    expect(out).toContain("src/risky.ts:1");
    expect(out).toContain("cx=5");
    expect(out).toContain("cov=0%");
    expect(out).toContain("crap=30");
    expect(out).toContain("churn=n/a");
  });

  test("empty when there are no hotspots", () => {
    expect(renderHotspots([], "/")).toBe("");
  });
});
