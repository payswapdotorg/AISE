/**
 * The deterministic QA report (AISE-014 result model).
 *
 * A report is:
 *
 * - **machine-readable**: findings carry stable codes, subjects,
 *   values, evidence references and epistemic context;
 * - **reproducible**: identical inputs produce a bit-identical
 *   report — canonical finding order, service-computed counts,
 *   and a deterministic digest over all report content;
 * - **timestamp-free in its digest-bearing computation**: no wall
 *   clock, no randomness, no environmental input participates in
 *   the digest or in finding/report identities;
 * - **integrity-pinned**: `reportId` is derived FROM the digest;
 *   caller-supplied digests, ids, counts, severities or blocking
 *   bits are never accepted.
 *
 * `PASS` is the report outcome iff there are zero findings. With
 * findings present, the outcome is the worst finding outcome
 * (CONTRADICTION > INSUFFICIENT_EVIDENCE > UNEVALUABLE). The
 * report invents no "conditional" authority state — downstream
 * policy around conditional readiness is AISE-020's.
 */
import { canonicalJsonString, sha256Hex } from "@aise/engineering-model";
import type { AssuranceProfile } from "@aise/shared-contracts";
import { compareFindings, qaSubjectKey, type QaFinding } from "./findings.js";
import type { QaFindingOutcome, QaSeverity } from "./vocabulary.js";
import type { ReadinessContextInput } from "./inputs.js";
import {
  QA_CHECK_FAMILIES,
  QA_CHECK_SUITE_VERSION,
  worstOutcome,
  type QaCheckFamily,
  type QaReportOutcome,
} from "./vocabulary.js";

/** Readiness context recorded on the report (passthrough, never rewritten). */
export interface QaReadinessSummary {
  readonly taskId: string;
  readonly verdict: "READY" | "NOT_READY";
  readonly assuranceProfile: AssuranceProfile;
}

/** Service-computed finding counts (canonical key order). */
export interface QaFindingCounts {
  readonly total: number;
  readonly blocking: number;
  readonly byFamily: Readonly<Record<QaCheckFamily, number>>;
  readonly byOutcome: Readonly<Record<QaFindingOutcome, number>>;
}

/** The deterministic result of one QA run. */
export interface QaReport {
  /** Deterministic report identity (derived from the digest). */
  readonly reportId: string;
  readonly modelId: string;
  readonly projectId: string;
  readonly version: number;
  /** The assurance profile this run executed under (AC-110). */
  readonly profile: AssuranceProfile;
  /** The observed graph digest (service-observed, never caller-claimed). */
  readonly modelDigest: string;
  /** The observed mapping digest (present iff a mapping was provided). */
  readonly mappingDigest?: string;
  /** The check-suite identity (digest-pinned semantics version). */
  readonly checkSuiteVersion: string;
  readonly outcome: QaReportOutcome;
  /** Findings in canonical order (family, code, subject, …). */
  readonly findings: readonly QaFinding[];
  readonly counts: QaFindingCounts;
  /** Readiness context recorded as context (never rewritten). */
  readonly readiness?: QaReadinessSummary;
  /** Canonical content digest of the report (without reportId). */
  readonly digest: string;
}

/** Input to report assembly (everything except derived fields). */
export interface QaReportInput {
  readonly modelId: string;
  readonly projectId: string;
  readonly version: number;
  readonly profile: AssuranceProfile;
  readonly modelDigest: string;
  readonly mappingDigest?: string;
  readonly findings: readonly QaFinding[];
  readonly readiness?: ReadinessContextInput;
}

/** Computes the canonical finding counts (service-computed). */
export function computeCounts(findings: readonly QaFinding[]): QaFindingCounts {
  const byFamily = {} as Record<QaCheckFamily, number>;
  for (const family of QA_CHECK_FAMILIES) {
    byFamily[family] = 0;
  }
  const byOutcome: Record<QaFindingOutcome, number> = {
    CONTRADICTION: 0,
    INSUFFICIENT_EVIDENCE: 0,
    UNEVALUABLE: 0,
  };
  let blocking = 0;
  for (const finding of findings) {
    byFamily[finding.family] = (byFamily[finding.family] ?? 0) + 1;
    byOutcome[finding.outcome] = (byOutcome[finding.outcome] ?? 0) + 1;
    if (finding.blocking) {
      blocking += 1;
    }
  }
  return { total: findings.length, blocking, byFamily, byOutcome };
}

