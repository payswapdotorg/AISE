/**
 * QA-003 — the LIVE browser proof (real Chromium against the REAL app and
 * the REAL API, over real HTTP, on a scratch data dir).
 *
 * The Lead's production sweep found the defects LIVE; this suite proves the
 * fixes against the production-like local serve (the same shape as the
 * deployed one: the real web bundle in a browser, the real backend API
 * serving /healthz, /readyz and /v1/** same-origin through a loopback
 * proxy, a scratch AISE_DATA_DIR, and the auth layer in demo-open mode so
 * the demo BOQ seed import — the Lead's own 8e1aa05f… — is inspectable,
 * exactly like the deployed journey):
 *
 *  - the LIVE FLOW proof (verification 3): import a small CSV through the
 *    REAL panel → the flow fires POST /v1/boq/imports then POST
 *    /v1/boq/imports/:id/normalization (the network log proves the order)
 *    → the outcome states the ensured normalization → the surface lands on
 *    the NEW import's VIEWABLE lens (recorded: exact import id + row
 *    count). A SECOND import keeps the selector truthful: both documents
 *    listed, the fresh one the NAMED selection, every row inspectable;
 *  - the D7 ERROR-PATH proof (verification 4): with the seed import
 *    inspectable, the chosen import's normalization view is DELETED from
 *    the scratch store (the serverless per-instance vanishing) → a reload
 *    makes the chosen import's lens answer 409 normalization_required →
 *    the imports table STAYS rendered with EVERY row
 *    (data-selector-state="ready", never the false loading), the failing
 *    import's typed error is surfaced per-import, and CLICKING the healthy
 *    seed import's Inspect loads its lens (the switch-back recovery path);
 *  - the EPHEMERALITY proof: with the loopback proxy carrying the
 *    serverless platform's own response marker (x-vercel-id — the deployed
 *    free-tier site's own self-identification, emulated here because the
 *    platform layer is outside this serve), the import success state
 *    states the honest limit (per-instance imports, may not survive a
 *    reload). On the durable local serve (no marker) NO caveat renders.
 *
 * Deterministic: scratch data dir per run, bounded waits everywhere, the
 * probe CSVs' import ids are content hashes computed in-test; browser
 * checks are NEVER silently skipped (a missing Chromium fails the suite
 * with the actionable install command).
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { build } from "esbuild";
import { chromium } from "playwright";
import type { Browser } from "playwright";
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "..", "..", "..", "..");
const WEB_SRC = join(ROOT, "apps", "web", "src");

/* ------------------------------------------------------------------ */
/* The probe documents (import ids are their content hashes)            */
/* ------------------------------------------------------------------ */

const SEED_IMPORT_ID = "8e1aa05f20c45ef2768e2e42b31547e5bf3cb4c77824e4fe1e13e0a8acc601ff";

const CSV_A =
  "Description,Unit,Qty,Rate (GHS),Amount (GHS)\n" +
  "Blockwork to external walls,m2,40,25,1000\n";

const CSV_B =
  "Description,Unit,Qty,Rate (GHS),Amount (GHS)\n" +
  "Plaster to new partitions,m2,80,15,1200\n" +
  "Painting to joinery,m2,30,9,270\n";

const CSV_C =
  "Description,Unit,Qty,Rate (GHS),Amount (GHS)\n" +
  "Vinyl floor tiling to floors,m2,60,45,2700\n";

/** sha256 hex of one document's bytes (the import identity — AISE-011). */
async function importIdOf(csv: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(csv));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/* ------------------------------------------------------------------ */
/* The production-like local serve                                      */
/* ------------------------------------------------------------------ */

