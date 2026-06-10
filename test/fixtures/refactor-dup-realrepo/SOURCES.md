# Real-repo extract-duplicate corpus — sources & selection

This corpus measures `necro refactor`'s **extract-duplicate** mode (collapse a clone
group into one shared function) on **real**, authentically-sized duplication captured
from external TypeScript repos. Each case carries every file the clone group touches
(**verbatim** inline `files[]`, repo-relative paths), the group's `locations`, its
matched `tokens`, the detector `minTokens`, the call-surface `signatures[]` that must
survive the extraction, and full provenance (repo + SHA).

Unlike the triage corpus, **no human ground-truth label is applied.** An extract-duplicate
proposal is scored **structurally** by `evaluateDuplicateProposal` (`src/refactor/eval.ts`):
it passes only if it (1) extracts one exported shared function with exactly one edit per
clone location, (2) collapses the duplication — the largest residual clone **among the
model's edit replacements** (the edited sites, each tokenized as its own pseudo-file) falls
below `tokens × COLLAPSE_RATIO` (`0.5`) — and (3) preserves every site's call surface. The
corpus therefore only needs authentic, genuinely-hard *inputs* — selection is the sole
human step; `files`, `locations`, `tokens`, `minTokens`, `signatures`, and `provenance`
are the mechanical output of `src/refactor/eval-capture.ts` (`captureDuplicateSkeletons`).

> **Phase 16 — edited-site collapse.** Criterion (2) originally re-tokenized the **whole
> spliced files** and demanded zero residual clone ≥ the group's `tokens`. That global
> measure was confounded by unrelated near-identical code in the same files (drizzle's
> parallel dialect modules), so a correct extraction could still "fail" on an untouched
> clone elsewhere. It now measures only the edited sites: a genuine extraction reduces each
> site to a short call (residual ≈ 0); a non-extraction leaves the body cloned across the
> edits (residual ≈ the full group). See `COLLAPSE_RATIO` in `src/refactor/eval.ts`.

## Source repositories

| repo | commit SHA | scanned | cases |
|------|-----------|---------|-------|
| `trpc/trpc` | `c7360d4eb3c89c336468809a293e5cda4b302d4b` | `necro scan --json <checkout>/packages` | 4 |
| `drizzle-team/drizzle-orm` | `48e5406027103a9fca6eb66417187c4a8b5c6aa3` | `necro scan --json <checkout>/drizzle-orm/src` | 8 |

**Total: 12 cases across 2 repos.** All are real `duplication` clone groups
(`DuplicationFinding`) flagged by necro's own detector at its default `minTokens = 50`
— the same clone groups `necro refactor` feeds the model in production. Capture used
`src/refactor/eval-capture.ts` (`captureDuplicateSkeletons`): verbatim file sources +
locations + provenance; only case *selection* was human.

> **Phase 16 — corpus refinement.** Two drizzle cases were dropped and two added (counts
> per repo unchanged). Removed: `count-L24` and `query-builder-L90` — dialect query-builder
> clones that are **class-structural** (constructor / select-overload blocks), so no
> behavior-preserving function extraction exists; the live model correctly-but-unhelpfully
> failed them every run, depressing the pass-rate with a corpus artifact rather than a
> model-quality signal (under the edited-site scorer they leave ~0.87 of the group cloned
> across the edits — captured as regression fixtures in `proposals/`). Added two clean
> single-unit logic clones the model can genuinely dedupe: `dialect-L948` (the
> migration-table-setup block duplicated across two `migrate` methods of sqlite-core's
> dialect) and `session-L69` (the `tracer.startActiveSpan('drizzle.mapResponse', …)`
> result-mapper shared by the gel + pg-proxy sessions, differing only by `result`/`rows`).

> trpc reuses the triage/phase-14 SHA (`c7360d4`, still reachable). drizzle-orm is a
> new third source pinned at its scanned default-branch HEAD (`48e5406`). **hono and
> kysely were evaluated and rejected as sources** — their duplication is overwhelmingly
> type-level (generic-param lists, JSDoc, method-overload signatures), not extractable
> *logic*, so neither yielded clean cases. drizzle-orm — a multi-dialect ORM (pg /
> mysql / sqlite / gel / singlestore / xata) — is rich in genuine copy-paste logic
> across its dialect implementations, and supplies the bulk of the corpus.

## Selection criteria

A clone group is only a usable extract-duplicate case if a correct extraction *exists*
and is *scorable*. From the detector's raw clone groups, selection kept groups that are
authentic, reviewable, and self-validating:

- **Real `duplication` findings only** — no synthetic or re-authored clones; every
  `files[].source` is the verbatim file from the pinned checkout (integrity-checked).
- **Reviewable scope** — same-file or small cross-file (≤2 files), 2–3 clone locations,
  per-location span 8–36 lines, ≤3 cases per source file (so no single file dominates).
