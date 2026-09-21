# PROD-021 — Deterministic building-operation fixture inventory evidence

**Work order:** `docs/productization-work-orders.md` §PROD-021 (SHARED).
**Corpus:** `packages/solution-contract/fixtures/` — 86 committed files
(43 valid, 29 typed-invalid, 14 version-mismatch), all fixed constants
(no clock, no randomness, no network).

## The initial building operation library (Phase 1, buildings only)

The ten advisory operation types of `BUILDING_OPERATION_TYPES`
(`packages/solution-contract/src/domain.ts`), organized by the six
work-order categories (`BUILDING_OPERATION_CATEGORIES`):

| Category | Operation types |
| --- | --- |
| site-preparation | `excavation`, `backfill`, `demolition-removal` |
| foundation | `foundation-placement`, `slab-placement` |
| structure | `block-wall-placement` |
| enclosure | `opening-creation`, `plaster-application` |
| services | `building-service-installation` |
| finishes | `finish-application` |

Every one of the ten types has a committed VALID intent fixture
(`fixtures/operation/EngineeringOperationIntent.valid-<type>.json`),
asserted by `fixtures.test.ts` ("the valid intent fixtures cover ALL ten
Phase 1 building operation types"). The types are declared `supported`
with their required parameters and honest limitations by the reference
engine profile
(`fixtures/capability/OperationCapabilityProfile.valid.json`, exported as
`REFERENCE_BUILDING_OPERATION_PROFILE`) — the catalogue is ENGINE-owned
reference data; the wire `operationType` stays an open string.

## Intent fixture inventory (units, targets, provenance, lifecycle coverage)

| Fixture file | Type | Parameters (value + unit) | Spatial target | Provenance origin |
| --- | --- | --- | --- | --- |
| `valid-excavation-direct.json` | excavation | depth 1.5 m, width 2.0 m, length 3.0 m | volume @ node-site-001 + polygon geo-pit-outline-001 | **direct-manipulation** (interactionDetail: "operator dragged the excavation volume handles in the 3D view"; derivationNote) |
| `valid-excavation-agent.json` | excavation | depth 1.5 m, width 2.0 m, length 3.0 m | volume @ node-site-001 + polygon geo-pit-outline-001 | **agent** (commandText: "Excavate a pit 1.5 m deep, 2 m wide and 3 m long.") |
| `valid-backfill.json` | backfill | depth 1.5 m, width 2.0 m, length 3.0 m | volume @ node-site-001 | direct-manipulation |
| `valid-demolition-removal.json` | demolition-removal | length 5.0 m, height 2.4 m, thickness 0.1 m | face-set @ node-wall-002 + polygon geo-wall-faces-002 | direct-manipulation (proposes into solution-demo-001 v1) |
| `valid-foundation-placement.json` | foundation-placement | length 5.0 m, width 0.6 m, depth 0.5 m, material plain-concrete | line-extent @ node-wall-002 + plane geo-footing-line-004 | direct-manipulation |
| `valid-slab-placement.json` | slab-placement | length 4.0 m, width 3.0 m, thickness 0.15 m, material reinforced-concrete | surface-region @ node-site-001 + polygon geo-slab-region-005 | direct-manipulation |
| `valid-block-wall-placement.json` | block-wall-placement | length 5.0 m, height 1.0 m, thickness 0.1 m, material concrete-block | line-extent @ node-wall-002 + plane geo-wall-line-003 | **agent** (commandText: "Lay blocks to a height of 1 m along this wall.") |
| `valid-opening-creation.json` | opening-creation | width 0.9 m, height 2.1 m, material timber-frame | element @ node-wall-002 | direct-manipulation |
| `valid-plaster-application.json` | plaster-application | thickness 30 mm, material cement-plaster | face-set @ node-wall-002 + polygon geo-wall-faces-002 | **agent** (commandText: "Apply 30 mm plaster to the affected wall faces.") |
| `valid-building-service-installation.json` | building-service-installation | length 12.0 m, diameter 25 mm, material pvc-conduit | line-extent @ node-wall-002 + plane geo-wall-line-003 | direct-manipulation |
| `valid-finish-application.json` | finish-application | thickness 2 mm, material acrylic-paint | face-set @ node-wall-002 + polygon geo-wall-faces-002 | direct-manipulation |

Every numeric parameter carries an explicit unit (enforced by the
`numeric_parameter_without_unit` invariant; the corpus guarantee test
proves every valid fixture passes every invariant of its object). Every
target anchors to observed reality through read-only node and/or geometry
references with explicit linear/angular units.

The three documented example commands of
`docs/interactive-engineering-solution-workflow.md` appear VERBATIM as
agent command texts (asserted by `fixtures.test.ts`):

```text
Excavate a pit 1.5 m deep, 2 m wide and 3 m long.
Apply 30 mm plaster to the affected wall faces.
Lay blocks to a height of 1 m along this wall.
```

## The direct-manipulation vs agent origin proof

The canonical pair is `valid-excavation-direct.json` vs
`valid-excavation-agent.json` (the workflow doc's excavation example):

- **Identical semantic fields:** operationType, domain, parameters, target
  and dependsOn are deep-equal (asserted in `identity.test.ts` and
  `fixtures.test.ts`);
- **Different provenance only:** origin `direct-manipulation` (with
  interactionDetail + derivationNote) vs `agent` (with the exact
  normalized commandText), different authors, instants and intent ids;
- **Same operation identity:** `deriveEngineeringOperationId` over both
  derives the SAME id — attribution is excluded from the identity
  projection by design (the acceptance criterion made structural);
- **Same negotiation:** `negotiation.test.ts` proves the negotiation is
  origin-blind (direct and agent intents negotiate to byte-identical
  outcomes, differing only in the echoed intentRef).

One constructor surface, two provenance origins: both fixtures were
produced through `createOperationIntent` (the package's single authoring
constructor), which validates the wire schema AND the cross-field
invariants.

## Negotiation-support intents (capability honesty fixtures)

| Fixture | Purpose | Negotiation fixture (byte-pinned) |
| --- | --- | --- |
| `valid-future-vertical-mep.json` (vertical `mep`, type `conduit-run`) | extensibility proof: a future vertical is schema-valid on the wire | `OperationCapabilityNegotiation.valid-unsupported-future-vertical.json` → `unsupported` (domain-not-declared, reason names 'mep' and the declared verticals) |
| `valid-undeclared-operation-trench-shoring.json` | an operation type outside the Phase 1 catalogue | `...valid-unsupported-undeclared-operation.json` → `unsupported` (operation-type-not-declared, reason names 'trench-shoring') |
| `valid-blocked-missing-depth.json` (excavation without depth) | the under-specified case | `...valid-blocked-missing-parameter.json` → `blocked`, missingParameters `["depth"]` (the agent must ASK, never invent) |

Plus `OperationCapabilityNegotiation.valid-executable.json` (the agent
excavation intent over the reference profile → `executable`),
`...valid-executable-degraded.json` (plaster over the PARTIAL profile →
`executable` with `capability-degraded` and the surfaced limitation) and
`...valid-unknown.json` (excavation over the partial profile, where the
excavation entry status is `unknown` → `unknown`, never reported as
`unsupported`). All six negotiation fixtures are the exact wire form of
`negotiateOperationCapability(intent, profile)` over the committed intent
and profile fixtures (asserted by `negotiation.test.ts`).

## Lifecycle coverage

| Fixture | Lifecycle state covered |
| --- | --- |
| `solution/Solution.valid.json` | `validated` (currentVersionNumber 1, version 1 validated with a declared snapshot) |
| `solution/Solution.valid-superseded.json` | `superseded` (WITH `supersededBy` successor + proposal-branch lineage `branch`) |
| `solution/SolutionVersion.valid.json` | a `validated` version (3 operations, 4 states, validationSnapshotRef declared) |
| `solution/SolutionVersion.valid-draft-v2.json` | a `draft` revision (parentVersionNumber 1; v2 re-records the sequence + a finish-application operation; 4 operations, 5 states; no snapshot yet) |
| `state/ProposedState.valid-baseline.json` | layer 0 (the baseline overlay; epistemicStatus PROPOSED) |
| `state/ProposedState.valid-layer.json` | layer N (3 applied operations, in order) |
| `validation/SolutionValidationSnapshot.valid-pass.json` | outcome `pass` (4 explicit passing checks) |
| `validation/SolutionValidationSnapshot.valid-review-needed.json` | outcome `review-needed` (worst-of over a review-needed check) |
| `solution/Solution.invalid-bad-status.json` | typed-invalid: `approved` is NOT a solution lifecycle status (approval is an Engineering Case act) |

The `abandoned` status is exercised by the transition-table tests
(`lifecycle.test.ts`: draft → abandoned and validated → abandoned are
legal; the vocabulary and terminality are fully asserted there).

## The coherent demo world (traceability fixtures)

The operation/state/snapshot/trace fixtures compose one deterministic
"Ground-floor wall upgrade solution" (`solution-demo-001`, baseline
`rgv-demo-0007`):

```text
demolition-removal (op 1)  →  block-wall-placement (op 2, depends on op 1)
                            →  plaster-application (op 3, depends on op 2)
states 0..3 (PROPOSED, pinned baseline, ordered applied operation ids)
validation snapshot (pass; inputDigest pins the version content)
BOQ trace set v1: line-1 (op 1 created), line-2 (op 2 created),
                  line-3 (op 1 removed + op 3 created — multi-contribution)
```

All recorded operation ids, state ids, the snapshot id and the trace ids
are GENUINE derived identities — re-derivation over the decoded fixtures
reproduces every recorded id (asserted by `identity.test.ts`). See
`boq-trace-conformance.md` for the bidirectional resolution proofs.
