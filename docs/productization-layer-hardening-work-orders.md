# AISE — Hugging Face Derived Layer-Hardening Work Orders

**Status:** Proposed / Architect-authored  
**Parent work:** PROD-027, PROD-028, PROD-029  
**Purpose:** Convert the September 2026 Hugging Face research into governed, benchmark-first implementation work without introducing vendor lock-in or changing AISE's canonical engineering authority.

## Governing rule

These Work Orders refine the existing Layer-1/Layer-2/Layer-3 hardening scope. They do not create a new authority layer and do not replace PROD-027–PROD-029.

The implementation order is:

same AISE evidence
→ interchangeable technology provider
→ normalized provider result
→ benchmark / negative test
→ uncertainty + provenance comparison
→ dependent-layer regression
→ promotion decision

A model, dataset, Space, renderer, reconstruction engine or agent framework is an implementation candidate, never canonical engineering truth.

### Mandatory provider-evaluation fields

Every evaluated provider must be representable by a machine-readable profile containing at least:

providerId
technologyVersion
capabilities
supportedModalities
computeProfile
memoryProfile
latencyProfile
license
costProfile
inputContract
outputContract
provenanceContract
uncertaintyCharacteristics
failureModes
benchmarkResults

Provider-specific classes, identifiers or output formats must not cross the canonical AISE domain boundary.

### Dataset/model-use rule

Training and evaluation are separate decisions. Unless licensing and intended-use terms are explicitly cleared for the intended use, a model/dataset is evaluation-only. In particular, non-commercial benchmark datasets must not silently enter a commercial training pipeline.

---

# Priority and dependency graph

P0 — common control plane

HFX-000
  |
  +-- HFX-101
  +-- HFX-102
  +-- HFX-201
  +-- HFX-202
  +-- HFX-204
           |
           +-- HFX-103
           +-- HFX-104
           +-- HFX-203
           +-- HFX-301
                    |
                    +-- HFX-302
                    +-- HFX-303
                             |
                             +-- HFX-401

### Suggested three-worker waves

Wave HF-0
  HFX-000

Wave HF-1
  HFX-101   HFX-102   HFX-201

Wave HF-2
  HFX-202   HFX-203   HFX-204

Wave HF-3
  HFX-103   HFX-104   HFX-301

Wave HF-4
  HFX-302   HFX-303   HFX-401

Never exceed three concurrent workers. The Tech Lead may serialize an item when a shared semantic seam or benchmark environment makes parallel implementation unsafe.

---

# Layer 1 — Reality

## HFX-101 — MapAnything universal-reconstruction provider adapter and benchmark

**Parent:** PROD-027  
**Priority:** P1  
**Owner:** SPATIAL/RECON  
**Depends on:** HFX-000, existing reconstruction/provider gateway

### Purpose

Evaluate Meta's MapAnything as a provider for common Layer-1 reconstruction tasks rather than committing AISE to a single reconstruction engine.

### Scope

- Implement a provider adapter behind the stable reconstruction port.
- Run fixed AISE fixtures through the supported multi-image, metric-depth and registration capabilities relevant to AISE.
- Normalize depth/pose/registration outputs into AISE representations.
- Retain provider identity, version, configuration and input evidence digests.
- Capture diagnostics, failure modes and unsupported task combinations.
- Compare the result against the current deterministic/demo path and at least one existing reconstruction provider where available.

### Acceptance criteria

- MapAnything can be invoked without leaking provider-specific types into canonical AISE contracts.
- The same evidence fixture can be evaluated through the existing provider and MapAnything.
- Comparison reports include geometry/registration/depth metrics, latency/resource profile and uncertainty characteristics.
- A failed/unsupported MapAnything invocation produces an explicit non-ready/fallback state rather than fabricated geometry.
- Reprocessing creates a new derived reconstruction version; original field evidence remains unchanged.
- Dependent Layer-1 readiness and Layer-2 consumers continue to pass.

### Evidence

Provider conformance report, benchmark fixture results, provenance audit, negative/failure-path tests and dependent-layer regression.

---

## HFX-102 — Video Depth Anything temporal-depth provider lane

**Parent:** PROD-027  
**Priority:** P1  
**Owner:** MOBILE/CV  
**Depends on:** HFX-000, mobile capture contracts

