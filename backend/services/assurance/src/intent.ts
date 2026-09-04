/**
 * The task-intent and assurance engine (AISE-020).
 *
 * architecture §7: "Project/capture intent maps deterministically
 * to assurance depth." requirements REQ-003: a capture request
 * declares intended purpose (and, optionally, an assurance
 * profile) BEFORE the system determines required capture
 * evidence; AC-021: intent maps deterministically to assurance
 * requirements. AISE-013 delivered the profile→requirements
 * table (deterministic, monotone, platform-owned) but left the
 * intent→depth binding to the caller; its readiness header
 * explicitly reserved the policy layer for this work item.
 *
 * This module is that binding — as an ADDITIVE layer, not a
 * rewrite: the AISE-013 assessment primitive (a caller-declared
 * profile assessed at exactly that depth) is unchanged and its
 * architect-reviewed golden evidence stands. The engine adds the
 * platform-owned floor:
 *
 * 1. **INTENT_CONTRACTS** — the explicit, frozen, per-intent
 *    table: each capture intent carries the minimum assurance
 *    depth work of that intent may be bound to, with its
 *    architecture-§7 rationale and a content digest. Product
 *    architecture, not caller configuration: no caller may
 *    loosen a floor (the AISE-013 doctrine, completed here).
 *
 * 2. **resolveTaskAssurance** — the deterministic mapping itself:
 *    (intent, declared profile?) → the effective depth
 *    `max(declared, floor)`, the requirements that depth imposes
 *    (read from AISE-013's single requirements table — no second
 *    authority), the required dimensions, an explicit
 *    evidence-requirements projection, and a finding when the
 *    declared profile was floored. Transparent: the flooring is
 *    RECORDED, never silent. Deterministic: content-pinned
 *    digest, canonical orderings, no timestamps, no ambient
 *    state — identical inputs yield bit-identical resolutions.
 *
 * 3. **intentTaskProfile** — the sanctioned fail-closed
 *    constructor for intent-bound task profiles: a declared
 *    profile below the intent floor is REFUSED
 *    (`INTENT_PROFILE_BELOW_FLOOR`, the required minimum named
 *    in the message — actionable, not hidden). At or above the
 *    floor it delegates to AISE-013's `taskProfile()` unchanged.
 *    Profiles constructed this way cannot represent a downgrade
 *    of their intent's required assurance by construction.
 *
 * 4. **Monotonicity** (the acceptance proof): the effective
 *    requirements are `REQUIREMENTS_BY_PROFILE[effective]`, so
 *    they inherit AISE-013's proven lattice
 *    LIGHT ⊆ STANDARD ⊆ HIGH_ASSURANCE ⊆ CRITICAL; the engine
 *    only ever raises the effective depth to the floor, never
 *    lowers it, and only ever widens requirements, never narrows
 *    them. Tested across the full input lattice.
 *
 * Division of labor (the engine is a mapper, not a second
 * authority): it computes WHAT an intent requires; AISE-013
 * computes WHETHER a model satisfies it; the Reality Graph and
 * evidence mapping remain the content authorities and are never
 * read or written here.
 */
import {
  canonicalContentHash,
  deepFreeze,
} from "@aise/engineering-model";
import type { AssuranceProfile, CaptureIntent } from "@aise/shared-contracts";
import { AssuranceError } from "./errors.js";
import {
  ASSURANCE_PROFILES,
  CAPTURE_INTENTS,
  REQUIREMENTS_BY_PROFILE,
  taskProfile,
  type DimensionRequirements,
  type ReadinessDimension,
  type TaskProfileInput,
  type TaskProfileRecord,
} from "./profile.js";

/**
 * The depth lattice over assurance profiles (architecture §7:
 * higher assurance adds evidence, checks and review). The rank
 * is total, fixed, and used only to compare floors against
 * declarations — requirement strength itself comes from the
 * AISE-013 table, not from this rank.
 */
export const PROFILE_DEPTH: Readonly<Record<AssuranceProfile, number>> = deepFreeze({
  LIGHT: 0,
  STANDARD: 1,
  HIGH_ASSURANCE: 2,
  CRITICAL: 3,
});

/** One intent's platform-owned assurance contract. */
export interface IntentContract {
  /** The capture intent this contract binds (shared vocabulary). */
  readonly intent: CaptureIntent;
  /**
   * The minimum assurance depth work of this intent may be
   * bound to. Declarations below the floor are refused
   * (fail-closed); resolutions below the floor do not exist.
   */
  readonly minimumProfile: AssuranceProfile;
  /** The architecture-§7 justification, inspectable in-band. */
  readonly rationale: string;
  /** Content digest of (intent, minimumProfile, rationale). */
  readonly digest: string;
}

