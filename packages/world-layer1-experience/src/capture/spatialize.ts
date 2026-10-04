/**
 * `@aise/world-layer1-experience` — the SPATIALIZE transform
 * (WORLD-P1, `src/capture/spatialize.ts`).
 *
 * The PURE typed transform from the capture seam envelope to a
 * `SpatializedWorldFragment`. Fail-closed at every gate; zero
 * fabrication at every field:
 *
 *  - the ENVELOPE is consumed as-is (the seam owns its shape); the
 *    transform validates only what the LANE needs: session id shape,
 *    asset content ids (64-hex — the Evidence identity shape), the
 *    declared instant, and finite declared metadata numbers;
 *  - each asset partitions into spatializable (closed media-type
 *    vocabulary) or OMITTED-with-typed-reason — a voice note or a
 *    document in a capture session is honest evidence but NOT spatial
 *    input, and the omission is visible, never silent;
 *  - poses and volumes are DEVICE-DECLARED (the lane-recognized
 *    acquisition keys) — absent means unplaced/no-coverage with a
 *    recorded limitation, never a guessed value; unparseable metadata
 *    (non-finite numbers, malformed keys) omits the asset with the
 *    typed reason (a device that declares garbage poses is not
 *    trusted with a spatial claim);
 *  - the fragment id is the content digest over the canonical
 *    fragment body (deterministic identity — no randomness);
 *  - the derivation records method `spatialization.capture-session`
 *    with the declared instant.
 *
 * Determinism: no network, no clock, no randomness, no I/O. The same
 * request produces the byte-identical fragment (digest-pinned).
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
  CaptureSpatializationRequest,
  OmittedCaptureAsset,
  SpatialCoverage,
  SpatializedCaptureAsset,
  SpatializedWorldFragment,
} from "./contract";
import { CAPTURE_PORTS, isCaptureSpatializableMediaType } from "./contract";
import type { WorldBounds } from "@aise/world-reality-substrate";
import type { Evidence } from "@aise/shared-contracts";

/* ------------------------------------------------------------------ */
/* Declared-metadata parsing (the open-map discipline, lane keys)        */
/* ------------------------------------------------------------------ */

