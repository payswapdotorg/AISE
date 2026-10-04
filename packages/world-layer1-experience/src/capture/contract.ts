/**
 * `@aise/world-layer1-experience` — the CAPTURE → SPATIALIZE → REGISTER
 * family contract (WORLD-P1, `src/capture/`).
 *
 * The typed contract from a CAPTURE SESSION (the existing capture seam
 * type `CaptureSessionEnvelope` from `@aise/shared-contracts` — the
 * offline-first sync envelope the field client produces and the capture
 * ingestion gateway accepts) to a SPATIALIZED WORLD FRAGMENT: capture
 * registration states, spatial coverage and the Cesium geospatial
 * context binding — expressed through the P0-A geospatial port
 * vocabulary (`SiteGeoreference`, `GeoreferenceVerdict`) which itself
 * reuses the anchoring-contract outcome/hypothesis vocabulary VERBATIM.
 *
 * STAGE DISCIPLINE (each stage is one typed transform, fail-closed):
 *
 *  CAPTURE      the session arrives through the existing seam — the
 *               lane CONSUMES the envelope, never redefines it (the
 *               capture gateway stays the ingestion authority).
 *  SPATIALIZE   `spatializeCaptureSession` — the pure transform from
 *               the envelope to a `SpatializedWorldFragment`: assets
 *               partition into spatializable (per the closed media-type
 *               vocabulary) vs OMITTED-with-typed-reason (visible
 *               omissions — a voice note in a capture session is
 *               evidence, not spatial input); device-DECLARED poses
 *               place spatializable assets in the site frame (absent
 *               declarations leave the asset honestly UNPLACED);
 *               coverage derives ONLY from device-declared volumes
 *               (never fabricated — absent volumes record a
 *               limitation).
 *  REGISTER     `registerCaptureFragment` — the typed registration of
 *               a fragment into the site's geospatial context,
 *               consuming `AnchoringHypothesis` inputs (verbatim, the
 *               anchoring-contract type) and a candidate geodetic
 *               position, answering with the anchoring outcome
 *               vocabulary (`anchored` | `partial` | `refused`) and the
 *               P0-A `GeoreferenceVerdict` shape. Zero hypotheses are
 *               fabricated; an unregistrable fragment is REFUSED.
 *
 * IDENTITY LAW: every fragment element id is an AISE-owned
 * content-derived digest (never an asset content id — that is the
 * EVIDENCE identity; never a substrate id). Evidence content ids bind
 * as `evidenceContentIds` — the Evidence Envelope seam.
 */

import type { AnchoringHypothesis, AnchoringOutcome } from "@aise/anchoring-contract";
import type {
  GeodeticPosition,
  SiteGeoreference,
  SiteFrame,
  WorldBounds,
} from "@aise/world-reality-substrate";
import type { CaptureSessionEnvelope, Derivation } from "@aise/shared-contracts";

/* ------------------------------------------------------------------ */
/* Closed vocabularies                                                  */
/* ------------------------------------------------------------------ */

/**
 * The closed media-type vocabulary this lane can SPATIALIZE at P1
 * (contract level — a real reconstruction engine may widen this from
 * behind the port; widening is a contract bump). A well-formed asset
 * outside this vocabulary is OMITTED with the typed reason
 * `media-type-not-spatializable` — never fabricated into a fragment,
 * never silently dropped.
 */
export const CAPTURE_SPATIALIZABLE_MEDIA_TYPES = [
  "image/jpeg",
  "image/png",
  "video/mp4",
] as const;
export type CaptureSpatializableMediaType =
  (typeof CAPTURE_SPATIALIZABLE_MEDIA_TYPES)[number];

export function isCaptureSpatializableMediaType(
  value: unknown,
): value is CaptureSpatializableMediaType {
  return (
    typeof value === "string" &&
    (CAPTURE_SPATIALIZABLE_MEDIA_TYPES as readonly string[]).includes(value)
  );
}

/**
 * The closed asset-omission reason vocabulary (the visible-omission
 * discipline — every omitted asset carries exactly one typed reason).
 */
export const CAPTURE_ASSET_OMISSION_REASONS = [
  "media-type-not-spatializable",
  "pose-metadata-unparseable",
] as const;
export type CaptureAssetOmissionReason =
  (typeof CAPTURE_ASSET_OMISSION_REASONS)[number];

