import { spawn } from "node:child_process";
import type { LlmUsage, StructuredCallResult } from "./client.js";

/** Minimal readable-stream shape this module needs — just the `data` event —
 * so a test fake can be a bare `EventEmitter` instead of a real stream. */
export interface ReadableLike {
  on(event: "data", listener: (chunk: Buffer | string) => void): unknown;
}

/** Minimal spawned-process shape this module needs — narrowed from
 * `node:child_process`'s `ChildProcess` so tests can inject a lightweight
 * fake instead of a real subprocess. */
export interface SpawnedProcessLike {
  stdout: ReadableLike | null;
  stderr: ReadableLike | null;
  on(event: "error", listener: (err: NodeJS.ErrnoException) => void): unknown;
  on(event: "close", listener: (code: number | null) => void): unknown;
  kill?(signal?: NodeJS.Signals): boolean;
}

/** Test seam / real implementation signature: spawn `bin args…`, return the process. */
export type SpawnFn = (bin: string, args: string[]) => SpawnedProcessLike;

/** Real spawn implementation. Piped stdio only — stdin is ignored (not piped)
 * so `claude -p` never blocks waiting on input that will never arrive. */
const realSpawn: SpawnFn = (bin, args) =>
  spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });

export type HostCliErrorReason =
  | "not-found"
  | "spawn-error"
  | "nonzero-exit"
  | "output-error"
  | "timeout"
  | "self-invocation";

/** Distinguishable error type for host-cli spawn/output failures — callers
 * can pattern-match on `reason` instead of parsing `message` text. */
export class HostCliError extends Error {
  readonly reason: HostCliErrorReason;

  constructor(
    message: string,
    reason: HostCliErrorReason,
    options?: { cause?: unknown },
  ) {
    super(message);
    this.name = "HostCliError";
    this.reason = reason;
    if (options?.cause !== undefined) this.cause = options.cause;
  }
}

/** Claude Code sets this to `"1"` in every subprocess it spawns (docs.claude.com/en/docs/claude-code
 * env-vars). Refusing to spawn a nested headless `claude` when it's already set avoids an
 * unbounded self-invocation when necro itself runs inside a Claude Code session. */
const SELF_INVOCATION_ENV_VAR = "CLAUDECODE";

function isSelfInvocation(env: NodeJS.ProcessEnv): boolean {
  return env[SELF_INVOCATION_ENV_VAR] === "1";
}

/** A real headless call (spawning the user's own `claude` binary, which itself calls
 * out to a model) can legitimately take tens of seconds; this bounds the "never exits"
 * failure mode to something well short of a stuck CI job. */
const DEFAULT_TIMEOUT_MS = 3 * 60 * 1000;

export interface HostCliStructuredCallOptions<T> {
  /** Host CLI binary name or path. Defaults to `"claude"`. */
  bin?: string;
  /** Optional model flag; omitted entirely (CLI uses its own default) when unset. */
  model?: string;
  system: string;
  user: string;
  /** JSON Schema describing the expected shape. Since the headless CLI has no
   * API-level schema-constrained output, this is appended to the prompt as an
   * explicit instruction rather than enforced by the transport. */
  schema?: Record<string, unknown>;
  /** Never expected to throw — same contract as `structuredCall`'s `parse`. */
  parse: (raw: unknown) => T;
  /** Test seam; defaults to a real `node:child_process.spawn` wrapper. */
  spawnImpl?: SpawnFn;
  /** Test seam for the self-invocation guard; defaults to `process.env`. */
  env?: NodeJS.ProcessEnv;
  /** Subprocess spawn timeout override (ms); defaults to {@link DEFAULT_TIMEOUT_MS}. */
  timeoutMs?: number;
}

function buildPrompt(o: {
  system: string;
  user: string;
  schema?: Record<string, unknown>;
}): string {
  const parts = [`[SYSTEM]\n${o.system}`, `[USER]\n${o.user}`];
  if (o.schema) {
    parts.push(
      `[FORMAT]\nRespond with ONLY a single JSON object matching this schema — no prose, no code fences:\n${JSON.stringify(o.schema)}`,
    );
  }
  return parts.join("\n\n");
}

function buildInvocation(o: {
  prompt: string;
  model: string | undefined;
}): string[] {
  const args = ["-p", o.prompt, "--output-format", "json"];
  if (o.model) args.push("--model", o.model);
  return args;
}

function toHostCliError(bin: string, err: unknown): HostCliError {
  const errno = err as NodeJS.ErrnoException;
  if (errno?.code === "ENOENT") {
    return new HostCliError(
      `host-cli provider: binary "${bin}" not found on PATH`,
      "not-found",
      { cause: err },
    );
  }
  return new HostCliError(
    `host-cli provider: failed to spawn "${bin}": ${err instanceof Error ? err.message : String(err)}`,
    "spawn-error",
    { cause: err },
  );
}

