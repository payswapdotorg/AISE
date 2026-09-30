/**
 * ANCHOR-001 — the spike anchoring port contract, AISE side (TypeScript).
 *
 * Status: SPIKE PROPOSAL — nothing here enters the canonical engine. This
 * module is the typed mirror of the JSON wire contract the disposable
 * provider (adapter/anchor_provider.py) answers over the process boundary
 * (stdin request / stdout response — the GBIM-001 discipline). A production
 * "Anchoring Port" Work Item would lift this into a zod-coded contract in
 * `packages/` following the `solution-contract` codec discipline; the spike
 * deliberately stays self-contained (stdlib-only, zero repo coupling) so the
 * evidence tree is removable without touching any engine/package file.
 *
 * The three laws this port enforces (charter §"Acceptance"):
 *
 *  1. No provider type crosses the canonical contract. The boundary is a
 *     PROCESS boundary; the response is JSON validated against the closed
 *     vocabulary below by aise-side/guard.ts — unknown fields are refused
 *     with the field named (neg-006 proves it).
 *  2. AISE owns identity. Evidence content ids (64-hex sha-256 content
 *     addresses — the shared-contract `contentIdSchema` shape) are supplied
 *     by AISE and echoed by the provider; hypotheses are keyed by them.
 *  3. Fail closed before anchors. The provider's gate order mirrors the
 *     AISE engine's `apply.ts` discipline: sanity → plan → method →
 *     redundancy → features → registration; every refusal is TYPED, and a
 *     refused request carries NO hypotheses (no fabricated anchors).
 *
 * Epistemic law: every hypothesis is a CANDIDATE — epistemicLabel INFERRED,
 * confidence is a declared support score (never a probability), uncertainty
 * is a first-order budget in METERS, and NOTHING enters the Reality Graph
 * (the harness writes evidence files only; the governed changes API is the
 * only production path — see ux-design-notes.md).
 */

/* ------------------------------------------------------------------ */
/* Closed vocabularies (mirrored in adapter/anchor_provider.py)        */
/* ------------------------------------------------------------------ */

export const PORT_VERSION = "anchor001-anchoring-port/1";

/** The only plan-context kind exercised by this spike. */
export const PLAN_CONTEXT_KINDS = ["plan-raster"] as const;
export type PlanContextKind = (typeof PLAN_CONTEXT_KINDS)[number];

/** The only anchoring representation exercised by this spike. */
export const ANCHORING_REPRESENTATIONS = ["plan-homography"] as const;
export type AnchoringRepresentation = (typeof ANCHORING_REPRESENTATIONS)[number];

/** Evidence acquisition methods the reference path can consume. */
export const SUPPORTED_EVIDENCE_METHODS = ["STILL_IMAGERY"] as const;
export type SupportedEvidenceMethod = (typeof SUPPORTED_EVIDENCE_METHODS)[number];

/** Whole-request outcomes. A refusal carries NO hypotheses. */
export const ANCHORING_STATUSES = ["anchored", "refused"] as const;
export type AnchoringStatus = (typeof ANCHORING_STATUSES)[number];

/** The closed refusal vocabulary (typed fail-closed states). */
export const ANCHORING_REASON_CODES = [
  "input-contract-violation",
  "plan-context-missing",
  "plan-context-unsupported",
  "representation-unsupported",
  "evidence-method-unsupported",
  "evidence-bytes-mismatch",
  "insufficient-stills",
  "insufficient-features",
  "registration-unreliable",
] as const;
export type AnchoringReasonCode = (typeof ANCHORING_REASON_CODES)[number];

/** Anchoring hypotheses are always INFERRED candidates (never CONFIRMED here). */
export const HYPOTHESIS_EPISTEMIC_LABELS = ["INFERRED"] as const;
export type HypothesisEpistemicLabel = (typeof HYPOTHESIS_EPISTEMIC_LABELS)[number];

/* ------------------------------------------------------------------ */
/* Request (AISE -> provider, stdin JSON)                             */
/* ------------------------------------------------------------------ */

