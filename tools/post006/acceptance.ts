/**
 * POST-006 — the LIVE-CHROMIUM acceptance + accessibility harness (plan §6
 * Wave 1 Worker 3, items 2 + 4; the plan §7 acceptance criteria).
 *
 * A STANDALONE harness (the PROD-033 journey-harness law: it is never
 * wired into `bun run verify` — it builds + serves the app and drives a
 * real browser). Every wait is bounded; every page is wired into the
 * run-wide ConsoleGuard before navigation; every session the harness
 * mints is cleaned up (sign-out through the product's own control or the
 * same-origin DELETE fallback); the serve is always stopped and its
 * ports proven dark.
 *
 * The checks (all over the local production-like serve — `bun run build`
 * + `bun run start` on the fixed scratch ports, demo-open auth shape):
 *
 *   A. ROUTE SWEEP (live) — every one of the eleven routes renders in a
 *      real browser (the shell landmarks + the route's own h1/heading),
 *      with a signed-in session, hash-navigating like a user would;
 *   B. THE FOUR BRIDGE SURFACES at BOTH viewports — each POST-005 bridge
 *      surface renders its bridge panel's HONEST live state (the local
 *      serve's task-flow lane answers the designed 404 family — the
 *      honest not-served reason, never a fabricated demo body);
 *   C. AXE-CORE at BOTH viewports over the SEVEN key surfaces (not only
 *      the Dashboard shell the PROD-012 check scans) — every violation
 *      enumerated by impact severity (critical / serious / moderate /
 *      minor), findings recorded honestly;
 *   D. FOCUS ORDER (desktop) — a real Tab traversal from the top: the
 *      skip link is the first stop, the sequence follows the DOM, no
 *      positive-tabindex jumps (pinned statically) and no invisible
 *      focus (every stop is visible);
 *   E. TOUCH TARGETS (mobile) — every visible interactive element's
 *      measured bounding box on each key surface: WCAG 2.5.8's 24×24
 *      CSS-pixel minimum is the gate; the 44×44 best practice is
 *      recorded per surface;
 *   F. THE GENUINE NEW-TAB COLD ALREADY-AUTHENTICATED LOAD — the one
 *      state a same-tab replay never enters (POST-004B): a signed-in
 *      session (shared cookie jar) opened in a NEW TAB (fresh
 *      sessionStorage — the remembered acting principal does NOT cross
 *      tabs by design) must render the honest UnresolvedPrincipalPanel
 *      instead of firing requester-guarded reads with a guessed
 *      principal;
 *   G. THE CONSOLE GUARD — zero page errors; blocking console errors and
 *      blocking failed requests enumerated (the expected-by-design 404
 *      family excluded, per the guard's own classifier).
 *
 * Evidence classes: every check is (live headless Chromium; local
 * production-like serve) — the deployed-check doctrine's "deterministic
 * (live Chromium)" class. No step is device or emulator evidence. The
 * record is written under docs/productization-evidence/POST-006/.
 *
 * Usage: bun tools/post006/acceptance.ts [--keep-record-off]
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { AxeBuilder } from "@axe-core/playwright";
import type { Browser, Page } from "playwright";
import { ROOT, sleep } from "../journey/classes";
import { buildOnce, startLocalServe, type LocalServe } from "../journey/serve";
import { chromiumExecutable, launchBrowser, newCheckPage } from "../deployed/browser";
import { ConsoleGuard } from "../deployed/console-guard";
import { BUDGETS, VIEWPORTS, type Viewport } from "../deployed/config";

/* ------------------------------------------------------------------ */
/* The harness's own budgets (all bounded)                              */
/* ------------------------------------------------------------------ */

const LOCAL_BUDGETS = {
  gotoMs: 30_000,
  landmarkMs: 20_000,
  settleMs: 1_500,
  axeRunMs: 60_000,
  tabCount: 18,
} as const;

/** The acceptance record (accumulated, written at the end). */
interface Finding {
  readonly severity: "critical" | "serious" | "moderate" | "minor";
  readonly where: string;
  readonly rule: string;
  readonly help: string;
  readonly nodes: number;
}

interface CheckOutcome {
  readonly id: string;
  readonly name: string;
  readonly pass: boolean;
  readonly lines: string[];
  readonly findings: readonly Finding[];
}

const outcomes: CheckOutcome[] = [];

function record(outcome: CheckOutcome): void {
  outcomes.push(outcome);
  const marker = outcome.pass ? "PASS" : "FAIL";
  console.log(`[${marker}] ${outcome.id} — ${outcome.name}`);
  for (const line of outcome.lines) {
    console.log(`    ${line}`);
  }
  for (const finding of outcome.findings) {
    console.log(
      `    finding [${finding.severity}] ${finding.where}: ${finding.rule} — ${finding.help} (${finding.nodes} node(s))`,
    );
  }
}

