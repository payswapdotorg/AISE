# AI Site Engineer (AISE)

## Quickstart

Requires only Bun ≥ 1.2 (no Node, no Docker, no external services):

```bash
git clone https://github.com/payswapdotorg/AISE.git
cd AISE
bun install --frozen-lockfile
bun run verify     # deterministic gate — must end VERIFY: PASS
bun run dev        # web (http://localhost:5173) + API (http://127.0.0.1:8080), one Ctrl-C teardown
```

Other root commands: `bun run check:env` (environment validation),
`bun run build` + `bun run start` (production-like local start — requires
`AISE_DATA_DIR`, see docs), `bun run smoke` (end-to-end runtime smoke check
on a scratch port). The authoritative guide — environment reference, ports,
troubleshooting, and what is deliberately NOT included at this stage — is
[`docs/INSTALL.md`](docs/INSTALL.md).

## v2 Architecture Baseline — Capability-Aware Construction Reality Intelligence

AISE is a cross-platform construction reality intelligence platform. It turns field evidence, documents, BOQs, drawings, specifications, measurements and device sensing into a versioned, evidence-linked engineering representation that people and AI can inspect, reason over, verify and use to plan interventions.

The product is designed around one principle:

> **The engineering assurance requirement is fixed by the task; the capture burden adapts to the capabilities of the device and the evidence already available.**

AISE therefore does not pretend that every phone can produce the same quality of reconstruction. A higher-capability device may require less operator effort. A lower-capability device may require more guided capture, reference objects, manual measurements, additional evidence, or escalation to a better instrument/device. The system must never silently lower the assurance requirement because the device is weak.

## Current status

**Implementation campaign: complete — 41/41 governed v2 Work Items finalized.**

