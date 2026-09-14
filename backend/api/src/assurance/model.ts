/**
 * AISE-022 — Assurance/readiness v2: the module MODEL.
 *
 * AUTHORITY (spec/architecture-lock.md "Adaptive evidence"; AGENTS.md "never
 * create a second … readiness authority"): THIS module is the single
 * server-side readiness authority. Profiles are CODE-DEFINED and versioned
 * (`assurance-1`); the wire contract's `AssuranceTarget.assuranceProfileRef`
 * (packages/shared-contracts/src/mission.ts) references these profiles by id
 * — the contract deliberately carries "statement + reference only, no
 * thresholds", because thresholds live HERE, never on a client.
 *
 * FROZEN INVARIANTS enforced by this module (lock "Capability-aware
 * acquisition" + "Critical assurance"):
 *
 *  1. Engineering assurance requirements are INDEPENDENT of device
 *     capability. A `DeviceProfile` may only ANNOTATE remediation hints on
 *     gaps; it can never alter a requirement, a dimension outcome or the
 *     aggregate verdict. A weak device NEVER lowers the bar — it produces
 *     NOT_READY/INSUFFICIENT_DATA plus escalation-oriented hints, never
 *     "ready enough for this device".
 *  2. Readiness is recomputable from evidence/model state ONLY
 *     (`EvaluationInput` is a projection of the Reality Graph (AISE-016) and
 *     Evidence Graph (AISE-008)); hidden client assertions are structurally
 *     absent from the input shape.
 *  3. Fail-closed: a critical dimension that is `not_satisfied` yields
 *     NOT_READY; a critical dimension that is `insufficient_data` yields
 *     INSUFFICIENT_DATA — unknown is NEVER ready. A dimension evaluator can
 *     never silently default to `satisfied` (unknown requirement kinds are
 *     typed `invalid_profile` errors, and the runtime switch is exhaustive).
 *
 * RECOMPUTABILITY — fact mapping (documented contract with 016/008):
 *
 *  - `NodeFact` is a projection of one RealityGraph version snapshot
 *    (AISE-016 `RealityNode`): `nodeId` ← `RealityNode.nodeId` (caller
 *    stable id), `properties` ← `PropertyRecord` { key, value, unit,
 *    epistemicStatus }. `PropertyFact.uncertainty` (1σ) is NOT carried by
 *    `PropertyRecord`; the caller projects it from the property's
 *    shared-contracts `PropertyAssertion.uncertainty` (STATISTICAL/DIMENSIONAL
 *    ±, or a derivation with an explicit basis). The evaluator CONSUMES σ,
 *    it never estimates or fabricates it (lock "Truth and uncertainty").
 *  - `EvidenceFact` is a projection of the Evidence Graph (AISE-008):
 *    `evidenceId` ← evidence content id, `method` ← evidence method,
 *    `invalidated` ← evidence invalidation state, `linkedNodeIds` ← the
 *    provenance subject links (which reality nodes the evidence supports).
 *    Evidence may link to node ids not present in the snapshot (evidence may
 *    precede modeling — symmetric with AISE-016's observation rule); such
 *    links simply do not contribute to coverage.
 *
 * DETERMINISM: no clock, no randomness, no timestamps in reports (callers
 * stamp externally); canonical serialization is the shared
 * `canonicalJsonStringify`. Fact order in the input is irrelevant (facts are
 * deterministically sorted before the evaluation fold).
 */

import {
  EPISTEMIC_STATUSES,
  EVIDENCE_METHODS,
  type EpistemicStatus,
  type EvidenceMethod,
} from "@aise/shared-contracts";
import { EPISTEMIC_RANK } from "../reality/model";

/* ------------------------------------------------------------------ */
/* Profiles (versioned, code-defined)                                  */
/* ------------------------------------------------------------------ */

/** Task kinds that have a shipped assurance profile. */
export const TASK_KINDS = [
  "dimensional_survey",
  "condition_inspection",
  "as_built_model",
] as const;
export type TaskKind = (typeof TASK_KINDS)[number];

/** Profile schema version (bump = governed change to readiness semantics). */
export const ASSURANCE_PROFILE_VERSION = "assurance-1" as const;

/**
 * A requirement pinned to a closed set of kinds. THE BAR: evaluated
 * verbatim; identical for every device; never lowered, never widened.
 */
