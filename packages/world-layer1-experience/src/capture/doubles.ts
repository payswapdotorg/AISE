/**
 * `@aise/world-layer1-experience` — the CAPTURE-family substitution
 * DOUBLES (WORLD-P1, `src/capture/doubles.ts`).
 *
 * Two INDEPENDENT in-memory providers of the `CaptureLanePort` — the
 * substitution proof that the capture→spatialize→register contract is
 * implementable WITHOUT any reconstruction engine, any SLAM/SfM stack,
 * any Cesium, any network, any clock:
 *
 *  - `referenceCaptureDouble` — the DIRECT implementation: per-key
 *    metadata parsing, streaming coverage reduction, sequential
 *    hypothesis admission (the pure transforms of ./spatialize.ts and
 *    ./register.ts ARE the reference semantics);
 *  - `alternateCaptureDouble` — a TABLE-DRIVEN implementation: the
 *    lane acquisition keys are processed through a key-table map, the
 *    coverage reduction collects volumes first and folds them
 *    afterwards, hypothesis admission runs against a pre-built
 *    evidence-index — an independent code path.
 *
 * Both compute the SAME committed fixtures and MUST produce
 * byte-identical canonical outputs at every comparison point
 * (fragment body, fragment id digest, coverage, registration verdict,
 * georeference) — only the provider identity differs, exactly as a
 * future WorldSculpt adapter and a classical-SfM adapter would differ.
 * That equivalence is asserted by the colocated tests
 * (substitution-contract §4.2 semantic equivalence, at this lane's
 * comparison points).
 *
 * EXACTNESS: every fixture coordinate/number is an integer or a
 * half-way-exact decimal so all arithmetic (min/max, comparisons) is
 * exact in IEEE-754 double arithmetic — byte-identity is achievable
 * because both kernels compute the same pinned values.
 */

import {
  LANE_ACQUISITION_METADATA_KEYS,
  canonicalDigestOf,
  isContentId,
  isIsoUtcInstant,
  looksLikeSubstrateId,
} from "../lane";
import { laneOk, laneRefuse, identityLeakRefusal, type LaneOutcome } from "../failures";
import type {
  CaptureLanePort,
  CaptureRegistrationRequest,
  CaptureRegistrationResult,
  CaptureSpatializationRequest,
  OmittedCaptureAsset,
  SpatialCoverage,
  SpatializedCaptureAsset,
  SpatializedWorldFragment,
} from "./contract";
import { CAPTURE_PORTS, isCaptureSpatializableMediaType } from "./contract";
import { MIN_REGISTRATION_HYPOTHESES } from "./register";
import { registerCaptureFragment as registerReference } from "./register";
import { spatializeCaptureSession } from "./spatialize";
import type { AnchoringHypothesis } from "@aise/anchoring-contract";
import type { WorldBounds } from "@aise/world-reality-substrate";

/* ------------------------------------------------------------------ */
/* The REFERENCE double (direct kernels)                                 */
/* ------------------------------------------------------------------ */

/** The reference provider descriptor (provenance identity). */
export const REFERENCE_CAPTURE_DESCRIPTOR = {
  providerId: "layer1-capture-reference-double",
  technologyVersion: "in-memory/1",
  engineNote: "in-memory substitution double — no reconstruction engine, no SLAM, no network",
} as const;

/** The reference double: the pure transforms as the port implementation. */
export const referenceCaptureDouble: CaptureLanePort = {
  portId: "layer1.capture/1",
  spatialize: (request) => spatializeCaptureSession(request),
  register: (request) => registerReference(request),
};

/* ------------------------------------------------------------------ */
/* The ALTERNATE double (table-driven, independent code path)            */
/* ------------------------------------------------------------------ */

/** The alternate provider descriptor (a different occupant, same semantics). */
export const ALTERNATE_CAPTURE_DESCRIPTOR = {
  providerId: "layer1-capture-alternate-double",
  technologyVersion: "in-memory/1-table-driven",
  engineNote:
    "in-memory substitution double (table-driven variant) — proves implementation independence",
} as const;

