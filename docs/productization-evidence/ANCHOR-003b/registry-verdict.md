# ANCHOR-003b — The registry verdict (the real-photoset benchmark vs. the evaluation-stage registration)

**Derivation:** `tools/registry_verdict.ts` (deterministic, no clock, no
network, no registry mutation). **Artifacts:**
`registry-verdict/real-photoset-benchmark-record.json` (content-addressed,
recordId `a8c7e2bef6847da28b97d5b569583567ffe861f1fcc4fa3b622ec7b87f26dc53`)
and `registry-verdict/promotion-evaluation.json`.

## The verdict

**`evaluation-kept`.**

The promotion decision was taken through the substitution-contract §6 gates
(`spec/technology-substitution-contract.md` §6 — the provider-evaluation
control plane; `packages/provider-registry`'s `evaluatePromotionGate` over
the ANCHOR-002 evaluation-stage registration of the OpenCV reference lane).
The gate answers the **typed `license-blocked` refusal**:

- **license-use-clearance: REFUSED** — the registered profile declares the
  intended production use NOT cleared (`intendedUseCleared: false`,
  `evaluationOnly: true` derived); the dataset/model-use rule forbids
  production promotion regardless of recordable metrics ("the refusal is
  license-driven, not metric-driven" — HFX-000). The refusal is
  RE-EVALUATED ON REPLAY: a crafted log cannot smuggle the lane into
  production.
- **benchmark-evidence: recorded** — the real-photoset benchmark record is
  committed content-addressed, referencing the lane's
  providerId/technologyVersion (`sift-homography-reference` /
  `anchor003b-adapter/1`), carrying the REAL measured values: 28 real
  stills requested, **0 anchored**, the whole request refused with
  `registration-unreliable`, the photometric verification gate
  (`minAnchoredNcc` 0.25) as the declared discriminator, determinism
  byte-identical over two supervised runs, 14/14 negatives fail-closed
  through the adapter+contract seam, runtime observations, and the honest
  failure-cause analysis.
- **provenance-continuity: unchanged** — the ANCHOR-002 sealed manifest
  stands; this delivery appends NO registry events (no worker
  self-promotion, no self-merge: the promotion decision belongs to the
  Tech Lead).

## Why evaluation-kept is the honest verdict (both dimensions point the same way)

1. **The license dimension is unchanged by evidence.** Nothing in this run
   clears the intended production use — that clearance is a governed
   decision, not a measurement.
2. **The metric dimension now carries an honest negative result.** The
   real-photoset gate the roadmap named has RUN: the reference lane,
   exercised through the shipped supervised runner against the typed
   contract on a real 28-photo web-sourced photoset with per-photo
   provenance, refused every still at its declared quality gates — with
   the photometric verification gate catching the plausible-but-wrong
   consensus sets (5–9 inliers, footprint NCC ≈ 0) that a pure inlier
   floor would have admitted as anchors. An adapter whose reference lane
   cannot verify-anchor the real web-photo classes tested here is NOT
   production-ready for them. The synthetic-fixture benchmark (ANCHOR-001,
   frozen) proves the lane; this benchmark proves the world is harder
   than the fixture — exactly what the ANCHOR-001 recommendation's own
   gate anticipated ("the synthetic fixture proves the lane, not the
   world").

## What the Lead needs for any future promotion decision

- the license/use clearance decision (governed, external to this tree);
- a capture lane the reference method can honestly anchor: near-nadir,
  vintage-matched to the plan raster, GSD-matched (the measured
  requirements in `run-record.md`); with such a lane, the
  `budgetCoversActual` instrument becomes runnable and the §4 budget
  calibration deferment closes;
- the successor adapter requirements this run established: a declared
  photometric verification gate (or equivalent) is LOAD-BEARING for real
  data — without it, this photoset would have been "anchored" on
  fabricated geometry.
