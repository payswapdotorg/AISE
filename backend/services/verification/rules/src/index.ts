/**
 * @aise/backend-rules — the AISE-021 engineering rule engine plus
 * the AISE-029 read-only Reality-vs-Design comparison surface.
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

export {
  REALITY_DESIGN_LIMITATIONS,
  compareRealityToDesign,
  validateComparisonReport,
  comparisonDigest,
  type ComparisonInput,
  type ComparisonReport,
  type Correspondence,
  type DesignElement,
  type EvidenceRef,
  type Mismatch,
  type RealityElement,
} from "./reality-design/comparison.js";
