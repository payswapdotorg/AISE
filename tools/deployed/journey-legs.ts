/**
 * PROD-033 — the JOURNEY LEGS that serve BOTH base URLs.
 *
 * The journey harness's reusable browser legs (the PROD-012
 * tools/deployed-check.ts doctrine, extended per the work order's §4.4):
 * every leg in this module is parameterized by a base origin ONLY and runs
 * IDENTICALLY against the LOCAL production-like serve (bun run build +
 * bun run start — tools/journey/serve.ts) and against the DEPLOYED
 * production URL the Tech Lead passes as --base-url at finalization.
 * Same-origin fetch through the page, no privileged access, isolated
 * BrowserContext per leg where session semantics require it, one bounded
 * retry per CHECK at the orchestration layer, console-error capture
 * through the shared ConsoleGuard, ALWAYS-cleanup.
 *
 * Legs defined here (all base-URL agnostic):
 *
 *   - journeyAvailability — the base-agnostic availability probe
 *     (GET / → 200 + the product title; /healthz → 200 ok; /readyz →
 *     200 ok with auth enabled). The deployment-host-specific facts
 *     (x-vercel-id, the Redis cost ledger) belong to the deployed check
 *     proper (tools/deployed-check.ts — the Lead's runbook leg), never
 *     to a dual-use leg;
 *   - journeySessionLifecycle — the session lifecycle over the page
 *     origin (mint → whoami → logout → fail-closed 401 + the cookie
 *     evidence), with the SCHEME-HONEST cookie assertion: over https the
 *     session cookie MUST be HttpOnly AND Secure; over a plain-http
 *     local origin Secure is not applicable and the leg says so
 *     verbatim (the deployed check asserts Secure unconditionally —
 *     this leg never weakens it, it conditions it on the transport);
 *   - journeyCaptureUploadRoundTrip — the REAL upload round-trip through
 *     the product's own capture surface (the file input → the client's
 *     sha-256 content address → POST /v1/capture/assets/:contentId →
 *     the STORED outcome; re-upload → the DUPLICATE outcome);
 *   - journeySolutionWorkspaceLegs — the interactive solution journey's
 *     leg observations (the PROD-031 browser execution path: the mount
 *     through the selection ladder's second rung, the direct-
 *     manipulation operation, the live agent leg, validation, the
 *     generated BOQ, the line click, the line→step deep link, the
 *     reality seal).
 *
 * Determinism: every leg draws its waits from LEG_BUDGETS (no unbounded
 * sleep), asserts the COMMITTED identities of the recorded reference
 * journey, and reports one-line proof excerpts for every assertion.
 */

import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { Browser, Page } from "playwright";
import type { ConsoleGuard } from "./console-guard";
import { newCheckPage } from "./browser";
import { BUDGETS, EXPECTED_TITLE } from "./config";
import {
  TransientCheckError,
  allPassed,
  type CheckAssertion,
  type CheckReport,
  failedReport,
  passedReport,
} from "./verdict";

const ROOT = resolve(import.meta.dir, "..", "..");

/** The committed demo world's case id (PROD-026's record). */
const WORLD_CASE_ID = "case-demo-wall-001";

/** The dual-use legs' own bounded budgets. */
export const LEG_BUDGETS = {
  /** One page navigation. */
  gotoMs: 30_000,
  /** One app landmark wait (gate, shell, workspace, panels). */
  landmarkMs: 20_000,
  /** The solution workspace's mount (rung 1 rejection + chunk load + opening). */
  workspaceMountMs: 30_000,
  /** One interaction leg's settle wait. */
  legMs: 20_000,
  /** Small render settle after transitions. */
  settleMs: 500,
  /** In-page fetch bound. */
  inPageFetchMs: 15_000,
  /** The API-level probes (request API). */
  requestApiMs: 20_000,
} as const;

/** What one dual-use leg needs. */
export interface JourneyLegContext {
  readonly browser: Browser;
  /** The base origin (the local serve's web origin, or the deployed origin). */
  readonly origin: string;
  /** The run-wide console guard (every page is wired before navigation). */
  readonly guard: ConsoleGuard;
}

/* ------------------------------------------------------------------ */
/* Bounded primitives (the checks.ts doctrine, restated locally)        */
/* ------------------------------------------------------------------ */

function sleep(ms: number): Promise<"slept"> {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve("slept");
    }, ms);
  });
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** The page globals the in-page callbacks touch, typed STRUCTURALLY. */
interface PageGlobal {
  readonly fetch: (
    input: string,
    init: { method: string; credentials: string; signal: unknown },
  ) => Promise<{ status: number; text: () => Promise<string> }>;
  readonly AbortSignal: { timeout: (ms: number) => unknown };
}

/** One in-page fetch outcome (the body is bounded for evidence). */
interface PageFetchOutcome {
  readonly status: number;
  readonly bodyText: string;
}