const APP_HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>QA-003 live proof — the real app over the real API</title></head><body><main id="app"></main><script type="module" src="/main.js"></script></body></html>`;

let browser: Browser | null = null;
let webServer: ReturnType<typeof Bun.serve> | null = null;
let webPort = 0;
let bundleDir: string | null = null;
let scratchDir: string | null = null;
let apiProc: ReturnType<typeof Bun.spawn> | null = null;
let apiPort = 0;
/** When true the loopback proxy carries the serverless platform's marker. */
let emulateServerlessPlatform = false;
/** The real HTTP request log (the flow-order evidence). */
const apiCalls: string[] = [];

/** Resolve a usable Chromium executable (never silently skipped). */
function resolveChromium(): string {
  const preferred = chromium.executablePath();
  if (existsSync(preferred)) {
    return preferred;
  }
  // The sandbox carries a Playwright cache from a different playwright
  // version — any full (non-headless-shell) chromium build serves the proof.
  const cacheRoot = join(process.env.HOME ?? tmpdir(), ".cache", "ms-playwright");
  if (existsSync(cacheRoot)) {
    const candidates = readdirSync(cacheRoot)
      .filter((entry) => entry.startsWith("chromium-") && !entry.includes("headless"))
      .map((entry) => join(cacheRoot, entry, "chrome-linux64", "chrome"))
      .filter((candidate) => existsSync(candidate))
      .sort();
    const found = candidates.at(-1);
    if (found !== undefined) {
      return found;
    }
  }
  throw new Error(
    `Chromium is not installed for playwright (looked at '${preferred}')\n` +
      `  -> install it with: bunx playwright install chromium`,
  );
}

/** Forward one same-origin request to the REAL API subprocess. */
async function proxyToApi(request: Request): Promise<Response> {
  const url = new URL(request.url);
  apiCalls.push(`${request.method} ${url.pathname}${url.search}`);
  const body =
    request.method === "GET" || request.method === "HEAD"
      ? undefined
      : await request.arrayBuffer();
  const upstream = await fetch(`http://127.0.0.1:${apiPort}${url.pathname}${url.search}`, {
    method: request.method,
    headers: request.headers,
    ...(body === undefined ? {} : { body }),
  });
  // Relay the response verbatim — status, headers, EVERY set-cookie (the
  // session round-trip is the deployed journey's own shape).
  const headers = new Headers();
  upstream.headers.forEach((value, key) => {
    if (key !== "set-cookie") {
      headers.set(key, value);
    }
  });
  for (const cookie of upstream.headers.getSetCookie()) {
    headers.append("set-cookie", cookie);
  }
  if (emulateServerlessPlatform) {
    headers.set("x-vercel-id", "hkg1::iad1::qa003-loopback-emulation");
  }
  return new Response(await upstream.arrayBuffer(), {
    status: upstream.status,
    headers,
  });
}

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

