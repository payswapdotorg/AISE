# ANCHOR-006 — The registry verdict (the belt-campaign benchmark vs. the evaluation-stage registration)

**Derivation:** `tools/registry_verdict.ts` — records the BELT-CAMPAIGN
benchmark (this geolocation campaign + the evidence-run measurements)
against the evaluation-stage registration of the OpenCV reference lane
(`packages/anchoring-contract` `src/registration.ts` — the ANCHOR-002
committed, drift-checked artifacts), and takes the promotion decision
through the substitution-contract §6 gates
(`spec/technology-substitution-contract.md` §6). **No worker
self-promotion:** the script never appends any decision event to any
registry — it derives the verdict the gates would answer TODAY and commits
the content-addressed benchmark record as evidence for the Tech Lead's
decision.

## The verdict

**`evaluation-kept — the substitution-contract §6 promotion gate answers the
typed refusal(s): license-blocked`**

- benchmark record: `77d40821cd2eea0061b0adb617ad3bf14a5175309426345d1fdef91b0e44fa78`
  (`registry-verdict/belt-campaign-benchmark-record.json`, content-addressed)
- registration state today: `benchmarked`
- refusal kinds: `license-blocked`

| gate | passed | detail |
| --- | --- | --- |
| license-use-clearance | **false** | license `Apache-2.0` is evaluation-only (commercialUse: true, intendedUseCleared: false) — the dataset/model-use rule forbids production promotion |
| benchmark-evidence | true | 1 benchmark record attached, referencing this provider+version |
| provenance-continuity | true | 1 provenance manifest sealed against this profile digest |

The benchmark record carries the campaign's honest metrics — stillsRequested
6 (fidelity REAL, per-photo provenance); geolocationPinnedStills 0
(6 un-localized at the CORRECTED pin rule; 1 pass-2 pin retracted by the
footprint audit; the full per-attempt record in `results/geolocation/`);
anchoredStills 0 (3 refused typed, 3 honestly not-runnable under the
redundancy law); the adapter's declared photometric gate 0.25 NCC floor
(carried byte-identical from ANCHOR-003b); deterministicRunsIdentical 2
(digests byte-identical); negativesFailClosed 14/14 (+2 typed drills) — and
the two failure observations (unsupported-data: the class's
oblique-with-horizon photography vs public ortho vintages, compounding the
ANCHOR-003b cross-vintage law; perception-failure: the plausible-junk
discriminator — unverified 5–9-inlier consensus sets on repetitive pivot
texture, the z14 blind scan having measured the vote dilution directly).

## Why evaluation-kept is the honest verdict (both dimensions point the same way)

1. **The license dimension refuses independently of the measurements** —
   the same typed `license-blocked` answer ANCHOR-003b recorded: the OpenCV
   reference lane's Apache-2.0 registration is evaluation-only. No
   benchmark outcome can override it; a promotion work order would have to
   clear licensing first.
2. **The benchmark dimension does not contradict it** — a 0-anchored real
   photoset is not promotion evidence; it is honest negative evidence. The
   gates exist precisely so that "we ran it and it refused everything" is
   never spun as readiness.

**The honest reading (the record's own words):** the ANCHOR-003b deferment
#5 named this work — geolocate the un-geolocated class so the gap between
"real photos exist" and "real anchors exist" closes. This campaign ran the
geolocation honestly (blind z14 belt scan + camera-seeded NAIP verification
under a declared, audit-corrected pin rule) and the seam honestly (the
supervised runner, the typed contract, the declared photometric gate).
Whatever the measured outcome is, it is recorded as measured — the class
either pins or it does not; zero fabricated pins, zero fabricated anchors,
always.

## What the Lead needs for any future promotion decision

- **Clear the license dimension first** (the substitution-contract §6
  license-use-clearance gate) — nothing in this tree bears on it.
- **A capture lane that anchors:** the measured requirements are now
  TWO-campaign-deep (ANCHOR-003b's synthetic-positive/real-negative + this
  campaign's geolocated-negative): near-nadir vantage, vintage-matched
  plan raster, GSD matched to the plan. For THIS class specifically: the
  z14 belt DB (8,661 tiles) remains committed-ready for any nadir
  candidate; the corrected pin rule (footprint ≥ 25,000 px + sliver ≥ 0.2 +
  local scales ∈ [0.05, 20] + inliers ≥ 8 + NCC ≥ 0.30) is the declared
  instrument for it.
- **The budget-calibration deferment stands** (zero anchored stills →
  realized error still NOT DERIVABLE; the v2.1 declared model unchanged).
- **This benchmark record is content-addressed and committed** — re-derive
  any time with `bun docs/productization-evidence/ANCHOR-006/tools/registry_verdict.ts`
  (appends no registry events); the record ID is stable over the committed
  results.
