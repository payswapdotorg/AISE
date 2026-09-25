# AISE Productization Roadmap

## Purpose

The v2 implementation campaign is complete: 41/41 governed Work Items are finalized. The remaining program is productization plus the interactive engineering-solution workflow: turning the implemented domain and service capabilities into a product that a new user can install, reach on the public web, and use through friendly platform adapters, then extending intervention planning into an intuitive virtual construction/repair workspace that can generate an auditable BOQ.

This roadmap is intentionally separate from `spec/work-items.md`. The 41 AISE work items remain historical implementation scope. Productization work is governed here so completion of the implementation campaign is not confused with SaaS readiness.

The repository records the post-implementation architecture correction that **browser, mobile and desktop are adapters over one shared AISE product/domain core** and ACR-005's **interactive engineering solution workflow**. No client becomes a second product or engineering authority.

## Three product promises

AISE may be declared product-ready only when all three are true:

1. **Installable and usable:** a new developer can install/run the product from the repository using documented commands, and a non-developer can reach the deployed web app and complete the primary demo journey.
2. **Free-tier deployable:** the default public/demo deployment runs on documented free-tier services without requiring a paid subscription for the baseline user journey.
3. **User-friendly interface:** the public web app is a coherent product UI, not a test harness, placeholder page, raw API or architecture demo.

Heavy reconstruction/GPU providers are optional accelerators. They must never be required to make the baseline demo fail or become a paid-only product. The baseline product must provide a deterministic low-cost/demo reconstruction path and clearly identify optional provider-backed runs.

## Productization work items

Machine truth (reconciled by PROD-033 from `docs/productization-state.json`
through PROD-034): **PROD-001 through PROD-034 are finalized EXCEPT
PROD-015 and PROD-033** — PROD-033 (the production journey proof W/M/X, the
Gates A–I evidence assembly and the narrative reconciliation) is delivered by
this item, and **PROD-015 remains the only declaration gate**. On the HFX
lane, HFX-000/101/201/204/301 are finalized and **HFX-302 is in flight**.
The remaining path is exactly: PROD-033 → the Lead's final deployment of the
final merged SHA + the Gate F replay (the runbook in `docs/DEPLOYMENT.md`
§9) → PROD-015 declares. The recorded deployment facts (public URL, Vercel
deployment id, deployed application commit) are historical until
independently revalidated against the exact final merged SHA. No new
promises are made here — the table below remains the item inventory.

