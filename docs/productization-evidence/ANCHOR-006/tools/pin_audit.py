#!/usr/bin/env python3
"""ANCHOR-006 — the pin audit (the footprint-plausibility re-judgement).

WHY THIS EXISTS. The stage-B pass-2 pin rule was `inliers >= 8 AND footprint
NCC >= 0.30`, with the footprint pixel count recorded but NOT floored. The
p03 pin that passed it (8 inliers, NCC 0.3649, footprint 2747 plan-px on the
12 km / 4 m-px rung) was audited by reproducing its verification with the
campaign's exact parameters at three RANSAC seeds: every draw recovers a
DEGENERATE warp — the whole 960x720 (photoScale 0.25) still maps into a
~126-plan-px SLIVER quad (bounding box 406x172 px, corner set nearly
collinear), with a local y-scale of 42 plan-px per still-px at the principal
point. The photometric NCC that "verified" it is a small-patch spurious
correlation — pivot-belt texture correlating with pivot-belt texture over a
few thousand pixels. The same pattern holds for every high-NCC near-miss in
the journal (p04's best NCC 0.3088 rode a 588-px footprint; p05's 0.2569 a
906-px footprint): small footprints make the NCC floor easy to pass
spuriously, and the rule admitted them.

THE HONEST RESPONSE (fail-closed, zero-fabrication):
  1. The p03 pin is RETRACTED — re-judged un-localized. A "pin" whose warp
     squashes the whole still into a hundred-pixel sliver is fabricated
     geometry that happened to pass a weak gate; recording it as a pin would
     violate the mission's honesty clause (geolocation must be MEASURED, and
     this measurement is degenerate).
  2. The corrected pin rule is DECLARED here (before any re-measurement):
       inliers >= 8 AND footprint NCC >= 0.30 (the original floors), AND
       footprint plausibility: quad area >= 25,000 plan-px (a ~160x160 px
       ground patch at 3000-px plans — small enough for a genuinely oblique
       partial overlap, far above the 126-2747 px slivers), AND the
       re-measurement (stage_b4) additionally records quad sliver ratio and
       local warp anisotropy for every attempt.
  3. The re-judgement is applied DETERMINISTICALLY to every recorded attempt
     in scan/stage-b.json (the journal already carries footprintPx per
     attempt) — no attempt is re-run to change its numbers; the audit only
     re-judges the recorded ones.

Outputs:
  results/geolocation/pin-audit.json  — the full audit record
  (and updates /home/z/scratch-anchor006/scan/stage-b.json in place:
   the p03 pin is preserved verbatim under pinRetractedByAudit with the
   outcome re-judged; attempts and the journal are NOT touched)

Run:
  python3 docs/productization-evidence/ANCHOR-006/tools/pin_audit.py
"""

import json
import math
import sys
from pathlib import Path

import cv2
import numpy as np

HERE = Path(__file__).resolve().parent
TREE = HERE.parent
GEO = TREE / "results" / "geolocation"
SCRATCH = Path("/home/z/scratch-anchor006")
CLAHE = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))

MIN_INLIERS = 8
MIN_NCC = 0.30
MIN_FOOTPRINT_PX = 25_000  # the corrected plausibility floor (declared here)

SEEDS = (1234, 777, 20261002)


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


