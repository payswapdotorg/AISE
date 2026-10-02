#!/usr/bin/env python3
"""ANCHOR-006 — Stage A: the z14 tile-scan (coarse localization by descriptor vote).

Memory-bounded build: per-tile SIFT capped at TILE_MAX_FEATURES (top-quality
keypoints), the whole belt DB fits resident; photos matched at multiple
downsample scales in bounded row chunks (semantics identical to BFMatcher
crossCheck=True). Top tiles per photo -> per-tile RANSAC (tile->photo) ->
Stage-A candidates (>= STAGE_A_MIN_INLIERS).

Everything recorded to scan/stage-a.json.
"""
import json
import os
import re
import time

import cv2
import numpy as np

TILE_DIR = "/home/z/scratch-anchor006/tiles/z14"
STILLS = {
    "p01-workman-pivot": "/home/z/candidates/workman_pivot.jpg",
    "p02-kelley-9364": "/home/z/candidates/nrcs_kelley_9364.jpg",
    "p03-famartin-dundy-a": "/home/z/candidates/famartin_dundy.jpg",
    "p04-famartin-dundy-b": "/home/z/candidates/famartin_dundy2.jpg",
    "p05-famartin-hitchcock": "/home/z/candidates/famartin_hitchcock.jpg",
    "p06-kgs-finney": "/home/z/candidates/kgs_finney_aerial.jpg",
}
OUT = "/home/z/scratch-anchor006/scan/stage-a.json"

TILE_MAX_FEATURES = 250
PHOTO_MAX_FEATURES = 8000
CLAHE = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
SCALES = [1.0, 0.5, 0.25]
TOP_TILES = 8
STAGE_A_MIN_INLIERS = 6
RANSAC_PX = 4.0
CH = 2000

def tile_key(fn):
    m = re.match(r"(\d+)_(\d+)\.jpg", fn)
    return (int(m.group(1)), int(m.group(2))) if m else None