/** The lane acquisition key table the alternate double drives through. */
const KEY_TABLE = {
  pose: [
    LANE_ACQUISITION_METADATA_KEYS.poseX,
    LANE_ACQUISITION_METADATA_KEYS.poseY,
    LANE_ACQUISITION_METADATA_KEYS.poseZ,
  ],
  volumeMin: [
    LANE_ACQUISITION_METADATA_KEYS.volumeMinX,
    LANE_ACQUISITION_METADATA_KEYS.volumeMinY,
    LANE_ACQUISITION_METADATA_KEYS.volumeMinZ,
  ],
  volumeMax: [
    LANE_ACQUISITION_METADATA_KEYS.volumeMaxX,
    LANE_ACQUISITION_METADATA_KEYS.volumeMaxY,
    LANE_ACQUISITION_METADATA_KEYS.volumeMaxZ,
  ],
} as const;

function tableParse(
  metadata: Record<string, string>,
  keys: readonly string[],
): { values: number[] | null; anyDeclared: boolean } {
  const declared = keys.map((key) => metadata[key] !== undefined);
  const anyDeclared = declared.some(Boolean);
  if (!anyDeclared) return { values: [], anyDeclared: false };
  const values = keys.map((key) => {
    const raw = metadata[key];
    if (raw === undefined || raw === "") return Number.NaN;
    return Number(raw);
  });
  const allFinite = values.every((value) => Number.isFinite(value));
  return { values: allFinite ? values : null, anyDeclared: true };
}

