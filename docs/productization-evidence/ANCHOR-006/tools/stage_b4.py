#!/usr/bin/env python3
"""ANCHOR-006 — Stage B pass 3: the CORRECTED native-scale re-measurement.

WHY THIS EXISTS (the two measured grid defects, both preserved):

  PASS 1 (stage_b2.py): boxes seeded +0.7..+1.0 deg NORTH of the cameras —
  78-111 km BEHIND southward-looking cameras. Wrong ground; preserved as
  scan/stage-b2-firstpass.out + results/geolocation/stage-b-pass1.json.

  PASS 2 (stage_b3.py): the azimuth-corrected box generator divided the
  KILOMETER-valued D/cross offsets by 111320 (METERS per degree) — every
  box in the D{4,8,16}km x cross{-4,0,+4}km grid was centered within ~20 m
  of the camera. The D-ladder was completely neutralized: pass 2 measured
  only span/GSD/photoScale variation AROUND THE CAMERA (its 16 km boxes
  reached at most 8 km along the view). Its single "pin" (p03) was
  additionally degenerate and is RETRACTED by tools/pin_audit.py (a 126-px
  sliver warp passing the floorless NCC rule). The pass-2 record is
  preserved as scan/stage-b.json (with the retraction + this bug recorded
  in its method block).

THIS PASS measures what was never actually measured:
  - boxes truly centered D km along the DECLARED camera heading, with
    cross-track offsets in km — the unit bug FIXED (D*1000 m);
  - a FINER plan ladder at the adapter's native operating point
    (photoScale 1.0 ONLY — the adapter consumes stills at native
    resolution): (12 km, 4 m/px), (7.5, 2.5), (6, 2), (4.5, 1.5), (3, 1) —
    NAIP is 0.6 m/px native here, so the 1-2 m/px rungs match the oblique
    stills' near/mid-field at native scale for the first time;
  - the matcher cap mirrors the adapter (top-500 mutual matches; pass 2
    used 800) — declared;
  - the CORRECTED PIN RULE (declared by tools/pin_audit.py BEFORE this
    run): inliers >= 8 AND footprint NCC >= 0.30 AND footprint >= 25,000
    plan-px AND sliver ratio (quad area / quad bbox area) >= 0.2 AND local
    warp scale at the principal point within [0.05, 20.0] plan-px/still-px
    on both axes. The pin is the principal point through the verified
    homography, never the seed. ALL attempts recorded; NO early break —
    every box in the declared grid is measured even after a pin.

SCOPE (declared): p03 + p04 (the harness group candidates, cameras 31 km
apart), p05 (the near-group probe; both candidate azimuths — the Commons
title says 'southward', the geohack type:camera record says 94.50 deg
east; both are measured), p07 (the corrected cross-vintage azimuth sweep
at reduced scope). p06's county grid was ABSOLUTE (unaffected by the unit
bug) and is not re-run; p02 has no position metadata (Stage-A blind scan
stands).

Run (resumable; journal at scan/stage-b4-journal.json):
  python3 docs/productization-evidence/ANCHOR-006/tools/stage_b4.py

EXECUTION MODEL (the 4 GB pod; declared): a single in-process run of the
verify at photoScale 1.0 transiently peaks at 2.1-2.6 GB RSS inside OpenCV's
SIFT (the DoG pyramid + the pre-cap keypoint flood at contrastThreshold 0.02
on a 3840x1864 still and a 3000x3000 plan) against ~1.0 GB of resident
platform services — right at the OOM edge, and two OOM deaths proved it
(dmesg 05:35 UTC; the 07:40 relaunch). THIS tool therefore runs each verify
in a FRESH SUBPROCESS (this file invoked with --verify-one), which changes
nothing about the measurement — every parameter, the RNG seed, and the
arithmetic are identical — but bounds the blast radius: an OOM-killed child
loses only its own attempt. A child that fails 3 times is recorded in the
journal as an error record (measured-unverifiable-on-this-pod), never
skipped silently and never fabricated. The parent process stays small
(~150 MB: JSON + plan exports only). The journal makes every restart cheap
(journaled attempts replay instantly).
"""
import json, math, os, subprocess, sys, time, urllib.request, urllib.parse
import numpy as np
# cv2 is imported INSIDE verify() (the child path): the parent process of the
# per-attempt subprocess model stays small (numpy only), while the child —
# which does the SIFT — transiently peaks at 2.1-2.6 GB RSS (see the
# execution-model note in the module docstring).

