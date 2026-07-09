---
cadence_handoff: 1
generated_at: 2026-06-11T21:36:22.096Z
label: fp-reduction-next-monorepo
loop_position: IDLE
active_phase: 24-monorepo-fp
active_draft: 
tier: 
git_branch: main
git_dirty: true
git_head: 931fa85
git_ahead: 0
git_behind: 0
context_packet: .cadence/intelligence/context/handoff.json
---

# Session Handoff — 2026-06-11 (fp-reduction-next-monorepo)

## TL;DR for the next session
- **Two phases shipped + settled this session, both PASS:** phase 23 (Next.js framework plugin) and phase 24 (monorepo workspace FP reduction). Loop is **IDLE**, nothing in flight.
- **Everything pushed** — HEAD `931fa85`, **0 ahead** of origin/main. Full suite **340 passed** (was 325), `tsc --noEmit` clean.
- **This was a dead-code false-positive (false-"dead") reduction effort** from rec-008. The recommendation's evidence reshaped scope twice (both surfaced to the user): **NestJS dropped** (zero FP at necro's granularity), and the monorepo half was split out as phase 24.
- **Next is a strategic pick, not a pending task.** Strongest candidates: the **subpath-alias follow-up** (phase 24 only maps bare `@scope/pkg`, not `@scope/pkg/sub`), **rec-20260610-007** (agent wedge), or the **rec-006 fast-follow** (competitor head-to-head table).
- **Only blocker-ish note:** nothing blocking. `.cadence/` is intentionally uncommitted (convention); no source WIP, nothing stashed.

## State on handoff   ·  pre-filled — verify, don't retype
- Branch `main` (dirty), 0 ahead / 0 behind origin
- HEAD `931fa85`
- Recent commits:
```
931fa85 test(24): synthesized monorepo corpus + AC-1/2/3 tests (T4)
7a1e00e feat(24): cross-package alias edges + member entry rooting (T2, T3)
c7f37cc feat(24): workspace discovery + pkgName->entry map (T1)
6cbb799 feat(23): Next.js framework plugin + engine prod-entry export-rooting (T2, T3)
986b10d test(23): SHA-pinned Next.js FP corpus + tsconfig fixtures exclude (T1)
d0b6ce9 docs(23): narrow to Next.js-only; split monorepo to phase 24
841b6b2 docs(23): drop NestJS from FP-reduction scope (zero FP at necro granularity)
39e68d8 docs: design spec for real-world FP reduction (rec-008)
```
- Uncommitted (diff --stat):
```
.cadence/STATE.md   | 4 ++--
 .cadence/state.json | 6 +++---
 2 files changed, 5 insertions(+), 5 deletions(-)
```
- Loop: IDLE · phase 24-monorepo-fp · tier (none)

## CADENCE context   ·  pre-filled from `cadence context handoff`
- Top recommendations:
  - rec-20260610-004 — Publish @manehorizons/necro to npm + agent-install story (unblocks the MCP server) (accepted/ready-for-milestone)
  - rec-20260610-005 — CI/PR citizen: real SARIF output + GitHub Action + --fail-on gating (accepted/ready-for-milestone)
  - rec-20260610-007 — Deepen the agent wedge: necro_verify enhancements + necro explain (candidate/needs-decision)
- Open assumptions:
  - (none)
- Active decisions:
  - (none)
- Files in play:
  - `package.json` — affected by rec-20260610-004 Publish @manehorizons/necro to npm + agent-install story (unblocks the MCP server)
  - `.github/workflows/release.yml` — affected by rec-20260610-004 Publish @manehorizons/necro to npm + agent-install story (unblocks the MCP server)
  - `README.md` — affected by rec-20260610-004 Publish @manehorizons/necro to npm + agent-install story (unblocks the MCP server)
  - `website/src/content/docs/guide/installation.md` — affected by rec-20260610-004 Publish @manehorizons/necro to npm + agent-install story (unblocks the MCP server)
  - `src/cli.ts` — affected by rec-20260610-004 Publish @manehorizons/necro to npm + agent-install story (unblocks the MCP server)
  - `src/report/sarif.ts` — affected by rec-20260610-005 CI/PR citizen: real SARIF output + GitHub Action + --fail-on gating
  - `.github/actions/necro/action.yml` — affected by rec-20260610-005 CI/PR citizen: real SARIF output + GitHub Action + --fail-on gating
  - `website/src/content/docs/guide/ci-integration.md` — affected by rec-20260610-005 CI/PR citizen: real SARIF output + GitHub Action + --fail-on gating
  - `src/mcp/tools/verify.ts` — affected by rec-20260610-007 Deepen the agent wedge: necro_verify enhancements + necro explain
  - `src/mcp/tools/explain.ts` — affected by rec-20260610-007 Deepen the agent wedge: necro_verify enhancements + necro explain
  - `src/refactor/verify.ts` — affected by rec-20260610-007 Deepen the agent wedge: necro_verify enhancements + necro explain
  - `src/analyze/` — affected by rec-20260610-007 Deepen the agent wedge: necro_verify enhancements + necro explain

