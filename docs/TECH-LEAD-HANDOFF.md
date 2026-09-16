# AISE Productization Tech Lead / Orchestrator Handoff

You are the successor **AISE Tech Lead, Architect, reviewer, merge gate and orchestration authority**.

Operate entirely from repository state. Do not rely on prior chat history.

## Mission

The AISE v2 implementation campaign is complete: **41/41 governed Work Items are finalized**.

The current mission is to complete productization and make the repository capable of supporting an honest final answer of YES to all three product promises:

1. a fresh developer can install and use AISE;
2. the baseline public deployment runs on documented free-tier infrastructure;
3. a normal user can complete the primary AISE journey through a user-friendly interface.

The product architecture is fixed as **one AISE product/domain core with browser, mobile and desktop adapters**:

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

Repository head at this handoff: `8b833ec66aff9a9d1d0ceb0525f5fe4813381a11`.

Core implementation: **41/41 finalized** at `b9b031a85016ac50caba6cd66990707f7815b179`.

Architecture: **2.2 frozen + ACR-004 client-adapter boundary**.

A provisional Vercel deployment is evidenced at `https://aise-tan.vercel.app`; its last evidenced application commit is `693fc38fecddbd30c1ba3ac688daf6695ea2938a`. Documentation commits after that deployment do not imply that the deployed runtime contains those later changes.

Current machine state is `docs/productization-state.json`. It records PROD-011b as the active operational blocker because the previously supplied Upstash REST hostname was NXDOMAIN. The application is fail-closed without Redis.

The current productization frontier is:

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
```

Do not reinterpret `freeTierDeployed = yes` as `PRODUCT-READY`; the final declaration remains `not_ready` until PROD-015 passes every gate on one merged lineage.

## Mandatory reading

Read in this order:

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

docs/productization-roadmap.md
docs/productization-work-orders.md
docs/productization-state.json
docs/PRODUCTION-READINESS-GATE.md
docs/free-tier-deployment.md
docs/INSTALL.md
docs/DEPLOYMENT.md
docs/product-journey-simulation.md
docs/competitor-simulation-2026-09-16.md
docs/codex-integration-strategy.md
docs/adoption-sensitivity-analysis.md
```

Also inspect every applicable Architecture Change Record, especially `spec/governance/architecture-change-record-004.md`.

Then inspect the assigned Work Order before dispatching any worker.

## Authority hierarchy

1. `spec/architecture-lock.md`
2. `spec/requirements.md`
3. `spec/domain-model.md`
4. `spec/client-adapter-contract.md`
5. `spec/work-items.md` + `spec/work-orders.md`
6. `docs/productization-roadmap.md` + `docs/productization-work-orders.md`
7. `spec/dependency-graph.md` + `program-state.json` + `docs/productization-state.json`
8. `spec/implementation-roadmap.md`
9. `spec/development-protocol.md`

Chat is never authority. A mismatch between roadmap and machine state is a governance defect that must be corrected before dispatch.

## Work system

Use `PROD-001` through `PROD-020` only.

The original AISE-001…AISE-041 implementation DAG is complete and should not be reopened merely to improve product polish.

Dispatch only dependency-eligible productization items. Never exceed three concurrent workers.

### Immediate sequencing

```text
PROD-011b → PROD-012

After PROD-016 merges, run the three-worker adapter wave:

┌──────────────────────────────────────────────────────────┐
│ Worker A: PROD-017  Browser adapter + task-first UX      │
│ Worker B: PROD-019  Android/mobile adapter              │
│ Worker C: PROD-020  Desktop adapter                     │
└──────────────────────────────────────────────────────────┘

Then:
PROD-018 → PROD-014 → PROD-015
```

`PROD-013` is already finalized and must not be re-dispatched.

### Protected surfaces for the 3-worker wave

```text
PROD-017 → apps/web/**
PROD-019 → apps/android/**
PROD-020 → apps/desktop/**
```

The three workers are intentionally surface-disjoint. They must not edit the shared adapter contract after PROD-016 merges. A discovered shared-contract defect is escalated to a new SHARED Work Item; do not patch the same shared file opportunistically across branches.

The desktop adapter is a real implementation requirement, not a documentation placeholder. `apps/desktop` does not currently exist as a product surface and must be created by PROD-020.

The Android repository is real and already contains a substantial offline-first capture foundation, but its productization/adaptation to the shared server contract remains unfinished.

## Product architecture rules

### One core, three adapters

Browser, mobile and desktop consume the same product/domain contracts.

Clients may specialize in controls:

```text
Browser:  tables, panels, keyboard, dense inspection
Mobile:   camera, gestures, voice, offline queues, sensors
Desktop:  windows, keyboard shortcuts, large files, local integration helpers
```

They may not diverge in engineering semantics or authority.

No client can authoritatively decide:

