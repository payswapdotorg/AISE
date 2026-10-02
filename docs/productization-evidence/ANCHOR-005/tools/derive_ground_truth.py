#!/usr/bin/env python3
"""
ANCHOR-005 — the co-registered ground-truth derivation instrument.

THIS IS THE WORK ITEM'S CENTRAL INSTRUMENT: the ANCHOR-003b deferment ledger
named "derivability of realized registration error" as the gap between "real
photos exist" and "real anchors exist". This tool derives the co-registered
ground truth for the capture lane from the federal documentation itself, so
that every anchoring outcome (and every refusal) becomes VERIFIABLE.

THE DERIVATION CHAIN (all measured, all replayable, nothing assumed):

  A. The plan raster's documented geometry (re-detected from the committed
     bytes on every run — the same detectors the assembler used):
       - the four documented elevation levels (TOP OF CORNICE EL. 13'-6",
         CEILING EL. 11'-9", MAIN FLOOR EL. 2'-4", LOWER TERRACE EL. 0'-0")
         as drawn lines => the drawing's pixels-per-meter (the manifest's
         least-squares derivation);
       - the mullion grid of the south facade (the drawn vertical lines in
         the glass band), with the ventilator-sash close pairs and the
         corner double-line;
       - the west/east faces of the main volume (the cornice span's ends).

  B. Per-still annotated correspondences, from the committed ANNOTATION SPEC
     (tools/annotation-spec.json): the worker identified the correspondences
     (which photo structure is which documented feature — the pattern-match
     of the distinctive sash sequence, cross-checked with VLM-assisted
     region identification on tight coordinate-grid crops); the tool
     MEASURES every position classically (sub-pixel gradient peaks in the
     identified windows) and fits H_true (drawing px -> still px) by DLT
     over the two-level point set with leave-one-out residuals (the
     annotation's own uncertainty, measured). Still whose pattern is not
     recoverable carry their measured NOT-DERIVABLE reasons in the spec.

  C. The refused-consensus diagnostic (declared DERIVED-DIAGNOSTIC — never
     an anchor, never counted in the real photoset): for every still, the
     reference lane's OWN code path (the anchor003b adapter's detector,
     matcher, RANSAC and photometric gate parameters — mirrored verbatim)
     is executed instrumented so the WOULD-BE consensus geometry is
     recordable (the production adapter refuses and returns ZERO
     hypotheses, so the would-be geometry is only observable here), and:
       - where the ground truth is derivable: the consensus's REALIZED
         ERROR against H_true at every annotated documented feature, in
         meters at plan scale — the measurement that VERIFIES the
         refusal (a plausible-but-wrong consensus must be measurably
         wrong against the documented geometry);
       - everywhere: the consensus's implied facade footprint (where it
         maps the documented main volume) — the annotation-free
         plausibility check (a junk consensus maps the documented
         envelope to a degenerate or off-frame quad).

Honesty laws: no fabricated measurements — every recorded position is a
detector output over committed bytes; the annotation spec's identifications
are data with the identification reasoning recorded; the ground truth is
fixed and committed BEFORE the diagnostic runs (the adapter returns zero
hypotheses on this photoset — no contamination path exists).

Run (from the repo root):
  python3 docs/productization-evidence/ANCHOR-005/tools/derive_ground_truth.py
"""

import json
import os
import sys

import cv2
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
TREE = os.path.dirname(HERE)
PHOTOSET = os.path.join(TREE, "photoset")
RESULTS = os.path.join(TREE, "results")

# The reference lane's declared configuration (the anchor003b adapter's
# DEFAULT_CONFIG — mirrored so the diagnostic is its faithful twin).
LANE_CONFIG = {
    "detector": "SIFT",
    "siftContrastThreshold": 0.02,
    "siftEdgeThreshold": 15,
    "siftNfeaturesCap": 40000,
    "matcher": "chunked-mutual-nearest-L2",
    "matcherChunkRows": 512,
    "maxMatchesPerPair": 500,
    "ransacThresholdPx": 4.0,
    "ransacMaxIters": 20000,
    "ransacConfidence": 0.9999,
    "minAnchoredNcc": 0.25,
    "nccFootprintMinPixels": 2000,
}
FIXED_RNG_SEED = 20260930


def load_manifest():
    with open(os.path.join(TREE, "provenance-manifest.json")) as fh:
        return json.load(fh)


