/**
 * QA-002 — the BROWSER-LEVEL proof (real Chromium against the real app).
 *
 * The Lead's production sweep found the defects LIVE; this suite proves the
 * fixes against the REAL application mounted in a real browser — the same
 * shape as tools/web-bundle/gate.ts's mount check, kept inside the apps
 * zone (bare npm specifiers only; no tools/ imports):
 *
 *  - the REAL app (apps/web/src/main.tsx → App) is bundled ONCE with
 *    esbuild (no vite build needed — this is a mount check, not a bundle
 *    gate) and served from an ephemeral loopback server;
 *  - the server emulates the PRODUCTION-LIKE deployment: `/healthz` and
 *    `/readyz` answer OK (a LIVE deployment), `/v1/auth/whoami` 404s (no
 *    auth layer — the pre-auth app), and the task-flow adapter route is
 *    switchable between the Lead's observed live state (HTTP 404 — "this
 *    deployment answers the API but does not serve the task-flow adapter
 *    contract objects") and a served state;
 *  - D3/D8 exit-gate proofs (the Capture surface, live 404):
 *      (a) the degraded banner ("cannot run on live records") occurs
 *          EXACTLY ONCE in the DOM (was 3×),
 *      (b) the task-flow network request fires EXACTLY ONCE per surface
 *          load (was one per consumer),
 *      (c) the committed demo task journey renders BELOW the single banner
 *          with the demo badge (mission gaps, handoff panel, demo badge),
 *      (d) the `aise://task` cross-device handoff link is REACHABLE (the
 *          X-journey bridge returns on live deployments);
 *  - the served path stays behaviorally unchanged: no banner, live-API
 *          badge, the flow content renders;
 *  - D2 exit-gate proof: the agent panel's offered clarification choices
 *          render and CLICKING one submits it as the next user turn
 *          (stubbed port — the real engine round-trip stays the Lead's
 *          post-merge deployed check).
 *
 * Deterministic: loopback server + local Chromium + committed fixtures;
 * bounded waits everywhere; browser checks are NEVER silently skipped
 * (a missing Chromium fails the suite with the actionable install command).
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { build } from "esbuild";
import { chromium } from "playwright";
import type { Browser } from "playwright";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { demoTaskFlowBundle } from "./task-dataset";

const ROOT = resolve(import.meta.dir, "..", "..", "..", "..");
const WEB_SRC = join(ROOT, "apps", "web", "src");

/** Whether the stub deployment serves the task-flow adapter objects. */
type TaskFlowMode = "not-served" | "served";

/** The observed facts one page load yields (all assertion evidence). */
interface PageFacts {
  readonly bannerCount: number;
  readonly bannerPresent: boolean;
  readonly bannerText: string;
  readonly journeyBelowBanner: boolean;
  readonly demoBadgeCount: number;
  readonly apiBadgeCount: number;
  readonly missionGapsPresent: boolean;
  readonly handoffPreparePresent: boolean;
  readonly handoffFallbackNotePresent: boolean;
}

const APP_HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>QA-002 proof — the real app</title></head><body><main id="app"></main><script type="module" src="/main.js"></script></body></html>`;
const AGENT_HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>QA-002 proof — the agent panel mount</title></head><body><main id="app"></main><script type="module" src="/solution/agent/qa002-agent-mount.js"></script></body></html>`;

let browser: Browser | null = null;
let server: ReturnType<typeof Bun.serve> | null = null;
let bundleDir: string | null = null;
let taskFlowMode: TaskFlowMode = "not-served";
let taskFlowRequestCount = 0;

