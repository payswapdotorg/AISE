#!/usr/bin/env python3
"""
ANCHOR-003b — the photoset assembler.

Commits the REAL photoset bytes into the evidence tree and derives the
provenance manifest (per-photo: source URL, landing page, creator, license,
retrieval date, sha-256 content digest; declared fidelity class REAL) plus
the plan raster's geo-declaration (the rasterToScene handedness law inputs).

The stills are the USDA NRCS documentation photographs of the Szawlowski
Farm potato harvest (North Hatfield, Massachusetts) — public domain (PDM 1.0),
one real site, two flight days (2019-10-18 and 2019-10-22), mixed capture
quality (nadir aerials, oblique aerials, ground shots, close-ups) — exactly
the "real mixed-quality capture" the ANCHOR-002 deferment note named for
exercising the typed PARTIAL outcome.

The plan raster is a USGS NAIP ImageServer export over the farm (public
domain, EPSG:3857, north-up by construction — the handedness law's declared
convention is TRUE for this raster, not assumed).

Run once:
  python3 docs/productization-evidence/ANCHOR-003b/tools/assemble_photoset.py
"""

import hashlib
import json
import math
import shutil
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
TREE = HERE.parent                   # docs/productization-evidence/ANCHOR-003b/
PHOTOSET = TREE / "photoset"
SCRATCH = Path("/home/z/aise/scratch-probe")

