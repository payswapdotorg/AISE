#!/usr/bin/env python3
"""
ANCHOR-001 — deterministic synthetic anchoring fixture renderer.

Renders ONE synthetic construction-floor scene into:

  1. a PLAN RASTER (orthographic top-down image of the floor — the
     "plan/floor context" the spike anchors against), and
  2. six CAPTURE STILLS (perspective views of the same floor, a
     walk-the-floor capture), plus
  3. the exact ground-truth homography plan-px -> still-px per still.

Because the plan raster and every still are rendered from the SAME
procedural texture, the ground truth is exact by construction: a
perspective image of a plane is EXACTLY a homography of the orthographic
view of that plane. The fixture is therefore fully deterministic and
byte-reproducible (integer-hash texture, fixed noise seeds, no clock, no
network, no external assets).

Negative-variant fixtures are rendered by the same scene model:
  --variant textureless : flat-gray floor stills (no texture at all)
  --variant other-plan  : a plan raster of a DIFFERENT room (different
                          tile-hash seed and different marker layout)

Scene continuity: the floor footprint is the GBIM-000 canonical room
footprint (8 m x 6 m) — the repo's shared-fixture discipline.

Determinism law: same script + same flags -> byte-identical PNGs and
byte-identical ground-truth.json (verified by the spike harness).

Run:
  /home/z/anchor001-venv/bin/python docs/productization-evidence/ANCHOR-001/fixture/render_fixture.py
"""

import argparse
import json
import math
import sys
from pathlib import Path

import cv2
import numpy as np

# ----------------------------------------------------------------------
# Scene model (AISE-owned, provider-neutral, SI units)
# ----------------------------------------------------------------------

FLOOR_LENGTH_M = 8.0  # x extent (GBIM-000 room footprint)
FLOOR_WIDTH_M = 6.0  # y extent
PLAN_PIXELS_PER_METER = 200.0  # plan raster scale (narrow plan<->still scale gap)
STILL_W_PX, STILL_H_PX = 800, 600
FX_PX = FY_PX = 600.0  # synthetic pinhole intrinsics
CX_PX, CY_PX = STILL_W_PX / 2.0, STILL_H_PX / 2.0

# The ten capture-still cameras: (x, y, height, yaw_deg, tilt_deg) walking a
# loop over the floor at ~1.3 m spacing (a realistic walk-capture cadence —
# dense enough that CONSECUTIVE stills share floor, which the anchoring
# method's cross-validation leg requires). tilt is measured from VERTICAL
# (0 = straight down; 28-38 = the down-looking walk posture); yaw is the
# horizontal walk heading (the camera is tilted towards it).
CAMERAS = [
    (1.8, 1.2, 1.50, 25.0, 32.0),
    (3.0, 1.5, 1.45, 25.0, 34.0),
    (4.2, 1.8, 1.52, 30.0, 30.0),
    (5.4, 2.4, 1.48, 60.0, 32.0),
    (6.2, 3.4, 1.50, 100.0, 36.0),
    (5.0, 4.2, 1.46, 160.0, 32.0),
    (3.8, 4.6, 1.52, 200.0, 34.0),
    (2.6, 4.4, 1.48, 225.0, 30.0),
    (1.8, 3.4, 1.50, 270.0, 32.0),
    (3.0, 3.0, 1.47, 315.0, 30.0),
]

# High-contrast marker tiles with PER-MARKER UNIQUE checker patterns (the
# fixed-equipment / distinct-floor-patch analog that gives 2D feature
# matching plan<->still shared, DISCRIMINATIVE keypoints — a repetitive
# tile grid alone is exactly the repeated-texture ambiguity the negative
# ledger documents). Each marker: (center_x, center_y, cells_per_side).
MARKER_TILES = [
    (1.6, 1.4, 3),
    (4.0, 1.6, 4),
    (6.4, 1.2, 5),
    (2.2, 3.0, 4),
    (6.0, 3.4, 3),
    (1.4, 4.8, 5),
    (3.8, 4.6, 3),
    (6.6, 5.2, 4),
]
MARKER_SIZE_M = 0.7

