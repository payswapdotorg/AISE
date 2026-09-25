# HFX-302 — productization evidence (the geometry/validation technology substitution benchmark)

**Work item:** HFX-302 of
`docs/productization-layer-hardening-work-orders.md` (Layer 3 — Solution;
parent PROD-029; priority P3; owner GEOMETRY/CORE; dependencies
HFX-301, PROD-022, PROD-025 — all finalized at the pinned tree
`d11d03e`).
**Plan reference:** `docs/huggingface-hardening-execution-plan.md` §HF-4
("HFX-302 remains critical"; run-order: complete the HFX-302 substitution
evidence first) — the Days 22–26 checkpoint: "Layer-3 technology
substitution has at least one reproducible dual-provider or
reimplementation drill".

## What this evidence proves

The work order's purpose — *"Extend the technology-substitution
requirement into Layer 3 so geometry/constraint/validation technology can
be changed without changing AISE solution semantics"* — is evidenced end
to end:

1. **The adapter surface lets two implementations consume the same
   canonical operation sequence** — `executeSequence(provider, scene,
   operations)` (`backend/api/src/geometry-eval/adapter.ts`): the
   fail-closed capability gate answers undeclared families with the typed
   `unsupported` BEFORE execution; the canonical-boundary projection
   guard refuses provider-specific fields with the typed
   `contract-mismatch` (the D26 discipline at this seam). The reference
   oracle (the canonical engine, wrapped) and the independent
   discretized reimplementation (three committed profiles: fine, coarse,
   restricted) both sit behind this ONE port.
2. **The compatible cells prove semantically-compatible projections
   within declared tolerances across ALL TEN operation families** — 22
   sequences; every quantity within the substitute's declared
   per-dimension tolerance; validation verdicts AND per-check outcomes
   equal; topology constraints equal; BOQ lines within tolerance (both
   lanes' quantities through the SAME `deriveSolutionBoq` derivation).
3. **The declared-incompatible cells evidence that the comparison
   discriminates** — 5 sequences on the coarse-grid profile whose
   discretization error exceeds the declared tolerance; every divergence
   declared up front with the PROD-029 closed-vocabulary kind
   (`operation-semantic-failure`) and itemized with the tolerance breach.
4. **The unsupported cells record capability boundaries explicitly** — 4
   sequences naming the restricted profile's omitted families
   (demolition-removal, finish-application,
   building-service-installation), typed, never computed.
5. **The whole benchmark is reproducible with one command** — the
   committed goldens + the runner + the tolerance report (below).

## How to re-run it

```bash
bun run verify                                   # the full gate (typecheck + lint +
                                                 # 5766 tests incl. this benchmark's 89 +
                                                 # the boundary scanner) — VERIFY: PASS
bun tools/geometry-eval/runner.ts                # the committed-artifact check runner (22 checks)
bun tools/geometry-eval/runner.ts --update-goldens   # regenerate the committed artifacts (byte-identical)
bun test backend/api/src/geometry-eval/          # the module's live tests (the three cells,
                                                 # the negative controls, the historical replay)
```

The live byte-for-byte golden check (freshly computed suite vs. the
committed files) rides `backend/api/src/geometry-eval/golden.test.ts`;
the tools-side runner re-derives the summary from the committed data with
independent arithmetic (the boundary matrix forbids tools →
packages/backend imports).

## The behavior-matrix table (the committed corpus: 31 sequences)

| Cell | Sequences | Evidence |
|---|---|---|
| `compatible` | 22 | Zero divergent points over the five canonical comparison kinds (quantity-value, validation-check, validation-verdict, topology-constraint, boq-line); both lanes executed through the same adapter call; unit mixes (mm/cm/m); non-grid-aligned dimensions where the declared tolerance works; the multi-operation topology cases (a wall with openings, an excavation-then-backfill pair, a coat-over-baseline plaster case, a foundation-then-slab chain). |
| `declared-incompatible` | 5 | The coarse-grid profile on shapes whose discretization error exceeds the declared tolerance — every sequence declaring the expected comparison kind up front; breaches itemized with the declared tolerance + the observed delta (see `tolerance-report.md`). |
| `unsupported-by-substitute` | 4 | The restricted profile's omitted families, recorded by the fail-closed gate BEFORE execution; the reference oracle still executes (the engine governs both lanes equally). |

Expectation matches: **31/31** — every observed cell satisfies its
corpus entry's declared expectation (including the designed divergences
being caught with exactly the declared kind).

## The ten-family coverage table (the compatible cells)