/** Fetch a same-origin path INSIDE the real page, credentials included. */
async function fetchInPage(page: Page, path: string, method: string): Promise<PageFetchOutcome> {
  try {
    return await page.evaluate(
      async ({ path, method, timeoutMs }) => {
        const pageGlobal = globalThis as unknown as PageGlobal;
        const response = await pageGlobal.fetch(path, {
          method,
          credentials: "include",
          signal: pageGlobal.AbortSignal.timeout(timeoutMs),
        });
        const bodyText = await response.text();
        return { status: response.status, bodyText: bodyText.slice(0, 512) };
      },
      { path, method, timeoutMs: LEG_BUDGETS.inPageFetchMs },
    );
  } catch (error) {
    throw new TransientCheckError(
      `in-page ${method} ${path} failed before a response arrived: ${describeError(error)}`,
      error,
    );
  }
}

function parseJson(text: string): Record<string, unknown> {
  try {
    const value = JSON.parse(text) as unknown;
    return typeof value === "object" && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** Navigate to the base origin and PROVE the page stayed on it. */
async function navigateToBase(page: Page, origin: string): Promise<void> {
  try {
    await page.goto(origin, { timeout: LEG_BUDGETS.gotoMs, waitUntil: "domcontentloaded" });
  } catch (error) {
    throw new TransientCheckError(
      `navigation to ${origin} failed: ${describeError(error)}`,
      error,
    );
  }
  if (!page.url().startsWith(`${origin}/`) && page.url() !== origin) {
    throw new TransientCheckError(
      `navigation left the base origin: landed on ${page.url()}`,
      null,
    );
  }
}

/** Enter the demo through the product's OWN control (the honest gate path). */
async function enterDemoViaUi(page: Page): Promise<void> {
  const button = page.getByRole("button", { name: "Enter demo", exact: true });
  try {
    await button.click({ timeout: LEG_BUDGETS.landmarkMs });
  } catch (error) {
    throw new TransientCheckError(
      `the "Enter demo" button could not be clicked: ${describeError(error)}`,
      error,
    );
  }
  try {
    await page.waitForSelector("header.app-header", {
      state: "visible",
      timeout: LEG_BUDGETS.landmarkMs,
    });
  } catch (error) {
    throw new TransientCheckError(
      `the signed-in shell (header.app-header) did not appear after Enter demo: ${describeError(error)}`,
      error,
    );
  }
}

/** Log a minted session out through the page origin (the lean cleanup). */
async function deleteSessionInPage(page: Page): Promise<string> {
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const outcome = await fetchInPage(page, "/v1/auth/sessions/current", "DELETE");
      if (outcome.status >= 200 && outcome.status < 300) {
        return `ok (in-page DELETE, attempt ${attempt})`;
      }
      if (outcome.status === 401) {
        return "ok (no live session remained — DELETE answered 401)";
      }
    } catch (error) {
      if (attempt === 2) {
        return `failed: both in-page DELETE attempts failed — ${describeError(error)}`;
      }
    }
    await sleep(BUDGETS.retryBackoffMs);
  }
  return "failed: two in-page DELETE attempts did not complete";
}

/* ------------------------------------------------------------------ */
/* Leg 1 — journeyAvailability (base-agnostic)                          */
/* ------------------------------------------------------------------ */

/** The base-agnostic availability probe over the browser context API. */
export async function journeyAvailability(ctx: JourneyLegContext): Promise<CheckReport> {
  const context = await ctx.browser.newContext();
  try {
    const assertions: CheckAssertion[] = [];
    const extras: string[] = [];

    const home = await context.request.get(`${ctx.origin}/`, {
      timeout: LEG_BUDGETS.requestApiMs,
    });
    const homeText = await home.text();
    const titleMatch = /<title>([^<]*)<\/title>/.exec(homeText);
    const pageTitle = titleMatch?.[1]?.trim() ?? "";
    assertions.push({
      name: `GET / → HTTP 200 on the base origin (${ctx.origin})`,
      pass: home.status() === 200,
      detail: `status ${home.status()}`,
    });
    assertions.push({
      name: `GET / <title> is the product title "${EXPECTED_TITLE}"`,
      pass: pageTitle === EXPECTED_TITLE,
      detail: `title "${pageTitle}"`,
    });

    const healthz = await context.request.get(`${ctx.origin}/healthz`, {
      timeout: LEG_BUDGETS.requestApiMs,
    });
    const healthzBody = parseJson(await healthz.text());
    assertions.push({
      name: "GET /healthz → HTTP 200",
      pass: healthz.status() === 200,
      detail: `status ${healthz.status()}`,
    });
    assertions.push({
      name: 'GET /healthz body ok === true, service "aise-api"',
      pass:
        healthzBody["ok"] === true &&
        healthzBody["service"] === "aise-api" &&
        typeof healthzBody["version"] === "string",
      detail: `ok=${String(healthzBody["ok"])} service=${String(healthzBody["service"])} version=${String(healthzBody["version"])}`,
    });

    const readyz = await context.request.get(`${ctx.origin}/readyz`, {
      timeout: LEG_BUDGETS.requestApiMs,
    });
    const readyzBody = parseJson(await readyz.text());
    const auth = asRecord(readyzBody["auth"]);
    const authStatus = typeof auth?.["status"] === "string" ? auth["status"] : "(absent)";
    const authMode = typeof auth?.["mode"] === "string" ? auth["mode"] : "(absent)";
    assertions.push({
      name: "GET /readyz → HTTP 200 with ok === true",
      pass: readyz.status() === 200 && readyzBody["ok"] === true,
      detail: `status ${readyz.status()}, ok=${String(readyzBody["ok"])}`,
    });
    assertions.push({
      name: 'GET /readyz auth.status === "enabled" (the session-lifecycle precondition)',
      pass: authStatus === "enabled",
      detail: `auth.status=${authStatus}, mode=${authMode}`,
    });
    const providers = asRecord(readyzBody["providers"]);
    if (providers !== null) {
      extras.push(
        `readyz optional providers: ${Object.entries(providers)
          .map(([id, status]) => `${id}=${String(status)}`)
          .join(" ")}`,
      );
    }

    return allPassed(assertions)
      ? passedReport("journey-availability", assertions, extras)
      : failedReport("journey-availability", assertions, extras);
  } finally {
    await context.close();
  }
}

