#!/usr/bin/env python3
"""
ANCHOR-001 — disposable reference anchoring provider (the spike adapter).

One concrete automatic path: 2D feature matching + homography of each
captured still to a PLAN RASTER (an orthographic top-down image of the
floor — "the plan/floor context"), plus a still<->still cross-validation
leg. Stack: OpenCV SIFT + brute-force mutual-nearest matching + RANSAC
homography. Free-tier/local-first: no network, no paid API, no model
weights. Licensing: OpenCV is Apache-2.0 (see adapter-notes.md).

PROCESS BOUNDARY (the GBIM-001 discipline): the ONLY things that cross
are (a) one JSON request on stdin and (b) one JSON response on stdout.
No OpenCV/numpy type can cross; every matrix is serialized as plain JSON
numbers validated against a closed output vocabulary by the AISE-side
guard (aise-side/guard.ts).

AUTHORITY DISCIPLINE (the charter):
  - the provider NEVER sees ground truth; it reports its own residuals
    and a declared uncertainty budget — accuracy is measured OUTSIDE, by
    the AISE-side harness against the fixture's ground truth;
  - hypotheses are CANDIDATES (epistemicLabel INFERRED); the provider
    writes NOTHING — no Reality Graph, no files, no network;
  - failure is ALWAYS typed and closed: a request that cannot be anchored
    is REFUSED with a reasonCode from the closed vocabulary; no partial
    or fabricated anchors are emitted.

FAIL-CLOSED GATE ORDER (mirrors the AISE engine's apply.ts discipline —
each gate refuses BEFORE the next stage runs):
  1. structural sanity          -> input-contract-violation
  2. plan context present       -> plan-context-missing
     plan context supported     -> plan-context-unsupported
     requested representation   -> representation-unsupported
  3. evidence methods supported -> evidence-method-unsupported (BEFORE any bytes are read)
     evidence bytes verify      -> evidence-bytes-mismatch (content-addressing check)
  4. still count >= minStills   -> insufficient-stills (the method's redundancy law)
  5. per-image feature floor    -> insufficient-features (textureless)
  6. per-still registration     -> registration-unreliable (mismatched plan)

DETERMINISM: cv2.setRNGSeed(FIXED) at start; no clock reads in outputs'
semantic fields; same input bytes -> same output (proven by the harness'
double-run digest comparison; see measurements.md for the platform caveat).

Run:
  /home/z/anchor001-venv/bin/python docs/productization-evidence/ANCHOR-001/adapter/anchor_provider.py < request.json > response.json
"""

import hashlib
import json
import platform
import sys
import time
from pathlib import Path

import cv2
import numpy as np

PROVIDER_ID = "sift-homography-spike"
PROVIDER_VERSION = "anchor001-adapter/1"
PORT_VERSION = "anchor001-anchoring-port/1"
FIXED_RNG_SEED = 20260929  # deterministic RANSAC

# Closed vocabularies (mirrored EXACTLY in aise-side/contract.ts and guarded
# by aise-side/guard.ts — the AISE side refuses unknown values).
SUPPORTED_PLAN_KINDS = {"plan-raster"}
SUPPORTED_REPRESENTATIONS = {"plan-homography"}
SUPPORTED_METHODS = {"STILL_IMAGERY"}
SUPPORTED_MEDIA_PREFIX = "image/"
EPISTEMIC_LABEL = "INFERRED"

REASON_CODES = {
    "input-contract-violation",
    "plan-context-missing",
    "plan-context-unsupported",
    "representation-unsupported",
    "evidence-method-unsupported",
    "evidence-bytes-mismatch",
    "insufficient-stills",
    "insufficient-features",
    "registration-unreliable",
}

# The reference method's declared configuration (echoed verbatim in
# provenance.config; the digests make it replayable).
DEFAULT_CONFIG = {
    "detector": "SIFT",
    "siftContrastThreshold": 0.02,
    "siftEdgeThreshold": 15,
    "matcher": "BF-L2-crossCheck",
    "maxMatchesPerPair": 200,
    "ransacThresholdPx": 3.0,
    "ransacMaxIters": 20000,
    "ransacConfidence": 0.9999,
    "minKeypointsPerImage": 80,
    "minMatchesForEstimate": 12,
    "minInliersPerStill": 8,
    "minStills": 2,
    "crossValMinInliers": 12,
    "crossValMaxResidualPx": 20.0,
    "uncertaintyModel": "inlier-residual-first-order-v2.1",
    "confidenceModel": "inliers-and-crossval-heuristic/1",
}


