# Geometry/validation technology substitution corpus (HFX-302)

The governed **Layer-3 substitution benchmark** of the Hugging Face
hardening track (work order
`docs/productization-layer-hardening-work-orders.md` §HFX-302; parent
PROD-029; dependencies HFX-301 / PROD-022 / PROD-025 — all complete at
this tree): the committed corpus of **canonical operation sequences** where
TWO geometry/validation implementations — the canonical solution engine
as the **reference oracle** (wrapped, never modified) and an **independent
deterministic reimplementation** as the substitute candidate — consume the
SAME sequence through a provider-neutral adapter surface, and their
canonical projections (quantities with units, validation checks + verdict,
topology constraints, BOQ lines) must be **semantically compatible within
the substitute's declared per-dimension tolerances** — or the divergence
is **honestly declared** with the PROD-029 closed-vocabulary comparison
kind, or the operation family is **recorded as explicitly unsupported**
(typed, never computed).

## What one corpus sequence proves

```
                     ┌─ reference lane: adapter(aise-engine-reference) ──→ the canonical
                     │        engine's applyOperation + quantity-models + validation
operation sequence ──┤                                                            │
(+ baseline scene,   └─ substitute lane: adapter(geometry-substitute-{profile}) ──→ the INDEPENDENT
   substitute profile)     reimplementation (discretized accumulation +            │
                          independent validation re-check + independent topology)  ▼
                              project BOTH onto the canonical points (quantities ⊕ declared tolerance,
                               validation checks + verdict, topology constraints, BOQ lines ⊕ declared
                               tolerance — both lanes' quantities through the SAME deriveSolutionBoq)
                                                                  ▼
                   compatible | declared-incompatible(kind + tolerance breach)
                 | unsupported-by-substitute (the typed pre-execution gate)
```

Both lanes run through the **same adapter call**
(`backend/api/src/geometry-eval/adapter.ts` — `executeSequence`): that
sameness is the point. The comparison reuses PROD-029's canonical
projections and comparison KINDS
(`GEOMETRY_DIVERGENCE_KIND_BY_POINT` — every value from PROD-029's own
`DIVERGENCE_KIND_BY_POINT` table); the only extension is the **declared
tolerance wrap** around the quantity/BOQ value comparisons.

## The three behavior-matrix cells (the committed corpus: 31 sequences)

