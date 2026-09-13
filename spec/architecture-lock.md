# AISE v2 Architecture Lock

**Version:** 2.0
**Status:** FROZEN BASELINE

These invariants cannot be changed by implementation workers. Changes require an Architecture Change Record approved by the Architect/Tech Lead.

## Authority

1. Reality Graph is the only canonical engineering-model authority.
2. Evidence Graph is the only provenance authority.
3. Assurance Engine is the only task-readiness authority.
4. Verification Engine is the only formal deterministic verification authority.
5. BOQ Graph is a domain representation, never a second reality authority.
6. Intervention states are proposals until supported by post-execution evidence.
7. LLMs and agents are non-authoritative.
8. UI state, mobile state and exported files are not canonical authorities.

## Truth and uncertainty

- Raw field evidence is immutable.
- Derived models are versioned; reprocessing creates new versions.
- `OBSERVED`, `INFERRED`, `CONFIRMED`, `PROPOSED` remain distinct.
- `UNKNOWN`, `NOT_OBSERVED`, `OCCLUDED` never imply absence.
- Every consequential assertion carries provenance.
- Confidence never substitutes for measurement uncertainty.
- Estimates cannot silently become measurements.

## Capability-aware acquisition

- Engineering assurance requirements are independent of device capability.
- Device capability determines capture method, operator burden, evidence substitutions and escalation—not the truth standard.
- The planner must expose material device limitations before declaring task readiness.
- A weaker device may require more operator evidence or a specialist instrument.
- An inadequate device must yield an explicit escalation/not-ready state.
- Device capability is represented as structured facts, not one opaque score.

## Adaptive evidence

- Capture missions are task-specific.
- The platform may ask for further footage, reference objects, manual dimensions, instrument readings or human answers.
- Next-action recommendations must be grounded in explicit evidence gaps.
- Additional acquisition cannot fabricate or overwrite evidence.
- Readiness must be recomputable from evidence/model state and must not rely on hidden client assertions.

## Reconstruction

- Reconstruction strategy selection is explicit and versioned.
- Algorithms may be replaced/combined behind a stable processing contract.
- Photorealistic, measurable 3D and 2D representations are projections of the canonical model, not competing authorities.
- Deterministic geometry and measurement computations are used when consequences are measurable.

## BOQ Lens

- Original BOQ wording is preserved.
- Normalization and mapping are explicit derived interpretations.
- BOQ quantities/costs retain source identity and revision history.
- BOQ-to-reality mappings carry provenance and uncertainty/confidence.
- The platform can report mismatch without silently changing either source.

## Intervention

- Proposed intervention states cannot mutate authoritative existing reality.
- Every intervention state is reproducible from scenario inputs and transformations.
- BOQ/2D/3D views of one intervention state must refer to the same proposed state identifier.
- Executed outcomes require new field evidence before becoming observed reality.

## Critical assurance

Any change touching measurement, reconstruction, model semantics, evidence, readiness, engineering rules, BOQ quantity mapping or intervention simulation is CRITICAL and requires the applicable benchmark, negative/discrimination and physical evidence.
