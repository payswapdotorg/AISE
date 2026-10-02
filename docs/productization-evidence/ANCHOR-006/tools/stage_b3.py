#!/usr/bin/env python3
"""ANCHOR-006 — Stage B pass 2: NCC-verified pinning, azimuth-corrected boxes.

PASS 1 (stage_b2.py, preserved as scan/stage-b2-firstpass.out) seeded its
plan boxes at +0.7..+1.0 degrees NORTH of each camera position while the
DECLARED camera heading on the same Commons metadata is 188.97/189.16
deg (southward) for p03/p04 and 94.50 deg (eastward) for p05 — the boxes
covered ground 78-111 km BEHIND the cameras. Its measured NCC ~ 0 on p03
(48 attempts, best 0.146) and the partial p04 are preserved honestly as
the first pass's outcome; the geometry was mis-declared, so this pass
re-measures with the corrected declaration:

  box centers = camera position + D km along the DECLARED camera heading
  (D in {4, 8, 16} km ground), cross-track offsets {-4, 0, +4} km;
  nested scale ladder (span_mercator, gsd_m/px): (16 km, 8), (12 km, 4),
  (7.5 km, 2.5) — spans in EPSG:3857 meters (ground = mercator * cos(lat);
  declared here, same convention as pass 1);
  region-seeded stills (no camera metadata): county grid / azimuth sweep
  as declared per still.

Everything else is IDENTICAL to pass 1 (the same matcher, RANSAC, warp,
footprint NCC, photo scales {1.0, 0.5, 0.25}):

PIN RULE (declared before this pass, unchanged from pass 1):
  inliers >= 8 AND footprint NCC >= 0.30 — the pin is the photogrammetric
  estimate (the still's principal point mapped through the verified
  homography), NEVER the seed. Every attempt (pin or failure) recorded.
"""
import json, math, os, time, urllib.request, urllib.parse
import cv2
import numpy as np

OUT = "/home/z/scratch-anchor006/scan/stage-b.json"
PLAN_DIR = "/home/z/scratch-anchor006/plans"
os.makedirs(PLAN_DIR, exist_ok=True)
EARTH = 20037508.342789244
CLAHE = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
PIN_MIN_INLIERS = 8
PIN_MIN_NCC = 0.30
MAX_PLAN_PX = 3000
UA = {"User-Agent": "AISE-ANCHOR-006-evidence/1.0 (NAIP export; public domain)"}

STILLS = {
  "p03-famartin-dundy-a": {
    "path": "/home/z/candidates/famartin_dundy.jpg",
    "seed": ("EXIF/commons camera position (40.357204, -101.817504) + DECLARED "
             "camera heading 188.97 deg (southward), Commons file page"),
    "camera": [40.357204, -101.817504], "heading": 188.97,
    "boxes": "az-grid D{4,8,16}km x cross{-4,0,+4}km, ladder (16km,8),(12km,4),(7.5km,2.5)"},
  "p04-famartin-dundy-b": {
    "path": "/home/z/candidates/famartin_dundy2.jpg",
    "seed": ("commons camera position (40.384872, -101.411194) + DECLARED "
             "camera heading 189.16 deg (southward), Commons file page"),
    "camera": [40.384872, -101.411194], "heading": 189.16,
    "boxes": "az-grid D{4,8,16}km x cross{-4,0,+4}km, ladder (16km,8),(12km,4),(7.5km,2.5)"},
  "p05-famartin-hitchcock": {
    "path": "/home/z/candidates/famartin_hitchcock.jpg",
    "seed": ("commons camera position (40.427981, -101.109358) + DECLARED "
             "camera heading 94.50 deg (eastward), Commons file page"),
    "camera": [40.427981, -101.109358], "heading": 94.50,
    "boxes": "az-grid D{4,8,16}km x cross{-4,0,+4}km, ladder (16km,8),(12km,4),(7.5km,2.5)"},
  "p06-kgs-finney": {
    "path": "/home/z/candidates/kgs_finney_aerial.jpg",
    "seed": ("source metadata: Finney County, Kansas (KGS photo library, "
             "photographer John Charlton/KGS, undated) — Garden City pivot-belt county grid"),
    "camera": None, "heading": None,
    "boxes": "county grid centers around Garden City KS, ladder (16km,8),(12km,4),(7.5km,2.5)"},
  "p07-deverre-winter": {
    "path": "/home/z/candidates/deverre_4.jpg",
    "seed": ("commons camera position (41.948257, -99.120712); no heading declared — "
             "azimuth sweep N/E/S/W at D{8,16}km (winter 2011 shot, cross-vintage attempt)"),
    "camera": [41.948257, -99.120712], "heading": None,
    "boxes": "az-sweep {N,E,S,W} x D{8,16}km, ladder (16km,8),(12km,4)"},
}

