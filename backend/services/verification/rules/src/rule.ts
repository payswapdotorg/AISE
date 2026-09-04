/**
 * Machine-evaluable rule and rule-set definitions (AISE-021).
 *
 * A rule is a DETERMINISTIC, content-pinned specification:
 *
 * - **DIMENSION** — a quantity assertion (the rule's subject)
 *   compared against a numeric bound with an explicit operator
 *   and an optional specification-side margin (the spec's own
 *   tolerance). Evaluation is uncertainty-aware (see
 *   `evaluate.ts`): the value's uncertainty interval and the
 *   compliant region are compared as intervals; overlap is
 *   UNKNOWN, never a lucky PASS.
 * - **SPECIFICATION** — the subject property must be asserted
 *   with at least a declared epistemic status (and optionally
 *   as a direct measurement). Asserted-but-below-floor is an
 *   affirmative FAIL; not asserted at all is UNKNOWN (absence
 *   is not compliance — architecture §2.9).
 *
 * A rule SET is the unit of evaluation:
 *
 * - it declares the assurance profile its rules demand — a run
 *   below that profile is refused at the boundary (no silent
 *   downgrade: running a CRITICAL compliance set under LIGHT
 *   would weaken its gates);
 * - at CRITICAL it MUST declare a readiness gate (the pipeline
 *   places ENGINEERING RULES after readiness; compliance work
 *   cannot bypass the AISE-013 authority) — a CRITICAL set
 *   without a gate is refused at construction;
 * - every field is validated fail-closed (ids, subjects,
 *   operators, bounds, units, margins, statuses) and the whole
 *   set is content-pinned (canonical digest) and frozen: the
 *   rule set an evaluation ran under is permanently
 *   inspectable, and caller-supplied digests are never
 *   accepted.
 */
import {
  canonicalContentHash,
  deepFreeze,
  epistemicRank,
  EPISTEMIC_STATES,
} from "@aise/engineering-model";
import type { AssuranceProfile, EpistemicState } from "@aise/shared-contracts";
import type { ModelUnit } from "@aise/engineering-model";
import { RulesError } from "./errors.js";
import {
  ruleUnitFamily,
  type RuleUnit,
} from "./units.js";
import {
  RULE_KINDS,
  RULE_OPERATORS,
  RULE_PROFILES,
  ruleProfileRank,
  type RuleOperator,
} from "./vocabulary.js";

const ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/;

/** Where a rule's subject property lives. */
export type RuleSubject =
  | {
      readonly type: "space-property";
      readonly spaceId: string;
      readonly propertyKey: string;
    }
  | {
      readonly type: "object-property";
      readonly objectId: string;
      readonly propertyKey: string;
    };

/** A machine-evaluable dimension rule. */
export interface DimensionRule {
  readonly ruleId: string;
  readonly kind: "DIMENSION";
  readonly subject: RuleSubject;
  /** The comparison against the bound (MINIMUM = value ≥ bound, etc.). */
  readonly operator: RuleOperator;
  /** The bound value in its explicit unit. */
  readonly bound: { readonly value: number; readonly unit: RuleUnit };
  /**
   * The specification's own tolerance, in the bound's unit
   * (≥ 0): widens the compliant region symmetrically around the
   * bound. Optional (0 when absent).
   */
  readonly margin?: number;
  readonly description?: string;
}

/** A machine-evaluable specification rule. */
export interface SpecificationRule {
  readonly ruleId: string;
  readonly kind: "SPECIFICATION";
  readonly subject: RuleSubject;
  /** The minimum epistemic status the assertion must carry. */
  readonly requiredStatus: EpistemicState;
  /** Whether the assertion must be a direct measurement. */
  readonly requireMeasurement?: boolean;
  readonly description?: string;
}

/** Any rule. */
export type Rule = DimensionRule | SpecificationRule;

/** The readiness gate a rule set declares. */
export interface ReadinessGate {
  /**
   * The assurance profile the AISE-013 readiness verdict must be
   * READY at (the gate's own depth).
   */
  readonly profile: AssuranceProfile;
}

/** A validated, content-pinned, frozen rule set. */
export interface RuleSet {
  readonly rulesetId: string;
  /** The assurance profile this set demands of its runs. */
  readonly profile: AssuranceProfile;
  /** The readiness gate (mandatory at CRITICAL). */
  readonly readinessGate?: ReadinessGate;
  readonly rules: readonly Rule[];
  /** Canonical content digest of everything above. */
  readonly digest: string;
}

