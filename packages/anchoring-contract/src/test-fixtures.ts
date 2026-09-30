/**
 * ANCHOR-002 tests — shared deterministic fixtures (the typed-lift mirror
 * of the spike's fixture discipline: synthetic, content-addressed, and
 * honest about being synthetic).
 *
 * The content ids below are the sha-256 of stable ASCII byte strings (the
 * derivation is deterministic and asserted by a test) — they stand in for
 * the registered fixture evidence of a real capture, exactly as the spike's
 * synthetic fixture stood in for a real photoset.
 */

import { createHash } from "node:crypto";
import type { AnchoringRequest } from "./request";
import type {
  AnchoringHypothesis,
  AnchoringProvenance,
  AnchoringResponse,
} from "./response";
import {
  ANCHORING_CONTRACT_VERSION,
  ANCHORING_PORT_VERSION,
  ANCHORING_WIRE_SCHEMA_VERSION,
} from "./anchoring-contracts.version";

/** sha-256 hex of a stable string — the deterministic pseudo-content id. */
export function contentIdOf(seed: string): string {
  return createHash("sha256").update(`anchor002-test:${seed}`, "utf8").digest("hex");
}

/** The handedness-lawful rasterToScene of every lawful fixture. */
export const FIXTURE_RASTER_TO_SCENE: {
  pixelsPerMeter: number;
  xDirection: "east-right";
  yDirection: "north-up";
  worldOriginPx: [number, number];
} = {
  pixelsPerMeter: 200.0,
  xDirection: "east-right",
  yDirection: "north-up",
  worldOriginPx: [0, 1199],
};

/** A lawful plan context (the closed kind, AISE-owned content id). */
export function fixturePlanContext(planSeed: string): {
  kind: "plan-raster";
  planId: string;
  imageContentId: string;
  imageMediaType: string;
  bytesPath: string;
  rasterToScene: typeof FIXTURE_RASTER_TO_SCENE;
} {
  return {
    kind: "plan-raster",
    planId: "plan-anchor002-test-001",
    imageContentId: contentIdOf(planSeed),
    imageMediaType: "image/png",
    bytesPath: "/fixture/anchor002/plan-raster.png",
    rasterToScene: FIXTURE_RASTER_TO_SCENE,
  };
}

/** A lawful still evidence ref. */
export function fixtureEvidence(seed: string): {
  contentId: string;
  mediaType: string;
  acquisitionMethod: "STILL_IMAGERY";
  bytesPath: string;
} {
  return {
    contentId: contentIdOf(seed),
    mediaType: "image/png",
    acquisitionMethod: "STILL_IMAGERY",
    bytesPath: `/fixture/anchor002/${seed}.png`,
  };
}

/** The canonical lawful request (three stills + plan). */
export function fixtureRequest(executionId = "anchor002-test-run-001"): AnchoringRequest {
  return {
    schemaVersion: ANCHORING_WIRE_SCHEMA_VERSION,
    portVersion: ANCHORING_PORT_VERSION,
    contractVersion: ANCHORING_CONTRACT_VERSION,
    executionId,
    authority: "AISE",
    units: "SI",
    planContext: fixturePlanContext("plan"),
    evidence: [
      fixtureEvidence("still-001"),
      fixtureEvidence("still-002"),
      fixtureEvidence("still-003"),
    ],
    requestedAnchoring: { representation: "plan-homography" },
    policy: {
      minKeypointsPerImage: 80,
      minMatchesForEstimate: 12,
      minInliersPerStill: 8,
      minStills: 2,
      crossValMinInliers: 12,
      crossValMaxResidualPx: 20.0,
    },
  };
}

/** A lawful provenance block (provider-neutral shape, config echoed verbatim). */
export function fixtureProvenance(request: AnchoringRequest): AnchoringProvenance {
  return {
    providerId: "test-anchoring-provider",
    providerVersion: "test-adapter/1",
    platform: "Linux x86_64",
    inputDigest: `sha256:${contentIdOf(request.executionId)}`,
    adapterSourceDigest: `sha256:${contentIdOf("adapter-source")}`,
    components: [
      { name: "testcv", version: "1.0.0" },
      { name: "python", version: "3.12.14" },
    ],
    config: { ...request.policy },
    externalReferences: { providerRunId: "provider-internal-run-42" },
  };
}

/** A lawful hypothesis for one still (INFERRED candidate, normalized 3x3). */
export function fixtureHypothesis(
  request: AnchoringRequest,
  stillIndex: number,
): AnchoringHypothesis {
  const still = request.evidence[stillIndex];
  if (still === undefined) {
    throw new Error(`fixtureHypothesis: no still at index ${stillIndex}`);
  }
  const peerIndex = (stillIndex + 1) % request.evidence.length;
  const peer = request.evidence[peerIndex];
  if (peer === undefined) {
    throw new Error(`fixtureHypothesis: no peer still at index ${peerIndex}`);
  }
  return {
    evidenceContentId: still.contentId,
    representation: "plan-homography",
    transform: {
      frameFrom: "plan-raster-px",
      frameTo: "still-px",
      matrix: [
        [1.0001205, -0.0000231, 12.5],
        [0.0000198, 0.9999871, -4.25],
        [1.2e-7, -3.4e-8, 1],
      ],
    },
    inlierCount: 42,
    matchCount: 180,
    inlierRatio: 0.2333,
    residualRmsPx: 1.4,
    uncertainty: {
      floorRmsM: 0.0065,
      budget95M: 0.0128,
      basis: "inlier-residual-first-order-v2.1 (test fixture declaration)",
    },
    confidence: 0.92,
    epistemicLabel: "INFERRED",
    crossValidation: [
      { peerContentId: peer.contentId, residualRmsPx: 2.1, consistent: true },
    ],
  };
}

/** A lawful ANCHORED response covering every requested still exactly once. */
export function fixtureAnchoredResponse(request: AnchoringRequest): AnchoringResponse {
  return {
    schemaVersion: ANCHORING_WIRE_SCHEMA_VERSION,
    portVersion: ANCHORING_PORT_VERSION,
    contractVersion: ANCHORING_CONTRACT_VERSION,
    executionId: request.executionId,
    status: "anchored",
    reasonCode: null,
    provenance: fixtureProvenance(request),
    hypotheses: request.evidence.map((_, index) => fixtureHypothesis(request, index)),
    executionTimeMs: 15225.0,
    stageTimingsMs: { detect: 1112.301, match: 110.798, estimate: 1784.108, crossval: 11996.905 },
  };
}