# box generators -----------------------------------------------------------

def boxes_az_grid(cam, heading_deg):
    clat, clon = cam
    out = []
    for D in (4.0, 8.0, 16.0):
        for cross in (-4.0, 0.0, 4.0):
            az = math.radians(heading_deg)
            # along = +D along heading; cross = +cross to the RIGHT of heading
            dlat = (D * math.cos(az) - cross * math.sin(az)) / 111320.0
            dlon = (D * math.sin(az) + cross * math.cos(az)) / (111320.0 * math.cos(math.radians(clat)))
            out.append(((round(clat + dlat, 6), round(clon + dlon, 6)), D, cross))
    return out

def boxes_county_grid():
    out = []
    for c in [(38.08, -100.85), (38.15, -100.95), (38.00, -100.70), (38.22, -100.88)]:
        out.append((c, None, None))
    return out

def boxes_az_sweep(cam):
    clat, clon = cam
    out = []
    for heading_deg, nm in ((0.0, "N"), (90.0, "E"), (180.0, "S"), (270.0, "W")):
        for D in (8.0, 16.0):
            az = math.radians(heading_deg)
            dlat = (D * math.cos(az)) / 111320.0
            dlon = (D * math.sin(az)) / (111320.0 * math.cos(math.radians(clat)))
            out.append(((round(clat + dlat, 6), round(clon + dlon, 6)), D, nm))
    return out

LADDER_FULL = [(16.0, 8.0), (12.0, 4.0), (7.5, 2.5)]   # (span km mercator, gsd m/px)
LADDER_COARSE = [(16.0, 8.0), (12.0, 4.0)]

def ladder_for(sid):
    return LADDER_COARSE if sid.startswith("p07") else LADDER_FULL

# shared machinery (identical semantics to pass 1) --------------------------

def lonlat_to_merc(lon, lat):
    x = lon * EARTH / 180.0
    y = math.log(math.tan((90.0 + lat) * math.pi / 360.0)) * EARTH / math.pi
    return x, y

def merc_to_lonlat(x, y):
    return x / EARTH * 180.0, math.degrees(2 * math.atan(math.exp(y * math.pi / EARTH)) - math.pi / 2)

def naip_export(bbox_m, w, h, out_path):
    url = ("https://imagery.nationalmap.gov/arcgis/rest/services/USGSNAIPImagery/ImageServer/exportImage"
           f"?bbox={bbox_m[0]},{bbox_m[1]},{bbox_m[2]},{bbox_m[3]}&bboxSR=3857&imageSR=3857"
           f"&size={w},{h}&format=jpg&interpolation=RSP_BilinearInterpolation&f=image")
    if os.path.exists(out_path) and os.path.getsize(out_path) > 500:
        return url, os.path.getsize(out_path)   # cached: deterministic export, same bytes
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

def mutual_nearest(des_q, des_t, top_k=800):
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
    av = a[mask].astype(np.float64); bv = b[mask].astype(np.float64)
    if av.size < 200:
        return 0.0, int(av.size)
    av -= av.mean(); bv -= bv.mean()
    den = math.sqrt(float((av*av).sum()) * float((bv*bv).sum()))
    return (float((av*bv).sum()/den) if den > 0 else 0.0), int(av.size)

def haversine_m(lat1, lon1, lat2, lon2):
    R = 6371000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    a = math.sin((p2-p1)/2)**2 + math.cos(p1)*math.cos(p2)*math.sin(math.radians(lon2-lon1)/2)**2
    return 2*R*math.asin(math.sqrt(a))

