# HFX-302 — tolerance report (the declared tolerances + the observed deltas)

**Work item:** HFX-302 — the geometry/validation technology substitution
benchmark (§"Tolerances are declared, never implicit" — the second law).
**Data source:** the committed golden run
(`tools/geometry-eval/fixtures/expected-outcomes.json` — every
quantity/BOQ comparison point carries its declared tolerance and the
observed deltas; the tools runner re-derives the within/breach verdict of
every leg from the declared terms alone, check
`tolerance-predicate-recomputes`).
**Reproduce:** `bun tools/geometry-eval/runner.ts` (the per-dimension
extremes print in the summary) or `bun run verify`.

## The declared tolerance table (the substitute's, per dimension)

The tolerance predicate (pure, `evaluateQuantityTolerance` in
`backend/api/src/geometry-eval/model.ts`):

```text
allowed = max(absolute, relative × |reference value|)
within  ⟺ |candidate − reference| ≤ allowed
```

| Dimension | Absolute (canonical unit) | Relative | Notes |
|---|---|---|---|
| `length` | 0.05 m | 1 % | the fine macro grid is 0.05 m — one full cell of slack on the canonical unit |
| `area` | 0.05 m2 | 1 % | same discipline |
| `volume` | 0.05 m3 | 1 % | the absolute term absorbs small-reference residuals (thin coats) where the relative term cannot |
| `count` | **EXACT (0 / 0)** | — | integer counts admit NO tolerance — a count mismatch is a semantic divergence, never noise |

