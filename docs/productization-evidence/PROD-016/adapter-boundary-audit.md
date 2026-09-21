# PROD-016 — Adapter boundary audit: duplicated authoritative semantics in the CURRENT web and Android code

**Audit scope (work order):** "audit the current web and Android code for duplicated
authoritative semantics and record any required adapter-local removals."
**Audited tree:** `apps/web/**` and `apps/android/**` at base SHA
`1068ebbbb5eb9ba9335b8d5a77e28fb04aeb74d2`.
**Audit basis:** `spec/architecture-lock.md` (Authority #8/#9, client-adapter
boundary), ACR-004 (clients own presentation and platform interaction only),
`spec/client-adapter-contract.md`, and the new
`packages/adapter-contract/` (the shared semantic boundary this audit
delimits).

## Overall verdict

**No client-side authority VIOLATIONS exist in either app.** Both `apps/web`
and `apps/android` already implement the no-authority discipline honestly:
authoritative vocabularies (authorization decisions, epistemic statuses,
intervention/proposal semantics, source-of-record identity) are carried
VERBATIM in locally-defined STRUCTURAL MIRRORS of backend shapes — never
re-derived, never re-validated semantically, never mutated. Both apps state
and test this discipline explicitly.

**Duplicated authoritative semantics DO exist as adapter-local structural
mirrors** (a maintenance/drift hazard, not an authority breach): the web
maintains hand-written mirror types for exactly the semantic families the
shared adapter contract now owns, and Android maintains an adapter-local
capability/mission negotiation whose verdict model overlaps the shared
negotiation semantics. The required adapter-local removals are recorded
below for the PROD-017 (web) and PROD-019 (Android) workers. PROD-020
(desktop) has no existing code (`apps/desktop/` does not exist — correctly
absent at this SHA); it must consume the shared contract from day one.

Boundary-matrix context: `tools/lib/boundaries.ts` forbids `apps/` from
importing `backend/` sources, which is WHY both apps maintain structural
mirrors instead of importing backend types. The shared adapter contract
now provides the sanctioned, versioned, checkable alternative: mirrors of
the twelve semantic objects' scope can be replaced by
`@aise/adapter-contract` consumption (apps MAY import packages).

## apps/web — file-by-file findings

### `src/shell/` (the AISE-040 adoption shell)

| File | Finding | Class |
| --- | --- | --- |
| `model.ts` | **Duplicated authoritative semantics (highest-density file).** Structural mirrors of the AISE-036 authorization vocabulary (`ShellPermissionGrant`, `ShellAuthorizationRefusal`, `ShellAuthorizationDecision`, `ShellMembershipScope`, `ShellPermissionTarget` — permission strings and refusal codes carried verbatim, "the authorization AUTHORITY stays in the identity module"), the AISE-037 integration vocabulary (system classes, capabilities, `ExternalReference` source-of-record fields), the epistemic status vocabulary on reality nodes (OBSERVED/INFERRED/CONFIRMED), and pane view models for context/reality/BOQ/evidence/case. All carried verbatim (no second canonical model) — but every one of these mirror families is exactly the semantic scope the shared adapter contract now owns (`AuthorizationContext`, `ProjectContext`, `BOQContext`, `RealitySummary`, `EvidenceSummary`, `EngineeringCaseSummary`). Also defines the shell's OWN presentation vocabularies (error codes, omission reasons, binding statuses, deep-link modules) which are legitimately client-owned. | mirror (no violation) |
| `ports.ts` | Read-only data-access seam (exactly one read member per port; no write path by type and by test). Authorization decisions arrive through the `decide` port and are relayed — semantically the server-provided `AuthorizationContext` pattern. | compliant seam |
| `actions.ts` | Authorized-connector-action broker: an action is enabled ONLY on an explicit ALLOWED port decision; refusals render DISABLED with the refusal reason named verbatim; an unavailable authorization port renders an explicit unknown status. Equivalent to rendering `AuthorizationContext` grants/denials; the broker itself "NEVER decides permissions". | compliant (maps to contract) |
| `render.ts`, `nav.ts`, `index.ts`, `fixtures.ts` | Presentation rendering, deep-link address codec, public exports, committed fixtures. No authoritative semantics defined; they consume the model.ts mirrors. | presentation |
| `model.test.ts`, `ports.test.ts`, `actions.test.ts`, `render.test.ts`, `nav.test.ts`, `session.test.ts` | Tests pinning the mirror/validation discipline. | tests |

### `src/viewer/` (the AISE-027 synchronized intervention viewer)