/* ------------------------------------------------------------------ */
/* Shared live helpers (the deployed-checks doctrine, local)            */
/* ------------------------------------------------------------------ */

/** Wait for the anonymous gate (the landing state of a fresh context). */
async function waitForGate(page: Page): Promise<void> {
  await page.waitForSelector("h2#gate-title", {
    state: "visible",
    timeout: LOCAL_BUDGETS.landmarkMs,
  });
}

/**
 * The page globals the in-page callbacks touch, typed STRUCTURALLY (the
 * tools/ tsconfig deliberately compiles without the DOM lib — the same
 * discipline as tools/deployed/checks.ts: the browser callback reaches the
 * page's globals through `globalThis` narrowed to this shape).
 */
interface PageElementLike {
  readonly id: string;
  readonly className: unknown;
  readonly tagName: string;
  readonly textContent: string | null;
  readonly getAttribute: (name: string) => string | null;
  readonly getBoundingClientRect: () => { readonly width: number; readonly height: number };
}

interface PageGlobalLike {
  readonly document: {
    readonly activeElement: PageElementLike | null;
    readonly body: PageElementLike | null;
    readonly querySelectorAll: (selector: string) => readonly PageElementLike[];
  };
  readonly getComputedStyle: (element: PageElementLike) => {
    readonly visibility: string;
    readonly display: string;
  };
}

interface SessionGlobalLike {
  readonly sessionStorage: { readonly getItem: (key: string) => string | null };
}

/** Read the remembered acting principal from the page's own sessionStorage. */
async function readRememberedPrincipal(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const pageGlobal = globalThis as unknown as SessionGlobalLike;
    return pageGlobal.sessionStorage.getItem("aise.acting-principal");
  });
}

/** Enter the demo through the product's own control, wait for the shell. */
async function enterDemo(page: Page): Promise<void> {
  await sleep(LOCAL_BUDGETS.settleMs);
  await page.getByRole("button", { name: "Enter demo", exact: true }).click({
    timeout: LOCAL_BUDGETS.landmarkMs,
  });
  await page.waitForSelector("header.app-header", {
    state: "visible",
    timeout: LOCAL_BUDGETS.landmarkMs,
  });
}

/** The route sweep's table (the eleven routes; the live serve's demo world). */
const P = "proj-riverside-refit";
const DEMO_SOLUTION_PROJECT = "proj-demo-001";
const ROUTE_SWEEP: readonly { readonly hash: string; readonly expectHeading: RegExp }[] = [
  { hash: "#/", expectHeading: /What do you need to do\?/ },
  { hash: "#/projects", expectHeading: /Projects/ },
  { hash: `#/projects/${P}`, expectHeading: /Project overview/ },
  { hash: `#/projects/${P}/capture`, expectHeading: /Capture \/ Upload/ },
  { hash: `#/projects/${P}/sitetwin`, expectHeading: /SiteTwin/ },
  { hash: `#/projects/${P}/boq-lens`, expectHeading: /BOQ Lens/ },
  { hash: `#/projects/${P}/case`, expectHeading: /Engineering Case/ },
  { hash: `#/projects/${P}/intervention`, expectHeading: /Intervention Studio/ },
  { hash: `#/projects/${DEMO_SOLUTION_PROJECT}/solution`, expectHeading: /Build solution|Composing/ },
  { hash: `#/projects/${P}/outcomes`, expectHeading: /Outcomes/ },
  { hash: "#/settings", expectHeading: /Settings/ },
];

/** The key surfaces the accessibility + touch-target checks scan. */
const KEY_SURFACES: readonly { readonly label: string; readonly hash: string }[] = [
  { label: "dashboard", hash: "#/" },
  { label: "projects", hash: "#/projects" },
  { label: "capture", hash: `#/projects/${P}/capture` },
  { label: "boq-lens", hash: `#/projects/${P}/boq-lens` },
  { label: "case", hash: `#/projects/${P}/case` },
  { label: "outcomes", hash: `#/projects/${P}/outcomes` },
  { label: "solution", hash: `#/projects/${DEMO_SOLUTION_PROJECT}/solution` },
];

/* ------------------------------------------------------------------ */
/* Check A — the live route sweep                                       */
/* ------------------------------------------------------------------ */

