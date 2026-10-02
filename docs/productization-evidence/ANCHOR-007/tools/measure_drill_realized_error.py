#!/usr/bin/env python3
"""
ANCHOR-007 — the realized-registration-error instrument (drill runs).

The drills carry KNOWN plan->drill homographies (fixture/drill-ground-truth.json).
The anchored hypotheses carry ESTIMATED plan->still homographies (the response
transform, frameFrom plan-raster-px -> frameTo still-px). This instrument
measures the REALIZED registration error of each anchored drill hypothesis:

  C = H_known^-1 @ H_est        (plan px -> plan px, the loop through the
                                 still frame both transforms claim)
  for every ground-truth plan reference point p (the measured-drawings
  corners of fixture/ground-truth-plan.json, raster px) that lies INSIDE
  the drill's visible footprint (H_known(p) within the drill image, 50 px
  margin — extrapolated corners are not measurements):
      realized error(p) = |C(p) - p| / 88.00 px/m   [meters]

Reported per drill: the point count, the RMS and max realized error, the
budget95 coverage check (the ANCHOR-001 discipline: a budget is honest only
if it covers the realized error — measured, never asserted), and the full
per-point derivation. For the REAL photoset runs this instrument writes the
honest NOT-DERIVABLE record: no co-registered ground truth exists for the
photographs, so realized error is not measurable there (declared, never
fabricated).

Run:
  /home/z/.venv/bin/python docs/productization-evidence/ANCHOR-007/tools/measure_drill_realized_error.py
"""

import hashlib
import json
import sys
from pathlib import Path

import cv2
import numpy as np

HERE = Path(__file__).resolve().parent
TREE = HERE.parent
FIXTURE = TREE / "fixture"
RESULTS = TREE / "results"

PX_PER_M = 88.0
MARGIN_PX = 50.0


def sha256_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def apply_h(h, pts):
    pts = np.asarray(pts, dtype=np.float64)
    ph = np.hstack([pts, np.ones((len(pts), 1))])
    out = (h @ ph.T).T
    return out[:, :2] / out[:, 2:3]


def reference_points():
    """The measured-drawings ground-truth corners, in fixture-raster px."""
    gt = json.loads((FIXTURE / "ground-truth-plan.json").read_text())
    pts = {}
    for feat in ("pavilionSlabOuter", "pavilionGlass", "serviceCore", "lowerTerraceOuter"):
        for corner, xy in gt["measures"][feat]["cornersRasterPx"].items():
            pts[f"{feat}.{corner}"] = (float(xy[0]), float(xy[1]))
    return pts


