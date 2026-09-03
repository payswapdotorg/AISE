# AI Site Engineer Work Items v1.0

Each Work Item is one independently reviewable implementation unit. The `Owner` field determines the primary coding agent: `ZAI`, `GEMINI`, or `SHARED`.

## Foundation

### AISE-001 — Repository and runtime foundation
Owner: ZAI
Dependencies: none
Surfaces: root, backend, packages, CI
Goal: establish the initial web/backend modular structure, testing conventions, local development, configuration, logging and worker boundaries.
Assurance: STANDARD

### AISE-002 — Android application foundation
Owner: GEMINI
Dependencies: none
Surfaces: apps/android/**, Android CI
Goal: establish Android app shell, navigation, project selection, local persistence abstraction and test harness.
Assurance: STANDARD

### AISE-003 — Shared contract package
Owner: SHARED (primary ZAI, secondary GEMINI)
Dependencies: AISE-001, AISE-002
Surfaces: packages/shared-contracts/**
Goal: define versioned API/capture/model interchange contracts consumed by both clients without moving authority into shared client code.
Assurance: HIGH_ASSURANCE

## Capture and ingestion

### AISE-004 — Capture ingestion API
Owner: ZAI
Dependencies: AISE-001, AISE-003
Surfaces: backend capture/API
Goal: receive capture packages, preserve raw evidence metadata, deduplicate logical uploads, and create capture-session state.
Assurance: HIGH_ASSURANCE

### AISE-005 — Android capture session
Owner: GEMINI
Dependencies: AISE-002, AISE-003
Surfaces: apps/android/capture/**
Goal: implement photo/video capture session with acquisition metadata and local persistence.
Assurance: HIGH_ASSURANCE

### AISE-006 — Android offline sync
Owner: GEMINI
Dependencies: AISE-005, AISE-004
Surfaces: apps/android/sync/** + explicitly assigned shared upload contract files
Goal: resumable, idempotent synchronization of capture packages.
Assurance: HIGH_ASSURANCE

### AISE-007 — Capture quality/coverage guidance
Owner: GEMINI
Dependencies: AISE-005
Surfaces: apps/android/capture/**
Goal: field guidance and coverage/progress UX; guidance may request recapture but may not fabricate completion.
Assurance: HIGH_ASSURANCE

## Reality processing

### AISE-008 — Reconstruction pipeline foundation
Owner: ZAI
Dependencies: AISE-004
Surfaces: services/reality/reconstruction/**
Goal: implement asynchronous preprocessing, pose/reconstruction interfaces and point-cloud/scene artifact creation.
Assurance: HIGH_ASSURANCE

### AISE-009 — Geometry measurement primitives
Owner: ZAI
Dependencies: AISE-008
Surfaces: services/reality/geometry/**
Goal: deterministic plane/cylinder/distance/angle/fitting primitives and uncertainty representation.
Assurance: CRITICAL

### AISE-010 — Architectural object extraction
Owner: ZAI
Dependencies: AISE-008, AISE-009
Surfaces: services/reality/semantics/**
Goal: initial wall/floor/ceiling/door/window recognition and structured geometry.
Assurance: HIGH_ASSURANCE

### AISE-011 — Reality Graph core
Owner: ZAI
Dependencies: AISE-009, AISE-010
Surfaces: packages/engineering-model/**, backend reality-model persistence
Goal: canonical project/space/object/geometry/property/relationship model.
Assurance: CRITICAL

### AISE-012 — Evidence and provenance graph
Owner: ZAI
Dependencies: AISE-004, AISE-011
Surfaces: services/evidence/**, packages/engineering-model/evidence/**
Goal: source evidence links, methods, provenance, epistemic state and immutable source identity.
Assurance: CRITICAL

### AISE-013 — Confidence, uncertainty and readiness
Owner: ZAI
Dependencies: AISE-009, AISE-011, AISE-012
Surfaces: services/assurance/**
Goal: confidence/uncertainty/evidence completeness and task-specific model-readiness model.
Assurance: CRITICAL

### AISE-014 — Self-consistency/geometry QA
Owner: ZAI
Dependencies: AISE-011, AISE-013
Surfaces: services/verification/model-qa/**
Goal: detect geometric/topological/semantic contradictions and fail closed where required.
Assurance: CRITICAL

## Engineering workspace and outputs

### AISE-015 — Web engineering workspace foundation
Owner: ZAI
Dependencies: AISE-001, AISE-011
Surfaces: apps/web/**
Goal: browser project/model workspace with 3D shell and authoritative backend reads.
Assurance: STANDARD

### AISE-016 — Evidence-aware object review UI
Owner: ZAI
Dependencies: AISE-012, AISE-013, AISE-015
Surfaces: apps/web/review/**
Goal: object selection, properties, evidence, confidence, epistemic state and corrections.
Assurance: HIGH_ASSURANCE

### AISE-017 — 2D plan generation
Owner: ZAI
Dependencies: AISE-009, AISE-011
Surfaces: services/export/2d/**, apps/web/2d/**
Goal: vector floor plan/elevation primitives tied to canonical geometry.
Assurance: HIGH_ASSURANCE

### AISE-018 — IFC export
Owner: ZAI
Dependencies: AISE-011, AISE-012, AISE-017
Surfaces: services/export/ifc/**
Goal: representative IFC 4.3 export from the Reality Graph.
Assurance: CRITICAL

### AISE-019 — DXF/PDF output
Owner: ZAI
Dependencies: AISE-017
Surfaces: services/export/dxf/**, services/reporting/**
Goal: structured DXF and evidence-linked site PDF report.
Assurance: HIGH_ASSURANCE

## Verification, rules and dogfooding

### AISE-020 — Task intent and assurance engine
Owner: ZAI
Dependencies: AISE-013
Surfaces: services/assurance/**
Goal: deterministic mapping from engineering intent to evidence/verification depth.
Assurance: CRITICAL

### AISE-021 — Engineering rule engine
Owner: ZAI
Dependencies: AISE-011, AISE-013, AISE-014, AISE-020
Surfaces: services/verification/rules/**
Goal: machine-evaluable dimensions/tolerances/specification rules with PASS/FAIL/UNKNOWN semantics.
Assurance: CRITICAL

### AISE-022 — Golden capture benchmark harness
Owner: ZAI
Dependencies: AISE-008, AISE-009, AISE-010, AISE-011
Surfaces: benchmarks/**, CI
Goal: versioned physical/reconstruction ground truth fixtures and automated benchmark scoring.
Assurance: CRITICAL

### AISE-023 — Physical Reality Lab protocol
Owner: SHARED (primary ZAI, secondary GEMINI)
Dependencies: AISE-005, AISE-022
Surfaces: docs/reality-lab/**, benchmark manifests, Android fixture hooks
Goal: define repeatable physical capture missions, ground truth, device/capture metadata, and acceptance procedure.
Assurance: CRITICAL

### AISE-024 — End-to-end composition pipeline
Owner: ZAI
Dependencies: AISE-006, AISE-008, AISE-011, AISE-012, AISE-015, AISE-018, AISE-019
Surfaces: integration/e2e/**
Goal: prove Android capture → processing → Reality Graph → web review → exports.
Assurance: CRITICAL

### AISE-025 — Dogfood capture of AISE itself
Owner: SHARED (primary GEMINI for capture, primary ZAI for processing/workspace)
Dependencies: AISE-024
Surfaces: docs/dogfood/**, benchmark manifests, app/web integration fixtures
Goal: run the first real field capture against an AISE-controlled/test environment; record issues as governed Work Items.
Assurance: CRITICAL

### AISE-026 — MEP pipe reconstruction
Owner: ZAI
Dependencies: AISE-009, AISE-011, AISE-012, AISE-022
Surfaces: services/reality/semantics/mep/**
Goal: pipe/centerline/diameter/connectivity representation.
Assurance: CRITICAL

### AISE-027 — MEP asset and topology reconstruction
Owner: ZAI
Dependencies: AISE-026
Surfaces: services/reality/semantics/mep/**
Goal: valves/equipment and connectivity graph.
Assurance: CRITICAL

### AISE-028 — MEP dogfood benchmark
Owner: SHARED (primary GEMINI capture fixtures, ZAI benchmark/processing)
Dependencies: AISE-023, AISE-026, AISE-027
Surfaces: benchmarks/mep/**, Android capture fixtures, docs
Goal: validate MEP reconstruction against controlled physical fixtures.
Assurance: CRITICAL

## Future expansion

### AISE-029 — Reality-vs-design comparison
Owner: ZAI
Dependencies: AISE-018, AISE-022
Assurance: CRITICAL

### AISE-030 — Manhole verification vertical
Owner: SHARED (primary ZAI, secondary GEMINI)
Dependencies: AISE-021, AISE-024
Assurance: CRITICAL

### AISE-031 — Historical comparison/change detection
Owner: ZAI
Dependencies: AISE-011, AISE-012, AISE-022
Assurance: HIGH_ASSURANCE

### AISE-032 — Engineering Copilot
Owner: ZAI
Dependencies: AISE-012, AISE-013, AISE-021, AISE-024
Assurance: HIGH_ASSURANCE

## Work-item contract

Every Work Item must include:

- objective;
- owner and secondary agent if shared;
- hard dependencies;
- declared change surfaces;
- architecture version;
- acceptance criteria;
- required evidence;
- required tests/benchmarks;
- explicit out-of-scope;
- assurance profile;
- stop conditions.

No Work Item is complete because an agent says it is complete. Completion requires objective evidence and architect approval.