## What landed this session
- **Phase 23 — Next.js plugin** (`src/plugins/nextjs/`): zero-config detect (`next` dep / `next.config.*`); `prod`-kind `entryPatterns` for App/Pages router + `src/` variants + middleware/instrumentation.
- **Engine entry-kind split + export-rooting** (`src/engine/index.ts`): plugin entry globs split by `kind`; `prod` globs root the **exported symbols** of matched entry files (a file-path seed alone does NOT root declared exports). Next.js corpus 6 false-dead → 0.
- **SHA-pinned Next.js corpus** (`test/fixtures/fp-realrepo/nextjs-app/`, real `vercel/next.js@5b0aa04` files) + `tsconfig` `test/fixtures` exclude.
- **Phase 24 — monorepo FP**: `src/engine/workspaces.ts` (`resolveWorkspaces`, npm/yarn + pnpm) → `pkgName→entry` map; feeds ts-morph `paths` so `@scope/pkg` cross-package refs resolve (consumed symbols alive, genuine dead preserved) + member entry-file rooting. Cross-package scan 3 → 1.
- **Synthesized monorepo corpus** (`test/fixtures/fp-realrepo/monorepo-basic/`) + AC tests.
- **`rec-20260611-001`** created (monorepo) then implemented as phase 24. NestJS investigation recorded as a build-time finding in the design spec.
- **Design spec:** `docs/superpowers/specs/2026-06-11-necro-fp-reduction-design.md` (carries both scope-narrowing decisions). 8 commits pushed to origin/main.

## Carry-forward gotchas
- **`.cadence/` is intentionally uncommitted** (STATE.md/state.json modified; phase dirs 15–24 untracked) — repo convention. Do NOT commit it. No source WIP; nothing stashed.
- **Phase 24 maps bare package names only** — `@scope/pkg/sub` subpath aliases are NOT resolved yet. This is the natural fast-follow (extend `packagePaths` in `src/engine/workspaces.ts` + the `paths` map in `src/graph/symbol-graph.ts` to add `@scope/pkg/*` → member-dir `/*`).
- **Phase 24 corpus is SYNTHESIZED** (`monorepo-basic/`), not a vendored real-repo slice — T4 was settled `DONE_WITH_CONCERNS`. Rationale: the monorepo FP is structural and a real cross-package slice can't stay minimal/self-contained/deterministic. Documented in `test/fixtures/fp-realrepo/SOURCES.md`.
- **NestJS needs no plugin** — verified zero FP (necro doesn't node-ify methods; DI forces static imports). Don't revisit unless necro gains method-level analysis.
- **The `fp-realrepo` dead-code corpus is deterministic** (no model) — runs in plain `npm test`, no API key. (Distinct from `necro bench`, which is repo-internal, model-in-the-loop, and non-deterministic.)
- **Memory updated:** `fp-reduction-framework-plugins.md` captures the durable gotchas (entry-file-doesn't-root-exports; NestJS=zero-FP; monorepo shipped + subpath limitation).

## Next action
**Action:** No work in flight — loop IDLE, phases 23 + 24 shipped/settled/pushed. The next move is the user's strategic pick. Start with `cadence recommend` to re-rank, then `cadence draft new <slug> <n>` (optionally `--from-rec <id>`). Leading candidates: the **subpath-alias follow-up** to phase 24 (extend `@scope/pkg/*` resolution — likely a quick-fix/standard tier), **rec-20260610-007** (agent wedge: `necro_verify` + `necro explain`), or the **rec-006 fast-follow** (knip/ts-prune competitor accuracy table).
**Verify:** `cadence status` → IDLE · phase 24-monorepo-fp; `git log origin/main..HEAD` empty (all pushed); `npm test` → 340 passed; `npx tsc --noEmit` clean.
**If it fails:** nothing is pending to recover — the session ended clean. If a future monorepo scan still shows cross-package false-dead, suspect a subpath import (`@scope/pkg/sub`) — the known unmapped case above.
