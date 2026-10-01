#!/usr/bin/env python3
"""
ANCHOR-003b — the production anchoring adapter: the ANCHOR-001 reference
lane (OpenCV SIFT + RANSAC plan-homography) speaking the ANCHOR-002 shared
anchoring contract (`anchor002-anchoring-contract/1`).

PROCESS BOUNDARY (unchanged from the spike): the ONLY things that cross are
(a) one JSON AnchoringRequest on stdin and (b) one JSON AnchoringResponse on
stdout. No OpenCV/numpy type can cross; every matrix is serialized as plain
JSON numbers validated by the AISE-side guard inside
`packages/anchoring-contract` (runSupervisedAnchoring guards every byte the
provider emits, re-verifies the input digest, and enforces the supervision
timeout with SIGKILL).

WHAT IS NEW relative to the frozen spike adapter (all declared in
provenance.config, versioned `anchor003b-adapter/1`):

  1. THE CONTRACT. The wire shapes are the typed ANCHOR-002 contract:
     schemaVersion 1, portVersion "anchor002-anchoring-contract/1",
     contractVersion "1.0.0", the closed outcome vocabulary
     `anchored | partial | refused`, the typed PARTIAL satellite
     (refusedStills with per-still reason codes + partialSummary), and the
     provider-neutral provenance block (components list, provider refs only
     in externalReferences — none are emitted).
  2. THE PHOTOMETRIC VERIFICATION GATE (`minAnchoredNcc`). Real-world
     web-imagery matching produces plausible-but-wrong RANSAC consensus
     sets (5-9 inliers out of hundreds of junk candidates) that would pass
     a pure inlier-count floor. Every surviving homography is therefore
     verified PHOTOMETRICALLY: the still is warped into the plan frame over
     the anchored footprint and the normalized cross-correlation against
     the plan must reach the declared floor, else the still is refused with
     the typed per-still `registration-unreliable`. This gate was added as
     a direct result of the ANCHOR-003b sourcing probes: without it, the
     reference lane fabricates anchors on real web photos.
  3. DETERMINISTIC MUTUAL-NEAREST MATCHING with bounded memory. The spike's
     cv2.BFMatcher(crossCheck=True) materializes a full N x M distance
     matrix (OOM at real photoset sizes: a 40k-keypoint plan against 15k
     keypoints needs ~2.4 GB for the matrix alone). This adapter computes
     the SAME mutual-nearest L2 correspondences in bounded row chunks with
     numpy (semantically identical to crossCheck=True), which is both
     memory-bounded and byte-deterministic across runs (FLANN's randomized
     index build is NOT relied on).
  4. THE TYPED PARTIAL OUTCOME. The spike was strictly whole-request
     fail-closed (PORT.md §7's first open question). This adapter exercises
     the contract's typed PARTIAL: stills that pass every gate carry their
     hypotheses; stills that fail a per-still gate are named in refusedStills
     with their typed reason; the whole request refuses only when NO still
     anchors (zero fabricated anchors, always).

FAIL-CLOSED GATE ORDER (declared, mirrors ANCHOR-001/PORT.md §4; every
refusal carries ZERO hypotheses):
  1. structural sanity           -> input-contract-violation
  2. plan context present        -> plan-context-missing
     plan context supported      -> plan-context-unsupported
     rasterToScene handedness    -> input-contract-violation (THE HANDEDNESS LAW)
     requested representation    -> representation-unsupported
  3. evidence methods supported  -> evidence-method-unsupported (BEFORE any bytes)
     evidence bytes verify       -> evidence-bytes-mismatch (content addressing)
  4. still count >= minStills    -> insufficient-stills (the redundancy law)
  5. per-image feature floor     -> insufficient-features (textureless)
  6. per-still registration      -> per-still registration-unreliable (typed
                                    PARTIAL path; whole-request refusal only
                                    when nothing anchors)

DETERMINISM: cv2.setRNGSeed(FIXED) at start; the chunked mutual-nearest
matcher is deterministic; no clock reads in semantic fields. The supervised
double-run in the AISE-side harness asserts byte-identical deterministic
projections (performance observations excluded, per the contract's
deterministicProjection discipline).

Run (the supervised runner spawns it; never by hand):
  <python> anchor_provider.py < request.json > response.json
"""

