/**
 * Provider-neutral reconstruction contract (AISE-010) — the backend-local
 * mirror of `spec/reconstruction-engine-contract.md` (FROZEN, ACR-003).
 *
 * AUTHORITY DISCIPLINE (spec/architecture-lock.md "Reconstruction"):
 *
 *  - This module defines ONLY the orchestration boundary: contract types, the
 *    provider interface, request validation and the advisory evidence-method
 *    table. It contains NO algorithm-specific reconstruction logic, NO
 *    accuracy/quality claims about any engine, and NO readiness promotion —
 *    engine adapters (WorldSculpt, Atlas, ...) are AISE-012 and the assurance
 *    authority is elsewhere. Reconstruction is a replaceable evidence-
 *    processing step that produces CANDIDATE derived artifacts; AISE retains
 *    engineering meaning, provenance and uncertainty ownership.
 *  - Failure is ALWAYS explicit (`ReconstructionFailureCode`); a provider may
 *    never fail silently and the orchestrator may not silently lower any
 *    assurance target as a side effect of provider unavailability.
 *  - Epistemic labels are the contract's truth-and-uncertainty boundary: a
 *    provider MUST label generated/imaginative completion distinctly from
 *    directly observed geometry. Valid labels are preserved VERBATIM by the
 *    orchestrator (never silently upgraded); a MISSING label defaults
 *    conservatively to `UNKNOWN`; an INVALID label value is a typed
 *    `OUTPUT_INVALID` contract violation.
 *  - Determinism: request decoding is total and order-stable (issues are
 *    reported in deterministic order); no wall clock, no randomness — the
 *    orchestrator injects both.
 */

import { canonicalizeJson } from "@aise/shared-contracts";
import { sha256Hex } from "../lib/hash";

/* ------------------------------------------------------------------ */
/* Epistemic labels (spec §Imagination and generated completion)       */
/* ------------------------------------------------------------------ */

export const EPISTEMIC_LABELS = [
  "DIRECTLY_OBSERVED",
  "RECONSTRUCTED_FROM_OBSERVED_EVIDENCE",
  "INFERRED",
  "GENERATED_COMPLETION",
  "UNKNOWN",
] as const;

/** Epistemic distinction every artifact region must carry. */
export type EpistemicLabel = (typeof EPISTEMIC_LABELS)[number];

/* ------------------------------------------------------------------ */
/* Provider availability and failure semantics (spec §Failure)         */
/* ------------------------------------------------------------------ */

/**
 * The spec's provider state vocabulary. A provider is selectable ONLY in
 * `READY` state; every other value is an explicit non-usable state that the
 * selection trace records verbatim.
 */
export const PROVIDER_AVAILABILITY_STATES = [
  "READY",
  "UNAVAILABLE",
  "ACCESS_REQUIRED",
  "INPUT_INCOMPATIBLE",
  "RESOURCE_INSUFFICIENT",
  "EXECUTION_FAILED",
  "OUTPUT_INVALID",
  "QUALITY_INSUFFICIENT",
  "PARTIAL",
] as const;

export type ProviderAvailability = (typeof PROVIDER_AVAILABILITY_STATES)[number];

/**
 * Explicit failure codes (spec §Failure semantics). `PARTIAL` additionally
 * appears as a distinct outcome kind carrying the artifacts that WERE
 * produced. Failure is never silent.
 */
export const RECONSTRUCTION_FAILURE_CODES = [
  "INPUT_INCOMPATIBLE",
  "RESOURCE_INSUFFICIENT",
  "EXECUTION_FAILED",
  "OUTPUT_INVALID",
  "QUALITY_INSUFFICIENT",
  "PARTIAL",
  "UNAVAILABLE",
  "ACCESS_REQUIRED",
] as const;

export type ReconstructionFailureCode = (typeof RECONSTRUCTION_FAILURE_CODES)[number];

/* ------------------------------------------------------------------ */
/* Stable output classes (spec §Stable output classes)                 */
/* ------------------------------------------------------------------ */

export const REPRESENTATION_TYPES = [
  "mesh",
  "point_cloud",
  "depth_maps",
  "camera_poses",
  "gaussian_splat",
  "novel_view_images",
  "novel_view_video",
  "per_object_geometry",
  "semantic_candidates",
  "provider_native_metadata",
] as const;

export type RepresentationType = (typeof REPRESENTATION_TYPES)[number];

/** Input modalities a provider can consume as evidence. */
export const INPUT_MODALITIES = [
  "still_image",
  "video",
  "depth_map",
  "point_cloud",
  "camera_poses",
  "imu",
  "reference_measurements",
] as const;

export type InputModality = (typeof INPUT_MODALITIES)[number];

/* ------------------------------------------------------------------ */
/* Advisory evidence-method → input-modality table                     */
/* ------------------------------------------------------------------ */

