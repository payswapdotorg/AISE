# AISE — FINAL PRODUCT PARITY / EXPERIENCE / MULTIPLATFORM DIRECTIVE

**Directive date:** 2026-10-02  
**Repository:** `payswapdotorg/AISE`  
**Audience:** successor Tech Lead / Architect / Orchestrator  
**Status:** AUTHORITATIVE PRODUCT-DIRECTION OVERRIDE

This section is the latest product-direction instruction and supersedes any older statement that implies AISE should continue primarily as a dashboard/control-room application or rebuild a 3D/CAD/BIM stack from scratch.

The goal is not to rewrite AISE's engineering core. The goal is to make the existing engineering core feel and behave like a **world-based engineering application** while using mature open-source 3D/CAD/BIM/geospatial technology as replaceable implementation substrate.

The product must achieve **feature-parity of the relevant user experience with the strongest incumbent for each layer**, while AISE's differentiation is the continuous connection:

```text
REALITY → UNDERSTANDING → INTERACTIVE SOLUTION → VALIDATION → BOQ → EXECUTION → OUTCOME
```

## 1. The three incumbent parity targets

### Layer 1 — REALITY

**Primary incumbent parity target: OpenSpace.**

OpenSpace currently combines smartphone/360°/drone capture, visual intelligence, BIM+ workflows, model-vs-capture comparison, measurements, layer toggling and field-oriented navigation. AISE Layer 1 should therefore feel at least as useful for answering "what is actually here?" and "what changed?" while preserving AISE's stronger evidence/provenance model.

**AISE Layer-1 target:**

```text
CAPTURE
→ SPATIALIZE
→ REGISTER
→ RECONSTRUCT
→ NAVIGATE
→ COMPARE
→ MEASURE
→ TRACE TO EVIDENCE
```

The primary experience must be a navigable spatial world, not a table of records.

### Layer 2 — UNDERSTANDING

**Primary incumbent parity target: Procore Project Management + Procore Assist.**

Procore's current workflow breadth includes drawings, documents, RFIs, submittals, observations, inspections, daily logs, photos, tasks and issue/action workflows, with AI able to retrieve and act on project data within bounded product tools. AISE should match that information-to-action continuity, but preserve AISE's Evidence Envelope, epistemic states, deterministic verification and refusal rules.

**AISE Layer-2 target:**

```text
QUESTION / ISSUE
→ CONTEXT
→ EVIDENCE
→ MISSING-EVIDENCE DETECTION
→ BOUNDED REASONING
→ DETERMINISTIC CHECKS
→ ACTION / NEXT STEP
→ AUDIT TRAIL
```

The engineer must be able to move from a problem in the spatial world to its supporting evidence and then to an actionable engineering decision without leaving the context of the problem.

### Layer 3 — SOLUTION

**Primary incumbent parity target: Bentley SYNCHRO 4D, with Autodesk Revit/Navisworks as the design-authoring and coordination reference.**

SYNCHRO provides visual 4D planning, model-linked scheduling, construction-sequence simulation and what-if planning. Autodesk Revit/Navisworks provide strong reference points for parametric model authoring, model review, quantification, coordination and clash workflows.

AISE must combine the useful interaction patterns of these products with something they do not provide as one continuous experience: **the engineer solves the problem inside the reconstructed world like playing a game, while every action remains a governed AISE EngineeringOperation connected to evidence, validation and BOQ.**

**AISE Layer-3 target:**

```text
PROBLEM
→ ENTER WORLD
→ INSPECT
→ GRAB / MOVE / REPLACE / ADD / REMOVE
→ PREVIEW PROPOSED STATE
→ RUN ENGINEERING VALIDATION
→ SEE CONSEQUENCES
→ ACCEPT / REVISE
→ GENERATE SOLUTION BOQ
→ SIMULATE EXECUTION
→ CAPTURE OUTCOME
```

The word "game" describes the interaction model, not a relaxation of engineering rigor.

---

## 2. Open-source implementation strategy — integrate, do not rebuild

The following technologies are the preferred substrate for the corresponding capabilities. They are **implementation components, never AISE authorities**.

### Layer 1 preferred substrate

**1. Babylon.js** — primary real-time interactive scene engine for web; scene graph, picking, cameras, animation, physics, WebGPU/WebGL, XR and large-world capabilities.

**2. CesiumJS** — geospatial/world context, WGS84 coordinates, large geospatial datasets and 3D Tiles where site/campus/corridor context matters.

**3. OpenUSD** — scene composition/interchange layer for assembling reality, BIM-derived assets, temporal variants, proposed states and external 3D assets without making USD the AISE engineering authority.

**4. glTF / GLB** — runtime delivery format for interactive assets and efficient web/native transfer.

**5. Assimp** — broad file-format ingestion at the integration boundary; never use imported provider/object IDs as canonical identity.

**6. ParaView / VTK-derived processing** — large point-cloud/scientific/field-data processing and inspection where appropriate; keep heavy processing off the browser when required.

**7. Blender** — asset inspection/conversion/authoring automation and optional headless geometry preparation; never canonical reality state.

**8. IfcOpenShell** — IFC ingestion/extraction, BIM semantics, relationships, quantities and 2D/3D BIM interoperability.

**9. OCCT** — exact solid/surface geometry operations where Layer 1 reconstruction or downstream deterministic geometry requires them.

**10. FreeCAD** — parametric/CAD interoperability and desktop engineering workflows where an end-user CAD workbench is useful.

The existing provider-neutral capture and spatial-registration ports remain in force. Vision/reconstruction/anchoring providers may be substituted behind those ports; a provider demo is never permission to make that provider canonical.

### Layer 2 preferred substrate

Layer 2 should reuse the same scene and reality infrastructure rather than creating another model stack.

Primary components:

- **IfcOpenShell** for BIM semantics, property/relationship extraction and IFC round-tripping;
- **OCCT** for deterministic geometry measurements, topology and geometric predicates;
- **ParaView/VTK** for heavy field/scientific data inspection and derived visualization;
- **Blender** only as an integration/authoring/inspection environment;
- **OpenUSD** for composable scene/context representations when a richer multi-asset/time representation is required;
- **Babylon.js/CesiumJS** for presenting evidence and engineering consequences directly inside the spatial experience.

LLMs/agents remain replaceable reasoning substrates. They never become engineering authorities.

### Layer 3 preferred substrate

Layer 3 must reuse the reality world and deterministic solution engine already implemented in AISE.

Primary components:

- **Babylon.js** for the interactive engineering/game world;
- **OCCT** for exact geometric construction and validation;
- **FreeCAD** for parametric CAD interoperability and optional desktop workbench integration;
- **IfcOpenShell** for IFC/BIM model semantics and exchange;
- **OpenUSD** for scene composition, variants and temporal/proposed-state presentation;
- **glTF** for runtime scene delivery;
- **Blender** for optional authoring/conversion/headless preparation;
- **ParaView** for engineering/scientific visualization where appropriate;
- **CesiumJS** when solutions depend on geographic/site/corridor context;
- **Assimp** for model import/export integration.

