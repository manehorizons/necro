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
clone location, (2) collapses the duplication — re-tokenizing the spliced files leaves no
clone as long as the original group, and (3) preserves every site's call surface. The
corpus therefore only needs authentic, genuinely-hard *inputs* — selection is the sole
human step; `files`, `locations`, `tokens`, `minTokens`, `signatures`, and `provenance`
are the mechanical output of `src/refactor/eval-capture.ts` (`captureDuplicateSkeletons`).

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
- **Oracle-validated collapsibility (the key gate)** — `evaluateDuplicateProposal`
  measures duplication globally over the spliced files, so a clone group in a file that
  retains *another* clone ≥ its token length can never be collapsed and is unscorable.
  Every selected case was verified to pass a **generic oracle** proposal (shared
  function = the clone body once; each location replaced by a call), guaranteeing a
  correct extraction exists and the whole corpus scores `passRate = 1` under the oracle.
  ~85 % of otherwise-clean candidates were dropped here — they live in pervasively
  duplicated files (typical of drizzle's dialect code) and are inherently uncollapsible.

The selected cases span trpc's links / React-Query hooks / Lambda adapter and drizzle's
dialect drivers, sessions, count/select/delete query-builders, and config validation.
Token lengths span **52–178**; no clone body was re-authored.

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

### Phase 15a calibration (claude-opus-4-8, ≥3 deliberate live runs)

_(filled in by T4 — `DUP_REALREPO_PASS_RATE_GATE` is set below the observed minimum
across the runs recorded here.)_

| run | passRate | failures |
|-----|----------|----------|
| _pending_ | | |
