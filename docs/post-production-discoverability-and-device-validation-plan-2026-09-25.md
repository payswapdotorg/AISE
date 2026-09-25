# AISE — Post-Production Discoverability & Device Validation Implementation Plan

## CURRENT EXECUTION OVERRIDE — 2026-09-25

This plan is the governing post-production hardening document, but its original baseline section is historical.

- PROD-001 … PROD-034 are finalized.
- PROD-015 is finalized; its declaration applies to final SHA 91f1b449d6ea5cafd6a4e58e8533fea8d24ed5b7.
- Productization state is ready.
- Current main has advanced after the declaration; resolve live HEAD before every deployment/evidence decision.
- Parent orchestration issue: #14 POST-000.
- R0 workers: #15 POST-001, #16 POST-002, #17 POST-003.
- R1 workers: #18 POST-004, #19 POST-005, #20 POST-006.
- Final authority for successor orchestration: docs/TECH-LEAD-HANDOFF.md.

Do not interpret the historical baseline below as the current HEAD or as evidence that the current tip is deployed.

---

**Date:** 2026-09-25  
**Audience:** successor Tech Lead / Architect + up to 3 concurrent workers  
**Authority:** repository state + `docs/PRODUCTION-READINESS-GATE.md`  
**Relationship to product readiness:** this is post-declaration hardening and evidence-refresh work. It does not lower or replace the existing PROD-015 gate.

## 1. Baseline

At the start of this plan:

- Current main tip: `d231287f0a1a90521d74be8cccea4c196736f286`
- PROD-001…PROD-034: finalized
- HFX-000, HFX-101, HFX-201, HFX-204, HFX-301, HFX-302, HFX-303, HFX-401: finalized
- Productization state: `ready`
- PROD-015 declaration evidence was produced at `91f1b449d6ea5cafd6a4e58e8533fea8d24ed5b7`
- Recorded production deployment: `dpl_9G5gsVbGzpbWGBewyQUE4QhgadFY`
- Recorded public URL: `https://aise-tan.vercel.app`
- PROD-015 W/M/X replay: W 24/24 PASS, M 19 PASS + BLOCKED_NO_KVM, X 12/12 PASS
- E2B Android station: Gradle trio PASS, field journey PASS, emulator BLOCKED_NO_KVM, physical-device lane explicitly not yet executed.

**Important release-hygiene finding:** main has advanced past the exact SHA cited by the PROD-015 deployment declaration. The latest two commits materially update `api/[...path].mjs`, evidence records and state. Therefore the recorded production-ready declaration is valid for its stated final SHA, but the current main tip must be deployed and replayed before it is treated as the currently deployed artifact.

## 2. Simulation-derived product findings

The repository implementation now exposes nearly the whole architecture, but a user can still miss some capabilities or encounter awkward transitions.

### A. Front door / vocabulary

Current primary navigation exposes Dashboard, Projects with many sub-links, and Settings / Integrations. Several labels are internal/demo-oriented (for example "Corpus", "Pilot", "Scenario", "Demo").

**Desired behavior:** ordinary users should see task language first:

```text
Capture
Investigate
Understand costs
Build solution
Review outcome
```

Specialist concepts remain available but secondary.

### B. Project command center

The Project Overview is now the strongest orchestration surface:

```text
TaskFlowStrip
ProjectSurfaceNav
CanonicalActionBar
TaskCompositionPanel
context
reality
BOQ
missing evidence
plan vs reality
```

Keep this as the command center.

### C. Capture

Capture is now first-class and includes:

- guided evidence-gap mission;
- browser upload;
- Web-Crypto content addressing;
- server-side immutable ingestion;
- typed STORED/DUPLICATE/refusal states;
- explicit browser-vs-mobile capability distinction.

Remaining UX improvement: make the cross-device handoff obvious. A user who starts a field task on web should be able to understand immediately that the next action belongs on the phone, with a direct handoff/deep-link/task identity rather than discovering the mobile journey through documentation.

### D. BOQ

Source-BOQ import is now first-class.

Remaining issue: live BOQ Lens currently opens the first returned import rather than providing a clear import/revision selector.

The product must support:

```text
Project
→ BOQ documents
→ import/revision selection
→ inspect
→ trace
```

