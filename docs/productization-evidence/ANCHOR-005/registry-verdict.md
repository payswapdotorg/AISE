# ANCHOR-005 — The registry verdict (the capture-lane benchmark vs. the evaluation-stage registration)

**Derivation:** `tools/registry_verdict.ts` (deterministic, no clock, no
network, no registry mutation). **Artifacts:**
`registry-verdict/capture-lane-benchmark-record.json` (content-addressed,
recordId
`698f7d3c46ba15570089a2605c85d18635bcf52e75eb56a85305622a23410b17`) and
`registry-verdict/promotion-evaluation.json`.

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
- **benchmark-evidence: recorded** — the capture-lane benchmark record is
  committed content-addressed, referencing the lane's
  providerId/technologyVersion (`sift-homography-reference` /
  `anchor003b-adapter/1`), carrying the REAL measured values: 10 real
  public-domain stills requested, **0 anchored**, the whole request refused
  with `registration-unreliable`, the photometric verification gate as the
  declared discriminator, **the refusal VERIFIED against derived ground
  truth** (the would-be consensus is 15.3 m RMSE wrong against the
  documented geometry — the first ANCHOR benchmark where the negative
  result is a measurement, not an inference), determinism byte-identical
  over two supervised runs, 16/16 negatives fail-closed through the
  adapter+contract seam (including the lane's own hazards: wrong-plane,
  mirrored-raster, cross-site), runtime observations, and the honest
  failure-cause analysis (the radiometry gap — the fourth lane requirement,
  now measured and named).
- **provenance-continuity: unchanged** — the ANCHOR-002 sealed manifest
  stands; this delivery appends NO registry events (no worker
  self-promotion, no self-merge: the promotion decision belongs to the
  Tech Lead).

## Why evaluation-kept is the honest verdict

1. **The license dimension is unchanged by evidence.** Nothing in this run
   clears the intended production use — that clearance is a governed
   decision, not a measurement.
2. **The metric dimension carries the second honest negative result — and
   this one is verified.** The 003b run refused 28 real stills and could
   only infer its plausible-junk refusals were correct. This run built the
   capture lane the 003b deferment named (public-domain federal
   documentation, all three named requirements satisfied: near-perpendicular
   vantage, GSD matched, geometry-stable plan), DERIVED the co-registered
   ground truth the deferment said was missing — and the reference lane
   STILL refused every still, now at a MEASURED cause (the plan raster's
   radiometry: line art vs photograph) with the refusals verified correct
   (15.3 m RMSE would-be error). An adapter whose reference lane cannot
   verify-anchor even a fully-documented, vantage-matched, GSD-matched
   public-domain capture lane — because its method requires photographic
   plan radiometry — is NOT production-ready for real documentation lanes.
3. **The lane's findings sharpen the successor's work order, not the
   promotion.** The radiometry gap points to two successor directions (a
   photorealistic vintage-matched plan raster, or the wall-line geometric
   registration lane — the separate method the 003b deferment already
   names); the latent adapter defect (the width/height swap in the
   photometric gate, invisible on square plans) and the north-facade
   structural inadmissibility (the closed east-right vocabulary) are
   RECORDED for the Lead. None of these are promotion decisions; all of
   them are now measured facts with committed instruments.

**Worker self-promotion: NONE.** This delivery records evidence and derives
the gates' answer; the promotion decision belongs to the Tech Lead (workers
may not self-approve or self-merge governed work items).