| ID | Depends on | Scope | Completion gate |
|---|---|---|---|
| PROD-001 | — | Runtime/build audit and executable local product entrypoints | Fresh-machine install and deterministic local start documented and verified |
| PROD-002 | PROD-001 | Production web application shell and information architecture | `/`, projects, capture, BOQ Lens, cases, interventions and settings are navigable |
| PROD-003 | PROD-001 | Production API entrypoint, health/readiness endpoints and web-to-API configuration | Public API health/readiness passes and browser app talks to it |
| PROD-004 | PROD-003 | Authentication, tenant/project isolation and safe demo account path | New user can sign in/start demo; cross-tenant isolation tests pass |
| PROD-005 | PROD-003 | Neon Postgres persistence and migration/bootstrap tooling | Production data survives redeploy and migrations are reproducible |
| PROD-006 | PROD-003 | Cloudflare R2 artifact storage and secure upload/download flow | BOQs/captures/derived artifacts round-trip through R2 with bounded access |
| PROD-007 | PROD-003 | Upstash Redis cache/job primitives with idempotency and quotas | Async jobs, rate limits and transient state work without local-memory assumptions |
| PROD-008 | PROD-003 | Apify integration as optional external acquisition/import connector | External web/document acquisition is isolated, quota-aware and disabled cleanly when unavailable |
| PROD-009 | PROD-003, AISE-012 | Provider execution gateway with deterministic free/demo fallback | Demo works without paid/GPU provider; external reconstruction providers are optional and provenance-preserving |
| PROD-010 | PROD-002, PROD-004, PROD-005, PROD-006, PROD-007, PROD-009 | Primary end-to-end UX: project → evidence/BOQ → understanding → case → intervention → outcome | A first-time user can complete the golden journey without developer tools |
| PROD-011 | PROD-010 | Vercel Hobby deployment and environment wiring | Public HTTPS production deployment is reachable and repeatable from Git |
| PROD-011b | PROD-011 | Deployed-session stability using Upstash-backed session store | Multi-instance session continuity is proven on the deployed URL; honest outage degradation |
| PROD-012 | PROD-011, PROD-011b | Deployed-browser verification, accessibility, responsive behavior and smoke tests | Automated browser checks pass on desktop/mobile breakpoints; no blocking console/runtime errors |
| PROD-013 | PROD-011 | Free-tier observability, usage caps, cost guards and failure-safe behavior | No secret leakage; services fail visibly/safely; quotas cannot silently create spend |
| PROD-016 | PROD-003 | Shared client adapter contract, capability negotiation and conformance harness only | Contract fixtures and server/API semantic conformance are defined without requiring clients to be implemented in this item |
| PROD-017 | PROD-010, PROD-016 | Browser adapter implementation and task-first/next-best-action UX | Browser completes core tasks through shared contract; semantic authority remains server-side |
| PROD-019 | PROD-016 | Android mobile adapter productization and field-journey integration | Android uses shared task/capability semantics, supports guided field capture/offline-resume, and passes mobile conformance |
| PROD-020 | PROD-016 | Desktop adapter productization | Runnable desktop shell consumes the shared contract, supports high-density review, and passes desktop conformance |
| PROD-018 | PROD-012, PROD-017, PROD-019, PROD-020 | Competitive-parity and differentiation hardening across the composed product | Competitive benchmark is re-run; required capabilities are implemented or explicitly governed as exceptions |
| PROD-021 | AISE-026, AISE-027, AISE-028, PROD-016 | Interactive Solution Graph and typed EngineeringOperation contract for building solutions | Versioned operation/state/BOQ-link contract passes deterministic and authority tests |
| PROD-022 | PROD-021 | Deterministic interactive solution engine and building operation subset | Identical inputs reproduce identical proposed states/quantities; invalid operations fail closed |
| PROD-023 | PROD-021 | Natural-language engineering operation compiler and agent interaction loop | Representative building commands resolve to typed operations or explicit clarification/unsupported states |
| PROD-024 | PROD-017, PROD-022, PROD-023 | Interactive building solution environment with direct manipulation + agent | User can create/step/revise a building solution without learning AISE internals |
| PROD-025 | PROD-021, PROD-022 | Validate → solution BOQ generation → bidirectional BOQ/step traceability | Validated solution produces a versioned BOQ whose lines navigate to solution steps/geometry and back |
| PROD-026 | PROD-024, PROD-025, PROD-018 | Interactive solution end-to-end composition and building benchmark | Complete workflow passes seeded and representative building validation with provenance/equivalence evidence |
| PROD-014 | PROD-011b, PROD-012, PROD-013, PROD-016, PROD-017, PROD-018, PROD-019, PROD-020, PROD-026 | Install/release documentation and one-command demo bootstrap | Fresh evaluator follows docs and reaches the working product without repository archaeology |
| PROD-015 | PROD-014 | Final product-readiness evidence package and declaration gate | All three product promises are objectively evidenced; no unresolved P0/P1 blockers |

## Execution waves

```text
Wave P0
  PROD-001

Wave P1
  PROD-002   PROD-003

Wave P2
  PROD-004   PROD-005   PROD-006

Wave P3
  PROD-007   PROD-008   PROD-009

Wave P4
  PROD-010

Wave P5
  PROD-011   PROD-016

Wave P6 — deployed verification + adapter composition prerequisites
  PROD-011b  (FINALIZED 2026-09-20 — deployed session-stability walk passed on production)
  PROD-012  (unblocked by PROD-011b finalization)

Wave P7 — three-worker adapter wave
  PROD-017   PROD-019   PROD-020

Wave P8
  PROD-018

Wave P9 — interactive solution contract
  PROD-021

Wave P10 — three-worker engineering-solution wave
  PROD-022   PROD-023   PROD-025

Wave P11
  PROD-024

Wave P12
  PROD-026

Wave P13
  PROD-012   (if not already finalized)
  PROD-014

Wave P14
  PROD-015
```