function alternateSpatialize(
  request: CaptureSpatializationRequest,
): LaneOutcome<SpatializedWorldFragment> {
  const port = CAPTURE_PORTS.spatialize;

  // Instant gate.
  if (!isIsoUtcInstant(request.declaredAt)) {
    return laneRefuse(
      "contract-mismatch",
      port,
      `declaredAt is not an ISO-8601 UTC instant: ${String(request.declaredAt)}`,
    );
  }

  // Session gate (identity quarantine included).
  const sessionId = request.envelope.sessionId;
  if (typeof sessionId !== "string" || sessionId.length === 0 || sessionId.length > 256) {
    return laneRefuse(
      "contract-mismatch",
      port,
      "envelope.sessionId is not a stable id (1..256 chars)",
      typeof sessionId === "string" ? sessionId : null,
    );
  }
  const substrateShape = looksLikeSubstrateId(sessionId);
  if (substrateShape !== null) {
    return identityLeakRefusal(port, "envelope.sessionId", sessionId, substrateShape);
  }

  const allAssets = Array.isArray(request.envelope.assets) ? request.envelope.assets : [];
  if (allAssets.length === 0) {
    return laneRefuse(
      "contract-mismatch",
      port,
      "capture session carries no assets — nothing to spatialize",
      sessionId,
    );
  }

  // Whole-envelope content-id sweep FIRST (the alternate strategy:
  // validate the full identity surface before partitioning).
  const seen = new Set<string>();
  for (const asset of allAssets) {
    if (!isContentId(asset.contentId)) {
      return laneRefuse(
        "contract-mismatch",
        port,
        "asset contentId is not a 64-hex content address (the Evidence identity shape)",
        typeof asset.contentId === "string" ? asset.contentId : null,
      );
    }
    if (seen.has(asset.contentId)) {
      return laneRefuse(
        "contract-mismatch",
        port,
        `duplicate asset contentId in session: ${asset.contentId}`,
        asset.contentId,
      );
    }
    seen.add(asset.contentId);
  }

  // Partition (table-driven metadata parse per asset).
  const spatialized: SpatializedCaptureAsset[] = [];
  const omitted: OmittedCaptureAsset[] = [];
  for (const asset of allAssets) {
    if (!isCaptureSpatializableMediaType(asset.mediaType)) {
      omitted.push({
        evidenceContentId: asset.contentId,
        mediaType: String(asset.mediaType),
        reason: "media-type-not-spatializable",
        detail: `media type ${String(asset.mediaType)} is outside the P1 spatializable vocabulary`,
      });
      continue;
    }
    const metadata =
      asset.acquisitionMetadata !== null && typeof asset.acquisitionMetadata === "object"
        ? (asset.acquisitionMetadata as Record<string, string>)
        : {};
    const pose = tableParse(metadata, KEY_TABLE.pose);
    const volumeMin = tableParse(metadata, KEY_TABLE.volumeMin);
    const volumeMax = tableParse(metadata, KEY_TABLE.volumeMax);
    const volumeDeclared = volumeMin.anyDeclared || volumeMax.anyDeclared;
    let declaredVolume: WorldBounds | null = null;
    let volumeBasis: string | null = null;
    let malformed = pose.anyDeclared && pose.values === null;
    if (volumeDeclared) {
      const minValues = volumeMin.values;
      const maxValues = volumeMax.values;
      if (minValues === null || maxValues === null) {
        malformed = true;
      } else {
        const [minX, minY, minZ] = minValues;
        const [maxX, maxY, maxZ] = maxValues;
        if (
          minX === undefined || minY === undefined || minZ === undefined ||
          maxX === undefined || maxY === undefined || maxZ === undefined
        ) {
          malformed = true;
        } else if (minX > maxX || minY > maxY || minZ > maxZ) {
          malformed = true;
        } else {
          declaredVolume = {
            min: [minX, minY, minZ],
            max: [maxX, maxY, maxZ],
          };
          volumeBasis = metadata[LANE_ACQUISITION_METADATA_KEYS.volumeBasis] ?? "undeclared";
        }
      }
    }
    if (malformed) {
      omitted.push({
        evidenceContentId: asset.contentId,
        mediaType: asset.mediaType,
        reason: "pose-metadata-unparseable",
        detail: "declared lane metadata keys are present but malformed (non-finite or inverted)",
      });
      continue;
    }
    const [poseX, poseY, poseZ] = pose.values ?? [];
    spatialized.push({
      evidenceContentId: asset.contentId,
      mediaType: asset.mediaType,
      declaredPose:
        poseX !== undefined && poseY !== undefined && poseZ !== undefined
          ? [poseX, poseY, poseZ]
          : null,
      declaredVolume,
      volumeBasis,
    });
  }

  // Coverage: collect-then-fold (not streaming).
  const coverage = alternateCoverage(spatialized);

  const evidenceContentIds = allAssets.map((asset) => asset.contentId);
  const derivation = {
    contractVersion: request.envelope.contractVersion,
    derivationId: `derive-spatialize-${sessionId}`,
    outputContentId: "",
    inputEvidenceContentIds: [...evidenceContentIds],
    method: "spatialization.capture-session",
    methodVersion: "layer1-contract/1",
    parameters: {
      "site.units": request.siteFrame.units,
      "site.north.rad": String(request.siteFrame.northHeading),
    },
    createdAt: request.declaredAt,
  };
  const body = {
    sessionId,
    siteFrame: request.siteFrame,
    assets: spatialized,
    omissions: omitted,
    coverage,
    evidenceContentIds,
    derivationMethod: derivation.method,
    derivationInput: derivation.inputEvidenceContentIds,
    declaredAt: request.declaredAt,
  };
  const fragmentId = canonicalDigestOf(body);
  return laneOk({
    fragmentId,
    sessionId,
    siteFrame: request.siteFrame,
    registrationState: "unregistered",
    assets: spatialized,
    omissions: omitted,
    coverage,
    evidenceContentIds,
    derivation: { ...derivation, outputContentId: fragmentId },
  });
}

function alternateCoverage(assets: readonly SpatializedCaptureAsset[]): SpatialCoverage {
  // Collect-then-fold: gather volumes first, then reduce over the list.
  const volumes = assets
    .filter((asset) => asset.declaredVolume !== null)
    .map((asset) => ({
      volume: asset.declaredVolume as WorldBounds,
      basis: asset.volumeBasis,
    }));
  const coveredBounds = volumes.reduce<WorldBounds | null>((acc, entry) => {
    if (acc === null) return { min: [...entry.volume.min], max: [...entry.volume.max] };
    return {
      min: [
        Math.min(acc.min[0], entry.volume.min[0]),
        Math.min(acc.min[1], entry.volume.min[1]),
        Math.min(acc.min[2], entry.volume.min[2]),
      ],
      max: [
        Math.max(acc.max[0], entry.volume.max[0]),
        Math.max(acc.max[1], entry.volume.max[1]),
        Math.max(acc.max[2], entry.volume.max[2]),
      ],
    };
  }, null);
  const basesSet = new Set<string>();
  for (const entry of volumes) {
    if (entry.basis !== null) basesSet.add(entry.basis);
  }
  const unplaced = assets.reduce(
    (count, asset) => count + (asset.declaredPose === null ? 1 : 0),
    0,
  );
  const noVolume = assets.length - volumes.length;
  const limitations: string[] = [];
  if (unplaced > 0) {
    limitations.push(
      `${unplaced} spatializable asset(s) declared no pose — carried unplaced, never guessed`,
    );
  }
  if (noVolume > 0) {
    limitations.push(
      `${noVolume} spatializable asset(s) declared no capture volume — no coverage contribution`,
    );
  }
  if (coveredBounds === null) {
    limitations.push("no asset declared a capture volume — coverage is UNDECLARED, not empty");
  }
  return {
    coveredBounds,
    contributingAssets: volumes.length,
    bases: [...basesSet],
    limitations,
  };
}