### Purpose

Improve ordinary-phone capture by evaluating temporal-consistent depth from video as a lower-cost intermediate reconstruction signal.

### Scope

- Add Video Depth Anything behind the depth-estimation provider port.
- Test handheld/field videos with motion, illumination changes, partial occlusion and low-texture surfaces.
- Measure temporal consistency, depth stability and failure modes.
- Record device/compute profile for small/base/large variants where practical.
- Feed depth estimates into downstream spatial registration only through the normalized AISE contract.

### Acceptance criteria

- Temporal depth can be attached to the correct evidence/video revision and coordinate system.
- Depth output is clearly derived/inferred, never automatically promoted to observed measurement.
- Drift/instability produces an explicit uncertainty or evidence-gap result.
- Mobile fallback behavior remains deterministic when the provider is unavailable or too expensive for the device.
- The assurance threshold is unchanged by device/provider capability.

### Evidence

Temporal-depth benchmark, uncertainty report, device capability matrix, offline/unavailable-provider tests and Layer-1 readiness regression.

---

## HFX-103 — Construction-site SLAM / registration benchmark

**Parent:** PROD-027  
**Priority:** P2  
**Owner:** SLAM/SPATIAL  
**Depends on:** HFX-000, HFX-101

### Purpose

Stress-test AISE spatial registration against real construction-site motion, occlusion and floor-plan context using the Hilti × Trimble SLAM Challenge 2026 benchmark.

### Scope

- Build an evaluation-only importer for the benchmark.
- Benchmark trajectory/pose and floor-plan localization against AISE's registration pipeline.
- Measure failure under repeated structures, sparse texture, moving objects and construction clutter.
- Separate research benchmark records from production user evidence.
- Add a dacl10k-based auxiliary defect/localization evaluation where useful, without treating bridge-specific performance as general engineering competence.

### Acceptance criteria

- The benchmark is reproducible from a pinned dataset version and documented preprocessing.
- Pose/registration metrics are recorded against the dataset's reference trajectories.
- License restrictions are encoded in the benchmark manifest and cannot be bypassed by a training job.
- No benchmark-only result becomes canonical observed project evidence.
- Findings produce actionable thresholds/fallbacks for AISE registration readiness.

### Evidence

Pinned benchmark manifest, metric report, failure taxonomy, license/use declaration and regression tests.

---

## HFX-104 — Open-vocabulary construction-object grounding

**Parent:** PROD-027  
**Priority:** P2  
**Owner:** CV/SEMANTIC  
**Depends on:** HFX-000, spatial anchor contracts

### Purpose

Evaluate SAM 3 and the TAB-style active RGB-D grounding approach for resolving user language to spatially grounded construction objects and components.

### Scope

- Benchmark wall, door, window, slab, column, opening, visible defect and similar concepts.
- Evaluate image and video tracking where supported.
- Map segmentation/track outputs to AISE spatial entities without asserting unobserved semantics.
- Test natural-language references such as "that door", "the wall on the left" and "the crack above the opening".
- Record confidence separately from measurement uncertainty.
- Run dacl10k as an optional defect-perception benchmark.

### Acceptance criteria

- Object grounding produces stable, spatially anchored references on the benchmark fixtures.
- Temporary segmentation identities do not become canonical Reality Graph IDs without an AISE mapping step.
- Ambiguous references produce clarification/insufficient-evidence outcomes.
- Grounding errors cannot silently alter quantities, readiness or engineering facts.
- Any SAM 3 gated/nonstandard licensing is represented in the provider manifest and blocks production promotion until cleared.

### Evidence

Grounding precision/recall and tracking results, ambiguity tests, spatial mapping fixtures, provenance/failure evidence and license gate.

---

# Layer 2 — Understanding

## HFX-201 — Qwen3-VL multimodal reasoning provider benchmark

**Parent:** PROD-028  
**Priority:** P1  
**Owner:** AI/REASONING  
**Depends on:** HFX-000, Evidence Envelope contract

### Purpose

Evaluate Qwen3-VL as a replaceable multimodal reasoning provider for project context, image/video evidence, spatial references and grounded tool use.

### Scope

