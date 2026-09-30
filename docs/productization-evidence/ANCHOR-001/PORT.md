# ANCHOR-001 — The Smallest Provider-Neutral Anchoring Port

**Status:** spike proposal (nothing here enters the canonical engine).  
**Relationship to existing seams:** this port is the MINIMAL spike-scoped
projection of what a production Layer-1 anchoring boundary would carry. It
deliberately mirrors the discipline of the existing governed surfaces: the
reconstruction provider contract (`backend/api/src/reconstruction/contract.ts`
— closed vocabularies, typed failures, provider descriptors, provenance),
the evidence register's content-addressing (64-hex sha-256 content ids,
`packages/shared-contracts/src/common.ts`), and the GBIM-001 process-boundary
pattern (stdio JSON, AISE-side schema guard). No existing port is modified;
this one is disposable evidence for what a production "Anchoring Port" Work
Item would have to carry.

## 1. The boundary

```
AISE DOMAIN CORE (TypeScript, canonical authority — UNCHANGED by this spike)
  registered stills (content-addressed evidence) + plan/floor context
        |
        |  AnchoringRequest   (JSON, SI units, AISE-owned content ids)
        v
  =========================== PROCESS BOUNDARY ===========================
        |  (stdio: the ONLY thing that crosses is serialized JSON)
        v
  DISPOSABLE PROVIDER (Python process: OpenCV 5.0.0 SIFT + RANSAC)
        |
        |  AnchoringResponse  (JSON, closed output vocabulary)
        v
  AISE-side schema guard (aise-side/guard.ts — the D26 projection discipline)
        |
        v  anchoring HYPOTHESES — CANDIDATES with explicit uncertainty,
           epistemicLabel INFERRED, never canonical, never a Reality Graph write
```

Like GBIM-001, the port is a PROCESS boundary, not an in-process interface:
an OpenCV `KeyPoint`/`Mat`/handle physically cannot cross it. This is the
shape we recommend for any production anchoring adoption.

## 2. Input contract (`AnchoringRequest` — `aise-side/contract.ts`)

Built exclusively by AISE-owned code (`aise-side/run_spike.ts`) from the
registered fixture evidence:

```jsonc
{
  "schemaVersion": 1,
  "portVersion": "anchor001-anchoring-port/1",
  "executionId": "anchor001-run-001",
  "authority": "AISE",
  "units": "SI",
  "planContext": {
    "kind": "plan-raster",              // closed vocabulary (only kind exercised)
    "planId": "plan-anchor001-001",     // AISE-owned identity
    "imageContentId": "<64-hex>",       // content-addressed plan raster bytes
    "imageMediaType": "image/png",
    "bytesPath": "<where AISE pinned the bytes>",
    "rasterToScene": {                   // THE HANDEDNESS LAW (see §5)
      "pixelsPerMeter": 200.0,
      "xDirection": "east-right",
      "yDirection": "north-up",
      "worldOriginPx": [0, 1199]
    }
  },
  "evidence": [
    { "contentId": "<64-hex>", "mediaType": "image/png",
      "acquisitionMethod": "STILL_IMAGERY", "bytesPath": "<...>" }
  ],
  "requestedAnchoring": { "representation": "plan-homography" },
  "policy": { "minKeypointsPerImage": 80, "minMatchesForEstimate": 12,
              "minInliersPerStill": 8, "minStills": 2,
              "crossValMinInliers": 12, "crossValMaxResidualPx": 20.0 }
}
```

Mirrors of the existing neutral vocabulary: evidence content ids are the
shared-contract shape (64-hex sha-256); `acquisitionMethod` is the evidence
service's `EVIDENCE_METHODS` vocabulary; the provider re-verifies every
bytes digest against its content id before use (the content-addressing
gate, `evidence-bytes-mismatch`).

## 3. Output contract (`AnchoringResponse`)

Closed vocabulary, strictly validated by the AISE-side guard:

