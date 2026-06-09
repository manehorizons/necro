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
| `trpc/trpc` | `c7360d4eb3c89c336468809a293e5cda4b302d4b` | `necro scan --json packages` (from repo root) | 29 (19 alive / 10 dead) |

**Total: 48 cases (33 alive / 15 dead) across 2 repos.** hono was the phase-11
seed; trpc was added in **phase 13** to make the live precision gate a real
measure rather than a collapse-detector (on 19 cases a single symbol's coin-flip
swung precision ~0.33). See the phase-13 section below.

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
The corpus skews toward `alive` (33/48), which is realistic: clearly-dead code
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
