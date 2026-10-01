#!/usr/bin/env python3
"""
ANCHOR-003b — the negative/drill artifact generator.

Generates the DECLARED drill artifacts used by the negative ledger and the
typed-outcome exercises (never part of the REAL photoset; every artifact's
fidelity class is DERIVED-DRILL, recorded as such):

  1. `still-flat-gray.jpg`   — a textureless still (the neg-003 drill: the
                               insufficient-features gate).
  2. `still-plan-derived-1.jpg`, `still-plan-derived-2.jpg`,
     `still-plan-derived-3.jpg` — plan-derived registration drill stills:
     the REAL plan raster warped by KNOWN homographies (the ANCHOR-001
     self-test discipline lifted to the contract seam). These anchor
                             legitimately through the reference adapter
                             (high inlier support, photometric NCC ~0.9) and
                             are the vehicle for exercising the typed
                             `anchored` and `partial` outcomes end-to-end.
  3. `plan-other-site.jpg`   — a REAL USGS NAIP ortho raster of a DIFFERENT
                             site (Seattle Center), the neg-004 wrong-plan
                             discriminator: real imagery, wrong ground.

Deterministic: fixed RNG, fixed transforms, fixed JPEG quality.
Run:
  python3 docs/productization-evidence/ANCHOR-003b/tools/make_drill_artifacts.py
"""

import sys
from pathlib import Path

import cv2
import numpy as np

HERE = Path(__file__).resolve().parent
TREE = HERE.parent
PHOTOSET = TREE / "photoset"
NEGDIR = TREE / "results" / "negatives"
SEATTLE_SOURCE = Path("/home/z/aise/scratch-probe/towers/plan_seattle_4000.jpg")

# Known homographies (plan-px -> drill-still-px), chosen to be well-condition
# (moderate scale + rotation + perspective), exercised in the drill ledger.
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
    plan = cv2.imread(str(PHOTOSET / "plan-raster.jpg"), cv2.IMREAD_GRAYSCALE)
    if plan is None:
        print("FAIL: photoset plan raster missing", file=sys.stderr)
        return 1

    cv2.setRNGSeed(20260930)

    # 1. textureless drill still (neg-003)
    flat = np.full((768, 1024), 137, dtype=np.uint8)
    cv2.imwrite(str(NEGDIR / "still-flat-gray.jpg"), flat, [cv2.IMWRITE_JPEG_QUALITY, 95])

    # 2. plan-derived registration drill stills (known-H warps of the REAL plan)
    for name, h in DRILL_TRANSFORMS.items():
        still = cv2.warpPerspective(plan, h, (1024, 768), flags=cv2.WARP_INVERSE_MAP)
        cv2.imwrite(str(NEGDIR / name), still, [cv2.IMWRITE_JPEG_QUALITY, 95])

    # 3. the wrong-site plan (neg-004): REAL Seattle Center NAIP ortho, resized
    if SEATTLE_SOURCE.exists():
        other = cv2.imread(str(SEATTLE_SOURCE), cv2.IMREAD_GRAYSCALE)
        other = cv2.resize(other, (1600, 1600), interpolation=cv2.INTER_AREA)
        cv2.imwrite(str(NEGDIR / "plan-other-site.jpg"), other, [cv2.IMWRITE_JPEG_QUALITY, 92])
    else:
        print("WARN: Seattle source missing — neg-004 needs plan-other-site.jpg", file=sys.stderr)

    print("drill artifacts written to", NEGDIR)
    return 0


if __name__ == "__main__":
    sys.exit(main())