The Tech Lead may reduce concurrency whenever shared surfaces, provider setup, migration safety or verification capacity make three workers unsafe. Never exceed three concurrent workers.

`PROD-011b` is FINALIZED (2026-09-20): multi-instance session continuity is proven on the deployed URL (evidence/PROD-011B/). `PROD-012` (deployed-browser verification) is unblocked and may run against the Redis-backed production deployment.

`PROD-017`, `PROD-019`, and `PROD-020` are independently eligible after `PROD-016` and have disjoint protected surfaces.

`PROD-022`, `PROD-023`, and `PROD-025` are independently eligible after `PROD-021` and are intentionally separated into engine, agent compiler, and solution-BOQ surfaces so the Tech Lead can use all three worker slots concurrently.

### Concurrency contracts

Adapter wave:

```text
PROD-016 merged
     │
     ├── PROD-017 → apps/web/**
     ├── PROD-019 → apps/android/**
     └── PROD-020 → apps/desktop/**
```

Interactive-solution wave:

```text
PROD-021 merged
     │
     ├── PROD-022 → solution execution/validation engine
     ├── PROD-023 → reasoning/agent compiler
     └── PROD-025 → solution BOQ derivation/tracing
```

The three workers in each wave must not edit each other's protected surfaces or the frozen shared contract. A shared semantic defect becomes a new SHARED Work Item; it is not patched independently in parallel branches.

## Hugging Face hardening execution plan

The 30-day execution calendar is defined in `docs/30-day-productization-sprint-plan-2026-09-21.md`. It translates the dependency graph into daily three-worker assignments and reflow rules; machine state remains authoritative over the calendar.


The 2026-09-21 post-simulation UX/discoverability and deployment composition directive is maintained in `docs/post-simulation-implementation-and-deployment-plan-2026-09-21.md` and governs the next three-worker product-experience/deployment composition pass without changing the frozen architecture or dependency authority.



The HFX-derived work orders are sequenced by docs/huggingface-hardening-execution-plan.md. The execution plan is subordinate to the productization dependency graph and defines the optimized three-worker waves, the critical path, and the first 30 HF implementation days.

The scheduling optimization is to start PROD-021 as soon as PROD-016 clears rather than waiting for the full adapter wave, while maintaining the three-worker ceiling and protected surfaces. After PROD-026, the HFX hardening sequence converges on HFX-401 before PROD-014 and PROD-015.
## Golden product journey

```text
LAND ON AISE
   ↓
CREATE / OPEN DEMO PROJECT
   ↓
IMPORT BOQ + CAPTURE / UPLOAD EVIDENCE
   ↓
AISE EXPLAINS WHAT EXISTS + WHAT IS MISSING
   ↓
NEXT BEST ACTION
   ↓
OPEN BOQ LENS / SITE REALITY
   ↓
OPEN ENGINEERING CASE
   ↓
CREATE INTERVENTION SCENARIO
   ↓
STEP THROUGH PROPOSED STATES
   ↓
SEE 2D + 3D + BOQ IMPACTS
   ↓
RECORD EXECUTION / POST-WORK EVIDENCE
   ↓
COMPARE OUTCOME
```

## New interactive engineering-solution journey

This is a second first-class workflow, not a replacement for the existing one:

```text
RECONSTRUCT / OPEN CURRENT BUILDING
        ↓
DESCRIBE ENGINEERING PROBLEM / INTENT
        ↓
ENTER INTERACTIVE SOLUTION
        ↓
DIRECT MANIPULATION OR AGENT COMMAND
        ↓
OPERATION 1 → STATE 1
        ↓
OPERATION 2 → STATE 2
        ↓
... layer-by-layer ...
        ↓
VALIDATE
        ↓
GENERATE SOLUTION BOQ
        ↓
CLICK BOQ LINE → JUMP TO CONTRIBUTING STEP/GEOMETRY
        ↓
REVIEW / EXPLAIN / REVISE
```

