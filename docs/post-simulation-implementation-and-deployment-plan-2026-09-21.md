# AISE — Post-Simulation Implementation + Free-Tier Deployment Plan

**Plan date:** 2026-09-21
**Purpose:** Convert the 2026-09-21 repository/user-journey review into the next governed implementation program for the Tech Lead and exactly three concurrent workers.
**Authority:** subordinate to `spec/architecture-lock.md`, ACR-004, ACR-005, ACR-006, `docs/PRODUCTION-READINESS-GATE.md`, and `docs/productization-state.json`.
**Design reference:** `https://sharenet-conformance.vercel.app` and `pectoraux/sharenet` consumer-shell patterns.

## 1. Current repository truth

- Core implementation: 41/41 historical Work Items finalized.
- Productization: 13 current productization items finalized, including PROD-011b.
- PROD-011b production session-stability walk passed on 2026-09-20.
- PROD-012, PROD-016–029 remain planned.
- Productization remains `not_ready`.
- Public alias recorded by AISE: `https://aise-tan.vercel.app`.
- The current connected Vercel account cannot retrieve the AISE deployment/project, so deployment ownership/binding must be made explicit before the next release. This is an operational access gap, not evidence that the deployed application is absent.

## 2. Roadmap graph from machine state

```text
CORE IMPLEMENTATION
└── ✅ AISE-001 … AISE-041   41/41 complete

PRODUCTIZATION
├── ✅ PROD-001
│   ├── ✅ PROD-002
│   │   └── ✅ PROD-010
│   └── ✅ PROD-003
│       ├── ✅ PROD-004
│       ├── ✅ PROD-005
│       ├── ✅ PROD-006
│       ├── ✅ PROD-007
│       ├── ✅ PROD-008
│       └── ✅ PROD-009
│           └── ✅ PROD-010
│               └── ✅ PROD-011
│                   └── ✅ PROD-011b
│
├── ✅ PROD-013
│
├── ⬜ PROD-012
│
├── ⬜ PROD-016
│   ├── ⬜ PROD-017 ─┐
│   ├── ⬜ PROD-019 ─┼─ adapter wave
│   ├── ⬜ PROD-020 ─┘
│   └── ⬜ PROD-021
│       ├── ⬜ PROD-022 ─┐
│       ├── ⬜ PROD-023 ─┼─ solution wave
│       └── ⬜ PROD-025 ─┘
│           └── ⬜ PROD-024
│               └── ⬜ PROD-026
│                   ├── ⬜ PROD-027  Layer 1
│                   ├── ⬜ PROD-028  Layer 2
│                   └── ⬜ PROD-029  Layer 3
│
├── ⬜ PROD-018  ← PROD-012 + 017 + 019 + 020
├── ⬜ PROD-014  ← release/evaluator readiness
└── ⬜ PROD-015  ← FINAL PRODUCT-READY declaration only

HF-DERIVED HARDENING
└── ⬜ HFX-000
    ├── ⬜ HFX-101 ─┐
    ├── ⬜ HFX-102 ─┤ Layer 1 candidates
    ├── ⬜ HFX-103 ─┤
    └── ⬜ HFX-104 ─┘
    ├── ⬜ HFX-201 ─┐
    ├── ⬜ HFX-202 ─┤ Layer 2 candidates
    ├── ⬜ HFX-203 ─┤
    └── ⬜ HFX-204 ─┘
    ├── ⬜ HFX-301 ─── semantic equivalence
    ├── ⬜ HFX-302 ─── Layer 3 technology substitution
    ├── ⬜ HFX-303 ─── bounded visual providers
    └── ⬜ HFX-401 ─── promotion / rollback gate
```

## 3. User-journey simulation

The simulation used the frozen architecture, current product code, existing deployed browser evidence, and the current ShareNet reference design. It is a product discoverability simulation, not a claim that every unimplemented surface has already passed browser/device verification.