async function checkRouteSweep(
  browser: Browser,
  guard: ConsoleGuard,
  origin: string,
): Promise<void> {
  const handle = await newCheckPage(browser, guard, "route-sweep", VIEWPORTS.desktop);
  const lines: string[] = [];
  let pass = true;
  try {
    const page = handle.page;
    await page.goto(origin, { timeout: LOCAL_BUDGETS.gotoMs, waitUntil: "domcontentloaded" });
    await waitForGate(page);
    await enterDemo(page);
    for (const stop of ROUTE_SWEEP) {
      await page.goto(`${origin}/${stop.hash}`, {
        timeout: LOCAL_BUDGETS.gotoMs,
        waitUntil: "domcontentloaded",
      });
      await page.waitForSelector("main#main-content", { timeout: LOCAL_BUDGETS.landmarkMs });
      await sleep(LOCAL_BUDGETS.settleMs);
      const shellVisible = await page.locator("header.app-header").first().isVisible();
      // The routed surface's identity: an h1 where the surface composes one
      // (ten surfaces) or the first heading otherwise (the solution surface
      // — FINDING A11Y-1 records the missing h1). The h1 probe is
      // NON-waiting (count first — the solution route composes none).
      const h1Count = await page.locator("main#main-content h1").count();
      const h1 =
        h1Count > 0
          ? ((await page.locator("main#main-content h1").first().textContent()) ?? "").trim()
          : "";
      const firstHeading =
        h1 !== ""
          ? h1
          : ((await page.locator("main#main-content h2").first().textContent({
              timeout: 5_000,
            }).catch(() => "")) ?? "").trim() || "(no heading)";
      const headingOk =
        h1 !== "" ? stop.expectHeading.test(h1) : stop.expectHeading.test(firstHeading);
      const ok = shellVisible && headingOk;
      if (!ok) {
        pass = false;
      }
      lines.push(
        `${ok ? "ok" : "DEFECT"} ${stop.hash} → heading "${firstHeading}"${h1 === "" ? " (no h1 — first heading is an h2)" : ""}`,
      );
    }
    // Clean up the minted session through the product's own control.
    await page.getByRole("button", { name: "Sign out", exact: true }).click({
      timeout: LOCAL_BUDGETS.landmarkMs,
    });
    await waitForGate(page);
    lines.push("cleanup: signed out through the product's Sign out control (the gate returned)");
  } finally {
    await handle.close();
  }
  record({
    id: "A",
    name: "the live route sweep (all eleven routes, signed-in)",
    pass,
    lines,
    findings: [],
  });
}

/* ------------------------------------------------------------------ */
/* Check B — the four bridge surfaces at both viewports                */
/* ------------------------------------------------------------------ */

async function checkBridgeSurfaces(
  browser: Browser,
  guard: ConsoleGuard,
  origin: string,
  viewport: Viewport,
): Promise<void> {
  const handle = await newCheckPage(browser, guard, `bridge-surfaces@${viewport.label}`, viewport);
  const lines: string[] = [];
  let pass = true;
  const expect = (ok: boolean, line: string): void => {
    if (!ok) {
      pass = false;
    }
    lines.push(`${ok ? "ok" : "DEFECT"} ${line}`);
  };
  try {
    const page = handle.page;
    await page.goto(origin, { timeout: LOCAL_BUDGETS.gotoMs, waitUntil: "domcontentloaded" });
    await waitForGate(page);
    await enterDemo(page);

    /* The capture surface → the cross-device handoff bridge. */
    await page.goto(`${origin}/#/projects/${P}/capture`, {
      timeout: LOCAL_BUDGETS.gotoMs,
      waitUntil: "domcontentloaded",
    });
    await sleep(LOCAL_BUDGETS.settleMs);
    let bodyText = await page.locator("body").innerText();
    expect(bodyText.includes("Capture / Upload"), "capture: the surface renders (h1)");
    // The handoff panel's HONEST live state: the local serve answers the
    // API but does not serve the task-flow adapter objects (the designed
    // 404 family) — the panel states that reason, never a demo body.
    expect(
      bodyText.includes("does not serve the task-flow adapter contract objects") ||
        bodyText.includes("No task-flow objects recorded") ||
        bodyText.includes("Continue this task on the mobile field app"),
      "capture: the cross-device handoff panel renders its honest state",
    );

    /* The BOQ lens → the revision selector bridge. */
    await page.goto(`${origin}/#/projects/${P}/boq-lens`, {
      timeout: LOCAL_BUDGETS.gotoMs,
      waitUntil: "domcontentloaded",
    });
    await sleep(LOCAL_BUDGETS.settleMs);
    const selectorState = await page
      .locator("[data-selector-state], [data-selector-selection]")
      .first()
      .getAttribute("data-selector-state")
      .catch(() => null);
    const selectorPresent =
      (await page.locator("[data-selector-state]").count()) > 0 ||
      (await page.locator("[data-selector-selection]").count()) > 0;
    expect(
      selectorPresent,
      `boq-lens: the revision selector card renders (state=${selectorState ?? "selection"})`,
    );
    bodyText = await page.locator("body").innerText();
    expect(
      bodyText.includes("SOURCE BOQ") && bodyText.includes("Import a SOURCE BOQ"),
      "boq-lens: the source/solution separation + the import entry render",
    );

    /* The case surface → the missing-evidence bridge (honest live state). */
    await page.goto(`${origin}/#/projects/${P}/case`, {
      timeout: LOCAL_BUDGETS.gotoMs,
      waitUntil: "domcontentloaded",
    });
    await sleep(LOCAL_BUDGETS.settleMs);
    bodyText = await page.locator("body").innerText();
    expect(
      bodyText.includes("Engineering Case"),
      "case: the surface renders (h1) with its honest empty/live state",
    );

    /* The outcomes surface → the post-work capture return bridge. */
    await page.goto(`${origin}/#/projects/${P}/outcomes`, {
      timeout: LOCAL_BUDGETS.gotoMs,
      waitUntil: "domcontentloaded",
    });
    await sleep(LOCAL_BUDGETS.settleMs);
    bodyText = await page.locator("body").innerText();
    expect(
      bodyText.includes("Outcomes") &&
        (bodyText.includes("No executed work to capture post-work evidence for") ||
          bodyText.includes("post-work evidence")),
      "outcomes: the post-work capture bridge renders its honest state",
    );

    await page.getByRole("button", { name: "Sign out", exact: true }).click({
      timeout: LOCAL_BUDGETS.landmarkMs,
    });
    await waitForGate(page);
    lines.push("cleanup: signed out through the product's Sign out control");
  } finally {
    await handle.close();
  }
  record({
    id: `B@${viewport.label}`,
    name: `the four bridge surfaces render their honest live states (${viewport.label})`,
    pass,
    lines,
    findings: [],
  });
}