Do not create a proprietary in-house 3D engine, CAD kernel, BIM kernel or general-purpose asset pipeline when an adequate open-source substrate already exists.

---

## 3. Architectural rule: replace the presentation substrate, not the engineering core

The existing AISE canonical authorities stay exactly where they are:

```text
Reality Graph     → observed/derived engineering reality
Evidence Graph    → provenance/evidence
Assurance Engine  → readiness
Verification      → deterministic checks
BOQ Graph         → BOQ domain representation
Solution Graph    → proposed solution operation/state history
```

The open-source stack sits underneath these authorities:

```text
                   AISE CANONICAL CORE
                           │
        ┌──────────────────┼──────────────────┐
        ↓                  ↓                  ↓
     REALITY          UNDERSTANDING        SOLUTION
        │                  │                  │
  Babylon/Cesium     IFC/OCCT/ParaView   Babylon/OCCT/FreeCAD
  USD/glTF/Assimp     USD/Blender         IFC/USD/glTF/Blender
        │                  │                  │
        └──────────── SAME DOMAIN CONTRACTS ──┘
```

The integration contract must preserve AISE semantics including epistemic state, provenance, uncertainty, assurance thresholds, verification, identity, historical interpretability and explicit refusal.

---

## 4. The product MUST feel like an engineering game

The current dashboard/control-room feeling is not the intended final product experience.

The primary interaction should open directly into a **3D engineering world** whenever the task has a spatial context.

### Landing / project entry

Instead of primarily presenting navigation, tables and administrative cards:

```text
OPEN PROJECT
     ↓
ENTER SITE / BUILDING
     ↓
SEE CURRENT REALITY
     ↓
SEE ACTIVE ENGINEERING OBJECTIVES
```

The engineer should immediately understand:

- where they are;
- what has been observed;
- what is uncertain;
- what problem needs solving;
- what evidence is missing;
- what proposed work is currently under consideration.

### In-world HUD

The spatial view should support a restrained game-style HUD:

**Objective:** current engineering problem  
**Evidence:** evidence/readiness state  
**Constraints:** cost, dimensions, materials, client requirements and other governed constraints  
**Agent:** currently active specialist / bounded action  
**Validation:** current solution status  
**Cost / BOQ:** live consequence of the selected proposed operation  
**Timeline:** optional execution sequence / 4D view

The HUD must explain engineering state without replacing the scene.

### Engineer interaction

The engineer must be able to:

- walk/orbit/fly through the model;
- select an element by clicking it in the world;
- isolate or hide layers;
- slice/section through assemblies;
- inspect properties and evidence in place;
- measure using governed measurement tools;
- compare observed reality against plan/BIM/proposed state;
- drag, move, rotate, replace, add and remove supported components;
- preview changes as ghost/proposed geometry;
- ask the agent to make a bounded change using natural language;
- see the corresponding EngineeringOperation;
- validate the proposal;
- inspect exactly why it passes, fails or is blocked;
- accept or revise the proposal;
- see the exact BOQ lines affected by the operation;
- click a BOQ line and jump to the affected geometry/operation;
- replay/revise the solution history.

### Agent interaction

The agent should behave like a specialist operating a body inside the environment rather than like a chat box detached from the world.

Example:

```text
Engineer:
"The lintel is cracked. Replace it with a steel solution,
keep the opening, and stay below the project cost limit."

AISE:
→ identifies the affected element
→ opens the relevant evidence
→ checks whether the evidence budget is sufficient
→ asks for missing evidence when necessary
→ creates a typed proposal
→ renders the proposed element in the world
→ runs deterministic checks
→ shows cost / BOQ consequences
→ shows failures or trade-offs
→ waits for engineer acceptance/revision
```

The agent may not bypass the existing engineering safety/authority boundaries.

### Watch agents solve

AISE should support a replayable mode in which an engineer can watch an agent perform a bounded engineering task in the environment:

```text
OBSERVE AGENT
→ inspect target
→ gather evidence
→ propose
→ manipulate world
→ validate
→ revise
→ finalize proposal
```

Every visible action must map back to a typed governed action or deterministic tool call. There must be no fake animation that is disconnected from the actual solution graph.

---

## 5. Required end-to-end experience

The successor TL must make this journey work without developer tools:

```text
1. CAPTURE / IMPORT REALITY
          ↓
2. ENTER 3D WORLD
          ↓
3. SELECT PROBLEMATIC ELEMENT
          ↓
4. INSPECT EVIDENCE
          ↓
5. DEFINE / CONFIRM ENGINEERING INTENT
          ↓
6. ENTER INTERACTIVE SOLUTION MODE
          ↓
7. DIRECT MANIPULATION OR NATURAL-LANGUAGE COMMAND
          ↓
8. TYPED EngineeringOperation
          ↓
9. GHOST / PROPOSED STATE IN WORLD
          ↓
10. DETERMINISTIC VALIDATION
          ↓
11. LIVE ENGINEERING CONSEQUENCES
          ↓
12. BOQ LINE ↔ OPERATION ↔ GEOMETRY
          ↓
13. ACCEPT / REVISE
          ↓
14. OPTIONAL 4D / EXECUTION SIMULATION
          ↓
15. POST-WORK EVIDENCE
          ↓
16. OUTCOME
```

This is the product story the UI must communicate.

---

## 6. Multiplatform requirement

AISE is not a browser-only product.

### Web

Primary shared application:

- React/TypeScript application;
- Babylon.js WebGPU first, WebGL fallback;
- CesiumJS for geospatial/site context;
- shared AISE domain contracts and solution engine;
- glTF/3D Tiles runtime delivery;
- WebXR where useful.

### Desktop

Provide a first-class Windows/macOS/Linux application using the same product UI and domain contracts.

Preferred direction:

- shared React/Babylon front end;
- Tauri desktop shell or equivalent open-source native shell;
- local sidecar/native services for OCCT, IfcOpenShell, FreeCAD or Blender workflows when browser execution is inappropriate;
- offline-capable project cache where product requirements justify it;
- no second desktop-only engineering authority.

The desktop app must not be a separate fork of the product.

### Mobile

Preserve the existing Android field adapter and evidence contract.

Use the same project/domain/scene contracts for mobile viewing and solution navigation. Native mobile capture remains appropriate for camera, microphone, sensor and offline capabilities.

The architecture must leave room for iOS without changing the canonical engineering model.

### Cross-platform identity

A project opened on web, desktop or mobile must resolve to the same:

- project identity;
- evidence identities;
- Reality Graph version;
- Engineering Case;
- Solution Graph;
- BOQ revision;
- operation IDs;
- provenance chain.

Platform-specific rendering or storage must never create platform-specific engineering truth.

---

## 7. New parity workstream

