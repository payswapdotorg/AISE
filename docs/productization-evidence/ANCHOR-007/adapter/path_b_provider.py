#!/usr/bin/env python3
"""
ANCHOR-007 — PATH (b) adapter: photos -> LINE-ART PLAN through GEOMETRIC
WALL-LINE REGISTRATION, WITHOUT shared texture.

The PORT.md §7 second open question's path (b): "a geometric (wall-line)
registration lane — a separate method, a separate adapter". No appearance
matching anywhere: the photo's LINE STRUCTURE is registered to the plan's
line-work by pure geometry.

DECLARED METHOD `vp-rectified-line-search/3`:

  1. PHOTO: LSD line segments (deterministic). Cluster by orientation into
     direction families: the vertical family + the top-K non-vertical
     orientation peaks (K = familyCandidatePeaks).
  2. VANISHING POINTS: each family's VP by robust pairwise intersection
     (median of supported intersections; near-parallel families give a
     direction at infinity, handled explicitly).
  3. MANHATTAN-FRAME SELECTION: enumerate the peak PAIRS; keep those
     passing the 3-VP orthogonality consistency (<= 0.35); among them,
     select the pair whose rectified ground cloud MEASURES the best RAW
     DIRECTION-GATED SUPPORT over its reduced-grid multi-peak candidates
     (strength product as the declared tie-break). (v1 took the two
     strongest peaks blindly — the drill measured a 12-deg-off second
     direction from dimension-string ink; the first /2 draft trusted
     orthogonality alone and the drill measured a phantom 22.5-deg
     direction winning it with a free focal; the /2 share-based rank
     measured preferring small dimension-string clouds — the drill's
     winning pair was its WORST one at 26.9-m realized error; all
     recorded honestly.)
  4. RECTIFICATION: with the chosen triple and a DECLARED camera
     approximation (square pixels, principal point = image center, focal
     self-calibrated from the orthogonal VP pairs; fallback f = image
     width), build the ground-plane homography up to a 2D similarity,
     under THE CAMERA-SIDE LAW: photographs are taken from above the
     ground plane, held upright (|roll| < 90 deg — a DECLARED
     approximation), so world-UP is the +/-vertical-VP direction member
     with negative camera-y. (v1 omitted the law: for a downward-tilted
     camera the vertical VP yields world-DOWN, the rectified frame is a
     REFLECTION of the plan's (east, north) frame, unreachable by the
     rotation-only search — the drill measured exactly this failure.)
  5. PLAN SIDE: a boundary scoring field at a working scale and a
     half-resolution coarse twin (any-ink block reduction, ink-minus-
     erosion boundaries so solid poché blobs score only at their rims),
     plus the full-resolution ink and distance transform for the
     refinement and the verification gates.
  6. SEARCH (the /3 two-stage form): a coarse (rotation, scale) grid on
     the half-resolution field with PADDED LINEAR FFT translation
     correlation (no wraparound; the v1 circular form manufactured false
     peaks — measured); every coarse entry is scored with the fast
     DIRECTION-GATED support, and at EACH scale the fine stage fans two
     rotation ladders — around that scale's gated-best theta and its
     correlation-best theta — over a fine scale ladder (+/-
     fineScaleOctaves), MULTI-PEAK translations per entry. Every candidate
     is ranked by the DIRECTION-GATED SUPPORT — the final gates' own
     metric — and the top-K distinct candidates become seeds. (The /2
     correlation ranking measured the truth's translation at rank ~5-6 of
     its own entry with false dense-ink placements outscoring it at EVERY
     scale; the 1.84x scale steps left the truth 13% from the nearest
     grid point where its gated support collapsed; the first /3 draft
     fanned only the correlation-best theta per scale — at the truth's
     scale that was the 90-deg TWIN branch, so the truth's rotation was
     never explored; the gated-best theta at the truth's scale IS the
     truth's branch (its near-truth best peak gates highest at that
     scale); the swap=90 axis parameter was a redundant rotation shift
     (the measured identical twins) and is removed; all recorded.)
  7. REFINEMENT (the /2 addition): the coarse similarity is only a SEED.
     VP noise tilts the rectified plane, so the truth can sit ~100+ px
     from any similarity (measured on the drill). TWO PHASES of iterated
     nearest-ink + robust DLT homography refitting: first at a reduced
     ink scale (radii 50 -> 30 — tolerant), then at FULL plan
     resolution (radii 60 -> 6 plan px — precise). The refined transform
     absorbs the rectification tilt.
  8. DECLARED VERIFICATION GATES (the 003b finding-#2 law — a geometric
     method carries a GEOMETRIC gate, declared and versioned), measured
     against the FULL-RESOLUTION plan ink on the REFINED winner:
       - minInliersPerStill: ground segments whose midpoint lands within
         supportTolerancePx of plan ink AND runs along it (the direction
         gate; proximity-only support measured ~57% on random placements
         inside dense pads — recorded);
       - minSupportSpreadM: support extent in plan meters, BOTH axes;
       - minPeakMargin (THE REFINED AMBIGUITY GATE): a DISTINCT refined
         hypothesis that also passes every gate must NOT come within
         minPeakMargin of the winner's support — else the registration is
         ambiguous and refused (the coarse correlation alone cannot
         discriminate on dense line-art plans; measured on the drill);
       - maxSupportRmsM: the RMS support distance in plan meters;
       - minSupportShare (the /3 addition): the supported fraction of the
         ground bundle — the /2 drills measured FALSE anchors passing
         every other gate at 26-41% share while the truth measured
         56-65%; a false anchor emits a fabricated sub-meter budget on a
         tens-of-meters-wrong mapping, and the share floor refuses that
         class (measured justification; declared).

HONEST LIMITS (declared in every response's provenance.config):
  - the rectification assumes square pixels + principal point at center
    (focal self-calibrated; a DECLARED approximation whose error the
    refinement absorbs to first order and the budget carries);
  - THE CAMERA-SIDE LAW assumes |roll| < 90 deg (upright photographs);
  - elevated parallel planes (the roof slab, the raised floor slab over
    the terrace) produce image lines in the SAME direction families but
    WRONG rectified positions (height parallax) — the refinement weights
    them by proximity and the support gates absorb them, and the realized
    error is expected to be plane-dependent (MEASURED, not hidden);
  - no cross-validation leg in this version (the plan-independent
    still-to-still geometric registration is future work; the budget's
    crossval term is zero and the confidence model does not claim it).

CONTRACT: `anchor002-anchoring-contract/1` wire shapes, the 003b gate
order, typed PARTIAL outcome, zero hypotheses on refusals, provenance with
every parameter echoed verbatim. Deterministic end to end (no RNG at all:
LSD is deterministic, the grid search is exhaustive with fixed tie-break,
the refinement's nearest-ink offsets are scan-order deterministic).

Run (the supervised runner spawns it; never by hand):
  <python> path_b_provider.py < request.json > response.json
"""

import hashlib
import json
import platform
import sys
import time
from pathlib import Path

import cv2
import numpy as np

PROVIDER_ID = "wall-line-geometric-spike"
PROVIDER_VERSION = "anchor007-path-b/2"
PORT_VERSION = "anchor002-anchoring-contract/1"
CONTRACT_VERSION = "1.0.0"
WIRE_SCHEMA_VERSION = 1

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
    "method": "path-b: vp-rectified-line-search/3 (geometric wall-line registration, no texture)",
    "lsdMinSegmentPx": 60,
    "directionHistBins": 180,
    "groundClusterTolDeg": 10.0,
    "secondPeakFraction": 0.06,
    "verticalClusterCenterDeg": 90.0,
    "verticalClusterTolDeg": 12.0,
    "familyCandidatePeaks": 4,
    "pairSearchRotationStepDeg": 10.0,
    "pairSearchScaleSteps": 3,
    "pairSearchPeaksPerEntry": 4,
    "vpSupportMaxAngleDeg": 2.5,
    "vpMaxFiniteDistPx": 60000.0,
    "cameraModel": ("vp-orthogonality-self-calibration/1 (square pixels, pp = image center, "
                    "f estimated from the orthogonal VP pairs; fallback f = image width) "
                    "+ camera-side law (upright camera, |roll| < 90 deg)"),
    "searchWorkingScale": 5,
    "searchPointTrimFactor": 5,
    "searchSwapAxes": [0.0],
    "searchRotationCoarseDeg": 6.0,
    "searchRotationRangeDeg": 180.0,
    "searchScaleOctaves": 1.75,
    "searchScaleStepsCoarse": 5,
    "fineScaleSteps": 7,
    "fineScaleOctaves": 0.44,
    "fineRotationRangeDeg": 6.0,
    "fineRotationStepDeg": 2.0,
    "finePeaksPerEntry": 6,
    "fineMaxScaleAnchors": 6,
    "searchRefineRotDeg": 0.5,
    "searchRefineRotRangeDeg": 2.5,
    "searchRefineScaleSteps": 7,
    "searchScoreCapPx": 20.0,
    "searchPeakMinSeparationPx": 60.0,
    "seedCandidates": 3,
    "refineScales": [15, 5, 1],
    "refineRadiiPx": [[50.0, 30.0], [40.0, 25.0, 15.0], [60.0, 33.0, 18.0, 10.0, 6.0]],
    "refineMaxPoints": 4000,
    "refineOutlierMad": 3.0,
    "minKeypointsPerImage": 80,          # re-used as the min SEGMENT count floor
    "minMatchesForEstimate": 12,         # re-used as the min candidate segment floor
    "minInliersPerStill": 8,             # re-used as the min SUPPORT segment floor
    "minStills": 2,
    "supportTolerancePx": 14.0,
    "supportDirectionToleranceDeg": 25.0,
    "refinedDistinctPx": 30.0,
    "minSupportSpreadM": 3.0,
    "minPeakMargin": 0.25,
    "maxSupportRmsM": 0.35,
    "minSupportShare": 0.45,
    "uncertaintyModel": "vp-rectification-first-order-v1+plan-instrument-systematic",
    "confidenceModel": "support-margin-spread-heuristic/1",
    "crossValidation": ("NOT-IMPLEMENTED in anchor007-path-b/3 (declared limitation; the budget "
                        "carries no crossval term and the confidence does not claim redundancy "
                        "evidence)"),
    "versionHistory": ("v1: two strongest peaks blindly + no camera-side law + circular "
                       "translation unwrapped nowhere + similarity-only verification — the "
                       "drill runs measured each failure (0 support on a perfect input); "
                       "v2: Manhattan-frame pair selection, camera-side law, wraparound "
                       "unwrap, iterative nearest-ink homography refinement, full-resolution "
                       "verification gates; the /2 drills then measured the search UNABLE to "
                       "reach the truth's basin (false dense-ink placements outscored the "
                       "truth's translation at every grid scale — 1356 vs 1246 at the best "
                       "scale — and the 1.84x scale steps left the truth 13% from the nearest "
                       "grid point where its gated support collapsed to 118 vs the false "
                       "basin's 142; the /2 gates PASSED a 26.9-m FALSE anchor at confidence "
                       "0.89 — all recorded); v3: multi-peak candidates, the direction-gated "
                       "support as the seed/pair ranking (measured discriminating: 198 gated "
                       "for the truth vs 43-108 for every false peak within 2% scale), a "
                       "fine scale/rotation stage around the coarse pool (the truth recovered "
                       "at 0.28-m realized on the same drill), raw gated support for pair "
                       "ranking (the share-based rank measured preferring small "
                       "dimension-string clouds), and a declared minSupportShare gate"),
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
        "schemaVersion": WIRE_SCHEMA_VERSION, "portVersion": PORT_VERSION,
        "contractVersion": CONTRACT_VERSION, "executionId": execution_id,
        "status": "refused", "reasonCode": reason_code, "refusalDetail": detail,
        "provenance": _provenance(input_digest, config), "hypotheses": [],
        "executionTimeMs": 0.0,
        **({"stageTimingsMs": {k: round(v * 1000.0, 3) for k, v in stage_t.items()}} if stage_t else {}),
    }