The implementation campaign and productization declaration are complete. AISE is **PRODUCT-READY for the exact PROD-015 declaration SHA** recorded in `docs/productization-state.json`, with the public deployment at [`https://aise-tan.vercel.app`](https://aise-tan.vercel.app). Main has advanced after that declaration, so the current branch tip must not be described as deployed until the exact current SHA is deployed and replayed.

The successor orchestration handoff is [docs/TECH-LEAD-HANDOFF.md](docs/TECH-LEAD-HANDOFF.md). The immediate post-readiness worker program is tracked by GitHub issue #14; the separately authorized Geometry/BIM R&D program is tracked by issue #10.

The productization program is governed by:

- `docs/productization-roadmap.md`
- `docs/productization-work-orders.md`
- `docs/PRODUCTION-READINESS-GATE.md`
- `docs/free-tier-deployment.md`
- `docs/INSTALL.md`
- `docs/productization-state.json`
- `docs/TECH-LEAD-HANDOFF.md`

Only `PROD-015` may declare PRODUCT-READY. Post-readiness hardening and R&D do not weaken or reopen that declaration.

## Product promises

### 1. Installable

A fresh developer should be able to clone the repository, install dependencies with the checked-in lockfile, run the deterministic verification gate, start the product locally, and follow the demo flow using only repository documentation.

### 2. Free-tier deployable

The default evaluator deployment targets Vercel Hobby, Neon Free, Cloudflare R2 Standard and Upstash Redis Free, with Apify Free as an optional acquisition/import connector. Heavy reconstruction/GPU providers remain optional and are not required for the baseline demo journey.

### 3. User-friendly interface

The public product must present a coherent primary web experience for Projects, SiteTwin/Evidence, BOQ Lens, Engineering Case and Intervention Studio, plus the interactive engineering-solution workflow, with clear navigation and useful empty/error states.

## Client architecture — one core, three adapters

Browser, mobile and desktop are **adapters over the same AISE product/domain core**. They consume the same semantic task/capability contracts and may differ only in platform-specific presentation and interaction affordances.

```text
                 AISE PRODUCT / DOMAIN CORE
   Reality | Evidence | Assurance | Verification | BOQ
   Cases | Interventions | Outcomes | Solution Graph
                           ▲
                           │ shared capability/task contract
          ┌────────────────┼────────────────┐
          │                │                │
       BROWSER           MOBILE          DESKTOP
       ADAPTER           ADAPTER         ADAPTER
```

No client may own engineering readiness, canonical measurement authority, evidence sufficiency, verification, intervention approval, source-of-record authority or solution validation authority.

## Product surfaces

### BOQ Lens
Makes BOQs understandable and operational. It connects BOQ sections/items, quantities, rates and cost scope to construction elements, locations, drawings, specifications and observed reality. A user can ask what a cost means, where the quantity is, what evidence supports it, what is missing, and what changed between revisions.

### SiteTwin
Creates a structured virtual representation of physical spaces and buildings from phones, depth sensors, LiDAR, photos, video, manual measurements and other evidence. It produces synchronized 2D, 3D and evidence views rather than a mesh-only deliverable.

### Engineering Case
Turns a site problem into a structured case: observations, measurements, material/condition information, uncertainty, evidence gaps, possible causes, engineering rules and review status.

### Intervention Studio
Represents proposed interventions as a sequence of model states. Each state can be viewed in 3D, 2D and BOQ views. A user can step through layers, inspect evidence and quantity/cost effects, and separate proposed changes from authoritative reality.

### Interactive Engineering Solution
This is a second first-class workflow for building problems. The user opens/reconstructs the current building and then constructs a proposed solution directly in an interactive environment or by natural-language commands to the integrated agent.

```text
CURRENT BUILDING REALITY
        ↓
ENGINEERING PROBLEM / INTENT
        ↓
INTERACTIVE SOLUTION
        ↓
DIRECT MANIPULATION / AGENT COMMANDS
        ↓
OPERATION 1 → PROPOSED STATE 1
OPERATION 2 → PROPOSED STATE 2
        ↓
VALIDATE
        ↓
GENERATE SOLUTION BOQ
        ↓
BOQ LINE ↔ SOLUTION STEP / GEOMETRY
```

The environment is intended to feel as immediate and intuitive as a game while remaining a constrained engineering system: every consequential action becomes a typed engineering operation, deterministic geometry/quantity/validation services remain authoritative, and the proposal never overwrites observed reality.

Example commands include:

```text
Excavate a pit 1.5 m deep, 2 m wide and 3 m long.
Apply 30 mm plaster to the affected wall faces.
Lay blocks up to 1 m high along this wall.
```

The integrated agent interprets such requests, asks for missing information and invokes deterministic operations. It does not invent dimensions/materials or bypass validation.

A solution-generated BOQ is a versioned derived projection. Clicking a BOQ line should take the user to the contributing solution step/geometry; selecting a step should reveal the BOQ lines it creates or changes.

**Phase 1 scope: buildings only.** The operation contract is intentionally extensible to future civil works, MEP, industrial equipment, electronics and integrated circuits.

### Outcome Loop

After work is performed, AISE captures the changed condition and outcome. This creates a trace from observed problem → diagnosis → proposed intervention → executed work → post-work evidence → observed outcome.

## Integration-first adoption

AISE is designed to become the primary engineering interface without demanding a rip-and-replace migration. Existing BIM, BOQ, CAD, project-management, ERP, procurement and document systems can remain systems of record while AISE exposes their context and authorized actions through connectors. Workflow migration is incremental, reversible and evidence-backed.

AISE can also be plugged into `payswapdotorg/codex` as a vertical: Codex supplies agent/workflow orchestration while AISE remains authoritative for engineering reality, evidence, assurance, verification and BOQ semantics. The initial integration is external and requires no Codex-core modification.

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
REASONING / BOQ INTELLIGENCE
        ↓
INTERACTIVE SOLUTION / INTERVENTION SIMULATION
        ↓
EXECUTION + RECAPTURE
        ↓
OUTCOME LEARNING
```

## Core authorities

- **Reality Graph:** only canonical structured engineering-model authority.
- **Evidence Graph:** only provenance/source authority.
- **Assurance Engine:** only model/task-readiness authority.
- **Verification Engine:** only formal deterministic verification authority.
- **Solution Graph:** canonical only for a proposed solution's operation/state history; never canonical physical reality.
- **BOQ Graph:** derived domain representation; source BOQs remain authoritative for their own scope.
- **Workflow/Domain services:** propose and orchestrate; they do not become alternate sources of truth.
- **LLMs:** advisory reasoning participants. They may interpret, retrieve, rank, explain and propose typed operations; they do not become authoritative geometry, measurement, compliance or model-state authorities.

## Development governance

The repository is the sole implementation truth. A fresh Tech Lead must be able to read `AGENTS.md`, the architecture, requirements, work-item DAG, work orders and machine state and dispatch workers without chat history.

The historical implementation roadmap remains in `spec/`. Productization uses the separate `PROD-*` work system under `docs/` so the completed 41-item implementation campaign is not confused with product readiness.

See `spec/governance/architecture-change-record-002.md`, `spec/governance/architecture-change-record-004.md`, `spec/governance/architecture-change-record-005.md`, `docs/codex-integration-strategy.md`, `docs/adoption-sensitivity-analysis.md`, and `docs/interactive-engineering-solution-workflow.md` for the current architecture and product strategy.
