# SETTLE Summary — 21-21

**Completed:** 2026-06-11T17:11:12.760Z

## Acceptance Criteria

- AC-2: PASS

## Tasks

- T1: DONE — src/report/severity.ts: unified high/medium/low model (Conservative table), deadCodeSeverity/complexity/duplication/hotspot classifiers, meetsThreshold (high⊂medium⊂low), isSeverity validator, severitiesOf + gate. 5 tests AC-2, typecheck clean.
- T2: DONE — src/report/sarif.ts: toSarif(input,{srcRoot})->SARIF 2.1.0. version/$schema, tool.driver(name necro, semVer from VERSION, rules[] all ruleIds), results for 4 categories with level from severity model, repo-relative URIs, startLine + startColumn:1, duplication primary+relatedLocations. 5 tests AC-2, typecheck clean.
- T3: DONE — cli.ts scan: added --sarif <file> (writes SARIF via toSarif, srcRoot=cwd for repo-relative URIs) and --fail-on <high|medium|low> (validates via isSeverity, gates process.exitCode via gate() over the FULL result set, not --top view). 4 integration tests run the built CLI (AC-2). Note: clean fixture needs cross-file import since necro counts import refs, not same-file calls. typecheck clean.
- T4: DONE — .github/actions/necro/action.yml (composite: setup-node, run necro via npx with --sarif + conditional --fail-on passed via env to avoid injection, upload-sarif always()). .github/workflows/necro-scan.yml dogfoods on PR with security-events:write; fail-on disabled for self-scan (dist-based entry detection is non-discriminating). 4 shape tests AC-2. Full suite 310 passed.

## Decisions

_(none)_

## Deferred

_(none)_

## Skill audit

_(none)_
