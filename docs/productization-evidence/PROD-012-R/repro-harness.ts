/**
 * PROD-012-R — the LOCAL production-build reproduction harness for the two
 * PROD-012 FAILs + one moderate finding (docs/productization-evidence/
 * PROD-012/run-2026-09-20.txt).
 *
 * `bun docs/productization-evidence/PROD-012-R/repro-harness.ts [label]`
 *
 * What this harness is: the local mirror of `tools/deployed-check.ts`'s
 * responsive-mobile / accessibility / responsive-desktop measurement logic,
 * run against a locally served PRODUCTION BUILD (`bun run build` + the
 * repo's established production-like local start: `bun run start` — vite
 * preview over apps/web/dist with the API proxied same-origin). The
 * deployed re-verification against https://aise-tan.vercel.app is the
 * Tech Lead's post-merge step, deliberately NOT this harness's job.
 *
 * Phases (all budgets bounded; every phase cleans up after itself):
 *
 *   0. preflight — apps/web/dist/index.html must exist (run `bun run
 *      build` first); the scratch ports (web 4273, api 8790) must be FREE
 *      (a TCP connect must be refused — a foreign listener is a
 *      deterministic failure, never measured);
 *   1. stack — spawns `bun run start` with a scratch AISE_DATA_DIR,
 *      AISE_AUTH=1 + a throwaway AUTH_SECRET + AISE_AUTH_MODE=demo-open
 *      (the deployed configuration: the gate renders, "Enter demo" mints
 *      the demo session, the signed-in shell renders the user menu), and
 *      waits (bounded) for the web origin + /healthz through the proxy;
 *   2. mobile 390x844 — the responsive-mobile mirror: gate overflow →
 *      Enter demo → signed-in shell overflow (scrollWidth vs innerWidth,
 *      budget +1) → drawer-open overflow, PLUS the element-level
 *      diagnostic walk (which elements exceed the viewport, the header
 *      row's children rects) that pinpoints the overflow source;
 *   3. axe 390x844 — the accessibility mirror on the signed-in Dashboard
 *      (drawer closed, h1 visible, network settled): axe-core violations
 *      by impact, the color-contrast node targets, the .journey-hint
 *      computed color/ancestor-surface pair + its WCAG ratio computed
 *      in-page, and the main-landmark census (how many <main> elements,
 *      whether one nests the other);
 *   4. desktop 1440x900 — the responsive-desktop mirror: gate overflow →
 *      signed-in shell overflow → the header still renders brand + user
 *      menu + api chip + toggle in ONE row (tops equal within 2px) and
 *      the nav rail visible → axe 1440x900;
 *   5. teardown — sign out (the product's own control) per phase, close
 *      the browser, SIGTERM the stack, PROVE both ports went dark, remove
 *      the scratch dir.
 *
 * Output: one line per measurement with the exact numbers, then a
 * summary block. The label argument names the run in the header (e.g.
 * "before" / "after") so run-before.txt / run-after.txt are self-evident.
 */

import { closeSync, existsSync, mkdtempSync, openSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { connect as netConnect } from "node:net";
import { join, resolve } from "node:path";
import { randomBytes } from "node:crypto";
import { chromium } from "playwright";
import type { Browser, Page } from "playwright";
import { AxeBuilder } from "@axe-core/playwright";

const ROOT = resolve(import.meta.dir, "..", "..", "..");
const LABEL = process.argv[2] ?? "run";
const WEB_PORT = 4273;
const API_PORT = 8790;
// The web origin is addressed as localhost (vite preview binds the
// localhost hostname — on hosts where that resolves to ::1 only, the
// 127.0.0.1 literal would refuse; localhost matches vite's own output).
const WEB_HOST = "localhost";
const ORIGIN = `http://${WEB_HOST}:${WEB_PORT}`;
const DIST_INDEX = join(ROOT, "apps", "web", "dist", "index.html");

const BUDGETS = {
  stackBootMs: 60_000,
  gotoMs: 20_000,
  landmarkMs: 20_000,
  settleMs: 500,
  axeRunMs: 60_000,
  portDarkMs: 15_000,
  portPollMs: 200,
} as const;

const VIEWPORTS = {
  mobile: { label: "mobile 390x844", width: 390, height: 844 },
  desktop: { label: "desktop 1440x900", width: 1440, height: 900 },
} as const;

/* ------------------------------------------------------------------ */
/* Small utilities                                                     */
/* ------------------------------------------------------------------ */

function sleep(ms: number): Promise<"slept"> {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve("slept");
    }, ms);
  });
}

