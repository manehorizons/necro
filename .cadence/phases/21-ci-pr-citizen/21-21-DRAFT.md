---
phase: 21-ci-pr-citizen
id: 21-21
tier: standard
status: PENDING
---

# 21-21 — CI/PR citizen: SARIF + GitHub Action + --fail-on gating (AC-2)

## Objective

Make necro a CI/PR citizen: emit schema-valid **SARIF 2.1.0** that GitHub
code-scanning accepts, ship a composite **GitHub Action** that runs necro against
a PR and surfaces findings, and add **`--fail-on <high|medium|low>`** severity
gating on the process exit code. This is SPEC `20-20` AC-2 (split out from the
AC-1 publish phase, which shipped as `20-20`).

## Acceptance Criteria

### AC-2: CI/PR citizen — SARIF output + GitHub Action + `--fail-on` gating
Given necro emits human and JSON reports but has no SARIF output, no packaged
GitHub Action, and no severity-based exit gating
When a SARIF reporter (`src/report/sarif.ts`) is added and wired to a CLI output
flag (`scan --sarif <file>`), a composite GitHub Action
(`.github/actions/necro/action.yml`) wraps the scan, and `--fail-on <severity>`
gates the process exit code
Then running necro with SARIF output produces a schema-valid SARIF file that
GitHub code-scanning accepts on upload, the Action runs necro against a PR and
surfaces findings, and `--fail-on high` exits non-zero iff a finding at or above
the threshold exists (zero otherwise)

## Severity model (decided 2026-06-11 — "Conservative")

One unified `high > medium > low` scale drives both SARIF `level` and `--fail-on`:

| Severity | SARIF level | Findings |
|----------|-------------|----------|
| **high** | `error` | dead-code `certain` |
| **medium** | `warning` | dead-code `likely`; complexity (all detectors: nesting/cyclomatic/cognitive/god-function) |
| **low** | `note` | dead-code `maybe`, `test-only`; duplication; hotspots |

`--fail-on <s>` exits non-zero iff any finding has severity ≥ `s`
(`high` ⊂ `medium` ⊂ `low`).

## Tasks

### T1: Unified severity model
- files: `src/report/severity.ts`
- action: define `type Severity = "high" | "medium" | "low"`; a `SEVERITY_RANK`
  order; per-category classifiers (`deadCodeSeverity(tier, verdict)`,
  `complexitySeverity()`, `duplicationSeverity()`, `hotspotSeverity()`) per the
  table above; a `meetsThreshold(sev, threshold)` predicate.
- verify: unit tests assert each category→severity per the table and the
  threshold subset logic (high⊂medium⊂low).
- done: AC-2

### T2: SARIF 2.1.0 reporter
- files: `src/report/sarif.ts`
- action: pure `toSarif(input: JsonInput, opts: { srcRoot: string }): SarifLog`.
  Emit `version:"2.1.0"`, `$schema`, one `runs[0].tool.driver` (name `necro`,
  informationUri, semVer from `VERSION`, a `rules` array per ruleId), and
  `runs[0].results[]` for all four categories. Each result: `ruleId`, `level`
  (from T1 severity), `message.text`, and `locations[].physicalLocation`
  (`artifactLocation.uri` **relative to `srcRoot`**, `region.startLine`,
  `startColumn:1` since findings carry no column). Duplication groups → one
  result with primary + related locations.
- verify: tests assert SARIF structural validity (version, $schema, tool.driver,
  results shape), correct `level` per category, repo-relative URIs, and that a
  finding with line N yields `region.startLine === N`.
- done: AC-2

### T3: CLI wiring — `--sarif <file>` and `--fail-on <severity>`
- files: `src/cli.ts`
- action: add `--sarif <file>` (writes the SARIF document to `<file>`) and
  `--fail-on <high|medium|low>` to the `scan` command. After scan, compute the
  worst severity present via a pure helper `gate(input, threshold): boolean` and
  set `process.exitCode = 1` when it fails. `--sarif` and `--fail-on` compose
  with existing `--json`/human output. Validate the `--fail-on` value (reject
  unknown severities with a clear error + exit 1).
- verify: tests on `gate()` (fails iff ≥ threshold finding exists, per fixtures);
  an end-to-end check that `scan --sarif out.sarif` writes a valid file and
  `--fail-on high` sets a non-zero exit only when a certain-dead finding exists.
- done: AC-2

### T4: Composite GitHub Action + PR dogfood workflow
- files: `.github/actions/necro/action.yml`, `.github/workflows/necro-scan.yml`
- action: composite action with inputs (`path` default `.`, `fail-on` default
  `high`, `sarif-file` default `necro.sarif`) that runs
  `npx -y @manehorizons/necro scan` with `--sarif`/`--fail-on`, then uploads via
  `github/codeql-action/upload-sarif`. Add a PR-triggered workflow using the
  local action (`uses: ./.github/actions/necro`) with
  `permissions: security-events: write` to dogfood it against necro's own PRs.
- verify: a test asserts `action.yml` parses, is `composite`, declares the inputs,
  runs necro with `--sarif` + `--fail-on`, and uploads SARIF; YAML validity check
  on the workflow.
- done: AC-2

## Boundaries

- Severity mapping is LOCKED to the Conservative table above — do not invent a
  different scale.
- DO NOT change the finding/scan data model (`src/engine`, `src/analyze`,
  `src/syntactic`) — SARIF is a pure read-side transform over existing findings.
- DO NOT add heavy deps (no `ajv`/full-schema-validator); structural SARIF
  validity in tests + the real code-scanning upload in the dogfood workflow are
  the acceptance gate.
- GitHub Action is GitHub-only (composite); no GitLab/CircleCI (SPEC constraint).
- `--json` output shape is unchanged (additive flags only).
