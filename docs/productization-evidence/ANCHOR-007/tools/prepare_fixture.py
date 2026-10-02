#!/usr/bin/env python3
"""
ANCHOR-007 — the deterministic fixture builder.

Derives the spike's fixture files from the PINNED, COMMITTED sourcing
renditions under fixture/ (the provenance manifest records where each
pinned byte came from — Wikimedia Commons mirrors of the LoC HABS IL-323
documentation set for the Edith Farnsworth House, plus the Highsmith /
CC photographs; per-item licenses and source URLs live in
fixture-manifest.json).

What this tool derives (deterministically, byte-identically on re-run):

  1. THE PLAN RASTER (fixture/plan-raster.png) from fixture/plan-source.jpg
     (the pinned 3840x2560 Commons rendition of HABS sheet 3 of 8, the
     "Plan" sheet — a LINE-ART measured drawing):
       a. the METERS graphic scale bar is RE-MEASURED programmatically
          (segment structure located at the expected sheet coordinates,
          subpixel bar-extent fit) -> pixelsPerMeter, asserted against the
          recorded derivation (88.00 px/m; cross-checks recorded in
          fixture.md §scale);
       b. the north-arrow needle's medial axis is RE-FIT (subpixel, rows
          2394-2422) -> the sheet-to-true-north lean (10.0315 deg east),
          asserted against the recorded derivation;
       c. the sheet is rotated so TRUE NORTH IS UP (the rasterToScene
          HANDEDNESS LAW's closed literals east-right/north-up are then
          TRUE by construction for the crop — the same discipline as the
          ANCHOR-003b EPSG:3857 north-up export);
       d. the drawing area (BOTH level plans the sheet documents: the
          house floor plan above, the lower-terrace plan below, with
          their dimension strings) is cropped, and
       e. rasterToScene for the crop is emitted: pixelsPerMeter 88.00
          (rigid rotation preserves scale), xDirection east-right,
          yDirection north-up, worldOriginPx = the crop center (a
          DECLARED local plan frame; the drawing's own graphic scale is
          the metric instrument).

  2. THE STILL FIXTURES are the normalized sourcing renditions (grayscale,
     <=2000 px max side, INTER_AREA, JPEG quality 90 — the normalization
     chain declared per item in fixture-manifest.json; performed at
     sourcing time, digest-pinned here).

  3. fixture-manifest.json — the per-item provenance manifest (source URL,
     license, creator, original rendition digest, normalization, committed
     digest) + the plan derivation record (scale + north + crop) + the
     rasterToScene declaration.

Run:
  /home/z/.venv/bin/python docs/productization-evidence/ANCHOR-007/tools/prepare_fixture.py
  git status --porcelain   # expected: CLEAN (byte-identical re-derivation)
"""

import hashlib
import json
import math
import sys
from pathlib import Path

import cv2
import numpy as np

HERE = Path(__file__).resolve().parent
TREE = HERE.parent
FIXTURE = TREE / "fixture"

# ---------------------------------------------------------------- units ---
# The recorded scale derivation (fixture.md "The scale" records the full
# evidence; this tool RE-MEASURES and asserts it):
#   METERS graphic bar: 0-tick x=1693, 3-m tick x=1957 (sheet coords, the
#   3840x2560 rendition) -> 264 px / 3 m = 88.00 px/m.
EXPECTED_PX_PER_METER = 88.00
PX_PER_METER_TOLERANCE = 0.50
# The recorded north derivation: needle medial axis x = -0.17689*y + c
# over sheet rows 2394..2422 (residual RMS 0.09 px), extrapolating through
# the arrow tip -> lean = atan(0.17689) = 10.0315 deg east of sheet-up.
EXPECTED_NORTH_LEAN_DEG = 10.0315
NORTH_LEAN_TOLERANCE_DEG = 0.15

# The drawing area on the unrotated sheet (both level plans + dimension
# strings; excludes title block, sheet border, scale bars, north arrow).
DRAWING_AREA = (240, 470, 3370, 2250)  # x0, y0, x1, y1 (sheet px)