/** Input of one rule-set construction. */
export interface RuleSetInput {
  readonly rulesetId: string;
  readonly profile: AssuranceProfile;
  readonly readinessGate?: ReadinessGate;
  readonly rules: readonly Rule[];
}

/** Fail-closed construction of a rule set. */
export function ruleSet(input: RuleSetInput): RuleSet {
  if (input === null || typeof input !== "object") {
    throw new RulesError("RULESET_INVALID", "rule set input must be an object");
  }
  if (typeof input.rulesetId !== "string" || !ID_PATTERN.test(input.rulesetId)) {
    throw new RulesError(
      "RULESET_INVALID",
      `rulesetId must match ${ID_PATTERN}: ${String(input.rulesetId)}`,
      { details: { field: "rulesetId", value: String(input.rulesetId) } },
    );
  }
  if (!RULE_PROFILES.includes(input.profile)) {
    throw new RulesError(
      "RULESET_INVALID",
      `profile must be one of ${RULE_PROFILES.join(", ")}: ${String(input.profile)}`,
      { details: { field: "profile", value: String(input.profile) } },
    );
  }
  if (!Array.isArray(input.rules) || input.rules.length === 0) {
    throw new RulesError("RULESET_INVALID", "rules must be a non-empty array", {
      details: { field: "rules", value: String(input.rules?.length) },
    });
  }

  const seenIds = new Set<string>();
  for (const rule of input.rules) {
    validateRule(rule, seenIds);
  }

  const gate = validateGate(input.readinessGate, input.profile);

  const frozen = deepFreeze({
    rulesetId: input.rulesetId,
    profile: input.profile,
    ...(gate !== undefined ? { readinessGate: gate } : {}),
    rules: Object.freeze([...input.rules]),
  });
  const digest = canonicalContentHash(frozen);
  return deepFreeze({ ...frozen, digest });
}

/** Validates one rule (fail-closed on every field). */
function validateRule(rule: Rule, seenIds: Set<string>): void {
  if (rule === null || typeof rule !== "object") {
    throw new RulesError("RULESET_INVALID", "each rule must be an object");
  }
  if (typeof rule.ruleId !== "string" || !ID_PATTERN.test(rule.ruleId)) {
    throw new RulesError(
      "RULESET_INVALID",
      `ruleId must match ${ID_PATTERN}: ${String(rule.ruleId)}`,
      { details: { field: "ruleId", value: String(rule.ruleId) } },
    );
  }
  if (seenIds.has(rule.ruleId)) {
    throw new RulesError(
      "RULESET_INVALID",
      `duplicate ruleId: ${rule.ruleId}`,
      { details: { field: "ruleId", value: rule.ruleId } },
    );
  }
  seenIds.add(rule.ruleId);
  validateSubject(rule.subject);
  if (rule.description !== undefined && (typeof rule.description !== "string" || rule.description.length === 0)) {
    throw new RulesError(
      "RULESET_INVALID",
      "description must be a non-empty string when present",
      { details: { field: "description", value: rule.ruleId } },
    );
  }
  if (!RULE_KINDS.includes(rule.kind)) {
    throw new RulesError(
      "RULESET_INVALID",
      `kind must be one of ${RULE_KINDS.join(", ")}: ${String(rule.kind)}`,
      { details: { field: "kind", value: String(rule.kind) } },
    );
  }
  if (rule.kind === "DIMENSION") {
    validateDimensionRule(rule);
  } else {
    validateSpecificationRule(rule);
  }
}

function validateSubject(subject: RuleSubject): void {
  // Runtime-robust check over the untyped shape (callers may cast
  // garbage in tests; the type system alone must not be the only
  // gate — the AISE-013/014 boundary discipline).
  const raw = subject as unknown as { type?: unknown; spaceId?: unknown; objectId?: unknown; propertyKey?: unknown };
  if (raw === null || typeof raw !== "object") {
    throw new RulesError("RULESET_INVALID", "rule subject must be an object");
  }
  if (raw.type !== "space-property" && raw.type !== "object-property") {
    throw new RulesError(
      "RULESET_INVALID",
      `subject.type must be space-property or object-property: ${String(raw.type)}`,
      { details: { field: "subject.type", value: String(raw.type) } },
    );
  }
  const id = raw.type === "space-property" ? raw.spaceId : raw.objectId;
  if (typeof id !== "string" || !ID_PATTERN.test(id)) {
    throw new RulesError(
      "RULESET_INVALID",
      `subject id must match ${ID_PATTERN}: ${String(id)}`,
      { details: { field: "subject.id", value: String(id) } },
    );
  }
  if (typeof raw.propertyKey !== "string" || raw.propertyKey.length === 0) {
    throw new RulesError(
      "RULESET_INVALID",
      `subject.propertyKey must be a non-empty string: ${String(raw.propertyKey)}`,
      { details: { field: "subject.propertyKey", value: String(raw.propertyKey) } },
    );
  }
}

