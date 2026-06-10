# Real-repo refactor corpus — sources & selection

This corpus measures `necro refactor` (god-function split) accuracy on **real**,
authentically-sized god functions captured from external TypeScript repos. Each
case carries the function's **verbatim** source (the exact span necro's
god-function detector flagged), its declaration line as the signature that must
survive the split, the LOC threshold, and full provenance.

Unlike the triage corpus, **no human ground-truth label is applied.** A refactor
proposal is scored **structurally** by `evaluateProposal` (`src/refactor/eval.ts`):
a split passes only if it (1) splits into ≥2 functions, (2) preserves the public
signature verbatim, and (3) brings every resulting unit under the LOC threshold.
The corpus therefore only needs authentic, genuinely-hard *inputs* — selection is
the sole human step; `source`, `signature`, `threshold`, and `provenance` are the
mechanical output of `src/refactor/eval-capture.ts` (`captureRefactorSkeletons`).

## Source repositories

| repo | commit SHA | scanned | cases |
|------|-----------|---------|-------|
| `honojs/hono` | `e50df01453e71b071c3e6136b161b160b9fdf916` | `necro scan --json <checkout>/src` | 3 |
| `trpc/trpc` | `c7360d4eb3c89c336468809a293e5cda4b302d4b` | `necro scan --json <checkout>/packages` (from repo root) | 11 |

**Total: 14 cases across 2 repos.** All are loc-over god functions
(`unit.loc > godFunctionLoc`, the default `50`) — the split targets `necro refactor`
exists to address. Capture used the existing `src/refactor/eval-capture.ts`
pipeline (verbatim source + provenance); only case *selection* was human.

> hono's phase-11/13 triage SHA (`61d6d66…`) is no longer reachable upstream
> (force-removed), so this corpus pins hono at its current default-branch HEAD
> (`e50df01`) — the SHA actually scanned. trpc reuses the triage SHA (`c7360d4`),
> which is still reachable.

## Selection criteria

From **188** production (non-test) loc-over god functions across the two repos,
14 were selected to be authentic, diverse, and clean to score:

- **Named, top-level declarations** (`export function` / `function` / `const NAME =`)
  — so the captured `signature` is a stable, verbatim first line the split must
  preserve. **Anonymous arrow functions were excluded** (no stable signature line
  — `preservesCallSurface` would be ill-defined), as were the largest functions
  (>200 loc, e.g. trpc's 688-loc `createRootHooks`) to keep prompts realistic.
- **Production source only** — test/spec files and `__tests__` were excluded.
- **No vendored code** — e.g. trpc's `splitSetCookieString` lives under
  `packages/server/src/vendor/cookie-es/…` and was excluded (not the repo's own
  code).
- **Imperative substance** — functions with real branching / sequential steps that
  genuinely benefit from extraction, spanning varied concerns: hono's router
  matcher, JWT key algorithm, and CF-Pages middleware; trpc's client links
  (`httpLink`, `httpBatchLink`, `dataLoader`), server streaming
  (`sseStreamProducer`, `sseStreamConsumer`, `jsonlStreamConsumer`,
  `mergeAsyncIterables`), HTTP/body handling (`createBody`, `initResponse`,
  `getParseFn`), and the core `createBuilder`.

Sizes span **54–169 loc**. No function body was re-authored — `source` is the exact
file span (verified byte-for-byte against the pinned checkout at capture time).

## Why these repos

hono and trpc are real, widely-used TS codebases (not toy libraries) with genuine
god functions in production code. trpc — a monorepo spanning client links, server
core, streaming, adapters, and framework integrations — supplies the bulk of the
diversity; hono adds a second, independent codebase so the gate cannot silently
collapse onto a single source's style.

## Measured baseline

The live structural-pass-rate gate (`test/refactor-eval.live.test.ts`) is a
**regression floor** set under the observed run-to-run minima across ≥3 deliberate
live runs against the real model — not a target cherry-picked to pass. Real god
functions are materially harder to split correctly than the synthetic reference
set (which scores ≈1.0), so the real-repo floor is expected to sit below the
synthetic 0.8; the exact value and the per-run numbers are recorded in
`test/refactor-eval.live.test.ts` once calibrated.

<!-- PHASE-14 CALIBRATION (filled by T4 after ≥3 live runs):
| run | passRate |
|-----|----------|
| 1   | ?        |
| 2   | ?        |
| 3   | ?        |
REALREPO_PASS_RATE_GATE = ?
-->