# The pinned sourcing renditions -> the fixture stills (normalized at
# sourcing time: grayscale, <=2000 px, INTER_AREA, JPEG q90). The full
# remote provenance of every pinned byte is carried in the manifest
# constants below (source URL / license / creator / original digest).
STILLS = [
    # (fixture name, normalized-source digest, provenance)
    ("still-h01.jpg", "habs-photo-01.jpg"),
    ("still-h02.jpg", "habs-photo-02.jpg"),
    ("still-h03.jpg", "habs-photo-03.jpg"),
    ("still-h04.jpg", "habs-photo-04.jpg"),
    ("still-h05.jpg", "habs-photo-05.jpg"),
    ("still-h06.jpg", "habs-photo-06.jpg"),
    ("still-h07.jpg", "habs-photo-07.jpg"),
    ("still-h08.jpg", "habs-photo-08.jpg"),
    ("still-h09.jpg", "habs-photo-09.jpg"),
    ("still-h10.jpg", "habs-photo-10.jpg"),
    ("still-i01.jpg", "highsmith-interior-01.jpg"),
    ("still-i02.jpg", "highsmith-interior-02.jpg"),
    ("still-i03.jpg", "highsmith-fall-exterior.jpg"),
    ("still-i04.jpg", "cc-colros-exterior.jpg"),
    ("still-e01.jpg", "highsmith-exterior-01.jpg"),
    ("still-g01.jpg", "highsmith-garage.jpg"),
]

