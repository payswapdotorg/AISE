/**
 * The deterministic rule evaluators (AISE-021 core).
 *
 * Each rule of the set is evaluated exactly once, in the set's
 * canonical rule order. The evaluation ladder is FIXED and
 * documented (fail-closed, monotone in the run profile):
 *
 * 1. **Readiness gate** (set-level): when the rule set declares
 *    a gate, every result carries the gate outcome unless the
 *    gate is satisfied — the context must exist, pin the
 *    verified content, and be READY at the gate's profile.
 *    Compliance is never evaluated past a failed readiness
 *    gate: the answer is honestly UNKNOWN, with the specific
 *    reason (missing / stale / not ready).
 * 2. **Subject resolution**: the rule's subject property must be
 *    asserted. Absence is NOT compliance — architecture §2.9
 *    ("say UNKNOWN and request more evidence").
 * 3. **Quantitative/unit gates** (DIMENSION): a presence-only
 *    assertion cannot satisfy a dimension rule; a cross-family
 *    unit (e.g. the rule bound in metres, the value in degrees)
 *    is an honest UNKNOWN, never a silent comparison.
 * 4. **Epistemic floor** (profile-monotone): the assertion's
 *    status must be at least the floor for the run profile —
 *    INFERRED for LIGHT/STANDARD, OBSERVED for HIGH_ASSURANCE,
 *    CONFIRMED for CRITICAL. PROPOSED never establishes a rule
 *    subject (a proposal is not spec-compliance evidence).
 * 5. **Evidence gate** (profile-monotone): at HIGH_ASSURANCE and
 *    above the assertion must carry live evidence support
 *    (AC-111: required evidence gaps cause explicit UNKNOWN).
 * 6. **Uncertainty gate** (profile-monotone): at HIGH_ASSURANCE
 *    and above a dimension value must state its uncertainty —
 *    absent means "not stated", never zero (the model's own
 *    discipline).
 * 7. **The comparison** (uncertainty-aware interval arithmetic):
 *    the value's possible-value interval vs the operator's
 *    compliant region, both in SI base units of the bound's
 *    family. Entirely inside → PASS; entirely outside → FAIL
 *    (RULE_NOT_SATISFIED); overlapping → UNKNOWN
 *    (RULE_INDETERMINATE). An uncertainty band that straddles
 *    the bound is NEVER a lucky PASS (lock §3: critical results
 *    fail closed when evidence is ambiguous).
 *
 * SPECIFICATION rules: the assertion must exist and carry at
 * least the rule's declared status (strengthened to the profile
 * floor when the floor is higher — the effective floor is the
 * max of the two; never the weaker) and, when demanded, be a
 * direct measurement. Below the floor is an affirmative FAIL
 * (RULE_SPEC_NOT_MET); absent is UNKNOWN.
 */
import { assembleEvidenceGraph, epistemicRank } from "@aise/engineering-model";
import type { EpistemicState, PropertyAssertion } from "@aise/engineering-model";
import type { RuleSet } from "./rule.js";
import type { RulesVerifiedInput } from "./inputs.js";
import {
  buildRulesView,
  liveSupportIds,
  objectSupportKey,
  spaceSupportKey,
  uncertaintyInterval,
  type RulesView,
} from "./view.js";
import { formatQuantity, ruleUnitFamily, toSiBase, type RuleUnit } from "./units.js";
import {
  evidenceSupportRequired,
  outcomeOfCode,
  STATUS_FLOOR_BY_PROFILE,
  uncertaintyRequired,
  type RuleResultCode,
  type RuleOutcome,
} from "./vocabulary.js";

/** Any rule of a validated set. */
type RuleSetRule = RuleSet["rules"][number];

