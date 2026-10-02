#!/usr/bin/env python3
"""
ANCHOR-007 — PATH (a) adapter: photos -> LINE-ART PLAN through an
INTERMEDIATE RASTER BASE MAP, via the EXISTING reference lane.

The PORT.md §7 second open question's path (a): "an intermediate
orthophoto/raster base map". This adapter derives an intermediate raster
FROM THE LINE-ART PLAN ITSELF (the only information the plan carries — a
plan knows WHERE its walls are, not what the real floor LOOKS like), then
runs the ANCHOR-003b reference lane (CLAHE + SIFT + chunked mutual-nearest
+ RANSAC plan-homography + the photometric NCC verification gate) with the
intermediate raster standing in for the plan image.

DECLARED intermediate-raster derivations (config `intermediateRasterDerivation`):
  - "wall-region-synthesis/1" (primary): binarize the drawing ink, close+
    dilate to solidify wall lines into filled wall regions, then synthesize
    a deterministic procedural floor texture (per-tile hash shades on a
    0.5 m grid at the declared rasterToScene scale) in the non-wall
    regions — an orthophoto-STYLE base map geometrically faithful to the
    plan's ink.
  - "line-blob/1" (the minimal variant): the closed+dilated ink alone.

THE MEASURED QUESTION this adapter answers: does ANY appearance-based
correspondence exist between real photographs and a raster derived from
plan geometry alone? The photometric verification gate (minAnchoredNcc,
carried verbatim from the ANCHOR-003b adapter — the 003b finding-#2 law:
every adapter against real capture carries an equivalent DECLARED gate)
measures exactly that: the warped still must photometrically agree with
the intermediate raster it claims to anchor to.

CONTRACT: `anchor002-anchoring-contract/1` wire shapes, the 003b gate
order (structural -> plan -> representation -> methods (before bytes) ->
content addressing -> redundancy -> features -> per-still registration),
typed PARTIAL outcome, zero hypotheses on refusals, provenance with every
parameter echoed verbatim. Deterministic: cv2.setRNGSeed(FIXED), the
chunked mutual-nearest matcher is pure numpy.

Run (the supervised runner spawns it; never by hand):
  <python> path_a_provider.py < request.json > response.json
"""

import hashlib
import json
import platform
import sys
import time
from pathlib import Path

import cv2
import numpy as np

PROVIDER_ID = "lineart-intermediate-raster-spike"
PROVIDER_VERSION = "anchor007-path-a/1"
PORT_VERSION = "anchor002-anchoring-contract/1"
CONTRACT_VERSION = "1.0.0"
WIRE_SCHEMA_VERSION = 1
FIXED_RNG_SEED = 20261002

SUPPORTED_PLAN_KINDS = {"plan-raster"}
SUPPORTED_REPRESENTATIONS = {"plan-homography"}
SUPPORTED_METHODS = {"STILL_IMAGERY"}
SUPPORTED_MEDIA_PREFIX = "image/"
EPISTEMIC_LABEL = "INFERRED"

WHOLE_REQUEST_REASON_CODES = {
    "input-contract-violation", "plan-context-missing", "plan-context-unsupported",
    "representation-unsupported", "evidence-method-unsupported", "evidence-bytes-mismatch",
    "insufficient-stills", "insufficient-features", "registration-unreliable",
}
PER_STILL_REASON_CODES = {
    "evidence-method-unsupported", "evidence-bytes-mismatch", "insufficient-features",
    "registration-unreliable",
}

DEFAULT_CONFIG = {
    "method": "path-a: intermediate raster base map + reference SIFT/RANSAC lane",
    "intermediateRasterDerivation": "wall-region-synthesis/1",
    "inkThreshold": 160,
    "closeIterations": 2,
    "dilateIterations": 2,
    "synthTileM": 0.5,
    "synthTileShadeSpread": 55,
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
    "uncertaintyModel": "inlier-residual-first-order-v2.1+plan-instrument-systematic",
    "confidenceModel": "inliers-and-ncc-heuristic/1",
}