### Journey 1 — first-time entry
Observed path: landing/auth gate → Enter demo/sign in → Dashboard.
Result: **emerged and understandable**. The authentication gate, demo entry and API-state honesty are clear.
Learning: preserve the calm entry experience, but the Dashboard should immediately ask what the user is trying to accomplish rather than present an architecture-oriented dashboard.

### Journey 2 — project setup
Observed path: Dashboard → Projects → project overview.
Result: **mostly emerged**. Project creation/opening exists and Project Overview is a useful hub.
Learning: the Project Overview should become the primary command center. It currently behaves more like a record summary. Add one dominant `Next best action` and task choices: Capture reality, Understand BOQ, Investigate issue, Plan work, Review outcome, Explore solution.

### Journey 3 — field capture / Layer 1
Observed capability: architecture defines capability assessment, adaptive mission, guided capture, offline/resume, reconstruction strategy and evidence-gap loop. Current web SiteTwin is mainly an inspection surface and its live projection pane is explicitly unavailable when the endpoint is absent.
Result: **capability exists in architecture/domain, discovery is weak in web UI**.
Learning: expose `Capture evidence` as a first-class task from Project Overview and mobile; show `device/capture readiness → mission → capture → processing → evidence gaps → readiness` as one progress path. SiteTwin should be the inspection result, not the only entry point.

### Journey 4 — BOQ Lens / Layer 1→2 bridge
Observed path: Project → BOQ Lens → item selection → derived interpretation → mapping/source trace.
Result: **strongly emerged**. The current surface clearly separates verbatim source from derived interpretation and preserves mapping/provenance.
Learning: keep the audit depth, but add a simple task CTA from an unresolved item: `Investigate on site`, `Open evidence`, `Compare quantity`, or `Create case`.

### Journey 5 — Engineering Case / Layer 2
Observed path: project → Engineering Case → observations → hypotheses → missing evidence → linked evidence.
Result: **capability emerged, discovery incomplete**. The surface itself is coherent, but the Dashboard's four-step journey omits the case step and users have to discover it through project navigation/deep links.
Learning: cases must be a task state in the main project journey. A user should never need to know that the subsystem is called `Engineering Case` before reaching the diagnosis workflow.
Required user language: `Investigate an issue` first; `Engineering Case` can be secondary terminology.

### Journey 6 — Intervention / execution / outcome
Observed path: Engineering Case/project → Intervention Studio → create scenario → append steps → Previous/Next layer → approval reference → execution → comparison → outcome.
Result: **substantially emerged**. The existing Intervention Studio has strong state/provenance semantics and a complete execution/outcome tail.
Learning: the current interface is a long specialist surface. Split the workflow visually into `Plan → Validate → Approve → Execute → Compare` while retaining the same underlying records. Surface `Outcome` from the project timeline/dashboard instead of burying it inside Intervention Studio.

### Journey 7 — ACR-005 interactive engineering solution
Observed capability: architecture/specification is defined in `docs/interactive-engineering-solution-workflow.md` and PROD-021 through PROD-026.
Observed current UI: no dedicated interactive-solution route/surface and no visible user entry point in the current router/navigation.
Result: **not yet emerged in the product UI**.
Learning: this is the single largest discoverability/implementation gap. Add a first-class `Solution workspace` entry from Project Overview, Engineering Case and Intervention planning. It must offer two visibly equivalent modes: `Build visually` and `Tell AI what to change`.

### Journey 8 — Evidence Envelope / reasoning transparency
Observed capability: architecture requires question/context/evidence/facts/inferences/unknowns/uncertainty/checks/result/next action/invalidation/provider.
Current UX: observations/hypotheses/missing evidence are visible, but the full causal reasoning envelope is not presented as an easy-to-understand user object.
Result: **partially emerged**.
Learning: add a compact `Why this result?` proof panel. The default view should show `What we know / What we inferred / What is missing / What was checked / What you can do next`; specialist details can expand.