/* ------------------------------------------------------------------ */
/* Check C — axe-core over the seven key surfaces, both viewports      */
/* ------------------------------------------------------------------ */

async function checkAxe(
  browser: Browser,
  guard: ConsoleGuard,
  origin: string,
  viewport: Viewport,
): Promise<void> {
  const handle = await newCheckPage(browser, guard, `axe@${viewport.label}`, viewport);
  const lines: string[] = [];
  const findings: Finding[] = [];
  let pass = true;
  try {
    const page = handle.page;
    await page.goto(origin, { timeout: LOCAL_BUDGETS.gotoMs, waitUntil: "domcontentloaded" });
    await waitForGate(page);
    await enterDemo(page);
    for (const surface of KEY_SURFACES) {
      await page.goto(`${origin}/${surface.hash}`, {
        timeout: LOCAL_BUDGETS.gotoMs,
        waitUntil: "domcontentloaded",
      });
      await sleep(LOCAL_BUDGETS.settleMs);
      try {
        await page.waitForLoadState("networkidle", { timeout: BUDGETS.networkIdleMs });
      } catch {
        // non-fatal: the scan proceeds on the rendered DOM
      }
      const results = await Promise.race([
        new AxeBuilder({ page }).analyze(),
        sleep(LOCAL_BUDGETS.axeRunMs).then(() => null),
      ]);
      if (results === null) {
        pass = false;
        lines.push(
          `DEFECT ${surface.label}: the axe analysis exceeded its ${LOCAL_BUDGETS.axeRunMs} ms budget`,
        );
        continue;
      }
      let critical = 0;
      let serious = 0;
      let moderate = 0;
      let minor = 0;
      let none = 0;
      for (const violation of results.violations) {
        const severity: Finding["severity"] =
          violation.impact === "critical" ||
          violation.impact === "serious" ||
          violation.impact === "moderate"
            ? violation.impact
            : "minor";
        switch (violation.impact) {
          case "critical":
            critical += 1;
            break;
          case "serious":
            serious += 1;
            break;
          case "moderate":
            moderate += 1;
            break;
          case "minor":
            minor += 1;
            break;
          default:
            none += 1;
        }
        findings.push({
          severity,
          where: `${surface.label}@${viewport.label}`,
          rule: violation.id,
          help:
            violation.help +
            (severity === "critical" || severity === "serious"
              ? ` — nodes: ${violation.nodes
                  .slice(0, 3)
                  .map((node) => {
                    const failure = node.failureSummary
                      ? ` (${node.failureSummary.split("\n").slice(1, 3).join(";").trim()})`
                      : "";
                    return `${JSON.stringify(node.target)}${failure}`;
                  })
                  .join(" | ")}`
              : ""),
          nodes: violation.nodes.length,
        });
      }
      if (critical > 0 || serious > 0) {
        pass = false;
      }
      lines.push(
        `${surface.label}@${viewport.label}: critical=${critical} serious=${serious} moderate=${moderate} minor=${minor}${none > 0 ? ` (impact-less=${none})` : ""}`,
      );
    }
    await page.getByRole("button", { name: "Sign out", exact: true }).click({
      timeout: LOCAL_BUDGETS.landmarkMs,
    });
    await waitForGate(page);
    lines.push("cleanup: signed out through the product's Sign out control");
  } finally {
    await handle.close();
  }
  record({
    id: `C@${viewport.label}`,
    name: `axe-core over the seven key surfaces (${viewport.label}) — critical/serious gate, all findings enumerated`,
    pass,
    lines,
    findings,
  });
}

