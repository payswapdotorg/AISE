/**
 * Generated-BOQ verification + the typed source-vs-generated seal (PROD-025).
 *
 * `verifySolutionBoq(boq)` is the SELF-CONTAINED integrity check of a
 * generated BOQ document (used by the derivation's defense-in-depth guard
 * and by the backend readback endpoint):
 *
 *  - the typed seal (`artifactKind` literal) and the PROPOSED epistemic
 *    class;
 *  - every content identity RE-DERIVES: line ids from their semantic
 *    payload (including the assumption inventory), assumption ids from
 *    their statements, trace ids through the CONTRACT's derivation, the
 *    document's `boqId` from its line/assumption inventory;
 *  - the CONTRACT's trace-set invariants (version pin, snapshot pin,
 *    non-empty contributions — the contract's own checkers);
 *  - section/line coherence and assumption-reference resolution;
 *  - LINE/TOTAL consistency: per (dimension, unit), the sum of the added
 *    and removed line values equals the ENGINE-echoed net totals
 *    (added/removed) — a generated BOQ can never drift from the engine's
 *    quantity authority;
 *  - the BIDIRECTIONAL NAVIGATION ROUND TRIP closes (navigate.ts).
 *
 * `isSolutionGeneratedBoq(value)` is the TYPE GUARD of the
 * source-vs-generated distinction: true ONLY for documents carrying the
 * `"solution-generated-boq"` seal — a source BOQ record (BOQ Lens
 * `BoqRecord`) is structurally NEVER a solution-generated BOQ (proven by
 * the discrimination tests).
 */

import {
  checkSolutionBoqLineTrace,
  checkSolutionBoqTraceSet,
} from "@aise/solution-contract";
import type { QuantityTotal } from "@aise/solution-engine";
import { roundFloat } from "@aise/solution-engine";
import {
  deriveSolutionBoqAssumptionId,
  deriveSolutionBoqId,
  deriveSolutionBoqLineId,
  lineIdentityOf,
  solutionBoqLineTraceId,
} from "./identity";
import type { SolutionBoq } from "./model";
import { assertBoqNavigationRoundTrip } from "./navigate";

/* ------------------------------------------------------------------ */
/* The typed seal                                                       */
/* ------------------------------------------------------------------ */

/**
 * Whether a value is a SOLUTION-GENERATED BOQ document (the typed
 * source-vs-generated distinction). Structural: the literal
 * `artifactKind: "solution-generated-boq"` seal + the identity fields.
 */
export function isSolutionGeneratedBoq(value: unknown): value is SolutionBoq {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const candidate = value as Partial<SolutionBoq> & { artifactKind?: unknown };
  return (
    candidate.artifactKind === "solution-generated-boq" &&
    typeof candidate.boqId === "string" &&
    typeof candidate.solutionId === "string" &&
    typeof candidate.versionNumber === "number" &&
    Array.isArray(candidate.lines) &&
    Array.isArray(candidate.traceSet?.lineTraces)
  );
}

/* ------------------------------------------------------------------ */
/* Verification                                                         */
/* ------------------------------------------------------------------ */

/** The verification summary of a verified generated BOQ. */
export interface SolutionBoqVerificationSummary {
  readonly boqId: string;
  readonly solutionId: string;
  readonly versionNumber: number;
  readonly validationSnapshotRef: string;
  readonly lineCount: number;
  readonly sectionCount: number;
  readonly assumptionCount: number;
  readonly operationCount: number;
  readonly totals: readonly QuantityTotal[];
}

export type SolutionBoqVerification =
  | { readonly ok: true; readonly summary: SolutionBoqVerificationSummary }
  | { readonly ok: false; readonly findings: readonly string[] };