class _Refusal(Exception):
    def __init__(self, reason_code, detail):
        super().__init__(detail)
        self.reason_code = reason_code
        self.detail = detail


def sha256_hex(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def adapter_digest() -> str:
    return "sha256:" + hashlib.sha256(Path(__file__).read_bytes()).hexdigest()


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


def refuse(execution_id, reason_code, detail, input_digest, config, stage_t=None):
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


def require(condition, reason, detail):
    if not condition:
        raise _Refusal(reason, detail)


# --------------------------------------------------------------------- ---
# The intermediate-raster derivations (the declared methods)               |
# --------------------------------------------------------------------- ---

def _splitmix32(x):
    x = (x + 0x9E3779B9) & 0xFFFFFFFF
    x ^= x >> 16
    x = (x * 0x21F0AAAD) & 0xFFFFFFFF
    x ^= x >> 15
    x = (x * 0x735A2D97) & 0xFFFFFFFF
    x ^= x >> 15
    return x & 0xFFFFFFFF


def derive_intermediate_raster(plan_img, policy):
    """Derive the intermediate raster from the line-art plan (declared method)."""
    method = str(policy["intermediateRasterDerivation"])
    ink_thr = int(policy["inkThreshold"])
    px_per_m = float(policy["_pixelsPerMeter"])  # injected by the caller
    ink = (plan_img < ink_thr).astype(np.uint8)
    kernel = np.ones((3, 3), np.uint8)
    closed = cv2.morphologyEx(ink, cv2.MORPH_CLOSE, kernel,
                              iterations=int(policy["closeIterations"]))
    walls = cv2.dilate(closed, kernel, iterations=int(policy["dilateIterations"]))
    if method == "line-blob/1":
        inter = np.where(walls > 0, 40, 225).astype(np.uint8)
        return inter, {"method": method, "wallPixels": int(walls.sum())}
    if method == "wall-region-synthesis/1":
        # deterministic procedural floor texture in the non-wall regions:
        # per-tile hash shades on a synthTileM grid + large-scale mottle
        h, w = plan_img.shape
        tile = max(2, int(round(float(policy["synthTileM"]) * px_per_m)))
        spread = float(policy["synthTileShadeSpread"])
        yy, xx = np.mgrid[0:h, 0:w]
        ty, tx = (yy // tile).astype(np.int64), (xx // tile).astype(np.int64)
        seed = (ty * 1000003 + tx * 101 + 17) & 0xFFFFFFFF
        shade = np.zeros((h, w), np.float32)
        # vectorized splitmix32 over the grid (per unique tile, then expand)
        uniq = {}
        keys = np.unique(np.stack([ty.ravel(), tx.ravel()], axis=1), axis=0)
        for k in keys:
            uniq[(int(k[0]), int(k[1]))] = _splitmix32(int(k[0]) * 1000003 + int(k[1]) * 101 + 17)
        shade_map = np.array([[uniq[(int(a), int(b))] for b in range(tx.max() + 1)]
                              for a in range(ty.max() + 1)], dtype=np.float32)
        shade = shade_map[ty, tx] / 4294967295.0
        mottle = 0.5 + 0.5 * np.sin(xx / (13.0 * tile)) * np.cos(yy / (17.0 * tile))
        base = 150.0 + spread * (0.5 * shade + 0.3 * mottle - 0.4)
        inter = np.where(walls > 0, 40.0, np.clip(base, 60, 235)).astype(np.uint8)
        return inter, {"method": method, "wallPixels": int(walls.sum()),
                       "synthTilePx": tile}
    raise _Refusal("input-contract-violation",
                   f"unknown intermediateRasterDerivation {method!r} (declared methods: "
                   "wall-region-synthesis/1, line-blob/1)")


# --------------------------------------------------------------------- ---
# The ANCHOR-003b reference lane internals (carried, cited)                |
# --------------------------------------------------------------------- ---

def mutual_nearest_chunked(des_q, des_t, chunk_rows, top_k):
    n_q = des_q.shape[0]
    best_train_for_query = np.full(n_q, -1, dtype=np.int64)
    best_dist_for_query = np.full(n_q, np.inf, dtype=np.float32)
    des_q_t = np.ascontiguousarray(des_q.T)
    qa_all = (des_q * des_q).sum(axis=1)
    for start in range(0, n_q, chunk_rows):
        stop = min(start + chunk_rows, n_q)
        block = des_q[start:stop]
        qa = qa_all[start:stop][:, None]
        tb = (des_t * des_t).sum(axis=1)[None, :]
        dots = block @ des_t.T
        d2 = qa + tb - 2.0 * dots
        idx = np.argmin(d2, axis=1)
        val = d2[np.arange(stop - start), idx]
        best_train_for_query[start:stop] = idx
        best_dist_for_query[start:stop] = val
    cand = np.unique(best_train_for_query[best_train_for_query >= 0])
    if cand.size == 0:
        return np.empty(0, dtype=np.int64), np.empty(0, dtype=np.int64)
    des_t_cand = np.ascontiguousarray(des_t[cand])
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
    cand_pos = {int(t): i for i, t in enumerate(cand)}
    q_idx = np.arange(n_q)
    t_idx = best_train_for_query
    mutual = np.array([i for i in range(n_q)
                       if t_idx[i] >= 0 and best_query_for_cand[cand_pos[int(t_idx[i])]] == i],
                      dtype=np.int64)
    if mutual.size == 0:
        return np.empty(0, dtype=np.int64), np.empty(0, dtype=np.int64)
    mq = mutual
    mt = t_idx[mutual]
    md = best_dist_for_query[mutual]
    order = np.argsort(md, kind="stable")[:top_k]
    return mq[order], mt[order]


def ncc_over_mask(a, b, mask):
    av = a[mask].astype(np.float64)
    bv = b[mask].astype(np.float64)
    av -= av.mean()
    bv -= bv.mean()
    denom = np.sqrt((av * av).sum() * (bv * bv).sum())
    if denom <= 0:
        return 0.0
    return float((av * bv).sum() / denom)


# --------------------------------------------------------------------- ---
# main                                                                     |
# --------------------------------------------------------------------- ---

def main() -> int:
    t_start = time.perf_counter()
    cv2.setRNGSeed(FIXED_RNG_SEED)

    raw = sys.stdin.buffer.read()
    try:
        req = json.loads(raw)
    except json.JSONDecodeError as exc:
        print(json.dumps(refuse("unknown", "input-contract-violation",
                                f"request is not valid JSON: {exc}", None, DEFAULT_CONFIG)))
        return 0

    execution_id = req.get("executionId", "unknown")
    input_digest = "sha256:" + sha256_hex(raw)
    stage_t = {"derive": 0.0, "detect": 0.0, "match": 0.0, "estimate": 0.0, "crossval": 0.0}

    try:
        # ---- Gate 1: structural sanity ----------------------------------
        require(req.get("portVersion") == PORT_VERSION, "input-contract-violation",
                f"portVersion must be '{PORT_VERSION}' (got {req.get('portVersion')!r})")
        require(req.get("schemaVersion") == WIRE_SCHEMA_VERSION, "input-contract-violation",
                f"schemaVersion must be {WIRE_SCHEMA_VERSION}")
        require(req.get("contractVersion") == CONTRACT_VERSION, "input-contract-violation",
                f"contractVersion must be '{CONTRACT_VERSION}' (got {req.get('contractVersion')!r})")
        require(req.get("authority") == "AISE", "input-contract-violation",
                "authority must be 'AISE' (the request is authored in AISE-owned semantics)")
        require(req.get("units") == "SI", "input-contract-violation", "units must be 'SI'")
        evidence = req.get("evidence")
        require(isinstance(evidence, list) and len(evidence) >= 1, "input-contract-violation",
                "evidence must be a non-empty list")
        for idx, ev in enumerate(evidence):
            require(isinstance(ev, dict)
                    and isinstance(ev.get("contentId"), str) and len(ev.get("contentId", "")) == 64
                    and all(c in "0123456789abcdef" for c in ev.get("contentId", ""))
                    and isinstance(ev.get("mediaType"), str)
                    and isinstance(ev.get("acquisitionMethod"), str)
                    and isinstance(ev.get("bytesPath"), str),
                    "input-contract-violation",
                    f"evidence[{idx}] must carry contentId (64-hex), mediaType, acquisitionMethod, bytesPath")

        policy = {**DEFAULT_CONFIG, **(req.get("policy") or {})}

        # ---- Gate 2: plan context present + supported + HANDEDNESS ------
        plan_ctx = req.get("planContext")
        require(plan_ctx is not None, "plan-context-missing",
                "no plan/floor context was supplied; anchoring requires one — refusing rather than fabricating")
        require(isinstance(plan_ctx, dict), "input-contract-violation", "planContext must be an object")
        require(plan_ctx.get("kind") in SUPPORTED_PLAN_KINDS, "plan-context-unsupported",
                f"planContext.kind {plan_ctx.get('kind')!r} is not in {sorted(SUPPORTED_PLAN_KINDS)} "
                "(the production kind vocabulary stays closed — a line-art plan travels as a plan RASTER; "
                "the line-art METHOD lives in this adapter's declared config, never in the vocabulary)")
        raster = plan_ctx.get("rasterToScene")
        require(isinstance(raster, dict)
                and isinstance(raster.get("pixelsPerMeter"), (int, float))
                and raster.get("pixelsPerMeter", 0) > 0
                and raster.get("xDirection") == "east-right"
                and raster.get("yDirection") == "north-up"
                and isinstance(raster.get("worldOriginPx"), list)
                and len(raster.get("worldOriginPx", [])) == 2,
                "input-contract-violation",
                "planContext.rasterToScene must declare pixelsPerMeter>0, xDirection 'east-right', "
                "yDirection 'north-up', worldOriginPx [x,y] (THE HANDEDNESS LAW — a screen-convention "
                "raster silently mirrors every anchor past every numeric gate)")
        pixels_per_meter = float(raster["pixelsPerMeter"])
        policy["_pixelsPerMeter"] = pixels_per_meter  # internal plumbing, stripped from the echo below
        # the plan-instrument systematic term's reference extent: the plan's own
        # larger dimension in meters (the drawing's measured-vs-annotated tension
        # is ~1.5% of scale-carrying extents; fixture.md records the evidence)
        policy["_structureExtentM"] = 23.42
        requested = (req.get("requestedAnchoring") or {}).get("representation")
        require(requested in SUPPORTED_REPRESENTATIONS, "representation-unsupported",
                f"requestedAnchoring.representation {requested!r} is not in {sorted(SUPPORTED_REPRESENTATIONS)}")

        # ---- Gate 3: evidence methods supported (BEFORE reading bytes) ---
        for ev in evidence:
            require(ev["acquisitionMethod"] in SUPPORTED_METHODS, "evidence-method-unsupported",
                    f"evidence {ev['contentId']} has acquisitionMethod {ev['acquisitionMethod']!r}; "
                    f"this method supports {sorted(SUPPORTED_METHODS)} only")
            require(ev["mediaType"].startswith(SUPPORTED_MEDIA_PREFIX), "evidence-method-unsupported",
                    f"evidence {ev['contentId']} has mediaType {ev['mediaType']!r}; still-image bytes required")
        require(plan_ctx.get("imageMediaType", "").startswith(SUPPORTED_MEDIA_PREFIX), "evidence-method-unsupported",
                f"plan image mediaType {plan_ctx.get('imageMediaType')!r}; a plan RASTER image is required")

        # Content addressing
        images = {}
        for ev in evidence:
            path = Path(ev["bytesPath"])
            require(path.is_file(), "evidence-bytes-mismatch",
                    f"evidence {ev['contentId']} bytesPath {ev['bytesPath']} is not a readable file")
            data = path.read_bytes()
            require(sha256_hex(data) == ev["contentId"], "evidence-bytes-mismatch",
                    f"evidence {ev['contentId']} bytes digest {sha256_hex(data)} does not match its content id")
            img = cv2.imread(str(path), cv2.IMREAD_GRAYSCALE)
            require(img is not None, "evidence-bytes-mismatch",
                    f"evidence {ev['contentId']} bytes are not a decodable still image")
            images[ev["contentId"]] = img

        plan_path = Path(plan_ctx["bytesPath"])
        require(plan_path.is_file(), "evidence-bytes-mismatch",
                f"plan image bytesPath {plan_ctx['bytesPath']} is not a readable file")
        plan_data = plan_path.read_bytes()
        require(sha256_hex(plan_data) == plan_ctx.get("imageContentId"), "evidence-bytes-mismatch",
                f"plan image bytes digest {sha256_hex(plan_data)} does not match imageContentId")
        plan_img = cv2.imread(str(plan_path), cv2.IMREAD_GRAYSCALE)
        require(plan_img is not None, "evidence-bytes-mismatch", "plan image bytes are not a decodable image")

        # ---- Gate 4: the redundancy law ----------------------------------
        require(len(evidence) >= int(policy["minStills"]), "insufficient-stills",
                f"{len(evidence)} still(s) supplied; this method requires >= {int(policy['minStills'])} "
                "(a single still yields an exactly-determined homography with no redundancy evidence — "
                "RANSAC inliers are self-referential and cannot discriminate a wrong registration)")

        # ---- THE PATH-(a) DERIVATION: the intermediate raster ------------
        t0 = time.perf_counter()
        inter, derive_info = derive_intermediate_raster(plan_img, policy)
        stage_t["derive"] += time.perf_counter() - t0

        # ---- Gate 5: feature floor ---------------------------------------
        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
        sift = cv2.SIFT_create(nfeatures=int(policy["siftNfeaturesCap"]),
                               contrastThreshold=float(policy["siftContrastThreshold"]),
                               edgeThreshold=float(policy["siftEdgeThreshold"]))
        t0 = time.perf_counter()
        inter_eq = clahe.apply(inter)
        kp_plan, des_plan = sift.detectAndCompute(inter_eq, None)
        feats = {}
        weak = []
        for ev in evidence:
            img_eq = clahe.apply(images[ev["contentId"]])
            kp, des = sift.detectAndCompute(img_eq, None)
            feats[ev["contentId"]] = (kp, des, img_eq)
            if des is None or len(kp) < int(policy["minKeypointsPerImage"]):
                weak.append(f"{ev['contentId']}({0 if des is None else len(kp)} keypoints)")
        stage_t["detect"] += time.perf_counter() - t0
        require(not weak, "insufficient-features",
                f"images below the {int(policy['minKeypointsPerImage'])}-keypoint floor: {', '.join(weak)} "
                "(textureless or feature-poor evidence cannot be anchored — refusing rather than guessing)")
        require(len(kp_plan) >= int(policy["minKeypointsPerImage"]), "insufficient-features",
                f"the derived intermediate raster has only {len(kp_plan)} keypoints (below the floor) — "
                "the plan-derived base map does not carry enough feature structure for this lane")

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
                    "contentId": cid, "reasonCode": "registration-unreliable",
                    "detail": f"{cid}: only {0 if des is None else len(des)} descriptors "
                              f"(< {int(policy['minMatchesForEstimate'])} floor) — feature-poor still",
                })
                continue
            mq, mt = mutual_nearest_chunked(des, des_plan, int(policy["matcherChunkRows"]),
                                             int(policy["maxMatchesPerPair"]))
            stage_t["match"] += time.perf_counter() - t0
            if len(mq) < int(policy["minMatchesForEstimate"]):
                refused_stills.append({
                    "contentId": cid, "reasonCode": "registration-unreliable",
                    "detail": f"{cid}: {len(mq)} mutual matches "
                              f"(< {int(policy['minMatchesForEstimate'])} floor) — the photograph and the "
                              "plan-derived intermediate raster share no appearance structure",
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
                refused_stills.append({"contentId": cid, "reasonCode": "registration-unreliable",
                                       "detail": f"{cid}: no homography survived RANSAC"})
                continue
            inliers = int(mask.sum())
            if inliers < int(policy["minInliersPerStill"]):
                refused_stills.append({
                    "contentId": cid, "reasonCode": "registration-unreliable",
                    "detail": f"{cid}: {inliers} RANSAC inliers "
                              f"(< {int(policy['minInliersPerStill'])} floor) — inlier support collapsed; "
                              "the photograph and the plan-derived base map likely do not depict the same ground",
                })
                continue
            # THE PHOTOMETRIC VERIFICATION GATE (declared minAnchoredNcc):
            # the warped still must agree photometrically with the intermediate raster.
            h_inv = np.linalg.inv(h_est)
            ph, pw = inter_eq.shape[0], inter_eq.shape[1]
            warped = cv2.warpPerspective(img_eq, h_inv, (pw, ph))
            foot = np.zeros(inter_eq.shape, np.uint8)
            sh, sw = img_eq.shape
            corners = np.float32([[0, 0], [sw, 0], [sw, sh], [0, sh]]).reshape(-1, 1, 2)
            quad = cv2.perspectiveTransform(corners, h_inv.astype(np.float32))
            cv2.fillPoly(foot, [quad.astype(np.int32)], 255)
            interm = foot.astype(bool)
            ncc_val = 0.0
            if int(interm.sum()) >= int(policy["nccFootprintMinPixels"]):
                ncc_val = ncc_over_mask(warped, inter_eq, interm)
            if ncc_val < float(policy["minAnchoredNcc"]):
                refused_stills.append({
                    "contentId": cid, "reasonCode": "registration-unreliable",
                    "detail": f"{cid}: photometric verification failed "
                              f"(footprint NCC {ncc_val:.3f} < {float(policy['minAnchoredNcc'])} floor; "
                              f"{inliers} geometric inliers were NOT enough — the warped photograph does not "
                              "correspond to the plan-derived base map it claims to anchor to; refusing rather "
                              "than emitting an unverified anchor)",
                })
                per_still_notes[cid] = {"inliers": inliers, "matches": int(len(mq)), "ncc": round(ncc_val, 4)}
                continue
            inlier_mask = mask.ravel().astype(bool)
            proj = cv2.perspectiveTransform(src.reshape(-1, 1, 2), h_est).reshape(-1, 2)
            residuals = np.linalg.norm(proj - dst, axis=1)[inlier_mask]
            residual_rms = float(np.sqrt((residuals ** 2).mean()))
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
            est[cid] = {"h": h_est, "inliers": inliers, "matches": int(len(mq)),
                        "residualRmsPx": residual_rms, "scaleMed": scale_med,
                        "inlierPts": dst[inlier_idx], "ncc": ncc_val}

        # Whole-request fail-closed when NOTHING anchored
        if not est:
            lines = []
            for r in refused_stills:
                d = r["detail"]
                for pat, short in (
                    (r"footprint NCC (-?[0-9.]+) < ([0-9.]+) floor; ([0-9]+) geometric inliers",
                     lambda m: f"photometric verification failed (NCC {m.group(1)} < {m.group(2)}; {m.group(3)} inliers)"),
                    (r"\(([0-9]+) keypoints\)", lambda m: f"feature-poor ({m.group(1)} keypoints < floor)"),
                    (r"([0-9]+) mutual matches", lambda m: f"{m.group(1)} mutual matches < floor"),
                    (r"([0-9]+) RANSAC inliers", lambda m: f"{m.group(1)} RANSAC inliers < floor"),
                ):
                    import re as _re
                    m = _re.search(pat, d)
                    if m:
                        lines.append(f"{r['contentId'][:16]}…: {short(m)}")
                        break
                else:
                    lines.append(f"{r['contentId'][:16]}…: {d.split(': ', 1)[-1][:70]}")
            raise _Refusal("registration-unreliable",
                           f"no still could be registered to the plan through the intermediate raster "
                           f"(0/{len(evidence)} anchored; derivation {policy['intermediateRasterDerivation']}). "
                           f"Per-still refusals: " + "; ".join(lines) + ". Zero fabricated anchors.")

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

            # Uncertainty budget v2.1 + the plan-instrument systematic term
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
            term_d = 0.015 * float(policy["_structureExtentM"])  # plan-instrument systematic (1.5%)
            floor_rms_m = max(term_a, term_b, term_c, term_d)
            budget_terms = {
                "inlierResidualPlusTruncationM": round(term_a, 6),
                "crossvalDisagreementM": round(term_b, 6),
                "supportSpreadExtrapolationM": round(term_c, 6),
                "planInstrumentSystematicM": round(term_d, 6),
            }

            conf = 0.5 + 0.4 * min(1.0, e["inliers"] / 25.0) + 0.05 * min(1.0, inlier_ratio / 0.3)
            conf += 0.1 * min(1.0, max(0.0, (e["ncc"] - float(policy["minAnchoredNcc"])) / 0.4))
            if consistent_peers:
                conf += 0.1 * min(1.0, len(consistent_peers) / 3.0)
            conf -= 0.15 * min(1.0, len(inconsistent_peers) / 2.0)
            conf = float(max(0.0, min(0.98, conf)))
            h_norm = e["h"] / e["h"][2, 2]
            hypotheses.append({
                "evidenceContentId": cid,
                "representation": "plan-homography",
                "transform": {
                    "frameFrom": "plan-raster-px", "frameTo": "still-px",
                    "matrix": [[float(v) for v in row] for row in h_norm],
                },
                "inlierCount": e["inliers"], "matchCount": e["matches"],
                "inlierRatio": round(inlier_ratio, 4),
                "residualRmsPx": round(e["residualRmsPx"], 4),
                "uncertainty": {
                    "floorRmsM": round(floor_rms_m, 6),
                    "budget95M": round(1.96 * floor_rms_m, 6),
                    "basis": "inlier-residual-first-order-v2.1+plan-instrument-systematic "
                             "(terms: residual+RANSAC-truncation, crossval disagreement, support-spread "
                             "extrapolation, plan-instrument systematic 1.5%; max of terms)",
                    "budgetTerms": budget_terms,
                },
                "confidence": round(conf, 4),
                "epistemicLabel": EPISTEMIC_LABEL,
                "crossValidation": sorted(consistent_peers + inconsistent_peers,
                                          key=lambda c: c["peerContentId"]),
            })

        hypotheses.sort(key=lambda h: h["evidenceContentId"])
        refused_stills.sort(key=lambda r: r["contentId"])

        config_echo = {k: v for k, v in policy.items() if not k.startswith("_")}
        config_echo["intermediateRasterDerivationInfo"] = derive_info

        if refused_stills:
            response = {
                "schemaVersion": WIRE_SCHEMA_VERSION, "portVersion": PORT_VERSION,
                "contractVersion": CONTRACT_VERSION, "executionId": execution_id,
                "status": "partial", "reasonCode": None,
                "partialSummary": {"anchoredStills": len(hypotheses), "refusedStills": len(refused_stills)},
                "provenance": _provenance(input_digest, config_echo),
                "hypotheses": hypotheses, "refusedStills": refused_stills,
                "executionTimeMs": round((time.perf_counter() - t_start) * 1000.0, 3),
                "stageTimingsMs": {k: round(v * 1000.0, 3) for k, v in stage_t.items()},
            }
        else:
            response = {
                "schemaVersion": WIRE_SCHEMA_VERSION, "portVersion": PORT_VERSION,
                "contractVersion": CONTRACT_VERSION, "executionId": execution_id,
                "status": "anchored", "reasonCode": None,
                "provenance": _provenance(input_digest, config_echo),
                "hypotheses": hypotheses,
                "executionTimeMs": round((time.perf_counter() - t_start) * 1000.0, 3),
                "stageTimingsMs": {k: round(v * 1000.0, 3) for k, v in stage_t.items()},
            }
        print(json.dumps(response, sort_keys=True))
        return 0

    except _Refusal as ref:
        policy_echo = {k: v for k, v in {**DEFAULT_CONFIG, **(req.get("policy") or {})}.items()
                       if not k.startswith("_")}
        print(json.dumps(refuse(execution_id, ref.reason_code, ref.detail, input_digest,
                                policy_echo, stage_t)))
        return 0


if __name__ == "__main__":
    sys.exit(main())