- Register Qwen3-VL 8B and 30B-A3B as separate provider profiles when infrastructure permits.
- Benchmark image, video, OCR and spatial-reference tasks.
- Require structured Evidence Envelope output.
- Compare grounded reasoning against deterministic checks and known evidence.
- Test unsupported-question, missing-evidence and conflicting-evidence behavior.
- Record cost/latency/resource profile.

### Acceptance criteria

- Consequential answers always bind to the relevant evidence revision and task/context.
- The model cannot invent a measurement, material, observation or validation result when evidence is missing.
- Missing/ambiguous evidence causes clarification or bounded refusal.
- Provider replacement does not change the Evidence Envelope schema or authority semantics.
- Deterministic checks remain authoritative for supported calculations/rules.

### Evidence

Golden reasoning corpus, Evidence Envelope validator, unsupported/conflict tests, provider comparison and provenance regression.

---

## HFX-202 — BOQ/drawing document-ingestion lane

**Parent:** PROD-028  
**Priority:** P1  
**Owner:** DOC-AI/QS  
**Depends on:** HFX-000, document ingestion contracts

### Purpose

Improve BOQ Lens and technical-document understanding with PaddleOCR-VL 1.6 and PP-DocLayoutV3.

### Scope

- Evaluate structured parsing of BOQs, tables, technical drawings and forms.
- Preserve page/document/revision/source identity.
- Evaluate non-planar/skewed drawing layouts and multi-point regions.
- Normalize extraction into AISE derived document entities.
- Preserve original source wording; normalization remains a derived interpretation.

### Acceptance criteria

- A source document can be parsed into structured text/table/layout outputs with source coordinates.
- Original BOQ text and extracted quantities remain traceable to the source revision.
- OCR/layout errors are surfaced as uncertainty or review-required states.
- Revision changes are detected without silently overwriting earlier derived interpretations.
- Parsed documents can feed Layer-2 Evidence Envelopes without becoming canonical physical reality.

### Evidence

Representative BOQ/drawing corpus, source-to-extraction trace, revision tests, OCR/layout error cases and provenance audit.

---

## HFX-203 — Spatial-semantic evidence retrieval benchmark

**Parent:** PROD-028  
**Priority:** P2  
**Owner:** RETRIEVAL/ML  
**Depends on:** HFX-000, HFX-101, Evidence Graph indexing

### Purpose

Improve project-scale evidence retrieval using SigLIP 2 and/or STELLAR-style spatial-semantic representations.

### Scope

- Build a benchmark for finding the evidence relevant to a specific engineering question.
- Measure text-to-image, image-to-image and spatially constrained retrieval.
- Evaluate compact spatial features versus current retrieval/indexing.
- Include near-duplicate frames, repeated rooms and visually similar components.
- Retain evidence IDs and revision links in every retrieved result.

### Acceptance criteria

- Retrieval improves recall of task-relevant evidence without increasing provenance ambiguity.
- Spatially similar but semantically wrong evidence is measurable as a negative case.
- Retrieval results never become evidence merely because they rank highly.
- The Evidence Envelope records selected supporting evidence explicitly.
- Provider swap preserves evidence identity and result interpretability.

### Evidence

Top-k retrieval metrics, hard-negative corpus, spatial-localization tests, provenance checks and regression report.

---

## HFX-204 — IFC-Bench + BIM-Edit reasoning/operation evaluation corpus

**Parent:** PROD-028 and feeds PROD-023  
**Priority:** P1  
**Owner:** BIM/EVAL  
**Depends on:** HFX-000, Layer-2 benchmark harness, existing operation contract

### Purpose

Turn IFC-Bench and BIM-Edit into a governed evaluation suite for construction/BIM reasoning and command translation.

### Scope

- Pin benchmark versions/manifests and licenses.
- Map IFC-Bench questions to Evidence Envelope expectations.
- Map BIM-Edit create/update/delete and spatial/topological tasks to AISE operation intents.
- Add AISE-specific negative cases: unavailable geometry, conflicting evidence, missing dimensions and invalid constraints.
- Keep benchmark-answer correctness separate from engineering approval.

### Acceptance criteria

- Benchmark runs are reproducible and version-pinned.
- Each benchmark result records evidence/task context and provider identity.
- IFC-Bench failures are distinguishable as perception, retrieval, reasoning or unsupported-data failures.
- BIM-Edit outputs can be evaluated for operation semantics without executing unsafe/invalid changes.
- Benchmark use does not bypass deterministic validation.

