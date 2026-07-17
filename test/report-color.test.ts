import { afterEach, describe, expect, test } from "vitest";
import { dim, green, red, supportsColor, yellow } from "../src/report/color.js";

function stream(isTTY: boolean): NodeJS.WriteStream {
  return { isTTY } as NodeJS.WriteStream;
}

describe("supportsColor", () => {
  const original = process.env.NO_COLOR;

  afterEach(() => {
    if (original === undefined) delete process.env.NO_COLOR;
    else process.env.NO_COLOR = original;
  });

  test("true when the stream is a TTY and NO_COLOR is unset", () => {
    delete process.env.NO_COLOR;
    expect(supportsColor(stream(true))).toBe(true);
  });

  test("false when the stream is not a TTY", () => {
    delete process.env.NO_COLOR;
    expect(supportsColor(stream(false))).toBe(false);
  });

  test("false when NO_COLOR is set, even on a TTY", () => {
    process.env.NO_COLOR = "1";
    expect(supportsColor(stream(true))).toBe(false);
  });
});

describe("color wrappers", () => {
  test("wrap text in ANSI codes when enabled", () => {
    expect(red("x", true)).not.toBe("x");
    expect(yellow("x", true)).not.toBe("x");
    expect(dim("x", true)).not.toBe("x");
    expect(green("x", true)).not.toBe("x");
  });

  test("pass text through unchanged when disabled", () => {
    expect(red("x", false)).toBe("x");
    expect(yellow("x", false)).toBe("x");
    expect(dim("x", false)).toBe("x");
    expect(green("x", false)).toBe("x");
  });

  test("wrapped text still contains the original text", () => {
    expect(red("orphan", true)).toContain("orphan");
  });
});
