/**
 * WORLD-P5 — the MEASUREMENT PROTOCOL harness (executes the WORLD-P1
 * recorded protocol verbatim against the REAL adapters that now
 * exist).
 *
 * The protocol (docs/world-program-evidence/WORLD-P1/
 * CAPABILITY-BOUNDARIES.md §LARGE-MODEL PERFORMANCE):
 *
 *  1. Run the real Babylon adapter (the P5 occupant of the P0-A
 *     scene-runtime port) on the generated scene corpus (10/100/1000-
 *     node fixtures) headless via Babylon NullEngine for CPU-side
 *     costs (ingest, layer toggling, camera application) — median and
 *     p95 over 25 runs per fixture.
 *  2. Real GPU frame time / draw-call counts at the same fixtures —
 *     declared BLOCKED in this sandbox when no GPU device exists
 *     (recorded with the exact blocker); the SOFTWARE-RENDER
 *     (SwiftShader) browser legs are recorded as clearly-labeled
 *     supplementary observations — NEVER as GPU numbers.
 *  3. Cesium 3D Tiles streaming on a real photogrammetry corpus —
 *     BLOCKED with the exact blockers when they hold.
 *  4. The what-is-here / what-changed / measure queries and the P4 UI
 *     query costs against the same corpus, compared with the P1
 *     contract-level floors (the contract core is the floor, not the
 *     ceiling).
 *  5. GPU vendor/driver recorded alongside every browser number
 *     (hardware-declared, never averaged across vendors).
 *  6. ZERO fabricated numbers: any measurement that cannot run stays
 *     declared BLOCKED with the exact blocker.
 *
 * Re-run from the repo root:
 *
 *   bun docs/world-program-evidence/WORLD-P5/measure.ts
 *
 * (writes measurements-raw.txt in this directory).
 */

import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { createServer } from "node:http";
import { chromium } from "playwright";
import type { Browser, Page } from "playwright";
import { createBabylonSceneRuntime } from "../../../packages/world-scene-runtime/src/index";
import type { BabylonSceneRuntime } from "../../../packages/world-scene-runtime/src/index";
import type { GeometryReference } from "../../../packages/world-reality-substrate/src/scene";
import {
  spatializeCaptureSession,
  registerCaptureFragment,
  composeReconstructionWorld,
  queryWhatIsHere,
  queryWhatChanged,
  runMeasurementQueries,
  FIXTURE_SITE_FRAME,
  FIXTURE_SPATIALIZATION_REQUEST,
  FIXTURE_REGISTRATION_REQUEST,
  FIXTURE_PLAN_MODEL,
  FIXTURE_CAPTURE_SESSION,
  FIXTURE_MEASUREMENT_QUERIES,
  type NavigableWorld,
  type CaptureSessionEnvelope,
} from "../../../packages/world-layer1-experience/src/index";
import { viewportFixture, FIXTURE_SIZES } from "./corpus";

/* ------------------------------------------------------------------ */
/* The harness helpers (the P1 discipline)                               */
/* ------------------------------------------------------------------ */

const HERE = dirname(new URL(import.meta.url).pathname);
const RUNS_25 = 25;

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2
    : (sorted[mid] ?? 0);
}

function p95(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.ceil(0.95 * sorted.length) - 1);
  return sorted[idx] ?? 0;
}

function measure(label: string, runs: number, op: () => void): { label: string; runs: number; medianMs: number; p95Ms: number } {
  for (let i = 0; i < 3; i++) op(); // warm-up (JIT) — never measured
  const samples: number[] = [];
  for (let i = 0; i < runs; i++) {
    const start = performance.now();
    op();
    samples.push(performance.now() - start);
  }
  return { label, runs, medianMs: median(samples), p95Ms: p95(samples) };
}

const lines: string[] = [];
function emit(line = ""): void {
  lines.push(line);
  console.log(line);
}

