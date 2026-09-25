# HFX-302 — substitution report (the committed dual-provider run transcript)

**Work item:** HFX-302 — the geometry/validation technology substitution
benchmark (`docs/productization-layer-hardening-work-orders.md` §HFX-302;
parent PROD-029; dependencies HFX-301, PROD-022, PROD-025 — all
finalized at the pinned tree).
**Evidence date:** the committed run at the delivery commit of branch
`hfx-302/geometry-substitution-benchmark` (base `d11d03e`).
**Reproduce:** `bun tools/geometry-eval/runner.ts` (exit 0) or
`bun run verify` (the full gate — typecheck + lint + all tests + the
boundary scanner). The committed goldens regenerate byte-identically via
`bun tools/geometry-eval/runner.ts --update-goldens`.

## The version pins (the run's identity)

| Pin | Value |
|---|---|
| Suite | `geometry-eval-suite/1` v1.0.0 (benchmark id `geometry-eval-suite/1`) |
| Code version | `hfx-302/geometry-eval/1` |
| Engine (the reference oracle) | `aise-solution-engine` / `1.0.0` (imported `SOLUTION_ENGINE_VERSION`) |
| Substitute implementation | `geometry-substitute/discretized-accumulation/1` (technology version `1.0.0-discretized`) |
| Tolerance model | `hfx-302/quantity-tolerance/1` |
| Corpus digest (sha-256, canonical JSON) | `a2c70e4831bcfa74f7a5a04404b39e9e2fec8f619cc145b08f18c1f0ad7ffe22` |
| Provenance-manifest aggregate digest | `8518da3b27ae6f8bb6093466648c7c86c39f4db2e4db8e43797ec2be880db97c` |
| Benchmark-record aggregate digest | `893d40726616fa6405235280f75ad7c3d800b9926413bf1f04added6bfed8863` |

Both digests aggregate the ordered per-sequence content-addressed ids of
BOTH lanes (reference + substitute, interleaved per sequence — 62 ids
over 31 sequences).

## The lanes

- **Reference oracle** — `aise-engine-reference` (the canonical
  `@aise/solution-engine`'s PUBLIC surface wrapped behind the neutral
  `GeometryProvider` port: `materializeBaselineState` →
  `applyOperation` per operation → `validateSolutionVersion`; the
  engine's own quantities/checks/verdict projected onto PROD-029's
  canonical rows). The identity authority — imported, never modified.
- **Substitute** — `geometry-substitute-{fine|coarse|restricted}`
  (the independent discretized-accumulation reimplementation: cell
  counting per axis at the declared resolution, covering-module block
  counting, its own unit/limit tables, an independent seven-check
  validation re-checker, an independent topology derivation; never
  imports `@aise/solution-engine`).

## The dual-lane run (31 sequences — the runner transcript)

```
suite: geometry-eval-suite/1 v1.0.0 (code hfx-302/geometry-eval/1)
pins: engine aise-solution-engine/1.0.0 · substitute geometry-substitute/discretized-accumulation/1 · tolerance-model hfx-302/quantity-tolerance/1
corpus digest: a2c70e4831bcfa74f7a5a04404b39e9e2fec8f619cc145b08f18c1f0ad7ffe22
compatible: 22 sequences
declared-incompatible: 5 sequences
unsupported-by-substitute: 4 sequences
[met] gs-excavation-core: compatible (12/12 points equal)
[met] gs-excavation-units: compatible (12/12 points equal)
[met] gs-excavation-nonaligned: compatible (12/12 points equal)
[met] gs-backfill: compatible (10/10 points equal)
[met] gs-excavation-backfill-pair: compatible (15/15 points equal)
[met] gs-demolition: compatible (12/12 points equal)
[met] gs-demolition-nonaligned: compatible (12/12 points equal)
[met] gs-foundation: compatible (12/12 points equal)
[met] gs-slab: compatible (12/12 points equal)
[met] gs-slab-nonaligned: compatible (12/12 points equal)
[met] gs-block-wall: compatible (14/14 points equal)
[met] gs-block-wall-units: compatible (14/14 points equal)
[met] gs-block-wall-openings: compatible (21/21 points equal)
[met] gs-opening: compatible (13/13 points equal)
[met] gs-plaster-baseline: compatible (13/13 points equal)
[met] gs-plaster-mm: compatible (13/13 points equal)
[met] gs-plaster-nonaligned: compatible (13/13 points equal)
[met] gs-finish-baseline: compatible (13/13 points equal)
[met] gs-service-run: compatible (12/12 points equal)
[met] gs-service-run-nonaligned: compatible (12/12 points equal)
[met] gs-foundation-slab: compatible (16/16 points equal)
[met] gs-block-wall-nonaligned: compatible (14/14 points equal)
[met] gdi-excavation-coarse: declared-incompatible [operation-semantic-failure] on [quantity-value, quantity-value, boq-line, boq-line]
[met] gdi-slab-coarse: declared-incompatible [operation-semantic-failure] on [quantity-value, quantity-value, boq-line, boq-line]
[met] gdi-plaster-coarse: declared-incompatible [operation-semantic-failure] on [quantity-value, boq-line]
[met] gdi-block-wall-coarse: declared-incompatible [operation-semantic-failure] on [quantity-value, quantity-value, boq-line, boq-line]
[met] gdi-service-run-coarse: declared-incompatible [operation-semantic-failure] on [quantity-value, boq-line]
[met] gus-demolition-unsupported: unsupported-by-substitute (family: demolition-removal)
[met] gus-finish-unsupported: unsupported-by-substitute (family: finish-application)
[met] gus-service-unsupported: unsupported-by-substitute (family: building-service-installation)
[met] gus-mixed-unsupported: unsupported-by-substitute (family: demolition-removal)
provenance-manifest digest: 8518da3b27ae6f8bb6093466648c7c86c39f4db2e4db8e43797ec2be880db97c
benchmark-record digest: 893d40726616fa6405235280f75ad7c3d800b9926413bf1f04added6bfed8863
ten-family compatible coverage: 10/10 families
RUNNER: PASS (22 named checks)
```

