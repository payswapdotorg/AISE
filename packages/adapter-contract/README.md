# @aise/adapter-contract

Versioned, testable shared client adapter contract for AISE (Work Item
PROD-016, SHARED) — the checkable artifact set of
`spec/client-adapter-contract.md` and the governing record ACR-004
(client adapters over a single product core).

**TypeScript source of truth + committed JSON Schemas** so the Android
adapter (and any other non-TypeScript consumer) uses the same shapes
without a TypeScript dependency.

**Data + contract logic only.** No I/O in the harness core, no server
behavior, no UI — and **NO CLIENT-SIDE AUTHORITY** (see below).

## Layout

```text
src/adapter-contracts.version.ts  ADAPTER_CONTRACT_VERSION + object catalogues
src/errors.ts                     typed adapter contract errors
src/codec.ts                      decode / decodeStrict / encode engine
src/context.ts                    ProjectContext, TaskIntent            (family context)
src/capability.ts                 CapabilityDescriptor, ClientCapabilityProfile,
                                  TaskCapabilityRequirements             (family capability)
src/negotiation.ts                CapabilityNegotiation + negotiateCapabilities +
                                  deriveInteractionModes + INTERACTION_MODES
src/domain.ts                     EvidenceSummary, RealitySummary, BOQContext,
                                  EngineeringCaseSummary,
                                  InterventionScenarioSummary,
                                  OutcomeSummary                        (family domain)
src/action.ts                     NextBestAction                         (family action)
src/authorization.ts              AuthorizationContext          (family authorization)
src/result.ts                     OperationResult                        (family result)
src/reference-profiles.ts         the three reference profiles + five
                                  reference task-requirement sets
src/registry.ts                   the authoritative wire-object registry
src/conformance.ts                AUTHORITATIVE_FIELDS + CONFORMANCE_CHECKS +
                                  runConformance + createLosslessBinding
src/fixtures-loader.ts            the ONLY fs-touching helper (corpus loader)
src/index.ts                      public API
scripts/generate-schemas.ts       `bun run gen:schemas` (deterministic)
scripts/lib/generate.ts           generation core (byte-stable, draft-07)
schemas/                          COMMITTED generated JSON Schemas + manifest
fixtures/                         committed test corpus
                                  (valid / invalid / version-mismatch)
```

## Contract objects and families

The TWELVE semantic objects `spec/client-adapter-contract.md` names, plus
the three capability-negotiation objects — every one a versioned, checkable
wire object:

| Family | Wire objects |
|---|---|
| `context` | `ProjectContext`, `TaskIntent` |
| `capability` | `CapabilityDescriptor`, `ClientCapabilityProfile`, `TaskCapabilityRequirements`, `CapabilityNegotiation` |
| `domain` | `EvidenceSummary`, `RealitySummary`, `BOQContext`, `EngineeringCaseSummary`, `InterventionScenarioSummary`, `OutcomeSummary` |
| `action` | `NextBestAction` |
| `authorization` | `AuthorizationContext` |
| `result` | `OperationResult` |

Every wire object — top-level or embedded — carries a required
`contractVersion` (strict semver). The registry (`src/registry.ts`) is the
authoritative, name-sorted list; `schemas/manifest.json` mirrors it for
non-TypeScript consumers.

## Versioning policy

The package version IS the contract version (`package.json` ==
`ADAPTER_CONTRACT_VERSION` == every family version at v1.0.0; asserted by
tests).

Bump rules (same discipline as `@aise/shared-contracts`):

- **MAJOR** — any removal, rename, type narrowing, enum-value removal, or
  semantic change to an existing field.
- **MINOR** — additive changes only: new optional fields, new enum values,
  new wire objects, relaxed constraints. Same-major payloads from a newer
  minor MUST remain decodable by older minors.
- **PATCH** — documentation/description-only changes.

**Compatibility window (PROD-016 ruling):** after PROD-016 merges, adapter
workers (PROD-017 browser, PROD-019 mobile, PROD-020 desktop) must NOT
change this shared semantic contract without a new governed SHARED work
item — see `docs/productization-evidence/PROD-016/compatibility-window.md`.

## Compatibility policy

Identical discipline to `@aise/shared-contracts`:

