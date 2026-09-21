# @aise/solution-contract

Versioned, testable contract for the AISE interactive engineering solution
workflow (Work Item PROD-021, SHARED) — the checkable artifact set of
`spec/solution-operation-contract.md` and the governing records ACR-005
(interactive engineering solution workflow) and ACR-006 (layered product
architecture).

**TypeScript source of truth + committed JSON Schemas** so non-TypeScript
consumers (and the future PROD-024 adapter surfaces) use the same shapes
without a TypeScript dependency.

**Data + contract logic only.** No I/O in the core (the fixture loader is
the only fs-touching helper), no server behavior, no 3D, no agent
implementation — and **NO MUTATION PATH FOR AUTHORITATIVE REALITY** (see
below).

## Layout

```text
src/solution-contracts.version.ts  SOLUTION_CONTRACT_VERSION + object catalogues
src/errors.ts                     typed solution contract errors
src/codec.ts                      decode / decodeStrict / encode engine
src/domain.ts                     SolutionDomainDescriptor + the Phase 1
                                  building reference constants
src/operation.ts                  TypedOperationParameter, OperationProvenance,
                                  OperationTarget, OperationDependency,
                                  TypedQuantity, OperationEffect,
                                  EngineeringOperation        (family operation)
src/intent.ts                     EngineeringOperationIntent +
                                  createOperationIntent (the ONE constructor
                                  surface for direct manipulation AND agent)
src/state.ts                      ProposedState (the PROPOSED seal)
src/validation.ts                 SolutionValidationSnapshot + worst-of helper
src/capability.ts                 OperationCapabilityProfile + the two
                                  reference building profiles
src/negotiation.ts                OperationCapabilityNegotiation +
                                  negotiateOperationCapability
src/trace.ts                      SolutionBoqLineTrace, SolutionBoqTraceSet +
                                  bidirectional resolution functions
src/solution.ts                   Solution, SolutionVersion     (family solution)
src/lifecycle.ts                  the governed draft/validated/superseded/
                                  abandoned transition table
src/identity.ts                   deterministic identity derivations
                                  (operation / state / snapshot / trace)
src/invariants.ts                 the cross-field invariant checkers
src/registry.ts                   the authoritative wire-object registry
src/fixtures-loader.ts            the ONLY fs-touching helper (corpus loader)
src/index.ts                      public API
scripts/generate-schemas.ts       `bun run gen:schemas` (deterministic)
scripts/lib/generate.ts           generation core (byte-stable, draft-07)
schemas/                          COMMITTED generated JSON Schemas + manifest
fixtures/                         committed test corpus
                                  (valid / invalid / version-mismatch)
```

## Contract objects and families

The TEN solution-graph and BOQ-trace objects the PROD-021 work order names,
plus the four interaction-facing objects — every one a versioned, checkable
wire object:

| Family | Wire objects |
|---|---|
| `solution` | `Solution`, `SolutionVersion` |
| `operation` | `EngineeringOperation`, `EngineeringOperationIntent`, `OperationTarget`, `OperationDependency`, `OperationEffect` |
| `state` | `ProposedState` |
| `validation` | `SolutionValidationSnapshot` |
| `capability` | `OperationCapabilityProfile`, `OperationCapabilityNegotiation` |
| `trace` | `SolutionBoqLineTrace`, `SolutionBoqTraceSet` |
| `domain` | `SolutionDomainDescriptor` |

Every wire object — top-level or embedded — carries a required
`contractVersion` (strict semver). The registry (`src/registry.ts`) is the
authoritative, name-sorted list; `schemas/manifest.json` mirrors it for
non-TypeScript consumers.

## Versioning policy

The package version IS the contract version (`package.json` ==
`SOLUTION_CONTRACT_VERSION` == every family version at v1.0.0; asserted by
tests).

Bump rules (same discipline as `@aise/shared-contracts` and
`@aise/adapter-contract`):

- **MAJOR** — any removal, rename, type narrowing, enum-value removal, or
  semantic change to an existing field.
- **MINOR** — additive changes only: new optional fields, new enum values,
  new wire objects, relaxed constraints. Same-major payloads from a newer
  minor MUST remain decodable by older minors.
- **PATCH** — documentation/description-only changes.

**Deterministic identities are version-independent:** the derivations in
`src/identity.ts` deliberately exclude `contractVersion` — a same-major
minor bump must not re-address every operation, state, snapshot or BOQ
trace ever recorded.

