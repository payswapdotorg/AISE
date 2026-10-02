#!/usr/bin/env python3
"""
ANCHOR-006 — the photoset assembler.

Commits the REAL campaign bytes into the evidence tree and derives the
provenance manifest:

  - the stills: the web-sourced center-pivot farmland photographs with
    per-photo provenance (source URL, landing page, creator, license,
    retrieval date, sha-256 digest, declared camera position/heading where
    the source metadata carries them, VLM vantage class) — fidelity class
    REAL, never upgraded;
  - the plan rasters of the RUN SET: per the run-record's declared rule —
    the stills are grouped by chained proximity (single-linkage <= 50 km
    between a still and its nearest grouped anchor — the first-fit
    founding-anchor grouping this replaces is recorded as a declared defect
    in run-record.md); every group with
    >= 2 stills (the redundancy law: a single-still request is refused by
    the adapter and is never issued) gets plan rasters sized by the group's
    QUALIFIED PINS: every still that pinned at the declared rule contributes
    ONE plan raster — THE CAMPAIGN'S PIN-VERIFYING EXPORT ITSELF (the exact
    span/GSD/center whose photometric verification pinned the still, byte-
    identical from the campaign cache; vintage + GSD matched at the MEASURED
    rung — the work order's requirement, never a guessed sizing) — and the
    whole >=2-still group rides every request (companion stills whose ground
    the plan does not cover are measured honestly; their refusal is a
    finding). Groups with pins but < 2 members, and groups with no pin at
    all (fallback: the camera-azimuth shared-region export, declared as
    such), are handled per the declared rule; stills that can join no >=2
    group are recorded in the manifest as not-runnable — never silently
    dropped;
  - each plan raster's geo-declaration (the rasterToScene handedness law
    inputs: EPSG:3857 north-up, TRUE by construction) and vintage record
    (the NAIP mosaic year/acquisition at the plan center, from the
    USGSNAIPImagery catalog — the ANCHOR-003b cross-vintage law makes
    vintage a first-order variable, so it is recorded per plan).

Run once (after the geolocation stages have written scan/stage-b.json
[pass 2 + the pin-audit retraction] AND scan/stage-b4.json [pass 3, the
corrected native-scale re-measurement]):
  python3 docs/productization-evidence/ANCHOR-006/tools/assemble_photoset.py
"""

import hashlib
import json
import math
import shutil
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
TREE = HERE.parent
PHOTOSET = TREE / "photoset"
CANDIDATES = Path("/home/z/candidates")
SCRATCH = Path("/home/z/scratch-anchor006")

