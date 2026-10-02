#!/usr/bin/env python3
"""
ANCHOR-007 — the negative-fixture artifact builder (deterministic).

Builds the degraded/discriminator artifacts the fail-closed negative ledger
needs (all DECLARED DERIVED-DRILL — never presented as real):

  - results/negatives/still-flat-gray.jpg — a textureless still (a flat
    gray frame with a faint vignette; NO feature structure): the
    insufficient-features discriminator for both lanes.
  - results/negatives/plan-mirrored.png — the REAL plan raster mirrored
    horizontally (a WRONG-ORIENTATION plan: its declaration stays honest
    east-right/north-up, but its bytes no longer depict the site's true
    geometry — no photograph of the real Farnsworth House can correspond to
    it). The physics discriminator: both lanes must refuse to register real
    photographs against a mirrored plan, whatever the paperwork says.

Run:
  /home/z/.venv/bin/python docs/productization-evidence/ANCHOR-007/tools/make_negative_artifacts.py
"""

import hashlib
import json
import sys
from pathlib import Path

import cv2
import numpy as np

HERE = Path(__file__).resolve().parent
TREE = HERE.parent
FIXTURE = TREE / "fixture"
NEGDIR = TREE / "results" / "negatives"


def main() -> int:
    NEGDIR.mkdir(parents=True, exist_ok=True)

    # ---- the textureless still -------------------------------------------
    rng = np.random.default_rng(20261002)
    h, w = 1400, 2000
    yy, xx = np.mgrid[0:h, 0:w]
    vign = 1.0 - 0.15 * (((xx - w / 2) / (w / 2)) ** 2 + ((yy - h / 2) / (h / 2)) ** 2)
    flat = np.clip(128.0 * vign + rng.normal(0, 1.2, (h, w)), 0, 255).astype(np.uint8)
    out_still = NEGDIR / "still-flat-gray.jpg"
    cv2.imwrite(str(out_still), flat, [cv2.IMWRITE_JPEG_QUALITY, 90])

    # ---- the mirrored plan -------------------------------------------------
    plan = cv2.imread(str(FIXTURE / "plan-raster.png"), cv2.IMREAD_GRAYSCALE)
    if plan is None:
        raise SystemExit("plan-raster.png missing")
    mirrored = cv2.flip(plan, 1)  # horizontal flip: east-west mirrored ink
    out_plan = NEGDIR / "plan-mirrored.png"
    cv2.imwrite(str(out_plan), mirrored)

    record = {
        "declaredClass": "DERIVED-DRILL (negative-ledger artifacts; never presented as real)",
        "artifacts": {
            "still-flat-gray.jpg": {
                "derivation": "flat 128-gray frame with a 15% radial vignette + N(0,1.2) noise "
                              "(seed 20261002), 2000x1400, JPEG q90 — NO feature structure by "
                              "construction (the insufficient-features discriminator)",
                "contentDigestSha256": hashlib.sha256(out_still.read_bytes()).hexdigest(),
            },
            "plan-mirrored.png": {
                "derivation": "the REAL plan-raster.png mirrored horizontally (cv2.flip code 1); "
                              "the declaration stays honest east-right/north-up, but the bytes "
                              "depict a mirrored site — the wrong-orientation physics discriminator",
                "contentDigestSha256": hashlib.sha256(out_plan.read_bytes()).hexdigest(),
            },
        },
    }
    (NEGDIR / "artifacts.json").write_text(json.dumps(record, indent=2) + "\n")
    print("still-flat-gray.jpg + plan-mirrored.png written (results/negatives/)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