export type Requirement =
  | {
      readonly kind: "evidence_sufficiency";
      /** Evidence method that counts toward the requirement. */
      readonly method: EvidenceMethod;
      /** Minimum count of VALID (non-invalidated) evidence items of `method`. */
      readonly minCount: number;
    }
  | {
      readonly kind: "uncertainty_bound";
      /** Property key whose every numeric assertion must carry σ ≤ `maxSigma`. */
      readonly propertyKey: string;
      /** Maximum allowed 1σ, expressed in `unit`. */
      readonly maxSigma: number;
      readonly unit: string;
    }
  | {
      readonly kind: "coverage";
      /**
       * Minimum fraction of snapshot nodes that must carry at least one
       * valid linked evidence item (see `CoverageBasis`).
       */
      readonly minCoverageFraction: number;
    }
  | {
      readonly kind: "epistemic_floor";
      /** Minimum epistemic status for every listed property key. */
      readonly minEpistemicStatus: "OBSERVED" | "CONFIRMED";
      readonly propertyKeys: readonly string[];
    };

export const REQUIREMENT_KINDS = [
  "evidence_sufficiency",
  "uncertainty_bound",
  "coverage",
  "epistemic_floor",
] as const;
export type RequirementKind = (typeof REQUIREMENT_KINDS)[number];

/** One readiness dimension of a profile. */
export interface ReadinessDimension {
  readonly dimensionId: string;
  readonly description: string;
  readonly requirement: Requirement;
  /**
   * ADVISORY ONLY (0…1): consumer-side gap prioritization metadata. NEVER
   * consulted by verdict logic — a weight change can never change any
   * outcome or the aggregate (tested).
   */
  readonly weight?: number;
  /** Critical dimensions gate the aggregate fail-closed (see evaluate.ts). */
  readonly critical: boolean;
}

/** The versioned, code-defined readiness authority document. */
export interface AssuranceProfile {
  readonly profileId: string;
  readonly version: typeof ASSURANCE_PROFILE_VERSION;
  readonly taskKind: TaskKind;
  readonly dimensions: readonly ReadinessDimension[];
}

/* ------------------------------------------------------------------ */
/* Evaluation input (recomputable state — never client assertions)     */
/* ------------------------------------------------------------------ */

/** 1σ measurement uncertainty attached to a property fact, in the property's own unit. */
export interface PropertyUncertainty {
  readonly sigma: number;
  /** How this σ was obtained (provenance note; carried for audit, not evaluated). */
  readonly basis?: string;
}

/** A property assertion projected from the Reality Graph (see module header). */
export interface PropertyFact {
  readonly key: string;
  readonly value: string | number | boolean;
  /** REQUIRED discipline for numeric values (AISE-016 units rule). */
  readonly unit?: string;
  readonly epistemicStatus: EpistemicStatus;
  /** ABSENT σ is UNKNOWN, never 0 (frozen rule — see UncertaintyBoundBasis). */
  readonly uncertainty?: PropertyUncertainty;
}

export interface NodeFact {
  readonly nodeId: string;
  readonly properties: readonly PropertyFact[];
}

export interface EvidenceFact {
  readonly evidenceId: string;
  readonly method: EvidenceMethod;
  readonly invalidated: boolean;
  readonly linkedNodeIds: readonly string[];
}

/**
 * Device capability as STRUCTURED FACTS (lock: "not one opaque score").
 * Values are free-form strings interpreted against
 * `CAPABILITY_FACT_LEVELS` (normalized: lowercase, trimmed). Anything else —
 * including a missing fact — is "undetermined" and is NEVER collapsed to
 * "unavailable" or "available" (planner-aligned frozen rule).
 */
export interface DeviceProfile {
  readonly capabilityFacts: Readonly<Record<string, string>>;
}

export interface GraphSnapshotFact {
  readonly nodes: readonly NodeFact[];
}

/** The ONLY input readiness is computed from. */
export interface EvaluationInput {
  readonly profile: AssuranceProfile;
  readonly graphSnapshot: GraphSnapshotFact;
  readonly evidence: readonly EvidenceFact[];
  readonly deviceProfile?: DeviceProfile;
}

/* ------------------------------------------------------------------ */
/* Reports                                                              */
/* ------------------------------------------------------------------ */

export const DIMENSION_OUTCOME_LEVELS = [
  "satisfied",
  "not_satisfied",
  "insufficient_data",
] as const;
export type DimensionOutcomeLevel = (typeof DIMENSION_OUTCOME_LEVELS)[number];