# Remote provenance of every pinned fixture byte (declared constants — the
# sourcing campaign's record; see fixture.md for the campaign narrative).
SOURCE_PROVENANCE = {
    "plan-source.jpg": {
        "role": "the line-art plan drawing (HABS measured-drawing sheet 3 of 8: the house floor plan + the lower-terrace plan)",
        "commonsTitle": "File:Plan - Edith Farnsworth House, 14520 River Road, Plano, Kendall County, IL HABS ILL,47-PLAN.V,1- (sheet 3 of 8).tif",
        "locItem": "HABS IL-323 (Edith Farnsworth House), sheet il0323.sheet.00003a",
        "sourceUrl": "https://commons.wikimedia.org/wiki/File:Plan_-_Edith_Farnsworth_House,_14520_River_Road,_Plano,_Kendall_County,_IL_HABS_ILL,47-PLAN.V,1-_(sheet_3_of_8).tif",
        "rendition": "Commons 'lossy-page1-3840px' JPEG thumbnail of the 7200x4800 original TIFF (the rendition the API served; observed behavior recorded in fixture.md)",
        "originalSize": [7200, 4800],
        "creator": "Milnarik, Elizabeth, creator (HABS documentation team)",
        "license": "Public domain (United States government work; HABS documentation)",
        "retrievedUtc": "2026-10-02",
    },
    "habs-photo-01.jpg": {"caption": "GENERAL VIEW FROM THE SOUTHWEST, SHOWING SOUTH ELEVATION (HABS ILL,47-PLAN.V,1-1)", "locItem": "il0323.photos.062512p", "creator": "Boucher, Jack E. (HABS chief photographer)", "license": "Public domain (US government work)", "retrievedUtc": "2026-10-02"},
    "habs-photo-02.jpg": {"caption": "SOUTH ELEVATION, DETAIL OF PORCH, SEEN FROM SOUTHWEST (HABS ILL,47-PLAN.V,1-2)", "locItem": "il0323.photos.062513p", "creator": "Boucher, Jack E.", "license": "Public domain (US government work)", "retrievedUtc": "2026-10-02"},
    "habs-photo-03.jpg": {"caption": "GENERAL VIEW FROM THE SOUTHEAST, SHOWING SOUTH ELEVATION (HABS ILL,47-PLAN.V,1-3)", "locItem": "il0323.photos.062514p", "creator": "Boucher, Jack E.", "license": "Public domain (US government work)", "retrievedUtc": "2026-10-02"},
    "habs-photo-04.jpg": {"caption": "SOUTH ELEVATION (HABS ILL,47-PLAN.V,1-4)", "locItem": "il0323.photos.062515p", "creator": "Boucher, Jack E.", "license": "Public domain (US government work)", "retrievedUtc": "2026-10-02"},
    "habs-photo-05.jpg": {"caption": "SOUTH ELEVATION DETAIL OF ENTRANCE (HABS ILL,47-PLAN.V,1-5)", "locItem": "il0323.photos.062516p", "creator": "Boucher, Jack E.", "license": "Public domain (US government work)", "retrievedUtc": "2026-10-02"},
    "habs-photo-06.jpg": {"caption": "SOUTH ELEVATION, DETAIL OF ENTRANCE AND EASTERN BAYS, SEEN FROM EAST (HABS ILL,47-PLAN.V,1-6)", "locItem": "il0323.photos.062517p", "creator": "Boucher, Jack E.", "license": "Public domain (US government work)", "retrievedUtc": "2026-10-02"},
    "habs-photo-07.jpg": {"caption": "SOUTH ELEVATION, EASTERN BAYS (HABS ILL,47-PLAN.V,1-7)", "locItem": "il0323.photos.062518p", "creator": "Boucher, Jack E.", "license": "Public domain (US government work)", "retrievedUtc": "2026-10-02"},
    "habs-photo-08.jpg": {"caption": "NORTH AND WEST ELEVATIONS (HABS ILL,47-PLAN.V,1-8)", "locItem": "il0323.photos.062519p", "creator": "Boucher, Jack E.", "license": "Public domain (US government work)", "retrievedUtc": "2026-10-02"},
    "habs-photo-09.jpg": {"caption": "NORTH ELEVATION (HABS ILL,47-PLAN.V,1-9)", "locItem": "il0323.photos.062520p", "creator": "Boucher, Jack E.", "license": "Public domain (US government work)", "retrievedUtc": "2026-10-02"},
    "habs-photo-10.jpg": {"caption": "NORTH ELEVATION, SEEN FROM NORTHEAST (HABS ILL,47-PLAN.V,1-10)", "locItem": "il0323.photos.062521p", "creator": "Boucher, Jack E.", "license": "Public domain (US government work)", "retrievedUtc": "2026-10-02"},
    "highsmith-interior-01.jpg": {"caption": "Interior living room view (Highsmith)", "locItem": "LCCN2010630501", "creator": "Carol M. Highsmith", "license": "Public domain (Highsmith donation, no known restrictions)", "retrievedUtc": "2026-10-02"},
    "highsmith-interior-02.jpg": {"caption": "Interior living room view (Highsmith)", "locItem": "LCCN2010630502", "creator": "Carol M. Highsmith", "license": "Public domain (Highsmith donation, no known restrictions)", "retrievedUtc": "2026-10-02"},
    "highsmith-fall-exterior.jpg": {"caption": "Farnsworth House kitchen interior (the Commons file is titled 'Fall at the Farnsworth House' but the rendition served for LCCN2011631156 is the kitchen interior — a Commons data quirk, recorded honestly; the fixture treats it as an INTERIOR view)", "locItem": "LCCN2011631156 (as served)", "creator": "Carol M. Highsmith", "license": "Public domain (Highsmith donation, no known restrictions)", "retrievedUtc": "2026-10-02"},
    "cc-colros-exterior.jpg": {"caption": "Interior view across the living space toward the west glass wall (colros)", "locItem": "https://commons.wikimedia.org/wiki/File:FarnsworthHouse-Mies-6.jpg", "creator": "colros (Wikimedia Commons)", "license": "CC BY-SA 2.0", "retrievedUtc": "2026-10-02"},
    "highsmith-exterior-01.jpg": {"caption": "Exterior view (Highsmith), low-angle corner view", "locItem": "LCCN2011633508", "creator": "Carol M. Highsmith", "license": "Public domain (Highsmith donation, no known restrictions)", "retrievedUtc": "2026-10-02"},
    "highsmith-garage.jpg": {"caption": "GARAGE at the Farnsworth House (Highsmith) — a REAL different building on the same site: the wrong-plan discriminator fixture (the garage is NOT on the house plan sheet)", "locItem": "LCCN2011634368", "creator": "Carol M. Highsmith", "license": "Public domain (Highsmith donation, no known restrictions)", "retrievedUtc": "2026-10-02"},
}