/** Poll a predicate until true (bounded — real-process readiness waits). */
async function waitFor(
  check: () => boolean | Promise<boolean>,
  timeoutMs: number,
  label: string,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (await check()) {
      return;
    }
    if (Date.now() > deadline) {
      throw new Error(`waitFor: ${label} not satisfied within ${String(timeoutMs)}ms`);
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

/** Open the BOQ Lens surface (entering the demo session if the gate renders). */
async function openBoqLens(page: import("playwright").Page): Promise<void> {
  await page.goto(`http://127.0.0.1:${webPort}/#/projects/proj-riverside-refit/boq-lens`, {
    waitUntil: "load",
    timeout: 30_000,
  });
  // The app mounts asynchronously — wait for EITHER the auth gate or the
  // lens surface's selector before deciding which journey applies.
  await page.waitForSelector("#gate-principal, [data-selector-state]", { timeout: 30_000 });
  const gate = await page.$("#gate-principal");
  if (gate !== null) {
    await page.getByRole("button", { name: "Enter demo" }).click();
    await page.waitForSelector("[data-selector-state]", { timeout: 30_000 });
  }
  // The selector's table settles (an import is listed — the seed, or the
  // D7 failure state's still-ready table).
  await page.waitForSelector('[data-selector-state="ready"]', { timeout: 30_000 });
}

/** The normalizations directory of the scratch store (created by the API). */
function normalizationsDir(): string {
  if (scratchDir === null) {
    throw new Error("no scratch dir");
  }
  return join(scratchDir, "boq", "normalizations");
}

/** Delete ONE import's stored normalization view (the per-instance vanish). */
function deleteNormalizationView(importId: string): boolean {
  const dir = normalizationsDir();
  for (const file of readdirSync(dir)) {
    if (!file.endsWith(".json")) {
      continue;
    }
    const path = join(dir, file);
    try {
      const view = JSON.parse(readFileSync(path, "utf8")) as { importId?: string };
      if (view.importId === importId) {
        rmSync(path);
        return true;
      }
    } catch {
      // not a view we can identify — skip
    }
  }
  return false;
}

beforeAll(async () => {
  const executablePath = resolveChromium();

  // The scratch deployment: a fresh data dir + the REAL API as a subprocess
  // (the backend's own `bun run start` adapter — never imported, only
  // served), with the auth layer in demo-open mode so the demo BOQ seed
  // rides the boot bootstrap exactly like the deployed journey.
  scratchDir = mkdtempSync(join(tmpdir(), "qa003-scratch-"));
  const portProbe = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: () => new Response("port probe"),
  });
  const probePort = portProbe.port;
  if (probePort === undefined) {
    throw new Error("the port probe did not assign a port");
  }
  apiPort = probePort;
  portProbe.stop(true);
  apiProc = Bun.spawn({
    cmd: [process.execPath, "run", "src/main.ts"],
    cwd: join(ROOT, "backend", "api"),
    // A CURATED environment — never the test process's own env: the host
    // sandbox may carry a DATABASE_URL (or other Pg/R2/Redis groups) that
    // would silently select a different persistence mode than the proof's
    // scratch Fs deployment.
    env: {
      PATH: process.env.PATH ?? "",
      HOME: process.env.HOME ?? "",
      HOST: "127.0.0.1",
      PORT: String(apiPort),
      AISE_DATA_DIR: scratchDir,
      AISE_AUTH: "1",
      AISE_AUTH_MODE: "demo-open",
      AUTH_SECRET: "qa003-live-proof-secret",
      LOG_LEVEL: "warn",
    },
    stdout: "ignore",
    stderr: "ignore",
  });
  await waitFor(
    async () => {
      try {
        const response = await fetch(`http://127.0.0.1:${apiPort}/healthz`);
        return response.ok;
      } catch {
        return false;
      }
    },
    30_000,
    "the API subprocess /healthz",
  );
  // The demo BOQ seed's completion (the deterministic sync point): the
  // seed import appears in the list.
  await waitFor(
    async () => {
      try {
        const response = await fetch(`http://127.0.0.1:${apiPort}/v1/boq/imports`);
        return (await response.text()).includes(SEED_IMPORT_ID);
      } catch {
        return false;
      }
    },
    30_000,
    "the demo BOQ seed import",
  );

  // The REAL web app, esbuild-bundled once (a mount check's shape, not a
  // bundle gate) and served same-origin beside the API proxy.
  bundleDir = mkdtempSync(join(tmpdir(), "qa003-bundles-"));
  await build({
    entryPoints: [join(WEB_SRC, "main.tsx")],
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

  webServer = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: (request): Response | Promise<Response> => {
      const path = new URL(request.url).pathname;
      if (path === "/") {
        return new Response(APP_HTML, { headers: { "content-type": "text/html" } });
      }
      if (path === "/healthz" || path === "/readyz" || path.startsWith("/v1/")) {
        return proxyToApi(request);
      }
      if (path.endsWith(".js")) {
        return serveBundleChunk(path);
      }
      return new Response("not found", { status: 404 });
    },
  });
  const assignedWebPort = webServer.port;
  if (assignedWebPort === undefined) {
    throw new Error("the web server did not assign a port");
  }
  webPort = assignedWebPort;

  browser = await chromium.launch({
    headless: true,
    executablePath,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
}, 240_000);

afterAll(() => {
  if (browser !== null) {
    void browser.close();
  }
  if (webServer !== null) {
    webServer.stop(true);
  }
  if (apiProc !== null) {
    apiProc.kill();
  }
  if (bundleDir !== null) {
    rmSync(bundleDir, { recursive: true, force: true });
  }
  if (scratchDir !== null) {
    rmSync(scratchDir, { recursive: true, force: true });
  }
});

/* ------------------------------------------------------------------ */
/* The live proofs                                                      */
/* ------------------------------------------------------------------ */

describe("QA-003 live proof — the BOQ import→inspect flow over the real API", () => {
  test(
    "verification 3: import → normalization runs → the NEW import's lens renders; a second import keeps the selector truthful",
    async () => {
      expect(browser).not.toBeNull();
      const importA = await importIdOf(CSV_A);
      const importB = await importIdOf(CSV_B);
      // The probe documents sort around the seed exactly as the proof needs:
      // A first (the reload auto-choice for the D7 proof), the seed last.
      expect(importA < SEED_IMPORT_ID).toBe(true);
      expect(importB < SEED_IMPORT_ID).toBe(true);

      const context = await browser!.newContext({ viewport: { width: 1280, height: 900 } });
      const page = await context.newPage();
      const pageErrors: string[] = [];
      page.on("pageerror", (error: Error) => {
        pageErrors.push(error.message);
      });
      await openBoqLens(page);

      // The healthy SEED import is inspectable before anything else.
      await page.waitForSelector(`[data-inspect-import="${SEED_IMPORT_ID}"]`, { timeout: 30_000 });
      await page.waitForSelector(`[data-selector-selection="${SEED_IMPORT_ID}"]`, {
        timeout: 30_000,
      });
      const seedLens = await page.textContent("#boq-lens-open-import");
      expect(seedLens ?? "").toContain(SEED_IMPORT_ID);

      // THE FLOW: import the small CSV through the real panel.
      apiCalls.length = 0;
      await page.setInputFiles("#boq-import-file", {
        name: "probe-a.csv",
        mimeType: "text/csv",
        buffer: Buffer.from(CSV_A, "utf8"),
      });
      await page.waitForSelector('[data-selected-file="true"]', { timeout: 10_000 });
      await page.click('[data-submit-state="ready"]');
      await page.waitForSelector('[data-outcome="imported"]', { timeout: 30_000 });

      // The normalization step ran BEFORE anything else fetched the new
      // import's lens — the exact network order over real HTTP (robust to
      // unrelated surface fetches interleaving: the RELATIVE order of the
      // three flow calls is the load-bearing wire).
      const importIndex = apiCalls.indexOf("POST /v1/boq/imports?format=csv");
      const normalizationIndex = apiCalls.indexOf(
        `POST /v1/boq/imports/${importA}/normalization`,
      );
      const lensIndex = apiCalls.indexOf(`GET /v1/boq/imports/${importA}/lens`);
      expect(importIndex).toBeGreaterThanOrEqual(0);
      expect(normalizationIndex).toBe(importIndex + 1);
      expect(lensIndex).toBeGreaterThan(normalizationIndex);

      // The outcome states the ensured normalization; on the DURABLE local
      // serve NO ephemerality caveat renders (no platform marker observed).
      const outcome = await page.textContent('[data-outcome="imported"]');
      expect(outcome ?? "").toContain("Source BOQ stored server-side.");
      expect(outcome ?? "").toContain(`Import ${importA}`);
      expect(await page.$('[data-normalization="ensured"]')).not.toBeNull();
      expect(await page.$('[data-ephemerality="serverless"]')).toBeNull();

      // The post-import state lands on the NEW import's VIEWABLE lens: the
      // flow selected the fresh document and its lens renders (no 409).
      await page.waitForSelector(`[data-selector-selection="${importA}"]`, { timeout: 30_000 });
      await page.waitForSelector("#boq-lens-open-import", { timeout: 30_000 });
      const lensA = await page.textContent("#boq-lens-open-import");
      expect(lensA ?? "").toContain(importA);
      const rowCount = await page.evaluate(() => {
        const first = document.querySelector("#boq-lens-open-import .stat-value");
        return first?.textContent ?? "0";
      });

      // A SECOND import: both documents listed, the fresh one the NAMED
      // selection, every row inspectable — the selector stays truthful.
      await page.setInputFiles("#boq-import-file", {
        name: "probe-b.csv",
        mimeType: "text/csv",
        buffer: Buffer.from(CSV_B, "utf8"),
      });
      await page.waitForSelector('[data-selected-file="true"]', { timeout: 10_000 });
      await page.click('[data-submit-state="ready"]');
      await page.waitForSelector(`[data-selector-selection="${importB}"]`, { timeout: 30_000 });
      await page.waitForSelector(`[data-inspect-import="${importA}"]`, { timeout: 30_000 });
      await page.waitForSelector(`[data-inspect-import="${SEED_IMPORT_ID}"]`, { timeout: 30_000 });
      await page.waitForSelector(`[data-inspect-import="${importB}"]`, { timeout: 30_000 });
      const lensB = await page.textContent("#boq-lens-open-import");
      expect(lensB ?? "").toContain(importB);
      const selectorRows = await page.evaluate(() => {
        return [...document.querySelectorAll("[data-inspect-import]")].map(
          (node) => node.getAttribute("data-inspect-import") ?? "",
        );
      });
      expect(selectorRows.sort()).toEqual([importA, SEED_IMPORT_ID, importB].sort());

      // Zero page errors across the whole session.
      expect(pageErrors).toEqual([]);
      // eslint-disable-next-line no-console -- the live proof's recorded evidence line (the work order's verification asks to record the exact import ids + counts)
      console.log(
        `[QA-003 live flow proof] import A ${importA} (lens item rows: ${rowCount}) · ` +
          `import B ${importB} · seed ${SEED_IMPORT_ID} · selector rows: ${selectorRows.join(", ")}`,
      );
      await context.close();
    },
    120_000,
  );

  test(
    "verification 4 (D7): the chosen import's lens fails → the table STAYS with every row → the switch-back loads the seed's lens",
    async () => {
      expect(browser).not.toBeNull();
      const importA = await importIdOf(CSV_A);
      const importB = await importIdOf(CSV_B);

      const context = await browser!.newContext({ viewport: { width: 1280, height: 900 } });
      const page = await context.newPage();
      const pageErrors: string[] = [];
      page.on("pageerror", (error: Error) => {
        pageErrors.push(error.message);
      });
      await openBoqLens(page);

      // The chosen import after the reload is the FIRST in the service's
      // own order — the probe document A — and its lens renders normally.
      await page.waitForSelector(`[data-selector-selection="${importA}"]`, { timeout: 30_000 });
      const lensBefore = await page.textContent("#boq-lens-open-import");
      expect(lensBefore ?? "").toContain(importA);

      // The per-instance vanishing: DELETE the chosen import's stored
      // normalization view from the scratch store (the Fs store reads per
      // request, so the next lens fetch answers the typed 409).
      expect(deleteNormalizationView(importA)).toBe(true);

      // Reload: the same auto-choice repeats — but now the lens fetch fails
      // (409 normalization_required). The surface MUST stay usable.
      await page.reload({ waitUntil: "load", timeout: 30_000 });
      await page.waitForSelector(`[data-lens-failure="${importA}"]`, { timeout: 30_000 });

      // (b) The imports table STAYS rendered with EVERY row — the ready
      // state, NEVER the false loading branch for a list that loaded.
      const selectorState = await page.getAttribute(
        '[data-selector-state]',
        "data-selector-state",
      );
      expect(selectorState).toBe("ready");
      const rows = await page.evaluate(() => {
        return [...document.querySelectorAll("[data-inspect-import]")].map(
          (node) => node.getAttribute("data-inspect-import") ?? "",
        );
      });
      expect(rows.sort()).toEqual([importA, SEED_IMPORT_ID, importB].sort());

      // (c) The lens area names WHICH import failed + the typed reason, and
      // the per-import "Try again" targets THAT import.
      const failure = await page.textContent(`[data-lens-failure="${importA}"]`);
      expect(failure ?? "").toContain(importA);
      expect(failure ?? "").toContain("normalization_required");
      expect(await page.getAttribute('[data-retry-import]', "data-retry-import")).toBe(importA);

      // (d) The switch-back path: clicking the healthy SEED import's
      // Inspect loads ITS lens (the recovery story).
      await page.click(`[data-inspect-import="${SEED_IMPORT_ID}"]`);
      await page.waitForSelector(`[data-selector-selection="${SEED_IMPORT_ID}"]`, {
        timeout: 30_000,
      });
      await page.waitForSelector("#boq-lens-open-import", { timeout: 30_000 });
      const seedLens = await page.textContent("#boq-lens-open-import");
      expect(seedLens ?? "").toContain(SEED_IMPORT_ID);
      expect(await page.$(`[data-lens-failure="${importA}"]`)).toBeNull();

      // Zero page errors across the whole session.
      expect(pageErrors).toEqual([]);
      // eslint-disable-next-line no-console -- the live proof's recorded evidence line (the D7 sequence)
      console.log(
        `[QA-003 D7 error-path proof] chosen ${importA} lens 409 normalization_required → ` +
          `table ready with ${rows.length} rows → switch-back to ${SEED_IMPORT_ID} loaded its lens`,
      );
      await context.close();
    },
    120_000,
  );

  test(
    "the ephemerality honesty: the platform marker (x-vercel-id) makes the success state state the per-instance limit; the durable serve never does",
    async () => {
      expect(browser).not.toBeNull();
      const importC = await importIdOf(CSV_C);

      const context = await browser!.newContext({ viewport: { width: 1280, height: 900 } });
      const page = await context.newPage();
      const pageErrors: string[] = [];
      page.on("pageerror", (error: Error) => {
        pageErrors.push(error.message);
      });

      // First: the DURABLE serve (no platform marker) — import CSV-C and
      // assert NO caveat renders (the durable-deployment no-scare-mongering
      // contract, live).
      await openBoqLens(page);
      await page.setInputFiles("#boq-import-file", {
        name: "probe-c.csv",
        mimeType: "text/csv",
        buffer: Buffer.from(CSV_C, "utf8"),
      });
      await page.waitForSelector('[data-selected-file="true"]', { timeout: 10_000 });
      await page.click('[data-submit-state="ready"]');
      await page.waitForSelector('[data-outcome="imported"]', { timeout: 30_000 });
      expect(await page.$('[data-normalization="ensured"]')).not.toBeNull();
      expect(await page.$('[data-ephemerality="serverless"]')).toBeNull();

      // Then: the SAME serve answering with the serverless platform's own
      // response marker (the loopback emulation of the deployed site's
      // x-vercel-id — the platform layer is outside this serve, so the
      // marker is added at the proxy). A fresh import's success state must
      // state the honest limit.
      emulateServerlessPlatform = true;
      try {
        const csvD = `${CSV_C}Door frames hardwood,each,4,320,1280\n`;
        await page.setInputFiles("#boq-import-file", {
          name: "probe-c2.csv",
          mimeType: "text/csv",
          buffer: Buffer.from(csvD, "utf8"),
        });
        await page.waitForSelector('[data-selected-file="true"]', { timeout: 10_000 });
        await page.click('[data-submit-state="ready"]');
        await page.waitForSelector('[data-outcome="imported"]', { timeout: 30_000 });
        const caveat = await page.textContent('[data-ephemerality="serverless"]');
        expect(caveat ?? "").toContain("may not survive a reload");
        expect(caveat ?? "").toContain("per-instance");
      } finally {
        emulateServerlessPlatform = false;
      }

      // Zero page errors across the whole session.
      expect(pageErrors).toEqual([]);
      // eslint-disable-next-line no-console -- the live proof's recorded evidence line
      console.log(
        `[QA-003 ephemerality proof] durable serve: no caveat · platform-marker serve: the per-instance limit renders (import ${importC} + a second probe)`,
      );
      await context.close();
    },
    120_000,
  );
});
