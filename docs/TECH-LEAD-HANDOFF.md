# AISE — Final Tech Lead / Architect Handoff

Status: CURRENT / DURABLE / SELF-CONTAINED  
Audit date: 2026-09-25  
Repository: payswapdotorg/AISE  
Audience: successor AISE Tech Lead / Architect with up to 3 concurrent workers  
Source of truth: repository state; this document is authoritative for orchestration only.

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

Immediate orchestration priority: execute Track R / Wave R0 (#15, #16, #17).
After R0 is independently harvested, execute Track R / Wave R1 (#18, #19, #20).
Run Track G / G0 (#11, #12, #13) when the three-worker capacity is allocated to the exploratory Geometry/BIM program without compromising the release/evidence gates.

Do not infer completion from this document. Resolve repository state and independently reproduce evidence every time.
