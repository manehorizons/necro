import { describe, expect, test } from "vitest";
import { parseCobertura } from "../src/analyze/coverage/cobertura.js";

const SAMPLE = [
  '<?xml version="1.0" ?>',
  "<coverage line-rate=\"0.5\" version=\"7.4.0\">",
  "  <packages>",
  '    <package name="pkg" line-rate="0.5">',
  "      <classes>",
  '        <class name="core" filename="pkg/core.py" line-rate="0.5">',
  "          <methods/>",
  "          <lines>",
  '            <line number="1" hits="1"/>',
  '            <line number="4" hits="0"/>',
  "          </lines>",
  "        </class>",
  "      </classes>",
  "    </package>",
  "  </packages>",
  "</coverage>",
].join("\n");

describe("parseCobertura (AC-1)", () => {
  test("parses <class filename>/<line number hits> records grouped by file", () => {
    const report = parseCobertura(SAMPLE);

    const core = report.files.get("pkg/core.py");
    expect(core).toBeDefined();
    expect(core?.lines.get(1)).toBe(1);
    expect(core?.lines.get(4)).toBe(0);
    expect(core?.fns).toEqual([]);
  });

  test("merges multiple <class> blocks naming the same filename", () => {
    const raw = [
      "<coverage>",
      '  <class filename="pkg/core.py"><lines><line number="1" hits="2"/></lines></class>',
      '  <class filename="pkg/core.py"><lines><line number="9" hits="0"/></lines></class>',
      "</coverage>",
    ].join("\n");

    const report = parseCobertura(raw);
    const core = report.files.get("pkg/core.py");
    expect(core?.lines.get(1)).toBe(2);
    expect(core?.lines.get(9)).toBe(0);
  });

  test("no <class> blocks → empty report", () => {
    const report = parseCobertura("<coverage></coverage>");
    expect(report.files.size).toBe(0);
  });
});