function validateDimensionRule(rule: DimensionRule): void {
  if (!RULE_OPERATORS.includes(rule.operator)) {
    throw new RulesError(
      "RULESET_INVALID",
      `operator must be one of ${RULE_OPERATORS.join(", ")}: ${String(rule.operator)}`,
      { details: { field: "operator", value: String(rule.operator) } },
    );
  }
  if (rule.bound === null || typeof rule.bound !== "object") {
    throw new RulesError("RULESET_INVALID", "dimension rule requires a bound object", {
      details: { field: "bound", value: rule.ruleId },
    });
  }
  if (typeof rule.bound.value !== "number" || !Number.isFinite(rule.bound.value)) {
    throw new RulesError(
      "RULESET_INVALID",
      `bound.value must be a finite number: ${String(rule.bound.value)}`,
      { details: { field: "bound.value", value: String(rule.bound.value) } },
    );
  }
  const unit = rule.bound.unit as ModelUnit;
  // Validate the unit (fail closed on unknown units).
  try {
    ruleUnitFamily(unit as RuleUnit);
  } catch {
    throw new RulesError(
      "RULESET_INVALID",
      `bound.unit is not a known unit: ${String(unit)}`,
      { details: { field: "bound.unit", value: String(unit) } },
    );
  }
  if (rule.margin !== undefined && (typeof rule.margin !== "number" || !Number.isFinite(rule.margin) || rule.margin < 0)) {
    throw new RulesError(
      "RULESET_INVALID",
      `margin must be a finite number ≥ 0: ${String(rule.margin)}`,
      { details: { field: "margin", value: String(rule.margin) } },
    );
  }
}

function validateSpecificationRule(rule: SpecificationRule): void {
  if (!EPISTEMIC_STATES.includes(rule.requiredStatus)) {
    throw new RulesError(
      "RULESET_INVALID",
      `requiredStatus must be one of ${EPISTEMIC_STATES.join(", ")}: ${String(rule.requiredStatus)}`,
      { details: { field: "requiredStatus", value: String(rule.requiredStatus) } },
    );
  }
  if (rule.requireMeasurement !== undefined && typeof rule.requireMeasurement !== "boolean") {
    throw new RulesError(
      "RULESET_INVALID",
      `requireMeasurement must be a boolean when present: ${String(rule.requireMeasurement)}`,
      { details: { field: "requireMeasurement", value: String(rule.requireMeasurement) } },
    );
  }
}

/** Validates the readiness gate (mandatory at CRITICAL). */
function validateGate(gate: ReadinessGate | undefined, profile: AssuranceProfile): ReadinessGate | undefined {
  if (gate === undefined) {
    if (profile === "CRITICAL") {
      throw new RulesError(
        "RULESET_INVALID",
        "a CRITICAL rule set must declare a readinessGate (compliance work cannot bypass the readiness authority)",
        { details: { field: "readinessGate", value: "absent" } },
      );
    }
    return undefined;
  }
  if (gate === null || typeof gate !== "object") {
    throw new RulesError("RULESET_INVALID", "readinessGate must be an object when present");
  }
  if (!RULE_PROFILES.includes(gate.profile)) {
    throw new RulesError(
      "RULESET_INVALID",
      `readinessGate.profile must be one of ${RULE_PROFILES.join(", ")}: ${String(gate.profile)}`,
      { details: { field: "readinessGate.profile", value: String(gate.profile) } },
    );
  }
  return deepFreeze({ profile: gate.profile });
}

/** The rank of an epistemic state (for spec floors; passthrough of the model's own rank). */
export function statusRank(status: EpistemicState): number {
  return epistemicRank(status);
}

/** Whether a run at `runProfile` may execute a set demanding `setProfile`. */
export function runProfileSatisfies(runProfile: AssuranceProfile, setProfile: AssuranceProfile): boolean {
  return ruleProfileRank(runProfile) >= ruleProfileRank(setProfile);
}
