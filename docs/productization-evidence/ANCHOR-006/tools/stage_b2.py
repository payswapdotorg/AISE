#!/usr/bin/env python3
"""ANCHOR-006 — Stage B: NCC-verified correspondence + pinning (hint-seeded).

The blind z14 belt scan (Stage A) measured vote dilution on the repetitive
pivot texture (top-tile votes 6-10, no RANSAC survivor) — recorded as the
blind scan's honest negative. Stage B seeds the search with each still's
OWN position metadata (EXIF GPS camera position for the Flickr/Commons
still; the source-metadata county for the KGS still — both recorded per
still), places candidate NAIP plan boxes over the plausible imaged ground,
and verifies photogrammetrically: CLAHE+SIFT both sides, chunked
mutual-nearest matching (identical semantics to BFMatcher crossCheck=True),
RANSAC (plan->photo), photometric NCC over the warped footprint.

PIN RULE (declared): inliers >= 8 AND footprint NCC >= 0.30 — the pin is
the photogrammetric estimate, never the seed.
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

STILLS = {
  "p03-famartin-dundy-a": {"path": "/home/z/candidates/famartin_dundy.jpg",
    "seed": "EXIF GPS camera position (40.357204, -101.817504) — the photo looks southward",
    "boxes": [((40.357204, -101.817504), (1, -0.12), 24.0), ((40.357204, -101.817504), (0.7, -0.12), 24.0), ((40.357204, -101.817504), (1, -0.20), 24.0), ((40.357204, -101.817504), (1, -0.06), 24.0)],
    "exifGps": [40.357204, -101.817504]},
  "p04-famartin-dundy-b": {"path": "/home/z/candidates/famartin_dundy2.jpg",
    "seed": "EXIF GPS camera position (40.384872, -101.411194) — southward",
    "boxes": [((40.384872, -101.411194), (1, -0.12), 24.0), ((40.384872, -101.411194), (0.7, -0.12), 24.0), ((40.384872, -101.411194), (1, -0.20), 24.0), ((40.384872, -101.411194), (1, -0.06), 24.0)],
    "exifGps": [40.384872, -101.411194]},
  "p05-famartin-hitchcock": {"path": "/home/z/candidates/famartin_hitchcock.jpg",
    "seed": "EXIF GPS camera position (40.427981, -101.109358) — southward over Swanson Lake area",
    "boxes": [((40.427981, -101.109358), (1, -0.12), 24.0), ((40.427981, -101.109358), (0.7, -0.12), 24.0), ((40.427981, -101.109358), (1, -0.20), 24.0), ((40.427981, -101.109358), (1, -0.06), 24.0)],
    "exifGps": [40.427981, -101.109358]},
  "p06-kgs-finney": {"path": "/home/z/candidates/kgs_finney_aerial.jpg",
    "seed": "source metadata: Finney County, Kansas (KGS photo library) — Garden City pivot area",
    "boxes": [((38.07, -100.83), (1, 0.0), 30.0), ((38.20, -100.95), (1, 0.0), 30.0), ((38.0, -100.7), (1, 0.0), 30.0)],
    "exifGps": None},
  "p07-deverre-winter": {"path": "/home/z/candidates/deverre_4.jpg",
    "seed": "EXIF GPS camera position (41.948257, -99.120712) — winter 2011 shot (cross-vintage attempt)",
    "boxes": [((41.948257, -99.120712), (1, -0.12), 24.0), ((41.948257, -99.120712), (1, -0.20), 24.0)],
    "exifGps": [41.948257, -99.120712]},
}
PHOTO_SCALES = [1.0, 0.5, 0.25]
GSDS = [(12.0, 36.0), (8.0, 24.0), (4.0, 12.0), (2.5, 6.0)]

report = {"pinRule": {"minInliers": PIN_MIN_INLIERS, "minNcc": PIN_MIN_NCC}, "stills": {}}
for sid, m in STILLS.items():
    photo = m["path"]
    entry = {"seed": m["seed"], "attempts": []}
    pinned = None
    for gsd, default_span in GSDS:
        for bi, (c, bearing, box_span) in enumerate(m["boxes"]):
            clat, clon = c
            dlat, dlon = bearing
            lat_c = clat + dlat
            lon_c = clon + (dlon / math.cos(math.radians(clat)) if dlon else 0.0)
            span_km = box_span if default_span == 24.0 or abs(box_span - default_span) < 0.1 else default_span
            span_km = min(box_span, default_span)
            cx, cy = lonlat_to_merc(lon_c, lat_c)
            half = span_km * 500.0
            bbox = (cx - half, cy - half, cx + half, cy + half)
            px = int(round(span_km * 1000.0 / gsd))
            if px > MAX_PLAN_PX:
                continue
            plan_path = f"{PLAN_DIR}/{sid}_b{bi}_g{int(gsd*10)}.jpg"
            try:
                url, nbytes = naip_export(bbox, px, px, plan_path)
            except Exception as e:
                entry["attempts"].append({"box": bi, "gsd": gsd, "error": str(e)[:200]})
                continue
            for ps in PHOTO_SCALES:
                v = verify(photo, plan_path, ps)
                entry["attempts"].append({"box": bi, "gsd": gsd, "photoScale": ps, "planBytes": nbytes,
                                          "center": [round(lat_c, 5), round(lon_c, 5)], "verify": {k: v[k] for k in v if k != "H"}})
                print(f"{sid} box{bi} gsd{gsd} ps={ps}: m={v.get('matches',0)} inl={v.get('inliers',0)} ncc={v.get('ncc',0)}", flush=True)
                if v.get("inliers", 0) >= PIN_MIN_INLIERS and v.get("ncc", 0.0) >= PIN_MIN_NCC:
                    H = np.float32(v["H"])
                    Hinv = np.linalg.inv(H)
                    img = cv2.imread(photo, cv2.IMREAD_GRAYSCALE)
                    ctr = np.float32([[img.shape[1]*ps/2.0, img.shape[0]*ps/2.0]]).reshape(-1,1,2)
                    gpt = cv2.perspectiveTransform(ctr, Hinv.astype(np.float32)).reshape(-1,2)[0]
                    gx = float(bbox[0] + (float(gpt[0]) / px) * (bbox[2] - bbox[0]))
                    gy = float(bbox[3] - (float(gpt[1]) / px) * (bbox[3] - bbox[1]))
                    lon, lat = merc_to_lonlat(gx, gy)
                    lon, lat = float(lon), float(lat)
                    n_ = 1 << 14
                    tx = int((lon + 180.0) / 360.0 * n_)
                    ty = int((1.0 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2.0 * n_)
                    cat = naip_catalog(lon, lat)
                    pinned = {"lat": round(lat, 6), "lon": round(lon, 6),
                              "tile": {"z": 14, "x": tx, "y": ty},
                              "ncc": v["ncc"], "inliers": v["inliers"], "matches": v["matches"], "photoScale": ps,
                              "footprintPx": v.get("footprintPx"),
                              "planBox": {"center": [round(lat_c, 5), round(clon, 5)], "spanKm": span_km, "gsdM": gsd},
                              "naipCatalogAtPin": cat,
                              "planPath": plan_path, "planUrl": url}
                    if m.get("exifGps"):
                        pinned["exifGpsCameraPos"] = m["exifGps"]
                        pinned["pinToCameraM"] = round(haversine_m(lat, lon, m["exifGps"][0], m["exifGps"][1]), 1)
                    break
        if pinned:
            break
    if pinned:
        entry["outcome"] = "PINNED"
        entry["pin"] = pinned
        print(f"== {sid}: PINNED {pinned['lat']},{pinned['lon']} ncc={pinned['ncc']} inl={pinned['inliers']}", flush=True)
    else:
        best_attempt = max(entry["attempts"], key=lambda a: (a.get("verify", {}).get("inliers", 0), a.get("verify", {}).get("ncc", 0))) if entry["attempts"] else {}
        entry["outcome"] = "un-localized"
        entry["reason"] = (f"no seeded plan box verified: best attempt inliers="
                           f"{best_attempt.get('verify', {}).get('inliers', 0)}, ncc={best_attempt.get('verify', {}).get('ncc', 0)} "
                           f"(floors {PIN_MIN_INLIERS}/{PIN_MIN_NCC})")
        print(f"== {sid}: UN-LOCALIZED", flush=True)
    report["stills"][sid] = entry

json.dump(report, open(OUT, "w"), indent=1)
print("stage B done")
