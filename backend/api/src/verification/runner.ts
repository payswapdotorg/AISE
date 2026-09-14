/**
 * AISE-023 — the verification RUNNER (`runVerification`).
 *
 * THE ONLY formal deterministic verification authority entry point
 * (architecture-lock "Authority" item 4).
 *
 * DETERMINISM CONTRACT: the input's ARRAY ORDER is canonicalized away —
 * nodes, relationships and evidence facts are processed over id-sorted
 * COPIES (the input itself is never touched, frozen or not) — and every
 * finding message is built from sorted data. The same input therefore
 * always yields byte-identical findings, and two inputs differing only in
 * array order yield byte-identical reports.
 *
 * FINDING, NEVER FIXING: the runner folds the independent check families
 * into ONE report; it never mutates, repairs, deduplicates graph objects
 * or rewrites another authority's verdict.
 *
 * STABLE TOTAL ORDER: findings are sorted by code (code-unit order), then
 * subjectNodeIds (element-wise lexicographic, then length), then message —
 * a total deterministic order, so report bytes are reproducible.
 */

import {
  checkEvidence,
  checkModelDiscipline,
  checkReadiness,
  checkSemantics,
  checkTopology,
} from "./checks";
import { FINDING_CODES, type Finding, type VerificationInput, type VerificationReport, type VerificationSummary } from "./model";

/** Lexicographic comparison of two id arrays (element-wise, then length). */
function compareIdArrays(a: readonly string[], b: readonly string[]): number {
  const shared = Math.min(a.length, b.length);
  for (let index = 0; index < shared; index += 1) {
    const left = a[index] ?? "";
    const right = b[index] ?? "";
    if (left !== right) {
      return left < right ? -1 : 1;
    }
  }
  return a.length - b.length;
}

/** The stable total finding order: code, then subjects, then message. */
function compareFindings(a: Finding, b: Finding): number {
  if (a.code !== b.code) {
    return a.code < b.code ? -1 : 1;
  }
  const subjects = compareIdArrays(a.subjectNodeIds, b.subjectNodeIds);
  if (subjects !== 0) {
    return subjects;
  }
  if (a.message !== b.message) {
    return a.message < b.message ? -1 : 1;
  }
  return 0;
}

/** Counters over the findings; byCode carries every registry key (0 default). */
function summarize(findings: readonly Finding[]): VerificationSummary {
  let errors = 0;
  let warnings = 0;
  let infos = 0;
  const byCode = {} as Record<(typeof FINDING_CODES)[number], number>;
  for (const code of FINDING_CODES) {
    byCode[code] = 0;
  }
  for (const item of findings) {
    byCode[item.code] = (byCode[item.code] ?? 0) + 1;
    if (item.severity === "error") {
      errors += 1;
    } else if (item.severity === "warning") {
      warnings += 1;
    } else {
      infos += 1;
    }
  }
  return { errors, warnings, infos, byCode };
}

/**
 * Run every deterministic check over the input and return the sorted report.
 * Pure: no clock, no randomness, no I/O, no input mutation.
 */
export function runVerification(input: VerificationInput): VerificationReport {
  // Canonical id-sorted COPIES — input array order can never leak into the
  // report, and frozen inputs are never mutated.
  const nodes = [...input.graphSnapshot.nodes].sort((a, b) =>
    a.nodeId < b.nodeId ? -1 : a.nodeId > b.nodeId ? 1 : 0,
  );
  const relationships = [...input.graphSnapshot.relationships].sort((a, b) =>
    a.relationshipId < b.relationshipId ? -1 : a.relationshipId > b.relationshipId ? 1 : 0,
  );
  const evidenceFacts = [...input.evidenceFacts].sort((a, b) =>
    a.evidenceId < b.evidenceId ? -1 : a.evidenceId > b.evidenceId ? 1 : 0,
  );

  // Independent, order-insensitive check families — concatenated, then
  // sorted into the stable total order.
  const findings = [
    ...checkModelDiscipline(nodes),
    ...checkTopology(nodes, relationships),
    ...checkSemantics(nodes, relationships),
    ...checkEvidence(nodes, evidenceFacts),
    ...checkReadiness(input.assuranceReport),
  ].sort(compareFindings);

  return { findings, summary: summarize(findings) };
}
