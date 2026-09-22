/**
 * PROD-012 — deployed-browser verification: the seven §4.3 checks.
 *
 * Shared doctrine (mirrors tools/smoke.ts):
 *
 * - every check returns a named CheckReport with one-line proof excerpts;
 * - every wait draws from BUDGETS (no unbounded sleep anywhere);
 * - every page interaction goes through the REAL page at the REAL target
 *   origin (each check navigates and re-asserts the origin — measurement
 *   causality is verified, never assumed);
 * - the deployed service is read-mostly: the only server-side writes are
 *   this suite's OWN demo sessions (mint) and their deletion (logout).
 *   ALWAYS-cleanup state machine per check: a session minted by a check
 *   body that did not complete its own logout is deleted in the check's
 *   finally (via the product's Sign out control or the same DELETE the
 *   app issues); a finally cleanup that still fails is reported to the
 *   runner through noteCleanupFailure and fails the whole run;
 * - transient network/navigation failures throw TransientCheckError (the
 *   runner retries such a check exactly once); semantic assertion
 *   failures are deterministic evidence and are never retried.
 */

import { AxeBuilder } from "@axe-core/playwright";
import type { Browser, Page } from "playwright";
import type { ConsoleGuard } from "./console-guard";
import { BUDGETS, EXPECTED_TITLE, VIEWPORTS } from "./config";
import type { ResolvedTarget, Viewport } from "./config";
import { newCheckPage } from "./browser";
import type { CheckPage } from "./browser";
import {
  TransientCheckError,
  allPassed,
  failedReport,
  passedReport,
  type CheckAssertion,
  type CheckReport,
} from "./verdict";

/** What one check needs from the run. */
export interface CheckContext {
  readonly browser: Browser;
  readonly target: ResolvedTarget;
  readonly guard: ConsoleGuard;
  /** Run-level cleanup-failure channel (fails the whole run). */
  readonly noteCleanupFailure: (message: string) => void;
}

/* ------------------------------------------------------------------ */
/* Bounded primitives                                                  */
/* ------------------------------------------------------------------ */

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
 * The page globals the in-page evaluate callbacks touch, typed STRUCTURALLY.
 *
 * The tools/ tsconfig deliberately compiles without the DOM lib (the
 * repo's Node-side tools never need it), so the browser callbacks below
 * reach the page's globals through `globalThis` narrowed to this shape —
 * the ONLY page globals this suite uses, kept minimal and explicit
 * (fetch + AbortSignal for the session lifecycle; the scroll/viewport
 * measurements for the responsive checks).
 */
interface PageGlobal {
  readonly fetch: (
    input: string,
    init: { method: string; credentials: string; signal: unknown },
  ) => Promise<{ status: number; text: () => Promise<string> }>;
  readonly AbortSignal: { timeout: (ms: number) => unknown };
  readonly document: {
    readonly scrollingElement: { readonly scrollWidth: number } | null;
    readonly documentElement: { readonly scrollWidth: number };
  };
  readonly innerWidth: number;
}

/** One in-page fetch outcome (the body is bounded for evidence). */
interface PageFetchOutcome {
  readonly status: number;
  readonly bodyText: string;
}

/**
 * Fetch a same-origin path INSIDE the real page, with credentials
 * "include" (HttpOnly cookie semantics — the PROD-011B walk, in a real
 * browser). Pre-response failures (network error, abort) are transient;
 * an HTTP error STATUS is a legitimate outcome the caller asserts on.
 */
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
      { path, method, timeoutMs: BUDGETS.inPageFetchMs },
    );
  } catch (error) {
    throw new TransientCheckError(
      `in-page ${method} ${path} failed before a response arrived: ${describeError(error)}`,
      error,
    );
  }
}

/** Navigate to the target and PROVE the page is on the target origin. */
async function navigateToTarget(page: Page, target: ResolvedTarget): Promise<void> {
  try {
    await page.goto(target.origin, {
      timeout: BUDGETS.gotoMs,
      waitUntil: "domcontentloaded",
    });
  } catch (error) {
    throw new TransientCheckError(
      `navigation to ${target.origin} failed: ${describeError(error)}`,
      error,
    );
  }
  if (!page.url().startsWith(`${target.origin}/`) && page.url() !== target.origin) {
    throw new TransientCheckError(
      `navigation left the target origin: landed on ${page.url()}`,
      null,
    );
  }
}

/** Wait (bounded) for the anonymous auth gate — the deployment's landing state. */
async function waitForGate(page: Page): Promise<void> {
  try {
    await page.waitForSelector("h2#gate-title", {
      state: "visible",
      timeout: BUDGETS.landmarkMs,
    });
  } catch (error) {
    throw new TransientCheckError(
      `the auth gate (h2#gate-title) did not become visible within ${BUDGETS.landmarkMs} ms: ${describeError(error)}`,
      error,
    );
  }
}

