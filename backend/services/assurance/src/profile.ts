/**
 * Declared task/assurance profiles and the fixed requirements
 * mapping (AISE-013).
 *
 * architecture-lock §3: "Accuracy is task-specific; the product
 * must bind outputs to a declared purpose/assurance profile."
 * architecture §7: "Project/capture intent maps deterministically
 * to assurance depth … Higher assurance adds evidence, checks
 * and review; it never changes authority semantics."
 *
 * Two structures implement that binding:
 *
 * 1. **TaskProfileRecord** — the DECLARED binding: what task this
 *    model is being readied for (intent, from the shared
 *    cross-platform vocabulary), at what assurance depth
 *    (profile), and — optionally — the task's declared accuracy
 *    budget in SI units per quantity family. Profiles are
 *    content-pinned (canonical digest) and immutable after
 *    registration: the binding an assessment was computed under
 *    is permanently inspectable.
 *
 * 2. **The requirements table** — the DETERMINISTIC mapping from
 *    assurance profile to readiness requirements. Fixed,
 *    documented, monotone: LIGHT requirements ⊆ STANDARD ⊆
 *    HIGH_ASSURANCE ⊆ CRITICAL (a model READY at a higher
 *    profile is READY at every lower profile — proven by tests).
 *    The mapping is product architecture, not caller
 *    configuration: callers declare INTENT, the platform owns the
 *    depth. No caller may loosen a floor.
 *
 * Threshold values are v1 defaults, each justified by the
 * profile's intended use (architecture §7):
 *
 * - LIGHT (visualization/exploration) — a structurally valid,
 *   non-empty model is enough; everything else is advisory.
 * - STANDARD (space planning/general documentation) — a quarter
 *   of assertions traceable to live evidence, no invalidated
 *   confirmations.
 * - HIGH_ASSURANCE (as-built/MEP/construction comparison) — 60%
 *   coverage, EVERY measurement carrying uncertainty, zero
 *   invalidated confirmations; declared budgets enforced.
 * - CRITICAL (compliance, dimensional verification,
 *   consequential engineering decisions) — FULL coverage, every
 *   measurement with uncertainty AND at least one direct
 *   measurement, zero PROPOSED content, zero invalidated
 *   confirmations, declared budgets enforced fail-closed.
 */
import {
  canonicalContentHash,
  deepFreeze,
  type ModelUncertainty,
} from "@aise/engineering-model";
import type { AssuranceProfile, CaptureIntent } from "@aise/shared-contracts";
import { AssuranceError } from "./errors.js";
import { siBaseUnitOf, type SiBaseUnit } from "./units.js";

/** The readiness dimensions, canonical order (report order). */
export const READINESS_DIMENSIONS: readonly ReadinessDimension[] = Object.freeze([
  "model-integrity",
  "evidence-coverage",
  "measurement-uncertainty",
  "confirmed-validity",
  "epistemic-composition",
  "uncertainty-budget",
]);

export type ReadinessDimension =
  | "model-integrity"
  | "evidence-coverage"
  | "measurement-uncertainty"
  | "confirmed-validity"
  | "epistemic-composition"
  | "uncertainty-budget";

/** Runtime vocabulary (aligned with the shared-contracts type). */
export const CAPTURE_INTENTS: readonly CaptureIntent[] = Object.freeze([
  "AS_BUILT",
  "MAINTENANCE",
  "INSPECTION",
]);

/** Runtime vocabulary (aligned with the shared-contracts type). */
export const ASSURANCE_PROFILES: readonly AssuranceProfile[] = Object.freeze([
  "LIGHT",
  "STANDARD",
  "HIGH_ASSURANCE",
  "CRITICAL",
]);

const ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/;

/**
 * The task's declared accuracy budget: the maximum acceptable
 * standard-equivalent (1σ) measurement uncertainty per quantity
 * family, in the family's SI base unit. Optional; a CRITICAL
 * profile without a budget is assessed (and flagged with an
 * advisory finding — transparency, not refusal).
 */
export interface UncertaintyBudget {
  /** Maximum acceptable 1σ length uncertainty, in meters. */
  readonly lengthM?: number;
  /** Maximum acceptable 1σ area uncertainty, in square meters. */
  readonly areaM2?: number;
  /** Maximum acceptable 1σ angle uncertainty, in radians. */
  readonly angleRad?: number;
}

