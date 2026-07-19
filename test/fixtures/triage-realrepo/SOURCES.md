# Real-repo triage corpus — sources & labeling

This corpus measures `necro triage` accuracy on **real** `maybe`-tier findings
with **authentic** evidence (the verbatim `EvidenceSignal[]` necro emitted) and
hand-verified ground truth. Only `truth` and `rationale` are human-applied;
`code`, `evidence`, and `provenance` are captured directly from a real scan via
`src/triage/eval-capture.ts`.

## Source repositories

| repo | commit SHA | scanned | cases |
|------|-----------|---------|-------|
| `honojs/hono` | `61d6d66d27911001b9b4d57ab93139f9ad61384b` | `necro scan --json <checkout>/src` | 19 (14 alive / 5 dead) |
| `trpc/trpc` | `c7360d4eb3c89c336468809a293e5cda4b302d4b` | `necro scan --json packages` (phase 13) then `necro scan --json .` from repo root, filtered to `packages/` (phase 49 round 2 — `--json packages` now returns EMPTY, see rec-20260718-002) | 44 (19 alive / 25 dead) |

**Total: 63 cases (33 alive / 30 dead) across 2 repos.** hono was the phase-11
seed; trpc was added in **phase 13** to make the live precision gate a real
measure rather than a collapse-detector (on 19 cases a single symbol's coin-flip
swung precision ~0.33), then expanded in **phase 49** once a `workspaces.ts`
engine bug that made trpc scans degenerate was fixed (rec-20260718-002 / phase
50). See the phase-13 and phase-49 sections below.