- **Genuine logic, not noise** — excluded test/spec, vendored, and `*.config.ts`/build
  files; excluded type-definition modules and type-param-heavy clones (≥3 `extends`,
  generic-constraint blocks); excluded class-declaration / mid-signature straddles
  (`implements`, leading `>`); excluded doc-padded clones (>30 % comment lines, i.e.
  JSDoc/overload-signature duplication). Each location also requires a substantive
  enclosing line above it, captured as its `signature`.
- **Oracle-validated collapsibility (the key gate)** — every selected case was verified to
  pass a **generic oracle** proposal (shared function = the clone body once; each location
  replaced by a call), guaranteeing a structurally-correct extraction exists and the whole
  corpus scores `passRate = 1` under the oracle. Under the phase-16 edited-site scorer the
  oracle's trivial call replacements leave a sub-`minTokens` residual, so this invariant is
  scorer-independent. (Pre-phase-16, the all-or-nothing global measure additionally
  rejected groups whose file retained *another* clone ≥ its token length; that whole-file
  confound is what the edited-site scorer removes.) The phase-16 backfill cases were
  re-validated against this oracle under the new scorer, and excluded import-block /
  type-literal / class-structural clones in favour of genuine, parameterizable logic.

The selected cases span trpc's links / React-Query hooks / Lambda adapter and drizzle's
dialect drivers, sessions, select/delete query-builders, migration-table setup, and config
validation. Token lengths span **50–178**; no clone body was re-authored.

## Why these repos

trpc and drizzle-orm are real, widely-used TS codebases (not toy libraries) with genuine
copy-paste duplication in production code. drizzle's multi-dialect architecture is a
natural source of cross-dialect logic clones; trpc adds a second, independent codebase
(and a different domain — RPC client/server) so the gate cannot silently collapse onto a
single source's style.

## Measured baseline

The live structural-pass-rate gate (`test/refactor-eval.live.test.ts`) is a **regression
floor** set under the observed run-to-run minima across ≥3 deliberate live runs against
the real model — not a target cherry-picked to pass. Real clone groups are materially
harder to collapse correctly than the synthetic reference set (which scores ≈1.0), so the
real-repo floor is expected to sit below the synthetic 0.8.

### Phase 16 calibration (claude-opus-4-8, 3 deliberate live runs, edited-site scorer + refined corpus)

| run | passRate | failures |
|-----|----------|----------|
| 1 | **0.75** (9/12) | select-L685, delete-L205, driver-L61 |
| 2 | **0.75** (9/12) | select-L685, delete-L205, driver-L61 |
| 3 | **0.58** (7/12) | createHooksInternal-L178 (unparseable), utils-L303, select-L685, delete-L205, driver-L61 |

**Mean ≈ 0.69, observed minimum 0.58.** The edited-site scorer is validated: `utils-L303`
— the genuine deduplication the old whole-file metric wrongly failed every run — now passes
(it flaked once in run 3 on model non-determinism, not the scorer), and both backfilled
single-unit clones (`dialect-L948`, `session-L69`) pass all three runs.

**The floor did not rise** — and the reason is an honest, substantive finding about the
*corpus inputs*, not the scorer. The three consistent failures (`select-L685`,
`delete-L205`, `driver-L61`) are **multi-unit clone windows**: the duplication detector
flagged a window *larger than a single extractable unit*, bundling near-identical class
scaffolding around the one reusable fragment. In all three the model **correctly extracted
the genuine shared function** — `buildQueryFromDialect` (delete), `createSelectionProxy`
(select), `extractRelationalConfig` (driver) — and wired every call site, but the window's
surrounding scaffolding (the `getSQL`/`_prepare` methods, the `groupBy`/`orderBy` overload
signatures, the driver-construction block) has *no* single-function extraction and remains
cloned, leaving an edited-site residual of **0.66–0.89**. Crucially these ratios **overlap**
the genuinely-non-extractable cases dropped earlier (`count-L24` / `query-builder-L90` at
~0.87), so **no `COLLAPSE_RATIO` can credit the multi-unit partials without also crediting
real non-extractions** — confirming `0.5` is the correct ratio and that these failures are a
corpus-input limitation, not a scorer or model defect. (A future corpus-refinement phase
could drop the multi-unit windows for single-unit clones, as the `dialect-L948` /
`session-L69` backfill demonstrated, to lift the aggregate.)

**`DUP_REALREPO_PASS_RATE_GATE = 0.5`** — a regression floor set *below* the observed
minimum (0.58), with margin for the model's non-determinism (a single parse flake dropped
run 3 by ~0.17). It is a collapse detector (catches the extract-duplicate path regressing
materially), not a target, and is **not** cherry-picked to the runs. It is held at 0.5
(unchanged) because the scorer fix corrected *which* cases pass — recovering `utils-L303`,
retiring the class-structural pair — without materially moving the aggregate, as the
multi-unit windows offset the recovery. Re-calibrate only after a corpus-refinement phase
retires the multi-unit windows across ≥3 fresh runs.