/** Input for declaring one task profile. */
export interface TaskProfileInput {
  /** Caller-chosen task identity (stable; content-pinned). */
  readonly taskId: string;
  /** What the capture/task is for (shared vocabulary). */
  readonly intent: CaptureIntent;
  /** The assurance depth (shared vocabulary). */
  readonly profile: AssuranceProfile;
  readonly description?: string;
  readonly uncertaintyBudget?: UncertaintyBudget;
}

/** A declared, content-pinned, immutable task profile. */
export interface TaskProfileRecord {
  readonly taskId: string;
  readonly intent: CaptureIntent;
  readonly profile: AssuranceProfile;
  readonly description?: string;
  readonly uncertaintyBudget?: UncertaintyBudget;
  /** Canonical content hash of everything above. */
  readonly digest: string;
}

/** Requirements one assurance profile imposes on readiness. */
export interface DimensionRequirements {
  readonly dimension: ReadinessDimension;
  /** Whether the dimension gates the verdict at this profile. */
  readonly required: boolean;
  /** Minimum live-evidence coverage ratio (evidence-coverage). */
  readonly minCoverageRatio?: number;
  /** Every measurement-kind assertion must carry uncertainty. */
  readonly uncertaintyOnAllMeasurements?: boolean;
  /** At least one direct measurement must exist. */
  readonly requireAtLeastOneMeasurement?: boolean;
  /** Zero invalidated CONFIRMED assertions. */
  readonly zeroInvalidatedConfirmed?: boolean;
  /** Zero PROPOSED objects or assertions. */
  readonly zeroProposedContent?: boolean;
  /** The declared budget is enforced (uncertainty-budget). */
  readonly budgetEnforced?: boolean;
}

/**
 * The fixed requirements per assurance profile. Monotone by
 * construction (tested): requirements only grow with depth.
 */
export const REQUIREMENTS_BY_PROFILE: Readonly<
  Record<AssuranceProfile, readonly DimensionRequirements[]>
> = deepFreeze({
  LIGHT: [
    { dimension: "model-integrity", required: true },
  ],
  STANDARD: [
    { dimension: "model-integrity", required: true },
    { dimension: "evidence-coverage", required: true, minCoverageRatio: 0.25 },
    { dimension: "confirmed-validity", required: true, zeroInvalidatedConfirmed: true },
  ],
  HIGH_ASSURANCE: [
    { dimension: "model-integrity", required: true },
    { dimension: "evidence-coverage", required: true, minCoverageRatio: 0.6 },
    {
      dimension: "measurement-uncertainty",
      required: true,
      uncertaintyOnAllMeasurements: true,
    },
    { dimension: "confirmed-validity", required: true, zeroInvalidatedConfirmed: true },
    { dimension: "uncertainty-budget", required: true, budgetEnforced: true },
  ],
  CRITICAL: [
    { dimension: "model-integrity", required: true },
    { dimension: "evidence-coverage", required: true, minCoverageRatio: 1 },
    {
      dimension: "measurement-uncertainty",
      required: true,
      uncertaintyOnAllMeasurements: true,
      requireAtLeastOneMeasurement: true,
    },
    { dimension: "confirmed-validity", required: true, zeroInvalidatedConfirmed: true },
    { dimension: "epistemic-composition", required: true, zeroProposedContent: true },
    { dimension: "uncertainty-budget", required: true, budgetEnforced: true },
  ],
});

/** Fail-closed construction of a task profile record. */
export function taskProfile(input: TaskProfileInput): TaskProfileRecord {
  if (typeof input.taskId !== "string" || !ID_PATTERN.test(input.taskId)) {
    throw new AssuranceError(
      "PROFILE_INVALID",
      `taskId must match ${ID_PATTERN}: ${String(input.taskId)}`,
      { details: { field: "taskId", value: String(input.taskId) } },
    );
  }
  if (!CAPTURE_INTENTS.includes(input.intent)) {
    throw new AssuranceError(
      "PROFILE_INVALID",
      `intent must be one of ${CAPTURE_INTENTS.join(", ")}: ${String(input.intent)}`,
      { details: { field: "intent", value: String(input.intent) } },
    );
  }
  if (!ASSURANCE_PROFILES.includes(input.profile)) {
    throw new AssuranceError(
      "PROFILE_INVALID",
      `profile must be one of ${ASSURANCE_PROFILES.join(", ")}: ${String(input.profile)}`,
      { details: { field: "profile", value: String(input.profile) } },
    );
  }
  if (input.description !== undefined && (typeof input.description !== "string" || input.description.length === 0)) {
    throw new AssuranceError(
      "PROFILE_INVALID",
      "description must be a non-empty string when present",
      { details: { field: "description" } },
    );
  }
  const budget = validateBudget(input.uncertaintyBudget);
  const digest = canonicalContentHash({
    taskId: input.taskId,
    intent: input.intent,
    profile: input.profile,
    ...(input.description !== undefined ? { description: input.description } : {}),
    ...(budget !== undefined ? { uncertaintyBudget: budget } : {}),
  });
  return deepFreeze({
    taskId: input.taskId,
    intent: input.intent,
    profile: input.profile,
    ...(input.description !== undefined ? { description: input.description } : {}),
    ...(budget !== undefined ? { uncertaintyBudget: budget } : {}),
    digest,
  });
}