export const READINESS_LEVELS = [
  "READY",
  "READY_WITH_NOTES",
  "NOT_READY",
  "INSUFFICIENT_DATA",
] as const;
export type ReadinessLevel = (typeof READINESS_LEVELS)[number];

/** Measured basis for an evidence_sufficiency dimension. */
export interface EvidenceSufficiencyBasis {
  readonly kind: "evidence_sufficiency";
  readonly method: EvidenceMethod;
  readonly requiredCount: number;
  readonly validCount: number;
  readonly invalidCount: number;
}

/** Measured basis for an uncertainty_bound dimension. */
export interface UncertaintyBoundBasis {
  readonly kind: "uncertainty_bound";
  readonly propertyKey: string;
  readonly requiredUnit: string;
  /** All property facts asserting `propertyKey` in the snapshot. */
  readonly assertionCount: number;
  readonly numericAssertionCount: number;
  readonly sigmaReportedCount: number;
  readonly unitConsistentCount: number;
  /** Max σ among unit-consistent numeric assertions; null when none measurable. */
  readonly maxMeasuredSigma: number | null;
}

/** Measured basis for a coverage dimension. */
export interface CoverageBasis {
  readonly kind: "coverage";
  readonly minCoverageFraction: number;
  readonly nodesTotal: number;
  readonly nodesCovered: number;
  readonly measuredCoverageFraction: number | null;
}

/** Per-key measured basis for an epistemic_floor dimension. */
export interface EpistemicKeyBasis {
  readonly propertyKey: string;
  readonly assertionCount: number;
  /** Minimum epistemic status across assertions (worst governs); null = key absent. */
  readonly minMeasuredStatus: EpistemicStatus | null;
}

/** Measured basis for an epistemic_floor dimension. */
export interface EpistemicFloorBasis {
  readonly kind: "epistemic_floor";
  readonly minEpistemicStatus: "OBSERVED" | "CONFIRMED";
  readonly propertyKeys: readonly string[];
  readonly perKey: readonly EpistemicKeyBasis[];
}

export type DimensionBasis =
  | EvidenceSufficiencyBasis
  | UncertaintyBoundBasis
  | CoverageBasis
  | EpistemicFloorBasis;

/** Stable deficiency codes (basis + remediation feed the 018 gap engine). */
export const DIMENSION_DEFICIENCY_CODES = [
  "evidence_count_shortfall",
  "no_evidence_recorded",
  "sigma_above_bound",
  "non_numeric_property",
  "property_absent",
  "sigma_not_reported",
  "sigma_unit_missing",
  "sigma_unit_mismatch",
  "coverage_shortfall",
  "no_modeled_nodes",
  "epistemic_status_below_floor",
  "missing_property",
] as const;
export type DimensionDeficiencyCode = (typeof DIMENSION_DEFICIENCY_CODES)[number];

/**
 * Why a dimension is not satisfied. `measured_failure` = a measured,
 * numeric deficiency (carries `shortfall` when computable);
 * `unknown_data` = the measurand is absent/unknown (fail-closed, never a guess).
 */
export interface DimensionDeficiency {
  readonly code: DimensionDeficiencyCode;
  readonly kind: "measured_failure" | "unknown_data";
  readonly message: string;
  readonly shortfall?: number;
}

export interface DimensionOutcome {
  readonly dimensionId: string;
  readonly critical: boolean;
  /** Advisory echo of `ReadinessDimension.weight` (never used in verdicts). */
  readonly weight?: number;
  readonly outcome: DimensionOutcomeLevel;
  readonly basis: DimensionBasis;
  readonly deficiency?: DimensionDeficiency;
}

/** What would satisfy the dimension's requirement (the bar restated). */
export type Remediation =
  | {
      readonly kind: "evidence_sufficiency";
      readonly method: EvidenceMethod;
      readonly requiredCount: number;
      readonly validCount: number;
      readonly additionalCountNeeded: number;
    }
  | {
      readonly kind: "uncertainty_bound";
      readonly propertyKey: string;
      readonly requiredMaxSigma: number;
      readonly unit: string;
      readonly currentMaxSigma: number | null;
    }
  | {
      readonly kind: "coverage";
      readonly minCoverageFraction: number;
      readonly measuredCoverageFraction: number | null;
    }
  | {
      readonly kind: "epistemic_floor";
      readonly minEpistemicStatus: "OBSERVED" | "CONFIRMED";
      readonly unsatisfiedPropertyKeys: readonly string[];
    };