The successor TL is authorized to create a new governed work program for this direction. Do not mutate existing completed work items into vague "UI overhaul" tasks.

### P0 — architecture/substrate integration

Define the exact adapter boundaries and scene/runtime contracts for Babylon.js, CesiumJS, OpenUSD, glTF, Assimp, OCCT, IfcOpenShell, Blender, FreeCAD and ParaView.

Produce an explicit license/use matrix and verify that each dependency is acceptable for the AISE distribution model before shipping it.

### P1 — Layer 1 OpenSpace parity

Target capture-to-world flow, navigable reconstruction, model/capture comparison, layer toggling, in-world measurement, evidence provenance, plan/field context, mobile-to-web continuity and large-model performance.

Success means an engineer can inspect and understand site reality spatially rather than through a records dashboard.

### P2 — Layer 2 Procore parity

Target issue/case context, evidence-linked observations, documents/drawings/RFI/submittal-like information continuity, action ownership/status, audit history, mobile/office continuity, bounded AI retrieval/action and explicit readiness/missing-evidence tasks.

Do not copy Procore's domain model. Translate useful workflow behavior into the AISE evidence/case architecture.

### P3 — Layer 3 SYNCHRO/Revit/Navisworks parity

Target interactive spatial authoring, parametric/precise geometry, model coordination, clash/conflict visualization, live quantity consequences, BOQ traceability, what-if alternatives, execution sequencing, solution replay and direct-manipulation ↔ NL equivalence.

### P4 — game-like UX transformation

The primary UI must become a spatial environment with a task/objective HUD rather than a navigation-heavy dashboard.

### P5 — multiplatform convergence

Produce feature-equivalent web, desktop and field-mobile journeys with a shared backend/domain contract and no duplicated engineering authority.

---

## 8. Suggested three-worker orchestration

When the TL can protect surfaces, dispatch three concurrent workers:

**Worker A — Layer 1 / spatial substrate**

Babylon.js + CesiumJS + OpenUSD/glTF/Assimp + existing capture/reality seams.

Deliver a real navigable project world, evidence-linked scene elements, comparison layers and performance measurements.

Protected surfaces: web scene/runtime and Layer-1 adapters.

**Worker B — Layer 2 / context and engineering understanding**

IfcOpenShell + OCCT + ParaView/Blender integration behind current evidence/reasoning ports.

Deliver problem-in-context navigation, evidence continuity, missing-evidence tasks, bounded assistant interactions and deterministic consequence views.

Protected surfaces: Layer-2 reasoning/context adapters.

**Worker C — Layer 3 / solution game loop + desktop shell**

Babylon.js + OCCT + FreeCAD/IfcOpenShell + OpenUSD/glTF with the existing deterministic solution engine.

Deliver direct manipulation, agent-controlled bounded operations, ghost proposed state, validation feedback, BOQ coupling, solution replay and first-class desktop packaging.

Protected surfaces: Interactive Solution/runtime and desktop adapter.

The TL must verify each worker independently, then compose them only after protected-surface checks pass.

---

## 9. Acceptance scenarios

### Scenario A — Layer 1

A user captures a building area on mobile, uploads/synchronizes it, opens the project on web/desktop, enters the spatial world, navigates to the captured area, compares field reality with the relevant plan/model and inspects the evidence behind a selected object.

### Scenario B — Layer 2

The user selects a problematic element. AISE presents the relevant evidence, identifies missing information, creates a case-specific capture/verification task where needed, reasons over the evidence envelope, runs deterministic checks and produces a bounded next action with a complete audit trail.

### Scenario C — Layer 3

The user selects the problem and enters solution mode. They can physically manipulate the proposed object or issue a natural-language command. The same typed EngineeringOperation is produced. Proposed geometry appears immediately as a ghost. Validation identifies any violating constraint. BOQ quantities/cost update from governed operation semantics. The user can revise, accept, or compare alternatives.

### Scenario D — watch the agent

A user presses "Watch agent solve". The agent visibly navigates/inspects/proposes/revises in the same world. Every visible action is tied to actual governed state changes and can be replayed.

### Scenario E — cross-platform

Stop the desktop session, open the same project on web and mobile, and verify that project identity, evidence, case, solution, BOQ and provenance remain identical even though rendering/input mechanics differ.

---

## 10. Hard prohibitions

Do not:

- build another proprietary CAD kernel;
- build another proprietary BIM engine;
- build another generic 3D engine;
- create separate engineering truth for web/desktop/mobile;
- replace AISE's Reality Graph with USD, IFC, FreeCAD, Blender or any other external representation;
- turn glTF/USD/IFC object IDs into canonical AISE identity;
- let an LLM directly mutate authoritative geometry;
- fake "game" animation disconnected from actual EngineeringOperations;
- make a dashboard the primary spatial problem-solving surface for spatial tasks;
- copy an incumbent's branding or visual identity;
- claim parity based on screenshots alone;
- promote automatic spatial anchoring on the basis of the synthetic benchmark while the real-photoset evidence remains evaluation-kept.

---

## 11. Definition of product completion for this direction

The initiative is not complete when the new libraries have been installed.

It is complete when a real engineer can:

```text
SEE THE WORLD
   ↓
FIND THE PROBLEM
   ↓
UNDERSTAND THE EVIDENCE
   ↓
CHANGE THE WORLD SAFELY
   ↓
SEE WHAT THE CHANGE DOES
   ↓
VALIDATE IT
   ↓
SEE THE BOQ CONSEQUENCES
   ↓
COMPARE / REVISE
   ↓
SIMULATE EXECUTION
   ↓
CAPTURE THE OUTCOME
```

and the same governed engineering state can be opened on **web, desktop and field mobile**.

The final user experience should make the engineer feel that they are **inside the engineering problem**, not operating a construction database.

---

## 12. External benchmark references used for this directive

The benchmark framing is grounded in current documentation for OpenSpace Capture/BIM+, Procore Project Management/Assist, Bentley SYNCHRO 4D, Autodesk Revit/Navisworks/Construction Cloud, and the named open-source projects.

**Final instruction to the successor TL:** stop optimizing AISE primarily as a dashboard. Preserve the engineering core, replace the spatial/presentation substrate with mature open-source technology, and make the product's primary interaction a persistent, evidence-grounded, game-like engineering world across web, desktop and field mobile.

---
# AISE — FINAL SUCCESSOR TECH LEAD HANDOFF

**Reconciliation date:** 2026-10-01
**Repository:** `payswapdotorg/AISE`
**Audience:** fresh AISE Tech Lead / Architect / Orchestrator with up to 3 concurrent workers
**Authority:** this addendum is the current orchestration authority and supersedes older “current”, “immediate priority”, or “remaining work” statements below. Historical evidence remains valid for the exact SHA/run it names.

## 0. Current repository truth

