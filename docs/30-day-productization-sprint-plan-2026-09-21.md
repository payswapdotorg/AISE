# AISE — 30-Day Productization Sprint Plan

**Sprint window:** 2026-09-21 through 2026-10-20
**Concurrency:** exactly three workers maximum
**Primary goal:** execute the live roadmap toward a task-first, ShareNet-inspired product, complete the ACR-005 interactive-solution composition, and begin/advance Layer 1–3 hardening without violating repository governance.
**Source of truth:** `docs/productization-state.json` plus the applicable Work Orders.

## Sprint outcome target

This sprint is designed to move the repository from the current `not_ready` state through the interactive-solution composition and into the Layer 1–3 hardening evidence chain. It does **not** pre-declare PROD-014 or PROD-015 complete; those remain release/final-readiness gates after their dependencies are genuinely accepted.

Critical-path sequence:

```text
PROD-016
  ↓
PROD-021
  ↓
PROD-022 + PROD-023
  ↓
PROD-024
  ↓
PROD-025
  ↓
PROD-018
  ↓
PROD-026
  ↓
PROD-027 + PROD-028 + PROD-029
  ↓
PROD-014
  ↓
PROD-015
```

Parallel branches protected during the sprint: PROD-012, PROD-019, PROD-020, competitive UX integration, deployment/QA, and HFX preparation.

## Worker contracts

### Worker 1 — Product Experience / Web
Primary ownership: `apps/web/**` and browser-specific UI/tests. Never change canonical domain semantics.

### Worker 2 — Core / AI / Solution
Primary ownership: shared task/action projections, solution contracts/engine/compiler, Evidence Envelope and hardening semantics. Shared contract changes require the Tech Lead to create/approve a governed work item.

### Worker 3 — Platform / Deployment / QA
Primary ownership: deployment tooling, provider wiring, E2E/conformance, browser/device smoke, accessibility, quota/failure proof and deployment evidence.

## Daily operating rules

- Start each day by reading current `docs/productization-state.json`; a previous day's plan never overrides current machine state.
- Recompute eligibility after every accepted merge.
- Never exceed three concurrent workers.
- Never dispatch work whose dependency is not finalized.
- Keep protected surfaces disjoint.
- A test result is not a product acceptance result until the evidence required by the Work Order is independently reproducible.
- Any shared semantic defect becomes a governed SHARED corrective item.
- Deployment success on an older commit never proves the current `main` is deployed.

## Day-by-day execution