# ---- The stills ------------------------------------------------------------
# The campaign's REAL stills, probed across the sourcing classes; the six
# with re-establishable provenance are committed. p01 (workman_pivot.jpg,
# a blind-scan probe) is EXCLUDED honestly: its source could not be
# re-established from the artifacts or the web — fidelity REAL requires a
# source URL; guessed provenance is fabricated provenance.
STILLS = [
    {
        "stillId": "p02-kelley-9364",
        "source": CANDIDATES / "nrcs_kelley_9364.jpg", "file": "still-p02-kelley-9364.jpg",
        "sourceUrl": "https://upload.wikimedia.org/wikipedia/commons/thumb/2/23/Aerial_photo_of_center_pivot_irrigations_systems_%289364%29.jpg/3840px-Aerial_photo_of_center_pivot_irrigations_systems_%289364%29.jpg",
        "landingPage": "https://commons.wikimedia.org/wiki/File:Aerial_photo_of_center_pivot_irrigations_systems_(9364).jpg",
        "sourceTitle": "File:Aerial photo of center pivot irrigations systems (9364).jpg — the Commons 3840px render (the campaign bytes; the Commons original is 7,018,566 B, sha1 6a04a8c891e3fd6789d7ced29d4751c0bb9b8280 — recorded via the Commons API; the file is a Commons mirror of flickr.com/photos/soilscience/5094148839)",
        "creator": "John A. Kelley, USDA Natural Resources Conservation Service (flickr: Soil Science)",
        "license": {
            "identifier": "public domain (US government work)",
            "statement": "US-government work (17 U.S.C. § 105); the Commons record declares Public domain (LicenseShortName via the Commons API); the NRCS credit statement applies as courtesy",
            "commercialUse": True,
            "rightsNote": "public domain as a USDA photograph; the NRCS credit statement applies as courtesy",
        },
        "retrievedUtc": "2026-10-02",
        "captureDate": "2009-05-18 12:16:18 (EXIF/Flickr dateTaken)",
        "cameraPosition": None, "cameraHeadingDeg": None,
        "vantageClass": "OBLIQUE (VLM: angled toward horizon, sky visible, >100 pivots, footprint ~5-8 km)",
        "region": "un-geolocated (no position metadata of any kind; NRCS soil-survey flight, region unrecorded at the source)",
        "geolocationNote": "blind z14 belt scan only (Stage A: no RANSAC survivor); no camera metadata — outside every seeded pass (1/2/3)",
    },
    {
        "stillId": "p03-famartin-dundy-a",
        "source": CANDIDATES / "famartin_dundy.jpg", "file": "still-p03-famartin-dundy-a.jpg",
        "sourceUrl": "https://upload.wikimedia.org/wikipedia/commons/thumb/2/2e/2022-09-11_14_43_00_Aerial_view_southward_across_southern_Dundy_County%2C_Nebraska_and_northern_Cheyenne_County%2C_Kansas.jpg/3840px-2022-09-11_14_43_00_Aerial_view_southward_across_southern_Dundy_County%2C_Nebraska_and_northern_Cheyenne_County%2C_Kansas.jpg",
        "landingPage": "https://commons.wikimedia.org/wiki/File:2022-09-11_14_43_00_Aerial_view_southward_across_southern_Dundy_County,_Nebraska_and_northern_Cheyenne_County,_Kansas.jpg",
        "sourceTitle": "File:2022-09-11 14 43 00 Aerial view southward across southern Dundy County, Nebraska and northern Cheyenne County, Kansas.jpg",
        "creator": "Famartin (Commons user:Famartin)",
        "license": {
            "identifier": "CC BY-SA 4.0",
            "statement": "Creative Commons Attribution-ShareAlike 4.0 International (self-published work)",
            "commercialUse": True,
            "rightsNote": "attribution + share-alike; evaluation use inside AISE evidence",
        },
        "retrievedUtc": "2026-10-02",
        "captureDate": "2022-09-11 14:43:00 (local, Commons title/EXIF)",
        "cameraPosition": [40.357204, -101.817504], "cameraHeadingDeg": 188.97,
        "vantageClass": "OBLIQUE (VLM: hazy horizon + sky visible, 20-25 pivots, footprint ~15-20 km)",
        "region": "southern Dundy County NE / northern Cheyenne County KS (camera position declared on the Commons page)",
        "geolocationNote": "blind z14 belt scan (Stage A) + camera-seeded pass 1 + azimuth-corrected pass 2 (its pin RETRACTED by the footprint audit) + corrected pass 3",
    },
    {
        "stillId": "p04-famartin-dundy-b",
        "source": CANDIDATES / "famartin_dundy2.jpg", "file": "still-p04-famartin-dundy-b.jpg",
        "sourceUrl": "https://upload.wikimedia.org/wikipedia/commons/thumb/7/73/2022-09-11_14_44_54_Aerial_view_southward_across_northeastern_Dundy_County%2C_Nebraska.jpg/3840px-2022-09-11_14_44_54_Aerial_view_southward_across_northeastern_Dundy_County%2C_Nebraska.jpg",
        "landingPage": "https://commons.wikimedia.org/wiki/File:2022-09-11_14_44_54_Aerial_view_southward_across_northeastern_Dundy_County,_Nebraska.jpg",
        "sourceTitle": "File:2022-09-11 14 44 54 Aerial view southward across northeastern Dundy County, Nebraska.jpg",
        "creator": "Famartin (Commons user:Famartin)",
        "license": {
            "identifier": "CC BY-SA 4.0",
            "statement": "Creative Commons Attribution-ShareAlike 4.0 International (self-published work)",
            "commercialUse": True,
            "rightsNote": "attribution + share-alike; evaluation use inside AISE evidence",
        },
        "retrievedUtc": "2026-10-02",
        "captureDate": "2022-09-11 14:44:54 (local, Commons title/EXIF)",
        "cameraPosition": [40.384872, -101.411194], "cameraHeadingDeg": 189.16,
        "vantageClass": "OBLIQUE (VLM: hazy horizon + sky visible, 15-18 pivots, footprint ~8-10 km)",
        "region": "northeastern Dundy County NE (camera position declared on the Commons page)",
        "geolocationNote": "blind z14 belt scan (Stage A) + camera-seeded pass 1 (partial) + azimuth-corrected pass 2 + corrected pass 3",
    },
    {
        "stillId": "p05-famartin-hitchcock",
        "source": CANDIDATES / "famartin_hitchcock.jpg", "file": "still-p05-famartin-hitchcock.jpg",
        "sourceUrl": "https://upload.wikimedia.org/wikipedia/commons/thumb/9/9a/2022-09-11_15_46_42_Aerial_view_southward_across_western_Hitchcock_County%2C_Nebraska%2C_centered_just_north_of_Swanson_Lake_within_Swanson_Reservoir_State_Recreation_Area.jpg/3840px-2022-09-11_15_46_42_Aerial_view_southward_across_western_Hitchcock_County%2C_Nebraska%2C_centered_just_north_of_Swanson_Lake_within_Swanson_Reservoir_State_Recreation_Area.jpg",
        "landingPage": "https://commons.wikimedia.org/wiki/File:2022-09-11_15_46_42_Aerial_view_southward_across_western_Hitchcock_County,_Nebraska,_centered_just_north_of_Swanson_Lake_within_Swanson_Reservoir_State_Recreation_Area.jpg",
        "sourceTitle": "File:2022-09-11 15 46 42 Aerial view southward across western Hitchcock County, Nebraska, centered just north of Swanson Lake within Swanson Reservoir State Recreation Area.jpg",
        "creator": "Famartin (Commons user:Famartin)",
        "license": {
            "identifier": "CC BY-SA 4.0",
            "statement": "Creative Commons Attribution-ShareAlike 4.0 International (self-published work)",
            "commercialUse": True,
            "rightsNote": "attribution + share-alike; evaluation use inside AISE evidence",
        },
        "retrievedUtc": "2026-10-02",
        "captureDate": "2022-09-11 15:46:42 (local, Commons title/EXIF)",
        "cameraPosition": [40.427981, -101.109358], "cameraHeadingDeg": 94.50,
        "vantageClass": "OBLIQUE (VLM: hazy horizon + sky visible, 8-10 pivots, footprint ~15-20 km, reservoir in view)",
        "region": "western Hitchcock County NE (camera position declared on the Commons page; heading east per the geohack type:camera record)",
        "geolocationNote": "blind z14 belt scan (Stage A) + camera-seeded pass 1 + azimuth-corrected pass 2 + corrected pass 3 (both candidate azimuths measured)",
    },
    {
        "stillId": "p06-kgs-finney",
        "source": CANDIDATES / "kgs_finney_aerial.jpg", "file": "still-p06-kgs-finney.jpg",
        "sourceUrl": "http://www.kgs.ku.edu/Publications/Photos/Finney/FI-Aerial-center-pivot.jpg",
        "landingPage": "https://chasm.kgs.ku.edu/ords/pubcat.phd2.View_Photo?f_id=19",
        "sourceTitle": "KGS Photo Library — FI-Aerial-center-pivot (Center Pivot Irrigation (Aerial), County: Finney)",
        "creator": "John Charlton / Kansas Geological Survey (University of Kansas)",
        "license": {
            "identifier": "non-commercial/educational with attribution (KGS photo library terms)",
            "statement": "This photo may be reproduced for non-commercial and educational purposes. When using this photo in a publication, website, or presentation, please credit Kansas Geological Survey. (KGS photo library credit page)",
            "commercialUse": False,
            "rightsNote": "NOT cleared for production promotion (the substitution §6 license dimension); evaluation-stage use only — recorded, never silently widened",
        },
        "retrievedUtc": "2026-10-02",
        "captureDate": None,
        "cameraPosition": None, "cameraHeadingDeg": None,
        "vantageClass": "OBLIQUE (VLM: horizon visible, ~50-60 pivots, footprint ~8-10 km)",
        "region": "Finney County KS (source metadata: the KGS photo library county record — the Garden City pivot belt)",
        "geolocationNote": "blind z14 belt scan (Stage A) + county-grid pass 1 + pass 2 (county centers absolute — unaffected by the unit bug; not re-run in pass 3)",
    },
    {
        "stillId": "p07-deverre-winter",
        "source": CANDIDATES / "deverre_4.jpg", "file": "still-p07-deverre-winter.jpg",
        "sourceUrl": "https://upload.wikimedia.org/wikipedia/commons/thumb/4/42/Aerial_view_of_center_pivot_irrigation_north_of_Deverre%2C_Nebraska_4.jpg/1920px-Aerial_view_of_center_pivot_irrigation_north_of_Deverre%2C_Nebraska_4.jpg",
        "landingPage": "https://commons.wikimedia.org/wiki/File:Aerial_view_of_center_pivot_irrigation_north_of_Deverre,_Nebraska_4.jpg",
        "sourceTitle": "File:Aerial view of center pivot irrigation north of Deverre, Nebraska 4.jpg",
        "creator": "Codrin.B (Commons user:Codrinb)",
        "license": {
            "identifier": "CC BY-SA 3.0/2.5/2.0/1.0 (multi) + GFDL",
            "statement": "Creative Commons Attribution-ShareAlike (multi-version) + GNU Free Documentation License (own work)",
            "commercialUse": True,
            "rightsNote": "attribution + share-alike; evaluation use inside AISE evidence",
        },
        "retrievedUtc": "2026-10-02",
        "captureDate": "2011-12-30 10:17:19 (Commons Date record)",
        "cameraPosition": [41.948257, -99.120712], "cameraHeadingDeg": None,
        "vantageClass": "OBLIQUE (VLM: winter/dormant, snow patches, horizon + sky visible, 15-20 pivots, footprint ~15-25 km)",
        "region": "north of Deverre, Blaine County NE (camera position declared on the Commons page; no heading declared)",
        "geolocationNote": "the cross-vintage attempt (winter 2011 vs NAIP summer); azimuth-sweep pass 2 + corrected azimuth-sweep pass 3",
    },
]

