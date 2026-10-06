/**
 * WORLD-P5 Mount 1 — the REAL-GPU-VIEWPORT SMOKE JOURNEY: bundle the
 * GPU browser mount (React station surface + the REAL Babylon
 * viewport) with esbuild, serve it over loopback, open it in a REAL
 * Chromium, and walk the convergence journey.
 *
 * The journey legs (the mount's golden path):
 *
 *   1. SCAN     — the bundle carries NO Node-builtin markers (the
 *                 PROD-030 law applied to the REAL-substrate graph —
 *                 Babylon included) and is substantial;
 *   2. MOUNT    — the station renders (the seven honest panels, the
 *                 roster) AND the real viewport comes up: the canvas
 *                 hosts a live WebGL engine, the renderer string is
 *                 recorded (honest hardware declaration), the mesh
 *                 census matches the record's declared boxes;
 *   3. CAMERA   — the typed camera operations drive the REAL camera
 *                 (the reducer → adapter round-trip, byte-equal);
 *   4. LAYERS   — a typed layer toggle hides the capture meshes (the
 *                 AND-semantics on the real scene graph) while the
 *                 roster reflects the same typed state;
 *   5. PICK     — a REAL ray pick at the screen center hits the GHOST
 *                 (proposed) element — the ghost-removed wall is
 *                 skipped by the real picking (the resolvability law
 *                 at the runtime level), the canonical id comes back;
 *   6. REFUSAL  — an unknown-element selection fails closed IN the
 *                 browser (the typed refusal, no crash), a sky pick
 *                 answers null (never a guess);
 *   7. CLEAN    — ZERO pageerror events across the whole session.
 *
 * Environmental honesty: this sandbox has NO GPU DEVICE (/dev/dri
 * absent — the P0-A recorded blocker); the Chromium headless shell
 * renders WebGL through SwiftShader SOFTWARE GL. The renderer string
 * recorded by this journey names the actual renderer — the evidence
 * transcript cites it and labels every derived number SOFTWARE-
 * RENDERED (the real-GPU legs of the measurement protocol stay
 * declared BLOCKED in this sandbox).
 *
 * Deterministic: local bundle + loopback server + local Chromium;
 * bounded waits; no external network.
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { existsSync as pathExists } from "node:fs";
import { tmpdir } from "node:os";
import { createServer, type Server } from "node:http";
import { join } from "node:path";
import { chromium } from "playwright";
import type { Browser, Page } from "playwright";
import recordJson from "./station-record.json";

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
const record = recordJson as unknown as {
  stationId: string;
  elements: { elementId: string }[];
  viewport: { boxes: { assetId: string }[] };
};

/* The committed ghost element id (stable committed data — the pick
 * must return the CANONICAL element id, which is the box's asset id
 * minus the viewport prefix). */
const GHOST_ID = record.viewport.boxes
  .map((b) => b.assetId)
  .find((id) => id.includes("ghost-"))
  ?.replace("station-box:", "");

/* ------------------------------------------------------------------ */
/* The bundle phase                                                      */
/* ------------------------------------------------------------------ */

const SCRATCH = mkdtempSync(join(tmpdir(), "world-p5-gpu-smoke-"));
const BUNDLE_PATH = join(SCRATCH, "world-gpu-station.js");
const HTML_PATH = join(SCRATCH, "index.html");
/* The chrome mount (the Mount-3 journey) shares THIS session: ONE
 * browser, sequential describes — the 2-core sandbox cannot sustain
 * concurrent Chromium instances (recorded in the P5 evidence). */
const CHROME_BUNDLE_PATH = join(SCRATCH, "world-chrome-station.js");
const CHROME_HTML_PATH = join(SCRATCH, "chrome.html");

const NODE_BUILTIN_MARKERS = [
  "node:crypto",
  "node:fs",
  "node:path",
  "node:net",
  "node:http",
  "node:timers",
  "__require$2$createHash",
] as const;

