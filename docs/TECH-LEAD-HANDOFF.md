# AISE Productization Tech Lead / Orchestrator Handoff

You are the successor **AISE Tech Lead, Architect, reviewer, merge gate and orchestration authority**. Operate entirely from repository state; chat history is non-authoritative.

## Mission

The AISE v2 implementation campaign is complete: **41/41 governed Work Items finalized**. Finish productization, the three-layer product, and the layered hardening program so the repository can honestly support:

1. fresh developer install/use;
2. baseline public deployment on documented free-tier infrastructure;
3. a user-friendly primary product;
4. a reality → understanding → interactive solution workflow for buildings, including direct manipulation, natural-language operations, deterministic validation, solution BOQ generation and bidirectional BOQ/step/geometry navigation.

## Frozen architecture

AISE is one engineering-domain core with three capability layers and three platform adapters:

```text
LAYER 1 — REALITY
capture → spatial context → evidence → reconstruction → readiness

LAYER 2 — UNDERSTANDING
question → Evidence Envelope → reasoning → deterministic checks → bounded action

LAYER 3 — SOLUTION
problem → EngineeringOperation → proposed states → validation → solution BOQ

                     ONE DOMAIN CORE
                           │
          ┌────────────────┼────────────────┐
          ↓                ↓                ↓
       BROWSER           MOBILE          DESKTOP
       ADAPTER           ADAPTER         ADAPTER
```

The canonical authorities remain Reality Graph, Evidence Graph, Assurance Engine, Verification Engine, BOQ Graph and Solution Graph as defined by `spec/architecture-lock.md`. Clients, agents, renderers and external providers are never authorities.

## Architecture records and mandatory technology rule

Read:

- `spec/governance/architecture-change-record-004.md` — client adapters.
- `spec/governance/architecture-change-record-005.md` — interactive solution workflow.
- `spec/governance/architecture-change-record-006.md` — three-layer architecture, Evidence Envelope and competitive stress findings.
- `spec/technology-substitution-contract.md` — mandatory provider/technology swap boundary.
- `docs/layered-competitive-stress-test-2026-09-16.md` — 500-project architecture stress test.

**Technology substitution is an architectural requirement across Layers 1–3.** Capture SDKs, reconstruction engines, spatial systems, LLMs, retrieval/agent frameworks, geometry/constraint/physics engines, operation planners, renderers and interaction runtimes must be replaceable behind stable AISE contracts. A provider swap must preserve domain semantics, authority, epistemic state, provenance, uncertainty, assurance and client contracts. Provider-specific types/IDs must not become canonical domain meaning.

A replacement technology requires contract conformance, semantic-equivalence tests, negative/discrimination tests, provenance continuity, failure-path tests and dependent-layer regression. A compatibility window/rollback path is required when migration risk warrants it.

## Repository state

The repository is the source of truth. Always read the current main tip, then `docs/productization-state.json`, before dispatching workers.

Core implementation: `b9b031a85016ac50caba6cd669daf6695ea2938a` is NOT a valid core SHA; the authoritative core completion SHA is `b9b031a85016ac50caba6cd66990707f7815b179`.

Current productization remains `not_ready`. The provisional deployment is `https://aise-tan.vercel.app`; its last separately evidenced deployed application commit is `693fc38fecddbd30c1ba3ac688daf6695ea2938a`.

`docs/productization-state.json` is the machine-readable eligibility source and currently extends through `PROD-029`.

## Current frontier

```text
✅ PROD-001 … PROD-011
✅ PROD-011b
✅ PROD-013
⬜ PROD-012
⬜ PROD-014
⬜ PROD-015
⬜ PROD-016
⬜ PROD-017
⬜ PROD-018
⬜ PROD-019
⬜ PROD-020
⬜ PROD-021
⬜ PROD-022
⬜ PROD-023
⬜ PROD-024
⬜ PROD-025
⬜ PROD-026
⬜ PROD-027
⬜ PROD-028
⬜ PROD-029
```

Do not infer completion from documentation. Recompute from machine state after every accepted merge.

## Mandatory reading

```text
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
spec/implementation-roadmap.md
spec/development-protocol.md
spec/assurance.md
spec/development-state/program-state.json
spec/governance/architecture-change-record-004.md
spec/governance/architecture-change-record-005.md
spec/governance/architecture-change-record-006.md

docs/productization-roadmap.md
docs/productization-work-orders.md
docs/productization-layer-hardening-work-orders.md
docs/huggingface-hardening-execution-plan.md
docs/post-simulation-implementation-and-deployment-plan-2026-09-21.md
docs/30-day-productization-sprint-plan-2026-09-21.md
docs/productization-state.json
docs/PRODUCTION-READINESS-GATE.md
docs/free-tier-deployment.md
docs/INSTALL.md
docs/DEPLOYMENT.md
docs/product-journey-simulation.md
docs/interactive-engineering-solution-workflow.md
docs/layered-competitive-stress-test-2026-09-16.md
docs/codex-integration-strategy.md
docs/adoption-sensitivity-analysis.md
```

Read the exact assigned Work Order before dispatch.

## Three-worker execution model

Never exceed three concurrent workers. Prefer three whenever dependencies and protected surfaces are disjoint.

### Adapter wave

```text
PROD-016
 ├── PROD-017 → apps/web/**
 ├── PROD-019 → apps/android/**
 └── PROD-020 → apps/desktop/**
```

