# AISE Architecture Lock v1.0

**Status:** FROZEN

This document is authoritative for the v1.0 architecture. Implementation agents must not modify these rules in place.

## 1. Authority invariants

- `/workflow` is the only implementation workflow authority.
- `/verification` is the only formal software/product verification authority.
- The Reality Graph is the only canonical structured engineering-model authority.
- The Evidence subsystem is the authoritative provenance mapping for engineering assertions.
- The Accuracy/Assurance subsystem is the only authority for model-readiness and validation status.
- The Export layer consumes the Reality Graph; it does not become a second source of truth.
- LLMs and coding agents are non-authoritative participants.

## 2. Reality-truth invariants

- Raw captures are immutable evidence artifacts.
- Derived geometry/model versions are versioned; prior versions remain discoverable.
- `OBSERVED`, `INFERRED`, `CONFIRMED`, and `PROPOSED` are distinct epistemic states.
- `UNKNOWN`, `NOT_OBSERVED`, and `OCCLUDED` must not be encoded as `CONFIRMED_ABSENT` without affirmative evidence.
- A consequential engineering assertion must have traceable provenance.
- Removing provenance must invalidate the assertion's verified status.
- AI-generated inference must never silently overwrite measured or confirmed data.

## 3. Accuracy invariants

- Accuracy is task-specific; the product must bind outputs to a declared purpose/assurance profile.
- Measurements must carry units and, where available, uncertainty/tolerance.
- A confidence score cannot substitute for measurement uncertainty.
- No system component may silently upgrade an estimate into a measurement.
- Geometry calculations that can be deterministic must use deterministic geometry/measurement logic rather than free-form LLM output.
- Critical/compliance results are fail-closed when required evidence is missing or ambiguous.

## 4. Capture invariants

- Mobile capture must be offline-capable and resumable.
- Device-specific sensing remains behind device adapters; canonical project data is device-neutral.
- Capture guidance may request additional evidence but may not fabricate missing observations.
- A capture session records source-device and acquisition metadata sufficient for reproducibility where available.

## 5. Cross-platform ownership invariants

### Z.ai owns

- Web application.
- Browser 2D/3D engineering workspace.
- Backend/API and cloud processing services.
- Reality Graph implementation.
- Evidence, verification, accuracy, rules and export services.
- IFC/DXF/report generation.
- Desktop integrations/connectors.
- Enterprise integrations.

### Gemini owns

- Android application.
- Android camera/video capture.
- Android-supported depth/LiDAR/device-sensor integration.
- Offline capture store.
- Field guidance and capture UX.
- Android upload/synchronization client.
- Android-specific performance and device compatibility.

### Shared work

- Shared contract/interface changes are explicit `SHARED` Work Items.
- A shared Work Item names a primary owner and secondary owner.
- Shared files/surfaces require coordination metadata and cannot be concurrently modified without an explicit merge plan.
- Neither agent may claim the other's owned surface merely because it is convenient.

## 6. Development governance invariants

- One Work Item = one implementation branch = at most one active implementation PR.
- A Work Item may begin only when hard dependencies are complete.
- Work Items declare change surfaces before implementation.
- Shared-authority/shared-migration conflicts block unsafe parallel starts.
- Architectural decisions are recorded in repository-resident ADRs/Work Orders.
- Implementation-agent statements are claims, not completion evidence.
- Architect review is the merge gate.
- Post-merge development state must be finalized against actual merge evidence.
- Material repository state must be reconstructable without conversational history.

## 7. Verification invariants

- Acceptance criteria must identify evidence expected to prove them.
- Verification must include mutation/discrimination tests where a protection is consequential.
- Cross-component workflows require composition/integration validation in addition to local tests.
- AI/model changes require benchmark evidence, not only software tests.
- Changes to measurement, accuracy, evidence, compliance or authoritative model semantics are `CRITICAL` assurance.

## 8. Stop conditions

Raise an Architecture Change Request rather than implementing if a change requires:

- a second canonical Reality Graph authority;
- a second evidence/provenance authority;
- a second verification authority;
- silently changing epistemic semantics;
- bypassing evidence/accuracy requirements;
- moving Android authority into the backend or web client without an explicit architecture decision;
- making the browser/mobile UI authoritative for engineering state;
- introducing vendor-specific CAD/BIM software as the canonical source of truth;
- changing frozen v1.0 ownership or authority boundaries.