# ---- The stills: USDA NRCS Szawlowski Farm documentation flights ----------
# source: USDAgov flickr account (https://www.flickr.com/photos/usdagov),
# creator: Lance Cheung (USDA), public domain (PDM 1.0), retrieved 2026-10-01.
STILLS = {
    # 20191022-NRCS-LSC series (flight day 2 — potato harvest aerials/grounds)
    "still-a01": {
        "file": "a0977",
        "title": "20191022-NRCS-LSC-0977",
        "url": "https://live.staticflickr.com/65535/49445864456_ca199ae305_b.jpg",
        "landing": "https://www.flickr.com/photos/41284017@N08/49445864456",
    },
    "still-a02": {
        "file": "a0978",
        "title": "20191022-NRCS-LSC-0978",
        "url": "https://live.staticflickr.com/65535/49445386393_1c1b0be47c_b.jpg",
        "landing": "https://www.flickr.com/photos/41284017@N08/49445386393",
    },
    "still-a03": {
        "file": "a0979",
        "title": "20191022-NRCS-LSC-0979",
        "url": "https://live.staticflickr.com/65535/49445385873_8e66debd47_b.jpg",
        "landing": "https://www.flickr.com/photos/41284017@N08/49445385873",
    },
    "still-a04": {
        "file": "a0980",
        "title": "20191022-NRCS-LSC-0980",
        "url": "https://live.staticflickr.com/65535/49445863486_cf0a3cc704_b.jpg",
        "landing": "https://www.flickr.com/photos/41284017@N08/49445863486",
    },
    "still-a05": {
        "file": "a0982",
        "title": "20191022-NRCS-LSC-0982",
        "url": "https://live.staticflickr.com/65535/49445385178_9d3b53006c_b.jpg",
        "landing": "https://www.flickr.com/photos/41284017@N08/49445385178",
    },
    "still-a06": {
        "file": "a0984",
        "title": "20191022-NRCS-LSC-0984",
        "url": "https://live.staticflickr.com/65535/49445384738_7567023183_b.jpg",
        "landing": "https://www.flickr.com/photos/41284017@N08/49445384738",
    },
    # 20191018-NRCS-LSC series (flight day 1 — the farm documentation flight)
    "still-b01": {
        "file": "b0001",
        "title": "20191018-NRCS-LSC-0001",
        "url": "https://live.staticflickr.com/65535/49431751221_d475059609_b.jpg",
        "landing": "https://www.flickr.com/photos/41284017@N08/49431751221",
    },
    "still-b02": {
        "file": "b0014",
        "title": "20191018-NRCS-LSC-0014",
        "url": "https://live.staticflickr.com/65535/49431744246_861d9e23b4_b.jpg",
        "landing": "https://www.flickr.com/photos/41284017@N08/49431744246",
    },
    "still-b03": {
        "file": "b0023",
        "title": "20191018-NRCS-LSC-0023",
        "url": "https://live.staticflickr.com/65535/48965693877_9985a585e6_b.jpg",
        "landing": "https://www.flickr.com/photos/41284017@N08/48965693877",
    },
    "still-b04": {
        "file": "b0032",
        "title": "20191018-NRCS-LSC-0032",
        "url": "https://live.staticflickr.com/65535/48965691832_1c6d54b6ce_b.jpg",
        "landing": "https://www.flickr.com/photos/41284017@N08/48965691832",
    },
    "still-b05": {
        "file": "b0198",
        "title": "20191018-NRCS-LSC-0198",
        "url": "https://live.staticflickr.com/65535/49445829387_38b6fa558a_b.jpg",
        "landing": "https://www.flickr.com/photos/41284017@N08/49445829387",
    },
    "still-b06": {
        "file": "b0388",
        "title": "20191018-NRCS-LSC-0388",
        "url": "https://live.staticflickr.com/65535/49445884077_923e64bf70_b.jpg",
        "landing": "https://www.flickr.com/photos/41284017@N08/49445884077",
    },
    "still-b07": {
        "file": "b0588",
        "title": "20191018-NRCS-LSC-0588",
        "url": "https://live.staticflickr.com/65535/49445433063_23d9caece6_b.jpg",
        "landing": "https://www.flickr.com/photos/41284017@N08/49445433063",
    },
    "still-b08": {
        "file": "b0620",
        "title": "20191018-NRCS-LSC-0620",
        "url": "https://live.staticflickr.com/65535/49445431443_a391ff34a8_b.jpg",
        "landing": "https://www.flickr.com/photos/41284017@N08/49445431443",
    },
    "still-b09": {
        "file": "b0764",
        "title": "20191018-NRCS-LSC-0764",
        "url": "https://live.staticflickr.com/65535/49446126582_7fed5300dc_b.jpg",
        "landing": "https://www.flickr.com/photos/41284017@N08/49446126582",
    },
    "still-b10": {
        "file": "b0812",
        "title": "20191018-NRCS-LSC-0812",
        "url": "https://live.staticflickr.com/65535/49446122267_6c8f467477_b.jpg",
        "landing": "https://www.flickr.com/photos/41284017@N08/49446122267",
    },
    "still-b11": {
        "file": "b0816",
        "title": "20191018-NRCS-LSC-0816",
        "url": "https://live.staticflickr.com/65535/49445420383_42c053a40a_b.jpg",
        "landing": "https://www.flickr.com/photos/41284017@N08/49445420383",
    },
    "still-b12": {
        "file": "b0829",
        "title": "20191018-NRCS-LSC-0829",
        "url": "https://live.staticflickr.com/65535/49445896321_3b7e774096_b.jpg",
        "landing": "https://www.flickr.com/photos/41284017@N08/49445896321",
    },
    "still-b13": {
        "file": "b0841",
        "title": "20191018-NRCS-LSC-0841",
        "url": "https://live.staticflickr.com/65535/49445895811_1f28547803_b.jpg",
        "landing": "https://www.flickr.com/photos/41284017@N08/49445895811",
    },
    "still-b14": {
        "file": "b0856",
        "title": "20191018-NRCS-LSC-0856",
        "url": "https://live.staticflickr.com/65535/49445895136_4ae30ce3f5_b.jpg",
        "landing": "https://www.flickr.com/photos/41284017@N08/49445895136",
    },
    "still-b15": {
        "file": "b0862",
        "title": "20191018-NRCS-LSC-0862",
        "url": "https://live.staticflickr.com/65535/49445894746_4c8d9d0e8d_b.jpg",
        "landing": "https://www.flickr.com/photos/41284017@N08/49445894746",
    },
    "still-b16": {
        "file": "b0927",
        "title": "20191018-NRCS-LSC-0927",
        "url": "https://live.staticflickr.com/65535/49445806142_fa036fe6b0_b.jpg",
        "landing": "https://www.flickr.com/photos/41284017@N08/49445806142",
    },
    "still-b17": {
        "file": "b0937",
        "title": "20191018-NRCS-LSC-0937",
        "url": "https://live.staticflickr.com/65535/49445657471_df1f7cc153_b.jpg",
        "landing": "https://www.flickr.com/photos/41284017@N08/49445657471",
    },
    "still-b18": {
        "file": "b0954",
        "title": "20191018-NRCS-LSC-0954",
        "url": "https://live.staticflickr.com/65535/49445175348_0da5384425_b.jpg",
        "landing": "https://www.flickr.com/photos/41284017@N08/49445175348",
    },
    "still-b19": {
        "file": "b0972",
        "title": "20191018-NRCS-LSC-0972",
        "url": "https://live.staticflickr.com/65535/49445175013_7ea0807bfd_b.jpg",
        "landing": "https://www.flickr.com/photos/41284017@N08/49445175013",
    },
    "still-b20": {
        "file": "b1322",
        "title": "20191018-NRCS-LSC-1322",
        "url": "https://live.staticflickr.com/65535/49445900297_2c53c47b63_b.jpg",
        "landing": "https://www.flickr.com/photos/41284017@N08/49445900297",
    },
    # 20191022-OSEC series (the farm visit grounds)
    "still-c01": {
        "file": "c0911",
        "title": "20191022-NRCS-LSC-0911",
        "url": "https://live.staticflickr.com/65535/49445527446_13f4c19eb4_b.jpg",
        "landing": "https://www.flickr.com/photos/41284017@N08/49445527446",
    },
    "still-c02": {
        "file": "c0916",
        "title": "20191022-NRCS-LSC-0916",
        "url": "https://live.staticflickr.com/65535/49445527226_71b8fec9f3_b.jpg",
        "landing": "https://www.flickr.com/photos/41284017@N08/49445527226",
    },
}