Every one of the 31 sequences' observed cell satisfies its declared
expectation (`expectationMatches: 31/31`) — including the five DESIGNED
divergences being caught with exactly the kind their corpus entry declared
up front, and the four typed unsupported outcomes naming exactly the
restricted profile's omitted families.

## What the compatible cells prove (the 22-sequence substitution proof)

For every compatible sequence, BOTH lanes consumed the SAME canonical
operation sequence through the SAME adapter call
(`executeSequence(provider, scene, operations)` —
`backend/api/src/geometry-eval/adapter.ts`) and every canonical
comparison point came back equal:

- **quantities** — within the substitute's declared per-dimension
  tolerance (see `tolerance-report.md` for the itemized margins), with
  dimension/unit/direction matching by the canonical grouping;
- **validation** — the worst-of verdicts equal AND all seven check
  outcomes equal per-check (`operation.contract-invariants`,
  `geometry.dimensions-positive`, `units.quantity-units-typed`,
  `operation.ordering-dependencies`, `quantities.calculation-refs`,
  `operation.capability-declared`, `operation.phase1-limits`);
- **topology** — the independently derived constraint rows identical
  (`coat-anchors-baseline-surface`, `opening-hosted-by-element`,
  `backfill-pairs-excavation` — exercised by the wall-with-openings,
  excavation-then-backfill and coat-over-baseline multi-operation cases);
- **BOQ lines** — both lanes' quantities flowed through the SAME public
  `deriveSolutionBoq` derivation (the PROD-025 dependency made real) and
  the grouped line values sit within the declared tolerances, counts
  exact.

## What the declared-incompatible cells prove (the comparison discriminates)

The coarse profile (the same strategy at macro cell 0.25 m / coat cell
0.02 m, declaring the SAME tolerance table) runs five shapes whose
discretization error is designed to exceed the tolerance. Each divergence
is recorded with the PROD-029 closed-vocabulary kind
(`operation-semantic-failure` — the quantity-value/boq-line point kinds'
kind from PROD-029's own `DIVERGENCE_KIND_BY_POINT` table), the declared
tolerance, and the observed delta — never rounded away. The
`gdi-block-wall-coarse` case is the sharpest discrimination evidence: the
integer block count stays EXACTLY equal (156 = 156 — the
covering-module accumulation is resolution-independent) while the
continuous volume/area quantities breach — the divergence is the
discretization residual, isolated honestly.

## What the unsupported cells prove (capability boundaries are explicit)

The restricted profile deliberately declares 7 of the 10 families. The
adapter's fail-closed gate answers each undeclared family with the TYPED
`unsupported` outcome naming it — BEFORE execution, never computed —
while the reference oracle still executes every sequence (the engine
governs both lanes equally). The named families across the four cells are
exactly the committed omissions: `demolition-removal`,
`finish-application`, `building-service-installation`.

## The control-plane emission (both lanes, every sequence)

Every sequence evaluation emits a governed `BenchmarkRecord` for EACH
lane (providerId = the lane's id; capability
`geometry-validation-substitution`; validated by
`validateBenchmarkRecord`) and seals a `ProvenanceManifest`
(`sealProvenanceManifest`) — 62 records + 62 manifests over the corpus,
aggregated by the ordered-manifest-id and ordered-record-id digests
above. The registry lifecycle driver
(`driveGeometryRegistryLifecycle`) additionally drives the REAL
provider-registry through registration → evaluation → executions →
consolidated records + sealed manifests per lane → the substitute
profiles' RETIREMENT (`provider-retired`), with
`replayRegistry(events)` reproducing the identical derived state (the
event-sourcing proof) — see `historical-replay.md`.

## The negative controls (asserted in the module tests)

| Control | Twin | Assertion |
|---|---|---|
| Tolerance breach | `toleranceBreachTwin()` (`harness.test.ts`) | one projected volume perturbed +1.0 m3 → `declared-incompatible` with the quantity kind + the observed breach |
| Verdict mutation | `verdictMutationTwin()` (`harness.test.ts`) | one check outcome flipped (pass → review-needed) → caught with `reasoning-failure`; the per-check comparison catches it, not just the worst-of verdict |
| Capability honesty | `capabilitySabotageDescriptor()` (`model.test.ts`) | a descriptor over-declaring `roof-truss-placement` → REJECTED by `validateGeometryProviderDescriptor` (the adapter cannot gate an unnamed family) |
| Boundary guard | `boundarySmuggleTwin()` (`adapter.test.ts`) | a provider-specific `meshFormat` field smuggled into the canonical quantities projection → REFUSED with the typed `contract-mismatch` (the D26 discipline at this seam) |
| Expectation flip | `harness.test.ts` (two flip tests) | a compatible expectation over a designed divergence/unsupported sequence → `expectationMet: false`, never a silent pass |

## The honest limitations

Both lanes are deterministic in-repo implementations (the wrapped
canonical engine + the independent discretized reimplementation). This
run evidences the SUBSTITUTION SURFACE, the tolerance discipline and the
comparison machinery — an external geometry/constraint technology later
slots into the same `GeometryProvider` port and faces the identical
canonical projections and declared-tolerance comparisons. No network, no
live models, no third-party geometry libraries, no clock reads, no
randomness — anywhere in the benchmark.