| File | Finding | Class |
| --- | --- | --- |
| `model.ts` | **Duplicated authoritative semantics.** Structural mirrors of the AISE-026 `InterventionScenario` family (proposed property/state shapes; the PROPOSED-only epistemic seal; the content-derived `stateId` identity carried verbatim and "NEVER re-derived"; node kinds, step kinds, scenario statuses, geometry-ref kinds as verbatim backend vocabularies typed as plain `string`). The shared contract's `InterventionScenarioSummary` now owns the summary-level semantics (epistemicState, approvalState, version); the viewer's detailed per-state projection remains legitimately local. | mirror (no violation) |
| `read.ts`, `sync.ts`, `projection.ts`, `paneboq.ts`, `render.ts`, `svg.ts`, `format.ts`, `fixtures.ts`, `index.ts`, `errors.ts` | Read-only projection of server-assembled input; synchronized stable ids; 3D/2D/BOQ pane projection from ONE frame. No authority. | presentation |
| `model.test.ts`, `read.test.ts`, `sync.test.ts`, `panes.test.ts`, `render.test.ts` | Tests. | tests |

### `src/workspace/` (the AISE-021 browser engineering workspace)

| File | Finding | Class |
| --- | --- | --- |
| `model.ts` | Structural mirrors of the AISE-020 `Drawing2D` family and the AISE-016 `GraphVersion` slice. Read-only display data; review state arrives server-computed. | mirror (no violation) |
| `wireframe.ts`, `svg2d.ts`, `selection.ts`, `render.ts`, `format.ts`, `fixtures.ts`, `index.ts`, `errors.ts` | Projection/presentation. | presentation |
| `wireframe.test.ts`, `svg2d.test.ts`, `workspace.test.ts` | Tests. | tests |

### `src/boqlens/` (the AISE-024 BOQ Lens)

| File | Finding | Class |
| --- | --- | --- |
| `model.ts` | Structural mirrors of AISE-014 `Interpretation`/`ItemInterpretation` and AISE-017 `MappingEntry`. Original source preserved verbatim; derived values marked "derived". | mirror (no violation) |
| `derive.ts` | **Client-side derived aggregations** (section grouping, contractor location grouping, amount rollups with contributing items/cell refs). Presentation-layer aggregation over already-parsed input; money discipline (no conversion, honest exclusion). Legitimately client-owned presentation derivation — recorded as a standing constraint: it must never become an alternate BOQ authority (the server BOQ domain and source BOQs remain authoritative). | presentation derivation |
| `health.ts` | **Client-side BOQ health stats** incl. the provenance invariant (`claimsWithoutProvenance`, fabricated-provenance detection). Derived quality metrics over input — presentation-layer; same standing constraint. | presentation derivation |
| `claims.ts`, `explain.ts`, `search.ts`, `render.ts`, `format.ts`, `fixtures.ts`, `index.ts`, `errors.ts` | Claims grounding, explanation, search, rendering. | presentation |
| `explain.test.ts`, `grounding.test.ts`, `render.test.ts` | Tests. | tests |

### `src/app/` (the PROD-002/004 product shell)

| File | Finding | Class |
| --- | --- | --- |
| `api.ts` (1966 lines) | The same-origin API seam. Live adapters "STRUCTURALLY VALIDATE the responses before use" against the frozen libraries' local mirror models — the exact validation layer the shared adapter contract now owns canonically for the twelve semantic objects. This is the designated consumption point for `@aise/adapter-contract` decoders. Typed failures (network/http/invalid); never throws; demo fallback explicitly badged. | seam (mirror validation) |
| `gate.ts` | Auth-gate state machine: reacts to server 401s; "session state is server-side; the client only reacts"; never decides authorization. | compliant |
| `demo.ts` | Demo dataset simulating server records (explicitly badged when the API is unavailable). Must remain labeled demo — never presented as live authority. | demo data |
| `create-forms.ts`, `outcome-forms.ts`, `evidence-picker.ts` | Client-authored forms for project/case/outcome/evidence actions — the user-intent authoring surface that should emit `TaskIntent` contract objects. | client-authored intent |
| `components.tsx`, `App.tsx`, `AppShell.tsx`, `AuthGate.tsx`, `surfaces/*.tsx` (8 surfaces), `router.ts`, `resource.ts`, `format.ts`, `environment.ts` | Presentation, routing, resource loading. | presentation |
| `api.test.ts`, `api.auth.test.ts`, `gate.test.ts`, `router.test.ts`, `resource.test.ts`, `create-forms.test.ts`, `outcome-forms.test.ts`, `evidence-picker.test.ts`, `surfaces-create.test.tsx`, `app.test.ts` | Tests. | tests |

### `src/main.tsx`, `src/styles/`, root `index.html`, `vite.config.ts`, `package.json`

Presentation bootstrap; no authoritative semantics.

### apps/web — required adapter-local removals (recorded for PROD-017)

