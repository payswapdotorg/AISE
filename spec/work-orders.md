# AISE v2 Work Orders

All Work Items are independently reviewable. A worker receives only its item plus repository state. `CRITICAL` items require applicable benchmark, physical and discrimination evidence.

## Universal acceptance contract
Every Work Item must preserve authority, epistemic semantics, provenance, uncertainty, tenant isolation, deterministic behavior where required, and explicit failure/unknown paths. Each PR must include tests, CI, acceptance mapping, known limitations and exact base/head SHAs.

## Work Orders by wave

### 001 — Repository/runtime foundation
Owner ZAI. Build minimal backend/web/package boundaries, configuration, CI, logging and worker contracts. Verify clean checkout and deterministic `verify`. Out: product logic.

### 002 — Android foundation
Owner GEMINI. Build Android shell, navigation, local persistence abstraction, build/test harness. Verify offline-safe local tests and no server authority in client. Out: capture semantics.

### 003 — Shared contract foundation
Owner SHARED, ZAI primary/GEMINI secondary. Define versioned contracts for device capability, capture mission, evidence, model objects and sync envelopes. Verify compatibility/serialization and explicit versioning. Out: implementation of either client.

### 004 — Capture ingestion gateway
Owner ZAI. Receive content-addressed capture packages, idempotently create sessions/assets and preserve source metadata. Verify retry/duplicate/malformed cases. Out: reconstruction.

### 005 — Android capture session
Owner GEMINI. Capture stills/video/sensor metadata and persist an offline manifest. Verify deterministic local state, content identity and recovery. Out: mission policy.

### 006 — Device capability adapters
Owner GEMINI. Implement adapters producing structured capability profiles for camera/depth/IMU/tracking/compute/calibration/environment. Verify capability detection across representative device classes and explicit unsupported states. Out: engineering readiness decisions.

### 007 — Adaptive capture mission planner
Owner ZAI. Convert intent + assurance + existing evidence + device profile into declarative capture missions with preferred/fallback evidence methods and stopping/escalation rules. Verify same task yields different plans for different devices while assurance target remains unchanged. Out: mobile UI.

### 008 — Evidence/source service
Owner ZAI. Persist immutable evidence identity, acquisition metadata, source links and derivation records. Verify content pinning, invalidation and provenance closure. Out: readiness scoring.

### 009 — Guided mission executor
Owner GEMINI. Execute server-authoritative missions with coverage prompts, reference-object capture, measurement questions, material questions, recapture and offline/resumable behavior. Verify no false completion and correct mission-state reconciliation. Out: server readiness authority.

### 010 — Reconstruction orchestration
Owner ZAI. Build asynchronous strategy interface, input characterization, retries and artifact lifecycle. Verify deterministic lifecycle and explicit insufficient-input states. Out: algorithm-specific accuracy claims.

### 011 — BOQ ingestion
Owner ZAI. Parse common spreadsheet/PDF BOQs into source-preserving sections/items/cells/pages. Verify messy headers, merged cells, totals and provenance. Out: semantic mapping.

### 012 — Reconstruction engine adapters
Owner ZAI. Integrate swappable visual/depth/LiDAR/reference-constrained reconstruction adapters behind a stable contract. Verify source-to-artifact lineage and strategy metadata. Out: automatic engineering readiness.

### 013 — Geometry and measurement primitives
Owner ZAI. Implement deterministic planes, dimensions, distances, angles, fitting and uncertainty propagation. Verify numerical accuracy, degeneracies and mutation/discrimination protections. Out: AI diagnosis.

### 014 — BOQ normalization
Owner ZAI. Normalize descriptions, units and construction concepts while preserving original wording and an explicit interpretation record. Verify synonym/abbreviation handling and uncertain classification. Out: changing source BOQ.

### 015 — Architectural semantics
Owner ZAI. Extract wall/floor/ceiling/opening/door/window semantics into structured objects. Verify semantic/geometry consistency and no overwrite of measured/confirmed values.

### 016 — Reality Graph v2
Owner ZAI. Implement canonical project/reality object/version/relationship/observation model including acquisition and intervention references. Verify stable identity, versioning, units and persistence. CRITICAL.

### 017 — BOQ-to-reality mapping
Owner ZAI. Map BOQ items to spaces/elements/locations with explicit mapping confidence, provenance and one-to-many support. Verify ambiguous and unmapped cases remain explicit. CRITICAL.

### 018 — Adaptive evidence-gap engine
Owner ZAI. Compute evidence gaps and rank next observations by task impact, expected uncertainty reduction, operator effort and recoverability. Verify deliberate perturbations change recommendations and no hidden evidence is fabricated. CRITICAL.