Every substitute profile declares THIS table (`SUBSTITUTE_DECLARED_TOLERANCES`,
`backend/api/src/geometry-eval/registry.ts`) — including the coarse
profile, which claims the same accuracy and whose non-aligned corpus
shapes are designed to breach it (the discrimination evidence). The
reference oracle declares the EXACT table for itself (it IS the baseline;
comparisons always use the SUBSTITUTE's declared tolerances).

## The observed per-dimension extremes (over all 128 quantity/BOQ legs)

| Dimension | max \|Δ\| | max relative Δ | Breached legs | Within legs |
|---|---|---|---|---|
| `volume` | 1.2525 m3 | 66.67 % | 8 | 42 |
| `area` | 0.26 m2 | 3.23 % | 6 | 45 |
| `length` | 0.1 m | 1.64 % | 2 | 4 |
| `count` | 0 | 0.00 % | 0 | 21 |

Every breach belongs to a `declared-incompatible` corpus entry (the
coarse-grid designed divergences); every compatible leg sits within its
declared allowance. The count row is exact across the whole corpus —
including the coarse block-wall breach case, where the block count stays
156 = 156 while the continuous quantities diverge.

## The compatibility margins (the non-aligned compatible legs — the auditable margins)

These are the legs where the fine-grid discretization residual is
non-zero and the DECLARED tolerance demonstrably absorbs it. The `By`
column shows which declared term granted the allowance — the relative
term governs large references, the absolute term small ones:

| Sequence | Dimension | Subject | Reference | Substitute | \|Δ\| | Allowed | By | Verdict |
|---|---|---|---|---|---|---|---|---|
| gs-excavation-nonaligned | volume | excavated-soil-volume#1 | 9.06 | 9 | 0.06 | 0.0906 | relative | within |
| gs-excavation-nonaligned | area | excavation-footprint#1 | 6.04 | 6 | 0.04 | 0.0604 | relative | within |
| gs-excavation-nonaligned | area | excavation#1 | 6.04 | 6 | 0.04 | 0.0604 | relative | within |
| gs-excavation-nonaligned | volume | excavation#1 | 9.06 | 9 | 0.06 | 0.0906 | relative | within |
| gs-demolition-nonaligned | area | removed-face-area#1 | 9.624 | 9.6 | 0.024 | 0.09624 | relative | within |
| gs-demolition-nonaligned | volume | removed-volume#1 | 0.9624 | 0.96 | 0.0024 | 0.05 | absolute | within |
| gs-demolition-nonaligned | area | demolition-removal#1 | 9.624 | 9.6 | 0.024 | 0.09624 | relative | within |
| gs-demolition-nonaligned | volume | demolition-removal#1 | 0.9624 | 0.96 | 0.0024 | 0.05 | absolute | within |
| gs-slab-nonaligned | area | slab-plan-area#1 | 12.06 | 12 | 0.06 | 0.1206 | relative | within |
| gs-slab-nonaligned | volume | slab-volume#1 | 1.809 | 1.8 | 0.009 | 0.05 | absolute | within |
| gs-slab-nonaligned | area | slab-placement#1 | 12.06 | 12 | 0.06 | 0.1206 | relative | within |
| gs-slab-nonaligned | volume | slab-placement#1 | 1.809 | 1.8 | 0.009 | 0.05 | absolute | within |
| gs-plaster-nonaligned | volume | plaster-volume#1 | 0.15 | 0.125 | 0.025 | 0.05 | absolute | within |
| gs-plaster-nonaligned | volume | plaster-application#1 | 0.15 | 0.125 | 0.025 | 0.05 | absolute | within |
| gs-service-run-nonaligned | length | service-run-length#1 | 7.03 | 7.05 | 0.02 | 0.0703 | relative | within |
| gs-service-run-nonaligned | length | building-service-installation#1 | 7.03 | 7.05 | 0.02 | 0.0703 | relative | within |
| gs-block-wall-nonaligned | area | wall-face-area#1 | 12.048 | 12 | 0.048 | 0.1205 | relative | within |
| gs-block-wall-nonaligned | volume | wall-volume#1 | 2.4096 | 2.4 | 0.0096 | 0.05 | absolute | within |
| gs-block-wall-nonaligned | area | block-wall-placement#1 | 12.048 | 12 | 0.048 | 0.1205 | relative | within |
| gs-block-wall-nonaligned | volume | block-wall-placement#1 | 2.4096 | 2.4 | 0.0096 | 0.05 | absolute | within |

## The designed breaches (the coarse-profile legs — itemized, never hidden)

Every leg below belongs to a `declared-incompatible` corpus entry whose
divergence was declared up front with the PROD-029 comparison kind
(`operation-semantic-failure`). The `\|Δ\| > Allowed` relation is the
recorded tolerance breach:

| Sequence | Dimension | Subject | Reference | Substitute | \|Δ\| | Allowed | By | Verdict |
|---|---|---|---|---|---|---|---|---|
| gdi-excavation-coarse | volume | excavated-soil-volume#1 | 9.3 | 9 | 0.3 | 0.093 | relative | **BREACH** |
| gdi-excavation-coarse | area | excavation-footprint#1 | 6.2 | 6 | 0.2 | 0.062 | relative | **BREACH** |
| gdi-excavation-coarse | area | excavation#1 | 6.2 | 6 | 0.2 | 0.062 | relative | **BREACH** |
| gdi-excavation-coarse | volume | excavation#1 | 9.3 | 9 | 0.3 | 0.093 | relative | **BREACH** |
| gdi-slab-coarse | area | slab-plan-area#1 | 12.9 | 12.75 | 0.15 | 0.129 | relative | **BREACH** |
| gdi-slab-coarse | volume | slab-volume#1 | 1.935 | 3.1875 | 1.252 | 0.05 | absolute | **BREACH** |
| gdi-slab-coarse | area | slab-placement#1 | 12.9 | 12.75 | 0.15 | 0.129 | relative | **BREACH** |
| gdi-slab-coarse | volume | slab-placement#1 | 1.935 | 3.1875 | 1.252 | 0.05 | absolute | **BREACH** |
| gdi-plaster-coarse | volume | plaster-volume#1 | 0.15 | 0.25 | 0.1 | 0.05 | absolute | **BREACH** |
| gdi-plaster-coarse | volume | plaster-application#1 | 0.15 | 0.25 | 0.1 | 0.05 | absolute | **BREACH** |
| gdi-block-wall-coarse | area | wall-face-area#1 | 12.24 | 12.5 | 0.26 | 0.1224 | relative | **BREACH** |
| gdi-block-wall-coarse | volume | wall-volume#1 | 2.448 | 3.125 | 0.677 | 0.05 | absolute | **BREACH** |
| gdi-block-wall-coarse | area | block-wall-placement#1 | 12.24 | 12.5 | 0.26 | 0.1224 | relative | **BREACH** |
| gdi-block-wall-coarse | volume | block-wall-placement#1 | 2.448 | 3.125 | 0.677 | 0.05 | absolute | **BREACH** |
| gdi-service-run-coarse | length | service-run-length#1 | 6.1 | 6 | 0.1 | 0.061 | relative | **BREACH** |
| gdi-service-run-coarse | length | building-service-installation#1 | 6.1 | 6 | 0.1 | 0.061 | relative | **BREACH** |

## Reading the report

- **Margins vs. breaches.** The non-aligned compatible legs (the first
  table) and the coarse breaches (the second) differ ONLY in the
  substitute's declared resolution (0.05 m/0.005 m fine vs. 0.25 m/0.02 m
  coarse grids): the same comparison machinery records a within-margin in
  one case and a declared breach in the other — the tolerance discipline
  discriminates, it never hides.
- **The two-term design.** `gs-plaster-nonaligned` shows the absolute term
  absorbing a 16.7 % relative residual on a small reference (0.15 m3);
  `gs-excavation-nonaligned` shows the relative term absorbing a 0.66 %
  residual on a large reference (9.06 m3). Both are DECLARED tolerances —
  no implicit slack anywhere.
- **The count discipline.** Every count leg in the corpus compares
  exactly (0 delta, 0 tolerance) — integer semantics never get noise
  slack.
- **The BOQ legs mirror the quantity legs.** Each quantity breach appears
  again as the corresponding BOQ-line breach (both lanes' quantities
  flowed through the SAME `deriveSolutionBoq` derivation — the line
  values inherit the quantity residuals; the line identities are never
  compared, only the semantic key + the value within tolerance).
