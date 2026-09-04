# @aise/backend-assurance — Confidence, uncertainty & readiness service (AISE-013)

The backend surface of the AISE-013 task-specific model-readiness
assessment — architecture-lock §1: "the Accuracy/Assurance
subsystem is the **only authority for model-readiness and
validation status**."

The service turns five inputs into one readiness verdict:
geometry/measurement uncertainty (AISE-009 vocabulary, ingested
through AISE-011), evidence coverage (the AISE-012
`assertionSupport` completeness view), epistemic state (preserved,
never rewritten), task intent (the declared task/assurance
profile), and verification evidence (the AC-062/AC-063 validity
projection) — **without conflating confidence with measurement
uncertainty and without silently upgrading epistemic status**.

- **`profile`** — the declared binding (architecture-lock §3):
  `TaskProfileRecord` (intent + assurance profile + optional
  accuracy budget, content-pinned and immutable after
  registration) plus the **fixed, monotone requirements table**
  (profile → dimension requirements). Callers declare intent; the
  platform owns the depth: LIGHT ⊆ STANDARD ⊆ HIGH_ASSURANCE ⊆
  CRITICAL (a model READY at a higher profile is READY at every
  lower one — tested). Profiles are registered per project;
  identical re-registration is idempotent, conflicting content is
  `exists_conflict`.
- **`readiness`** — the pure computation: six dimensions
  (`model-integrity`, `evidence-coverage`,
  `measurement-uncertainty`, `confirmed-validity`,
  `epistemic-composition`, `uncertainty-budget`), each reported
  with measured numbers and reviewable findings, gated per the
  profile's requirements. The verdict is binary (READY /
  NOT_READY) with `blockingDimensions`; "conditional" grading is
  downstream policy (AISE-020), not invented here. Deterministic:
  canonical orderings, no timestamps, bit-identical digests for
  identical inputs. Fail-closed: invalid graphs, mappings, or
  profiles throw — a verdict is never produced over unverifiable
  inputs.
- **`units`** — exact SI conversion factors (m/mm/cm/inch/foot,
  their squares, rad/degree/gon) for budget evaluation. Exact by
  definition; unknown units fail closed. **Tolerances are never
  converted** — a tolerance is a specification bound, not a
  statistical estimate (the engineering-model discipline preserved
  on the evaluation side; the budget dimension reports them as
  unevaluable instead of inventing a distribution).
- **`store`** — immutable task profiles + append-only,
  integrity-verified readiness assessment records. The record pins
  WHAT was assessed (modelId, version, graphDigest, mappingDigest,
  taskId, profileDigest) and the report content (reportDigest,
  re-derived at the boundary — never caller-supplied; the
  assessment identity is derived from the pinned inputs).
  Idempotent re-assessment (`already_present`); changed mapping →
  new record appended, prior records remain discoverable.
  In-memory v1.0 (the AISE-001 store precedent).
- **`runtime`** — bounded service composition (maxAssertions
  default 50,000; maxTaskProfiles 1,000; maxAssessments 10,000)
  with narrow reader ports: `ModelGraphReader` (committed graphs)
  and `EvidenceMappingReader` (current mapping snapshot). The
  service writes NEITHER: graph and mapping digests are
  bit-identical before and after every assurance operation (proven
  by tests — the no-second-authority guarantee).
  `latestAssessment` reports staleness honestly: a record whose
  mapping pin no longer matches the current mapping is `stale`.
- **`errors`** — typed, fail-closed `AssuranceError` with wrapped
  pure-layer causes preserved (`causeCode`); every code is
  non-retryable by construction except `INTERNAL_ERROR`.

## The separation disciplines (the work item's core claims)

| Rule | Enforcement |
|---|---|
| Confidence never substitutes uncertainty (AC-070/071, lock §3) | The confidence summary is REPORTING-ONLY: no dimension evaluator reads confidence (source-scan + sliced-function tests); verdicts are invariant under confidence changes (mutation-tested) |
| No epistemic upgrades or rewrites (lock §2) | Pure read view over frozen inputs; states pass through as counts; graph digest bit-identical before/after (tested) |
| No second canonical authority (lock §1) | The report is derived data; the service exposes no graph/mapping mutation verb (source-scan + surface test); digests unchanged (tested) |
| Fail-closed CRITICAL (lock §3) | Tampered graph/mapping/profile → typed error; budget ambiguity (tolerance or missing uncertainty) FAILS at CRITICAL; advisory at HIGH_ASSURANCE |
| Task-specific accuracy (arch §2.5) | The declared budget is evaluated per family in SI; exceeded → BUDGET_EXCEEDED; the golden chain shows the same model READY at one budget and NOT_READY at a tighter one |

## Commands

```bash
npm run dev --workspace @aise/backend-assurance   # boot + SIGTERM contract
npm run typecheck --workspace @aise/backend-assurance
npm run test --workspace @aise/backend-assurance  # 128 tests incl. the golden chain
```

## Known limitations (documented, not hidden)

- In-memory store (AISE-001 precedent); durability arrives with the
  persistence layer.
- The fixed requirements table (thresholds 0.25/0.6/1.0 coverage,
  per-profile budget enforcement) is v1 default policy documented
  for architect review — a task may not loosen a floor; tightening
  is additive downstream policy (AISE-020).
- A CRITICAL task without a declared accuracy budget assesses with
  an advisory `NO_ACCURACY_BUDGET` finding (transparency), not a
  refusal — the profile binding itself is declared.
- No external intake surface yet: the service composes at the API
  layer (reads arrive with AISE-015); `main.ts` proves the
  boot/shutdown contract and is that composition point.
- Digest bit-identity is per Node runtime (the AISE-011
  canonical-hash precedent; CI pins one).