/* ------------------------------------------------------------------ */
/* Check D — focus order (a real Tab traversal, desktop)               */
/* ------------------------------------------------------------------ */

async function checkFocusOrder(
  browser: Browser,
  guard: ConsoleGuard,
  origin: string,
): Promise<void> {
  const handle = await newCheckPage(browser, guard, "focus-order", VIEWPORTS.desktop);
  const lines: string[] = [];
  let pass = true;
  try {
    const page = handle.page;
    await page.goto(origin, { timeout: LOCAL_BUDGETS.gotoMs, waitUntil: "domcontentloaded" });
    await waitForGate(page);
    await enterDemo(page);
    await sleep(LOCAL_BUDGETS.settleMs);

    // Walk the first LOCAL_BUDGETS.tabCount Tab stops from the top.
    const stops: string[] = [];
    for (let index = 0; index < LOCAL_BUDGETS.tabCount; index += 1) {
      await page.keyboard.press("Tab");
      await sleep(60);
      const active = await page.evaluate(() => {
        const pageGlobal = globalThis as unknown as PageGlobalLike;
        const element = pageGlobal.document.activeElement;
        if (element === null || element === pageGlobal.document.body) {
          return null;
        }
        const label =
          element.getAttribute("aria-label") ??
          (element.textContent ?? "").trim().split("\n")[0]?.slice(0, 48) ?? "";
        const box = element.getBoundingClientRect();
        const visible = box.width > 0 && box.height > 0;
        const classes =
          typeof element.className === "string" && element.className.length > 0
            ? `.${element.className.split(" ")[0]}`
            : "";
        return `${element.tagName.toLowerCase()}${element.id ? `#${element.id}` : ""}${classes} "${label}" visible=${visible}`;
      });
      if (active === null) {
        break;
      }
      stops.push(active);
      if (active.endsWith("visible=false")) {
        pass = false;
        lines.push(`DEFECT an invisible element received focus: ${active}`);
      }
    }
    // The skip link must be the FIRST tab stop (the keyboard user's exit).
    if (stops.length === 0 || !stops[0]!.includes("skip-link")) {
      pass = false;
      lines.push(`DEFECT the first Tab stop is not the skip link (got: ${stops[0] ?? "nothing"})`);
    } else {
      lines.push("ok the skip link is the first Tab stop");
    }
    // The nav toggle (the drawer control) precedes the nav links; the
    // main content follows the header/nav (DOM order = tab order).
    const toggleIndex = stops.findIndex((stop) => stop.includes("nav-toggle"));
    const navLinkIndex = stops.findIndex((stop) => stop.includes("nav-link"));
    if (toggleIndex >= 0 && navLinkIndex >= 0 && navLinkIndex < toggleIndex) {
      pass = false;
      lines.push("DEFECT a nav link is focused before the drawer toggle");
    }
    // no focus trap in the walked stops (the stops are not all identical)
    if (stops.length > 2 && new Set(stops).size < 3) {
      pass = false;
      lines.push(`DEFECT the Tab traversal appears trapped: ${stops.join(" | ")}`);
    }
    lines.push(`the first ${stops.length} Tab stops (DOM order):`);
    for (const stop of stops) {
      lines.push(`  → ${stop}`);
    }
    await page.getByRole("button", { name: "Sign out", exact: true }).click({
      timeout: LOCAL_BUDGETS.landmarkMs,
    });
    await waitForGate(page);
    lines.push("cleanup: signed out through the product's Sign out control");
  } finally {
    await handle.close();
  }
  record({
    id: "D",
    name: "focus order — the live Tab traversal (desktop)",
    pass,
    lines,
    findings: [],
  });
}

/* ------------------------------------------------------------------ */
/* Check E — touch targets (measured, mobile viewport)                 */
/* ------------------------------------------------------------------ */