**Compatibility window:** after PROD-021 merges, the solution wave workers
(PROD-022 engine, PROD-023 agent compiler, PROD-025 BOQ derivation) must
NOT change this shared contract without a new governed SHARED work item —
see `docs/productization-evidence/PROD-021/contract-artifacts.md`.

## Compatibility policy

Identical discipline to `@aise/shared-contracts` /
`@aise/adapter-contract`:

1. A `contractVersion` that is a valid semver with a **different major**
   fails fast with a typed `SolutionContractVersionMismatchError` — never
   silently accepted, never coerced.
2. A **same-major** version with any minor/patch/prerelease difference is
   accepted (forward/backward compatibility within a major).
3. A **missing or malformed** `contractVersion` is a schema violation
   (`SolutionContractDecodeError` with an issue at the `contractVersion`
   path).
4. Unknown fields are **preserved** by default decode (open wire schemas,
   `.passthrough()`); `decodeStrict` rejects unknown keys at any object
   nesting level (issue code `unrecognized_keys`). Open maps (`z.record`
   fields) stay open in both modes.
5. `encode` stamps the family version when absent, rejects foreign
   versions, and emits canonical JSON (recursively sorted keys, 2-space
   indent, trailing newline) — the same value always encodes to identical
   bytes.

Canonical primitives (semver, ISO-8601 UTC timestamps, stable ids, content
ids, uncertainty, canonical JSON, the strict-mode schema walker) are
IMPORTED from `@aise/shared-contracts` — one source of truth for the
canonical vocabulary across contract packages. This package never modifies
that package. It imports nothing from `apps/`, `backend/` or root scripts
(workspace boundary rules).

## One constructor surface, two provenance origins

`createOperationIntent(input)` is the ONLY authoring constructor for
operation intents, and it serves BOTH input modes of ACR-005/006:

```ts
import { createOperationIntent, REFERENCE_BUILDING_DOMAIN } from "@aise/solution-contract";

// direct manipulation in the interactive environment:
const direct = createOperationIntent({
  intentId: "intent-0001",
  operationType: "excavation",
  domain: REFERENCE_BUILDING_DOMAIN,
  parameters: [
    { name: "depth", value: 1.5, unit: "m" },
    { name: "width", value: 2.0, unit: "m" },
    { name: "length", value: 3.0, unit: "m" },
  ],
  target: { /* anchored spatial target with units */ },
  provenance: {
    origin: "direct-manipulation",
    authoredBy: "user-1", authoredAt: "2026-09-16T09:00:00.000Z",
    evidenceIds: [],
    derivationNote: "operator dimensioned the pit in the 3D view",
  },
});

// the SAME semantics by agent command:
const agent = createOperationIntent({ /* same semantics; provenance.origin:
  "agent", commandText: "Excavate a pit 1.5 m deep, 2 m wide and 3 m long." */ });
```

The constructor validates the wire schema AND the cross-field invariants
(units, anchoring, provenance) — it can only emit contract-valid intents.
Because the identity derivation EXCLUDES provenance, both origins derive
the SAME `operationId` (proven by the committed fixture pair
`valid-excavation-direct.json` / `valid-excavation-agent.json` and by
`identity.test.ts`). No input modality receives different engineering
authority.

## Deterministic identities

`src/identity.ts` derives content-addressed identities (sha-256 over
canonical JSON of a curated semantic projection):

- `deriveEngineeringOperationId` — over version context + operation type +
  vertical + typed parameters + spatial target + dependencies.
  **Excluded by design:** provenance (origin/author/command/evidence),
  rationale, descriptions, effects, timestamps and `contractVersion`.
- `deriveProposedStateId` — over solution/version/stateIndex/pinned
  baseline/ordered applied operation ids/content digest; `materializedAt`
  excluded. The same state id feeds the synchronized 3D/2D/BOQ views.
- `deriveValidationSnapshotId` — over solution/version/inputDigest/engine
  kind+version/outcome (what it certifies, not when or how it worded
  findings).
- `deriveSolutionBoqLineTraceId` — over solutionId/versionNumber/boqLineId:
  version-pinned by construction (the same line id under another version
  derives another trace id).

## Lifecycle, versions and branches

```text
draft ────► validated ────► superseded   (terminal)
  │             │
  │             └─────────► abandoned    (terminal)
  └───────────────────────► abandoned
```

`SOLUTION_LIFECYCLE_TRANSITIONS` is the governed table;
`assertSolutionLifecycleTransition` enforces it with the typed
`SolutionContractLifecycleError`. Revision is versioning, never rewriting:
a new `SolutionVersion` (with `parentVersionNumber` lineage) or a proposal
branch (`Solution.branch`) supersedes prior versions — recorded
operations/states are never rewritten. The vocabulary carries NO approval
semantics (approval is an Engineering Case domain act).