The environment should feel game-like in interaction quality while remaining an engineering operation system with deterministic semantics, provenance and validation. It is not a free-form simulation whose geometry is treated as truth.

Phase 1 supports buildings only. The operation model is intentionally extensible to future civil works, MEP, industrial equipment, electronics and integrated circuits.

## Main journey matrix

### Field capture

```text
intent → capability assessment → adaptive mission → guided mobile capture
→ resumable upload → reconstruction strategy → evidence gaps → readiness
```

### BOQ understanding

```text
BOQ item → original source → normalized meaning → quantity/cost provenance
→ mapped reality → evidence → mismatch → next action
```

### Engineering issue

```text
issue → observations → measurements → material/condition → uncertainty
→ missing evidence → next capture → hypotheses → rules → human decision
```

### Intervention

```text
authoritative reality → proposal state 1 → proposal state 2 → final proposal
→ synchronized 2D/3D/BOQ inspection → approval/rejection
```

### Interactive solution

```text
current building reality → typed operations → proposed states
→ deterministic validation → solution BOQ → BOQ ↔ operation navigation
```

### Outcome

```text
approved intervention → execution record → post-work capture
→ before/after comparison → outcome evidence → case update
```

### Incumbent integration

```text
AISE context → source-of-record reference → connector action
→ synced result → provenance → optional reversible workflow migration
```

### Provider substitution

```text
same evidence → provider A → candidate artifact
same evidence → provider B → candidate artifact
→ compare diagnostics → preserve provenance → assurance/verification
```

Every journey must be expressible through the same domain semantics across browser, mobile and desktop adapters.

## Free-tier reference stack

The baseline deployment target is:

```text
Vercel Hobby
   │
   ├── Web UI
   └── Lightweight server/API entrypoints
          │
          ├── Neon Free Postgres
          ├── Upstash Redis Free
          ├── Cloudflare R2 Standard free allowance
          └── Apify Free (optional acquisition/import)
```

Provider-specific terms are documented in `docs/free-tier-deployment.md` and must be re-checked before every production declaration. Heavy reconstruction providers are separate optional execution backends and are not part of the claim that the baseline stack is free-tier deployable.

## Competitive benchmark requirements

Productization must explicitly preserve these capabilities learned from the 2026 competitive review:

- low-friction smartphone/360 capture and field usability;
- reality mapped to project spatial context;
- auditable/editable quantities and source-linked calculations;
- version-controlled drawings/documents and incumbent interoperability;
- fast issue creation with rich multimedia/spatial context;
- AI that performs bounded actions rather than only chat;
- plan-vs-reality and before/after comparison;
- measurable progress/outcome loops;
- human verification and visible uncertainty;
- a clear next-best-action interaction model.

The interactive solution workflow adds another benchmark: users must be able to move from a known building problem to an understandable, stepwise, validated proposed solution and then to the BOQ that explains that solution.

AISE should differentiate through the continuity of evidence → engineering understanding → intervention/solution → execution → outcome, rather than by attempting to clone every incumbent feature.

## Definition of done

`PROD-015` is the only authority for declaring productization complete. Its evidence package must contain:

- fresh-machine install transcript;
- local production-like start transcript;
- public HTTPS URL;
- Vercel deployment identifier;
- configured provider list and plan/tier evidence;
- database migration/bootstrap evidence;
- object upload/download evidence;
- Redis queue/cache/session evidence;
- optional Apify connector evidence or explicit disabled-state evidence;
- browser/mobile/desktop adapter conformance evidence;
- full golden user-journey browser recording;
- representative Android/mobile capture journey evidence;
- desktop adapter build and smoke evidence;
- interactive solution building journey recording;
- deterministic solution replay and validation evidence;
- generated solution BOQ with bidirectional step/line trace evidence;
- representative physical/building benchmark evidence;
- responsive/accessibility evidence;
- next-best-action/task-first UX evidence;
- competitive benchmark evidence;
- free-tier quota/cost guard evidence;
- security/tenant-isolation evidence;
- `bun run verify` result at the final merged SHA;
- exact commit SHA and environment/configuration fingerprint.

No worker narrative alone can satisfy the gate.