def measure_run(run_path: Path, drills: dict):
    """Measure one drill run's response against the known homographies."""
    if not run_path.is_file():
        return {"run": run_path.name, "error": "run file missing"}
    resp = json.loads(run_path.read_text())
    if resp.get("status") == "refused":
        return {
            "run": run_path.name,
            "status": "refused",
            "reasonCode": resp.get("reasonCode"),
            "refusalDetail": resp.get("refusalDetail"),
            "note": "the instrument run refused — nothing to measure (honest)",
        }
    ref_pts = reference_points()
    per_still = []
    for hyp in resp.get("hypotheses", []):
        cid = hyp["evidenceContentId"]
        drill = None
        for name, rec in drills.items():
            if sha256_file(FIXTURE / name) == cid:
                drill = (name, rec)
                break
        if drill is None:
            per_still.append({"contentId": cid, "note": "not a drill still (skipped)"})
            continue
        name, rec = drill
        H_known = np.array(rec["knownHomographyPlanToDrill"], dtype=np.float64)
        H_known = H_known / H_known[2, 2]
        H_est = np.array(hyp["transform"]["matrix"], dtype=np.float64)
        H_est = H_est / H_est[2, 2]
        wd, hd = rec["sizePx"]
        # visible-footprint filter: reference points inside the drill image
        # under the KNOWN transform (50 px margin)
        names = list(ref_pts.keys())
        P = np.array([ref_pts[n] for n in names])
        img_pts = apply_h(H_known, P)
        vis = (
            (img_pts[:, 0] >= MARGIN_PX) & (img_pts[:, 0] <= wd - MARGIN_PX)
            & (img_pts[:, 1] >= MARGIN_PX) & (img_pts[:, 1] <= hd - MARGIN_PX)
        )
        # the loop-through-still composition: plan -> still -> plan
        C = np.linalg.inv(H_known) @ H_est
        C = C / C[2, 2]
        looped = apply_h(C, P)
        err_m = np.linalg.norm(looped - P, axis=1) / PX_PER_M
        # the direct image-space disagreement at the visible points (px)
        est_img = apply_h(H_est, P)
        img_disagreement_px = np.linalg.norm(est_img - img_pts, axis=1)
        realized = [round(float(e), 6) for e in err_m[vis]]
        budget95 = float(hyp["uncertainty"]["budget95M"])
        rms = float(np.sqrt((np.array(realized) ** 2).mean())) if realized else None
        per_still.append({
            "file": name,
            "contentId": cid,
            "visibleReferencePoints": int(vis.sum()),
            "totalReferencePoints": len(names),
            "realizedErrorM": {
                "rms": round(rms, 6) if rms is not None else None,
                "max": round(max(realized), 6) if realized else None,
                "perPoint": {n: round(float(e), 6) for n, e, v in zip(names, err_m, vis) if v},
            },
            "imageDisagreementPxAtVisible": {
                "rms": round(float(np.sqrt((img_disagreement_px[vis] ** 2).mean())), 3) if vis.any() else None,
                "max": round(float(img_disagreement_px[vis].max()), 3) if vis.any() else None,
            },
            "declaredBudget95M": budget95,
            "budget95CoversRealizedRms": (rms is not None and rms <= budget95),
            "inlierCount": hyp.get("inlierCount"),
            "matchCount": hyp.get("matchCount"),
            "confidence": hyp.get("confidence"),
        })
    return {
        "run": run_path.name,
        "status": resp.get("status"),
        "anchored": len(resp.get("hypotheses", [])),
        "refusedStills": len(resp.get("refusedStills", []) or []),
        "perStill": per_still,
    }


def main() -> int:
    gt = json.loads((FIXTURE / "drill-ground-truth.json").read_text())
    drills = {**gt["drillsPathA"], **gt["drillsPathB"]}

    out = {
        "instrument": {
            "method": ("realized error = |H_known^-1 . H_est (p) - p| / 88.00 at the "
                       "measured-drawings ground-truth corners (fixture/ground-truth-plan.json, "
                       "raster px), restricted to the drill's visible footprint (inside the "
                       "drill image under H_known, 50 px margin); budget95 coverage measured "
                       "per the ANCHOR-001 discipline"),
            "frames": "H_known: plan-raster-px -> drill-px (the recorded known transform); "
                      "H_est: the hypothesis transform plan-raster-px -> still-px",
            "honestyNote": "the real photoset has NO co-registered ground truth — realized "
                           "error there is NOT-DERIVABLE and is declared so, never fabricated",
        },
        "drillPathA": measure_run(RESULTS / "drill-path-a-run-1.json", drills),
        "drillPathB": measure_run(RESULTS / "drill-path-b-run-1.json", drills),
        "realPhotoset": {
            "realizedErrorStatus": "NOT-DERIVABLE",
            "reason": ("no co-registered ground truth exists for the real photographs (their "
                       "true poses relative to the HABS drawing are unknown and unmeasurable "
                       "from public web renditions); the responses' declared uncertainty "
                       "budgets are DECLARATIONS on this photoset, never implied measurements"),
        },
    }
    path = RESULTS / "drill-realized-error.json"
    path.write_text(json.dumps(out, indent=2) + "\n")

    for lane in ("drillPathA", "drillPathB"):
        rec = out[lane]
        print(f"{lane}: status={rec.get('status')} anchored={rec.get('anchored')}")
        for ps in rec.get("perStill", []):
            if "realizedErrorM" in ps:
                r = ps["realizedErrorM"]
                print(f"  {ps['file']}: rms={r['rms']} m max={r['max']} m "
                      f"({ps['visibleReferencePoints']} pts) "
                      f"budget95={ps['declaredBudget95M']} covers={ps['budget95CoversRealizedRms']}")
            elif "note" in ps:
                print(f"  {ps.get('file', ps.get('contentId', '?')[:16])}: {ps['note']}")
    print(f"{path.name} written")
    return 0


if __name__ == "__main__":
    sys.exit(main())
