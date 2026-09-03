# AISE Assurance & Checkpoint Model v1.0

## Assurance profiles

| Profile | Intended use | Required proof |
|---|---|---|
| LIGHT | UI/cosmetic/non-authoritative changes | unit/static checks + scoped review |
| STANDARD | ordinary application behavior | unit + integration + regression |
| HIGH_ASSURANCE | reconstruction, semantics, exports, workflows | standard + contract tests + benchmark/evidence review + discrimination where protection is claimed |
| CRITICAL | measurements, accuracy, evidence, compliance, authoritative model semantics | high-assurance + golden/physical benchmark + mutation/discrimination + independent architect review |

Profiles add proof depth; they never change authority semantics.

## Checkpoint contracts

Every HIGH_ASSURANCE or CRITICAL Work Item is evaluated against applicable checkpoints:

1. **Authority preservation** — no second source of truth or authority.
2. **Scope integrity** — implementation stays inside declared surfaces.
3. **Dependency integrity** — no hidden branch/runtime dependency.
4. **Data/provenance integrity** — evidence and model lineage are preserved.
5. **Accuracy semantics** — estimates, measurements, confidence and uncertainty remain distinct.
6. **Negative/unknown semantics** — missing observation is not confirmed absence.
7. **Geometry consistency** — impossible/contradictory geometry is rejected.
8. **Interoperability integrity** — exports are derived from canonical model.
9. **Security/tenant integrity** — project/customer boundaries remain server-authoritative.
10. **Concurrency/idempotency** — retries and duplicate operations do not create conflicting truth.
11. **Dogfood/physical validity** — critical model changes run against relevant real or controlled physical captures.
12. **Post-merge truth** — repository state is finalized against actual merge evidence.

## Discrimination requirement

Whenever a Work Item claims that a protection or invariant exists, its tests should deliberately remove or bypass the protection and prove that the corresponding test fails.

Examples:

- remove required evidence → verification must fail;
- replace a measured value with inference → measurement assertion must fail;
- convert `NOT_OBSERVED` to `CONFIRMED_ABSENT` → semantic validation must fail;
- bypass tolerance rule → compliance test must fail;
- mutate canonical model without version/provenance update → integrity test must fail.

## Model benchmark requirement

AI/model changes are not accepted solely on test-suite success. The Work Item must state:

- benchmark fixtures;
- ground-truth source;
- metrics;
- threshold/acceptance rule;
- regression rule;
- known failure modes.

Aggregate metrics must not hide regressions on critical measurements or safety-relevant classes.
