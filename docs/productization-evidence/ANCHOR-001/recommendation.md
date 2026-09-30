# ANCHOR-001 — Recommendation (next action + the four fork tests)

## Verdict: **NEW SHARED ANCHORING CONTRACT WORK ITEM** — then adapter
implementation, gated on a real-photoset evidence run. No ACR needed. No
deferment. **No fork — of anything, ever (see the fork gate).**

The charter's question — *can captured stills be automatically mapped to
plan/floor context behind a provider boundary?* — is answered **YES, with
measured evidence, on one concrete automatic path, under bounded
conditions**: 10/10 synthetic stills anchored to a plan raster behind a
process boundary at 0.4–8.9 cm floor-registration RMSE, deterministic
byte-for-byte, in 15 s cold, with a 9/9 fail-closed negative ledger, and
provenance complete and replayable. The conditions are explicit and
recorded: a shared-texture plan raster (not line art), ≥2 stills,
textured floors, no lens distortion (fixture limits), first-order
uncertainty budgets that cover realized error for well-supported stills
and miss on weak ones (the honest epistemic finding).

## The fork gate (charter §"Acceptance": the four tests evaluated —
any adaptation recommendation must pass `spec/technology-substitution-contract.md`)

Forking is not merely unjustified here; it is not even on the table: the
spike consumed OpenCV as an arms-length subprocess behind a JSON port —
there is nothing to fork. The tests, evaluated honestly:

| # | fork test | evidence | holds? |
|---|---|---|---|
| 1 | a required AISE capability cannot be delivered by adapter/API | every fixture capability (plan-raster anchoring, cross-validation, typed refusals, provenance, determinism) was delivered through the STANDARD OpenCV API behind a plain process adapter (PORT.md) | **NO** |
| 2 | the limitation materially affects product requirements | the open gaps (line-art plans, 3D/elevation anchoring, single-still anchoring) are method/lane gaps, not OpenCV gaps — a wall-line registration lane or an SfM lane would ALSO be adapters | **NO** |
| 3 | the capability cannot be isolated in AISE or another open component | the whole lane is isolated behind the spike port; the AISE diff of this spike touches NO engine/package file (git diff = the evidence tree only) | **NO** |
| 4 | fork maintenance/licensing cost is justified | OpenCV is Apache-2.0 (permissive; SIFT patent expired); the arms-length process boundary is exactly the license-encouraged consumption posture | **NO** |

All four fail to hold → **ADAPT, DO NOT FORK** — consistent with the
GBIM-001 verdict and charter §1.

## Conformance against `spec/technology-substitution-contract.md` (the
adaptation recommendation's required checks, as far as a spike can go)

- **Contract conformance** — the closed wire shapes + the AISE-side guard
  refusing unknown fields with the field named (neg-006): PROVEN at spike
  scale.
- **Semantic-equivalence tests** — N/A at spike scale (there is no
  incumbent anchoring provider to substitute; this is a NEW capability).
  The production Work Item must add them when a second provider exists.
- **Negative/discrimination tests** — 9/9 fail-closed, including the
  plausible-wrong-drawing discriminator (neg-004) and the gate-order
  proof (neg-005): PROVEN.
- **Provenance continuity** — versions/config/digests in every response,
  replayable: PROVEN (identical digests across runs).
- **Failure-path tests** — every failure typed, bounded, zero fabricated
  anchors: PROVEN.
- **Dependent-layer regression** — N/A (nothing canonical depends on the
  spike; the diff touches no engine/package file).
- **Compatibility window / rollback** — trivially satisfied by
  removability (the spike tree can be deleted without touching canonical
  state); a production lane keeps the same property by never writing.

## The recommended next actions, in order

1. **Create the shared anchoring contract Work Item** (the successor
   handoff): lift `anchor001-anchoring-port/1` into a typed zod-coded
   contract in `packages/` following the `solution-contract` codec
   discipline; keep the PROCESS boundary (subprocess, stdio JSON,
   timeout, input digest, output guard); carry the HANDEDNESS LAW as a
   required `rasterToScene` field (PORT.md §5); design the typed PARTIAL
   outcome (PORT.md §7) from the start — the recorder prefill UX needs
   it. Register the anchoring representation relationships against the
   existing reconstruction contract's `REPRESENTATION_TYPES`
   (`camera_poses` stays there; `plan-homography` is new and Layer-1).
2. **Gate any production adapter implementation on a REAL-PHOTOSET
   evidence run**: the synthetic fixture proves the lane, not the world.
   The run needs a real photoset with per-photo provenance (the
   PROD-033 web-sourcing pattern), a real plan drawing/raster, and the
   same measurements + negative ledger. The budget-calibration finding
   (measurements.md §4) must be re-measured there.
3. **Fix the plan-context seam in the live product first** (the enabling
   dependency): the reality recorder has no readable plan/floor context
   surface today — the anchoring contract needs a plan-image import with
   the declared raster convention. This is small, load-bearing, and
   independent of any provider decision.
4. **Keep AISE's task-directed honest-alternative lane intact** (the
   parity scorecard's framing): the anchoring candidate panel is an
   OPTIONAL accelerator for the recorder's composition, never a
   replacement for the human provenance discipline (ux-design-notes.md).

## Explicit defer decisions

- **SfM pose over photosets** (the charter's other example path): not
  exercised — the 2D-homography path answered the charter question with
  the smallest surface. A multi-view/3D lane (pycolmap-class, BSD) is the
  natural second adapter once the contract Work Item exists.
- **Line-art plan registration**: an explicit open gap (PORT.md §7) — a
  separate method (wall-line geometric registration or plan→orthophoto
  synthesis), evaluated as its own adapter behind the same port.
- **Elevation/3D anchoring**: out of scope; the homography anchors the
  floor plane only.
- **Provider daemon / session reuse / GPU**: production concerns; the
  one-shot process is sufficient evidence for the gate (the GBIM-001
  precedent).
- **Making any provider a default**: prohibited by the charter until the
  provider-registry promotion gates (registered → evaluation →
  benchmarked → promoted) run — this spike's evidence is the INPUT to
  that decision, not the decision.

## What the Tech Lead should independently reproduce

```
cd <repo>
/home/z/anchor001-venv/bin/python docs/productization-evidence/ANCHOR-001/fixture/render_fixture.py
git status --porcelain   # re-rendering must leave the tree CLEAN (byte-identical fixture)
bun docs/productization-evidence/ANCHOR-001/aise-side/run_spike.ts      # 10/10, deterministic, budget table
bun docs/productization-evidence/ANCHOR-001/aise-side/run_negatives.ts  # 9/9 fail-closed
git diff main --stat                     # the spike diff touches ONLY docs/productization-evidence/ANCHOR-001/
bun run verify                           # still PASS (the spike is additive evidence only)
```
