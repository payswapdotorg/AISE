# AI Site Engineer Requirements v1.0

## Product scope

The v1.0 product proves the Reality-to-Engineering workflow for existing facilities, initially emphasizing architectural spaces and a path into MEP.

## REQ-001 — Cross-platform project foundation

AISE shall provide a device-neutral project model consumed by Android field capture and browser/desktop engineering experiences.

### Acceptance
- AC-001: A project can contain capture sessions and derived model versions.
- AC-002: Android-specific implementation details are not required by the canonical project/model contract.
- AC-003: Web/desktop consumers can open model data without Android runtime dependencies.

## REQ-002 — Android field capture

Gemini-owned Android app shall capture photos/video and supported device depth/sensor metadata, operate offline, and synchronize capture packages safely.

### Acceptance
- AC-010: User can create/select a project and start a capture session.
- AC-011: Capture assets and acquisition metadata persist locally during offline operation.
- AC-012: Interrupted synchronization resumes without duplicating logical capture assets.
- AC-013: Capture session records device/source metadata where available.
- AC-014: App can display basic capture coverage/progress state.

## REQ-003 — Task-aware capture contract

A capture request shall declare intended purpose and assurance profile before the system determines required capture evidence.

### Acceptance
- AC-020: Capture can be created for at least `AS_BUILT`, `MAINTENANCE`, or `INSPECTION` intent.
- AC-021: Intent maps deterministically to assurance requirements.
- AC-022: The system can mark an area/object as requiring additional evidence rather than fabricating completion.

## REQ-004 — Reconstruction

AISE shall transform supported multimodal capture into registered spatial geometry.

### Acceptance
- AC-030: A representative capture can produce a registered point cloud or equivalent measurable scene representation.
- AC-031: Reconstruction preserves source-capture provenance.
- AC-032: Failed/insufficient reconstruction is explicit and recoverable.

## REQ-005 — Architectural semantics

AISE shall identify and represent initial architectural objects.

### Acceptance
- AC-040: Walls, floor/slab, ceiling, doors and windows can be represented as typed objects when supported by evidence.
- AC-041: Object geometry is editable/structured, not only a textured mesh.
- AC-042: Object identity is stable within a model version.

## REQ-006 — Reality Graph

AISE shall maintain a canonical engineering representation of geometry, semantics, relationships, evidence and uncertainty.

### Acceptance
- AC-050: Reality objects can reference geometry and properties.
- AC-051: Objects can reference other objects through typed relationships.
- AC-052: Measurements have units and uncertainty where available.
- AC-053: Assertions preserve `OBSERVED`, `INFERRED`, `CONFIRMED`, or `PROPOSED` status.
- AC-054: `UNKNOWN`, `NOT_OBSERVED`, and `OCCLUDED` are representable without becoming confirmed absence.

## REQ-007 — Evidence and provenance

Every consequential engineering assertion shall be traceable to source evidence.

### Acceptance
- AC-060: Evidence can reference image/video/LiDAR/measurement/document/human-observation sources.
- AC-061: Derived values record the method used to derive them.
- AC-062: A verified assertion without required provenance is rejected.
- AC-063: Removing required evidence invalidates corresponding verification state.

## REQ-008 — Confidence and uncertainty

Confidence and measurement uncertainty shall be separate fields.

### Acceptance
- AC-070: Model properties may contain confidence.
- AC-071: Measurements may contain uncertainty/tolerance.
- AC-072: The system never upgrades an estimate into a measurement without qualifying evidence.

## REQ-009 — Browser engineering workspace

Z.ai-owned web workspace shall allow users to inspect 3D/2D, select objects, inspect evidence, measure, review uncertainty, and manage corrections.

### Acceptance
- AC-080: User can load a model in browser.
- AC-081: User can select an object and inspect its properties/evidence.
- AC-082: User can distinguish observed/inferred/confirmed/proposed content.
- AC-083: User can record a correction/verification decision.

## REQ-010 — 2D plan generation

AISE shall generate structured 2D plans from structured scene geometry.

### Acceptance
- AC-090: Walls/openings/rooms have vector geometry suitable for 2D display.
- AC-091: Plan dimensions are tied to underlying model geometry.
- AC-092: 2D output is not merely a raster screenshot.

## REQ-011 — Interoperability

AISE shall export from the canonical Reality Graph.

### Acceptance
- AC-100: Representative model exports to IFC.
- AC-101: Representative plan exports to DXF.
- AC-102: Exported artifacts retain stable identifiers/property mapping where supported.
- AC-103: Exporters do not become a second canonical model authority.

## REQ-012 — Verification and assurance

AISE shall run deterministic checks appropriate to the task and fail closed where required evidence is missing.

### Acceptance
- AC-110: Assurance profile is recorded for a verification run.
- AC-111: Required evidence gaps cause explicit `UNKNOWN`/failure states as appropriate.
- AC-112: Geometry consistency checks can reject impossible/contradictory model states.
- AC-113: Critical verification includes discrimination tests.

## REQ-013 — Site report

AISE shall generate an evidence-linked site report from a reviewed capture/model.

### Acceptance
- AC-120: Report includes project/capture metadata.
- AC-121: Report can include measurements, issues, images and model status.
- AC-122: Report distinguishes confirmed facts from inference/unknowns.

## REQ-014 — Dogfooding and physical benchmark

The development system shall continuously validate the product using golden captures and controlled physical test environments.

### Acceptance
- AC-130: Golden capture dataset exists with ground truth.
- AC-131: Model/reconstruction changes run against golden captures before critical release.
- AC-132: Benchmark results are versioned.
- AC-133: Critical changes require physical/reality validation in addition to code tests.

## REQ-015 — Development governance

AISE shall use repository-resident requirements, Work Orders, dependency DAG, agent ownership, acceptance evidence and architect merge review.

### Acceptance
- AC-140: A fresh checkout exposes governing architecture and current Work Items.
- AC-141: Parallel-safe Work Items are identifiable from dependencies/change surfaces.
- AC-142: Z.ai and Gemini ownership is explicit for every implementation Work Item.
- AC-143: No implementation agent may merge its own governed PR.
