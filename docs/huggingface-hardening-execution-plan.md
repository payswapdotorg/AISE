# AISE — Hugging Face Hardening Execution Plan

**Plan version:** 1.0
**Plan date:** 2026-09-20
**Applies to:** HFX-000 through HFX-401
**Parent program:** PROD-011b through PROD-015, with Layer-1/2/3 hardening at PROD-027/028/029
**Concurrency ceiling:** 3 workers

## 1. Execution rule

The HFX work orders are subordinate to the existing AISE productization program. They do not create an independent product stream.

Strict dependency rule: finish the current productization chain through PROD-026 before HFX items are accepted as implementation work. Research preparation can happen earlier, but cannot be marked as HFX completion or bypass parent gates.

## 2. Optimized upstream schedule

### Wave U0 — current unblock
Run where eligible:
- PROD-011b — deployed-session stability
- PROD-016 — shared client adapter contract and conformance

PROD-011b is still externally blocked on a valid Upstash REST endpoint. PROD-016 does not depend on PROD-011b.

### Wave U1 — adapters plus solution contract
After PROD-016, use the three slots aggressively:
- PROD-017 — browser adapter
- PROD-019 — Android adapter
- PROD-020 — desktop adapter
- PROD-021 — Solution Graph and EngineeringOperation contract

Because the ceiling is three, PROD-021 should take the first released slot rather than waiting for all adapters. This protects the later critical path.

### Wave U2 — solution engine fan-out
After PROD-021:
- PROD-022 — deterministic solution engine
- PROD-023 — natural-language operation compiler
- PROD-025 — solution BOQ derivation and traceability

These three have disjoint protected surfaces and should normally run concurrently.

### Wave U3 — composition
Run immediately when each dependency clears:
- PROD-012 after PROD-011b
- PROD-018 after PROD-012 plus all three adapters
- PROD-024 after PROD-017 plus PROD-022 plus PROD-023

PROD-018 and PROD-024 can run in parallel once their own dependencies are satisfied.

### Wave U4 — workflow proof
- PROD-026 — end-to-end interactive solution composition and building benchmark

Only after PROD-026 is accepted should HFX-101 through HFX-303 be treated as executable child hardening work.

## 3. HFX execution waves

### HF-0 — provider evaluation control plane
**HFX-000 — ARCHITECT/PLATFORM**

Build the machine-readable provider profile, provider registry, normalized I/O boundary, benchmark result schema, provenance manifest, license/use gate, resource and cost profile, failure vocabulary, and promotion states.

Exit gate: a reference provider can complete registration → execution → normalized result → benchmark → provenance → promotion decision without changing canonical AISE semantics.

**Critical path: YES.**

### HF-1 — first three high-leverage providers
Run in parallel:
- HFX-101 — MapAnything — SPATIAL/RECON
- HFX-102 — Video Depth Anything — MOBILE/CV
- HFX-201 — Qwen3-VL — AI/REASONING

Exit gate: each produces a comparable benchmark record with provenance, uncertainty, resource profile and explicit failure behavior.

### HF-2 — evidence, documents and BIM
Run in parallel:
- HFX-202 — PaddleOCR-VL plus PP-DocLayoutV3 — DOC-AI/QS
- HFX-203 — SigLIP 2 and/or STELLAR retrieval benchmark — RETRIEVAL/ML
- HFX-204 — IFC-Bench plus BIM-Edit corpus — BIM/EVAL

Exit gate: the benchmark suite can distinguish perception, retrieval, reasoning, unsupported-data and operation-semantic failures.

### HF-3 — dependent spatial and Layer-3 equivalence
Run in parallel where eligible:
- HFX-103 — construction-site SLAM benchmark — SLAM/SPATIAL
- HFX-104 — open-vocabulary construction grounding — CV/SEMANTIC
- HFX-301 — natural-language/direct-manipulation equivalence — AI/REASONING + CORE

HFX-301 has critical-path status once PROD-021, PROD-022, PROD-023 and HFX-204 are complete.

### HF-4 — Layer-3 substitution and convergence
- HFX-302 — geometry/validation technology substitution — GEOMETRY/CORE
- HFX-303 — bounded visual-solution provider lane — WEB/3D
- HFX-401 — provider scorecard, promotion and rollback gate — SHARED/QA + ARCHITECT

