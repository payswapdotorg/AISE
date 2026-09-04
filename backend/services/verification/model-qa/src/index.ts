/**
 * @aise/backend-model-qa — the AISE-014 self-consistency/geometry
 * QA service.
 *
 * The deterministic verification layer over the canonical
 * Reality Graph (architecture position: EVIDENCE+UNCERTAINTY →
 * **SELF-CONSISTENCY QA** → ENGINEERING RULES → HUMAN
 * VERIFICATION → AUTHORITATIVE MODEL).
 *
 * It is a VERIFIER, never a model authority: the Reality Graph
 * (AISE-011) stays the only canonical model authority, the
 * evidence subsystem (AISE-012) stays the authoritative
 * provenance mapping, and AISE-013 stays the only model-readiness
 * authority. QA composes read-only over all three through narrow
 * reader ports, reports machine-readable findings with stable
 * identities and deterministic digests, and fails closed at the
 * CRITICAL profile wherever an invariant cannot be established.
 *
 * Public surface:
 * - errors    — typed, fail-closed ModelQaError
 * - units     — exact SI factors for the model's unit vocabulary
 * - vocabulary— check families, finding codes, outcomes, the
 *   fixed blocking policy (profile-monotone, fail-closed)
 * - findings  — finding records + stable derived identities
 * - report    — the deterministic QAReport (canonical order,
 *   counts, digest, report id, order-preserving filters)
 * - inputs    — run inputs + reader-port contracts
 * - boundary  — fail-closed input validation (graph/mapping/
 *   readiness context all re-validated here)
 * - view      — the immutable read view the checks operate on
 * - checks/   — the five check families (geometry, topology,
 *   semantic, epistemic, cross-object)
 * - runtime   — bounded service composition (ports in, reports
 *   out; `runModelQa` is the pure library entry)
 */
export {
  ModelQaError,
  isModelQaError,
  toModelQaError,
  type ModelQaErrorCode,
  type ModelQaErrorDetails,
} from "./errors.js";

export {
  LENGTH_SI_FACTORS,
  AREA_SI_FACTORS,
  ANGLE_UNITS,
  qaUnitFamily,
  lengthToSiMeters,
  areaToSiSquareMeters,
  squareOfLengthUnit,
  formatQuantity,
  type QaLengthUnit,
  type QaAreaUnit,
  type QaAngleUnit,
  type QaUnit,
  type QaUnitFamily,
} from "./units.js";

export {
  QA_CHECK_FAMILIES,
  QA_FINDING_CODES,
  QA_FINDING_OUTCOMES,
  QA_PROFILES,
  QA_REPORT_OUTCOMES,
  QA_SEVERITIES,
  QA_CHECK_SUITE_VERSION,
  CODE_FAMILY,
  qaProfileRank,
  worstOutcome,
  severityForOutcome,
  isBlocking,
  minBlockingProfile,
  type QaCheckFamily,
  type QaFindingCode,
  type QaFindingOutcome,
  type QaReportOutcome,
  type QaSeverity,
} from "./vocabulary.js";

export {
  deriveFindingId,
  makeFinding,
  qaSubjectKey,
  compareFindings,
  type QaFinding,
  type QaFindingInput,
  type QaSubjectRef,
  type QaEpistemicContext,
} from "./findings.js";

export {
  buildQaReport,
  computeCounts,
  qaReportDigest,
  deriveReportId,
  filterFindings,
  type QaReport,
  type QaReportInput,
  type QaReadinessSummary,
  type QaFindingCounts,
} from "./report.js";

export { validateQaInput } from "./boundary.js";
export {
  type QaRunInput,
  type QaVerifiedInput,
  type ReadinessContextInput,
  type QaModelReader,
  type QaEvidenceMappingReader,
  type QaReadinessReader,
} from "./inputs.js";

export {
  buildQaView,
  supportBySubjectKey,
  type QaView,
} from "./view.js";

export {
  buildModelQaService,
  runModelQa,
  DEFAULT_QA_LIMITS,
  type ModelQaService,
  type BuildModelQaServiceOptions,
  type ModelQaLimits,
} from "./runtime.js";

export {
  runGeometryChecks,
  frameComparability,
} from "./checks/geometry.js";
export { runTopologyChecks } from "./checks/topology.js";
export { runSemanticChecks } from "./checks/semantic.js";
export { runEpistemicChecks } from "./checks/epistemic.js";
export { runCrossObjectChecks } from "./checks/crossobject.js";