| # | Operation family | Compatible sequences (examples) | Substituted quantity semantics |
|---|---|---|---|
| 1 | excavation | gs-excavation-core / -units / -nonaligned, gs-excavation-backfill-pair | volume + footprint by discretized cell accumulation |
| 2 | backfill | gs-backfill, gs-excavation-backfill-pair | volume by cell accumulation; the earthworks pairing topology |
| 3 | demolition-removal | gs-demolition, gs-demolition-nonaligned | removed volume + face area |
| 4 | foundation-placement | gs-foundation, gs-foundation-slab | footing volume + plan area |
| 5 | slab-placement | gs-slab, gs-slab-nonaligned, gs-foundation-slab | slab volume + plan area |
| 6 | block-wall-placement | gs-block-wall, -units, -openings, -nonaligned | volume/area by cell accumulation + block count by covering-module accumulation (exact) |
| 7 | opening-creation | gs-opening, gs-block-wall-openings | opening area + count 1; the hosting topology |
| 8 | plaster-application | gs-plaster-baseline / -mm / -nonaligned | baseline surface fact (read-only) + volume by coat-cell thickness accumulation |
| 9 | finish-application | gs-finish-baseline | same coated-surface discipline over the slab region |
| 10 | building-service-installation | gs-service-run, gs-service-run-nonaligned | run length by cell accumulation + count 1 |

The independent validation re-checker (its own seven-check
implementation) and the independent topology derivation run on every
sequence; the block counts and all integer counts compare EXACTLY across
every cell of the corpus.

## The corpus provenance notes (derived-from citations)

The scene mirrors HFX-301's committed equivalence scene
(`backend/api/src/equivalence-eval/corpus.ts` `EQUIVALENCE_SCENE` — same
solution identity `solution-demo-001`, same pinned reality version
`rgv-demo-0007`, same read-only geometry table `geo-wall-faces-002` …),
which itself mirrors the engine's demo world and
`packages/solution-engine/fixtures/baseline-geometry.json`. Sequences are
DERIVED from the HFX-301 paired corpus and the PROD-029 compiler-baseline
utterances where natural operations exist, each citing its source fixture
id in its `notes` (never copied blindly — the lanes here EXECUTE the
neutral sequence where HFX-301 compares authoring paths):
`eq-excavation-core` (REP-EXC-001) → `gs-excavation-core`;
`eq-excavation-units-mixed` → `gs-excavation-units`;
`eq-backfill-sequenced` → `gs-excavation-backfill-pair`;
`eq-block-wall-core`/`eq-block-wall-units` → `gs-block-wall`/`-units`;
`eq-plaster-core` (REP-PLASTER-001) → `gs-plaster-baseline`;
`eq-plaster-units-coats` → `gs-plaster-mm`;
`eq-finish-decimal` → `gs-finish-baseline`; the wall-upgrade journey
context (HFX-301's scene problem statement) → `gs-demolition`.

## The documents

| Document | Content |
|---|---|
| `substitution-report.md` | The committed dual-provider run transcript: the version pins, the 31 per-sequence verdicts, the aggregate digests, the per-cell proof summaries and the negative-control table. |
| `tolerance-report.md` | The declared per-dimension tolerances + the observed per-sequence deltas: the auditable compatibility margins and the itemized coarse-profile breaches. |
| `historical-replay.md` | The provider-removal replay evidence (the removal simulation + the records' continued interpretability + the registry retirement lifecycle). |

## The negative controls (a benchmark that cannot fail is not a benchmark)

| Control | Twin | Where asserted |
|---|---|---|
| Tolerance breach | `toleranceBreachTwin()` — one projected volume perturbed +1.0 m3 | `harness.test.ts` → caught with the quantity kind (`operation-semantic-failure`) |
| Verdict mutation | `verdictMutationTwin()` — one check outcome flipped | `harness.test.ts` → caught with `reasoning-failure` (per-check, not only the verdict) |
| Capability honesty | `capabilitySabotageDescriptor()` — over-declaring `roof-truss-placement` | `model.test.ts` → REJECTED by `validateGeometryProviderDescriptor` |
| Boundary guard | `boundarySmuggleTwin()` — a `meshFormat` field smuggled into the canonical quantities | `adapter.test.ts` → REFUSED with `contract-mismatch` (the D26 discipline) |
| Expectation flips | compatible/divergence and compatible/unsupported flips | `harness.test.ts` → `expectationMet: false`, never a silent pass |

## The honest limitations

- **Both lanes are deterministic in-repo implementations** — the
  reference oracle (the canonical engine, wrapped) and the independent
  reimplementation (a discretized-accumulation engine). This benchmark
  evidences the SUBSTITUTION SURFACE, the TOLERANCE DISCIPLINE and the
  COMPARISON MACHINERY — not any external technology. An external
  geometry/constraint technology later slots into the same
  `GeometryProvider` port and faces the identical canonical projections
  and declared-tolerance comparisons.
- **The discretized substitute models the Phase 1 quantity semantics**
  (the documented v1 family catalogue's labels, dimensions, units and
  directions are the CANONICAL comparison semantics; only the VALUES are
  independently derived). It is a stand-in for a genuinely foreign
  geometry technology, engineered to be honest about its residuals.
- No network, no live models, no third-party geometry libraries, no
  clock reads, no randomness — anywhere in the benchmark (the corpus
  rule).
