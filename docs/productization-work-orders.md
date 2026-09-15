# AISE Productization Work Orders

These Work Orders are subordinate to `spec/architecture-lock.md`, `spec/requirements.md`, `AGENTS.md`, `docs/productization-roadmap.md` and `docs/PRODUCTION-READINESS-GATE.md`.

Each Work Order is one branch/PR. A worker must not self-merge. The Tech Lead must independently reproduce the required evidence.

## PROD-001 — Runtime / installability audit

**Owner:** ZAI
**Depends on:** none

**Scope**

Turn the existing Bun monorepo into a documented, reproducible application workspace. Establish explicit root scripts for install, dev, build, production-like local start and smoke verification. Resolve any workspace/package drift revealed by a clean install.

**Acceptance**

- clean checkout installs with `bun install --frozen-lockfile`;
- root build/dev commands are explicit;
- all required workspaces participate correctly;
- configuration validation has a deterministic failure mode;
- `bun run verify` passes from clean install;
- install instructions can be followed without source archaeology.

**Evidence**

Fresh-checkout transcript + final SHA + verify output.

## PROD-002 — Product web shell

**Owner:** ZAI
**Depends on:** PROD-001

**Scope**

Replace the placeholder browser entrypoint with a production-quality web application shell covering Dashboard, Projects, SiteTwin/Evidence, BOQ Lens, Engineering Case, Intervention Studio and Settings/Integrations.

**Acceptance**

- browser entrypoint renders actual UI rather than `textContent` placeholder output;
- all primary surfaces are reachable through clear navigation;
- loading, empty, unavailable and error states exist;
- responsive desktop/mobile layouts are usable;
- UI does not claim authority for engineering facts.

**Evidence**

Browser screenshots/recording at representative desktop and mobile widths + route smoke tests.

## PROD-003 — Production API entrypoint

**Owner:** ZAI
**Depends on:** PROD-001

**Scope**

Expose the domain capabilities required by the web app through a deployable HTTP contract with `/health` and `/readiness` and safe CORS/configuration behavior.

**Acceptance**

- web client can call the deployed API;
- health endpoint proves liveness without secrets;
- readiness reports provider availability without secrets;
- error responses are stable and documented;
- local and hosted URL configuration is explicit.

**Evidence**

HTTP smoke transcript + contract tests + deployment-compatible build.

## PROD-004 — Auth and tenant safety

**Owner:** ZAI
**Depends on:** PROD-003

**Scope**

Implement account/session behavior and project/tenant authorization without introducing a second domain authority. Provide a deterministic demo access path for evaluators.

**Acceptance**

- user can sign in or enter the controlled demo path;
- unauthorized project access is denied;
- tenant/project isolation tests pass;
- session secrets are server-side only;
- demo data cannot mutate another user's/project's authoritative state.

**Evidence**

Positive/negative auth tests + authorization matrix + browser login/demo flow.

## PROD-005 — Neon persistence

**Owner:** ZAI
**Depends on:** PROD-003

**Scope**

Connect the domain persistence layer to Neon Postgres and add deterministic migrations/bootstrap/seed paths.

**Acceptance**

- schema can be created from zero;
- migrations are ordered and repeatable;
- demo seed is idempotent;
- redeploy does not erase durable domain state;
- database credentials never enter browser bundles or logs.

**Evidence**

Fresh database migration transcript + persistence round trip + schema/version evidence.

## PROD-006 — R2 artifact storage

**Owner:** ZAI
**Depends on:** PROD-003

**Scope**

Store BOQs, images, videos and derived artifacts in Cloudflare R2 with controlled access, upload limits, metadata and retention policy.

**Acceptance**

- upload/download/delete lifecycle works;
- artifact metadata links to AISE evidence/provenance identifiers;
- access checks prevent cross-project reads;
- size/type limits are enforced;
- quota/availability failure is explicit.

**Evidence**

Artifact round-trip test + authorization test + R2 configuration evidence.

## PROD-007 — Upstash Redis primitives

**Owner:** ZAI
**Depends on:** PROD-003

**Scope**

Use Redis only for transient state, cache, rate limiting and bounded async jobs. Add idempotency and TTL discipline.

**Acceptance**

- queue/job operations are retry-safe;
- cache invalidation does not corrupt canonical state;
- rate limiting is bounded;
- TTLs are explicit;
- Redis outage degrades safely where possible.

**Evidence**

Job retry/idempotency tests + rate-limit tests + outage behavior.

## PROD-008 — Apify optional acquisition connector

**Owner:** ZAI
**Depends on:** PROD-003

**Scope**

