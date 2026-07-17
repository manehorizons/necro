import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, test, vi } from "vitest";
import { structuredCall } from "../src/llm/client.js";

/** Minimal fake Anthropic client — only `messages.create` is ever touched by
 * `structuredCall`, so nothing else needs to exist on the object. */
function fakeClient(create: (params: unknown) => Promise<unknown> | unknown) {
  return { messages: { create: vi.fn(create) } } as unknown as Anthropic;
}

function response(opts: { text?: string; input?: number; output?: number }) {
  const { text, input = 12, output = 34 } = opts;
  return {
    content: text === undefined ? [] : [{ type: "text", text }],
    usage: { input_tokens: input, output_tokens: output },
  };
}

describe("structuredCall (AC-2)", () => {
  test("schema-based JSON response is parsed and passed to parse (AC-2)", async () => {
    const client = fakeClient(() => response({ text: '{"a":1}' }));
    const parse = vi.fn((raw: unknown) => raw);
    const { result, usage } = await structuredCall(async () => client, {
      model: "m",
      maxTokens: 10,
      system: "sys",
      user: "usr",
      schema: { type: "object" },
      parse,
    });
    expect(parse).toHaveBeenCalledWith({ a: 1 });
    expect(result).toEqual({ a: 1 });
    expect(usage).toEqual({ inputTokens: 12, outputTokens: 34 });
  });

  test("malformed JSON text falls back to the raw string passed to parse (AC-2)", async () => {
    const client = fakeClient(() => response({ text: "not json" }));
    const parse = vi.fn((raw: unknown) => raw);
    const { result } = await structuredCall(async () => client, {
      model: "m",
      maxTokens: 10,
      system: "sys",
      user: "usr",
      parse,
    });
    expect(parse).toHaveBeenCalledWith("not json");
    expect(result).toBe("not json");
  });

  test("no text block passes undefined to parse (AC-2)", async () => {
    const client = fakeClient(() => response({}));
    const parse = vi.fn((raw: unknown) => raw);
    await structuredCall(async () => client, { model: "m", maxTokens: 10, system: "sys", user: "usr", parse });
    expect(parse).toHaveBeenCalledWith(undefined);
  });

  test("usage is always returned regardless of parse outcome (AC-2)", async () => {
    const client = fakeClient(() => response({ text: "not json", input: 5, output: 7 }));
    const { result, usage } = await structuredCall(async () => client, {
      model: "m",
      maxTokens: 10,
      system: "sys",
      user: "usr",
      parse: () => ({ ok: false as const, reason: "unparseable" }),
    });
    expect(result).toEqual({ ok: false, reason: "unparseable" });
    expect(usage).toEqual({ inputTokens: 5, outputTokens: 7 });
  });

  test("schema/thinking omitted → request body omits output_config/thinking keys (AC-2)", async () => {
    let seen: Record<string, unknown> = {};
    const client = fakeClient((params) => {
      seen = params as Record<string, unknown>;
      return response({ text: "hi" });
    });
    await structuredCall(async () => client, {
      model: "m",
      maxTokens: 10,
      system: "sys",
      user: "usr",
      parse: (raw) => raw,
    });
    expect(seen).not.toHaveProperty("output_config");
    expect(seen).not.toHaveProperty("thinking");
  });

  test("schema present → output_config.format is a json_schema of the given schema (AC-2)", async () => {
    let seen: Record<string, unknown> = {};
    const client = fakeClient((params) => {
      seen = params as Record<string, unknown>;
      return response({ text: "{}" });
    });
    const schema = { type: "object", properties: {} };
    await structuredCall(async () => client, {
      model: "m",
      maxTokens: 10,
      system: "sys",
      user: "usr",
      schema,
      parse: (raw) => raw,
    });
    expect(seen.output_config).toEqual({ format: { type: "json_schema", schema } });
  });

  test("thinking:true → request carries thinking: { type: adaptive } (AC-2)", async () => {
    let seen: Record<string, unknown> = {};
    const client = fakeClient((params) => {
      seen = params as Record<string, unknown>;
      return response({ text: "hi" });
    });
    await structuredCall(async () => client, {
      model: "m",
      maxTokens: 10,
      system: "sys",
      user: "usr",
      thinking: true,
      parse: (raw) => raw,
    });
    expect(seen.thinking).toEqual({ type: "adaptive" });
  });
});
