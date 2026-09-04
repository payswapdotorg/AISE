# AISE Work Orders v1.0

Every Work Order follows the same contract: objective, scope, non-goals, dependencies, ownership, assurance, acceptance criteria, evidence, verification, and stop conditions. A coding agent must be able to work from this repository artifact plus current code without conversational history.

## Universal Work Order rules

- One Work Item = one branch = at most one active implementation PR.
- Hard dependencies must be finalized/merged before implementation begins.
- Declared surfaces are binding; crossing them requires a governed change.
- `STANDARD`, `HIGH_ASSURANCE`, and `CRITICAL` are assurance profiles, not authority levels.
- Critical measurement/model/evidence/verification changes require benchmark and mutation/discrimination evidence where specified.
- A completion claim is not acceptance. Architect review is the merge gate.
- After merge, exact merged SHA and objective evidence must be written to `program-state.json` and reflected in `implementation-roadmap.md`.

## AISE-001 — Repository/runtime foundation

Owner: ZAI. Dependencies: none. Assurance: STANDARD. Surfaces: root/backend/packages/CI.

Objective: establish the initial modular repository, backend processes, package boundaries, configuration, logging, worker boundary, tests and CI verification contract.

Acceptance: repository boots from clean checkout; lint/typecheck/tests/smoke/build are reproducible locally and in CI; authority and ownership boundaries are explicit.

## AISE-002 — Android application foundation

Owner: GEMINI. Dependencies: none. Assurance: STANDARD. Surfaces: `apps/android/**`, Android CI.

Objective: establish Android application shell, navigation, project selection, local persistence abstraction and test harness.

Acceptance: app builds/tests in Android CI; local persistence and navigation have executable tests; no server authority is placed in the Android app.

## AISE-003 — Shared contract package

Owner: SHARED; primary ZAI, secondary GEMINI. Dependencies: AISE-001, AISE-002. Assurance: HIGH_ASSURANCE. Surface: `packages/shared-contracts/**`.

Objective: define versioned cross-platform interchange contracts without moving canonical authority into client code.

Acceptance: serialization/compatibility tests; explicit versioning; no silent semantic widening.

## AISE-004 — Capture ingestion API

Owner: ZAI. Dependencies: AISE-001, AISE-003. Assurance: HIGH_ASSURANCE. Surfaces: backend capture/API.

Objective: receive capture packages, preserve raw evidence metadata, deduplicate logical uploads and create capture-session state.

Acceptance: validation, idempotency, content identity and failure-mode tests; raw evidence metadata survives round trip.

## AISE-005 — Android capture session

Owner: GEMINI. Dependencies: AISE-002, AISE-003. Assurance: HIGH_ASSURANCE. Surface: `apps/android/capture/**`.

Objective: photo/video capture session with acquisition metadata and local persistence.

Acceptance: Room migration is deterministic and preserves existing data; manifest negative tests reject missing/blank `relativePath` and `contentHash` independently; quaternion values round-trip after Room reload; required unit/compile tests and Android CI are green.

Current durable handoff: PR #8 is active at head `60d92a2cf13112e65b6bf2706ca5b33a4df1a30b`. Android CI run `33765308578` failed during instrumentation-test compilation with unresolved `rememberNavController` in `AppShellEmulatorSmokeTest.kt:29:37`; this is a compile/test-source issue, not an emulator failure. Earlier requested corrections include Room v1→v2 deterministic migration, separate manifest negative tests, and quaternion round-trip.

Forbidden: server/backend authority; non-Android surfaces.

## AISE-006 — Android offline sync

Owner: GEMINI. Dependencies: AISE-005, AISE-004. Assurance: HIGH_ASSURANCE. Surfaces: `apps/android/sync/**` plus explicitly assigned shared upload contracts.

Objective: resumable, idempotent synchronization of capture packages.

Acceptance: upload retry/backoff, local content validation, resumable state transitions, WorkManager recovery, migration tests and Android CI evidence.