def main():
    t0 = time.time()
    SIFT_T = cv2.SIFT_create(nfeatures=TILE_MAX_FEATURES, contrastThreshold=0.02, edgeThreshold=15)
    SIFT_P = cv2.SIFT_create(nfeatures=PHOTO_MAX_FEATURES, contrastThreshold=0.02, edgeThreshold=15)
    tiles = {}
    files = [fn for fn in sorted(os.listdir(TILE_DIR)) if tile_key(fn)]
    CAP = TILE_MAX_FEATURES
    BIG = np.empty((len(files) * CAP, 128), dtype=np.float32)
    BIG_KP = np.empty((len(files) * CAP, 2), dtype=np.float32)
    BIG_TILE = np.empty(len(files) * CAP, dtype=np.int32)
    n_tiles = 0
    total = 0
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
        BIG[total:total+n] = des[:n]
        BIG_KP[total:total+n] = np.float32([k.pt for k in kp[:n]])
        BIG_TILE[total:total+n] = n_tiles
        total += n
        n_tiles += 1
        if (i + 1) % 2000 == 0:
            print(f"db {i+1}/{len(files)} tiles={n_tiles} {time.time()-t0:.0f}s", flush=True)
    DB = BIG[:total]
    DB_KP = BIG_KP[:total]
    DB_TILE = BIG_TILE[:total]
    db_desc = int(DB.shape[0])
    print(f"tile db: {n_tiles} tiles, {db_desc} descriptors ({db_desc*512//1024//1024} MB), {time.time()-t0:.0f}s", flush=True)

    import gc, ctypes
    libc = ctypes.CDLL("libc.so.6")
    def trim():
        gc.collect()
        libc.malloc_trim(0)
    report = {"tileDb": {"tiles": n_tiles, "descriptors": db_desc,
                         "tileMaxFeatures": TILE_MAX_FEATURES}, "stills": {}}
    for sid, path in STILLS.items():
        img = cv2.imread(path, cv2.IMREAD_GRAYSCALE)
        if img is None:
            report["stills"][sid] = {"error": "unreadable"}
            continue
        best = None
        scale_reports = []
        for s in SCALES:
            sim = cv2.resize(img, None, fx=s, fy=s, interpolation=cv2.INTER_AREA) if s != 1.0 else img
            kp, des = SIFT_P.detectAndCompute(CLAHE.apply(sim), None)
            if des is None or len(kp) < 20:
                scale_reports.append({"scale": s, "keypoints": 0 if des is None else len(kp)})
                continue
            Q = des.astype(np.float32)
            n_q = Q.shape[0]
            best_db_for_q = np.full(n_q, -1, dtype=np.int64)
            best_d_for_q = np.full(n_q, np.inf, dtype=np.float32)
            qa = (Q * Q).sum(axis=1)
            for st in range(0, db_desc, CH):
                sp = min(st + CH, db_desc)
                block = np.ascontiguousarray(DB[st:sp])
                tb = (block * block).sum(axis=1)[None, :]
                dots = Q @ block.T
                d2 = qa[:, None] + tb - 2.0 * dots
                idx = np.argmin(d2, axis=1)
                val = d2[np.arange(n_q), idx]
                upd = val < best_d_for_q
                best_db_for_q[upd] = idx[upd] + st
                best_d_for_q[upd] = val[upd]
                del block, tb, dots, d2
            cand = np.unique(best_db_for_q[best_db_for_q >= 0])
            votes = {}
            pairs = []
            if cand.size:
                DBc = DB[cand]
                best_q_for_cand = np.full(cand.size, -1, dtype=np.int64)
                ca = (DBc * DBc).sum(axis=1)
                CH2 = 2000
                for st in range(0, cand.size, CH2):
                    sp = min(st + CH2, cand.size)
                    block = np.ascontiguousarray(DBc[st:sp])
                    ta = ca[st:sp][:, None]
                    dots = block @ Q.T
                    d2 = ta + qa[None, :] - 2.0 * dots
                    best_q_for_cand[st:sp] = np.argmin(d2, axis=1)
                    del block, ta, dots, d2
                cand_pos = {int(t): i for i, t in enumerate(cand)}
                for i in range(n_q):
                    t = int(best_db_for_q[i])
                    if t >= 0 and best_q_for_cand[cand_pos[t]] == i:
                        tile = int(DB_TILE[t])
                        votes[tile] = votes.get(tile, 0) + 1
                        pairs.append((i, t, tile))
                del DBc
            scale_reports.append({"scale": s, "keypoints": n_q,
                                  "mutualPairs": len(pairs),
                                  "topVotes": sorted(votes.values(), reverse=True)[:10]})
            trim()
            if votes and (best is None or max(votes.values()) > best[0]):
                best = (max(votes.values()), s, votes, pairs, kp)
        if best is None or best[0] <= 0:
            report["stills"][sid] = {"outcome": "no-votes", "scales": scale_reports}
            print(f"{sid}: NO VOTES ({time.time()-t0:.0f}s)", flush=True)
            continue
        _, s, votes, pairs, kp = best
        top = sorted(votes.items(), key=lambda kv: -kv[1])[:TOP_TILES]
        cands = []
        for tile, nvotes in top:
            tpairs = [(q, t) for (q, t, tl) in pairs if tl == tile][:400]
            if len(tpairs) < STAGE_A_MIN_INLIERS:
                cands.append({"tile": tiles[tile], "votes": nvotes, "ransacInliers": 0,
                              "note": f"only {len(tpairs)} pairs (< {STAGE_A_MIN_INLIERS})"})
                continue
            src = DB_KP[[t for (_, t) in tpairs]]
            dst = np.float32([kp[q].pt for (q, _) in tpairs])
            H, mask = cv2.findHomography(src, dst, cv2.RANSAC, RANSAC_PX, maxIters=5000, confidence=0.999)
            inl = 0 if mask is None else int(mask.sum())
            cands.append({"tile": tiles[tile], "votes": nvotes, "pairs": len(tpairs), "ransacInliers": inl})
        report["stills"][sid] = {
            "outcome": "stage-a-candidates" if any(c["ransacInliers"] >= STAGE_A_MIN_INLIERS for c in cands) else "no-ransac-survivor",
            "bestScale": s, "scales": scale_reports, "topTiles": cands,
        }
        ok = [c for c in cands if c.get("ransacInliers", 0) >= STAGE_A_MIN_INLIERS]
        print(f"{sid}: scale={s} bestVotes={top[0][1] if top else 0} "
              f"candidates={[(c['tile']['y'], c['tile']['x'], c['ransacInliers']) for c in ok]} ({time.time()-t0:.0f}s)", flush=True)
        report["stills"][sid]["topTiles"] = cands
        trim()
    report["elapsedS"] = round(time.time() - t0, 1)
    json.dump(report, open(OUT, "w"), indent=1)
    print("stage A done", report["elapsedS"], "s")

if __name__ == "__main__":
    main()