```jsonc
{
  "schemaVersion": 1,
  "portVersion": "anchor001-anchoring-port/1",
  "executionId": "…",
  "status": "anchored" | "refused",
  "reasonCode": null | "input-contract-violation" | "plan-context-missing"
              | "plan-context-unsupported" | "representation-unsupported"
              | "evidence-method-unsupported" | "evidence-bytes-mismatch"
              | "insufficient-stills" | "insufficient-features"
              | "registration-unreliable",
  "refusalDetail": "<human-readable, names the offending ids>",
  "provenance": {
    "providerId": "sift-homography-spike",
    "providerVersion": "anchor001-adapter/1",
    "opencvVersion": "5.0.0", "numpyVersion": "2.5.3",
    "pythonVersion": "3.12.14", "platform": "Linux x86_64",
    "inputDigest": "sha256:…",            // digest of the exact request bytes
    "adapterSourceDigest": "sha256:…",    // digest of the provider source itself
    "config": { /* every parameter, echoed verbatim — replayable */ }
  },
  "hypotheses": [                          // ONLY on "anchored"; zero on refusal
    {
      "evidenceContentId": "<64-hex>",     // AISE-owned identity, echoed
      "representation": "plan-homography",
      "transform": { "frameFrom": "plan-raster-px", "frameTo": "still-px",
                     "matrix": [[…],[…],[…]] },  // normalized 3x3, finite numbers
      "inlierCount": 18, "matchCount": 99, "inlierRatio": 0.18,
      "residualRmsPx": 1.4,
      "uncertainty": {                      // EXPLICIT budget, meters
        "floorRmsM": 0.0065, "budget95M": 0.0128,
        "basis": "inlier-residual-first-order-v2.1 (…)",
        "budgetTerms": { /* per-term decomposition */ }
      },
      "confidence": 0.92,                   // declared support score, not a probability
      "epistemicLabel": "INFERRED",         // candidates, ALWAYS
      "crossValidation": [
        { "peerContentId": "<64-hex>", "residualRmsPx": 2.1, "consistent": true }
      ]
    }
  ],
  "executionTimeMs": 15225.0,               // observation, excluded from digests
  "stageTimingsMs": { "detect": …, "match": …, "estimate": …, "crossval": … }
}
```

## 4. The laws this port enforces

1. **No provider type crosses.** The provider is a subprocess; the output is
   JSON validated against a closed schema. Unknown fields are refused with
   the field named (proven by neg-006, four corruption classes).
2. **AISE owns identity.** Evidence content ids are supplied by AISE and
   echoed; the provider never invents ids, never writes, never touches the
   network. Provider keypoints/handles exist only inside the provider
   process and are never serialized.
3. **Fail closed before anchors.** The provider's gate order mirrors the
   AISE engine's `apply.ts` discipline:
   structural sanity → plan present/supported → requested representation →
   evidence methods (BEFORE reading bytes) → content-address verification →
   redundancy (≥2 stills) → feature floor (textureless) → per-still
   registration (mismatched plan). Every refusal is typed and carries ZERO
   hypotheses — no fabricated anchors (the whole ledger, neg-001…005).
4. **Candidates, never writes.** Every hypothesis carries
   `epistemicLabel: INFERRED`, an explicit uncertainty budget in meters, and
   a declared confidence score; nothing enters the Reality Graph (the spike
   writes evidence files under `results/` only — the governed changes API is
   the only production path, see ux-design-notes.md).

## 5. The HANDEDNESS LAW (a first-class contract field)

A plan raster drawn in "screen convention" (x right, y **down** the rows)
is **mirrored** relative to any real right-handed downward-looking camera —
no orientation-covariant descriptor (SIFT, ORB, …) can ever match the two,
no matter how good the matching. This spike hit exactly this failure
during development (every descriptor ratio at true correspondences ≈ 2.1
where < 0.8 is needed) and fixed it by DECLARING the raster convention in
the port contract: `rasterToScene.yDirection: "north-up"` (row 0 = max
scene y, the map/orthophoto convention that shares handedness with real
nadir cameras). The guard refuses a request whose plan context does not
declare the supported convention. **A production Anchoring Port MUST carry
this field** — leaving raster handedness implicit is how a future adapter
silently produces mirrored anchors that pass every numeric gate.

## 6. What the port does NOT carry (the "smallest" discipline)

- No Reality Graph / Solution Graph types — hypotheses are comparison
  records only; proposed-state authority stays in AISE.
- No pose graph / SfM / bundle adjustment — one representation
  (`plan-homography`) is exercised; `camera_poses` stays with the existing
  reconstruction contract (`REPRESENTATION_TYPES`).
- No 3D — the homography anchors a still to the plan's floor plane;
  elevation anchoring is out of scope (recorded in recommendation.md).
- No line-art plan support — the exercised plan kind is a shared-texture
  plan RASTER; line-art drawing registration is an explicit open gap
  (negative-adjacent finding, see adapter-notes.md §3).
- No in-process handle passing, no shared memory, no callbacks, no network.

## 7. Open design questions recorded for the production Work Item

- **PARTIAL states.** The spike is strictly whole-request fail-closed: one
  weak still refuses the whole request (neg-004 proves the discipline). A
  production port likely wants a typed `PARTIAL` outcome with per-still
  results (mirroring the reconstruction contract's PARTIAL) so a 50-still
  capture can anchor the 45 good stills and name the 5 refused.
- **Line-art plans.** Real floor plans are line drawings without shared
  texture with photos. The automatic path needs either (a) an intermediate
  orthophoto/raster base map, or (b) a geometric (wall-line) registration
  lane — a separate method, a separate adapter.
- **Budget calibration.** The declared first-order uncertainty model
  (v2.1) covers realized error for well-supported stills and misses on
  weak ones (measurements.md §4); production needs empirical calibration
  per capture regime, or cross-validation-aware budgets with honest
  coverage statistics.