/* ------------------------------------------------------------------ */
/* Leg 2 — journeySessionLifecycle (scheme-honest cookie assertion)     */
/* ------------------------------------------------------------------ */

/** The session lifecycle over the page origin, dual-use. */
export async function journeySessionLifecycle(ctx: JourneyLegContext): Promise<CheckReport> {
  const pageHandle = await newCheckPage(ctx.browser, ctx.guard, "journey-session-lifecycle", {
    label: "desktop 1280x900",
    width: 1280,
    height: 900,
  });
  let minted = false;
  let loggedOut = false;
  try {
    await navigateToBase(pageHandle.page, ctx.origin);
    await pageHandle.page
      .waitForSelector("h2#gate-title", { timeout: LEG_BUDGETS.landmarkMs })
      .catch(() => {
        throw new TransientCheckError("the auth gate (h2#gate-title) did not appear", null);
      });

    const assertions: CheckAssertion[] = [];
    const extras: string[] = [];
    const isHttps = ctx.origin.startsWith("https:");

    // 1. MINT through the page origin.
    const mint = await fetchInPage(pageHandle.page, "/v1/auth/demo", "POST");
    const mintBody = parseJson(mint.bodyText);
    const mintPrincipal = asRecord(mintBody["principal"]);
    if (mint.status >= 200 && mint.status < 300) {
      minted = true;
    }
    assertions.push({
      name: "POST /v1/auth/demo → 2xx",
      pass: mint.status >= 200 && mint.status < 300,
      detail: `status ${mint.status}`,
    });
    assertions.push({
      name: "POST /v1/auth/demo mints the demo principal",
      pass:
        mintBody["ok"] === true &&
        mintPrincipal?.["kind"] === "demo" &&
        typeof mintPrincipal?.["displayName"] === "string",
      detail: `principal ${JSON.stringify(mintPrincipal)}`,
    });

    // 2. The cookie evidence (read through the context jar, never page JS).
    const cookies = await pageHandle.context.cookies(ctx.origin);
    const sessionCookie = cookies.find((cookie) => cookie.name === "aise_session");
    assertions.push({
      name: "the HttpOnly session cookie (aise_session) was set",
      pass: sessionCookie !== undefined,
      detail:
        sessionCookie !== undefined
          ? `name=${sessionCookie.name} path=${sessionCookie.path} sameSite=${sessionCookie.sameSite}`
          : "no aise_session cookie in the jar",
    });
    // The SCHEME-HONEST assertion: Secure is REQUIRED over https (the
    // deployed check's own law) and NOT APPLICABLE over a plain-http local
    // origin — recorded verbatim, never silently skipped.
    if (isHttps) {
      assertions.push({
        name: "the session cookie is HttpOnly and Secure (https base)",
        pass: sessionCookie !== undefined && sessionCookie.httpOnly && sessionCookie.secure,
        detail:
          sessionCookie !== undefined
            ? `httpOnly=${sessionCookie.httpOnly} secure=${sessionCookie.secure}`
            : "no cookie to inspect",
      });
    } else {
      assertions.push({
        name: "the session cookie is HttpOnly (plain-http local base — Secure is not applicable to this transport; the deployed check asserts Secure over https)",
        pass: sessionCookie !== undefined && sessionCookie.httpOnly,
        detail:
          sessionCookie !== undefined
            ? `httpOnly=${sessionCookie.httpOnly} secure=${sessionCookie.secure} (plain-http origin)`
            : "no cookie to inspect",
      });
    }

    // 3. WHOAMI with the minted session.
    const whoami = await fetchInPage(pageHandle.page, "/v1/auth/whoami", "GET");
    const whoamiBody = parseJson(whoami.bodyText);
    assertions.push({
      name: "GET /v1/auth/whoami → 200 (authenticated, same browser context)",
      pass: whoami.status === 200,
      detail: `status ${whoami.status}`,
    });
    assertions.push({
      name: "GET /v1/auth/whoami ok === true with the minted principal",
      pass:
        whoami.status === 200 &&
        whoamiBody["ok"] === true &&
        JSON.stringify(mintPrincipal) === JSON.stringify(asRecord(whoamiBody["principal"])),
      detail: `principal ${JSON.stringify(asRecord(whoamiBody["principal"]))}`,
    });

    // 4. LOGOUT.
    const logout = await fetchInPage(pageHandle.page, "/v1/auth/sessions/current", "DELETE");
    const logoutBody = parseJson(logout.bodyText);
    if (logout.status >= 200 && logout.status < 300) {
      loggedOut = true;
    }
    assertions.push({
      name: "DELETE /v1/auth/sessions/current → 2xx with ok === true",
      pass: logout.status >= 200 && logout.status < 300 && logoutBody["ok"] === true,
      detail: `status ${logout.status}, ok=${String(logoutBody["ok"])}`,
    });

    // 5. FAIL-CLOSED.
    const whoamiAfter = await fetchInPage(pageHandle.page, "/v1/auth/whoami", "GET");
    const afterBody = parseJson(whoamiAfter.bodyText);
    const afterError = asRecord(afterBody["error"]);
    const afterCode = typeof afterError?.["code"] === "string" ? afterError["code"] : "";
    assertions.push({
      name: "GET /v1/auth/whoami after logout → 401 (fail-closed; a 200 would be critical)",
      pass: whoamiAfter.status === 401,
      detail: `status ${whoamiAfter.status}`,
    });
    assertions.push({
      name: "the 401 carries the typed fail-closed error envelope",
      pass:
        whoamiAfter.status === 401 &&
        (afterCode === "authentication_required" || afterCode === "session_invalid"),
      detail: `error.code=${afterCode === "" ? "(absent)" : afterCode}`,
    });

    const cleanupLine = loggedOut
      ? "cleanup: ok (logout in the leg body)"
      : minted
        ? "cleanup: deferred to the finally fallback"
        : "cleanup: not-needed (no session was minted)";
    return allPassed(assertions)
      ? passedReport("journey-session-lifecycle", assertions, [...extras, cleanupLine])
      : failedReport("journey-session-lifecycle", assertions, [...extras, cleanupLine]);
  } finally {
    if (minted && !loggedOut) {
      const fallback = await deleteSessionInPage(pageHandle.page);
      if (fallback.startsWith("failed")) {
        console.error(`  cleanup: journey-session-lifecycle finally fallback — ${fallback}`);
      } else {
        console.log(`  cleanup: journey-session-lifecycle finally fallback — ${fallback}`);
      }
    }
    await pageHandle.close();
  }
}