OUT = "/home/z/scratch-anchor006/scan/stage-b4.json"
JOURNAL = "/home/z/scratch-anchor006/scan/stage-b4-journal.json"
PLAN_DIR = "/home/z/scratch-anchor006/plans"
os.makedirs(PLAN_DIR, exist_ok=True)
EARTH = 20037508.342789244
UA = {"User-Agent": "AISE-ANCHOR-006-evidence/1.0 (NAIP export; public domain)"}

PIN_MIN_INLIERS = 8
PIN_MIN_NCC = 0.30
PIN_MIN_FOOTPRINT_PX = 25_000     # the corrected plausibility floor (pin_audit.py)
PIN_MIN_SLIVER = 0.2              # quad area / quad bbox area
PIN_SCALE_BOUNDS = (0.05, 20.0)   # local plan-px per still-px, both axes
MAX_PLAN_PX = 3000
MATCH_TOP_K = 500                  # mirrors the adapter's maxMatchesPerPair
PHOTO_SCALE = 1.0                  # the adapter's operating point ONLY

M_PER_DEG = 111320.0

STILLS = {
  "p03-famartin-dundy-a": {
    "path": "/home/z/candidates/famartin_dundy.jpg",
    "camera": [40.357204, -101.817504], "heading": 188.97,
    "grid": "D{4,8,16}km x cross{0,+4}km along DECLARED heading 188.97 (southward)",
  },
  "p04-famartin-dundy-b": {
    "path": "/home/z/candidates/famartin_dundy2.jpg",
    "camera": [40.384872, -101.411194], "heading": 189.16,
    "grid": "D{4,8,16}km x cross{0,+4}km along DECLARED heading 189.16 (southward)",
  },
  "p05-famartin-hitchcock": {
    "path": "/home/z/candidates/famartin_hitchcock.jpg",
    "camera": [40.427981, -101.109358],
    "grid": ("BOTH candidate azimuths (title 'southward' 180.0 / geohack 94.50 east) "
             "x D{8,16}km x rungs {(12,4),(6,2)} — the azimuth conflict is measured, not guessed"),
  },
  "p07-deverre-winter": {
    "path": "/home/z/candidates/deverre_4.jpg",
    "camera": [41.948257, -99.120712],
    "grid": ("corrected cross-vintage azimuth sweep {N,E,S,W} x D{8,16}km x rungs {(12,4),(6,2)} "
             "(pass 2's sweep was neutralized by the unit bug — all its boxes sat at the camera)"),
  },
}

LADDER_FULL = [(12.0, 4.0), (7.5, 2.5), (6.0, 2.0), (4.5, 1.5), (3.0, 1.0)]
LADDER_REDUCED = [(12.0, 4.0), (6.0, 2.0)]


def boxes_along_heading(cam, heading_deg, Ds, crosses):
    clat, clon = cam
    az = math.radians(heading_deg)
    out = []
    for D in Ds:
        for cross in crosses:
            Dm = D * 1000.0          # km -> m (THE FIX)
            crossm = cross * 1000.0  # km -> m (THE FIX)
            dlat = (Dm * math.cos(az) - crossm * math.sin(az)) / M_PER_DEG
            dlon = (Dm * math.sin(az) + crossm * math.cos(az)) / (M_PER_DEG * math.cos(math.radians(clat)))
            out.append(((round(clat + dlat, 6), round(clon + dlon, 6)), D, cross))
    return out