| Day | Date | Worker 1 | Worker 2 | Worker 3 | Dependency gate / exit criteria |
|---:|---|---|---|---|---|
| 1 | 2026-09-21 | W1: PROD-016 — finalize shared adapter contract fixtures and compatibility window. | W2: PROD-012 — inspect current deployed build, reproduce health/readiness and browser verification prerequisites. | W3: deployment inventory — verify Vercel binding, Neon/R2/Upstash/Apify environment contracts; no secret values committed. | Gate: PROD-016 remains the prerequisite for adapter dispatch. Exit: contract fixtures executable; deployment ownership/binding documented or an explicit access blocker recorded. |
| 2 | 2026-09-22 | W1: PROD-016 — boundary audit of web/Android authority leakage and conformance harness. | W2: PROD-012 — run deployed-route/accessibility smoke and document any current-head-vs-deployed differences. | W3: deployment — clean-build rehearsal and API function/beacon verification. | Gate: PROD-016 acceptance evidence + PROD-012 evidence package complete. Exit: Tech Lead can accept both or create corrective work items. |
| 3 | 2026-09-23 | W1: PROD-017 — task-first browser shell; ShareNet-inspired tokens and first-run hierarchy. | W2: PROD-021 — begin Solution/EngineeringOperation contract fixtures after PROD-016 acceptance. | W3: PROD-019 — Android adapter task/capability/result wiring. | Gate: PROD-016 merged. Exit: browser/mobile/solution contracts have no provider or client authority leaks. |
| 4 | 2026-09-24 | W1: PROD-017 — project command-center structure + golden journey entry points. | W2: PROD-021 — operation lifecycle, versioning, targets, provenance, BOQ trace contracts. | W3: PROD-019 — adaptive capture mission + offline/resume conformance fixtures. | Gate: no shared contract edits outside PROD-021. Exit: browser and Android can consume common contract fixtures. |
| 5 | 2026-09-25 | W1: PROD-017 — Next Best Action, project navigation and explicit blocked/unavailable states. | W2: PROD-021 — deterministic building operation fixtures + negative tests; prepare acceptance. | W3: PROD-019 — field journey UI and server-authoritative submission path. | Gate: PROD-021 accepted. Exit: browser golden-journal entry is task-first; Android field task loop is demonstrable. |
| 6 | 2026-09-26 | W1: PROD-017 — evidence/BOQ/case/intervention/outcome task rail. | W2: PROD-022 — deterministic solution engine skeleton, replay contract and mutation protection. | W3: PROD-020 — desktop shell bootstrap and adapter conformance wiring. | Gate: PROD-021 merged. Exit: solution engine accepts canonical operation fixtures; desktop adapter bootstraps. |
| 7 | 2026-09-27 | W1: PROD-017 — ShareNet-inspired responsive shell, loading/empty/error states. | W2: PROD-023 — natural-language → operation-intent compiler and clarification model. | W3: PROD-020 — project/review workflows and keyboard-oriented affordances. | Gate: PROD-022/023 may proceed concurrently. Exit: both direct and agent paths have a common typed operation target. |
| 8 | 2026-09-28 | W1: PROD-017 — browser conformance + journey recording; fix only web-local issues. | W2: PROD-022 — geometry/topology/quantity deterministic operations for supported building subset. | W3: PROD-025 — solution BOQ trace contract and calculation fixtures. | Gate: protected surfaces remain disjoint. Exit: 017, 020 and core solution fixtures ready for review. |
| 9 | 2026-09-29 | W1: PROD-017 — provenance/epistemic/non-authority audit and merge package. | W2: PROD-023 — command equivalence, unsafe/ambiguous command tests. | W3: PROD-025 — validation snapshot → solution BOQ derivation and reverse trace fixtures. | Gate: adapter wave closure evidence must be independent of UI polish. Exit: 017 + 019 + 020 eligible for merge once acceptance passes. |
| 10 | 2026-09-30 | W1: PROD-017 — final browser acceptance + merge. | W2: PROD-022 — deterministic replay + negative/discrimination tests. | W3: PROD-025 — BOQ-line ↔ operation ↔ geometry navigation service/tests. | Gate: 017 merge. Exit: browser adapter finalized; 022 and 025 each have deterministic evidence. |
| 11 | 2026-10-01 | W1: PROD-018 — begin competitive parity composition using current browser/mobile/desktop results. | W2: PROD-023 — final compiler/tool trace and exact executed-command provenance. | W3: PROD-025 — finish quantity/provenance/non-overwrite tests. | Gate: 019 + 020 accepted. Exit: 022/023/025 acceptance bundles ready or corrective issues isolated. |
| 12 | 2026-10-02 | W1: PROD-018 — capture, issue and BOQ cross-links. | W2: PROD-022 — finalize engine acceptance and replay evidence. | W3: PROD-025 — finalize solution BOQ evidence. | Gate: 022 + 023 + 025 accepted. Exit: deterministic solution backend is stable for composition. |
| 13 | 2026-10-03 | W1: PROD-018 — plan-vs-reality and before/after navigation; outcome discovery. | W2: PROD-024 — interactive solution workspace shell over canonical operations. | W3: deployment — build deployed candidate and run regression smoke against current main. | Gate: 017 + 022 + 023 merged. Exit: interactive workspace renders canonical current/proposed state distinction. |
| 14 | 2026-10-04 | W1: PROD-018 — action labels/terminology normalization: Capture, Investigate, Build solution, Review outcome. | W2: PROD-024 — direct manipulation → EngineeringOperation; step/timeline controls. | W3: deployment — verify deployment, auth/session continuity, health/readiness and rollback candidate. | Gate: no client-local operation semantics. Exit: direct manipulation produces inspectable typed operations. |
| 15 | 2026-10-05 | W1: PROD-018 — BOQ Lens → evidence/case action bridges. | W2: PROD-024 — embedded agent command path using same operation semantics. | W3: PROD-018 support — cross-adapter conformance capture and accessibility checks. | Gate: direct and agent operation semantics must converge. Exit: complete solution workspace authoring path exists. |
| 16 | 2026-10-06 | W1: PROD-018 — engineering-case/task-first composition and evidence-gap next actions. | W2: PROD-024 — 2D/3D synchronization, proposed-state visualization and accessible fallback. | W3: deployment QA — automated golden journey harness and responsive smoke. | Gate: PROD-024 dependencies satisfied. Exit: user can create, inspect and revise a proposed state without mutating reality. |
| 17 | 2026-10-07 | W1: PROD-018 — Intervention Plan → Validate → Approve → Execute → Compare composition. | W2: PROD-024 — solution inspection, isolate affected geometry and operation details. | W3: deployment QA — API route matrix + console/error detection + evidence capture. | Gate: PROD-018 near-final. Exit: end-to-end solution UI is navigable as a task journey. |
| 18 | 2026-10-08 | W1: PROD-018 — finish competitive capability traceability and exceptions. | W2: PROD-024 — final interactive UX polish without changing operation semantics. | W3: deployment — current-head candidate deployment + browser walk. | Gate: PROD-018 acceptance package ready. Exit: 018 and 024 each independently reviewable. |
| 19 | 2026-10-09 | W1: PROD-026 — compose complete journey from reality/problem into solution. | W2: PROD-026 support — seeded building benchmark and semantic equivalence fixture execution. | W3: deployment — record deployed journey evidence; check durable state and rollback. | Gate: PROD-018 + 024 + 025 accepted. Exit: 026 benchmark can run end-to-end. |
| 20 | 2026-10-10 | W1: PROD-026 — Validate → solution BOQ → BOQ line → solution step/geometry. | W2: PROD-026 — mutation protection, deterministic replay and provenance audit. | W3: deployment — deployed interactive-solution journey smoke. | Gate: all 026 acceptance legs have evidence sources. Exit: no known gap between specification and benchmark harness. |
| 21 | 2026-10-11 | W1: PROD-026 — physical/building scenario composition. | W2: PROD-026 — direct-vs-agent equivalence and ambiguity/unsupported cases. | W3: deployment — mobile/desktop/browser responsive and adapter consistency checks. | Gate: every consequential operation must remain deterministic and auditable. Exit: 026 evidence complete or blocked reasons explicit. |
| 22 | 2026-10-12 | W1: PROD-026 — final product journey recording. | W2: PROD-026 — final deterministic verification and source-vs-generated BOQ audit. | W3: deployment — candidate production deployment and rollback point. | Gate: Tech Lead independently reproduces evidence. Exit: PROD-026 merge candidate. |
| 23 | 2026-10-13 | W1: post-026 UX integration — Project Command Center polish based on complete workflow. | W2: HFX-000 preparation — provider registry/profile schema + benchmark result schema. | W3: deployment — prepare provider-plan verification and environment fingerprint automation. | Gate: PROD-026 merged. HFX implementation may now become eligible; prep before that point was non-accepting only. |
| 24 | 2026-10-14 | W1: PROD-027 prep — Layer-1 hardening fixture map and capture/readiness gaps. | W2: HFX-000 — provenance, license/use, compute/resource and failure profiles. | W3: PROD-027 prep — reconstruction/SLAM/provider benchmark harness scaffolding. | Gate: HFX-000 remains critical control-plane item. Exit: one reference provider can traverse registration → benchmark → provenance lifecycle. |
| 25 | 2026-10-15 | W1: PROD-027 — MapAnything/Video Depth Anything adapter evaluation hooks. | W2: PROD-028 — Evidence Envelope benchmark fixture map; Qwen3-VL/document/retrieval lanes. | W3: PROD-029 — Layer-3 operation/validation substitution fixtures. | Gate: HFX-000 accepted. Exit: each layer has a provider-neutral evaluation entry point. |
| 26 | 2026-10-16 | W1: PROD-027/HFX-101 — reconstruction benchmark + failure handling. | W2: PROD-028/HFX-201+202 — multimodal reasoning + BOQ/drawing evaluation scaffolds. | W3: PROD-029/HFX-301 prep — natural-language/direct-manipulation equivalence corpus. | Gate: no provider-specific type reaches canonical graph contracts. Exit: benchmark evidence is reproducible. |
| 27 | 2026-10-17 | W1: PROD-027/HFX-102+104 — temporal depth and spatial grounding stress tests. | W2: PROD-028/HFX-203+204 — retrieval + IFC-Bench/BIM-Edit evaluation. | W3: PROD-029/HFX-301 — semantic equivalence benchmark execution. | Gate: negative/discrimination tests included. Exit: layer-specific hardening reports contain actionable failures, not only scores. |
| 28 | 2026-10-18 | W1: PROD-027/HFX-103 — construction-site SLAM benchmark and registration thresholds. | W2: PROD-028 — finalize Evidence Envelope reasoning/provenance comparison. | W3: PROD-029 — finalize direct/agent equivalence and begin HFX-302 substitution drill. | Gate: hardening parent work remains open until evidence is independently reproduced. Exit: no critical provider failure is silently masked. |
| 29 | 2026-10-19 | W1: PROD-027 — final Layer-1 evidence/acceptance package. | W2: PROD-028 — final Layer-2 evidence/acceptance package. | W3: PROD-029 — Layer-3 substitution + visualization safety evidence. | Gate: all three hardening lanes need dependent-layer regression. Exit: 027/028/029 merge candidates or explicit blockers. |
| 30 | 2026-10-20 | W1: final journey re-run — Reality → Understanding → Solution → Outcome. | W2: final provider scorecard inputs + historical replay evidence (HFX-401 preparation). | W3: final clean production deployment + browser/accessibility/cost/failure verification; freeze rollback candidate. | Gate: PROD-027/028/029 acceptance plus release evidence. Exit: Tech Lead publishes sprint reconciliation: merged items, blocked items, next eligible wave, and whether PROD-014 can start. |

