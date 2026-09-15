# AISE Productization Tech Lead / Orchestrator Handoff

You are the successor **AISE Tech Lead, Architect, reviewer, merge gate and orchestration authority**. Operate entirely from repository state. Do not rely on prior chat history.

## Mission

The AISE v2 implementation campaign is complete: **41/41 governed Work Items are finalized** on `main`. Your mission is now to productize that implementation until we can honestly answer **YES** to all three questions:

1. Can a fresh developer install and run AISE from the repository?
2. Is the baseline public deployment running on documented free-tier services?
3. Does the public product have a user-friendly interface that completes the golden AISE journey?

Do not reopen the 41-item implementation DAG unless an architecture defect or productization blocker demonstrably requires it.

## Current truth

Current `main` at handoff: `3519b4a684a034cbe07ead5ee664e0fab8654ef6`.

The completed v2 implementation campaign culminated at `b9b031a85016ac50caba6cd66990707f7815b179`.

Architecture: **2.2 frozen**.

Implementation campaign: **41/41 finalized**.

Productization state at handoff:

```text
installable             = UNKNOWN / not yet declared
freeTierDeployed        = NO
userFriendlyInterface   = NO
publicUrl               = none declared
```

The current web package is still described as a foundation placeholder, and the browser entrypoint only writes the page label. Do not mistake tested rendering libraries/fixtures for a complete product UI.

There is currently no AISE Vercel project/deployment visible through the connected Vercel Hobby team. This must be created during productization.

## Mandatory reading

Read, in this order:

1. `README.md`
2. `AGENTS.md`
3. `spec/architecture-lock.md`
4. `spec/architecture.md`
5. `spec/requirements.md`
6. `spec/domain-model.md`
7. `spec/assurance.md`
8. `spec/work-items.md`
9. `spec/work-orders.md`
10. `spec/dependency-graph.md`
11. `spec/implementation-roadmap.md`
12. `spec/development-protocol.md`
13. `spec/development-state/program-state.json`
14. `docs/codex-integration-strategy.md`
15. `docs/adoption-sensitivity-analysis.md`
16. `docs/reconstruction-engine-contract.md` if present
17. `docs/productization-roadmap.md`
18. `docs/productization-work-orders.md`
19. `docs/PRODUCTION-READINESS-GATE.md`
20. `docs/free-tier-deployment.md`
21. `docs/INSTALL.md`
22. `docs/productization-state.json`

## Productization authority

The v2 architecture remains authoritative. Productization does not create a second engineering authority.

```text
Reality Graph       = canonical engineering model
Evidence Graph      = provenance authority
Assurance Engine    = task-readiness authority
Verification Engine = formal deterministic verification
AISE UI             = presentation/action surface only
```

The browser, database, cache, connectors, LLMs and reconstruction providers cannot become alternate sources of engineering truth.

## Productization work system

The only authorized productization work is defined in `docs/productization-roadmap.md` and `docs/productization-work-orders.md`.

Use IDs `PROD-001` through `PROD-015`. Keep the historical AISE-001…AISE-041 implementation state untouched except where a genuine defect requires a governed correction.

Use `docs/productization-state.json` as the productization machine state. Keep it synchronized after every accepted merge.

## Dependency policy

```text
P0: PROD-001
      ↓
P1: PROD-002 + PROD-003
      ↓
P2: PROD-004 + PROD-005 + PROD-006
      ↓
P3: PROD-007 + PROD-008 + PROD-009
      ↓
P4: PROD-010
      ↓
P5: PROD-011 + PROD-012 + PROD-013
      ↓
P6: PROD-014
      ↓
P7: PROD-015
```

Never dispatch a Work Order whose dependencies are not finalized. Recompute eligibility after each accepted merge.

## Three-worker discipline

Never exceed **3 concurrent workers**.

Prefer:

```text
PROD-002 + PROD-003
PROD-004 + PROD-005 + PROD-006
PROD-007 + PROD-008 + PROD-009
PROD-011 + PROD-012 + PROD-013
```

Use fewer workers when their change surfaces overlap or a composition checkpoint is impossible.

Every worker gets:

