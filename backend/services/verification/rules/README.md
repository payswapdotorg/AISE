# @aise/backend-rules — Engineering rule engine (AISE-021)

The backend surface of the AISE-021 engineering rule engine —
architecture §4.6 (the verification engine "evaluates
deterministic quality, consistency, rules, tolerances, evidence
completeness and task-specific readiness"), architecture §2.6
("geometry, tolerances, dimensional calculations, topology
checks, and compliance rules use deterministic algorithms"), and
the pipeline's ENGINEERING RULES stage.

**Machine-evaluable dimensions, tolerances and specification
rules with PASS/FAIL/UNKNOWN semantics** over the canonical
Reality Graph (AISE-011), the authoritative evidence mapping
(AISE-012), and the AISE-013 readiness authority. A deterministic
evaluator — never a model authority.

- **`rule`** — the machine-evaluable definitions. `DimensionRule`:
  a quantity subject compared against an explicit bound
  (MINIMUM / MAXIMUM / EXACT) with an optional specification-side
  `margin` (the spec's own tolerance). `SpecificationRule`: the
  subject must be asserted with at least a declared epistemic
  status (optionally as a direct measurement). `RuleSet`: the unit
  of evaluation — validated fail-closed (ids, subjects,
  operators, bounds, units, margins, statuses), content-pinned
  (canonical digest), frozen. A rule set declares the assurance
  profile its runs must satisfy (a run below it is refused — no
  silent downgrade), and a CRITICAL set MUST declare a
  `readinessGate` (compliance work cannot bypass the readiness
  authority — the pipeline places rules after readiness).
- **`evaluate`** — the deterministic ladder, fixed and documented:
  readiness gate → subject resolution (absence is not
  compliance, architecture §2.9) → quantitative/unit gates →
  epistemic status floor → evidence gate (AC-111) → uncertainty
  gate → **the uncertainty-aware interval comparison**: the
  value's possible-value interval (standard u / expanded U /
  tolerance offsets — interval arithmetic, never a distribution
  invention) versus the operator's compliant region, both in SI
  base units. Entirely inside → PASS; entirely outside → FAIL
  (`RULE_NOT_SATISFIED`); **overlapping → UNKNOWN**
  (`RULE_INDETERMINATE`) — an uncertainty band that straddles the
  bound is never a lucky PASS (lock §3: critical results fail
  closed when evidence is ambiguous).
- **`vocabulary`** — the outcome tri-state with FIXED precedence
  (FAIL > UNKNOWN > PASS; PASS iff every result PASSes), the
  stable result-code registry (12 codes), and the fixed
  profile-monotone gating tables: status floor
  (INFERRED ≤ STANDARD, OBSERVED at HIGH_ASSURANCE, CONFIRMED at
  CRITICAL; PROPOSED never establishes), uncertainty and live
  evidence support required from HIGH_ASSURANCE up.
- **`boundary`** — the service trusts nothing: the graph is
  re-validated (`validateRealityGraph`) and its digest
  re-derived; the mapping is re-validated and project-matched;
  the rule set is re-validated and its digest re-derived (a
  hand-crafted set that skipped construction validation never
  reaches the evaluators); the run profile must satisfy the set's
  declared profile; the readiness context is structurally
  validated.
- **`report`** — the deterministic result: per-rule results in
  the set's canonical order (outcome, code, expected/actual,
  epistemic passthrough, live evidence refs), service-computed
  counts, the tri-state aggregate, a content-pinned digest and a
  derived `reportId`. Timestamp-free, clock-free, replay
  bit-identical. The run profile is recorded (AC-110).
- **`runtime`** — bounded composition over narrow reader ports
  (`RulesModelReader`, `RulesEvidenceMappingReader`,
  `RulesReadinessReader` — the AISE-013/014 port pattern): the
  service reads committed graphs, the current mapping and the
  latest readiness record; it writes NOTHING (the no-second-
  authority guarantee, digest-proven by tests).
- **`units`** — exact SI conversion factors over the model's
  frozen unit vocabulary (length/area/angle), pinned to it by a
  regression test.

## The separation disciplines (the work item's core claims)

| Rule | Enforcement |
|---|---|
| Deterministic rule evaluation | Pure functions, canonical order, content-pinned rule sets and reports, digest-derived identities; bit-identical replay tested (unit + golden) |
| Uncertainty-aware tolerances | Interval comparison with explicit inside/outside/overlap cases (source-scanned); the straddle is UNKNOWN — mutation-tested (ignore-interval, straddle-as-PASS both detected) |
| Evidence/readiness gating | AC-111: no live support at depth → RULE_NO_EVIDENCE_SUPPORT; declared/CRITICAL gate → missing/stale/not-ready codes; the gate short-circuits evaluation (source-scanned + mutation-tested) |
| Fail-closed CRITICAL | CRITICAL sets without a gate refused at construction; run below the set's profile refused at the boundary; tampered inputs throw; PROPOSED never establishes; PASS requires affirmative satisfaction on established, supported content |
| Discrimination tests | 10/10 mutations detected (see the PR evidence); post-harness restore re-verified |
| No second authority | Reader ports only; no mutation verbs on the surface; graph/mapping digests bit-identical through every rules operation (tested) |

## Commands

```bash
npm run dev --workspace @aise/backend-rules       # boot + SIGTERM contract
npm run typecheck --workspace @aise/backend-rules
npm run test --workspace @aise/backend-rules      # 88 tests incl. the golden chain
```

## Known limitations (documented, not hidden)

- v1 rule kinds cover scalar dimension and specification rules
  over property assertions; topology- and geometry-shaped rules
  (object-class predicates, opening/host relations) are future
  rule kinds — the evaluator's subject model already carries the
  space/object distinction they need.
- One assertion per (subject, propertyKey) is evaluated (the
  graph's own uniqueness discipline); multi-assertion conflict
  detection is AISE-014's QA surface, not duplicated here.
- Readiness contexts are adapter views (the AISE-013 report's
  structural mirror); the rules engine checks pins and verdicts,
  but AISE-013 remains the sole readiness authority.
- In-memory composition; no rule-set persistence/registry store
  yet (rule sets are content-pinned values; persistence is
  downstream policy); no external intake surface (binds at the
  API layer — `main.ts` proves the boot contract).
- Digest bit-identity is per Node runtime (the AISE-011
  canonical-hash precedent; CI pins one).

## Out of scope (Work Item discipline)

`apps/android/**`, `spec/**`, `apps/web/**`, `packages/**`,
unrelated services, architecture/epistemic/authority semantics —
untouched. The engine consumes engineering-model pure functions
and the AISE-013 report's adapter view; it rewrites nothing.
