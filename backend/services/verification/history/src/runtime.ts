/**
 * Bounded runtime composition (AISE-031).
 *
 * `runHistoricalComparison` is the pure entry (identical to
 * `compareModelVersions` — provided for API parity with the
 * verification-family services). The optional service wrapper
 * adds nothing but observability and the CRITICAL-discipline
 * self-check: the produced report is re-validated through the
 * fail-closed validator BEFORE it is returned. A report that
 * fails its own contract never leaves the service.
 */
import { HistoryError } from "./errors.js";
import { compareModelVersions, HISTORY_LIMITS, type CompareInput, type HistoricalChangeReport } from "./report.js";
import { validateHistoricalChangeReport } from "./validate.js";

export interface HistoryServiceLimits {
  readonly maxRecords: number;
}

export interface HistoryService {
  /** Deterministic, read-only, fail-closed comparison of two committed versions. */
  compareVersions(input: CompareInput): HistoricalChangeReport;
  /** The enforced limits (observability). */
  readonly limits: HistoryServiceLimits;
}

/** The pure entry point (parity with sibling verification services). */
export function runHistoricalComparison(input: CompareInput): HistoricalChangeReport {
  return compareModelVersions(input);
}

/** Builds the bounded history service (self-checking, read-only). */
export function buildHistoryService(options?: {
  readonly onDebug?: (message: string, fields?: Record<string, unknown>) => void;
}): HistoryService {
  const onDebug = options?.onDebug ?? (() => undefined);
  const limits: HistoryServiceLimits = Object.freeze({ maxRecords: HISTORY_LIMITS.maxRecords });

  return Object.freeze({
    limits,
    compareVersions(input: CompareInput): HistoricalChangeReport {
      const report = compareModelVersions(input);
      // CRITICAL-discipline self-check: never return a report that
      // fails its own content-bound contract.
      try {
        validateHistoricalChangeReport(report);
      } catch (error) {
        throw new HistoryError("SELF_CHECK_FAILED", `the produced report failed self-validation: ${String((error as Error).message)}`);
      }
      onDebug("history.comparison.complete", {
        modelId: report.modelId,
        fromVersion: report.from.version,
        toVersion: report.to.version,
        records: report.summary.total,
        identical: report.summary.identical,
      });
      return report;
    },
  });
}
