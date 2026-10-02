#!/usr/bin/env python3
"""
ANCHOR-006 — the negative/drill artifact generator.

Generates the DECLARED drill artifacts used by the negative ledger and the
typed-outcome exercises (never part of the REAL photoset; every artifact's
fidelity class is DERIVED-DRILL, recorded as such):

  1. `still-flat-gray.jpg`    — a textureless still (the neg-003 drill: the
                                insufficient-features gate).
  2. `still-plan-derived-1.jpg`, `-2.jpg`, `-3.jpg` — plan-derived
                                registration drill stills: the REAL first
                                plan raster of the run set warped by KNOWN
                                homographies (the ANCHOR-001 self-test
                                discipline lifted to the contract seam).
                                These anchor legitimately through the
                                reference adapter and are the vehicle for
                                exercising the typed `anchored`/`partial`
                                outcomes end-to-end.
  3. `plan-other-site.jpg`    — a REAL USGS NAIP ortho raster of DIFFERENT
                                pivot ground (the Texas Panhandle / Lubbock
                                County belt at 33.58N 101.90W, ~450 km from
                                the campaign belt; 18.0 km EPSG:3857 square
                                over 3000 px = 14996.1 m ground = 4.9987
                                ground m/px => pixelsPerMeter 0.200053; NAIP
                                vintage at center m_3310125_ne_14_060_20220904,
                                2022-09-04), the neg-004 wrong-plan
                                discriminator: real public-domain
                                orthoimagery, wrong ground. Committed
                                BYTE-IDENTICAL to the campaign export (the
                                3000 px export IS the artifact — never
                                resized, so the declared scale stays true).

Deterministic: fixed RNG, fixed transforms, fixed JPEG quality.
Run (after tools/assemble_photoset.py has committed the photoset):
  python3 docs/productization-evidence/ANCHOR-006/tools/make_drill_artifacts.py
"""

import json
import shutil
import sys
from pathlib import Path

import cv2
import numpy as np

HERE = Path(__file__).resolve().parent
TREE = HERE.parent
PHOTOSET = TREE / "photoset"
NEGDIR = TREE / "results" / "negatives"
PANHANDLE_SOURCE = Path("/home/z/scratch-anchor006/panhandle/plan_panhandle_3000.jpg")

# Known homographies (plan-px -> drill-still-px), carried from ANCHOR-003b's
# declared drill transforms (well-conditioned: moderate scale + rotation +
# perspective) — the drills are the same discipline on 006's plan.
DRILL_TRANSFORMS = {
    "still-plan-derived-1.jpg": np.array(
        [[0.85, -0.06, 140.0], [0.05, 0.90, 80.0], [1.2e-5, 1.5e-5, 1.0]], dtype=np.float64),
    "still-plan-derived-2.jpg": np.array(
        [[1.10, 0.08, -60.0], [-0.05, 1.05, 50.0], [-0.8e-5, 1.0e-5, 1.0]], dtype=np.float64),
    "still-plan-derived-3.jpg": np.array(
        [[0.95, -0.10, 90.0], [0.12, 0.88, 30.0], [2.0e-5, -1.0e-5, 1.0]], dtype=np.float64),
}


def main() -> int:
    NEGDIR.mkdir(parents=True, exist_ok=True)

    manifest = json.loads((TREE / "provenance-manifest.json").read_text())
    plan_file = manifest["planRasters"][0]["file"]
    plan = cv2.imread(str(PHOTOSET / plan_file), cv2.IMREAD_GRAYSCALE)
    if plan is None:
        print(f"FAIL: photoset plan raster {plan_file} missing — run tools/assemble_photoset.py first", file=sys.stderr)
        return 1

    cv2.setRNGSeed(20261002)

    # 1. textureless drill still (neg-003)
    flat = np.full((768, 1024), 137, dtype=np.uint8)
    cv2.imwrite(str(NEGDIR / "still-flat-gray.jpg"), flat, [cv2.IMWRITE_JPEG_QUALITY, 95])

    # 2. plan-derived registration drill stills (known-H warps of the REAL plan)
    for name, h in DRILL_TRANSFORMS.items():
        still = cv2.warpPerspective(plan, h, (1024, 768), flags=cv2.WARP_INVERSE_MAP)
        cv2.imwrite(str(NEGDIR / name), still, [cv2.IMWRITE_JPEG_QUALITY, 95])

    # 3. the wrong-site plan (neg-004): REAL Texas Panhandle / Lubbock County
    #    NAIP ortho, exported 18.0 km (EPSG:3857) => 14996.1 m ground at
    #    33.58N over 3000 px = 4.9987 ground m/px (pixelsPerMeter 0.200053 —
    #    the exact value the neg-004 case declares; the export bytes are
    #    committed UNRESIZED so the declaration stays true).
    if PANHANDLE_SOURCE.exists():
        shutil.copyfile(PANHANDLE_SOURCE, NEGDIR / "plan-other-site.jpg")
        meta = json.loads(PANHANDLE_SOURCE.with_suffix(".json").read_text())
        print("plan-other-site.jpg:", meta["bytes"], "bytes, sha256", meta["sha256"][:16] + "…",
              "— pixelsPerMeter", meta["pixelsPerMeter"], "(declared by neg-004)")
    else:
        print("WARN: Panhandle source missing — re-run the export (see run-record.md)", file=sys.stderr)
        return 1

    print("drill artifacts written to", NEGDIR)
    return 0


if __name__ == "__main__":
    sys.exit(main())