## Operation capability negotiation

`negotiateOperationCapability(intent, profile)` is a PURE, deterministic
function from a typed intent and the ENGINE-owned
`OperationCapabilityProfile` to an explicit
`OperationCapabilityNegotiation`:

- outcome `executable | blocked | unsupported | unknown`:
  - `executable` — capability declared and every required parameter
    present (`capability-satisfied`, plus `capability-degraded` with the
    declared limitations surfaced when the entry is degraded);
  - `blocked` — the intent is UNDER-SPECIFIED: required parameter names
    are missing (`missingParameters`, in the profile's declaration order).
    The agent must ASK — never invent;
  - `unsupported` — definitively not supported (future vertical,
    undeclared operation type, unavailable entry), with the honest reason
    naming it;
  - `unknown` — capability UNDETERMINED. The frozen honesty discipline:
    `unknown` is never conflated with `unsupported` (the adapter contract's
    rule, carried into the solution wave).
- `reasons` is never empty; unsupported-operation states are explicit,
  never silent.

**Negotiation is capability math, never authority:** it changes execution
strategy and operator/agent burden — it can never decide validation
success, readiness, approval or sufficiency, and the negotiation object
carries no such semantics (asserted by tests). Negotiation is also
origin-blind: the intent's provenance origin never influences the outcome.

## Bidirectional BOQ traces

`SolutionBoqTraceSet` is the version-pinned set of a solution version's
generated line traces (produced from ONE declared validation snapshot).
Resolution is bidirectional and pure:

- `resolveOperationsForLine(traceSet, boqLineId)` — BOQ line → its
  contributing solution steps (`undefined` for unknown ids — explicit);
- `resolveLinesForOperation(traceSet, operationId)` — operation → the BOQ
  lines it creates or changes (empty array for non-contributing
  operations — explicit);
- the round trip closes: line → contributions → lines includes the
  original line (asserted over the committed fixture by `trace.test.ts`).

Every line trace pins solutionId + versionNumber + snapshot
(`trace_set_version_pin_mismatch` / `trace_set_snapshot_pin_mismatch`
invariants); contributing operations are never empty (schema-level
minimum); quantities carry explicit units and calculation references. A
generated solution BOQ is a derived projection — a source BOQ stays a
separate source/revision and is never silently overwritten.

## Domain extensibility (Phase 1: buildings only)

The vertical (building) specifics live behind `SolutionDomainDescriptor`:
`vertical` is an OPEN wire vocabulary (Phase 1 advisory value `building`),
`operationVocabulary` names the engine-owned operation catalogue in use,
and `extensions` carry vertical-specific descriptors as DATA. The wire
`operationType` is likewise an open string — the CLOSED Phase 1 building
catalogue (`BUILDING_OPERATION_TYPES`, ten types across the six work-order
categories: site preparation, foundation, structure, enclosure, services,
finishes) is reference data the ENGINE owns.

**Nothing building-specific is encoded into client-facing types as
authority.** Adding a vertical (civil-works, mep, industrial-equipment,
electronics, integrated-circuits — the documented future list) requires NO
contract change: the descriptor and intents are representable on the wire
today, and an engine that does not declare capability for the vertical
negotiates to an explicit, honest `unsupported` (proven by the committed
`valid-future-vertical-mep.json` intent fixture and its negotiation
fixture).

## NO MUTATION PATH FOR AUTHORITATIVE REALITY (frozen invariant)

Proposed state remains separate from observed reality
(`spec/architecture-lock.md` "Authority" #7, "Intervention", ACR-005):

- the ONLY reality references are READ-ONLY pins: `baselineRealityVersionId`
  on `Solution` and every `ProposedState` (stable-id references, carried
  opaquely — asserted by `authority.test.ts`);
- the proposal seals are SCHEMA-LEVEL: `ProposedState.epistemicStatus` and
  `Solution.epistemicClass` are the literal `"PROPOSED"` —
  OBSERVED/INFERRED/CONFIRMED are unrepresentable (committed
  `invalid-epistemic` fixtures prove the schemas reject them);
- the package exposes NO mutation path for authoritative state (the
  exported-name vocabulary scan, the intent/negotiation field inventories
  and the lifecycle vocabulary checks are all asserted by
  `authority.test.ts`);
- the only objects a client or agent legitimately AUTHORS are operation
  intents (via `createOperationIntent`) — intent is a request, never
  authority; the solution engine (PROD-022) validates, compiles and
  executes.

## Cross-field invariants (the semantic teeth)

The wire schemas are plain `.passthrough()` zod objects (the repo's
contract-package discipline — it keeps the shared strict-decode schema
walker sound), so the invariants that need more than one field ship as
PURE typed checker functions in `src/invariants.ts` (the boundary-parser
discipline of the intervention model):

`numeric_parameter_without_unit`, `unanchored_operation_target`,
`missing_operation_provenance`, `self_referencing_operation_dependency`,
`proposed_state_index_mismatch`, `solution_version_state_count_mismatch`,
`solution_version_state_index_mismatch`, `validated_version_without_snapshot`,
`version_one_with_parent`, `superseded_solution_without_successor`,
`validation_outcome_not_worst_of_checks`, `operation_effect_missing_ref`,
`operation_effect_missing_quantity`, `trace_set_version_pin_mismatch`,
`trace_set_snapshot_pin_mismatch`, `duplicate_operation_type_capability`,
`duplicate_profile_vertical`.

`checkSolutionContractObject(objectName, value)` dispatches over the
registry; every committed VALID fixture passes every invariant of its
object (asserted by `fixtures.test.ts`).

## JSON Schemas (for non-TypeScript consumers)

- Generated from the zod source by `bun run gen:schemas` (in this package).
- **Committed** under `schemas/` — one self-contained draft-07 file per
  wire object (no `$ref`/`$defs`) plus `schemas/manifest.json`.
- **Byte-stable**: sorted keys, no timestamps, deterministic order.
  Regeneration on a clean tree produces a zero-byte diff; a bun test guards
  this in CI (`schema-files.test.ts`).
- The wire schemas are **open** (`additionalProperties: true`): unknown
  fields are legal on the wire within the same major version. Schema-level
  validation checks shape; version compatibility is enforced by the codec.
- The proposal seals appear as `const: "PROPOSED"` so non-TypeScript
  validators enforce the same isolation.

## Fixtures

`fixtures/<family>/<Object>.<kind>.json`:

- `*.valid*.json` — schema-valid, codec-decodable, invariant-clean;
  round-trip tested. Includes the direct-manipulation vs agent intent
  pair (the same semantics, two provenance origins), the ten Phase 1
  building operation intents (covering all six categories, with the three
  documented example commands verbatim), the two reference engine
  profiles, six byte-pinned negotiation outputs, a coherent
  wall-upgrade solution/version/states/snapshot world, and a
  bidirectional BOQ trace set with a multi-contribution line.
- `*.invalid-*.json` — deliberately schema-invalid (at least 2 per family).
- `*.version-mismatch.json` — schema-valid payloads carrying a cross-major
  `contractVersion` (one per wire object); the codec must reject them with
  a typed error.

All fixture timestamps and ids are fixed constants; operation/state/
snapshot/trace ids are GENUINE derived identities (re-derivation over the
decoded fixtures reproduces every recorded id — asserted by
`identity.test.ts`). No clock, no randomness, no network in tests.

## Consumption

TypeScript (bun workspaces):

```ts
import {
  createOperationIntent,
  decodeSolutionVersion,
  negotiateOperationCapability,
  resolveLinesForOperation,
  deriveEngineeringOperationId,
  checkSolutionContractObject,
  REFERENCE_BUILDING_DOMAIN,
  REFERENCE_BUILDING_OPERATION_PROFILE,
} from "@aise/solution-contract";
```

Non-TypeScript: consume
`schemas/<family>/<Object>.schema.json` (self-contained draft-07) and
`schemas/manifest.json` for discovery; mirror the invariant codes and the
negotiation reason codes against the committed fixtures. Field semantics
are documented in the schema `description`s, in
`spec/solution-operation-contract.md` and in this README.

## Regeneration and tests

```bash
cd packages/solution-contract
bun run gen:schemas   # regenerate schemas/ (zero-byte diff on a clean tree)
bun test              # the package's 141-test suite
```

The root `bun run verify` gate picks the package up automatically
(typecheck via its tsconfig, lint, tests, and the workspace boundary
scanner — this package imports only from within `packages/` plus bare
specifiers).

## Non-goals (owned by other work items)

- The deterministic solution engine — operation application, state-delta
  computation, validation execution (PROD-022).
- The agent operation compiler / interaction loop (PROD-023).
- The interactive 3D/2D environment (PROD-024).
- Solution BOQ quantity derivation and cost (PROD-025).
- Server persistence, transport and authorization (backend work items).
