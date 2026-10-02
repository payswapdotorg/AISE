#!/usr/bin/env python3
"""
ANCHOR-005 — the declared drill-artifact generator.

Generates the negative-ledger and typed-outcome drill artifacts (all
DERIVED-DRILL, never counted in the real photoset):

  still-flat-gray.jpg          the textureless still (the insufficient-
                               features negative — the 003b neg-003 form);
  still-plan-derived-N.jpg     plan-derived verification stills: the plan
                               raster warped by KNOWN homographies — the
                               line-art-to-line-art registration lane that
                               the reference method CAN anchor (the
                               instrument validation: the production gates
                               pass these at high inliers / high NCC, which
                               proves the refusal physics on the real
                               photographs is the radiometry gap, not a
                               broken lane).

The known warp homographies are recorded in the artifact record so the
drills' own ground truth is derivable (the ANCHOR-001 fixture discipline).

Run (from the repo root):
  python3 docs/productization-evidence/ANCHOR-005/tools/make_drill_artifacts.py
"""

import hashlib
import json
import os
import sys

import cv2
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
TREE = os.path.dirname(HERE)
PHOTOSET = os.path.join(TREE, "photoset")
NEGDIR = os.path.join(TREE, "results", "negatives")

# Known plan-px -> drill-px homographies (the drills' own ground truth).
DRILL_WARPS = {
    "still-plan-derived-1.jpg": [[0.35, 0.0, 40.0], [0.0, 0.35, 30.0], [0.0, 0.0, 1.0]],
    "still-plan-derived-2.jpg": [[0.32, 0.015, 120.0], [-0.012, 0.33, 60.0], [0.0, 0.0, 1.0]],
    "still-plan-derived-3.jpg": [[0.30, -0.01, 200.0], [0.01, 0.31, 100.0], [0.0, 0.0, 1.0]],
}


def main():
    os.makedirs(NEGDIR, exist_ok=True)
    with open(os.path.join(TREE, "provenance-manifest.json")) as fh:
        manifest = json.load(fh)

    plan = cv2.imread(os.path.join(PHOTOSET, manifest["planRaster"]["file"]), cv2.IMREAD_GRAYSCALE)
    if plan is None:
        print("plan raster unreadable", file=sys.stderr)
        return 2

    record = {"instrument": "anchor005-drill-artifacts/1",
              "declaration": "DERIVED-DRILL — generated artifacts, never counted in the real photoset",
              "artifacts": []}

    # the textureless still (deterministic noise-free gray with a soft ramp,
    # so CLAHE cannot manufacture keypoints)
    flat = np.full((960, 1280), 137, dtype=np.uint8)
    cv2.rectangle(flat, (200, 200), (1080, 760), 141, -1)
    cv2.imwrite(os.path.join(NEGDIR, "still-flat-gray.jpg"), flat,
                [cv2.IMWRITE_JPEG_QUALITY, 92])
    record["artifacts"].append({
        "file": "results/negatives/still-flat-gray.jpg",
        "kind": "textureless drill still",
        "sha256": hashlib.sha256(open(os.path.join(NEGDIR, "still-flat-gray.jpg"), "rb").read()).hexdigest(),
    })

    for name, H in DRILL_WARPS.items():
        Hm = np.array(H, dtype=np.float64)
        still = cv2.warpPerspective(plan, Hm, (1400, 900))
        path = os.path.join(NEGDIR, name)
        cv2.imwrite(path, still, [cv2.IMWRITE_JPEG_QUALITY, 92])
        record["artifacts"].append({
            "file": f"results/negatives/{name}",
            "kind": "plan-derived verification still (KNOWN homography — the drill's own ground truth)",
            "knownHPlanPxToDrillPx": H,
            "sha256": hashlib.sha256(open(path, "rb").read()).hexdigest(),
        })
        print(f"{name}: sha256:{record['artifacts'][-1]['sha256'][:16]}…")

    with open(os.path.join(NEGDIR, "drill-artifacts.json"), "w") as fh:
        json.dump(record, fh, indent=1)
        fh.write("\n")
    print(f"drill artifacts written: {len(record['artifacts'])}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