/** Computes the deterministic report digest. */
export function qaReportDigest(report: Omit<QaReport, "digest" | "reportId">): string {
  const canonical = canonicalJsonString([
    "qa-report/v1",
    QA_CHECK_SUITE_VERSION,
    report.modelId,
    report.projectId,
    report.version,
    report.profile,
    report.modelDigest,
    report.mappingDigest ?? null,
    report.outcome,
    report.findings.map((finding) => [
      finding.findingId,
      finding.code,
      finding.family,
      finding.outcome,
      finding.severity,
      finding.blocking,
      qaSubjectKey(finding.subject),
      (finding.related ?? []).map(qaSubjectKey),
      finding.expected ?? null,
      finding.actual ?? null,
      finding.evidenceRefs ?? null,
      finding.epistemic ?? null,
      finding.detail,
    ]),
    [
      report.counts.total,
      report.counts.blocking,
      QA_CHECK_FAMILIES.map((family) => report.counts.byFamily[family]),
      [
        report.counts.byOutcome.CONTRADICTION,
        report.counts.byOutcome.INSUFFICIENT_EVIDENCE,
        report.counts.byOutcome.UNEVALUABLE,
      ],
    ],
    report.readiness ?? null,
  ]);
  return sha256Hex(canonical);
}

/** Derives the deterministic report identity from the digest. */
export function deriveReportId(
  modelId: string,
  version: number,
  digest: string,
): string {
  return sha256Hex(canonicalJsonString(["qa-report-id/v1", modelId, version, digest]));
}

/** Assembles the deterministic report from checks output. */
export function buildQaReport(input: QaReportInput): QaReport {
  const findings = Object.freeze([...input.findings].sort(compareFindings).map((finding) => Object.freeze(finding)));
  const counts = computeCounts(findings);
  const outcome = worstOutcome(findings.map((finding) => finding.outcome));
  const partial: Omit<QaReport, "digest" | "reportId"> = {
    modelId: input.modelId,
    projectId: input.projectId,
    version: input.version,
    profile: input.profile,
    modelDigest: input.modelDigest,
    ...(input.mappingDigest !== undefined ? { mappingDigest: input.mappingDigest } : {}),
    checkSuiteVersion: QA_CHECK_SUITE_VERSION,
    outcome,
    findings,
    counts,
    ...(input.readiness !== undefined
      ? {
          readiness: {
            taskId: input.readiness.taskId,
            verdict: input.readiness.verdict,
            assuranceProfile: input.readiness.assuranceProfile,
          },
        }
      : {}),
  };
  const digest = qaReportDigest(partial);
  return Object.freeze({ ...partial, digest, reportId: deriveReportId(input.modelId, input.version, digest) });
}

/**
 * Filters a report's findings by severity, family, outcome and/or
 * blocking status WITHOUT changing canonical ordering: the result
 * is the sub-sequence of the report's canonical order.
 */
export function filterFindings(
  report: QaReport,
  predicate: {
    severity?: QaSeverity;
    family?: QaCheckFamily;
    outcome?: QaFindingOutcome;
    blocking?: boolean;
  },
): readonly QaFinding[] {
  return report.findings.filter((finding) => {
    if (predicate.severity !== undefined && finding.severity !== predicate.severity) {
      return false;
    }
    if (predicate.family !== undefined && finding.family !== predicate.family) {
      return false;
    }
    if (predicate.outcome !== undefined && finding.outcome !== predicate.outcome) {
      return false;
    }
    if (predicate.blocking !== undefined && finding.blocking !== predicate.blocking) {
      return false;
    }
    return true;
  });
}