# ---- The plan raster geo-declaration ---------------------------------------
# USGS NAIP ImageServer export, EPSG:3857 (Web Mercator — north-up,
# x-east-right BY CONSTRUCTION), centered on the Szawlowski Farm,
# exported 4000x4000 over a 2400 m (mercator) box, resized to 3000x3000.
PLAN_CENTER_LON = -72.6235
PLAN_CENTER_LAT = 42.4400
PLAN_HALF_MERCATOR_M = 1200.0
PLAN_EXPORT_PX = 4000
PLAN_FINAL_PX = 3000
PLAN_CROP_SOURCE = SCRATCH / "hatfield" / "plan_farm_4000.jpg"


def sha256_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> int:
    PHOTOSET.mkdir(parents=True, exist_ok=True)

    # 1. The plan raster ---------------------------------------------------
    plan_path = PHOTOSET / "plan-raster.jpg"
    if not plan_path.exists():
        import cv2  # local import: assembly-time only, never in the provider
        plan = cv2.imread(str(PLAN_CROP_SOURCE), cv2.IMREAD_GRAYSCALE)
        if plan is None:
            print(f"FAIL: plan source {PLAN_CROP_SOURCE} missing — re-run the NAIP export first", file=sys.stderr)
            return 1
        resized = cv2.resize(plan, (PLAN_FINAL_PX, PLAN_FINAL_PX), interpolation=cv2.INTER_AREA)
        cv2.imwrite(str(plan_path), resized, [cv2.IMWRITE_JPEG_QUALITY, 92])
    plan_digest = sha256_file(plan_path)

    # rasterToScene derivation (TRUE ground scale; mercator is conformal so
    # the local scale factor 1/cos(lat) applies uniformly to both axes).
    coslat = math.cos(math.radians(PLAN_CENTER_LAT))
    ground_m_per_px = (2.0 * PLAN_HALF_MERCATOR_M * coslat) / PLAN_FINAL_PX
    pixels_per_meter = 1.0 / ground_m_per_px

    # 2. The stills ---------------------------------------------------------
    manifest_photos = []
    for key in sorted(STILLS):
        meta = STILLS[key]
        src = SCRATCH / "hatfield" / f"{meta['file']}.jpg"
        if not src.exists():
            print(f"FAIL: still source {src} missing", file=sys.stderr)
            return 1
        dst = PHOTOSET / f"{key}.jpg"
        shutil.copyfile(src, dst)
        digest = sha256_file(dst)
        manifest_photos.append({
            "stillId": key,
            "file": f"{key}.jpg",
            "contentDigestSha256": digest,
            "sourceUrl": meta["url"],
            "landingPage": meta["landing"],
            "sourceTitle": meta["title"],
            "creator": "Lance Cheung, USDA (flickr: USDAgov)",
            "license": {
                "identifier": "PDM 1.0",
                "statement": "public domain (US government work, 17 U.S.C. § 105)",
                "commercialUse": True,
                "rightsNote": "USDA photographs are public domain; attribution to USDA/Lance Cheung "
                              "is courtesy, not a legal requirement.",
            },
            "retrievedUtc": "2026-10-01",
            "captureSession": "USDA NRCS Szawlowski Farm documentation flights, North Hatfield MA, "
                              "2019-10-18 and 2019-10-22",
            "fidelityClass": "REAL",
            "fidelityNote": "real web-retrieved photograph of the Szawlowski Farm site — never "
                            "synthetic, never upgraded",
        })

    # 3. The manifest --------------------------------------------------------
    manifest = {
        "manifestId": "anchor003b-photoset/1",
        "site": {
            "name": "Szawlowski Farm (potato farm), North Hatfield, Massachusetts, USA",
            "centerLatLon": [PLAN_CENTER_LAT, PLAN_CENTER_LON],
            "description": "one real working farm in the Connecticut River valley, documented by "
                           "USDA NRCS over two flight days during the October 2019 potato harvest",
        },
        "planRaster": {
            "file": "plan-raster.jpg",
            "contentDigestSha256": plan_digest,
            "source": "USGS The National Map — NAIP orthoimagery (public domain), via the "
                      "USGSNAIPImagery ImageServer exportImage endpoint",
            "retrievedUtc": "2026-10-01",
            "exportParameters": {
                "service": "https://imagery.nationalmap.gov/arcgis/rest/services/USGSNAIPImagery/ImageServer/exportImage",
                "bboxSR": "EPSG:3857 (Web Mercator — north-up, x-east-right by construction)",
                "bboxCenterLonLat": [PLAN_CENTER_LON, PLAN_CENTER_LAT],
                "bboxHalfSizeMercatorM": PLAN_HALF_MERCATOR_M,
                "exportSizePx": [PLAN_EXPORT_PX, PLAN_EXPORT_PX],
                "finalSizePx": [PLAN_FINAL_PX, PLAN_FINAL_PX],
                "resize": "INTER_AREA downsample 4000->3000, grayscale, JPEG quality 92",
            },
            "rasterToScene": {
                "pixelsPerMeter": round(pixels_per_meter, 6),
                "xDirection": "east-right",
                "yDirection": "north-up",
                "worldOriginPx": [PLAN_FINAL_PX / 2.0, PLAN_FINAL_PX / 2.0],
                "derivation": f"Web Mercator box of {2*PLAN_HALF_MERCATOR_M:.0f} m centered at "
                              f"({PLAN_CENTER_LAT}, {PLAN_CENTER_LON}); conformal scale factor "
                              f"1/cos(lat) = {1/coslat:.6f}; true ground size "
                              f"{2*PLAN_HALF_MERCATOR_M*coslat:.1f} m over {PLAN_FINAL_PX} px = "
                              f"{ground_m_per_px:.6f} m/px => {pixels_per_meter:.6f} px/m; the "
                              "scene origin is declared at the raster center. THE HANDEDNESS LAW: "
                              "the north-up/east-right convention is TRUE for this raster by "
                              "construction (EPSG:3857 axis-aligned export), never assumed.",
            },
            "fidelityClass": "REAL",
            "fidelityNote": "real public-domain orthoimagery of the same site — a plan RASTER with "
                            "shared texture (not a line-art drawing; PORT.md §7's open gap)",
            "knownCaveat": "the NAIP mosaic vintage at this location is NOT the same day, month or "
                           "crop state as the October-2019 harvest photographs — the fields' "
                           "vegetation state differs; this is recorded honestly and is part of "
                           "what the evidence run measures",
        },
        "stills": manifest_photos,
        "counts": {
            "stills": len(manifest_photos),
            "planRasters": 1,
        },
        "rightsSummary": "Every still is a public-domain USDA photograph; the plan raster is "
                         "public-domain USGS NAIP orthoimagery. No license blocks the EVALUATION "
                         "use of this photoset inside AISE evidence. (Production promotion is a "
                         "separate substitution-contract §6 decision.)",
    }
    manifest_path = TREE / "provenance-manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n")
    print(f"photoset assembled: {len(manifest_photos)} stills + 1 plan raster")
    print(f"plan digest: {plan_digest}")
    print(f"manifest: {manifest_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
