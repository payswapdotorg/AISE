# AISE Product Journey Simulation

**Date:** 2026-09-16
**Purpose:** Validate that the productization plan composes the implemented AISE capabilities into coherent end-to-end user journeys.

## Simulation model

Simulated roles:

- Field operator using the mobile adapter.
- Project engineer/QS using browser or desktop adapter.
- Project manager reviewing progress and exceptions.
- Specialist reviewer validating evidence/readiness.
- Administrator configuring integrations/providers.

The simulation is a product/design simulation, not evidence that the current deployment has passed the journeys. Actual browser/device execution remains a productization gate.

## Journey A — First-time project setup

```text
LAND
 → create/open project
 → choose project context
 → see immediate next actions
 → import BOQ and/or evidence
 → receive processing status
 → land in project overview
```

Expected output:

- understandable project state;
- no requirement to understand AISE internals;
- clear source/revision provenance;
- obvious next task;
- seeded demo path for evaluators.

Failure prevented by plan: technical dashboard without a meaningful first action.

## Journey B — Field capture to engineering-ready reality

```text
MOBILE ADAPTER
 → select task
 → receive adaptive capture mission
 → guided capture
 → device capability notice
 → reference/measurement request when needed
 → resumable upload
 → reconstruction strategy selected
 → evidence/model updates
 → evidence gaps surfaced
 → readiness status
```

Expected output:

- the operator is told exactly what to capture next;
- device limitations change capture burden, never assurance threshold;
- alternative evidence methods are explicit;
- provider-generated geometry is clearly distinguished from observed evidence;
- readiness is a server-owned decision.

Competitor-informed requirement: capture must be effortless enough to compete with smartphone-first reality capture products, while AISE adds adaptive evidence acquisition instead of merely passive recording.

## Journey C — BOQ understanding

```text
PROJECT
 → BOQ Lens
 → select item
 → explanation
 → source cell/page/revision
 → mapped reality/location
 → related drawing/specification/evidence
 → quantity/cost provenance
 → mismatches / missing evidence
 → next action
```

Expected output:

- original BOQ wording remains visible;
- interpretation is explicitly labeled;
- quantity/cost explanations lead back to source;
- mismatch does not silently rewrite BOQ or reality;
- user can move from cost question to physical evidence.

Competitor-informed requirement: AISE must match the auditability and editable/reviewable nature expected from modern takeoff products, not merely summarize BOQs with chat.

## Journey D — Defect / Engineering Case

```text
EVIDENCE
 → create/select issue
 → inspect observations
 → inspect measurements
 → inspect material/condition
 → see uncertainty
 → see missing evidence
 → request next capture
 → form hypotheses
 → deterministic rule checks
 → reviewer decision
```

Expected output:

- evidence is attached to each consequential assertion;
- hypotheses remain hypotheses;
- uncertainty is visible;
- missing evidence produces a concrete action.

Competitor-informed requirement: AISE must be faster than conventional issue/ticket workflows while retaining richer physical context than a defect ticket alone.

## Journey E — Intervention planning

```text
ENGINEERING CASE
 → create intervention scenario
 → establish authoritative existing reality
 → generate proposed state 1
 → proposed state 2
 → proposed final state
 → step through states
 → inspect synchronized 3D
 → inspect synchronized 2D
 → inspect BOQ impact
 → compare alternatives
 → approve / reject proposal
```

Expected output:

- no proposed state mutates existing reality;
- each state has a stable ID across all views;
- quantities/costs are traceable;
- proposal certainty is distinct from observed certainty.

This is a core differentiator and should be the visible bridge between reality intelligence and action.

## Journey F — Execution and outcome loop

```text
APPROVED INTERVENTION
 → execution record
 → post-work capture
 → compare against prior reality
 → classify outcome
 → update case
 → retain before/after evidence
 → learn workflow/outcome signals
```

Expected output:

- actual execution is not inferred from plan completion;
- observed post-work evidence is authoritative for the changed condition;
- before/after evidence can be reviewed spatially and temporally;
- lessons feed future workflows without overwriting history.

Competitor-informed requirement: AISE should close the loop beyond documentation/progress into intervention and measured outcome.

## Journey G — Incumbent-first workflow

```text
AISE PROJECT
 → connected incumbent context
 → inspect source identity
 → act through approved connector
 → retain external artifact ID
 → record synchronization provenance
 → optionally migrate one workflow
 → prove semantic equivalence
 → retain rollback
```

Expected output:

- AISE is the primary interface without pretending every incumbent is replaced;
- connectors are reversible;
- external systems retain their domain authority;
- switching friction becomes measurable.

## Journey H — Provider substitution

```text
same evidence
 → provider A
 → candidate artifacts + provenance
 → provider B
 → candidate artifacts + provenance
 → compare diagnostics
 → select/retain candidate
 → assurance/verification
```

Expected output:

- no provider becomes semantic authority;
- WorldSculpt, World Labs Atlas, Magic Leap Atlas and future engines can be added/removed;
- unavailable provider produces an explicit state;
- optional provider failure cannot break the product or lower assurance.

## Adapter consistency test

For every core task, simulate:

```text
same intent
same authorized domain state
same permitted actions
same outcome semantics
        │
        ├── web browser adapter
        ├── desktop adapter
        └── mobile adapter
```

Differences may exist in input method, sensor access, screen density, offline behavior and platform affordances. Differences may not exist in authority, epistemic state, domain semantics or allowed transitions.

## Simulation conclusion

The productization plan is coherent only when the final product exposes **tasks and next actions**, not AISE's internal architecture. The shared product/API contract is therefore the center of the client architecture, with browser, desktop and mobile as adapters.

The highest-value integrated journey is:

```text
capture reality
 → establish evidence/readiness
 → understand BOQ/scope
 → diagnose issue
 → simulate intervention
 → inspect cost/geometry consequences
 → execute
 → recapture
 → measure outcome
```

That journey is the primary composition test for AISE.