/** One rule's evaluated result (machine-readable, deterministic). */
export interface RuleResult {
  readonly ruleId: string;
  readonly kind: "DIMENSION" | "SPECIFICATION";
  /** The evaluated subject (echo, canonical form). */
  readonly subject: { readonly type: string; readonly id: string; readonly propertyKey: string };
  readonly outcome: RuleOutcome;
  /** Present iff outcome is not PASS — the specific reason. */
  readonly code?: RuleResultCode;
  /** The rule's demand, formatted (dimension rules). */
  readonly expected?: string;
  /** What was observed (value, interval, status, support). */
  readonly actual?: string;
  /** Epistemic passthrough (never rewritten). */
  readonly epistemic?: { readonly assertionStatus: string };
  /** Live supporting evidence (when a mapping was provided). */
  readonly evidenceRefs?: readonly string[];
  readonly detail: string;
}

/** The evaluation output before report assembly. */
export interface EvaluationOutput {
  readonly results: readonly RuleResult[];
}

/** Evaluates every rule of the set over the verified input (deterministic). */
export function evaluateRules(input: RulesVerifiedInput): EvaluationOutput {
  const view = buildRulesView(input);
  const ruleset = input.ruleset as RuleSet;
  const gateCode = readinessGateCode(input);

  const results: RuleResult[] = [];
  for (const rule of ruleset.rules) {
    if (gateCode !== undefined) {
      results.push(gatedResult(rule, gateCode));
      continue;
    }
    results.push(evaluateRule(rule, input, view));
  }
  return { results: Object.freeze(results) };
}

/** The set-level readiness gate outcome (undefined when satisfied). */
function readinessGateCode(input: RulesVerifiedInput): RuleResultCode | undefined {
  const ruleset = input.ruleset as RuleSet;
  const gate = ruleset.readinessGate;
  if (gate === undefined) {
    return undefined;
  }
  const context = input.readiness;
  if (context === undefined) {
    return "RULE_READINESS_MISSING";
  }
  // Content pins: the readiness verdict must describe exactly
  // the content under evaluation.
  if (
    context.modelId !== input.graph.modelId ||
    context.version !== input.version ||
    context.graphDigest !== input.graph.digest ||
    context.mappingDigest !== observedMappingDigest(input)
  ) {
    return "RULE_READINESS_STALE";
  }
  // Depth: the verdict must be READY at the gate's profile depth.
  if (context.verdict !== "READY") {
    return "RULE_READINESS_NOT_READY";
  }
  if (rankOf(context.assuranceProfile) < rankOf(gate.profile)) {
    return "RULE_READINESS_NOT_READY";
  }
  return undefined;
}

/** The mapping digest actually observed for this run (empty-mapping digest when absent). */
function observedMappingDigest(input: RulesVerifiedInput): string {
  return input.mapping !== undefined
    ? input.mapping.digest
    : emptyMappingDigest(input.graph.projectId);
}

/** The canonical digest of a project's empty mapping (the no-evidence state; deterministic). */
function emptyMappingDigest(projectId: string): string {
  return assembleEvidenceGraph({
    projectId,
    records: [],
    evidenceRetractions: [],
    links: [],
    linkRetractions: [],
  }).digest;
}

function rankOf(profile: string): number {
  return ["LIGHT", "STANDARD", "HIGH_ASSURANCE", "CRITICAL"].indexOf(profile);
}

/** A result fully explained by the failed readiness gate. */
function gatedResult(rule: RuleSetRule, code: RuleResultCode): RuleResult {
  return Object.freeze({
    ruleId: rule.ruleId,
    kind: rule.kind,
    subject: subjectEcho(rule),
    outcome: "UNKNOWN",
    code,
    detail: `the rule set's readiness gate is not satisfied (${code}); compliance is not evaluated past the gate`,
  });
}

/** Evaluates one rule (the full ladder, in order). */
function evaluateRule(rule: RuleSetRule, input: RulesVerifiedInput, view: RulesView): RuleResult {
  const assertion = resolveAssertion(rule, view);
  if (rule.kind === "DIMENSION") {
    return evaluateDimension(rule, input, view, assertion);
  }
  return evaluateSpecification(rule, input, view, assertion);
}

/** Resolves the rule's subject in the graph (undefined when absent). */
function resolveAssertion(rule: RuleSetRule, view: RulesView): PropertyAssertion | undefined {
  const subject = rule.subject;
  if (subject.type === "space-property") {
    return view.spaceProperties.get(`${subject.spaceId}::${subject.propertyKey}`);
  }
  return view.objectProperties.get(`${subject.objectId}::${subject.propertyKey}`);
}

