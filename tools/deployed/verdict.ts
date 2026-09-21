/**
 * PROD-012 — deployed-browser verification: verdict plumbing.
 *
 * Mirrors tools/smoke.ts: every check reports one PASS/FAIL with one-line
 * proof excerpts, and the runner prints a single deterministic
 * `DEPLOYED: PASS` / `DEPLOYED: FAIL` verdict line and exits 0/1.
 */

/** One assertion inside a check: named, boolean, with a proof detail. */
export interface CheckAssertion {
  readonly name: string;
  readonly pass: boolean;
  readonly detail: string;
}

/** The outcome of one named check (§4.3) — reported separately. */
export interface CheckReport {
  /** The check's §4.3 name, e.g. "availability". */
  readonly name: string;
  /** True only when every assertion passed and no run-level defect hit. */
  readonly pass: boolean;
  /** One-line proof lines (assertion results / captured evidence). */
  readonly lines: readonly string[];
}

/**
 * A transient (network/navigation) failure inside a check. The runner
 * retries a check ONCE when — and only when — it fails this way: semantic
 * assertion failures are deterministic evidence and are never retried
 * (§4.1: the bounded retry exists for transient network flakes only).
 */
export class TransientCheckError extends Error {
  constructor(
    message: string,
    readonly causeDetail: unknown,
  ) {
    super(message);
    this.name = "TransientCheckError";
  }
}

/** Build a failed CheckReport from assertions (all lines are kept). */
export function failedReport(
  name: string,
  assertions: readonly CheckAssertion[],
  extraLines: readonly string[] = [],
): CheckReport {
  return {
    name,
    pass: false,
    lines: [...reportLines(assertions), ...extraLines],
  };
}

/** Build a passed CheckReport from assertions (all lines are kept). */
export function passedReport(
  name: string,
  assertions: readonly CheckAssertion[],
  extraLines: readonly string[] = [],
): CheckReport {
  return {
    name,
    pass: true,
    lines: [...reportLines(assertions), ...extraLines],
  };
}

/** The proof lines for a set of assertions (the smoke.ts print style). */
function reportLines(assertions: readonly CheckAssertion[]): string[] {
  return assertions.map(
    (assertion) => `${assertion.pass ? "pass" : "FAIL"}  ${assertion.name} — ${assertion.detail}`,
  );
}

/** Append a line to a CheckReport (immutable — returns a new report). */
export function withLine(report: CheckReport, line: string): CheckReport {
  return { ...report, lines: [...report.lines, line] };
}

/** True when every assertion passes (an empty list cannot happen by contract). */
export function allPassed(assertions: readonly CheckAssertion[]): boolean {
  return assertions.length > 0 && assertions.every((assertion) => assertion.pass);
}