- Current `main` HEAD: **`0d56dc1e6224283f371c6276492dabb9e4440557`**.
- The current HEAD is **65 commits ahead of `c34ad7b`**, the exact application SHA used for the completed R2 deployment/replay.
- There are **no open GitHub issues** in the repository at this reconciliation.
- `docs/productization-state.json` is stale relative to current `main`: its last reconciliation is 2026-09-28 and it still names `c34ad7b` as the R2 code-bearing tip. Treat that file as historical until the successor TL reconciles it against the live repository.
- Do **not** describe `0d56dc1` as the current production artifact merely because later work has deployment evidence for earlier SHAs. Current-production status must be established from the exact SHA being claimed.

## 1. Mission of the successor TL

Operate from repository state alone. Preserve the frozen architecture, harvest evidence, prevent semantic drift, maintain exact-SHA release hygiene, and create new governed work only when a concrete product requirement or evidence gap requires it.

The TL is simultaneously architect, reviewer, merge gate and orchestrator. Workers do not self-merge. The TL must independently reproduce material worker claims before acceptance.

## 2. What is complete

### Core implementation

- **AISE-001 … AISE-041: 41/41 finalized.**
- Core completion authority: `b9b031a85016ac50caba6cd66990707f7815b179`.

### Productization

- **PROD-001 … PROD-034: finalized.**
- Productization status: ready for the declared production baseline.
- PROD-015 readiness evidence remains valid for its own recorded SHA/deployment and must not be confused with later main history.

### Provider/technology evaluation

- **HFX-000, HFX-101, HFX-201, HFX-204, HFX-301, HFX-302, HFX-303, HFX-401: finalized.**
- Provider evaluation is evidence-driven and does not make an external provider canonical.

### Post-production hardening

The original R0/R1/R2 program is complete and was exact-SHA replay-proven at `c34ad7b`:
- deployed-check 7/7;
- W 24/24;
- M 22 PASS + 1 honest `BLOCKED_NO_KVM`;
- X 15/15;
- accessibility at the deployed replay: 0 critical / 0 serious.

Subsequent accepted follow-on work includes:
- POST-006-R1 accessibility remediation: serious findings reduced to **zero**; four remaining moderates are the explicitly held QA-005-B nested-main finding, which requires separate semantic governance rather than a silent accessibility-lane patch.
- POST-007: SiteTwin evidence card wired to the live evidence register.
- POST-008: `element_addition` target semantics hardened; existing-node IDs fail closed.
- POST-009: typed failure reasons surfaced end-to-end.
- POST-010: accessibility driven to zero critical/serious violations across the audited 9-surface set and both viewports.
- POST-011: Interactive Solution mobile fit and deep-route/anchor hardening.
- R3 production journey revalidation: canonical journey, adversarial checks, and layer alignment revalidated with live evidence at the then-deployed artifact.

### Reality materialization

- Capture → evidence registration → Reality materialization → SiteTwin pin crossing is closed and live-proven.
- No second reality authority was introduced.

### Voice notes

- **VOICE-001, VOICE-002, VOICE-003: implemented and accepted.**
- Web and Android voice capture use the governed evidence contract and one registration/sync identity path.
- Android station evidence is reproducible and explicitly classified.
- A **physical-device runtime-permission lane remains unexecuted**; do not upgrade emulator/E2B evidence into physical-device evidence.

### Geometry/BIM

- **GBIM-000 … GBIM-003: complete as exploratory technology evaluation.**
- Follow-through **GBIM-FT-001: complete.**
- Adaptation direction recorded: OCCT via OCP/CadQuery for exact geometry, IfcOpenShell + IFC4 for IFC/OpenBIM interoperability, Three.js + web-ifc for browser presentation.
- None of these is an AISE authority; all remain behind adapter/presentation boundaries.
- **GBIM-004 shared geometry contract is DEFINED but intentionally DEFERRED** until a concrete product requirement requires execution.
- No fork and no default-provider mandate was authorized.

### Spatial anchoring

- **ANCHOR-001:** deterministic synthetic spike complete; 10/10 anchors, 3.5 cm mean floor-registration RMSE, byte-identical deterministic output, negatives fail closed; ADAPT direction.
- **ANCHOR-002:** typed shared contract, handedness law, PARTIAL outcome, supervised runner, provider-registry evaluation gate complete.
- **ANCHOR-003a:** plan-context seam complete; 49 new tests; handedness round-trip proven; no anchoring execution added to the plan-context import lane.
- **ANCHOR-003b:** real-photoset production evaluation complete. **28/28 real stills refused; 0/28 anchored; zero fabricated hypotheses; 14/14 negatives fail closed.** Promotion remains **evaluation-kept**, with a typed license-blocked refusal recorded. This is an honest frontier result, not a failed implementation claim.
- Therefore **automatic images→plans spatial anchoring is still not promoted/default production capability**.

## 3. Frozen architecture — do not redesign

AISE remains one engineering-domain core with three capability layers and three client adapters:

```
LAYER 1 — REALITY
capture → spatial context → evidence → reconstruction → readiness

LAYER 2 — UNDERSTANDING
engineering question → Evidence Envelope → reasoning → deterministic checks → action

LAYER 3 — SOLUTION
problem → EngineeringOperation → proposed state → validation → solution BOQ

                    ONE DOMAIN CORE
                 /        |        \\
             BROWSER    MOBILE    DESKTOP
             ADAPTER    ADAPTER   ADAPTER
```

Canonical authorities:
- Reality Graph — canonical engineering-model authority;
- Evidence Graph — provenance authority;
- Assurance Engine — task-readiness authority;
- Verification Engine — deterministic verification authority;
- BOQ Graph — domain representation, never a second reality authority;
- Solution Graph — proposed solution operation/state history authority.

Clients, renderers, LLMs, agents and external providers are not authorities.

## 4. Non-negotiable truth rules

- Raw field evidence is immutable.
- Derived models are versioned.
- OBSERVED, INFERRED, CONFIRMED and PROPOSED remain distinct.
- UNKNOWN / NOT_OBSERVED / OCCLUDED never imply absence.
- Confidence is not measurement uncertainty.
- Estimates cannot silently become measurements.
- Proposed state cannot mutate observed reality.
- Executed outcomes become observed only through new evidence and the existing assurance/verification process.
- Unsupported means refusal, not fabricated output.

## 5. Interactive solution contract

The canonical solution flow is:

```
CURRENT REALITY
→ ENGINEERING PROBLEM / INTENT
→ INTERACTIVE SOLUTION
→ DIRECT MANIPULATION OR AGENT COMMAND
→ TYPED EngineeringOperation
→ PROPOSED STATE
→ VALIDATE
→ SOLUTION BOQ
→ BOQ LINE ↔ OPERATION ↔ GEOMETRY
→ REVIEW / REVISE
```

Direct manipulation and natural-language authoring must resolve to identical operation semantics where they express the same intent.

Agents may interpret intent, request clarification, explain, navigate, and invoke bounded deterministic tools. Agents may not invent measurements/materials/evidence, write authoritative geometry directly, bypass validation, declare readiness/approval, or mutate observed reality.