/** True when SOMETHING accepts a TCP connection on host:port. */
function portAnswers(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = netConnect({ host, port });
    let settled = false;
    const finish = (result: boolean): void => {
      if (!settled) {
        settled = true;
        socket.destroy();
        resolve(result);
      }
    };
    socket.setTimeout(1_000, () => {
      finish(true);
    });
    socket.once("connect", () => {
      finish(true);
    });
    socket.once("error", () => {
      finish(false);
    });
  });
}

interface OverflowMeasurement {
  readonly scrollWidth: number;
  readonly innerWidth: number;
}

/** The deployed-check overflow measurement, verbatim logic. */
async function measureOverflow(page: Page): Promise<OverflowMeasurement> {
  return page.evaluate(() => {
    const global = globalThis as unknown as {
      readonly document: {
        readonly scrollingElement: { readonly scrollWidth: number } | null;
        readonly documentElement: { readonly scrollWidth: number };
      };
      readonly innerWidth: number;
    };
    const scrolling = global.document.scrollingElement ?? global.document.documentElement;
    return { scrollWidth: scrolling.scrollWidth, innerWidth: global.innerWidth };
  });
}

function overflowOk(measurement: OverflowMeasurement): boolean {
  return measurement.scrollWidth <= measurement.innerWidth + 1;
}

function overflowDetail(measurement: OverflowMeasurement): string {
  return `scrollWidth ${measurement.scrollWidth} vs innerWidth ${measurement.innerWidth} (budget +1)`;
}

/** One WCAG 2.x relative-luminance/contrast computation (pure). */
function wcagRatio(foreground: string, background: string): number {
  const channel = (value: number): number => {
    const srgb = value / 255;
    return srgb <= 0.03928 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
  };
  const parse = (hex: string): [number, number, number] => {
    const clean = hex.replace(/^#/, "");
    return [
      Number.parseInt(clean.slice(0, 2), 16),
      Number.parseInt(clean.slice(2, 4), 16),
      Number.parseInt(clean.slice(4, 6), 16),
    ];
  };
  const luminance = (hex: string): number => {
    const [r, g, b] = parse(hex);
    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
  };
  const l1 = luminance(foreground);
  const l2 = luminance(background);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/** Normalize rgb()/rgba() computed colors to #rrggbb (alpha ignored). */
function computedToHex(computed: string): string {
  const match = computed.match(/rgba?\(([^)]+)\)/);
  if (match === null) {
    return computed;
  }
  const parts = match[1]!.split(",").map((part) => Number.parseFloat(part.trim()));
  const toHex = (value: number): string =>
    Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, "0");
  return `#${toHex(parts[0] ?? 0)}${toHex(parts[1] ?? 0)}${toHex(parts[2] ?? 0)}`;
}

/* ------------------------------------------------------------------ */
/* Phase 0b — the adapter-contract mount-crash workaround (documented)  */
/* ------------------------------------------------------------------ */

/**
 * CURRENT MAIN (deb46cb) BLOCKER, OUTSIDE PROD-012-R's owned surface: the
 * production web bundle crashes at module init in a real browser —
 * `packages/adapter-contract/src/index.ts` re-exports
 * `loadCommittedFixtures` (fixtures-loader.ts), whose MODULE SCOPE runs
 * `join(import.meta.dir, "..")` from `node:path`; vite externalizes
 * `node:path` for the browser (`__vite-browser-external` = `{}`), so the
 * bundle throws `TypeError: (0, ga.join) is not a function` before the app
 * ever mounts (no gate, no shell — `bun run build` succeeds; `bun run
 * verify` never loads the built bundle in a browser, so the adapter wave
 * shipped with it unnoticed). The PROD-012 deployment predates the adapter
 * wave, which is why the deployed site boots.
 *
 * The harness neutralizes the TWO dead module-init calls in the BUILT,
 * gitignored, regenerated-by-every-build output (apps/web/dist/assets/):
 * the bundler already tree-shook `loadCommittedFixtures` itself away —
 * only the dead init statements (`PACKAGE_ROOT` / the `fixtures` join,
 * whose results are used nowhere else in the bundle — verified) remain
 * and crash. The patch touches NO shell markup, NO CSS, NO app code
 * path; the measured surface (header layout + token contrast) is
 * unaffected. If a future merge fixes the upstream defect, the pattern
 * no longer matches and the harness says so (and serves the clean build).
 */