Current durable handoff: PR #10 head `106de267e61e837bdca3c90878154a8d4f3d73ea`; Android CI run `33834435135` is successful; local `assembleDebug` and `testDebugUnitTest` report 28/28. Merge is deliberately held until AISE-005 is finalized because it is a hard dependency.

## AISE-007 — Capture quality/coverage guidance

Owner: GEMINI. Dependencies: AISE-005. Assurance: HIGH_ASSURANCE. Surface: Android capture.

Objective: field guidance and coverage/progress UX; guidance may request recapture but never fabricate completion.

Acceptance: deterministic quality gates and UI behavior tests; explicit missing-evidence behavior.

## AISE-008 — Reconstruction pipeline foundation

Owner: ZAI. Dependencies: AISE-004. Assurance: HIGH_ASSURANCE. Surface: `services/reality/reconstruction/**`.

Objective: asynchronous preprocessing, pose/reconstruction interfaces, point-cloud/scene artifact creation.

Acceptance: deterministic lifecycle and artifact metadata; process/retry tests; no claims beyond available evidence.

## AISE-009 — Geometry measurement primitives

Owner: ZAI. Dependencies: AISE-008. Assurance: CRITICAL. Surface: `services/reality/geometry/**`.

Objective: deterministic plane/cylinder/distance/angle/fitting primitives with units and uncertainty.

Acceptance: numerical correctness, degeneracy/invalid-input behavior, uncertainty propagation, boundary tests and mutation/discrimination evidence.

## AISE-010 — Architectural object extraction

Owner: ZAI. Dependencies: AISE-008, AISE-009. Assurance: HIGH_ASSURANCE. Surface: `services/reality/semantics/**`.

Objective: initial wall/floor/ceiling/door/window recognition and structured geometry.

Acceptance: semantic classification/geometry consistency tests and representative fixtures; no overwrite of measured/confirmed values.

## AISE-011 — Reality Graph core

Owner: ZAI. Dependencies: AISE-009, AISE-010. Assurance: CRITICAL. Surfaces: `packages/engineering-model/**`, backend model persistence.

Objective: canonical project/space/object/geometry/property/relationship model.

Acceptance: stable identity/versioning, typed units/properties, relationship integrity, deterministic serialization, persistence round-trip and mutation/discrimination evidence.

## AISE-012 — Evidence and provenance graph

Owner: ZAI. Dependencies: AISE-004, AISE-011. Assurance: CRITICAL. Surfaces: `services/evidence/**`, `packages/engineering-model/evidence/**`.

Objective: immutable source evidence identity, provenance links, methods and epistemic state.

Acceptance: append-only/retraction semantics, content-pinned evidence, provenance validity and bounded service behavior; invalid provenance cannot leave an assertion verified.

## AISE-013 — Confidence, uncertainty and readiness

Owner: ZAI. Dependencies: AISE-009, AISE-011, AISE-012. Assurance: CRITICAL. Surface: `services/assurance/**`.

Objective: task-specific readiness model over confidence, uncertainty, evidence coverage, confirmed validity, epistemic composition and uncertainty budget.

Acceptance: immutable task/assurance profiles; deterministic readiness; confidence never substitutes for uncertainty; stale/invalidated evidence fails closed; graph/evidence digests remain unchanged by assessment; required mutation/discrimination and golden-chain evidence.

## AISE-014 — Self-consistency/geometry QA

Owner: ZAI. Dependencies: AISE-011, AISE-013. Assurance: CRITICAL. Surface: `services/verification/model-qa/**` (physical path `backend/services/verification/model-qa/**`).

Objective: read-only deterministic verification of Reality Graph and evidence/readiness projections for geometric, topological, semantic, evidentiary, epistemic and cross-object contradictions.

Non-goals: model mutation, hidden repair, replacing Reality Graph/evidence/readiness authority, probabilistic authority, or inventing absence from unknown observations.

Acceptance: machine-readable deterministic `QAReport`; stable finding IDs/codes; outcomes PASS, CONTRADICTION, INSUFFICIENT_EVIDENCE, UNEVALUABLE, INVALID_INPUT; critical contradictions fail closed where required; no nondeterministic digest inputs.