def boxes_sweep(cam, azimuths, Ds):
    clat, clon = cam
    out = []
    for hd, nm in azimuths:
        for D in Ds:
            az = math.radians(hd)
            Dm = D * 1000.0
            dlat = (Dm * math.cos(az)) / M_PER_DEG
            dlon = (Dm * math.sin(az)) / (M_PER_DEG * math.cos(math.radians(clat)))
            out.append(((round(clat + dlat, 6), round(clon + dlon, 6)), D, nm))
    return out


def grid_for(sid):
    m = STILLS[sid]
    if sid.startswith("p05"):
        c1 = boxes_along_heading(m["camera"], 180.0, (8.0, 16.0), (0.0,))
        c2 = boxes_along_heading(m["camera"], 94.50, (8.0, 16.0), (0.0,))
        # THE AZIMUTH-TAG COLLISION FIX (defect found mid-campaign, recorded
        # in method.azimuthFix): both sweeps carried cross 0.0, so the c2
        # boxes produced journal keys IDENTICAL to c1's — the east-azimuth
        # attempts silently replayed the southward records and the declared
        # both-azimuths scope was NOT met by the first execution of this
        # grid. The fix carries an azimuth-distinguishing marker in the tag's
        # cross slot; the 4 east-azimuth boxes are now measured under their
        # own keys. The 4 southward records stand (they measured their own
        # ground); nothing was re-measured or discarded.
        c2 = [(c, D, "E94.5") for (c, D, _) in c2]
        return c1 + c2, LADDER_REDUCED
    if sid.startswith("p07"):
        return boxes_sweep(m["camera"], ((0.0, "N"), (90.0, "E"), (180.0, "S"), (270.0, "W")), (8.0, 16.0)), LADDER_REDUCED
    return boxes_along_heading(m["camera"], m["heading"], (4.0, 8.0, 16.0), (0.0, 4.0)), LADDER_FULL


def lonlat_to_merc(lon, lat):
    return lon * EARTH / 180.0, math.log(math.tan((90.0 + lat) * math.pi / 360.0)) * EARTH / math.pi


def merc_to_lonlat(x, y):
    return x / EARTH * 180.0, math.degrees(2.0 * math.atan(math.exp(y * math.pi / EARTH)) - math.pi / 2.0)


def naip_export(bbox_m, w, h, out_path):
    url = ("https://imagery.nationalmap.gov/arcgis/rest/services/USGSNAIPImagery/ImageServer/exportImage"
           f"?bbox={bbox_m[0]},{bbox_m[1]},{bbox_m[2]},{bbox_m[3]}&bboxSR=3857&imageSR=3857"
           f"&size={w},{h}&format=jpg&interpolation=RSP_BilinearInterpolation&f=image")
    if os.path.exists(out_path) and os.path.getsize(out_path) > 500:
        return url, os.path.getsize(out_path)
    for attempt in range(4):
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=180) as r:
                data = r.read()
            if len(data) < 500:
                raise RuntimeError(f"suspiciously small export ({len(data)} B)")
            open(out_path, "wb").write(data)
            return url, len(data)
        except Exception:
            if attempt == 3:
                raise
            time.sleep(4 + attempt * 4)


def naip_catalog(lon, lat):
    x, y = lonlat_to_merc(lon, lat)
    q = {"geometry": json.dumps({"x": x, "y": y, "spatialReference": {"wkid": 102100}}),
         "geometryType": "esriGeometryPoint", "inSR": 102100, "spatialRel": "esriSpatialRelIntersects",
         "outFields": "OBJECTID,Name,Year,State,acquisition_date,resolution_value",
         "returnGeometry": "false", "resultRecordCount": "20", "f": "json"}
    url = ("https://imagery.nationalmap.gov/arcgis/rest/services/USGSNAIPImagery/ImageServer/query?"
           + urllib.parse.urlencode(q))
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60) as r:
            d = json.loads(r.read())
        best = None
        for f in d.get("features", []):
            a = f["attributes"]
            if a.get("Year") and (best is None or a["Year"] > best["Year"]):
                best = a
        return best
    except Exception as e:
        return {"error": str(e)}