/** Verifies one generated BOQ document (pure; consumes it read-only). */
export function verifySolutionBoq(boq: SolutionBoq): SolutionBoqVerification {
  const findings: string[] = [];

  /* The typed seals. */
  if (boq.artifactKind !== "solution-generated-boq") {
    findings.push(`artifactKind must be the literal 'solution-generated-boq'`);
  }
  if (boq.epistemicClass !== "PROPOSED") {
    findings.push(`epistemicClass must be the literal 'PROPOSED'`);
  }
  if (boq.lines.length === 0) {
    findings.push("a generated BOQ carries at least one line");
  }

  /* The document identity re-derives from its line/assumption inventory. */
  const expectedBoqId = deriveSolutionBoqId({
    solutionId: boq.solutionId,
    versionNumber: boq.versionNumber,
    validationSnapshotRef: boq.validationSnapshotRef,
    lineIds: boq.lines.map((line) => line.boqLineId),
    assumptionIds: boq.assumptions.map((assumption) => assumption.assumptionId),
    ...(boq.sourceBoqRef === undefined
      ? {}
      : { sourceBoqImportId: boq.sourceBoqRef.importId }),
  });
  if (expectedBoqId !== boq.boqId) {
    findings.push(
      `boqId '${boq.boqId}' does not re-derive from the document's inventory ` +
        `(expected ${expectedBoqId})`,
    );
  }

  /* Line identities re-derive (semantic payload + assumption inventory). */
  for (const line of boq.lines) {
    const expectedLineId = deriveSolutionBoqLineId(lineIdentityOf(line));
    if (expectedLineId !== line.boqLineId) {
      findings.push(
        `line '${line.boqLineId}' identity does not re-derive from its payload ` +
          `(expected ${expectedLineId})`,
      );
    }
    const expectedTraceId = solutionBoqLineTraceId({
      solutionId: line.trace.solutionId,
      versionNumber: line.trace.versionNumber,
      boqLineId: line.boqLineId,
    });
    if (expectedTraceId !== line.traceId || expectedTraceId !== line.trace.traceId) {
      findings.push(`line '${line.boqLineId}' trace id does not re-derive`);
    }
    if (line.contributions.length === 0) {
      findings.push(`line '${line.boqLineId}' has no contributing operation`);
    }
    if (line.quantity.unit !== line.unit) {
      findings.push(`line '${line.boqLineId}' unit disagrees with its quantity unit`);
    }
    if (line.trace.quantity.value !== line.quantity.value) {
      findings.push(`line '${line.boqLineId}' trace quantity disagrees with the line quantity`);
    }
  }

  /* Assumption identities re-derive; every reference resolves. */
  const assumptionIds = new Set(boq.assumptions.map((assumption) => assumption.assumptionId));
  for (const assumption of boq.assumptions) {
    if (deriveSolutionBoqAssumptionId(assumption) !== assumption.assumptionId) {
      findings.push(`assumption '${assumption.assumptionId}' identity does not re-derive`);
    }
  }
  for (const line of boq.lines) {
    for (const reference of line.assumptionRefs) {
      if (!assumptionIds.has(reference)) {
        findings.push(`line '${line.boqLineId}' references unknown assumption '${reference}'`);
      }
    }
  }

  /* The contract's trace-set invariants (version pin, snapshot pin). */
  for (const finding of checkSolutionBoqTraceSet(boq.traceSet)) {
    findings.push(`contract trace-set invariant ${finding.code}: ${finding.detail}`);
  }
  for (const line of boq.lines) {
    for (const finding of checkSolutionBoqLineTrace(line.trace)) {
      findings.push(
        `contract line-trace invariant ${finding.code} on '${line.boqLineId}': ` +
          `${finding.detail}`,
      );
    }
  }

  /* Sections and lines agree. */
  const lineIds = new Set(boq.lines.map((line) => line.boqLineId));
  const listed = new Set<string>();
  for (const section of boq.sections) {
    for (const lineId of section.lineIds) {
      if (!lineIds.has(lineId)) {
        findings.push(`section '${section.sectionId}' lists unknown line '${lineId}'`);
      }
      if (listed.has(lineId)) {
        findings.push(`line '${lineId}' is listed in more than one section place`);
      }
      listed.add(lineId);
    }
  }
  for (const line of boq.lines) {
    if (!listed.has(line.boqLineId)) {
      findings.push(`line '${line.boqLineId}' is not listed in any section`);
    }
  }

  /* Line/total consistency against the ENGINE-echoed net totals. */
  const addedByBucket = new Map<string, number>();
  const removedByBucket = new Map<string, number>();
  for (const line of boq.lines) {
    const key = `${line.quantity.dimension}\u0000${line.quantity.unit}`;
    const bucket =
      line.direction === "removed" ? removedByBucket : line.direction === "added" ? addedByBucket : null;
    if (bucket === null) {
      continue; // 'changed' lines are not part of the engine's added/removed totals
    }
    bucket.set(key, roundFloat((bucket.get(key) ?? 0) + line.quantity.value));
  }
  for (const total of boq.totals) {
    const key = `${total.dimension}\u0000${total.unit}`;
    const added = addedByBucket.get(key);
    const removed = removedByBucket.get(key);
    if (total.addedValue !== 0 && added === undefined) {
      findings.push(
        `totals report ${total.addedValue} ${total.unit} added but no added line covers it`,
      );
    } else if (added !== undefined && added !== total.addedValue) {
      findings.push(
        `added lines sum to ${added} ${total.unit} but the engine totals report ` +
          `${total.addedValue}`,
      );
    }
    if (total.removedValue !== 0 && removed === undefined) {
      findings.push(
        `totals report ${total.removedValue} ${total.unit} removed but no removed line covers it`,
      );
    } else if (removed !== undefined && removed !== total.removedValue) {
      findings.push(
        `removed lines sum to ${removed} ${total.unit} but the engine totals report ` +
          `${total.removedValue}`,
      );
    }
  }

  /* The bidirectional navigation round trip closes. */
  try {
    assertBoqNavigationRoundTrip(boq);
  } catch (error) {
    findings.push(error instanceof Error ? error.message : "navigation round trip failed");
  }

  if (findings.length > 0) {
    return { ok: false, findings };
  }
  return {
    ok: true,
    summary: {
      boqId: boq.boqId,
      solutionId: boq.solutionId,
      versionNumber: boq.versionNumber,
      validationSnapshotRef: boq.validationSnapshotRef,
      lineCount: boq.lines.length,
      sectionCount: boq.sections.length,
      assumptionCount: boq.assumptions.length,
      operationCount: boq.operationIds.length,
      totals: boq.totals.map((total) => ({ ...total })),
    },
  };
}