def reproduce_pin_geometry():
    """Reproduce the p03 pin attempt (campaign parameters, multi-seed) and
    measure the warp geometry: quad area, sliver ratio, local anisotropy."""
    plan_path = SCRATCH / "plans" / "p03-famartin-dundy-a_b04_s120_g040.jpg"
    still_path = Path("/home/z/candidates/famartin_dundy.jpg")
    ps = 0.25
    photo0 = cv2.imread(str(still_path), cv2.IMREAD_GRAYSCALE)
    plan = cv2.imread(str(plan_path), cv2.IMREAD_GRAYSCALE)
    photo = cv2.resize(photo0, None, fx=ps, fy=ps, interpolation=cv2.INTER_AREA)
    sift = cv2.SIFT_create(nfeatures=40000, contrastThreshold=0.02, edgeThreshold=15)
    plan_eq = CLAHE.apply(plan)
    photo_eq = CLAHE.apply(photo)
    kp_p, des_p = sift.detectAndCompute(plan_eq, None)
    kp_s, des_s = sift.detectAndCompute(photo_eq, None)
    mq, mp = mutual_nearest(des_s, des_p, 800)
    src = np.float32([kp_p[i].pt for i in mp])
    dst = np.float32([kp_s[i].pt for i in mq])
    hw, hh = photo.shape[1], photo.shape[0]
    out = []
    for seed in SEEDS:
        cv2.setRNGSeed(seed)
        H, mask = cv2.findHomography(src, dst, cv2.RANSAC, 4.0, maxIters=20000, confidence=0.9999)
        if H is None:
            out.append({"seed": seed, "note": "no homography"})
            continue
        Hinv = np.linalg.inv(H)
        corners = np.float32([[0, 0], [hw, 0], [hw, hh], [0, hh]]).reshape(-1, 1, 2)
        quad = cv2.perspectiveTransform(corners, Hinv.astype(np.float32)).reshape(-1, 2)
        area = float(cv2.contourArea(quad.astype(np.float32)))
        bbox = float((quad[:, 0].max() - quad[:, 0].min()) * (quad[:, 1].max() - quad[:, 1].min()))
        base = Hinv @ np.array([hw / 2.0, hh / 2.0, 1.0]); base = base[:2] / base[2]
        eps = 5.0
        dxv = Hinv @ np.array([hw / 2.0 + eps, hh / 2.0, 1.0]); dxv = dxv[:2] / dxv[2]
        dyv = Hinv @ np.array([hw / 2.0, hh / 2.0 + eps, 1.0]); dyv = dyv[:2] / dyv[2]
        sx = float(np.linalg.norm(dxv - base) / eps)
        sy = float(np.linalg.norm(dyv - base) / eps)
        out.append({
            "seed": seed,
            "inliers": int(mask.sum()),
            "quadAreaPlanPx": round(area, 1),
            "quadBboxAreaPlanPx": round(bbox, 1),
            "sliverRatio": round(area / bbox, 4) if bbox > 0 else None,
            "localScaleXPlanPxPerStillPx": round(sx, 4),
            "localScaleYPlanPxPerStillPx": round(sy, 4),
            "verdict": ("DEGENERATE" if (area < MIN_FOOTPRINT_PX or (bbox > 0 and area / bbox < 0.2)
                         or not (0.05 <= sx <= 20.0) or not (0.05 <= sy <= 20.0)) else "plausible"),
        })
    return out


