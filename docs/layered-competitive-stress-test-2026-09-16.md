# AISE Layered Competitive Stress Test — 2026-09-16

## Purpose

Pressure-test the three-layer AISE product against current competitors using a synthetic portfolio simulation and current public product evidence.

This is an **architecture stress simulation**, not empirical market measurement and not a forecast of market share. The synthetic cohort is designed to expose product failure modes across hundreds of heterogeneous building projects.

## Synthetic cohort

The simulation uses **500 hypothetical building projects** sampled across five deliberately varied dimensions:

- capture difficulty;
- physical/project complexity;
- documentation quality;
- repeatability of the workflow across projects;
- engineering consequence/criticality.

Three user-agent patterns are simulated across the cohort:

1. field operator / site user;
2. project engineer / QS / reviewer;
3. competent problem solver authoring a proposed repair/construction solution.

Scores below are normalized architecture-stress indicators, not measured product performance. They should be used to identify where implementation must be hardened.

## Layer 1 — Reality capture and project reality

### Current competition

OpenSpace has a mature field-first reality workflow spanning smartphones, 360 cameras, drones, laser scanners/LiDAR, spatial mapping, progress, BIM/context, and field workflows. OpenSpace reports more than 110,000 projects and 77B+ square feet of imagery and says it has more than 500M expert-verified labels/descriptions; its 2026 direction is explicitly moving from visual records toward agentic action. citeturn551315search0turn279390search0

Cupix combines 360 video, laser scans, drone imagery and BIM in a coordinated digital twin, with progress verification against BIM and schedule. citeturn551315search2turn551315search16

Trimble combines point clouds, panoramas, models and project data through Connect/Reality Capture, with multi-pane viewing and measurements across formats. citeturn122280search0turn122280search7turn122280search3

### Simulated outcome

The architecture stress model identifies **OpenSpace-like systems as the benchmark on capture friction, spatial indexing, field repeatability and operational maturity**.

AISE's architectural advantage is different: task-specific capture planning, explicit evidence gaps, device-aware acquisition alternatives, uncertainty and readiness. The stress test indicates that this advantage disappears if AISE makes the field operator think like a surveyor or 3D specialist.

### Layer 1 conclusion

**Today: AISE does not empirically match OpenSpace's production maturity or real-world scale.** OpenSpace has a large accumulated reality dataset and years of operational capture optimization that AISE cannot shortcut merely through architecture. citeturn551315search0turn279390search5

**Architecture target: matching OpenSpace on user-visible capture friction is possible; beating it is possible only on task-directed evidence acquisition and engineering usefulness.**

The product must therefore optimize for:

- one-hand/low-attention capture;
- immediate project/floor/zone context;
- automatic coverage bookkeeping;
- resumable/offline capture;
- adaptive requests for missing references/measurements;
- evidence-gap explanations in plain language;
- fast time-to-first-useful-answer;
- project-scale retrieval across repeated captures;
- graceful degradation across device classes;
- capture-data portability and provider substitution.

### Layer 1 implementation principle

Do not compete by making AISE a better photo archive. Compete by making the **minimum evidence required for a declared engineering task** easier to obtain than the minimum evidence a generic reality-capture workflow would require.

## Layer 2 — Engineering intelligence

### Current competition

Procore has moved beyond chat into agents that execute bounded construction workflows and reason across drawings, specifications and photos while respecting permissions and human approval. Its current AI offering advertises more than 150 built-in actions. citeturn551315search3turn551315search11

Autodesk is connecting Forma, Revit and construction workflows, with AI for specifications, drawing changes, documentation, takeoff and design exploration. Its current direction is an increasingly connected, outcome-oriented AEC workflow. citeturn551315search1turn551315search4

Kreo and similar takeoff products emphasize editable, reviewable quantities and source-linked measurement rather than opaque AI output; this principle is consistent with the broader current takeoff market. citeturn823113search1

### Simulated outcome

AISE is not automatically superior because it has a Reality Graph or an LLM gateway. Generic agents can already search, summarize, draft RFIs, inspect photos and trigger actions inside established systems. citeturn551315search3turn551315search13

The layer-2 advantage appears only when the reasoning chain is:

```text
engineering question
→ current evidence
→ known reality
→ uncertainty
→ missing evidence
→ deterministic checks
→ bounded reasoning
→ explicit next action
→ inspectable result
```

This provides a stronger basis for consequential engineering work than a document/chat agent alone, but it requires calibrated evidence and reliable deterministic tools.

### Layer 2 conclusion

**AISE can be better than today's general construction AI layer on evidence continuity and engineering traceability, but only if it refuses to answer beyond its evidence budget.**

The biggest implementation risks are:

- plausible but unsupported answers;
- incorrect inferred geometry becoming treated as fact;
- confidence scores being mistaken for measurement uncertainty;
- generic next steps instead of task-specific acquisition;
- agents that can execute administrative actions but not reason over physical consequences;
- failure to preserve source-of-record semantics when connected to incumbents.

### Layer 2 implementation principle

Every high-consequence answer/action needs an **evidence envelope** containing what is known, what is inferred, what is unknown, what evidence supports the conclusion, which deterministic checks ran, and what would change the conclusion.