function fmt(r: { label: string; runs: number; medianMs: number; p95Ms: number }): string {
  return `${r.label} | runs=${String(r.runs)} | median=${r.medianMs.toFixed(4)} ms | p95=${r.p95Ms.toFixed(4)} ms`;
}

/* ------------------------------------------------------------------ */
/* Leg 1 — the NullEngine CPU-side costs (the real adapter, headless)   */
/* ------------------------------------------------------------------ */

function fixtureGeometryResolver(boxes: ReadonlyMap<string, { min: readonly number[]; max: readonly number[] }>) {
  return (ref: GeometryReference) => {
    const box = boxes.get(ref.assetId);
    return box === undefined
      ? null
      : { kind: "box" as const, min: box.min as [number, number, number], max: box.max as [number, number, number] };
  };
}

function nullEngineLegs(): void {
  emit("== 1. THE REAL BABYLON ADAPTER — NullEngine CPU-side costs (ingest / layer toggling / camera / pick / render) ==");
  emit("engine: Babylon.js NullEngine (real scene graph, real CPU ray picking; NO GPU — the gpu legs are declared below)");
  emit("");

  const create = measure("engine create+shutdown (fresh runtime)", RUNS_25, () => {
    const outcome = createBabylonSceneRuntime({ engine: { mode: "null" }, geometry: () => null });
    if (outcome.ok) outcome.value.shutdown();
  });
  emit(fmt(create));
  emit("");

  for (const size of FIXTURE_SIZES) {
    const fixture = viewportFixture(size);
    const resolver = fixtureGeometryResolver(fixture.boxes);
    const runtimeOutcome = createBabylonSceneRuntime({ engine: { mode: "null" }, geometry: resolver });
    if (!runtimeOutcome.ok) throw new Error(runtimeOutcome.failure.detail);
    const runtime: BabylonSceneRuntime = runtimeOutcome.value;
    const load = runtime.loadScene(fixture.scene);
    if (!load.ok) throw new Error(load.failure.detail);
    const handle = load.value;
    runtime.setCamera(handle, fixture.camera);

    emit(`fixture N=${String(size)}:`);
    emit(fmt(measure(`  ingest (loadScene + dispose) [N=${String(size)}]`, RUNS_25, () => {
      const l = runtime.loadScene(fixture.scene);
      if (l.ok) runtime.dispose(l.value);
    })));
    emit(fmt(measure(`  layer toggling (setLayerVisible ×2) [N=${String(size)}]`, RUNS_25, () => {
      runtime.setLayerVisible(handle, "capture-reality", false);
      runtime.setLayerVisible(handle, "capture-reality", true);
    })));
    emit(fmt(measure(`  camera application (setCamera) [N=${String(size)}]`, RUNS_25, () => {
      runtime.setCamera(handle, fixture.camera);
    })));
    emit(fmt(measure(`  pick at screen center (real CPU ray) [N=${String(size)}]`, RUNS_25, () => {
      runtime.pick(handle, 0.5, 0.5);
    })));
    emit(fmt(measure(`  headless render pass (renderOnce + frameStats) [N=${String(size)}]`, RUNS_25, () => {
      runtime.renderOnce(handle);
      runtime.frameStats(handle);
    })));
    const stats = runtime.frameStats(handle);
    emit(
      `  census after render: drawCalls=${String(stats.ok ? stats.value.drawCalls : -1)} activeMeshes=${String(stats.ok ? stats.value.activeMeshes : -1)} (NullEngine draw calls may honestly be 0 — no GL pipeline executes headless)`,
    );
    runtime.dispose(handle);
    runtime.shutdown();
    emit("");
  }
}

/* ------------------------------------------------------------------ */
/* Leg 2 — the P1 contract floors re-measured (the same fixture        */
/* discipline, this tree, this moment — the no-regression check)        */
/* ------------------------------------------------------------------ */