### Evidence

Pinned benchmark manifests, evaluation reports, negative cases, provider comparison and operation-intent mapping.

---

# Layer 3 — Solution

## HFX-301 — Natural-language ↔ direct-manipulation semantic equivalence benchmark

**Parent:** PROD-029  
**Priority:** P2  
**Owner:** AI/REASONING + CORE  
**Depends on:** HFX-000, HFX-204, PROD-021, PROD-022, PROD-023

### Purpose

Use BIM-Edit-style tasks to prove that the agent and direct-manipulation interfaces resolve to the same EngineeringOperation semantics.

### Scope

- Create a corpus of representative building commands.
- Generate equivalent commands with varied wording.
- Compare agent-produced operation intents with direct-manipulation operation intents.
- Include create/update/delete, spatial and topological changes.
- Exercise clarification for dimensions, material, location and sequencing.

### Acceptance criteria

- Semantically equivalent commands converge on the same normalized operation representation when unambiguous.
- Different but valid implementations remain distinguishable when their operation semantics differ.
- Ambiguous commands do not auto-execute.
- All consequential operations pass through the deterministic solution engine.
- Agent output never becomes authoritative geometry or validation.

### Evidence

Equivalence corpus, semantic normalization metrics, ambiguity tests, unsafe-command tests and deterministic execution trace.

---

## HFX-302 — Geometry/validation technology substitution benchmark

**Parent:** PROD-029  
**Priority:** P3  
**Owner:** GEOMETRY/CORE  
**Depends on:** HFX-301, PROD-022, PROD-025

### Purpose

Extend the technology-substitution requirement into Layer 3 so geometry/constraint/validation technology can be changed without changing AISE solution semantics.

### Scope

- Define a provider-neutral geometry/validation adapter surface.
- Build a reference implementation/test oracle for the supported building operation subset.
- Compare candidate geometry/constraint technologies on identical operation sequences.
- Verify quantities, units, topology constraints and validation status.
- Record unsupported operation classes explicitly.

### Acceptance criteria

- Two implementations can consume the same canonical operation sequence.
- Equivalent supported inputs produce semantically compatible proposed states and quantities within declared tolerances.
- Validation decisions are reproducible and provenance-preserving.
- Provider-specific geometry formats do not become Solution Graph identity.
- A failed provider can be removed while historical solution records remain interpretable.

### Evidence

Dual-provider/reimplementation run, tolerance report, negative/discrimination suite, provenance continuity test and historical replay.

---

## HFX-303 — Bounded visual-solution provider lane

**Parent:** PROD-029  
**Priority:** P3  
**Owner:** WEB/3D  
**Depends on:** PROD-024, HFX-000

### Purpose

Evaluate image/3D generation technologies such as Apple SHARP and TRELLIS.2 strictly as visualization or hypothesis-rendering aids, not engineering geometry authority.

### Scope

- Put generation providers behind a visual-rendering provider port.
- Render solution states for inspection/presentation.
- Preserve exact Solution Graph version, operation/state identity and provider provenance.
- Compare generated appearance against canonical deterministic geometry where available.
- Add visible UI semantics distinguishing canonical solution geometry from generated visual completion.

### Acceptance criteria

- Generated visuals can never change quantities, validation or canonical Solution Graph state.
- Every visual artifact is linked to a solution/state revision and provider profile.
- Provider replacement changes presentation only, not engineering semantics.
- Missing/failed visual generation falls back to canonical 2D/3D views.
- Generated details are labeled as generated/hypothetical where they exceed observed or deterministic geometry.

### Evidence

Provider swap trace, semantic non-interference tests, visual provenance report and fallback test.

---

# Cross-layer promotion gate

## HFX-401 — AISE provider scorecard, promotion and rollback gate

**Parent:** PROD-027 + PROD-028 + PROD-029  
**Priority:** P3 / mandatory before production promotion of any new provider  
**Owner:** SHARED/QA + ARCHITECT  
**Depends on:** all applicable HFX work orders

### Purpose

Turn one-off HF experiments into a durable AISE capability: continuously evaluating interchangeable technologies instead of hardwiring a single model/provider.

### Scope

