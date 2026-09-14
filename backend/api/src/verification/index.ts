/**
 * AISE-023 — QA/verification v2 public surface.
 *
 * THE single formal deterministic verification authority
 * (architecture-lock "Authority" item 4): a frozen finding-code registry
 * with a documented severity table, five independent check families
 * (model discipline, topology, semantics, evidence closure, readiness
 * cross-reference) and one pure deterministic runner.
 *
 * This is a domain library: NO router/server wiring is exported here
 * (integration into the request surface is AISE-036/038's explicitly
 * reviewed change). Read model.ts (the frozen registry + authority notes)
 * and runner.ts (determinism + ordering contract) before use.
 */

export { FINDING_CODES, SEVERITY_BY_CODE, LABEL_PROPERTY_KEY, SEMANTIC_KIND_PROPERTY_KEY, SEMANTIC_KIND_TO_NODE_KIND } from "./model";
export type {
  FindingSeverity,
  FindingCode,
  Finding,
  VerificationUncertainty,
  VerificationProperty,
  VerificationNode,
  VerificationGraphSnapshot,
  VerificationInput,
  VerificationSummary,
  VerificationReport,
} from "./model";
export { runVerification } from "./runner";