### Journey 9 — provider substitution / resilience
Observed capability: technology substitution is strongly specified; Settings exposes integrations/authorization.
Result: **architecture-ready, user-facing discovery intentionally low**.
Learning: do not expose raw provider complexity in the main workflow. Show only meaningful status such as `Processing`, `Fallback used`, `Provider unavailable`, with an expandable provenance/details view.

### Journey 10 — client adapter consistency
Browser is the current product surface; Android/desktop remain planned product adapters.
Result: **not yet fully emerged across all three clients**.
Learning: task names and outcomes must stay invariant while controls change by platform. Mobile should be capture-first; desktop should be review/solution-first; browser should be the universal command center.

## 4. Cross-journey UX diagnosis

### Current strengths
- The product is unusually explicit about observed / inferred / proposed state.
- Provenance is already visible in BOQ and engineering surfaces.
- Intervention state progression and failure states are thoughtfully modeled.
- The project surface already contains enough domain coverage to become a command center.

### Current weaknesses to implement against
- Navigation is noun-first (`SiteTwin`, `BOQ Lens`, `Engineering Case`, `Intervention Studio`) rather than task-first.
- Dashboard journey is too short: it jumps from BOQ to intervention and under-emphasizes diagnosis and outcome.
- Capture/readiness is not a prominent first-class task in the browser flow.
- Interactive Solution is absent from the navigation/router despite being part of the frozen product architecture.
- Outcome is buried in Intervention Studio rather than represented as a first-class project result.
- The current visual system is more admin/data-console than calm professional consumer product.
- Long tables and internal record terminology arrive too early for a first-time user.

## 5. ShareNet-inspired design direction

Use the interaction qualities of ShareNet, not its branding:
- warm off-white background and soft graphite text;
- one restrained connected/healthy accent, with amber for review/degraded and red for failure;
- typography and whitespace as primary hierarchy;
- sparse hero section with one clear primary task;
- compact system/project state indicator;
- quiet loading/empty/error states;
- desktop persistent navigation, mobile compact navigation;
- no gradients, glassmorphism or noisy dashboard decoration;
- specialist/audit detail behind an intentional `Details` or `Proof` affordance;
- primary workflow screens should not expose internal module architecture.

AISE-specific visual adaptation:
- state chip: `Ready`, `Needs evidence`, `In review`, `Proposed`, `Executed`, `Outcome recorded`;
- project hero: one-line objective + one next action;
- journey rail: `Reality → Evidence → Scope → Issue → Solution → Validation → Execution → Outcome`;
- compact evidence/uncertainty strip;
- central workspace where applicable;
- persistent but subtle `System status` indicator for provider/deployment availability.

## 6. New implementation program for the Tech Lead + 3 workers

### Worker 1 — PRODUCT EXPERIENCE / WEB
**Owner:** WEB/UX
**Protected surfaces:** `apps/web/**`, browser-specific styles/components/tests.
**Mission:** Reframe the browser around task-first journeys and the ShareNet-inspired calm shell.

Deliver:
- new AISE visual tokens based on warm-light/graphite/teal/amber/red state semantics;
- Project Command Center as the first useful project page;
- journey rail and current-stage state;
- `Next best action` component;
- task entry cards for Capture, BOQ, Issue, Solution, Intervention, Outcome;
- user-language labels with specialist names as secondary labels;
- visible Proof/Details affordances for evidence/provenance/uncertainty;
- first-class Solution Workspace navigation hooks;
- Outcome timeline access;
- responsive mobile web composition;
- remove/debug-gate architecture language from primary journey.

Acceptance:
- a first-time user can reach every major product capability from Project Command Center without knowing internal service names;
- every journey has one obvious next action or explicit blocker;
- all existing authority/provenance/epistemic semantics remain intact;
- keyboard and mobile navigation remain accessible;
- no visual feature creates a client-side authority.

### Worker 2 — CORE / TASK ORCHESTRATION
**Owner:** CORE + AI/REASONING
**Protected surfaces:** shared task/action projections, server orchestration, solution task integration; do not redesign browser styles.
**Mission:** make the architecture's TaskIntent → NextBestAction model actually drive the UI.