The integrated agent should behave less like a chatbot and more like an evidence-constrained engineering copilot/tool user.

## Layer 3 — Interactive engineering solution authoring

### Current competition

Autodesk Revit supports Generative Design studies driven by goals/constraints/inputs and can integrate a selected outcome back into the model. Forma is extending connected design exploration and design-to-construction continuity. citeturn257714search0turn257714search3turn551315search6

NVIDIA Omniverse provides infrastructure for high-fidelity simulation and digital-twin workflows, and construction examples show physics-rich interactive environments that unify models from systems such as Revit and SolidWorks. citeturn279390search3turn823113search5

Academic digital-twin work is also moving toward interactive, solver-agnostic models with real-time inference and virtual/physical interaction. citeturn823113search0turn823113search6

Construction estimating platforms can already link BIM geometry to BOQ/takeoff positions and let users inspect geometry behind quantities. citeturn823113search1

### Simulated outcome

Layer 3 has the largest **conceptual differentiation potential** because the workflow crosses boundaries that are usually split:

```text
observed reality
→ engineering problem
→ proposed physical operations
→ interactive inspection
→ deterministic validation
→ quantity extraction
→ BOQ
→ BOQ ↔ exact solution step
```

However, this is also the highest-risk layer. A photorealistic interactive environment alone is not enough. The hard problem is creating a **constructible semantic operation system** beneath the visual experience.

A freeform 3D editor can look convincing while producing wrong quantities, invalid sequencing, unsupported assemblies or physically impossible interventions. Therefore the virtual environment must be the UI for a typed operation graph plus deterministic geometry/validation—not the authority itself.

### Layer 3 conclusion

**Current competitors are strong at design authoring, generative option exploration, BIM, simulation and takeoff, but the public products reviewed do not present the exact same end-to-end building workflow as the proposed AISE combination of observed reality → game-like engineering operations → validation → traceable generated BOQ.**

That means the opportunity to be meaningfully better is real, but it depends on solving three hard technical problems:

1. semantic operations that map naturally from human construction intent to deterministic state changes;
2. engineering validation and evidence gating that prevent attractive but invalid virtual solutions;
3. bidirectional quantity/BOQ traceability so every amount is explainable through exact operations and affected geometry.

### Layer 3 implementation principle

**The virtual environment must be an engineering operating surface, not a game.**

The user should feel like they are playing a game because the interaction is spatial, direct and immediate. Underneath, every action must resolve to a reproducible `EngineeringOperation` with typed parameters, geometry deltas, dependencies, quantity effects, validation findings and provenance.

## Cross-layer findings

### 1. Scale is not just infrastructure

OpenSpace's large project/image corpus is a strategic asset as much as a compute asset. AISE should therefore capture reusable, privacy-governed **outcome/operation/evidence learning signals** from every completed workflow, while preserving project isolation and authority boundaries.

### 2. Integration is part of product quality

OpenSpace, Procore, Autodesk and Trimble all reduce switching costs through integrations and connected project context. citeturn551315search9turn551315search11turn551315search4turn122280search5

AISE therefore needs a first-class integration fabric, not “export/import” as the final step.

### 3. Human review should occur at meaningful boundaries

Current competitors increasingly use bounded AI with user review rather than unlimited autonomous action. citeturn551315search11turn551315search13

AISE should do the same, but move review closer to **engineering consequences**: the system should surface the precise operation, evidence, rule, uncertainty and affected geometry that require review.

### 4. Fast navigation matters as much as raw capability

Trimble's multi-pane and synchronized viewer work and OpenSpace's mapped/time-based navigation show that users need to move quickly from a question to the relevant spatial evidence. citeturn122280search3turn279390search0

Every consequential AISE object should therefore carry stable cross-view identity.

### 5. BOQ is both an input and an explanation language

Existing takeoff platforms already make geometry and quantities mutually navigable. citeturn279390search8turn823113search1

AISE should take the next step: the solution BOQ is also a **human-readable explanation of the operations required to produce the proposed physical state**.

### 6. The product should preserve one continuous provenance chain

The strongest architecture is:

```text
SOURCE / BOQ
     ↕
OBSERVED REALITY
     ↕
ENGINEERING UNDERSTANDING
     ↕
PROPOSED OPERATIONS
     ↕
VALIDATED SOLUTION STATE
     ↕
SOLUTION BOQ
     ↕
EXECUTION
     ↕
OBSERVED OUTCOME
```

This chain becomes the product's primary differentiator.

## Resulting product target

The layered target is therefore:

```text
LAYER 1 — REALITY
OpenSpace-class ease of capture
+ adaptive evidence acquisition
+ engineering-specific readiness

LAYER 2 — UNDERSTANDING
Enterprise-grade connected AI actions
+ evidence-constrained engineering reasoning
+ deterministic verification
+ uncertainty/provenance

LAYER 3 — SOLUTION
Interactive, game-like engineering workspace
+ typed construction operations
+ deterministic validation
+ exact BOQ derivation
+ BOQ ↔ operation ↔ geometry navigation
```

The product should start with buildings but keep operation contracts extensible for civil, MEP, industrial, electronics and integrated-circuit domains later.