function p1StyleWorldFor(assetCount: number, revision: number): NavigableWorld {
  // The P1 harness generation pattern, verbatim in spirit: a generated
  // session → spatialize → register (2 admitted hypotheses) → compose
  // with 100 plan elements.
  const generated: CaptureSessionEnvelope = {
    ...FIXTURE_CAPTURE_SESSION,
    assets: Array.from({ length: assetCount }, (_, i) => {
      const base = FIXTURE_CAPTURE_SESSION.assets[i % FIXTURE_CAPTURE_SESSION.assets.length]!;
      if (base === undefined) throw new Error("unreachable");
      return { ...base, contentId: `${base.contentId.slice(0, 56)}${String(i).padStart(8, "0")}` };
    }),
  };
  const spatialized = spatializeCaptureSession({
    envelope: generated,
    siteFrame: FIXTURE_SITE_FRAME,
    declaredAt: "2026-10-06T00:00:00.000Z",
  });
  if (!spatialized.ok) throw new Error(spatialized.failure.detail);
  const hypotheses = spatialized.value.assets.slice(0, 2).map((asset, index) => ({
    ...FIXTURE_REGISTRATION_REQUEST.hypotheses[index]!,
    evidenceContentId: asset.evidenceContentId,
  }));
  const registered = registerCaptureFragment({
    fragment: spatialized.value,
    hypotheses,
    candidateAnchor: { latitudeDeg: 47.3769, longitudeDeg: 8.5417, heightM: 408 },
    declaredAccuracyMetres: 0.5,
    declaredAt: "2026-10-06T00:00:00.000Z",
  });
  if (!registered.ok) throw new Error(registered.failure.detail);
  const plan = {
    ...FIXTURE_PLAN_MODEL,
    elements: Array.from({ length: 100 }, (_, i) => ({
      ...FIXTURE_PLAN_MODEL.elements[0]!,
      elementId: `plan-harness-${String(i)}`,
      translation: [i, i % 20, 0] as const,
    })),
  };
  const composed = composeReconstructionWorld({
    fragments: [registered.value.fragment],
    planModel: plan,
    siteFrame: FIXTURE_SITE_FRAME,
    georeference: null,
    worldRevision: revision,
    declaredAt: "2026-10-06T00:00:00.000Z",
  });
  if (!composed.ok) throw new Error(composed.failure.detail);
  return composed.value;
}

function contractFloorLegs(): void {
  emit("== 2. THE P1 CONTRACT FLOORS re-measured (the same fixture discipline, this tree — the no-regression check) ==");
  const worlds = new Map<number, NavigableWorld>();
  for (const n of FIXTURE_SIZES) {
    const world = p1StyleWorldFor(n, 1);
    worlds.set(n, world);
    emit(
      fmt(measure(`  compose world (P1 lane, assets=${String(n)} plan=100)`, RUNS_25, () => {
        p1StyleWorldFor(n, 1);
      })),
    );
  }
  const big = worlds.get(1000)!;
  emit(
    fmt(measure("  what-is-here (P1 lane, 1000-asset world)", 100, () => {
      void queryWhatIsHere(big, { point: [2, 1, 1], worldRevision: big.worldRevision });
    })),
  );
  const bigR2 = p1StyleWorldFor(1000, 2);
  emit(
    fmt(measure("  what-changed (P1 lane, 1000-asset world rev1→rev2)", RUNS_25, () => {
      void queryWhatChanged({ fromWorld: big, toWorld: bigR2 });
    })),
  );
  emit(
    fmt(measure("  measurement queries ×5 (P1 lane, 1000-asset world)", 100, () => {
      void runMeasurementQueries(big, FIXTURE_MEASUREMENT_QUERIES);
    })),
  );
  emit("");
}

/* ------------------------------------------------------------------ */
/* Leg 3 — the P4 UI query costs at the fixture scales                   */
/* ------------------------------------------------------------------ */