## Wave-level exit criteria

### Wave A — platform contracts + adapters
Exit: PROD-012, PROD-016, PROD-017, PROD-019 and PROD-020 either finalized or have explicit governed blockers; browser/mobile/desktop consume the same adapter semantics.

### Wave B — interactive solution foundation
Exit: PROD-021, PROD-022, PROD-023 and PROD-025 finalized; deterministic operation semantics, agent equivalence, solution BOQ derivation and traceability are evidenced.

### Wave C — composed product
Exit: PROD-018, PROD-024 and PROD-026 finalized; both major product journeys can be walked without knowing AISE internals.

### Wave D — hardening
Exit: PROD-027/028/029 finalized or have explicit evidence-backed blockers; HFX provider evaluation is behind a stable control plane and does not alter authority semantics.

## Sprint final gate

The Tech Lead closes the sprint only after:

```text
current main read
→ machine-state reconciliation
→ worker evidence reproduction
→ bun run verify + targeted tests
→ browser journey verification
→ deployment verification
→ accessibility/responsive verification
→ provenance/authority audit
→ roadmap/state synchronization
```

At sprint close, PROD-014 may begin only if every dependency in `docs/productization-state.json` is actually finalized. PROD-015 remains reserved for the final Production-Readiness Gates A–I.

## Design acceptance anchor

All browser work must retain the ShareNet-inspired visual language: warm light canvas, soft graphite hierarchy, restrained connected-state accent, amber review/degraded state, quiet loading/error states, generous whitespace and sparse primary actions. This is a presentation system only; engineering provenance, uncertainty, epistemic state and server authority remain mandatory.