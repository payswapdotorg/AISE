# PROD-017 — browser adapter conformance report

**Work item:** PROD-017 (browser adapter and task-first product UX)
**Base:** public main @ `7d21d47147a3df14a0e6138131de6d9add672d27`
(PROD-016 + PROD-021 merged)
**Contract:** `@aise/adapter-contract` v1.0.0 — consumed, never modified (the
PROD-016 compatibility window; `git diff` against the base shows zero changes
under `packages/adapter-contract/**` and `spec/client-adapter-contract.md`).

## The browser binding

`createBrowserConformanceBinding()` (`apps/web/src/app/adapter-binding.ts`,
binding id `browser-web-adapter`) is the app's REAL binding — not a golden
template:

| Binding member | What it is backed by |
|---|---|
| `profile` | `BROWSER_ADAPTER_PROFILE` (`apps/web/src/app/adapter-profile.ts`) — the declared browser `ClientCapabilityProfile`, facts taken VERBATIM from the contract's `REFERENCE_BROWSER_PROFILE` (the factual template the work packet mandates): responsive expanded screen, keyboard+pointer input, no sensors, still+video camera via getUserMedia (no depth/LiDAR), session-cache offline storage, in-app notifications, universal https deep links; own profile id `profile-browser-web-adapter` (stable constants; no clock, no randomness). |
| `emit` | the SEAM decode registry (`task-contract.ts` — the same decoders `app/api.ts` applies to live server payloads). The emission is the DECODED value the app actually holds; an undecodable payload returns `undefined` so the harness flags it. |
| `presentedFields` | the render registry (`contract-objects.ts` `CONTRACT_PRESENTED_FIELDS`) — the same field lists `ContractObjectFields` renders in the semantic-objects audit card. A test asserts the renderer's output contains every registry field, so the binding can never claim more than the UI shows. |
| `supportedInteractionModes` | the honest implemented subset: `menu-navigation, table-review, panel-inspection` (the primary nav rail/drawer, the data tables, the card/pane inspection surfaces). The profile's facts support more (keyboard-shortcut, drag-inspect, camera-capture) — this build does not implement them and does not claim them (C6: a subset, never a superset). |

## C0–C9 results (the shared harness over the committed corpus)

`runConformance(createBrowserConformanceBinding(), loadCommittedFixtures())`
— run in `apps/web/src/app/conformance.test.tsx`:

| Check | Result | Detail |
|---|---|---|
| C0 corpus-complete | **PASS** | every adapter wire object has ≥1 valid fixture; the denial/failure/blocked-action scenario fixtures exist |
| C1 profile-valid | **PASS** | the declared browser profile is schema-valid |
| C2 round-trip-lossless | **PASS** | every valid fixture's seam-decoded emission is deep-equal to the fixture |
| C3 wire-bytes-identical | **PASS** | the emission encodes to the same canonical wire bytes |
| C4 required-fields-presented | **PASS** | the render registry covers every schema-required top-level field of every valid fixture |
| C5 authoritative-fields-presented | **PASS** | every `AUTHORITATIVE_FIELDS` entry is presented (required always; optional whenever present) |
| C6 interaction-modes-honest | **PASS** | the implemented-modes claim is a strict subset of the profile's derived modes |
| C7 denial-reasons-surfaced | **PASS** | the authorization-denial scenario surfaces `denials` |
| C8 operation-failure-surfaced | **PASS** | the operation-failure scenario surfaces `status` + `failure` |
| C9 blocked-action-surfaced | **PASS** | the blocked-action scenario surfaces `status` + `blockers` |

**Overall: `passed: true`.**

### Discrimination (the binding is real, not golden)

Sabotage variants of the binding each FAIL the explicit checks (same test
file):

- an emission that drops the `denials` field → **C2, C3 FAIL**;
- a presentation that hides `denials` → **C5, C7 FAIL**;
- a presentation that hides the operation `failure` → **C8 FAIL**;
- a presentation that hides blocked-action `blockers` → **C9 FAIL**;
- a mode claim the profile does not support (`gesture`, `voice-command`) →
  **C6 FAIL**;
- the golden `createLosslessBinding(profile)` template still passes (the
  harness baseline).

## Platform capability negotiation (honest, never authority)

`negotiateCapabilities(BROWSER_ADAPTER_PROFILE, requirements)` over the five
committed reference requirement sets:

| Requirement set | Outcome | Non-satisfied domains (verbatim reasons rendered) |
|---|---|---|
| field-depth-capture | **blocked** | input:unsupported, camera:unsupported, offline-storage:unsupported |
| boq-review | **permitted** | (all satisfied) |
| offline-field-queue | **blocked** | sensors:unsupported, offline-storage:unsupported, notifications:unsupported |
| lidar-capture | **blocked** | camera:unsupported |
| notification-broadcast | **degraded** | notifications:unsupported |

The blocked tasks permit NO interaction modes — the task-first UX renders the
explicit blocked reason (with escalation/delegation guidance: switch to a
depth-capable device — the mobile adapter — or a specialist instrument) and
NEVER a pretend-actionable affordance. Negotiation changes capture method and
operator burden; it never changes the assurance requirement.

## The platform-specific client conformance suite (the 12 items)

`spec/client-adapter-contract.md` "Client conformance suite", exercised in
`apps/web/src/app/conformance.test.tsx` part 3 over the app's real modules:

| # | Suite item | Evidence |
|---|---|---|
| 1 | project open/create | the journey's open step + `loadProjectsLive`/`createProjectLive` driven end-to-end in `golden-journey.test.tsx` steps 1/1b (the identity read is requester-guarded; the write posts the exact body) |
| 2 | task selection | the task-type vocabulary is offered (the contract's advisory `TASK_TYPES`); `taskIntentFromSelection` authors the typed wire object (W-R3) and it round-trips through the seam |
| 3 | evidence inspection | the EvidenceSummary's items, content ids and gaps render (test renders `ContractObjectFields` + the panel asserts `gap-4471`, `MISSING`) |
| 4 | next-best-action rendering | actionable AND blocked render verbatim (`NextBestActionPanel` static render: prompt, both blockers, details) |
| 5 | evidence submission | the picker's `taskIntentForEvidenceSubmission` emits a typed TaskIntent targeting the records' OWN content ids |
| 6 | BOQ item inspection | the BOQContext renders with the source-of-record identity (`erp`/`ERP-BOQ-2026-0042`, 1284 line items) |
| 7 | Engineering Case inspection/update | the case summary renders verbatim (`under-review`, 7 observations); the update legs are the write paths of `create-forms`/`outcome-forms` (W-R3 intents + the exact server bodies) |
| 8 | intervention state inspection | the scenario summary renders; `PROPOSED` stays `PROPOSED` (never upgraded) |
| 9 | outcome comparison | the outcome summary renders; `OBSERVED` stays `OBSERVED` with its post-work evidence ids |
| 10 | authorization denial | the AuthorizationContext's denials surface with reason codes verbatim (`missing-permission`, `forbidden-role`) — W-R1 |
| 11 | unavailable provider/failure state | the OperationResult's typed `provider-unavailable` failure renders verbatim (`OperationResultNote`); the live-404 unavailable-provider state is asserted in `golden-journey.test.tsx` |
| 12 | offline/resume where supported | **honestly NOT SUPPORTED on this browser adapter**: the profile declares `session-cache` offline storage (no resumable queue); no `offline-queue` interaction mode is derived OR claimed — the unknown/not-supported discipline, never a conflation |

**Browser adapter conformance passes.**
