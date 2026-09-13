# AI Site Engineer (AISE)

## v2 Architecture Baseline — Capability-Aware Construction Reality Intelligence

AISE is a cross-platform construction reality intelligence platform. It turns field evidence, documents, BOQs, drawings, specifications, measurements and device sensing into a versioned, evidence-linked engineering representation that people and AI can inspect, reason over, verify and use to plan interventions.

The product is designed around one principle:

> **The engineering assurance requirement is fixed by the task; the capture burden adapts to the capabilities of the device and the evidence already available.**

AISE therefore does not pretend that every phone can produce the same quality of reconstruction. A higher-capability device may require less operator effort. A lower-capability device may require more guided capture, reference objects, manual measurements, additional evidence, or escalation to a better instrument/device. The system must never silently lower the assurance requirement because the device is weak.

## Product surfaces

### BOQ Lens
Makes BOQs understandable and operational. It connects BOQ sections/items, quantities, rates and cost scope to construction elements, locations, drawings, specifications and observed reality. A user can ask what a cost means, where the quantity is, what evidence supports it, what is missing, and what changed between revisions.

### SiteTwin
Creates a structured virtual representation of physical spaces and buildings from phones, depth sensors, LiDAR, photos, video, manual measurements and other evidence. It produces synchronized 2D, 3D and evidence views rather than a mesh-only deliverable.

### Engineering Case
Turns a site problem into a structured case: observations, measurements, material/condition information, uncertainty, evidence gaps, possible causes, engineering rules and review status.

### Intervention Studio
Represents proposed interventions as a sequence of model states. Each state can be viewed in 3D, 2D and BOQ views. A user can step through layer 1, layer 2, layer 3 and so on, inspect evidence and quantity/cost effects, and separate proposed changes from authoritative reality.

### Outcome Loop
After work is performed, AISE captures the changed condition and outcome. This creates a trace from observed problem → diagnosis → proposed intervention → executed work → post-work evidence → observed outcome.

## Canonical lifecycle

```text
ENGINEERING INTENT
        ↓
ASSURANCE TARGET
        ↓
DEVICE + EVIDENCE CAPABILITY ASSESSMENT
        ↓
ADAPTIVE CAPTURE MISSION
        ↓
GUIDED MULTIMODAL CAPTURE
        ↓
RECONSTRUCTION STRATEGY SELECTION
        ↓
SCENE / BOQ / DOCUMENT UNDERSTANDING
        ↓
ENGINEERING REALITY GRAPH
        ↓
EVIDENCE + UNCERTAINTY
        ↓
EVIDENCE GAP / INFORMATION-GAIN LOOP
        ↓
SELF-CONSISTENCY + ENGINEERING VERIFICATION
        ↓
HUMAN REVIEW / AUTHORIZATION
        ↓
AUTHORITATIVE REALITY MODEL
        ↓
REASONING / BOQ INTELLIGENCE / INTERVENTION SIMULATION
        ↓
EXECUTION + RECATURE
        ↓
OUTCOME LEARNING
```

## Core authorities

- **Reality Graph:** only canonical structured engineering-model authority.
- **Evidence Graph:** only provenance/source authority.
- **Assurance Engine:** only model/task-readiness authority.
- **Verification Engine:** only formal deterministic verification authority.
- **Workflow/Domain services:** propose and orchestrate; they do not become alternate sources of truth.
- **LLMs:** advisory reasoning participants. They may interpret, retrieve, rank, explain and propose; they do not become authoritative geometry, measurement, compliance or model-state authorities.

## Device-aware reconstruction

A capture mission is negotiated from:

1. the engineering objective;
2. the required assurance profile;
3. the device capability snapshot;
4. existing project evidence;
5. the physical environment;
6. acceptable evidence substitutions.

The mission can ask an operator to walk, pan, revisit an occluded region, show a reference object, enter a dimension, place a ruler/tape, photograph a product label, answer a material question, or escalate to another instrument.

Readiness is multidimensional. AISE separately tracks spatial coverage, geometry completeness, semantic completeness, metric certainty, evidence completeness and task readiness. Confidence never substitutes for measurement uncertainty.

## Interoperability

AISE is an evidence and context layer, not a forced replacement for the existing construction stack. It must interoperate with BOQ spreadsheets/PDFs, drawings, BIM/IFC, point clouds, CAD/DXF, project management systems, document systems, ERP/procurement systems and external AI agents.

## Development governance

The repository is the sole implementation truth. A fresh Tech Lead must be able to read `AGENTS.md`, the architecture, requirements, work-item DAG, work orders and machine state and dispatch three workers without chat history.

See:

- `AGENTS.md` — agent operating contract
- `spec/architecture.md` — complete architecture
- `spec/architecture-lock.md` — immutable v2 invariants
- `spec/requirements.md` — product/quality requirements
- `spec/domain-model.md` — canonical domain model
- `spec/work-items.md` — implementation units
- `spec/work-orders.md` — executable contracts
- `spec/dependency-graph.md` — hard dependency DAG and three-worker waves
- `spec/implementation-roadmap.md` — human sequence/progress authority
- `spec/development-state/program-state.json` — machine sequence/progress authority
- `docs/adoption-simulation.md` — 72-agent/576-project competitive adoption simulation
- `docs/research-and-competitive-baseline.md` — current market/technology baseline
- `docs/TECH-LEAD-HANDOFF.md` — fresh orchestrator bootstrap

## Architecture provenance

This v2 baseline was derived from an audit of the earlier `pectoraux/AISE` v1 architecture. The earlier design already had the right foundations—Reality Graph, evidence/provenance, task-specific assurance, deterministic geometry, explicit epistemic states, device adapters and separate Android/backend ownership. v2 makes capability-aware acquisition, adaptive evidence collection, BOQ intelligence and intervention state simulation first-class rather than later add-ons.