def mutual_nearest(des_q, des_t, top_k=MATCH_TOP_K):
    n_q = des_q.shape[0]
    best_t = np.full(n_q, -1, dtype=np.int64)
    best_d = np.full(n_q, np.inf, dtype=np.float32)
    qa = (des_q * des_q).sum(axis=1)
    CH = 512
    for st in range(0, n_q, CH):
        sp = min(st + CH, n_q)
        block = des_q[st:sp]
        tb = (des_t * des_t).sum(axis=1)[None, :]
        dots = block @ des_t.T
        d2 = qa[st:sp][:, None] + tb - 2.0 * dots
        idx = np.argmin(d2, axis=1)
        val = d2[np.arange(sp - st), idx]
        best_t[st:sp] = idx
        best_d[st:sp] = val
    cand = np.unique(best_t)
    if cand.size == 0:
        return np.empty(0, np.int64), np.empty(0, np.int64)
    des_c = des_t[cand]
    best_q = np.full(cand.size, -1, dtype=np.int64)
    ca = (des_c * des_c).sum(axis=1)
    for st in range(0, cand.size, CH):
        sp = min(st + CH, cand.size)
        block = des_c[st:sp]
        dots = block @ des_q.T
        d2 = ca[st:sp][:, None] + qa[None, :] - 2.0 * dots
        best_q[st:sp] = np.argmin(d2, axis=1)
    pos = {int(t): i for i, t in enumerate(cand)}
    mut = [i for i in range(n_q) if best_t[i] >= 0 and best_q[pos[int(best_t[i])]] == i]
    if not mut:
        return np.empty(0, np.int64), np.empty(0, np.int64)
    mq = np.array(mut, dtype=np.int64)
    mt = best_t[mq]
    order = np.argsort(best_d[mq], kind="stable")[:top_k]
    return mq[order], mt[order]


def ncc_over_mask(a, b, mask):
    av = a[mask].astype(np.float64)
    bv = b[mask].astype(np.float64)
    if av.size < 200:
        return 0.0, int(av.size)
    av -= av.mean()
    bv -= bv.mean()
    den = math.sqrt(float((av * av).sum()) * float((bv * bv).sum()))
    return (float((av * bv).sum()) / den if den > 0 else 0.0), int(av.size)


