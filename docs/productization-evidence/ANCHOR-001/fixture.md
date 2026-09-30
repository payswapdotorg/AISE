# ANCHOR-001 — The Fixture and Its Provenance

## 1. What it is

A **fully synthetic, ground-truth-exact** anchoring fixture (the charter's
"synthetic fixture with known ground truth" option — a deliberate,
documented choice; see §5):

| element | value |
|---|---|
| scene | one construction floor, **8 m × 6 m** (the GBIM-000 canonical room footprint — the repo's shared-fixture discipline) |
| appearance | one procedural deterministic texture: 0.5 m tile grid with per-tile hash shades, 1 cm tile joints, 2.5 cm expansion joints every 2 m, **8 per-marker UNIQUE checker patches** (0.7 m, 3–5 cells/side, phase-varied — the fixed-equipment/distinct-floor-patch analog), a 0.3 m column footprint pad with bright border (echoes the GBIM-000 column), a door threshold strip, 1 m-scale mottle |
| plan raster | orthographic top-down render, **NORTH-UP** (row 0 = max y), 200 px/m → 1600×1200 PNG (`results/fixture/plan-raster.png`, 80 542 B) |
| stills | **10 perspective stills** walking a ~1.3 m-spacing loop over the floor (`still-001..010.png`, 800×600, ~228 KB each) — pinhole fx=fy=600 px, principal point centered, heights 1.45–1.55 m, tilt 28–36° from vertical (down-looking walk posture), yaw along the walk heading |
| photometrics | per-still deterministic gain (0.90–1.10), offset (±8), vignette (18 % at corners), sensor noise σ=2.0 (fixed per-still seeds) |
| ground truth | per-still exact homography plan-px→still-px (`results/fixture/ground-truth.json`), derived analytically from the camera model (K [r1 r2 t]·M for the plane z=0) |
| negative variants | 2 textureless (flat-gray) stills + 1 other-room plan raster (`results/negatives/`) |

## 2. Why the ground truth is EXACT (the fixture's core property)

The plan raster and every still are rendered from the **same procedural
texture function** — the stills are inverse-ray-mapped perspective samples
of the same continuous floor appearance the plan raster samples
orthographically. A perspective image of a plane is EXACTLY a homography
of the orthographic view of that plane, so the plan↔still correspondence
is a true homography by construction, and it is computed analytically from
the camera parameters (never estimated).

**Verification** (analytic, exact): for every still, floor-grid points are
projected to pixel coordinates independently by (a) the analytic
homography H and (b) direct ray-casting through the camera model —
maximum disagreement **< 2×10⁻⁵ px** across all stills (float rounding
only). The fixture's camera model and its ground-truth homographies are
the same mathematics.

## 3. Provenance

| field | value |
|---|---|
| author | `fixture/render_fixture.py` (committed, deterministic: integer-hash texture, fixed noise seeds, no clock, no network, no external assets) |
| generation | `/home/z/anchor001-venv/bin/python docs/productization-evidence/ANCHOR-001/fixture/render_fixture.py` (+ `--variant textureless`, `--variant other-plan`) |
| reproducibility | same script + same flags → byte-identical PNGs and byte-identical ground-truth.json (re-rendered and diffed during the spike; the committed bytes are the pinned fixture) |
| licensing | authored for this spike; no third-party assets; public-domain SplitMix32 hash |
| content ids | every committed PNG is content-addressed (sha-256) by the harness at run time; the provider re-verifies each digest before use |

## 4. Design iterations that shaped the fixture (honest record)

1. **4 identical markers + 45–50° tilts FAILED**: repetitive tile texture
   makes ratio-test matching collapse into ambiguity (10–30 good matches,
   4–7 inliers). Fix: per-marker unique patterns (cell count + phase),
   wider tile-shade spread, denser walk (1.3 m spacing).
2. **Screen-convention plan raster FAILED**: the y-down raster mirrors
   every real camera view; descriptors at TRUE correspondences carried
   ratio ≈ 2.1 (needs < 0.8). Fix: NORTH-UP plan raster + the port's
   declared `rasterToScene` (the HANDEDNESS LAW, PORT.md §5).
3. **100 px/m plan + 45° tilts**: scale gap and aliasing starved matching.
   Fix: 200 px/m plan (1600×1200) + 28–36° tilts.
4. Noise/vignette/photometric variation retained deliberately so matching
   is not byte-trivial (the stills are NOT warped copies of the plan
   raster — both sample one continuous appearance).

## 5. Why synthetic rather than a real photoset (the documented choice)

The charter allows either. The synthetic choice maximizes **ground-truth
exactness** (registration accuracy measurable against an exact analytic
truth, not against a noisy SLAM estimate or manual clicks) and full
provenance/licensing cleanliness. The honest cost, recorded for the
recommendation: synthetic texture does not exercise real-world appearance
variation (exposure extremes, motion blur, real lens distortion, real
repetitive-tile floors, real drawings). A **real-photoset evidence run is
the named precondition** for any production adapter work
(recommendation.md); the fixture discipline to reuse is exactly this
document's §1–§3 shape plus the PROD-033-style web-photo sourcing pattern
with per-photo provenance.

## 6. Known fixture limitations (all recorded, none hidden)

- No lens distortion (the pinhole model is exact; real stills carry
  radial distortion that a homography only approximates — the production
  lane needs undistortion or a distortion-aware model).
- No motion blur, no occluders (people, equipment), no HDR extremes.
- The floor texture is richer in unique markers than a bare concrete
  slab — the textureless negative variant deliberately covers the far end
  of that spectrum.
- The plan raster is a *shared-texture orthophoto-style* plan, not a
  line-art drawing; line-art registration is an explicit open gap
  (PORT.md §7).