- Persist benchmark results under the common provider profile.
- Define promotion states: evaluating, benchmark_pass, production_candidate, approved, rejected, retired.
- Record semantic, uncertainty, provenance, failure, cost, latency and license dimensions.
- Add a promotion checklist for each layer.
- Add rollback/fallback configuration where migration risk warrants it.
- Verify historical replay after provider retirement.

### Acceptance criteria

A provider may not become the production default solely because it has better task metrics. Promotion requires all applicable gates:

contract conformance
+ semantic equivalence
+ negative/discrimination behavior
+ provenance continuity
+ uncertainty behavior
+ failure/unsupported behavior
+ dependent-layer regression
+ license/use clearance
+ cost/quota safety
+ historical interpretability

A provider that fails any mandatory gate remains non-production, even if its benchmark score is strong.

### Evidence

Machine-readable provider scorecard, promotion/rollback trace, layer regression report, license declaration and historical-replay evidence.

---

# Model / dataset register for the initial bake-off

| Candidate | Layer | AISE use | Default posture |
|---|---|---|---|
| MapAnything | 1 | reconstruction / depth / registration | benchmark provider |
| Video Depth Anything | 1 | temporal video depth | benchmark provider |
| SAM 3 | 1 | open-vocabulary segmentation/tracking | evaluation until license/use cleared |
| TAB | 1 | active RGB-D spatial grounding pattern/benchmark | research benchmark / design input |
| Hilti × Trimble SLAM 2026 | 1 | construction-site registration benchmark | evaluation-only unless commercial rights cleared |
| dacl10k | 1 | auxiliary defect perception benchmark | evaluation/benchmark |
| Qwen3-VL 8B / 30B-A3B | 2 | multimodal reasoning | benchmark providers |
| PaddleOCR-VL 1.6 | 2 | document/BOQ parsing | benchmark provider |
| PP-DocLayoutV3 | 2 | technical drawing layout | benchmark provider |
| SigLIP 2 | 2 | semantic retrieval/indexing | benchmark provider |
| STELLAR | 2 | spatial-semantic visual representation | benchmark provider |
| IFC-Bench | 2 | BIM reasoning evaluation | evaluation-only benchmark |
| BIM-Edit | 2/3 | operation/command evaluation | evaluation-only benchmark |
| Apple SHARP | 3 | visual rendering/hypothesis only | visualization provider |
| TRELLIS.2 | 3 | visual asset/generation aid | visualization provider |

---

# Definition of done for the HF-derived program

The HF-derived program is complete only when:

1. Every provider is behind a stable AISE port.
2. The same canonical evidence/operation fixture can be compared across providers.
3. Provider identity/version/configuration/input digests are retained in provenance.
4. Provider-specific types cannot become canonical Reality Graph, Evidence Graph or Solution Graph meaning.
5. Unknown/unsupported/failure states are explicit and safe.
6. Benchmarks include hard negatives and failure/discrimination cases, not just positive examples.
7. Confidence is kept separate from measurement uncertainty.
8. No model or benchmark dataset is promoted into production training merely because it is available on Hugging Face.
9. Layer dependencies are regression-tested after promotion.
10. Historical AISE records remain interpretable if a provider is retired.
11. The baseline free/demo path remains available without requiring a large GPU provider.
12. PROD-027, PROD-028, PROD-029 can close with evidence that provider choice is now an evaluated, reversible engineering decision rather than a hard-coded technology decision.

## Research basis

Initial candidates were selected from the September 2026 Hugging Face review because they map directly to AISE's hardest capability gaps:

- MapAnything for unified 3D reconstruction tasks.
- Video Depth Anything for temporally consistent video depth.
- SAM 3 and TAB for open-vocabulary/active spatial grounding.
- Qwen3-VL for multimodal/video/spatial reasoning.
- PaddleOCR-VL and PP-DocLayoutV3 for BOQ/drawing parsing.
- SigLIP 2 and STELLAR for semantic/spatial visual retrieval.
- IFC-Bench and BIM-Edit for BIM reasoning and natural-language-to-building-edit evaluation.
- Hilti × Trimble SLAM 2026 and dacl10k for construction/inspection-domain stress testing.
- SHARP and TRELLIS.2 for bounded Layer-3 visualization rather than engineering truth.
