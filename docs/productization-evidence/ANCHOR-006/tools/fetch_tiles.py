#!/usr/bin/env python3
"""ANCHOR-006 — z14 tile-cache fetcher for the SW-NE/NW-KS pivot belt.

Fetches USGS Imagery Only (The National Map tile cache — public domain)
z14 tiles over the belt box: lat 39.0-41.0 N, lon -102.10..-100.75 W.
Records every fetch outcome (ok/404/error) to fetch-log.json.
"""
import concurrent.futures as cf
import hashlib
import json
import math
import os
import sys
import time
import urllib.request
import urllib.error

Z = 14
LAT_MIN, LAT_MAX = 39.0, 41.0
LON_MIN, LON_MAX = -102.10, -100.75
TILE_DIR = "/home/z/scratch-anchor006/tiles/z14"
UA = {"User-Agent": "AISE-ANCHOR-006-evidence/1.0 (tile-scan cache build; USGS TNM public domain)"}

def lon_to_x(lon, z):
    return int((lon + 180.0) / 360.0 * (1 << z))

def lat_to_y(lat, z):
    lat = max(-85.05, min(85.05, math.radians(lat)))
    return int((1.0 - math.asinh(math.tan(lat)) / math.pi) / 2.0 * (1 << z))

x0, x1 = lon_to_x(LON_MIN, Z), lon_to_x(LON_MAX, Z)
y0, y1 = lat_to_y(LAT_MAX, Z), lat_to_y(LAT_MIN, Z)   # y grows southward
print(f"belt z14: x {x0}..{x1} ({x1-x0+1} cols), y {y0}..{y1} ({y1-y0+1} rows), total {(x1-x0+1)*(y1-y0+1)}")

def fetch_one(job):
    x, y = job
    path = f"{TILE_DIR}/{y}_{x}.jpg"
    if os.path.exists(path):
        return (x, y, "cached", 0)
    url = f"https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/{Z}/{y}/{x}"
    for attempt in range(3):
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=30) as r:
                data = r.read()
            # empty tiles (no coverage) come back as tiny/uniform JPEGs
            if len(data) < 200:
                return (x, y, "empty", len(data))
            # uniform-color tile check
            import io
            with open(path + ".tmp", "wb") as f:
                f.write(data)
            return (x, y, "ok", len(data))
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return (x, y, "404", 0)
            time.sleep(1.0 + attempt)
        except Exception:
            time.sleep(1.0 + attempt)
    return (x, y, "error", 0)

jobs = [(x, y) for y in range(y0, y1 + 1) for x in range(x0, x1 + 1)]
log = {"ok": 0, "404": 0, "empty": 0, "error": 0, "cached": 0}
results = []
t0 = time.time()
with cf.ThreadPoolExecutor(max_workers=8) as ex:
    for i, (x, y, status, nbytes) in enumerate(ex.map(fetch_one, jobs)):
        log[status] = log.get(status, 0) + 1
        if status == "error":
            results.append({"x": x, "y": y, "status": status})
        if (i + 1) % 500 == 0:
            print(f"{i+1}/{len(jobs)} {log} {time.time()-t0:.0f}s", flush=True)
# finalize tmp files
for fn in os.listdir(TILE_DIR):
    if fn.endswith(".tmp"):
        os.rename(os.path.join(TILE_DIR, fn), os.path.join(TILE_DIR, fn[:-4]))
log["elapsed_s"] = round(time.time() - t0, 1)
log["belt"] = {"z": Z, "lat": [LAT_MIN, LAT_MAX], "lon": [LON_MIN, LON_MAX],
               "x": [x0, x1], "y": [y0, y1], "tiles": len(jobs)}
json.dump({"log": log, "errors": results}, open("/home/z/scratch-anchor006/fetch-log.json", "w"), indent=1)
print("DONE", log)