function patchAdapterContractMountCrash(): void {
  const assetsDir = join(ROOT, "apps", "web", "dist", "assets");
  const bundlePath = readdirSync(assetsDir).find((name) => /^index-[\w-]+\.js$/.test(name));
  if (bundlePath === undefined) {
    throw new Error(`no built JS bundle found under ${assetsDir} — run \`bun run build\` first`);
  }
  const fullPath = join(assetsDir, bundlePath);
  const contents = readFileSync(fullPath, "utf8");
  // The two dead module-init statements, minified OR pretty (same
  // identifiers bound together, so nothing legitimate can match):
  //   var X = ..., P = (0, X.join)(import.meta.dir, "..");
  //   (0, X.join)(P, "fixtures");
  const deadInit =
    /\(0,([A-Za-z_$][\w$]*)\.join\)\(import\.meta\.dir\s*,\s*(["'`])\.\.["'`]\)\s*;\s*\(0,\1\.join\)\([A-Za-z_$][\w$]*\s*,\s*(["'`])fixtures["'`]\)\s*;/g;
  // The matched span is the INITIALIZER of the (unused) PACKAGE_ROOT var
  // declaration plus the standalone FIXTURES_ROOT statement — the
  // replacement must stay a valid expression (""), not a statement.
  const patched = contents.replace(
    deadInit,
    '""/* PROD-012-R harness: adapter-contract fixtures-loader dead module-init neutralized — see repro-harness.ts header */;',
  );
  if (patched === contents) {
    console.log(
      "  harness workaround: NOT needed — the adapter-contract fixtures-loader dead module-init pattern is absent (upstream fixed or changed); serving the unpatched build",
    );
    return;
  }
  writeFileSync(fullPath, patched);
  console.log(
    "  harness workaround: PATCHED the built bundle's adapter-contract fixtures-loader dead module-init (node:path externalized by vite crashes the browser bundle at mount on current main — a defect OUTSIDE PROD-012-R's surface, reported in remediation.md; the patch changes no shell/markup/CSS)",
  );
}

/* ------------------------------------------------------------------ */
/* Phase 1 — the local production-like stack                           */
/* ------------------------------------------------------------------ */

interface StackHandle {
  readonly proc: Bun.Subprocess;
  readonly scratchDir: string;
  readonly logPath: string;
  readonly logFd: number;
}

async function startStack(): Promise<StackHandle> {
  const scratchDir = mkdtempSync(join(tmpdir(), "aise-012r-"));
  const logPath = join(scratchDir, "start.log");
  const logFd = openSync(logPath, "a");
  // The stack's env: the parent env MINUS anything the harness's host may
  // leak that the repo's env schema would reject or misinterpret (e.g. a
  // sandbox DATABASE_URL that is not a postgres:// URL — the backend treats
  // DATABASE_URL as an optional Postgres provider, so REMOVING it keeps the
  // clean "disabled (optional)" default instead of a present-but-malformed
  // value). Explicit values below always win.
  const inherited: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined && key !== "DATABASE_URL") {
      inherited[key] = value;
    }
  }
  const proc = Bun.spawn({
    cmd: [process.execPath, "run", "start"],
    cwd: ROOT,
    env: {
      ...inherited,
      AISE_DATA_DIR: join(scratchDir, "data"),
      AISE_AUTH: "1",
      AUTH_SECRET: randomBytes(32).toString("hex"),
      AISE_AUTH_MODE: "demo-open",
      PORT: String(API_PORT),
      AISE_WEB_PORT: String(WEB_PORT),
    },
    stdout: logFd,
    stderr: logFd,
    stdin: "ignore",
  });
  const deadline = Date.now() + BUDGETS.stackBootMs;
  for (;;) {
    if (proc.exitCode !== null) {
      throw new Error(
        `the local stack exited early (code ${proc.exitCode}) — see ${logPath}`,
      );
    }
    try {
      const health = await fetch(`${ORIGIN}/healthz`, {
        signal: AbortSignal.timeout(2_000),
      });
      if (health.status === 200) {
        return { proc, scratchDir, logPath, logFd };
      }
    } catch {
      // not up yet — keep polling within the budget
    }
    if (Date.now() > deadline) {
      proc.kill("SIGTERM");
      throw new Error(`the local stack did not become healthy within ${BUDGETS.stackBootMs} ms — see ${logPath}`);
    }
    await sleep(BUDGETS.portPollMs);
  }
}