/** Spawns `bin args…`, captures stdout/stderr, and settles on process exit or
 * the spawn timeout, whichever comes first. `settled` guards against a
 * double-settle race between the timeout timer and the child's listeners. */
function spawnCapture(
  spawnImpl: SpawnFn,
  bin: string,
  args: string[],
  timeoutMs: number,
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    let child: SpawnedProcessLike;
    try {
      child = spawnImpl(bin, args);
    } catch (err) {
      reject(toHostCliError(bin, err));
      return;
    }

    let stdout = "";
    let stderr = "";
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill?.("SIGKILL");
      reject(
        new HostCliError(
          `host-cli provider: "${bin}" timed out after ${timeoutMs}ms without closing stdout or exiting — the subprocess was killed.`,
          "timeout",
        ),
      );
    }, timeoutMs);

    child.stdout?.on("data", (chunk: Buffer | string) => {
      stdout += chunk.toString();
    });
    child.stderr?.on("data", (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });
    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(toHostCliError(bin, err));
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code !== 0) {
        reject(
          new HostCliError(
            `host-cli provider: "${bin}" exited with code ${code ?? "null"}${stderr.trim() ? `: ${stderr.trim()}` : ""}`,
            "nonzero-exit",
          ),
        );
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

/** Parse text as JSON, falling back to the raw string — same tolerant contract
 * `structuredCall` gives its callers' `parse` functions. */
function jsonOrText(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

interface ClaudeEnvelope {
  is_error?: boolean;
  result?: unknown;
  subtype?: string;
  usage?: { input_tokens?: number; output_tokens?: number };
}

/** Parses `claude -p --output-format json`'s single JSON envelope, returning its
 * `result` text plus best-effort usage (zeroed when the envelope doesn't carry it). */
function extractEnvelope(
  stdout: string,
  bin: string,
): { text: string; usage: LlmUsage } {
  let envelope: ClaudeEnvelope;
  try {
    envelope = JSON.parse(stdout) as ClaudeEnvelope;
  } catch (err) {
    throw new HostCliError(
      `host-cli provider: "${bin}" stdout was not valid JSON: ${err instanceof Error ? err.message : String(err)}`,
      "output-error",
    );
  }
  if (envelope.is_error) {
    throw new HostCliError(
      `host-cli provider: "${bin}" reported an error (subtype=${envelope.subtype ?? "unknown"}): ${
        typeof envelope.result === "string"
          ? envelope.result
          : JSON.stringify(envelope.result)
      }`,
      "output-error",
    );
  }
  if (typeof envelope.result !== "string") {
    throw new HostCliError(
      `host-cli provider: "${bin}" JSON envelope missing a string "result" field`,
      "output-error",
    );
  }
  return {
    text: envelope.result,
    usage: {
      inputTokens: envelope.usage?.input_tokens ?? 0,
      outputTokens: envelope.usage?.output_tokens ?? 0,
    },
  };
}

/**
 * Runs a headless `claude -p` subprocess and coerces its output into the
 * caller's result type — the host-cli analog of `structuredCall`. Mirrors its
 * shape exactly (`system`/`user`/`schema`/`parse` in, `{ result, usage }` out);
 * the only new transport-specific step is the subprocess spawn/capture here,
 * plus embedding the schema as a prompt instruction since the headless CLI has
 * no API-level structured-output constraint to lean on.
 */
export async function hostCliStructuredCall<T>(
  o: HostCliStructuredCallOptions<T>,
): Promise<StructuredCallResult<T>> {
  const bin = o.bin ?? "claude";
  const spawnImpl = o.spawnImpl ?? realSpawn;
  const env = o.env ?? process.env;
  const timeoutMs = o.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  if (isSelfInvocation(env)) {
    throw new HostCliError(
      `host-cli provider: refusing to spawn "${bin}" — necro is already running inside a headless Claude Code ` +
        `session (${SELF_INVOCATION_ENV_VAR}=1). Spawning another headless call here risks an unbounded nested ` +
        "self-invocation.",
      "self-invocation",
    );
  }

  const prompt = buildPrompt({
    system: o.system,
    user: o.user,
    schema: o.schema,
  });
  const args = buildInvocation({ prompt, model: o.model });
  const { stdout } = await spawnCapture(spawnImpl, bin, args, timeoutMs);
  const { text, usage } = extractEnvelope(stdout, bin);

  return { result: o.parse(o.schema ? jsonOrText(text) : text), usage };
}