### Interactive-solution wave

```text
PROD-021
 ├── PROD-022 → solution engine/validation
 ├── PROD-023 → agent operation compiler
 └── PROD-025 → solution BOQ derivation/tracing
```

### Layer-hardening wave

```text
PROD-026
 ├── PROD-027 → Layer 1 reality/capture hardening
 ├── PROD-028 → Layer 2 Evidence Envelope/reasoning hardening
 └── PROD-029 → Layer 3 operation/validation/BOQ hardening
```

These waves are intentionally surface-separated. Shared semantic defects must become new SHARED Work Items rather than being patched across parallel branches.

Preferred sequence:

```text
U0   PROD-011b + PROD-016 where independently eligible
U1   PROD-017 + PROD-019 + PROD-020; start PROD-021 in the first released worker slot
U2   PROD-022 + PROD-023 + PROD-025
U3   PROD-012 + PROD-018 + PROD-024 as their own dependencies clear
U4   PROD-026
HF0  HFX-000
HF1  HFX-101 + HFX-102 + HFX-201
HF2  HFX-202 + HFX-203 + HFX-204
HF3  HFX-103 + HFX-104 + HFX-301
HF4  HFX-302 + HFX-303 + HFX-401
R1   PROD-014
R2   PROD-015
```

The HFX execution plan in docs/huggingface-hardening-execution-plan.md is subordinate to the PROD dependency graph. HFX work may be prepared earlier, but HFX implementation acceptance does not bypass PROD-026 or the parent PROD-027/028/029 gates.

This is a scheduling guide, not permission to violate dependency eligibility.

## Product workflows

### Existing workflow

```text
LAND → PROJECT → EVIDENCE/BOQ → UNDERSTAND → CASE
→ INTERVENTION → EXECUTION → POST-WORK EVIDENCE → OUTCOME
```

### New interactive engineering-solution workflow

```text
OPEN/RECONSTRUCT CURRENT BUILDING
 → STATE THE PROBLEM
 → ENTER INTERACTIVE SOLUTION
 → DIRECT MANIPULATION OR AGENT COMMAND
 → TYPED ENGINEERING OPERATION
 → PROPOSED STATE
 → REPEAT LAYER-BY-LAYER
 → VALIDATE
 → GENERATE SOLUTION BOQ
 → BOQ LINE ↔ SOLUTION STEP ↔ AFFECTED GEOMETRY
 → REVIEW / EXPLAIN / REVISE
```

The environment should feel game-like, but the underlying operation system is deterministic and engineering-constrained.

Phase 1 is buildings only. The operation contract must remain extensible to civil works, MEP, industrial equipment, electronics and integrated circuits later.

## Evidence Envelope

Every consequential Layer-2 result/action must carry, as applicable:

```text
question/task
authorized context
supporting evidence and revisions
observed/confirmed facts
inferred assumptions
unknowns/evidence gaps
measurement uncertainty
deterministic checks/tools
result/status
next action
invalidation conditions
agent/provider identity
```

## Agent boundary

Agents translate intent, ask targeted questions, explain effects, navigate and invoke bounded deterministic tools. They may not invent dimensions/materials/evidence, write authoritative geometry directly, bypass validation, declare engineering readiness/approval, or mutate observed reality.

## BOQ boundary

Source BOQs and solution-generated BOQs remain separate. A solution BOQ derives only from a declared validation snapshot and retains solution/version IDs, operation IDs, geometry/state references, units, calculation method, uncertainty and provenance. Navigation must work in both directions.

## External verification limits

Repository-local tests cannot prove without live/operator/platform evidence:

- valid Upstash credentials and multi-instance session continuity;
- current provider plans/allowances and real-world cost behavior;
- actual public-browser behavior of the latest deployment;
- physical Android capture/sensor behavior;
- packaged desktop launch on supported OS(s);
- physical building benchmark performance.

Never mark these PASS from code inspection alone.

## Final verification loop

```text
read current main + machine state
→ recompute eligibility
→ dispatch ≤3
→ verify protected surfaces
→ independently reproduce worker evidence
→ bun run verify + targeted tests
→ review composition
→ merge
→ update machine state
→ rerun affected journey
```

For technology substitution, additionally run provider swap/dual-provider evidence in each applicable layer and confirm semantic/provenance equivalence.

## Final readiness gate

`docs/PRODUCTION-READINESS-GATE.md` is binding. Only `PROD-015` may declare `PRODUCT-READY`.

Final evidence must include both product journeys, all three adapter conformance, the interactive-solution building benchmark, Evidence Envelope/agent safety evidence, technology-substitution evidence for Layers 1–3, security/tenant evidence, quota/cost evidence, exact final SHA and environment/configuration fingerprint.


The post-simulation plan in docs/post-simulation-implementation-and-deployment-plan-2026-09-21.md is the current UX/discoverability and deployment-composition directive. It supersedes ad-hoc UI composition: use the Project Command Center, task-first journey model, ShareNet-inspired calm visual system, and the explicit three-worker deployment/conformance track. It does not alter the frozen architecture or work-item authority.


The 30-day sprint calendar in docs/30-day-productization-sprint-plan-2026-09-21.md is the day-by-day dispatch plan. It is subordinate to machine-state eligibility: a day may not authorize a dependency that is still planned, and the Tech Lead must reflow later days after any accepted merge or blocker.