## 6. Technology substitution law

Read and enforce `spec/technology-substitution-contract.md` before introducing or promoting any provider.

A substitution must preserve domain semantics, authority boundaries, epistemic state, provenance, uncertainty, assurance thresholds, verification behavior, client contracts and historical interpretability.

Required evidence includes contract conformance, semantic equivalence, negatives/discrimination, provenance continuity, explicit unsupported/failure behavior, dependent regression, compatibility/rollback when warranted, and licensing/use clearance.

Never turn a spike result, demo, provider identity, or visual output into an architectural authority.

## 7. Immediate TL actions

### Action A — reconcile current main

Treat **`0d56dc1`** as the current codebase. Read the current handoff, machine state, architecture lock, productization state, follow-on scorecards, and latest evidence trees. Recompute what is actually covered by production evidence.

Do not assume the R2 `c34ad7b` replay covers later code-bearing commits.

### Action B — restore release hygiene

Determine the exact currently deployed production SHA. If `0d56dc1` (or a newer main) is intended to become current production, deploy that exact SHA and run the repository's required deployed replay against that exact deployment.

At minimum, preserve the established W/M/X, deployed-check, runtime-error, accessibility, provenance, cross-adapter, source-BOQ/solution-BOQ and outcome-continuity evidence appropriate to the affected surfaces.

The declaration must name:
- exact Git SHA;
- exact Vercel deployment ID/URL;
- environment/config fingerprint as appropriate;
- exact test/replay counts;
- honest environmental blocks.

A later main SHA is never covered by an earlier deployment record.

### Action C — reconcile machine state

After release evidence is established, update `docs/productization-state.json` (and any linked roadmap/state docs) so the repository no longer presents 2026-09-28 `c34ad7b` as the latest code-bearing reality.

Preserve historical records; add a new dated reconciliation rather than rewriting history.

### Action D — do not invent successor work

There are currently no open GitHub issues. Do not manufacture a new roadmap just because the original roadmap is green.

Create a new governed Work Item only when there is a specific product requirement, an evidence-backed defect, a required physical-device validation, or a clearly bounded technology/policy question.

The current evidence frontiers are:
1. latest-main deployment/replay reconciliation;
2. physical Android device permission/runtime validation;
3. automatic spatial anchoring promotion remains unproven and should stay evaluation-kept;
4. GBIM-004 remains deferred until required by product scope.

## 8. Concurrency protocol for future work

Use at most 3 concurrent workers only when their protected surfaces can be made independent.

Each worker must declare:
- Work Item ID;
- exact base SHA;
- protected paths/surfaces;
- implementation or experiment scope;
- acceptance criteria;
- negative cases;
- expected evidence;
- out-of-scope items.

Workers never self-merge. The TL harvests, reproduces, checks protected surfaces, runs targeted/full verification, reviews composition, merges, and refreshes state.

Every accepted worker package must include exact SHAs, commands, tests/results, provenance, failure/unsupported cases, security/tenant considerations, licensing/use status, limitations, and successor handoff; raise an ACR when architecture changes.

## 9. Acceptance discipline

Never accept:
- documentation-only claims as runtime evidence;
- emulator evidence as physical-device evidence;
- confidence as measurement uncertainty;
- provider IDs as canonical identities;
- visual similarity as engineering equivalence;
- unsupported cases silently converted into estimates or guesses;
- a current-production claim without exact-SHA deployment evidence;
- a new cross-layer semantic change hidden inside a narrower worker lane.

When a defect crosses a protected semantic boundary, stop and create a governed shared Work Item rather than patching around the boundary.

## 10. First deliverable from the successor TL

The first TL checkpoint should be a repository-grounded reconciliation stating:

```
CURRENT MAIN SHA
        ↓
CURRENT DEPLOYED SHA
        ↓
EXACT-SHA EVIDENCE COVERAGE
        ↓
PRODUCTION / NON-PRODUCTION DELTA
        ↓
OPEN EVIDENCE FRONTIERS
        ↓
AUTHORIZED NEXT WORK (if any)
```

Do not report “complete” merely because the historical roadmap is green. Report the exact state of the repository, the exact state of production, and the exact remaining evidence frontier.

**This document is the takeover contract. Start from the repository, not from prior chat.**

---

# AISE — Final Tech Lead / Architect Handoff

Status: CURRENT / DURABLE / SELF-CONTAINED  
Audit date: 2026-09-28  
Repository: payswapdotorg/AISE  
Audience: successor AISE Tech Lead / Architect with up to 3 concurrent workers  
Source of truth: repository state; this document is authoritative for orchestration only.
## 0. 2026-09-28 reconciliation override

### 0.a R2 completion addendum — 2026-09-28T23:2xZ (supersedes the R2-pending statements below)

The remaining governed evidence frontier is CLOSED. The successor Tech Lead's
R2 exact-SHA W/M/X replay and reconciliation is complete and recorded:

- **QA-004 (`e93a052`), QA-005 (`2cc1bba`), QA-006 (`28c2631`), QA-007
  (`c34ad7b`) are accepted on main** (post-production corrective closure; the
  state files now carry them).
- **The code-bearing application tip is `c34ad7b`** (QA-007 acceptance — the
  D9 definition-list/dlitem accessibility defect the R2 replay FOUND at
  `28c2631`'s live deployment, governed and fixed; worker `815bff67`,
  Lead-verified: typecheck/lint PASS, suite 6175/0/405, boundaries 1067).
- **`c34ad7b` is deployed exactly**: Vercel `dpl_3Y7qBgNcjWuyGf9CfbcEBZoydnym`
  (project `aise`, target production, READY), production alias
  **https://aise-tan.vercel.app**. (The `28c2631` push at 08:19Z had been
  Vercel rate-limited — the team quota window — which is why production
  briefly remained at `2cc1bba`.)
- **Freshly replay-proven at that exact deployment**: deployed-check
  **7/7 PASS** (41/41 assertions; accessibility `critical=0 serious=0` both
  viewports) + **W 24/24 PASS** + **M 22 PASS / 1 BLOCKED_NO_KVM (recorded)**
  + **X 15/15 PASS**. Evidence: `docs/productization-evidence/R2-2026-09-28/`
  (incl. the two deterministic FAIL logs that documented the D9 finding, the
  deployed environment fingerprint, and the honest environmental notes — the
  bun-tsc OOM ceiling on the recording sandbox with the node-runtime
  per-step gate evidence).
- The R2 harness commit `d80f2b3` (tools-only: the pass-17 settle cure for
  the journey legs' Enter-demo click + the W2 leg's bounded retry) and the
  docs/state reconciliation commits that follow are **build-inert** relative
  to the deployed artifact (tools/journey + tools/deployed + docs only).
- The current deployment may now be described as **current and freshly
  replay-proven at `c34ad7b`**. If main advances with further code-bearing
  commits, release hygiene re-asserts: deploy the new exact SHA and refresh
  the replay evidence before calling it current.