/**
 * The closed capture-registration-state vocabulary. The initial state
 * of every fragment is `unregistered`; `registerCaptureFragment` moves
 * it to `site-registered` (anchoring outcome `anchored`),
 * `partially-registered` (outcome `partial` — some hypotheses
 * consistent, some refused with per-asset reasons) or
 * `registration-refused` (outcome `refused` — zero bindings, fail
 * closed). The vocabulary extends the anchoring outcome set with the
 * pre-registration state only; the OUTCOME vocabulary itself is
 * imported verbatim and never redefined.
 */
export const CAPTURE_REGISTRATION_STATES = [
  "unregistered",
  "site-registered",
  "partially-registered",
  "registration-refused",
] as const;
export type CaptureRegistrationState = (typeof CAPTURE_REGISTRATION_STATES)[number];

export function isCaptureRegistrationState(
  value: unknown,
): value is CaptureRegistrationState {
  return (
    typeof value === "string" &&
    (CAPTURE_REGISTRATION_STATES as readonly string[]).includes(value)
  );
}

/* ------------------------------------------------------------------ */
/* SPATIALIZE — the request                                             */
/* ------------------------------------------------------------------ */

/**
 * The capture-to-spatial request: the seam envelope (consumed
 * verbatim), the site frame the fragment spatializes INTO (the P0-A
 * scene-composition type), and the DECLARED instant of the
 * spatialization (determinism: never a clock read).
 */
export interface CaptureSpatializationRequest {
  readonly envelope: CaptureSessionEnvelope;
  readonly siteFrame: SiteFrame;
  readonly declaredAt: string;
}

/* ------------------------------------------------------------------ */
/* SPATIALIZE — the per-asset records                                   */
/* ------------------------------------------------------------------ */

/**
 * One spatialized asset: the evidence binding (verbatim content id +
 * media type from the seam envelope), the device-DECLARED pose in the
 * site frame (metres) or `null` when the device declared none (the
 * asset is carried UNPLACED — honestly, never guessed), and the
 * device-declared capture VOLUME (world-space AABB of what the asset
 * observed) or `null` (no coverage contribution; a limitation is
 * recorded at the fragment level).
 */
export interface SpatializedCaptureAsset {
  /** The Evidence content id — verbatim from the envelope (the binding). */
  readonly evidenceContentId: string;
  readonly mediaType: CaptureSpatializableMediaType;
  /** Device-declared site-frame pose (metres), or null (unplaced). */
  readonly declaredPose: readonly [number, number, number] | null;
  /** Device-declared capture volume (site-frame AABB), or null. */
  readonly declaredVolume: WorldBounds | null;
  /** How the volume was declared (carried verbatim from metadata), or null. */
  readonly volumeBasis: string | null;
}

/** One omitted asset with its typed reason (the visible-omission law). */
export interface OmittedCaptureAsset {
  readonly evidenceContentId: string;
  readonly mediaType: string;
  readonly reason: CaptureAssetOmissionReason;
  /** The honest detail (e.g. which metadata key failed to parse). */
  readonly detail: string;
}

/* ------------------------------------------------------------------ */
/* SPATIALIZE — spatial coverage (declared, never fabricated)            */
/* ------------------------------------------------------------------ */

/**
 * The spatial coverage of a fragment — what the capture actually
 * covered, derived ONLY from device-declared volumes. When no asset
 * declared a volume, coverage is `null` and the limitation is carried
 * in `limitations` (a coverage claim without a declared basis would be
 * a fabricated measurement — the ANCHOR doctrine forbids it).
 */
export interface SpatialCoverage {
  /** The union bounds of all declared volumes, or null when none declared. */
  readonly coveredBounds: WorldBounds | null;
  /** How many assets contributed coverage (declared volumes). */
  readonly contributingAssets: number;
  /** The declared bases, verbatim, deduplicated in first-seen order. */
  readonly bases: readonly string[];
  /** Honest limitations (e.g. "3 spatializable assets declared no volume"). */
  readonly limitations: readonly string[];
}

/* ------------------------------------------------------------------ */
/* SPATIALIZE — the fragment                                            */
/* ------------------------------------------------------------------ */