/** The DIMENSION ladder. */
function evaluateDimension(
  rule: Extract<RuleSet["rules"][number], { kind: "DIMENSION" }>,
  input: RulesVerifiedInput,
  view: RulesView,
  assertion: PropertyAssertion | undefined,
): RuleResult {
  const profile = input.profile;

  // --- 2. subject resolution -------------------------------------------
  if (assertion === undefined) {
    return unknown(rule, "RULE_SUBJECT_NOT_ASSERTED", {
      detail: `property "${rule.subject.propertyKey}" is not asserted; absence is not compliance (architecture §2.9)`,
    });
  }

  // --- 3. quantitative gate ---------------------------------------------
  if (assertion.quantity === undefined) {
    return unknown(rule, "RULE_SUBJECT_NOT_QUANTITATIVE", {
      assertion,
      detail: `property "${rule.subject.propertyKey}" is asserted without a quantity (presence-only); a dimension rule needs a value`,
    });
  }
  const quantity = assertion.quantity;

  // --- 3b. unit-family gate ---------------------------------------------
  const boundFamily = ruleUnitFamily(rule.bound.unit as RuleUnit);
  const valueFamily = ruleUnitFamily(quantity.unit as RuleUnit);
  if (boundFamily !== valueFamily) {
    return unknown(rule, "RULE_QUANTITY_FAMILY_MISMATCH", {
      assertion,
      expected: formatQuantity(rule.bound.value, rule.bound.unit as RuleUnit),
      actual: formatQuantity(quantity.value, quantity.unit as RuleUnit),
      detail: `the rule bound is in the ${boundFamily} family but the asserted value is in the ${valueFamily} family; the rule cannot be compared honestly`,
    });
  }

  // --- 4. epistemic floor -------------------------------------------------
  const floor = STATUS_FLOOR_BY_PROFILE[profile];
  if (epistemicRank(assertion.status) < epistemicRank(floor)) {
    return unknown(rule, "RULE_SUBJECT_NOT_ESTABLISHED", {
      assertion,
      expected: floor,
      actual: assertion.status,
      detail: `the assertion status ${assertion.status} is below the ${profile} floor ${floor}; a dimension rule evaluates established values only`,
    });
  }

  // --- 5. evidence gate -----------------------------------------------------
  if (evidenceSupportRequired(profile)) {
    const support = supportFor(rule, input, view);
    if (support.length === 0) {
      return unknown(rule, "RULE_NO_EVIDENCE_SUPPORT", {
        assertion,
        detail: view.hasMapping
          ? "the assertion has no live evidence support (AC-111); an unsupported value cannot satisfy a rule at this depth"
          : "no evidence mapping was provided; rules cannot be established without evidence at this depth",
      });
    }
  }

  // --- 6. uncertainty gate ----------------------------------------------------
  const interval = uncertaintyInterval(quantity.uncertainty);
  if (interval === undefined && uncertaintyRequired(profile)) {
    return unknown(rule, "RULE_UNCERTAINTY_NOT_STATED", {
      assertion,
      detail: "the value carries no stated uncertainty and this profile requires one (absent means not stated, never zero)",
    });
  }

  // --- 7. the comparison (uncertainty-aware, in SI) ---------------------------
  const boundSi = toSiBase(rule.bound.value, rule.bound.unit as RuleUnit);
  const marginSi = toSiBase(rule.margin ?? 0, rule.bound.unit as RuleUnit);
  const valueSi = toSiBase(quantity.value, quantity.unit as RuleUnit);
  const lowerSi = interval !== undefined ? toSiBase(quantity.value + interval.lower, quantity.unit as RuleUnit) : valueSi;
  const upperSi = interval !== undefined ? toSiBase(quantity.value + interval.upper, quantity.unit as RuleUnit) : valueSi;

  const comparison = compareInterval(rule.operator, { lower: lowerSi, upper: upperSi }, boundSi, marginSi);

  const expected =
    rule.operator === "MINIMUM"
      ? `value ≥ ${formatQuantity(rule.bound.value - (rule.margin ?? 0), rule.bound.unit as RuleUnit)}`
      : rule.operator === "MAXIMUM"
        ? `value ≤ ${formatQuantity(rule.bound.value + (rule.margin ?? 0), rule.bound.unit as RuleUnit)}`
        : `|value − ${formatQuantity(rule.bound.value, rule.bound.unit as RuleUnit)}| ≤ ${formatQuantity(rule.margin ?? 0, rule.bound.unit as RuleUnit)}`;
  const actual =
    interval !== undefined
      ? `value ${formatQuantity(quantity.value, quantity.unit as RuleUnit)} with interval [${lowerSi.toPrecision(12)}, ${upperSi.toPrecision(12)}] in ${boundFamily} SI`
      : `value ${formatQuantity(quantity.value, quantity.unit as RuleUnit)} (no stated uncertainty)`;

  if (comparison === "PASS") {
    return pass(rule, assertion, { expected, actual, support: supportFor(rule, input, view) });
  }
  if (comparison === "FAIL") {
    return Object.freeze({
      ruleId: rule.ruleId,
      kind: rule.kind,
      subject: subjectEcho(rule),
      outcome: "FAIL",
      code: "RULE_NOT_SATISFIED",
      expected,
      actual,
      epistemic: { assertionStatus: assertion.status },
      ...(supportFor(rule, input, view).length > 0
        ? { evidenceRefs: Object.freeze([...supportFor(rule, input, view)]) }
        : {}),
      detail: `the value's possible interval is entirely outside the compliant region (${expected})`,
    });
  }
  return unknown(rule, "RULE_INDETERMINATE", {
    assertion,
    expected,
    actual,
    detail: `the value's uncertainty band straddles the rule bound (${expected}); the rule cannot be decided on the current evidence — never a lucky PASS`,
  });
}

