# AISE ↔ WorldSculpt Integration Strategy

## Decision

AISE will **build around WorldSculpt, not become WorldSculpt**.

WorldSculpt is a reconstruction capability that AISE can call. AISE remains the product, canonical domain model and engineering assurance system.

## What WorldSculpt gives AISE

WorldSculpt's current research/release target is unusually relevant to AISE because it addresses compositional 3D reconstruction from grounded multi-view observations, including cluttered scenes with many objects and severe occlusion. Its published pipeline adapts a single-object 3D prior to multi-view conditioning and places reconstructed object meshes into a shared metric world frame.

That maps directly to the AISE need for a structured scene candidate rather than a single undifferentiated mesh.

## What WorldSculpt does not give AISE

AISE still needs to own:

- engineering intent and assurance profiles;
- device-aware guided capture;
- evidence identity and provenance;
- measurement and uncertainty;
- canonical Reality Graph state;
- architectural/MEP semantics;
- BOQ interpretation and mapping;
- deterministic verification;
- engineering cases and intervention states;
- enterprise permissions and systems-of-record integration;
- outcome history and learning.

WorldSculpt currently requires a substantial research/GPU environment and external model dependencies, and its released output is a mesh/scene reconstruction pipeline rather than an engineering-authoritative information model. Its third-party dependency documentation also identifies distinct licensing and gated-weight considerations that must remain outside AISE's semantic core.

## Target runtime boundary

```text
AISE capture/evidence
        |
        v
ReconstructionOrchestrator
        |
        +--> WorldSculptAdapter
        |        |
        |        +--> WorldSculpt inference
        |
        +--> Depth/LiDAR adapter
        +--> Photogrammetry adapter
        +--> Specialist instrument adapter
        +--> Other future engines
        |
        v
Candidate Reconstruction Artifact
        |
        +--> lineage
        +--> coordinate transform
        +--> quality diagnostics
        +--> uncertainty/limitations
        |
        v
AISE Reality Graph
```

## Adapter contract

AISE should standardize an internal `ReconstructionRequest` and `ReconstructionResult` rather than importing WorldSculpt APIs into the rest of the product.

### ReconstructionRequest

```text
mission_id
capture_session_id
evidence_bundle_id
input_frame_ids
camera_intrinsics
camera_poses
coordinate_frame
requested_output_scope
quality/assurance target
compute policy
WorldSculpt-compatible preprocessing profile
```

### ReconstructionResult

```text
engine_id = worldsculpt
engine_version / commit
checkpoint identities
input evidence IDs
output artifact IDs
object candidates
mesh/texture references
coordinate transforms
registration diagnostics
quality metrics
uncertainty / limitations
execution environment
```

## How the AISE roadmap changes

No new foundational WorldSculpt-specific architecture is required. Update the existing reconstruction work as follows:

### AISE-010 — Reconstruction Orchestration

Add an engine registry and strategy-selection contract with WorldSculpt as a supported implementation. The orchestrator must be able to select WorldSculpt when the evidence profile and runtime capabilities fit, while retaining alternate paths.

### AISE-012 — Reconstruction Engine Adapters

Make this the main WorldSculpt integration work item. It should provide:

- adapter packaging/isolation;
- input preprocessing from AISE evidence;
- camera/pose/scale conversion;
- WorldSculpt invocation;
- output normalization;
- candidate object registration;
- provenance and version pinning;
- failure/timeout/resource diagnostics;
- license/model dependency inventory;
- reproducible configuration capture.

### AISE-013 — Geometry/Measurement

Add validation of WorldSculpt's coordinate transforms, metric scale and geometry quality before any result is used for engineering measurement.

### AISE-019 — Golden Capture/Device Benchmark

Include WorldSculpt runs across representative capture/device classes and complexity levels. Measure scale error, registration error, object recall/precision, geometry quality, occlusion performance, failure behavior and reproducibility.

### AISE-022 — Assurance

WorldSculpt output is a candidate reconstruction evidence product. Readiness is decided by AISE assurance logic, not by successful model execution.

### AISE-032 / AISE-033

Use stabilized Reality Graph outputs, not raw WorldSculpt meshes, for design comparison and temporal change detection.

### AISE-035 — Physical Reality Lab

Add explicit WorldSculpt physical tests: rooms, clutter, repeated views, partial occlusion, reference dimensions and deliberately adverse capture conditions.

## Device-aware routing

A high-end device may produce depth/LiDAR evidence and bypass WorldSculpt for some tasks. A camera-only device may use WorldSculpt more often. A weak device may require additional reference measurements before WorldSculpt is invoked.

The assurance target never changes:

```text
same engineering task
        |
   assurance target
        |
   device/evidence profile
        |
   strategy selection
   /      |       \
Depth  WorldSculpt  Instrument
        /          \
   fallback       escalation
```

## Important product insight

WorldSculpt should be viewed as an **accelerator for AISE's reconstruction layer**, not as the foundation of AISE itself.

This lets AISE take advantage of WorldSculpt's research advances while continuing to improve with other reconstruction technologies, including future depth, LiDAR, photogrammetry, neural rendering and specialist sensing.

## License/dependency isolation

The AISE core should never assume that WorldSculpt's current model weights, CUDA stack or fetched dependencies are always available. The adapter must report capability readiness explicitly and keep third-party model/license metadata separate from AISE canonical semantics.

Removing or replacing WorldSculpt must not require an AISE data-model migration.