- Known residual state is unchanged: POST-006's accessibility ledger (0
  critical / 23 serious / 44 moderate — remediation beyond QA-007's D9 fix
  needs separate governance); the M emulator lane's BLOCKED_NO_KVM; no open
  successor WOs known at reconciliation time.

### 0.b Prior reconciliation (2026-09-28T06:47Z — historical, superseded where it conflicts)

This section supersedes any older “current” or “immediate priority” statements below that conflict with the repository. Always resolve the live main HEAD first; the SHA below is the last reconciled code-bearing application tip, followed only by documentation/state reconciliation commits.

- Resolved code-bearing application tip: 2de6670366a15c55a970139c32be43413c200849 (2026-09-27).
- Core AISE v2 implementation: 41/41 Work Items finalized.
- Productization: PROD-001…PROD-034 finalized; PROD-015 remains the governing product-readiness declaration.
- HFX provider/technology evaluation: HFX-000, HFX-101, HFX-201, HFX-204, HFX-301, HFX-302, HFX-303, HFX-401 finalized.
- Track R / post-production hardening: #14 POST-000 and #15–#20 all closed/completed.
- Track G / Geometry-BIM R&D: #10 GBIM-000 and #11–#13 all closed/completed. Results are exploratory evidence and produced ADAPT outcomes; no fork and no default-provider selection is authorized.
- Post-R1 QA closure fixes now present on main: QA-001, QA-002, QA-003. The latest accepted QA-003 commit is 0b3595c04311888642d35454a4e3bcd124184de9; it reported typecheck PASS, lint PASS and 6113/0 tests with 399 files. HEAD 2de6670366a15c55a970139c32be43413c200849 adds one deployment-trigger commit after that acceptance; the compare is one commit with no file changes.
- Current HEAD has a GitHub Vercel commit status of success / Deployment has completed (2026-09-27 18:10Z). This establishes deployment completion for the exact SHA but is not a substitute for a fresh repository-recorded W/M/X replay against that exact SHA.
- Current frontier: the remaining governed evidence task is the Tech-Lead-only R2 exact-SHA W/M/X replay and reconciliation. Until that replay is recorded, describe the current SHA as deployed, not as freshly replay-proven.
- POST-006 remains closed. Its live accessibility ledger records 0 critical, 23 serious, 44 moderate findings; these are known findings, not evidence that the acceptance work item failed. Any remediation beyond the accepted scope must be separately governed.
- spec/development-state/program-state.json remains the authoritative ledger for the original 41-item core campaign; its 2026-09-15 asOf is historical by design. Post-production/HFX/QA current truth is carried by the handoff and productization evidence/state until a broader machine-state schema change is explicitly governed.
- QA-001…003 are post-production corrective commits rather than reopened AISE-001…041 work items.


## 1. Mission

You are the successor Tech Lead, Architect, reviewer, merge gate and orchestration authority for AISE.

Operate from repository state alone. Do not depend on prior chat history, worker memory, or undocumented assumptions.

Your job is to:
1. preserve the frozen AISE architecture;
2. complete post-production discoverability/device hardening;
3. independently maintain exact-SHA deployment/evidence hygiene;
4. execute the authorized Geometry/BIM technology spike;
5. harvest and independently reproduce worker evidence;
6. merge only accepted work;
7. keep roadmap, machine state and handoff synchronized;
8. never promote an external technology or fork merely because it performs well in a demo.

## 2. Current truth

### Implementation

- Historical AISE v2 implementation campaign: 41/41 Work Items finalized.
- Core completion authority: b9b031a85016ac50caba6cd66990707f7815b179.

### Productization

- PROD-001 … PROD-034: finalized.
- PROD-015: finalized.
- HFX-000, HFX-101, HFX-201, HFX-204, HFX-301, HFX-302, HFX-303, HFX-401: finalized.
- docs/productization-state.json: productization.status = ready.
- Declared public URL: https://aise-tan.vercel.app.
- Declared PROD-015 deployment: dpl_9G5gsVbGzpbWGBewyQUE4QhgadFY.
- Declared PROD-015 deployment SHA: 91f1b449d6ea5cafd6a4e58e8533fea8d24ed5b7.

### Release freshness

The PROD-015 declaration is valid for its exact recorded final SHA.

Main has advanced after that declaration because additional post-readiness documentation and R&D have been committed. Therefore:

DO NOT describe the current main tip as the currently deployed production artifact until the exact current SHA has been deployed and the required deployed replay has been rerun.

Resolve the live default-branch HEAD before every release decision. Do not hard-code a current HEAD into this handoff.

### Current post-readiness tracks

There are two authorized follow-on tracks.

Track R — Post-production hardening

Authority: docs/post-production-discoverability-and-device-validation-plan-2026-09-25.md

Orchestration:
- Parent issue #14 — POST-000
- Wave R0: #15 POST-001 release state + current deployment replay; #16 POST-002 Android physical-device validation; #17 POST-003 browser/combined journey verification.
- Wave R1: #18 POST-004 navigation/interaction hardening; #19 POST-005 cross-device + BOQ continuity; #20 POST-006 acceptance/accessibility verification.
- Wave R2: Tech Lead-only final W/M/X replay and exact-SHA reconciliation.

Track G — Geometry/BIM technology R&D

Authority:
- docs/geometry-bim-technology-spike-2026-09-25.md
- docs/geometry-bim-spike-work-orders-2026-09-25.md
- docs/geometry-bim-spike-scorecard-2026-09-25.md
- docs/productization-evidence/GBIM-000/canonical-fixture.json

Orchestration:
- Parent issue #10 — GBIM-000
- G0: #11 GBIM-001 exact geometry kernel; #12 GBIM-002 IFC/OpenBIM; #13 GBIM-003 browser spatial UX + Atelier proof.

Track G is exploratory evidence collection. It is not a readiness gate, provider-selection mandate, or external-platform fork authorization.

## 3. Frozen architecture

AISE is one engineering-domain core with three capability layers and three platform adapters:

~~~text
LAYER 1 — REALITY
capture → spatial context → evidence → reconstruction → readiness

LAYER 2 — UNDERSTANDING
engineering question → Evidence Envelope → reasoning → deterministic checks → action

LAYER 3 — SOLUTION
problem → EngineeringOperation → proposed state → validation → solution BOQ

                    ONE DOMAIN CORE
                          │
         ┌────────────────┼────────────────┐
         ↓                ↓                ↓
      BROWSER           MOBILE          DESKTOP
      ADAPTER           ADAPTER         ADAPTER
~~~

Canonical authorities:
- Reality Graph — only canonical engineering-model authority.
- Evidence Graph — only provenance authority.
- Assurance Engine — only task-readiness authority.
- Verification Engine — only deterministic verification authority.
- BOQ Graph — domain representation, not a second reality authority.
- Solution Graph — canonical only for proposed solution operation/state history.
- Clients, renderers, LLMs, agents and external providers are not authorities.