/** The SPECIFICATION ladder. */
function evaluateSpecification(
  rule: Extract<RuleSet["rules"][number], { kind: "SPECIFICATION" }>,
  input: RulesVerifiedInput,
  view: RulesView,
  assertion: PropertyAssertion | undefined,
): RuleResult {
  const profile = input.profile;

  // --- 2. subject resolution -------------------------------------------
  if (assertion === undefined) {
    return unknown(rule, "RULE_SUBJECT_NOT_ASSERTED", {
      detail: `property "${rule.subject.propertyKey}" is not asserted; the specification demands it be recorded`,
    });
  }

  // --- 5. evidence gate (applies to specification rules too) --------------
  if (evidenceSupportRequired(profile)) {
    const support = supportFor(rule, input, view);
    if (support.length === 0) {
      return unknown(rule, "RULE_NO_EVIDENCE_SUPPORT", {
        assertion,
        detail: view.hasMapping
          ? "the assertion has no live evidence support (AC-111); an unsupported assertion cannot satisfy a specification at this depth"
          : "no evidence mapping was provided; specifications cannot be established without evidence at this depth",
      });
    }
  }

  // --- the status/measurement requirement ----------------------------------
  const effectiveFloor = strongerStatus(rule.requiredStatus, STATUS_FLOOR_BY_PROFILE[profile]);
  const meetsStatus = epistemicRank(assertion.status) >= epistemicRank(effectiveFloor);
  const meetsMeasurement = rule.requireMeasurement !== true || assertion.kind === "measurement";
  if (!meetsStatus || !meetsMeasurement) {
    return Object.freeze({
      ruleId: rule.ruleId,
      kind: rule.kind,
      subject: subjectEcho(rule),
      outcome: "FAIL",
      code: "RULE_SPEC_NOT_MET",
      expected: meetsStatus
        ? `measurement assertion (kind: measurement)`
        : `status ≥ ${effectiveFloor}`,
      actual: meetsStatus ? `kind: ${String(assertion.kind)}` : assertion.status,
      epistemic: { assertionStatus: assertion.status },
      ...(supportFor(rule, input, view).length > 0
        ? { evidenceRefs: Object.freeze([...supportFor(rule, input, view)]) }
        : {}),
      detail: `the specification requires ${meetsStatus ? "a direct measurement" : `status at least ${effectiveFloor}`}; the assertion is ${assertion.status}${assertion.kind !== undefined ? ` (${assertion.kind})` : ""}`,
    });
  }
  return pass(rule, assertion, {
    expected: meetsStatus ? "measurement assertion" : `status ≥ ${effectiveFloor}`,
    actual: `${assertion.status}${assertion.kind !== undefined ? ` (${assertion.kind})` : ""}`,
    support: supportFor(rule, input, view),
  });
}