interface UIRecord {
  recordKind: "aise.world-station-record/1";
  stationId: string;
  scopeLabel: string;
  composedAt: string;
  initialCamera: { position: readonly number[]; target: readonly number[]; up: readonly number[]; fovRadians: number; mode: string };
  layers: readonly { layerId: string; name: string; visibleByDefault: boolean }[];
  elements: readonly {
    elementId: string;
    status: string;
    isGhost: boolean;
    label: string | null;
    layerIds: readonly string[];
    evidenceContentIds: readonly string[];
    concernsPanels: readonly string[];
  }[];
  hud: { panels: readonly { panelId: string }[] };
}

interface UIStationModule {
  initialStationViewState: (record: UIRecord) => never;
  resolveRecordElement: (record: UIRecord, elementId: string) => unknown;
  reduceStationCommand: (
    record: UIRecord,
    state: never,
    command: unknown,
  ) => { ok: boolean; state: never; refusal: string | null };
}

async function uiLegs(): Promise<void> {
  emit("== 3. THE P4 UI QUERY COSTS at the fixture scales (the browser-safe reducer — the route's own query functions) ==");
  // Import the route's browser-safe query layer (an evidence script may
  // import across zones; the product boundaries are enforced by the
  // tools/verify boundary gate on the product zones).
  const ui = (await import(
    join(HERE, "../../../apps/web/src/app/world/browser-station.ts"),
  )) as unknown as UIStationModule;
  for (const size of FIXTURE_SIZES) {
    const fixture = viewportFixture(size);
    const record: UIRecord = {
      recordKind: "aise.world-station-record/1",
      stationId: `fixture-${String(size)}`,
      scopeLabel: "fixture",
      composedAt: "2026-10-06T00:00:00.000Z",
      initialCamera: { position: [0, 0, 10], target: [0, 0, 0], up: [0, 0, 1], fovRadians: 0.9, mode: "orbit" },
      layers: fixture.scene.layers.map((l) => ({ ...l })),
      elements: fixture.scene.nodes.map((n) => ({
        elementId: n.elementId,
        status: "captured",
        isGhost: false,
        label: n.label,
        layerIds: n.layerIds,
        evidenceContentIds: n.evidenceContentIds,
        concernsPanels: [],
      })),
      hud: { panels: [] },
    };
    const initialState = ui.initialStationViewState(record);
    const probeId = `fixture-el-${String(Math.floor(size / 2))}`;
    emit(fmt(measure(`  resolveRecordElement [N=${String(size)}]`, 100, () => {
      void ui.resolveRecordElement(record, probeId);
    })));
    emit(fmt(measure(`  reduce select + toggle-layer [N=${String(size)}]`, 100, () => {
      void ui.reduceStationCommand(record, ui.initialStationViewState(record), { kind: "select-element", elementId: "fixture-el-0" });
      void ui.reduceStationCommand(record, initialState, { kind: "toggle-layer", layerId: "capture-reality", visible: false });
    })));
  }
  emit("");
}

/* ------------------------------------------------------------------ */
/* Leg 4 — the SOFTWARE-RENDER (SwiftShader) browser observations        */
/* ------------------------------------------------------------------ */

