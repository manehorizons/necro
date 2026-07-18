import { EventEmitter } from "node:events";
import { describe, expect, test, vi } from "vitest";
import { hostCliStructuredCall, type SpawnedProcessLike, type SpawnFn } from "../src/llm/host-cli-client.js";

/** A fake spawned process driven by hand: emit stdout/stderr data, then close/error. */
class FakeProcess extends EventEmitter implements SpawnedProcessLike {
  stdout = new EventEmitter();
  stderr = new EventEmitter();
  kill = vi.fn();
}

function fakeSpawn(proc: FakeProcess, err?: NodeJS.ErrnoException): SpawnFn {
  return vi.fn(() => {
    if (err) throw err;
    return proc;
  });
}

function envelope(opts: { result?: string; isError?: boolean; usage?: { input_tokens: number; output_tokens: number } }) {
  return JSON.stringify({
    result: opts.result,
    is_error: opts.isError ?? false,
    usage: opts.usage,
  });
}

describe("hostCliStructuredCall (AC-1, AC-2, AC-4)", () => {
  test("a successful envelope is parsed and usage is read off it (AC-1)", async () => {
    const proc = new FakeProcess();
    const spawnImpl = fakeSpawn(proc);
    const parse = vi.fn((raw: unknown) => raw);

    const callPromise = hostCliStructuredCall({
      system: "sys",
      user: "usr",
      schema: { type: "object" },
      parse,
      spawnImpl,
      env: {},
    });

    proc.stdout.emit("data", envelope({ result: '{"a":1}', usage: { input_tokens: 5, output_tokens: 7 } }));
    proc.emit("close", 0);

    const { result, usage } = await callPromise;
    expect(parse).toHaveBeenCalledWith({ a: 1 });
    expect(result).toEqual({ a: 1 });
    expect(usage).toEqual({ inputTokens: 5, outputTokens: 7 });
  });

  test("missing usage on the envelope degrades to zeroed usage, not a thrown error (AC-1)", async () => {
    const proc = new FakeProcess();
    const spawnImpl = fakeSpawn(proc);

    const callPromise = hostCliStructuredCall({
      system: "sys",
      user: "usr",
      parse: (raw: unknown) => raw,
      spawnImpl,
      env: {},
    });
    proc.stdout.emit("data", envelope({ result: "free-form text" }));
    proc.emit("close", 0);

    const { usage } = await callPromise;
    expect(usage).toEqual({ inputTokens: 0, outputTokens: 0 });
  });

  test("binary not found on PATH rejects with a typed not-found HostCliError (AC-2)", async () => {
    const err = Object.assign(new Error("spawn claude ENOENT"), { code: "ENOENT" }) as NodeJS.ErrnoException;
    const spawnImpl = fakeSpawn(new FakeProcess(), err);

    await expect(
      hostCliStructuredCall({ system: "sys", user: "usr", parse: (raw) => raw, spawnImpl, env: {} }),
    ).rejects.toMatchObject({ reason: "not-found" });
  });

  test("non-zero exit rejects with a typed nonzero-exit HostCliError (AC-2)", async () => {
    const proc = new FakeProcess();
    const spawnImpl = fakeSpawn(proc);

    const callPromise = hostCliStructuredCall({ system: "sys", user: "usr", parse: (raw) => raw, spawnImpl, env: {} });
    proc.stderr.emit("data", "auth expired");
    proc.emit("close", 1);

    await expect(callPromise).rejects.toMatchObject({ reason: "nonzero-exit" });
  });

  test("unparseable stdout rejects with a typed output-error HostCliError (AC-2)", async () => {
    const proc = new FakeProcess();
    const spawnImpl = fakeSpawn(proc);

    const callPromise = hostCliStructuredCall({ system: "sys", user: "usr", parse: (raw) => raw, spawnImpl, env: {} });
    proc.stdout.emit("data", "not json at all");
    proc.emit("close", 0);

    await expect(callPromise).rejects.toMatchObject({ reason: "output-error" });
  });

  test("the process is killed and the call rejects with a typed timeout error when stdout never closes (AC-2)", async () => {
    vi.useFakeTimers();
    try {
      const proc = new FakeProcess();
      const spawnImpl = fakeSpawn(proc);

      const callPromise = hostCliStructuredCall({
        system: "sys",
        user: "usr",
        parse: (raw) => raw,
        spawnImpl,
        env: {},
        timeoutMs: 1000,
      });
      const assertion = expect(callPromise).rejects.toMatchObject({ reason: "timeout" });
      await vi.advanceTimersByTimeAsync(1000);
      await assertion;
      expect(proc.kill).toHaveBeenCalledWith("SIGKILL");
    } finally {
      vi.useRealTimers();
    }
  });

  test("refuses to spawn when already running inside a headless Claude Code session (AC-2)", async () => {
    const spawnImpl = fakeSpawn(new FakeProcess());

    await expect(
      hostCliStructuredCall({
        system: "sys",
        user: "usr",
        parse: (raw) => raw,
        spawnImpl,
        env: { CLAUDECODE: "1" },
      }),
    ).rejects.toMatchObject({ reason: "self-invocation" });
    expect(spawnImpl).not.toHaveBeenCalled();
  });
});