/** Wait (bounded) for the signed-in application shell. */
async function waitForShell(page: Page): Promise<void> {
  try {
    await page.waitForSelector("header.app-header", {
      state: "visible",
      timeout: BUDGETS.landmarkMs,
    });
  } catch (error) {
    throw new TransientCheckError(
      `the application shell (header.app-header) did not become visible within ${BUDGETS.landmarkMs} ms: ${describeError(error)}`,
      error,
    );
  }
}

/**
 * Enter the demo through the product's OWN control (the gate's
 * "Enter demo" button → the app's POST /v1/auth/demo + whoami re-probe),
 * then wait for the signed-in shell.
 */
async function enterDemoViaUi(page: Page): Promise<void> {
  const button = page.getByRole("button", { name: "Enter demo", exact: true });
  try {
    await button.click({ timeout: BUDGETS.landmarkMs });
  } catch (error) {
    throw new TransientCheckError(
      `the "Enter demo" button could not be clicked: ${describeError(error)}`,
      error,
    );
  }
  await waitForShell(page);
}

/**
 * Clean up a minted session, honestly and always:
 * 1. the product's own "Sign out" control (waits for the gate to return);
 * 2. fallback: the same DELETE the app issues, through the page origin;
 * 3. one bounded retry of the fallback after backoff.
 * A 401 on the fallback means no live session remains — nothing to clean.
 */
async function signOutAndVerify(page: Page): Promise<string> {
  try {
    const button = page.getByRole("button", { name: "Sign out", exact: true });
    await button.click({ timeout: BUDGETS.landmarkMs });
    await page.waitForSelector("h2#gate-title", {
      state: "visible",
      timeout: BUDGETS.landmarkMs,
    });
    return "ok (Sign out control; the gate returned)";
  } catch {
    // fall through to the API fallback
  }
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const outcome = await fetchInPage(page, "/v1/auth/sessions/current", "DELETE");
      if (outcome.status >= 200 && outcome.status < 300) {
        return `ok (fallback in-page DELETE, attempt ${attempt})`;
      }
      if (outcome.status === 401) {
        return "ok (no live session remained — DELETE answered 401)";
      }
    } catch (error) {
      if (attempt === 2) {
        return `failed: sign-out UI and fallback DELETE both failed — ${describeError(error)}`;
      }
    }
    await sleep(BUDGETS.retryBackoffMs);
  }
  return "failed: sign-out UI and two fallback DELETE attempts did not complete";
}

/**
 * Delete the session through the page origin ONLY (the lean cleanup for
 * sessions minted by in-page fetch, where the shell's Sign out control
 * does not exist on the page). One bounded retry; a 401 means the session
 * is already gone (nothing to clean).
 */
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

/**
 * Deterministic proof that a live session cookie sits in the context jar
 * (the ALWAYS-cleanup trigger for UI-minted checks: the app's own button
 * may have minted a session even when a later wait failed transiently).
 * An unreadable jar counts as present — cleanup is attempted, never skipped.
 */
async function sessionCookiePresent(pageHandle: CheckPage, origin: string): Promise<boolean> {
  try {
    const cookies = await pageHandle.context.cookies(origin);
    return cookies.some((cookie) => cookie.name === "aise_session");
  } catch {
    return true;
  }
}

/** One horizontal-overflow measurement (CSS pixels). */
interface OverflowMeasurement {
  readonly scrollWidth: number;
  readonly innerWidth: number;
}

async function measureOverflow(page: Page): Promise<OverflowMeasurement> {
  return page.evaluate(() => {
    const pageGlobal = globalThis as unknown as PageGlobal;
    const scrolling = pageGlobal.document.scrollingElement ?? pageGlobal.document.documentElement;
    return { scrollWidth: scrolling.scrollWidth, innerWidth: pageGlobal.innerWidth };
  });
}

function overflowOk(measurement: OverflowMeasurement): boolean {
  return measurement.scrollWidth <= measurement.innerWidth + 1;
}

function overflowDetail(measurement: OverflowMeasurement): string {
  return `scrollWidth ${measurement.scrollWidth} vs innerWidth ${measurement.innerWidth} (budget +1)`;
}