# The sourcing campaign record (what was probed and why it is or is not in
# the committed photoset) — carried into the manifest verbatim.
SOURCING = {
    "class": "center-pivot irrigation farmland (the ANCHOR-003b deferment-ledger #5)",
    "belt": "SW Nebraska / NW Kansas center-pivot irrigation belt: lat 39.0-41.0 N, lon -102.10..-100.75 W (z14 tiles 39.0-41.0N + the Finney County KS extension lat 38.0-38.55, lon -101.15..-100.35)",
    "probedNotCommitted": [
        {"file": "workman_pivot.jpg", "note": "blind-scan probe (Stage A p01); EXCLUDED — its source could not be re-established from the campaign artifacts or the web; fidelity REAL requires a source URL, and guessed provenance is fabricated provenance"},
        {"file": "deverre_1/2/3.jpg", "note": "the Commons API reports these files missing (deleted upstream); only Deverre 4 survives"},
        {"file": "kgs_trego_pivot.jpg", "note": "KGS Trego County TR-Center-Pivot probe — probed, not scanned (the Finney aerial was taken instead)"},
        {"file": "lewellen.jpg", "note": "a real Famartin Commons file (Garden County NE, 2022-03-28) — probed, not scanned, not committed"},
        {"file": "lewellen_center.jpg / kelley_center_crop.jpg", "note": "locally derived center crops for VLM probing — DERIVED, never stills"},
        {"file": "cand_usgs_1.jpg", "note": "a USGS media-gallery Landsat probe — satellite imagery, not an aerial photograph; dropped"},
        {"file": "tile_test.jpg", "note": "the z14 tile fetch test"},
    ],
    "searches": "Commons search/category dumps (fam1/fam2/cat_ks/cat_ne), Flickr searches (straight-down Kansas/Nebraska, nadir center pivot, pivot circles from airplane), NRCS Montana albums, Irrigation Toolbox galleries, KGS photo library, USDA/NRCS Flickr accounts (soilscience, usdagov), USGS TNM/NAIP endpoints",
}

EARTH = 20037508.342789244


def lonlat_to_merc(lon, lat):
    return lon * EARTH / 180.0, math.log(math.tan((90.0 + lat) * math.pi / 360.0)) * EARTH / math.pi


