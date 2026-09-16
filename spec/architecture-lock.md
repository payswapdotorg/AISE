# AISE v2 Architecture Lock

**Version:** 2.2 + client-adapter boundary + interactive solution workflow + layered architecture
**Status:** FROZEN BASELINE
**Change records:** `spec/governance/architecture-change-record-002.md`, `spec/governance/architecture-change-record-003.md`, `spec/governance/architecture-change-record-004.md`, `spec/governance/architecture-change-record-005.md`, `spec/governance/architecture-change-record-006.md`

These invariants cannot be changed by implementation workers. Changes require an Architecture Change Record approved by the Architect/Tech Lead.

## Authority

1. Reality Graph is the only canonical engineering-model authority.
2. Evidence Graph is the only provenance authority.
3. Assurance Engine is the only task-readiness authority.
4. Verification Engine is the only formal deterministic verification authority.
5. BOQ Graph is a domain representation, never a second reality authority.
6. Intervention states are proposals until supported by post-execution evidence.
7. Solution Graph is canonical only for a proposed solution's operation/state history; it is never observed reality.
8. LLMs and agents are non-authoritative planners, translators, explainers and tool users.
9. UI state, mobile state, desktop state and exported files are not canonical authorities.
10. External construction systems of record may remain authoritative for their own domains; AISE stores explicit references, mappings and synchronization provenance.

## Three capability layers

```text
LAYER 1 — REALITY
capture → spatial context → evidence → reconstruction → readiness

LAYER 2 — UNDERSTANDING
engineering question → Evidence Envelope → reasoning → deterministic checks → bounded action

LAYER 3 — SOLUTION
problem → typed EngineeringOperation → proposed states → validation → solution BOQ
```

The layers are product capabilities over the same canonical engineering core. They do not create separate truth systems.

## Client-adapter boundary

- Desktop, mobile and browser clients are adapters over one AISE product/domain core.
- Clients share the same semantic task/capability contracts and may differ only in presentation and platform-specific interaction.
- Mobile may own camera, depth, LiDAR and sensor APIs plus bounded offline queues, but cannot own canonical engineering state.
- Browser may optimize project-wide inspection, collaboration and analysis, but cannot create a browser-only authority.
- Desktop may be a richer installed shell or wrapper over the same application contracts; it must not fork domain logic.
- New client surfaces must not require a parallel Reality Graph, Evidence Graph, Assurance Engine, Verification Engine, BOQ authority or Solution Graph authority.
- Platform-specific UI state is ephemeral/presentational and never evidence of authorization, measurement, readiness or truth.

## Truth and uncertainty

- Raw field evidence is immutable.
- Derived models are versioned; reprocessing creates new versions.
- `OBSERVED`, `INFERRED`, `CONFIRMED`, `PROPOSED` remain distinct.
- `UNKNOWN`, `NOT_OBSERVED`, `OCCLUDED` never imply absence.
- Every consequential assertion carries provenance.
- Confidence never substitutes for measurement uncertainty.
- Estimates cannot silently become measurements.

## Layer 1 capability-aware acquisition

- Engineering assurance requirements are independent of device capability.
- Device capability determines capture method, operator burden, evidence substitutions and escalation—not the truth standard.
- Coverage, spatial registration, retrieval and adaptive evidence acquisition are first-class state.
- An inadequate device yields explicit escalation/not-ready state.
- Offline/resume must preserve evidence identity and provenance.
- Reconstruction/world-model engines are replaceable providers behind a stable contract.

## Layer 2 Evidence Envelope

Every consequential reasoning result must carry an Evidence Envelope containing, where applicable:

- question/task intent;
- authorized project/context;
- supporting evidence IDs and revisions;
- observed/confirmed facts;
- explicit inferred assumptions;
- unknowns/evidence gaps;
- measurement uncertainty;
- deterministic checks/tools invoked;
- result/claim and status;
- next recommended action;
- invalidation/change conditions;
- agent/provider identity.

Reasoning providers remain replaceable. Evidence, uncertainty, authorization and verification semantics do not depend on a specific model or framework.

## Layer 3 interactive solution

- A Solution Graph records proposed engineering operations and resulting proposed states.
- Every consequential operation is typed, parameterized, spatially anchored and reproducible from versioned inputs.
- Direct manipulation and agent-generated commands resolve to the same operation contract.
- `Validate` is server-side and deterministic for supported checks; invalid/unknown/review-required operations remain explicit.
- A solution BOQ may be generated only from a declared validation snapshot of a solution version.
- Generated BOQ lines retain bidirectional links to contributing solution operation(s), geometry/state references and calculation provenance.
- The initial supported operation library is buildings-only; the operation contract remains extensible to later domains.

## Technology substitution / anti-lock-in

The full technology substitution contract is `spec/technology-substitution-contract.md` and is binding across all layers.

- Layer 1 technologies include capture SDKs, device/sensor integrations, tracking/registration, reconstruction, semantic extraction, spatial indexing and 2D/3D rendering.
- Layer 2 technologies include LLMs, multimodal models, embeddings, retrieval/vector systems, agent frameworks, tool-routing systems, local models and deterministic reasoning/rules implementations.
- Layer 3 technologies include geometry kernels, constraint/physics engines, operation planners, scene graphs, renderers, interaction frameworks and optimization/search engines.
- Technology providers are behind stable AISE ports; provider-specific types must not cross the domain-contract boundary.
- Canonical IDs must not encode vendor-specific meaning.
- Provider identity/version/configuration/input digests/diagnostics/limitations belong in provenance.
- A provider swap must preserve domain semantics, authority, epistemic state, provenance and client contracts.
- New providers must pass contract, semantic-equivalence, negative/discrimination, provenance, failure and dependent-layer regression checks before replacing an existing provider.
- Provider removal must not make historical canonical records uninterpretable.

## Reconstruction provider examples

WorldSculpt, World Labs Atlas, Magic Leap Atlas, classical SfM/MVS, LiDAR/depth fusion, reference-constrained reconstruction, specialist instruments and future engines are optional providers behind the common reconstruction contract.

## BOQ Lens

- Original BOQ wording is preserved.
- Normalization and mapping are explicit derived interpretations.
- BOQ quantities/costs retain source identity and revision history.
- BOQ-to-reality mappings carry provenance and uncertainty/confidence.
- A solution-generated BOQ is a separate derived projection tied to a validated Solution Graph version and never overwrites a source BOQ.

## Incumbent integration and adoption

- AISE is the primary engineering interface and context/action layer, not a mandatory rip-and-replace migration.
- Connectors preserve external systems of record and make their capabilities available from AISE where authorized.
- Integration quality is a first-class product quality attribute.
- Workflow migration is progressive, reversible and evidence-backed.
- An incumbent step is not considered replaced without semantic equivalence, operational acceptance and rollback capability.
- Codex Universal may orchestrate AISE through stable capabilities, workflows, plugins/connectors and API/MCP, but AISE remains the authority for its engineering domain.

## Intervention and outcome

- Proposed intervention/solution states cannot mutate authoritative existing reality.
- Every proposal state is reproducible from its inputs.
- BOQ/2D/3D views of one proposal refer to the same state identifier.
- Executed outcomes require new field evidence before becoming observed reality.

## Critical assurance

Any change touching measurement, reconstruction/provider integration, model semantics, evidence, readiness, engineering rules, BOQ quantity mapping, intervention simulation, external-source mapping, client adapter semantics, migration equivalence, Solution Graph semantics, operation execution, Evidence Envelope semantics or technology substitution is CRITICAL and requires the applicable benchmark, negative/discrimination and physical evidence.