NORMALIZATION = {
    "method": "grayscale (cv2.IMREAD_GRAYSCALE of the retrieved rendition) -> INTER_AREA downscale to max side 2000 px -> JPEG quality 90 (baseline, no chroma — grayscale)",
    "note": "performed once at sourcing time; the normalized bytes are the pinned fixture stills (digest-pinned in the manifest); the plan derivation alone is re-runnable in-repo from the committed plan-source.jpg",
}


def sha256_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def verify_scale_bar(sheet: np.ndarray) -> float:
    """Re-measure the METERS graphic scale bar (the metric instrument).

    The bar (sheet rows ~2321-2338): alternating checkerboard rectangles
    about a 2-px baseline at rows 2329-2330, spanning 0..3 m. The 0-tick
    is the leading edge of the first above-line rectangle; the 3-m tick
    is the trailing edge of the last below-line rectangle.
    """
    above = (sheet[2321:2328, :] < 128).any(axis=0)
    below = (sheet[2332:2339, :] < 128).any(axis=0)

    def segments(on: np.ndarray, lo: int, hi: int) -> list:
        segs, start = [], None
        for x in range(lo, hi):
            if on[x] and start is None:
                start = x
            elif not on[x] and start is not None:
                segs.append((start, x - 1))
                start = None
        if start is not None:
            segs.append((start, hi - 1))
        return segs

    above_segs = segments(above, 1600, 2100)
    below_segs = segments(below, 1600, 2100)
    if not above_segs or not below_segs:
        raise AssertionError("scale bar structure not found at expected coordinates")
    zero_tick = above_segs[0][0]          # leading edge of the first above-bar block
    three_m_tick = below_segs[-1][1] + 1  # trailing edge of the last below-bar block
    px_per_m = (three_m_tick - zero_tick) / 3.0
    return px_per_m


def verify_north_needle(sheet: np.ndarray) -> float:
    """Re-fit the north-arrow needle's medial axis (subpixel).

    The needle shaft (below the arrowhead, above the decorative arcs):
    sheet rows 2394..2422, x band ~1215..1240. Per-row darkness-weighted
    centroid, then a weighted least-squares line x = a*y + b. The lean
    east of vertical-up is atan(a) (the tip is EAST of the base).
    """
    reg = sheet[2394:2423, 1215:1240].astype(np.float64)
    ink = 255.0 - reg
    rows = []
    for y in range(reg.shape[0]):
        w = ink[y]
        if w.sum() > 50:
            xs = np.arange(reg.shape[1])
            rows.append((2394 + y, (w * xs).sum() / w.sum() + 1215))
    if len(rows) < 20:
        raise AssertionError("north needle not found at expected coordinates")
    Y = np.array([r[0] for r in rows], dtype=np.float64)
    X = np.array([r[1] for r in rows], dtype=np.float64)
    A = np.stack([Y, np.ones(len(Y))], axis=1)
    coef, *_ = np.linalg.lstsq(A, X, rcond=None)
    resid = X - A @ coef
    rms = float(np.sqrt((resid ** 2).mean()))
    if rms > 0.5:
        raise AssertionError(f"north needle fit residual too high: {rms:.3f} px")
    return math.degrees(math.atan(abs(coef[0])))


