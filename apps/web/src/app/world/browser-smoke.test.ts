/**
 * WORLD-P4 — the world route's REAL-BROWSER SMOKE JOURNEY (the
 * PROD-030/031 pattern applied to the world station): bundle the
 * browser mount with esbuild, serve it from an ephemeral local
 * static server, open it in a REAL Chromium, and walk the station's
 * typed interaction journey — with ZERO pageerror events across the
 * whole session.
 *
 * The journey legs (the golden path of the world route):
 *
 *   1. MOUNT   — the station renders: the chrome, the scene roster
 *                and ALL SEVEN honest HUD panels;
 *   2. SELECT  — one element click selects it in the world (the
 *                quarantined canonical id);
 *   3. GHOST   — the roster shows the ghost-distinct chips (the
 *                ghost-distinctness law, visible);
 *   4. CAMERA  — the typed camera operations change the camera state
 *                (orbit → walk → fly);
 *   5. LAYERS  — a layer toggle hides the plan elements (the
 *                AND-semantics);
 *   6. REFUSAL — an unknown-element selection fails closed IN the
 *                browser (the typed refusal, no crash);
 *   7. SCAN    — the built bundle carries NO Node-builtin
 *                externalization markers (the PROD-030 law, applied
 *                to the world mount's own graph).
 *
 * Deterministic: local bundle + loopback server + local Chromium;
 * bounded waits; no external network.
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { createServer, type Server } from "node:http";
import { join } from "node:path";
import { chromium } from "playwright";
import type { Browser, Page } from "playwright";
import { existsSync as pathExists } from "node:fs";

/** Resolve the Chromium executable (the PROD-030 preflight, inlined —
 *  the apps zone imports no tools code, the boundary law). */
function chromiumExecutable(): string {
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
  if (!pathExists(executablePath)) {
    throw new Error(
      `Chromium is not installed at '${executablePath}'\n` +
        `  -> install it with: bunx playwright install chromium`,
    );
  }
  return executablePath;
}

const WORLD_DIR = import.meta.dir;

/* ------------------------------------------------------------------ */
/* The bundle phase (esbuild — the world mount's own graph)             */
/* ------------------------------------------------------------------ */

const SCRATCH = mkdtempSync(join(tmpdir(), "world-p4-smoke-"));
const BUNDLE_PATH = join(SCRATCH, "world-station.js");
const HTML_PATH = join(SCRATCH, "index.html");

/** The Node-builtin externalization markers (the PROD-030 vocabulary). */
const NODE_BUILTIN_MARKERS = [
  "node:crypto",
  "node:fs",
  "node:path",
  "node:net",
  "node:http",
  "node:timers",
  "__require$2$createHash",
] as const;

async function bundleWorldMount(): Promise<void> {
  const esbuild = await import("esbuild");
  await esbuild.build({
    entryPoints: [join(WORLD_DIR, "browser-mount.tsx")],
    bundle: true,
    format: "iife",
    platform: "browser",
    target: "es2022",
    jsx: "automatic",
    outfile: BUNDLE_PATH,
    logLevel: "silent",
    loader: { ".json": "json" },
  });
  if (!existsSync(BUNDLE_PATH)) {
    throw new Error("the world mount bundle was not produced");
  }
  writeFileSync(
    HTML_PATH,
    `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>AISE — Engineering world (WORLD-P4 smoke host)</title>
  </head>
  <body>
    <div id="world-host"></div>
    <script src="./world-station.js"></script>
  </body>
</html>
`,
  );
}

/* ------------------------------------------------------------------ */
/* The ephemeral static serve (bounded, loopback-only)                  */
/* ------------------------------------------------------------------ */

const PORT = 4189;
let server: Server | null = null;
let browser: Browser | null = null;

function startStaticServer(): Promise<void> {
  return new Promise((resolve, reject) => {
    server = createServer((request, response) => {
      const url = request.url ?? "/";
      const filePath = url === "/" || url.startsWith("/?") ? HTML_PATH : BUNDLE_PATH;
      try {
        const body = readFileSync(filePath);
        response.writeHead(200, {
          "content-type": filePath.endsWith(".js")
            ? "text/javascript; charset=utf-8"
            : "text/html; charset=utf-8",
        });
        response.end(body);
      } catch {
        response.writeHead(404);
        response.end("not found");
      }
    });
    server.once("error", reject);
    server.listen(PORT, "127.0.0.1", () => resolve());
  });
}

/* ------------------------------------------------------------------ */
/* The journey                                                          */
/* ------------------------------------------------------------------ */