/**
 * The explicit intent contracts (frozen; product architecture).
 *
 * Floor choices, each the architecture §7 profile purpose that
 * names the intent's work:
 *
 * - `MAINTENANCE` → STANDARD — maintenance work consumes the
 *   model as general documentation/space planning (locate,
 *   access, plan); upgrades to HIGH_ASSURANCE/CRITICAL remain
 *   available for consequential maintenance decisions.
 * - `AS_BUILT` → HIGH_ASSURANCE — as-built work compares
 *   captured reality against design/construction intent;
 *   §7 names "as-built/MEP/construction comparison" the
 *   HIGH_ASSURANCE purpose.
 * - `INSPECTION` → CRITICAL — inspection verdicts feed
 *   compliance and dimensional verification, §7's CRITICAL
 *   purpose ("compliance, dimensional verification,
 *   consequential engineering decisions"). Critical work can
 *   therefore never be bound below CRITICAL through this engine.
 */
const CONTRACT_SOURCE: readonly {
  intent: CaptureIntent;
  minimumProfile: AssuranceProfile;
  rationale: string;
}[] = [
  {
    intent: "MAINTENANCE",
    minimumProfile: "STANDARD",
    rationale:
      "architecture §7 STANDARD (space planning/general documentation): maintenance work locates, accesses and plans against the documented model; per-task upgrades to deeper profiles remain available for consequential maintenance decisions",
  },
  {
    intent: "AS_BUILT",
    minimumProfile: "HIGH_ASSURANCE",
    rationale:
      "architecture §7 HIGH_ASSURANCE (as-built/MEP/construction comparison): as-built work compares captured reality against design intent and demands measured, uncertainty-carrying evidence",
  },
  {
    intent: "INSPECTION",
    minimumProfile: "CRITICAL",
    rationale:
      "architecture §7 CRITICAL (compliance, dimensional verification, consequential engineering decisions): inspection outcomes feed compliance verdicts, so inspection work can never be bound below the CRITICAL floor",
  },
];

/** The frozen intent-contract table, keyed by intent. */
export const INTENT_CONTRACTS: Readonly<Record<CaptureIntent, IntentContract>> = deepFreeze(
  Object.fromEntries(
    CONTRACT_SOURCE.map((source) => [
      source.intent,
      deepFreeze({
        ...source,
        digest: contractDigest(source),
      }),
    ]),
  ) as Record<CaptureIntent, IntentContract>,
);

/** Stable finding code for a transparent (never silent) floor event. */
export type IntentFindingCode = "INTENT_PROFILE_FLOORED";

/** One recorded intent-engine finding. */
export interface IntentFinding {
  readonly code: IntentFindingCode;
  readonly detail: string;
  /** What the caller declared. */
  readonly declaredProfile: AssuranceProfile;
  /** What the intent's contract requires at minimum. */
  readonly minimumProfile: AssuranceProfile;
  /** What was actually enforced (the floor won). */
  readonly effectiveProfile: AssuranceProfile;
}

/**
 * The explicit evidence requirements the effective depth
 * imposes — a projection of AISE-013's requirement rows into
 * the capture-planning view REQ-003 asks the system to
 * determine ("declare intent … before the system determines
 * required capture evidence"). Derived, never duplicated: every
 * field is read out of `REQUIREMENTS_BY_PROFILE[effective]`.
 */
export interface EvidenceRequirements {
  /** Minimum live-evidence coverage ratio, when imposed. */
  readonly minCoverageRatio?: number;
  /** Every measurement-kind assertion must carry uncertainty. */
  readonly uncertaintyOnAllMeasurements: boolean;
  /** At least one directly measured assertion must exist. */
  readonly requireAtLeastOneMeasurement: boolean;
  /** Zero invalidated CONFIRMED assertions tolerated. */
  readonly zeroInvalidatedConfirmed: boolean;
  /** Zero PROPOSED objects/assertions tolerated. */
  readonly zeroProposedContent: boolean;
  /** The task's declared accuracy budget is enforced. */
  readonly budgetEnforced: boolean;
}

