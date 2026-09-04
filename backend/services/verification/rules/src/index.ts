/**
 * @aise/backend-rules — the AISE-021 engineering rule engine.
 *
 * Machine-evaluable dimensions, tolerances and specification
 * rules with PASS/FAIL/UNKNOWN semantics over the canonical
 * Reality Graph (AISE-011), the authoritative evidence mapping
 * (AISE-012), and the AISE-013 readiness authority — a
 * deterministic evaluator, never a model authority.
 *
 * Public surface:
 * - errors    — typed, fail-closed RulesError
 * - units     — exact SI conversion factors (interval comparison)
 * - vocabulary — kinds, operators, outcomes, codes, the fixed
 *   monotone gating tables
 * - rule      — machine-evaluable rule/rule-set definitions
 *   (validated, content-pinned, frozen; CRITICAL sets must
 *   declare a readiness gate)
 * - inputs    — narrow reader ports + run-input records
 * - boundary  — fail-closed input validation (re-validation +
 *   digest re-derivation; no profile downgrade)
 * - view      — the immutable read view (subjects + support)
 * - evaluate  — the deterministic evaluators (uncertainty-aware
 *   interval comparison; the fixed gating ladder)
 * - report    — the deterministic tri-state report
 * - runtime   — bounded composition (runRuleEvaluation pure
 *   entry + the port-driven service)
 */
export {
  RulesError,
  isRulesError,
  toRulesError,
  type RulesErrorDetails,
  type RulesErrorCode,
} from "./errors.js";

export {
  ANGLE_SI_FACTORS,
  AREA_SI_FACTORS,
  LENGTH_SI_FACTORS,
  angleToSiRadians,
  areaToSiSquareMeters,
  formatQuantity,
  lengthToSiMeters,
  ruleUnitFamily,
  siBaseUnitOf,
  toSiBase,
  type RuleAngleUnit,
  type RuleAreaUnit,
  type RuleLengthUnit,
  type RuleUnit,
  type RuleUnitFamily,
} from "./units.js";

export {
  FAIL_CLASS_CODES,
  RULE_KINDS,
  RULE_OPERATORS,
  RULE_OUTCOMES,
  RULE_PROFILES,
  RULE_RESULT_CODES,
  RULE_SUITE_VERSION,
  STATUS_FLOOR_BY_PROFILE,
  evidenceSupportRequired,
  outcomeOfCode,
  ruleProfileRank,
  uncertaintyRequired,
  worstOutcome,
  type RuleKind,
  type RuleOperator,
  type RuleOutcome,
  type RuleResultCode,
} from "./vocabulary.js";

export {
  ruleSet,
  runProfileSatisfies,
  statusRank,
  type DimensionRule,
  type ReadinessGate,
  type Rule,
  type RuleSet,
  type RuleSetInput,
  type RuleSubject,
  type SpecificationRule,
} from "./rule.js";

export {
  validateRulesInput,
  validateReadinessContext,
} from "./boundary.js";
export type {
  ReadinessContextInput,
  RuleSetLike,
  RulesEvidenceMappingReader,
  RulesModelReader,
  RulesReadinessReader,
  RulesRunInput,
  RulesVerifiedInput,
} from "./inputs.js";

export {
  buildRulesView,
  liveSupportIds,
  objectSupportKey,
  spaceSupportKey,
  uncertaintyInterval,
  type RulesView,
  type UncertaintyInterval,
} from "./view.js";

export {
  evaluateRules,
  type EvaluationOutput,
  type RuleResult,
} from "./evaluate.js";

export {
  buildRulesReport,
  computeCounts,
  deriveReportId,
  filterResults,
  rulesReportDigest,
  type RuleResultCounts,
  type RulesReadinessSummary,
  type RulesReport,
  type RulesReportInput,
} from "./report.js";

export {
  DEFAULT_RULES_LIMITS,
  buildRulesService,
  runRuleEvaluation,
  type BuildRulesServiceOptions,
  type RulesLimits,
  type RulesService,
} from "./runtime.js";