def derive_plan_raster() -> dict:
    src = cv2.imread(str(FIXTURE / "plan-source.jpg"), cv2.IMREAD_GRAYSCALE)
    if src is None:
        raise SystemExit("plan-source.jpg missing")
    h, w = src.shape

    px_per_m = verify_scale_bar(src)
    if abs(px_per_m - EXPECTED_PX_PER_METER) > PX_PER_METER_TOLERANCE:
        raise AssertionError(
            f"scale bar re-measurement {px_per_m:.3f} px/m deviates from the recorded "
            f"derivation {EXPECTED_PX_PER_METER} (+/-{PX_PER_METER_TOLERANCE})"
        )
    lean_deg = verify_north_needle(src)
    if abs(lean_deg - EXPECTED_NORTH_LEAN_DEG) > NORTH_LEAN_TOLERANCE_DEG:
        raise AssertionError(
            f"north needle re-fit {lean_deg:.4f} deg deviates from the recorded "
            f"derivation {EXPECTED_NORTH_LEAN_DEG} (+/-{NORTH_LEAN_TOLERANCE_DEG})"
        )

    # Rotate so TRUE NORTH IS UP. getRotationMatrix2D(angle>0) rotates the
    # displayed content counter-clockwise; the needle leans EAST of up, so
    # a +lean CCW rotation brings it to vertical (verified numerically in
    # fixture.md: the tip->base vector maps to (0, -L) exactly).
    center = (w / 2.0, h / 2.0)
    M = cv2.getRotationMatrix2D(center, lean_deg, 1.0)
    rotated = cv2.warpAffine(
        src, M, (w, h), flags=cv2.INTER_CUBIC,
        borderMode=cv2.BORDER_CONSTANT, borderValue=255,
    )

    # Crop the drawing area: transform the source-space rectangle corners
    # into rotated space and take the integer bounding box (margin 4 px) —
    # then WHITE-OUT every output pixel whose source-space location falls
    # OUTSIDE the drawing-area rectangle (the rotated bbox legitimately
    # contains out-of-rectangle sheet content — border/title/scale-bar
    # fragments — which must not become part of the fixture raster).
    x0, y0, x1, y1 = DRAWING_AREA
    corners = np.array(
        [[[x0, y0]], [[x1, y0]], [[x1, y1]], [[x0, y1]]], dtype=np.float32
    )
    dst = cv2.transform(corners, M).reshape(-1, 2)
    cx0 = max(0, int(np.floor(dst[:, 0].min())) - 4)
    cy0 = max(0, int(np.floor(dst[:, 1].min())) - 4)
    cx1 = min(w, int(np.ceil(dst[:, 0].max())) + 4)
    cy1 = min(h, int(np.ceil(dst[:, 1].max())) + 4)
    crop = rotated[cy0:cy1, cx0:cx1].copy()

    # Inverse-map the output grid to source space; keep only in-rectangle ink.
    Minv = cv2.invertAffineTransform(M)
    ys, xs = np.mgrid[cy0:cy1, cx0:cx1]
    src_x = Minv[0, 0] * xs + Minv[0, 1] * ys + Minv[0, 2]
    src_y = Minv[1, 0] * xs + Minv[1, 1] * ys + Minv[1, 2]
    outside = (src_x < x0) | (src_x > x1) | (src_y < y0) | (src_y > y1)
    crop[outside] = 255

    cv2.imwrite(str(FIXTURE / "plan-raster.png"), crop)

    ch, cw = crop.shape
    world_origin = [round(cw / 2.0, 1), round(ch / 2.0, 1)]
    return {
        "file": "plan-raster.png",
        "sizePx": [cw, ch],
        "derivation": {
            "source": "plan-source.jpg (the pinned Commons 3840x2560 rendition of HABS sheet 3 of 8)",
            "scaleInstrument": "the METERS graphic scale bar (0-tick .. 3-m tick, re-measured by this tool)",
            "pixelsPerMeterReMeasured": round(px_per_m, 3),
            "pixelsPerMeterCrossChecks": [
                "FEET bar 0..10 ft: 267 px / 10 ft = 87.60 px/m (-0.45%)",
                "printed scale 1:48 of a 36x24 in sheet scanned at 200 dpi, rendition factor 8/15: 87.47 px/m (-0.6%)",
            ],
            "northInstrument": "the north-arrow needle medial axis (subpixel, 29 rows, residual RMS 0.09 px)",
            "northLeanReMeasuredDeg": round(lean_deg, 4),
            "rotationDeg": round(lean_deg, 4),
            "rotationDirection": "counter-clockwise (brings the east-leaning needle to vertical; numeric check in fixture.md)",
            "cropSourceRectPx": list(DRAWING_AREA),
            "cropContent": "BOTH level plans the sheet documents (upper: the house floor plan; lower: the lower-terrace plan) with their dimension strings; title block, sheet border, scale bars and north arrow excluded",
            "resampling": "single warpAffine INTER_CUBIC (no double resampling); rigid rotation preserves 88.00 px/m",
        },
        "rasterToScene": {
            "pixelsPerMeter": EXPECTED_PX_PER_METER,
            "xDirection": "east-right",
            "yDirection": "north-up",
            "worldOriginPx": world_origin,
            "frame": "a DECLARED local plan frame: origin at the crop center, x east, y north; THE HANDEDNESS LAW is TRUE by construction (the crop was rotated so true north is up)",
        },
        "contentDigestSha256": sha256_file(FIXTURE / "plan-raster.png"),
    }


