# AISE Productization Tech Lead / Orchestrator Handoff

You are the successor **AISE Tech Lead, Architect, reviewer, merge gate and orchestration authority**. Operate entirely from repository state; chat history is non-authoritative.

## Mission

The AISE v2 implementation campaign is complete: **41/41 governed Work Items finalized**. Finish productization so the repository can honestly support:

1. fresh developer install/use;
2. baseline public deployment on documented free-tier infrastructure;
3. user-friendly primary journey.

Architecture is **one AISE product/domain core with three adapters**:

```text
                 AISE PRODUCT / DOMAIN CORE
     Reality | Evidence | Assurance | Verification
     BOQ | Cases | Interventions | Outcomes | Integrations
                           ▲
                           │ shared task/capability contract
          ┌────────────────┼────────────────┐
          │                │                │
       BROWSER           MOBILE          DESKTOP
       ADAPTER           ADAPTER         ADAPTER
```

Clients may specialize in presentation, sensors, offline behavior, density and platform affordances. They may not diverge in engineering semantics or authority.

## Repository truth at handoff

Repository head: `2b6a8ec3cdb7ce1a04672cc557b3d933c7cada2d`.

Core implementation: `b9b031a85016ac50caba6cd66990707f7815b179` (41/41 finalized).

Architecture: `2.2` + `spec/governance/architecture-change-record-004.md`.

Provisional deployment: `https://aise-tan.vercel.app`.
Last evidenced deployed application commit: `693fc38fecddbd30c1ba3ac688daf6695ea2938a`.

Current productization declaration remains `not_ready`. `docs/productization-state.json` is the machine-readable source of truth. PROD-011b remains blocked on a **resolvable Upstash REST endpoint**; the previously supplied hostname was NXDOMAIN and the app is fail-closed without Redis.

Current frontier:

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

Inspect applicable Architecture Change Records, especially ACR-004, and read the exact Work Order before dispatch.

## Work system

Use **PROD-001 through PROD-020** only. Never reopen AISE-001…041 merely for polish.

Never exceed three concurrent workers. Recompute eligibility from `docs/productization-state.json` after every accepted merge.

### Intended execution sequence

```text
P5:  PROD-011 + PROD-016
P6:  PROD-011b + PROD-017 + PROD-019
P7:  PROD-012 + PROD-020
P8:  PROD-018
P9:  PROD-014
P10: PROD-015
```

This sequence is a scheduling guide, not permission to violate dependencies. `PROD-012` is only eligible after PROD-011b is finalized. `PROD-017`, `PROD-019`, and `PROD-020` are independently eligible after PROD-016 is finalized.

### Three-worker adapter wave

```text
PROD-016 merged
     │
     ├── PROD-017 → apps/web/**
     ├── PROD-019 → apps/android/**
     └── PROD-020 → apps/desktop/**
```

Protected surfaces are disjoint. Workers must not modify the shared client contract after PROD-016 merges. A shared-contract defect becomes a new SHARED Work Item; do not patch the same shared file in parallel branches.

`apps/android` already contains substantial offline-first capture/session infrastructure. It still needs productization against the shared task/capability contract.

`apps/desktop` is **not yet a real product surface** and must be created by PROD-020. A documentation-only placeholder does not satisfy the work item.

## Product rules

Task-first interaction:

```text
Task intent
 → current context
 → known evidence
 → evidence gaps/blockers
 → next best action
 → user action
 → server-authoritative result
```

No client may decide readiness, canonical measurement status, evidence sufficiency, verification result, intervention approval, source-of-record authority or tenant authorization policy.

The baseline golden journey is:

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

Mobile field journey:

```text
intent → capability assessment → adaptive mission → guided capture
→ reference/measurement request → offline/resume → evidence upload
→ reconstruction strategy → evidence gaps → readiness
```

Reconstruction providers including WorldSculpt, World Labs Atlas, Magic Leap Atlas and future engines remain optional behind the stable adapter. Generated completion is never automatically observed truth.

Codex remains an external orchestration substrate; AISE remains engineering-domain authority. Do not modify Codex core without an independently governed Codex change.

## Competitive requirements

Preserve the lessons in `docs/competitor-simulation-2026-09-16.md`: low-friction smartphone/360 capture, spatial context, editable/source-linked quantities, revision-aware documents, incumbent interoperability, rich issue context, bounded AI actions, plan-vs-reality, before/after, outcome visibility, uncertainty/provenance and next-best-action UX.

AISE differentiates through continuity:

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

## What cannot be proven from repository state alone

Do not mark these PASS without live evidence:

- valid Upstash account/endpoint and deployed multi-instance session continuity;
- current provider plan/allowance terms;
- actual public-browser journey against the newest deployed commit;
- real Android camera/depth/LiDAR behavior on physical devices;
- packaged desktop launch on declared supported OS(s);
- production secrets/OAuth/third-party console state;
- real provider costs/quotas beyond deterministic repository simulations.

When external access is required, record the exact operator action, credential/configuration or hardware dependency and the evidence that must be returned. Never infer success from code or fixture tests.

## Verification / merge loop

For each worker:

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
```

Before PROD-015:

```text
public URL
→ auth/demo
→ project
→ evidence
→ BOQ
→ case
→ intervention
→ outcome
```

Verify browser desktop/mobile viewports, Android/mobile adapter and desktop adapter; check console/runtime errors, API failures, empty/error/loading states, accessibility, tenant isolation, upload limits, provider-disabled behavior, persistence, Redis sessions, quotas and cross-adapter semantic equivalence.

## Final gate

`docs/PRODUCTION-READINESS-GATE.md` is binding. Only PROD-015 may declare:

```json
{
  "status": "PRODUCT-READY",
  "installable": "yes",
  "freeTierDeployed": "yes",
  "userFriendlyInterface": "yes"
}
```

The final evidence package must contain exact commit SHA, public URL, deployment ID, provider/tier evidence, fresh install transcript, browser proof, Android/mobile evidence, desktop evidence, security/isolation evidence, quota/cost evidence and the full golden journey trace.
