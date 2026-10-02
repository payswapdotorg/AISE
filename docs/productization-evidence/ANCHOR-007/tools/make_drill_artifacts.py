#!/usr/bin/env python3
"""
ANCHOR-007 — the DERIVED-DRILL artifact builder (instrument validation).

Builds the drill stills that prove each lane's INSTRUMENT works on clean
inputs before the spike measures the lanes against real photographs (the
ANCHOR-003b discipline: the refusal of real data must be the world's
property, not the instrument's). THREE variants per path (the port's
redundancy law needs >= 2 stills per request; three give the cross-
validation leg something to see on path (a)).

  - drill-path-a{1,2,3}.png: the path-(a) intermediate raster
    (wall-region-synthesis/1 derivation of the plan) warped by KNOWN
    homographies and lightly degraded (declared blur + noise) —
    photograph-LIKE views of the synthesized base map. The path-(a) lane
    must anchor them with high support and NCC, recovering the known
    transforms.
  - drill-path-b{1,2,3}.png: TRUE pinhole renders of the plan's line-work
    lying on the ground plane z=0 (plus short vertical members — the wall
    analog — so all three direction families exist), each from a different
    known camera pose, lightly degraded — photograph-LIKE line structure
    whose plan correspondence is EXACTLY the known ground-plane homography.
    The path-(b) geometric lane must anchor them.

All artifacts are DECLARED DERIVED-DRILL (never presented as real; the
fixture manifest carries them under a separate drill record with their
derivations). The known homographies are recorded in
fixture/drill-ground-truth.json for the realized-error instrument
(tools/measure_drill_realized_error.py).

Run:
  /home/z/.venv/bin/python docs/productization-evidence/ANCHOR-007/tools/make_drill_artifacts.py
  (deterministic; byte-identical on re-run)
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

PX_PER_M = 88.0


def _splitmix32(x):
    x = (x + 0x9E3779B9) & 0xFFFFFFFF
    x ^= x >> 16
    x = (x * 0x21F0AAAD) & 0xFFFFFFFF
    x ^= x >> 15
    x = (x * 0x735A2D97) & 0xFFFFFFFF
    x ^= x >> 15
    return x & 0xFFFFFFFF


def derive_intermediate(plan_img):
    """wall-region-synthesis/1 — identical to the path-a adapter's primary."""
    ink = (plan_img < 160).astype(np.uint8)
    kernel = np.ones((3, 3), np.uint8)
    closed = cv2.morphologyEx(ink, cv2.MORPH_CLOSE, kernel, iterations=2)
    walls = cv2.dilate(closed, kernel, iterations=2)
    h, w = plan_img.shape
    px_per_m = PX_PER_M
    tile = max(2, int(round(0.5 * px_per_m)))
    yy, xx = np.mgrid[0:h, 0:w]
    ty, tx = (yy // tile).astype(np.int64), (xx // tile).astype(np.int64)
    shade_map = np.array(
        [[_splitmix32(int(a) * 1000003 + int(b) * 101 + 17) / 4294967295.0
          for b in range(tx.max() + 1)] for a in range(ty.max() + 1)], dtype=np.float32)
    shade = shade_map[ty, tx]
    mottle = 0.5 + 0.5 * np.sin(xx / (13.0 * tile)) * np.cos(yy / (17.0 * tile))
    base = 150.0 + 55.0 * (0.5 * shade + 0.3 * mottle - 0.4)
    return np.where(walls > 0, 40.0, np.clip(base, 60, 235)).astype(np.uint8)


def degrade(img, seed):
    """Declared degradation: mild blur + sensor-like noise (deterministic)."""
    rng = np.random.default_rng(seed)
    out = cv2.GaussianBlur(img, (3, 3), 0.8)
    noise = rng.normal(0, 4.0, out.shape)
    return np.clip(out.astype(np.float64) + noise, 0, 255).astype(np.uint8)


# ---- path-(a) drills: the intermediate raster under known homographies ----
# Three photograph-LIKE views of the synthesized base map. Each variant
# picks a different plan sub-rectangle and a different destination quad
# (varying perspective + scale).
DRILL_A_VARIANTS = [
    {
        "name": "drill-path-a1.png",
        "srcQuadPlanPx": [[0.25, 0.10], [0.95, 0.10], [0.95, 0.85], [0.25, 0.85]],
        "dstQuadPx": [[140, 160], [1860, 60], [1990, 1300], [60, 1240]],
        "seed": _splitmix32(1),
    },
    {
        "name": "drill-path-a2.png",
        "srcQuadPlanPx": [[0.10, 0.25], [0.90, 0.18], [0.92, 0.88], [0.05, 0.80]],
        "dstQuadPx": [[220, 300], [1880, 120], [1940, 1240], [90, 1120]],
        "seed": _splitmix32(2),
    },
    {
        "name": "drill-path-a3.png",
        "srcQuadPlanPx": [[0.18, 0.05], [0.98, 0.22], [0.80, 0.92], [0.08, 0.78]],
        "dstQuadPx": [[120, 220], [1900, 90], [1800, 1330], [40, 1180]],
        "seed": _splitmix32(3),
    },
]

# ---- path-(b) drills: true pinhole renders of the plan on the ground ------
# The camera model: K with the DECLARED defaults the adapter assumes
# (square pixels, principal point at the image center); f_cam differs per
# variant. Each pose keeps the horizon out of the dominant line mass and
# keeps both ground directions + verticals well supported.
DRILL_B_POSES = [
    {"name": "drill-path-b1.png", "f": 1300.0, "yawDeg": 20.0, "tiltDeg": 26.0,
     "camWorldM": [0.0, -9.0, 1.8], "seed": _splitmix32(11)},
    {"name": "drill-path-b2.png", "f": 1500.0, "yawDeg": -35.0, "tiltDeg": 32.0,
     "camWorldM": [7.0, -11.0, 2.2], "seed": _splitmix32(12)},
    {"name": "drill-path-b3.png", "f": 1150.0, "yawDeg": 55.0, "tiltDeg": 20.0,
     "camWorldM": [-8.0, -8.0, 1.6], "seed": _splitmix32(13)},
]

WD, HD = 2000, 1400  # every drill still is 2000x1400 (recorded honestly)


def build_drill_a(plan, inter):
    out = {}
    ph, pw = plan.shape
    for var in DRILL_A_VARIANTS:
        src = np.float32([[pw * fx, ph * fy] for fx, fy in var["srcQuadPlanPx"]])
        dst = np.float32(var["dstQuadPx"])
        H_known = cv2.getPerspectiveTransform(src, dst)
        drill = cv2.warpPerspective(inter, H_known, (WD, HD),
                                    flags=cv2.INTER_CUBIC,
                                    borderMode=cv2.BORDER_CONSTANT, borderValue=235)
        drill = degrade(drill, var["seed"])
        cv2.imwrite(str(FIXTURE / var["name"]), drill)
        out[var["name"]] = {
            "file": var["name"], "sizePx": [WD, HD],
            "derivation": ("wall-region-synthesis/1 intermediate raster of plan-raster.png, "
                           "warped by the recorded KNOWN homography (INTER_CUBIC, white border), "
                           "degraded (Gaussian blur sigma 0.8 + Gaussian noise sigma 4.0, fixed seed "
                           f"{var['seed']})"),
            "knownHomographyPlanToDrill": [[float(v) for v in row]
                                           for row in (H_known / H_known[2, 2])],
        }
    return out


def build_drill_b(plan):
    ph, pw = plan.shape
    ox, oy = pw / 2.0, ph / 2.0

    # the plan's own LSD segments, projected as exact 3D ground lines
    lsd = cv2.createLineSegmentDetector()
    plines, _, _, _ = lsd.detect(plan)
    psegs = plines.reshape(-1, 4).astype(np.float64)
    pL = np.hypot(psegs[:, 2] - psegs[:, 0], psegs[:, 3] - psegs[:, 1])
    psegs = psegs[pL >= 40]

    # vertical members: every ~2.2 m over the plan's ink-bearing extent
    rng_pts = []
    step_m = 2.2
    for gx in np.arange(-17.0, 17.0, step_m):
        for gy in np.arange(-12.0, 12.0, step_m):
            rng_pts.append((gx, gy))
    v_world = []
    for (gx, gy) in rng_pts:
        x_px = ox + gx * PX_PER_M
        y_px = (ph / 2.0) - gy * PX_PER_M
        if 0 <= int(y_px) < ph and 0 <= int(x_px) < pw:
            patch = plan[max(0, int(y_px) - 8):int(y_px) + 8,
                         max(0, int(x_px) - 8):int(x_px) + 8]
            if (patch < 150).any():
                v_world.append((gx, gy, 0.0))
                v_world.append((gx, gy, 1.6))
    v_world = np.array(v_world)

    def plan_px_to_world(x_px, y_px):
        # rasterToScene: origin at raster center, x east (col), y north
        # (row 0 = max northing => scene_y = (oy - row) / ppm)
        return np.stack([(x_px - ox) / PX_PER_M, (oy - y_px) / PX_PER_M,
                         np.zeros(len(x_px))], axis=1)

    out = {}
    for pose in DRILL_B_POSES:
        f_cam = pose["f"]
        K = np.array([[f_cam, 0, WD / 2.0], [0, f_cam, HD / 2.0], [0, 0, 1.0]])
        tilt = np.radians(pose["tiltDeg"])
        yaw = np.radians(pose["yawDeg"])
        # world axes: x east, y north, z up. Camera looks north-ish and down.
        # camera frame: x right, y DOWN (image convention), z forward.
        fwd = np.array([np.sin(yaw) * np.cos(tilt), np.cos(yaw) * np.cos(tilt), -np.sin(tilt)])
        right = np.array([np.cos(yaw), -np.sin(yaw), 0.0])
        down = np.cross(fwd, right)
        R = np.stack([right, down, fwd], axis=0)
        C = np.array(pose["camWorldM"])
        t = -R @ C
        P = K @ np.hstack([R, t.reshape(3, 1)])

        def project(world_pts):
            Ph = np.hstack([world_pts, np.ones((len(world_pts), 1))])
            img = (P @ Ph.T).T
            ok = np.abs(img[:, 2]) > 1e-9
            out_pts = np.full((len(world_pts), 2), np.nan)
            out_pts[ok, 0] = img[ok, 0] / img[ok, 2]
            out_pts[ok, 1] = img[ok, 1] / img[ok, 2]
            return out_pts

        drill = np.full((HD, WD), 245, np.uint8)
        for seg in psegs:
            w2 = np.stack([plan_px_to_world(np.array([seg[0], seg[2]]),
                                            np.array([seg[1], seg[3]]))])
            pts = project(w2[0])
            if np.isfinite(pts).all():
                a, b = pts[0], pts[1]
                cv2.line(drill, tuple(np.round(a).astype(int)),
                         tuple(np.round(b).astype(int)), 40, 1)
        v_img = project(v_world)
        for i in range(0, len(v_img), 2):
            a, b = v_img[i], v_img[i + 1]
            if np.isfinite(a).all() and np.isfinite(b).all():
                cv2.line(drill, tuple(a.astype(int)), tuple(b.astype(int)), 30, 2)
        drill = degrade(drill, pose["seed"])
        cv2.imwrite(str(FIXTURE / pose["name"]), drill)

        # the KNOWN plan->drill homography (ground plane z=0):
        M_plan_to_world = np.array([
            [1.0 / PX_PER_M, 0, -ox / PX_PER_M],
            [0, -1.0 / PX_PER_M, (ph / 2.0) / PX_PER_M],
            [0, 0, 1.0],
        ])  # plan px -> world (x, y, 0)  [row 0 = max northing => world y flips]
        H_ground = K @ np.hstack([R[:, :2], t.reshape(3, 1)])  # world ground -> image
        H_known_b = H_ground @ M_plan_to_world
        H_known_b = H_known_b / H_known_b[2, 2]
        out[pose["name"]] = {
            "file": pose["name"], "sizePx": [WD, HD],
            "derivation": (f"true pinhole render of the plan raster's LSD line-work on the "
                           f"ground plane z=0 plus vertical members to 1.6 m at ~2.2 m spacing "
                           f"where the plan carries ink; camera f={f_cam:.0f} px (square pixels, "
                           f"principal point at image center), yaw {pose['yawDeg']:+.0f} deg, "
                           f"tilt {pose['tiltDeg']:+.0f} deg down, position "
                           f"({C[0]:.0f}, {C[1]:.0f}, {C[2]:.1f}) m in the declared plan frame; "
                           "degraded (blur sigma 0.8 + noise sigma 4.0, fixed seed "
                           f"{pose['seed']}); the KNOWN plan->drill homography is the exact "
                           "ground-plane projection"),
            "knownHomographyPlanToDrill": [[float(v) for v in row] for row in H_known_b],
        }
    return out


def main() -> int:
    plan = cv2.imread(str(FIXTURE / "plan-raster.png"), cv2.IMREAD_GRAYSCALE)
    if plan is None:
        raise SystemExit("plan-raster.png missing")

    inter = derive_intermediate(plan)
    drills_a = build_drill_a(plan, inter)
    drills_b = build_drill_b(plan)

    record = {
        "declaredClass": ("DERIVED-DRILL (instrument-validation artifacts; never presented as "
                          "real; the photoset fidelity class stays REAL and is never upgraded "
                          "by these)"),
        "purpose": ("prove each lane's instrument recovers a KNOWN transform on clean inputs "
                    "before the lanes are measured against real photographs; the realized-error "
                    "instrument (tools/measure_drill_realized_error.py) scores the anchored "
                    "hypotheses against these known homographies at the ground-truth plan corners"),
        "drillsPathA": drills_a,
        "drillsPathB": drills_b,
        "digests": {},
    }
    for name in {**drills_a, **drills_b}:
        record["digests"][name] = hashlib.sha256((FIXTURE / name).read_bytes()).hexdigest()
    (FIXTURE / "drill-ground-truth.json").write_text(json.dumps(record, indent=2) + "\n")
    print(f"drill-path-a{{1,2,3}}.png {WD}x{HD}; drill-path-b{{1,2,3}}.png {WD}x{HD}")
    print("fixture/drill-ground-truth.json written")
    return 0


if __name__ == "__main__":
    sys.exit(main())