while keeping source BOQ and solution BOQ strictly separate.

### E. Evidence Envelope

The "Why this result?" card now exists and is conceptually correct.

Keep it compact in the primary journey. Put deeper record-level details behind progressive disclosure rather than forcing engineers to parse internal identifiers.

### F. Investigate

Engineering Case is discoverable through the canonical action and contains observations, hypotheses and missing evidence distinctly.

Improve the action bridge so a user can go directly from a missing-evidence declaration to:

```text
capture this evidence
→ on this device
→ for this case
```

rather than merely landing on a generic Capture surface.

### G. Build solution

Intervention Studio is mature and the Interactive Solution workspace is live.

However, the canonical "Build solution" action currently enters Intervention Studio first. The advanced interactive solution path is therefore one navigation step deeper than necessary.

The build-solution entry should immediately present:

```text
Build an intervention
Build interactively
```

with the distinction explained in ordinary language.

### H. Intervention / execution

Keep the conceptual sequence visible:

```text
Plan
→ Validate
→ Approve
→ Execute
→ Compare
```

The existing workspace has these capabilities; the plan is to improve progressive disclosure so a first-time user sees the current stage and the next allowed action instead of a long technical surface.

### I. Outcome

Outcomes are now a first-class surface with:

- execution records;
- outcome records;
- before/after;
- plan-vs-reality;
- search and links back to source records.

Preserve this as a terminal stage of the canonical journey.

### J. Integrations

Contextual incumbent discovery now exists.

The remaining improvement is operational: where a contextual source-of-record is visible, the user should see the applicable next action or a single honest "not configured/unavailable" state without having to reason about the Settings implementation.

### K. Specialist / technical UI

The architecture exposes valuable diagnostics: semantic objects, adapter capabilities, provider status, provenance, evidence records and boundary labels.

These are useful for expert review but should not dominate the default journey.

Create a specialist-details layer with progressive disclosure:

```text
User action
→ plain-language result
→ Why this result?
→ technical evidence/details (optional)
```

## 3. Web journey to preserve

### W1 — Project understanding

```text
LAND
→ PROJECT
→ BOQ IMPORT / SELECT REVISION
→ CAPTURE / UPLOAD
→ REALITY + EVIDENCE
→ WHY THIS RESULT?
→ INVESTIGATE
```

### W2 — Solution

```text
CASE / PROBLEM
→ BUILD SOLUTION
→ INTERACTIVE WORKSPACE
→ DIRECT MANIPULATION
→ NATURAL LANGUAGE
→ VALIDATE
→ SOLUTION BOQ
→ BOQ LINE
→ STEP
→ GEOMETRY
→ REVISE
```

### W3 — Delivery / outcome

```text
APPROVE
→ EXECUTE
→ POST-WORK EVIDENCE
→ OUTCOME
→ BEFORE / AFTER
→ PLAN VS REALITY
```

## 4. Android journey to preserve

The Android application is a real Gradle/Compose application in `apps/android` with:

- :core pure JVM domain/runtime;
- :app Android runtime;
- CameraX still/video capture;
- rotation-vector metadata;
- file-backed local persistence;
- event-sourced session journal;
- crash recovery;
- adaptive field mission;
- offline-first operation;
- shared adapter contract;
- explicit capability negotiation;
- server submission.

The validation ladder is:

```text
E2B build/test
→ emulator if available
→ physical device
```

Never upgrade one layer's evidence class to another.

## 5. Combined Web + Android journey

The user should experience this as one workflow:

```text
WEB
define project / issue / evidence gap
        ↓
AISE creates a field task
        ↓
ANDROID
open task
→ capability assessment
→ guided capture
→ pause/resume
→ finalize
        ↓
SERVER
ingest + verify + preserve provenance
        ↓
WEB
review evidence
→ Why this result?
→ Investigate
→ Build solution
→ Validate
→ Solution BOQ
→ Execute
        ↓
ANDROID
post-work capture
        ↓
WEB
Outcome / Before-After
```

The adapter boundary must preserve project id, task id, evidence id/content id, provenance, version context and epistemic state.

## 6. Three-worker execution plan

### Wave 0 — Evidence freshness and repository hygiene