def sha256_file(p: Path) -> str:
    return hashlib.sha256(p.read_bytes()).hexdigest()


def haversine_m(lat1, lon1, lat2, lon2):
    r = 6371000.0
    a = math.sin(math.radians(lat2 - lat1) / 2) ** 2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(math.radians(lon2 - lon1) / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def geolocation_of(s, stage_b, stage_b4):
    """The per-still geolocation record: the full three-pass measurement
    story (Stage A blind scan -> pass 1 seeded -> pass 2 azimuth-corrected
    -> pin audit -> pass 3 corrected re-measurement), with the FINAL
    outcome = pass 3 where pass 3 measured the still (the corrected rule),
    else the standing record (p06: county grid was absolute; p02: no
    position metadata — the Stage-A blind scan stands)."""
    sid = s["stillId"]
    p2 = (stage_b.get("stills", {}).get(sid) or {})
    p3 = (stage_b4.get("stills", {}).get(sid) or {})
    # per-still stage-A / pass-1 accuracy (the generic lines would be FALSE
    # for p02/p06/p07 — the evidence discipline records what was MEASURED):
    if sid == "p07-deverre-winter":
        stage_a = ("not blind-scanned: sourced AFTER the Stage-A scan as the cross-vintage probe "
                   "(declared camera position, no heading); its first measurement was pass 1")
    else:
        stage_a = ("blind z14 belt scan (Stage A): no RANSAC survivor on any scale "
                   "(results/geolocation/stage-a-per-photo/)")
    if sid == "p02-kelley-9364":
        pass1 = "not run (no camera position in the source metadata — nothing to seed)"
    elif sid == "p06-kgs-finney":
        pass1 = ("county-grid boxes (Finney County KS absolute centers — NOT camera-seeded; unaffected by "
                 "the later unit bug): un-localized over 36 attempts (results/geolocation/stage-b-pass1.json)")
    elif sid == "p07-deverre-winter":
        pass1 = ("camera-seeded sweep (declared position, no heading): un-localized over 24 attempts "
                 "(results/geolocation/stage-b-pass1.json)")
    else:
        pass1 = ("camera-seeded boxes — measured the WRONG ground (boxes 78-111 km behind the southward "
                 "cameras; preserved at results/geolocation/stage-b-pass1.json)")
    if sid == "p02-kelley-9364":
        pass2_geometry = "not run (no camera position — nothing to seed)"
    elif sid == "p06-kgs-finney":
        pass2_geometry = "county-grid boxes (absolute Finney County centers — unaffected by the unit bug)"
    elif sid == "p07-deverre-winter":
        pass2_geometry = "azimuth sweep {N,E,S,W} from the declared position (no heading in the source)"
    else:
        pass2_geometry = "azimuth-corrected boxes (declared camera headings)"
    if sid == "p02-kelley-9364":
        pass2_defect = "not applicable (pass 2 did not run for this still)"
    elif sid == "p06-kgs-finney":
        pass2_defect = ("NOT affected: the county-grid centers were absolute (not derived from D/cross), "
                        "so the unit bug never applied; the pass-2 record stands")
    else:
        pass2_defect = ("the box generator divided kilometer-valued D/cross by 111320 (meters per degree) — every box "
                        "sat within ~20 m of the camera; the D-ladder was neutralized")
    out = {
        "stageA": stage_a,
        "pass1": pass1,
        "pass2": {
            "geometry": pass2_geometry,
            "outcome": p2.get("outcome", "not-in-pass-2"),
            "reason": p2.get("reason"),
            "pinRetractedByAudit": bool(p2.get("pinRetractedByAudit")),
            "defect": pass2_defect,
        },
    }
    if p3:
        out["pass3"] = {
            "geometry": "the corrected grid — boxes truly D km along the declared heading (unit bug fixed), photoScale 1.0 only, matcher top-500 (mirrors the adapter)",
            "outcome": p3.get("outcome"),
            "pin": p3.get("pin"),
            "reason": p3.get("reason"),
            "rule": ("the CORRECTED conjunctive rule declared by tools/pin_audit.py BEFORE the pass: inliers >= 8 AND "
                     "footprint NCC >= 0.30 AND footprint >= 25,000 plan-px AND sliver ratio >= 0.2 AND local warp "
                     "scales within [0.05, 20] plan-px/still-px"),
        }
        out["final"] = {"outcome": p3.get("outcome"), "pin": p3.get("pin"), "basis": "stage-B pass 3 (the corrected rule)"}
    else:
        why = (stage_b4.get("method", {}).get("notRescanned", {}) or {}).get(sid,
               "not in the declared pass-3 scope")
        out["pass3"] = {"outcome": "not-rescanned", "reason": why}
        out["final"] = {
            "outcome": p2.get("outcome", "un-localized" if sid != "p02-kelley-9364" else "un-localized (blind scan only)"),
            "pin": p2.get("pin"),
            "basis": ("stage-B pass 2 (the pass-3 corrected rule was not re-measured for this still — see pass3.reason; "
                      "the pass-2 record stands and its outcome is un-localized)"),
        }
    return out


def main() -> int:
    if not (SCRATCH / "scan" / "stage-b.json").exists():
        print("FAIL: scan/stage-b.json missing — run the geolocation stages first", file=sys.stderr)
        return 1
    if not (SCRATCH / "scan" / "stage-b4.json").exists():
        print("FAIL: scan/stage-b4.json missing — run stage B pass 3 (tools/stage_b4.py) first", file=sys.stderr)
        return 1
    stage_b = json.loads((SCRATCH / "scan" / "stage-b.json").read_text())
    stage_b4 = json.loads((SCRATCH / "scan" / "stage-b4.json").read_text())
    # the geolocation records of record, copied into the evidence tree:
    # pass 2 (with the in-record retraction + audit note) and pass 3
    GEO = TREE / "results" / "geolocation"
    GEO.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(SCRATCH / "scan" / "stage-b.json", GEO / "stage-b.json")
    shutil.copyfile(SCRATCH / "scan" / "stage-b4.json", GEO / "stage-b-pass3.json")
    verify_state = {}
    vf = SCRATCH / "source-verify.json"
    if vf.exists():
        verify_state = json.loads(vf.read_text())

    PHOTOSET.mkdir(parents=True, exist_ok=True)
    api_meta = verify_state.get("apiMetadata", {}) if isinstance(verify_state, dict) else {}

    # 1. the stills ----------------------------------------------------------
    still_records = []
    for s in STILLS:
        if not s["source"].exists():
            print(f"FAIL: still source {s['source']} missing", file=sys.stderr)
            return 1
        dst = PHOTOSET / s["file"]
        shutil.copyfile(s["source"], dst)
        digest = sha256_file(dst)
        pid = s["stillId"].split("-")[0]
        v = verify_state.get(pid, {})
        rec = {
            "stillId": s["stillId"],
            "file": s["file"],
            "contentDigestSha256": digest,
            "sourceUrl": s["sourceUrl"],
            "landingPage": s["landingPage"],
            "sourceTitle": s["sourceTitle"],
            "creator": s["creator"],
            "license": s["license"],
            "retrievedUtc": s["retrievedUtc"],
            "sourceReverification": {
                "status": v.get("status", "not-retried"),
                "url": v.get("url", s["sourceUrl"]),
                "verificationChannel": v.get(
                    "verificationChannel",
                    "the declared sourceUrl itself (direct re-download)"),
                "reverifiedSha256": v.get("sha256"),
                "reverifiedBytes": v.get("bytes"),
                "note": (
                    "re-downloaded from the declared sourceUrl; sha256 byte-identical with the committed bytes"
                    if v.get("status") == "verified-byte-identical" and not v.get("verificationChannel")
                    else (
                        "re-downloaded during the upload.wikimedia.org 429 block through the equivalent "
                        "commons.wikimedia.org/w/thumb.php render endpoint (the same renderer that serves "
                        "the declared thumb URL); sha256 byte-identical with the committed bytes — the block "
                        "and the channel switch are recorded in results/geolocation/source-retry-log.txt"
                        if v.get("status") == "verified-byte-identical"
                        else v.get("block", "re-verification pending at assembly time; the digest above is "
                                            "of the bytes retrieved from sourceUrl on the retrieval date")
                    )
                ),
            },
            "sourceApiMetadataVerification": api_meta.get(pid, {"status": "not-performed"}),
            "captureDate": s["captureDate"],
            "cameraPosition": s["cameraPosition"],
            "cameraHeadingDeg": s["cameraHeadingDeg"],
            "vantageClass": s["vantageClass"],
            "region": s["region"],
            "geolocationNote": s["geolocationNote"],
            "geolocation": geolocation_of(s, stage_b, stage_b4),
            "fidelityClass": "REAL",
            "fidelityNote": "real web-retrieved photograph of the center-pivot irrigation farmland class — never synthetic, never upgraded",
        }
        still_records.append(rec)

    # 2. the run set ----------------------------------------------------------
    # Group by chained proximity (single-linkage <= 50 km between a still and
    # its nearest grouped anchor; the first-fit founding-anchor test this
    # replaces is recorded as a defect in run-record.md).
    # Every group with >= 2 stills gets ONE shared-region plan; the plan
    # center follows the pins when they exist, the camera-azimuth geometry
    # otherwise; groups with < 2 stills are recorded not-runnable.
    def anchor_of(rec):
        g = rec["geolocation"]["final"]
        if g.get("pin"):
            return (g["pin"]["lat"], g["pin"]["lon"]), "pin"
        if rec["cameraPosition"]:
            return (rec["cameraPosition"][0], rec["cameraPosition"][1]), "camera"
        return None, "none"

    groups: list[list] = []
    anchorless = []
    for rec in still_records:
        a, kind = anchor_of(rec)
        if a is None:
            anchorless.append(rec)
            continue
        placed = False
        for g in groups:
            # single-linkage chaining: a still joins a group when within 50 km
            # of ANY grouped anchor (the chained reading of the declared 50 km
            # proximity constant). The first-fit implementation this replaces
            # tested only against each group's FOUNDING anchor — an incidental
            # loop artifact, not a declared law — which stranded p05 (26 km
            # from p04, 60 km from p03) as not-runnable; the defect and the
            # fix are declared in run-record.md §the run set.
            if any(haversine_m(a[0], a[1], ga[0], ga[1]) <= 50000.0 for ga in g["anchors"]):
                g["members"].append(rec)
                g["anchors"].append(a)
                placed = True
                break
        if not placed:
            groups.append({"members": [rec], "anchors": [a]})
    # stills with NO anchor at all (no pin, no declared camera position) can
    # never join a >=2 group — recorded not-runnable, never silently dropped
    not_runnable = []
    for rec in anchorless:
        not_runnable.append({
            "stillId": rec["stillId"],
            "reason": ("no pin and no declared camera position (the source metadata carries neither) — "
                       "cannot join any >=2-still group; the redundancy law: single-still requests are "
                       "refused and never issued"),
        })

    plan_records = []

    def merc_to_lonlat(x, y):
        return x / EARTH * 180.0, math.degrees(2 * math.atan(math.exp(y * math.pi / EARTH)) - math.pi / 2)

    def naip_catalog_at_merc(cx, cy):
        # the NAIP mosaic vintage record at a mercator point (the ImageServer
        # catalog — the ANCHOR-003b cross-vintage law makes vintage a
        # first-order variable, recorded per plan)
        import urllib.request
        import urllib.parse
        ua = {"User-Agent": "AISE-ANCHOR-006-evidence/1.0 (NAIP export; public domain)"}
        q = {"geometry": json.dumps({"x": cx, "y": cy, "spatialReference": {"wkid": 102100}}),
             "geometryType": "esriGeometryPoint", "inSR": 102100,
             "spatialRel": "esriSpatialRelIntersects",
             "outFields": "OBJECTID,Name,Year,State,acquisition_date,resolution_value",
             "returnGeometry": "false", "resultRecordCount": "20", "f": "json"}
        qq = ("https://imagery.nationalmap.gov/arcgis/rest/services/USGSNAIPImagery/ImageServer/query?"
              + urllib.parse.urlencode(q))
        try:
            with urllib.request.urlopen(urllib.request.Request(qq, headers=ua), timeout=60) as r:
                d = json.loads(r.read())
        except Exception as e:
            return {"error": str(e)}
        best = None
        for f in d.get("features", []):
            a = f["attributes"]
            if a.get("Year") and (best is None or a["Year"] > best["Year"]):
                best = a
        return best or {}

    def iso_acq(cat):
        acq = cat.get("acquisition_date")
        if isinstance(acq, (int, float)) and acq:
            import datetime
            return datetime.datetime.fromtimestamp(acq / 1000.0, datetime.timezone.utc).strftime("%Y-%m-%d")
        return None

    for gi, g in enumerate(groups):
        members = g["members"]
        if len(members) < 2:
            for m in members:
                not_runnable.append({"stillId": m["stillId"], "reason": "no >=2-still group within 50 km (the redundancy law: single-still requests are refused and never issued)"})
            continue
        pinned = [m for m in members if m["geolocation"]["final"].get("pin")]
        if pinned:
            # THE PIN-VERIFIED RUNG DESIGN (the work order's vintage+GSD
            # matching, measured not guessed): every QUALIFIED pin gets ONE
            # plan raster — THE CAMPAIGN'S PIN-VERIFYING EXPORT ITSELF, the
            # exact span/GSD/center whose photometric verification pinned the
            # still (results/geolocation/stage-b.json: planPath + planUrl +
            # ncc/inliers/footprint) — committed byte-identical from the
            # campaign cache. The whole >=2-still group rides every request
            # (the redundancy law); a companion still whose ground the plan
            # does not cover is measured honestly — its refusal is a finding,
            # never a fabrication.
            for pm in pinned:
                pin = pm["geolocation"]["final"]["pin"]
                src = Path(pin["planPath"])
                if not src.exists():
                    print(f"FAIL: pin-verifying plan {src} missing from the campaign cache", file=sys.stderr)
                    return 1
                sid_short = pm["stillId"].split("-")[0]
                plan_file = f"plan-anchor006-{sid_short}-pin.jpg"
                shutil.copyfile(src, PHOTOSET / plan_file)
                plan_digest = sha256_file(PHOTOSET / plan_file)
                url = pin["planUrl"]
                bbox = [float(v) for v in url.split("bbox=")[1].split("&")[0].split(",")]
                size = url.split("size=")[1].split("&")[0].split(",")
                px, py = int(size[0]), int(size[1])
                span_merc = bbox[2] - bbox[0]
                cx, cy = (bbox[0] + bbox[2]) / 2.0, (bbox[1] + bbox[3]) / 2.0
                clon, clat = merc_to_lonlat(cx, cy)
                ground_m = span_merc * math.cos(math.radians(clat))
                ground_m_per_px = ground_m / px
                ppm = px / ground_m
                cat = naip_catalog_at_merc(cx, cy)
                pb = pin["planBox"]
                plan_records.append({
                    "planId": f"plan-anchor006-{sid_short}-pin",
                    "file": plan_file,
                    "contentDigestSha256": plan_digest,
                    "role": ("pin-verifying export — the campaign's qualified pin (vintage+GSD matched at the "
                             "MEASURED rung that verified the pin, never a guessed sizing)"),
                    "region": {
                        "centerLatLon": [round(clat, 6), round(clon, 6)],
                        "groundSpanM": round(ground_m, 1),
                        "coversStills": [pm["stillId"]],
                        "ridingStills": [m["stillId"] for m in members if m["stillId"] != pm["stillId"]],
                        "geometryBasis": "the pin-verifying plan box (stage-B pass 3 — the corrected grid; box center/span/GSD recorded in results/geolocation/stage-b-pass3.json)",
                    },
                    "source": "USGS The National Map — NAIP orthoimagery (public domain), via the USGSNAIPImagery ImageServer exportImage endpoint",
                    "retrievedUtc": "2026-10-02",
                    "exportParameters": {
                        "service": "https://imagery.nationalmap.gov/arcgis/rest/services/USGSNAIPImagery/ImageServer/exportImage",
                        "url": url,
                        "bboxSR": "EPSG:3857 (Web Mercator — north-up, x-east-right by construction)",
                        "bboxMercatorM": [round(v, 3) for v in bbox],
                        "spanMercatorM": round(span_merc, 1),
                        "exportSizePx": [px, py],
                    },
                    "pinVerification": {
                        "stillId": pm["stillId"],
                        "ncc": pin["ncc"], "inliers": pin["inliers"], "matches": pin["matches"],
                        "footprintPx": pin.get("footprintPx"),
                        "quadAreaPlanPx": pin.get("quadAreaPlanPx"),
                        "sliverRatio": pin.get("sliverRatio"),
                        "localScaleX": pin.get("localScaleX"), "localScaleY": pin.get("localScaleY"),
                        "photoScaleAtPin": 1.0,
                        "pinLatLon": [pin["lat"], pin["lon"]],
                        "pinTileZXY": pin["tile"],
                        "pinToCameraM": pin.get("pinToCameraM"),
                        "rule": ("inliers >= 8 AND footprint NCC >= 0.30 AND footprint >= 25,000 plan-px AND sliver ratio "
                                 ">= 0.2 AND local warp scales within [0.05, 20] plan-px/still-px — the CORRECTED rule "
                                 "declared by tools/pin_audit.py BEFORE stage-B pass 3 (the pass-2 rule lacked the "
                                 "footprint-plausibility floors and its single pin was degenerate and retracted); the pin "
                                 "is the photogrammetric estimate (principal point through the verified homography), "
                                 "never the seed"),
                        "pass": "3 (the corrected native-scale re-measurement; photoScale 1.0 only, matcher top-500 mirroring the adapter)",
                    },
                    "vintage": {
                        "naipNameAtPlanCenter": cat.get("Name"),
                        "naipYearAtPlanCenter": cat.get("Year"),
                        "naipStateAtPlanCenter": cat.get("State"),
                        "naipAcquisitionAtPlanCenter": iso_acq(cat) or cat.get("acquisition_date"),
                        "naipNameAtPin": (pin.get("naipCatalogAtPin") or {}).get("Name"),
                        "naipAcquisitionAtPin": iso_acq(pin.get("naipCatalogAtPin") or {}),
                        "sourceResolutionM": cat.get("resolution_value"),
                        "note": "the NAIP mosaic vintage at the plan center and at the pin (the ANCHOR-003b cross-vintage law: same-coordinate ortho-vs-ortho NCC 0.27-0.32 across vintages — vintage is a first-order variable; the pin verified against THIS mosaic)",
                    },
                    "gsd": {
                        "mercatorMetersPerPixel": pb["gsdM"],
                        "groundMetersPerPixel": round(ground_m_per_px, 4),
                        "note": (f"the campaign ladder rung that verified the pin: {pb['spanKm']:g} km EPSG:3857 span "
                                 f"at {pb['gsdM']:g} m/px mercator ({ground_m_per_px:.2f} m/px ground at this latitude) "
                                 f"over {px} px; the pin verified at photo scale 1.0 (pass 3 measures at "
                                 "photoScale 1.0 ONLY — the adapter's operating point) — the still's "
                                 "far-field effective GSD is matched to this plan at that scale. THE WORK ORDER'S "
                                 "GSD-MATCHING REQUIREMENT: the rung is the MEASURED one, not a guessed sizing"),
                    },
                    "rasterToScene": {
                        "pixelsPerMeter": round(ppm, 6),
                        "xDirection": "east-right",
                        "yDirection": "north-up",
                        "worldOriginPx": [px / 2.0, py / 2.0],
                        "derivation": (f"the export bbox {bbox[0]:.1f},{bbox[1]:.1f},{bbox[2]:.1f},{bbox[3]:.1f} "
                                       f"(EPSG:3857) over {px}x{py} px = {span_merc:.0f} mercator m = {ground_m:.0f} "
                                       f"ground m at {clat:.4f}N => {ground_m_per_px:.4f} ground m/px => "
                                       f"{ppm:.6f} px/m; the scene origin is declared at the raster center "
                                       f"({px/2.0:.0f}, {py/2.0:.0f}). THE HANDEDNESS LAW: the north-up/east-right "
                                       "convention is TRUE for this raster by construction (EPSG:3857 axis-aligned "
                                       "export), never assumed."),
                    },
                    "fidelityClass": "REAL",
                    "fidelityNote": "real public-domain orthoimagery of the pivot belt — the exact export whose photometric verification pinned the still",
                    "knownCaveat": ("the NAIP mosaic is a different flight than the photograph (see vintage); the "
                                    "photograph was taken ~5 weeks after this NAIP acquisition where the vintages "
                                    "match by year — the residual phenology drift is part of what the run measures; "
                                    "companion stills riding for the redundancy law may depict ground OUTSIDE this "
                                    "plan raster — their honest refusal is expected, never a fabrication"),
                    "stills": [m["stillId"] for m in members],
                })
        else:
            # FALLBACK (no still in this group pinned at the declared rule):
            # the camera-azimuth shared-region export — the group's honest
            # un-qualified attempt, declared as such.
            role = "fallback-shared-region (no still pinned at the declared rule; the camera-azimuth geometry declared instead)"
            pts = []
            for m in members:
                clat0, clon0 = m["cameraPosition"]
                hd = m["cameraHeadingDeg"]
                if hd is None:
                    pts.append((clat0, clon0))
                else:
                    az = math.radians(hd)
                    pts.append((clat0 + 10000.0 * math.cos(az) / 111320.0,
                                clon0 + 10000.0 * math.sin(az) / (111320.0 * math.cos(math.radians(clat0)))))
            clat = sum(p[0] for p in pts) / len(pts)
            clon = sum(p[1] for p in pts) / len(pts)
            ground_m = 48000.0
            px = 3000
            coslat = math.cos(math.radians(clat))
            merc = ground_m / coslat
            cx, cy = lonlat_to_merc(clon, clat)
            half = merc / 2.0
            import urllib.request
            ua = {"User-Agent": "AISE-ANCHOR-006-evidence/1.0 (NAIP export; public domain)"}
            url = ("https://imagery.nationalmap.gov/arcgis/rest/services/USGSNAIPImagery/ImageServer/exportImage"
                   f"?bbox={cx-half:.3f},{cy-half:.3f},{cx+half:.3f},{cy+half:.3f}&bboxSR=3857&imageSR=3857"
                   f"&size={px},{px}&format=jpg&interpolation=RSP_BilinearInterpolation&f=image")
            req = urllib.request.Request(url, headers=ua)
            with urllib.request.urlopen(req, timeout=180) as r:
                data = r.read()
            if len(data) < 500:
                print(f"FAIL: suspiciously small fallback export ({len(data)} B)", file=sys.stderr)
                return 1
            plan_file = f"plan-anchor006-g{gi:02d}-fallback.jpg"
            (PHOTOSET / plan_file).write_bytes(data)
            plan_digest = sha256_file(PHOTOSET / plan_file)
            ground_m_per_px = ground_m / px
            ppm = 1.0 / ground_m_per_px
            cat = naip_catalog_at_merc(cx, cy)
            plan_records.append({
                "planId": f"plan-anchor006-g{gi:02d}-fallback",
                "file": plan_file,
                "contentDigestSha256": plan_digest,
                "role": role,
                "region": {
                    "centerLatLon": [round(clat, 6), round(clon, 6)],
                    "groundSpanM": ground_m,
                    "coversStills": [m["stillId"] for m in members],
                    "geometryBasis": "declared camera positions + headings, D=10 km along azimuth (NOT pins — nothing qualified)",
                },
                "source": "USGS The National Map — NAIP orthoimagery (public domain), via the USGSNAIPImagery ImageServer exportImage endpoint",
                "retrievedUtc": "2026-10-02",
                "exportParameters": {
                    "service": "https://imagery.nationalmap.gov/arcgis/rest/services/USGSNAIPImagery/ImageServer/exportImage",
                    "url": url,
                    "bboxSR": "EPSG:3857 (Web Mercator — north-up, x-east-right by construction)",
                    "bboxCenterLonLat": [round(clon, 6), round(clat, 6)],
                    "groundSpanM": ground_m,
                    "exportSizePx": [px, px],
                },
                "vintage": {
                    "naipNameAtPlanCenter": cat.get("Name"),
                    "naipYearAtPlanCenter": cat.get("Year"),
                    "naipStateAtPlanCenter": cat.get("State"),
                    "naipAcquisitionAtPlanCenter": iso_acq(cat) or cat.get("acquisition_date"),
                    "sourceResolutionM": cat.get("resolution_value"),
                    "note": "the NAIP mosaic vintage at the plan center (the ANCHOR-003b cross-vintage law: vintage is a first-order variable, recorded per plan)",
                },
                "gsd": {
                    "mercatorMetersPerPixel": round(merc / px, 4),
                    "groundMetersPerPixel": round(ground_m_per_px, 4),
                    "note": "48.0 km ground square at 3000 px — single-square px so rasterToScene.pixelsPerMeter is exact; a DECLARED COARSE fallback (nothing in this group pinned, so no measured rung exists to match)",
                },
                "rasterToScene": {
                    "pixelsPerMeter": round(ppm, 6),
                    "xDirection": "east-right",
                    "yDirection": "north-up",
                    "worldOriginPx": [px / 2.0, px / 2.0],
                    "derivation": f"ground box of {ground_m:.0f} m centered at ({clat:.6f}, {clon:.6f}); "
                                   f"{ground_m:.0f} m over {px} px = {ground_m_per_px:.4f} ground m/px => "
                                   f"{ppm:.6f} px/m; the scene origin is declared at the raster center. THE HANDEDNESS LAW: "
                                   "the north-up/east-right convention is TRUE for this raster by construction "
                                   "(EPSG:3857 axis-aligned export), never assumed.",
                },
                "fidelityClass": "REAL",
                "fidelityNote": "real public-domain orthoimagery of the pivot belt at the group's declared region",
                "knownCaveat": "the NAIP mosaic is a different flight than the photographs (see vintage); the crop state may have moved between the two dates — recorded honestly, part of what the run measures",
                "stills": [m["stillId"] for m in members],
            })

    # 3. the manifest ---------------------------------------------------------
    manifest = {
        "manifestId": "anchor006-photoset/1",
        "campaign": {
            "workItem": "ANCHOR-006 — geolocating the center-pivot irrigation farmland class (the ANCHOR-003b deferment-ledger #5)",
            "belt": SOURCING["belt"],
            "class": SOURCING["class"],
            "sourcing": SOURCING,
        },
        "stills": still_records,
        "planRasters": plan_records,
        "notRunnable": not_runnable,
        "counts": {
            "stills": len(still_records),
            "planRasters": len(plan_records),
            "notRunnableStills": len(not_runnable),
        },
        "rightsSummary":
            "The stills are CC BY-SA (Famartin x3, Codrin.B x1), public-domain-as-USDA (Kelley), and " +
            "non-commercial/educational KGS terms (Finney — NOT cleared for production promotion; the " +
            "substitution §6 license dimension records it). The plan rasters are public-domain USGS NAIP " +
            "orthoimagery. No license blocks the EVALUATION use of this photoset inside AISE evidence; " +
            "production promotion is a separate §6 decision.",
    }
    (TREE / "provenance-manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print(f"photoset assembled: {len(still_records)} stills + {len(plan_records)} plan raster(s); not-runnable: {len(not_runnable)}")
    for p in plan_records:
        print(f"  {p['planId']} ({p['role']}): {p['file']} digest {p['contentDigestSha256'][:16]}… covers {p['stills']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
