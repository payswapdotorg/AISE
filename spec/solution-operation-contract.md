# AISE Solution Operation Contract

## Purpose

Define the stable, domain-extensible contract for the interactive
engineering solution workflow (ACR-005): the versioned Solution Graph of
typed engineering operations and proposed states, the typed operation
intents that direct manipulation and agent commands both compile into, the
lifecycle/version/branch semantics of proposals, the operation capability
negotiation, and the bidirectional solution-step ↔ generated-BOQ-line
identity contracts.

The contract is a proposal-authoring system, not a second reality system.
The Solution Graph is canonical only for a proposed solution's
operation/state history; it is never observed reality, and it never mutates
the authoritative Reality Graph.

## Checkable contract artifacts (PROD-021)

This prose contract is formalized as a **versioned, testable contract
package**: `packages/solution-contract/` (`@aise/solution-contract`),
mirroring the `@aise/adapter-contract` discipline (TypeScript zod source of
truth + committed self-contained draft-07 JSON Schemas + committed fixture
corpus + deterministic schema-generation script).

- **Contract version:** `SOLUTION_CONTRACT_VERSION = 1.0.0` (the package
  version IS the contract version; every contract family — solution,
  operation, state, validation, capability, trace, domain — ships it;
  asserted by tests).
- **The fourteen wire objects** (each a versioned, checkable wire object
  with decode/decodeStrict/encode codecs, a committed JSON Schema and
  committed fixtures):

| Family | Wire objects |
|---|---|
| `solution` | `Solution`, `SolutionVersion` |
| `operation` | `EngineeringOperation`, `EngineeringOperationIntent`, `OperationTarget`, `OperationDependency`, `OperationEffect` |
| `state` | `ProposedState` |
| `validation` | `SolutionValidationSnapshot` |
| `capability` | `OperationCapabilityProfile`, `OperationCapabilityNegotiation` |
| `trace` | `SolutionBoqLineTrace`, `SolutionBoqTraceSet` |
| `domain` | `SolutionDomainDescriptor` |

- **Regeneration / tests:** `cd packages/solution-contract && bun run
  gen:schemas` regenerates the committed schemas byte-identically;
  `bun test` runs the package's suite; the root `bun run verify` gate picks
  the package up automatically.
- **Compatibility window:** from the PROD-021 merge, the solution wave
  workers (PROD-022 engine, PROD-023 agent compiler, PROD-025 BOQ
  derivation) must not change this shared contract without a new governed
  SHARED work item — see
  `docs/productization-evidence/PROD-021/contract-artifacts.md`.

## Solution graph objects

```text
AUTHORITATIVE OBSERVED / CONFIRMED REALITY (pinned baselineRealityVersionId)
                 ↓
           ProposedState 0        (baseline overlay)
                 ↓ operation 1
           ProposedState 1
                 ↓ operation 2
                 ...
                 ↓ operation N
           ProposedState N        (final proposed state)
```

- **`Solution`** — the proposal identity: project, title,
  `problemStatement`, the vertical (`SolutionDomainDescriptor`), the PINNED
  `baselineRealityVersionId` (a read-only reference to the authoritative
  Reality-Graph version the solution branches from), the literal
  `epistemicClass: "PROPOSED"` seal, the governed lifecycle status, the
  current version pointer and the proposal-branch lineage.
- **`SolutionVersion`** — one immutable versioned snapshot: the ORDERED
  `EngineeringOperation` sequence and the resulting `ProposedState` array
  (`states[N] = layer N`; `states.length === operations.length + 1`;
  `states[0]` is the baseline overlay), the version lineage
  (`parentVersionNumber`) and the declared validation snapshot when
  validated.
- **`EngineeringOperation`** — the typed, reproducible unit of the graph:
  deterministic identity, version context (`solutionId`, `versionNumber`,
  1-based `operationIndex`), open-vocabulary `operationType`, the vertical
  descriptor, explicit typed parameters WITH units, a stable spatial
  `OperationTarget` anchored to observed reality through read-only
  references, `OperationDependency` precedence edges, engine-derived
  `OperationEffect`s (state transitions + quantity impacts with typed units
  and calculation provenance) and full `OperationProvenance`.
- **`ProposedState`** — one proposed layer: the deterministic `stateId`
  (the SAME identifier feeds the synchronized 3D/2D/BOQ views), the pinned
  baseline, the literal `epistemicStatus: "PROPOSED"` seal, the ordered
  applied operation ids and an optional content digest.

## Operation intents and the two equivalent authoring modes

`EngineeringOperationIntent` is the typed authoring object: explicit units
(`TypedOperationParameter`: numeric values REQUIRE a unit), spatial target,
parameters, dependencies and provenance (`origin: direct-manipulation |
agent | imported-template`, attribution, evidence ids, the EXACT normalized
agent `commandText`).

`createOperationIntent(input)` is the ONE constructor surface for both
modes. The SEMANTIC fields are identical regardless of origin; only the
provenance differs. Because the deterministic identity derivation EXCLUDES
provenance, the same semantics authored by direct manipulation or by an
agent is the SAME operation (`deriveEngineeringOperationId` over both
origins yields the same id — proven by the committed fixture pair and by
tests). Authoring an intent is not authority: the server solution engine
validates, negotiates capability, compiles and executes it; the agent may
only translate, clarify and propose.

## Deterministic identity rules