import hashlib
import json
import platform
import re
import sys
import time
from pathlib import Path

import cv2
import numpy as np

PROVIDER_ID = "sift-homography-reference"
PROVIDER_VERSION = "anchor003b-adapter/1"
PORT_VERSION = "anchor002-anchoring-contract/1"
CONTRACT_VERSION = "1.0.0"
WIRE_SCHEMA_VERSION = 1
FIXED_RNG_SEED = 20260930  # deterministic RANSAC

# Closed vocabularies (mirrored in packages/anchoring-contract/src/vocabularies.ts;
# guarded by the contract guard on the AISE side).
SUPPORTED_PLAN_KINDS = {"plan-raster"}
SUPPORTED_REPRESENTATIONS = {"plan-homography"}
SUPPORTED_METHODS = {"STILL_IMAGERY"}
SUPPORTED_MEDIA_PREFIX = "image/"
EPISTEMIC_LABEL = "INFERRED"

WHOLE_REQUEST_REASON_CODES = {
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
PER_STILL_REASON_CODES = {
    "evidence-method-unsupported",
    "evidence-bytes-mismatch",
    "insufficient-features",
    "registration-unreliable",
}

# The reference method's declared configuration. The request policy OVERRIDES
# these fields where the contract's policy schema carries them (merged +
# echoed verbatim in provenance.config — replayable). The fields the contract
# does not carry (matcher/verification internals) stay adapter-declared.
DEFAULT_CONFIG = {
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
    "minKeypointsPerImage": 80,
    "minMatchesForEstimate": 12,
    "minInliersPerStill": 8,
    "minStills": 2,
    "crossValMinInliers": 12,
    "crossValMaxResidualPx": 20.0,
    "minAnchoredNcc": 0.25,
    "nccFootprintMinPixels": 2000,
    "uncertaintyModel": "inlier-residual-first-order-v2.1",
    "confidenceModel": "inliers-and-crossval-heuristic/1",
}


def sha256_hex(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def adapter_digest() -> str:
    """sha256 of this file — the config/implementation digest (GBIM-001 discipline)."""
    return "sha256:" + hashlib.sha256(Path(__file__).read_bytes()).hexdigest()


def refuse(execution_id, reason_code, detail, input_digest, config, stage_t=None):
    """A typed whole-request refusal: no hypotheses, no anchors, no fabrication."""
    assert reason_code in WHOLE_REQUEST_REASON_CODES
    return {
        "schemaVersion": WIRE_SCHEMA_VERSION,
        "portVersion": PORT_VERSION,
        "contractVersion": CONTRACT_VERSION,
        "executionId": execution_id,
        "status": "refused",
        "reasonCode": reason_code,
        "refusalDetail": detail,
        "provenance": _provenance(input_digest, config),
        "hypotheses": [],
        "executionTimeMs": 0.0,
        **({"stageTimingsMs": {k: round(v * 1000.0, 3) for k, v in stage_t.items()}} if stage_t else {}),
    }


def _provenance(input_digest, config):
    return {
        "providerId": PROVIDER_ID,
        "providerVersion": PROVIDER_VERSION,
        "platform": f"{platform.system()} {platform.machine()}",
        "inputDigest": input_digest,
        "adapterSourceDigest": adapter_digest(),
        "components": [
            {"name": "opencv", "version": cv2.__version__},
            {"name": "numpy", "version": np.__version__},
            {"name": "python", "version": platform.python_version()},
        ],
        "config": config,
    }


def require(condition, refuse_state, reason, detail):
    if not condition:
        raise _Refusal(reason, detail)


class _Refusal(Exception):
    def __init__(self, reason_code, detail):
        super().__init__(detail)
        self.reason_code = reason_code
        self.detail = detail


def mutual_nearest_chunked(des_q, des_t, chunk_rows, top_k):
    """Mutual-nearest L2 correspondences, semantically identical to
    cv2.BFMatcher(NORM_L2, crossCheck=True), computed in bounded row chunks.

    Deterministic (pure numpy argmin over float32 distances), memory-bounded
    (chunk_rows x M x 4 bytes per chunk). The reverse (train->query) pass is
    restricted to CANDIDATE train descriptors (those that are some query's
    nearest): a non-candidate train descriptor is nobody's nearest neighbor
    and therefore cannot participate in any mutual pair, so restricting the
    reverse pass to candidates is exactly equivalent to the full pass at
    roughly half the cost. Returns (query_idx, train_idx, distances) sorted
    by distance ascending, truncated to top_k.
    """
    n_q = des_q.shape[0]
    best_train_for_query = np.full(n_q, -1, dtype=np.int64)
    best_dist_for_query = np.full(n_q, np.inf, dtype=np.float32)
    des_q_t = np.ascontiguousarray(des_q.T)
    qa_all = (des_q * des_q).sum(axis=1)
    for start in range(0, n_q, chunk_rows):
        stop = min(start + chunk_rows, n_q)
        block = des_q[start:stop]                       # (c, 128) float32
        # ||a - b||^2 = ||a||^2 + ||b||^2 - 2 a.b  (monotone in distance)
        qa = qa_all[start:stop][:, None]
        tb = (des_t * des_t).sum(axis=1)[None, :]
        dots = block @ des_t.T
        d2 = qa + tb - 2.0 * dots
        idx = np.argmin(d2, axis=1)
        val = d2[np.arange(stop - start), idx]
        best_train_for_query[start:stop] = idx
        best_dist_for_query[start:stop] = val
    # candidates: train descriptors that are some query's nearest
    cand = np.unique(best_train_for_query[best_train_for_query >= 0])
    if cand.size == 0:
        return np.empty(0, dtype=np.int64), np.empty(0, dtype=np.int64)
    # reverse pass over candidates only: best query for each candidate train
    des_t_cand = np.ascontiguousarray(des_t[cand])       # (k, 128)
    best_query_for_cand = np.full(cand.size, -1, dtype=np.int64)
    for start in range(0, cand.size, chunk_rows):
        stop = min(start + chunk_rows, cand.size)
        block = des_t_cand[start:stop]
        ta = (block * block).sum(axis=1)[:, None]
        qb = qa_all[None, :]
        dots = block @ des_q_t
        d2 = ta + qb - 2.0 * dots
        idx = np.argmin(d2, axis=1)
        best_query_for_cand[start:stop] = idx
    # mutual filter: pair (q, t) survives iff q is t's best query
    cand_pos = {int(t): i for i, t in enumerate(cand)}
    q_idx = np.arange(n_q)
    t_idx = best_train_for_query
    mutual = np.array([
        i for i in range(n_q)
        if t_idx[i] >= 0 and best_query_for_cand[cand_pos[int(t_idx[i])]] == i
    ], dtype=np.int64)
    if mutual.size == 0:
        return np.empty(0, dtype=np.int64), np.empty(0, dtype=np.int64)
    mq = mutual
    mt = t_idx[mutual]
    md = best_dist_for_query[mutual]
    order = np.argsort(md, kind="stable")[:top_k]
    return mq[order], mt[order]


def ncc_over_mask(a, b, mask):
    """Normalized cross-correlation over a boolean footprint mask."""
    av = a[mask].astype(np.float64)
    bv = b[mask].astype(np.float64)
    av -= av.mean()
    bv -= bv.mean()
    denom = np.sqrt((av * av).sum() * (bv * bv).sum())
    if denom <= 0:
        return 0.0
    return float((av * bv).sum() / denom)


def main() -> int:
    t_start = time.perf_counter()
    cv2.setRNGSeed(FIXED_RNG_SEED)

    raw = sys.stdin.buffer.read()
    try:
        req = json.loads(raw)
    except json.JSONDecodeError as exc:
        print(json.dumps(refuse("unknown", "input-contract-violation",
                                f"request is not valid JSON: {exc}",
                                None, DEFAULT_CONFIG)))
        return 0

    execution_id = req.get("executionId", "unknown")
    input_digest = "sha256:" + sha256_hex(raw)
    stage_t = {"detect": 0.0, "match": 0.0, "estimate": 0.0, "crossval": 0.0}

    try:
        # ---- Gate 1: structural sanity ----------------------------------
        require(req.get("portVersion") == PORT_VERSION, None, "input-contract-violation",
                f"portVersion must be '{PORT_VERSION}' (got {req.get('portVersion')!r})")
        require(req.get("schemaVersion") == WIRE_SCHEMA_VERSION, None, "input-contract-violation",
                f"schemaVersion must be {WIRE_SCHEMA_VERSION}")
        require(req.get("contractVersion") == CONTRACT_VERSION, None, "input-contract-violation",
                f"contractVersion must be '{CONTRACT_VERSION}' (got {req.get('contractVersion')!r})")
        require(req.get("authority") == "AISE", None, "input-contract-violation",
                "authority must be 'AISE' (the request is authored in AISE-owned semantics)")
        require(req.get("units") == "SI", None, "input-contract-violation", "units must be 'SI'")
        evidence = req.get("evidence")
        require(isinstance(evidence, list) and len(evidence) >= 1, None, "input-contract-violation",
                "evidence must be a non-empty list")
        for idx, ev in enumerate(evidence):
            require(isinstance(ev, dict)
                    and isinstance(ev.get("contentId"), str) and len(ev.get("contentId", "")) == 64
                    and all(c in "0123456789abcdef" for c in ev.get("contentId", ""))
                    and isinstance(ev.get("mediaType"), str)
                    and isinstance(ev.get("acquisitionMethod"), str)
                    and isinstance(ev.get("bytesPath"), str),
                    None, "input-contract-violation",
                    f"evidence[{idx}] must carry contentId (64-hex), mediaType, acquisitionMethod, bytesPath")

        policy = {**DEFAULT_CONFIG, **(req.get("policy") or {})}

        # ---- Gate 2: plan context present + supported + HANDEDNESS ------
        plan_ctx = req.get("planContext")
        require(plan_ctx is not None, None, "plan-context-missing",
                "no plan/floor context was supplied; anchoring requires one — refusing rather than fabricating")
        require(isinstance(plan_ctx, dict), None, "input-contract-violation",
                "planContext must be an object")
        require(plan_ctx.get("kind") in SUPPORTED_PLAN_KINDS, None, "plan-context-unsupported",
                f"planContext.kind {plan_ctx.get('kind')!r} is not in {sorted(SUPPORTED_PLAN_KINDS)}")
        raster = plan_ctx.get("rasterToScene")
        require(isinstance(raster, dict)
                and isinstance(raster.get("pixelsPerMeter"), (int, float))
                and raster.get("pixelsPerMeter", 0) > 0
                and raster.get("xDirection") == "east-right"
                and raster.get("yDirection") == "north-up"
                and isinstance(raster.get("worldOriginPx"), list)
                and len(raster.get("worldOriginPx", [])) == 2,
                None, "input-contract-violation",
                "planContext.rasterToScene must declare pixelsPerMeter>0, xDirection 'east-right', "
                "yDirection 'north-up', worldOriginPx [x,y] (THE HANDEDNESS LAW — a screen-convention "
                "raster silently mirrors every anchor past every numeric gate)")
        pixels_per_meter = float(raster["pixelsPerMeter"])

        requested = (req.get("requestedAnchoring") or {}).get("representation")
        require(requested in SUPPORTED_REPRESENTATIONS, None, "representation-unsupported",
                f"requestedAnchoring.representation {requested!r} is not in {sorted(SUPPORTED_REPRESENTATIONS)}")

        # ---- Gate 3: evidence methods supported (BEFORE reading bytes) ---
        for ev in evidence:
            require(ev["acquisitionMethod"] in SUPPORTED_METHODS, None, "evidence-method-unsupported",
                    f"evidence {ev['contentId']} has acquisitionMethod {ev['acquisitionMethod']!r}; "
                    f"this method supports {sorted(SUPPORTED_METHODS)} only")
            require(ev["mediaType"].startswith(SUPPORTED_MEDIA_PREFIX), None, "evidence-method-unsupported",
                    f"evidence {ev['contentId']} has mediaType {ev['mediaType']!r}; still-image bytes required")
        require(plan_ctx.get("imageMediaType", "").startswith(SUPPORTED_MEDIA_PREFIX), None,
                "evidence-method-unsupported",
                f"plan image mediaType {plan_ctx.get('imageMediaType')!r}; a plan RASTER image is required")

        # Content addressing: re-verify every bytesPath digest == its content id.
        images = {}
        for ev in evidence:
            path = Path(ev["bytesPath"])
            require(path.is_file(), None, "evidence-bytes-mismatch",
                    f"evidence {ev['contentId']} bytesPath {ev['bytesPath']} is not a readable file")
            data = path.read_bytes()
            require(sha256_hex(data) == ev["contentId"], None, "evidence-bytes-mismatch",
                    f"evidence {ev['contentId']} bytes digest {sha256_hex(data)} does not match its content id")
            img = cv2.imread(str(path), cv2.IMREAD_GRAYSCALE)
            require(img is not None, None, "evidence-bytes-mismatch",
                    f"evidence {ev['contentId']} bytes are not a decodable still image")
            images[ev["contentId"]] = img

        plan_path = Path(plan_ctx["bytesPath"])
        require(plan_path.is_file(), None, "evidence-bytes-mismatch",
                f"plan image bytesPath {plan_ctx['bytesPath']} is not a readable file")
        plan_data = plan_path.read_bytes()
        require(sha256_hex(plan_data) == plan_ctx.get("imageContentId"), None, "evidence-bytes-mismatch",
                f"plan image bytes digest {sha256_hex(plan_data)} does not match imageContentId")
        plan_img = cv2.imread(str(plan_path), cv2.IMREAD_GRAYSCALE)
        require(plan_img is not None, None, "evidence-bytes-mismatch",
                "plan image bytes are not a decodable image")

        # ---- Gate 4: the redundancy law (>= 2 stills) --------------------
        require(len(evidence) >= int(policy["minStills"]), None, "insufficient-stills",
                f"{len(evidence)} still(s) supplied; this method requires >= {int(policy['minStills'])} "
                "(a single still yields an exactly-determined homography with no redundancy evidence — "
                "RANSAC inliers are self-referential and cannot discriminate a wrong registration)")

        # ---- Gate 5: feature floor (textureless) --------------------------
        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
        sift = cv2.SIFT_create(nfeatures=int(policy["siftNfeaturesCap"]),
                               contrastThreshold=float(policy["siftContrastThreshold"]),
                               edgeThreshold=float(policy["siftEdgeThreshold"]))
        t0 = time.perf_counter()
        plan_eq = clahe.apply(plan_img)
        kp_plan, des_plan = sift.detectAndCompute(plan_eq, None)
        feats = {}
        weak = []
        for ev in evidence:
            img_eq = clahe.apply(images[ev["contentId"]])
            kp, des = sift.detectAndCompute(img_eq, None)
            feats[ev["contentId"]] = (kp, des, img_eq)
            if des is None or len(kp) < int(policy["minKeypointsPerImage"]):
                weak.append(f"{ev['contentId']}({0 if des is None else len(kp)} keypoints)")
        stage_t["detect"] += time.perf_counter() - t0
        require(not weak, None, "insufficient-features",
                f"images below the {int(policy['minKeypointsPerImage'])}-keypoint floor: {', '.join(weak)} "
                "(textureless or feature-poor evidence cannot be anchored — refusing rather than guessing)")
        require(len(kp_plan) >= int(policy["minKeypointsPerImage"]), None, "insufficient-features",
                f"the plan raster has only {len(kp_plan)} keypoints (below the floor)")

        # ---- Gate 6: per-still registration (the typed PARTIAL path) -----
        refused_stills = []
        hypotheses = []
        est = {}
        per_still_notes = {}

        for ev in evidence:
            cid = ev["contentId"]
            kp, des, img_eq = feats[cid]
            t0 = time.perf_counter()
            if des is None or len(des) < int(policy["minMatchesForEstimate"]):
                stage_t["match"] += time.perf_counter() - t0
                refused_stills.append({
                    "contentId": cid,
                    "reasonCode": "registration-unreliable",
                    "detail": f"{cid}: only {0 if des is None else len(des)} descriptors "
                              f"(< {int(policy['minMatchesForEstimate'])} floor) — feature-poor still",
                })
                continue
            mq, mt = mutual_nearest_chunked(des, des_plan, int(policy["matcherChunkRows"]),
                                            int(policy["maxMatchesPerPair"]))
            stage_t["match"] += time.perf_counter() - t0
            if len(mq) < int(policy["minMatchesForEstimate"]):
                refused_stills.append({
                    "contentId": cid,
                    "reasonCode": "registration-unreliable",
                    "detail": f"{cid}: {len(mq)} mutual matches "
                              f"(< {int(policy['minMatchesForEstimate'])} floor) — the plan and the still "
                              "do not share enough distinctive structure",
                })
                continue
            src = np.float32([kp_plan[i].pt for i in mt])
            dst = np.float32([kp[i].pt for i in mq])
            t0 = time.perf_counter()
            h_est, mask = cv2.findHomography(
                src, dst, cv2.RANSAC, float(policy["ransacThresholdPx"]),
                maxIters=int(policy["ransacMaxIters"]), confidence=float(policy["ransacConfidence"]),
            )
            stage_t["estimate"] += time.perf_counter() - t0
            if h_est is None:
                refused_stills.append({
                    "contentId": cid,
                    "reasonCode": "registration-unreliable",
                    "detail": f"{cid}: no homography survived RANSAC",
                })
                continue
            inliers = int(mask.sum())
            if inliers < int(policy["minInliersPerStill"]):
                refused_stills.append({
                    "contentId": cid,
                    "reasonCode": "registration-unreliable",
                    "detail": f"{cid}: {inliers} RANSAC inliers "
                              f"(< {int(policy['minInliersPerStill'])} floor) — inlier support collapsed; "
                              "the plan and the still likely do not depict the same ground",
                })
                continue
            # THE PHOTOMETRIC VERIFICATION GATE (declared minAnchoredNcc):
            # warp the still into the plan frame over its anchored footprint
            # and require normalized cross-correlation against the plan.
            h_inv = np.linalg.inv(h_est)
            plan_h_px, plan_w_px = plan_eq.shape[1], plan_eq.shape[0]
            warped = cv2.warpPerspective(img_eq, h_inv, (plan_w_px, plan_h_px))
            foot = np.zeros(plan_eq.shape, np.uint8)
            still_h_px, still_w_px = img_eq.shape
            corners = np.float32([[0, 0], [still_w_px, 0], [still_w_px, still_h_px], [0, still_h_px]]).reshape(-1, 1, 2)
            quad = cv2.perspectiveTransform(corners, h_inv.astype(np.float32))
            cv2.fillPoly(foot, [quad.astype(np.int32)], 255)
            inter = foot.astype(bool)
            ncc_val = 0.0
            if int(inter.sum()) >= int(policy["nccFootprintMinPixels"]):
                ncc_val = ncc_over_mask(warped, plan_eq, inter)
            if ncc_val < float(policy["minAnchoredNcc"]):
                refused_stills.append({
                    "contentId": cid,
                    "reasonCode": "registration-unreliable",
                    "detail": f"{cid}: photometric verification failed "
                              f"(footprint NCC {ncc_val:.3f} < {float(policy['minAnchoredNcc'])} floor; "
                              f"{inliers} geometric inliers were NOT enough — the warped still does not "
                              "correspond to the plan imagery it claims to anchor to; refusing rather "
                              "than emitting an unverified anchor)",
                })
                per_still_notes[cid] = {"inliers": inliers, "matches": int(len(mq)), "ncc": round(ncc_val, 4)}
                continue
            # Inlier residual RMS (px, still space).
            inlier_mask = mask.ravel().astype(bool)
            proj = cv2.perspectiveTransform(src.reshape(-1, 1, 2), h_est).reshape(-1, 2)
            residuals = np.linalg.norm(proj - dst, axis=1)[inlier_mask]
            residual_rms = float(np.sqrt((residuals ** 2).mean()))
            # First-order floor-uncertainty via H^-1 Jacobian magnitude at the inliers (median).
            scales = []
            inlier_idx = np.where(inlier_mask)[0]
            for k in inlier_idx:
                p = dst[k]
                denom = h_inv[2, 0] * p[0] + h_inv[2, 1] * p[1] + h_inv[2, 2]
                x_num = h_inv[0, 0] * p[0] + h_inv[0, 1] * p[1] + h_inv[0, 2]
                y_num = h_inv[1, 0] * p[0] + h_inv[1, 1] * p[1] + h_inv[1, 2]
                d = denom ** 2
                jac = np.array([
                    [(h_inv[0, 0] * denom - x_num * h_inv[2, 0]) / d,
                     (h_inv[0, 1] * denom - x_num * h_inv[2, 1]) / d],
                    [(h_inv[1, 0] * denom - y_num * h_inv[2, 0]) / d,
                     (h_inv[1, 1] * denom - y_num * h_inv[2, 1]) / d],
                ])
                scales.append(np.sqrt(abs(np.linalg.det(jac))))
            scale_med = float(np.median(scales)) if scales else 1.0
            est[cid] = {
                "h": h_est,
                "inliers": inliers,
                "matches": int(len(mq)),
                "residualRmsPx": residual_rms,
                "scaleMed": scale_med,
                "inlierPts": dst[inlier_idx],
                "ncc": ncc_val,
            }

        # Whole-request fail-closed when NOTHING anchored. The refusal names
        # EVERY refused still with its compact per-still reason (the per-still
        # evidence for the refused case — the contract forbids the refusedStills
        # satellite on a whole-request refusal, so the detail text carries it).
        if not est:
            lines = []
            for r in refused_stills:
                d = r["detail"]
                m = re.search(r"footprint NCC (-?[0-9.]+) < ([0-9.]+) floor; ([0-9]+) geometric inliers", d)
                if m:
                    short = f"photometric verification failed (NCC {m.group(1)} < {m.group(2)}; {m.group(3)} inliers)"
                else:
                    m = re.search(r"\(([0-9]+) keypoints\)", d)
                    if m:
                        short = f"feature-poor ({m.group(1)} keypoints < floor)"
                    else:
                        m = re.search(r"([0-9]+) mutual matches", d)
                        if m:
                            short = f"{m.group(1)} mutual matches < floor"
                        else:
                            m = re.search(r"([0-9]+) RANSAC inliers", d)
                            short = f"{m.group(1)} RANSAC inliers < floor" if m else d.split(": ", 1)[-1][:70]
                lines.append(f"{r['contentId'][:16]}…: {short}")
            raise _Refusal("registration-unreliable",
                           f"no still could be registered to this plan (0/{len(evidence)} anchored). "
                           f"Per-still refusals: " + "; ".join(lines) +
                           ". Zero fabricated anchors.")

        # ---- Cross-validation leg (no ground truth used) ------------------
        t0 = time.perf_counter()
        crossval = {cid: [] for cid in est}
        cids = list(est.keys())
        for i in range(len(cids)):
            for j in range(i + 1, len(cids)):
                a, b = cids[i], cids[j]
                _, des_a, _ = feats[a]
                _, des_b, _ = feats[b]
                if des_a is None or des_b is None:
                    continue
                mq, mt = mutual_nearest_chunked(des_a, des_b, int(policy["matcherChunkRows"]),
                                                int(policy["maxMatchesPerPair"]))
                if len(mq) < int(policy["crossValMinInliers"]):
                    continue
                kp_a = feats[a][0]
                kp_b = feats[b][0]
                src = np.float32([kp_a[k].pt for k in mq])
                dst = np.float32([kp_b[k].pt for k in mt])
                h_ab, mask = cv2.findHomography(
                    src, dst, cv2.RANSAC, float(policy["ransacThresholdPx"]),
                    maxIters=int(policy["ransacMaxIters"]), confidence=float(policy["ransacConfidence"]),
                )
                if h_ab is None or int(mask.sum()) < int(policy["crossValMinInliers"]):
                    continue
                h_med = est[b]["h"] @ np.linalg.inv(est[a]["h"])
                pts = np.float32([[x, y] for x in range(100, 800, 100) for y in range(100, 600, 100)]).reshape(-1, 1, 2)
                t_direct = cv2.perspectiveTransform(pts, h_ab)
                t_med = cv2.perspectiveTransform(pts, h_med)
                residual = float(np.linalg.norm(t_direct - t_med, axis=2).mean())
                consistent = residual <= float(policy["crossValMaxResidualPx"])
                entry = {"peerContentId": b, "residualRmsPx": residual, "consistent": consistent}
                crossval[a].append(dict(entry, peerContentId=b))
                crossval[b].append(dict(entry, peerContentId=a))
        stage_t["crossval"] += time.perf_counter() - t0

        # ---- Assemble hypotheses (CANDIDATES, explicit uncertainty) -------
        frame_diag = float(np.hypot(1024.0, 768.0))
        for cid in cids:
            e = est[cid]
            consistent_peers = [c for c in crossval[cid] if c["consistent"]]
            inconsistent_peers = [c for c in crossval[cid] if not c["consistent"]]
            inlier_ratio = e["inliers"] / e["matches"]

            # Uncertainty budget v2.1 (declared, versioned; identical model to
            # the frozen ANCHOR-001 lane — max of the three honest terms).
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

            conf = 0.5 + 0.4 * min(1.0, e["inliers"] / 25.0) + 0.05 * min(1.0, inlier_ratio / 0.3)
            if consistent_peers:
                conf += 0.1 * min(1.0, len(consistent_peers) / 3.0)
            conf -= 0.15 * min(1.0, len(inconsistent_peers) / 2.0)
            conf = float(max(0.0, min(0.98, conf)))
            h_norm = e["h"] / e["h"][2, 2]
            hypotheses.append({
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
                    "basis": "inlier-residual-first-order-v2.1 (terms: residual+RANSAC-truncation, "
                             "crossval disagreement, support-spread extrapolation; max of terms)",
                    "budgetTerms": budget_terms,
                },
                "confidence": round(conf, 4),
                "epistemicLabel": EPISTEMIC_LABEL,
                "crossValidation": sorted(consistent_peers + inconsistent_peers,
                                          key=lambda c: c["peerContentId"]),
            })

        hypotheses.sort(key=lambda h: h["evidenceContentId"])
        refused_stills.sort(key=lambda r: r["contentId"])

        # ---- The typed outcome --------------------------------------------
        if refused_stills:
            response = {
                "schemaVersion": WIRE_SCHEMA_VERSION,
                "portVersion": PORT_VERSION,
                "contractVersion": CONTRACT_VERSION,
                "executionId": execution_id,
                "status": "partial",
                "reasonCode": None,
                "partialSummary": {
                    "anchoredStills": len(hypotheses),
                    "refusedStills": len(refused_stills),
                },
                "provenance": _provenance(input_digest, policy),
                "hypotheses": hypotheses,
                "refusedStills": refused_stills,
                "executionTimeMs": round((time.perf_counter() - t_start) * 1000.0, 3),
                "stageTimingsMs": {k: round(v * 1000.0, 3) for k, v in stage_t.items()},
            }
        else:
            response = {
                "schemaVersion": WIRE_SCHEMA_VERSION,
                "portVersion": PORT_VERSION,
                "contractVersion": CONTRACT_VERSION,
                "executionId": execution_id,
                "status": "anchored",
                "reasonCode": None,
                "provenance": _provenance(input_digest, policy),
                "hypotheses": hypotheses,
                "executionTimeMs": round((time.perf_counter() - t_start) * 1000.0, 3),
                "stageTimingsMs": {k: round(v * 1000.0, 3) for k, v in stage_t.items()},
            }
        print(json.dumps(response, sort_keys=True))
        return 0

    except _Refusal as ref:
        print(json.dumps(refuse(execution_id, ref.reason_code, ref.detail, input_digest,
                                {**DEFAULT_CONFIG, **(req.get("policy") or {})}, stage_t)))
        return 0


if __name__ == "__main__":
    sys.exit(main())
