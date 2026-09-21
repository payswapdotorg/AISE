# @aise/solution-boq

The DETERMINISTIC SOLUTION BOQ DERIVATION of the AISE interactive
engineering solution workflow (Work Item PROD-025, QS/CORE) — turns a
validated interactive solution into an auditable, versioned, derived
building BOQ and makes the BOQ an explorable explanation of the virtual
construction/repair process, per ACR-005 and
`spec/solution-operation-contract.md` (the PROD-021 contract).

**Pure deterministic computation over `@aise/solution-contract` objects and
`@aise/solution-engine` outputs.** No network, no clock reads (**no
derivation-time field exists on a generated BOQ** — identical inputs
produce identical BOQs), no randomness, no I/O in the core — and **NO
WRITE PATH into any source BOQ store**: the generated BOQ is a NEW derived
projection referencing a source BOQ by IDENTITY ONLY
(`SourceBoqReference`); the source BOQ Lens store remains a separate
source/revision that is never overwritten.

## Layout

```text
src/boq-version.ts        SOLUTION_BOQ_KIND/VERSION + the derivation ref scheme
src/errors.ts             typed fail-closed outcomes + machine-readable codes
src/sections.ts           building BOQ sections (computed FROM the contract's categories)
src/elements.ts           building element labels + deterministic item wording
src/identity.ts           boqId / boqLineId / assumptionId content addresses
src/model.ts              the SolutionBoq document model + SourceBoqReference
src/assumptions.ts        uncertainty + unresolved-assumption propagation
src/derive.ts             deriveSolutionBoq (the core: gates → engine → lines → traces)
src/navigate.ts           bidirectional line ↔ operation navigation (via the CONTRACT)
src/delta.ts              version-pair BOQ diffs with operation-level lineage
src/verify.ts             self-contained verification + the typed source-vs-generated seal
src/index.ts              public API (functions + frozen constants ONLY)
src/*.test.ts             the six-suite deterministic + negative/discrimination tests
src/testkit.ts            shared deterministic test-world builders (TEST-ONLY)
scripts/generate-golden.ts  one-off golden-fixture generator (committed output)
fixtures/                 committed golden BOQs (wall-upgrade, two-pass, version-pair)
```

Tests: `bun test` in this package (the root `bun run verify` gate picks
them up automatically). No schemas are shipped here — the wire objects
(`SolutionBoqLineTrace`, `SolutionBoqTraceSet`, `SolutionValidationSnapshot`)
live in `@aise/solution-contract` (PROD-021, consumed, never modified).

## What the package does

### The derivation

`deriveSolutionBoq({ version, snapshot, sourceBoqRef? })` — the work
order's "compute solution quantities from deterministic operation/state
deltas; group operations into meaningful building BOQ lines":

```text
validated SolutionVersion + SolutionValidationSnapshot
  ↓ gates (identity · integrity · outcome · certified bytes · declaration)
deriveStateQuantities(version)      ← THE ENGINE (the single quantity authority)
  ↓ grouping + labeling             (this package NEVER recomputes a quantity)
building BOQ lines (units, materials, CITED calculation methods)
  ↓ assumption propagation          (uncertainty + unresolved checks — never dropped)
contract SolutionBoqLineTrace objects → SolutionBoqTraceSet
  ↓ document assembly + deterministic boqId
SolutionBoq (the DERIVED PROJECTION — never a source BOQ)
```

**The quantity authority rule:** every value, unit, dimension, calculation
reference, geometry/node reference and net total comes from the ENGINE's
outputs (`deriveStateQuantities` over the version — the engine's own
aggregation of its applied results). This package only GROUPS and LABELS.
The proof is structural: a version whose engine-recorded effect quantity
was altered after the fact carries the ALTERED value into the BOQ verbatim
(the tampered-quantity sabotage test) — a recomputation from parameters
would silently "fix" it back, which is exactly what must never happen.
The only engine field the inventory drops — the optional
`TypedQuantity.uncertainty` on effect quantities — is read from the same
engine-authored operation records, verbatim.

### The snapshot gates (fail closed, typed codes)

