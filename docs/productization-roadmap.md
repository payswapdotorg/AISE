# AISE Productization Roadmap

## Purpose

The v2 implementation campaign is complete: 41/41 governed Work Items are finalized. The remaining gap is productization: turning the implemented domain and service capabilities into a product that a new user can install, reach on the public web, and use through a friendly interface.

This roadmap is intentionally separate from `spec/work-items.md`. The 41 AISE work items remain historical implementation scope. Productization work is governed here so completion of the implementation campaign is not confused with SaaS readiness.

## Three product promises

AISE may be declared product-ready only when all three are true:

1. **Installable and usable:** a new developer can install/run the product from the repository using documented commands, and a non-developer can reach the deployed web app and complete the primary demo journey.
2. **Free-tier deployable:** the default public/demo deployment runs on documented free-tier services without requiring a paid subscription for the baseline user journey.
3. **User-friendly interface:** the public web app is a coherent product UI, not a test harness, placeholder page, raw API or architecture demo.

Heavy reconstruction/GPU providers are optional accelerators. They must never be required to make the baseline demo fail or become a paid-only product. The baseline product must provide a deterministic low-cost/demo reconstruction path and clearly identify optional provider-backed runs.

## Productization work items

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
| PROD-012 | PROD-011 | Browser verification, accessibility, responsive behavior and smoke tests | Automated browser checks pass on desktop and mobile breakpoints; no blocking console/runtime errors |
| PROD-013 | PROD-011, PROD-012 | Free-tier observability, usage caps, cost guards and failure-safe behavior | No secret leakage; services fail visibly and safely; free-tier quotas cannot silently create spend |
| PROD-014 | PROD-012, PROD-013 | Install/release documentation and one-command demo bootstrap | A fresh evaluator follows docs and reaches the working product without repository archaeology |
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
  PROD-011   PROD-012   PROD-013

Wave P6
  PROD-014

Wave P7
  PROD-015
```

The Tech Lead may reduce concurrency whenever shared surfaces, provider setup or migration safety make three workers unsafe. Never exceed three concurrent workers.

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

The demo journey must work with seeded fixtures so an evaluator does not need a physical phone, GPU, external reconstruction subscription or third-party enterprise system to understand the product.

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

## Definition of done

`PROD-015` is the only authority for declaring productization complete. Its evidence package must contain:

- fresh-machine install transcript;
- local production-like start transcript;
- public HTTPS URL;
- Vercel deployment identifier;
- configured provider list and plan/tier evidence;
- database migration/bootstrap evidence;
- object upload/download evidence;
- Redis queue/cache evidence;
- optional Apify connector evidence or explicit disabled-state evidence;
- golden user-journey browser recording/screenshots;
- responsive/accessibility smoke evidence;
- free-tier quota/cost guard evidence;
- security/tenant-isolation evidence;
- `bun run verify` result at the final merged SHA;
- exact commit SHA and environment/configuration fingerprint.

No worker narrative alone can satisfy the gate.