def verify(photo_path, plan_path, photo_scale=PHOTO_SCALE):
    # the CHILD path — the only place cv2 is imported (see module docstring)
    import cv2
    CLAHE = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    SIFT = cv2.SIFT_create(nfeatures=40000, contrastThreshold=0.02, edgeThreshold=15)
    photo0 = cv2.imread(photo_path, cv2.IMREAD_GRAYSCALE)
    plan = cv2.imread(plan_path, cv2.IMREAD_GRAYSCALE)
    if photo0 is None or plan is None:
        return {"error": "unreadable image"}
    if photo_scale != 1.0:
        photo = cv2.resize(photo0, None, fx=photo_scale, fy=photo_scale, interpolation=cv2.INTER_AREA)
    else:
        photo = photo0
    plan_eq = CLAHE.apply(plan)
    photo_eq = CLAHE.apply(photo)
    kp_p, des_p = SIFT.detectAndCompute(plan_eq, None)
    kp_s, des_s = SIFT.detectAndCompute(photo_eq, None)
    if des_p is None or des_s is None:
        return {"matches": 0}
    mq, mp = mutual_nearest(des_s, des_p, MATCH_TOP_K)
    if len(mq) < 8:
        return {"matches": int(len(mq)), "note": "fewer than 8 mutual matches"}
    src = np.float32([kp_p[i].pt for i in mp])
    dst = np.float32([kp_s[i].pt for i in mq])
    cv2.setRNGSeed(20261002)
    H, mask = cv2.findHomography(src, dst, cv2.RANSAC, 4.0, maxIters=20000, confidence=0.9999)
    if H is None:
        return {"matches": int(len(mq)), "note": "no homography"}
    inl = int(mask.sum())
    Hinv = np.linalg.inv(H)
    w = cv2.warpPerspective(photo_eq, Hinv, (plan.shape[1], plan.shape[0]))
    corners = np.float32([[0, 0], [photo.shape[1], 0], [photo.shape[1], photo.shape[0]],
                          [0, photo.shape[0]]]).reshape(-1, 1, 2)
    quad = cv2.perspectiveTransform(corners, Hinv.astype(np.float32)).reshape(-1, 2)
    foot = np.zeros(plan_eq.shape, np.uint8)
    cv2.fillPoly(foot, [quad.astype(np.int32)], 255)
    inter = foot.astype(bool)
    ncc_val, npx = ncc_over_mask(w, plan_eq, inter)
    # plausibility geometry (the corrected rule)
    area = float(cv2.contourArea(quad.astype(np.float32)))
    bbox = float((quad[:, 0].max() - quad[:, 0].min()) * (quad[:, 1].max() - quad[:, 1].min()))
    hw, hh = photo.shape[1], photo.shape[0]
    base = Hinv @ np.array([hw / 2.0, hh / 2.0, 1.0]); base = base[:2] / base[2]
    eps = 5.0
    dxv = Hinv @ np.array([hw / 2.0 + eps, hh / 2.0, 1.0]); dxv = dxv[:2] / dxv[2]
    dyv = Hinv @ np.array([hw / 2.0, hh / 2.0 + eps, 1.0]); dyv = dyv[:2] / dyv[2]
    sx = float(np.linalg.norm(dxv - base) / eps)
    sy = float(np.linalg.norm(dyv - base) / eps)
    sliver = (area / bbox) if bbox > 0 else 0.0
    meets = (inl >= PIN_MIN_INLIERS and ncc_val >= PIN_MIN_NCC and npx >= PIN_MIN_FOOTPRINT_PX
             and sliver >= PIN_MIN_SLIVER
             and PIN_SCALE_BOUNDS[0] <= sx <= PIN_SCALE_BOUNDS[1]
             and PIN_SCALE_BOUNDS[0] <= sy <= PIN_SCALE_BOUNDS[1])
    return {"matches": int(len(mq)), "inliers": inl, "footprintPx": npx, "ncc": round(ncc_val, 4),
            "quadAreaPlanPx": round(area, 1), "quadBboxAreaPlanPx": round(bbox, 1),
            "sliverRatio": round(sliver, 4), "localScaleX": round(sx, 4), "localScaleY": round(sy, 4),
            "stillW": int(photo.shape[1]), "stillH": int(photo.shape[0]),
            "meetsCorrectedRule": bool(meets),
            "H": [[float(v) for v in row] for row in (H / H[2, 2])]}