async function bundleGpuMount(): Promise<void> {
  const esbuild = await import("esbuild");
  await esbuild.build({
    entryPoints: [join(WORLD_DIR, "browser-gpu-mount.tsx")],
    bundle: true,
    format: "iife",
    platform: "browser",
    target: "es2022",
    jsx: "automatic",
    minify: true,
    outfile: BUNDLE_PATH,
    logLevel: "silent",
    loader: { ".json": "json" },
  });
  if (!existsSync(BUNDLE_PATH)) {
    throw new Error("the GPU world mount bundle was not produced");
  }
  writeFileSync(
    HTML_PATH,
    `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>AISE — Engineering world (WORLD-P5 GPU smoke host)</title>
  </head>
  <body>
    <div id="world-host"></div>
    <script src="./world-gpu-station.js"></script>
  </body>
</html>
`,
  );
  /* The chrome mount (Mount 3) — bundled into the SAME session. */
  const esbuild2 = await import("esbuild");
  await esbuild2.build({
    entryPoints: [join(WORLD_DIR, "browser-chrome-mount.tsx")],
    bundle: true,
    format: "iife",
    platform: "browser",
    target: "es2022",
    jsx: "automatic",
    minify: true,
    outfile: CHROME_BUNDLE_PATH,
    logLevel: "silent",
    loader: { ".json": "json", ".css": "text" },
  });
  writeFileSync(
    CHROME_HTML_PATH,
    `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>AISE — Engineering world (WORLD-P5 chrome smoke host)</title>
  </head>
  <body>
    <div id="world-host"></div>
    <script src="./world-chrome-station.js"></script>
  </body>
</html>
`,
  );
}

/* ------------------------------------------------------------------ */
/* The ephemeral static serve (bounded, loopback-only)                   */
/* ------------------------------------------------------------------ */

const PORT = 4191;
let server: Server | null = null;
let browser: Browser | null = null;