### Immutable truth rules

- Raw field evidence is immutable.
- Derived models are versioned.
- OBSERVED, INFERRED, CONFIRMED and PROPOSED remain distinct.
- UNKNOWN, NOT_OBSERVED and OCCLUDED never imply absence.
- Confidence is not measurement uncertainty.
- Estimates cannot silently become measurements.
- Proposed solution/intervention state cannot mutate observed reality.
- Executed outcome becomes observed only through new evidence and the existing assurance/verification process.

## 4. Technology substitution law

Read and obey: spec/technology-substitution-contract.md.

All Layer-1, Layer-2 and Layer-3 technologies are replaceable behind stable AISE ports.

A technology substitution must preserve:
- domain semantics;
- authority boundaries;
- epistemic state;
- provenance;
- uncertainty semantics;
- assurance thresholds;
- verification behavior;
- client contracts;
- historical interpretability.

Required evidence includes:
1. contract conformance;
2. semantic equivalence;
3. negative/discrimination testing;
4. provenance continuity;
5. explicit failure/unsupported behavior;
6. dependent-layer regression;
7. compatibility/rollback when migration risk warrants it;
8. licensing/use clearance.

Unsupported means refusal, not fabricated output.

## 5. Interactive engineering solution rules

The interactive solution workflow is:

~~~text
CURRENT REALITY
→ ENGINEERING PROBLEM / INTENT
→ INTERACTIVE SOLUTION
→ DIRECT MANIPULATION OR AGENT COMMAND
→ TYPED EngineeringOperation
→ PROPOSED STATE
→ VALIDATE
→ SOLUTION BOQ
→ BOQ LINE ↔ OPERATION ↔ GEOMETRY
→ REVIEW / REVISE
~~~

Direct manipulation and natural-language authoring must resolve to the same operation semantics.

Agents may interpret intent, request clarification, explain effects, navigate and invoke bounded deterministic tools.

Agents may not invent measurements/materials/evidence, write authoritative geometry directly, bypass validation, declare engineering readiness or approval, or mutate observed reality.

Phase 1 is buildings only, but the operation contract must remain extensible.

## 6. Product baseline

The current product already contains:
- task-first browser flows;
- capture/upload;
- BOQ import;
- Engineering Case;
- Evidence Envelope / Why this result?;
- Intervention Studio;
- Interactive Solution workspace;
- Outcomes;
- Android field application;
- desktop adapter;
- incumbent/contextual integrations;
- provider-evaluation control plane.

The intended canonical journey is:

~~~text
PROJECT
→ EVIDENCE / BOQ
→ UNDERSTAND
→ CASE
→ BUILD SOLUTION
→ VALIDATE
→ BOQ
→ EXECUTE
→ POST-WORK EVIDENCE
→ OUTCOME
~~~

## 7. Remaining user-facing hardening

The post-production plan exists because the product is functionally broad but several transitions can still be made more obvious:
- task-first vocabulary should replace implementation/demo terminology in primary navigation;
- Build Solution should expose the interactive path directly;
- Plan → Validate → Approve → Execute → Compare should be visibly staged;
- specialist diagnostics should be progressively disclosed;
- web-originated field work should hand off explicitly to Android;
- missing-evidence declarations should create case-specific capture tasks;
- BOQ Lens should provide explicit source import/revision selection;
- post-work capture should return cleanly to the web outcome loop;
- contextual integrations should surface one clear next action or honest unavailable/not-configured state.

Do not improve these by weakening engineering semantics.

## 8. Track R execution protocol

### Wave R0 — establish fresh baseline

Dispatch exactly three workers:

#15 POST-001
- reconcile current machine-state facts;
- resolve current main HEAD;
- deploy that exact SHA;
- run deployed-check;
- capture environment/configuration fingerprint;
- explicitly separate declaration SHA from current deployed SHA.

#16 POST-002
- execute the physical Android lane where hardware is available;
- install/launch;
- permissions;
- still/video capture;
- sensor metadata;
- pause/resume;
- process restart;
- sync;
- post-work capture;
- classify evidence as physical, emulated, synthetic or deterministic;
- never upgrade emulator evidence into physical evidence.

#17 POST-003
- independently run bun run verify;
- typecheck;
- lint;
- build;
- live Chromium;
- W/M/X;
- console/runtime checks;
- route coverage;
- secret leakage checks;
- verify current deployment behavior.

Workers must not self-merge.

### Wave R1 — harden UX/cross-device continuity

Only after R0 is harvested and accepted:
- #18 POST-004 → primary navigation and staged solution UX;
- #19 POST-005 → web/mobile handoff, BOQ revision selection and capture continuity;
- #20 POST-006 → acceptance, accessibility and regression coverage.

Protected surfaces must remain separated. A shared semantic defect becomes a new governed SHARED Work Item rather than a cross-worker patch.

### Wave R2 — Tech Lead final proof

After R1 merge:
- redeploy the exact current main SHA;
- run W/M/X against that exact deployment;
- prove cross-adapter identity and provenance continuity;
- rerun direct/NL equivalence;
- prove source BOQ vs solution BOQ separation;
- prove outcome continuity;
- update evidence and machine state;
- only then describe the current deployment as current.

## 9. Track G execution protocol

### Wave G0 — exactly three workers

#11 GBIM-001 — Exact geometry

Evaluate OCCT, CadQuery/OCP and FreeCAD. Use the shared fixture and compare deterministic geometry, quantities, topology validity, invalid operations, unsupported operations and provenance.

Primary question: Can AISE gain a precise replaceable geometry kernel without making that kernel the AISE authority?

#12 GBIM-002 — BIM/OpenBIM

Evaluate IFC, IfcOpenShell, Bonsai and Blender. Test semantic mapping, import/export, geometry extraction, units, openings, object relationships, quantities, round-trip loss and malformed/unsupported data.

Primary question: Can IFC/OpenBIM become the interoperability projection while AISE remains the canonical engineering authority?

#13 GBIM-003 — Browser spatial UX + Atelier

Evaluate Three.js, That Open and web-ifc. Prototype Atelier-derived component library, templates, click-to-place, live engineering consequence HUD, synchronized 2D/3D, staged workflow and report/export entry point.

Do not copy Atelier's hard-coded fire-compliance shortcut, pricing assumptions, room dimensions, autosave semantics, random identities or visualization-only PDF semantics.

Primary question: Can AISE gain a much more intuitive spatial authoring surface while every engineering consequence still comes from canonical AISE operations, quantities and verification?

## 10. Shared Geometry/BIM fixture

Canonical fixture: docs/productization-evidence/GBIM-000/canonical-fixture.json.

It contains:
- 8 m × 6 m × 3 m room;
- 200 mm wall;
- door opening;
- window opening;
- column;
- slab;
- footing;
- beam;
- partition;
- roof;
- ten representative operations;
- expected invariants;
- negative/discrimination cases.