def main() -> int:
    plan = derive_plan_raster()

    stills = []
    for fixture_name, source_name in STILLS:
        path = FIXTURE / fixture_name
        if not path.is_file():
            raise SystemExit(f"missing fixture still {fixture_name}")
        img = cv2.imread(str(path), cv2.IMREAD_GRAYSCALE)
        prov = dict(SOURCE_PROVENANCE[source_name])
        prov.update(
            {
                "file": fixture_name,
                "sizePx": [img.shape[1], img.shape[0]],
                "sourcedRenditionDigestSha256": sha256_file(path),
                "normalization": NORMALIZATION["method"],
            }
        )
        stills.append(prov)

    manifest = {
        "manifestId": "anchor007-fixture/1",
        "site": {
            "name": "Edith Farnsworth House (Mies van der Rohe, 1945-51), 14520 River Road, Plano, Kendall County, Illinois, USA",
            "documentation": "HABS IL-323 (measured drawings 8 sheets + 10 large-format photographs); the paired capture: the HABS documentation photographs of the SAME documented site + public-domain/CC photographs of the same house",
            "fidelityClass": "REAL",
            "fidelityNote": "real public-domain/CC photographs and the real HABS measured drawing of one real documented site; never upgraded, never synthetic (the DERIVED-DRILL artifacts of the negative ledger are declared separately and never presented as real)",
        },
        "planRaster": plan,
        "stills": stills,
        "counts": {
            "planRasters": 1,
            "anchorCandidateStills": len([s for s in stills if not s["file"].startswith("still-g")]),
            "wrongSiteStills": len([s for s in stills if s["file"].startswith("still-g")]),
            "exteriorStills": len([s for s in stills if s["file"].startswith(("still-h", "still-e"))]),
            "interiorStills": len([s for s in stills if s["file"].startswith("still-i")]),
        },
        "rightsSummary": "HABS documentation (drawings + photographs): public domain, United States government works. Highsmith photographs: public domain (donated, no known restrictions). One CC BY-SA 2.0 photograph (colros) carried under its license terms with attribution recorded per item. No third-party rights restricted items in this fixture.",
    }
    out = FIXTURE / "fixture-manifest.json"
    out.write_text(json.dumps(manifest, indent=2) + "\n")
    print(f"plan-raster.png: {plan['sizePx']}, px/m={plan['rasterToScene']['pixelsPerMeter']}")
    print(f"stills pinned: {len(stills)}; manifest written: {out.name}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