def require(condition, reason, detail):
    if not condition:
        raise _Refusal(reason, detail)


# --------------------------------------------------------------------- ---
# Line extraction + direction families                                    |
# --------------------------------------------------------------------- ---

def extract_segments(img, cfg):
    lsd = cv2.createLineSegmentDetector()
    lines, _, _, _ = lsd.detect(img)
    if lines is None or len(lines) == 0:
        return np.empty((0, 4)), np.empty((0,))
    segs = lines.reshape(-1, 4).astype(np.float64)
    L = np.hypot(segs[:, 2] - segs[:, 0], segs[:, 3] - segs[:, 1])
    keep = L >= float(cfg["lsdMinSegmentPx"])
    return segs[keep], L[keep]


def direction_peaks(segs, L, cfg):
    """The vertical mask + the top-K non-vertical orientation peaks.

    Returns (vert_mask, peaks) with peaks = [(center_deg, strength), ...]
    sorted by strength (deterministic tie-break: lower bin index first)."""
    angs = np.degrees(np.arctan2(-(segs[:, 3] - segs[:, 1]), segs[:, 2] - segs[:, 0])) % 180.0
    vcenter = float(cfg["verticalClusterCenterDeg"])
    vtol = float(cfg["verticalClusterTolDeg"])
    d_to_v = np.minimum(np.abs(angs - vcenter), 180.0 - np.abs(angs - vcenter))
    vert = d_to_v <= vtol
    rest = ~vert
    if rest.sum() == 0:
        return vert, [], angs
    bins = int(cfg["directionHistBins"])
    hist, edges = np.histogram(angs[rest], bins=bins, range=(0, 180), weights=L[rest])
    # circular smoothing
    k = np.array([1, 2, 3, 2, 1], float)
    hist_s = np.convolve(np.concatenate([hist[-2:], hist, hist[:2]]), k / k.sum(), mode="same")[2:-2]
    want = int(cfg.get("familyCandidatePeaks", 4))
    tol = float(cfg["groundClusterTolDeg"])
    suppressed = hist_s.copy()
    peaks = []
    for _ in range(want):
        i = int(np.argmax(suppressed))
        if suppressed[i] <= 0:
            break
        peaks.append(((edges[i] + edges[i + 1]) / 2, float(hist_s[i])))
        for off in range(-int(tol * bins / 180) - 1, int(tol * bins / 180) + 2):
            suppressed[(i + off) % bins] = -1
    # the classic two-peak requirement lives at the caller (a pair is needed);
    # here we only report what the histogram carries
    return vert, peaks, angs


def family_vp(segs, L, angs, center_deg, cfg):
    """Robust VP of one direction family: median of pairwise intersections
    of well-supported pairs; near-parallel -> direction at infinity."""
    tol = float(cfg["groundClusterTolDeg"])
    d = np.minimum(np.abs(angs - center_deg), 180.0 - np.abs(angs - center_deg))
    m = d <= tol
    fam = segs[m]
    famL = L[m]
    if len(fam) < 2:
        return None, None
    # use the longest segments for intersections (deterministic order)
    order = np.argsort(-famL)
    fam = fam[order]
    maxd = float(cfg["vpMaxFiniteDistPx"])
    pts = []
    n = min(len(fam), 24)
    for i in range(n):
        for j in range(i + 1, n):
            x1, y1, x2, y2 = fam[i]
            x3, y3, x4, y4 = fam[j]
            d1, d2 = (x2 - x1, y2 - y1), (x4 - x3, y4 - y3)
            cross = d1[0] * d2[1] - d1[1] * d2[0]
            if abs(cross) < 1e-9:
                continue
            t = ((x3 - x1) * d2[1] - (y3 - y1) * d2[0]) / cross
            px, py = x1 + t * d1[0], y1 + t * d1[1]
            if abs(px) > maxd or abs(py) > maxd:
                continue  # effectively parallel -> infinity
            pts.append((px, py))
    if len(pts) < 3:
        # near-parallel family: VP at infinity along the family direction
        rad = np.radians(center_deg)
        direction = np.array([np.cos(rad), -np.sin(rad)])  # image coords, y down
        return None, direction
    P = np.array(pts)
    med = np.median(P, axis=0)
    dist = np.linalg.norm(P - med, axis=1)
    inliers = dist <= max(50.0, np.median(dist) * 4.0)
    if inliers.sum() >= 3:
        med = np.median(P[inliers], axis=0)
    return med, None


# --------------------------------------------------------------------- ---
# Rectification                                                            |
# --------------------------------------------------------------------- ---

def rectification_from_vps(vp1, dir1, vp2, dir2, vp_v, dir_v, w, h):
    """Build H_i2g: image -> unit-height ground frame (up to similarity).

    FOCAL SELF-CALIBRATION (`vp-orthogonality-self-calibration/1`): with
    the principal point DECLARED at the image center and square pixels,
    each orthogonal VP pair (u_i, u_j) satisfies
        u_i[0]*u_j[0] + u_i[1]*u_j[1] + f^2 * u_i[2]*u_j[2] = 0
    so f^2 is solvable per pair; the median over the valid pairs is the
    estimate.
    """
    cx, cy = w / 2.0, h / 2.0

    def centered(vp):
        if vp is None:
            return None
        return np.array([vp[0] - cx, vp[1] - cy, 1.0])

    u1, u2, u3 = centered(vp1), centered(vp2), centered(vp_v)
    f2_vals = []

    def f2_from(u, v):
        num = u[0] * v[0] + u[1] * v[1]
        den = u[2] * v[2]
        if abs(den) < 1e-12 or num == 0:
            return None
        val = -num / den
        return val if val > 0 else None

    for ua, ub in ((u1, u2), (u1, u3), (u2, u3)):
        if ua is None or ub is None:
            continue
        val = f2_from(ua, ub)
        if val is not None:
            f2_vals.append(val)
    if len(f2_vals) == 0:
        # fall back to the declared default (f = image width)
        f_est = float(w)
    else:
        f_est = float(np.sqrt(np.median(f2_vals)))
    if not (0.25 * w <= f_est <= 4.0 * w):
        return None, 1.0  # degenerate self-calibration

    K = np.array([[f_est, 0, cx], [0, f_est, cy], [0, 0, 1.0]])
    Kinv = np.linalg.inv(K)

    def to_dir(vp, direction):
        if vp is not None:
            v = np.array([vp[0], vp[1], 1.0])
            u = Kinv @ v
            return u / np.linalg.norm(u)
        u = Kinv @ np.array([direction[0], direction[1], 0.0])
        return u / np.linalg.norm(u)

    d1 = to_dir(vp1, dir1)
    d2 = to_dir(vp2, dir2)
    d3 = to_dir(vp_v, dir_v)
    # mutual consistency: near-orthogonal triple?
    def cosang(a, b):
        return abs(float(a @ b))
    c12, c13, c23 = cosang(d1, d2), cosang(d1, d3), cosang(d2, d3)
    if max(c12, c13, c23) > 0.35:
        return None, max(c12, c13, c23)
    # orthonormalize: r3 = vertical (up), r1/r2 = ground axes
    # THE CAMERA-SIDE LAW: the vanishing point of the vertical family is
    # sign-invariant (a direction and its negation project to the SAME
    # image point), so d3 is whichever of +/-world-up lies in the camera's
    # forward hemisphere — for a downward-tilted camera that is world-DOWN.
    # Photographs are taken from above the ground plane, held upright
    # (|roll| < 90 deg — a DECLARED approximation of this method): world-UP
    # is therefore the member of {+/-d3} with NEGATIVE camera-y (toward the
    # image's upper half). With the wrong sign the rectified ground frame
    # is a REFLECTION of the plan's (east, north) frame — unreachable by
    # the rotation-only similarity search, and every anchor silently fails
    # (the drill runs measured exactly this failure mode).
    r3 = d3 / np.linalg.norm(d3)
    if r3[1] > 0:
        r3 = -r3
    a1 = d1 - (d1 @ r3) * r3
    if np.linalg.norm(a1) < 1e-6:
        return None, 1.0
    r1 = a1 / np.linalg.norm(a1)
    # THE RASTER-HANDEDNESS LAW: the plan raster's (col, row) frame is
    # (east, SOUTH) — row 0 is maximum northing under the north-up law —
    # a LEFT-handed ground frame. The rectified ground parameters must
    # live in the SAME handedness or the photo->plan composition carries
    # a reflection no rotation-only similarity search can express (the
    # drill measured det=-1 at the truth: every anchor silently failed).
    # So the ground 2D frame is (r1, -cross(r3, r1)) — deliberately a
    # reflection matrix in 3x3, declared, matching the raster.
    r2 = -np.cross(r3, r1)
    R = np.stack([r1, r2, r3], axis=1)
    # camera one unit above the ground plane: t = -r3 (P = K[R | t]) — the
    # ground plane is then the plane one unit on the DOWN side of the camera
    # (a true camera height h differs only by the ground-frame similarity
    # diag(1/h, 1/h, 1), which the search absorbs)
    t = -r3.reshape(3, 1)
    H_g2i = K @ np.hstack([R[:, :2], t])          # ground(z=0, unit height) -> image
    H_i2g = np.linalg.inv(H_g2i)                   # image -> unit ground frame
    return H_i2g, max(c12, c13, c23)