/** Budget validation: positive, finite, at least one family. */
function validateBudget(budget: UncertaintyBudget | undefined): UncertaintyBudget | undefined {
  if (budget === undefined) {
    return undefined;
  }
  const entries = Object.entries(budget) as [keyof UncertaintyBudget, number | undefined][];
  const present = entries.filter(([, value]) => value !== undefined);
  if (present.length === 0) {
    throw new AssuranceError(
      "PROFILE_INVALID",
      "uncertaintyBudget must declare at least one family (lengthM, areaM2, angleRad)",
      { details: { field: "uncertaintyBudget" } },
    );
  }
  const unexpected = entries.filter(([key]) => key !== "lengthM" && key !== "areaM2" && key !== "angleRad");
  if (unexpected.length > 0) {
    throw new AssuranceError(
      "PROFILE_INVALID",
      `uncertaintyBudget has unknown fields: ${unexpected.map(([key]) => key).join(", ")}`,
      { details: { field: "uncertaintyBudget" } },
    );
  }
  for (const [family, value] of present) {
    const bound = value as number;
    if (typeof bound !== "number" || !Number.isFinite(bound) || bound <= 0) {
      throw new AssuranceError(
        "PROFILE_INVALID",
        `uncertaintyBudget.${String(family)} must be a finite positive number: ${String(bound)}`,
        { details: { field: `uncertaintyBudget.${String(family)}`, value: String(bound) } },
      );
    }
  }
  // Canonical, frozen budget (key order fixed for digesting).
  return deepFreeze({
    ...(budget.lengthM !== undefined ? { lengthM: budget.lengthM } : {}),
    ...(budget.areaM2 !== undefined ? { areaM2: budget.areaM2 } : {}),
    ...(budget.angleRad !== undefined ? { angleRad: budget.angleRad } : {}),
  });
}

/** The requirements of one dimension at one profile (never undefined). */
export function requirementsFor(
  profile: AssuranceProfile,
  dimension: ReadinessDimension,
): DimensionRequirements {
  const table = REQUIREMENTS_BY_PROFILE[profile];
  const found = table.find((requirement) => requirement.dimension === dimension);
  // Advisory dimensions absent from the table evaluate REPORTED.
  return (
    found ?? {
      dimension,
      required: false,
    }
  );
}

/** The budget bound for a unit family, in the family's SI base unit. */
export function budgetForFamily(
  budget: UncertaintyBudget | undefined,
  family: "length" | "area" | "angle",
): { bound: number; unit: SiBaseUnit } | undefined {
  if (budget === undefined) {
    return undefined;
  }
  const bound =
    family === "length" ? budget.lengthM : family === "area" ? budget.areaM2 : budget.angleRad;
  if (bound === undefined) {
    return undefined;
  }
  return { bound, unit: siBaseUnitOf(family) };
}

/**
 * Standard-equivalent (1σ) uncertainty in the quantity's own
 * unit, when the stated uncertainty has a statistical form:
 *
 * - `standard`: u itself;
 * - `expanded`: U / k (the coverage factor is explicit — dividing
 *   is algebra, not distribution invention);
 * - `tolerance`: **undefined — never converted.** A tolerance is
 *   a specification bound, not a statistical estimate; the
 *   engineering-model discipline is preserved on the evaluation
 *   side (callers get an explicit unevaluable verdict instead of
 *   an invented number).
 */
export function standardEquivalent(uncertainty: ModelUncertainty): number | undefined {
  switch (uncertainty.kind) {
    case "standard":
      return uncertainty.u;
    case "expanded":
      return uncertainty.U / uncertainty.coverageFactor;
    case "tolerance":
      return undefined;
  }
}