export interface RasterToScene {
  /** Plan-raster scale. */
  readonly pixelsPerMeter: number;
  /** Column direction of the raster in scene terms (declared, versioned). */
  readonly xDirection: "east-right";
  /**
   * Row direction of the raster in scene terms. The HANDEDNESS LAW: a
   * north-up raster (row 0 = max scene y) shares handedness with a real
   * right-handed downward camera; a screen-convention raster (y down) is
   * MIRRORED relative to any real camera view and silently defeats every
   * orientation-covariant matcher. The convention is therefore a declared
   * contract field, never an implicit assumption (see fixture.md).
   */
  readonly yDirection: "north-up";
  /** Raster pixel whose scene coordinates are the floor origin (x=0, y=0). */
  readonly worldOriginPx: readonly [number, number];
}

export interface PlanContext {
  readonly kind: PlanContextKind;
  /** AISE-owned plan identity (an imported drawing region / floor context). */
  readonly planId: string;
  /** sha-256 content address of the plan raster bytes (64-hex). */
  readonly imageContentId: string;
  readonly imageMediaType: string;
  /** Where the AISE side pinned the plan bytes (spike-only convenience). */
  readonly bytesPath: string;
  readonly rasterToScene: RasterToScene;
}

export interface EvidenceRef {
  /** sha-256 content address of the still's bytes (64-hex). */
  readonly contentId: string;
  readonly mediaType: string;
  readonly acquisitionMethod: string;
  readonly bytesPath: string;
}

export interface AnchoringPolicy {
  readonly minKeypointsPerImage: number;
  readonly minMatchesForEstimate: number;
  readonly minInliersPerStill: number;
  readonly minStills: number;
  readonly crossValMinInliers: number;
  readonly crossValMaxResidualPx: number;
}

export interface AnchoringRequest {
  readonly schemaVersion: 1;
  readonly portVersion: typeof PORT_VERSION;
  readonly executionId: string;
  /** The fixture/request is authored in AISE-owned semantics (charter). */
  readonly authority: "AISE";
  readonly units: "SI";
  readonly planContext: PlanContext | null;
  readonly evidence: readonly EvidenceRef[];
  readonly requestedAnchoring: { readonly representation: AnchoringRepresentation | string };
  readonly policy: AnchoringPolicy;
}

/* ------------------------------------------------------------------ */
/* Response (provider -> AISE, stdout JSON)                           */
/* ------------------------------------------------------------------ */

export interface AnchoringProvenance {
  readonly providerId: string;
  readonly providerVersion: string;
  readonly opencvVersion: string;
  readonly numpyVersion: string;
  readonly pythonVersion: string;
  readonly platform: string;
  readonly inputDigest: string;
  readonly adapterSourceDigest: string;
  readonly config: Readonly<Record<string, unknown>>;
}

export interface CrossValidationEntry {
  readonly peerContentId: string;
  readonly residualRmsPx: number;
  readonly consistent: boolean;
}

export interface UncertaintyBudget {
  /** First-order 1-sigma-equivalent floor registration error, meters. */
  readonly floorRmsM: number;
  /** 95% budget (1.96 * floorRmsM), meters. */
  readonly budget95M: number;
  readonly basis: string;
}

export interface AnchoringHypothesis {
  readonly evidenceContentId: string;
  readonly representation: AnchoringRepresentation;
  readonly transform: {
    readonly frameFrom: string;
    readonly frameTo: string;
    /** Normalized 3x3 (h[2][2] === 1): plan-raster-px -> still-px. */
    readonly matrix: readonly (readonly number[])[];
  };
  readonly inlierCount: number;
  readonly matchCount: number;
  readonly inlierRatio: number;
  readonly residualRmsPx: number;
  readonly uncertainty: UncertaintyBudget;
  /** Declared support score in [0,1] — NOT a probability (see adapter-notes). */
  readonly confidence: number;
  readonly epistemicLabel: HypothesisEpistemicLabel;
  readonly crossValidation: readonly CrossValidationEntry[];
}

export interface AnchoringResponse {
  readonly schemaVersion: 1;
  readonly portVersion: string;
  readonly executionId: string;
  readonly status: AnchoringStatus;
  readonly reasonCode: AnchoringReasonCode | null;
  readonly refusalDetail?: string;
  readonly provenance: AnchoringProvenance;
  readonly hypotheses: readonly AnchoringHypothesis[];
  readonly executionTimeMs: number;
  readonly stageTimingsMs?: Readonly<Record<string, number>>;
}
