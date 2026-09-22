/**
 * PROD-012 — deployed-browser verification: the console/runtime error guard.
 *
 * One collector instance spans the WHOLE run; every page the suite creates
 * is wired into it at creation time (see browser.ts), so the final
 * console-runtime-errors check observes every page interaction of every
 * preceding check — exactly the §4.3 contract:
 *
 *   Blocking = any pageerror, any console.error call, any failed
 *   document/script/style/font load (HTTP >= 400 or network error).
 *   XHR/fetch 4xx that the app HANDLES by design are not blocking — the
 *   suite excludes exactly the expected-by-design responses below,
 *   counting and reporting them separately, never silently dropping.
 *
 * Expected-by-design (the product's OWN handled failure modes):
 *   - GET /v1/auth/whoami → 401: the anonymous gate probe on every fresh
 *     load and the suite's own fail-closed post-logout verification; the
 *     app renders the auth gate / logged-out state (apps/web/src/app/
 *     gate.ts), it never crashes;
 *   - GET /v1/auth/whoami → network error: the gate's handled probe-error
 *     state ("The auth check on this origin could not be completed" +
 *     Retry — apps/web/src/app/AuthGate.tsx).
 *
 * Anything else — any other 4xx/5xx on xhr/fetch, any failed
 * document/script/style/font load — blocks the run.
 */

import type { ConsoleMessage, Page, Request, Response } from "playwright";

/** Resource classes whose HTTP/network failure is ALWAYS blocking. */
const ALWAYS_BLOCKING_RESOURCE_TYPES = new Set([
  "document",
  "script",
  "stylesheet",
  "font",
]);

/** Resource classes where only UNEXPECTED failures are blocking. */
const FETCH_LIKE_RESOURCE_TYPES = new Set(["xhr", "fetch"]);

/** The network-error pseudo-status used for requestfailed records. */
const NETWORK_ERROR_STATUS = -1;

/**
 * Expected-by-design (method, pathname, status) triples. Status -1 means
 * a network-level failure the product handles the same honest way.
 */
const EXPECTED_FAILURES: ReadonlySet<string> = new Set([
  JSON.stringify({ method: "GET", path: "/v1/auth/whoami", status: 401 }),
  JSON.stringify({ method: "GET", path: "/v1/auth/whoami", status: NETWORK_ERROR_STATUS }),
]);

/**
 * Expected-by-design ROUTE FAMILIES (parameterized paths). Each entry:
 * method, path regex, status — same doctrine as the exact triples above,
 * for routes whose path embeds a resource id.
 *
 * 2026-09-22 (PROD-030 follow-up): `GET /v1/adapter/projects/:id/task-flow`
 * → 404 is the product's OWN designed provider-gated state — the client
 * contract (apps/web/src/app/api.ts loadTaskFlowLive) documents the 404
 * as the typed HTTP failure whose caller renders the explicit
 * "task-flow objects not served on this deployment" unavailable state
 * (apps/web/src/app/task-first.tsx isNotFoundHttp branch — reason +
 * impact, never a crash). The joined endpoint is a future capability;
 * deployments without it answer 404 by design. Excluded per §4.3's
 * "XHR/fetch 4xx the app HANDLES by design are not blocking".
 */
const EXPECTED_FAILURE_ROUTE_FAMILIES: ReadonlyArray<{
  readonly method: string;
  readonly path: RegExp;
  readonly status: number;
}> = [
  {
    method: "GET",
    path: /^\/v1\/adapter\/projects\/[^/]+\/task-flow$/,
    status: 404,
  },
];

/**
 * The browser's OWN console log line for an expected-by-design failure.
 * Chromium writes `Failed to load resource: the server responded with a
 * status of 401` (with the resource URL in the message location) for the
 * same handled 401 the request-level exclusion covers — that console line
 * is the direct manifestation of the expected response, not an app defect.
 * Correlated by (location pathname, status); anything else stays blocking.
 */
const RESOURCE_ERROR_LINE_PATTERN = /^Failed to load resource: the server responded with a status of (\d+)/;

const EXPECTED_RESOURCE_ERROR_LINES: ReadonlySet<string> = new Set([
  JSON.stringify({ path: "/v1/auth/whoami", status: 401 }),
]);

/** Console-line correlation for the route families above (same status). */
function isExpectedResourceErrorLineByFamily(pathname: string, status: number): boolean {
  return EXPECTED_FAILURE_ROUTE_FAMILIES.some(
    (family) => family.status === status && family.path.test(pathname),
  );
}

/** One collected uncaught page error. */
export interface PageErrorRecord {
  readonly label: string;
  readonly message: string;
}

/** One collected console.error call. */
export interface ConsoleErrorRecord {
  readonly label: string;
  readonly text: string;
  /** The resource/source URL the console message points at, when known. */
  readonly locationUrl: string | null;
}

/** One failed (HTTP >= 400 or network-error) request. */
export interface FailedRequestRecord {
  readonly label: string;
  readonly method: string;
  readonly url: string;
  readonly path: string;
  readonly resourceType: string;
  /** HTTP status; -1 when the request failed at the network level. */
  readonly status: number;
  readonly failureText: string;
}