def main() -> int:
    sb_path = SCRATCH / "scan" / "stage-b.json"
    sb = json.loads(sb_path.read_text())

    # 1. deterministic re-judgement of every recorded attempt
    rejudged = []
    for sid, st in sb["stills"].items():
        for a in st.get("attempts", []):
            v = a.get("verify", {})
            fp = v.get("footprintPx") or 0
            inl = v.get("inliers") or 0
            ncc = v.get("ncc") or 0.0
            meets_old = inl >= MIN_INLIERS and ncc >= MIN_NCC
            meets_new = meets_old and fp >= MIN_FOOTPRINT_PX
            if meets_old or (inl >= MIN_INLIERS and fp >= MIN_FOOTPRINT_PX):
                rejudged.append({
                    "stillId": sid, "D": a.get("D"), "cross": a.get("cross"),
                    "spanKm": a.get("spanKm"), "gsdM": a.get("gsdM"),
                    "photoScale": a.get("photoScale"),
                    "inliers": inl, "ncc": ncc, "footprintPx": fp,
                    "metOldRule": meets_old, "meetsCorrectedRule": meets_new,
                })

    # 2. the pin reproduction (p03 only — the campaign's single pin)
    repro = reproduce_pin_geometry()

    # 3. the retraction
    p3 = sb["stills"]["p03-famartin-dundy-a"]
    pin = p3.get("pin")
    retraction = None
    if pin is not None:
        repro_degenerate = all(r.get("verdict") == "DEGENERATE" for r in repro if "verdict" in r)
        recorded_fp = pin.get("footprintPx")
        retraction = {
            "stillId": "p03-famartin-dundy-a",
            "originalPin": pin,
            "originalRule": {"minInliers": MIN_INLIERS, "minNcc": MIN_NCC,
                             "footprintFloor": None,
                             "note": "declared before stage-B pass 1; carried no footprint-plausibility floor"},
            "correctedRule": {"minInliers": MIN_INLIERS, "minNcc": MIN_NCC,
                              "minFootprintPx": MIN_FOOTPRINT_PX,
                              "note": "declared by this audit, before any re-measurement (tools/stage_b4.py)"},
            "auditFindings": {
                "recordedFootprintPx": recorded_fp,
                "recordedFootprintBelowFloor": bool((recorded_fp or 0) < MIN_FOOTPRINT_PX),
                "multiSeedReproduction": repro,
                "reproductionNote": ("campaign parameters verbatim (SIFT 40000/0.02/15, CLAHE, mutual-nearest "
                                     "top-800, RANSAC 4.0 px / 20000 iters / 0.9999) on the cached pin-box plan "
                                     "plans/p03-famartin-dundy-a_b04_s120_g040.jpg at photoScale 0.25; three seeds, "
                                     "identical consensus: 8 inliers in a small still-space cluster (x 99..559, "
                                     "y 358..514 of 960x720), whole-still quad area ~126 plan-px inside a "
                                     "406x172 px bounding box (sliver), local y-scale 42.17 plan-px per still-px"),
            },
            "verdict": "RETRACTED" if (repro_degenerate and (recorded_fp or 0) < MIN_FOOTPRINT_PX) else "stands",
            "reason": ("the pin's verified homography is degenerate: it squashes the whole still into a "
                       "~126-plan-px sliver (reproduced identically at three RANSAC seeds) with a 42:1 local "
                       "anisotropy, and its recorded footprint (2747 px) is an order of magnitude below the "
                       "corrected 25,000-px plausibility floor; the NCC 0.3649 that passed the original rule is "
                       "a small-patch spurious correlation (pivot-belt texture vs pivot-belt texture), not a "
                       "photometric verification of geometry — the pin is fabricated geometry that passed a "
                       "weak gate, and the honesty clause forbids recording it as a MEASURED geolocation"),
        }
        if retraction["verdict"] == "RETRACTED":
            p3["pinRetractedByAudit"] = pin
            p3["pin"] = None
            p3["outcome"] = "un-localized"
            p3["reason"] = ("pin RETRACTED by the footprint-plausibility audit (results/geolocation/pin-audit.json): "
                            "the warp was degenerate (whole-still quad ~126 plan-px sliver, local y-scale 42:1, "
                            "recorded footprint 2747 px << the corrected 25,000-px floor); re-judged un-localized — "
                            "the native-scale re-measurement is tools/stage_b4.py (stage B pass 3)")
            sb["method"]["pinAudit"] = {
                "tool": "tools/pin_audit.py",
                "record": "results/geolocation/pin-audit.json",
                "finding": ("the pass-2 pin rule lacked a footprint-plausibility floor; small-footprint sliver "
                            "warps pass the NCC floor spuriously; the single pass-2 pin (p03) was degenerate and "
                            "is retracted; the corrected rule (footprint >= 25,000 plan-px) is declared by the "
                            "audit and applied by the pass-3 re-measurement"),
            }
            sb_path.write_text(json.dumps(sb, indent=2) + "\n")

    # 4. the audit record
    audit = {
        "auditId": "anchor006-pin-audit/1",
        "trigger": ("the pass-2 p03 pin's footprint (2747 plan-px on a 12 km / 4 m-px plan) was implausibly "
                    "small for a 15-20 km oblique still; the audit reproduced its verification at three RANSAC "
                    "seeds and measured the warp geometry"),
        "correctedRule": {"minInliers": MIN_INLIERS, "minNcc": MIN_NCC, "minFootprintPx": MIN_FOOTPRINT_PX,
                          "declaredBefore": "tools/stage_b4.py (the pass-3 native-scale re-measurement)"},
        "deterministicRejudgement": {
            "method": ("every attempt recorded in scan/stage-b.json re-judged from its RECORDED numbers "
                       "(no re-run): meets-corrected-rule = inliers >= 8 AND ncc >= 0.30 AND footprintPx >= 25000"),
            "attemptsMeetingTheOldFloors": rejudged,
            "attemptsMeetingTheCorrectedRule": [r for r in rejudged if r["meetsCorrectedRule"]],
        },
        "pinReproduction": repro,
        "retraction": retraction,
        "systemicPattern": {
            "finding": ("every high-NCC attempt in the pass-2 journal rode a small footprint: p04's best NCC "
                        "0.3088 had a 588-px footprint, p05's 0.2569 a 906-px footprint, the p03 pin's 0.3649 a "
                        "2747-px footprint — while every large-footprint attempt (>= 25,000 px) sits at "
                        "|NCC| <= 0.10; the NCC floor without a footprint floor admits sliver correlations"),
        },
    }
    out = GEO / "pin-audit.json"
    out.write_text(json.dumps(audit, indent=2) + "\n")
    n_old = len(rejudged)
    n_new = len([r for r in rejudged if r["meetsCorrectedRule"]])
    print(f"pin audit: {n_old} attempt(s) met the old floors; {n_new} meet the corrected rule")
    for r in rejudged:
        print(f"  {r['stillId']} D={r['D']} cross={r['cross']} s={r['spanKm']} g={r['gsdM']} ps={r['photoScale']}: "
              f"inl={r['inliers']} ncc={r['ncc']:+.4f} fp={r['footprintPx']} old={r['metOldRule']} corrected={r['meetsCorrectedRule']}")
    if retraction:
        print(f"p03 pin verdict: {retraction['verdict']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
