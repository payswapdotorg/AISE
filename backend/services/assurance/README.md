# @aise/backend-assurance — Confidence, uncertainty & readiness service (AISE-013) + the task-intent assurance engine (AISE-020)

The backend surface of the AISE-013 task-specific model-readiness
assessment — architecture-lock §1: "the Accuracy/Assurance
subsystem is the **only authority for model-readiness and
validation status**" — extended by the AISE-020 task-intent
engine: the deterministic mapping from engineering intent to
required evidence and verification depth (architecture §7, REQ-003,
AC-021).

The service turns five inputs into one readiness verdict:
geometry/measurement uncertainty (AISE-009 vocabulary, ingested
through AISE-011), evidence coverage (the AISE-012
`assertionSupport` completeness view), epistemic state (preserved,
never rewritten), task intent (the declared task/assurance
profile), and verification evidence (the AC-062/AC-063 validity
projection) — **without conflating confidence with measurement
uncertainty and without silently upgrading epistemic status**.

- **`intent`** (AISE-020) — the deterministic intent→requirements
  engine. `INTENT_CONTRACTS`: the explicit, frozen, per-intent
  table of minimum assurance depths with architecture-§7
  rationales and content digests (MAINTENANCE → STANDARD;
  AS_BUILT → HIGH_ASSURANCE; INSPECTION → CRITICAL — no intent
  floors at LIGHT). `resolveTaskAssurance({intent,
  declaredProfile?})`: the pure mapping — the effective depth is
  `max(declared, floor)` (the floor when undeclared: REQ-003, the
  system determines), with the requirement rows read from
  AISE-013's single table BY REFERENCE (no second authority), an
  explicit evidence-requirements projection, an
  `INTENT_PROFILE_FLOORED` finding when the declaration was
  floored (transparent, never silent), and a content-pinned
  digest. `intentTaskProfile()`: the sanctioned fail-closed
  constructor for intent-bound task profiles — a declared profile
  below the intent floor is REFUSED
  (`INTENT_PROFILE_BELOW_FLOOR`, the required minimum named in
  the message) and nothing is constructed; at or above the floor
  it is exactly AISE-013's `taskProfile()`. Monotone by
  construction: the floor only raises depth, requirements only
  widen (the lattice proof runs the full input lattice — 3
  intents × 5 declarations).
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
  AISE-020 adds two service verbs, both additive:
  `resolveTaskAssurance` (the REQ-003 capture-planning query:
  declare intent, the system answers with required evidence +
  verification depth) and `registerIntentTaskProfile` (the
  fail-closed binding: below-floor declarations are refused at
  the boundary BEFORE any store write; compliant ones register
  through the unchanged AISE-013 store semantics).
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
| Intent maps deterministically to assurance requirements (AC-021, arch §7) | The frozen contract table + the pure resolution; bit-identical replays; digest-pinned resolutions; the full input lattice is distinct and monotone (tested) |
| No hidden downgrade for critical work (AISE-020) | The binding path refuses below-floor declarations fail-closed (nothing constructed or registered); the resolution path floors TRANSPARENTLY with an `INTENT_PROFILE_FLOORED` finding; INSPECTION resolves to CRITICAL under EVERY declaration; requirements come from the single AISE-013 table by reference (source-scanned: no second table, no depth-lowering path) |

## Commands

```bash
npm run dev --workspace @aise/backend-assurance   # boot + SIGTERM contract
npm run typecheck --workspace @aise/backend-assurance
npm run test --workspace @aise/backend-assurance  # 182 tests incl. the golden + intent chains
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
- **AISE-020 layering (deliberate, additive)**: the AISE-013
  assessment primitive remains caller-owned — a profile registered
  through `registerTaskProfile` assesses at exactly its declared
  depth, preserving the architect-reviewed golden narrative
  (e.g. exploration declared INSPECTION+LIGHT reads READY at
  LIGHT). The intent floor binds through the ENGINE surfaces only
  (`intentTaskProfile` / `registerIntentTaskProfile` / the
  resolution). Tightening the primitive path itself (refusing or
  flooring pre-existing caller-declared pairs) would change
  AISE-013's reviewed semantics and is therefore a governed
  decision for the architect, not a silent implementation choice;
  downstream consumers (REQ-003 capture planning, AISE-021 rule
  gating) consume the engine.
- Intent resolutions are derived views, not persisted records:
  deterministic replay is the evidence (the same discipline as
  AISE-013's pure computation); persistence of resolution
  snapshots is downstream policy.
- No external intake surface yet: the service composes at the API
  layer (reads arrive with AISE-015); `main.ts` proves the
  boot/shutdown contract and is that composition point.
- Digest bit-identity is per Node runtime (the AISE-011
  canonical-hash precedent; CI pins one).
