# WORLD-P1 — Layer 1 OpenSpace Parity (Experience Lane)

**Item:** WORLD-P1 — Layer 1 OpenSpace parity (worker-a)
**Base:** `82f31d6` (the P0-wave-complete state: P0-A/P0-B/P0-C all landed)
**Branch:** `work/WORLD-P1`
**Deliverable:** `packages/world-layer1-experience/` (`@aise/world-layer1-experience`)
**Evidence set:** this directory (`docs/world-program-evidence/WORLD-P1/`)

## What this item delivers

The Layer-1 experience lane — the OpenSpace-parity lane the
2026-10-02 product directive fixes:

```text
CAPTURE → SPATIALIZE → REGISTER → RECONSTRUCT → NAVIGATE → COMPARE → MEASURE → EVIDENCE
```

— as substrate-neutral TYPED TRANSFORMS composing the P0 substrate
ports with the existing capture/evidence seams. Each stage is an
explicit typed transform with PURE validators, controlled entry
points, and in-memory substitution doubles (reference + alternate)
whose outputs are BYTE-IDENTICAL on the committed fixtures — proving
the lane WITHOUT any substrate: no Babylon, no Cesium, no OCCT, no
reconstruction engine, no network, no clock, no randomness.

Per the world-program P1 acceptance shape (P0 defines contracts, not
integration): the experience lane is delivered as a NEW self-contained
package whose typed contracts the app composes in WORLD-P4 (the UX
transformation). P1 proves the lane; P4 wires the primary UI.

## The package map

```text
packages/world-layer1-experience/src/
├── lane.ts            the lane identity, the eight stages, the digest/instant
│                      disciplines, the substrate-id quarantine patterns
├── failures.ts        the typed failure vocabulary — HFX-000 kinds IMPORTED
│                      from @aise/provider-registry (never modified)
├── fixtures.ts        the committed deterministic site scenario (integer
│                      coordinates → exact IEEE-754 arithmetic)
├── capture/           CAPTURE → SPATIALIZE → REGISTER
│   ├── contract.ts    the seam's CaptureSessionEnvelope in; the
│   │                  SpatializedWorldFragment (registration states,
│   │                  spatial coverage, geospatial binding) out
│   ├── spatialize.ts  the pure transform (visible omissions, declared
│   │                  poses/volumes, never-fabricated coverage)
│   ├── register.ts    the anchoring-vocabulary registration (echo law,
│   │                  fail-closed on insufficient hypotheses)
│   └── doubles.ts     reference (direct) + alternate (table-driven)
├── world/             RECONSTRUCT → NAVIGATE
│   ├── contract.ts    the NavigableWorld (a typed ComposedScene value +
│   │                  per-element provenance), layer toggles as typed
│   │                  visibility predicates, bookmarks as typed states
│   ├── reconstruct.ts the composition (registration gate, one frame per
│   │                  world, identity quarantine, ghost law)
│   ├── navigate.ts    the visibility predicate + bookmark round-trips
│   └── doubles.ts     reference (direct) + alternate (index-backed)
├── compare/           COMPARE + MEASURE
│   ├── contract.ts    aligned pairs, the closed difference-classification
│   │                  vocabulary, tolerance-DECLARED verdicts delegating
│   │                  to the P0-B exact-geometry vocabulary; the
│   │                  point/line/area/volume/containment query contracts
│   ├── compare.ts     the tolerance-declared comparison (declared
│   │                  near-boundary band — never implicit)
│   ├── measure.ts     the declared-tolerance measurement queries
│   └── doubles.ts     reference (closed-form kernels) + alternate
│                      (vector-micro-kernel decomposition)
├── evidence/          EVIDENCE
│   ├── contract.ts    the Evidence-Envelope bindings + the
│   │                  what-is-here / what-changed query contracts
│   ├── bind.ts        the binders (Derivation + ProvenanceLink seeds —
│   │                  the shared-contracts seam types, INFERRED)
│   ├── queries.ts     the evidence-backed queries (honest answers:
│   │                  not-covered never implies absence)
│   └── doubles.ts     reference (direct) + alternate (index-backed)
├── substitution.test.ts   the three substitution LAWS proven at the lane level
├── determinism.test.ts    behavioral + source-level determinism proof
└── <family>.test.ts       per-family unit + fail-closed + property tests
```

## The seams consumed (composed, never redefined)