# Column footprint (echoes the GBIM-000 column): dark pad with bright border.
COLUMN_CENTER_M = (5.0, 3.0)
COLUMN_SIZE_M = 0.30

# Door threshold strip along the south edge.
THRESHOLD = {"x0": 2.0, "x1": 3.0, "y0": 0.0, "y1": 0.12}

# Deterministic per-still photometric variation (gain, offset).
PHOTOMETRIC = [
    (1.00, 0.0),
    (0.90, 8.0),
    (1.10, -8.0),
    (0.95, 5.0),
    (1.05, -5.0),
    (1.00, 0.0),
    (0.92, 6.0),
    (1.08, -6.0),
    (0.97, 3.0),
    (1.03, -3.0),
]


def splitmix32(x: int) -> int:
    """Deterministic integer hash (public-domain SplitMix32)."""
    x = (x + 0x9E3779B9) & 0xFFFFFFFF
    x ^= x >> 16
    x = (x * 0x85EBCA6B) & 0xFFFFFFFF
    x ^= x >> 13
    x = (x * 0xC2B2AE35) & 0xFFFFFFFF
    x ^= x >> 16
    return x & 0xFFFFFFFF


# ----------------------------------------------------------------------
# The procedural floor texture — THE shared appearance of plan + stills
# ----------------------------------------------------------------------


def floor_texture(x: np.ndarray, y: np.ndarray, seed_offset: int = 0) -> np.ndarray:
    """Vectorized floor appearance, grayscale 0..255, fully deterministic.

    Layers: 0.5 m tile grid with per-tile deterministic shades, tile joints,
    2.0 m expansion joints, 4 checker marker tiles, column footprint pad,
    door threshold strip, coarse 1.0 m mottle.
    """
    i = np.floor(x / 0.5).astype(np.int64)
    j = np.floor(y / 0.5).astype(np.int64)
    hashv = np.array(
        [splitmix32((int(a) + seed_offset) * 73856093 ^ int(b) * 19349663) for a, b in zip(i.ravel(), j.ravel())]
    ).reshape(x.shape)
    shade = 85.0 + (hashv % 91).astype(np.float64)

    # Coarse mottle (1.0 m cells, hash-blended).
    mi = np.floor(x / 1.0).astype(np.int64)
    mj = np.floor(y / 1.0).astype(np.int64)
    mh = np.array(
        [splitmix32((int(a) + seed_offset) * 668265263 ^ int(b) * 374761393) for a, b in zip(mi.ravel(), mj.ravel())]
    ).reshape(x.shape)
    shade = shade + ((mh % 21).astype(np.float64) - 10.0)

    out = shade

    # Tile joints (thin).
    tx = np.minimum(x % 0.5, 0.5 - x % 0.5) < 0.010
    ty = np.minimum(y % 0.5, 0.5 - y % 0.5) < 0.010
    out = np.where(tx | ty, np.minimum(out, 72.0), out)

    # Expansion joints every 2.0 m (darker, wider).
    ex = np.minimum(x % 2.0, 2.0 - x % 2.0) < 0.025
    ey = np.minimum(y % 2.0, 2.0 - y % 2.0) < 0.025
    out = np.where(ex | ey, np.minimum(out, 44.0), out)

    # Marker tiles: per-marker UNIQUE checker patterns (cell count varies
    # per marker; phase varies via the hash) — discriminative keypoints.
    for (mx, my, cells) in MARKER_TILES:
        half = MARKER_SIZE_M / 2.0
        in_tile = (x >= mx - half) & (x < mx + half) & (y >= my - half) & (y < my + half)
        cell = MARKER_SIZE_M / cells
        phase = splitmix32((int(mx * 10) + seed_offset) * 2654435761 ^ int(my * 10) * 40503) % 2
        cx_i = np.floor((x - (mx - half)) / cell).astype(np.int64)
        cy_i = np.floor((y - (my - half)) / cell).astype(np.int64)
        checker = ((cx_i + cy_i + phase) % 2 == 0)
        val = np.where(checker, 238.0, 22.0)
        out = np.where(in_tile, val, out)

    # Column footprint: dark pad with bright border ring.
    col_x0 = COLUMN_CENTER_M[0] - COLUMN_SIZE_M / 2.0
    col_x1 = COLUMN_CENTER_M[0] + COLUMN_SIZE_M / 2.0
    col_y0 = COLUMN_CENTER_M[1] - COLUMN_SIZE_M / 2.0
    col_y1 = COLUMN_CENTER_M[1] + COLUMN_SIZE_M / 2.0
    in_col = (x >= col_x0) & (x <= col_x1) & (y >= col_y0) & (y <= col_y1)
    in_ring = (
        (x >= col_x0 - 0.04) & (x <= col_x1 + 0.04) & (y >= col_y0 - 0.04) & (y <= col_y1 + 0.04) & ~in_col
    )
    out = np.where(in_col, 30.0, out)
    out = np.where(in_ring, 220.0, out)

    # Door threshold strip.
    in_thr = (x >= THRESHOLD["x0"]) & (x <= THRESHOLD["x1"]) & (y >= THRESHOLD["y0"]) & (y <= THRESHOLD["y1"])
    out = np.where(in_thr, 190.0, out)

    return np.clip(out, 0.0, 255.0)


