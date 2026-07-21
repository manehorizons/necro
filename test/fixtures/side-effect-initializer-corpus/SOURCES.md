# Side-effect-initializer corpus — sources & provenance

This corpus measures the precision of the naive syntax screen proposed by
`rec-20260719-008` — "an initializer that is a `CallExpression`,
`NewExpression`, `AwaitExpression`, or `TaggedTemplateExpression` may have
side effects, so demote the finding from `certain` to `likely`." Each case is
a real, unreferenced (`certain`-tier) declaration pulled verbatim from the
`honojs/hono` and `trpc/trpc` corpora already used elsewhere in this repo
(`test/fixtures/triage-realrepo`, `.bench-cache/`), hand-labeled with whether
removing it is genuinely risky (an externally observable effect happens at
declaration time) or safe (the initializer only allocates/computes a value
that is then, correctly, unused).

Cases were found by running `necro scan --json` against the pinned
`.bench-cache` checkouts below and filtering to `tier === "certain"` findings,
then hand-inspecting each one's initializer.

## `honojs/hono` @ `cadff88bba34153646c9b35f24d7cc0cb61be913`

| file | line | name | truth |
|---|---|---|---|
| `benchmarks/fetch/summarize.mts` | 10 | `lines` | genuinely-risky |
| `benchmarks/fetch/summarize.mts` | 16 | `byCase` | safe-to-remove |
| `benchmarks/http-server/benchmark.ts` | 25 | `runs` | safe-to-remove |
| `benchmarks/http-server/benchmark.ts` | 30 | `skipTests` | safe-to-remove |
| `benchmarks/http-server/benchmark.ts` | 33 | `TEMP_DIR` | safe-to-remove |
| `benchmarks/jsx/src/benchmark.ts` | 9 | `suite` | safe-to-remove |
| `benchmarks/routers-deno/src/find-my-way.mts` | 7 | `router` | safe-to-remove |
| `benchmarks/routers-deno/src/koa-router.mts` | 6 | `router` | safe-to-remove |
| `benchmarks/routers/src/express.mts` | 5 | `router` | safe-to-remove |
| `benchmarks/routers/src/bench-includes-init.mts` | 17 | `preparedParams` | safe-to-remove |
| `benchmarks/fetch/summarize.mts` | 27 | `median` | safe-to-remove |
| `benchmarks/http-server/benchmark.ts` | 29 | `concurrency` | safe-to-remove |
| `benchmarks/http-server/benchmark.ts` | 54 | `sleep` | safe-to-remove |

## `trpc/trpc` @ `c7360d4eb3c89c336468809a293e5cda4b302d4b`

| file | line | name | truth |
|---|---|---|---|
| `examples/.test/diagnostics-big-router/scripts/codegen.ts` | 15 | `codegenBase` | genuinely-risky |
| `packages/tests/server/adapters/standalone.http2.test.ts` | 22 | `cert` | genuinely-risky |
| `examples/next-prisma-starter/prisma/seed.ts` | 8 | `prisma` | safe-to-remove |
| `examples/nuxt/server/trpc/init.ts` | 12 | `t` | safe-to-remove |
| `packages/tests/server/abortQuery.test.ts` | 6 | `router` | safe-to-remove |
| `packages/tests/server/inferenceHelpers.test.ts` | 19 | `appRouter` | safe-to-remove |

## How `truth` was judged

- **genuinely-risky**: the initializer has an effect observable outside the
  removed binding — I/O that can throw or persist (file reads/writes,
  spawning a subprocess), or anything that mutates shared/global state.
  `lines`/`codegenBase` read a file that may not exist (removal changes
  whether the module throws); `cert` shells out to `openssl` and writes real
  `.key`/`.crt` files to disk.
- **safe-to-remove**: the initializer only allocates an object, computes a
  pure value, or defines a function — nothing runs until/unless the result is
  consumed, and since the result is (correctly) unreferenced, nothing ever
  consumes it. This covers both syntax-flagged cases that turn out to be pure
  allocations (`new Map()`, `new KoaRouter()`, `express.Router()`,
  `initTRPC.create()`, `new PrismaClient()`, `t.router({...})`) and
  syntactically-pure cases (a literal, an unwrapped function definition).

13 of 19 cases come from `honojs/hono` and 6 from `trpc/trpc` — lopsided
because hono's `certain`-tier findings cluster in small benchmark/router
scripts (easy to hand-verify in full), while trpc's cluster in large test
files where isolating a self-contained, legible snippet was harder; SOURCES
were picked for legibility, not to match the two repos' raw prevalence.
