/**
 * AISE deployed-browser verification (PROD-012).
 *
 * `bun tools/deployed-check.ts` — verifies the DEPLOYED production
 * deployment (default https://aise-tan.vercel.app, override with the
 * AISE_DEPLOYED_URL env variable) through a REAL headless Chromium,
 * mirroring the tools/smoke.ts doctrine adapted to a read-mostly remote
 * target on free-tier infrastructure (docs/free-tier-deployment.md):
 *
 *   1. preflight: prove Chromium is installed and print the executable —
 *      a missing browser FAILS EXPLICITLY with the exact install command
 *      (browser checks are never silently skipped);
 *   2. launches ONE Chromium (--no-sandbox: worker sandboxes lack the
 *      namespace privileges the sandboxed renderer needs) and runs the
 *      seven §4.3 checks SEQUENTIALLY with human-scale pacing, each in
 *      its own isolated BrowserContext (the session-lifecycle semantics
 *      require a pristine anonymous cookie jar):
 *        availability, shell-renders, session-lifecycle,
 *        responsive-desktop, responsive-mobile, accessibility,
 *        console-runtime-errors;
 *   3. one bounded retry per CHECK (never per assertion) for transient
 *      network failures — a check that fails twice fails; which checks
 *      retried is printed;
 *   4. ALWAYS cleans up: the browser closes no matter what, and every
 *      demo session the suite mints is logged out (the checks' own
 *      finally blocks; a finally cleanup that still fails is reported
 *      and fails the run);
 *   5. prints `DEPLOYED: PASS` / `DEPLOYED: FAIL` and exits 0/1 — every
 *      check prints one-line results with proof excerpts.
 *
 * The target is a verification target, NOT a load target: a single
 * browser, one page at a time, bounded waits everywhere.
 */

import { BUDGETS, TARGET_ENV_VAR, resolveTarget } from "./deployed/config";
import { chromiumExecutable, launchBrowser } from "./deployed/browser";
import { ConsoleGuard } from "./deployed/console-guard";
import {
  checkAccessibility,
  checkAvailability,
  checkConsoleRuntimeErrors,
  checkResponsiveDesktop,
  checkResponsiveMobile,
  checkSessionLifecycle,
  checkShellRenders,
  type CheckContext,
} from "./deployed/checks";
import { TransientCheckError, failedReport, type CheckReport } from "./deployed/verdict";

/** One entry of the §4.3 check sequence. */
interface CheckEntry {
  readonly name: string;
  readonly run: (ctx: CheckContext) => Promise<CheckReport>;
}

/** The mandated check order. */
const CHECKS: readonly CheckEntry[] = [
  { name: "availability", run: checkAvailability },
  { name: "shell-renders", run: checkShellRenders },
  { name: "session-lifecycle", run: checkSessionLifecycle },
  { name: "responsive-desktop", run: checkResponsiveDesktop },
  { name: "responsive-mobile", run: checkResponsiveMobile },
  { name: "accessibility", run: checkAccessibility },
  { name: "console-runtime-errors", run: checkConsoleRuntimeErrors },
];

/** A bounded sleep (never unbounded — always a §4.1 budget). */
function sleep(ms: number): Promise<"slept"> {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve("slept");
    }, ms);
  });
}

/** Reject with a TransientCheckError after the bound (never resolves). */
function timeoutAfter(ms: number, what: string): Promise<never> {
  return new Promise((_resolve, reject) => {
    setTimeout(() => {
      reject(new TransientCheckError(`${what} did not complete within ${ms} ms`, null));
    }, ms);
  });
}

/** Render an unknown error as a short string for evidence lines. */
function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Run one check with the ONE bounded retry (transient network failures
 * only — semantic assertion failures are deterministic evidence and are
 * never retried). A check that fails transiently twice FAILS.
 */
async function runCheckWithOneBoundedRetry(
  entry: CheckEntry,
  ctx: CheckContext,
): Promise<{ report: CheckReport; retried: boolean }> {
  try {
    return { report: await entry.run(ctx), retried: false };
  } catch (error) {
    if (!(error instanceof TransientCheckError)) {
      throw error;
    }
    console.log(
      `  retry: ${entry.name} — transient failure on the first attempt: ${error.message}`,
    );
    console.log(
      `  retry: backing off ${BUDGETS.retryBackoffMs} ms, then exactly one retry (a check that fails twice fails)`,
    );
    await sleep(BUDGETS.retryBackoffMs);
    try {
      return { report: await entry.run(ctx), retried: true };
    } catch (retryError) {
      if (retryError instanceof TransientCheckError) {
        return {
          report: failedReport(entry.name, [], [
            `FAIL  ${entry.name} failed transiently twice — ${retryError.message}`,
            `  first attempt: ${error.message}`,
            `  retry attempt: ${retryError.message}`,
          ]),
          retried: true,
        };
      }
      throw retryError;
    }
  }
}

async function main(): Promise<{ pass: boolean; cleanupFailures: readonly string[] }> {
  console.log("AISE deployed-browser verification (PROD-012)");
  const target = resolveTarget(process.env[TARGET_ENV_VAR]);
  console.log(
    `target: ${target.origin} (${target.source === "env" ? `from ${TARGET_ENV_VAR}` : "the default"})`,
  );

  // Preflight: a missing browser is an EXPLICIT failure, never a skip.
  const executable = chromiumExecutable();
  console.log(`chromium: ${executable}`);

  const browser = await Promise.race([
    launchBrowser(),
    timeoutAfter(BUDGETS.gotoMs, "the Chromium launch"),
  ]);
  console.log("chromium launched (--no-sandbox, single instance, sequential checks)");

  const guard = new ConsoleGuard();
  const cleanupFailures: string[] = [];
  const ctx: CheckContext = {
    browser,
    target,
    guard,
    noteCleanupFailure: (message) => {
      cleanupFailures.push(message);
    },
  };

  const reports: CheckReport[] = [];
  const retriedNames: string[] = [];
  try {
    for (const entry of CHECKS) {
      console.log(`==> ${entry.name}`);
      const { report, retried } = await runCheckWithOneBoundedRetry(entry, ctx);
      if (retried) {
        retriedNames.push(entry.name);
      }
      reports.push(report);
      if (entry !== CHECKS[CHECKS.length - 1]) {
        await sleep(BUDGETS.interCheckMs);
      }
    }
  } finally {
    // ALWAYS clean up: the browser closes no matter what happened above.
    await browser.close();
    console.log("cleanup: browser closed");
  }

  let pass = reports.length === CHECKS.length && reports.every((report) => report.pass);
  if (cleanupFailures.length > 0) {
    pass = false;
    for (const failure of cleanupFailures) {
      console.error(`  FAIL  cleanup — ${failure}`);
    }
  }

  console.log("— check results —");
  for (const report of reports) {
    console.log(`  ${report.pass ? "PASS " : "FAIL "} ${report.name}`);
    for (const line of report.lines) {
      console.log(`    ${line}`);
    }
  }
  if (retriedNames.length > 0) {
    console.log(`retried (transient): ${retriedNames.join(", ")}`);
  }

  return { pass, cleanupFailures };
}

void (async () => {
  const outcome = await main().catch((error: unknown) => {
    console.error(`runner error: ${describeError(error)}`);
    return { pass: false, cleanupFailures: [] as readonly string[] };
  });
  console.log(outcome.pass ? "DEPLOYED: PASS" : "DEPLOYED: FAIL");
  process.exit(outcome.pass ? 0 : 1);
})();