def flat_texture(x: np.ndarray, y: np.ndarray, seed_offset: int = 0) -> np.ndarray:
    """The textureless variant: uniform painted-gray floor (the negative)."""
    return np.full(x.shape, 128.0)


# ----------------------------------------------------------------------
# Rendering
# ----------------------------------------------------------------------


def rot_x(a: float) -> np.ndarray:
    c, s = math.cos(a), math.sin(a)
    return np.array([[1.0, 0.0, 0.0], [0.0, c, -s], [0.0, s, c]])


def rot_z(a: float) -> np.ndarray:
    c, s = math.cos(a), math.sin(a)
    return np.array([[c, -s, 0.0], [s, c, 0.0], [0.0, 0.0, 1.0]])


def camera_rotation(yaw_deg: float, tilt_deg: float) -> np.ndarray:
    """Camera-to-world rotation.

    Base: a real right-handed camera grip looking straight down with the
    TOP of the image towards world +y (image right = +x, image down =
    -y, forward = -z). Any right-handed downward camera is either this
    grip or its 180-degree twin — and BOTH are mirrored relative to a
    naive "screen-convention" plan raster (x right, y down-the-rows).
    The plan raster is therefore rendered NORTH-UP (row 0 = max y, like
    real maps/orthophotos) so plan and still share one handedness; the
    plan<->camera raster convention is a DECLARED field of the port
    contract (rasterToScene), not an implicit assumption.
    Tilt pitches the view towards the yaw heading; yaw rotates about z.
    Columns are the camera axes (x right, y down, z forward) in world.
    """
    base = np.array([[1.0, 0.0, 0.0], [0.0, -1.0, 0.0], [0.0, 0.0, -1.0]])
    r = rot_z(math.radians(yaw_deg)) @ rot_x(math.radians(tilt_deg)) @ base
    return r


def render_plan(texture, pixels_per_meter: float = PLAN_PIXELS_PER_METER) -> np.ndarray:
    """Orthographic top-down raster of the floor, NORTH-UP.

    Row 0 = max y (world +y points UP the image); column 0 = x = 0. This
    is the map/orthophoto convention that shares handedness with a real
    downward-looking right-handed camera (see camera_rotation).
    """
    w = int(round(FLOOR_LENGTH_M * pixels_per_meter))
    h = int(round(FLOOR_WIDTH_M * pixels_per_meter))
    us = np.arange(w, dtype=np.float64)
    vs = np.arange(h, dtype=np.float64)
    uu, vv = np.meshgrid(us, vs)  # column px (x), row px (top-down)
    x = uu / pixels_per_meter
    y = (FLOOR_WIDTH_M - vv / pixels_per_meter)  # north-up: row 0 = y_max
    img = texture(x, y)
    return np.clip(np.round(img), 0, 255).astype(np.uint8)


