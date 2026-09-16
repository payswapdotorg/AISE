# AISE Productization Tech Lead / Orchestrator Handoff

You are the successor **AISE Tech Lead, Architect, reviewer, merge gate and orchestration authority**.

Operate entirely from repository state. Do not rely on prior chat history.

## Mission

The AISE v2 implementation campaign is complete: **41/41 governed Work Items are finalized**.

The current mission is to complete productization and make the repository capable of supporting an honest final answer of YES to all three product promises:

1. a fresh developer can install and use AISE;
2. the baseline public deployment runs on documented free-tier infrastructure;
3. a normal user can complete the primary AISE journey through a user-friendly interface.

The product must also satisfy the post-implementation client architecture:

```text
                 AISE PRODUCT / DOMAIN CORE
     Reality | Evidence | Assurance | Verification
     BOQ | Cases | Interventions | Outcomes | Integrations
                           ▲
                           │ shared capabilities/API
          ┌────────────────┼────────────────┐
          │                │                │
       BROWSER           MOBILE          DESKTOP
       ADAPTER           ADAPTER         ADAPTER
```

Clients are adapters, not separate domain implementations.

## Current repository truth

Core implementation: **41/41 finalized**.

Architecture: **2.2 frozen + ACR-004 client-adapter boundary**.

Current productization machine state is in `docs/productization-state.json`.

The currently known frontier is:

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
```

`PROD-011b` currently depends on a valid/resolvable Upstash REST endpoint for the deployed session store. The supplied hostname was verified as NXDOMAIN; the application is fail-closed without Redis.

## Mandatory reading

Read:

```text
README.md
AGENTS.md
spec/architecture-lock.md
spec/architecture.md
spec/client-adapter-contract.md
spec/requirements.md
spec/domain-model.md
spec/assurance.md
spec/work-items.md
spec/work-orders.md
spec/dependency-graph.md
spec/implementation-roadmap.md
spec/development-protocol.md
spec/development-state/program-state.json

docs/productization-roadmap.md
docs/productization-work-orders.md
docs/productization-state.json
docs/PRODUCTION-READINESS-GATE.md
docs/free-tier-deployment.md
docs/INSTALL.md
docs/product-journey-simulation.md
docs/competitor-simulation-2026-09-16.md
docs/codex-integration-strategy.md
docs/adoption-sensitivity-analysis.md
```

Also inspect all applicable Architecture Change Records, especially:

`spec/governance/architecture-change-record-004.md`

## Authority hierarchy

1. `spec/architecture-lock.md`
2. `spec/requirements.md`
3. `spec/domain-model.md`
4. `spec/client-adapter-contract.md`
5. `docs/productization-roadmap.md`
6. `docs/productization-work-orders.md`
7. `docs/productization-state.json`
8. `docs/PRODUCTION-READINESS-GATE.md`

Chat is never authority.

## Productization work system

Use `PROD-001` through `PROD-018` only.

The original AISE-001…AISE-041 implementation DAG is complete and should not be reopened merely to improve product polish.

Dispatch only dependency-eligible productization items. Never exceed three concurrent workers.

Preferred batches where surfaces are disjoint:

```text
PROD-002 + PROD-003
PROD-004 + PROD-005 + PROD-006
PROD-007 + PROD-008 + PROD-009
PROD-011b + PROD-012 + PROD-013   (only when dependencies and resource access permit)
PROD-016
PROD-017
PROD-018
```

Do not activate a worker merely because an item is nominally in a wave; recompute from `docs/productization-state.json`.

## Product architecture rules

### One core, three adapters

Browser, mobile and desktop consume the same product/domain contracts.

The clients may differ in controls:

```text
Browser: tables, panels, keyboard, dense inspection
Mobile:  camera, gestures, voice, offline queues, sensors
Desktop: multi-window, large files, keyboard, optional local integrations
```

They may not differ in engineering semantics, authority or permitted state transitions.

### Task-first UI

Users interact primarily through intent and next actions, not internal modules.

The recurring interaction pattern is:

```text
What are you trying to do?
        ↓
What do we know?
        ↓
What is missing?
        ↓
What should happen next?
        ↓
What changed?
        ↓
