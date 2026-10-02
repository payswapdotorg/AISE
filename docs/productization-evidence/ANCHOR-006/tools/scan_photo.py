#!/usr/bin/env python3
"""ANCHOR-006 Stage A — scan ONE still against the memmapped tile DB."""
import json, sys, time
import cv2
import numpy as np

SCAN = "/home/z/scratch-anchor006/scan"
sid, path = sys.argv[1], sys.argv[2]
meta = json.load(open(f"{SCAN}/db-meta.json"))
tiles = {int(k): v for k, v in meta["tiles"].items()}
total = meta["total"]
DB_full = np.load(f"{SCAN}/db.f32.npy", mmap_mode="r")
KPS_full = np.load(f"{SCAN}/kp.f32.npy", mmap_mode="r")
TIDX_full = np.load(f"{SCAN}/tidx.i32.npy", mmap_mode="r")
DB = DB_full[:total]        # memmap views: file-backed, shared, reclaimable
KPS = KPS_full[:total]
TIDX = TIDX_full[:total]
CLAHE = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
SIFT_P = cv2.SIFT_create(nfeatures=8000, contrastThreshold=0.02, edgeThreshold=15)
SCALES = [1.0, 0.5, 0.25]
TOP_TILES, MIN_INLIERS, RANSAC_PX, CH = 8, 6, 4.0, 2000

t0 = time.time()
img = cv2.imread(path, cv2.IMREAD_GRAYSCALE)
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
    for st in range(0, total, CH):
        sp = min(st + CH, total)
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
    votes, pairs = {}, []
    if cand.size:
        DBc = np.ascontiguousarray(DB[cand])
        best_q_for_cand = np.full(cand.size, -1, dtype=np.int64)
        ca = (DBc * DBc).sum(axis=1)
        for st in range(0, cand.size, CH):
            sp = min(st + CH, cand.size)
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
                tile = int(TIDX[t])
                votes[tile] = votes.get(tile, 0) + 1
                pairs.append((i, t, tile))
        del DBc
    scale_reports.append({"scale": s, "keypoints": n_q, "mutualPairs": len(pairs),
                          "topVotes": sorted(votes.values(), reverse=True)[:10]})
    if votes and (best is None or max(votes.values()) > best[0]):
        best = (max(votes.values()), s, votes, pairs, kp)
    print(f"  {sid} scale={s} kp={n_q} pairs={len(pairs)} bestVote={max(votes.values()) if votes else 0} {time.time()-t0:.0f}s", flush=True)

if best is None or best[0] <= 0:
    out = {"sid": sid, "outcome": "no-votes", "scales": scale_reports}
else:
    _, s, votes, pairs, kp = best
    top = sorted(votes.items(), key=lambda kv: -kv[1])[:TOP_TILES]
    cands = []
    for tile, nvotes in top:
        tpairs = [(q, t) for (q, t, tl) in pairs if tl == tile][:400]
        if len(tpairs) < MIN_INLIERS:
            cands.append({"tile": tiles[tile], "votes": nvotes, "ransacInliers": 0,
                          "note": f"only {len(tpairs)} pairs (< {MIN_INLIERS})"})
            continue
        src = np.ascontiguousarray(KPS[[t for (_, t) in tpairs]])
        dst = np.float32([kp[q].pt for (q, _) in tpairs])
        H, mask = cv2.findHomography(src, dst, cv2.RANSAC, RANSAC_PX, maxIters=5000, confidence=0.999)
        inl = 0 if mask is None else int(mask.sum())
        cands.append({"tile": tiles[tile], "votes": nvotes, "pairs": len(tpairs), "ransacInliers": inl})
    ok = any(c["ransacInliers"] >= MIN_INLIERS for c in cands)
    out = {"sid": sid, "outcome": "stage-a-candidates" if ok else "no-ransac-survivor",
           "bestScale": s, "scales": scale_reports, "topTiles": cands}
json.dump(out, open(f"{SCAN}/per-photo/{sid}.json", "w"), indent=1)
print(f"{sid}: {out['outcome']} ({time.time()-t0:.0f}s)", flush=True)