### 019 — Golden capture/device benchmark harness
Owner ZAI. Create versioned fixtures across device capability classes with physical ground truth, reconstruction/measurement metrics and regression gates. Verify critical-class reporting and benchmark reproducibility. CRITICAL.

### 020 — 2D projections
Owner ZAI. Generate vector floor plans/elevations/sections tied to stable graph IDs and uncertainty. Verify deterministic projections and bidirectional object lookup. HIGH_ASSURANCE.

### 021 — Browser engineering workspace
Owner ZAI. Build synchronized 2D/3D/evidence browsing, object selection, measurement display and review. Verify no browser-side authority and stable cross-view identity.

### 022 — Assurance/readiness v2
Owner ZAI. Implement multidimensional readiness and device-aware evidence sufficiency evaluation without assurance downgrade. Verify monotonic requirements and fail-closed critical states. CRITICAL.

### 023 — QA/verification v2
Owner ZAI. Extend deterministic model, topology, semantic, evidence and readiness checks. Verify mutation/discrimination tests and stable finding codes. CRITICAL.

### 024 — BOQ Lens workspace
Owner ZAI. Deliver executive/QS/contractor views, natural-language BOQ explanation grounded in source, cost hierarchy, traceability, health checks and search. Verify every material claim resolves to BOQ evidence or explicit inference.

### 025 — Engineering Case
Owner ZAI. Create case/issue/observation/hypothesis/missing-evidence/review domain and APIs. Verify factual/inferred/proposed separation and evidence traceability. CRITICAL.

### 026 — Intervention state model
Owner ZAI. Model proposed intervention scenarios, ordered steps and immutable state transitions from an authoritative baseline. Verify reproducibility and proposal isolation. CRITICAL.

### 027 — Synchronized intervention viewer
Owner ZAI. Render each intervention state in 3D, 2D and BOQ and allow Next/Previous layer navigation with synchronized stable IDs. Verify state alignment and no mutation of authoritative reality. CRITICAL.

### 028 — Intervention quantities/cost impacts
Owner ZAI. Calculate quantities and BOQ impacts of proposed steps from deterministic geometry/state deltas. Verify units, uncertainty and source mapping. CRITICAL.

### 029 — Engineering Reasoning gateway
Owner ZAI. Create provider-neutral retrieval/tool/LLM interface grounded in graph, evidence, rules and policy. Verify claim citations, uncertainty awareness, refusal on insufficient evidence and provider interchangeability.

### 030 — Multi-device/offline hardening
Owner GEMINI. Expand device matrix, offline mission queues, resumable uploads and low-end device performance safeguards. Verify capability/mission compatibility and recovery under interruption.

### 031 — Execution/outcome loop
Owner ZAI. Record approved intervention, execution evidence, post-work capture and outcome observations without overwriting history. Verify lineage from issue to outcome.

### 032 — Reality-vs-design comparison
Owner ZAI. Compare captured authoritative reality with imported design references, producing evidence-linked discrepancies and uncertainty-aware status. CRITICAL.

### 033 — Historical change detection
Owner ZAI. Compare model versions across time for geometry, semantics and condition changes. Verify deterministic identity matching and explicit ambiguous matches.

### 034 — MEP semantics foundation
Owner ZAI. Add pipe/duct/cable-tray/equipment semantic primitives and topology with uncertainty/evidence. Verify against controlled fixtures. CRITICAL.

### 035 — Physical Reality Lab + end-to-end dogfood
Owner SHARED, ZAI processing primary/GEMINI capture primary. Establish repeatable physical missions, ground truth and full AISE execution on representative rooms/floors/defects/BOQs. CRITICAL.

### 036 — Enterprise identity/permissions/audit
Owner ZAI. Implement organization/project/role/permission/retention/audit policy and least-privilege AI context selection. Verify tenant-isolation and unauthorized-access discrimination. CRITICAL.

### 037 — Imports/exports/connectors
Owner ZAI. Support IFC, DXF/PDF, common point cloud/mesh, BOQ/document and project-system connector adapters. Verify imports preserve provenance and exports are derived only.

### 038 — Developer API/SDK
Owner ZAI. Expose stable APIs for capture, reality, BOQ, case, intervention and rendering projections. Verify versioning, scopes, idempotency and provider-neutral semantics.

### 039 — Production pilot hardening
Owner SHARED. Run multi-project pilot across large and small ICP environments, performance/security/usability hardening, release criteria and regression suite. Acceptance requires adoption metrics plus technical gates; no claims based on simulated users alone.