async function stopStack(stack: StackHandle): Promise<void> {
  if (stack.proc.exitCode === null) {
    stack.proc.kill("SIGTERM");
    const deadline = Date.now() + BUDGETS.portDarkMs;
    while (stack.proc.exitCode === null && Date.now() < deadline) {
      await sleep(BUDGETS.portPollMs);
    }
    if (stack.proc.exitCode === null) {
      stack.proc.kill("SIGKILL");
    }
  }
  closeSync(stack.logFd);
  // Identity proof (the smoke doctrine): both scratch ports must be dark.
  const deadline = Date.now() + BUDGETS.portDarkMs;
  for (;;) {
    const webUp = (await portAnswers(WEB_HOST, WEB_PORT)) || (await portAnswers("127.0.0.1", WEB_PORT));
    const apiUp = (await portAnswers(WEB_HOST, API_PORT)) || (await portAnswers("127.0.0.1", API_PORT));
    if (!webUp && !apiUp) {
      console.log("teardown: stack stopped, both scratch ports dark, scratch dir removed");
      rmSync(stack.scratchDir, { recursive: true, force: true });
      return;
    }
    if (Date.now() > deadline) {
      console.log(
        `teardown: WARNING — a scratch port still answers (web=${webUp} api=${apiUp}); scratch dir kept for inspection: ${stack.scratchDir}`,
      );
      return;
    }
    await sleep(BUDGETS.portPollMs);
  }
}

/* ------------------------------------------------------------------ */
/* The shared signed-in-shell flow (the deployed checks' mirror)        */
/* ------------------------------------------------------------------ */

async function enterDemo(page: Page): Promise<void> {
  await page.goto(ORIGIN, { timeout: BUDGETS.gotoMs, waitUntil: "domcontentloaded" });
  await page.waitForSelector("h2#gate-title", {
    state: "visible",
    timeout: BUDGETS.landmarkMs,
  });
  await sleep(BUDGETS.settleMs);
}

async function signInDemo(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Enter demo", exact: true }).click({
    timeout: BUDGETS.landmarkMs,
  });
  await page.waitForSelector("header.app-header", {
    state: "visible",
    timeout: BUDGETS.landmarkMs,
  });
  await page.waitForSelector("main#main-content h1", {
    state: "visible",
    timeout: BUDGETS.landmarkMs,
  });
  await sleep(BUDGETS.settleMs);
}

async function signOut(page: Page): Promise<void> {
  try {
    await page.getByRole("button", { name: "Sign out", exact: true }).click({
      timeout: BUDGETS.landmarkMs,
    });
    await page.waitForSelector("h2#gate-title", {
      state: "visible",
      timeout: BUDGETS.landmarkMs,
    });
    console.log("  cleanup: ok (Sign out control; the gate returned)");
  } catch {
    try {
      await page.evaluate(() => {
        const global = globalThis as unknown as {
          readonly fetch: (input: string, init: { method: string }) => Promise<unknown>;
        };
        return global.fetch("/v1/auth/sessions/current", { method: "DELETE" });
      });
      console.log("  cleanup: ok (fallback in-page DELETE)");
    } catch {
      console.log("  cleanup: FAILED to sign out through UI and fallback");
    }
  }
}

/* ------------------------------------------------------------------ */
/* Phase 2 — mobile diagnostics (overflow + element walk)              */
/* ------------------------------------------------------------------ */