def verify(photo_path, plan_path, photo_scale=1.0):
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
    mq, mp = mutual_nearest(des_s, des_p, 800)
    if len(mq) < 8:
        return {"matches": int(len(mq)), "note": "fewer than 8 mutual matches"}
    src = np.float32([kp_p[i].pt for i in mp])
    dst = np.float32([kp_s[i].pt for i in mq])
    H, mask = cv2.findHomography(src, dst, cv2.RANSAC, 4.0, maxIters=20000, confidence=0.9999)
    if H is None:
        return {"matches": int(len(mq)), "note": "no homography"}
    inl = int(mask.sum())
    Hinv = np.linalg.inv(H)
    w = cv2.warpPerspective(photo_eq, Hinv, (plan.shape[1], plan.shape[0]))
    corners = np.float32([[0,0],[photo.shape[1],0],[photo.shape[1],photo.shape[0]],[0,photo.shape[0]]]).reshape(-1,1,2)
    quad = cv2.perspectiveTransform(corners, Hinv.astype(np.float32))
    foot = np.zeros(plan_eq.shape, np.uint8)
    cv2.fillPoly(foot, [quad.astype(np.int32)], 255)
    ncc_val, npx = ncc_over_mask(w, plan_eq, foot.astype(bool))
    return {"matches": int(len(mq)), "inliers": inl, "footprintPx": npx, "ncc": round(ncc_val, 4),
            "H": [[float(v) for v in row] for row in (H / H[2, 2])]}

PHOTO_SCALES = [1.0, 0.5, 0.25]

report = {
  "method": {
    "pinRule": {"minInliers": PIN_MIN_INLIERS, "minNcc": PIN_MIN_NCC,
                "note": "declared before pass 1; unchanged. The pin is the photogrammetric "
                        "estimate (principal point through the verified homography), never the seed."},
    "pass1": {
      "record": "scan/stage-b2-firstpass.out (preserved)",
      "geometry": "camera-seeded boxes at +0.7..+1.0 deg NORTH of the camera positions",
      "defect": ("the DECLARED camera heading on the same Commons metadata is southward "
                 "(188.97/189.16 deg) for p03/p04 and eastward (94.50 deg) for p05 — pass 1's "
                 "boxes covered ground 78-111 km BEHIND the cameras; measured NCC ~ 0 (p03: 48 "
                 "attempts, best 0.1456; p04 interrupted at 3/48) is preserved as the honest "
                 "first-pass outcome; superseded by this pass with the corrected declaration"),
      "completed": ["pass 1 ran to completion over all five stills (204 attempts)"],
      "outcomes": {
        "p03-famartin-dundy-a": "UN-LOCALIZED (48 attempts, best inl 9, best NCC 0.1456)",
        "p04-famartin-dundy-b": "UN-LOCALIZED (48 attempts, best inl 9, best NCC 0.1213)",
        "p05-famartin-hitchcock": "UN-LOCALIZED (48 attempts, best inl 8, best NCC 0.2805)",
        "p06-kgs-finney": "UN-LOCALIZED (36 attempts, best inl 13, best NCC 0.1714)",
        "p07-deverre-winter": "UN-LOCALIZED (24 attempts, best inl 10, best NCC 0.1063)"
      },
    },
    "pass2": {
      "geometry": ("camera position + DECLARED camera heading from the same Commons metadata; "
                   "az-grid D{4,8,16} km x cross{-4,0,+4} km; nested ladder (16km,8),(12km,4),"
                   "(7.5km,2.5) — spans in EPSG:3857 meters (ground = mercator*cos(lat), the "
                   "pass-1 convention, declared); county grid for p06; azimuth sweep for p07"),
      "machinery": ("identical to pass 1: CLAHE+SIFT both sides, chunked mutual-nearest (800), "
                    "RANSAC 4px, full-photo warp, footprint-quad NCC, photo scales {1.0,0.5,0.25}"),
    },
  },
  "stills": {},
}