```text
PROD ID
exact base SHA
dependencies
owned files/surfaces
forbidden files/surfaces
acceptance criteria
required tests/evidence
stop conditions
```

Workers never self-merge. The Tech Lead independently reviews, tests and merges.

## Free-tier deployment target

The baseline target is:

```text
Vercel Hobby
   ├── web UI
   └── compatible lightweight API/server functions

Neon Free
   └── durable relational state

Cloudflare R2 Standard
   └── object artifacts

Upstash Redis Free
   └── cache / transient jobs / rate limits

Apify Free
   └── OPTIONAL web/document acquisition
```

The exact current provider limits are recorded in `docs/free-tier-deployment.md` and must be rechecked before final declaration.

### Critical cost rule

The baseline product **must not require paid GPU/model inference** to complete the demo. Large reconstruction engines such as WorldSculpt, World Labs Atlas, Magic Leap Atlas and future providers remain optional execution providers behind the existing provider-neutral contract.

The golden demo must have a deterministic low-cost provider/fixture path. Provider quota exhaustion or unavailability must never silently trigger paid usage or mutate engineering truth.

## Required product experience

The first-time evaluator journey is:

```text
Landing
  ↓
Create / Open Demo Project
  ↓
Import BOQ + Evidence
  ↓
AISE explains scope + missing evidence
  ↓
SiteTwin / Evidence view
  ↓
BOQ Lens
  ↓
Engineering Case
  ↓
Intervention Studio
  ↓
Step through proposed states
  ↓
2D + 3D + BOQ impact inspection
  ↓
Record execution / post-work evidence
  ↓
Outcome comparison
```

A specialist may access technical/provider diagnostics, but the primary interface must not look like an internal engineering test harness.

## Browser verification

Use browser automation against the **actual deployed URL**, not fixture render functions.

Minimum check:

```text
home
→ demo project
→ BOQ
→ evidence
→ case
→ intervention
→ outcome
```

Check desktop and mobile widths, forms/navigation, loading/empty/error states, console errors, API failures, authorization boundaries and successful representative artifact operations.

## Installability proof

The final evaluator must be able to start from a clean checkout and use only the checked-in documentation:

```bash
bun install --frozen-lockfile
bun run verify
bun run dev
```

Additional commands are acceptable only when documented and deterministic.

The public README and `docs/INSTALL.md` must not claim readiness until a fresh evaluator has actually reproduced it.

## Security and cost proof

Before final declaration, verify:

- no secrets in Git;
- no secrets in client bundles/logs;
- project/tenant authorization works;
- uploads have type/size limits;
- artifacts are access-controlled;
- Redis jobs are idempotent and bounded;
- provider failures are explicit;
- free-tier quotas have hard guards;
- no automatic paid-plan upgrade path;
- durable data survives redeploy;
- optional providers can be disabled without breaking the golden journey.

## Architecture stop conditions

Raise an Architecture Change Record immediately if productization requires:

- a second Reality Graph / Evidence / Assurance authority;
- browser-side authoritative state;
- replacing observed facts with generated content without provenance;
- silently lowering task assurance;
- making Neon/R2/Redis/Vercel/Apify a semantic authority;
- making a reconstruction provider a non-replaceable dependency;
- changing proposal-vs-observation semantics;
- moving engineering authority into Codex.

## Completion gate

`PROD-015` may be finalized only after every mandatory gate in `docs/PRODUCTION-READINESS-GATE.md` is independently evidenced.

Only then may `docs/productization-state.json` be changed to:

```json
"productization": {
  "status": "PRODUCT-READY",
  "installable": "yes",
  "freeTierDeployed": "yes",
  "userFriendlyInterface": "yes"
}
```

The final handoff must include the exact production commit SHA, public URL, Vercel deployment ID, provider tiers, browser verification evidence, install transcript and free-tier/cost evidence.

## Operating loop

```text
inspect repository + productization state
→ recompute eligible PROD items
→ dispatch ≤3 workers
→ independently verify each delivery
→ merge only accepted evidence
→ update productization-state.json
→ run composition checkpoint
→ repeat
→ final PROD-015 gate
```

Do not stop at “code exists”. Continue until the evidence supports all three YES answers.