Wrap optional Apify acquisition/import behind the existing connector boundary. No Apify dependency may become necessary for the golden demo.

**Acceptance**

- connector can be enabled/disabled via configuration;
- provider credentials never reach the client;
- free-plan/quota exhaustion is handled explicitly;
- imported artifacts retain provenance and source identity;
- product works with Apify disabled.

**Evidence**

Enabled import test + disabled-state test + quota/error simulation.

## PROD-009 — Provider execution gateway and free/demo fallback

**Owner:** ZAI
**Depends on:** PROD-003, AISE-012

**Scope**

Connect the existing reconstruction-engine registry to a hosted execution boundary without moving provider authority into the application. Add a deterministic demo provider/fixture path that runs without paid GPU/model APIs.

Providers such as WorldSculpt, World Labs Atlas, Magic Leap Atlas and future engines remain replaceable providers behind the existing contract.

**Acceptance**

- provider registry remains provider-neutral;
- external provider identity/version/checkpoint/config/evidence provenance is preserved;
- provider failure cannot lower assurance;
- demo path works without paid reconstruction compute;
- unavailable provider state is explicit and non-destructive;
- no provider-specific semantic dependency leaks into the Reality Graph.

**Evidence**

Provider contract tests + demo execution + disabled-provider test + provenance inspection.

## PROD-010 — Golden end-to-end product journey

**Owner:** SHARED
**Depends on:** PROD-002, PROD-004, PROD-005, PROD-006, PROD-007, PROD-009

**Scope**

Wire the core user journey from project creation through BOQ/evidence understanding, Engineering Case, Intervention Studio and outcome comparison.

**Acceptance**

A first-time evaluator can complete the journey without source code, API tooling or direct database access. Every screen presents actionable next steps and preserves observed/proposed distinctions.

**Evidence**

Full browser recording + backend request trace + final state inspection.

## PROD-011 — Vercel deployment

**Owner:** ZAI
**Depends on:** PROD-010

**Scope**

Create a repository-connected Vercel Hobby project with deterministic build settings and environment wiring for the public web application and compatible light API routes/functions.

**Acceptance**

- public HTTPS URL resolves;
- production build succeeds from Git;
- environment secrets are configured outside Git;
- preview and production configuration are documented;
- health/readiness endpoint is reachable;
- deployment can be repeated from repository state.

**Evidence**

Vercel deployment ID + URL + build logs + public smoke result.

## PROD-012 — Browser verification and accessibility

**Owner:** GEMINI
**Depends on:** PROD-011

**Scope**

Run automated browser verification and correct critical UX defects. Test desktop and mobile viewport behavior, route navigation, form controls, errors and console cleanliness.

**Acceptance**

- golden journey passes on deployed URL;
- no blocking console errors;
- key controls are keyboard reachable;
- mobile viewport does not hide critical controls;
- inaccessible/empty/error states are understandable.

**Evidence**

Browser verification transcript and screenshots/recording on final deployment.

## PROD-013 — Cost guards / operational safety

**Owner:** ZAI
**Depends on:** PROD-011

**Scope**

Instrument free-tier quotas, hard caps, provider state, failure handling, upload limits, logs and alerts sufficient to ensure the demo does not silently create paid usage.

**Acceptance**

- no auto-upgrade behavior;
- quota exhaustion is visible;
- optional provider outages do not corrupt authoritative state;
- logs contain no secrets;
- expensive operations are bounded and observable.

**Evidence**

Quota simulation + log inspection + provider failure drill + configuration review.

## PROD-014 — Evaluator documentation

**Owner:** SHARED
**Depends on:** PROD-011, PROD-012, PROD-013

**Scope**

Finalize `README.md`, `docs/INSTALL.md`, provider setup and public evaluation instructions. Remove stale claims and make the product self-describing.

**Acceptance**

A fresh evaluator can follow the documentation from zero to public product usage without prior chat context.

**Evidence**

Fresh-evaluator replay using only checked-in documentation.

## PROD-015 — Final declaration

**Owner:** SHARED
**Depends on:** PROD-014

**Scope**

Independently review all Gates A–G in `docs/PRODUCTION-READINESS-GATE.md` and publish the final productization state.

**Acceptance**

- all mandatory gates PASS;
- public URL exists;
- install guide works;
- free-tier provider evidence is current;
- golden browser journey passes;
- no unresolved P0/P1 product blockers;
- `docs/productization-state.json` says `PRODUCT-READY` only after evidence is attached.

**Evidence**

Signed-off readiness record, exact commit SHA, deployment ID, URL, verification transcript and provider tier evidence.