function parseJson(text: string): Record<string, unknown> {
  try {
    const value = JSON.parse(text) as unknown;
    return asRecord(value) ?? {};
  } catch {
    return {};
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/* ------------------------------------------------------------------ */
/* Check 1 — availability (the browser context's request API)           */
/* ------------------------------------------------------------------ */

export async function checkAvailability(ctx: CheckContext): Promise<CheckReport> {
  const context = await ctx.browser.newContext();
  try {
    const assertions: CheckAssertion[] = [];
    const extras: string[] = [];

    // GET / — status, identity (title) and origin causality.
    const home = await context.request.get(`${ctx.target.origin}/`, {
      timeout: BUDGETS.requestApiMs,
    });
    const homeUrl = home.url();
    // The context request API reports the FINAL url path-relative for
    // same-origin responses ("/", "/healthz") — an off-origin redirect
    // would surface as an absolute foreign URL. Identity is anchored by
    // the <title> and the deployment host's x-vercel-id header below.
    assertions.push({
      name: "GET / answered on the target origin (no off-origin redirect)",
      pass:
        homeUrl.startsWith("/") ||
        homeUrl === ctx.target.origin ||
        homeUrl.startsWith(`${ctx.target.origin}/`),
      detail: `final URL ${homeUrl}`,
    });
    const homeText = await home.text();
    assertions.push({
      name: "GET / → HTTP 200",
      pass: home.status() === 200,
      detail: `status ${home.status()}`,
    });
    const titleMatch = /<title>([^<]*)<\/title>/.exec(homeText);
    const pageTitle = titleMatch?.[1]?.trim() ?? "";
    assertions.push({
      name: `GET / <title> is the product title "${EXPECTED_TITLE}"`,
      pass: pageTitle === EXPECTED_TITLE,
      detail: `title "${pageTitle}"`,
    });
    const vercelId = home.headers()["x-vercel-id"] ?? "";
    assertions.push({
      name: "GET / is served by the deployment host (x-vercel-id header present)",
      pass: vercelId !== "",
      detail: `x-vercel-id ${vercelId === "" ? "(absent)" : vercelId}`,
    });

    // GET /healthz — liveness.
    const healthz = await context.request.get(`${ctx.target.origin}/healthz`, {
      timeout: BUDGETS.requestApiMs,
    });
    const healthzBody = parseJson(await healthz.text());
    assertions.push({
      name: "GET /healthz → HTTP 200",
      pass: healthz.status() === 200,
      detail: `status ${healthz.status()}`,
    });
    assertions.push({
      name: "GET /healthz body ok === true",
      pass: healthzBody["ok"] === true,
      detail: `ok = ${String(healthzBody["ok"])}`,
    });
    extras.push(
      `healthz service=${String(healthzBody["service"])} version=${String(healthzBody["version"])}`,
    );

    // GET /readyz — readiness + the deployed-configuration regression gate.
    const readyz = await context.request.get(`${ctx.target.origin}/readyz`, {
      timeout: BUDGETS.requestApiMs,
    });
    const readyzBody = parseJson(await readyz.text());
    assertions.push({
      name: "GET /readyz → HTTP 200",
      pass: readyz.status() === 200,
      detail: `status ${readyz.status()}`,
    });
    assertions.push({
      name: "GET /readyz body ok === true",
      pass: readyzBody["ok"] === true,
      detail: `ok = ${String(readyzBody["ok"])}`,
    });
    const cost = asRecord(readyzBody["cost"]);
    const ledger = typeof cost?.["ledger"] === "string" ? cost["ledger"] : "(absent)";
    assertions.push({
      name: 'GET /readyz cost.ledger === "redis" (the deployed Redis pair is live)',
      pass: ledger === "redis",
      detail: `ledger = ${ledger}`,
    });
    const auth = asRecord(readyzBody["auth"]);
    const authStatus = typeof auth?.["status"] === "string" ? auth["status"] : "(absent)";
    const authMode = typeof auth?.["mode"] === "string" ? auth["mode"] : "(absent)";
    assertions.push({
      name: 'GET /readyz auth.status === "enabled" (the session-lifecycle precondition)',
      pass: authStatus === "enabled",
      detail: `auth.status = ${authStatus}, mode = ${authMode}`,
    });
    const artifacts = asRecord(readyzBody["artifacts"]);
    extras.push(
      `readyz artifacts backend=${String(artifacts?.["backend"])} status=${String(artifacts?.["status"])}`,
    );
    extras.push(`readyz cost window=${String(cost?.["windowId"])}`);

    return allPassed(assertions)
      ? passedReport("availability", assertions, extras)
      : failedReport("availability", assertions, extras);
  } finally {
    await context.close();
  }
}

/* ------------------------------------------------------------------ */
/* Check 2 — shell-renders (the real page mounts the product shell)     */
/* ------------------------------------------------------------------ */

export async function checkShellRenders(ctx: CheckContext): Promise<CheckReport> {
  const pageHandle = await newCheckPage(ctx.browser, ctx.guard, "shell-renders", VIEWPORTS.desktop);
  try {
    await navigateToTarget(pageHandle.page, ctx.target);
    await waitForGate(pageHandle.page);
    await sleep(BUDGETS.settleMs);

    const title = await pageHandle.page.title();
    // Measured through Playwright's locator API (no in-page globals):
    // root mount size, visible text volume and the shell's own landmarks.
    const rootChildren = await pageHandle.page.locator("main#app > *").count();
    const rootDescendants = await pageHandle.page.locator("main#app *").count();
    const gateHeading =
      ((await pageHandle.page.locator("h2#gate-title").textContent()) ?? "").trim();
    const demoButtonText = (
      (await pageHandle.page
        .getByRole("button", { name: "Enter demo", exact: true })
        .textContent()) ?? ""
    ).trim();
    const bodyText = ((await pageHandle.page.locator("body").innerText()) ?? "").trim();
    const measurement = {
      rootChildren,
      rootDescendants,
      bodyTextLength: bodyText.length,
      bodyTextSample: bodyText.slice(0, 90).replace(/\s+/g, " "),
      gateHeading,
      demoButtonText,
    };

    const assertions: CheckAssertion[] = [
      {
        name: "the document title is the product title",
        pass: title === EXPECTED_TITLE,
        detail: `title "${title}"`,
      },
      {
        name: "the app root (#app) mounted non-trivial DOM",
        pass: measurement.rootChildren >= 1 && measurement.rootDescendants >= 5,
        detail: `root children ${measurement.rootChildren}, descendants ${measurement.rootDescendants}`,
      },
      {
        name: "the document is not blank",
        pass: measurement.bodyTextLength >= 40,
        detail: `body text ${measurement.bodyTextLength} chars — "${measurement.bodyTextSample}"`,
      },
      {
        name: 'the product shell landmark "Sign in to AISE" is present (the auth gate)',
        pass: measurement.gateHeading === "Sign in to AISE",
        detail: `gate heading "${measurement.gateHeading}"`,
      },
      {
        name: 'the documented demo path ("Enter demo") is offered',
        pass: measurement.demoButtonText.includes("Enter demo"),
        detail: `button "${measurement.demoButtonText}"`,
      },
    ];

    return allPassed(assertions)
      ? passedReport("shell-renders", assertions)
      : failedReport("shell-renders", assertions);
  } finally {
    await pageHandle.close();
  }
}

/* ------------------------------------------------------------------ */
/* Check 3 — session-lifecycle (real page origin, credentials include)  */
/* ------------------------------------------------------------------ */

export async function checkSessionLifecycle(ctx: CheckContext): Promise<CheckReport> {
  const pageHandle = await newCheckPage(
    ctx.browser,
    ctx.guard,
    "session-lifecycle",
    VIEWPORTS.desktop,
  );
  // ALWAYS-cleanup state: whatever happens below, a session this check
  // minted is deleted (logout) before the check finishes reporting.
  let minted = false;
  let loggedOut = false;
  try {
    await navigateToTarget(pageHandle.page, ctx.target);
    await waitForGate(pageHandle.page);

    const assertions: CheckAssertion[] = [];
    const extras: string[] = [];

    // 1. MINT — POST /v1/auth/demo through the page origin.
    const mint = await fetchInPage(pageHandle.page, "/v1/auth/demo", "POST");
    const mintBody = parseJson(mint.bodyText);
    const mintOk = mintBody["ok"] === true;
    const mintPrincipal = asRecord(mintBody["principal"]);
    if (mint.status >= 200 && mint.status < 300) {
      minted = true;
    }
    assertions.push({
      name: "POST /v1/auth/demo → 2xx",
      pass: mint.status >= 200 && mint.status < 300,
      detail: `status ${mint.status}, body ${mint.bodyText.slice(0, 120)}`,
    });
    assertions.push({
      name: "POST /v1/auth/demo mints the demo principal",
      pass:
        mintOk &&
        mintPrincipal?.["kind"] === "demo" &&
        typeof mintPrincipal?.["displayName"] === "string",
      detail: `principal ${JSON.stringify(mintPrincipal)}`,
    });

    // Session cookie evidence (HttpOnly — read through the context cookie
    // jar, exactly as a real browser holds it, never through page JS).
    const cookies = await pageHandle.context.cookies(ctx.target.origin);
    const sessionCookie = cookies.find((cookie) => cookie.name === "aise_session");
    const maxAgeSeconds =
      sessionCookie !== undefined && sessionCookie.expires > 0
        ? Math.round(sessionCookie.expires - Date.now() / 1000)
        : 0;
    assertions.push({
      name: "the HttpOnly session cookie (aise_session) was set",
      pass: sessionCookie !== undefined,
      detail:
        sessionCookie !== undefined
          ? `value ${sessionCookie.value.slice(0, 24)}…[redacted] maxAge≈${maxAgeSeconds}s sameSite=${sessionCookie.sameSite}`
          : "no aise_session cookie in the jar",
    });
    assertions.push({
      name: "the session cookie is HttpOnly and Secure",
      pass: sessionCookie !== undefined && sessionCookie.httpOnly && sessionCookie.secure,
      detail:
        sessionCookie !== undefined
          ? `httpOnly=${sessionCookie.httpOnly} secure=${sessionCookie.secure}`
          : "no cookie to inspect",
    });
    if (sessionCookie !== undefined) {
      extras.push(
        `session cookie evidence: name=${sessionCookie.name} value-prefix=${sessionCookie.value.slice(0, 24)}…[redacted] path=${sessionCookie.path} sameSite=${sessionCookie.sameSite} maxAge≈${maxAgeSeconds}s`,
      );
    }

    // 2. AUTHENTICATED WHOAMI — same browser context, cookie semantics.
    const whoami = await fetchInPage(pageHandle.page, "/v1/auth/whoami", "GET");
    const whoamiBody = parseJson(whoami.bodyText);
    const whoamiPrincipal = asRecord(whoamiBody["principal"]);
    const principalsMatch = JSON.stringify(mintPrincipal) === JSON.stringify(whoamiPrincipal);
    assertions.push({
      name: "GET /v1/auth/whoami → 200 (authenticated, same browser context)",
      pass: whoami.status === 200,
      detail: `status ${whoami.status}`,
    });
    assertions.push({
      name: "GET /v1/auth/whoami ok === true with the minted principal",
      pass: whoami.status === 200 && whoamiBody["ok"] === true && mintOk && principalsMatch,
      detail: `principal ${JSON.stringify(whoamiPrincipal)}`,
    });

    // 3. LOGOUT — DELETE /v1/auth/sessions/current.
    const logout = await fetchInPage(pageHandle.page, "/v1/auth/sessions/current", "DELETE");
    const logoutBody = parseJson(logout.bodyText);
    if (logout.status >= 200 && logout.status < 300) {
      loggedOut = true;
    }
    assertions.push({
      name: "DELETE /v1/auth/sessions/current → 2xx",
      pass: logout.status >= 200 && logout.status < 300,
      detail: `status ${logout.status}, body ${logout.bodyText.slice(0, 120)}`,
    });
    assertions.push({
      name: "DELETE /v1/auth/sessions/current body ok === true",
      pass: logoutBody["ok"] === true,
      detail: `ok = ${String(logoutBody["ok"])}`,
    });

    // 4. FAIL-CLOSED — whoami after logout MUST be exactly 401. In a real
    //    browser the logout response also CLEARS the cookie, so the 401 is
    //    the "no session presented" member (authentication_required) of the
    //    documented fail-closed family; PROD-011B's curl walk (cookie not
    //    auto-cleared) observed session_invalid. Both are the honest 401.
    const whoamiAfter = await fetchInPage(pageHandle.page, "/v1/auth/whoami", "GET");
    const afterBody = parseJson(whoamiAfter.bodyText);
    const afterError = asRecord(afterBody["error"]);
    const afterCode = typeof afterError?.["code"] === "string" ? afterError["code"] : "";
    assertions.push({
      name: "GET /v1/auth/whoami after logout → 401 (fail-closed; a 200 would be critical)",
      pass: whoamiAfter.status === 401,
      detail: `status ${whoamiAfter.status}${whoamiAfter.status !== 401 ? `, body ${whoamiAfter.bodyText.slice(0, 120)}` : ""}`,
    });
    assertions.push({
      name: "the 401 carries the typed fail-closed error envelope",
      pass:
        whoamiAfter.status === 401 &&
        (afterCode === "authentication_required" || afterCode === "session_invalid"),
      detail: `error.code = ${afterCode === "" ? "(absent)" : afterCode}`,
    });
    extras.push(
      `post-logout 401 code=${afterCode} (the real browser applies the logout Set-Cookie, so no session is presented; PROD-011B's curl walk kept the cookie and observed session_invalid — the same fail-closed gate from its two documented sides)`,
    );
    const cookiesAfter = await pageHandle.context.cookies(ctx.target.origin);
    extras.push(
      `post-logout cookie state: ${cookiesAfter.length} cookie(s) remain in the jar (the server-side session record is deleted — whoami 401 is the proof)`,
    );

    const cleanupLine = loggedOut
      ? "cleanup: ok (logout in the check body)"
      : minted
        ? "cleanup: deferred to the finally fallback (see the cleanup line above)"
        : "cleanup: not-needed (no session was minted)";
    return allPassed(assertions)
      ? passedReport("session-lifecycle", assertions, [...extras, cleanupLine])
      : failedReport("session-lifecycle", assertions, [...extras, cleanupLine]);
  } finally {
    if (minted && !loggedOut) {
      // The shell's Sign out control is not on this page (the session was
      // minted through the page-origin fetch, not the UI button) — the
      // lean DELETE-only cleanup is the right tool.
      const fallback = await deleteSessionInPage(pageHandle.page);
      if (fallback.startsWith("failed")) {
        ctx.noteCleanupFailure(`session-lifecycle finally cleanup: ${fallback}`);
      } else {
        console.log(`  cleanup: session-lifecycle finally fallback — ${fallback}`);
      }
    }
    await pageHandle.close();
  }
}

/* ------------------------------------------------------------------ */
/* Checks 4+5 — responsive-desktop / responsive-mobile                 */
/* ------------------------------------------------------------------ */

async function checkResponsiveAt(
  ctx: CheckContext,
  viewport: Viewport,
  isMobile: boolean,
): Promise<CheckReport> {
  const checkName = isMobile ? "responsive-mobile" : "responsive-desktop";
  const pageHandle = await newCheckPage(ctx.browser, ctx.guard, checkName, viewport);
  let bodyCleanupOk = false;
  try {
    const page = pageHandle.page;
    await navigateToTarget(page, ctx.target);
    await waitForGate(page);
    await sleep(BUDGETS.settleMs);

    const assertions: CheckAssertion[] = [];
    const extras: string[] = [];

    // The anonymous landing (gate) must not overflow horizontally.
    const gateOverflow = await measureOverflow(page);
    assertions.push({
      name: "no horizontal overflow on the anonymous landing (gate)",
      pass: overflowOk(gateOverflow),
      detail: overflowDetail(gateOverflow),
    });

    // Enter the demo through the product's own control, then measure the
    // signed-in shell — the §4.3 responsive assertion state.
    await enterDemoViaUi(page);
    await sleep(BUDGETS.settleMs);
    const shellOverflow = await measureOverflow(page);
    assertions.push({
      name: `no horizontal overflow on the signed-in shell (${viewport.label})`,
      pass: overflowOk(shellOverflow),
      detail: overflowDetail(shellOverflow),
    });

    // The shell landmark must be visible at this breakpoint.
    const headerVisible = await page.locator("header.app-header").first().isVisible();
    const brandName = await page.locator("header.app-header .brand-name").first().textContent();
    assertions.push({
      name: "the shell landmark (header.app-header) is visible",
      pass: headerVisible && brandName === "AISE",
      detail: `visible=${headerVisible} brand="${brandName ?? ""}"`,
    });

    if (!isMobile) {
      // Desktop: the primary nav is a persistent visible rail.
      const navVisible = await page.locator("nav#primary-nav").first().isVisible();
      assertions.push({
        name: "the primary navigation rail is visible at the desktop breakpoint",
        pass: navVisible,
        detail: `nav#primary-nav visible=${navVisible}`,
      });
    } else {
      // Mobile: the nav is a closed drawer behind the toggle — verify the
      // toggle is the visible affordance and that OPENING the drawer
      // still fits the viewport (the drawer is pure layout, no network).
      const toggleVisible = await page.locator("button.nav-toggle").first().isVisible();
      assertions.push({
        name: "the navigation drawer toggle is visible at the mobile breakpoint",
        pass: toggleVisible,
        detail: `nav-toggle visible=${toggleVisible}`,
      });
      await page.locator("button.nav-toggle").first().click({ timeout: BUDGETS.landmarkMs });
      await page.waitForSelector('nav#primary-nav[data-open="true"]', {
        state: "visible",
        timeout: BUDGETS.landmarkMs,
      });
      await sleep(BUDGETS.settleMs);
      const drawerOverflow = await measureOverflow(page);
      assertions.push({
        name: "no horizontal overflow with the mobile navigation drawer open",
        pass: overflowOk(drawerOverflow),
        detail: overflowDetail(drawerOverflow),
      });
    }

    // ALWAYS clean up this check's minted session (the doctrine).
    const cleanup = await signOutAndVerify(page);
    bodyCleanupOk = !cleanup.startsWith("failed");
    extras.push(`cleanup: ${cleanup}`);
    if (!bodyCleanupOk) {
      assertions.push({
        name: "session cleanup after the responsive check",
        pass: false,
        detail: cleanup,
      });
    }

    return allPassed(assertions)
      ? passedReport(checkName, assertions, extras)
      : failedReport(checkName, assertions, extras);
  } finally {
    // ALWAYS-cleanup, cookie-presence-driven: a live aise_session in the
    // jar after the body (for ANY reason — a mid-body failure included)
    // is deleted here before the context closes.
    if (!bodyCleanupOk && (await sessionCookiePresent(pageHandle, ctx.target.origin))) {
      const fallback = await signOutAndVerify(pageHandle.page);
      if (fallback.startsWith("failed")) {
        ctx.noteCleanupFailure(`${checkName} finally cleanup: ${fallback}`);
      } else {
        console.log(`  cleanup: ${checkName} finally fallback — ${fallback}`);
      }
    }
    await pageHandle.close();
  }
}

export async function checkResponsiveDesktop(ctx: CheckContext): Promise<CheckReport> {
  return checkResponsiveAt(ctx, VIEWPORTS.desktop, false);
}

export async function checkResponsiveMobile(ctx: CheckContext): Promise<CheckReport> {
  return checkResponsiveAt(ctx, VIEWPORTS.mobile, true);
}

/* ------------------------------------------------------------------ */
/* Check 6 — accessibility (axe-core at BOTH viewports)                 */
/* ------------------------------------------------------------------ */

/** Count axe violations by impact level. */
function countByImpact(
  violations: readonly { readonly impact?: string | null }[],
): { critical: number; serious: number; moderate: number; minor: number; none: number } {
  const counts = { critical: 0, serious: 0, moderate: 0, minor: 0, none: 0 };
  for (const violation of violations) {
    switch (violation.impact) {
      case "critical":
        counts.critical += 1;
        break;
      case "serious":
        counts.serious += 1;
        break;
      case "moderate":
        counts.moderate += 1;
        break;
      case "minor":
        counts.minor += 1;
        break;
      default:
        counts.none += 1;
        break;
    }
  }
  return counts;
}

async function axeAtViewport(
  ctx: CheckContext,
  viewport: Viewport,
): Promise<{ assertions: CheckAssertion[]; extras: string[] }> {
  const pageHandle = await newCheckPage(
    ctx.browser,
    ctx.guard,
    `accessibility@${viewport.label}`,
    viewport,
  );
  let bodyCleanupOk = false;
  try {
    const page = pageHandle.page;
    await navigateToTarget(page, ctx.target);
    await waitForGate(page);
    // 2026-09-22 (pass-17 forensics): settle before the demo click, exactly
    // like the responsive legs (line ~675). Without the settle this leg
    // raced the gate's hydration — the Enter-demo click landed ~50ms after
    // the gate became visible and was silently swallowed in ~50% of fresh
    // contexts (probe-verified: zero-settle clicks fail intermittently;
    // 1.5s-settle clicks pass 4/4 with a clean POST /v1/auth/demo → 200).
    await sleep(BUDGETS.settleMs);
    await enterDemoViaUi(page);

    // The routed surface after Enter demo is the Dashboard — wait for its
    // heading, then bound the network settle before scanning.
    await page.waitForSelector("main#main-content h1", {
      state: "visible",
      timeout: BUDGETS.landmarkMs,
    });
    try {
      await page.waitForLoadState("networkidle", { timeout: BUDGETS.networkIdleMs });
    } catch {
      // non-fatal: the scan proceeds on the rendered DOM; a hung request
      // surfaces in the console-runtime-errors check.
    }

    // The bounded axe run (raced against the §4.1 budget).
    const results = await Promise.race([
      new AxeBuilder({ page }).analyze(),
      timeoutAfter(BUDGETS.axeRunMs, "the axe-core analysis"),
    ]);
    const counts = countByImpact(results.violations);

    const assertions: CheckAssertion[] = [
      {
        name: `zero critical axe violations (${viewport.label})`,
        pass: counts.critical === 0,
        detail: `critical=${counts.critical}`,
      },
      {
        name: `zero serious axe violations (${viewport.label})`,
        pass: counts.serious === 0,
        detail: `serious=${counts.serious}`,
      },
    ];
    const extras: string[] = [
      `axe violations by impact (${viewport.label}): critical=${counts.critical} serious=${counts.serious} moderate=${counts.moderate} minor=${counts.minor} (impact-less=${counts.none}); scanned the signed-in Dashboard shell`,
    ];
    for (const violation of results.violations) {
      const blocking = violation.impact === "critical" || violation.impact === "serious";
      extras.push(
        `  ${blocking ? "BLOCKING" : "reported (non-blocking)"}: [${violation.impact ?? "n/a"}] ${violation.id} — ${violation.help} (${violation.nodes.length} node(s))`,
      );
      if (blocking) {
        for (const node of violation.nodes.slice(0, 3)) {
          extras.push(`    node target=${JSON.stringify(node.target)} html=${node.html.slice(0, 120)}`);
        }
      }
    }

    // ALWAYS clean up this scan's minted session (the doctrine).
    const cleanup = await signOutAndVerify(page);
    bodyCleanupOk = !cleanup.startsWith("failed");
    if (!bodyCleanupOk) {
      assertions.push({
        name: "session cleanup after the accessibility scan",
        pass: false,
        detail: cleanup,
      });
    }
    extras.push(`cleanup: ${cleanup}`);
    return { assertions, extras };
  } finally {
    // ALWAYS-cleanup, cookie-presence-driven (see checkResponsiveAt).
    if (!bodyCleanupOk && (await sessionCookiePresent(pageHandle, ctx.target.origin))) {
      const fallback = await signOutAndVerify(pageHandle.page);
      if (fallback.startsWith("failed")) {
        ctx.noteCleanupFailure(`accessibility@${viewport.label} finally cleanup: ${fallback}`);
      } else {
        console.log(`  cleanup: accessibility@${viewport.label} finally fallback — ${fallback}`);
      }
    }
    await pageHandle.close();
  }
}

export async function checkAccessibility(ctx: CheckContext): Promise<CheckReport> {
  const desktop = await axeAtViewport(ctx, VIEWPORTS.desktop);
  await sleep(BUDGETS.interCheckMs);
  const mobile = await axeAtViewport(ctx, VIEWPORTS.mobile);
  const assertions = [...desktop.assertions, ...mobile.assertions];
  const extras = [...desktop.extras, ...mobile.extras];
  return allPassed(assertions)
    ? passedReport("accessibility", assertions, extras)
    : failedReport("accessibility", assertions, extras);
}

/* ------------------------------------------------------------------ */
/* Check 7 — console-runtime-errors (the whole run, aggregated)         */
/* ------------------------------------------------------------------ */

export async function checkConsoleRuntimeErrors(ctx: CheckContext): Promise<CheckReport> {
  const summary = ctx.guard.summarize();
  const assertions: CheckAssertion[] = [
    {
      name: "zero uncaught page errors (pageerror) across all page interactions",
      pass: summary.pageErrors.length === 0,
      detail: `${summary.pageErrors.length} event(s)`,
    },
    {
      name: "zero blocking console.error calls across all page interactions",
      pass: summary.blockingConsoleErrors.length === 0,
      detail: `${summary.blockingConsoleErrors.length} call(s)`,
    },
    {
      name: "zero blocking failed requests (document/script/style/font + unexpected xhr/fetch)",
      pass: summary.blockingFailedRequests.length === 0,
      detail: `${summary.blockingFailedRequests.length} request(s)`,
    },
  ];
  const extras: string[] = [
    `expected-by-design request failures excluded (handled by the product): ${summary.excludedExpectedRequests.length}`,
    `expected-by-design browser resource-error console lines excluded (the browser's own log for those same handled responses): ${summary.excludedConsoleErrors.length}`,
    `failed requests outside the blocking classes (reported, non-blocking): ${summary.otherFailedRequests.length}`,
  ];

  // First-3 excerpts per class (§4.3: report with excerpts).
  const excerptPairs: readonly (readonly [string, readonly ExcerptRecord[]])[] = [
    ["pageerror", summary.pageErrors.slice(0, 3)],
    ["console.error", summary.blockingConsoleErrors.slice(0, 3)],
    ["blocking request", summary.blockingFailedRequests.slice(0, 3)],
    ["excluded (by design)", summary.excludedExpectedRequests.slice(0, 3)],
    ["excluded console line (by design)", summary.excludedConsoleErrors.slice(0, 3)],
  ];
  for (const [label, records] of excerptPairs) {
    for (const record of records) {
      if ("message" in record) {
        extras.push(`  ${label} [${record.label}]: ${record.message.slice(0, 160)}`);
      } else if ("text" in record) {
        extras.push(`  ${label} [${record.label}]: ${record.text.slice(0, 160)}`);
      } else {
        extras.push(
          `  ${label} [${record.label}]: ${record.method} ${record.path} -> ${record.failureText}`,
        );
      }
    }
  }

  return allPassed(assertions)
    ? passedReport("console-runtime-errors", assertions, extras)
    : failedReport("console-runtime-errors", assertions, extras);
}

/** Union of the excerpt record shapes (page error / console / request). */
type ExcerptRecord =
  | { readonly label: string; readonly message: string }
  | { readonly label: string; readonly text: string; readonly locationUrl: string | null }
  | {
      readonly label: string;
      readonly method: string;
      readonly path: string;
      readonly failureText: string;
    };