function parseFiniteNumber(
  metadata: Record<string, string>,
  key: string,
): number | null {
  const raw = metadata[key];
  if (raw === undefined || raw === "") return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

/**
 * Parse one asset's device-declared pose. Returns:
 *  - `{ pose }` — all three components declared and finite;
 *  - `{ pose: null }` — none declared (honestly unplaced);
 *  - `{ malformed: true }` — some components declared but not all
 *    finite/parseable (a garbage declaration — omit the asset).
 */
function parseDeclaredPose(
  metadata: Record<string, string>,
): { pose: readonly [number, number, number] | null; malformed: boolean } {
  const x = parseFiniteNumber(metadata, LANE_ACQUISITION_METADATA_KEYS.poseX);
  const y = parseFiniteNumber(metadata, LANE_ACQUISITION_METADATA_KEYS.poseY);
  const z = parseFiniteNumber(metadata, LANE_ACQUISITION_METADATA_KEYS.poseZ);
  const declaredAny =
    metadata[LANE_ACQUISITION_METADATA_KEYS.poseX] !== undefined ||
    metadata[LANE_ACQUISITION_METADATA_KEYS.poseY] !== undefined ||
    metadata[LANE_ACQUISITION_METADATA_KEYS.poseZ] !== undefined;
  if (!declaredAny) return { pose: null, malformed: false };
  if (x === null || y === null || z === null) {
    return { pose: null, malformed: true };
  }
  return { pose: [x, y, z], malformed: false };
}

/** Parse one asset's device-declared capture volume (AABB), same law. */
function parseDeclaredVolume(
  metadata: Record<string, string>,
): { volume: WorldBounds | null; basis: string | null; malformed: boolean } {
  const K = LANE_ACQUISITION_METADATA_KEYS;
  const declaredAny =
    metadata[K.volumeMinX] !== undefined || metadata[K.volumeMaxX] !== undefined ||
    metadata[K.volumeMinY] !== undefined || metadata[K.volumeMaxY] !== undefined ||
    metadata[K.volumeMinZ] !== undefined || metadata[K.volumeMaxZ] !== undefined;
  if (!declaredAny) return { volume: null, basis: null, malformed: false };
  const minX = parseFiniteNumber(metadata, K.volumeMinX);
  const minY = parseFiniteNumber(metadata, K.volumeMinY);
  const minZ = parseFiniteNumber(metadata, K.volumeMinZ);
  const maxX = parseFiniteNumber(metadata, K.volumeMaxX);
  const maxY = parseFiniteNumber(metadata, K.volumeMaxY);
  const maxZ = parseFiniteNumber(metadata, K.volumeMaxZ);
  if (
    minX === null || minY === null || minZ === null ||
    maxX === null || maxY === null || maxZ === null
  ) {
    return { volume: null, basis: null, malformed: true };
  }
  if (minX > maxX || minY > maxY || minZ > maxZ) {
    return { volume: null, basis: null, malformed: true };
  }
  const basis = metadata[K.volumeBasis] ?? "undeclared";
  return {
    volume: { min: [minX, minY, minZ], max: [maxX, maxY, maxZ] },
    basis,
    malformed: false,
  };
}

/* ------------------------------------------------------------------ */
/* Coverage derivation (declared volumes only — never fabricated)        */
/* ------------------------------------------------------------------ */

function deriveCoverage(assets: readonly SpatializedCaptureAsset[]): SpatialCoverage {
  let covered: WorldBounds | null = null;
  let contributing = 0;
  const bases: string[] = [];
  const limitations: string[] = [];
  const unplaced = assets.filter((asset) => asset.declaredPose === null).length;
  const noVolume = assets.filter((asset) => asset.declaredVolume === null).length;
  for (const asset of assets) {
    if (asset.declaredVolume === null) continue;
    contributing += 1;
    if (asset.volumeBasis !== null && !bases.includes(asset.volumeBasis)) {
      bases.push(asset.volumeBasis);
    }
    const v = asset.declaredVolume;
    covered = covered === null
      ? { min: [...v.min], max: [...v.max] }
      : {
          min: [
            Math.min(covered.min[0], v.min[0]),
            Math.min(covered.min[1], v.min[1]),
            Math.min(covered.min[2], v.min[2]),
          ],
          max: [
            Math.max(covered.max[0], v.max[0]),
            Math.max(covered.max[1], v.max[1]),
            Math.max(covered.max[2], v.max[2]),
          ],
        };
  }
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
  if (covered === null) {
    limitations.push("no asset declared a capture volume — coverage is UNDECLARED, not empty");
  }
  return { coveredBounds: covered, contributingAssets: contributing, bases, limitations };
}

/* ------------------------------------------------------------------ */
/* The SPATIALIZE transform                                             */
/* ------------------------------------------------------------------ */

/**
 * CAPTURE → SPATIALIZE: the pure typed transform. Every refusal is a
 * typed `LaneFailure` (HFX-000 closed kinds); every omission is
 * visible; every field is declared or honestly null.
 */
export function spatializeCaptureSession(
  request: CaptureSpatializationRequest,
): LaneOutcome<SpatializedWorldFragment> {
  const port = CAPTURE_PORTS.spatialize;

  // Gate 1: the declared instant.
  if (!isIsoUtcInstant(request.declaredAt)) {
    return laneRefuse(
      "contract-mismatch",
      port,
      `declaredAt is not an ISO-8601 UTC instant: ${String(request.declaredAt)}`,
    );
  }

  // Gate 2: the session identity (the seam shape, plus the
  // identity-quarantine tripwire — a substrate-shaped session id is a
  // contract violation of the identity law).
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

  // Gate 3: the assets array shape.
  const assets: readonly Evidence[] = Array.isArray(request.envelope.assets)
    ? request.envelope.assets
    : [];
  const seenContentIds = new Set<string>();
  const spatialized: SpatializedCaptureAsset[] = [];
  const omitted: OmittedCaptureAsset[] = [];
  const evidenceContentIds: string[] = [];

  for (const asset of assets) {
    // Gate 3a: the Evidence identity shape (64-hex content address).
    if (!isContentId(asset.contentId)) {
      return laneRefuse(
        "contract-mismatch",
        port,
        "asset contentId is not a 64-hex content address (the Evidence identity shape)",
        typeof asset.contentId === "string" ? asset.contentId : null,
      );
    }
    if (seenContentIds.has(asset.contentId)) {
      return laneRefuse(
        "contract-mismatch",
        port,
        `duplicate asset contentId in session: ${asset.contentId}`,
        asset.contentId,
      );
    }
    seenContentIds.add(asset.contentId);
    evidenceContentIds.push(asset.contentId);

    // Gate 3b: the closed media-type partition.
    if (!isCaptureSpatializableMediaType(asset.mediaType)) {
      omitted.push({
        evidenceContentId: asset.contentId,
        mediaType: String(asset.mediaType),
        reason: "media-type-not-spatializable",
        detail: `media type ${String(asset.mediaType)} is outside the P1 spatializable vocabulary`,
      });
      continue;
    }

    // Gate 3c: the device-declared pose/volume (open-map lane keys).
    const metadata =
      asset.acquisitionMetadata !== null && typeof asset.acquisitionMetadata === "object"
        ? (asset.acquisitionMetadata as Record<string, string>)
        : {};
    const { pose, malformed: poseMalformed } = parseDeclaredPose(metadata);
    const { volume, basis, malformed: volumeMalformed } = parseDeclaredVolume(metadata);
    if (poseMalformed || volumeMalformed) {
      omitted.push({
        evidenceContentId: asset.contentId,
        mediaType: asset.mediaType,
        reason: "pose-metadata-unparseable",
        detail: poseMalformed
          ? "declared pose keys are present but not all finite numbers"
          : "declared volume keys are present but malformed (non-finite or inverted)",
      });
      continue;
    }

    spatialized.push({
      evidenceContentId: asset.contentId,
      mediaType: asset.mediaType,
      declaredPose: pose,
      declaredVolume: volume,
      volumeBasis: volume !== null ? basis : null,
    });
  }

  // Gate 4: a capture session with ZERO assets is refused (nothing to
  // spatialize — the empty fragment would fabricate a world).
  if (assets.length === 0) {
    return laneRefuse(
      "contract-mismatch",
      port,
      "capture session carries no assets — nothing to spatialize",
      sessionId,
    );
  }

  const coverage = deriveCoverage(spatialized);

  // The fragment body (identity = content digest over the canonical
  // body — deterministic, no randomness).
  const derivation = {
    contractVersion: request.envelope.contractVersion,
    derivationId: `derive-spatialize-${sessionId}`,
    outputContentId: "", // filled below (content-addressed)
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

  const fragment: SpatializedWorldFragment = {
    fragmentId,
    sessionId,
    siteFrame: request.siteFrame,
    registrationState: "unregistered",
    assets: spatialized,
    omissions: omitted,
    coverage,
    evidenceContentIds,
    derivation: { ...derivation, outputContentId: fragmentId },
  };
  return laneOk(fragment);
}