All GBIM workers must consume the same fixture.

## 11. Geometry/BIM acceptance gate

Use: docs/geometry-bim-spike-scorecard-2026-09-25.md.

Evidence must cover, where supported:
- operation identity;
- normalized units/parameters;
- bounding box;
- surface area;
- volume;
- topology validity;
- object relationships;
- quantities;
- validation status;
- failure/unsupported status;
- provider identity/version;
- configuration/input digest;
- reproducibility;
- performance/resource observations;
- licensing/use posture.

The scorecard is a gate, not a ranking.

Allowed outcomes: PROVEN, PARTIAL, DIVERGENT, REFUSED, DEFERRED.

## 12. Fork policy

### Blender

Do not fork.

A fork may only be considered after evidence proves all of:
1. a required AISE capability cannot be delivered via adapter/add-on/API;
2. the limitation materially affects a product requirement;
3. the capability cannot reasonably live in AISE or another open component;
4. fork maintenance/licensing cost is justified.

### Bonsai

Evaluate as an adapter. Do not fork until the same four conditions are evidenced.

### FreeCAD

Use as a CAD/parametric worker or desktop integration option, not canonical AISE state.

### OpenSCAD

Use as a scripted component-generation option, not BIM/reality/solution authority.

A spike success never implies a fork or a default provider.

## 13. Required worker completion package

Every worker must return:
- Work Item ID;
- exact base SHA;
- exact head SHA;
- protected surfaces;
- implementation/evaluation summary;
- commands executed;
- tests and exact results;
- benchmark results;
- physical evidence, if applicable;
- provenance evidence;
- failure/unsupported cases;
- security/tenant considerations;
- licensing/use status;
- limitations;
- out-of-scope items;
- successor handoff;
- Architecture Change Record, if raised.

No worker narrative is accepted without independently reproducible evidence.

## 14. Merge / governance loop

~~~text
READ CURRENT HEAD
→ READ MACHINE STATE
→ READ GOVERNING PLAN
→ RECOMPUTE ELIGIBILITY
→ DISPATCH ≤3
→ HARVEST
→ CHECK PROTECTED SURFACES
→ INDEPENDENTLY REPRODUCE
→ RUN TARGETED + FULL VERIFICATION
→ REVIEW COMPOSITION
→ MERGE
→ REFRESH STATE / ROADMAP / HANDOFF
→ DEPLOY EXACT SHA WHEN REQUIRED
→ REPLAY AFFECTED JOURNEYS
~~~

Never accept:
- documentation-only claims as runtime evidence;
- emulator results as physical-device evidence;
- provider visuals as engineering equivalence;
- confidence as measurement uncertainty;
- one provider's IDs as canonical identity;
- a later main SHA as covered by older deployment evidence.

## 15. External verification limits

Repository-local evidence cannot prove:
- real Upstash multi-instance behavior without live credentials/instances;
- current third-party plan/allowance or cost behavior;
- current public-browser behavior without live deployment replay;
- physical Android sensor/camera behavior without physical hardware;
- packaged desktop launch on every supported OS;
- real building benchmark performance without representative physical evidence.

Classify these honestly.

## 16. Mandatory reading for a fresh Tech Lead

Read in this order:

~~~text
README.md
AGENTS.md
spec/architecture-lock.md
spec/architecture.md
spec/client-adapter-contract.md
spec/technology-substitution-contract.md
spec/requirements.md
spec/domain-model.md
spec/agent-ownership.md
spec/work-items.md
spec/work-orders.md
spec/dependency-graph.md
spec/development-roadmap.md
spec/development-protocol.md
spec/assurance.md
spec/development-state/program-state.json

docs/productization-state.json
docs/productization-roadmap.md
docs/productization-work-orders.md
docs/productization-layer-hardening-work-orders.md
docs/PRODUCTION-READINESS-GATE.md
docs/free-tier-deployment.md
docs/INSTALL.md
docs/DEPLOYMENT.md
docs/product-journey-simulation.md
docs/interactive-engineering-solution-workflow.md
docs/layered-competitive-stress-test-2026-09-16.md
docs/post-production-discoverability-and-device-validation-plan-2026-09-25.md
docs/geometry-bim-technology-spike-2026-09-25.md
docs/geometry-bim-spike-work-orders-2026-09-25.md
docs/geometry-bim-spike-scorecard-2026-09-25.md
docs/productization-evidence/GBIM-000/canonical-fixture.json
~~~

Then read the exact Work Order and issue assigned to each worker.

Inspect ACR-004, ACR-005 and ACR-006 for any task touching their governed surfaces.

## 17. Current handoff invariants

- One core.
- Three capability layers.
- Three platform adapters.
- No second authority.
- No silent assurance downgrade.
- No fabricated evidence.
- No provider-specific canonical semantics.
- No ungoverned architecture change.
- No self-approval or self-merge by workers.
- Maximum three concurrent workers.
- Exact-SHA release evidence only.
- Product-ready declaration remains owned by PROD-015.
- Post-production hardening does not reopen finalized readiness work.
- Geometry/BIM R&D produces evidence; it does not automatically produce adoption.

## 18. Successor stop condition

Stop implementation and raise an Architecture Change Record when a proposed change would:
- create a second canonical engineering model;
- move provenance/readiness/verification authority into a provider or client;
- change epistemic semantics;
- change assurance thresholds;
- make a renderer/editor authoritative;
- require provider-specific semantics to cross the domain boundary;
- require an external-platform fork without satisfying the fork policy;
- make historical AISE records uninterpretable;
- create a parallel service contract instead of an adapter over the shared core.

## Final operating instruction

A fresh Tech Lead should be able to start with no chat context and know exactly what is true, what is active, what is allowed, what must be verified, and which three workers can be dispatched next.

As of the 2026-09-28 R2-completion reconciliation (§0.a):
- AISE-001…041 are finalized.
- PROD-001…034 and the listed HFX program are finalized.
- Track R (#14–#20) and Track G (#10–#13) are closed.
- QA-001…QA-007 are accepted on main (QA-007 closed the D9 definition-list defect the R2 replay found at 28c2631's live deployment).
- The code-bearing application tip is c34ad7b, deployed exactly (dpl_3Y7qBgNcjWuyGf9CfbcEBZoydnym → https://aise-tan.vercel.app) and freshly replay-proven at that exact deployment (deployed-check 7/7; W 24/24; M 22 PASS + 1 BLOCKED_NO_KVM recorded; X 15/15 — evidence docs/productization-evidence/R2-2026-09-28/).
- R2 is COMPLETE — no evidence frontier remains open. The next work is whatever the operator governs next; until then, hold the frozen state.
- Do not reopen finalized work merely for polish. Known POST-006 accessibility findings require separate governance if remediated.
- Do not infer completion from prose; resolve repository state and independently reproduce evidence at each merge/release decision.