Required checks: invalid/non-finite/degenerate geometry; impossible dimensions/extents/containment/reference frames; topology endpoint/containment/connectivity/cycle/duplicate conflicts; semantic kind/geometry and property type/unit conflicts; invalidated provenance/confirmations/epistemic violations/readiness contradictions; overlap/containment/dimension/parent-child contradictions.

Required discrimination/mutation evidence: disable geometry validity; disable topology; disable semantic contradiction; ignore invalidated evidence; treat UNKNOWN as absence; downgrade blocking contradiction; constant report digest; remove deterministic ordering; bypass input validation; mutate canonical graph during QA.

Stop conditions: any proposed canonical-model repair, second authority, changed epistemic semantics or changed merge/verification authority requires a governed architecture change.

## AISE-015 — Web engineering workspace foundation

Owner: ZAI. Dependencies: AISE-001, AISE-011. Assurance: STANDARD. Surface: `apps/web/**`.

Objective: browser project/model workspace with 3D shell and authoritative backend reads.

Acceptance: authenticated/read-only model browsing, stable routing, no browser-side canonical state authority.

## AISE-016 — Evidence-aware object review UI

Owner: ZAI. Dependencies: AISE-012, AISE-013, AISE-015. Assurance: HIGH_ASSURANCE. Surface: `apps/web/review/**`.

Objective: object selection, evidence, properties, uncertainty, confidence, epistemic state and review/correction interactions.

Acceptance: every consequential displayed assertion can trace to evidence/authority; corrections produce governed model changes, not UI-only mutations.

## AISE-017 — 2D plan generation

Owner: ZAI. Dependencies: AISE-009, AISE-011. Assurance: HIGH_ASSURANCE. Surfaces: `services/export/2d/**`, `apps/web/2d/**`.

Objective: vector plan/elevation primitives tied to canonical geometry.

Acceptance: deterministic geometry projection, measurement/unit fidelity and traceable source IDs.

## AISE-018 — IFC export

Owner: ZAI. Dependencies: AISE-011, AISE-012, AISE-017. Assurance: CRITICAL. Surface: `services/export/ifc/**`.

Objective: representative IFC 4.3 export from Reality Graph.

Acceptance: schema-valid, deterministic, evidence/epistemic metadata preserved where supported, canonical model not mutated.

## AISE-019 — DXF/PDF output

Owner: ZAI. Dependencies: AISE-017. Assurance: HIGH_ASSURANCE. Surfaces: `services/export/dxf/**`, `services/reporting/**`.

Objective: structured DXF and evidence-linked site PDF report.

Acceptance: deterministic geometry/report content, units and source links preserved.

## AISE-020 — Task intent and assurance engine

Owner: ZAI. Dependencies: AISE-013. Assurance: CRITICAL. Surface: `services/assurance/**`.

Objective: deterministic mapping from engineering intent to evidence/verification depth.

Acceptance: explicit task profiles; monotone assurance requirements; no hidden downgrade for critical work.

## AISE-021 — Engineering rule engine

Owner: ZAI. Dependencies: AISE-011, AISE-013, AISE-014, AISE-020. Assurance: CRITICAL. Surface: `services/verification/rules/**`.

Objective: machine-evaluable dimensions/tolerances/specification rules with PASS/FAIL/UNKNOWN semantics.

Acceptance: deterministic rule evaluation, uncertainty-aware tolerances, evidence/readiness gating, fail-closed critical behavior and discrimination tests.

## AISE-022 — Golden capture benchmark harness

Owner: ZAI. Dependencies: AISE-008, AISE-009, AISE-010, AISE-011. Assurance: CRITICAL. Surfaces: `benchmarks/**`, CI.

Objective: versioned representative capture/ground-truth fixtures and automated scoring.

Acceptance: repeatable benchmark run, ground-truth comparison, regression reporting and critical-class analysis.

## AISE-023 — Physical Reality Lab protocol