/* ------------------------------------------------------------------ */
/* Leg 3 — journeyCaptureUploadRoundTrip (the REAL page upload path)    */
/* ------------------------------------------------------------------ */

/**
 * The upload round-trip through the product's own capture surface:
 * the file input → the client's Web-Crypto sha-256 content address →
 * POST /v1/capture/assets/:contentId → the STORED outcome → the honest
 * DUPLICATE on re-upload. The fixture bytes are DETERMINISTIC (no camera
 * in any browser harness — the caller records the synthetic class).
 */
export async function journeyCaptureUploadRoundTrip(
  ctx: JourneyLegContext,
  options: {
    /** The deterministic fixture file (created by the caller). */
    readonly fixtureFile: string;
    /** The project whose capture surface is walked. */
    readonly projectId: string;
    /** The expected sha-256 content id of the fixture bytes (hex). */
    readonly expectedContentId: string;
  },
): Promise<CheckReport> {
  const pageHandle = await newCheckPage(ctx.browser, ctx.guard, "journey-upload-round-trip", {
    label: "desktop 1280x900",
    width: 1280,
    height: 900,
  });
  let sessionCookieExisted = false;
  try {
    const page = pageHandle.page;
    await navigateToBase(page, ctx.origin);
    await page
      .waitForSelector("h2#gate-title", { timeout: LEG_BUDGETS.landmarkMs })
      .catch(() => {
        throw new TransientCheckError("the auth gate did not appear before the upload leg", null);
      });
    sessionCookieExisted = true;
    await enterDemoViaUi(page);

    // The capture surface of the demo project.
    await page.goto(`${ctx.origin}/#/projects/${options.projectId}/capture`, {
      timeout: LEG_BUDGETS.gotoMs,
      waitUntil: "domcontentloaded",
    });
    await page.waitForSelector("h1", { timeout: LEG_BUDGETS.landmarkMs });
    const heading = ((await page.locator("h1").first().textContent()) ?? "").trim();
    const assertions: CheckAssertion[] = [
      {
        name: 'the Capture / Upload surface renders (h1 "Capture / Upload")',
        pass: heading === "Capture / Upload",
        detail: `h1 "${heading}"`,
      },
    ];
    const extras: string[] = [];

    // The upload entry is live (the API-mode gate): no demo notice, digest available.
    await page.waitForSelector("#capture-file", { timeout: LEG_BUDGETS.landmarkMs });
    const demoNotice = await page.locator('[data-demo-notice="true"]').count();
    const digestUnavailable = await page.locator('[data-digest-unavailable="true"]').count();
    assertions.push({
      name: "the upload entry is LIVE (no demo notice, Web-Crypto digest available)",
      pass: demoNotice === 0 && digestUnavailable === 0,
      detail: `demo-notice=${demoNotice}, digest-unavailable=${digestUnavailable}`,
    });

    // Select the deterministic fixture through the REAL file input.
    await page.setInputFiles("#capture-file", options.fixtureFile);
    await page.waitForSelector('[data-selected-file="true"]', {
      timeout: LEG_BUDGETS.landmarkMs,
    });
    assertions.push({
      name: "the selected file's honest summary renders (name · bytes · media type)",
      pass: true,
      detail: `selected: ${((await page.locator('[data-selected-file="true"]').first().textContent()) ?? "").trim().slice(0, 90)}`,
    });

    // THE round-trip: upload → STORED with the content id.
    await page.getByRole("button", { name: "Upload to the capture gateway" }).click();
    await page.waitForSelector('[data-outcome="stored"]', {
      timeout: LEG_BUDGETS.legMs,
    });
    const storedText = await page.locator('[data-outcome="stored"]').first().innerText();
    assertions.push({
      name: "the upload answered STORED server-side with the content address",
      pass:
        storedText.includes("Stored server-side") &&
        storedText.includes(options.expectedContentId),
      detail: `outcome panel: ${storedText.replace(/\s+/g, " ").slice(0, 120)}`,
    });
    extras.push(
      `content id: ${options.expectedContentId} (the client's sha-256 content address of the fixture bytes)`,
    );

    // The idempotent re-upload → DUPLICATE (never a duplication).
    await page.setInputFiles("#capture-file", options.fixtureFile);
    await page.getByRole("button", { name: "Upload to the capture gateway" }).click();
    await page.waitForSelector('[data-outcome="duplicate"]', {
      timeout: LEG_BUDGETS.legMs,
    });
    const duplicateText = await page.locator('[data-outcome="duplicate"]').first().innerText();
    assertions.push({
      name: "the re-upload of identical bytes answered DUPLICATE (idempotent, never a duplication)",
      pass:
        duplicateText.includes("Already stored") && duplicateText.includes(options.expectedContentId),
      detail: `outcome panel: ${duplicateText.replace(/\s+/g, " ").slice(0, 120)}`,
    });

    return allPassed(assertions)
      ? passedReport("journey-capture-upload-round-trip", assertions, extras)
      : failedReport("journey-capture-upload-round-trip", assertions, extras);
  } finally {
    // ALWAYS clean up the minted session (cookie-presence-driven).
    if (sessionCookieExisted) {
      const cookies = await pageHandle.context.cookies(ctx.origin).catch(() => null);
      if (cookies === null || cookies.some((cookie) => cookie.name === "aise_session")) {
        const fallback = await deleteSessionInPage(pageHandle.page);
        if (fallback.startsWith("failed")) {
          console.error(`  cleanup: journey-upload-round-trip finally fallback — ${fallback}`);
        } else {
          console.log(`  cleanup: journey-upload-round-trip finally fallback — ${fallback}`);
        }
      }
    }
    await pageHandle.close();
  }
}