def render_still(
    texture,
    cam: tuple,
    photometric: tuple,
    noise_seed: int,
) -> tuple:
    """Inverse-mapped perspective render of the floor plane + exact H.

    Returns (image_uint8, H_planpx_to_pixel_normalized).
    """
    cx_pos, cy_pos, height, yaw_deg, tilt_deg = cam
    c_world = np.array([cx_pos, cy_pos, height])
    r_c2w = camera_rotation(yaw_deg, tilt_deg)

    us = np.arange(STILL_W_PX, dtype=np.float64)
    vs = np.arange(STILL_H_PX, dtype=np.float64)
    uu, vv = np.meshgrid(us, vs)
    # Camera-frame ray directions (K^-1 [u v 1]).
    dx = (uu - CX_PX) / FX_PX
    dy = (vv - CY_PX) / FY_PX
    dz = np.ones_like(dx)
    dirs_cam = np.stack([dx, dy, dz], axis=-1)  # (H, W, 3)
    # World-frame directions.
    dirs_world = dirs_cam @ r_c2w.T  # row-vector rotation

    denom = dirs_world[..., 2]
    with np.errstate(divide="ignore", invalid="ignore"):
        t = np.where(np.abs(denom) > 1e-12, -c_world[2] / denom, np.nan)
    px = c_world[0] + t * dirs_world[..., 0]
    py = c_world[1] + t * dirs_world[..., 1]
    on_plane = np.isfinite(t) & (t > 0)
    in_floor = on_plane & (px >= 0.0) & (px <= FLOOR_LENGTH_M) & (py >= 0.0) & (py <= FLOOR_WIDTH_M)

    # Floor texture where visible; construction-site dark backdrop elsewhere.
    xs = np.where(in_floor, px, 0.0)
    ys = np.where(in_floor, py, 0.0)
    tex = texture(xs, ys)
    background = 58.0
    img = np.where(in_floor, tex, background)

    # Photometric variation + deterministic sensor noise + vignette.
    gain, offset = photometric
    img = img * gain + offset
    rr = ((uu - CX_PX) / CX_PX) ** 2 + ((vv - CY_PX) / CY_PX) ** 2
    img = img * (1.0 - 0.18 * rr)
    rng = np.random.default_rng(noise_seed)
    img = img + rng.normal(0.0, 2.0, size=img.shape)
    img_u8 = np.clip(np.round(img), 0, 255).astype(np.uint8)

    # Exact homography plan-px -> pixel for the NORTH-UP plan raster:
    #   plan px (u, v) -> world (u/s, (h_px - 1 - v)/s, 0)   [row 0 = y_max]
    #   H = K [r1 r2 t] M   with M the plan-px -> homogeneous-meter map.
    r_w2c = r_c2w.T
    r1 = r_w2c[:, 0]
    r2 = r_w2c[:, 1]
    tvec = -r_w2c @ c_world
    k_mat = np.array([[FX_PX, 0.0, CX_PX], [0.0, FY_PX, CY_PX], [0.0, 0.0, 1.0]])
    h_m = k_mat @ np.stack([r1, r2, tvec], axis=1)
    s = PLAN_PIXELS_PER_METER
    plan_h_px = FLOOR_WIDTH_M * s
    m_plan = np.array(
        [
            [1.0 / s, 0.0, 0.0],
            [0.0, -1.0 / s, (plan_h_px - 1.0) / s],
            [0.0, 0.0, 1.0],
        ]
    )
    h_px = h_m @ m_plan
    h_px = h_px / h_px[2, 2]

    return img_u8, h_px