> **Open gap:** AC-1 for phase 49 calls for `dead` cases to span **≥3 repos** —
> the 30-case target is met, but all 30 still come from only 2 repos (hono,
> trpc). Four attempts at a genuinely new 3rd repo all dead-ended, each for a
> mechanistically-understood reason (not "untried" — see the phase-49 section
> below for the full trace): `zod` (monorepo, same shape as the already-used
> trpc), `fastify` (plain CJS — its test files resolve as `certain` rather than
> test-scoped, so `testOnlyEvidence` never fires), and `h3` **twice** — first
> with too-narrow a scan target (`--json src`, which excludes `test/`
> entirely, an easy trap since it matches hono's own documented scan command),
> then correctly with `--json .`, which revealed the *real* reason: h3's own
> public API reads as `testOnlyEvidence` because nothing else in the h3 repo
> calls its own exports (re-exports are non-terminal, by design in
> `buildSymbolGraph`) — a **library-scanned-against-itself** ambiguity, not a
> necro bug, and not the "test-local helper" pattern this corpus needs. The
> underlying trait that made hono/trpc work — genuinely unexported,
> declared-and-used-only-within-a-test-file helper functions, as opposed to a
> library's exported-but-only-test-exercised public surface — is narrower than
> it looks and isn't predictable from a repo's README; it takes a scan to find
> out. Revisit only with a specific candidate repo in hand, not open-ended
> search.

> **Open gap (phase 53):** the pinned hono commit above
> (`61d6d66d27911001b9b4d57ab93139f9ad61384b`) is **no longer reachable
> upstream** — confirmed via a full clone of every branch in `honojs/hono`
> (2867 commits, all branches) and via the GitHub commits API (422 "No commit
> found"). The corpus's own captured `code`/`evidence`/`provenance` data is
> unaffected (it's frozen JSON, not a live dependency on the commit existing),
> but anything that needs an actual **checkout** at that SHA — e.g. the
> knip/ts-prune competitor bench (`npm run bench:checkout` /
> `npm run bench:competitors`, see the Accuracy docs page's "Head-to-head"
> section) — can currently only cover the trpc half of this corpus (44 of 63
> cases). Likely cause: history rewritten upstream sometime after the phase-11
> capture. Revisit only if a way to recover the original tree state turns up
> (e.g. a fork or mirror that still has it) — re-pinning to a *different* hono
> commit would require re-capturing and re-labeling all 19 hono cases from
> scratch, not just updating a SHA.

hono yields 20 genuinely-ambiguous `maybe` findings with **discriminating**
evidence: `0 static references (TS compiler)` + `not in package.json exports` +
an **unresolvable dynamic-import taint** (which is *why* necro is uncertain
rather than `certain`). 19 of the 20 were labeled with high confidence; 1
(`cloneRawRequest`) was excluded as genuinely ambiguous — it is an exported,
JSDoc-documented public helper with **no internal production caller** (only a
doc example + tests reference it), so "dead" vs "alive" depends on whether you
count external consumers, and a corpus should not ship a coin-flip label.

> Deviation from the phase plan: the DRAFT targeted ≥20 cases. The confident,
> defensible set from hono's `maybe` findings is **19** (one ambiguous exclusion
> above). Rather than pad to 20 with a questionable label, the corpus stays at
> 19 high-confidence cases.

## Phase 13 — trpc expansion (the second repo)

`trpc/trpc` (`@c7360d4`) is a TS monorepo: a real entry resolves per package,
leaving genuinely-uncertain `maybe` findings in dynamic-import-tainted scopes —
the same "messy middle" property that made hono a good source. Scanning
`packages` from the repo root yields **119** `maybe` findings, all carrying the
discriminating 4-signal evidence (`0 static references` + `not in package.json
exports` + `dynamic-import taint in scope`). 29 were labeled with high
confidence and added; the rest were left out to avoid low-diversity duplication
(e.g. 9 near-identical generated `ReqInit` fixtures) and name-collision
ambiguity (generic identifiers like `ctx`, `sleep`, `transformer`).

The 29 split into two clean, high-confidence groups:

- **19 alive — the trust-killer set** (`packages/server/src/unstable-core-do-not-import/clientish/serialize.ts`).
  Every type alias in `serialize.ts` is **transitively reachable from the exported
  `Serialize<T>`** (re-exported via `unstable-core-do-not-import.ts`, consumed in
  production `inference.ts`, `stream/jsonl.ts`, `stream/sse.ts`) — verified by
  tracing the full intra-file type-dependency graph, not by grep. Yet necro
  reports `0 static references` for all of them because the file sits in a
  dynamic-import-tainted scope. A model that trusts the evidence calls live code
  dead (false positive — the trust-killer); a model that reads the code rescues
  them. These are pure precision stressors.
- **10 dead — test-local helpers** (across `httpSubscriptionLink.test.ts`,
  `invalidateRouters.test.tsx`, `upgrade/test/transforms.test.ts`). Each is a
  helper/type/const declared in a test file with **zero production (non-test)
  references** anywhere in the tree (no production file even mentions the
  identifier) — production-dead, same category as hono's dead cases. necro's
  `0 static references` is a taint artifact hiding the test-only use.

Capture used the existing `src/triage/eval-capture.ts` pipeline (verbatim
evidence + provenance); only `truth` and `rationale` were human-applied.

### Rejected candidates (phase 13)

- **`elysiajs/elysia`** — scanning `src` yields **0 `maybe` findings** (113
  findings, all `certain`/`likely`). Its adapters resolve statically, so there is
  no taint and no ambiguity — the "clean entry" failure mode.
- **`unjs/mlly`** — its 6 `maybe` findings (`loadModule`, `evalModule`, …) are
  public-API functions `export *`-ed from `index.ts` with **no internal
  production caller** (only tests reference them) — the same coin-flip category
  as hono's excluded `cloneRawRequest` (alive iff you count external consumers).
  Excluded to keep labels defensible.

## Why not necro itself, or a clean library?

This was investigated and rejected:

- **necro-on-itself is degenerate.** necro resolves production entries from
  `package.json` `main`/`bin`/`exports` + conventional `index.ts`/`main.ts`.
  necro's `bin` points at the built `dist/`, and it has no `src/index.ts`, so
  scanning `src/` resolves **zero** entries — every one of its 419 `maybe`
  findings carries identical, non-discriminating evidence (`0 production
  references`). Useless as an accuracy corpus.
- **Clean libraries (ky, got) yield ~zero `maybe` findings** — a single clear
  entry point removes the ambiguity the `maybe` tier represents.

hono is the realistic "messy middle": a real entry resolves (463 `certain`,
537 `likely`), leaving a small set of genuinely-uncertain `maybe` findings.

## Ground-truth definition

A `maybe` finding is labeled:

- **dead** — no **production** (non-test) references: removing it would not break
  any non-test source (only tests, or nothing, reference it). This is the
  production-dead category necro's triage exists to surface.
- **alive** — referenced and used by production source.

Truth was assigned by reading each symbol's actual usage across the hono tree
(imports, calls, re-exports), **not** by trusting either necro's evidence or a
raw textual grep. Each case's `rationale` records the specific usage (or
absence) that determined its label.

## A notable property (what makes these good tests)

Across the corpus the **alive** cases carry `0 static references (TS compiler)`
evidence — yet each symbol *is* used in production (necro missed the references
because the symbols sit in a dynamic-import-tainted scope). A triage model that
blindly trusts "0 static references → dead" produces **false positives** (calling
live code dead — the trust-killer); a model that reads the code rescues them. The
**dead** cases are production-dead test-local symbols whose evidence is accurate.
The corpus skews toward `alive` (33/63), which is realistic: clearly-dead code
lands in necro's `certain`/`likely` tiers, so real `maybe` findings mostly resolve
to alive. This skew is deliberate — **precision** (don't call live code dead) is
the trust-critical headline metric, and the alive-heavy corpus is precisely the
stress test for it.

## Measured baseline

### Phase 11 (hono only, 19 cases, pre-tuning)

Live runs of `necro triage` (claude-opus-4-8) against the 19-case hono corpus:

| run | precision | recall |
|-----|-----------|--------|
| 1 | 0.50 | 0.40 |
| 2 | 0.75 | 0.60 |

**Mediocre and variable** — the synthetic eval (near-perfect) hid it entirely.
The persistent failure was the trust-killer: live code (`RequiredRequestInit`,
`detectResponseType`) flagged dead because the model trusted the misleading
`0 static references` evidence. Phase 12 fixed this with a location-weighted
`SYSTEM_PROMPT`, lifting hono precision to 1.00 across 3 runs.

### Phase 13 (hono + trpc, 48 cases)

The live gate (`test/triage-eval.live.test.ts`) is a **regression floor** set
under the observed run-to-run minima across ≥3 deliberate live runs, not a target
cherry-picked to pass. The 48-case corpus makes precision a robust measure (no
single symbol can swing it ~0.33 the way it did at 19 cases). Recall stays the
looser metric — the dead class (15) is production-dead test-local symbols whose
labels are definitionally debatable. The phase-13 re-calibration runs and the
resulting `PRECISION_GATE` / `RECALL_GATE` values are recorded in
`test/triage-eval.live.test.ts`.

### Phase 49 round 2 (trpc dead-case expansion, +15 cases)

Phase-13's trpc mining used `necro scan --json packages` (scan target = the
`packages/` subdir, from repo root) to source its 119 `maybe` findings; 29 were
labeled (19 alive, 10 dead), leaving ~90 unexplored. That exact command is no
longer usable: it now returns **EMPTY** — `resolveWorkspaces` only looks for the
workspace manifest at the scan target itself, so targeting a subdirectory never
finds it (a separate, still-unfixed issue, documented in `rec-20260718-002`).

The workaround is `necro scan --json .` (repo root as target), then filtering
results to files under `packages/` to reproduce the original scope. This was
blocked until phase 50 fixed a *different* bug in the same file
(`resolveWorkspaces` had no dist→src fallback, unlike the single-package path),
which made fresh/unbuilt monorepo checkouts scan as ~100% `maybe` — see
`rec-20260718-002` for the full diagnosis.

Re-scanning trpc/trpc (`@c7360d4`, still unbuilt) with the fixed engine and
`--json .` yields **1181** `maybe` findings under `packages/` (vs. 119 from the
old `packages`-targeted scan) — a real methodological difference from scan
target choice, not a residual bug: confirmed by package (server 528, react-query
166, client 165, openapi 136, tanstack-react-query 96, upgrade 34, next 50,
tests 6) — all genuine library code, no scan-scope contamination. After
deduplicating against the 29 already-labeled cases, 1152 were unexplored.

Of those, only **22** carry evidence anchored in a genuine test file
(`*.test.ts`/`*.test.tsx`). This is deliberate scoping, not an artifact: the
reliable, cheaply-verifiable `dead` pattern from phase 13 is "declared in a
test file, zero production references" — necro's engine now emits a dedicated
signal for exactly this (`0 production references` + `referenced only in test
files`, distinct from the generic `0 static references (TS compiler)` +
dynamic-taint pattern used for the `alive` trust-killer cases). Of the 22:

- **6 carry the dynamic-taint evidence pattern** (not the test-only pattern) —
  hand-inspection showed these are **used within their own file**
  (`transformer`/`ctx` in `issue-4130-ssr-different-transformers.test.tsx`,
  `ctx` in `invalidateRouters.test.tsx` and `httpSubscriptionLink.test.ts`,
  `Transformer` in `transforms.test.ts`, `sleep` in
  `httpSubscriptionLink.test.ts`) — i.e. more **alive** trust-killers, not
  `dead` candidates. Left unlabeled this round; a future round could add them
  as `alive` cases.
- **16 carry the `testOnlyEvidence` pattern.** 1 (`t` in `router.test.ts`) was
  excluded as a generic single-letter identifier — same collision-ambiguity
  concern that excluded `ctx`/`sleep`/`transformer` in phase 13. The remaining
  **15 were hand-verified dead** (each independently confirmed via repo-wide
  grep: declared unexported in a test file, used only by that file's own
  tests, zero cross-file references) and added:
  - `aggregateAsyncIterable`, `localLinkClient` — `client/src/links/localLink.test.ts`
  - `createServer`, `createMockRes`, `createMockReq` — `server/src/adapters/node-http/incomingMessageToRequest.test.ts`
  - `SubscriptionEvents`, `CustomEventEmitter` (×2, a declaration-merged interface+class pair) — `server/src/observable/operators.test.ts`
  - `Constructor`, `waitError` — `server/src/unstable-core-do-not-import/procedureBuilder.test.ts`
  - `serverResourceForStream` — `server/src/unstable-core-do-not-import/stream/jsonl.test.ts`
  - `suppressLogs` — `server/src/unstable-core-do-not-import/stream/sse.test.ts`
  - `EventMap`, `IterableEventEmitter`, `MyEvents` — `server/src/unstable-core-do-not-import/stream/utils/withPing.test.ts`

  Three of these (`waitError`, `suppressLogs`, `IterableEventEmitter`) are
  **shadow duplicates** of shared, exported `@trpc/server/__tests__/*` helper
  modules that other test files import — the local copy is a real-world
  duplication smell (one even has a literal `// TODO: move to a test-utils
  package` comment) but is independently, genuinely production-dead: nothing
  imports the local declaration specifically.

This brings the total `dead` corpus to 30 across 2 repos, meeting AC-1's count
target but not yet its **≥3 repos** requirement — see the "Open gap" note
above the source table.

#### Attempted 3rd repos (all rejected, with cause)

- **`zod` (`colinhacks/zod`).** Monorepo (`packages/zod/src`, `packages/resolution/src`)
  — same shape as trpc, no new structural diversity, and a prior session had
  already dead-ended here (not re-investigated further this round).
- **`fastify` (`fastify/fastify`, `@6206df7`).** Plain CommonJS, single package
  (`main: fastify.js`, `lib/*.js`, sibling `test/`). `necro scan --json .`:
  871 certain / 41 likely / 65 maybe, but **0** `testOnlyEvidence` findings —
  666 of `test/`'s own findings resolved as `certain` instead of test-scoped
  (something about its `require()`/CJS structure makes necro's reachability
  graph treat test files as roots rather than test-only consumers; not
  investigated further). The 36 non-test `maybe` findings (`lib/reply.js`,
  `lib/req-id-gen-factory.js`) are internal helpers called by name within
  their own file — the same dynamic-taint trust-killer shape as the corpus's
  existing `alive` cases, not `dead` candidates.
- **`h3` (`unjs/h3`, `@374e4d4`), attempt 1.** Scanned with `--json src` only
  (mirroring hono's own documented scan command) — this scan target excludes
  h3's repo-root `test/` directory entirely, so no test-file findings can
  appear by construction. This is the scan that produced the earlier
  "alive-only" verdict — a scan-target artifact, not evidence about the repo.
- **`h3`, attempt 2 (corrected).** Rescanned with `--json .` (repo root,
  includes `test/`): 39 certain / 5 likely / **430 maybe**, all 430 carrying
  `testOnlyEvidence`— including h3's entire public API (`H3`, `H3Event`,
  `defineHandler`, `defineMiddleware`, etc.). Diagnostics confirmed entry
  resolution worked correctly (`entryResolution.collapsed: false`, 9 valid
  entries via `mapped`/`convention`/`scripts`, including `src/index.ts` and
  all 6 `src/_entries/*.ts` platform adapters) — this is **not** a repeat of
  the `workspaces.ts`/`resolveProdEntries` dist→src bug. Root cause, traced
  in `src/graph/symbol-graph.ts`: `buildSymbolGraph` explicitly treats barrel
  re-exports as non-terminal (`isReExport(ref)` is skipped, by design — the
  docstring says so), so `src/index.ts`'s `export { H3Core, H3 } from
  "./h3.ts"` doesn't itself count as a production reference. Since h3 is a
  **library** with no other in-repo consumer of its own public API, its
  entire exported surface reads as "0 production references, referenced only
  in test files" — the same ambiguous "alive via external consumers" shape
  that excluded `unjs/mlly` and hono's `cloneRawRequest` from the corpus back
  in phase 13, not the "unexported, test-file-local helper" shape this corpus
  actually needs. Confirms h3 is a genuine dead end, not a target-choice
  mistake, and — importantly — that a repo's public API surfacing as
  `testOnlyEvidence` is generally *expected* for any library scanned in
  isolation, and should not by itself be treated as a `dead` candidate.

**Takeaway for a future attempt:** the qualifying trait (hono/trpc) is a real
unexported function/type/class **declared inside a `*.test.ts` file itself**
and used only by that file's own tests — not merely "0 production references"
on some symbol, which any scanned library will have plenty of ambiguously.
This isn't visible from a repo's README or package structure; it takes an
actual scan (`necro scan --json .` from repo root, then filter `maybe`
findings for `testOnlyEvidence` + a file path matching `*.test.ts`) to find
out. Don't re-try `zod`/`fastify`/`h3` without a different angle.