/* ------------------------------------------------------------------ */
/* Leg 4 — the interactive solution journey (the PROD-031 browser path) */
/* ------------------------------------------------------------------ */

/** The committed demo world pins (PROD-026's record — cited, never re-derived). */
export const SOLUTION_WORLD_PINS = {
  projectId: "proj-demo-001",
  caseId: "case-demo-wall-001",
  solutionId: "solution-demo-001",
  baselineRealityVersionId: "rgv-demo-0007",
  problemStatement:
    "Rising damp has damaged the ground-floor masonry wall; the damaged section must be removed, rebuilt with concrete blocks and re-plastered.",
} as const;

/** The committed corpus demolition identity prefix (PROD-026's step 4). */
export const DEMOLITION_OPERATION_ID_PREFIX = "78be478643fcbb4a";

/** The committed journey record, read as DATA (the §4.6 one-record choice). */
export function committedJourneyRecord(): {
  readonly world: {
    readonly projectId: string;
    readonly caseId: string;
    readonly solutionId: string;
    readonly baselineRealityVersionId: string;
  };
  readonly boqTraceSet: {
    readonly lineTraces: readonly {
      readonly boqLineId: string;
      readonly itemDescription: string;
    }[];
  };
} {
  return JSON.parse(
    readFileSync(
      join(ROOT, "apps", "web", "src", "app", "solution-journey-record.json"),
      "utf8",
    ),
  ) as {
    readonly world: {
      readonly projectId: string;
      readonly caseId: string;
      readonly solutionId: string;
      readonly baselineRealityVersionId: string;
    };
    readonly boqTraceSet: {
      readonly lineTraces: readonly {
        readonly boqLineId: string;
        readonly itemDescription: string;
      }[];
    };
  };
}

/** One solution-journey leg observation (verdict + proof lines). */
export interface SolutionLegObservation {
  /** The leg's stable id (w2.*). */
  readonly id: string;
  readonly name: string;
  readonly pass: boolean;
  readonly lines: readonly string[];
}