/**
 * ADVISORY ONLY (AISE-010): maps evidence acquisition methods (the evidence
 * service's method vocabulary) to reconstruction input modalities so the
 * orchestrator can characterize a request's evidence and hint at remediation.
 * This table is a static orchestration-side hint, NOT an authoritative
 * evidence-method catalogue — the evidence service owns evidence semantics.
 * Methods that provide no reconstruction input (HUMAN_ANSWER,
 * DOCUMENT_REGION) are deliberately unmapped.
 */
export const METHOD_TO_MODALITY: Readonly<Record<string, InputModality>> = {
  STILL_IMAGERY: "still_image",
  VIDEO_FOOTAGE: "video",
  DEPTH_SENSING: "depth_map",
  VISUAL_RECONSTRUCTION: "point_cloud",
  CALIBRATED_REFERENCE: "reference_measurements",
  MANUAL_MEASUREMENT: "reference_measurements",
  SPECIALIST_INSTRUMENT: "reference_measurements",
  INSTRUMENT_READING: "reference_measurements",
};

/** Inverse of the advisory table: which methods provide one modality (sorted). */
export function methodsForModality(modality: InputModality): string[] {
  const methods: string[] = [];
  for (const [method, mapped] of Object.entries(METHOD_TO_MODALITY)) {
    if (mapped === modality) {
      methods.push(method);
    }
  }
  return methods.sort();
}

