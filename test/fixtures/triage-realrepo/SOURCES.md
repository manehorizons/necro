# Real-repo triage corpus — sources & labeling

This corpus measures `necro triage` accuracy on **real** `maybe`-tier findings
with **authentic** evidence (the verbatim `EvidenceSignal[]` necro emitted) and
hand-verified ground truth. Only `truth` and `rationale` are human-applied;
`code`, `evidence`, and `provenance` are captured directly from a real scan via
`src/triage/eval-capture.ts`.

## Source repository

| repo | commit SHA | scanned |
|------|-----------|---------|
| `honojs/hono` | `61d6d66d27911001b9b4d57ab93139f9ad61384b` | `necro scan --json <checkout>/src` |

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
> 19 high-confidence cases. The corpus-integrity test asserts ≥18.

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

For all 13 **alive** cases, necro's evidence says `0 static references (TS
compiler)` — yet each symbol *is* statically imported/called in production
source (necro missed the references because the symbols sit in a
dynamic-import-tainted scope). A triage model that blindly trusts "0 static
references → dead" produces **false positives** (calling live code dead — the
trust-killer); a model that reads the code rescues them. The 5 **dead** cases
are test-only symbols whose evidence is accurate. The corpus is intentionally
skewed toward `alive`, which is realistic: clearly-dead code lands in necro's
`certain`/`likely` tiers, so real `maybe` findings mostly resolve to alive.

## Measured baseline (the milestone's payoff)

Live runs of `necro triage` (claude-opus-4-8) against this corpus:

| run | precision | recall |
|-----|-----------|--------|
| 1 | 0.50 | 0.40 |
| 2 | 0.75 | 0.60 |

This is **mediocre and variable** — and the synthetic eval (near-perfect) hid
it entirely. The persistent failure across runs is the trust-killer: live code
(`RequiredRequestInit`, `detectResponseType`) flagged dead because the model
trusts the misleading `0 static references` evidence. The recall ceiling is
dragged down by the test-local "dead" cases (`pathname`, `InferValidatorResponse`),
whose production-dead labels are definitionally debatable — which is why
**precision** is the headline metric.

The live gate (`test/triage-eval.live.test.ts`) is a **regression floor**
(precision ≥ 0.4, recall ≥ 0.3) set under the observed minima, not a target
cherry-picked to pass. **Raising triage accuracy toward precision ≥ 0.85 is a
separate tuning phase** (this phase measures triage; the boundary forbids tuning
it here).