const json = (value: unknown): Response =>
  new Response(JSON.stringify(value), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

/** Serve one built chunk from the bundle dir (loopback only, traversal-guarded). */
function serveBundleChunk(path: string): Response {
  if (bundleDir === null) {
    return new Response("no bundle dir", { status: 404 });
  }
  const parts = path.split("/").filter((part) => part.length > 0 && part !== "." && part !== "..");
  if (parts.length === 0) {
    return new Response("not found", { status: 404 });
  }
  const filePath = join(bundleDir, ...parts);
  if (!existsSync(filePath)) {
    return new Response("not found", { status: 404 });
  }
  return new Response(readFileSync(filePath), {
    headers: { "content-type": "text/javascript" },
  });
}

beforeAll(async () => {
  // Preflight the Chromium binary (browser checks are never silently
  // skipped — mirroring the repo's gate discipline).
  let executablePath: string;
  try {
    executablePath = chromium.executablePath();
  } catch (error) {
    throw new Error(
      `Chromium is not installed for playwright: ${error instanceof Error ? error.message : String(error)}\n` +
        `  -> install it with: bunx playwright install chromium`,
      { cause: error },
    );
  }
  if (!existsSync(executablePath)) {
    throw new Error(
      `Chromium is not installed at '${executablePath}'\n` +
        `  -> install it with: bunx playwright install chromium`,
    );
  }

  // Bundle the REAL app + the QA-002 agent mount once (esbuild, code-
  // splitting ON so the app's LAZY legacy local-engine mount — whose graph
  // reaches node:crypto exactly as in the production vite build's separate
  // chunk — stays a separate chunk the browser loads only on demand; the
  // app's selection ladder catches its load failure honestly, and these
  // proofs never visit the Solution surface anyway. The css import is
  // emptied: these proofs assert DOM structure, not styling).
  bundleDir = mkdtempSync(join(tmpdir(), "qa002-bundles-"));
  await build({
    entryPoints: [
      join(WEB_SRC, "main.tsx"),
      join(WEB_SRC, "solution", "agent", "qa002-agent-mount.tsx"),
    ],
    bundle: true,
    format: "esm",
    splitting: true,
    platform: "browser",
    target: "es2022",
    jsx: "automatic",
    outdir: bundleDir,
    outExtension: { ".js": ".js" },
    loader: { ".css": "empty" },
    external: ["node:*"],
    write: true,
    logLevel: "silent",
  });

  // The production-like loopback deployment: live API, no auth layer, and
  // the task-flow adapter route switchable between 404 and served. The
  // built chunks are served statically from the bundle dir (loopback only,
  // traversal-guarded).
  server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: (request): Response => {
      const path = new URL(request.url).pathname;
      if (path === "/") {
        return new Response(APP_HTML, { headers: { "content-type": "text/html" } });
      }
      if (path === "/agent") {
        return new Response(AGENT_HTML, { headers: { "content-type": "text/html" } });
      }
      if (path === "/healthz") {
        return json({ ok: true });
      }
      if (path === "/readyz") {
        return json({ ok: true });
      }
      if (path === "/v1/auth/whoami") {
        return new Response("no auth layer on this deployment", { status: 404 });
      }
      if (path.startsWith("/v1/adapter/projects/") && path.endsWith("/task-flow")) {
        taskFlowRequestCount += 1;
        if (taskFlowMode === "served") {
          return json({ ok: true, flow: demoTaskFlowBundle() });
        }
        return new Response(
          "task-flow objects are not served on this deployment",
          { status: 404 },
        );
      }
      if (path.endsWith(".js")) {
        return serveBundleChunk(path);
      }
      return new Response("not found", { status: 404 });
    },
  });

  browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
}, 240_000);

afterAll(() => {
  if (browser !== null) {
    void browser.close();
  }
  if (server !== null) {
    server.stop(true);
  }
  if (bundleDir !== null) {
    rmSync(bundleDir, { recursive: true, force: true });
  }
});