1. A `contractVersion` that is a valid semver with a **different major**
   fails fast with a typed `AdapterContractVersionMismatchError` — never
   silently accepted, never coerced.
2. A **same-major** version with any minor/patch/prerelease difference is
   accepted (forward/backward compatibility within a major).
3. A **missing or malformed** `contractVersion` is a schema violation
   (`AdapterContractDecodeError` with an issue at the `contractVersion`
   path).
4. Unknown fields are **preserved** by default decode (open wire schemas,
   `.passthrough()`); `decodeStrict` rejects unknown keys at any object
   nesting level (issue code `unrecognized_keys`). Open maps
   (`z.record` fields) stay open in both modes.
5. `encode` stamps the family version when absent, rejects foreign
   versions, and emits canonical JSON (recursively sorted keys, 2-space
   indent, trailing newline) — the same value always encodes to identical
   bytes.

Canonical primitives (semver, ISO-8601 UTC timestamps, stable ids, content
ids, epistemic statuses, capability statuses, gap kinds, canonical JSON)
are IMPORTED from `@aise/shared-contracts` — one source of truth for the
canonical vocabulary across contract packages. This package never modifies
that package.

## Capability negotiation

`negotiateCapabilities(profile, requirements)` is a PURE, deterministic
function: an adapter's declared `ClientCapabilityProfile` (seven REQUIRED
domains — screen, input, sensors, camera, offline-storage, notifications,
deep-links; each an honest `CapabilityDescriptor` plus typed facts) × a
server-owned `TaskCapabilityRequirements` set → an explicit
`CapabilityNegotiation`:

- per-domain outcomes `satisfied | unsupported | unknown` with honest,
  deterministic reasons (`unknown` is NEVER conflated with
  `unsupported` — the frozen `unknown`-is-not-`unavailable` discipline);
- overall outcome `permitted | degraded | unknown | blocked`
  (worst-of: a definitively-impossible blocking requirement outranks an
  undetermined one);
- the permitted `INTERACTION_MODES` — the honest subset of the
  responsive/interaction-equivalence vocabulary of
  `spec/client-adapter-contract.md` the profile's declared facts support;
  **empty when the task is blocked** (the adapter must render the explicit
  blocked reason instead of a pretend-actionable task).

The three reference profiles — **browser**, **mobile-field**,
**desktop-rich-shell** — are exported as typed constants
(`REFERENCE_PROFILES`), committed as wire fixtures, and negotiate to
different, honest capability sets (asserted by tests):
browser → `menu-navigation, keyboard-shortcut, table-review,
panel-inspection, drag-inspect, camera-capture`;
mobile-field → `menu-navigation, panel-inspection, drag-inspect,
camera-capture, gesture, voice-command, scan-control, offline-queue`;
desktop-rich-shell → `menu-navigation, keyboard-shortcut, table-review,
panel-inspection, drag-inspect, window-management, file-workflow,
offline-queue`.

**Negotiation is platform-honesty math, never authority:** it changes
interaction/capture strategy and operator burden — it can never change,
lower or satisfy an assurance/readiness requirement, and the negotiation
object carries no authorization, readiness, verification or sufficiency
semantics (asserted by tests). Device capability determines capture
method, operator burden, evidence substitutions and escalation — never the
truth standard.

## Conformance harness

Adapter workers prove contract conformance by calling
`runConformance(binding, corpus)`:

```ts
import {
  createLosslessBinding, loadCommittedFixtures, runConformance,
  REFERENCE_PROFILES,
} from "@aise/adapter-contract";

const report = runConformance(
  myPlatformBinding,          // implements AdapterConformanceBinding
  loadCommittedFixtures(),    // the committed corpus (bun consumers)
);
if (!report.passed) { /* render report.checks for the failures */ }
```

The binding implements `AdapterConformanceBinding` — `emit` (the adapter's
wire handling of an object), `presentedFields` (which top-level fields it
renders), `supportedInteractionModes` (which modes it actually
implements) — plus its declared `ClientCapabilityProfile`.
`createLosslessBinding(profile)` is the golden template (passes every check
by construction; asserted by tests).

