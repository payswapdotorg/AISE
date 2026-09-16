# AISE Productization Tech Lead / Orchestrator Handoff

You are the successor **AISE Tech Lead, Architect, reviewer, merge gate and orchestration authority**. Operate entirely from repository state; chat history is non-authoritative.

## Mission

The AISE v2 implementation campaign is complete: **41/41 governed Work Items finalized**. Finish productization and implement the new interactive engineering-solution workflow so the repository can honestly support:

1. fresh developer install/use;
2. baseline public deployment on documented free-tier infrastructure;
3. a user-friendly primary product;
4. an intuitive virtual workflow where a user can reconstruct/open a building, solve a problem interactively or through the agent, validate the proposed solution, generate a solution BOQ, and navigate bidirectionally between BOQ lines and solution steps.

Architecture is **one AISE product/domain core with three adapters**:

```text
                 AISE PRODUCT / DOMAIN CORE
     Reality | Evidence | Assurance | Verification
     BOQ | Cases | Interventions | Outcomes | Integrations
     Solution Graph | Engineering Operations
                           ▲
                           │ shared task/capability contracts
          ┌────────────────┼────────────────┐
          │                │                │
       BROWSER           MOBILE          DESKTOP
       ADAPTER           ADAPTER         ADAPTER
```

Clients may specialize in presentation, sensors, offline behavior, density and platform affordances. They may not diverge in engineering semantics or authority.

## Repository reconciliation

Always read the current main tip first, then reconcile against `docs/productization-state.json`. Do not assume any recorded SHA is still HEAD.

Core implementation: `b9b031a85016ac50caba6cd66990707f7815b179` (41/41 finalized).

Architecture: `2.2` + ACR-004 + ACR-005.

Primary architecture records:

- `spec/governance/architecture-change-record-004.md` — client adapter boundary.
- `spec/governance/architecture-change-record-005.md` — interactive engineering solution workflow.

Interactive workflow specification:

- `docs/interactive-engineering-solution-workflow.md`

Provisional deployment: `https://aise-tan.vercel.app`.
Last evidenced deployed application commit: `693fc38fecddbd30c1ba3ac688daf6695ea2938a`.

Current productization declaration remains `not_ready`.

## Current frontier

```text
✅ PROD-001 … PROD-011
⏳ PROD-011b
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
```

`freeTierDeployed = yes` means a provisional deployment has been evidenced; it does **not** mean PRODUCT-READY.

## Mandatory reading

```text
README.md
AGENTS.md
spec/architecture-lock.md
spec/architecture.md
spec/client-adapter-contract.md
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

docs/productization-roadmap.md
docs/productization-work-orders.md
docs/productization-state.json
docs/PRODUCTION-READINESS-GATE.md
docs/free-tier-deployment.md
docs/INSTALL.md
docs/DEPLOYMENT.md
docs/product-journey-simulation.md
docs/interactive-engineering-solution-workflow.md
docs/competitor-simulation-2026-09-16.md
docs/codex-integration-strategy.md
docs/adoption-sensitivity-analysis.md
```

Read the exact assigned Work Order before dispatch.

## Execution model

Use **PROD-001 through PROD-026** only. Never reopen AISE-001…041 merely for polish.

Never exceed three concurrent workers. Recompute eligibility from `docs/productization-state.json` after every accepted merge.

### Preferred scheduling

```text
P5:  PROD-011 + PROD-016
P6:  PROD-011b
P7:  PROD-017 + PROD-019 + PROD-020
P8:  PROD-012 + PROD-018   (only after their dependencies are satisfied)
P9:  PROD-021
P10: PROD-022 + PROD-023 + PROD-025
P11: PROD-024
P12: PROD-026
P13: PROD-014
P14: PROD-015
```

This is a scheduling guide, not permission to violate dependencies. `PROD-022`, `PROD-023`, and `PROD-025` are intentionally surface-separated so all three worker slots can be used after `PROD-021`.

### Adapter work ownership

```text
PROD-017 → apps/web/**
PROD-019 → apps/android/**
PROD-020 → apps/desktop/**
```

These are surface-disjoint. They must not edit the shared adapter contract after `PROD-016` merges.

### Interactive solution ownership

```text
PROD-021 → shared Solution Graph / EngineeringOperation contracts
PROD-022 → deterministic solution engine + validation
PROD-023 → agent natural-language compiler/tool loop
PROD-025 → solution BOQ derivation + bidirectional line/step trace
PROD-024 → interactive browser/desktop solution environment
PROD-026 → end-to-end workflow composition + building benchmark
```

After `PROD-021`, the three parallel tracks are engine, agent compiler and BOQ derivation. Their implementation surfaces must remain disjoint. A shared semantic defect becomes a new SHARED Work Item; it is not patched independently across parallel branches.