async function checkTouchTargets(
  browser: Browser,
  guard: ConsoleGuard,
  origin: string,
): Promise<void> {
  const handle = await newCheckPage(browser, guard, "touch-targets", VIEWPORTS.mobile);
  const lines: string[] = [];
  const findings: Finding[] = [];
  let pass = true;
  try {
    const page = handle.page;
    await page.goto(origin, { timeout: LOCAL_BUDGETS.gotoMs, waitUntil: "domcontentloaded" });
    await waitForGate(page);
    await enterDemo(page);
    for (const surface of KEY_SURFACES) {
      await page.goto(`${origin}/${surface.hash}`, {
        timeout: LOCAL_BUDGETS.gotoMs,
        waitUntil: "domcontentloaded",
      });
      await sleep(LOCAL_BUDGETS.settleMs);
      const measured = await page.evaluate(() => {
        const pageGlobal = globalThis as unknown as PageGlobalLike;
        // A NodeList is array-like, not an Array — materialize it first
        // (the structural type is the honest page contract).
        const controls = Array.from(
          pageGlobal.document.querySelectorAll(
            "a[href], button, input, select, textarea, summary",
          ) as unknown as readonly PageElementLike[],
        );
        const visible = controls.filter((element) => {
          const box = element.getBoundingClientRect();
          const style = pageGlobal.getComputedStyle(element);
          return (
            box.width > 0 &&
            box.height > 0 &&
            style.visibility !== "hidden" &&
            style.display !== "none"
          );
        });
        return visible.map((element) => {
          const box = element.getBoundingClientRect();
          const label =
            element.getAttribute("aria-label") ??
            (element.textContent ?? "").trim().split("\n")[0]?.slice(0, 40) ?? "";
          return {
            label,
            tag: element.tagName.toLowerCase(),
            width: Math.round(box.width),
            height: Math.round(box.height),
          };
        });
      });
      const below24 = measured.filter((entry) => entry.width < 24 || entry.height < 24);
      const below44 = measured.filter((entry) => entry.width < 44 || entry.height < 44);
      if (below24.length > 0) {
        pass = false;
        for (const entry of below24) {
          findings.push({
            severity: "serious",
            where: `${surface.label}@mobile`,
            rule: "touch-target-size (WCAG 2.5.8 minimum 24×24 CSS px)",
            help: `${entry.tag} "${entry.label}" measures ${entry.width}×${entry.height}`,
            nodes: 1,
          });
        }
      }
      lines.push(
        `${surface.label}@mobile: ${measured.length} visible controls; ${below24.length} below the 24×24 minimum; ${below44.length} below the 44×44 best practice`,
      );
    }
    await page.getByRole("button", { name: "Sign out", exact: true }).click({
      timeout: LOCAL_BUDGETS.landmarkMs,
    });
    await waitForGate(page);
    lines.push("cleanup: signed out through the product's Sign out control");
  } finally {
    await handle.close();
  }
  record({
    id: "E",
    name: "touch targets — measured at the mobile breakpoint (24×24 WCAG 2.5.8 gate; 44×44 recorded)",
    pass,
    lines,
    findings,
  });
}

/* ------------------------------------------------------------------ */
/* Check F — the genuine new-tab cold already-authenticated load        */
/* ------------------------------------------------------------------ */

async function checkColdAuthenticatedNewTab(
  browser: Browser,
  guard: ConsoleGuard,
  origin: string,
): Promise<void> {
  // ONE context: the cookie jar is shared across its pages, sessionStorage
  // is NOT (per-tab by design — the exact POST-004B defect mechanism).
  const context = await browser.newContext({
    viewport: { width: VIEWPORTS.desktop.width, height: VIEWPORTS.desktop.height },
  });
  const page1 = await context.newPage();
  guard.attach(page1, "cold-auth-page1");
  const lines: string[] = [];
  let pass = true;
  try {
    await page1.goto(origin, { timeout: LOCAL_BUDGETS.gotoMs, waitUntil: "domcontentloaded" });
    await waitForGate(page1);
    await enterDemo(page1);
    await sleep(LOCAL_BUDGETS.settleMs);
    // The demo principal IS remembered in page 1's sessionStorage.
    const page1Principal = await readRememberedPrincipal(page1);
    lines.push(
      `page 1: the demo session is live; the remembered acting principal is "${page1Principal}"`,
    );

    // THE genuine new tab: a second page in the SAME context — the session
    // cookie crosses, the remembered principal does not.
    const page2 = await context.newPage();
    guard.attach(page2, "cold-auth-page2");
    await page2.goto(origin, { timeout: LOCAL_BUDGETS.gotoMs, waitUntil: "domcontentloaded" });
    await page2.waitForSelector("header.app-header", {
      state: "visible",
      timeout: LOCAL_BUDGETS.landmarkMs,
    });
    await sleep(LOCAL_BUDGETS.settleMs * 2);
    const page2Principal = await readRememberedPrincipal(page2);
    const bodyText = await page2.locator("body").innerText();
    const panelRendered = bodyText.includes(
      "Your session is authenticated, but this tab has not resolved the acting principal",
    );
    if (!panelRendered) {
      pass = false;
    }
    lines.push(
      `page 2 (the new tab): the remembered principal here is ${page2Principal === null ? "null (fresh sessionStorage — the defect's mechanism)" : `"${page2Principal}"`}`,
    );
    lines.push(
      `${panelRendered ? "ok" : "DEFECT"} the UnresolvedPrincipalPanel ${panelRendered ? "renders (the honest hold state; guarded reads held)" : "did NOT render"}`,
    );

    // Clean up BOTH pages' session (the shared cookie jar — one sign-out).
    for (const page of [page1, page2]) {
      await page
        .getByRole("button", { name: "Sign out", exact: true })
        .click({ timeout: LOCAL_BUDGETS.landmarkMs })
        .catch(() => {});
    }
    lines.push("cleanup: signed out (the shared session) through the product's Sign out control");
  } finally {
    await context.close();
  }
  record({
    id: "F",
    name: "the genuine new-tab cold already-authenticated load (POST-004B's one state a same-tab replay never enters)",
    pass,
    lines,
    findings: [],
  });
}