def load_spec():
    with open(os.path.join(HERE, "annotation-spec.json")) as fh:
        return json.load(fh)


# ---------------------------------------------------------------------
# A. the plan raster's documented geometry (re-detected for replayability)
# ---------------------------------------------------------------------

def detect_drawing_geometry(plan):
    """The drawing's level lines and mullion grid, measured off the
    committed plan raster (the same detectors the assembler used, expressed
    at the committed raster's scale: SCALE = width / 3560 — the original
    pre-padding crop width)."""
    SCALE = plan.shape[1] / 3560.0

    def long_lines(y0, y1, min_run=900, thresh=130):
        hits = {}
        for y in range(y0, y1):
            seg = plan[y] < thresh
            best, run = 0, 0
            for v in seg:
                run = run + 1 if v else 0
                best = max(best, run)
            if best >= min_run:
                hits[y] = best
        clusters = []
        for y in sorted(hits):
            if clusters and y - clusters[-1][-1] <= 2:
                clusters[-1].append(y)
            else:
                clusters.append([y])
        return [c[len(c) // 2] for c in clusters]

    upper = long_lines(int(350 * SCALE), int(500 * SCALE), int(800 * SCALE))
    cornice_top = upper[0]
    best_run = (0, 0, 0)
    for y in upper:
        row = plan[y] < 130
        run, start = 0, 0
        for i, v in enumerate(row):
            if v:
                if run == 0:
                    start = i
                run += 1
                if run > best_run[0]:
                    best_run = (run, start, i + 1)
            else:
                run = 0
    house_x0, house_x1 = best_run[1], best_run[2]

    def level_rows(b0, b1, min_total=int(700 * SCALE)):
        hits = {}
        for y in range(b0, b1):
            if int((plan[y, house_x0:house_x1] < 130).sum()) >= min_total:
                hits[y] = True
        clusters = []
        for y in sorted(hits):
            if clusters and y - clusters[-1][-1] <= 2:
                clusters[-1].append(y)
            else:
                clusters.append([y])
        return [c[len(c) // 2] for c in clusters]

    ceiling = level_rows(int(430 * SCALE), int(480 * SCALE))[0]
    main_floor = level_rows(int(660 * SCALE), int(740 * SCALE))[0]
    lower_terrace = level_rows(int(740 * SCALE), int(800 * SCALE))[0]

    band = plan[ceiling + 14:main_floor - 10, house_x0:house_x1]
    dark = (band < 180).astype(np.uint8)
    colsum = dark.sum(axis=0)
    cols = colsum > (band.shape[0] * 0.40)
    clusters = []
    for i, v in enumerate(cols):
        if v:
            if clusters and i - clusters[-1][-1] <= 2:
                clusters[-1].append(i)
            else:
                clusters.append([i])
    mullions = []
    for c in clusters:
        w = np.array([colsum[i] for i in c])
        mullions.append(float(np.average(c, weights=w)) + house_x0)

    # the close pairs (ventilator sashes) and the corner double-line, at the
    # committed scale (the pre-padding render's gaps 15..26 and <=8 px,
    # multiplied by SCALE)
    pair_lo, pair_hi = 15 * SCALE, 26 * SCALE
    corner_gap = max(3.0, 8 * SCALE)
    pairs, corner = [], None
    i = 0
    while i < len(mullions) - 1:
        gap = mullions[i + 1] - mullions[i]
        if gap <= corner_gap:
            corner = (mullions[i], mullions[i + 1])
            i += 2
        elif pair_lo <= gap <= pair_hi:
            pairs.append((mullions[i], mullions[i + 1]))
            i += 2
        else:
            i += 1
    # at downsampled scales the corner double-line may merge into ONE
    # cluster: the cluster nearest the east face is then the corner, its
    # span edges standing in for the two lines (declared: sub-pixel at this
    # scale)
    if corner is None and clusters:
        last = clusters[-1]
        last_x = float(np.average(last, weights=[colsum[i] for i in last])) + house_x0
        if abs(last_x - house_x1) < 20 * SCALE:
            corner = (house_x0 + last[0], house_x0 + last[-1] + 1)

    return {
        "cornice": int(cornice_top),
        "ceiling": int(ceiling),
        "mainFloor": int(main_floor),
        "lowerTerrace": int(lower_terrace),
        "westFace": int(house_x0),
        "eastFace": int(house_x1),
        "mullions": [round(m, 1) for m in mullions],
        "ventPairs": [[round(a, 1), round(b, 1)] for a, b in pairs],
        "cornerPair": [round(corner[0], 1), round(corner[1], 1)] if corner else None,
    }


# ---------------------------------------------------------------------
# B. the spec-driven measurement + DLT fit
# ---------------------------------------------------------------------

def subpixel_peak(profile, idx):
    if 0 < idx < len(profile) - 1:
        a, b, c = profile[idx - 1], profile[idx], profile[idx + 1]
        d = a - 2 * b + c
        if abs(d) > 1e-9:
            return idx + 0.5 * (a - c) / d
    return float(idx)


def measure_edge(gy, x, window, half=14, shape=None):
    """The strongest horizontal edge in the y-window at column x (mean over
    a +-half window), sub-pixel refined."""
    h, w = shape
    x0, x1 = max(0, int(x) - half), min(w, int(x) + half)
    y0, y1 = window
    prof = gy[y0:y1, x0:x1].mean(axis=1)
    idx = int(np.argmax(prof))
    return subpixel_peak(prof, idx) + y0, float(prof[idx])


def measure_mullion(gx, x_hint, half=12, shape=None):
    """The strongest vertical edge within +-half of x_hint, sub-pixel."""
    h, w = shape
    x0, x1 = max(0, int(x_hint) - half), min(w, int(x_hint) + half)
    prof = gx[:, x0:x1].mean(axis=0)
    idx = int(np.argmax(prof))
    return subpixel_peak(prof, idx) + x0, float(prof[idx])


def dlt(src, dst):
    A = []
    for (x, y), (u, v) in zip(src, dst):
        A.append([-x, -y, -1, 0, 0, 0, u * x, u * y, u])
        A.append([0, 0, 0, -x, -y, -1, v * x, v * y, v])
    _, _, Vt = np.linalg.svd(np.array(A))
    H = Vt[-1].reshape(3, 3)
    return H / H[2, 2]


def annotate_from_spec(img, spec_entry, geom):
    """Measure the spec's identified correspondences and fit H_true."""
    h, w = img.shape
    gx = np.abs(cv2.Sobel(img, cv2.CV_32F, 1, 0, ksize=3))
    gy = np.abs(cv2.Sobel(img, cv2.CV_32F, 0, 1, ksize=3))

    def resolve_feature(name):
        if name.startswith("ventPair"):
            idx = int(name[len("ventPair")])
            side = 0 if name.endswith("a") else 1
            return float(geom["ventPairs"][idx - 1][side])
        if name == "cornerA":
            return float(geom["cornerPair"][0])
        if name == "cornerB":
            return float(geom["cornerPair"][1])
        raise KeyError(f"unknown drawing feature: {name}")

    floor_w = spec_entry["floorWindow"]
    ceil_w = spec_entry["ceilingWindow"]
    corrs = []
    for m in spec_entry["mullions"]:
        mx, ms = measure_mullion(gx, m["photoX"], 12, (h, w))
        rec = {"drawFeature": m["drawFeature"], "drawX": round(resolve_feature(m["drawFeature"]), 2),
               "photoX": round(float(mx), 2), "mullionStrength": round(float(ms), 1)}
        if m["floor"] == "measure":
            fy, fs = measure_edge(gy, mx, floor_w, 14, (h, w))
            rec["photoFloorY"] = round(float(fy), 2)
            rec["floorStrength"] = round(float(fs), 1)
        if m["ceiling"] == "measure":
            cw = m.get("ceilingWindow", ceil_w)
            cy, cs = measure_edge(gy, mx, cw, 14, (h, w))
            rec["photoCeilingY"] = round(float(cy), 2)
            rec["ceilingStrength"] = round(float(cs), 1)
        corrs.append(rec)

    pts_d, pts_p = [], []
    for c in corrs:
        if "photoFloorY" in c:
            pts_d.append([c["drawX"], float(geom["mainFloor"])])
            pts_p.append([c["photoX"], c["photoFloorY"]])
        if "photoCeilingY" in c:
            pts_d.append([c["drawX"], float(geom["ceiling"])])
            pts_p.append([c["photoX"], c["photoCeilingY"]])
    pts_d = np.array(pts_d, dtype=np.float64)
    pts_p = np.array(pts_p, dtype=np.float64)
    if len(pts_d) < 8:
        return {"derivable": False,
                "reason": f"only {len(pts_d)} measurable correspondences (need >= 8 for a redundant two-level DLT)",
                "correspondences": corrs}

    H_true = dlt(pts_d, pts_p)
    proj = cv2.perspectiveTransform(pts_d.reshape(-1, 1, 2), H_true).reshape(-1, 2)
    resid = np.linalg.norm(proj - pts_p, axis=1)
    loo = []
    for i in range(len(pts_d)):
        keep = np.ones(len(pts_d), bool)
        keep[i] = False
        Hi = dlt(pts_d[keep], pts_p[keep])
        pi = cv2.perspectiveTransform(pts_d[i].reshape(1, 1, 2), Hi).reshape(-1, 2)[0]
        loo.append(float(np.linalg.norm(pi - pts_p[i])))

    # the vertical/horizontal scale decomposition (the vantage check):
    # local horizontal scale from consecutive sash spacing; vertical scale
    # from the fitted level lines at each sash.
    scales = []
    cs = [c for c in corrs if "photoFloorY" in c and "photoCeilingY" in c]
    for a, b in zip(cs, cs[1:]):
        dh = b["drawX"] - a["drawX"]
        ph = b["photoX"] - a["photoX"]
        if dh > 100:  # inter-sash spans only
            dv = abs(a["photoFloorY"] - a["photoCeilingY"])
            pv = float(geom["mainFloor"] - geom["ceiling"])
            if dh > 0 and ph > 0:
                scales.append({
                    "spanDrawPx": round(dh, 1), "spanPhotoPx": round(ph, 1),
                    "horizontalPxPerDrawPx": round(ph / dh, 4),
                    "verticalPxPerDrawPx": round(dv / pv, 4),
                    "impliedYawDeg": round(float(np.degrees(np.arccos(min(1.0, (ph / dh) / (dv / pv))))), 1),
                })
    return {
        "derivable": True,
        "correspondences": corrs,
        "hTrue": [[float(v) for v in row] for row in H_true],
        "fitResidualPx": {
            "nPoints": int(len(pts_d)),
            "rms": round(float(np.sqrt((resid ** 2).mean())), 3),
            "max": round(float(resid.max()), 3),
            "leaveOneOutRms": round(float(np.sqrt(np.mean(np.square(loo)))), 3),
            "leaveOneOutMax": round(float(max(loo)), 3),
        },
        "vantageScaleDecomposition": scales,
    }


# ---------------------------------------------------------------------
# C. the refused-consensus diagnostic (the declared diagnostic twin)
# ---------------------------------------------------------------------

def mutual_nearest_chunked(des_q, des_t, chunk_rows, top_k):
    """The anchor003b adapter's matcher, verbatim in semantics."""
    n_q = des_q.shape[0]
    best_t = np.full(n_q, -1, dtype=np.int64)
    best_d = np.full(n_q, np.inf, dtype=np.float32)
    qa_all = (des_q * des_q).sum(axis=1)
    des_q_t = np.ascontiguousarray(des_q.T)
    for s in range(0, n_q, chunk_rows):
        e = min(s + chunk_rows, n_q)
        block = des_q[s:e]
        qa = qa_all[s:e][:, None]
        tb = (des_t * des_t).sum(axis=1)[None, :]
        d2 = qa + tb - 2.0 * (block @ des_t.T)
        idx = np.argmin(d2, axis=1)
        best_t[s:e] = idx
        best_d[s:e] = d2[np.arange(e - s), idx]
    cand = np.unique(best_t[best_t >= 0])
    if cand.size == 0:
        return np.empty(0, dtype=np.int64), np.empty(0, dtype=np.int64)
    des_t_c = np.ascontiguousarray(des_t[cand])
    best_q = np.full(cand.size, -1, dtype=np.int64)
    for s in range(0, cand.size, chunk_rows):
        e = min(s + chunk_rows, cand.size)
        block = des_t_c[s:e]
        ta = (block * block).sum(axis=1)[:, None]
        qb = qa_all[None, :]
        d2 = ta + qb - 2.0 * (block @ des_q_t)
        best_q[s:e] = np.argmin(d2, axis=1)
    cpos = {int(t): i for i, t in enumerate(cand)}
    mutual = np.array([i for i in range(n_q)
                       if best_t[i] >= 0 and best_q[cpos[int(best_t[i])]] == i], dtype=np.int64)
    if mutual.size == 0:
        return np.empty(0, dtype=np.int64), np.empty(0, dtype=np.int64)
    md = best_d[mutual]
    order = np.argsort(md, kind="stable")[:top_k]
    return mutual[order], best_t[mutual][order]


def ncc_over_mask(a, b, mask):
    av = a[mask].astype(np.float64)
    bv = b[mask].astype(np.float64)
    av -= av.mean()
    bv -= bv.mean()
    den = np.sqrt((av * av).sum() * (bv * bv).sum())
    return float((av * bv).sum() / den) if den > 0 else 0.0


def consensus_diagnostic(img, plan_eq, des_plan, kp_plan, clahe, sift, still_id):
    """The reference lane's own code path, instrumented so the WOULD-BE
    consensus geometry is recordable. Declared DERIVED-DIAGNOSTIC. The RNG is
    re-seeded before each still so the diagnostic is deterministic per still
    regardless of execution context (the production adapter seeds once per
    process at its own start - its own runs are deterministic per request)."""
    cv2.setRNGSeed(FIXED_RNG_SEED)
    img_eq = clahe.apply(img)
    kp, des = sift.detectAndCompute(img_eq, None)
    rec = {"stillId": still_id,
           "keypoints": 0 if des is None else len(kp)}
    if des is None or len(kp) < 12:
        rec["note"] = "feature-poor below the matching floor"
        return rec
    mq, mt = mutual_nearest_chunked(des, des_plan,
                                    int(LANE_CONFIG["matcherChunkRows"]),
                                    int(LANE_CONFIG["maxMatchesPerPair"]))
    rec["matches"] = int(len(mq))
    if len(mq) < 12:
        rec["note"] = "mutual matches below the estimate floor"
        return rec
    src = np.float32([kp_plan[i].pt for i in mt])
    dst = np.float32([kp[i].pt for i in mq])
    h_est, mask = cv2.findHomography(src, dst, cv2.RANSAC,
                                     float(LANE_CONFIG["ransacThresholdPx"]),
                                     maxIters=int(LANE_CONFIG["ransacMaxIters"]),
                                     confidence=float(LANE_CONFIG["ransacConfidence"]))
    inliers = int(mask.sum()) if mask is not None else 0
    rec["inliers"] = inliers
    if h_est is None or inliers < 4:
        rec["note"] = "no recordable consensus (fewer than 4 inliers - not even a degenerate homography)"
        return rec
    if inliers < 8:
        rec["note"] = ("consensus recorded by the diagnostic at " + str(inliers) + " inliers - BELOW the production "
                       "inlier floor (8): the adapter's declared gate would refuse this still here already")
    h_inv = np.linalg.inv(h_est)
    ph, pw = plan_eq.shape
    warped = cv2.warpPerspective(img_eq, h_inv, (pw, ph))
    foot = np.zeros(plan_eq.shape, np.uint8)
    ih, iw = img_eq.shape
    corners = np.float32([[0, 0], [iw, 0], [iw, ih], [0, ih]]).reshape(-1, 1, 2)
    quad = cv2.perspectiveTransform(corners, h_inv.astype(np.float32))
    cv2.fillPoly(foot, [quad.astype(np.int32)], 255)
    inter = foot.astype(bool)
    ncc = 0.0
    if int(inter.sum()) >= int(LANE_CONFIG["nccFootprintMinPixels"]):
        ncc = ncc_over_mask(warped, plan_eq, inter)
    rec["consensus"] = {
        "matrix": [[float(v) for v in row] for row in (h_est / h_est[2, 2])],
        "inliers": inliers,
        "footprintNcc": round(float(ncc), 4),
        "gateVerdict": "would-refuse" if ncc < float(LANE_CONFIG["minAnchoredNcc"]) else "would-pass",
    }
    return rec


def main():
    os.makedirs(RESULTS, exist_ok=True)
    manifest = load_manifest()
    spec = load_spec()
    ppm = manifest["planRaster"]["rasterToScene"]["pixelsPerMeter"]

    plan_path = os.path.join(PHOTOSET, manifest["planRaster"]["file"])
    plan = cv2.imread(plan_path, cv2.IMREAD_GRAYSCALE)
    if plan is None:
        print("plan raster unreadable", file=sys.stderr)
        return 2

    # ---- A. the drawing geometry -----------------------------------------
    geom = detect_drawing_geometry(plan)
    print("drawing geometry:", {k: geom[k] for k in ("cornice", "ceiling", "mainFloor", "lowerTerrace", "westFace", "eastFace")})
    print("  vent pairs:", geom["ventPairs"], " corner:", geom["cornerPair"])

    # ---- B. the spec-driven annotation ------------------------------------
    annotations = []
    for entry in spec["stillAnnotations"]:
        sid = entry["stillId"]
        if entry["status"] != "annotated":
            annotations.append({"still": sid, "derivable": False, "reason": entry["reason"]})
            print(f"{sid}: NOT-DERIVABLE — {entry['reason'][:90]}…")
            continue
        img = cv2.imread(os.path.join(PHOTOSET, f"{sid}.jpg"), cv2.IMREAD_GRAYSCALE)
        rep = annotate_from_spec(img, entry, geom)
        rep["still"] = sid
        rep["identification"] = entry["identification"]
        if rep["derivable"]:
            fr = rep["fitResidualPx"]
            print(f"{sid}: DERIVABLE — {fr['nPoints']} pts, DLT rms {fr['rms']} px (max {fr['max']}), LOO rms {fr['leaveOneOutRms']} px")
            for s in rep.get("vantageScaleDecomposition", []):
                print(f"    span {s['spanDrawPx']} draw-px: h-scale {s['horizontalPxPerDrawPx']}, v-scale {s['verticalPxPerDrawPx']}, implied yaw {s['impliedYawDeg']} deg")
        else:
            print(f"{sid}: NOT-DERIVABLE — {rep['reason']}")
        annotations.append(rep)

    with open(os.path.join(RESULTS, "ground-truth.json"), "w") as fh:
        json.dump({
            "instrument": "anchor005-ground-truth/1",
            "derivationChain": "the documented elevation levels (the drawing's own annotations, EL. 13'-6\"/11'-9\"/2'-4\"/0'-0\") "
                               "+ the mullion grid (drawn lines) => drawing px/m (the manifest's least-squares derivation, "
                               "cross-checked against the graphic scale bar and the declared 1:48 scale); per-still: the committed "
                               "annotation spec's worker-identified correspondences (the ventilator-sash sequence pattern match), "
                               "positions measured classically (sub-pixel gradient peaks), H_true fitted by two-level DLT with "
                               "leave-one-out residuals",
            "pixelsPerMeter": ppm,
            "documentedLevels": {"corniceFtIn": "13'-6\"", "ceilingFtIn": "11'-9\"", "mainFloorFtIn": "2'-4\"", "lowerTerraceFtIn": "0'-0\""},
            "drawingGeometry": geom,
            "annotations": annotations,
        }, fh, indent=1)
        fh.write("\n")
    print(f"\nannotations written: {sum(1 for a in annotations if a.get('derivable'))}/{len(annotations)} derivable")

    # ---- C. the refused-consensus diagnostic ------------------------------
    cv2.setRNGSeed(FIXED_RNG_SEED)
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    sift = cv2.SIFT_create(nfeatures=int(LANE_CONFIG["siftNfeaturesCap"]),
                           contrastThreshold=float(LANE_CONFIG["siftContrastThreshold"]),
                           edgeThreshold=float(LANE_CONFIG["siftEdgeThreshold"]))
    plan_eq = clahe.apply(plan)
    kp_plan, des_plan = sift.detectAndCompute(plan_eq, None)
    print(f"\nplan keypoints: {len(kp_plan)}")

    gt_by_still = {a["still"]: a for a in annotations}
    diagnostics = []
    for rec_m in manifest["stills"]:
        sid = rec_m["stillId"]
        img = cv2.imread(os.path.join(PHOTOSET, rec_m["file"]), cv2.IMREAD_GRAYSCALE)
        diag = consensus_diagnostic(img, plan_eq, des_plan, kp_plan, clahe, sift, sid)
        gt = gt_by_still.get(sid, {})
        if diag.get("consensus"):
            H_est = np.array(diag["consensus"]["matrix"], dtype=np.float64)
            # the annotation-free plausibility check: where does the consensus
            # map the documented main volume?
            corners_d = np.float32([[geom["westFace"], geom["mainFloor"]],
                                    [geom["eastFace"], geom["mainFloor"]],
                                    [geom["eastFace"], geom["cornice"]],
                                    [geom["westFace"], geom["cornice"]]]).reshape(-1, 1, 2)
            pe_c = cv2.perspectiveTransform(corners_d, H_est).reshape(-1, 2)
            diag["consensus"]["documentedVolumeFootprint"] = {
                "corners": [[round(float(x), 1), round(float(y), 1)] for x, y in pe_c],
                "quadAreaPx": round(float(cv2.contourArea(pe_c.astype(np.float32))), 1),
                "allInsideFrame": bool(np.all(pe_c[:, 0] >= 0) and np.all(pe_c[:, 0] < img.shape[1])
                                       and np.all(pe_c[:, 1] >= 0) and np.all(pe_c[:, 1] < img.shape[0])),
            }
            if gt.get("derivable"):
                H_true = np.array(gt["hTrue"], dtype=np.float64)
                pts_d, pts_p = [], []
                for c in gt["correspondences"]:
                    if "photoFloorY" in c:
                        pts_d.append([c["drawX"], float(geom["mainFloor"])])
                        pts_p.append([c["photoX"], c["photoFloorY"]])
                    if "photoCeilingY" in c:
                        pts_d.append([c["drawX"], float(geom["ceiling"])])
                        pts_p.append([c["photoX"], c["photoCeilingY"]])
                pts_d = np.array(pts_d, dtype=np.float64)
                pts_p = np.array(pts_p, dtype=np.float64)
                pe = cv2.perspectiveTransform(pts_d.reshape(-1, 1, 2), H_est).reshape(-1, 2)
                hti = np.linalg.inv(H_true)
                a = cv2.perspectiveTransform(pts_p.reshape(-1, 1, 2), hti).reshape(-1, 2)
                b = cv2.perspectiveTransform(pe.reshape(-1, 1, 2), hti).reshape(-1, 2)
                errs_m = np.linalg.norm(a - b, axis=1) / ppm
                diag["realizedErrorVsGroundTruth"] = {
                    "method": "at each annotated documented feature: the would-be consensus position vs the ground-truth "
                              "measured position, both mapped back to drawing px via H_true^-1; error in meters at plan scale",
                    "nFeatures": int(len(errs_m)),
                    "meanM": round(float(errs_m.mean()), 4),
                    "rmseM": round(float(np.sqrt((errs_m ** 2).mean())), 4),
                    "p95M": round(float(np.percentile(errs_m, 95)), 4),
                    "maxM": round(float(errs_m.max()), 4),
                }
            else:
                diag["realizedErrorVsGroundTruth"] = {
                    "status": "NOT-DERIVABLE for this still",
                    "reason": gt.get("reason"),
                }
        diagnostics.append(diag)
        c = diag.get("consensus")
        line = f"{sid}: kp={diag['keypoints']} matches={diag.get('matches', 0)} inliers={diag.get('inliers', 0)}"
        if c:
            line += f" ncc={c['footprintNcc']} ({c['gateVerdict']})"
            if "realizedErrorVsGroundTruth" in diag and "rmseM" in diag["realizedErrorVsGroundTruth"]:
                r = diag["realizedErrorVsGroundTruth"]
                line += f" | realized-vs-truth rmse={r['rmseM']} m (max {r['maxM']} m over {r['nFeatures']} documented features)"
        print(line)

    with open(os.path.join(RESULTS, "refused-consensus-diagnostic.json"), "w") as fh:
        json.dump({
            "instrument": "anchor005-refused-consensus-diagnostic/1",
            "declaration": "DERIVED-DIAGNOSTIC — the reference lane's own detector/matcher/RANSAC/photometric-gate path "
                           "(the anchor003b adapter's DEFAULT_CONFIG, mirrored verbatim) executed instrumented so the "
                           "WOULD-BE consensus geometry is recordable; the production adapter refuses this photoset and "
                           "returns zero hypotheses, so the would-be geometry is only observable through this declared "
                           "diagnostic; NEVER an anchor, never counted in the real photoset",
            "laneConfig": LANE_CONFIG,
            "diagnostics": diagnostics,
        }, fh, indent=1)
        fh.write("\n")
    print("\ndiagnostic written")
    return 0


if __name__ == "__main__":
    sys.exit(main())