- **W-R1 (retire the authorization mirror):** replace the hand-maintained
  AISE-036 structural-mirror types in `shell/model.ts`
  (`ShellPermissionGrant`/`ShellAuthorizationRefusal`/`ShellAuthorizationDecision`/scope/target)
  and `validateAuthorizationDecision` with decoding of the contract's
  `AuthorizationContext` (grants + typed denials) at the `app/api.ts` seam;
  keep only presentation wrappers (badges, disabled states, refusal
  naming) locally. The relay semantics in `actions.ts`/`ports.ts` stay.
- **W-R2 (decode the semantic objects at the seam):** in `app/api.ts`,
  decode the server responses for project context, reality readiness,
  BOQ context, evidence summaries, engineering-case summaries,
  intervention scenario summaries, outcome summaries, next-best-actions
  and operation results through `@aise/adapter-contract`
  (decodeX/decodeXStrict) instead of per-module local validators; keep the
  detailed pane/view projections (viewer, workspace, boqlens render
  models) local as legitimate presentation.
- **W-R3 (author TaskIntent through the contract):** make
  `create-forms.ts`, `outcome-forms.ts` and `evidence-picker.ts` emit
  `TaskIntent` wire objects (typed intent, target refs, parameters) rather
  than ad-hoc form payloads.
- **W-R4 (declare the browser profile + run contract conformance):** add
  the browser `ClientCapabilityProfile` declaration and run
  `runConformance(binding, loadCommittedFixtures())` (C0–C9) in the
  browser adapter test suite, extending it with the platform-specific
  12-item client conformance suite of `spec/client-adapter-contract.md`.
- **W-R5 (standing constraint on boqlens derivations):** `derive.ts` /
  `health.ts` rollups and health stats remain presentation-only
  aggregations; they must never become an alternate BOQ authority (source
  BOQs and the server BOQ domain stay authoritative). Already true today;
  recorded so PROD-017 does not regress it.

## apps/android — file-by-file findings

### `core/session/` (AISE-005 wire discipline)

| File | Finding | Class |
| --- | --- | --- |
| `CapabilitySnapshot.kt` | Kotlin wire mirror of the committed `DeviceCapabilityProfile` schema (8 domains; `unknown` never conflated with `unavailable`). Source of truth is `packages/shared-contracts` — compliant mirror of the CAPTURE contract. The CLIENT capability declaration (screen/input/sensors/camera/offline-storage/notifications/deep-links) has no representation yet; PROD-019 adds it via the adapter contract's `ClientCapabilityProfile`. | compliant mirror |
| `CaptureContractVersion.kt` | Mirrors the shared-contracts version constant with a cross-check test against the COMMITTED TypeScript source — the sanctioned mirror discipline. | compliant mirror |
| `SessionManifestExporter.kt` | Emits `CaptureSessionEnvelope`-shaped manifests validated against the committed schema (networknt, test scope). Compliant; the pattern to replicate for adapter-contract objects. | compliant mirror |
| `CaptureSessionRecord.kt`, `CaptureSessionEvent.kt`, `CaptureSessionStatus.kt`, `CapturedAssetRecord.kt`, `AcquisitionMethod.kt`, `IsoTimestamps.kt`, `SessionDeviceIdentity.kt`, `SessionReplay.kt` | Session semantics mirrors/records; journal-folded truth; no authority. | compliant |
| `CapabilityDomainKind`/`CapabilityDomainDescriptor` (session package files carrying the domain vocabulary) | Verbatim mirror of the capability status/domain vocabulary. | compliant mirror |

### `core/offline/` (AISE-030 offline queue)

| File | Finding | Class |
| --- | --- | --- |
| `MissionCompatibilityChecker.kt` | **Duplicated negotiation semantics (the key Android finding).** An adapter-LOCAL pure capability/mission negotiation: a frozen method→required-domain table over the 10-value acquisition-method enum, per-step verdicts `executable / degraded_but_executable / unknown_capability / not_executable` (unknown never conflated), worst-of overall, mandatory-step blockers, queue admits-and-flags. It is explicitly "NOT an admission policy and NOT a readiness authority" — honest facts — but its verdict model overlaps the shared negotiation semantics family (`satisfied/unsupported/unknown` + `permitted/degraded/unknown/blocked` + blocking flags + honest reasons) now owned by `packages/adapter-contract`. | overlap (no violation) |
| `OfflineMissionQueue.kt`, `QueueJournal.kt`, `QueuePolicy.kt`, `UploadPlanner.kt`, `JournalCompactor.kt` | Offline queue/journal semantics — "facts, not policy"; offline queues are a client responsibility per ACR-004. | compliant |

### `core/mission/`, `core/capture/`, `core/identity/`, `core/json/`, `core/capability/`