/**
 * A spatialized world fragment: the capture session's spatial
 * projection. Carries the spatialized assets (placed or honestly
 * unplaced), the visible omissions, the declared coverage, the
 * registration state (always `unregistered` at this stage — only
 * REGISTER moves it), the evidence envelope binding and the lane
 * derivation (method `spatialization.capture-session`).
 */
export interface SpatializedWorldFragment {
  /** AISE-owned content-derived digest — the FRAGMENT identity. */
  readonly fragmentId: string;
  /** The capture session identity (verbatim from the envelope). */
  readonly sessionId: string;
  readonly siteFrame: SiteFrame;
  /** Always "unregistered" here; REGISTER moves the state forward. */
  readonly registrationState: CaptureRegistrationState;
  readonly assets: readonly SpatializedCaptureAsset[];
  readonly omissions: readonly OmittedCaptureAsset[];
  readonly coverage: SpatialCoverage;
  /** Every evidence content id in the session (spatialized + omitted). */
  readonly evidenceContentIds: readonly string[];
  /** The lane derivation (provider-neutral method, declared instant). */
  readonly derivation: Derivation;
}

/* ------------------------------------------------------------------ */
/* REGISTER — the request/result                                         */
/* ------------------------------------------------------------------ */

/**
 * The registration request: the fragment to register, the anchoring
 * hypotheses (verbatim inputs — the anchoring-contract type; NEVER
 * fabricated here), and the candidate geodetic position for the site
 * anchor (the P0-A vocabulary).
 */
export interface CaptureRegistrationRequest {
  readonly fragment: SpatializedWorldFragment;
  readonly hypotheses: readonly AnchoringHypothesis[];
  readonly candidateAnchor: GeodeticPosition;
  /**
   * The declared horizontal accuracy of the candidate anchor (metres,
   * 1-sigma) — carried verbatim into the georeference when anchored.
   */
  readonly declaredAccuracyMetres: number;
  /** The declared registration instant (never a clock read). */
  readonly declaredAt: string;
}

/**
 * The typed registration result: the anchoring OUTCOME vocabulary
 * (verbatim), the registration state it maps to, the established
 * georeference (P0-A `SiteGeoreference` shape — verbatim hypothesis
 * inputs preserved in `derivedFrom`) when anchored/partial, the typed
 * reason when partial/refused, and the per-asset echoes that FAILED
 * the echo law (hypotheses naming evidence outside this fragment).
 */
export interface CaptureRegistrationResult {
  /** The anchoring outcome vocabulary — imported verbatim, never redefined. */
  readonly outcome: AnchoringOutcome;
  readonly registrationState: CaptureRegistrationState;
  /** The established georeference when anchored; the usable partial one when partial; null when refused. */
  readonly georeference: SiteGeoreference | null;
  /** Machine-readable reason on partial/refused (anchoring reason codes). */
  readonly reason: string | null;
  /** Hypotheses refused by the echo law, with the honest reason each. */
  readonly echoFailures: readonly { readonly evidenceContentId: string; readonly reason: string }[];
  /** The registered fragment (state moved forward), or the input fragment unchanged on refusal. */
  readonly fragment: SpatializedWorldFragment;
}

/* ------------------------------------------------------------------ */
/* The controlled family port (the substitution target)                  */
/* ------------------------------------------------------------------ */

/**
 * The capture-family PORT: the controlled entry point surface an app
 * composes (and the surface the in-memory substitution doubles
 * implement — see ./doubles.ts). A real reconstruction-engine adapter
 * is a future occupant: it must satisfy the SAME typed contract with
 * the SAME semantics (the substitution law), never widening authority.
 */
export interface CaptureLanePort {
  readonly portId: "layer1.capture/1";

  /** CAPTURE → SPATIALIZE: the envelope in, the fragment out. */
  spatialize(request: CaptureSpatializationRequest): import("../failures").LaneOutcome<SpatializedWorldFragment>;

  /** REGISTER: hypotheses + candidate anchor in, the verdict out. */
  register(request: CaptureRegistrationRequest): import("../failures").LaneOutcome<CaptureRegistrationResult>;
}

/** The capture-family port id (the failure-vocabulary `port` prefix). */
export const CAPTURE_LANE_PORT_ID = "layer1.capture/1" as const;

/** The per-stage port names used in typed refusals. */
export const CAPTURE_PORTS = {
  spatialize: "layer1.capture.spatialize",
  register: "layer1.capture.register",
} as const;
