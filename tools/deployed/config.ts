/**
 * PROD-012 — deployed-browser verification: target, budgets and viewports.
 *
 * The deployed production service is a VERIFICATION TARGET, read-mostly:
 * every bound below exists to keep the run deterministic, sequential and
 * human-scale (free-tier discipline — see docs/free-tier-deployment.md),
 * and every wait in the suite must draw its budget from this module so no
 * code path can sleep or poll unbounded (the tools/smoke.ts doctrine).
 */

/** The default deployed target (docs/DEPLOYMENT.md / PROD-011 evidence). */
export const DEFAULT_TARGET = "https://aise-tan.vercel.app";

/** The env variable that overrides the target (documented in the runner). */
export const TARGET_ENV_VAR = "AISE_DEPLOYED_URL";

/** The deployed product's document title (apps/web/index.html — verbatim). */
export const EXPECTED_TITLE = "AISE — AI Site Engineer";

/** One named browser profile the responsive/accessibility checks run at. */
export interface Viewport {
  readonly label: string;
  readonly width: number;
  readonly height: number;
}

/** The two breakpoints the PROD-012 acceptance names (desktop + mobile). */
export const VIEWPORTS: {
  readonly desktop: Viewport;
  readonly mobile: Viewport;
} = {
  desktop: { label: "desktop 1440x900", width: 1440, height: 900 },
  mobile: { label: "mobile 390x844", width: 390, height: 844 },
};

/**
 * Every bounded wait in the suite (ms). Budgets are generous because the
 * free-tier Vercel Hobby deployment cold-starts serverless instances, but
 * they are FINITE: any operation that exceeds its budget fails the check
 * (never hangs the runner).
 */
export const BUDGETS = {
  /** page.goto bound — covers a cold serverless start plus static assets. */
  gotoMs: 30_000,
  /** waitForSelector bound for app landmarks (gate, shell, dashboard). */
  landmarkMs: 20_000,
  /** Bounded network settle after sign-in before measuring/scanning. */
  networkIdleMs: 15_000,
  /** In-page fetch AbortSignal bound (the session-lifecycle requests). */
  inPageFetchMs: 15_000,
  /** Browser-context request API bound (the availability probes). */
  requestApiMs: 20_000,
  /** Backoff before the ONE bounded retry a transient-failed check gets. */
  retryBackoffMs: 2_000,
  /** Human-scale pacing between checks (the target is a shared free tier). */
  interCheckMs: 750,
  /** Small render settle after UI transitions before measuring. */
  settleMs: 500,
  /** Upper bound for one axe-core analysis pass. */
  axeRunMs: 60_000,
} as const;

/** The resolved verification target. */
export interface ResolvedTarget {
  /** Normalized origin URL string (no trailing slash). */
  readonly origin: string;
  /** Where the value came from — printed at start (causality evidence). */
  readonly source: "env" | "default";
}

/**
 * Resolve the verification target from the environment. Accepts an
 * http(s) ORIGIN only (no path/query/fragment — the deployment is an
 * origin serving both the SPA and the API same-origin); anything else is
 * a configuration error the runner fails fast on.
 */
export function resolveTarget(envValue: string | undefined): ResolvedTarget {
  const raw = (envValue ?? "").trim();
  if (raw === "") {
    return { origin: DEFAULT_TARGET, source: "default" };
  }
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(
      `${TARGET_ENV_VAR} is not a valid URL: '${raw}' (expected e.g. '${DEFAULT_TARGET}')`,
    );
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error(
      `${TARGET_ENV_VAR} must be http(s): got protocol '${url.protocol}' from '${raw}'`,
    );
  }
  const path = `${url.pathname}${url.search}${url.hash}`;
  if (path !== "" && path !== "/") {
    throw new Error(
      `${TARGET_ENV_VAR} must be an origin without path/query/fragment: '${raw}'`,
    );
  }
  return { origin: raw.replace(/\/+$/, ""), source: "env" };
}