| File | Finding | Class |
| --- | --- | --- |
| `MissionPlan.kt`, `MissionPlanParser.kt`, `MissionJournal.kt`, `MissionExecutor.kt` | Wire-faithful mirror of the server-authoritative `CaptureMission`/`CaptureStep` subset (assurance fields validated then dropped — a projection, never an invention). Compliant. | compliant mirror |
| `ContentIdentity.kt`, `ContentId.kt`, `Digests.kt`, `StreamingContentHasher.kt` | The frozen AISE-CONTENT-V1 content addressing foundation. Compliant; content ids flow unchanged into the contract's evidence/outcome summaries. | compliant |
| `AcquisitionMetadata.kt`, `LocalCaptureStore.kt`, `InMemoryLocalCaptureStore.kt`, `LocalStoreEntry.kt` | Capture/store semantics; append-only evidence identity. | compliant |
| `JsonParser.kt`, `JsonValue.kt`, `JsonWriter.kt` | The integer-only frozen JSON codec (canonical writer). | infrastructure |
| `capability/*` (12 files: `CapabilityProfileFactory`, adapters per domain, `DeviceFacts`, `CapabilityProfileRenderer`, `FactsRendering`) | Device capability adapters (AISE-006) producing the honest snapshot; the natural place PROD-019 derives the adapter-level `ClientCapabilityProfile` facts. | compliant |

### `app/` (the Android application)

| File | Finding | Class |
| --- | --- | --- |
| `AppContainer.kt`, `AiseApplication.kt`, `MainActivity.kt` | Composition root / lifecycle. No truth. | platform |
| `capture/*` (`CaptureSessionController.kt`, `FileBackedLocalCaptureStore.kt`, `JsonlSessionJournal.kt`, `SessionDirectory.kt`, `SessionRecovery.kt`, `CaptureEnvironment.kt`, `DeviceIdentityProvider.kt`, `platform/CameraCaptureAdapter.kt`, `platform/RotationVectorSnapshotter.kt`) | Session lifecycle, journal, recovery, camera/IMU platform adapters. All session semantics inside the controller; UI plumbing only in the VM. | platform (client-owned per ACR-004) |
| `ui/*` (`AiseApp.kt`, screens, view models, theme), `navigation/AppDestination.kt` | Compose UI; view models hold "NO truth of their own". | presentation |
| `androidTest/`, `test/` trees | Instrumentation/unit tests incl. the schema cross-check tests. | tests |

### apps/android — required adapter-local removals (recorded for PROD-019)

- **A-R1 (version mirror extension):** extend the
  `CaptureContractVersion` mirror discipline with an
  `AdapterContractVersion` mirror cross-checked against
  `packages/adapter-contract/src/adapter-contracts.version.ts`
  (`ADAPTER_CONTRACT_VERSION = "1.0.0"`) so wire drift is a test failure.
- **A-R2 (declare the client capability profile + consume negotiation):**
  declare the mobile adapter's honest `ClientCapabilityProfile` (using the
  reference `mobile-field` profile as the template; derive facts from the
  existing capability adapters), consume server `TaskCapabilityRequirements`,
  and surface the negotiation's `permitted/degraded/unknown/blocked`
  outcome and domain reasons in the mission UX (explicit blocked state
  instead of generic prompts).
- **A-R3 (align the compatibility-checker vocabulary):** align
  `MissionCompatibilityChecker`'s verdict vocabulary with the shared
  negotiation outcomes — or document the deliberate distinction (the
  checker concerns DEVICE capture domains per the AISE-003 capture
  contract; the shared negotiation concerns CLIENT platform capability per
  this contract) — so the two verdict models cannot silently diverge.
  Either way, the checker must remain facts-not-policy (already true).
- **A-R4 (schema-validate adapter objects):** replicate the
  `SessionManifestExporter` schema-validation pattern for any twelve-object
  server records the Android adapter consumes (via the committed
  `packages/adapter-contract/schemas/` files).
- **No removals** are required for the offline queue, session integrity,
  content identity or capture platform layers — offline behavior is a
  client responsibility under ACR-004 and the boundary matrix.

## apps/desktop

`apps/desktop/` does not exist at the audited SHA (correctly absent —
building it is PROD-020's scope, explicitly non-scope here). PROD-020 must
consume `@aise/adapter-contract` from its first commit: declare a
desktop-appropriate `ClientCapabilityProfile` (the reference
`desktop-rich-shell` profile is the template), decode the twelve semantic
objects through the package, and pass `runConformance` before adding any
platform affordance.

## Reconciliation with the no-authority invariant

Every finding above is either a compliant mirror (carried verbatim from a
committed schema or a server-owned vocabulary), a client-owned presentation
derivative, or a platform responsibility ACR-004 assigns to clients. The
audit found **zero instances** of a client deciding readiness, measurement
authority, evidence sufficiency, verification, intervention approval,
source-of-record supersession, provider engineering-readiness or
authorization beyond server-provided results. The removals recorded above
are therefore mirror-retirement and alignment actions for the adapter
workers — not authority fixes.
