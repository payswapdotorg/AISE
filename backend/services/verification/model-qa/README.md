# @aise/backend-model-qa — AISE-014 Self-Consistency / Geometry QA

The deterministic **verification layer** over the canonical Reality Graph
(architecture position: `EVIDENCE + UNCERTAINTY → SELF-CONSISTENCY QA →
ENGINEERING RULES → HUMAN VERIFICATION → AUTHORITATIVE MODEL`).

It is a **verifier, not a model authority**: the Reality Graph (AISE-011)
remains the only canonical model authority, the evidence subsystem
(AISE-012) remains the authoritative provenance mapping, and AISE-013
remains the only model-readiness authority. QA composes read-only over
all three through narrow reader ports, reports machine-readable findings
with stable identities and deterministic digests, and fails closed at
the CRITICAL profile wherever an invariant cannot be established.

## Public surface

| Module | Role |
| --- | --- |
| `errors` | Typed, fail-closed `ModelQaError` (pure-layer cause codes preserved) |
| `units` | Exact SI factors for the model's frozen unit vocabulary |
| `vocabulary` | Check families, finding codes, outcomes, the fixed blocking policy |
| `findings` | Finding records + stable derived identities + canonical order |
| `report` | The deterministic `QAReport` (counts, digest, report id, order-preserving filters) |
| `inputs` | Run inputs + reader-port contracts (`QaModelReader`, `QaEvidenceMappingReader`, `QaReadinessReader`) |
| `boundary` | Fail-closed input validation (graph/mapping/readiness re-validated here) |
| `view` | The immutable read view the check families operate on |
| `checks/` | The five check families (geometry, topology, semantic, epistemic, cross-object) |
| `runtime` | Bounded service composition (`runModelQa` is the pure library entry) |

## Check families and codes (24 codes)

- **GEOMETRY** — `GEOMETRY_INVALID` (the model's own constructors run as
  validators over committed geometry — the AISE-011 whole-graph validator
  does not validate geometry, so this is the first-line structural gate),
  `GEOMETRY_DIMENSION_NON_POSITIVE`, `GEOMETRY_SILL_HEAD_INCONSISTENT`,
  `GEOMETRY_EXTENTS_MISMATCH` (width/height vs rectangle extents, in the
  space's declared coordinate unit), `GEOMETRY_AREA_MISMATCH` (area vs
  width × height, exact SI conversion), `GEOMETRY_ELEVATION_MISMATCH`
  (declared elevation vs the plane's height along the space's up axis),
  `OPENING_EXCEEDS_HOST`, `OPENING_MISPLACED` (opening dimensions and
  head/sill heights vs the host wall).
- **TOPOLOGY** — `HIERARCHY_RANK_INVALID`, `MULTI_CONTAINER`,
  `MULTI_HOST`, `OPENING_SPACE_MISMATCH` (the containment structure vs
  the hosting relationship).
- **SEMANTIC** — `KIND_FIELD_INCOMPATIBLE` (the model's own field/class
  matrix: `elevation` → FLOOR/CEILING, `sillHeight` → WINDOW,
  `headHeight` → DOOR/WINDOW), `PROPERTY_GEOMETRY_CONTRADICTION`
  (dimension-named property vs geometry quantity, exact SI).
- **EPISTEMIC** — `CONFIRMATION_INVALIDATED` (AC-062/AC-063 via
  `computeVersionValidity`), `CONFIRMATION_UNSUPPORTED` (no mapping to
  verify against), `EVIDENCE_REF_UNREGISTERED`,
  `EPISTEMIC_UPGRADE_VIOLATION` (object state stronger than its weakest
  geometry asset), `READINESS_CONTEXT_MISMATCH` (AISE-013 record pinning
  other content), `PROVENANCE_SELF_REFERENCE`.
- **CROSS_OBJECT** — `OVERLAP_FORBIDDEN` (same-class co-planar overlap),
  `DUPLICATE_REPRESENTATION` (identical geometry, one physical object),
  `OPENING_OUTSIDE_HOST` (rectangle containment / plane mismatch),
  `FLOOR_CEILING_ELEVATION_REVERSED`.

## Outcome semantics (never conflated)

- `CONTRADICTION` — affirmative conflict. **Always blocking**, at every
  profile. Never advisory.
- `INSUFFICIENT_EVIDENCE` — required support missing. Blocking from
  `HIGH_ASSURANCE` up.
- `UNEVALUABLE` — the check cannot establish its invariant on the given
  content. Blocking at `CRITICAL` (fail closed).
- Report outcome `PASS` exists **iff** the report carries zero findings.
  No "conditional" authority state is invented (AISE-020 owns downstream
  policy).

Missing data is never interpreted as absence: a check that cannot decide
says `UNEVALUABLE`. The one place "different planes → no overlap" looks
like absence reasoning, it is geometry instead: two zero-thickness planar
rectangles in different planes have an intersection of measure zero —
positive-area overlap is geometrically impossible, and co-planar rotated
frames (the genuinely undecidable case) produce `UNEVALUABLE`.

## Layering: boundary vs findings

The boundary (`validateQaInput`) re-validates the graph with the model
layer's own `validateRealityGraph` (identity re-derivation, referential
integrity, hierarchy, digest re-derivation, immutability) and the
mapping with `validateEvidenceGraph`. Structurally broken graphs are
`GRAPH_INVALID`/`MAPPING_INVALID` errors — fail-closed, no report.

What the boundary rejects (and QA does not re-report as findings):
missing endpoints, wrong endpoint kinds, duplicate relationship triples,
orphan objects, parent-chain cycles, duplicate property keys per entity,
digest/content mismatches, non-finite content (the canonical serializer
itself cannot pin non-finite numbers).

What the boundary does NOT validate — and the checks therefore own —
geometry (structural validity, extents, areas, elevations, orientations,
opening positions), rank ordering, multi-container/multi-host claims,
cross-object overlap/duplication, evidence support of confirmations,
epistemic discipline, readiness pinning, provenance cycles.

## Determinism

No wall clock, no randomness, no environmental input participates in
findings, reports, digests or identities. Identical inputs produce
bit-identical reports: canonical finding order (family, code, subject,
related, detail, identity), service-computed counts, a report digest
over all report content, and a `reportId` derived from the digest.
`filterFindings` returns the sub-sequence of canonical order.

## Commands

```bash
npm run dev        --workspace @aise/backend-model-qa   # boot/shutdown contract
npm run typecheck  --workspace @aise/backend-model-qa
npm run test       --workspace @aise/backend-model-qa
```

## Known limitations (v1, documented)

- Object-level content hashes are not re-derived by QA (the model layer
  does not export the derivation; object content pins are transitively
  covered by the graph digest).
- Overlap checking covers same-class pairs in one space with the v1
  planar-rectangle vocabulary; cross-class overlap rules (which pairs
  may legitimately overlap, e.g. a door in a wall) are class-pair
  knowledge the frozen v1 vocabulary does not declare.
- Co-planar rotated frames are `UNEVALUABLE` (exact 2D polygon clipping
  is out of scope for the v1 deterministic suite).
- QA records the AISE-013 readiness verdict as context and checks its
  content pins; it draws no readiness conclusions of its own.
- The service is a deterministic verification library, not a
  request-serving process; readers bind at the API composition point
  (AISE-015/016 surfaces).