| Seam | Package | What P1 consumes |
|---|---|---|
| Capture session | `@aise/shared-contracts` `CaptureSessionEnvelope` | the spatialize input, verbatim |
| Evidence envelope | `@aise/shared-contracts` `Evidence`/`Derivation`/`ProvenanceLink` | the binding outputs (decoded through the shared wire codecs in the tests) |
| Epistemic statuses | `@aise/shared-contracts` `EPISTEMIC_STATUSES` | the INFERRED law (capture-derived facts) |
| Anchoring vocabulary | `@aise/anchoring-contract` `AnchoringHypothesis`/`AnchoringOutcome` | the registration inputs/verdicts, verbatim |
| Scene composition | `@aise/world-reality-substrate` `ComposedScene`/`SceneNode`/`CameraState`/`SectionPlane`/`SiteFrame`/`WorldBounds`/`validateScene` | the world's scene model + navigation state types |
| Geospatial context | `@aise/world-reality-substrate` `SiteGeoreference`/`GeodeticPosition` | the registration georeference binding |
| Exact geometry | `@aise/world-understanding-substrate` `GeometryShapeDeclaration`/`GeometryToleranceDeclaration`/`GeometryUnitDeclaration`/`GeometryQuantityKind`/`GeometryPoint3` | the comparable-geometry vocabulary (delegated to) |
| IFC labels | `@aise/world-understanding-substrate` `NamespacedExternalLabel` | the plan elements' external labels (ifc-guid etc.) |
| Failure vocabulary | `@aise/provider-registry` `FailureKind`/`FAILURE_KINDS` | the closed HFX-000 refusal kinds (imported, never modified) |

## The gates (this delivery)

| Gate | Result |
|---|---|
| `bun run verify` (typecheck + lint + test + boundaries) | **PASS** — 6962/6962 (baseline 6824/6824 + 138 new, zero regressions) |
| `git diff --stat 82f31d6..HEAD` | only `packages/world-layer1-experience/**` + `docs/world-program-evidence/WORLD-P1/**` |
| Substitution law (doubles prove every contract WITHOUT substrates) | proven — `src/substitution.test.ts` (byte-identity on the fixtures) |
| Evidence set committed with the branch | this directory |
| Determinism (no network/clock/randomness in the contract core) | proven — `src/determinism.test.ts` (behavioral + source-level) |

Sandbox note (honest): this sandbox initially lacked the Playwright
Chromium browser, making 3 pre-existing PROD-030/031 browser-journey
tests fail AT THE PINNED BASE (6820 tests, 6817 pass, 3 env-fail —
identical with and without this branch). Installing Chromium
(`bunx playwright install chromium`) resolved them; the verify gate
then reports 6962/6962. No test outcome was changed by this branch —
the 3 environment failures exist identically at `82f31d6`.

## The evidence set contents

| File | What it carries |
|---|---|
| `README.md` | this file |
| `CAPABILITY-BOUNDARIES.md` | what the lane CAN/CANNOT do at P1; the large-model performance BLOCKED declaration with the WORLD-P4 measurement protocol |
| `PERFORMANCE-OBSERVATIONS.md` | REAL in-sandbox contract-level throughput (the harness `measure.ts` + `measurements-raw.txt`; zero fabricated numbers) |
| `TEST-TRANSCRIPT.md` | the test-run transcript with the exact counts |
| `measure.ts` + `measurements-raw.txt` | the measurement harness IS the method (re-runnable) |

## Findings for the TL (summary — full detail in the report)

1. **SEAM-CHANGE-REQUEST (none blocking):** no seam change was needed;
   the P0-A/P0-B contracts and the capture/evidence seams composed
   cleanly. One composition observation recorded: the shared
   `Derivation` type requires a `createdAt` instant, so the
   measurement binding takes a DECLARED `declaredAt` parameter (the
   lane never reads a clock) — recorded in CAPABILITY-BOUNDARIES.
2. **World identity semantics:** `worldId` is the digest over the
   world's IDENTITY INPUTS (site frame + fragment ids + plan-model id
   + georeference) and deliberately NOT over the per-revision content
   — revisions of the same world share the identity, which is what
   `what-changed` (and every cross-revision query) requires. This is
   a P1 contract decision the TL should ratify for WORLD-P4.
3. **The near-boundary band is a declared input** (`nearBoundaryBand`)
   — an early draft derived the band implicitly from the tolerance;
   the honest fix (tolerances are declared, never implicit) made the
   band an explicit request field. Recorded so WORLD-P4 carries it
   through the UI.