**Worker 1 — release state**
- reconcile `docs/productization-state.json`;
- correct any placeholder/literal SHA values;
- align PROD/HFX inventory with actual main history;
- refresh current deployment metadata;
- explicitly distinguish declaration SHA from current main SHA.

**Worker 2 — Android/device**
- refresh the E2B station scripts/docs if required;
- prepare the physical-device lane;
- validate APK install/launch on real hardware;
- exercise camera permissions, still, video, sensor metadata, pause/resume, process restart and sync;
- capture device artifacts without secrets.

**Worker 3 — verification**
- independently run `bun run verify`, typecheck, lint and build at current main;
- deploy current exact main SHA;
- run deployed-check;
- replay W1/W2/W3 plus M/X;
- verify zero secret leakage and clean runtime/console state;
- record the exact environment fingerprint.

### Wave 1 — User-flow hardening

After Wave 0 evidence establishes the current baseline:

**Worker 1 — navigation / interaction**
- clean primary navigation vocabulary;
- make "Build solution" expose Interactive Solution directly;
- make Plan → Validate → Approve → Execute → Compare visually staged;
- reduce specialist terminology in default views;
- preserve specialist details behind progressive disclosure.

**Worker 2 — cross-device / BOQ**
- web → mobile task handoff;
- mobile task identity/deep-link continuation;
- BOQ import/revision selector;
- missing-evidence → capture-task bridge;
- post-work capture return path.

**Worker 3 — acceptance**
- write browser/mobile/combined discoverability tests for every new bridge;
- replay all affected journeys in live Chromium + device;
- verify route completeness and no orphaned surfaces;
- verify accessibility at desktop/mobile breakpoints.

### Wave 2 — Final cross-adapter proving

Only after Wave 1 merges:

- run W, M and X on the exact current deployment;
- require the physical Android lane for physical-capture claims;
- classify every step as deterministic, synthetic, emulated or physical;
- prove cross-adapter identity/provenance continuity;
- prove direct/NL equivalence again after navigation changes;
- prove source-BOQ/solution-BOQ separation;
- prove post-work evidence creates outcome visibility;
- store all evidence under a new dated evidence directory.

## 7. Acceptance criteria

All of the following must be true before this plan is considered complete:

### Discoverability
Every architectural capability has at least one obvious user-facing entry from an appropriate task context.

### No orphaned capabilities
No implemented product surface requires source-code knowledge or specialist navigation to reach.

### Cross-device continuity
A web-originated field task can be continued on Android and returned to web without losing identity or provenance.

### Android
The APK installs and launches on a physical supported device; camera/video/runtime permission behavior is tested; capture/session recovery is exercised.

### Web
The current deployed SHA passes the W journey and the interactive solution journey with real browser evidence.

### Combined
The X journey proves actual field-to-office continuity, not merely two disconnected test harnesses.

### Engineering truthfulness
No client, LLM, renderer or provider becomes authoritative. Observed, inferred, confirmed and proposed remain distinct.

### Technology substitution
Existing HFX gates remain green; new UI/adapter work cannot bypass the provider contracts.

### Release hygiene
The declaration evidence and the deployed application SHA are synchronized. If main advances again, readiness evidence is refreshed rather than assumed.

## 8. Definition of done

The Tech Lead closes this plan only when the repository contains:

- current handoff;
- current roadmap;
- current machine state;
- E2B station instructions;
- physical-device evidence;
- current deployed environment fingerprint;
- W/M/X journey records at the same current SHA;
- discoverability/route test evidence;
- BOQ revision-selection evidence;
- cross-device handoff evidence;
- direct/NL equivalence evidence;
- outcome-loop evidence.

The productization declaration remains governed by `docs/PRODUCTION-READINESS-GATE.md`; post-production hardening must not silently rewrite the meaning of PASS.

## 9. Operating rule for the Tech Lead

Always:

```text
READ CURRENT MAIN
→ READ MACHINE STATE
→ RECOMPUTE
→ DISPATCH ≤3
→ HARVEST
→ INDEPENDENTLY VERIFY
→ MERGE
→ REFRESH STATE
→ DEPLOY EXACT SHA
→ REPLAY W/M/X
→ UPDATE EVIDENCE
```

Never assume a prior "ready" result applies to a later SHA without evidence.