Identities are content addresses (sha-256 over canonical JSON of a curated
semantic projection — the intervention model's `deriveStateId` discipline):

- **Operation identity** — version context + operation type + vertical +
  typed parameters + spatial target + dependencies. Excluded by design:
  provenance (origin, author, instant, command text, evidence),
  rationale, descriptions, effects, timestamps and `contractVersion`
  (a same-major minor bump must not re-address history).
- **Proposed-state identity** — solutionId, versionNumber, stateIndex,
  pinned baseline, ORDERED applied operation ids, content digest.
  `materializedAt` excluded (identity is content, not the moment of
  materialization).
- **Validation-snapshot identity** — what the snapshot certifies:
  solutionId, versionNumber, inputDigest, engine kind+version, outcome.
- **BOQ-line-trace identity** — solutionId, versionNumber, boqLineId:
  version-pinned by construction.

## Lifecycle, version and branch semantics

```text
draft ────► validated ────► superseded   (terminal)
  │             │
  │             └─────────► abandoned    (terminal)
  └───────────────────────► abandoned
```

`SOLUTION_LIFECYCLE_TRANSITIONS` is the governed table
(`assertSolutionLifecycleTransition` enforces it with a typed error).
Revision is versioning, never rewriting: editing creates a new
`SolutionVersion` (with parent lineage) or a proposal branch (`Solution.branch`),
and the superseding successor is named (`supersededBy`). The vocabulary
carries NO approval semantics — approving an intervention is an Engineering
Case domain act. A validated version must declare its validation snapshot
(the BOQ generation gate); version 1 has no parent; a superseded solution
names its successor (all invariant-checked).

## Validation snapshots

`Validate` is a server-side deterministic operation (PROD-022); this
contract carries its RECORD: `SolutionValidationSnapshot` with the explicit
findings (`checks`: `pass | fail | unknown | review-needed`, never empty),
the worst-of `outcome` (fail > review-needed > unknown > pass —
invariant-checked, helper `validationOutcomeWorstOf`), the `inputDigest`
pinning the exact validated solution-version bytes, the engine identity and
the deterministic snapshot id. A generated solution BOQ exists only tied to
a declared validation snapshot of a validated solution version.

## Operation capability negotiation

`negotiateOperationCapability(intent, profile)` maps a typed intent and the
ENGINE-owned `OperationCapabilityProfile` (per-vertical, per-operation-type
honest statuses + required parameter names + limitations) to an explicit
`OperationCapabilityNegotiation`:

- `executable` — capability declared and all required parameters present
  (with the degraded case's limitations surfaced);
- `blocked` — the intent is underspecified: required parameters missing
  (`missingParameters` in declaration order). The agent must ASK, never
  invent;
- `unsupported` — definitively not supported (a future vertical, an
  undeclared operation type, an unavailable entry), with the honest reason
  naming it;
- `unknown` — capability undetermined (the frozen honesty discipline:
  `unknown` is never conflated with `unsupported`).

Unsupported-operation states are explicit, never silent; reasons are never
empty. Negotiation is pure, deterministic, origin-blind and carries no
validation/readiness/approval semantics — it changes execution strategy and
operator/agent burden, never the truth standard.

## BOQ derivation and bidirectional navigation

```text
BOQ line ──resolveOperationsForLine──► contributing solution steps
solution step ──resolveLinesForOperation──► generated/affected BOQ lines
```

`SolutionBoqLineTrace` carries one generated line's full trace: the
version-pinned contributing operations (`created | modified | removed` —
never empty), the typed quantity (explicit unit + calculation reference +
optional propagated uncertainty) and geometry references.
`SolutionBoqTraceSet` is the version-pinned set generated from ONE declared
validation snapshot; every line trace must pin the set's
solutionId/versionNumber/snapshot (invariant-checked). Resolution in both
directions is pure and the round trip closes (line → contributions → lines
includes the original line — asserted over the committed fixture). A
generated solution BOQ is a derived projection: the source BOQ remains a
separate source/revision and is never silently overwritten.

## Domain extensibility (Phase 1: buildings)

Phase 1 is buildings only. The building specifics live behind
`SolutionDomainDescriptor` (open `vertical` vocabulary with advisory value
`building`; `operationVocabulary` naming the engine-owned catalogue;
`extensions` as opaque data), and the wire `operationType` is an open
string — the closed Phase 1 catalogue (ten types across site preparation,
foundation, structure, enclosure, services, finishes) is reference data the
ENGINE owns. **Nothing building-specific is encoded into client-facing
types as authority.** The documented future verticals (civil-works, mep,
industrial-equipment, electronics, integrated-circuits) are addable
WITHOUT contract changes or client changes: their descriptors and intents
are representable on the wire today, and an engine that does not declare
capability for them negotiates to an explicit, honest `unsupported`.

## No mutation of authoritative reality

- The only reality references are read-only pins (`baselineRealityVersionId`
  on `Solution` and every `ProposedState` — stable-id references).
- The proposal seals are schema-level: `ProposedState.epistemicStatus` and
  `Solution.epistemicClass` are the literal `"PROPOSED"`;
  OBSERVED/INFERRED/CONFIRMED are unrepresentable inside a proposal.
- The contract package exposes no mutation path for authoritative state;
  the only client/agent-authored object is the intent (a request, never
  authority). These invariants are discrimination-tested (typed-invalid
  seal fixtures rejected; exported-name vocabulary and field-inventory
  checks).
- A proposal becomes observed reality only through execution, post-work
  evidence and the existing assurance/verification process.

## Conformance

The contract's own checkable guarantees (byte-stable schema generation,
codec version gate, fixture corpus validity, invariant cleanliness,
identity re-derivation, negotiation determinism, bidirectional trace
resolution, authority negatives) are enforced by the package's committed
test suite; the root `bun run verify` gate runs them on every change. The
PROD-022 engine and PROD-023 agent compiler consume this package as the
operation contract; the PROD-024 adapter surfaces render its objects
read-only.