| Cell | Sequences | What is evidenced |
|---|---|---|
| `compatible` | 22 | **ALL TEN** documented v1 operation families (excavation, backfill, demolition-removal, foundation-placement, slab-placement, block-wall-placement, opening-creation, plaster-application, finish-application, building-service-installation), unit mixes (mm/cm/m), non-grid-aligned dimensions where the declared tolerance actually works (the fine grid's 0.02 m residuals against abs 0.05 ⊕ rel 1 %), and the multi-operation topology cases (a wall with openings, an excavation-then-backfill pair, a coat-over-baseline plaster case, a foundation-then-slab chain) — **zero divergent points over all five canonical comparison kinds**. |
| `declared-incompatible` | 5 | The **designed divergences**: the coarse-grid profile (macro cell 0.25 m / coat cell 0.02 m — the same strategy at a coarser declared grid) on shapes whose discretization error **exceeds the declared tolerance** — every sequence declaring the expected comparison kind (`operation-semantic-failure`) up front, every breach itemized with the declared tolerance and the observed delta. The integer block count stays exactly equal even where the continuous quantities breach — the discrimination is honest, not blunt. |
| `unsupported-by-substitute` | 4 | The families the **restricted profile deliberately does not declare** (demolition-removal, finish-application, building-service-installation): the adapter's fail-closed capability gate answers with the typed `unsupported` naming the family **before execution** — never a computed guess. The reference oracle still executes (the engine governs both lanes equally). |

## The negative controls (a benchmark that cannot fail is not a benchmark)

- **TOLERANCE-BREACH twin** — one projected quantity perturbed beyond the
  declared tolerance on the substitute side → the harness reports
  `declared-incompatible` with the quantity comparison kind
  (`operation-semantic-failure`) and the observed breach.
- **VERDICT-MUTATION twin** — one validation check outcome flipped →
  caught with the validation comparison kind (`reasoning-failure`); the
  checks compare per-check, never only the worst-of verdict.
- **CAPABILITY-SABOTAGE descriptor** — a provider over-declaring a family
  outside the documented v1 vocabulary (`roof-truss-placement`) → rejected
  by `validateGeometryProviderDescriptor` (the adapter cannot gate an
  unnamed family).
- **BOUNDARY-SMUGGLE twin** — a provider-specific field
  (`meshFormat: substitute-proprietary-v1`) smuggled into the canonical
  quantities projection → refused by the canonical-boundary projection
  guard with the typed `contract-mismatch` (the D26 discipline at this
  seam).
- **HISTORICAL REPLAY** — with the substitute lanes removed, the committed
  records + goldens still parse, validate and re-project (a failed
  provider can be removed while historical solution records remain
  interpretable — the work order's final acceptance criterion).

## The harness

`backend/api/src/geometry-eval/` (the importable zone):

| Surface | Content |
|---|---|
| `model.ts` | The typed vocabulary: the three-cell matrix, the declared tolerance calculus (`QuantityTolerance` + the pure within-tolerance predicate), the provider descriptor + sequence validators (fail-closed, closed vocabularies only), the canonical topology projection (the boundary guard at this seam) and the comparison-kind table (PROD-029's values, reused). |
| `adapter.ts` | The provider-neutral surface: `executeSequence(provider, scene, operations)` with the fail-closed capability gate (the typed `unsupported` naming the family, BEFORE execution) and the canonical-boundary projection guard (provider-specific fields refused with `contract-mismatch`). |
| `reference.ts` | The reference oracle: the canonical engine's PUBLIC surface wrapped (apply → quantities → validation); the engine stays the identity authority. |
| `substitute.ts` | The independent reimplementation: discretized cell accumulation for volumes/areas/lengths, covering-module accumulation for block counts, an independent validation re-checker, an independent topology derivation — never importing `@aise/solution-engine`. The exported `COARSE_SUBSTITUTE_PROFILE` constant is the designed-divergence lane. |
| `corpus.ts` | The committed corpus (31 sequences) + the committed baseline scene (mirroring HFX-301's equivalence scene and the engine's baseline-geometry fixture). |
| `registry.ts` | The control-plane wiring: the four lane profiles (reference + fine/coarse/restricted substitutes), the pinned suite identities and the version pins (engine, substitute implementation, tolerance model, corpus digest). |
| `harness.ts` | `evaluateSubstitutionSequence` — the dual-lane executor + the declared-tolerance comparison (quantity-by-quantity, check-by-check, verdict, constraint-by-constraint, line-by-line) + the per-lane record/manifest emission. |
| `testkit.ts` | The deterministic doubles (the scene resolver + the BOQ resolution seam over `deriveSolutionBoq`), the suite runner + summary, the mutation twins (the negative controls), the committed-artifact golden builders, the historical replay and the registry lifecycle driver (with the substitute's retirement). |
| `regenerate.ts` | The regeneration CLI (writes this directory's committed artifacts deterministically). |

## The committed artifacts (data)

- `scenario.json` — the committed corpus (the version-pinned manifest
  header + the scene + the 31 sequences).
- `fixtures/expected-outcomes.json` — the committed golden run (the
  per-sequence outcome views with the FULL per-point comparison records +
  the suite summary with the aggregate digests).

Both are canonical JSON (sorted keys, 2-space indent, trailing newline)
and regenerate **byte-identically**:

```bash
bun tools/geometry-eval/runner.ts --update-goldens   # rewrites both artifacts
bun tools/geometry-eval/runner.ts                    # verifies them (exit 0/1)
```

The **live** byte-for-byte regeneration check (the freshly computed suite
vs the committed files) lives in the backend-side golden test
(`backend/api/src/geometry-eval/golden.test.ts`) — the boundary matrix
forbids tools → packages/backend imports, so the tools runner consumes
the committed artifacts as data and re-derives the summary with
independent arithmetic.

## The honest limitation

**BOTH lanes are deterministic in-repo implementations** — the reference
oracle (the canonical engine, wrapped) and the independent reimplementation
(a discretized accumulation engine). This benchmark therefore evidences
the **substitution surface** (the provider-neutral adapter port), the
**tolerance discipline** (declared, never implicit) and the **comparison
machinery** (the canonical projections + the closed-vocabulary kinds +
the per-point records) — not the external technology itself. An external
geometry/constraint technology later slots into the same
`GeometryProvider` port (`backend/api/src/geometry-eval/adapter.ts`) and
its results face the **identical canonical projections and
declared-tolerance comparisons**; until then, the in-repo substitute
stands in as the candidate lane. No network, no live models, no
third-party geometry libraries, no clock reads, no randomness — anywhere.

## Reproducing the benchmark with one command

```bash
bun run verify        # typecheck + lint + the full test suite incl. this
                      # runner's 21 checks + the backend golden/live legs
```