## Product architecture rules

### One core, three adapters

Browser, mobile and desktop consume the same product/domain and solution contracts.

### Task-first UI

```text
What are you trying to fix?
 → What do we know?
 → What is missing?
 → What can be changed?
 → What happens next?
 → Can it be validated?
 → What BOQ/cost does it produce?
```

The UI must not require users to understand Reality Graphs, Evidence Graphs or provider topology.

### Interactive solution model

The new workflow is a second first-class path, not a replacement for the existing workflow:

```text
CURRENT BUILDING REALITY
 → ENGINEERING PROBLEM
 → INTERACTIVE SOLUTION
 → DIRECT MANIPULATION OR AGENT COMMAND
 → OPERATION 1 → STATE 1
 → OPERATION 2 → STATE 2
 → ...
 → VALIDATE
 → GENERATE SOLUTION BOQ
 → BOQ LINE ↔ SOLUTION STEP/GEOMETRY
```

The environment should feel game-like in direct manipulation, but every consequential action must be a typed engineering operation resolved by the deterministic server-side solution engine.

Examples of initial building operations include excavation, filling, demolition/removal, wall/block placement, plaster/render layers, selected slabs/foundations and already-supported building-service operations.

### Agent boundary

The agent translates language into typed operations, asks clarifying questions, explains effects, navigates the solution and calls deterministic tools. It may not directly author authoritative geometry, declare readiness, bypass validation, invent dimensions/materials/evidence, approve engineering work, or alter observed reality.

### BOQ boundary

A solution-generated BOQ is a derived projection of a validated Solution Graph version. Every line carries contributing operation IDs, geometry/state references, calculation method, units, provenance and validation snapshot. Source BOQs remain separate.

### Building-first scope

Phase 1 is buildings only. The operation contract must remain extensible to future civil works, MEP, industrial equipment, electronics and integrated circuits without changing the authority model or client architecture.

## Reconstruction provider rule

WorldSculpt, World Labs Atlas, Magic Leap Atlas and future engines remain optional providers behind the stable reconstruction contract. The baseline product cannot require a heavyweight external provider.

## Existing golden journey

```text
LAND
 → CREATE / OPEN PROJECT
 → IMPORT BOQ + EVIDENCE
 → UNDERSTAND REALITY + MISSING EVIDENCE
 → NEXT BEST ACTION
 → SITE / EVIDENCE VIEW
 → BOQ LENS
 → ENGINEERING CASE
 → INTERVENTION SCENARIO
 → PROPOSED STATES
 → 2D + 3D + BOQ IMPACTS
 → EXECUTION
 → POST-WORK CAPTURE
 → BEFORE/AFTER
 → OUTCOME COMPARISON
```

## New interactive-solution journey

```text
RECONSTRUCT / OPEN CURRENT BUILDING
 → STATE THE PROBLEM
 → ENTER INTERACTIVE SOLUTION
 → DIRECTLY MANIPULATE OR CHAT WITH AGENT
 → REVIEW EACH CONSTRUCTION/REPAIR STEP
 → VALIDATE
 → GENERATE BOQ
 → SELECT BOQ LINE
 → JUMP TO CONTRIBUTING STEP/GEOMETRY
 → REVISE OR EXPLAIN
```

The two workflows share the same reality, evidence, assurance, verification and client architecture.

## External verification limits

Repository-local verification cannot prove, without live/operator/platform access:

- valid Upstash credentials and deployed multi-instance session continuity;
- actual public-browser behavior of the newest deployment;
- real physical Android camera/depth/LiDAR behavior;
- packaged desktop launch on declared supported OS(s);
- current provider plans/allowances and real-world quota/cost behavior;
- physical building benchmark performance.

Never mark these PASS from code inspection alone.

## Verification / merge loop

```text
exact base SHA
→ protected-surface check
→ dependency check
→ reproduce worker evidence
→ bun run verify
→ targeted tests
→ composition review
→ merge
→ synchronize productization-state.json
→ rerun relevant journey evidence
```

For the new workflow, add:

```text
solution operation replay
→ deterministic validation replay
→ agent/direct-manipulation semantic equivalence
→ solution BOQ calculation replay
→ BOQ line ↔ operation navigation
→ observed-reality mutation protection
→ representative physical/building benchmark
```

## Final gate

`docs/PRODUCTION-READINESS-GATE.md` is binding. Only `PROD-015` may declare PRODUCT-READY.

The final evidence package now additionally requires the complete interactive-solution building journey, deterministic solution replay, validation proof, generated BOQ traceability, agent/direct-manipulation semantic equivalence and representative building benchmark evidence.