function alternateRegister(
  request: CaptureRegistrationRequest,
): LaneOutcome<CaptureRegistrationResult> {
  const port = CAPTURE_PORTS.register;
  const { fragment } = request;

  if (fragment.registrationState !== "unregistered") {
    return laneRefuse(
      "operation-semantic-failure",
      port,
      `fragment registrationState is ${fragment.registrationState}, not "unregistered" — ` +
        "re-registration requires a fresh spatialization",
      fragment.fragmentId,
    );
  }
  if (!isIsoUtcInstant(request.declaredAt)) {
    return laneRefuse(
      "contract-mismatch",
      port,
      `declaredAt is not an ISO-8601 UTC instant: ${String(request.declaredAt)}`,
    );
  }
  if (!Number.isFinite(request.declaredAccuracyMetres) || request.declaredAccuracyMetres <= 0) {
    return laneRefuse(
      "contract-mismatch",
      port,
      "declaredAccuracyMetres must be a positive finite number (metres)",
    );
  }

  // Pre-built evidence index (vs the reference's per-hypothesis Set).
  const knownIndex = new Set(fragment.evidenceContentIds);
  const echoFailures: { evidenceContentId: string; reason: string }[] = [];
  const admitted: AnchoringHypothesis[] = [];
  for (const hypothesis of request.hypotheses) {
    if (!knownIndex.has(hypothesis.evidenceContentId)) {
      echoFailures.push({
        evidenceContentId: hypothesis.evidenceContentId,
        reason: "echo-failure: hypothesis names evidence outside this fragment",
      });
      continue;
    }
    if (hypothesis.inlierCount <= 0) {
      echoFailures.push({
        evidenceContentId: hypothesis.evidenceContentId,
        reason: "zero-inlier hypothesis carries no admissible registration signal",
      });
      continue;
    }
    if (hypothesis.uncertainty.budget95M < hypothesis.uncertainty.floorRmsM) {
      echoFailures.push({
        evidenceContentId: hypothesis.evidenceContentId,
        reason: "uncertainty-budget violation: budget95M < floorRmsM",
      });
      continue;
    }
    admitted.push(hypothesis);
  }

  if (admitted.length < MIN_REGISTRATION_HYPOTHESES) {
    return laneOk({
      outcome: "refused",
      registrationState: "registration-refused",
      georeference: null,
      reason:
        `insufficient-stills: ${admitted.length} admissible hypothesis(es), ` +
        `${MIN_REGISTRATION_HYPOTHESES} required`,
      echoFailures,
      fragment: { ...fragment, registrationState: "registration-refused" },
    });
  }

  const georeference = {
    anchor: request.candidateAnchor,
    accuracyMetres: request.declaredAccuracyMetres,
    derivedFrom: admitted,
  };
  const outcome = echoFailures.length === 0 ? "anchored" : "partial";
  return laneOk({
    outcome,
    registrationState: outcome === "anchored" ? "site-registered" : "partially-registered",
    georeference,
    reason: outcome === "partial" ? "partial: some hypotheses refused (see echoFailures)" : null,
    echoFailures,
    fragment: { ...fragment, registrationState: outcome === "anchored" ? "site-registered" : "partially-registered" },
  });
}

/** The alternate double: an independent implementation of the same port. */
export const alternateCaptureDouble: CaptureLanePort = {
  portId: "layer1.capture/1",
  spatialize: alternateSpatialize,
  register: alternateRegister,
};