/** A capability fact actually consulted while building a device hint. */
export interface CapabilityFact {
  readonly key: string;
  readonly value: string;
}

export const METHOD_PLAUSIBILITY_LEVELS = [
  "available",
  "degraded",
  "unavailable",
  "undetermined",
] as const;
export type MethodPlausibilityLevel = (typeof METHOD_PLAUSIBILITY_LEVELS)[number];

export interface MethodPlausibility {
  readonly method: EvidenceMethod;
  readonly plausibility: MethodPlausibilityLevel;
}

/**
 * Device-aware remediation ANNOTATION (the no-downgrade surface). Attached
 * to evidence-method gaps when the input carries a `DeviceProfile`. This is
 * advisory text for the 018 evidence-gap engine / operator guidance — it is
 * NEVER consulted by dimension evaluation or the aggregate, and the
 * remediation requirement above is byte-identical with or without it.
 */
export interface DeviceRemediationHint {
  readonly requiredMethod: EvidenceMethod;
  readonly requiredMethodPlausibility: MethodPlausibilityLevel;
  readonly consultedCapabilityFacts: readonly CapabilityFact[];
  readonly alternativeMethods: readonly MethodPlausibility[];
  readonly note: string;
}

/** An actionable gap for one unsatisfied/insufficient dimension. */
export interface ReadinessGap {
  readonly gapId: string;
  readonly dimensionId: string;
  readonly critical: boolean;
  /** The requirement VERBATIM — the bar never changes with the device. */
  readonly requirement: Requirement;
  readonly remediation: Remediation;
  readonly deviceHint?: DeviceRemediationHint;
}

/** Deterministic, timestamp-free readiness report (canonical-JSON serializable). */
export interface ReadinessReport {
  readonly profileId: string;
  readonly profileVersion: string;
  readonly taskKind: TaskKind;
  readonly readiness: ReadinessLevel;
  readonly dimensions: readonly DimensionOutcome[];
  readonly gaps: readonly ReadinessGap[];
}

/* ------------------------------------------------------------------ */
/* Device capability vocabulary (annotation-only; module-owned)         */
/* ------------------------------------------------------------------ */

/**
 * The capability fact key consulted per evidence method when annotating
 * remediation hints. Facts are coarse structured strings; unknown values
 * stay "undetermined" — never collapsed to unavailable.
 */
export const METHOD_CAPABILITY_FACT_KEYS: Readonly<Record<EvidenceMethod, string>> = {
  DEPTH_SENSING: "capability.depth_sensing",
  VISUAL_RECONSTRUCTION: "capability.visual_reconstruction",
  CALIBRATED_REFERENCE: "capability.calibrated_reference",
  MANUAL_MEASUREMENT: "capability.manual_measurement",
  SPECIALIST_INSTRUMENT: "capability.specialist_instrument",
  VIDEO_FOOTAGE: "capability.video_footage",
  STILL_IMAGERY: "capability.still_imagery",
  INSTRUMENT_READING: "capability.instrument_reading",
  HUMAN_ANSWER: "capability.human_answer",
  DOCUMENT_REGION: "capability.document_region",
};

/** Recognized capability fact values (normalized lowercase/trimmed). */
export const CAPABILITY_FACT_LEVELS = ["available", "degraded", "unavailable"] as const;
export type CapabilityFactLevel = (typeof CAPABILITY_FACT_LEVELS)[number];

/**
 * HINT-ONLY substitution candidates per method (lock: "A weaker device may
 * require more operator evidence or a specialist instrument"). These are
 * remediation SUGGESTIONS for the operator / 018 engine — closing a gap via
 * a substitution requires a governed profile change (new profile version),
 * never a silent requirement rewrite.
 */
export const METHOD_REMEDIATION_ALTERNATIVES: Readonly<
  Partial<Record<EvidenceMethod, readonly EvidenceMethod[]>>