async function mobilePhase(browser: Browser): Promise<void> {
  console.log(`==> responsive-mobile diagnostics (${VIEWPORTS.mobile.label})`);
  const context = await browser.newContext({
    viewport: { width: VIEWPORTS.mobile.width, height: VIEWPORTS.mobile.height },
  });
  const page = await context.newPage();
  try {
    await enterDemo(page);
    const gate = await measureOverflow(page);
    console.log(`  gate overflow: ${overflowDetail(gate)} — ${overflowOk(gate) ? "PASS" : "FAIL"}`);

    await signInDemo(page);
    const shell = await measureOverflow(page);
    console.log(`  signed-in shell overflow: ${overflowDetail(shell)} — ${overflowOk(shell) ? "PASS" : "FAIL"}`);

    // The element-level diagnostic walk: every element whose bounding rect
    // exceeds the viewport (proof of WHERE the overflow comes from).
    const offenders = await page.evaluate(() => {
      const global = globalThis as unknown as { readonly innerWidth: number };
      const out: string[] = [];
      for (const el of Array.from(document.querySelectorAll("*"))) {
        const rect = el.getBoundingClientRect();
        if (rect.width > 0 && rect.right > global.innerWidth + 1) {
          const id = el.id.length > 0 ? `#${el.id}` : "";
          const cls = typeof el.className === "string" && el.className.length > 0 ? `.${el.className.trim().split(/\s+/).join(".")}` : "";
          out.push(
            `<${el.tagName.toLowerCase()}${id}${cls}> left=${rect.left.toFixed(1)} right=${rect.right.toFixed(1)} width=${rect.width.toFixed(1)}`,
          );
        }
        if (out.length >= 15) {
          break;
        }
      }
      return out;
    });
    console.log(`  elements exceeding the ${VIEWPORTS.mobile.width}px viewport (${offenders.length} shown):`);
    for (const line of offenders) {
      console.log(`    ${line}`);
    }

    // The header row census: each child's rect + the row's own overflow.
    const headerRows = await page.evaluate(() => {
      const inner = document.querySelector(".app-header-inner");
      if (inner === null) {
        return null;
      }
      const children = Array.from(inner.children).map((child) => {
        const rect = child.getBoundingClientRect();
        const id = child.id.length > 0 ? `#${child.id}` : "";
        const cls = typeof child.className === "string" && child.className.trim().length > 0 ? `.${child.className.trim().split(/\s+/).join(".")}` : "";
        return {
          label: `<${child.tagName.toLowerCase()}${id}${cls}>`,
          left: rect.left,
          right: rect.right,
          width: rect.width,
          top: rect.top,
        };
      });
      return {
        rowScrollWidth: inner.scrollWidth,
        rowClientWidth: inner.clientWidth,
        children,
      };
    });
    if (headerRows === null) {
      console.log("  header census: .app-header-inner NOT FOUND");
    } else {
      console.log(
        `  .app-header-inner: scrollWidth ${headerRows.rowScrollWidth} vs clientWidth ${headerRows.rowClientWidth}`,
      );
      for (const child of headerRows.children) {
        console.log(
          `    ${child.label} left=${child.left.toFixed(1)} right=${child.right.toFixed(1)} width=${child.width.toFixed(1)} top=${child.top.toFixed(1)}`,
        );
      }
    }

    // The drawer-open measurement (the deployed check's third assertion).
    await page.locator("button.nav-toggle").first().click({ timeout: BUDGETS.landmarkMs });
    await page.waitForSelector('nav#primary-nav[data-open="true"]', {
      state: "visible",
      timeout: BUDGETS.landmarkMs,
    });
    await sleep(BUDGETS.settleMs);
    const drawer = await measureOverflow(page);
    console.log(`  drawer-open overflow: ${overflowDetail(drawer)} — ${overflowOk(drawer) ? "PASS" : "FAIL"}`);

    // Close the drawer again (the accessibility scan state: drawer closed).
    await page.locator("button.nav-toggle").first().click({ timeout: BUDGETS.landmarkMs });
    await page.waitForSelector('nav#primary-nav[data-open="false"]', {
      state: "attached",
      timeout: BUDGETS.landmarkMs,
    });
    await sleep(BUDGETS.settleMs);

    await axePhase(page, VIEWPORTS.mobile.label);
    await signOut(page);
  } finally {
    await context.close();
  }
}

/* ------------------------------------------------------------------ */
/* Phase 3 — axe-core + landmarks on the signed-in Dashboard           */
/* ------------------------------------------------------------------ */

