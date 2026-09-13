# Architecture Change Record 003 — WorldSculpt as a Pluggable Reconstruction Engine

**Status:** APPROVED
**Architecture version:** 2.2
**Previous version:** 2.1
**Decision owner:** AISE Architect
**Date:** 2026-09-13

## Decision

AISE SHALL remain the owning engineering-domain platform and SHALL NOT become a fork or derivative application of `payswapdotorg/WorldSculpt`.

WorldSculpt SHALL be treated as a pluggable reconstruction engine behind AISE's existing reconstruction strategy contract. AISE-012 is expanded to include a first-class WorldSculpt adapter and compatibility layer.

AISE SHALL retain alternative reconstruction strategies and explicit insufficient-evidence paths. WorldSculpt availability, GPU class, model version, checkpoint identity, licensing constraints or inference failure must never change the engineering assurance requirement.

## Evidence

WorldSculpt is specifically designed to generate compositional 3D representations of heavily cluttered scenes from grounded multi-view inputs. Its released pipeline produces object-level meshes in a shared metric world frame and exposes multi-view conditioning and scene composition code. The repository describes a pipeline centered on Pixal3D, DINOv3, multi-view LoRA/aggregation and mesh/GLB generation.

This aligns strongly with AISE's reconstruction problem, particularly object-level scene decomposition, multi-view grounding, shared-world placement and reconstruction under occlusion.

However, WorldSculpt is not an engineering information system. Its current repository is an inference/research pipeline rather than an authority-bearing Reality Graph, evidence/provenance system, task-assurance engine, verification engine, BOQ system, guided capture application, intervention system or enterprise construction platform. AISE therefore must wrap it rather than inherit its application architecture.

## New invariants

1. WorldSculpt is an implementation dependency/adapter, never a source of engineering authority.
2. WorldSculpt outputs are candidate derived geometry until accepted by AISE evidence, uncertainty, verification and readiness rules.
3. WorldSculpt model/checkpoint/version identity is retained as provenance on every derived artifact.
4. WorldSculpt's shared metric frame may be consumed as geometric input, but AISE remains responsible for calibration validity, measurement uncertainty and engineering readiness.
5. WorldSculpt may be selected, skipped, replaced or combined with other strategies without changing AISE semantics.
6. A WorldSculpt failure or unavailable GPU/runtime produces an explicit fallback/escalation state; it cannot silently downgrade assurance.
7. AISE captures remain the source evidence. WorldSculpt must not invent source observations and then promote them to observed facts.
8. WorldSculpt object meshes must be registered against stable AISE Reality Object identities through explicit mapping and provenance.
9. Generated appearance/texture is visualization evidence only unless independently supported by AISE evidence; visual plausibility is not a material-property or dimensional measurement.
10. WorldSculpt licensing, gated weights and fetched runtime dependencies must be isolated from the core AISE contract so alternative reconstruction engines remain possible.

## Integration boundary

```text
AISE CaptureMission / Evidence Graph
                 |
                 v
       ReconstructionStrategy
                 |
        +--------+--------+
        |                 |
   WorldSculpt        Other engines
    adapter           depth/LiDAR/
        |             photogrammetry/
        |             instruments
        +--------+--------+
                 |
                 v
       CandidateGeometry
      + lineage + uncertainty
                 |
                 v
          AISE Reality Graph
                 |
                 +--> 2D / 3D / BOQ / Case / Verification
```

## Implementation consequences

AISE-010 defines strategy orchestration; AISE-012 implements the WorldSculpt adapter.

The adapter must translate AISE capture/evidence packages into WorldSculpt-compatible inputs without taking ownership of mission policy. It must translate WorldSculpt outputs into an AISE candidate artifact envelope containing at minimum:

- WorldSculpt commit/version;
- model/checkpoint identities and hashes where available;
- inference configuration;
- input evidence IDs and frame/view IDs;
- camera/pose/calibration metadata;
- coordinate-frame transforms;
- generated object identities and source associations;
- mesh/texture artifacts and content identities;
- reconstruction quality diagnostics;
- uncertainty/limitations;
- execution environment and GPU/runtime metadata.

AISE-019 must include WorldSculpt in the golden capture/device benchmark matrix. Benchmarks must test metric scale, registration, object identity persistence, occlusion behavior, missing/ambiguous observations, density/mesh failure and deterministic provenance.

## Product and roadmap impact

WorldSculpt should be used early to shorten the path from guided video capture to compositional 3D scene output, but downstream AISE semantics must not wait for WorldSculpt-specific behavior. The roadmap therefore keeps WorldSculpt inside the reconstruction-adapter layer rather than replacing the capture, Reality Graph, assurance, verification or projection work.

## Compatibility and rollback

The architecture remains backward-compatible with AISE 2.1 because the change is additive: existing reconstruction strategies and contracts remain valid. Removing WorldSculpt must leave a functioning AISE reconstruction path through alternate adapters or explicit insufficient-evidence states.

## Verification impact

The adapter is CRITICAL where output is used for engineering measurement or readiness. Required evidence includes:

- adapter contract tests;
- source-to-artifact provenance closure;
- coordinate-frame and scale validation;
- negative tests for unsupported/incorrect inputs;
- benchmark comparison against controlled ground truth;
- discrimination tests showing that weak or incorrect WorldSculpt outputs cannot pass readiness silently;
- physical reality-lab trials before consequential production claims.

## Boundary rule

Any proposal to make WorldSculpt a canonical model store, engineering authority, evidence authority, assurance authority, or embedded application framework requires a new Architecture Change Record.