> = {
  DEPTH_SENSING: ["CALIBRATED_REFERENCE", "MANUAL_MEASUREMENT", "SPECIALIST_INSTRUMENT"],
  VISUAL_RECONSTRUCTION: ["CALIBRATED_REFERENCE", "MANUAL_MEASUREMENT"],
  CALIBRATED_REFERENCE: ["MANUAL_MEASUREMENT", "SPECIALIST_INSTRUMENT"],
  MANUAL_MEASUREMENT: ["SPECIALIST_INSTRUMENT"],
  SPECIALIST_INSTRUMENT: ["CALIBRATED_REFERENCE", "MANUAL_MEASUREMENT"],
  VIDEO_FOOTAGE: ["STILL_IMAGERY", "MANUAL_MEASUREMENT"],
  STILL_IMAGERY: ["VIDEO_FOOTAGE", "MANUAL_MEASUREMENT"],
  INSTRUMENT_READING: ["SPECIALIST_INSTRUMENT", "HUMAN_ANSWER"],
  DOCUMENT_REGION: ["HUMAN_ANSWER"],
};

/** Normalize a capability fact value to a plausibility level. */
export function normalizeCapabilityFactLevel(value: string): MethodPlausibilityLevel {
  const normalized = value.trim().toLowerCase();
  return (CAPABILITY_FACT_LEVELS as readonly string[]).includes(normalized)
    ? (normalized as CapabilityFactLevel)
    : "undetermined";
}

/* ------------------------------------------------------------------ */
/* Typed errors (stable codes)                                          */
/* ------------------------------------------------------------------ */

export const ASSURANCE_ERROR_CODES = ["invalid_profile", "invalid_input"] as const;
export type AssuranceErrorCode = (typeof ASSURANCE_ERROR_CODES)[number];

/** Fail-closed typed error: malformed profiles/inputs NEVER evaluate to satisfied. */
export class AssuranceError extends Error {
  readonly code: AssuranceErrorCode;
  readonly details: readonly string[];

  constructor(code: AssuranceErrorCode, message: string, details: readonly string[] = []) {
    super(details.length > 0 ? `${message} (${details.join("; ")})` : message);
    this.name = "AssuranceError";
    this.code = code;
    this.details = details;
  }
}

/* ------------------------------------------------------------------ */
/* Runtime validation (single path for in-process and wire JSON)        */
/* ------------------------------------------------------------------ */

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.length > 0;
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isEpistemicStatus(v: unknown): v is EpistemicStatus {
  return typeof v === "string" && (EPISTEMIC_STATUSES as readonly string[]).includes(v);
}

function isEvidenceMethod(v: unknown): v is EvidenceMethod {
  return typeof v === "string" && (EVIDENCE_METHODS as readonly string[]).includes(v);
}

/**
 * Validate an assurance profile (defends evaluation against JSON-loaded or
 * hand-built profiles). THE never-silently-satisfied guard: an unknown
 * requirement kind is a typed `invalid_profile` error, never a pass.
 */