async function axePhase(page: Page, viewportLabel: string): Promise<void> {
  try {
    await page.waitForLoadState("networkidle", { timeout: 15_000 });
  } catch {
    // non-fatal (the deployed check has the same carve-out)
  }
  const results = await Promise.race([
    new AxeBuilder({ page }).analyze(),
    sleep(BUDGETS.axeRunMs).then(() => {
      throw new Error(`the axe-core analysis did not complete within ${BUDGETS.axeRunMs} ms`);
    }),
  ]);
  const byImpact: Record<string, number> = {};
  for (const violation of results.violations) {
    const impact = violation.impact ?? "n/a";
    byImpact[impact] = (byImpact[impact] ?? 0) + 1;
  }
  const serious = byImpact["serious"] ?? 0;
  const critical = byImpact["critical"] ?? 0;
  console.log(
    `  axe (${viewportLabel}): critical=${critical} serious=${serious} ` +
      `moderate=${byImpact["moderate"] ?? 0} minor=${byImpact["minor"] ?? 0} — ${critical === 0 && serious === 0 ? "PASS" : "FAIL"}`,
  );
  for (const violation of results.violations) {
    console.log(
      `    [${violation.impact ?? "n/a"}] ${violation.id} — ${violation.help} (${violation.nodes.length} node(s))`,
    );
    for (const node of violation.nodes.slice(0, 4)) {
      console.log(`      target=${JSON.stringify(node.target)}`);
    }
  }

  // The .journey-hint contrast pair, measured ON the rendered page.
  const hintPair = await page.evaluate(() => {
    const hint = document.querySelector(".journey-hint");
    if (hint === null) {
      return null;
    }
    const computedColor = getComputedStyle(hint).color;
    let surface = "";
    let ancestor = hint.parentElement;
    let surfaceLabel = "(transparent everywhere)";
    while (ancestor !== null) {
      const background = getComputedStyle(ancestor).backgroundColor;
      if (background !== "rgba(0, 0, 0, 0)" && background !== "transparent") {
        surface = background;
        surfaceLabel = `${ancestor.tagName.toLowerCase()}.${String(ancestor.className).split(/\s+/).join(".")}`;
        break;
      }
      ancestor = ancestor.parentElement;
    }
    return { count: document.querySelectorAll(".journey-hint").length, computedColor, surface, surfaceLabel };
  });
  if (hintPair === null) {
    console.log("  journey-hint pair: NO .journey-hint rendered on this surface");
  } else {
    const ratio = wcagRatio(computedToHex(hintPair.computedColor), computedToHex(hintPair.surface));
    console.log(
      `  journey-hint pair (${hintPair.count} nodes): ${computedToHex(hintPair.computedColor)} on ${computedToHex(hintPair.surface)} (${hintPair.surfaceLabel}) = ${ratio.toFixed(2)}:1 — ${ratio >= 4.5 ? "PASS" : "FAIL"} (AA 4.5:1)`,
    );
  }

  // The main-landmark census (the moderate finding).
  const landmarks = await page.evaluate(() => {
    const mains = Array.from(document.querySelectorAll("main"));
    return {
      count: mains.length,
      ids: mains.map((main) => main.id || "(no id)"),
      nested:
        mains.length === 2
          ? mains[0]!.contains(mains[1]!) || mains[1]!.contains(mains[0]!)
          : false,
    };
  });
  console.log(
    `  main landmarks: ${landmarks.count} (${landmarks.ids.join(", ")})` +
      `${landmarks.nested ? " — NESTED (duplicate top-level landmark)" : ""}`,
  );
}

/* ------------------------------------------------------------------ */
/* Phase 4 — desktop (overflow + one-row header + axe)                 */
/* ------------------------------------------------------------------ */