Deliver:
- server-authoritative ProjectTask/TaskIntent projection;
- NextBestAction calculation from readiness, evidence gaps, BOQ health, case state, solution state and outcome state;
- compact Evidence Envelope user projection;
- Capture Mission task projection;
- `create/open/continue solution` actions once PROD-021+ are available;
- unified operation-intent seam for direct manipulation and natural-language entry;
- project timeline/state aggregation for execution and outcome;
- explicit unavailable/unsupported/needs-evidence task states;
- adapter-neutral fixtures for browser/mobile/desktop.

Acceptance:
- same project state generates deterministic, semantically equivalent task/action results for all adapters;
- readiness and evidence sufficiency remain server-authoritative;
- no agent/model can bypass deterministic validation;
- all actions retain authorization, provenance and version context.

### Worker 3 — DEPLOYMENT / QA / CONFORMANCE
**Owner:** PLATFORM/QA
**Protected surfaces:** `tools/**`, `.github/**`, deployment configuration, conformance/e2e tests and deployment documentation; no shared UI semantic edits.
**Mission:** make the product reproducibly deployable on the documented free-tier stack and prove the major journeys on the deployed build.

Deliver:
- explicit Vercel project/team binding documentation and access recovery path;
- environment contract for Vercel, Neon, R2, Upstash and optional Apify;
- preflight checks that report provider availability without exposing secrets;
- deployment smoke suite covering `/`, `/healthz`, `/readyz`, `/v1/**` and key browser routes;
- browser journey automation for both major journeys;
- desktop/mobile viewport checks;
- accessibility checks;
- quota/failure-mode tests and no-auto-upgrade assertions;
- deployment evidence bundle with commit, environment fingerprint and provider plan state;
- rollback procedure.

Acceptance:
- a fresh deployment from Git creates the same web/API shape without build-cache dependence;
- Vercel Hobby is sufficient for the baseline workload;
- Neon Free, R2 included allowance and Upstash Free are connected and verified, with Apify optional;
- session continuity passes using Upstash;
- redeploy preserves durable domain data;
- golden and interactive-solution journeys are executable on the deployed build once their parent work items are implemented.

## 7. Three-worker waves

```text
Wave S1
  W1 → browser task-first shell + design system
  W2 → task/action projection + project-state orchestration
  W3 → free-tier deployment binding + conformance harness

Wave S2
  W1 → Project Command Center + journey navigation
  W2 → Evidence/Readiness/Next-Action integration + Solution entry seam
  W3 → deployed browser journey + accessibility + quota/failure proof

Wave S3
  W1 → Solution/Intervention/Outcome UX composition
  W2 → interactive-solution task orchestration + Evidence Envelope proof
  W3 → production deployment rehearsal + rollback + final smoke

Wave S4
  all three → independent verification of composed product; only Tech Lead merges
```

Shared semantic defects are not fixed independently by W1/W2/W3. Create a shared corrective item and rerun the governance loop.

## 8. Critical path for this implementation plan

```text
PROD-016
  ↓
PROD-021
  ↓
PROD-022 + PROD-023
  ↓
PROD-024
  ↓
PROD-026
  ↓
PROD-027 + PROD-028 + PROD-029
  ↓
PROD-014
  ↓
PROD-015
```

UX integration work can proceed in parallel with these contracts, but cannot claim the ACR-005 journey complete until PROD-021 through PROD-026 are implemented and benchmarked.

## 9. Free-tier deployment plan

### Current answer
**Yes, the AISE deployment is designed and most recently evidenced on free-tier infrastructure.** The 2026-09-20 production session walk proved Vercel-hosted AISE using a live Upstash free-tier Redis database, including cross-instance session continuity, TTLs and quota metering. The repository's baseline topology specifies Vercel Hobby + Neon Free + Cloudflare R2 Standard included allowance + Upstash Redis Free, with Apify optional.

