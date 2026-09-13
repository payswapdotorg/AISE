# Architecture Change Record ACR-001 — AISE v2 Reforge

**Status:** APPROVED BASELINE
**Date:** 2026-09-13
**Supersedes:** earlier `pectoraux/AISE` v1 architecture concepts

## Reason

BOQ Lens and the proposed field workflow exposed that AISE needed capability-aware capture planning, adaptive evidence acquisition, explicit BOQ semantics and intervention-state simulation as core platform primitives rather than later verticals.

## Changes

1. Introduced `DeviceCapabilityProfile`, `CaptureMission`, `EvidenceGap` and `ObservationEpisode` as first-class concepts.
2. Made assurance invariant to device capability; weak devices increase operator evidence burden or cause escalation.
3. Added strategy-selectable reconstruction rather than a single reconstruction path.
4. Added BOQ graph connected to Reality Objects without creating a second source of truth.
5. Added Engineering Case and Intervention Scenario/State model.
6. Added synchronized 2D/3D/BOQ views for intervention states.
7. Added execution/outcome loop and historical comparison.
8. Reframed incumbent products as connected systems rather than mandatory rip-and-replace competitors.
9. Reworked implementation into three-worker-safe waves.

## Preserved invariants

Reality Graph, Evidence Graph, Assurance, Verification, epistemic semantics, raw-evidence immutability, uncertainty semantics, device adapters and client/server ownership remain architectural authorities as defined in `spec/architecture-lock.md`.

## Adoption rationale

The competitive simulation indicates that primary-interface adoption is easier than exclusive replacement in large firms. AISE should win the user interface/context layer first, while connectors allow incumbent systems to remain behind the scenes where required.

## Acceptance

The v2 baseline is implemented as repository artifacts in `payswapdotorg/AISE`; implementation begins only from `AISE-001` and `AISE-002`.