async function browserLegs(): Promise<void> {
  emit("== 4. THE BROWSER RENDER LEGS — SOFTWARE-RENDERED (SwiftShader) SUPPLEMENTARY OBSERVATIONS ==");
  emit("THIS SANDBOX HAS NO GPU DEVICE — these are NOT real-GPU numbers (the real-GPU legs are declared BLOCKED below).");
  emit("Every row carries the renderer string (the protocol's hardware-declaration law).");
  emit("");

  const scratch = mkdtempSync(join(tmpdir(), "world-p5-measure-"));
  const esbuild = await import("esbuild");
  const repoRoot = resolve(HERE, "../../..");

  // Serve the bundles over loopback (an HTML host per fixture + the JS).
  const PORT = 4195;
  const server = createServer((request, response) => {
    const url = request.url ?? "";
    const htmlMatch = /^\/(\d+)\/?$/.exec(url);
    const jsMatch = /^\/(\d+)\.js$/.exec(url);
    if (htmlMatch !== null) {
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      response.end(
        `<!doctype html><html><body><script src="./${htmlMatch[1]}.js"></script></body></html>`,
      );
      return;
    }
    if (jsMatch !== null) {
      try {
        const body = readFileSync(join(scratch, `${jsMatch[1]}.js`));
        response.writeHead(200, { "content-type": "text/javascript; charset=utf-8" });
        response.end(body);
      } catch {
        response.writeHead(404);
        response.end("not found");
      }
      return;
    }
    response.writeHead(404);
    response.end("not found");
  });
  await new Promise<void>((resolveListen) => server.listen(PORT, "127.0.0.1", resolveListen));

  // Bundle the measurement mount per fixture size (token rewrite — the
  // SAME corpus generator feeds both legs).
  const mountSource = readFileSync(join(HERE, "measure-mount.ts"), "utf8");
  for (const size of FIXTURE_SIZES) {
    writeFileSync(
      join(scratch, `mount-${String(size)}.ts`),
      mountSource.replace(
        "const FIXTURE_SIZE = 10 as (typeof FIXTURE_SIZES)[number];",
        `const FIXTURE_SIZE = ${String(size)} as const;`,
      ).replace('from "./corpus"', `from ${JSON.stringify(join(HERE, "corpus.ts"))}`),
    );
    await esbuild.build({
      entryPoints: [join(scratch, `mount-${String(size)}.ts`)],
      bundle: true,
      format: "iife",
      platform: "browser",
      target: "es2022",
      outfile: join(scratch, `${String(size)}.js`),
      logLevel: "silent",
      alias: {
        "@aise/world-scene-runtime": join(repoRoot, "packages/world-scene-runtime/src/index.ts"),
      },
    });
  }

  let browser: Browser | null = null;
  try {
    const executablePath = chromium.executablePath();
    if (!existsSync(executablePath)) {
      throw new Error("chromium not installed");
    }
    browser = await chromium.launch({
      executablePath,
      args: ["--no-sandbox", "--disable-dev-shm-usage", "--enable-unsafe-swiftshader"],
    });
    const context = await browser.newContext();
    const page: Page = await context.newPage();
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(String(error)));

    for (const size of FIXTURE_SIZES) {
      await page.goto(`http://127.0.0.1:${PORT}/${String(size)}`, { waitUntil: "load" });
      await page.waitForFunction(() => window.__P5_MEASURE__ !== undefined, undefined, { timeout: 20_000, polling: 50 });
      const renderer = await page.evaluate(() => ({
        renderer: window.__P5_MEASURE__?.renderer ?? "unknown",
        vendor: window.__P5_MEASURE__?.vendor ?? "unknown",
        version: window.__P5_MEASURE__?.version ?? "unknown",
      }));
      const warmup = await page.evaluate(() => window.__P5_MEASURE__?.warmup() ?? null);
      const frames = await page.evaluate(() => window.__P5_MEASURE__?.measureFrames(25) ?? []);
      const drawCalls = await page.evaluate(() => window.__P5_MEASURE__?.drawCalls() ?? -1);
      const activeMeshes = await page.evaluate(() => window.__P5_MEASURE__?.activeMeshes() ?? -1);
      await page.evaluate(() => window.__P5_MEASURE__?.dispose());
      emit(`fixture N=${String(size)} (SOFTWARE-RENDERED — SwiftShader):`);
      emit(`  renderer: ${renderer.renderer}`);
      emit(`  vendor: ${renderer.vendor} | version: ${renderer.version}`);
      emit(
        `  warmup: ticks=${String(warmup?.ticks ?? -1)} → drawCalls=${String(warmup?.drawCalls ?? -1)} activeMeshes=${String(warmup?.activeMeshes ?? -1)}`,
      );
      if (frames.length > 0) {
        emit(
          `  frame time (renderOnce, ${String(frames.length)} runs): median=${median(frames).toFixed(3)} ms | p95=${p95(frames).toFixed(3)} ms`,
        );
      } else {
        emit("  frame time: NOT MEASURED (the mount did not report samples — recorded honestly)");
      }
      emit(`  steady-state census: drawCalls=${String(drawCalls)} activeMeshes=${String(activeMeshes)}`);
      emit("");
    }
    emit(`pageerror events across the browser legs: ${String(pageErrors.length)}${pageErrors.length > 0 ? ` — ${pageErrors.join(" | ")}` : ""}`);
    emit("");
  } finally {
    if (browser !== null) await browser.close();
    server.close();
    rmSync(scratch, { recursive: true, force: true });
  }
}