### Important qualification
The connected Vercel account available in this session does not expose the AISE deployment/project, so current-day independent provider-binding verification is incomplete. The repository's 2026-09-20 production evidence is recent and concrete, but the Tech Lead must make the hosting-account binding explicit and repeat the complete deployment gate before declaration.

### Deployment topology
```text
                         Vercel Hobby
                       Web + lightweight API
                              │
            ┌─────────────────┼─────────────────┐
            ▼                 ▼                 ▼
        Neon Free        Upstash Redis     Cloudflare R2
      durable state       sessions/jobs       artifacts
            │                 │                 │
            └─────────────────┼─────────────────┘
                              │
                         AISE domain core
                              │
                    optional external import
                              ▼
                         Apify Free
```

### Current official plan facts relevant to the implementation
- Vercel Hobby is $0/month; usage is capped and the application must not assume paid overages.
- Cloudflare R2 Standard has an included monthly free allowance of 10 GB-month storage, 1 million Class A operations and 10 million Class B operations, with free Internet egress; application limits must remain below or deliberately gate those allowances.
- Upstash Redis Free is $0 with 256 MB data, 10 GB monthly bandwidth and 500,000 monthly commands; use TTLs, bounded jobs and exact metering.
- Apify Free is $0 with $5/month prepaid usage and no credit card; it is optional and must hard-stop at exhaustion.
- Neon has a current Free plan; the exact current allowance should be queried from the Neon account/console during the deployment rehearsal rather than copied from stale documentation.

### Deployment waves

**D1 — binding and inventory**
Worker 3 identifies the real Vercel project/team, Neon project, R2 bucket and Upstash database; records non-secret IDs and plan names; preserves the public alias if appropriate.

**D2 — environment wiring**
Configure production-only secret stores: database URL, Redis REST URL/token, R2 credentials, auth secret and optional Apify/reconstruction provider secrets. Add startup validation and safe readiness output.

**D3 — durable-state proof**
Create/verify Neon schema and seed path; upload/download an artifact through R2; verify Redis session/job primitives and exact command metering; restart/redeploy and confirm durable state survives.

**D4 — deployment proof**
Deploy from a clean Git revision through the standard server-side path. Verify the committed deployment beacon/catch-all function, health/readiness, public API, browser routes and session continuity.

**D5 — user journey proof**
Run the two major browser journeys on the deployed build: Reality/Evidence → BOQ → Issue → Intervention → Outcome, and Current Reality → Problem → Solution → Validate → Solution BOQ → BOQ line → Solution step.

**D6 — cost/rollback proof**
Exercise quota exhaustion/failure behavior in controlled test environments, prove no automatic paid upgrade, record provider substitution/fallback behavior and document rollback to the last verified deployment.

## 10. New implementation acceptance gate

The next productization checkpoint is not 'all screens exist'. It is:

```text
User states a real engineering goal
        ↓
AISE identifies current context
        ↓
AISE shows evidence/readiness
        ↓
AISE gives one next best action
        ↓
User completes action
        ↓
AISE returns a server-authoritative result
        ↓
User can move forward or see exactly what is missing
```

Every major architectural capability must be reachable through this loop.

## 11. Design non-regression rules

- ShareNet-inspired visuals must not erase engineering provenance, uncertainty or epistemic status.
- Warm-light visual treatment is presentation only; authority remains server-side.
- The main shell should be sparse; specialist tables remain available behind purposeful inspection actions.
- The system status indicator must explain operational state without exposing secrets or internal stack details.
- Generated 3D/AI visuals remain clearly distinguishable from observed reality.
- The same project task must map to equivalent action semantics on browser, Android and desktop.

## 12. Exit condition

Tech Lead may close this implementation plan only when the product can be navigated by task rather than subsystem, all major journeys are reachable, the ACR-005 solution workflow is present in the product UI, the free-tier deployment is repeatable and live-verified, and the final PROD-014/015 evidence chain is ready.