/** The deterministic answer to "what does this intent require?" */
export interface TaskAssuranceResolution {
  readonly intent: CaptureIntent;
  /** The declared profile, when the caller declared one. */
  readonly declaredProfile?: AssuranceProfile;
  /** The intent contract's floor. */
  readonly minimumProfile: AssuranceProfile;
  /**
   * The depth actually in force: `max(declared, floor)`; the
   * floor when undeclared (REQ-003: the system determines).
   */
  readonly effectiveProfile: AssuranceProfile;
  /** The AISE-013 requirement rows in force at the effective depth. */
  readonly requirements: readonly DimensionRequirements[];
  /** The dimensions that gate the verdict at the effective depth. */
  readonly requiredDimensions: readonly ReadinessDimension[];
  /** The capture-evidence projection of those requirements. */
  readonly evidenceRequirements: EvidenceRequirements;
  /** Transparent floor events (never silent downgrades). */
  readonly findings: readonly IntentFinding[];
  /** Canonical content digest of this resolution. */
  readonly digest: string;
}

/** Input of the deterministic resolution. */
export interface TaskAssuranceInput {
  readonly intent: CaptureIntent;
  /**
   * The caller's declared profile (optional). Below the intent
   * floor: the resolution FLOORS transparently (with a finding)
   * — this is the query path; the BINDING path
   * (`intentTaskProfile`) refuses instead.
   */
  readonly declaredProfile?: AssuranceProfile;
}

/**
 * The deterministic intent→requirements mapping (AC-021).
 *
 * Pure, fail-closed on unknown vocabulary, monotone by
 * construction (the floor only raises), content-pinned: the
 * same input always yields the bit-identical resolution.
 */
export function resolveTaskAssurance(input: TaskAssuranceInput): TaskAssuranceResolution {
  if (typeof input !== "object" || input === null || typeof input.intent !== "string" || !CAPTURE_INTENTS.includes(input.intent as CaptureIntent)) {
    throw new AssuranceError(
      "INTENT_INVALID",
      `intent must be one of ${CAPTURE_INTENTS.join(", ")}: ${String(input?.intent)}`,
      { details: { field: "intent", value: String(input?.intent) } },
    );
  }
  const intent = input.intent as CaptureIntent;
  const contract = INTENT_CONTRACTS[intent];
  const declared =
    input.declaredProfile === undefined
      ? undefined
      : validateDeclaredProfile(input.declaredProfile);

  const effective =
    declared === undefined || PROFILE_DEPTH[declared] < PROFILE_DEPTH[contract.minimumProfile]
      ? contract.minimumProfile
      : declared;

  const requirements = REQUIREMENTS_BY_PROFILE[effective];
  const requiredDimensions = requirements
    .filter((requirement) => requirement.required)
    .map((requirement) => requirement.dimension);
  const evidenceRequirements = projectEvidenceRequirements(requirements);
  const findings: IntentFinding[] =
    declared !== undefined && PROFILE_DEPTH[declared] < PROFILE_DEPTH[contract.minimumProfile]
      ? [
          {
            code: "INTENT_PROFILE_FLOORED" as const,
            detail:
              `declared profile ${declared} is below the ${intent} contract floor ${contract.minimumProfile}; ` +
              `the effective depth is ${effective} (requirements only grew, never narrowed)`,
            declaredProfile: declared,
            minimumProfile: contract.minimumProfile,
            effectiveProfile: effective,
          },
        ]
      : [];

  const digest = canonicalContentHash({
    intent,
    ...(declared !== undefined ? { declaredProfile: declared } : {}),
    minimumProfile: contract.minimumProfile,
    effectiveProfile: effective,
    requirements,
    requiredDimensions,
    evidenceRequirements,
    findings,
  });

  return deepFreeze({
    intent,
    ...(declared !== undefined ? { declaredProfile: declared } : {}),
    minimumProfile: contract.minimumProfile,
    effectiveProfile: effective,
    requirements,
    requiredDimensions,
    evidenceRequirements,
    findings,
    digest,
  });
}

/**
 * The sanctioned constructor for intent-bound task profiles.
 *
 * Fail-closed below the floor: the error names the intent's
 * required minimum (actionable — the caller re-declares), and
 * NOTHING is constructed. At or above the floor this is exactly
 * AISE-013's `taskProfile()` (all of its validations and
 * content-pinning apply unchanged).
 */
