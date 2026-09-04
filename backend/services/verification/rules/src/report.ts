/**
 * The deterministic rules report (AISE-021 result model).
 *
 * A report is:
 *
 * - **machine-readable**: results carry stable codes, subjects,
 *   expected/actual values, evidence references and epistemic
 *   context;
 * - **reproducible**: identical inputs produce a bit-identical
 *   report — canonical result order (the rule set's own order),
 *   service-computed counts, and a deterministic digest over
 *   all report content;
 * - **timestamp-free in its digest-bearing computation**: no wall
 *   clock, no randomness, no environmental input participates in
 *   the digest or in the report identity;
 * - **integrity-pinned**: `reportId` is derived FROM the digest;
 *   caller-supplied digests, ids, counts or outcomes are never
 *   accepted.
 *
 * The report outcome is the work order's tri-state with FIXED
 * precedence: FAIL > UNKNOWN > PASS. PASS iff every rule result
 * is PASS; FAIL if any result affirmatively failed; UNKNOWN
 * otherwise. One indeterminate rule is enough to keep the report
 * from claiming compliance — never a lucky aggregate.
 */
import { canonicalJsonString, sha256Hex } from "@aise/engineering-model";
import type { AssuranceProfile } from "@aise/shared-contracts";
import type { RuleResult } from "./evaluate.js";
import type { ReadinessContextInput } from "./inputs.js";
import {
  RULE_KINDS,
  RULE_OUTCOMES,
  RULE_SUITE_VERSION,
  worstOutcome,
  type RuleKind,
  type RuleOutcome,
} from "./vocabulary.js";

/** Readiness context recorded on the report (passthrough, never rewritten). */
export interface RulesReadinessSummary {
  readonly taskId: string;
  readonly verdict: "READY" | "NOT_READY";
  readonly assuranceProfile: AssuranceProfile;
}

/** Service-computed result counts (canonical key order). */
export interface RuleResultCounts {
  readonly total: number;
  readonly pass: number;
  readonly fail: number;
  readonly unknown: number;
  readonly byKind: Readonly<Record<RuleKind, number>>;
}

/** The deterministic result of one rule evaluation run. */
export interface RulesReport {
  /** Deterministic report identity (derived from the digest). */
  readonly reportId: string;
  readonly modelId: string;
  readonly projectId: string;
  readonly version: number;
  /** The assurance profile this run executed under (AC-110). */
  readonly profile: AssuranceProfile;
  /** The rule-set identity + digest (the spec this run enforced). */
  readonly rulesetId: string;
  readonly rulesetDigest: string;
  /** The observed graph digest (service-observed, never caller-claimed). */
  readonly modelDigest: string;
  /** The observed mapping digest (present iff a mapping was provided). */
  readonly mappingDigest?: string;
  /** The rule-suite identity (digest-pinned semantics version). */
  readonly ruleSuiteVersion: string;
  readonly outcome: RuleOutcome;
  /** Results in canonical order (the rule set's own order). */
  readonly results: readonly RuleResult[];
  readonly counts: RuleResultCounts;
  /** Readiness context recorded as context (never rewritten). */
  readonly readiness?: RulesReadinessSummary;
  /** Canonical content digest of the report (without reportId). */
  readonly digest: string;
}

/** Input to report assembly (everything except derived fields). */
export interface RulesReportInput {
  readonly modelId: string;
  readonly projectId: string;
  readonly version: number;
  readonly profile: AssuranceProfile;
  readonly rulesetId: string;
  readonly rulesetDigest: string;
  readonly modelDigest: string;
  readonly mappingDigest?: string;
  readonly results: readonly RuleResult[];
  readonly readiness?: ReadinessContextInput;
}

/** Computes the canonical result counts (service-computed). */
export function computeCounts(results: readonly RuleResult[]): RuleResultCounts {
  const byKind = {} as Record<RuleKind, number>;
  for (const kind of RULE_KINDS) {
    byKind[kind] = 0;
  }
  let pass = 0;
  let fail = 0;
  let unknown = 0;
  for (const result of results) {
    byKind[result.kind] = (byKind[result.kind] ?? 0) + 1;
    if (result.outcome === "PASS") {
      pass += 1;
    } else if (result.outcome === "FAIL") {
      fail += 1;
    } else {
      unknown += 1;
    }
  }
  return { total: results.length, pass, fail, unknown, byKind };
}

/** Computes the deterministic report digest. */
export function rulesReportDigest(report: Omit<RulesReport, "digest" | "reportId">): string {
  const canonical = canonicalJsonString([
    "rules-report/v1",
    RULE_SUITE_VERSION,
    report.modelId,
    report.projectId,
    report.version,
    report.profile,
    report.rulesetId,
    report.rulesetDigest,
    report.modelDigest,
    report.mappingDigest ?? null,
    report.outcome,
    report.results.map((result) => [
      result.ruleId,
      result.kind,
      result.subject.type,
      result.subject.id,
      result.subject.propertyKey,
      result.outcome,
      result.code ?? null,
      result.expected ?? null,
      result.actual ?? null,
      result.epistemic?.assertionStatus ?? null,
      result.evidenceRefs ?? null,
      result.detail,
    ]),
    [
      report.counts.total,
      report.counts.pass,
      report.counts.fail,
      report.counts.unknown,
      RULE_KINDS.map((kind) => report.counts.byKind[kind]),
    ],
    report.readiness ?? null,
  ]);
  return sha256Hex(canonical);
}

/** Derives the deterministic report identity from the digest. */
export function deriveReportId(modelId: string, version: number, digest: string): string {
  return sha256Hex(canonicalJsonString(["rules-report-id/v1", modelId, version, digest]));
}

/** Assembles the deterministic report from the evaluators' output. */
export function buildRulesReport(input: RulesReportInput): RulesReport {
  const results = Object.freeze([...input.results]);
  const counts = computeCounts(results);
  const outcome = results.reduce<RuleOutcome>(
    (worst, result) => worstOutcome(worst, result.outcome),
    "PASS",
  );
  const partial: Omit<RulesReport, "digest" | "reportId"> = {
    modelId: input.modelId,
    projectId: input.projectId,
    version: input.version,
    profile: input.profile,
    rulesetId: input.rulesetId,
    rulesetDigest: input.rulesetDigest,
    modelDigest: input.modelDigest,
    ...(input.mappingDigest !== undefined ? { mappingDigest: input.mappingDigest } : {}),
    ruleSuiteVersion: RULE_SUITE_VERSION,
    outcome,
    results,
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
  const digest = rulesReportDigest(partial);
  return Object.freeze({
    ...partial,
    digest,
    reportId: deriveReportId(input.modelId, input.version, digest),
  });
}

/**
 * Filters a report's results by kind, outcome and/or code WITHOUT
 * changing canonical ordering: the result is the sub-sequence of
 * the report's canonical order.
 */
export function filterResults(
  report: RulesReport,
  predicate: {
    kind?: RuleKind;
    outcome?: RuleOutcome;
    code?: string;
  },
): readonly RuleResult[] {
  return report.results.filter((result) => {
    if (predicate.kind !== undefined && result.kind !== predicate.kind) {
      return false;
    }
    if (predicate.outcome !== undefined && result.outcome !== predicate.outcome) {
      return false;
    }
    if (predicate.code !== undefined && result.code !== predicate.code) {
      return false;
    }
    return true;
  });
}

/** Re-export for consumers (outcome vocabulary alignment). */
export { RULE_OUTCOMES };