`CONFORMANCE_CHECKS` is the stable catalogue in data form (C0..C9):
corpus completeness, profile validity, lossless round-trip, canonical wire
bytes, required-field presentation, authoritative-field presentation,
honest interaction modes, denial surfacing, failure surfacing, blocked-
action surfacing. Non-TypeScript consumers (Android) mirror the same
checks against the committed JSON Schemas and fixtures.

The harness itself performs NO I/O; `loadCommittedFixtures()` is the only
fs-touching helper (reads the committed corpus for bun-based consumers).

## NO CLIENT AUTHORITY (frozen invariant)

No client may decide readiness, measurement authority, evidence
sufficiency, verification, intervention approval, source-of-record
supersession, provider engineering-readiness or authorization beyond
server-provided results (`spec/client-adapter-contract.md`,
`spec/architecture-lock.md`).

This package enforces that invariant structurally:

- **Authoritative fields are carried opaque/read-only.**
  `AUTHORITATIVE_FIELDS` documents, per object, the server-owned (or
  contract-derived) fields; the conformance harness verifies a binding
  presents them verbatim and its emission is lossless (sabotage bindings
  that drop, mutate or hide them FAIL explicit checks —
  discrimination-tested).
- **The package exposes no mutation path for authoritative state.** The
  only objects a client legitimately AUTHORS are `TaskIntent` (the user's
  intent — the server validates and answers it) and its own capability
  declarations (`CapabilityDescriptor`, `ClientCapabilityProfile` —
  honest facts about the platform, never readiness/authorization claims).
  Encoding an object is serialization (transport, caching, offline
  replay), never authority: authority over authoritative fields remains
  with the server/domain core.
- **Negotiation cannot change the truth standard** (see above).

## JSON Schemas (for Android and other non-TypeScript consumers)

- Generated from the zod source by `bun run gen:schemas` (in this package).
- **Committed** under `schemas/` — one self-contained draft-07 file per
  wire object (no `$ref`/`$defs`) plus `schemas/manifest.json`.
- **Byte-stable**: sorted keys, no timestamps, deterministic order.
  Regeneration on a clean tree produces a zero-byte diff; a bun test guards
  this in CI (`schema-files.test.ts`).
- The wire schemas are **open** (`additionalProperties: true`): unknown
  fields are legal on the wire within the same major version. Schema-level
  validation checks shape; version compatibility is enforced by the codec.

## Fixtures

`fixtures/<family>/<Object>.<kind>.json`:

- `*.valid*.json` — schema-valid and codec-decodable; round-trip tested.
  Includes the three reference profiles, five reference requirement sets
  and negotiation outputs byte-pinned to the function's output.
- `*.invalid-*.json` — deliberately schema-invalid (at least 2 per family).
- `*.version-mismatch.json` — schema-valid payloads carrying a cross-major
  `contractVersion`; the codec must reject them with a typed error.

All fixture timestamps and content ids are fixed constants — no clock, no
randomness, no network in tests.

## Consumption

TypeScript (bun workspaces):

```ts
import {
  decodeNextBestAction,
  encodeClientCapabilityProfile,
  negotiateCapabilities,
  runConformance,
  AdapterContractVersionMismatchError,
} from "@aise/adapter-contract";
```

Android / non-TypeScript: consume
`schemas/<family>/<Object>.schema.json` (self-contained draft-07) and
`schemas/manifest.json` for discovery; mirror `CONFORMANCE_CHECKS` against
the committed fixtures. Field semantics are documented in the schema
`description`s and in this README.

## Regeneration and tests

```bash
cd packages/adapter-contract
bun run gen:schemas   # regenerate schemas/ (zero-byte diff on a clean tree)
bun test              # the package's 84-test suite
```

The root `bun run verify` gate picks the package up automatically
(typecheck via its tsconfig, lint, tests, and the workspace boundary
scanner — this package imports only from within `packages/` plus bare
specifiers).

## Non-goals (owned by other work items)

- Browser/mobile/desktop adapter implementations (PROD-017/019/020).
- The interactive solution operation contract (PROD-021).
- Server-side task catalogue, readiness/assurance evaluation
  (AISE-022), authorization policy (AISE-036) — this package only
  carries their statements opaquely.
- Transport, retry, sync policy — shapes only.