export function intentTaskProfile(
  input: Omit<TaskProfileInput, "intent" | "profile"> & {
    intent: CaptureIntent;
    profile?: AssuranceProfile;
  },
): TaskProfileRecord {
  if (
    typeof input !== "object" ||
    input === null ||
    typeof input.intent !== "string" ||
    !CAPTURE_INTENTS.includes(input.intent as CaptureIntent)
  ) {
    throw new AssuranceError(
      "INTENT_INVALID",
      `intent must be one of ${CAPTURE_INTENTS.join(", ")}: ${String(input?.intent)}`,
      { details: { field: "intent", value: String(input?.intent) } },
    );
  }
  const intent = input.intent as CaptureIntent;
  const contract = INTENT_CONTRACTS[intent];

  // Undeclared profile: the contract floor IS the declaration
  // (REQ-003: the system determines the depth from the intent).
  const declared =
    input.profile === undefined ? contract.minimumProfile : validateDeclaredProfile(input.profile);

  if (PROFILE_DEPTH[declared] < PROFILE_DEPTH[contract.minimumProfile]) {
    throw new AssuranceError(
      "INTENT_PROFILE_BELOW_FLOOR",
      `profile ${declared} is below the ${intent} contract floor: ` +
        `${intent} work requires at least ${contract.minimumProfile} (architecture §7); re-declare at ${contract.minimumProfile} or above`,
      {
        details: {
          field: "profile",
          value: declared,
          intent,
          minimumProfile: contract.minimumProfile,
        },
      },
    );
  }

  return taskProfile({
    ...input,
    intent,
    profile: declared,
  });
}

/**
 * The guard composition points call before accepting a profile
 * as intent-bound: throws `INTENT_PROFILE_BELOW_FLOOR` when the
 * record's declared profile is below its intent's floor.
 */
export function assertIntentFloor(record: TaskProfileRecord): void {
  const contract = INTENT_CONTRACTS[record.intent];
  if (PROFILE_DEPTH[record.profile] < PROFILE_DEPTH[contract.minimumProfile]) {
    throw new AssuranceError(
      "INTENT_PROFILE_BELOW_FLOOR",
      `task "${record.taskId}" declares ${record.intent} at profile ${record.profile}, ` +
        `below the contract floor ${contract.minimumProfile} (architecture §7)`,
      {
        details: {
          taskId: record.taskId,
          intent: record.intent,
          declaredProfile: record.profile,
          minimumProfile: contract.minimumProfile,
        },
      },
    );
  }
}

/** Fail-closed validation of a caller-supplied profile value. */
function validateDeclaredProfile(profile: unknown): AssuranceProfile {
  if (typeof profile !== "string" || !ASSURANCE_PROFILES.includes(profile as AssuranceProfile)) {
    throw new AssuranceError(
      "INTENT_INVALID",
      `declaredProfile must be one of ${ASSURANCE_PROFILES.join(", ")}: ${String(profile)}`,
      { details: { field: "declaredProfile", value: String(profile) } },
    );
  }
  return profile as AssuranceProfile;
}

/** Projects the effective requirement rows into the capture-planning view. */
function projectEvidenceRequirements(
  requirements: readonly DimensionRequirements[],
): EvidenceRequirements {
  return deepFreeze({
    ...coverageOf(requirements),
    uncertaintyOnAllMeasurements: flagOf(requirements, "uncertaintyOnAllMeasurements"),
    requireAtLeastOneMeasurement: flagOf(requirements, "requireAtLeastOneMeasurement"),
    zeroInvalidatedConfirmed: flagOf(requirements, "zeroInvalidatedConfirmed"),
    zeroProposedContent: flagOf(requirements, "zeroProposedContent"),
    budgetEnforced: flagOf(requirements, "budgetEnforced"),
  });
}

function flagOf(
  requirements: readonly DimensionRequirements[],
  key: "uncertaintyOnAllMeasurements" | "requireAtLeastOneMeasurement" | "zeroInvalidatedConfirmed" | "zeroProposedContent" | "budgetEnforced",
): boolean {
  return requirements.some((requirement) => requirement[key] === true);
}

function coverageOf(
  requirements: readonly DimensionRequirements[],
): { minCoverageRatio?: number } {
  const row = requirements.find(
    (requirement) => requirement.dimension === "evidence-coverage" && requirement.minCoverageRatio !== undefined,
  );
  return row?.minCoverageRatio !== undefined ? { minCoverageRatio: row.minCoverageRatio } : {};
}

function contractDigest(source: {
  intent: CaptureIntent;
  minimumProfile: AssuranceProfile;
  rationale: string;
}): string {
  return canonicalContentHash({
    intent: source.intent,
    minimumProfile: source.minimumProfile,
    rationale: source.rationale,
  });
}
