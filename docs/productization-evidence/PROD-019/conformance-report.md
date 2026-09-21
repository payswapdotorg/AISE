# PROD-019 — Mobile adapter conformance report

**Work item:** PROD-019 — Android mobile adapter productization and field
journey (Owner: MOBILE; depends on PROD-016).
**Base:** public main `7d21d47147a3df14a0e6138131de6d9add672d27`
(PROD-016 + PROD-021 merged).
**Contract consumed:** `packages/adapter-contract` (`@aise/adapter-contract`,
`ADAPTER_CONTRACT_VERSION = 1.0.0`) — committed JSON Schemas + manifest +
fixture corpus + `CONFORMANCE_CHECKS` semantics, per the non-TypeScript
consumer instructions of the package README. The compatibility window
(`docs/productization-evidence/PROD-016/compatibility-window.md`) is
respected: the shared contract was NOT modified.

## 1. The declared mobile profile

The Android adapter declares its honest `ClientCapabilityProfile`
(`org.payswap.aise.core.adapter.MobileFieldAdapterProfile`, `:core`), derived
from the AISE-006 device capability snapshot (the existing capability
adapters' output) plus what the build actually exercises. Template: the
committed reference `mobile-field` profile
(`fixtures/capability/ClientCapabilityProfile.valid-mobile-field.json`); the
reference is ILLUSTRATIVE, the declaration is FACT — every divergence is a
documented honesty decision:

| Domain | Declared | Honesty decision (vs the reference profile) |
|---|---|---|
| `screen` | supported, `compact`, single-window | The Compose shell renders one window. |
| `input` | supported, `[touch, gesture, camera-scan]` | The modes this build exercises. `voice` is NOT declared (no voice integration — the schema's rule: honest facts, not marketing). |
| `sensors` | from the device IMU domain; `["imu"]` when active | GPS never declared (no location permission — the AISE-005 decision). Undetermined IMU ⇒ `unknown` with the limitation — never conflated with `unavailable`. |
| `camera` | from the device CAMERA domain; `[still, video]` | The capture runtime binds Preview + ImageCapture + VideoCapture — NO depth API is exercised, so the `depth`/`lidar` kinds are NEVER declared, even on depth-capable hardware (the schema: "capture kinds the adapter exercises… even if hardware exists"). The device depth fact flows into the camera limitations verbatim instead. |
| `offline-storage` | supported, `persistent-store`, NO `queueBoundBytes` | The file-backed sessions/store are durable and resumable; no storage byte quota is enforced, so no bound is declared — an undeclared bound is never guessed. A byte-bounded requirement therefore negotiates to an explicit honest shortfall. |
| `notifications` | supported, `in-app` | No system notifications are posted by this build (the mission foreground service is an AISE-009/030 concern). |
| `deep-links` | `unavailable`, `none` | No intent filters are declared in this build; the limitation names it. |

`adapterKind = "mobile-field"` (open vocabulary; the reference mobile kind).
The declaration is a PURE function (snapshot + ids in, profile out) and
schema-validates against the committed
`schemas/capability/ClientCapabilityProfile.schema.json`
(`AdapterCorpusConformanceTest` C1, `ClientCapabilityProfileTest`).

**Profile validity results (C1):** the declared profile validates with ZERO
schema errors; the three committed reference profiles round-trip losslessly
through the Kotlin mirror (canonical wire bytes identical); the two committed
invalid profile fixtures are rejected by BOTH the committed schema and the
mirror's typed shape validation.

## 2. Schema validation over the committed corpus (A-R4)

The `SessionManifestExporter` pattern (TEST-scope networknt
json-schema-validator 1.5.6 against COMMITTED schema files) is replicated for
the adapter-contract objects the mobile adapter consumes. The corpus loader
(`AdapterCorpus`, test scope) reads the committed
`packages/adapter-contract/fixtures/` + `schemas/manifest.json`; results
(`AdapterCorpusConformanceTest`, `AdapterContractVersionTest`):

| Corpus class | Count | Result |
|---|---|---|
| `*.valid*.json` | 27 | ALL validate against their committed `schemas/<family>/<Object>.schema.json` (zero errors) |
| `*.invalid-*.json` | 30 | ALL rejected by their committed schemas (≥ 2 per family, as the corpus requires) |
| `*.version-mismatch.json` | 8 | ALL schema-valid (the semver shape passes) but refused by the wire-version gate with the typed `AdapterContractVersionMismatchException` — the non-TS mirror of the codec's cross-major rejection |

Canonical round-trip substrate: every valid fixture parses with the frozen
integer-only :core JSON codec and re-renders to byte-identical canonical
bytes (sorted keys, 2-space indent, trailing newline) — the C2/C3 comparison
basis for a non-TypeScript consumer.

## 3. C0–C9 coverage as implemented for the non-TypeScript consumer

The Kotlin conformance runner
(`org.payswap.aise.core.adapter.AdapterConformance.runConformance`) mirrors
the package's harness semantics with an injected schema validator (the
networknt + committed-schemas binding lives test-side; main scope stays
dependency-free). Check catalogue mirrored as data
(`ConformanceChecks.CATALOGUE`) and cross-checked against the committed
TypeScript `CONFORMANCE_CHECKS` source on every run
(`AuthoritativeFieldsMirrorTest`).

| Check | Non-TypeScript implementation | Result |
|---|---|---|
| C0 corpus-complete | Every object registered in the committed `schemas/manifest.json` (15: twelve semantic + three negotiation) has ≥ 1 valid fixture; the three named scenario fixtures (denial / operation-failure / blocked action) exist. | PASS |
| C1 profile-valid | The declared mobile profile validates against the committed ClientCapabilityProfile schema. | PASS |
| C2 round-trip-lossless | For every valid fixture, the binding's emission is deep-equal (canonical-bytes comparison) to the fixture. The MOBILE binding routes the four structurally-mirrored objects (`TaskIntent`, `ClientCapabilityProfile`, `TaskCapabilityRequirements`, `CapabilityNegotiation`) through the Kotlin domain types (parse → value → render); every other object is carried opaque/read-only (verbatim emission) — the audit's mirror discipline. | PASS |
| C3 wire-bytes-identical | The emission re-encodes to the same canonical wire bytes as the fixture. | PASS |
| C4 required-fields-presented | The binding presents every schema-required top-level field of every valid fixture (required lists derived from the committed schemas at load time). | PASS |
| C5 authoritative-fields-presented | The binding presents every authoritative field (required always; optional whenever present in the payload) per the `AUTHORITATIVE_FIELDS` mirror (cross-checked against the committed TypeScript map). | PASS |
| C6 interaction-modes-honest | The binding claims `[menu-navigation, panel-inspection, drag-inspect, camera-capture, gesture, scan-control, offline-queue]` — a strict subset of the profile's honest modes (`file-workflow` NOT claimed: no file-picker affordance; `table-review` not claimed on a compact screen). | PASS |
| C7 denial-reasons-surfaced | The authorization-denial scenario surfaces `denials`. | PASS |
| C8 operation-failure-surfaced | The operation-failure scenario surfaces `status` + typed `failure`. | PASS |
| C9 blocked-action-surfaced | The blocked next-best-action scenario surfaces `status` + `blockers`. | PASS |

**Conformance runs:** the lossless golden binding passes C0–C9 by
construction (the Kotlin twin of `createLosslessBinding`), AND the mobile
adapter binding (`MobileAdapterBinding.create(declaredProfile)`) passes
C0–C9 — the mobile adapter's contract conformance over the committed corpus.

**Discrimination (sabotage bindings FAIL explicit checks):** six sabotage
cases mirror the package's discrimination tests — dropping the authoritative
`readinessStatus` fails C5; hiding `denials` fails C7; hiding the typed
`failure` fails C8; hiding `blockers` fails C9; mutating an authoritative
field (`RealitySummary.readinessStatus` → `"READY"`) fails C2 AND C3;
claiming `table-review` on a compact profile fails C6.

## 4. Negotiation-consumer fidelity (A-R2)

`negotiateCapabilities` mirrors `packages/adapter-contract/src/negotiation.ts`
faithfully — pinned by reproducing ALL committed negotiation fixtures from
their committed inputs (`CapabilityNegotiationTest`):

| Committed fixture | Reproduced |
|---|---|
| `CapabilityNegotiation.valid-mobile-field-field-depth-capture.json` | EXACT (permitted; modes order; reasons null) |
| `CapabilityNegotiation.valid-mobile-field-boq-review.json` | EXACT (degraded; verbatim screen reason) |
| `CapabilityNegotiation.valid-browser-field-depth-capture.json` | EXACT (blocked; empty modes) |
| `CapabilityNegotiation.valid-desktop-rich-shell-offline-field-queue.json` | EXACT |

"EXACT" = deep equality including the domain-outcome order, the VERBATIM
reason strings, the blocking echoes and the interaction-mode order; the wire
rendering is canonical-bytes-identical to the committed fixture. Additional
pinned semantics: the three reference profiles' documented mode sets; the
unknown≠unsupported discipline (an `unknown` camera domain ⇒ outcome
`unknown` with the verbatim probing reason, overall `unknown`); the worst-of
severity order; blocked ⇒ NO interaction modes (the LiDAR requirement blocks
the reference mobile profile with the verbatim reason); the no-assurance
invariants (a degraded camera cannot weaken a depth requirement; the
negotiation wire object carries no authorization/readiness/sufficiency
fields; requirements are consumed read-only — immutable mirrors, no mutation
path).

## 5. Version-mirror discipline (A-R1)

`AdapterContractVersion.CURRENT = "1.0.0"` is cross-checked on every test run
against (a) the committed TypeScript source
(`ADAPTER_CONTRACT_VERSION = "1.0.0"` in
`packages/adapter-contract/src/adapter-contracts.version.ts`), (b) the
committed `schemas/manifest.json` top-level version, (c) every manifest
object entry's version, and (d) the manifest's registered-object catalogue ==
the mirrored fifteen-object catalogue (twelve semantic + three negotiation).
Same-major versions decode; cross-major and malformed versions are typed
refusals — never silently accepted, never coerced.

## 6. Gate status

- `:core:test` (the Kotlin domain gate incl. the mobile conformance suite):
  **BUILD SUCCESSFUL — 387 tests, 0 failed** (323 baseline + 64 new adapter
  tests across 8 suites; see `gradle-trace.md`).
- Root `bun run verify`: **3718 pass / 0 fail, VERIFY: PASS** (unchanged — no
  TypeScript tests were added or modified by this item).
- `:app:test` (incl. the new `FieldJourneyRuntimeTest`): requires the
  Android SDK; NOT runnable in this sandbox — the Lead re-runs it at the
  integration station (see `gradle-trace.md`).