/* ------------------------------------------------------------------ */
/* The record writer                                                   */
/* ------------------------------------------------------------------ */

function currentSha(): string {
  const proc = Bun.spawnSync({ cmd: ["git", "rev-parse", "HEAD"], cwd: ROOT });
  return proc.stdout.toString().trim();
}

function writeAcceptanceRecord(origin: string, chromiumVersion: string, exitPass: boolean): string {
  const evidenceDir = join(ROOT, "docs", "productization-evidence", "POST-006");
  mkdirSync(evidenceDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const file = join(evidenceDir, `acceptance-${stamp}.md`);
  const allFindings = outcomes.flatMap((outcome) => outcome.findings);
  const bySeverity = (severity: Finding["severity"]): readonly Finding[] =>
    allFindings.filter((finding) => finding.severity === severity);
  const lines: string[] = [
    "# POST-006 — the live-Chromium acceptance + accessibility record",
    "",
    `- Base URL: ${origin} (the local production-like serve: build → start, demo-open auth shape)`,
    `- Repo SHA at run time: ${currentSha()}`,
    `- Browser: headless Chromium ${chromiumVersion}`,
    `- Evidence class of every check: deterministic (live headless Chromium; local production-like serve). No step is device or emulator evidence.`,
    `- Overall: ${exitPass ? "PASS" : "FAIL"}`,
    "",
    "## Checks",
    "",
  ];
  for (const outcome of outcomes) {
    lines.push(`### ${outcome.id} — ${outcome.name}: ${outcome.pass ? "PASS" : "FAIL"}`, "");
    for (const line of outcome.lines) {
      lines.push(`- ${line}`);
    }
    if (outcome.findings.length > 0) {
      lines.push("", "Findings:");
      for (const finding of outcome.findings) {
        lines.push(
          `- [${finding.severity}] ${finding.where}: ${finding.rule} — ${finding.help} (${finding.nodes} node(s))`,
        );
      }
    }
    lines.push("");
  }
  lines.push("## The findings ledger (by severity)", "");
  for (const severity of ["critical", "serious", "moderate", "minor"] as const) {
    const group = bySeverity(severity);
    lines.push(`- ${severity}: ${group.length}`);
    for (const finding of group) {
      lines.push(
        `  - ${finding.where}: ${finding.rule} — ${finding.help} (${finding.nodes} node(s))`,
      );
    }
  }
  lines.push(
    "",
    "## Honesty notes",
    "",
    "- The axe scans cover the SEVEN key surfaces at BOTH breakpoints (the PROD-012 deployed check scans the Dashboard shell only); the critical/serious counts are the gate, moderate/minor are recorded findings.",
    "- The touch-target gate is WCAG 2.5.8's 24×24 CSS-pixel minimum (AA); the 44×44 best-practice shortfall is recorded per surface, not gated.",
    "- The local serve's task-flow lane answers the designed 404 family: the bridge panels' honest not-served states are the EXPECTED render on this serve (pinned live here; the demo bodies are pinned deterministically by the static suites).",
    "- Check F exercises the one state a same-tab replay never enters (a new tab shares the cookie jar but NOT the per-tab sessionStorage) — the POST-004B successor-handoff item.",
    "- Static FINDING A11Y-1 (the solution surface's missing top-level h1) is recorded in apps/web/src/app/post006-accessibility.test.tsx; the live sweep surfaces it as the h1-less route heading.",
  );
  writeFileSync(file, lines.join("\n") + "\n", "utf8");
  return file;
}

/* ------------------------------------------------------------------ */
/* The runner                                                          */
/* ------------------------------------------------------------------ */

const KEEP_RECORD = !process.argv.includes("--keep-record-off");

async function main(): Promise<void> {
  console.log("POST-006 acceptance + accessibility harness (live Chromium)");
  chromiumExecutable(); // fail fast + actionable (never a silent fallback)
  const build = buildOnce();
  if (!build.pass) {
    console.error("the build failed — no acceptance run:");
    for (const line of build.lines) {
      console.error(`  ${line}`);
    }
    process.exit(1);
  }
  const serve: LocalServe = await startLocalServe();
  const guard = new ConsoleGuard();
  const browser = await launchBrowser();
  const chromiumVersion = browser.version();
  const origin = serve.webOrigin;
  let exitPass = true;
  try {
    await checkRouteSweep(browser, guard, origin);
    await checkBridgeSurfaces(browser, guard, origin, VIEWPORTS.desktop);
    await checkBridgeSurfaces(browser, guard, origin, VIEWPORTS.mobile);
    await checkAxe(browser, guard, origin, VIEWPORTS.desktop);
    await checkAxe(browser, guard, origin, VIEWPORTS.mobile);
    await checkFocusOrder(browser, guard, origin);
    await checkTouchTargets(browser, guard, origin);
    await checkColdAuthenticatedNewTab(browser, guard, origin);

    /* G — the console guard summary (the run-wide truth). */
    const summary = guard.summarize();
    /* The honest-classification layer THIS harness adds (the shared guard
     * stays untouched — its exclusion list predates this route sweep's
     * coverage): `GET /v1/reality/projects/:id/versions/latest` → 404 is
     * the product's OWN designed honest-empty state (apps/web/src/app/api.ts
     * loadLatestRealityVersionLive: "A 404 is an HONEST EMPTY result —
     * never an error") — the project-overview/sitetwin surfaces the W
     * journey never visited render it by design. Classified here, cited. */
    const REALITY_LATEST_404 = /^\/v1\/reality\/projects\/[^/]+\/versions\/latest$/;
    const designedReality404s = summary.blockingFailedRequests.filter(
      (entry) => entry.method === "GET" && entry.status === 404 && REALITY_LATEST_404.test(entry.path),
    );
    const designedConsoleLines = summary.blockingConsoleErrors.filter((entry) => {
      if (entry.locationUrl === null) {
        return false;
      }
      try {
        return REALITY_LATEST_404.test(new URL(entry.locationUrl).pathname);
      } catch {
        return false;
      }
    });
    const trulyBlockingRequests = summary.blockingFailedRequests.filter(
      (entry) => !designedReality404s.includes(entry),
    );
    const trulyBlockingConsole = summary.blockingConsoleErrors.filter(
      (entry) => !designedConsoleLines.includes(entry),
    );
    const consolePass =
      summary.pageErrors.length === 0 &&
      trulyBlockingConsole.length === 0 &&
      trulyBlockingRequests.length === 0;
    if (!consolePass) {
      exitPass = false;
    }
    record({
      id: "G",
      name: "the run-wide console guard (zero page errors; blocking channels enumerated; designed-404 families classified)",
      pass: consolePass,
      lines: [
        `page errors: ${summary.pageErrors.length}`,
        `blocking console errors: ${trulyBlockingConsole.length} (the guard's own excluded expected-by-design: ${summary.excludedConsoleErrors.length}; this harness's classified reality-latest honest-empty 404 lines: ${designedConsoleLines.length})`,
        `blocking failed requests: ${trulyBlockingRequests.length} (the guard's own excluded 404 family: ${summary.excludedExpectedRequests.length}; classified by this harness — GET /v1/reality/projects/:id/versions/latest → 404, the product's documented honest-empty state (api.ts loadLatestRealityVersionLive): ${designedReality404s.length}; other non-blocking: ${summary.otherFailedRequests.length})`,
        ...summary.pageErrors
          .slice(0, 5)
          .map((entry) => `page error: [${entry.label}] ${entry.message}`),
        ...trulyBlockingConsole
          .slice(0, 5)
          .map((entry) => `console error: [${entry.label}] ${entry.text}`),
        ...trulyBlockingRequests
          .slice(0, 5)
          .map((entry) => `failed request: [${entry.label}] ${entry.method} ${entry.path} — ${entry.status}`),
      ],
      findings: [],
    });

    exitPass = exitPass && outcomes.every((outcome) => outcome.pass);
  } finally {
    await browser.close();
    const stop = await serve.stop();
    if (!stop.portsDark) {
      exitPass = false;
      console.error("the serve's ports did not go dark — a process leak");
    } else {
      console.log("the local serve stopped; both scratch ports proven dark");
    }
  }
  if (KEEP_RECORD) {
    const file = writeAcceptanceRecord(origin, chromiumVersion, exitPass);
    console.log(`the acceptance record was written: ${file}`);
  }
  console.log(exitPass ? "POST-006 ACCEPTANCE: PASS" : "POST-006 ACCEPTANCE: FAIL");
  process.exit(exitPass ? 0 : 1);
}

await main();