| Code | Rule |
|---|---|
| `snapshot_version_mismatch` | the snapshot pins THIS solutionId + versionNumber |
| `snapshot_identity_mismatch` | the snapshotId re-derives from its certified content (the contract's derivation) |
| `snapshot_outcome_fail` | outcome `fail` is not BOQ-generatable; `unknown` / `review-needed` ARE (their findings propagate as assumptions) |
| `snapshot_input_digest_mismatch` | the snapshot certifies these version bytes: sha-256(canonical JSON) === `inputDigest`. The lifecycle-declared form (status `validated` + `validationSnapshotRef`, added after validation) is accepted against the pre-flip certified bytes — every other difference is refused |
| `snapshot_declaration_mismatch` | a version DECLARING a snapshot (`validationSnapshotRef`) declares the generating one |
| `empty_version` | at least one quantity-carrying applied operation must exist (the contract's trace set requires ≥1 line) |
| `internal_invariant` | defense in depth: the emitted document passes the contract's trace invariants AND full self-verification |

### Building BOQ lines (grouping, units, materials, methods)

The engine's traced quantities are grouped into work items by
`(activity = operationType, dimension, unit, direction, material,
calculationRef)`. Each work item becomes ONE line with:

- **section** — the CONTRACT's `BUILDING_OPERATION_CATEGORIES` key
  (site-preparation … finishes), computed at runtime from the contract's
  own data (never a second taxonomy); unknown types land in the honest
  `other-works` fallback;
- **building element** — reference labels aligned with the contract's
  `building-element-taxonomy` extension (`aise-building-elements@1.0.0`,
  echoed on the document as `elementTaxonomy`);
- **unit** — honored verbatim from the ENGINE quantity unit (m3, m2, m,
  count…); a quantity is never a bare number;
- **material** — the operation's `material` parameter, verbatim;
- **calculation method** — CITED, never restated: the engine's versioned
  `calculationRef` (`aise-solution-engine/quantity/<type>/v1`) plus
  `methodSource` naming where the formula is documented
  (`packages/solution-engine/src/quantity-models.ts`). The engine is the
  single quantity authority — this package adds no formula of its own;
- **contributions** — the contributing operations with their
  `created | modified | removed` kinds: the first additive operation of a
  work item CREATES the line, later ones MODIFY it (two plaster passes
  over different face sets merge into one line), removal-direction work
  items carry `removed` contributions; each contribution carries the
  operation's geometry TARGET refs, reality node refs and the resulting
  proposed state (the solution step — the same state id that feeds the
  synchronized 3D/2D/BOQ views);
- **identity** — `boqLineId` is a version-pinned content address over the
  semantic work-item payload + the line's ASSUMPTION INVENTORY (the work
  order's identity-stable payload rule); `traceId` is the CONTRACT's
  `deriveSolutionBoqLineTraceId({solutionId, versionNumber, boqLineId})`
  (reused, never redefined).

Line order is deterministic: section order (the contract's category key
order) → first contributing operation index → dimension rank (the
contract's `QUANTITY_DIMENSIONS` order) → unit → activity → line id.

### Determinism and identity

- No clock: the document carries **no derivation-time field**; the
  deterministic `boqId` content address IS the derivation identity.
- Generating from the same certified version + declared snapshot twice
  yields the **byte-identical** BOQ (committed goldens, asserted by tests).
- Identity excludes presentation (`itemDescription`, titles), the deriver
  identity and provenance — two versions differing only in provenance
  metadata derive the SAME line ids (attribution is not semantics), while
  the same work item under a different version derives DIFFERENT line and
  trace ids (version-pinned by construction).

### Uncertainty and unresolved assumptions (never silently dropped)

- A validation check that did not pass (`unknown` / `review-needed`) becomes
  an explicit assumption entry whose statement carries the check's
  deterministic detail VERBATIM; every line references it through
  `assumptionRefs` (part of the line's identity payload).
- A stated effect-quantity `uncertainty` is carried verbatim on the line's
  quantity; identical statements across contributions carry once;
  CONFLICTING statements carry the first stated AND an
  `uncertainty-conflict` assumption documenting every statement — nothing
  averaged, dropped or invented. Absent means "not stated" — never zero,
  never fabricated.

### Bidirectional navigation (via the contract)

Both directions resolve through the CONTRACT's own pure resolvers over the
embedded `SolutionBoqTraceSet`:

```text
BOQ line ──resolveOperationsForLine──► contributing solution steps (+ geometry targets + resulting states)
solution step ──resolveLinesForOperation──► generated/modified/removed BOQ lines (+ contribution kinds)
```

`navigateLineToOperations` / `navigateOperationToLines` /
`assertBoqNavigationRoundTrip`. Unknown ids answer `undefined` (explicit);
a KNOWN operation contributing to no line answers an honest EMPTY array.
The round trip closes for every line (line → ops → lines includes the
original) and is version-pinned (a v1 operation id navigates nowhere in
the v2 BOQ).

### Version-pair deltas

`diffSolutionBoqs(from, to)` compares two generated BOQs of the SAME
solution: lines matched by SEMANTIC work-item key (never by the
version-pinned `boqLineId`), reporting `added | changed | removed |
unchanged` per line with quantity deltas and the OPERATION-LEVEL LINEAGE
(`contributionsAdded` / `contributionsRemoved`). A matched pair is
`changed` when the value or the contribution set differs — revision is
versioning, so re-applied identical work shows as changed lineage without
a quantity delta.

### Source vs generated (the typed distinction)

- `artifactKind: "solution-generated-boq"` — the literal typed seal;
  `isSolutionGeneratedBoq` is the type guard (a source BOQ Lens record is
  NEVER a solution-generated BOQ — proven both ways by tests).
- `epistemicClass: "PROPOSED"` — generated BOQ work is proposed work.
- `sourceBoqRef?: SourceBoqReference` — identity-only
  (`kind/importId/mediaType/byteSize`): no writable handle, no document
  payload, no store reference. No code path in this package (or the
  backend module) writes back into a source BOQ store — proven by the
  lexical no-write-path scan (core sources carry no fs-write/network/
  clock/random primitives) and the backend-level non-overwrite sabotage
  suite (the source record's canonical bytes are byte-identical before and
  after generation, readback and navigation).

## Fixtures

`fixtures/` (committed, deterministic — regenerated byte-identically by
`bun scripts/generate-golden.ts`):

- `wall-upgrade-boq-expected.json` — the GOLDEN generated BOQ of the
  contract corpus's wall-upgrade intents (demolition → block wall →
  plaster): 7 lines, 3 sections, 0 assumptions, engine-echoed totals;
- `two-pass-boq-expected.json` — the two-pass plaster world: one MERGED
  plaster line (12.5 + 5 = 17.5 m2) with a `created` + `modified`
  contribution pair, stated uncertainties carried verbatim and two
  uncertainty-conflict assumptions;
- `version-pair-expected.json` — the same solution's v1 and v2 BOQs plus
  the deterministic delta (taller wall: +1 m2 / +0.1 m3 / +13 blocks;
  second plaster pass: +5 m2 with the new operations' lineage).

## Reason-code inventory (fail-closed outcomes)

`snapshot_version_mismatch`, `snapshot_identity_mismatch`,
`snapshot_input_digest_mismatch`, `snapshot_declaration_mismatch`,
`snapshot_outcome_fail`, `empty_version`, `solution_mismatch`,
`internal_invariant` — every refusal carries a non-empty machine-readable
detail; never a silent drop, never a best-effort.

## Consumption

```ts
import {
  deriveSolutionBoq, verifySolutionBoq, isSolutionGeneratedBoq,
  navigateLineToOperations, navigateOperationToLines, diffSolutionBoqs,
} from "@aise/solution-boq";
```

The backend transport surface lives in `backend/api/src/solution-boq/`
(model / service / router — a pure route factory following the
`execution/` and `solution/` exemplars; the Tech Lead mounts it). This
package imports ONLY `@aise/solution-contract`, `@aise/solution-engine`,
`@aise/shared-contracts` and `node:crypto` — never `apps/**` or
`backend/**` (workspace boundary rules).

## Non-goals (owned by other work items)

- The operation/trace CONTRACT (PROD-021 — consumed, never modified).
- The engine: application, quantities, validation snapshots (PROD-022 —
  imported and called; the engine is the single quantity authority).
- The agent operation compiler (PROD-023), the interactive environment
  (PROD-024), the end-to-end composition (PROD-026).
- Costs/rates/pricing (not in the PROD-025 work order; quantities only).
- Source BOQ ingestion/normalization/mapping (the BOQ Lens modules — read
  as types for the distinction, never written).