for sid, m in STILLS.items():
    photo = m["path"]
    entry = {"seed": m["seed"], "attempts": []}
    pinned = None
    if sid.startswith("p06"):
        centers = boxes_county_grid()
    elif sid.startswith("p07"):
        centers = boxes_az_sweep(m["camera"])
    else:
        centers = boxes_az_grid(m["camera"], m["heading"])
    ladder = ladder_for(sid)
    for bi, (c, D, cross) in enumerate(centers):
        clat, clon = c
        for span_km, gsd in ladder:
            px = int(round(span_km * 1000.0 / gsd))
            if px > MAX_PLAN_PX:
                continue
            cx, cy = lonlat_to_merc(clon, clat)
            half = span_km * 500.0
            bbox = (cx - half, cy - half, cx + half, cy + half)
            plan_path = f"{PLAN_DIR}/{sid}_b{bi:02d}_s{int(span_km*10):03d}_g{int(gsd*10):03d}.jpg"
            try:
                url, nbytes = naip_export(bbox, px, px, plan_path)
            except Exception as e:
                entry["attempts"].append({"box": bi, "D": D, "cross": cross, "span": span_km,
                                          "gsd": gsd, "error": str(e)[:200]})
                continue
            for ps in PHOTO_SCALES:
                v = verify(photo, plan_path, ps)
                entry["attempts"].append({
                    "box": bi, "center": [round(clat, 5), round(clon, 5)], "D": D, "cross": cross,
                    "spanKm": span_km, "gsdM": gsd, "photoScale": ps, "planBytes": nbytes,
                    "verify": {k: v[k] for k in v if k != "H"}})
                print(f"{sid} box{bi:02d} D={D} cross={cross} s={span_km} g={gsd} ps={ps}: "
                      f"m={v.get('matches',0)} inl={v.get('inliers',0)} ncc={v.get('ncc',0)}", flush=True)
                if v.get("inliers", 0) >= PIN_MIN_INLIERS and v.get("ncc", 0.0) >= PIN_MIN_NCC:
                    H = np.float32(v["H"])
                    Hinv = np.linalg.inv(H)
                    img = cv2.imread(photo, cv2.IMREAD_GRAYSCALE)
                    ctr = np.float32([[img.shape[1]*ps/2.0, img.shape[0]*ps/2.0]]).reshape(-1,1,2)
                    gpt = cv2.perspectiveTransform(ctr, Hinv.astype(np.float32)).reshape(-1,2)[0]
                    gx = float(bbox[0] + (float(gpt[0]) / px) * (bbox[2] - bbox[0]))
                    gy = float(bbox[3] - (float(gpt[1]) / px) * (bbox[3] - bbox[1]))
                    lon, lat = merc_to_lonlat(gx, gy)
                    n_ = 1 << 14
                    tx = int((lon + 180.0) / 360.0 * n_)
                    ty = int((1.0 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2.0 * n_)
                    cat = naip_catalog(lon, lat)
                    pinned = {"lat": round(lat, 6), "lon": round(lon, 6),
                              "tile": {"z": 14, "x": tx, "y": ty},
                              "ncc": v["ncc"], "inliers": v["inliers"], "matches": v["matches"],
                              "photoScale": ps, "footprintPx": v.get("footprintPx"),
                              "planBox": {"center": [round(clat, 5), round(clon, 5)],
                                          "spanKm": span_km, "gsdM": gsd, "D": D, "cross": cross},
                              "naipCatalogAtPin": cat, "planPath": plan_path, "planUrl": url}
                    if m.get("camera"):
                        pinned["cameraPos"] = m["camera"]
                        pinned["pinToCameraM"] = round(haversine_m(lat, lon, m["camera"][0], m["camera"][1]), 1)
                    break
            if pinned:
                break
        if pinned:
            break
    if pinned:
        entry["outcome"] = "PINNED"
        entry["pin"] = pinned
        print(f"== {sid}: PINNED {pinned['lat']},{pinned['lon']} ncc={pinned['ncc']} inl={pinned['inliers']}", flush=True)
    else:
        atts = [a.get("verify", {}) for a in entry["attempts"] if "verify" in a]
        best_inl = max((a.get("inliers", 0) for a in atts), default=0)
        best_ncc = max((a.get("ncc", 0.0) for a in atts), default=0.0)
        entry["outcome"] = "un-localized"
        entry["reason"] = (f"no plan box verified at the declared pin floors (CONJUNCTIVE per attempt: "
                           f"inliers >= {PIN_MIN_INLIERS} AND footprint NCC >= {PIN_MIN_NCC}); over "
                           f"{len(entry['attempts'])} attempts the best inlier count was {best_inl} and the "
                           f"best footprint NCC was {best_ncc} (not necessarily the same attempt); NO single "
                           f"attempt met both floors")
        print(f"== {sid}: UN-LOCALIZED ({len(entry['attempts'])} attempts, best inl={best_inl} ncc={best_ncc})", flush=True)
    report["stills"][sid] = entry

json.dump(report, open(OUT, "w"), indent=1)
print("stage B pass 2 done ->", OUT)