/** The uncertainty-aware interval comparison (pure, in SI). */
function compareInterval(
  operator: "MINIMUM" | "MAXIMUM" | "EXACT",
  interval: { readonly lower: number; readonly upper: number },
  bound: number,
  margin: number,
): RuleOutcome {
  switch (operator) {
    case "MINIMUM": {
      const threshold = bound - margin;
      if (interval.lower >= threshold) {
        return "PASS";
      }
      if (interval.upper < threshold) {
        return "FAIL";
      }
      return "UNKNOWN";
    }
    case "MAXIMUM": {
      const threshold = bound + margin;
      if (interval.upper <= threshold) {
        return "PASS";
      }
      if (interval.lower > threshold) {
        return "FAIL";
      }
      return "UNKNOWN";
    }
    case "EXACT": {
      const lowerBound = bound - margin;
      const upperBound = bound + margin;
      if (interval.lower >= lowerBound && interval.upper <= upperBound) {
        return "PASS";
      }
      if (interval.upper < lowerBound || interval.lower > upperBound) {
        return "FAIL";
      }
      return "UNKNOWN";
    }
  }
}

/** Live support IDs for the rule's subject. */
function supportFor(
  rule: RuleSetRule,
  input: RulesVerifiedInput,
  view: RulesView,
): readonly string[] {
  const subject = rule.subject;
  const key =
    subject.type === "space-property"
      ? spaceSupportKey(subject.spaceId, subject.propertyKey, input.graph.modelId, input.version)
      : objectSupportKey(subject.objectId, subject.propertyKey, input.graph.modelId, input.version);
  return liveSupportIds(view, key);
}

/** The stronger of two epistemic statuses (by the model's own rank). */
function strongerStatus(a: EpistemicState, b: EpistemicState): EpistemicState {
  return epistemicRank(a) >= epistemicRank(b) ? a : b;
}

/** Canonical subject echo. */
function subjectEcho(rule: RuleSetRule): { readonly type: string; readonly id: string; readonly propertyKey: string } {
  const subject = rule.subject;
  return {
    type: subject.type,
    id: subject.type === "space-property" ? subject.spaceId : subject.objectId,
    propertyKey: subject.propertyKey,
  };
}

/** A PASS result. */
function pass(
  rule: RuleSetRule,
  assertion: PropertyAssertion,
  context: {
    readonly expected: string;
    readonly actual: string;
    readonly support: readonly string[];
  },
): RuleResult {
  return Object.freeze({
    ruleId: rule.ruleId,
    kind: rule.kind,
    subject: subjectEcho(rule),
    outcome: "PASS",
    expected: context.expected,
    actual: context.actual,
    epistemic: { assertionStatus: assertion.status },
    ...(context.support.length > 0 ? { evidenceRefs: Object.freeze([...context.support]) } : {}),
    detail: `the rule is satisfied on established content (${context.expected})`,
  });
}

/** A non-PASS result with its code. */
function unknown(
  rule: RuleSetRule,
  code: RuleResultCode,
  context: {
    readonly assertion?: PropertyAssertion;
    readonly expected?: string;
    readonly actual?: string;
    readonly detail: string;
  },
): RuleResult {
  return Object.freeze({
    ruleId: rule.ruleId,
    kind: rule.kind,
    subject: subjectEcho(rule),
    outcome: outcomeOfCode(code),
    code,
    ...(context.expected !== undefined ? { expected: context.expected } : {}),
    ...(context.actual !== undefined ? { actual: context.actual } : {}),
    ...(context.assertion !== undefined ? { epistemic: { assertionStatus: context.assertion.status } } : {}),
    detail: context.detail,
  });
}