def haversine_m(lat1, lon1, lat2, lon2):
    R = 6371000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    a = math.sin((p2 - p1) / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(math.radians(lon2 - lon1) / 2) ** 2
    return 2 * R * math.asin(math.sqrt(a))


def pin_from(v, bbox, px, plan_path, url, D, cross, clat, clon, span_km, gsd, camera, photo_path):
    H = np.float32(v["H"])
    Hinv = np.linalg.inv(H)
    # the principal point through the verified homography — pure numpy (the
    # parent process does not import cv2; the still dims come from the child's
    # verify record: stillW/stillH at the operating photoScale)
    hw = float(v["stillW"]) / 2.0
    hh = float(v["stillH"]) / 2.0
    g = Hinv @ np.array([hw, hh, 1.0])
    gpt = (float(g[0]) / float(g[2]), float(g[1]) / float(g[2]))
    gx = float(bbox[0] + (gpt[0] / px) * (bbox[2] - bbox[0]))
    gy = float(bbox[3] - (gpt[1] / px) * (bbox[3] - bbox[1]))
    lon, lat = merc_to_lonlat(gx, gy)
    n_ = 1 << 14
    tx = int((lon + 180.0) / 360.0 * n_)
    ty = int((1.0 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2.0 * n_)
    pin = {"lat": round(lat, 6), "lon": round(lon, 6),
           "tile": {"z": 14, "x": tx, "y": ty},
           "ncc": v["ncc"], "inliers": v["inliers"], "matches": v["matches"],
           "footprintPx": v["footprintPx"], "quadAreaPlanPx": v["quadAreaPlanPx"],
           "sliverRatio": v["sliverRatio"], "localScaleX": v["localScaleX"], "localScaleY": v["localScaleY"],
           "planBox": {"center": [round(clat, 5), round(clon, 5)], "spanKm": span_km, "gsdM": gsd,
                       "D": D, "cross": cross},
           "naipCatalogAtPin": naip_catalog(lon, lat),
           "planPath": plan_path, "planUrl": url}
    if camera:
        pin["cameraPos"] = camera
        pin["pinToCameraM"] = round(haversine_m(lat, lon, camera[0], camera[1]), 1)
    return pin


def verify_isolated(still_path, plan_path, tries=3):
    """Run verify() in a FRESH SUBPROCESS (the execution model; see module
    docstring). Identical parameters/seed/arithmetic to an in-process call;
    an OOM-killed child (rc -9) loses only its own attempt. Returns
    (verify_dict, None) or (None, honest_error_string)."""
    last = None
    for attempt in range(tries):
        try:
            p = subprocess.run([sys.executable, os.path.abspath(__file__), "--verify-one", still_path, plan_path],
                               capture_output=True, text=True, timeout=1200)
        except subprocess.TimeoutExpired:
            last = "child timeout after 1200 s"
            time.sleep(5 + 10 * attempt)
            continue
        if p.returncode == 0:
            try:
                return json.loads(p.stdout.strip().splitlines()[-1]), None
            except Exception as e:
                last = f"child output unparseable: {e!r}"
        else:
            sig = -p.returncode if p.returncode < 0 else None
            last = (f"child rc={p.returncode}"
                    + (f" (SIGKILL — OOM on the 4 GB pod)" if sig == 9 else "")
                    + f"; stderr tail: {p.stderr.strip()[-220:]}")
        time.sleep(5 + 10 * attempt)
    return None, f"verify subprocess failed {tries}x: {last}"


def save_journal(journal):
    # ATOMIC journal persistence (resilience-only change, measurement-neutral):
    # write to a temp file then os.replace — a process killed mid-write can
    # never leave a truncated JSON journal (the reaped-batch recovery path
    # depends on the journal being readable at every instant)
    tmp = JOURNAL + ".tmp"
    with open(tmp, "w") as f:
        json.dump(journal, f)
    os.replace(tmp, JOURNAL)


def main() -> int:
  # --max-attempts N: process at most N NEW (unjournaled) attempts, then exit
  # cleanly (the journal resumes; the batch model survives external process
  # reaping between invocations — every batch is idempotent from the journal)
  max_new = None
  if len(sys.argv) == 3 and sys.argv[1] == "--max-attempts":
    max_new = int(sys.argv[2])
  new_done = 0
  report = {
  "method": {
    "pass": "3 (the corrected native-scale re-measurement)",
    "executionModel": ("per-attempt subprocess isolation (this tool spawns itself with --verify-one per "
                       "attempt): the SIFT at photoScale 1.0 transiently peaks 2.1-2.6 GB RSS — a fresh child "
                       "per attempt bounds an OOM to that attempt; a child failing 3x is journaled as an error "
                       "record (measured-unverifiable-on-this-pod), never skipped silently, never fabricated. "
                       "Parameters, RNG seed and arithmetic are IDENTICAL to an in-process call"),
    "gridFix": ("pass 2's box generator divided kilometer-valued D/cross by 111320 (meters per degree) — "
                "every box sat within ~20 m of the camera; THIS pass multiplies by 1000 first (the fix), "
                "so boxes are truly D km along the DECLARED heading with cross-track offsets in km"),
    "photoScale": "1.0 ONLY (the adapter's operating point — it consumes stills at native resolution)",
    "matcherTopK": MATCH_TOP_K,
    "matcherNote": "mirrors the adapter's maxMatchesPerPair 500 (pass 2 used 800)",
    "pinRule": {"minInliers": PIN_MIN_INLIERS, "minNcc": PIN_MIN_NCC,
                "minFootprintPx": PIN_MIN_FOOTPRINT_PX, "minSliverRatio": PIN_MIN_SLIVER,
                "localScaleBounds": list(PIN_SCALE_BOUNDS),
                "note": ("the CORRECTED rule declared by tools/pin_audit.py BEFORE this run; the pin is the "
                         "photogrammetric estimate (principal point through the verified homography), never "
                         "the seed; no early break — the whole declared grid is measured")},
    "scope": {sid: STILLS[sid]["grid"] for sid in STILLS},
    "azimuthFix": ("defect found mid-campaign: p05's two azimuth sweeps initially shared journal keys "
                   "(both cross 0.0), so the 94.50-deg-east attempts replayed the southward records — the "
                   "declared both-azimuths scope was not met by the first execution. Fixed by tagging the "
                   "east-azimuth boxes 'E94.5' in the cross slot; the 4 east boxes were then measured under "
                   "their own keys. The southward records stand (they measured their own ground); nothing "
                   "was re-measured or discarded."),
    "notRescanned": {
        "p06-kgs-finney": "its county-grid centers were absolute (unaffected by the unit bug); pass-2 record stands",
        "p02-kelley-9364": "no position metadata of any kind; the Stage-A blind scan stands",
    },
  },
  "stills": {},
}

  journal = {"done": {}}
  if os.path.exists(JOURNAL):
    journal = json.load(open(JOURNAL))

  for sid, m in STILLS.items():
    centers, ladder = grid_for(sid)
    entry = {"seedGrid": m["grid"], "attempts": [], "qualifying": []}
    for (c, D, cross) in centers:
        clat, clon = c
        for span_km, gsd in ladder:
            px = int(round(span_km * 1000.0 / gsd))
            if px > MAX_PLAN_PX:
                continue
            cx, cy = lonlat_to_merc(clon, clat)
            half = span_km * 500.0
            bbox = (cx - half, cy - half, cx + half, cy + half)
            tag = f"D{D}_c{cross}_s{int(span_km*10):03d}_g{int(gsd*10):03d}"
            plan_path = f"{PLAN_DIR}/{sid}_p3_{tag}.jpg"
            key = f"{sid}|{tag}|ps1.00"
            if key in journal["done"]:
                rec = journal["done"][key]
                entry["attempts"].append(rec)
                if rec.get("verify", {}).get("meetsCorrectedRule"):
                    entry["qualifying"].append(rec)
                vv = rec.get("verify", {})
                print(f"{sid} {tag}: JOURNAL {vv.get('inliers')} inl ncc {vv.get('ncc')}", flush=True)
                continue
            if max_new is not None and new_done >= max_new:
                entry["attempts"].append({"box": tag, "deferred": True,
                                           "note": "not measured in this batch (—max-attempts); the journal resumes"})
                continue
            new_done += 1
            try:
                url, nbytes = naip_export(bbox, px, px, plan_path)
            except Exception as e:
                rec = {"box": tag, "center": [round(clat, 5), round(clon, 5)], "D": D, "cross": cross,
                       "spanKm": span_km, "gsdM": gsd, "photoScale": PHOTO_SCALE, "error": str(e)[:200]}
                entry["attempts"].append(rec)
                journal["done"][key] = rec
                save_journal(journal)
                continue
            v, verr = verify_isolated(m["path"], plan_path)
            if verr is not None:
                rec = {"box": tag, "center": [round(clat, 5), round(clon, 5)], "D": D, "cross": cross,
                       "spanKm": span_km, "gsdM": gsd, "photoScale": PHOTO_SCALE, "planBytes": nbytes,
                       "error": ("measured-unverifiable-on-this-pod — " + verr)[:400]}
                entry["attempts"].append(rec)
                journal["done"][key] = rec
                save_journal(journal)
                print(f"{sid} {tag}: ERROR {rec['error'][:160]}", flush=True)
                continue
            rec = {"box": tag, "center": [round(clat, 5), round(clon, 5)], "D": D, "cross": cross,
                   "spanKm": span_km, "gsdM": gsd, "photoScale": PHOTO_SCALE, "planBytes": nbytes,
                   "verify": {k: v[k] for k in v if k != "H"}}
            if v.get("meetsCorrectedRule"):
                rec["pin"] = pin_from(v, bbox, px, plan_path, url, D, cross, clat, clon, span_km, gsd, m.get("camera"), m["path"])
                entry["qualifying"].append(rec)
                print(f"{sid} {tag}: *** QUALIFIES *** inl={v['inliers']} ncc={v['ncc']} fp={v['footprintPx']} "
                      f"sliver={v['sliverRatio']} pin={rec['pin']['lat']},{rec['pin']['lon']}", flush=True)
            else:
                print(f"{sid} {tag}: m={v.get('matches', 0)} inl={v.get('inliers', 0)} ncc={v.get('ncc', 0)} "
                      f"fp={v.get('footprintPx', 0)} sliver={v.get('sliverRatio', 0)}", flush=True)
            entry["attempts"].append(rec)
            journal["done"][key] = rec
            save_journal(journal)
    if entry["qualifying"]:
        best = max(entry["qualifying"], key=lambda r: (r["verify"]["ncc"], r["verify"]["inliers"]))
        entry["outcome"] = "PINNED (corrected rule)"
        entry["pin"] = best["pin"]
        entry["pinTieBreak"] = "highest NCC, then inliers (declared)"
        entry["allQualifying"] = [r["box"] for r in entry["qualifying"]]
        print(f"== {sid}: PINNED {entry['pin']['lat']},{entry['pin']['lon']} ncc={entry['pin']['ncc']} "
              f"fp={entry['pin']['footprintPx']} ({len(entry['qualifying'])} qualifying attempt(s))", flush=True)
    else:
        atts = [a.get("verify", {}) for a in entry["attempts"] if "verify" in a]
        best_inl = max((a.get("inliers", 0) for a in atts), default=0)
        best_ncc = max((a.get("ncc", 0.0) for a in atts), default=0.0)
        best_fp = max((a.get("footprintPx", 0) for a in atts), default=0)
        n_err = len([a for a in entry["attempts"] if "error" in a])
        n_def = len([a for a in entry["attempts"] if a.get("deferred")])
        entry["outcome"] = "un-localized"
        entry["reason"] = (f"no corrected-grid attempt met the CORRECTED conjunctive rule (inliers >= 8 AND "
                           f"NCC >= 0.30 AND footprint >= 25000 px AND sliver >= 0.2 AND local scales in "
                           f"[0.05, 20]); over {len(entry['attempts'])} attempts: best inliers {best_inl}, "
                           f"best NCC {best_ncc:.4f}, best footprint {best_fp} px (not necessarily the same attempt)"
                           + (f"; {n_err} attempt(s) measured-unverifiable-on-this-pod (error records in the "
                              f"attempts list — never skipped silently)" if n_err else "")
                           + (f"; {n_def} attempt(s) deferred to a later batch (—max-attempts; this is a BATCH "
                              "record, not the final pass record — re-run without the flag for the final report)" if n_def else ""))
        print(f"== {sid}: UN-LOCALIZED ({len(entry['attempts'])} attempts, best inl={best_inl} ncc={best_ncc:.4f} fp={best_fp})", flush=True)
    report["stills"][sid] = entry

  json.dump(report, open(OUT, "w"), indent=1)
  print(f"stage B pass 3 batch done -> {OUT} (new attempts this batch: {new_done}"
        + (f" of max {max_new}" if max_new is not None else "") + ")")
  return 0


if __name__ == "__main__":
    if len(sys.argv) == 4 and sys.argv[1] == "--verify-one":
        # the CHILD: heavy verify, JSON to stdout, nothing else
        print(json.dumps(verify(sys.argv[2], sys.argv[3], PHOTO_SCALE)))
        sys.exit(0)
    sys.exit(main())