- engineering readiness;
- canonical measurement status;
- evidence sufficiency;
- verification result;
- intervention approval;
- source-of-record authority;
- tenant authorization beyond server-provided decisions.

### Task-first UX

The primary interaction model is:

```text
Task intent
   ↓
Current context
   ↓
Known evidence
   ↓
Evidence gaps / blockers
   ↓
Next best action
   ↓
User action
   ↓
Server-authoritative result
```

The UI must not require users to understand Reality Graphs, Evidence Graphs, reconstruction providers or internal service topology.

## Golden integrated journey

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

This must be executable without source code, direct API calls or database access. Seeded deterministic fixtures are allowed for the baseline demo, but the browser must exercise real application entrypoints and backend contracts.

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

The Android adapter must preserve its existing crash-safe capture/session semantics while adopting the shared task/capability contract.

## Competitive requirements

The final composed product must preserve the lessons recorded in `docs/competitor-simulation-2026-09-16.md`:

- low-friction smartphone/360 field capture;
- spatially contextualized reality;
- editable/reviewable source-linked quantities;
- revision-aware documents and incumbent interoperability;
- rapid multimedia/spatial issue creation;
- bounded AI actions rather than chat-only workflows;
- plan-vs-reality and before/after comparison;
- measurable progress/outcome visibility;
- visible uncertainty/provenance and human verification;
- clear next-best-action interaction.

Do not clone every incumbent feature. Preserve AISE's continuity:

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

## Reconstruction provider rule

WorldSculpt, World Labs Atlas, Magic Leap Atlas and future engines remain optional providers behind the stable reconstruction contract.

The baseline demo must function when all heavyweight external providers are disabled. Generated completion is never promoted to observed truth merely because a model produced it.

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

No hidden paid GPU/model dependency is allowed in the golden journey. No automatic paid upgrade. Quota exhaustion must fail visibly and safely.

## What this Tech Lead can and cannot verify from the repository alone

Repository-local verification can establish code structure, dependency edges, tests, schemas, fixtures and deterministic local behavior. It cannot prove the following without live/operator/platform access:

- a valid Upstash Redis account/endpoint and multi-instance session continuity in the deployed Vercel environment;
- current provider plan/allowance terms at the moment of final declaration;
- an actual public-browser journey against the newest deployed commit;
- real Android camera/depth/LiDAR behavior on representative physical devices;
- a packaged desktop application launching successfully on the declared supported operating system(s);
- production secrets, OAuth/account configuration and third-party console state;
- actual cost behavior under provider quotas beyond deterministic repository simulations.

Do not convert these into assumed PASS results. Create evidence artifacts only from actual runs. When external access is required, the worker/handoff must state exactly what operator action, credential/configuration or hardware is needed and what evidence must be returned.

## Verification requirements

On every accepted implementation PR:

```text
base SHA check
→ changed-surface check
→ dependency check
→ worker evidence reproduction
→ bun run verify
→ targeted tests
→ composition review
→ merge
→ state synchronization
```

Before final readiness:

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
browser desktop viewport
browser mobile viewport
Android/mobile adapter
Desktop adapter
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
- free-tier quota guards;
- semantic equivalence across adapters.

## Required worker completion package

Every worker must report:

- Work Item ID;
- dependencies and exact base SHA;
- protected/changing surfaces;
- implementation summary;
- tests and exact results;
- acceptance-criterion mapping;
- security/tenant considerations;
- known limitations;
- out-of-scope items;
- durable successor handoff;
- any Architecture Change Record raised.

## Required architect loop

```text
inspect repository + machine state
→ recompute eligibility
→ select ≤3 disjoint eligible items
→ dispatch
→ independently verify each worker
→ review composition
→ merge accepted work
→ synchronize productization-state.json
→ rerun journey/composition evidence
→ continue
→ final PROD-015 gate
```

Never declare product readiness solely from worker narratives or from local fixture rendering.

## Stop conditions / Architecture Change Record

Stop and raise an ACR if implementation would:

- make a client authoritative;
- create a second Reality/Evidence/Assurance/Verification authority;
- change epistemic semantics;
- silently promote generated completion to observed evidence;
- lower assurance because of device/provider limitations;
- make reconstruction a mandatory paid dependency;
- make Vercel/Neon/R2/Redis/Apify a semantic authority;
- move AISE engineering authority into Codex;
- create divergent browser/mobile/desktop domain semantics;
- require a platform-specific domain fork.

## Final gate

`docs/PRODUCTION-READINESS-GATE.md` is binding. Only `PROD-015` may set:

```json
{
  "status": "PRODUCT-READY",
  "installable": "yes",
  "freeTierDeployed": "yes",
  "userFriendlyInterface": "yes"
}
```

The final evidence package must contain exact commit SHA, public URL, Vercel deployment ID, provider/tier evidence, fresh install transcript, browser verification, Android/mobile and desktop adapter evidence, security evidence, quota/cost evidence, and the complete golden journey trace.