/** Poll a test-side predicate until true (bounded — server-side counts). */
async function waitFor(predicate: () => boolean, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() > deadline) {
      throw new Error(`waitFor: predicate not satisfied within ${String(timeoutMs)}ms`);
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

/** Collect the QA-002 page facts from a loaded surface page. */
async function collectPageFacts(page: import("playwright").Page): Promise<PageFacts> {
  return page.evaluate((): PageFacts => {
    const text = document.body.textContent ?? "";
    const banner = document.querySelector(".state-unavailable");
    const mission = document.querySelector('[data-mission-gaps="true"]');
    let journeyBelowBanner = false;
    if (banner !== null && mission !== null) {
      // Node.DOCUMENT_POSITION_FOLLOWING === 4 — the mission renders AFTER
      // the banner in document order (the promised "below").
      journeyBelowBanner = (banner.compareDocumentPosition(mission) & 4) !== 0;
    }
    return {
      bannerCount: text.split("cannot run on live records").length - 1,
      bannerPresent: banner !== null,
      bannerText: banner?.textContent ?? "",
      journeyBelowBanner,
      demoBadgeCount: document.querySelectorAll(".data-badge-demo").length,
      apiBadgeCount: document.querySelectorAll(".data-badge-api").length,
      missionGapsPresent: mission !== null,
      handoffPreparePresent: document.querySelector('[data-handoff-prepare="idle"]') !== null,
      handoffFallbackNotePresent:
        document.querySelector('[data-handoff-demo-fallback="true"]') !== null,
    };
  });
}

describe("QA-002 browser proof — the Capture surface on a live deployment that does not serve the task-flow objects", () => {
  test(
    "D3+D8: ONE banner, ONE task-flow fetch, the demo journey BELOW the banner (demo badge), the aise://task handoff reachable",
    async () => {
      expect(browser).not.toBeNull();
      expect(server).not.toBeNull();
      taskFlowMode = "not-served";
      taskFlowRequestCount = 0;
      const context = await browser!.newContext({ viewport: { width: 1280, height: 900 } });
      const page = await context.newPage();
      const pageErrors: string[] = [];
      page.on("pageerror", (error: Error) => {
        pageErrors.push(error.message);
      });
      await page.goto(`http://127.0.0.1:${server!.port}/#/projects/proj-7f3a2b/capture`, {
        waitUntil: "load",
        timeout: 30_000,
      });
      // The surface mounts and the shared resource settles: the mission
      // gaps render (below the banner when the fallback is active).
      await page.waitForSelector('[data-mission-gaps="true"]', { timeout: 30_000 });

      const facts = await collectPageFacts(page);
      // (a) The degraded banner occurs EXACTLY ONCE in the DOM (was 3×).
      expect(facts.bannerCount).toBe(1);
      expect(facts.bannerPresent).toBe(true);
      expect(facts.bannerText).toContain("Unavailable in this deployment");
      expect(facts.bannerText).toContain(
        "this deployment answers the API but does not serve the task-flow adapter contract objects",
      );
      expect(facts.bannerText).toContain(
        "Impact: the task-first journey cannot run on live records here",
      );
      expect(facts.bannerText).toContain("never presented as live authority");
      // (b) The task-flow endpoint was requested EXACTLY ONCE for the whole
      // surface load (was one per consumer).
      expect(taskFlowRequestCount).toBe(1);
      // (c) The committed demo task journey renders BELOW the single banner,
      // badged demo (never presented as live authority).
      expect(facts.missionGapsPresent).toBe(true);
      expect(facts.journeyBelowBanner).toBe(true);
      expect(facts.demoBadgeCount).toBeGreaterThan(0);
      expect(facts.handoffFallbackNotePresent).toBe(true);
      // (d) The X-journey bridge: the handoff panel is reachable and the
      // prepare affordance emits the canonical aise://task deep link.
      expect(facts.handoffPreparePresent).toBe(true);
      await page.click('[data-handoff-prepare="idle"]');
      await page.waitForSelector('[data-handoff-link="true"] a[href^="aise://task"]', {
        timeout: 10_000,
      });
      const link = await page.getAttribute('[data-handoff-link="true"] a', "href");
      expect(link).not.toBeNull();
      expect(link!.startsWith("aise://task?v=1&handoff=handoff-task-capture-gap-")).toBe(true);
      // Zero page errors across the whole session (the mount-check law).
      expect(pageErrors).toEqual([]);
      await context.close();
    },
    90_000,
  );

  test(
    "D3: Project Overview also renders ONE banner + ONE task-flow fetch (was 2×/2×), composed journey below",
    async () => {
      expect(browser).not.toBeNull();
      expect(server).not.toBeNull();
      taskFlowMode = "not-served";
      taskFlowRequestCount = 0;
      const context = await browser!.newContext({ viewport: { width: 1280, height: 900 } });
      const page = await context.newPage();
      await page.goto(`http://127.0.0.1:${server!.port}/#/projects/proj-7f3a2b`, {
        waitUntil: "load",
        timeout: 30_000,
      });
      // The composed journey (the parity composition) renders from the
      // shared fallback resource.
      await page.waitForSelector('[data-composed-journey="true"]', { timeout: 30_000 });
      const text = (await page.evaluate(() => document.body.textContent)) ?? "";
      expect(text.split("cannot run on live records").length - 1).toBe(1);
      expect(taskFlowRequestCount).toBe(1);
      // The banner precedes the composed journey (the promised "below").
      const order = await page.evaluate(() => {
        const banner = document.querySelector(".state-unavailable");
        const journey = document.querySelector('[data-composed-journey="true"]');
        if (banner === null || journey === null) {
          return false;
        }
        return (banner.compareDocumentPosition(journey) & 4) !== 0;
      });
      expect(order).toBe(true);
      await context.close();
    },
    90_000,
  );

  test(
    "D3 (no behavioral change when served): NO banner, live-API badge, the flow content renders",
    async () => {
      expect(browser).not.toBeNull();
      expect(server).not.toBeNull();
      taskFlowMode = "served";
      taskFlowRequestCount = 0;
      const context = await browser!.newContext({ viewport: { width: 1280, height: 900 } });
      const page = await context.newPage();
      await page.goto(`http://127.0.0.1:${server!.port}/#/projects/proj-7f3a2b/capture`, {
        waitUntil: "load",
        timeout: 30_000,
      });
      await page.waitForSelector('[data-mission-gaps="true"]', { timeout: 30_000 });
      const facts = await collectPageFacts(page);
      // Served: live authority only — no degraded banner, no demo fallback.
      expect(facts.bannerCount).toBe(0);
      expect(facts.bannerPresent).toBe(false);
      expect(facts.handoffFallbackNotePresent).toBe(false);
      expect(facts.missionGapsPresent).toBe(true);
      expect(facts.apiBadgeCount).toBeGreaterThan(0);
      expect(facts.demoBadgeCount).toBe(0);
      // Still exactly ONE task-flow request for the whole surface load.
      expect(taskFlowRequestCount).toBe(1);
      await context.close();
    },
    90_000,
  );
  test(
    "D8 honesty rail: Check-again retries the LIVE endpoint — a later 200 replaces the demo fallback entirely",
    async () => {
      expect(browser).not.toBeNull();
      expect(server).not.toBeNull();
      taskFlowMode = "not-served";
      taskFlowRequestCount = 0;
      const context = await browser!.newContext({ viewport: { width: 1280, height: 900 } });
      const page = await context.newPage();
      await page.goto(`http://127.0.0.1:${server!.port}/#/projects/proj-7f3a2b/capture`, {
        waitUntil: "load",
        timeout: 30_000,
      });
      await page.waitForSelector('[data-mission-gaps="true"]', { timeout: 30_000 });
      expect(taskFlowRequestCount).toBe(1);
      // "Check again" while the endpoint still 404s: the retry fired one
      // MORE live request; the banner stays (the honest unavailable truth)
      // and the demo fallback keeps rendering below — never a silent switch.
      await page.click(".state-unavailable .state-action button");
      await waitFor(() => taskFlowRequestCount === 2, 10_000);
      await page.waitForFunction(() => {
        const text = document.body.textContent ?? "";
        return text.split("cannot run on live records").length - 1 === 1;
      }, undefined, { timeout: 10_000 });
      // The deployment starts serving the task-flow objects: "Check again"
      // now lands the LIVE journey — the banner and the demo fallback are
      // replaced ENTIRELY by the live authority. Wait for the SETTLED live
      // state (banner gone AND mission content back AND no fallback markers
      // AND no demo badge — one composite predicate, no intermediate
      // loading-phase race).
      taskFlowMode = "served";
      await page.click(".state-unavailable .state-action button");
      await page.waitForFunction(
        () => {
          return (
            document.querySelector(".state-unavailable") === null &&
            document.querySelector('[data-mission-gaps="true"]') !== null &&
            document.querySelector('[data-handoff-demo-fallback="true"]') === null &&
            document.querySelector(".data-badge-demo") === null
          );
        },
        undefined,
        { timeout: 10_000 },
      );
      const facts = await collectPageFacts(page);
      expect(facts.bannerCount).toBe(0);
      expect(facts.bannerPresent).toBe(false);
      expect(facts.handoffFallbackNotePresent).toBe(false);
      expect(facts.apiBadgeCount).toBeGreaterThan(0);
      expect(facts.demoBadgeCount).toBe(0);
      expect(facts.missionGapsPresent).toBe(true);
      expect(taskFlowRequestCount).toBe(3);
      await context.close();
    },
    90_000,
  );
});

describe("QA-002 browser proof — D2: the agent panel's offered choices submit as user turns", () => {
  test(
    "clicking an offered choice submits it through the same path as typing (stubbed port)",
    async () => {
      expect(browser).not.toBeNull();
      expect(server).not.toBeNull();
      const context = await browser!.newContext({ viewport: { width: 1280, height: 900 } });
      const page = await context.newPage();
      const pageErrors: string[] = [];
      page.on("pageerror", (error: Error) => {
        pageErrors.push(error.message);
      });
      await page.goto(`http://127.0.0.1:${server!.port}/agent`, {
        waitUntil: "load",
        timeout: 30_000,
      });
      // Both questions' offered choices render as pickable buttons.
      await page.waitForSelector('[data-clarification-choices="target location"]', {
        timeout: 30_000,
      });
      const choiceCount = await page.locator("button.agent-choice").count();
      expect(choiceCount).toBe(6); // 3 location labels + 3 material choices
      // Clicking a choice submits it as the next user turn.
      await page.click('[data-clarification-choice="Damaged ground-floor wall faces"]');
      await page.waitForSelector('[data-submitted-turns] li', { timeout: 10_000 });
      // A second choice (the material vocabulary) submits through the same path.
      await page.click('[data-clarification-choice="cement-plaster"]');
      await page.waitForFunction(() => {
        return document.querySelectorAll("[data-submitted-turns] li").length >= 2;
      }, undefined, { timeout: 10_000 });
      const turns = await page.evaluate(() =>
        Array.from(document.querySelectorAll("[data-submitted-turns] li")).map(
          (entry) => entry.textContent ?? "",
        ),
      );
      expect(turns).toEqual(["Damaged ground-floor wall faces", "cement-plaster"]);
      // The typing path is unchanged: fill + Send submits the typed text.
      await page.fill("#agent-utterance", "lime-plaster");
      await page.click('form[aria-label="Message the assistant"] button[type="submit"]');
      await page.waitForFunction(() => {
        return document.querySelectorAll("[data-submitted-turns] li").length >= 3;
      }, undefined, { timeout: 10_000 });
      const turnsAfterTyping = await page.evaluate(() =>
        Array.from(document.querySelectorAll("[data-submitted-turns] li")).map(
          (entry) => entry.textContent ?? "",
        ),
      );
      expect(turnsAfterTyping).toEqual([
        "Damaged ground-floor wall faces",
        "cement-plaster",
        "lime-plaster",
      ]);
      expect(pageErrors).toEqual([]);
      await context.close();
    },
    90_000,
  );
});