/* ------------------------------------------------------------------ */
/* Leg 5 — the BLOCKED declarations (the honesty law)                    */
/* ------------------------------------------------------------------ */

function blockedLegs(): void {
  emit("== 5. DECLARED BLOCKED (the honesty law — zero fabricated numbers) ==");
  emit("");
  emit("BLOCKED: real-GPU frame time / draw-call counts at the fixtures.");
  emit("  blocker: this sandbox has NO GPU DEVICE — /dev/dri is absent and no VGA/DRM");
  emit("  device exists (the WORLD-P0-A recorded blocker, unchanged at P5). The browser");
  emit("  legs above render through SwiftShader SOFTWARE GL and are recorded as");
  emit("  supplementary software-render observations, never as GPU numbers.");
  emit("  unblocking protocol: run legs 1+4 on a machine with a real GPU device;");
  emit("  record GPU vendor/driver alongside every number (never average across");
  emit("  vendors); the SwiftShader rows above then remain as the software baseline.");
  emit("");
  emit("BLOCKED: Cesium 3D Tiles streaming/register costs on a real photogrammetry corpus.");
  emit("  blockers: (a) no campus-scale photogrammetry 3D Tiles corpus is available or");
  emit("  licensable in this sandbox (the Cesium ion sample corpora are commercial");
  emit("  cloud services — the P0-A license matrix records AISE consumes the");
  emit("  open-source engine only, no ion dependency); (b) no GPU device (as above);");
  emit("  (c) no real Cesium adapter is mounted in this delivery — the WORLD-P5 mounts");
  emit("  are the Babylon scene viewport per the work order; the P0-A cesium port");
  emit("  remains contract + in-memory double with its georeference round-trip measured");
  emit("  at contract level (WORLD-P0-A PERFORMANCE-OBSERVATIONS §3).");
  emit("  unblocking protocol: mount a real Cesium occupant of the P0-A cesium port,");
  emit("  source an open-licensed campus-scale 3D Tiles corpus, and measure streaming/");
  emit("  register costs + the georeference tolerance round-trip against the P0-A");
  emit("  declared tolerance on GPU-bearing hardware.");
  emit("");
}

/* ------------------------------------------------------------------ */
/* The run                                                               */
/* ------------------------------------------------------------------ */

emit("WORLD-P5 real-substrate performance measurements (REAL run — the P1 protocol executed verbatim)");
emit(`recorded: ${new Date().toISOString()}`);
emit(`sandbox: bun ${Bun.version}, Linux x64, 2 cores, NO GPU DEVICE (/dev/dri absent — software legs only where a GPU is required)`);
emit("adapters: @babylonjs/core 8.56.2 (the real occupant of the P0-A babylon.scene-runtime/1 port)");
emit("");

nullEngineLegs();
contractFloorLegs();
await uiLegs();
await browserLegs();
blockedLegs();

emit("== END (zero fabricated numbers — every row above was measured in this run; every");
emit("   measurement that could not run is declared BLOCKED with its exact blocker) ==");

const outPath = join(HERE, "measurements-raw.txt");
writeFileSync(outPath, `${lines.join("\n")}\n`, "utf8");
console.log(`\nwritten: ${outPath}`);
