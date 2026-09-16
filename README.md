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

The implementation layer is now complete, but the repository is in a **post-implementation productization phase**. Product readiness is intentionally a separate gate: a complete architecture/code campaign is not the same thing as a publicly deployable, installable and user-friendly product.

A provisional free-tier deployment has been evidenced at [`https://aise-tan.vercel.app`](https://aise-tan.vercel.app), but **AISE is not yet product-ready**. The latest evidenced deployed application commit is recorded in `docs/productization-state.json`; repository documentation commits after that deployment do not imply that the deployed runtime has those later changes.

The productization program is governed by:

- `docs/productization-roadmap.md`
- `docs/productization-work-orders.md`
- `docs/PRODUCTION-READINESS-GATE.md`
- `docs/free-tier-deployment.md`
- `docs/INSTALL.md`
- `docs/productization-state.json`
- `docs/TECH-LEAD-HANDOFF.md`

Only `PROD-015` may change the productization declaration to PRODUCT-READY, and only after objective evidence proves all three product promises: installable, free-tier deployed, and user-friendly.

## Product promises

### 1. Installable

A fresh developer should be able to clone the repository, install dependencies with the checked-in lockfile, run the deterministic verification gate, start the product locally, and follow the demo flow using only repository documentation.

### 2. Free-tier deployable

The default evaluator deployment targets Vercel Hobby, Neon Free, Cloudflare R2 Standard and Upstash Redis Free, with Apify Free as an optional acquisition/import connector. See `docs/free-tier-deployment.md` for the provider landscape and `docs/DEPLOYMENT.md` for the executed deployment guide (with `tools/deploy-vercel.md` as the operator runbook). Heavy reconstruction/GPU providers remain optional and are not required for the baseline demo journey.

### 3. User-friendly interface

The public product must present a coherent primary web experience for Projects, SiteTwin/Evidence, BOQ Lens, Engineering Case and Intervention Studio, with clear navigation, helpful empty/error states and a guided end-to-end journey.

## Client architecture — one core, three adapters

Browser, mobile and desktop are **adapters over the same AISE product/domain core**. They consume the same semantic task/capability contracts and may differ only in platform-specific presentation and interaction affordances.

```text
                 AISE PRODUCT / DOMAIN CORE
   Reality | Evidence | Assurance | Verification | BOQ
   Cases | Interventions | Outcomes | Integrations
                           ▲
                           │ shared capability/task contract
          ┌────────────────┼────────────────┐
          │                │                │
       BROWSER           MOBILE          DESKTOP
       ADAPTER           ADAPTER         ADAPTER
```

- Browser is optimized for project-wide inspection, collaboration, BOQ/reality analysis and review.
- Mobile is optimized for field capture, guided missions, sensors, offline queues and rapid evidence submission. The current mobile implementation is the Android client under `apps/android`.
- Desktop is optimized for high-density review, large-file workflows, multi-window use and optional local integration affordances. The desktop adapter remains a productization work item and is not yet declared complete.

No client may own engineering readiness, canonical measurement authority, evidence sufficiency, verification, intervention approval, source-of-record authority or tenant authorization policy.

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

## Integration-first adoption

AISE is designed to become the primary engineering interface without demanding a rip-and-replace migration. Existing BIM, BOQ, CAD, project-management, ERP, procurement and document systems can remain systems of record while AISE exposes their context and authorized actions through connectors. Workflow migration is incremental, reversible and evidence-backed.

AISE can also be plugged into `payswapdotorg/codex` as a vertical: Codex supplies agent/workflow orchestration while AISE remains authoritative for engineering reality, evidence, assurance and BOQ semantics. The initial integration is external and requires no Codex-core modification.

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
EXECUTION + RECAPTURE
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

## Development governance

The repository is the sole implementation truth. A fresh Tech Lead must be able to read `AGENTS.md`, the architecture, requirements, work-item DAG, work orders and machine state and dispatch workers without chat history.

The historical implementation roadmap remains in `spec/`. Productization uses the separate `PROD-*` work system under `docs/` so the completed 41-item implementation campaign is not confused with deployment/product readiness.

See `spec/governance/architecture-change-record-002.md`, `docs/codex-integration-strategy.md`, `docs/adoption-sensitivity-analysis.md`, and `docs/reconstruction-engine-contract.md` for the locked integration/adoption/provider strategy.

## Architecture provenance

This v2 baseline was derived from an audit of the earlier `pectoraux/AISE` v1 architecture. v2 makes capability-aware acquisition, adaptive evidence collection, BOQ intelligence, intervention state simulation and incumbent-first adoption first-class.