/** The aggregate the console-runtime-errors check reports. */
export interface ConsoleGuardSummary {
  readonly pageErrors: readonly PageErrorRecord[];
  readonly blockingConsoleErrors: readonly ConsoleErrorRecord[];
  readonly excludedConsoleErrors: readonly ConsoleErrorRecord[];
  readonly blockingFailedRequests: readonly FailedRequestRecord[];
  readonly excludedExpectedRequests: readonly FailedRequestRecord[];
  /** Failed requests §4.3 does not classify as blocking (images/media) — reported, never hidden. */
  readonly otherFailedRequests: readonly FailedRequestRecord[];
}

/**
 * Is this console.error line the BROWSER'S own resource log for an
 * expected-by-design failure? (Correlated by location pathname + status;
 * app-originated console.error never matches and stays blocking.)
 */
function isExpectedResourceErrorLine(record: ConsoleErrorRecord): boolean {
  const statusMatch = RESOURCE_ERROR_LINE_PATTERN.exec(record.text);
  if (statusMatch === null || record.locationUrl === null) {
    return false;
  }
  let pathname: string;
  try {
    pathname = new URL(record.locationUrl).pathname;
  } catch {
    return false;
  }
  return (
    EXPECTED_RESOURCE_ERROR_LINES.has(
      JSON.stringify({ path: pathname, status: Number(statusMatch[1]) }),
    ) ||
    isExpectedResourceErrorLineByFamily(pathname, Number(statusMatch[1]))
  );
}

/** Is this failed request expected-by-design (app-handled, non-blocking)? */
function isExpectedByDesign(record: FailedRequestRecord): boolean {
  if (!FETCH_LIKE_RESOURCE_TYPES.has(record.resourceType)) {
    return false;
  }
  if (
    EXPECTED_FAILURES.has(
      JSON.stringify({ method: record.method, path: record.path, status: record.status }),
    )
  ) {
    return true;
  }
  return EXPECTED_FAILURE_ROUTE_FAMILIES.some(
    (family) =>
      family.method === record.method &&
      family.status === record.status &&
      family.path.test(record.path),
  );
}

/** Does this failed request block per §4.3? */
function isBlocking(record: FailedRequestRecord): boolean {
  if (isExpectedByDesign(record)) {
    return false;
  }
  return (
    ALWAYS_BLOCKING_RESOURCE_TYPES.has(record.resourceType) ||
    FETCH_LIKE_RESOURCE_TYPES.has(record.resourceType)
  );
}

/** The run-wide collector. Create ONE; attach every page to it. */
export class ConsoleGuard {
  private readonly pageErrors: PageErrorRecord[] = [];
  private readonly consoleErrors: ConsoleErrorRecord[] = [];
  private readonly failedRequests: FailedRequestRecord[] = [];

  /**
   * Wire one page into the collector. Must be called BEFORE the page is
   * navigated so no early error can escape (the factory in browser.ts
   * guarantees this).
   */
  attach(page: Page, label: string): void {
    page.on("pageerror", (error) => {
      this.pageErrors.push({ label, message: error.message });
    });
    page.on("console", (message: ConsoleMessage) => {
      if (message.type() === "error") {
        this.consoleErrors.push({
          label,
          text: message.text(),
          locationUrl: message.location().url ?? null,
        });
      }
    });
    page.on("requestfailed", (request: Request) => {
      this.failedRequests.push(
        this.toRecord(
          label,
          request,
          NETWORK_ERROR_STATUS,
          request.failure()?.errorText ?? "network error",
        ),
      );
    });
    page.on("response", (response: Response) => {
      if (response.status() >= 400) {
        const request = response.request();
        this.failedRequests.push(
          this.toRecord(
            label,
            request,
            response.status(),
            `HTTP ${response.status()} ${response.statusText()}`.trim(),
          ),
        );
      }
    });
  }

  /** Summarize for the console-runtime-errors check. */
  summarize(): ConsoleGuardSummary {
    const blockingConsoleErrors: ConsoleErrorRecord[] = [];
    const excludedConsoleErrors: ConsoleErrorRecord[] = [];
    for (const record of this.consoleErrors) {
      if (isExpectedResourceErrorLine(record)) {
        excludedConsoleErrors.push(record);
      } else {
        blockingConsoleErrors.push(record);
      }
    }
    const excludedExpectedRequests: FailedRequestRecord[] = [];
    const otherFailedRequests: FailedRequestRecord[] = [];
    const blockingFailedRequests: FailedRequestRecord[] = [];
    for (const record of this.failedRequests) {
      if (isExpectedByDesign(record)) {
        excludedExpectedRequests.push(record);
      } else if (isBlocking(record)) {
        blockingFailedRequests.push(record);
      } else {
        otherFailedRequests.push(record);
      }
    }
    return {
      pageErrors: [...this.pageErrors],
      blockingConsoleErrors,
      excludedConsoleErrors,
      blockingFailedRequests,
      excludedExpectedRequests,
      otherFailedRequests,
    };
  }

  private toRecord(
    label: string,
    request: Request,
    status: number,
    failureText: string,
  ): FailedRequestRecord {
    let path = request.url();
    try {
      path = new URL(request.url()).pathname;
    } catch {
      // keep the raw URL as the path when unparseable (never happens for
      // real requests; defensive only)
    }
    return {
      label,
      method: request.method(),
      url: request.url(),
      path,
      resourceType: request.resourceType(),
      status,
      failureText,
    };
  }
}