/**
 * The interactive solution journey's browser legs — the PROD-031 execution
 * path walked against the base origin: enter through the honest gate,
 * mount the workspace through the selection ladder's SECOND rung, author
 * ONE direct-manipulation operation (the committed demolition identity),
 * ONE agent command through the LIVE compiler (clarification → answer →
 * proposal → confirm), validate (7/7), read the generated BOQ (the
 * committed trace set's 7 lines), click the recorded line, round-trip the
 * line→step deep link, and prove the observed scene byte-unchanged.
 */
export async function journeySolutionWorkspaceLegs(
  ctx: JourneyLegContext,
): Promise<readonly SolutionLegObservation[]> {
  const pageHandle = await newCheckPage(ctx.browser, ctx.guard, "journey-solution-w2", {
    label: "desktop 1280x900",
    width: 1280,
    height: 900,
  });
  const observations: SolutionLegObservation[] = [];
  const record = committedJourneyRecord();
  const SOLUTION_HASH = `#/projects/${SOLUTION_WORLD_PINS.projectId}/solution?case=${SOLUTION_WORLD_PINS.caseId}`;
  try {
    const page = pageHandle.page;

    /* ---- Leg: CURRENT BUILDING → PROBLEM (enter + the solution route). ---- */
    const legLines: string[] = [];
    let legPass = true;
    await navigateToBase(page, ctx.origin);
    await page.waitForSelector("h2#gate-title", { timeout: LEG_BUDGETS.landmarkMs });
    await page.getByRole("button", { name: "Enter demo" }).click();
    await page.waitForSelector("h2#gate-title", { state: "detached", timeout: LEG_BUDGETS.landmarkMs });
    legLines.push("the demo session entered through the honest 'Enter demo' gate");
    await page.goto(`${ctx.origin}/${SOLUTION_HASH}`, {
      timeout: LEG_BUDGETS.gotoMs,
      waitUntil: "domcontentloaded",
    });
    await page.waitForSelector("main#main-content", { timeout: LEG_BUDGETS.landmarkMs });
    // The case's problem statement renders over the demo world (the composed
    // surface's case-context card — the CURRENT BUILDING → PROBLEM leg).
    await page
      .getByText("Rising damp has damaged the ground-floor masonry wall", { exact: false })
      .first()
      .waitFor({ state: "visible", timeout: LEG_BUDGETS.workspaceMountMs });
    const surfaceText = await page.locator("body").innerText();
    const problemVisible = surfaceText.includes("Rising damp has damaged the ground-floor masonry wall");
    const caseContextVisible = surfaceText.includes(WORLD_CASE_ID);
    const surfaceNavVisible = await page
      .locator(`a[href="#/projects/${SOLUTION_WORLD_PINS.projectId}/solution"]`)
      .first()
      .isVisible()
      .catch(() => false);
    legPass = legPass && problemVisible && caseContextVisible;
    legLines.push(
      `the solution surface renders over the demo world: the case's problem statement visible (${problemVisible}); the case context "${WORLD_CASE_ID}" visible (${caseContextVisible}); the surface nav's Interactive Solution entry visible (${surfaceNavVisible})`,
    );
    observations.push({
      id: "w2.current-building",
      name: "CURRENT BUILDING → PROBLEM — the solution route opens the demo case",
      pass: legPass,
      lines: legLines,
    });

    /* ---- Leg: INTERACTIVE SOLUTION (the workspace mounts, rung 2). ---- */
    await page.waitForSelector(
      `#solution-workspace[data-case-id="${SOLUTION_WORLD_PINS.caseId}"]`,
      { timeout: LEG_BUDGETS.workspaceMountMs },
    );
    await page.waitForSelector('[data-browser-mount="solution-browser-mount"]', {
      timeout: LEG_BUDGETS.landmarkMs,
    });
    const unavailablePanels =
      (await page.locator("#solution-engine-unavailable").count()) +
      (await page.locator("#solution-backend-unreachable").count());
    const baselineVersion = await page
      .locator("#solution-workspace")
      .getAttribute("data-baseline-reality-version");
    const currentVersion = await page
      .locator("#solution-workspace")
      .getAttribute("data-current-version");
    const cursorIndex = await page
      .locator("#solution-workspace")
      .getAttribute("data-cursor-state-index");
    const mountPass =
      unavailablePanels === 0 &&
      baselineVersion === SOLUTION_WORLD_PINS.baselineRealityVersionId &&
      currentVersion === "1" &&
      cursorIndex === "0";
    observations.push({
      id: "w2.solution-mount",
      name: "INTERACTIVE SOLUTION — the workspace mounts through the browser engine binding (rung 2)",
      pass: mountPass,
      lines: [
        `workspace mounted: #solution-workspace[data-case-id="${SOLUTION_WORLD_PINS.caseId}"] with [data-browser-mount="solution-browser-mount"]`,
        `unavailable panels: ${unavailablePanels} (engine-unavailable + backend-unreachable — both must be 0)`,
        `anchors: baseline-reality-version=${baselineVersion}, current-version=${currentVersion}, cursor-state-index=${cursorIndex}`,
      ],
    });

    /* The observed scene's read-only anchors, captured BEFORE any work. */
    await page.getByRole("button", { name: "Use the accessible view (no drawing)" }).click();
    const observedSceneBefore = await page
      .locator('[aria-label="Building contents (accessible view)"]')
      .innerText();

    /* ---- Leg: direct manipulation creates a typed operation. ---- */
    await page
      .locator('li[data-element-id="node-wall-002"] > button', {
        hasText: "Damaged ground-floor wall faces",
      })
      .click();
    await page
      .locator('#solution-manipulation [data-action-id="node-wall-002:demolition-removal"] > button')
      .click();
    await page.locator('#solution-manipulation form [data-parameter-name="length"]').fill("5");
    await page.locator('#solution-manipulation form [data-parameter-name="height"]').fill("2.4");
    await page.locator('#solution-manipulation form [data-parameter-name="thickness"]').fill("0.1");
    await page.getByRole("button", { name: "Remove the damaged section — apply" }).click();
    const demolition = page.locator(
      '#solution-operations [data-operation-type="demolition-removal"][data-origin="direct-manipulation"]',
    );
    await demolition.first().waitFor({ state: "visible", timeout: LEG_BUDGETS.legMs });
    const demolitionId = (await demolition.first().getAttribute("data-operation-id")) ?? "";
    const demolitionCursor = await page
      .locator("#solution-workspace")
      .getAttribute("data-cursor-state-index");
    const directPass =
      new RegExp(`^${DEMOLITION_OPERATION_ID_PREFIX}`).test(demolitionId) &&
      demolitionCursor === "1";
    observations.push({
      id: "w2.direct-manipulation",
      name: "direct manipulation creates a typed operation (the committed demolition identity)",
      pass: directPass,
      lines: [
        `operation row: demolition-removal, origin direct-manipulation, id ${demolitionId.slice(0, 16)}…`,
        `the committed corpus identity reproduced: ${demolitionId.startsWith(DEMOLITION_OPERATION_ID_PREFIX) ? `prefix ${DEMOLITION_OPERATION_ID_PREFIX} exact` : `PREFIX MISMATCH (expected ${DEMOLITION_OPERATION_ID_PREFIX})`}`,
        `cursor-state-index ${demolitionCursor} (expected 1)`,
      ],
    });

    /* ---- Leg: the agent command through the LIVE compiler. ---- */
    await page.locator("#agent-utterance").fill("Build the wall 5 m long and 0.1 m thick.");
    await page.getByRole("button", { name: "Send", exact: true }).click();
    await page.waitForSelector('[data-pending="clarification"]', {
      timeout: LEG_BUDGETS.legMs,
    });
    await page
      .locator("#agent-utterance")
      .fill("1 m high, using concrete blocks, on the wall line along the damaged section");
    await page.getByRole("button", { name: "Send", exact: true }).click();
    await page.waitForSelector('[data-pending="proposal"]', { timeout: LEG_BUDGETS.legMs });
    const proposalCommand = await page
      .locator('[data-pending="proposal"] [data-proposal-command="true"]')
      .innerText();
    await page
      .getByRole("button", { name: "Confirm the proposed operation and apply it" })
      .click();
    const blockWall = page.locator(
      '#solution-operations [data-operation-type="block-wall-placement"][data-origin="agent"]',
    );
    await blockWall.first().waitFor({ state: "visible", timeout: LEG_BUDGETS.legMs });
    const blockWallId = (await blockWall.first().getAttribute("data-operation-id")) ?? "";
    const blockWallText = await blockWall.first().innerText();
    const agentCursor = await page
      .locator("#solution-workspace")
      .getAttribute("data-cursor-state-index");
    const agentPass =
      /concrete-block wall 5 m long, 1 m high and 0\.1 m thick/i.test(proposalCommand) &&
      /concrete-block/i.test(blockWallText) &&
      /^[0-9a-f]{64}$/.test(blockWallId) &&
      agentCursor === "2";
    observations.push({
      id: "w2.agent-turn",
      name: "the agent command creates a semantically equivalent typed operation (the live compiler leg)",
      pass: agentPass,
      lines: [
        `the LIVE PROD-023 compiler walked clarification → answer → proposal → confirm (/v1/solution-agent/compile|turn)`,
        `proposal command: "${proposalCommand.replace(/\s+/g, " ").trim()}"`,
        `operation row: block-wall-placement, origin agent, id ${blockWallId.slice(0, 16)}… (64-hex engine derivation)`,
        `cursor-state-index ${agentCursor} (expected 2)`,
      ],
    });

    /* ---- Leg: VALIDATE (deterministic, tied to the solution version). ---- */
    await page.getByRole("button", { name: "Check this proposal (validate)" }).click();
    const validation = page.locator("#solution-validation");
    await validation.waitFor({ state: "visible", timeout: LEG_BUDGETS.legMs });
    const validationOutcome = await validation.getAttribute("data-validation-outcome");
    const checkRows = await validation.locator("li[data-check-id]").count();
    const validationPass = validationOutcome === "pass" && checkRows === 7;
    observations.push({
      id: "w2.validate",
      name: "VALIDATE — validation results visible and tied to the solution version",
      pass: validationPass,
      lines: [
        `#solution-validation[data-validation-outcome="${validationOutcome}"] over version ${currentVersion ?? "?"} (the engine's deterministic Validate through /v1/solutions/validate)`,
        `${checkRows} li[data-check-id] rows (expected 7 — the engine's deterministic checks)`,
      ],
    });

    /* ---- Leg: SOLUTION BOQ (the generated projection renders). ---- */
    const boqLines = page.locator("#solution-boq [data-boq-line-id]");
    const boqLineCount = await boqLines.count();
    const expectedLineCount = record.boqTraceSet.lineTraces.length;
    const plasterLine = record.boqTraceSet.lineTraces.find((line) =>
      line.itemDescription.includes(
        "Plaster application to affected surfaces — cement-plaster, measured by volume",
      ),
    );
    const boqPass = boqLineCount === expectedLineCount && plasterLine !== undefined;
    observations.push({
      id: "w2.solution-boq",
      name: "SOLUTION BOQ — the generated BOQ renders from the committed trace set",
      pass: boqPass,
      lines: [
        `#solution-boq renders ${boqLineCount} [data-boq-line-id] rows (expected ${expectedLineCount} — the committed record's v1 trace set, the §4.6 one-record choice)`,
        `the recorded plaster line resolvable: ${plasterLine !== undefined ? `${plasterLine.boqLineId.slice(0, 16)}…` : "NOT FOUND"}`,
      ],
    });

    /* ---- Leg: BOQ LINE (the recorded line click). ---- */
    let lineClickPass = false;
    let lineClickLines: string[] = [];
    if (plasterLine !== undefined) {
      await page
        .locator(`#solution-boq [data-boq-line-id="${plasterLine.boqLineId}"] button`)
        .click();
      const selected = await page
        .locator(`#solution-boq [data-boq-line-id="${plasterLine.boqLineId}"]`)
        .getAttribute("data-selected");
      lineClickPass = selected === "true";
      lineClickLines = [
        `the recorded line clicked by its committed boqLineId ${plasterLine.boqLineId.slice(0, 16)}…`,
        `data-selected="${selected}"`,
      ];
    } else {
      lineClickLines = ["the recorded plaster line was not found in the committed trace set"];
    }
    observations.push({
      id: "w2.boq-line",
      name: "BOQ LINE — the generated line selects and its detail renders",
      pass: lineClickPass,
      lines: lineClickLines,
    });

    /* ---- Leg: SOLUTION STEP (the line→step deep link round-trip). ---- */
    let deepLinkPass = false;
    let deepLinkLines: string[] = [];
    if (plasterLine !== undefined) {
      const deepLink = `${SOLUTION_HASH}&boq-line=${plasterLine.boqLineId}&step=3`;
      await page.goto(`${ctx.origin}/${deepLink}`, {
        timeout: LEG_BUDGETS.gotoMs,
        waitUntil: "domcontentloaded",
      });
      await page.waitForSelector("#solution-boq-trace-panel", {
        timeout: LEG_BUDGETS.workspaceMountMs,
      });
      const traceSelected = await page
        .locator(
          `#solution-boq-trace-panel [data-boq-line-id="${plasterLine.boqLineId}"]`,
        )
        .getAttribute("data-selected");
      const traceText = await page.locator("#solution-boq-trace-panel").innerText();
      deepLinkPass =
        traceSelected === "true" && traceText.includes("the deep-linked solution step is step 3");
      deepLinkLines = [
        `the line→step deep link round-tripped through the app's ONE router (boq-line + step=3 query)`,
        `#solution-boq-trace-panel renders with the line data-selected="${traceSelected}" and the step-3 statement`,
      ];
    } else {
      deepLinkLines = ["the recorded plaster line was not found in the committed trace set"];
    }
    observations.push({
      id: "w2.solution-step",
      name: "SOLUTION STEP — the line→step trace deep link round-trips to the contributing step",
      pass: deepLinkPass,
      lines: deepLinkLines,
    });

    /* ---- Leg: the reality seal (observed reality byte-unchanged). ---- */
    await page.getByRole("button", { name: "Use the accessible view (no drawing)" }).click();
    const observedSceneAfter = await page
      .locator('[aria-label="Building contents (accessible view)"]')
      .innerText();
    const baselineAfter = await page
      .locator("#solution-workspace")
      .getAttribute("data-baseline-reality-version");
    const sealPass =
      observedSceneAfter === observedSceneBefore &&
      baselineAfter === SOLUTION_WORLD_PINS.baselineRealityVersionId;
    observations.push({
      id: "w2.reality-seal",
      name: "the observed scene stays byte-identical across the whole journey (the read-only anchors)",
      pass: sealPass,
      lines: [
        `observed scene byte-identical before/after the authoring: ${observedSceneAfter === observedSceneBefore}`,
        `baseline-reality-version pin held: ${baselineAfter} (read-only reality anchors)`,
      ],
    });

    return observations;
  } finally {
    await pageHandle.close();
  }
}
