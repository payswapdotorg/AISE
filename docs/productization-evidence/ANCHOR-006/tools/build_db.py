#!/usr/bin/env python3
"""ANCHOR-006 Stage A/0 — build the tile descriptor DB once, on disk (memmap)."""
import json, os, re, time
import cv2
import numpy as np

TILE_DIR = "/home/z/scratch-anchor006/tiles/z14"
SCAN = "/home/z/scratch-anchor006/scan"
TILE_MAX_FEATURES = 250
CLAHE = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))

def tile_key(fn):
    m = re.match(r"(\d+)_(\d+)\.jpg", fn)
    return (int(m.group(1)), int(m.group(2))) if m else None

t0 = time.time()
SIFT_T = cv2.SIFT_create(nfeatures=TILE_MAX_FEATURES, contrastThreshold=0.02, edgeThreshold=15)
files = [fn for fn in sorted(os.listdir(TILE_DIR)) if tile_key(fn)]
CAP = TILE_MAX_FEATURES + 8
N = len(files) * CAP
DB = np.lib.format.open_memmap(f"{SCAN}/db.f32.npy", mode="w+", dtype=np.float32, shape=(N, 128))
KPS = np.lib.format.open_memmap(f"{SCAN}/kp.f32.npy", mode="w+", dtype=np.float32, shape=(N, 2))
TIDX = np.lib.format.open_memmap(f"{SCAN}/tidx.i32.npy", mode="w+", dtype=np.int32, shape=(N,))
tiles = {}
n_tiles = total = 0
for i, fn in enumerate(files):
    key = tile_key(fn)
    img = cv2.imread(os.path.join(TILE_DIR, fn), cv2.IMREAD_GRAYSCALE)
    if img is None:
        continue
    kp, des = SIFT_T.detectAndCompute(CLAHE.apply(img), None)
    if des is None or len(kp) == 0:
        continue
    tiles[n_tiles] = {"y": key[0], "x": key[1], "file": fn}
    n = min(len(kp), CAP)
    DB[total:total+n] = des[:n]
    KPS[total:total+n] = np.float32([k.pt for k in kp[:n]])
    TIDX[total:total+n] = n_tiles
    total += n
    n_tiles += 1
    if (i + 1) % 2000 == 0:
        print(f"db {i+1}/{len(files)} tiles={n_tiles} {time.time()-t0:.0f}s", flush=True)
DB.flush(); KPS.flush(); TIDX.flush()
json.dump({"tiles": tiles, "total": total, "nTiles": n_tiles,
           "tileMaxFeatures": TILE_MAX_FEATURES, "cap": CAP},
          open(f"{SCAN}/db-meta.json", "w"))
print(f"DB built: {n_tiles} tiles, {total} descriptors, {time.time()-t0:.0f}s")