def refuse(execution_id: str, reason_code: str, detail: str, input_digest: str | None = None) -> dict:
    """A typed whole-request refusal: no hypotheses, no anchors, no fabrication."""
    assert reason_code in REASON_CODES
    return {
        "schemaVersion": 1,
        "portVersion": PORT_VERSION,
        "executionId": execution_id,
        "status": "refused",
        "reasonCode": reason_code,
        "refusalDetail": detail,
        "provenance": {
            "providerId": PROVIDER_ID,
            "providerVersion": PROVIDER_VERSION,
            "opencvVersion": cv2.__version__,
            "numpyVersion": np.__version__,
            "pythonVersion": platform.python_version(),
            "platform": f"{platform.system()} {platform.machine()}",
            "inputDigest": input_digest,
            "adapterSourceDigest": adapter_digest(),
            "config": DEFAULT_CONFIG,
        },
        "hypotheses": [],
        "executionTimeMs": 0.0,
    }


def adapter_digest() -> str:
    """sha256 of this file — the config/implementation digest (GBIM-001 discipline)."""
    return "sha256:" + hashlib.sha256(Path(__file__).read_bytes()).hexdigest()


def canonical_json(value) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"))


def sha256_hex(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def require(condition: bool, execution_id: str, reason: str, detail: str, digest: str | None = None):
    if not condition:
        print(json.dumps(refuse(execution_id, reason, detail, digest)))
        sys.exit(0)


def main() -> int:
    t_start = time.perf_counter()
    cv2.setRNGSeed(FIXED_RNG_SEED)

    raw = sys.stdin.read()
    try:
        req = json.loads(raw)
    except json.JSONDecodeError as exc:
        print(json.dumps(refuse("unknown", "input-contract-violation", f"request is not valid JSON: {exc}")))
        return 0

    execution_id = req.get("executionId", "unknown")
    input_digest = "sha256:" + sha256_hex(raw.encode("utf-8"))

    # ---- Gate 1: structural sanity --------------------------------------
    require(
        req.get("portVersion") == PORT_VERSION,
        execution_id,
        "input-contract-violation",
        f"portVersion must be '{PORT_VERSION}' (got {req.get('portVersion')!r})",
        input_digest,
    )
    require(isinstance(req.get("evidence"), list) and len(req.get("evidence", [])) >= 0,
            execution_id, "input-contract-violation", "evidence must be a list", input_digest)
    for idx, ev in enumerate(req.get("evidence", [])):
        require(
            isinstance(ev, dict)
            and isinstance(ev.get("contentId"), str)
            and len(ev.get("contentId", "")) == 64
            and isinstance(ev.get("mediaType"), str)
            and isinstance(ev.get("acquisitionMethod"), str)
            and isinstance(ev.get("bytesPath"), str),
            execution_id,
            "input-contract-violation",
            f"evidence[{idx}] must carry contentId (64-hex), mediaType, acquisitionMethod, bytesPath",
            input_digest,
        )
    policy = {**DEFAULT_CONFIG, **(req.get("policy") or {})}
    evidence = req.get("evidence", [])

    # ---- Gate 2: plan context present + supported ----------------------
    plan_ctx = req.get("planContext")
    require(plan_ctx is not None, execution_id, "plan-context-missing",
            "no plan/floor context was supplied; anchoring requires one — refusing rather than fabricating",
            input_digest)
    require(isinstance(plan_ctx, dict), execution_id, "input-contract-violation",
            "planContext must be an object", input_digest)
    require(plan_ctx.get("kind") in SUPPORTED_PLAN_KINDS, execution_id, "plan-context-unsupported",
            f"planContext.kind {plan_ctx.get('kind')!r} is not in {sorted(SUPPORTED_PLAN_KINDS)}",
            input_digest)
    raster = plan_ctx.get("rasterToScene")
    require(isinstance(raster, dict) and isinstance(raster.get("pixelsPerMeter"), (int, float))
            and raster.get("pixelsPerMeter", 0) > 0 and raster.get("yDirection") == "north-up"
            and raster.get("xDirection") == "east-right",
            execution_id, "input-contract-violation",
            "planContext.rasterToScene must declare pixelsPerMeter>0, xDirection 'east-right', yDirection 'north-up'",
            input_digest)
    pixels_per_meter = float(raster["pixelsPerMeter"])

    requested = (req.get("requestedAnchoring") or {}).get("representation")
    require(requested in SUPPORTED_REPRESENTATIONS, execution_id, "representation-unsupported",
            f"requestedAnchoring.representation {requested!r} is not in {sorted(SUPPORTED_REPRESENTATIONS)}",
            input_digest)

    # ---- Gate 3: evidence methods supported (BEFORE reading any bytes) --
    for ev in evidence:
        require(ev["acquisitionMethod"] in SUPPORTED_METHODS, execution_id, "evidence-method-unsupported",
                f"evidence {ev['contentId']} has acquisitionMethod {ev['acquisitionMethod']!r}; "
                f"this method supports {sorted(SUPPORTED_METHODS)} only",
                input_digest)
        require(ev["mediaType"].startswith(SUPPORTED_MEDIA_PREFIX), execution_id, "evidence-method-unsupported",
                f"evidence {ev['contentId']} has mediaType {ev['mediaType']!r}; still-image bytes required",
                input_digest)
    require(plan_ctx.get("imageMediaType", "").startswith(SUPPORTED_MEDIA_PREFIX), execution_id,
            "evidence-method-unsupported",
            f"plan image mediaType {plan_ctx.get('imageMediaType')!r}; a plan RASTER image is required",
            input_digest)

    # Content addressing: verify every bytesPath digest == its contentId.
    images: dict[str, np.ndarray] = {}
    for ev in evidence:
        path = Path(ev["bytesPath"])
        require(path.is_file(), execution_id, "evidence-bytes-mismatch",
                f"evidence {ev['contentId']} bytesPath {ev['bytesPath']} is not a readable file",
                input_digest)
        data = path.read_bytes()
        digest_hex = sha256_hex(data)
        require(digest_hex == ev["contentId"], execution_id, "evidence-bytes-mismatch",
                f"evidence {ev['contentId']} bytes digest {digest_hex} does not match its content id",
                input_digest)
        img = cv2.imread(str(path), cv2.IMREAD_GRAYSCALE)
        require(img is not None, execution_id, "evidence-bytes-mismatch",
                f"evidence {ev['contentId']} bytes are not a decodable still image",
                input_digest)
        images[ev["contentId"]] = img

    plan_path = Path(plan_ctx["bytesPath"])
    require(plan_path.is_file(), execution_id, "evidence-bytes-mismatch",
            f"plan image bytesPath {plan_ctx['bytesPath']} is not a readable file", input_digest)
    plan_data = plan_path.read_bytes()
    plan_digest_hex = sha256_hex(plan_data)
    require(plan_digest_hex == plan_ctx.get("imageContentId"), execution_id, "evidence-bytes-mismatch",
            f"plan image bytes digest {plan_digest_hex} does not match imageContentId",
            input_digest)
    plan_img = cv2.imread(str(plan_path), cv2.IMREAD_GRAYSCALE)
    require(plan_img is not None, execution_id, "evidence-bytes-mismatch",
            "plan image bytes are not a decodable image", input_digest)

    # ---- Gate 4: the redundancy law (>= 2 stills) ----------------------
    require(len(evidence) >= int(policy["minStills"]), execution_id, "insufficient-stills",
            f"{len(evidence)} still(s) supplied; this method requires >= {int(policy['minStills'])} "
            "(a single still yields an exactly-determined homography with no redundancy evidence — "
            "RANSAC inliers are self-referential and cannot discriminate a wrong registration)",
            input_digest)

    # ---- Gate 5: feature floor (textureless) ---------------------------
    stage_t = {"detect": 0.0, "match": 0.0, "estimate": 0.0, "crossval": 0.0}
    sift = cv2.SIFT_create(nfeatures=0, contrastThreshold=float(policy["siftContrastThreshold"]),
                           edgeThreshold=float(policy["siftEdgeThreshold"]))
    t0 = time.perf_counter()
    kp_plan, des_plan = sift.detectAndCompute(plan_img, None)
    feats = {}
    weak = []
    for ev in evidence:
        kp, des = sift.detectAndCompute(images[ev["contentId"]], None)
        feats[ev["contentId"]] = (kp, des)
        if len(kp) < int(policy["minKeypointsPerImage"]):
            weak.append(f"{ev['contentId']}({len(kp)} keypoints)")
    stage_t["detect"] += time.perf_counter() - t0
    require(not weak, execution_id, "insufficient-features",
            f"images below the {int(policy['minKeypointsPerImage'])}-keypoint floor: {', '.join(weak)} "
            "(textureless or feature-poor evidence cannot be anchored — refusing rather than guessing)",
            input_digest)
    require(len(kp_plan) >= int(policy["minKeypointsPerImage"]), execution_id, "insufficient-features",
            f"the plan raster has only {len(kp_plan)} keypoints (below the floor)", input_digest)

    # ---- Gate 6: per-still registration to the plan --------------------
    bf = cv2.BFMatcher(cv2.NORM_L2, crossCheck=True)

    matches_by_still = {}
    for ev in evidence:
        t0 = time.perf_counter()
        kp_s, des_s = feats[ev["contentId"]]
        if des_s is None or len(des_s) < int(policy["minMatchesForEstimate"]):
            matches_by_still[ev["contentId"]] = []
            continue
        m = bf.match(des_s, des_plan)
        m = sorted(m, key=lambda x: x.distance)[: int(policy["maxMatchesPerPair"])]
        matches_by_still[ev["contentId"]] = m
        stage_t["match"] += time.perf_counter() - t0

    hypotheses = []
    weak_registrations = []
    est: dict[str, dict] = {}
    for ev in evidence:
        cid = ev["contentId"]
        kp_s, _ = feats[cid]
        m = matches_by_still[cid]
        if len(m) < int(policy["minMatchesForEstimate"]):
            weak_registrations.append(f"{cid}({len(m)} mutual matches)")
            continue
        t0 = time.perf_counter()
        src = np.float32([kp_plan[x.trainIdx].pt for x in m])  # plan pts
        dst = np.float32([kp_s[x.queryIdx].pt for x in m])     # still pts
        h_est, mask = cv2.findHomography(
            src, dst, cv2.RANSAC, float(policy["ransacThresholdPx"]),
            maxIters=int(policy["ransacMaxIters"]), confidence=float(policy["ransacConfidence"]),
        )
        stage_t["estimate"] += time.perf_counter() - t0
        if h_est is None:
            weak_registrations.append(f"{cid}(no homography)")
            continue
        inliers = int(mask.sum())
        if inliers < int(policy["minInliersPerStill"]):
            weak_registrations.append(f"{cid}({inliers} inliers)")
            continue
        # Inlier residual RMS (px, still space). OpenCV's RANSAC mask is
        # column-shaped (N,1) — flatten before boolean indexing.
        inlier_mask = mask.ravel().astype(bool)
        proj = cv2.perspectiveTransform(src.reshape(-1, 1, 2), h_est).reshape(-1, 2)
        residuals = np.linalg.norm(proj - dst, axis=1)[inlier_mask]
        residual_rms = float(np.sqrt((residuals ** 2).mean()))
        # First-order floor-uncertainty: local plan-px per still-px scale at
        # the inliers (via H^-1 Jacobian magnitude, median), times the
        # residual RMS, converted to meters.
        h_inv = np.linalg.inv(h_est)
        scales = []
        inlier_idx = np.where(inlier_mask)[0]
        for k in inlier_idx:
            p = dst[k]
            denom = h_inv[2, 0] * p[0] + h_inv[2, 1] * p[1] + h_inv[2, 2]
            x_num = h_inv[0, 0] * p[0] + h_inv[0, 1] * p[1] + h_inv[0, 2]
            y_num = h_inv[1, 0] * p[0] + h_inv[1, 1] * p[1] + h_inv[1, 2]
            d = denom ** 2
            # Full Jacobian of the projective map still-px -> plan-px.
            jac = np.array(
                [
                    [(h_inv[0, 0] * denom - x_num * h_inv[2, 0]) / d,
                     (h_inv[0, 1] * denom - x_num * h_inv[2, 1]) / d],
                    [(h_inv[1, 0] * denom - y_num * h_inv[2, 0]) / d,
                     (h_inv[1, 1] * denom - y_num * h_inv[2, 1]) / d],
                ]
            )
            scales.append(np.sqrt(abs(np.linalg.det(jac))))
        scale_med = float(np.median(scales)) if scales else 1.0
        est[cid] = {
            "h": h_est,
            "inliers": inliers,
            "matches": len(m),
            "residualRmsPx": residual_rms,
            "scaleMed": scale_med,
            "inlierPts": dst[inlier_idx],
        }

    require(not weak_registrations, execution_id, "registration-unreliable",
            f"stills that could not be registered to this plan: {', '.join(weak_registrations)} "
            "(inlier support below the floor — the plan and the stills likely do not depict the same floor; "
            "refusing rather than emitting low-support anchors)",
            input_digest,
            )
    # Strict whole-request fail-closed (a design decision of the spike: a
    # production port could carry a typed PARTIAL state with per-still
    # outcomes instead — recorded in PORT.md as an open design question).

    # ---- Cross-validation leg (no ground truth used) --------------------
    t0 = time.perf_counter()
    crossval: dict[str, list] = {cid: [] for cid in est}
    cids = list(est.keys())
    for i in range(len(cids)):
        for j in range(i + 1, len(cids)):
            a, b = cids[i], cids[j]
            kp_a, des_a = feats[a]
            kp_b, des_b = feats[b]
            if des_a is None or des_b is None:
                continue
            m = bf.match(des_a, des_b)
            m = sorted(m, key=lambda x: x.distance)[: int(policy["maxMatchesPerPair"])]
            if len(m) < int(policy["crossValMinInliers"]):
                continue
            src = np.float32([kp_a[x.queryIdx].pt for x in m])
            dst = np.float32([kp_b[x.trainIdx].pt for x in m])
            h_ab, mask = cv2.findHomography(
                src, dst, cv2.RANSAC, float(policy["ransacThresholdPx"]),
                maxIters=int(policy["ransacMaxIters"]), confidence=float(policy["ransacConfidence"]),
            )
            if h_ab is None or int(mask.sum()) < int(policy["crossValMinInliers"]):
                continue
            # Plan-mediated composition (BOTH estimates, no ground truth):
            h_med = est[b]["h"] @ np.linalg.inv(est[a]["h"])
            pts = np.float32([[x, y] for x in range(100, 800, 100) for y in range(100, 600, 100)]).reshape(-1, 1, 2)
            t_direct = cv2.perspectiveTransform(pts, h_ab)
            t_med = cv2.perspectiveTransform(pts, h_med)
            residual = float(np.linalg.norm(t_direct - t_med, axis=2).mean())
            consistent = residual <= float(policy["crossValMaxResidualPx"])
            entry = {
                "peerContentId": b,
                "residualRmsPx": residual,
                "consistent": consistent,
            }
            crossval[a].append({**entry, "peerContentId": b})
            crossval[b].append({**entry, "peerContentId": a})
    stage_t["crossval"] += time.perf_counter() - t0

    # ---- Assemble hypotheses (CANDIDATES, explicit uncertainty) ---------
    frame_diag = float(np.hypot(800.0, 600.0))
    for cid in cids:
        e = est[cid]
        consistent_peers = [c for c in crossval[cid] if c["consistent"]]
        inconsistent_peers = [c for c in crossval[cid] if not c["consistent"]]
        inlier_ratio = e["inliers"] / e["matches"]

        # --- Uncertainty budget v2 (declared, versioned; each term honest
        # about a distinct failure mode of the residual-only v1 model):
        #   (a) inlier-residual propagation + the RANSAC truncation floor
        #       (inlier residuals are CUT at the threshold — they cannot
        #       show sub-threshold bias, so the threshold itself is a
        #       floor on per-point error);
        #   (b) cross-validation AGREEMENT: the mean residual between the
        #       direct still<->still homography and the plan-mediated
        #       composition over CONSISTENT peers, halved onto each side —
        #       a lower-bound error signal (agreement bounds error from
        #       below); an INCONSISTENT pair provides no quantitative
        #       bound (it signals distrust, reflected in confidence);
        #   (c) support-spread extrapolation: registration error grows
        #       outside the inlier support's spatial extent.
        base_px = float(np.sqrt(e["residualRmsPx"] ** 2 + (float(policy["ransacThresholdPx"]) / 2.0) ** 2))
        term_a = base_px * e["scaleMed"] / pixels_per_meter
        term_b = 0.0
        if consistent_peers:
            worst_agree_px = max(c["residualRmsPx"] for c in consistent_peers)
            term_b = worst_agree_px * e["scaleMed"] / (2.0 * pixels_per_meter)
        if len(e["inlierPts"]) >= 2:
            pts = np.asarray(e["inlierPts"])
            inlier_diag = float(np.hypot(pts[:, 0].max() - pts[:, 0].min(), pts[:, 1].max() - pts[:, 1].min()))
            spread_factor = min(8.0, max(1.0, frame_diag / max(inlier_diag, 100.0)))
        else:
            spread_factor = 8.0
        term_c = term_a * spread_factor
        floor_rms_m = max(term_a, term_b, term_c)
        budget_terms = {
            "inlierResidualPlusTruncationM": round(term_a, 6),
            "crossvalDisagreementM": round(term_b, 6),
            "supportSpreadExtrapolationM": round(term_c, 6),
        }

        # Declared confidence heuristic (a SUPPORT score, not a probability;
        # versioned in provenance.config.confidenceModel):
        conf = 0.5 + 0.4 * min(1.0, e["inliers"] / 25.0) + 0.05 * min(1.0, inlier_ratio / 0.3)
        if consistent_peers:
            conf += 0.1 * min(1.0, len(consistent_peers) / 3.0)
        conf -= 0.15 * min(1.0, len(inconsistent_peers) / 2.0)
        conf = float(max(0.0, min(0.98, conf)))
        h_norm = e["h"] / e["h"][2, 2]
        hypotheses.append(
            {
                "evidenceContentId": cid,
                "representation": "plan-homography",
                "transform": {
                    "frameFrom": "plan-raster-px",
                    "frameTo": "still-px",
                    "matrix": [[float(v) for v in row] for row in h_norm],
                },
                "inlierCount": e["inliers"],
                "matchCount": e["matches"],
                "inlierRatio": round(inlier_ratio, 4),
                "residualRmsPx": round(e["residualRmsPx"], 4),
                "uncertainty": {
                    "floorRmsM": round(floor_rms_m, 6),
                    "budget95M": round(1.96 * floor_rms_m, 6),
                    "basis": "inlier-residual-first-order-v2 (terms: residual+RANSAC-truncation, crossval disagreement, support-spread extrapolation; max of terms)",
                    "budgetTerms": budget_terms,
                },
                "confidence": round(conf, 4),
                "epistemicLabel": EPISTEMIC_LABEL,
                "crossValidation": sorted(consistent_peers + inconsistent_peers, key=lambda c: c["peerContentId"]),
            }
        )

    response = {
        "schemaVersion": 1,
        "portVersion": PORT_VERSION,
        "executionId": execution_id,
        "status": "anchored",
        "reasonCode": None,
        "provenance": {
            "providerId": PROVIDER_ID,
            "providerVersion": PROVIDER_VERSION,
            "opencvVersion": cv2.__version__,
            "numpyVersion": np.__version__,
            "pythonVersion": platform.python_version(),
            "platform": f"{platform.system()} {platform.machine()}",
            "inputDigest": input_digest,
            "adapterSourceDigest": adapter_digest(),
            "config": DEFAULT_CONFIG,
        },
        "hypotheses": sorted(hypotheses, key=lambda h: h["evidenceContentId"]),
        "executionTimeMs": round((time.perf_counter() - t_start) * 1000.0, 3),
        "stageTimingsMs": {k: round(v * 1000.0, 3) for k, v in stage_t.items()},
    }
    print(json.dumps(response, sort_keys=True))
    return 0


if __name__ == "__main__":
    sys.exit(main())