HFX-302 remains critical. HFX-303 is parallel work and must never block the deterministic engineering path.

## 4. Critical path

### Full program
PROD-011b
→ PROD-016
→ PROD-021
→ PROD-023
→ PROD-024
→ PROD-026
→ HFX-000
→ HFX-204
→ HFX-301
→ HFX-302
→ HFX-401
→ PROD-014
→ PROD-015

That is the chain whose delay most directly delays final product-readiness evidence.

### Full-program parallel branches
These should be kept active without stealing the critical-path slot:
- PROD-019 and PROD-020
- HFX-102, HFX-103, HFX-104
- HFX-201, HFX-202, HFX-203
- HFX-303

### Critical-path protection
1. Never use all three worker slots for non-critical work while a critical-path item is eligible.
2. Recompute eligibility after every accepted merge.
3. Shared semantic defects become new SHARED work items rather than cross-branch patches.
4. Benchmark polishing never blocks provider-contract or safety work.
5. No provider-specific type or identifier enters a canonical AISE contract.

## 5. First 30 days of HF implementation

**Day 1 means the first day HFX hardening is eligible, after PROD-026 acceptance.** Upstream productization work is not counted in these 30 HF days.

### Days 1–3 — HF-0
Ship the provider registry, profile schema, benchmark-result schema, provenance manifest, license/use gate, failure vocabulary and reference-provider lifecycle.
Checkpoint: reference provider completes the full evaluation lifecycle.

### Days 4–9 — HF-1
Run HFX-101, HFX-102 and HFX-201.
Checkpoint: reconstruction, temporal-depth and multimodal-reasoning candidates have comparable benchmark records and negative-path evidence.

### Days 10–15 — HF-2
Run HFX-202, HFX-203 and HFX-204.
Checkpoint: BOQ/drawing, retrieval and BIM/operation evaluation surfaces are reproducible and license-controlled.

### Days 16–21 — HF-3
Run HFX-103, HFX-104 and HFX-301, giving HFX-301 the critical-path slot as soon as its dependencies clear.
Checkpoint: spatial grounding stress tests and agent/direct-manipulation semantic equivalence are evidenced.

### Days 22–26 — HF-4A
Run HFX-302 and HFX-303.
Priority: complete HFX-302 substitution evidence first; run HFX-303 in parallel when PROD-024 is available.
Checkpoint: Layer-3 technology substitution has at least one reproducible dual-provider or reimplementation drill.

### Days 27–30 — HF-4B
Run HFX-401.
Checkpoint: provider scorecard, promotion/rejection decisions, rollback or fallback evidence, license/use decisions, dependent-layer regression and historical replay are complete.

## 6. 30-day checkpoint table

| Day | Required checkpoint |
|---|---|
| 3 | Provider evaluation control plane operational |
| 9 | Layer-1 reconstruction/depth and Layer-2 multimodal benchmarked |
| 15 | Document, retrieval and BIM benchmark surfaces benchmarked |
| 21 | Spatial grounding and agent/direct-manipulation equivalence benchmarked |
| 26 | Layer-3 substitution evidence available |
| 30 | HFX provider promotion dossier and PROD-027/028/029 closure evidence candidate |

## 7. Verification and merge protocol

Every HFX item follows:
worker implementation → worker tests → protected-surface review → independent benchmark/evidence reproduction → full repository verification → affected-layer regression → semantic/provenance audit → merge → eligibility recomputation.

Every provider substitution additionally follows:
same canonical fixture → provider A → provider B → normalized result → semantic comparison → uncertainty comparison → provenance comparison → failure/negative comparison → dependent regression.

No benchmark score alone authorizes promotion.

## 8. Thirty-day success condition

By Day 30, AISE should have a reusable provider-evaluation control plane, construction-specific benchmark coverage, an auditable BOQ/document evaluation lane, an explicit natural-language/direct-manipulation equivalence test, a Layer-3 substitution drill, and a promotion process that is reversible and provenance-preserving.

The objective is evaluated substitutability across Layers 1–3, not accumulation of models.