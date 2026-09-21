# PROD-020 — Desktop adapter conformance report

**Binding:** `desktop-rich-shell-adapter` (`apps/desktop/src/adapter/binding.ts`)
**Corpus:** the committed PROD-016 fixture corpus
(`loadCommittedFixtures()` — `packages/adapter-contract/fixtures/`)
**Harness:** `runConformance(binding, corpus)` — `@aise/adapter-contract` 1.0.0
(consumed via `workspace:*`; the shared contract was NOT modified — the
PROD-016 compatibility window).

## The binding (the adapter's REAL wire handling and presentation claims)

| Binding member | What it is in the desktop adapter |
|---|---|
| `emit` | the contract decode seam (`src/adapter/seam.ts`) — every adapter wire object decodes through the package's own decoders (`decodeX`); the same seam the live client path (`client.ts`) applies to server payloads. An undecodable payload returns `undefined` (flagged loudly, never a silent pass-through) |
| `presentedFields` | the render registry (`src/adapter/render-registry.ts`) — the field lists the high-density review surface (`review-layout.ts`) renders through the verbatim pane renderer |
| `supportedInteractionModes` | the honest implemented subset (`profile.ts`): `menu-navigation, keyboard-shortcut, table-review, panel-inspection, window-management, file-workflow, offline-queue` — 7 of the 8 modes the declared profile supports (`drag-inspect` is delegated to the embedded web renderer and honestly not claimed) |
| `profile` | the declared desktop `ClientCapabilityProfile` (`profile.ts`) — the reference `REFERENCE_DESKTOP_RICH_SHELL_PROFILE` as factual template with the adapter's own profile id |

## C0–C9 results (all PASS — `src/adapter/conformance.test.ts`)

| Check | Description (from `CONFORMANCE_CHECKS`) | Result |
|---|---|---|
| C0 | corpus-complete: every adapter wire object has ≥1 valid fixture; the named denial/failure/blocked scenario fixtures exist | **PASS** |
| C1 | profile-valid: the declared `ClientCapabilityProfile` is schema-valid | **PASS** |
| C2 | round-trip-lossless: every valid fixture's emission decodes deep-equal (authoritative fields not dropped or mutated) | **PASS** |
| C3 | wire-bytes-identical: the emission encodes to the same canonical wire bytes as the fixture | **PASS** |
| C4 | required-fields-presented: every schema-required top-level field of every valid fixture is presented | **PASS** |
| C5 | authoritative-fields-presented: every `AUTHORITATIVE_FIELDS` entry is presented (required always; optional whenever present) | **PASS** |
| C6 | interaction-modes-honest: the supported modes are a subset of the profile's derived modes | **PASS** |
| C7 | denial-reasons-surfaced: the authorization-denial scenario's `denials` are presented | **PASS** |
| C8 | operation-failure-surfaced: the operation-failure scenario's `status` and typed `failure` are presented | **PASS** |
| C9 | blocked-action-surfaced: the blocked next-best-action's `status` and `blockers` are presented | **PASS** |

The check catalogue is asserted to be exactly `C0..C9` (the stable
contract), and the golden template (`createLosslessBinding(profile)`)
passes as the harness baseline.

## Sabotage discrimination (the binding is real, not golden)

Each sabotage variant of the REAL binding FAILS the explicit checks:

| Sabotage | Fails |
|---|---|
| emission drops `AuthorizationContext.denials` | C2 + C3 |
| emission "upgrades" `InterventionScenarioSummary.epistemicState` PROPOSED→CONFIRMED | C2 + C3 |
| presentation hides `denials` | C5 + C7 |
| presentation hides `OperationResult.failure` | C8 |
| presentation hides `NextBestAction.blockers` | C9 |
| claims `gesture`/`voice-command` modes the profile does not support | C6 |

## Negotiation honesty (platform math, never authority)

With the declared profile: **BOQ review → permitted** (table-review +
keyboard-shortcut among the permitted modes); **depth capture → blocked**
(camera unavailable — capture is delegated to the mobile adapter, never
silently downgraded; blocked tasks permit NO interaction modes);
**LiDAR capture → blocked**; **offline field queue → degraded**
(non-blocking sensors shortfall); **notification broadcast → permitted**
(system notifications). The negotiation object carries no authorization,
readiness or sufficiency semantics (asserted).

## The platform-specific client conformance suite (the 12 items of spec/client-adapter-contract.md)

Demonstrated in `src/adapter/conformance.test.ts` against the adapter's
REAL modules (the corpus task world decoded through the seam), with the
end-to-end golden path in `src/journey/desktop-journey.test.ts` and the
live-path behaviors in `src/adapter/client.test.ts`:

| # | Item | Desktop demonstration |
|---|---|---|
| 1 | project open/create | `openProject` decodes the joined task-flow bundle; the workspace composes around the server `ProjectContext`; the create/open path is the shared endpoint (client tests + journey step 2) |
| 2 | task selection | the authored task intent is a typed `TaskIntent` the seam round-trips losslessly |
| 3 | evidence inspection | the dense evidence table: one row per evidence content id (provenance anchors) + one row per DECLARED gap (MISSING/WEAK first-class) |
| 4 | next-best-action rendering | actionable AND blocked render verbatim (status, prompt, blockers with reason codes) |
| 5 | evidence submission | the submission intent is a typed `TaskIntent`; the wire body IS the intent (client test asserts the submitted body decodes through the contract) |
| 6 | BOQ item inspection | the BOQ pane renders the source-of-record identity (`erp / ERP-BOQ-2026-0042`) and line-item count verbatim |
| 7 | Engineering Case inspection/update | the case pane renders `case-91ab`, `under-review`, 7 observations verbatim |
| 8 | intervention state inspection | `PROPOSED` stays `PROPOSED`, `pending-review` stays `pending-review` (never upgraded) |
| 9 | outcome comparison | `OBSERVED` stays `OBSERVED` with both post-work evidence content ids visible |
| 10 | authorization denial | grants AND typed denials render with reason codes (`missing-permission`, `forbidden-role`) |
| 11 | unavailable provider/failure state | the typed `provider-unavailable` failure renders verbatim in the operation-result pane |
| 12 | offline/resume where supported | **SUPPORTED** on this adapter: the persistent store + the TaskIntent outbox replay through the shared endpoint (declared AND implemented `offline-queue` mode; journey step 6 queues honestly on unreachable and completes only on the server's answer) |

## Gate numbers

- New desktop tests: **175** (11 files).
- Root gate: **3983 pass / 0 fail** (3808 baseline + 175 new),
  typecheck + lint clean, boundary scan clean
  (`apps/desktop` imports `packages` + bare specifiers only — no backend
  sources, no other apps), final line `VERIFY: PASS`.
- Suite inventory by file (175 total):
  - `src/adapter/profile.test.ts` — 12
  - `src/adapter/seam.test.ts` — 24
  - `src/adapter/conformance.test.ts` — 27 (C0–C9 + sabotage + the 12-item suite)
  - `src/adapter/review-layout.test.ts` — 14
  - `src/adapter/shortcuts.test.ts` — 13
  - `src/adapter/local-integrations.test.ts` — 13
  - `src/adapter/convenience-store.test.ts` — 17
  - `src/adapter/client.test.ts` — 23
  - `src/adapter/corpus-world.test.ts` — 3
  - `src/shell/policy.test.ts` — 24
  - `src/journey/desktop-journey.test.ts` — 5 (multi-step traces)