/** Derive one evidence summary's input modality (method table, then media type). */
export function modalityOfEvidence(summary: EvidenceSummary): InputModality | null {
  const byMethod = METHOD_TO_MODALITY[summary.method];
  if (byMethod !== undefined) {
    return byMethod;
  }
  if (summary.mediaType.startsWith("image/")) {
    return "still_image";
  }
  if (summary.mediaType.startsWith("video/")) {
    return "video";
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Evidence reader (minimal, injected)                                 */
/* ------------------------------------------------------------------ */

/**
 * Minimal read-only evidence view the orchestrator needs for input
 * characterization. Production wiring adapts the AISE-008 evidence service
 * (`evidenceServiceReader` in `orchestrator.ts`); tests inject stubs. `null`
 * means the content id has no registered evidence record.
 */
export interface EvidenceSummary {
  readonly mediaType: string;
  readonly method: string;
  readonly invalidated: boolean;
}

export interface EvidenceReader {
  getEvidence(contentId: string): Promise<EvidenceSummary | null>;
}

/* ------------------------------------------------------------------ */
/* Provider descriptor (spec §Provider descriptor)                     */
/* ------------------------------------------------------------------ */

/**
 * Required fields participate in selection (availability, output/input
 * capability); every other spec-declared field is carried VERBATIM for
 * provenance and later work items (benchmarking, costing, licensing) and is
 * deliberately NEVER used by AISE-010 selection.
 */
export interface ProviderDescriptor {
  readonly providerId: string;
  readonly providerVersion: string;
  readonly adapterVersion: string;
  readonly supportedInputModalities: readonly InputModality[];
  readonly supportedOutputModalities: readonly RepresentationType[];
  readonly availability: ProviderAvailability;
  /** Spec-declared provenance metadata (carried, not interpreted). */
  readonly requiredInputMetadata?: readonly string[];
  readonly coordinateFrames?: readonly string[];
  readonly scaleModes?: readonly string[];
  readonly sceneCapabilities?: readonly string[];
  readonly objectCapabilities?: readonly string[];
  readonly uncertaintyCapabilities?: readonly string[];
  readonly executionRequirements?: Readonly<Record<string, string>>;
  readonly networkAccessRequirements?: Readonly<Record<string, string>>;
  readonly licenseTerms?: Readonly<Record<string, string>>;
  readonly costLatencyCharacteristics?: Readonly<Record<string, string>>;
  readonly benchmarkProfile?: Readonly<Record<string, unknown>>;
}

/* ------------------------------------------------------------------ */
/* Request (spec §Request — the AISE-010 subset)                       */
/* ------------------------------------------------------------------ */

/**
 * Request subset owned by AISE-010: evidence references, requested
 * representations, coordinate/scale constraints and policy constraints.
 * Assurance profiles, spatial scope and device metadata belong to later work
 * items and are intentionally NOT modeled here (no readiness coupling).
 */
export interface ReconstructionPolicyConstraints {
  /** Declared execution-timeout policy. The deterministic core starts NO
   *  timers — the value is carried to the provider and recorded. */
  readonly timeoutMs: number;
  /** Additional attempts after the first (0 = single attempt). */
  readonly maxRetries: number;
}

export interface ReconstructionRequest {
  readonly taskId: string;
  readonly evidenceContentIds: readonly string[];
  readonly captureSessionId: string | null;
  readonly requestedRepresentations: readonly RepresentationType[];
  /** Caller declaration of the evidence's input modalities — used ONLY when
   *  no evidence reader is wired (structural characterization). */
  readonly declaredInputModalities: readonly InputModality[] | null;
  readonly coordinateFrameConstraint: string | null;
  readonly scaleConstraint: string | null;
  readonly policyConstraints: ReconstructionPolicyConstraints;
}

/* ------------------------------------------------------------------ */
/* Candidate artifact envelope (spec §Result, normalized)             */
/* ------------------------------------------------------------------ */

/** One declared transform (kind + verbatim parameters, canonically stored). */
export interface TransformDeclaration {
  readonly kind: string;
  readonly parameters: Readonly<Record<string, unknown>>;
}

/** One artifact region with its mandatory epistemic label. */
export interface ArtifactRegion {
  readonly regionId: string;
  readonly epistemicLabel: EpistemicLabel;
  readonly note: string | null;
}

/**
 * A provider's per-artifact output BEFORE orchestration assigns identity
 * (artifactId, version, provenance snapshot). Region labels may be omitted —
 * the orchestrator defaults them conservatively to `UNKNOWN`.
 */
export interface ProviderArtifactOutput {
  readonly representationType: RepresentationType;
  readonly sourceEvidenceIds?: readonly string[];
  readonly modelIdentity?: string;
  readonly parameters?: Readonly<Record<string, unknown>>;
  readonly parameterDigest?: string;
  readonly coordinateFrame: string;
  readonly transforms?: readonly TransformDeclaration[];
  readonly scaleDeclaration?: string;
  readonly regions?: readonly ProviderRegionOutput[];
  readonly qualityDiagnostics?: Readonly<Record<string, unknown>>;
  readonly limitations?: readonly string[];
}

export interface ProviderRegionOutput {
  readonly regionId?: string;
  readonly epistemicLabel?: string;
  readonly note?: string;
}

/**
 * The immutable, append-only candidate artifact record (content-addressed by
 * the store). Carries the full provenance the architecture lock demands:
 * source evidence, provider identity/version, parameter digest, coordinate
 * frame, transforms, scale and per-region epistemic labels.
 */
export interface CandidateArtifact {
  readonly artifactId: string;
  readonly jobId: string;
  /** Version within this job for the same representation type (1-based). */
  readonly version: number;
  readonly representationType: RepresentationType;
  readonly sourceEvidenceIds: readonly string[];
  readonly providerId: string;
  readonly providerVersion: string;
  readonly adapterVersion: string;
  readonly modelIdentity: string | null;
  readonly parameterDigest: string;
  readonly coordinateFrame: string;
  readonly transforms: readonly TransformDeclaration[];
  readonly scaleDeclaration: string | null;
  readonly regions: readonly ArtifactRegion[];
  readonly qualityDiagnostics: Readonly<Record<string, unknown>> | null;
  readonly limitations: readonly string[];
  readonly createdAt: string;
}

/* ------------------------------------------------------------------ */
/* Outcome (spec §Result / §Failure semantics)                         */
/* ------------------------------------------------------------------ */

export type ReconstructionOutcome =
  | { readonly kind: "success"; readonly artifacts: readonly ProviderArtifactOutput[] }
  | { readonly kind: "partial"; readonly artifacts: readonly ProviderArtifactOutput[]; readonly detail: string }
  | {
      readonly kind: "failure";
      readonly code: Exclude<ReconstructionFailureCode, "PARTIAL">;
      readonly detail: string;
      readonly missingEvidenceIds?: readonly string[];
    };

/** The provider contract: a descriptor plus an explicit-outcome executor. */
export interface ReconstructionProvider {
  readonly descriptor: ProviderDescriptor;
  execute(request: ReconstructionRequest): Promise<ReconstructionOutcome>;
}

/* ------------------------------------------------------------------ */
/* Request validation (total, deterministic)                           */
/* ------------------------------------------------------------------ */

export type ReconstructionRequestDecode =
  | { readonly ok: true; readonly request: ReconstructionRequest }
  | { readonly ok: false; readonly issues: string[] };

const CONTENT_ID_PATTERN = /^[0-9a-f]{64}$/;
const REQUEST_FIELDS = [
  "taskId",
  "evidenceContentIds",
  "captureSessionId",
  "requestedRepresentations",
  "declaredInputModalities",
  "coordinateFrameConstraint",
  "scaleConstraint",
  "policyConstraints",
] as const;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isIntegerInRange(value: unknown, min: number, max: number): boolean {
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;
}

/**
 * Structural validation of a full `ReconstructionRequest` (taskId included).
 * Issues are deterministic: unknown fields are reported sorted; every other
 * issue is reported in field order. Used by the router (400 mapping) and
 * re-run defensively by the orchestrator (`invalid_request`).
 */
export function decodeReconstructionRequest(value: unknown): ReconstructionRequestDecode {
  const issues: string[] = [];
  if (!isPlainObject(value)) {
    return { ok: false, issues: ["request must be a JSON object"] };
  }
  const unknownFields = Object.keys(value)
    .filter((key) => !(REQUEST_FIELDS as readonly string[]).includes(key))
    .sort();
  for (const key of unknownFields) {
    issues.push(`unknown field '${key}'`);
  }

  const taskId = value.taskId;
  if (typeof taskId !== "string" || taskId.length === 0) {
    issues.push("taskId must be a non-empty string");
  }

  const evidenceContentIds = value.evidenceContentIds;
  if (!Array.isArray(evidenceContentIds) || evidenceContentIds.length === 0) {
    issues.push("evidenceContentIds must be an array with at least one content id");
  } else {
    const seen = new Set<string>();
    for (const id of evidenceContentIds) {
      if (typeof id !== "string" || !CONTENT_ID_PATTERN.test(id)) {
        issues.push("evidenceContentIds entries must be 64 lowercase hex content ids");
        break;
      }
      if (seen.has(id)) {
        issues.push(`duplicate evidence content id '${id}'`);
        break;
      }
      seen.add(id);
    }
  }

  const captureSessionId = value.captureSessionId ?? null;
  if (captureSessionId !== null && (typeof captureSessionId !== "string" || captureSessionId.length === 0)) {
    issues.push("captureSessionId must be a non-empty string when present");
  }

  const requestedRepresentations = value.requestedRepresentations;
  if (!Array.isArray(requestedRepresentations) || requestedRepresentations.length === 0) {
    issues.push("requestedRepresentations must be an array with at least one representation type");
  } else {
    const seen = new Set<string>();
    for (const representation of requestedRepresentations) {
      if (!(REPRESENTATION_TYPES as readonly string[]).includes(representation)) {
        issues.push(`requestedRepresentations contains unknown representation type '${String(representation)}'`);
        break;
      }
      if (seen.has(representation)) {
        issues.push(`duplicate requested representation '${representation}'`);
        break;
      }
      seen.add(representation);
    }
  }

  const declared = value.declaredInputModalities ?? null;
  if (declared !== null) {
    if (!Array.isArray(declared)) {
      issues.push("declaredInputModalities must be an array when present");
    } else {
      const seen = new Set<string>();
      for (const modality of declared) {
        if (!(INPUT_MODALITIES as readonly string[]).includes(modality)) {
          issues.push(`declaredInputModalities contains unknown modality '${String(modality)}'`);
          break;
        }
        if (seen.has(modality)) {
          issues.push(`duplicate declared input modality '${modality}'`);
          break;
        }
        seen.add(modality);
      }
    }
  }

  for (const field of ["coordinateFrameConstraint", "scaleConstraint"] as const) {
    const constraint = value[field] ?? null;
    if (constraint !== null && (typeof constraint !== "string" || constraint.length === 0)) {
      issues.push(`${field} must be a non-empty string when present`);
    }
  }

  const policy = value.policyConstraints;
  if (!isPlainObject(policy)) {
    issues.push("policyConstraints must be an object with timeoutMs and maxRetries");
  } else {
    for (const key of Object.keys(policy).sort()) {
      if (key !== "timeoutMs" && key !== "maxRetries") {
        issues.push(`policyConstraints has unknown field '${key}'`);
      }
    }
    if (!isIntegerInRange(policy.timeoutMs, 1, Number.MAX_SAFE_INTEGER)) {
      issues.push("policyConstraints.timeoutMs must be a positive integer");
    }
    if (!isIntegerInRange(policy.maxRetries, 0, 1000)) {
      issues.push("policyConstraints.maxRetries must be an integer between 0 and 1000");
    }
  }

  if (issues.length > 0) {
    return { ok: false, issues };
  }

  return {
    ok: true,
    request: {
      taskId: taskId as string,
      evidenceContentIds: [...(evidenceContentIds as string[])],
      captureSessionId: captureSessionId as string | null,
      requestedRepresentations: [...(requestedRepresentations as RepresentationType[])],
      declaredInputModalities: declared === null ? null : [...(declared as InputModality[])],
      coordinateFrameConstraint: (value.coordinateFrameConstraint ?? null) as string | null,
      scaleConstraint: (value.scaleConstraint ?? null) as string | null,
      policyConstraints: {
        timeoutMs: (policy as Record<string, unknown>).timeoutMs as number,
        maxRetries: (policy as Record<string, unknown>).maxRetries as number,
      },
    },
  };
}

/**
 * Deterministic digest over a provider's declared parameters: sha-256 of the
 * compact canonical JSON (sorted keys). The empty parameter set digests "{}".
 */
export function parameterDigestOf(parameters: Readonly<Record<string, unknown>>): string {
  return sha256Hex(JSON.stringify(canonicalizeJson(parameters)));
}