export function validateAssuranceProfile(profile: unknown): AssuranceProfile {
  const fail = (details: readonly string[]): AssuranceError =>
    new AssuranceError("invalid_profile", "malformed assurance profile", details);
  if (!isPlainObject(profile)) throw fail(["profile must be an object"]);
  const details: string[] = [];
  if (!isNonEmptyString(profile.profileId)) details.push("profileId must be a non-empty string");
  if (profile.version !== ASSURANCE_PROFILE_VERSION) {
    details.push(`version must be "${ASSURANCE_PROFILE_VERSION}"`);
  }
  if (!(TASK_KINDS as readonly string[]).includes(profile.taskKind as string)) {
    details.push(`taskKind must be one of ${TASK_KINDS.join("|")}`);
  }
  if (!Array.isArray(profile.dimensions) || profile.dimensions.length === 0) {
    details.push("dimensions must be a non-empty array");
  }
  if (details.length > 0) throw fail(details);

  const dims = profile.dimensions as readonly unknown[];
  const seenIds = new Set<string>();
  dims.forEach((dim, index) => {
    const at = `dimensions[${index}]`;
    if (!isPlainObject(dim)) {
      details.push(`${at}: must be an object`);
      return;
    }
    if (!isNonEmptyString(dim.dimensionId)) details.push(`${at}.dimensionId must be a non-empty string`);
    if (isNonEmptyString(dim.dimensionId)) {
      if (seenIds.has(dim.dimensionId)) details.push(`${at}: duplicate dimensionId "${dim.dimensionId}"`);
      seenIds.add(dim.dimensionId);
    }
    if (!isNonEmptyString(dim.description)) details.push(`${at}.description must be a non-empty string`);
    if (typeof dim.critical !== "boolean") details.push(`${at}.critical must be a boolean`);
    if (dim.weight !== undefined && !(isFiniteNumber(dim.weight) && dim.weight >= 0 && dim.weight <= 1)) {
      details.push(`${at}.weight must be a number in [0,1] when present`);
    }
    const req = dim.requirement;
    if (!isPlainObject(req)) {
      details.push(`${at}.requirement must be an object`);
      return;
    }
    switch (req.kind) {
      case "evidence_sufficiency": {
        if (!isEvidenceMethod(req.method)) {
          details.push(`${at}.requirement.method must be one of ${EVIDENCE_METHODS.join("|")}`);
        }
        if (!(Number.isInteger(req.minCount) && (req.minCount as number) >= 1)) {
          details.push(`${at}.requirement.minCount must be an integer >= 1`);
        }
        break;
      }
      case "uncertainty_bound": {
        if (!isNonEmptyString(req.propertyKey)) details.push(`${at}.requirement.propertyKey must be a non-empty string`);
        if (!(isFiniteNumber(req.maxSigma) && (req.maxSigma as number) > 0)) {
          details.push(`${at}.requirement.maxSigma must be a finite number > 0`);
        }
        if (!isNonEmptyString(req.unit)) details.push(`${at}.requirement.unit must be a non-empty string`);
        break;
      }
      case "coverage": {
        if (
          !(
            isFiniteNumber(req.minCoverageFraction) &&
            (req.minCoverageFraction as number) > 0 &&
            (req.minCoverageFraction as number) <= 1
          )
        ) {
          details.push(`${at}.requirement.minCoverageFraction must be a number in (0,1]`);
        }
        break;
      }
      case "epistemic_floor": {
        if (req.minEpistemicStatus !== "OBSERVED" && req.minEpistemicStatus !== "CONFIRMED") {
          details.push(`${at}.requirement.minEpistemicStatus must be OBSERVED or CONFIRMED`);
        }
        if (!Array.isArray(req.propertyKeys) || req.propertyKeys.length === 0) {
          details.push(`${at}.requirement.propertyKeys must be a non-empty array`);
        } else {
          const keys = req.propertyKeys as readonly unknown[];
          keys.forEach((key, keyIndex) => {
            if (!isNonEmptyString(key)) {
              details.push(`${at}.requirement.propertyKeys[${keyIndex}] must be a non-empty string`);
            }
          });
          const keyStrings = keys.filter(isNonEmptyString);
          if (new Set(keyStrings).size !== keyStrings.length) {
            details.push(`${at}.requirement.propertyKeys must be unique`);
          }
        }
        break;
      }
      default:
        // THE guard: an unknown requirement kind can never silently pass.
        details.push(`${at}.requirement.kind "${String(req.kind)}" is not one of ${REQUIREMENT_KINDS.join("|")}`);
    }
  });
  if (details.length > 0) throw fail(details);
  return profile as unknown as AssuranceProfile;
}

/**
 * Validate evaluation facts (Reality/Evidence Graph projections). Rejects
 * ambiguous or malformed state fail-closed: duplicate node ids, duplicate
 * property keys within a node, non-finite numbers, negative σ, duplicate
 * evidence ids, malformed device facts.
 */