async function desktopPhase(browser: Browser): Promise<void> {
  console.log(`==> responsive-desktop mirror (${VIEWPORTS.desktop.label})`);
  const context = await browser.newContext({
    viewport: { width: VIEWPORTS.desktop.width, height: VIEWPORTS.desktop.height },
  });
  const page = await context.newPage();
  try {
    await enterDemo(page);
    const gate = await measureOverflow(page);
    console.log(`  gate overflow: ${overflowDetail(gate)} — ${overflowOk(gate) ? "PASS" : "FAIL"}`);

    await signInDemo(page);
    const shell = await measureOverflow(page);
    console.log(`  signed-in shell overflow: ${overflowDetail(shell)} — ${overflowOk(shell) ? "PASS" : "FAIL"}`);

    const navVisible = await page.locator("nav#primary-nav").first().isVisible();
    console.log(`  nav rail visible at desktop: ${navVisible} — ${navVisible ? "PASS" : "FAIL"}`);

    // The header one-row regression assertion at desktop: brand + user
    // menu + api chip must sit on the SAME row. Same-row items under
    // `align-items: center` share a VERTICAL CENTER (their tops differ
    // with item height), so the center is the compared invariant. The
    // drawer toggle is display:none BY DESIGN at >=880px
    // (`.app-header-inner .nav-toggle`); it is reported for honesty and
    // only joins the one-row set if it is somehow visible (which would
    // itself be a regression to investigate). Full rects are printed so
    // the before/after evidence can diff the desktop geometry directly.
    const row = await page.evaluate(() => {
      const required = [".brand", ".user-menu", ".api-chip"];
      const items: {
        label: string;
        left: number;
        right: number;
        width: number;
        top: number;
        height: number;
        center: number;
        visible: boolean;
      }[] = [];
      for (const selector of [...required, ".nav-toggle"]) {
        const el = document.querySelector(selector);
        if (el === null) {
          items.push({
            label: selector, left: Number.NaN, right: Number.NaN, width: Number.NaN,
            top: Number.NaN, height: Number.NaN, center: Number.NaN, visible: false,
          });
          continue;
        }
        const style = getComputedStyle(el);
        const rendered = style.display !== "none";
        const rect = el.getBoundingClientRect();
        items.push({
          label: selector,
          left: rect.left,
          right: rect.right,
          width: rect.width,
          top: rect.top,
          height: rect.height,
          center: rect.top + rect.height / 2,
          visible: rendered && rect.width > 0 && rect.height > 0,
        });
      }
      const rowItems = items.filter((entry) => entry.visible);
      const spread =
        rowItems.length === 0
          ? Number.POSITIVE_INFINITY
          : Math.max(...rowItems.map((entry) => entry.center)) -
            Math.min(...rowItems.map((entry) => entry.center));
      const requiredVisible = items
        .filter((entry) => required.includes(entry.label))
        .every((entry) => entry.visible);
      const inner = document.querySelector(".app-header-inner");
      const rowHeight = inner === null ? Number.NaN : inner.getBoundingClientRect().height;
      const oneRow = requiredVisible && spread <= 2;
      return { items, spread, rowHeight, oneRow };
    });
    const itemsDetail = row.items
      .map((entry) =>
        entry.visible
          ? `${entry.label}(l=${entry.left.toFixed(1)},r=${entry.right.toFixed(1)},w=${entry.width.toFixed(1)},t=${entry.top.toFixed(1)},h=${entry.height.toFixed(1)})`
          : `${entry.label}=hidden`,
      )
      .join(" ");
    console.log(`  header geometry @desktop: ${itemsDetail}`);
    console.log(
      `  header one-row @desktop (center spread ${row.spread.toFixed(2)}px, row height ${row.rowHeight.toFixed(1)}px): ${row.oneRow ? "PASS" : "FAIL"}`,
    );

    await axePhase(page, VIEWPORTS.desktop.label);
    await signOut(page);
  } finally {
    await context.close();
  }
}

/* ------------------------------------------------------------------ */
/* Main                                                                */
/* ------------------------------------------------------------------ */

void (async () => {
  console.log(`PROD-012-R local production-build reproduction harness — ${LABEL}`);
  console.log(`target: ${ORIGIN} (vite preview over apps/web/dist, API proxied from :${API_PORT})`);

  if (!existsSync(DIST_INDEX)) {
    console.error(`REPRO: FAIL — ${DIST_INDEX} missing — run \`bun run build\` first`);
    process.exit(1);
  }
  for (const [name, port] of [
    ["web", WEB_PORT],
    ["api", API_PORT],
  ] as const) {
    if (await portAnswers("localhost", port) || (await portAnswers("127.0.0.1", port))) {
      console.error(`REPRO: FAIL — the scratch ${name} port ${port} is already occupied (a foreign server is never measured)`);
      process.exit(1);
    }
  }

  console.log("==> preflight: the built bundle (documented workaround pass)");
  patchAdapterContractMountCrash();

  const stack = await startStack();
  console.log(`stack: healthy on ${ORIGIN} (log: ${stack.logPath})`);

  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  try {
    await mobilePhase(browser);
    await sleep(500);
    await desktopPhase(browser);
  } finally {
    await browser.close();
    console.log("cleanup: browser closed");
    await stopStack(stack);
  }
  console.log(`REPRO: DONE (${LABEL})`);
  process.exit(0);
})().catch((error: unknown) => {
  console.error(`REPRO: FAIL — ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