function startStaticServer(): Promise<void> {
  return new Promise((resolve, reject) => {
    server = createServer((request, response) => {
      const url = request.url ?? "/";
      const filePath =
        url === "/chrome" || url.startsWith("/chrome?")
          ? CHROME_HTML_PATH
          : url === "/world-chrome-station.js"
            ? CHROME_BUNDLE_PATH
            : url === "/" || url.startsWith("/?")
              ? HTML_PATH
              : BUNDLE_PATH;
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
/* The journey                                                           */
/* ------------------------------------------------------------------ */

beforeAll(async () => {
  await bundleGpuMount();
  await startStaticServer();
  browser = await chromium.launch({
    executablePath: chromiumExecutable(),
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--enable-unsafe-swiftshader"],
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

describe("WORLD-P5 — the real-GPU viewport's real-browser smoke journey", () => {
  let page: Page;
  const pageErrors: string[] = [];

  beforeAll(async () => {
    const context = await browser!.newContext();
    page = await context.newPage();
    page.on("pageerror", (error) => pageErrors.push(String(error)));
  });

  test("SCAN: the REAL-substrate bundle carries NO Node-builtin markers and is substantial", () => {
    const bundle = readFileSync(BUNDLE_PATH, "utf8");
    for (const marker of NODE_BUILTIN_MARKERS) {
      expect(
        bundle.includes(marker),
        `the GPU mount bundle contains the forbidden marker '${marker}'`,
      ).toBe(false);
    }
    /* Babylon.js is IN the graph — the real substrate, not a double. */
    expect(bundle.length).toBeGreaterThan(1_000_000);
    expect(bundle).toContain("Babylon");
  });

  test("MOUNT: the station + the real viewport render; the renderer is recorded; the census matches the record", async () => {
    await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "load" });
    await page.waitForSelector("#world-station", { timeout: 20_000 });
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
    /* The real viewport came up over the station's viewport element. */
    await page.waitForSelector('.world-scene__viewport[data-gpu="webgl"]', { timeout: 10_000 });
    await page.waitForSelector('[data-testid="world-gpu-canvas"]', { timeout: 5_000 });
    const engineState = await page.evaluate(() => window.__AISE_WORLD_GPU__?.engineState());
    expect(engineState).toBe("webgl");
    /* The renderer string — the honest hardware declaration (recorded
     * verbatim by the evidence transcript; software GL in this sandbox). */
    const rendererInfo = await page.evaluate(() => window.__AISE_WORLD_GPU__?.rendererInfo());
    expect(rendererInfo).not.toBeNull();
    if (rendererInfo !== null && rendererInfo !== undefined) {
      expect(rendererInfo.renderer.length).toBeGreaterThan(0);
      // eslint-disable-next-line no-console -- the renderer string is RECORDED EVIDENCE (the honest hardware declaration this journey's transcript cites)
      console.log(`[WORLD-P5 GPU renderer — recorded]: ${rendererInfo.renderer}`);
    }
    /* The mesh census: exactly the record's declared boxes became real
     * meshes; once the substrate's async shader warm-up completes, a
     * real render pass happens with real draw calls. */
    const census = await page.evaluate(() => window.__AISE_WORLD_GPU__?.meshCensus());
    expect(census).not.toBeNull();
    if (census !== null && census !== undefined) {
      expect(census.meshes).toBe(record.viewport.boxes.length);
      expect(census.activeMeshes).toBeGreaterThanOrEqual(1);
    }
    await page.waitForFunction(
      () => (window.__AISE_WORLD_GPU__?.drawCalls() ?? 0) >= 1,
      undefined,
      { timeout: 15_000, polling: 100 },
    );
    expect(pageErrors).toEqual([]);
  });

  test("CAMERA: the typed camera operations drive the REAL camera (byte-equal round-trip)", async () => {
    const orbit = await page.evaluate(() =>
      window.__AISE_WORLD_STATION__?.dispatch({
        kind: "camera-operation",
        operation: "orbit-to",
        position: [2, -8, 3],
        target: [2, -2, 1.5],
      }),
    );
    expect(orbit?.ok).toBe(true);
    const camera = await page.evaluate(() => window.__AISE_WORLD_GPU__?.camera());
    expect(camera).not.toBeNull();
    if (camera !== null && camera !== undefined) {
      expect(camera.mode).toBe("orbit");
      expect(camera.position[0]).toBe(2);
      expect(camera.position[1]).toBe(-8);
      expect(camera.position[2]).toBe(3);
      expect(camera.target[0]).toBe(2);
      expect(camera.target[1]).toBe(-2);
      expect(camera.target[2]).toBe(1.5);
    }
    /* The deterministic camera readout reflects the same typed state. */
    const readout = await page.locator(".world-scene__camera").textContent();
    expect(readout).toContain("orbit");
    expect(pageErrors).toEqual([]);
  });

  test("LAYERS: the typed capture-layer toggle hides the capture meshes on the real scene graph", async () => {
    /* Before: the capture volumes are active meshes. */
    const before = await page.evaluate(() => window.__AISE_WORLD_GPU__?.meshCensus());
    const toggled = await page.evaluate(() =>
      window.__AISE_WORLD_STATION__?.dispatch({
        kind: "toggle-layer",
        layerId: "capture-reality",
        visible: false,
      }),
    );
    expect(toggled?.ok).toBe(true);
    /* The roster reflects the typed visibility (AND-semantics). */
    await page.waitForSelector('[data-status="capture-asset"][data-visible="false"]');
    /* The real viewport re-rendered with fewer active meshes. */
    const after = await page.evaluate(() => window.__AISE_WORLD_GPU__?.meshCensus());
    expect(before).not.toBeNull();
    expect(after).not.toBeNull();
    if (
      before !== null && before !== undefined &&
      after !== null && after !== undefined
    ) {
      expect(after.activeMeshes).toBeLessThan(before.activeMeshes);
      expect(after.meshes).toBe(record.viewport.boxes.length);
    }
    expect(pageErrors).toEqual([]);
  });

  test("PICK: a REAL ray at the screen center hits the GHOST — the removed wall is skipped, the canonical id comes back", async () => {
    expect(GHOST_ID).toBeDefined();
    /* The camera aims at the wall from the south; the capture layer is
     * off (previous leg) so the first real intersection is the ghost
     * box — the removed plan wall underneath it is SKIPPED (disabled),
     * never a phantom hit. */
    const pick = await page.evaluate(() => window.__AISE_WORLD_GPU__?.pickAt(0.5, 0.5));
    expect(pick).not.toBeNull();
    expect(pick?.elementId ?? "").toBe(GHOST_ID ?? "");
    /* The typed selection reflects the pick through the reducer. */
    const selected = await page.evaluate(
      () => window.__AISE_WORLD_STATION__?.state().selectedElementIds ?? [],
    );
    expect(selected).toContain(GHOST_ID ?? "");
    expect(pageErrors).toEqual([]);
  });

  test("REFUSAL: an unknown-element selection fails closed; a sky pick answers null (never a guess)", async () => {
    const refused = await page.evaluate(() =>
      window.__AISE_WORLD_STATION__?.dispatch({
        kind: "select-element",
        elementId: "element-unknown-42",
      }),
    );
    expect(refused?.ok).toBe(false);
    expect(refused?.refusal ?? "").toContain("not part of this station scene");
    const skyPick = await page.evaluate(() => window.__AISE_WORLD_GPU__?.pickAt(0.001, 0.999));
    expect(skyPick).not.toBeNull();
    expect(skyPick?.elementId).toBeNull();
    /* The station still renders (no crash). */
    await page.waitForSelector("#world-station", { timeout: 5_000 });
    expect(pageErrors).toEqual([]);
  });

  test("CLEAN: ZERO pageerror events across the whole GPU session", () => {
    expect(pageErrors).toEqual([]);
  });
});

/** Pointer coordinates over the canvas at normalized (x, y). */
async function canvasPoint(page: Page, x: number, y: number): Promise<{ px: number; py: number }> {
  return page.evaluate(
    ([nx, ny]) => {
      const canvas = document.querySelector<HTMLCanvasElement>('[data-testid="world-gpu-canvas"]');
      if (canvas === null) throw new Error("the GPU canvas is not present");
      const rect = canvas.getBoundingClientRect();
      return { px: rect.left + nx * rect.width, py: rect.top + ny * rect.height };
    },
    [x, y] as const,
  );
}

describe("WORLD-P5 Mount 4 — the DM gesture capture journey (the real browser)", () => {
  let page: Page;
  const pageErrors: string[] = [];

  beforeAll(async () => {
    const context = await browser!.newContext();
    page = await context.newPage();
    page.on("pageerror", (error) => pageErrors.push(String(error)));
  });

  test("the bundle stays crypto-free (the compile is served-side)", () => {
    const bundle = readFileSync(BUNDLE_PATH, "utf8");
    for (const marker of NODE_BUILTIN_MARKERS) {
      expect(bundle.includes(marker), `forbidden marker '${marker}'`).toBe(false);
    }
  });

  test("AUTHORING-MOUNT: the authoring bar renders with capture off", async () => {
    await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "load" });
    await page.waitForSelector("#world-station", { timeout: 20_000 });
    await page.waitForSelector('[data-testid="world-authoring-bar"]', { timeout: 5_000 });
    await page.waitForSelector('[data-testid="world-solution-arm"]', { timeout: 5_000 });
    expect(await page.evaluate(() => window.__AISE_WORLD_AUTHORING__?.mode())).toBe("off");
    expect(await page.evaluate(() => window.__AISE_WORLD_AUTHORING__?.captured())).toBeNull();
  }, 30_000);

  test("CAPTURE: a real grab + drop on the slab captures the typed move gesture", async () => {
    /* Aim at the slab (the plan element with no ghost above it) and
     * hide the capture volumes (the AND-semantics leg of the journey
     * in reverse — the slab must be the first hit). */
    const aim = await page.evaluate(() =>
      window.__AISE_WORLD_STATION__?.dispatch({
        kind: "camera-operation",
        operation: "orbit-to",
        position: [7, 1, 4],
        target: [7, 7, 0.15],
      }),
    );
    expect(aim?.ok).toBe(true);
    const hidden = await page.evaluate(() =>
      window.__AISE_WORLD_STATION__?.dispatch({
        kind: "toggle-layer",
        layerId: "capture-reality",
        visible: false,
      }),
    );
    expect(hidden?.ok).toBe(true);

    /* Arm solution mode. */
    await page.click('[data-testid="world-solution-arm"]');
    expect(await page.evaluate(() => window.__AISE_WORLD_AUTHORING__?.mode())).toBe("armed");

    /* Grab on the slab's left third, drop on its right third (both
     * REAL picks; the delta is the xy distance between the hit
     * points). */
    const down = await canvasPoint(page, 0.42, 0.5);
    const up = await canvasPoint(page, 0.58, 0.5);
    await page.mouse.move(down.px, down.py);
    await page.mouse.down();
    await page.mouse.move(up.px, up.py);
    await page.mouse.up();

    await page.waitForFunction(
      () => window.__AISE_WORLD_AUTHORING__?.mode() === "captured",
      undefined,
      { timeout: 5_000, polling: 50 },
    );
    const captured = await page.evaluate(() => window.__AISE_WORLD_AUTHORING__?.captured());
    expect(captured).not.toBeNull();
    if (captured !== null && captured !== undefined) {
      expect(captured.pickedElementId).toBe("plan-slab-001");
      expect(captured.gestures).toEqual([
        "pick-element",
        "begin-grab",
        "drag-by",
        "drop-at",
        "commit",
      ]);
      const [dx, dy, dz] = captured.dragDeltaMetres;
      expect(Math.abs(dx)).toBeGreaterThan(0.5);
      expect(Math.abs(dx)).toBeLessThan(4);
      expect(Math.abs(dy)).toBeLessThan(0.01);
      expect(dz).toBe(0);
    }
    expect(pageErrors).toEqual([]);
  }, 30_000);

  test("DETERMINISM: the same pointer events capture byte-identical values", async () => {
    const captureRounded = async (): Promise<string | null> => {
      await page.click('[data-testid="world-solution-arm"]');
      expect(await page.evaluate(() => window.__AISE_WORLD_AUTHORING__?.mode())).toBe("off");
      await page.click('[data-testid="world-solution-arm"]');
      expect(await page.evaluate(() => window.__AISE_WORLD_AUTHORING__?.mode())).toBe("armed");
      const down = await canvasPoint(page, 0.42, 0.5);
      const up = await canvasPoint(page, 0.58, 0.5);
      await page.mouse.move(down.px, down.py);
      await page.mouse.down();
      await page.mouse.move(up.px, up.py);
      await page.mouse.up();
      await page.waitForFunction(
        () => window.__AISE_WORLD_AUTHORING__?.mode() === "captured",
        undefined,
        { timeout: 5_000, polling: 50 },
      );
      return page.evaluate(() => {
        const c = window.__AISE_WORLD_AUTHORING__?.captured();
        return c === null || c === undefined
          ? null
          : JSON.stringify({
              pickedElementId: c.pickedElementId,
              dragDeltaMetres: c.dragDeltaMetres.map((v) => Number(v.toFixed(9))),
              gestures: c.gestures,
            });
      });
    };
    /* The camera still aims at the slab from the CAPTURE leg; the
     * identical gesture (0.35 → 0.65 at y 0.5) captures twice with
     * byte-identical rounded values. */
    const first = await captureRounded();
    const second = await captureRounded();
    expect(first).not.toBeNull();
    expect(second).toBe(first);
    const parsed = first !== null ? (JSON.parse(first) as { pickedElementId: string }) : null;
    expect(parsed?.pickedElementId).toBe("plan-slab-001");
  }, 30_000);

  test("FAIL-CLOSED: a grab on empty sky captures nothing (never a guess)", async () => {
    await page.click('[data-testid="world-solution-arm"]'); // disarm (captured → off)
    await page.click('[data-testid="world-solution-arm"]'); // arm
    /* Aim at empty sky: up and to the left of the slab. */
    const aim = await page.evaluate(() =>
      window.__AISE_WORLD_STATION__?.dispatch({
        kind: "camera-operation",
        operation: "fly-through",
        position: [40, 40, 40],
        target: [60, 60, 0],
      }),
    );
    expect(aim?.ok).toBe(true);
    const sky = await canvasPoint(page, 0.5, 0.5);
    await page.mouse.move(sky.px, sky.py);
    await page.mouse.down();
    await page.mouse.up();
    expect(await page.evaluate(() => window.__AISE_WORLD_AUTHORING__?.mode())).toBe("armed");
    expect(await page.evaluate(() => window.__AISE_WORLD_AUTHORING__?.captured())).toBeNull();
    const status = await page.locator('[data-testid="world-authoring-status"]').textContent();
    expect(status ?? "").toContain("must land on picked geometry");
    expect(pageErrors).toEqual([]);
  }, 30_000);

  test("CLEAN: zero pageerror across the whole authoring session", () => {
    expect(pageErrors).toEqual([]);
  });
});

/* ================================================================== */
/* WORLD-P5 Mount 3 — the production HUD chrome's real-browser        */
/* journey (the SAME browser session, a fresh context — the 2-core    */
/* sandbox cannot sustain concurrent Chromium instances).             */
/* ================================================================== */

describe("WORLD-P5 — the production HUD chrome's real-browser smoke journey", () => {
  let page: Page;
  const pageErrors: string[] = [];

  beforeAll(async () => {
    const context = await browser!.newContext();
    page = await context.newPage();
    page.on("pageerror", (error) => pageErrors.push(String(error)));
  });

  test("SCAN: the bundle carries NO Node-builtin markers and the CHROME STYLESHEET text is in it", () => {
    const bundle = readFileSync(CHROME_BUNDLE_PATH, "utf8");
    for (const marker of NODE_BUILTIN_MARKERS) {
      expect(
        bundle.includes(marker),
        `the chrome mount bundle contains the forbidden marker '${marker}'`,
      ).toBe(false);
    }
    /* The chrome stylesheet rides as TEXT: distinctive CSS content —
     * the frame selector, a governed panel state selector, and the
     * chrome's keyframes — all appear in the bundle verbatim. */
    expect(bundle).toContain("world-chrome-frame");
    expect(bundle).toContain(".world-hud-panel--populated");
    expect(bundle).toContain("@keyframes world-chrome-panel-enter");
    /* Babylon.js is in the graph — the real substrate, not a double. */
    expect(bundle.length).toBeGreaterThan(1_000_000);
    expect(bundle).toContain("Babylon");
  });

  test("CHROME-MOUNT: the frame + injected stylesheet are present and ACTUALLY applied; the real viewport comes up", async () => {
    await page.goto(`http://127.0.0.1:${PORT}/chrome`, { waitUntil: "load" });
    await page.waitForSelector("#world-station", { timeout: 20_000 });
    for (const panelId of [
      "objective",
      "evidence",
      "constraints",
      "agent",
      "validation",
      "cost-boq",
      "timeline",
    ] as const) {
      await page.waitForSelector(`#world-panel-${panelId}`, { timeout: 5_000 });
    }
    /* The chrome frame + the injected style element. */
    await page.waitForSelector('[data-testid="world-chrome-frame"]', { timeout: 5_000 });
    const stylePresent = await page.evaluate(
      () => document.querySelector('style[data-testid="world-chrome-style"]') !== null,
    );
    expect(stylePresent).toBe(true);
    const chromeHandle = await page.evaluate(() => ({
      css: window.__AISE_WORLD_CHROME__?.cssInjected() ?? false,
      frame: window.__AISE_WORLD_CHROME__?.framePresent() ?? false,
    }));
    expect(chromeHandle.css).toBe(true);
    expect(chromeHandle.frame).toBe(true);
    /* The stylesheet is APPLIED, not merely injected — one computed
     * style per law: the frame fills the viewport (fixed), and the
     * populated panels carry the ghost-green status edge. */
    const framePosition = await page.evaluate(
      () => getComputedStyle(document.querySelector(".world-chrome-frame")!).position,
    );
    expect(framePosition).toBe("fixed");
    const panelEdge = await page.evaluate(
      () => getComputedStyle(document.querySelector(".world-hud-panel--populated")!).borderLeftColor,
    );
    expect(panelEdge).toBe("rgb(45, 217, 106)");
    /* The REAL viewport mounts inside the chrome (the GPU mount's
     * journey, held under the chrome — software GL in this sandbox). */
    await page.waitForSelector('.world-scene__viewport[data-gpu="webgl"]', { timeout: 10_000 });
    await page.waitForSelector('[data-testid="world-gpu-canvas"]', { timeout: 5_000 });
    expect(pageErrors).toEqual([]);
  });

  test("CHROME-PARITY: the SAME typed surface renders under the chrome (data unchanged by presentation)", async () => {
    const stationId = await page.evaluate(() => window.__AISE_WORLD_STATION__?.stationId);
    expect(stationId).toBe(record.stationId);
    /* All seven panels, honestly POPULATED — the committed record's
     * own states, verbatim under the chrome. */
    const states = await page.evaluate(() =>
      Array.from(document.querySelectorAll(".world-hud-panel")).map(
        (panel) => (panel as HTMLElement).dataset.contentState,
      ),
    );
    expect(states).toEqual(["POPULATED", "POPULATED", "POPULATED", "POPULATED", "POPULATED", "POPULATED", "POPULATED"]);
    /* The roster: one row per record element (the committed 7). */
    const rosterRows = await page.evaluate(() => document.querySelectorAll(".world-roster__row").length);
    expect(rosterRows).toBe(record.elements.length);
    /* The ghost chip is present and ghost-distinct. */
    await page.waitForSelector('[data-status="proposed-ghost"]', { timeout: 5_000 });
    const ghostChip = await page.locator('[data-status="proposed-ghost"] .world-chip').textContent();
    expect(ghostChip).toBe("proposed-ghost");
    expect(pageErrors).toEqual([]);
  });

  test("AUDIO-HOOKS: the typed audio state, the mirrored mapping, the cue dispatches, and the gesture gate", async () => {
    /* Before any pointer/key event: the sink is honestly gated. */
    const initial = await page.evaluate(() => window.__AISE_WORLD_CHROME__?.audioState());
    expect(initial?.gestureGated).toBe(false);
    expect(initial?.available).toBe(false);
    expect(initial?.reason ?? "").toContain("gesture");
    /* The handle's mapping mirrors the PURE mapping (chrome.ts). */
    const mirrored = await page.evaluate(() => [
      window.__AISE_WORLD_CHROME__?.audioCueOf({
        command: { kind: "select-element", elementId: "plan-slab-001" },
        ok: true,
        hitStatus: "plan",
      }),
      window.__AISE_WORLD_CHROME__?.audioCueOf({
        command: { kind: "select-element", elementId: "ghost" },
        ok: true,
        hitStatus: "proposed-ghost",
      }),
      window.__AISE_WORLD_CHROME__?.audioCueOf({
        command: { kind: "camera-operation", operation: "orbit-to" },
        ok: true,
      }),
      window.__AISE_WORLD_CHROME__?.audioCueOf({
        command: { kind: "toggle-layer", layerId: "plan-model", visible: false },
        ok: true,
      }),
      window.__AISE_WORLD_CHROME__?.audioCueOf({ command: { kind: "clear-selection" }, ok: true }),
      window.__AISE_WORLD_CHROME__?.audioCueOf({
        command: { kind: "select-element", elementId: "element-unknown-42" },
        ok: false,
        hitStatus: null,
      }),
    ]);
    expect(mirrored).toEqual(["select", "ghost-select", "camera", "layer", "clear", "refusal"]);
    /* A ghost selection through the TYPED handle cues ghost-select. */
    expect(GHOST_ID).toBeDefined();
    const ghostSelect = await page.evaluate((elementId) =>
      window.__AISE_WORLD_STATION__?.dispatch({ kind: "select-element", elementId }),
    GHOST_ID ?? "");
    expect(ghostSelect?.ok).toBe(true);
    expect(await page.evaluate(() => window.__AISE_WORLD_CHROME__?.lastCue())).toBe(
      "ghost-select",
    );
    /* An unknown-element selection fails closed and cues refusal. */
    const refused = await page.evaluate(() =>
      window.__AISE_WORLD_STATION__?.dispatch({
        kind: "select-element",
        elementId: "element-unknown-42",
      }),
    );
    expect(refused?.ok).toBe(false);
    expect(await page.evaluate(() => window.__AISE_WORLD_CHROME__?.lastCue())).toBe("refusal");
    /* THE GESTURE GATE: a REAL pointerdown (the page's own header —
     * no station control) unlocks the sink; availability is asserted
     * as CONSISTENT STATE (available ⟺ reason === null), never as
     * sound. */
    await page.mouse.move(320, 16);
    await page.mouse.down();
    await page.mouse.up();
    const afterGesture = await page.evaluate(() => window.__AISE_WORLD_CHROME__?.audioState());
    expect(afterGesture?.gestureGated).toBe(true);
    expect(afterGesture?.available).toBe(afterGesture?.reason === null);
    /* Chromium carries a real AudioContext — once ungated, the sink is
     * available (its cues still only ever best-effort). */
    expect(afterGesture?.available).toBe(true);
    expect(afterGesture?.reason).toBe(null);
    /* One more dispatched command plays through the UNGATED sink —
     * presentation-only, fail-closed: no pageerror, no crash. */
    const camera = await page.evaluate(() =>
      window.__AISE_WORLD_STATION__?.dispatch({
        kind: "camera-operation",
        operation: "orbit-to",
        position: [2, -8, 3],
        target: [2, -2, 1.5],
      }),
    );
    expect(camera?.ok).toBe(true);
    expect(await page.evaluate(() => window.__AISE_WORLD_CHROME__?.lastCue())).toBe("camera");
    expect(pageErrors).toEqual([]);
  });

  test("CLEAN: ZERO pageerror events across the whole chrome session", () => {
    expect(pageErrors).toEqual([]);
  });
});