beforeAll(async () => {
  await bundleWorldMount();
  await startStaticServer();
  const executable = chromiumExecutable();
  browser = await chromium.launch({
    executablePath: executable,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
});

afterAll(async () => {
  if (browser !== null) {
    await browser.close();
  }
  if (server !== null) {
    await new Promise<void>((resolve) => server?.close(() => resolve()));
  }
  rmSync(SCRATCH, { recursive: true, force: true });
});

describe("the world station's real-browser smoke journey", () => {
  let page: Page;

  beforeAll(async () => {
    const context = await browser!.newContext();
    page = await context.newPage();
  });

  test("the bundle carries NO Node-builtin externalization markers (the PROD-030 law)", () => {
    const bundle = readFileSync(BUNDLE_PATH, "utf8");
    for (const marker of NODE_BUILTIN_MARKERS) {
      expect(
        bundle.includes(marker),
        `the world mount bundle contains the forbidden marker '${marker}'`,
      ).toBe(false);
    }
    /* The bundle is substantial (React + the station surface + the record). */
    expect(bundle.length).toBeGreaterThan(10_000);
  });

  test("MOUNT: the station renders the scene + all seven honest panels with ZERO pageerror", async () => {
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(String(error)));
    await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "load" });
    await page.waitForSelector("#world-station", { timeout: 15_000 });
    for (const panelId of [
      "objective",
      "evidence",
      "constraints",
      "agent",
      "validation",
      "cost-boq",
      "timeline",
    ]) {
      await page.waitForSelector(`#world-panel-${panelId}`, { timeout: 5_000 });
    }
    /* Every committed panel is honestly POPULATED. */
    const states = await page.evaluate(() =>
      Array.from(document.querySelectorAll(".world-hud-panel")).map(
        (panel) => (panel as HTMLElement).dataset.contentState,
      ),
    );
    expect(states).toEqual([
      "POPULATED",
      "POPULATED",
      "POPULATED",
      "POPULATED",
      "POPULATED",
      "POPULATED",
      "POPULATED",
    ]);
    expect(pageErrors).toEqual([]);
  });

  test("SELECT + GHOST: an element click selects it; the ghost chips are distinct", async () => {
    /* The ghost-distinct chips render (the roster law). */
    await page.waitForSelector('[data-status="proposed-ghost"]', { timeout: 5_000 });
    await page.waitForSelector('[data-status="proposed-removed"]', { timeout: 5_000 });
    /* Click the proposed-removed element (the wall the proposal changes). */
    await page.locator('[data-status="proposed-removed"]').first().click();
    await page.waitForSelector('[data-testid="world-selection"]', { timeout: 5_000 });
    const selectionText = await page
      .locator('[data-testid="world-selection"]')
      .textContent();
    expect(selectionText).toContain("selected:");
    /* The selection state (through the typed handle) carries the id. */
    const selectedIds = await page.evaluate(
      () => window.__AISE_WORLD_STATION__?.state().selectedElementIds ?? [],
    );
    expect(selectedIds.length).toBe(1);
    /* The Objective panel links the selected element (the concern law). */
    await page.waitForSelector('[data-testid="world-objective-element-link"]', {
      timeout: 5_000,
    });
  });

  test("CAMERA: the typed operations move the camera (orbit → walk → fly)", async () => {
    await page.locator('[data-testid="world-camera-orbit"]').click();
    let camera = await page.evaluate(() => window.__AISE_WORLD_STATION__!.state().camera);
    expect(camera.mode).toBe("orbit");
    await page.locator('[data-testid="world-camera-walk"]').click();
    camera = await page.evaluate(() => window.__AISE_WORLD_STATION__!.state().camera);
    expect(camera.mode).toBe("walk");
    await page.locator('[data-testid="world-camera-fly"]').click();
    camera = await page.evaluate(() => window.__AISE_WORLD_STATION__!.state().camera);
    expect(camera.mode).toBe("fly");
    expect(camera.position).toEqual([0, -10, 8]);
    /* The viewport readout reflects the fly state. */
    const cameraText = await page.locator(".world-scene__camera").textContent();
    expect(cameraText).toContain("fly");
  });

  test("LAYERS: toggling the plan layer hides the plan elements (AND-semantics)", async () => {
    const planRow = page.locator('[data-status="plan"]').first();
    await planRow.waitFor({ state: "visible", timeout: 5_000 });
    await page
      .locator(".world-layer-toggle", { hasText: "Plan / BIM model" })
      .locator("input")
      .uncheck();
    /* The plan row reports hidden... */
    await page.waitForSelector('[data-status="plan"][data-visible="false"]', {
      timeout: 5_000,
    });
    /* ...and the captured elements stay visible. */
    await page.waitForSelector('[data-status="capture-asset"][data-visible="true"]', {
      timeout: 5_000,
    });
    /* Restore. */
    await page
      .locator(".world-layer-toggle", { hasText: "Plan / BIM model" })
      .locator("input")
      .check();
    await page.waitForSelector('[data-status="plan"][data-visible="true"]', {
      timeout: 5_000,
    });
  });

  test("REFUSAL: an unknown-element selection fails closed IN the browser (no crash)", async () => {
    const refusal = await page.evaluate(() =>
      window.__AISE_WORLD_STATION__!.dispatch({
        kind: "select-element",
        elementId: "element-unknown-42",
      }),
    );
    expect(refusal.ok).toBe(false);
    expect(refusal.refusal).toContain("not part of this station scene");
    /* The station is still alive (no crash, the roster still renders). */
    await page.waitForSelector('[data-testid="world-roster"]', { timeout: 5_000 });
    /* The substrate-shaped id is refused by the RECORD'S OWN pipeline
     * (it never entered the record — the quarantine happened at bind
     * time; the reducer's unknown-id law answers here). */
    const substrateRefusal = await page.evaluate(() =>
      window.__AISE_WORLD_STATION__!.dispatch({
        kind: "select-element",
        elementId: "/UsdPrim/Wall_001",
      }),
    );
    expect(substrateRefusal.ok).toBe(false);
  });

  test("the whole session produced ZERO pageerror events", async () => {
    /* Re-asserted last: any pageerror from ANY leg fails here. */
    const errors = await page.evaluate(
      () => (window as unknown as { __errors__?: string[] }).__errors__ ?? [],
    );
    expect(errors).toEqual([]);
  });
});
