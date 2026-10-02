# ANCHOR-007 — Photos to the Line-Art Plan: Two Lanes, One Typed Seam

The technical verification answering **ANCHOR-001/PORT.md §7, second open
question**:

> **Line-art plans.** Real floor plans are line drawings without shared
> texture with photos. The automatic path needs either (a) an intermediate
> orthophoto/raster base map, or (b) a geometric (wall-line) registration
> lane — a separate method, a separate adapter.

This spike builds BOTH lanes as evidence-tree adapters, validates each
against DERIVED-DRILL stills with KNOWN transforms, then measures both
against a REAL photoset (15 anchor-candidate photographs + 1 wrong-building
discriminator of the Edith Farnsworth House, HABS IL-323) versus the REAL
HABS line-art measured drawing — and records the honest answer, including
the honest mass refusal the real photographs measured.

## 1. The boundary (no new port)

ANCHOR-007 adds **no production code and no new port**. Both lanes are
spike adapters inside this evidence tree, exercised THROUGH the shipped
supervised subprocess runner of `packages/anchoring-contract` over the
`anchor002-anchoring-contract/1` typed wire shapes — the same seam
ANCHOR-003b drove. Everything the spike learns must fit the existing
contract or be recorded as an open gap; nothing here mutates the provider
registry, the closed plan-kind vocabulary, or any production package.

## 2. The two lanes

### Path (a) — the intermediate-raster lane (`adapter/path_a_provider.py`)

Declared method `wall-region-synthesis/1` + the ANCHOR-003b reference
SIFT/RANSAC plan-homography lane + a DECLARED photometric verification
gate (normalized cross-correlation of the still against the warped
intermediate raster, NCC >= 0.25, per the 003b finding-#2 law: every
adapter carries its own declared, versioned gate). The intermediate raster
is DERIVED from the line-art plan by declared morphological synthesis
(dense wall regions from the drawing's poché), never presented as real
imagery.

### Path (b) — the geometric wall-line lane (`adapter/path_b_provider.py`)

Declared method `vp-rectified-line-search/3` — NO appearance matching
anywhere: LSD line segments on the photograph, Manhattan-frame selection
by gated support, vanishing-point rectification with focal
self-calibration under the declared camera-side law, a two-stage
FFT-translation similarity search ranked by the DIRECTION-GATED support,
iterated nearest-ink homography refinement, and DECLARED geometric
verification gates (support floor + spread + ambiguity margin + RMS +
support share). The full version history — v1, /2, /3, each failure
measured on the drills — is declared in the adapter's
`provenance.config.versionHistory` and traced in measurements.md §3.

## 3. Typed outcomes (the seam's laws, carried)

- Requests and responses are the ANCHOR-002 wire shapes; every run goes
  through `runSupervisedAnchoring` (input-digest audit, SIGKILL
  supervision, closed-vocabulary output guard, identity-echo laws).
- Every scenario is run TWICE over identical canonical bytes; the
  deterministicProjection digests must match (results/reproducibility.json).
- Whole-request refusals carry ZERO hypotheses; per-still refusals carry
  zero hypotheses for that still. No fabricated anchors, ever — the
  drills' realized-error instrument exists to catch exactly that class.
- The plan kind stays `plan-raster` (the closed production vocabulary);
  the LINE-ART character of the plan is the ADAPTERS' declared method,
  never a vocabulary value (neg-009 proves the law on both lanes).

## 4. Laws this spike obeys (the honest-measurement set)

1. **Fidelity classes are never upgraded.** The photographs and the plan
   are REAL (public-domain documentation, per-item provenance in
   fixture.md); the drills are DERIVED-DRILL (instrument-validation
   artifacts, declared in fixture/drill-ground-truth.json, never mixed
   into the real-photoset runs).
2. **Realized error is measured, not asserted.** For drills: against the
   KNOWN plan->drill homographies at the measured-drawings ground-truth
   corners (tools/measure_drill_realized_error.py ->
   results/drill-realized-error.json), including the budget95 coverage
   check (a budget is honest only if it covers the realized error).
   For the real photoset: **NOT-DERIVABLE** — no co-registered ground
   truth exists for the photographs; declared, never fabricated.
3. **Every engineering decision is measurement-carrying.** The /2 -> /3
   changes each cite the drill numbers that forced them
   (measurements.md §3); the gates cite their measured justifications.
4. **Fail-closed on everything degraded.** 26/26 negatives fail closed
   with zero hypotheses (negative-ledger.md), including the
   wrong-building discriminator: the REAL garage photograph never
   anchors to the house plan on either lane.

## 5. What this spike does NOT carry

- No production provider, no registry entry, no package change (the tree
  is docs-only; the bun.lock is byte-identical to the base).
- No cross-validation leg in path (b) (declared limitation in its
  config; the budget carries no crossval term).
- No budget recalibration: path (b)'s first-order budget measured
  UNDER-covering on the one anchored oblique drill (1.81 m realized vs
  0.685 m budget — recorded, not patched).
- No claim about plans without a graphic scale bar or north arrow: the
  fixture's rasterToScene instruments (88.00 px/m re-measured against
  the METERS bar; north-up rotation re-measured against the arrow) are
  fixture-specific.