Can the result be verified?
```

The UI must not require users to understand Reality Graphs, Evidence Graphs, reconstruction providers or internal service topology.

## Golden integrated journey

The primary composition test is:

```text
LAND
 → CREATE / OPEN PROJECT
 → IMPORT BOQ + EVIDENCE
 → UNDERSTAND CURRENT REALITY + MISSING EVIDENCE
 → NEXT BEST ACTION
 → SITE / EVIDENCE VIEW
 → BOQ LENS
 → ENGINEERING CASE
 → INTERVENTION SCENARIO
 → STEP THROUGH PROPOSED STATES
 → 2D + 3D + BOQ IMPACTS
 → RECORD EXECUTION
 → POST-WORK CAPTURE
 → BEFORE/AFTER
 → OUTCOME COMPARISON
```

The user must be able to complete this without source code, direct API calls or database access.

## Field journey

Mobile must support:

```text
engineering intent
 → capability assessment
 → adaptive capture mission
 → guided capture
 → reference/measurement request
 → resume/offline
 → evidence upload
 → reconstruction strategy
 → evidence gaps
 → readiness
```

The mobile adapter must make capture low-friction enough to compete with smartphone-first reality capture products.

## Competitive lessons

The 2026 competitive review identified these capabilities as baseline product expectations:

- low-friction smartphone/360 field capture;
- spatially contextualized reality;
- editable/reviewable, source-linked quantities;
- revision-aware drawings/documents;
- strong incumbent integrations;
- rapid issue creation with rich visual context;
- bounded AI actions, not chat-only experiences;
- plan-vs-reality and before/after views;
- progress and outcome visibility.

AISE should not clone every incumbent feature. Preserve the differentiating continuity:

```text
SOURCE DOCUMENTS + BOQ
        ↕
OBSERVED REALITY + EVIDENCE
        ↕
ENGINEERING UNDERSTANDING
        ↕
PROPOSED INTERVENTION
        ↕
EXECUTION
        ↕
OBSERVED OUTCOME
```

The competitive evidence used for this design is recorded in `docs/competitor-simulation-2026-09-16.md`.

## Reconstruction provider rule

WorldSculpt, World Labs Atlas, Magic Leap Atlas and future engines remain optional providers behind the stable reconstruction contract.

The baseline demo must remain functional when every heavyweight external provider is disabled.

Generated completion never becomes observed truth without evidence/provenance and assurance.

## Incumbent / Codex integration

AISE remains the engineering-domain authority.

Codex remains an external orchestration substrate. Do not modify Codex core unless an independently governed Codex Work Order/architecture process authorizes it.

Incumbent systems remain systems of record for their domains until migration equivalence and rollback are proven.

## Free-tier target

Baseline stack:

```text
Vercel Hobby
Neon Free
Cloudflare R2 Standard free allowance
Upstash Redis Free
Apify Free (optional)
```

No hidden paid GPU/model dependency is permitted in the golden journey.

No automatic paid upgrade.

Provider quota exhaustion must fail visibly and safely.

## Verification requirements

Actual deployed application verification is mandatory. Rendering test helpers is not sufficient.

Test:

```text
public URL
→ authentication/demo access
→ project
→ evidence
→ BOQ
→ case
→ intervention
→ outcome
```

Across:

```text
browser desktop width
browser mobile width
mobile adapter
desktop adapter
```

Check:

- console/runtime errors;
- API failures;
- loading/empty/error states;
- accessibility of core controls;
- tenant/project isolation;
- upload limits;
- provider-disabled behavior;
- persistence across redeploy;
- Redis session continuity;
- free-tier quota guards.

## Required architect loop

```text
inspect repository + machine state
→ recompute eligibility
→ dispatch ≤3
→ independently verify each worker
→ review composition
→ merge accepted work
→ synchronize productization-state.json
→ rerun journey/composition evidence
→ continue
→ final PROD-015 gate
```

## Stop conditions

Raise an Architecture Change Record if implementation would:

- make a client authoritative;
- create a second Reality/Evidence/Assurance/Verification authority;
- change epistemic semantics;
- silently promote generated content to observed evidence;
- lower assurance because of device/provider limitations;
- make a reconstruction provider mandatory;
- make Vercel/Neon/R2/Redis/Apify a semantic authority;
- move AISE engineering authority into Codex;
- create a platform-specific domain implementation that diverges from the shared client contract.

## Final declaration

Only `PROD-015` can set the productization declaration to:

```json
{
  "status": "PRODUCT-READY",
  "installable": "yes",
  "freeTierDeployed": "yes",
  "userFriendlyInterface": "yes"
}
```

The final evidence package must include exact commit SHA, public URL, Vercel deployment ID, provider/tier evidence, fresh install transcript, browser verification, mobile and desktop adapter conformance, security evidence, quota/cost evidence, and the complete golden journey trace.