# --------------------------------------------------------------------- ---
# The geometric search (coarse)                                            |
# --------------------------------------------------------------------- ---

def distance_field(plan_img, work_scale, cap_px):
    """The plan-side SCORING field: distance-to-INK-BOUNDARY, not to ink.

    HABS measured drawings carry SOLID ink regions (the black poché of
    walls, dimension-text glyphs). A distance-to-plain-ink field saturates
    inside them, and the drill measured a garbage transform dropping the
    whole cloud into one poché blob scoring 4x the truth (1227 vs 296) —
    recorded honestly. The boundary field (ink minus 1-px erosion at the
    field scale) keeps THIN lines whole (their erosion is empty) and
    reduces blobs to their rims, so placement deep inside solid ink scores
    ZERO and line structure is what scores; (iii) the HIGH-PASS LAW below
    kills uniformly dense patches (a compact cloud there scores ~0)."""
    ph, pw = plan_img.shape
    ink_full = (plan_img < 150).astype(np.uint8)
    # ANY-INK block reduction (INTER_AREA on 0/255 then > 0): a block
    # carrying any ink survives — a threshold on the block AVERAGE loses
    # thin lines at coarse scales and shrinks the ink bbox (the drill
    # measured the extent-initialized scale grid dropping to 0.35x the
    # truth, opening the door to compact-cloud false peaks; recorded)
    red = cv2.resize((ink_full * 255).astype(np.uint8),
                     (pw // work_scale, ph // work_scale),
                     interpolation=cv2.INTER_AREA)
    ink = (red > 0).astype(np.uint8)
    kernel = np.ones((3, 3), np.uint8)
    core = cv2.erode(ink, kernel, iterations=1)
    boundary = (ink & (1 - core)).astype(np.uint8)
    dt = cv2.distanceTransform((1 - boundary).astype(np.uint8), cv2.DIST_L2, 3)
    cap = cap_px
    score = np.clip(1.0 - dt / cap, 0.0, 1.0)
    return score, ink, dt


_FC_FFT_CACHE: dict = {}


def fft_correlate_padded(points, weights, field):
    """LINEAR (non-circular) translation score via a zero-padded canvas.

    Construction (no wraparound aliases by construction): the canvas is
    (span_y + FH + 1, span_x + FW + 1); the FIELD sits at the canvas
    origin; the CLOUD is scattered starting at the field's FAR corner
    (offset (FH, FW) from its own minimum). Every meaningful shift is then
    a non-negative canvas index, and a shifted cloud sampling outside the
    field reads ZEROS, never wrapped ink (the v1 circular correlation
    manufactured false peaks from wraparound — a garbage transform scored
    4x the truth on the drill; measured and recorded; the first padded
    draft under-sized the canvas to max(field, span) and the same false
    peaks survived — both recorded honestly).

    Returns (corr, (tx0, ty0)): the translation in FIELD px of the plan
    position map q = p - t at correlation peak (bx, by) is
    t = (bx + tx0, by + ty0)."""
    FH, FW = field.shape
    xs = points[:, 0]
    ys = points[:, 1]
    x0 = int(np.floor(xs.min()))
    y0 = int(np.floor(ys.min()))
    span_x = int(np.ceil(xs.max())) - x0
    span_y = int(np.ceil(ys.max())) - y0
    # quantize canvas sizes UP to 128-px multiples: the field-FFT cache
    # then holds a bounded handful of shapes (one ~20 MB complex plane per
    # shape at this plan's scale — an unquantized cache measured an OOM
    # SIGKILL under the supervised runner; recorded)
    Q = 128
    CW = ((span_x + FW + 1 + Q - 1) // Q) * Q
    CH = ((span_y + FH + 1 + Q - 1) // Q) * Q
    m = np.zeros((CH, CW), np.float64)
    pi_x = np.round(xs).astype(np.int64) - x0 + FW
    pi_y = np.round(ys).astype(np.int64) - y0 + FH
    np.add.at(m, (pi_y, pi_x), weights)
    fc = np.zeros((CH, CW), np.float64)
    fc[0:FH, 0:FW] = field
    # the field's FFT depends only on the canvas shape AND THE FIELD ITSELF:
    # the cache key carries a field fingerprint (shape + deterministic sum).
    # Keying by shape alone measured WRONG on the spot-checks — two fields of
    # the same shape (the working field and a filtered variant) silently
    # reused each other's cached FFT; recorded.
    key = (CH, CW, FH, FW, round(float(field.sum()), 6))
    Ffc = _FC_FFT_CACHE.get(key)
    if Ffc is None:
        if len(_FC_FFT_CACHE) >= 16:
            _FC_FFT_CACHE.clear()
        Ffc = np.conj(np.fft.rfft2(fc))
        _FC_FFT_CACHE[key] = Ffc
    corr = np.fft.irfft2(np.fft.rfft2(m) * Ffc, s=(CH, CW))
    return corr, (x0 - FW, y0 - FH)


def local_maxima(corr, min_sep, want=8):
    """Best value + best second-best local maximum at least min_sep apart.

    Deterministic iterative argmax + window suppression (ties break to the
    FIRST index in raster order, matching a stable descending sort of the
    flattened array); wraparound not treated — the grid pads."""
    sep = max(1, int(round(float(min_sep))))
    work = corr.copy()
    peaks = []
    for _ in range(want):
        idx = int(np.argmax(work))
        v = float(work.ravel()[idx])
        if v <= 0:
            break
        y, x = divmod(idx, work.shape[1])
        peaks.append((y, x, v))
        y0, y1 = max(0, y - sep), min(work.shape[0], y + sep + 1)
        x0, x1 = max(0, x - sep), min(work.shape[1], x + sep + 1)
        work[y0:y1, x0:x1] = -np.inf
    if not peaks:
        return None, None, None
    (by, bx, bv) = peaks[0]
    second = peaks[1][2] if len(peaks) > 1 else 0.0
    return (bx, by, bv), second, peaks


def _grid_eval(rect_pts, rect_w, field, swaps, rotations, scales, peak_sep, scale_div=1.0,
               peaks_per_entry=1):
    """Evaluate a (swap, rotation, scale) grid with FFT translation scoring
    (padded LINEAR correlation — no wraparound). `scales` are declared in
    the REFERENCE field's px per g-unit; `scale_div` converts them to THIS
    field's px (the reference is the working field; a half-resolution
    coarse field passes scale_div=2.0 — the unit bug between stages was
    measured on the drill as a systematic half-scale collapse into dense
    ink; recorded honestly). Returns the sorted result list (score desc,
    then swap/theta/scale/translation) with translations rescaled BACK to
    the reference field's px. `peaks_per_entry` > 1 keeps the top-M
    TRANSLATION peaks of each grid entry as separate candidates (the /3
    multi-peak discipline: the drill measured the truth's translation at
    correlation rank ~5-6 of its entry — a best-peak-only grid never
    carried it into the hypothesis set; recorded)."""
    results = []
    for swap in swaps:
        for th in rotations:
            c, s = np.cos(np.radians(swap + th)), np.sin(np.radians(swap + th))
            Rm = np.array([[c, -s], [s, c]])
            for sc in scales:
                pts = (rect_pts @ ((sc / scale_div) * Rm).T)
                corr, (ox, oy) = fft_correlate_padded(pts, rect_w, field)
                (pk, second, peaks) = local_maxima(corr, peak_sep,
                                                    want=max(1, int(peaks_per_entry)))
                if pk is None:
                    continue
                bx, by, bv = pk
                results.append((bv, swap, th, sc, (bx + ox) * scale_div,
                                (by + oy) * scale_div, second, c, s))
                if peaks:
                    for (py_, px_, pv_) in peaks[1:max(1, int(peaks_per_entry))]:
                        results.append((pv_, swap, th, sc, (px_ + ox) * scale_div,
                                        (py_ + oy) * scale_div, second, c, s))
    results.sort(key=lambda r: (-r[0], r[1], r[2], r[3], r[4], r[5]))
    return results


def _extent_init_scale(rect_pts, ink_mask):
    ys, xs = np.where(ink_mask > 0)
    plan_diag = float(np.hypot(xs.max() - xs.min(), ys.max() - ys.min())) if len(xs) else 1.0
    cloud_diag = float(np.hypot(rect_pts[:, 0].max() - rect_pts[:, 0].min(),
                                rect_pts[:, 1].max() - rect_pts[:, 1].min()))
    return plan_diag / max(cloud_diag, 1e-9)


def pair_candidates(rect_pts, rect_w, field_c, ink_c, cfg):
    """The /3 coarse candidate list (reduced grid, multi-peak) for one
    candidate direction pair's rectified cloud — the caller ranks pairs by
    the DIRECTION-GATED SUPPORT over these candidates (one metric
    everywhere; the /2 share-based rank measured preferring small
    dimension-string clouds — raw gated counts, recorded). The grid's
    scales are declared in working-field px per g-unit and evaluated on the
    coarse field with the unit conversion."""
    ratio = float(cfg.get("_pair_ratio", 2.0))
    s0 = _extent_init_scale(rect_pts, ink_c) * ratio
    octaves = float(cfg["searchScaleOctaves"])
    steps = int(cfg.get("pairSearchScaleSteps", 3))
    step_deg = float(cfg.get("pairSearchRotationStepDeg", 10.0))
    scales = [s0 * 2 ** (octaves * (2 * i / (steps - 1) - 0.75)) for i in range(steps)]
    if not any(abs(sc / s0 - 1.0) <= 1e-9 for sc in scales):
        scales.append(s0)
    rots = [(-180.0 + step_deg * i) for i in range(int(round(360.0 / step_deg)))]
    swaps = [float(s) for s in cfg["searchSwapAxes"]]
    res = _grid_eval(rect_pts, rect_w, field_c, swaps, rots, scales,
                     float(cfg["searchPeakMinSeparationPx"]), scale_div=ratio,
                     peaks_per_entry=int(cfg.get("pairSearchPeaksPerEntry", 4)))
    return res


def _cand_similarity(cand, B_up):
    """One grid candidate -> the g_norm-to-full-res-plan-px similarity."""
    (_sc, swap, th, sc, tx, ty, _2nd, c, s) = cand
    A_f = np.eye(3)
    A_f[:2, :2] = sc * np.array([[c, -s], [s, c]])
    A_f[0, 2] = -tx
    A_f[1, 2] = -ty
    return B_up @ A_f


def search_registration(rect_pts, rect_w, field_c, ink_c, cfg, rank=None):
    """The /3 two-stage search with the direction-gated ranking.

    Stage 1 (coarse): the extent-initialized (rotation, scale) grid on the
    half-resolution field, best peak per entry; EVERY entry is then scored
    with the fast direction-gated support. Stage 2 (fine): at EACH scale
    anchor, two rotation fans — around that scale's GATED-BEST theta and
    around its CORRELATION-BEST theta — over a fine scale ladder (+/-
    fineScaleOctaves in fineScaleSteps), MULTI-PEAK (finePeaksPerEntry
    translation peaks per entry). Every candidate — coarse and fine — is
    ranked by the direction-gated support (the final gates' own metric),
    and the top-K DISTINCT seeds are returned in gated-rank order, tuple
    shape (corrScore, swap, theta, scale, tx, ty, secondPeak, c, s) with
    translations in working-field px.

    The measured reasons (drill b1, all recorded):
      - the /2 correlation ranking put the truth's translation at rank ~5-6
        of its own entry with false dense-ink placements outscoring it at
        EVERY scale, and the 1.84x scale steps left the truth 13% from the
        nearest grid point where its gated support collapsed to 118 vs the
        false basin's 142 — unreachable, and a 26.9-m false anchor passed;
      - the first /3 draft anchored its fine fans on the correlation-best
        theta per scale — at the truth's scale that was the 90-deg TWIN
        branch (the plan's approximate 4-fold line symmetry gives the false
        basins twin rotations; the truth itself has none), so the truth's
        rotation was never fanned; the truth's theta is instead the
        GATED-BEST at its scale (its best peak sits ~63 px from the truth,
        inside the building, and gates 112 — the highest at that scale
        while the twin branch's peaks gate <= ~97);
      - the swap=90 axis parameter was a REDUNDANT rotation shift (fully
        covered by the rotation grid — the measured "identical twins"),
        halving pool diversity for nothing; it is removed."""
    rot_c = float(cfg["searchRotationCoarseDeg"])
    scale_steps = int(cfg["searchScaleStepsCoarse"])
    octaves = float(cfg["searchScaleOctaves"])
    ratio = float(cfg.get("_pair_ratio", 2.0))
    min_sep = float(cfg["searchPeakMinSeparationPx"])
    swap_list = [0.0]

    # the extent init runs on the coarse field; convert to WORKING-field
    # px per g-unit (the grid's declared unit) before building the grid
    s0w = _extent_init_scale(rect_pts, ink_c) * ratio

    scales_c = [s0w * 2 ** (octaves * (2 * i / (scale_steps - 1) - 0.75)) for i in range(scale_steps)]
    # THE EXTENT SCALE IS ALWAYS IN THE GRID: with steps=5/octaves=1.75 the
    # log-spaced grid lands at [0.40, 0.74, 1.35, 2.48, 4.55]x s0w — a
    # HOLE around the natural 1.0x — so the extent-scale anchor below
    # could never fire (measured: every drill seed sat at 0.40x s0w inside
    # the dense-ink pads; recorded honestly). The declared geometric prior
    # gets its own grid point.
    if not any(abs(sc / s0w - 1.0) <= 1e-9 for sc in scales_c):
        scales_c.append(s0w)
    rots_c = [(-180.0 + rot_c * i) for i in range(int(360 / rot_c))]
    coarse = _grid_eval(rect_pts, rect_w, field_c, swap_list, rots_c, scales_c,
                        min_sep, scale_div=ratio)
    if not coarse:
        return None

    # ---- gate every coarse entry; per scale take (gated-best, corr-best) -
    if rank is None:
        ordered = sorted(coarse, key=lambda r: (-r[0], r[2], r[3], r[4], r[5]))
        anchors_by_scale = {}
        for r in ordered:
            anchors_by_scale.setdefault(round(r[3], 6), []).append(r[2])
        fan_thetas = {}
        for sc_key, thetas in anchors_by_scale.items():
            fan_thetas[sc_key] = list(dict.fromkeys(round(t, 4) for t in thetas[:2]))
    else:
        gn_ends, gn_ok, dt_full, ink_dir_full, px_per_m, B_up = rank
        gated_of = {}
        corr_best = {}
        for r in coarse:
            sc_key = round(r[3], 6)
            g = gated_support_fast(_cand_similarity(r, B_up), gn_ends, gn_ok,
                                   dt_full, ink_dir_full, px_per_m, cfg)
            if sc_key not in gated_of or g["nSupport"] > gated_of[sc_key][0]:
                gated_of[sc_key] = (g["nSupport"], r[2])
            if sc_key not in corr_best:
                corr_best[sc_key] = r[2]
        fan_thetas = {}
        for sc_key in sorted(gated_of):
            th_list = [gated_of[sc_key][1]]
            if corr_best[sc_key] != gated_of[sc_key][1]:
                th_list.append(corr_best[sc_key])
            fan_thetas[sc_key] = th_list

    # ---- stage 2: the fine ladder at each scale anchor --------------------
    fine_oct = float(cfg.get("fineScaleOctaves", 0.44))
    fine_steps = int(cfg.get("fineScaleSteps", 7))
    fine_rot_rng = float(cfg.get("fineRotationRangeDeg", 6.0))
    fine_rot_step = float(cfg.get("fineRotationStepDeg", 2.0))
    fine_peaks = int(cfg.get("finePeaksPerEntry", 6))
    max_anchors = int(cfg.get("fineMaxScaleAnchors", 6))
    fine = []
    for sc_key, thetas in list(sorted(fan_thetas.items()))[:max_anchors]:
        sc_a = [r[3] for r in coarse if round(r[3], 6) == sc_key][0]
        scales_f = [sc_a * 2 ** (fine_oct * (2 * i / (fine_steps - 1) - 1.0))
                    for i in range(fine_steps)]
        for th_a in thetas:
            rots_f = [th_a + d for d in np.arange(-fine_rot_rng, fine_rot_rng + 1e-9,
                                                  fine_rot_step)]
            res_f = _grid_eval(rect_pts, rect_w, field_c, swap_list,
                               sorted(set(round(r, 4) for r in rots_f)),
                               sorted(set(round(s, 6) for s in scales_f)),
                               min_sep, scale_div=ratio, peaks_per_entry=fine_peaks)
            fine.extend(res_f)

    # ---- the gated ranking over coarse + fine ------------------------------
    candidates = coarse + fine
    if rank is not None:
        gn_ends, gn_ok, dt_full, ink_dir_full, px_per_m, B_up = rank
        ranked = []
        for r in candidates:
            g = gated_support_fast(_cand_similarity(r, B_up), gn_ends, gn_ok,
                                   dt_full, ink_dir_full, px_per_m, cfg)
            ranked.append((-g["nSupport"], g["supportRmsM"], r))
        ranked.sort(key=lambda t: (t[0], t[1], -t[2][0], t[2][1], t[2][2],
                                   t[2][3], t[2][4], t[2][5]))
        ordered = [t[2] for t in ranked]
    else:
        ordered = sorted(candidates, key=lambda r: (-r[0], r[2], r[3], r[4], r[5]))

    # ---- the top-K DISTINCT seeds (gated-rank order) -----------------------
    want = int(cfg.get("seedCandidates", 3))
    seeds = []
    for r in ordered:
        if not seeds:
            seeds.append(r)
            continue
        distinct = all(
            (abs(r[2] - s_[2]) > 0.1)
            or (abs(r[3] - s_[3]) / max(s_[3], 1e-9) > 0.01)
            or (np.hypot(r[4] - s_[4], r[5] - s_[5]) >= min_sep)
            for s_ in seeds
        )
        if distinct:
            seeds.append(r)
        if len(seeds) >= want:
            break
    # THE EXTENT SEED (always, when distinct): the declared geometric prior
    # keeps its place in the hypothesis set even when the gated rank
    # demotes it; the refinement still must earn the anchor through the
    # gated support ranking.
    ext_best = None
    for r in ordered:
        if abs(r[3] / max(s0w, 1e-9) - 1.0) <= 0.2:
            ext_best = r
            break
    if ext_best is not None:
        distinct = all(
            (abs(ext_best[2] - s_[2]) > 0.1)
            or (abs(ext_best[3] - s_[3]) / max(s_[3], 1e-9) > 0.01)
            or (np.hypot(ext_best[4] - s_[4], ext_best[5] - s_[5]) >= min_sep)
            for s_ in seeds
        )
        if distinct:
            seeds.append(ext_best)
    return seeds


# --------------------------------------------------------------------- ---
# The refinement (the /2 addition)                                         |
# --------------------------------------------------------------------- ---

def _offsets_within(radius):
    r = int(round(radius))
    offs = [(dx, dy) for dx in range(-r, r + 1) for dy in range(-r, r + 1)
            if dx * dx + dy * dy <= r * r]
    # deterministic scan order: by distance, then row-major
    offs.sort(key=lambda o: (o[0] * o[0] + o[1] * o[1], o[0], o[1]))
    return offs


def nearest_ink(px, py, ink, radius):
    """Nearest ink pixel within `radius` for each (px, py) full-res plan point.
    Returns (nx, ny, dist) with dist = +inf where no ink is within radius.
    Deterministic: offsets scanned in (distance, row-major) order, first
    strictly-closer offset wins (ties keep the earlier offset)."""
    N = len(px)
    X = np.round(px).astype(np.int64)
    Y = np.round(py).astype(np.int64)
    H, W = ink.shape
    best_d = np.full(N, np.inf)
    best_x = np.zeros(N, np.int64)
    best_y = np.zeros(N, np.int64)
    base_valid = (X >= 0) & (X < W) & (Y >= 0) & (Y < H)
    for (dx, dy) in _offsets_within(radius):
        xx = X + dx
        yy = Y + dy
        valid = base_valid & (xx >= 0) & (xx < W) & (yy >= 0) & (yy < H)
        if not valid.any():
            continue
        hit = np.zeros(N, bool)
        hit[valid] = ink[yy[valid], xx[valid]]
        if not hit.any():
            continue
        d = np.sqrt(dx * dx + dy * dy)
        upd = hit & (d < best_d)
        best_d[upd] = d
        best_x[upd] = xx[upd]
        best_y[upd] = yy[upd]
    return best_x, best_y, best_d


def apply_h23(H, pts):
    ph = np.hstack([pts, np.ones((len(pts), 1))])
    o = (H @ ph.T).T
    return o[:, :2] / o[:, 2:3]


def _hartley_normalization(pts):
    c = pts.mean(axis=0)
    d = np.linalg.norm(pts - c, axis=1)
    s = np.sqrt(2.0) / max(float(np.median(d)), 1e-9)
    T = np.array([[s, 0, -s * c[0]], [0, s, -s * c[1]], [0, 0, 1.0]])
    return T


def fit_homography_dlt(src, dst):
    """Least-squares homography src -> dst (Hartley-normalized DLT).
    Returns None when the system is degenerate."""
    if len(src) < 8:
        return None
    Ts = _hartley_normalization(src)
    Td = _hartley_normalization(dst)
    sn = apply_h23(Ts, src)
    dn = apply_h23(Td, dst)
    A = []
    for (x, y), (u, v) in zip(sn, dn):
        A.append([x, y, 1, 0, 0, 0, -u * x, -u * y, -u])
        A.append([0, 0, 0, x, y, 1, -v * x, -v * y, -v])
    A = np.array(A)
    try:
        _, _, Vt = np.linalg.svd(A)
    except np.linalg.LinAlgError:
        return None
    Hn = Vt[-1].reshape(3, 3)
    H = np.linalg.inv(Td) @ Hn @ Ts
    if abs(H[2, 2]) < 1e-12:
        return None
    return H / H[2, 2]


def refine_homography(gpts, weights, ink, ink_scale, seed_H, radii, cfg):
    """Iterative nearest-ink homography refinement (declared method).

    gpts: (N,2) normalized rectified ground samples; seed_H: 3x3
    g_norm -> FULL-RES plan px homography seed; ink: an ink mask at
    ink_scale (ink_scale = 1 -> full resolution; ink_scale = ws -> the
    search's working scale, mapping full px -> ink px by division).
    Iterates over the declared radii (in INK pixels): map samples, pair
    each with its nearest ink pixel, robustly refit the homography (DLT +
    MAD outlier rejection). Returns (H, stats) — H is the seed when the
    first iteration finds too few correspondences."""
    mad_k = float(cfg["refineOutlierMad"])
    max_pts = int(cfg["refineMaxPoints"])
    pts = gpts
    w = weights
    if len(pts) > max_pts:
        idx = np.linspace(0, len(pts) - 1, max_pts).astype(int)
        pts = pts[idx]
        w = w[idx]
    H = seed_H.copy()
    Hs, Ws = ink.shape
    stats = {"iterations": [], "pointsUsed": int(len(pts)), "inkScale": int(ink_scale)}
    for r in radii:
        P = apply_h23(H, pts)
        nx, ny, d = nearest_ink(P[:, 0] / ink_scale, P[:, 1] / ink_scale, ink, r)
        hit = np.isfinite(d)
        if int(hit.sum()) < 40:
            if not stats["iterations"]:
                stats["note"] = ("too few correspondences at the first radius — "
                                 "refinement kept the seed")
                return H, stats
            break
        src = pts[hit]
        dst = np.stack([nx[hit], ny[hit]], axis=1).astype(np.float64) * ink_scale
        Hf = fit_homography_dlt(src, dst)
        if Hf is None:
            break
        # robust rejection: residual of the DLT fit, drop > mad_k * MAD
        res = np.linalg.norm(apply_h23(Hf, src) - dst, axis=1)
        med = float(np.median(res))
        mad = float(np.median(np.abs(res - med)))
        keep = res <= med + mad_k * max(mad, 1e-6)
        if int(keep.sum()) >= 40:
            Hf2 = fit_homography_dlt(src[keep], dst[keep])
            if Hf2 is not None:
                Hf = Hf2
                res = res[keep]
        # sanity: the refined map must keep the working set in the raster
        P2 = apply_h23(Hf, pts)
        inb = ((P2[:, 0] >= 0) & (P2[:, 0] < Ws * ink_scale)
               & (P2[:, 1] >= 0) & (P2[:, 1] < Hs * ink_scale))
        if float(inb.mean()) < 0.5:
            break  # refinement diverged; keep the previous H
        H = Hf
        stats["iterations"].append({
            "radiusPx": round(float(r), 2),
            "correspondences": int(hit.sum()),
            "kept": int(keep.sum()),
            "residualRmsPx": round(float(np.sqrt((res ** 2).mean())), 3),
            "inBoundsFraction": round(float(inb.mean()), 4),
        })
    return H, stats


# --------------------------------------------------------------------- ---
# main                                                                     |
# --------------------------------------------------------------------- ---

def ground_bundle(segs, L, angs, c_i, c_j, tol, H_i2g, policy):
    """Rectify the chosen pair's ground-family segment samples into the
    normalized unit-ground frame. Returns (gpts, Wt, C) or None when the
    family support is too thin or the rectification degenerates."""
    d_i = np.minimum(np.abs(angs - c_i), 180.0 - np.abs(angs - c_i))
    d_j = np.minimum(np.abs(angs - c_j), 180.0 - np.abs(angs - c_j))
    ground_seg = (d_i <= tol) | (d_j <= tol)
    if int(ground_seg.sum()) < int(policy["minMatchesForEstimate"]):
        return None, None, None, None
    samples = []
    weights_l = []
    for k in np.where(ground_seg)[0]:
        s, l = segs[k], L[k]
        n = max(2, int(l // 24))
        ts = np.linspace(0, 1, n)
        pts = np.stack([s[0] + (s[2] - s[0]) * ts, s[1] + (s[3] - s[1]) * ts], axis=1)
        samples.append(pts)
        weights_l.append(np.full(n, min(l, 400.0) / 400.0))
    S = np.concatenate(samples)
    Wt = np.concatenate(weights_l)
    Sh = np.hstack([S, np.ones((len(S), 1))])
    G = (H_i2g @ Sh.T).T
    ok = np.abs(G[:, 2]) > 1e-9
    G, Wt = G[ok], Wt[ok]
    gpts = G[:, :2] / G[:, 2:3]
    cen = np.median(gpts, axis=0)
    rad = np.linalg.norm(gpts - cen, axis=1)
    robust = float(np.median(rad))
    if robust <= 1e-9:
        return None, None, None, None
    keep = rad <= float(int(policy.get("searchPointTrimFactor", 8))) * robust
    gpts, Wt = gpts[keep], Wt[keep]
    if len(gpts) < 20:
        return None, None, None, None
    gpts = (gpts - cen) / robust
    D = np.array([[1.0 / robust, 0, -cen[0] / robust],
                  [0, 1.0 / robust, -cen[1] / robust],
                  [0, 0, 1.0]])
    C = D @ H_i2g
    return gpts, Wt, C, ground_seg


def ink_direction_field(dt):
    """The local ink-line direction field: perpendicular to the distance
    transform's gradient. Flat regions (deep inside solid pads) have no
    defined direction (zero magnitude) — segments landing there cannot be
    direction-verified and do not count as support."""
    gy, gx = np.gradient(dt.astype(np.float32))
    mag = np.hypot(gx, gy)
    dirs = np.stack([-gy, gx], axis=-1)
    with np.errstate(invalid="ignore", divide="ignore"):
        dirs = dirs / np.maximum(mag, 1e-9)[..., None]
    return dirs, mag


def _ground_gn_ends(segs, ground_seg, C):
    """Precompute the ground-family segments' endpoints in g_norm (the C
    mapping is fixed per pair): (N, 2, 3) homogeneous, plus the per-segment
    validity mask (finite g_norm on both endpoints). The ranker and the
    final gates then agree on EXACTLY the same segment set."""
    ends_h = []
    for k in np.where(ground_seg)[0]:
        sgm = segs[k]
        ends_h.append((sgm[0], sgm[1], 1.0, sgm[2], sgm[3], 1.0))
    if not ends_h:
        return None, None
    E = np.array(ends_h)                       # (N, 6)
    Gn = (C @ np.array(E[:, 0:3]).T).T         # (N, 3)
    Gm = (C @ np.array(E[:, 3:6]).T).T         # (N, 3)
    ok = (np.abs(Gn[:, 2]) > 1e-9) & (np.abs(Gm[:, 2]) > 1e-9)
    gn_ends = np.stack([Gn, Gm], axis=1)       # (N, 2, 3)
    return gn_ends, ok


def gated_support_fast(A, gn_ends, gn_ok, dt_full, ink_dir_full, px_per_m, policy):
    """The /3 VECTORIZED direction-gated support — the same measurement as
    support_metrics (midpoints within supportTolerancePx of full-resolution
    ink AND running along it), evaluated on precomputed g_norm endpoints so
    the search can rank hundreds of candidates with it. The /2 seed ranking
    by raw correlation measured preferring false dense-ink placements at
    EVERY grid scale (1356 false vs 1246 truth at the truth's own scale);
    the gated support measured 198 for the truth vs 43-108 for every false
    peak within 2% scale — it is the ranking discriminator, recorded."""
    ph_full, pw_full = dt_full.shape
    tol_px = float(policy["supportTolerancePx"])
    dir_sin = float(np.sin(np.radians(float(policy.get("supportDirectionToleranceDeg", 25.0)))))
    if gn_ends is None or not gn_ok.any():
        return {"nSupport": 0, "supportRmsM": 99.999999, "spreadM": [0.0, 0.0],
                "nMidpoints": 0}
    P = gn_ends[gn_ok] @ A.T                   # (N, 2, 3)
    ok = np.abs(P[:, :, 2]).min(axis=1) > 1e-9
    P = P[ok]
    if len(P) == 0:
        return {"nSupport": 0, "supportRmsM": 99.999999, "spreadM": [0.0, 0.0],
                "nMidpoints": int(gn_ok.sum())}
    pl = P[:, :, :2] / P[:, :, 2:3]            # (N, 2, 2) plan px
    d = pl[:, 1] - pl[:, 0]
    n = np.hypot(d[:, 0], d[:, 1])
    good = n > 1e-9
    pl, d = pl[good], d[good]
    if len(pl) == 0:
        return {"nSupport": 0, "supportRmsM": 99.999999, "spreadM": [0.0, 0.0],
                "nMidpoints": int(gn_ok.sum())}
    dirs = d / n[:, None]
    mids = (pl[:, 0] + pl[:, 1]) / 2.0
    xi = np.clip(np.round(mids[:, 0]).astype(int), 0, pw_full - 1)
    yi = np.clip(np.round(mids[:, 1]).astype(int), 0, ph_full - 1)
    dist_px = dt_full[yi, xi].astype(np.float64)
    idir = ink_dir_full[yi, xi]
    cross = np.abs(dirs[:, 0] * idir[:, 1] - dirs[:, 1] * idir[:, 0])
    supported = (dist_px <= tol_px) & (cross <= dir_sin)
    n_support = int(supported.sum())
    n_mid = int(gn_ok.sum())
    if n_support == 0:
        return {"nSupport": 0, "supportRmsM": 99.999999, "spreadM": [0.0, 0.0],
                "nMidpoints": n_mid}
    sup = mids[supported]
    ext_x = float(sup[:, 0].max() - sup[:, 0].min()) / px_per_m
    ext_y = float(sup[:, 1].max() - sup[:, 1].min()) / px_per_m
    sup_d = dist_px[supported] / px_per_m
    rms = min(float(np.sqrt((sup_d ** 2).mean())), 99.999999)
    return {"nSupport": n_support, "supportRmsM": rms, "spreadM": [ext_x, ext_y],
            "nMidpoints": n_mid}


def support_metrics(A_ref, C, segs, ground_seg, dt_full, ink_dir_full, px_per_m, policy):
    """The REFINED-support metrics of one hypothesis: map every ground-family
    segment's midpoint image -> g_norm (C) -> full-res plan px (A_ref), then
    measure against the full-resolution ink distance transform. Returns the
    support count (midpoints within supportTolerancePx of ink), the support
    RMS in meters, the support spread in meters (both axes), and the
    midpoint count. The RMS is capped at 99.999999 m for strict-JSON
    safety when nothing is supported."""
    ph_full, pw_full = dt_full.shape
    tol_px = float(policy["supportTolerancePx"])
    dir_sin = float(np.sin(np.radians(float(policy.get("supportDirectionToleranceDeg", 25.0)))))
    mids = []
    seg_dirs = []
    dists = []
    aligned = []
    for k in np.where(ground_seg)[0]:
        sgm = segs[k]
        ends = np.array([[sgm[0], sgm[1], 1.0], [sgm[2], sgm[3], 1.0]])
        G = C @ ends.T
        if np.abs(G[2]).min() < 1e-9:
            continue
        gn = (G[:2] / G[2:3]).T                      # image -> g_norm endpoints
        pl = apply_h23(A_ref, gn)                    # full-res plan px endpoints
        d = pl[1] - pl[0]
        n = np.hypot(d[0], d[1])
        if n < 1e-9:
            continue
        seg_dirs.append(d / n)
        mids.append((pl[0] + pl[1]) / 2.0)
    if not mids:
        return {"nSupport": 0, "supportRmsM": 99.999999, "spreadM": [0.0, 0.0],
                "nMidpoints": 0}
    mids = np.array(mids)
    seg_dirs = np.array(seg_dirs)
    xi = np.clip(np.round(mids[:, 0]).astype(int), 0, pw_full - 1)
    yi = np.clip(np.round(mids[:, 1]).astype(int), 0, ph_full - 1)
    dist_px = dt_full[yi, xi].astype(np.float64)
    idir = ink_dir_full[yi, xi]                      # (N, 2) unit ink dirs
    # DIRECTION GATING: the segment must land on ink AND run along it
    # (|sin of the angle| within tolerance). Proximity-only support was
    # measured blind: a random placement inside the plan's dense
    # house-plan pad already yielded ~57% of segments within tolerance —
    # the pads admitted coherent false minima; recorded honestly.
    cross = np.abs(seg_dirs[:, 0] * idir[:, 1] - seg_dirs[:, 1] * idir[:, 0])
    supported = (dist_px <= tol_px) & (cross <= dir_sin)
    n_support = int(supported.sum())
    if n_support == 0:
        return {"nSupport": 0, "supportRmsM": 99.999999, "spreadM": [0.0, 0.0],
                "nMidpoints": len(mids)}
    sup = mids[supported]
    ext_x = float(sup[:, 0].max() - sup[:, 0].min()) / px_per_m
    ext_y = float(sup[:, 1].max() - sup[:, 1].min()) / px_per_m
    sup_d = dist_px[supported] / px_per_m
    rms = min(float(np.sqrt((sup_d ** 2).mean())), 99.999999)
    return {"nSupport": n_support, "supportRmsM": rms, "spreadM": [ext_x, ext_y],
            "nMidpoints": len(mids)}


def main() -> int:
    t_start = time.perf_counter()

    raw = sys.stdin.buffer.read()
    try:
        req = json.loads(raw)
    except json.JSONDecodeError as exc:
        print(json.dumps(refuse("unknown", "input-contract-violation",
                                f"request is not valid JSON: {exc}", None, DEFAULT_CONFIG)))
        return 0

    execution_id = req.get("executionId", "unknown")
    input_digest = "sha256:" + sha256_hex(raw)
    stage_t = {"segments": 0.0, "rectify": 0.0, "search": 0.0, "refine": 0.0, "verify": 0.0}

    try:
        # ---- Gate 1: structural sanity ----------------------------------
        require(req.get("portVersion") == PORT_VERSION, "input-contract-violation",
                f"portVersion must be '{PORT_VERSION}' (got {req.get('portVersion')!r})")
        require(req.get("schemaVersion") == WIRE_SCHEMA_VERSION, "input-contract-violation",
                f"schemaVersion must be {WIRE_SCHEMA_VERSION}")
        require(req.get("contractVersion") == CONTRACT_VERSION, "input-contract-violation",
                f"contractVersion must be '{CONTRACT_VERSION}' (got {req.get('contractVersion')!r})")
        require(req.get("authority") == "AISE", "input-contract-violation",
                "authority must be 'AISE'")
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
        policy["_pair_ratio"] = 2.0  # the pair grid's coarse-field factor (internal plumbing)

        # ---- Gate 2: plan context + HANDEDNESS ---------------------------
        plan_ctx = req.get("planContext")
        require(plan_ctx is not None, "plan-context-missing",
                "no plan/floor context was supplied; anchoring requires one — refusing rather than fabricating")
        require(isinstance(plan_ctx, dict), "input-contract-violation", "planContext must be an object")
        require(plan_ctx.get("kind") in SUPPORTED_PLAN_KINDS, "plan-context-unsupported",
                f"planContext.kind {plan_ctx.get('kind')!r} is not in {sorted(SUPPORTED_PLAN_KINDS)} "
                "(the production kind vocabulary stays closed; the line-art method is this adapter's "
                "declared method, never a vocabulary value)")
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
                "yDirection 'north-up', worldOriginPx [x,y] (THE HANDEDNESS LAW)")
        px_per_m = float(raster["pixelsPerMeter"])

        requested = (req.get("requestedAnchoring") or {}).get("representation")
        require(requested in SUPPORTED_REPRESENTATIONS, "representation-unsupported",
                f"requestedAnchoring.representation {requested!r} is not in {sorted(SUPPORTED_REPRESENTATIONS)}")

        # ---- Gate 3: evidence methods (BEFORE bytes) ----------------------
        for ev in evidence:
            require(ev["acquisitionMethod"] in SUPPORTED_METHODS, "evidence-method-unsupported",
                    f"evidence {ev['contentId']} has acquisitionMethod {ev['acquisitionMethod']!r}; "
                    f"this method supports {sorted(SUPPORTED_METHODS)} only")
            require(ev["mediaType"].startswith(SUPPORTED_MEDIA_PREFIX), "evidence-method-unsupported",
                    f"evidence {ev['contentId']} has mediaType {ev['mediaType']!r}; still-image bytes required")
        require(plan_ctx.get("imageMediaType", "").startswith(SUPPORTED_MEDIA_PREFIX), "evidence-method-unsupported",
                f"plan image mediaType {plan_ctx.get('imageMediaType')!r}; a plan RASTER image is required")

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
                "(the port's redundancy law — geometric registration of a single still has no "
                "discriminative redundancy)")

        # ---- the plan-side instruments (fixed for the whole request) ------
        ws = int(policy["searchWorkingScale"])
        field, ink_small, _dt_work = distance_field(plan_img, ws, float(policy["searchScoreCapPx"]))
        field_c, ink_coarse, _dt_coarse = distance_field(plan_img, ws * 2,
                                                         float(policy["searchScoreCapPx"]) * 2.0)
        ink_full = (plan_img < 150).astype(np.uint8)
        dt_full = cv2.distanceTransform((1 - ink_full).astype(np.uint8), cv2.DIST_L2, 3)
        ink_dir_full, ink_mag_full = ink_direction_field(dt_full)
        FH, FW = field.shape
        ph_full, pw_full = plan_img.shape
        # the refinement's coarse ink masks (any-ink block reduction; the
        # declared 3-phase refinement scales with their radii)
        refine_inks = []
        for sc_i in policy["refineScales"]:
            sc_i = int(sc_i)
            if sc_i == 1:
                refine_inks.append((ink_full, 1))
            else:
                red = cv2.resize((ink_full * 255).astype(np.uint8),
                                 (pw_full // sc_i, ph_full // sc_i),
                                 interpolation=cv2.INTER_AREA)
                refine_inks.append(((red > 0).astype(np.uint8), sc_i))

        # ---- per-still geometric registration ------------------------------
        refused_stills = []
        hypotheses = []
        est = {}
        notes = {}

        for ev in evidence:
            cid = ev["contentId"]
            img = images[cid]
            h, w = img.shape

            t0 = time.perf_counter()
            segs, L = extract_segments(img, policy)
            if len(segs) < int(policy["minKeypointsPerImage"]):
                stage_t["segments"] += time.perf_counter() - t0
                refused_stills.append({"contentId": cid, "reasonCode": "insufficient-features",
                                       "detail": f"{cid}: only {len(segs)} line segments "
                                                 f"(< {int(policy['minKeypointsPerImage'])} floor) — "
                                                 "no geometric line structure to register"})
                continue
            vert, peaks, angs = direction_peaks(segs, L, policy)
            if len(peaks) < 2:
                stage_t["segments"] += time.perf_counter() - t0
                refused_stills.append({"contentId": cid, "reasonCode": "registration-unreliable",
                                       "detail": f"{cid}: fewer than two non-vertical line directions "
                                                 f"found ({len(peaks)} peak(s); vertical family "
                                                 f"{'present' if vert.any() else 'absent'}) — metric "
                                                 "rectification needs two orthogonal ground directions"})
                continue
            vpv, dirv = family_vp(segs[vert], L[vert],
                                  np.full(vert.sum(), float(policy["verticalClusterCenterDeg"])),
                                  float(policy["verticalClusterCenterDeg"]), policy) if vert.any() \
                else (None, np.array([0.0, -1.0]))
            stage_t["segments"] += time.perf_counter() - t0

            t0 = time.perf_counter()
            # ---- MANHATTAN-FRAME SELECTION: score-measured, not guessed -----
            tol = float(policy["groundClusterTolDeg"])
            B_up0 = np.eye(3)
            B_up0[0, 0] = B_up0[1, 1] = float(ws)
            candidates = []
            rect_log = []
            for i in range(len(peaks)):
                for j in range(i + 1, len(peaks)):
                    vp_i, dir_i = family_vp(segs, L, angs, peaks[i][0], policy)
                    vp_j, dir_j = family_vp(segs, L, angs, peaks[j][0], policy)
                    if (vp_i is None and dir_i is None) or (vp_j is None and dir_j is None):
                        continue
                    H_i2g, incons = rectification_from_vps(vp_i, dir_i, vp_j, dir_j,
                                                           vpv, dirv, w, h)
                    entry = {"pair": [i, j],
                             "centersDeg": [round(peaks[i][0], 2), round(peaks[j][0], 2)],
                             "inconsistency": None if H_i2g is None else round(float(incons), 4),
                             "pairScore": None}
                    if H_i2g is not None and incons <= 0.35:
                        gpts_c, Wt_c, C_c, gmask_c = ground_bundle(segs, L, angs,
                                                                   peaks[i][0], peaks[j][0],
                                                                   tol, H_i2g, policy)
                        if gpts_c is not None:
                            # THE /3 PAIR RANK IS THE RAW DIRECTION-GATED
                            # SUPPORT over the pair's coarse multi-peak
                            # candidates — the same metric the gates use.
                            # (The /2 raw-correlation rank measured preferring
                            # phantom frames whose small clouds compact onto
                            # dense pads; the /2 share-based rank measured
                            # preferring small dimension-string clouds — the
                            # drill's winning pair was the WORST one, 26.9-m
                            # realized; both recorded. Raw gated counts over
                            # multi-peak candidates, no refinement at this
                            # stage — the /2 refine-before-rank measured
                            # every pair collapsing into false minima from
                            # coarse starts, carrying no signal.)
                            gn_ends_c, gn_ok_c = _ground_gn_ends(segs, gmask_c, C_c)
                            pcands = pair_candidates(gpts_c, Wt_c, field_c, ink_coarse, policy)
                            pscore = 0.0
                            for r_c in pcands[:64]:
                                A_p = _cand_similarity(r_c, B_up0)
                                g_s = gated_support_fast(A_p, gn_ends_c, gn_ok_c,
                                                         dt_full, ink_dir_full,
                                                         px_per_m, policy)
                                if g_s["nSupport"] > pscore:
                                    pscore = float(g_s["nSupport"])
                            entry["pairScore"] = round(pscore, 6)
                            candidates.append({
                                "score": pscore,
                                "strength": peaks[i][1] * peaks[j][1],
                                "i": i, "j": j,
                                "inconsistency": float(incons),
                                "H_i2g": H_i2g,
                                "gpts": gpts_c, "Wt": Wt_c, "C": C_c,
                                "groundSeg": gmask_c,
                                "centers": (peaks[i][0], peaks[j][0]),
                            })
                    rect_log.append(entry)
            if not candidates:
                stage_t["rectify"] += time.perf_counter() - t0
                refused_stills.append({"contentId": cid, "reasonCode": "registration-unreliable",
                                       "detail": f"{cid}: no Manhattan frame among the direction peaks "
                                                 f"(candidates: {json.dumps(rect_log)[:200]}) — the "
                                                 "vanishing-point rectification is inconsistent; "
                                                 "refusing rather than fitting an arbitrary affinity"})
                continue
            candidates.sort(key=lambda cnd: (-cnd["score"], -cnd["strength"], cnd["i"], cnd["j"]))
            chosen = candidates[0]
            inconsistency = chosen["inconsistency"]
            H_i2g = chosen["H_i2g"]
            gpts, Wt, C = chosen["gpts"], chosen["Wt"], chosen["C"]
            ground_seg = chosen["groundSeg"]

            t0 = time.perf_counter()
            gn_ends, gn_ok = _ground_gn_ends(segs, ground_seg, C)
            B_up = np.eye(3)
            B_up[0, 0] = B_up[1, 1] = float(ws)
            rank_ctx = (gn_ends, gn_ok, dt_full, ink_dir_full, px_per_m, B_up)
            seeds = search_registration(gpts, Wt, field_c, ink_coarse, policy, rank=rank_ctx)
            stage_t["search"] += time.perf_counter() - t0
            if not seeds:
                refused_stills.append({"contentId": cid, "reasonCode": "registration-unreliable",
                                       "detail": f"{cid}: the geometric search found no correlation peak"})
                continue

            # ---- multi-hypothesis refinement + REFINED-support ranking ----
            # every distinct seed is refined and scored; the winner is the
            # REFINED support, not the coarse correlation (the drill measured
            # the coarse winner refining into a coherent false minimum)
            t0 = time.perf_counter()
            hypotheses_c = []
            for si, sd in enumerate(seeds):
                sc_sd, swap_sd, theta_sd, scale_sd, tx_sd, ty_sd = sd[0], sd[1], sd[2], sd[3], sd[4], sd[5]
                c_sd, s_sd = sd[7], sd[8]
                A_field = np.eye(3)
                A_field[:2, :2] = scale_sd * np.array([[c_sd, -s_sd], [s_sd, c_sd]])
                A_field[0, 2] = -tx_sd
                A_field[1, 2] = -ty_sd
                A_seed = B_up @ A_field     # g_norm -> full-res plan px (similarity)
                A_cur = A_seed
                phase_stats = []
                for (ink_i, sc_i), radii_i in zip(refine_inks, policy["refineRadiiPx"]):
                    A_cur, st_i = refine_homography(gpts, Wt, ink_i, sc_i, A_cur,
                                                    [float(r) for r in radii_i], policy)
                    phase_stats.append(st_i)
                sup = support_metrics(A_cur, C, segs, ground_seg, dt_full, ink_dir_full,
                                      px_per_m, policy)
                hypotheses_c.append({
                    "seedIndex": si, "seedScore": round(float(sc_sd), 3),
                    "seedTheta": round(float(theta_sd), 3), "seedScale": round(float(scale_sd), 4),
                    "A": A_cur, "phases": phase_stats, "support": sup,
                })
            # rank by REFINED support count, then lower RMS, then seed order
            hypotheses_c.sort(key=lambda hc: (-hc["support"]["nSupport"],
                                              hc["support"]["supportRmsM"], hc["seedIndex"]))
            winner = hypotheses_c[0]
            A_ref = winner["A"]
            sup = winner["support"]
            n_support = sup["nSupport"]
            support_rms_m = sup["supportRmsM"]
            ext_x, ext_y = sup["spreadM"]
            # THE RUNNER-UP MUST BE A DISTINCT REFINED REGISTRATION: seeds
            # converge to the same minimum routinely (the drill measured
            # identical twins at margin 0 — not ambiguity, identity). A
            # runner-up counts only when its refined mapping disagrees with
            # the winner's by >= refinedDistinctPx on the cloud's points.
            ref_pts_w = apply_h23(A_ref, gpts)
            distinct_px = float(policy.get("refinedDistinctPx", 30.0))
            runner = None
            for hc in hypotheses_c[1:]:
                d = float(np.linalg.norm(apply_h23(hc["A"], gpts) - ref_pts_w, axis=1).mean())
                hc["refinedDisagreementPx"] = round(d, 2)
                if d >= distinct_px:
                    runner = hc
                    break
            stage_t["refine"] += time.perf_counter() - t0

            # ---- the DECLARED geometric verification gates -----------------
            t0 = time.perf_counter()
            if n_support < int(policy["minInliersPerStill"]):
                stage_t["verify"] += time.perf_counter() - t0
                refused_stills.append({"contentId": cid, "reasonCode": "registration-unreliable",
                                       "detail": f"{cid}: geometric verification failed — {n_support} "
                                                 f"supporting ground segments (< {int(policy['minInliersPerStill'])} "
                                                 "floor); the rectified photograph's line structure does not "
                                                 "land on the plan's line-work under any searched transform"})
                notes[cid] = {"segments": int(len(segs)), "groundSegments": int(ground_seg.sum()),
                              "support": n_support, "bestSeedScore": round(float(seeds[0][0]), 3),
                              "refineIterations": sum(len(p.get("iterations", [])) for p in winner["phases"])}
                continue
            if min(ext_x, ext_y) < float(policy["minSupportSpreadM"]):
                stage_t["verify"] += time.perf_counter() - t0
                refused_stills.append({"contentId": cid, "reasonCode": "registration-unreliable",
                                       "detail": f"{cid}: support spread degenerate "
                                                 f"({ext_x:.1f} x {ext_y:.1f} m < "
                                                 f"{float(policy['minSupportSpreadM'])} m floor on the "
                                                 "shorter axis) — the registration locked onto a single "
                                                 "structure, not the plan"})
                notes[cid] = {"segments": int(len(segs)), "groundSegments": int(ground_seg.sum()),
                              "support": n_support, "spreadM": [round(ext_x, 2), round(ext_y, 2)]}
                continue
            # THE REFINED AMBIGUITY GATE (the 003b finding-#2 law): if a
            # DISTINCT refined hypothesis also passes every gate and its
            # support is within minPeakMargin of the winner's, the
            # registration is ambiguous — refusing rather than choosing
            # arbitrarily (the coarse correlation cannot discriminate on
            # this plan style; measured on the drill)
            margin = 1.0
            if runner is not None:
                rs = runner["support"]
                # the runner must pass the non-share gates (support floor,
                # spread, rms) to count as a competing explanation. The
                # share floor is deliberately NOT applied to the runner:
                # an early draft added it and the drills measured a
                # knife-edge (the b3 FALSE winner anchored at margin 0.197
                # because its 44.3%-share runner was excluded, while the
                # b1 TRUTH was refused against a 45.4%-share runner) —
                # with the plain runner_passes the ambiguity gate refuses
                # BOTH (margins 0.087 and 0.197, both < 0.25); recorded.
                runner_passes = (rs["nSupport"] >= int(policy["minInliersPerStill"])
                                 and min(rs["spreadM"][0], rs["spreadM"][1]) >= float(policy["minSupportSpreadM"])
                                 and rs["supportRmsM"] <= float(policy["maxSupportRmsM"]))
                if runner_passes:
                    margin = (n_support - rs["nSupport"]) / max(n_support, 1)
            if margin < float(policy["minPeakMargin"]):
                stage_t["verify"] += time.perf_counter() - t0
                refused_stills.append({"contentId": cid, "reasonCode": "registration-unreliable",
                                       "detail": f"{cid}: registration ambiguous — two distinct refined "
                                                 f"hypotheses support {n_support} and "
                                                 f"{runner['support']['nSupport']} segments (margin "
                                                 f"{margin:.3f} < {float(policy['minPeakMargin'])}); "
                                                 f"hypotheses {json.dumps([(h['seedIndex'], h['support']['nSupport'], round(h['support']['supportRmsM'], 4)) for h in hypotheses_c])}; "
                                                 f"manhattan frame pair {chosen['i']},{chosen['j']} centers {json.dumps([round(chosen['centers'][0], 2), round(chosen['centers'][1], 2)])} score {round(chosen['score'], 4)}; "
                                                 "refusing rather than choosing arbitrarily"})
                notes[cid] = {"segments": int(len(segs)), "groundSegments": int(ground_seg.sum()),
                              "support": n_support,
                              "runnerSupport": runner["support"]["nSupport"],
                              "refinedMargin": round(margin, 4)}
                continue
            if support_rms_m > float(policy["maxSupportRmsM"]):
                stage_t["verify"] += time.perf_counter() - t0
                refused_stills.append({"contentId": cid, "reasonCode": "registration-unreliable",
                                       "detail": f"{cid}: support residuals too large (RMS {support_rms_m:.3f} m "
                                                 f"> {float(policy['maxSupportRmsM'])} m) — the best "
                                                 "transform does not actually align the line structures"})
                notes[cid] = {"segments": int(len(segs)), "groundSegments": int(ground_seg.sum()),
                              "support": n_support, "supportRmsM": round(support_rms_m, 4)}
                continue
            # THE /3 SUPPORT-SHARE GATE: the supported fraction of the ground
            # bundle must clear minSupportShare. The /2 drills measured FALSE
            # anchors passing every other gate at 26-41% share while the
            # truth measured 56-65% — a false anchor emits a fabricated
            # sub-meter budget on a tens-of-meters-wrong mapping; the share
            # floor refuses that class (measured justification; declared).
            share = n_support / max(1, int(sup["nMidpoints"]))
            if share < float(policy.get("minSupportShare", 0.45)):
                stage_t["verify"] += time.perf_counter() - t0
                refused_stills.append({"contentId": cid, "reasonCode": "registration-unreliable",
                                       "detail": f"{cid}: support share too low ({n_support}/"
                                                 f"{sup['nMidpoints']} = {share:.2f} < "
                                                 f"{float(policy.get('minSupportShare', 0.45))}) — "
                                                 "less than half the rectified ground-line structure "
                                                 "is explained by the plan's ink; the drills measured "
                                                 "exactly this signature on false dense-ink anchors "
                                                 "(26-41% vs the truth's 56-65%); refusing"})
                notes[cid] = {"segments": int(len(segs)), "groundSegments": int(ground_seg.sum()),
                              "support": n_support, "nMidpoints": int(sup["nMidpoints"]),
                              "supportShare": round(share, 4)}
                continue

            # ---- compose the full homography: plan-raster-px -> still-px ---
            # A_ref: g_norm -> full-res plan px; C: still-px -> g_norm
            H_plan_to_still = np.linalg.inv(A_ref @ C)
            Hn = H_plan_to_still / H_plan_to_still[2, 2]

            ref_stats = {"hypotheses": [
                {"seedIndex": hc["seedIndex"], "seedScore": hc["seedScore"],
                 "seedTheta": hc["seedTheta"], "seedScale": hc["seedScale"],
                 "nSupport": hc["support"]["nSupport"],
                 "supportRmsM": round(hc["support"]["supportRmsM"], 6),
                 "spreadM": [round(hc["support"]["spreadM"][0], 2),
                             round(hc["support"]["spreadM"][1], 2)],
                 "refinedDisagreementPx": hc.get("refinedDisagreementPx"),
                 "phases": hc["phases"]}
                for hc in hypotheses_c],
                "refinedMargin": round(margin, 4),
                "manhattanFrame": {"chosenPair": [chosen["i"], chosen["j"]],
                                   "centersDeg": [round(chosen["centers"][0], 2),
                                                  round(chosen["centers"][1], 2)],
                                   "pairScore": round(chosen["score"], 6),
                                   "inconsistency": round(chosen["inconsistency"], 4)},
                "candidates": rect_log}
            score = seeds[0][0]
            inconsistency = float(chosen["inconsistency"])

            est[cid] = {
                "h": Hn, "support": n_support, "segments": int(len(segs)),
                "groundSegments": int(ground_seg.sum()),
                "supportRmsM": support_rms_m, "peakMargin": margin, "score": float(score),
                "spreadM": [ext_x, ext_y], "rectInconsistency": float(inconsistency),
                "refineStats": ref_stats, "groundBundlePts": int(len(gpts)),
            }
            stage_t["verify"] += time.perf_counter() - t0

        if not est:
            lines = []
            for r in refused_stills:
                d = r["detail"]
                # the per-still evidence must survive the whole-request
                # refusal (zero-hypotheses law carries no refusedStills
                # satellite) — bounded at 400 chars per still
                key = d.split(": ", 1)[-1][:400]
                lines.append(f"{r['contentId'][:16]}…: {key}")
            raise _Refusal("registration-unreliable",
                           f"no still could be geometrically registered to this plan (0/{len(evidence)} "
                           "anchored; method vp-rectified-line-search/3). Per-still refusals: "
                           + "; ".join(lines) + ". Zero fabricated anchors.")

        # ---- assemble hypotheses ------------------------------------------
        for cid, e in est.items():
            # first-order budget: rectification quality + support residual +
            # plan-instrument systematic (1.5% of the support spread)
            term_rect = 0.02 * max(e["spreadM"])  # 2% of spread for the VP/K approximation
            term_supp = 2.0 * e["supportRmsM"]
            term_sys = 0.015 * max(e["spreadM"])
            floor_rms_m = max(term_rect, term_supp, term_sys)
            conf = 0.5 + 0.3 * min(1.0, e["support"] / 25.0) \
                + 0.2 * min(1.0, e["peakMargin"] / 0.6)
            conf = float(max(0.0, min(0.98, conf)))
            hypotheses.append({
                "evidenceContentId": cid,
                "representation": "plan-homography",
                "transform": {"frameFrom": "plan-raster-px", "frameTo": "still-px",
                              "matrix": [[float(v) for v in row] for row in e["h"]]},
                "inlierCount": e["support"], "matchCount": e["groundSegments"],
                "inlierRatio": round(e["support"] / max(1, e["groundSegments"]), 4),
                "residualRmsPx": round(e["supportRmsM"] * px_per_m, 4),
                "uncertainty": {
                    "floorRmsM": round(floor_rms_m, 6),
                    "budget95M": round(1.96 * floor_rms_m, 6),
                    "basis": "vp-rectification-first-order-v1+plan-instrument-systematic "
                             "(terms: rectification approximation 2% of support spread, support residual "
                             "x2, plan-instrument systematic 1.5% of spread; max of terms; NO crossval "
                             "term — cross-validation is a declared NOT-IMPLEMENTED limitation of this "
                             "adapter version)",
                    "budgetTerms": {
                        "rectificationApproximationM": round(term_rect, 6),
                        "supportResidualM": round(term_supp, 6),
                        "planInstrumentSystematicM": round(term_sys, 6),
                        "crossValidationM": 0.0,
                    },
                },
                "confidence": round(conf, 4),
                "epistemicLabel": EPISTEMIC_LABEL,
                "crossValidation": [],
            })
        hypotheses.sort(key=lambda h: h["evidenceContentId"])
        refused_stills.sort(key=lambda r: r["contentId"])

        config_echo = {k: v for k, v in policy.items() if not k.startswith("_")}
        config_echo["perStillNotes"] = notes

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
        policy_echo = {k: v for k, v in {**DEFAULT_CONFIG, **(req.get("policy") or {}), **policy}.items()
                       if not k.startswith("_")}
        print(json.dumps(refuse(execution_id, ref.reason_code, ref.detail, input_digest,
                                policy_echo, stage_t)))
        return 0


if __name__ == "__main__":
    sys.exit(main())