def main() -> int:
    global MARKER_TILES
    parser = argparse.ArgumentParser(description="ANCHOR-001 fixture renderer")
    parser.add_argument(
        "--variant",
        choices=["primary", "textureless", "other-plan"],
        default="primary",
        help="primary = plan + 6 stills + ground truth; textureless = 2 flat stills; other-plan = a different room's plan",
    )
    parser.add_argument(
        "--out-dir",
        default=None,
        help="output directory (default: the results tree next to this script)",
    )
    args = parser.parse_args()

    here = Path(__file__).resolve().parent
    results = Path(args.out_dir) if args.out_dir else here.parent / "results"
    fixture_dir = results / "fixture"
    negatives_dir = results / "negatives"
    fixture_dir.mkdir(parents=True, exist_ok=True)
    negatives_dir.mkdir(parents=True, exist_ok=True)

    if args.variant == "primary":
        plan = render_plan(floor_texture)
        plan_path = fixture_dir / "plan-raster.png"
        cv2.imwrite(str(plan_path), plan)

        ground_truth = {
            "fixtureId": "anchor001-fixture-001",
            "description": "synthetic 8m x 6m walk-the-floor capture over a shared procedural texture",
            "scene": {
                "floorLengthM": FLOOR_LENGTH_M,
                "floorWidthM": FLOOR_WIDTH_M,
                "pixelsPerMeter": PLAN_PIXELS_PER_METER,
                "markersM": [[m[0], m[1], m[2]] for m in MARKER_TILES],
                "columnCenterM": list(COLUMN_CENTER_M),
                "columnSizeM": COLUMN_SIZE_M,
            },
            "stills": [],
        }
        for idx, cam in enumerate(CAMERAS, start=1):
            img, h_px = render_still(
                floor_texture,
                cam,
                PHOTOMETRIC[idx - 1],
                noise_seed=20260929 + idx,
            )
            still_path = fixture_dir / f"still-{idx:03d}.png"
            cv2.imwrite(str(still_path), img)
            ground_truth["stills"].append(
                {
                    "stillId": f"still-{idx:03d}",
                    "camera": {
                        "positionM": [cam[0], cam[1]],
                        "heightM": cam[2],
                        "yawDeg": cam[3],
                        "tiltFromVerticalDeg": cam[4],
                    },
                    "intrinsics": {
                        "fxPx": FX_PX,
                        "fyPx": FY_PX,
                        "cxPx": CX_PX,
                        "cyPx": CY_PX,
                        "widthPx": STILL_W_PX,
                        "heightPx": STILL_H_PX,
                    },
                    "hPlanPxToPixel": [[float(v) for v in row] for row in h_px],
                }
            )
        gt_path = fixture_dir / "ground-truth.json"
        gt_path.write_text(json.dumps(ground_truth, indent=2, sort_keys=True) + "\n")
        print(f"fixture: wrote {plan_path.name}, {len(CAMERAS)} stills, ground-truth.json -> {fixture_dir}")

    elif args.variant == "textureless":
        # Two flat-gray stills at primary poses 1 and 2 (passes the >=2 still
        # gate; must fail at the feature gate).
        for idx, cam in enumerate([CAMERAS[0], CAMERAS[1]], start=1):
            img, _ = render_still(
                flat_texture,
                cam,
                PHOTOMETRIC[idx - 1],
                noise_seed=20260929 + 100 + idx,
            )
            path = negatives_dir / f"still-flat-{idx:03d}.png"
            cv2.imwrite(str(path), img)
        print(f"fixture: wrote 2 textureless stills -> {negatives_dir}")

    elif args.variant == "other-plan":
        # A plan raster of a DIFFERENT room: tile-hash seed offset + shifted
        # marker layout (same floor dimensions — a plausible wrong drawing).
        markers_backup = MARKER_TILES
        MARKER_TILES = [
            (1.5, 1.5, 4),
            (6.5, 2.5, 3),
            (3.5, 4.5, 5),
            (6.5, 5.5, 4),
        ]
        try:
            plan = render_plan(lambda x, y: floor_texture(x, y, seed_offset=777))
        finally:
            MARKER_TILES = markers_backup
        path = negatives_dir / "plan-other.png"
        cv2.imwrite(str(path), plan)
        print(f"fixture: wrote other-room plan -> {path}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
