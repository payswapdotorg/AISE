# Architecture Change Record 002 — Incumbent-First Integration and Codex Vertical Boundary

**Status:** APPROVED
**Architecture version:** 2.1
**Supersedes:** none; additive clarification to 2.0
**Decision owner:** AISE Architect
**Date:** 2026-09-13

## Decision

AISE remains a standalone engineering-domain platform. It SHALL NOT become a domain subsystem inside the Codex Universal runtime.

AISE SHALL expose a stable integration boundary that allows Codex Universal to consume AISE as a vertical through capabilities, workflows, plugins/connectors and APIs/MCP without making Codex an AISE authority.

AISE SHALL optimize for primary-interface adoption before exclusive-interface adoption. Existing construction systems of record remain connected and authoritative where they already hold contractual or operational authority. AISE provides an orchestration, evidence/context and action layer above them and supports gradual workflow migration.

## Motivation / evidence

The Codex architecture explicitly separates the Codex runtime, workflow platform, execution plane, evidence plane and external capability adapters. Workflows are intended to remain provider/environment independent and can reuse skills, plugins and MCP. `payswapdotorg/codex` is therefore a suitable execution/orchestration substrate, but not the correct owner of construction engineering reality, measurement assurance or BOQ semantics.

The AISE adoption sensitivity analysis shows that primary-interface adoption is most sensitive to incumbent integration quality, while exclusive adoption is dominated by switching friction. Large firms are materially more constrained by systems of record than small firms. This creates a strong product requirement: AISE must integrate first and replace selectively rather than demand a rip-and-replace migration.

## New/clarified invariants

1. AISE Reality Graph remains the sole canonical engineering-model authority.
2. AISE Evidence Graph remains the sole provenance authority.
3. AISE Assurance Engine remains the sole engineering task-readiness authority.
4. AISE Verification Engine remains the sole AISE formal deterministic verification authority.
5. External construction systems may remain systems of record; AISE stores explicit external references and synchronization provenance.
6. AISE integration adapters translate between semantic contracts; they do not transfer canonical authority silently.
7. AISE SHALL support a `Primary Interface` mode in which users can inspect/reason/act from AISE while invoking external systems through connectors.
8. AISE SHALL support an incremental `Workflow Migration` mode where incumbent workflows are inventoried, friction is measured, and replaceable steps are migrated one at a time.
9. Codex Universal may orchestrate AISE capabilities but cannot directly own or mutate AISE reality/evidence/assurance state outside AISE-approved APIs/contracts.
10. AISE SHALL provide a Codex integration pack without requiring Codex core changes for initial integration.
11. A Codex integration must fail explicitly when AISE assurance, permission, evidence or capability prerequisites are not met.

## Integration shape

```text
Construction systems of record
 BOQ | BIM | CAD | PM | ERP | Docs
         ↕ connectors
AISE Vertical / Domain Platform
 Reality Graph | Evidence Graph | Assurance | BOQ | Cases | Interventions
         ↕ stable API / MCP / event contracts
Codex Universal
 Workflow + agent orchestration + skills/plugins + execution
         ↕
 User / organization
```

## Codex compatibility strategy

The initial integration SHALL be external to Codex core:

- AISE publishes provider-neutral APIs and optional MCP capabilities.
- AISE publishes a Codex workflow/plugin pack that declares required capabilities, resources and permissions.
- Codex binds those capabilities at runtime using its existing capability/plugin/MCP contracts.
- AISE-specific semantics remain in AISE contracts and services.
- Later, once Codex integration surfaces stabilize, an optional thin Codex adapter may be added through the normal Codex Work Order and architecture governance process.

No current Codex Work Order is blocked by AISE and no Codex core modification is required to continue Codex development.

## Workflow migration boundary

AISE SHALL maintain a migration model that records, for each incumbent workflow:

- current system/step;
- source of record;
- dependency/resource;
- user role;
- switching friction estimate;
- integration quality/readiness;
- candidate AISE replacement;
- evidence of semantic equivalence;
- migration status;
- rollback path.

Migration is progressive and reversible. An incumbent step is not declared replaced merely because an AISE feature exists; equivalence and operational acceptance are required.

## Compatibility impact

The change is additive to AISE 2.0 and does not change canonical authority, epistemic semantics, evidence rules, or the Android/backend ownership split.

No migration of existing AISE implementation state is required because the repository is still at the architecture baseline with AISE-001/002 activated.

## Verification impact

Future integration work must include:

- connector contract tests;
- source-of-record preservation tests;
- permission-boundary tests;
- failure/rollback tests;
- semantic-equivalence tests for migrated workflows;
- adoption pilot measures for primary-interface usage and switching friction.

## Approval rule

Implementation changes caused by this record remain bounded Work Items. Any future change that moves construction-domain authority into Codex requires a new Architecture Change Record and a new cross-project compatibility review.