Owner: SHARED; primary ZAI, secondary GEMINI. Dependencies: AISE-005, AISE-022. Assurance: CRITICAL. Surfaces: `docs/reality-lab/**`, benchmark manifests, Android fixture hooks.

Objective: repeatable physical capture missions, ground truth, device metadata and acceptance procedure.

Acceptance: mission manifests, capture protocol, traceable ground truth and repeatable acceptance package.

## AISE-024 — End-to-end composition pipeline

Owner: ZAI. Dependencies: AISE-006, AISE-008, AISE-011, AISE-012, AISE-015, AISE-018, AISE-019. Assurance: CRITICAL. Surface: `integration/e2e/**`.

Objective: prove Android capture → processing → Reality Graph → web review → exports.

Acceptance: real composed pipeline succeeds under representative fixtures; component-local tests are insufficient alone.

## AISE-025 — Dogfood capture of AISE itself

Owner: SHARED; primary GEMINI for capture, primary ZAI for processing/workspace. Dependencies: AISE-024. Assurance: CRITICAL. Surfaces: `docs/dogfood/**`, fixtures/manifests.

Objective: run AISE on a real capture mission and turn failures/signals into governed Work Items.

Acceptance: real field evidence package, model/review/export results, issues and follow-up Work Items recorded in repository state.

## AISE-026 — MEP pipe reconstruction

Owner: ZAI. Dependencies: AISE-009, AISE-011, AISE-012, AISE-022. Assurance: CRITICAL. Surface: `services/reality/semantics/mep/**`.

Objective: pipe centerline, diameter and connectivity representation.

Acceptance: controlled fixture benchmark and topology/evidence correctness.

## AISE-027 — MEP asset/topology reconstruction

Owner: ZAI. Dependencies: AISE-026. Assurance: CRITICAL. Surface: `services/reality/semantics/mep/**`.

Objective: valves/equipment and connectivity graph.

Acceptance: asset/topology fixtures, uncertainty and evidence linkage.

## AISE-028 — MEP dogfood benchmark

Owner: SHARED. Dependencies: AISE-023, AISE-026, AISE-027. Assurance: CRITICAL. Surfaces: `benchmarks/mep/**`, Android fixtures, docs.

Objective: validate MEP reconstruction against controlled physical fixtures.

Acceptance: repeatable physical benchmark with critical-class reporting.

## AISE-029 — Reality-vs-design comparison

Owner: ZAI. Dependencies: AISE-018, AISE-022. Assurance: CRITICAL.

Objective: compare authoritative reality model against design reference with provenance and uncertainty.

Acceptance: explicit correspondence, mismatch evidence and fail-closed ambiguous cases.

## AISE-030 — Manhole verification vertical

Owner: SHARED; primary ZAI, secondary GEMINI. Dependencies: AISE-021, AISE-024. Assurance: CRITICAL.

Objective: end-to-end verified manhole inspection workflow.

Acceptance: physical evidence, deterministic measurements/rules and engineer-reviewable report.

## AISE-031 — Historical comparison/change detection

Owner: ZAI. Dependencies: AISE-011, AISE-012, AISE-022. Assurance: HIGH_ASSURANCE.

Objective: version-to-version geometry/semantic/evidence comparison without collapsing uncertainty.

Acceptance: deterministic change records with provenance and confidence/uncertainty separation.

## AISE-032 — Engineering Copilot

Owner: ZAI. Dependencies: AISE-012, AISE-013, AISE-021, AISE-024. Assurance: HIGH_ASSURANCE.

Objective: engineering reasoning layer grounded in verified model/evidence/readiness/rules.

Acceptance: claims trace to authoritative model/evidence and do not elevate advisory LLM output into canonical authority.

## Universal completion evidence

Every PR must state: Work Item ID; dependencies satisfied; exact changed surfaces; tests run/results; CI run and exact head SHA; architecture invariants checked; security/privacy checks; acceptance-criteria-to-evidence mapping; benchmark/mutation results when required; known limitations; explicit out-of-scope; and any durable handoff needed for the next agent.