export function validateEvaluationFacts(input: unknown): EvaluationInput {
  const fail = (details: readonly string[]): AssuranceError =>
    new AssuranceError("invalid_input", "malformed evaluation input", details);
  if (!isPlainObject(input)) throw fail(["input must be an object"]);
  const details: string[] = [];
  const snapshot = input.graphSnapshot;
  if (!isPlainObject(snapshot) || !Array.isArray(snapshot.nodes)) {
    throw fail(["graphSnapshot.nodes must be an array"]);
  }
  const evidence = input.evidence;
  if (!Array.isArray(evidence)) throw fail(["evidence must be an array"]);

  const nodeIds = new Set<string>();
  (snapshot.nodes as readonly unknown[]).forEach((node, nodeIndex) => {
    const at = `graphSnapshot.nodes[${nodeIndex}]`;
    if (!isPlainObject(node)) {
      details.push(`${at}: must be an object`);
      return;
    }
    if (!isNonEmptyString(node.nodeId)) details.push(`${at}.nodeId must be a non-empty string`);
    if (isNonEmptyString(node.nodeId)) {
      if (nodeIds.has(node.nodeId)) details.push(`${at}: duplicate nodeId "${node.nodeId}"`);
      nodeIds.add(node.nodeId);
    }
    if (!Array.isArray(node.properties)) {
      details.push(`${at}.properties must be an array`);
      return;
    }
    const keys = new Set<string>();
    (node.properties as readonly unknown[]).forEach((prop, propIndex) => {
      const pat = `${at}.properties[${propIndex}]`;
      if (!isPlainObject(prop)) {
        details.push(`${pat}: must be an object`);
        return;
      }
      if (!isNonEmptyString(prop.key)) details.push(`${pat}.key must be a non-empty string`);
      if (isNonEmptyString(prop.key)) {
        if (keys.has(prop.key)) details.push(`${pat}: duplicate property key "${prop.key}" in node`);
        keys.add(prop.key);
      }
      const value = prop.value;
      if (typeof value === "number" && !Number.isFinite(value)) {
        details.push(`${pat}.value must be a finite number when numeric`);
      } else if (typeof value !== "number" && typeof value !== "string" && typeof value !== "boolean") {
        details.push(`${pat}.value must be string | number | boolean`);
      }
      if (!isEpistemicStatus(prop.epistemicStatus)) {
        details.push(`${pat}.epistemicStatus must be one of ${EPISTEMIC_STATUSES.join("|")}`);
      }
      if (prop.unit !== undefined && !isNonEmptyString(prop.unit)) {
        details.push(`${pat}.unit must be a non-empty string when present`);
      }
      const unc = prop.uncertainty;
      if (unc !== undefined) {
        if (!isPlainObject(unc) || !isFiniteNumber(unc.sigma) || (unc.sigma as number) < 0) {
          details.push(`${pat}.uncertainty.sigma must be a finite number >= 0`);
        }
        if (isPlainObject(unc) && unc.basis !== undefined && !isNonEmptyString(unc.basis)) {
          details.push(`${pat}.uncertainty.basis must be a non-empty string when present`);
        }
      }
    });
  });

  const evidenceIds = new Set<string>();
  evidence.forEach((item: unknown, itemIndex: number) => {
    const at = `evidence[${itemIndex}]`;
    if (!isPlainObject(item)) {
      details.push(`${at}: must be an object`);
      return;
    }
    if (!isNonEmptyString(item.evidenceId)) details.push(`${at}.evidenceId must be a non-empty string`);
    if (isNonEmptyString(item.evidenceId)) {
      if (evidenceIds.has(item.evidenceId)) details.push(`${at}: duplicate evidenceId "${item.evidenceId}"`);
      evidenceIds.add(item.evidenceId);
    }
    if (!isEvidenceMethod(item.method)) {
      details.push(`${at}.method must be one of ${EVIDENCE_METHODS.join("|")}`);
    }
    if (typeof item.invalidated !== "boolean") details.push(`${at}.invalidated must be a boolean`);
    if (!Array.isArray(item.linkedNodeIds)) {
      details.push(`${at}.linkedNodeIds must be an array`);
    } else {
      const linked = new Set<string>();
      (item.linkedNodeIds as readonly unknown[]).forEach((nodeId: unknown, linkIndex: number) => {
        if (!isNonEmptyString(nodeId)) {
          details.push(`${at}.linkedNodeIds[${linkIndex}] must be a non-empty string`);
        } else if (linked.has(nodeId)) {
          details.push(`${at}.linkedNodeIds must not repeat "${nodeId}"`);
        } else {
          linked.add(nodeId);
        }
      });
    }
  });

  const device = input.deviceProfile;
  if (device !== undefined) {
    if (!isPlainObject(device) || !isPlainObject(device.capabilityFacts)) {
      details.push("deviceProfile.capabilityFacts must be an object of string facts");
    } else {
      for (const [key, value] of Object.entries(device.capabilityFacts)) {
        if (!isNonEmptyString(key) || typeof value !== "string") {
          details.push(`deviceProfile.capabilityFacts["${key}"] must be a string fact`);
        }
      }
    }
  }
  if (details.length > 0) throw fail(details);
  return input as unknown as EvaluationInput;
}

// Read-only re-export of the single epistemic order authority (AISE-016
// reality model). Redefining the rank here would create a SECOND epistemic
// order — forbidden; importing it keeps CONFIRMED > OBSERVED > INFERRED >
// PROPOSED authoritative in exactly one place.
export { EPISTEMIC_RANK };
