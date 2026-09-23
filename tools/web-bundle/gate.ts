/**
 * PROD-030 — the browser-bundle gate: build, scan and real-Chromium mount
 * check over the apps/web production bundle.
 *
 * This is the gate that would have caught the shared-contract barrel defect
 * (the PROD-026-escalated module-evaluation crash documented in
 * docs/productization-evidence/PROD-012-R/repro-harness.ts Phase 0b):
 * both shared-contract barrels re-exported a Node-only fixtures loader whose
 * module scope runs `join(import.meta.dir, "..")` from `node:path`; the
 * bundler externalizes the Node builtins for the browser (`{}`), so the
 * dead module-init call threw `TypeError: (0, X.join) is not a function`
 * before the app ever mounted — while `bun run build` succeeded and
 * `bun run verify` never loaded the built bundle in a browser, which is how
 * the defect shipped unnoticed.
 *
 * PROD-031 extends the same gate over the SOLUTION surface's browser
 * execution path (the selection ladder's second rung):
 *
 *   - the crypto markers (CRYPTO_MARKERS): every built asset EXCEPT the
 *     legacy local-engine mount chunk must be free of node:crypto
 *     externalization — proving the browser mount's graph is crypto-free
 *     (§4.3 of the PROD-031 work order);
 *   - the solution-surface mount check: a real Chromium against a local
 *     same-origin deployment (the built bundle served statically + a
 *     session-authenticated local backend) opens the demo project's
 *     solution surface through the honest "Enter demo" gate and asserts
 *     the WORKSPACE mounts (not the honest engine-unavailable panel).
 *
 * Phases, each failing EXPLICITLY (never silently skipped):
 *
 *   1. build   — spawns the apps/web production build (`bun run build`
 *                inside apps/web) and proves its artifacts exist;
 *   2. scan    — scans every built asset under apps/web/dist/assets/*.js
 *                plus the built index.html for the Node-builtin
 *                externalization markers (MARKERS below — each documented);
 *   3. mount   — preflights the Chromium executable (the actionable
 *                `bunx playwright install chromium` command on absence —
 *                mirroring tools/deployed/browser.ts), launches ONE
 *                Chromium (`--no-sandbox` + `--disable-dev-shm-usage`),
 *                serves apps/web/dist from an ephemeral local static server
 *                (no backend — the mount assertion needs none), loads `/`
 *                and asserts the app MOUNTS (the shell root is non-empty /
 *                the auth-gate heading `h2#gate-title` becomes visible)
 *                with ZERO `pageerror` events. The browser closes no
 *                matter what (guaranteed cleanup).
 *
 * Deterministic: local build + loopback server + local Chromium; bounded
 * waits everywhere; no external network, no clock, no randomness in the
 * assertions.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { chromium } from "playwright";
import type { Browser } from "playwright";

const ROOT = resolve(import.meta.dir, "..", "..");
const WEB_APP_DIR = join(ROOT, "apps", "web");
const WEB_DIST_DIR = join(WEB_APP_DIR, "dist");
const WEB_ASSETS_DIR = join(WEB_DIST_DIR, "assets");

/** Every budget is bounded (never an unbounded wait). */
const BUDGETS = {
  /** The vite production build: seconds to tens of seconds. */
  buildMs: 180_000,
  /** Page load (module evaluation happens before `load`). */
  pageLoadMs: 30_000,
  /** The bounded wait for the React app to mount its shell. */
  mountMs: 15_000,
  /** The settle window after mount for trailing async page errors. */
  settleMs: 750,
} as const;

/* ------------------------------------------------------------------ */
/* Phase 1 — the production build                                      */
/* ------------------------------------------------------------------ */

let buildPromise: Promise<void> | null = null;

/**
 * Build the apps/web production bundle ONCE per test process (memoized):
 * the gate owns the full lifecycle — cwd apps/web, inherited env, bounded
 * by BUDGETS.buildMs — and fails explicitly with the build output tail.
 */
export function buildWebAppOnce(): Promise<void> {
  buildPromise ??= runBuild();
  return buildPromise;
}

async function runBuild(): Promise<void> {
  const proc = Bun.spawnSync({
    cmd: [process.execPath, "run", "build"],
    cwd: WEB_APP_DIR,
    stdout: "pipe",
    stderr: "pipe",
    stdin: "ignore",
    timeout: BUDGETS.buildMs,
  });
  const code = proc.exitCode;
  if (code !== 0) {
    const stdout = proc.stdout?.toString() ?? "";
    const stderr = proc.stderr?.toString() ?? "";
    const tail = `${stdout}\n${stderr}`.trim().split("\n").slice(-20).join("\n");
    throw new Error(
      `apps/web production build failed (exit code ${code ?? "SIGKILL/timeout"}) — bun run build inside apps/web\n` +
        `  build output tail:\n${tail}`,
    );
  }
  const assets = builtAssets();
  if (!existsSync(join(WEB_DIST_DIR, "index.html")) || assets.length === 0) {
    throw new Error(
      `apps/web build succeeded but its artifacts are missing — ` +
        `${join(WEB_DIST_DIR, "index.html")} and/or built assets under ${WEB_ASSETS_DIR}`,
    );
  }
}

/** The built JS assets under apps/web/dist/assets (sorted, deterministic). */
export function builtAssets(): string[] {
  if (!existsSync(WEB_ASSETS_DIR)) {
    return [];
  }
  return readdirSync(WEB_ASSETS_DIR)
    .filter((name) => name.endsWith(".js"))
    .sort();
}

/* ------------------------------------------------------------------ */
/* Phase 2 — the Node-builtin externalization scan                     */
/* ------------------------------------------------------------------ */

/** One scan marker: an identifier, a pattern and the honest reason it exists. */
export interface MarkerSpec {
  readonly id: string;
  readonly pattern: RegExp;
  readonly description: string;
}

/**
 * The Node-builtin import/externalization markers. Each is chosen to be
 * robust under minification (documented per marker in
 * docs/productization-evidence/PROD-030/bundle-audit.md):
 *
 *  - M1 `node:fs`/`node:path` import SPECIFIER text — string literals
 *    survive minification; catches any build pipeline that preserves
 *    external import specifiers (the current rolldown-vite rewrites them
 *    to the stub of M2/M3, which is why those carry the load here);
 *  - M2 the vite browser-external STUB feeding an fs/path-style call —
 *    the classic `__vite-browser-external` stub name, or rolldown's
 *    `(0, X.fn)(...)` namespace-call interop shape for the three
 *    functions the fixtures loaders use (join / readdirSync /
 *    readFileSync). `import.meta.dir` is syntax (never renamed) and the
 *    `(0, X.fn)(` interop shape is the bundler's, not app code's;
 *  - M3 the DEAD MODULE-INIT join the PROD-012-R harness documented —
 *    `(0, X.join)(import.meta.dir` — the exact crash class: a module-scope
 *    `join` on the externalized `node:path` stub evaluated before the app
 *    mounts.
 *
 * A marker that only matches this exact defect is acceptable — the point
 * is this defect class can never ship silently again.
 */
export const MARKERS: readonly MarkerSpec[] = [
  {
    id: "M1:node-builtin-import-specifier",
    pattern: /node:(?:fs|path)\b/,
    description:
      "a literal node:fs/node:path import specifier in a built browser asset",
  },
  {
    id: "M2:browser-external-stub-feeding-fs-path-call",
    pattern:
      /__vite-browser-external|\(0,[A-Za-z_$][\w$]*\.(?:join|readdirSync|readFileSync)\)\(/,
    description:
      "the vite browser-external stub (classic __vite-browser-external, or rolldown's " +
      "(0, X.fn)(...) interop call on the externalized-builtin namespace) feeding a " +
      "join/readdirSync/readFileSync-style call",
  },
  {
    id: "M3:dead-module-init-join-on-import-meta-dir",
    pattern: /\(0,[A-Za-z_$][\w$]*\.join\)\(import\.meta\.dir\b/,
    description:
      "the PROD-012-R-documented dead module-init pattern: a module-scope " +
      "(0, X.join)(import.meta.dir, ...) call on the externalized node:path stub",
  },
];

/**
 * PROD-031 — the CRYPTO externalization markers (the same defect class as
 * MARKERS, extended to the engine's `node:crypto` identity derivations).
 * The whole tree is NOT scanned with these: the SELECTION LADDER's first
 * rung (the legacy local-engine mount chunk, `solution-mount-*.js`) carries
 * the createHash stub BY DESIGN — in a plain browser its journey promise
 * rejects (the stub throws at call time), the surface catches it honestly
 * and falls to the second rung (the crypto-free browser mount). Every
 * OTHER asset — the browser mount's whole graph, wherever the bundler
 * splits it — must be free of BOTH marker lists.
 */
export const CRYPTO_MARKERS: readonly MarkerSpec[] = [
  {
    id: "M4:node-crypto-import-specifier",
    pattern: /(?:from|import)\s*\(?\s*["']node:crypto["']/,
    description:
      "a literal node:crypto import specifier (static or dynamic) in a built " +
      "browser asset — a crypto-dependent module reached the browser graph as " +
      "an EXTERNAL import the browser cannot resolve",
  },
  {
    id: "M5:browser-external-stub-feeding-createHash-call",
    pattern: /\(0,[A-Za-z_$][\w$]*\.createHash\)\(/,
    description:
      "rolldown's browser-external stub feeding a createHash(...) call — the " +
      "inline `((e,t)=>{t.exports={}})()` stub shape the bundler emits for " +
      "externalized node:crypto, whose namespace call throws at CALL time " +
      "(how the legacy engine mount's journey honestly rejects in a plain " +
      "browser; the browser mount's graph must carry none of it)",
  },
];

/** One scan finding (asset + marker + excerpt), deterministic in shape. */
export interface ScanFinding {
  readonly asset: string;
  readonly marker: string;
  readonly excerpt: string;
}

/**
 * Scan every built asset (apps/web/dist/assets/*.js plus the built
 * index.html) for the Node-builtin externalization markers. Returns the
 * findings (an empty array is the PASS); never throws on a marker hit —
 * the caller asserts emptiness so bun prints the full finding list.
 */
export function scanDistForMarkers(): ScanFinding[] {
  return scanFilesForMarkers(MARKERS, distAssetFiles());
}

/** The built files the scans cover (index.html + every built JS asset). */
function distAssetFiles(): string[] {
  return [
    join(WEB_DIST_DIR, "index.html"),
    ...builtAssets().map((name) => join(WEB_ASSETS_DIR, name)),
  ];
}

/** Scan the given files for the given markers (findings; [] is a PASS). */
function scanFilesForMarkers(markers: readonly MarkerSpec[], files: string[]): ScanFinding[] {
  const findings: ScanFinding[] = [];
  for (const file of files) {
    if (!existsSync(file)) {
      continue;
    }
    const contents = readFileSync(file, "utf8");
    for (const marker of markers) {
      const match = marker.pattern.exec(contents);
      if (match === null) {
        continue;
      }
      const at = match.index;
      findings.push({
        asset: file.slice(ROOT.length + 1),
        marker: marker.id,
        excerpt: contents
          .slice(Math.max(0, at - 60), Math.min(contents.length, at + 100))
          .replace(/\s+/g, " ")
          .trim(),
      });
    }
  }
  return findings;
}

/* ------------------------------------------------------------------ */
/* Phase 2b — PROD-031: the browser mount's crypto-freeness scan        */
/* ------------------------------------------------------------------ */

/**
 * The legacy local-engine mount chunk name shape (`solution-mount-*.js` —
 * the dynamic-import chunk rolldown names after `solution-mount.tsx`, the
 * selection ladder's FIRST rung). This chunk carries the createHash
 * browser-external stub BY DESIGN: in a plain browser its journey promise
 * rejects (the stub throws at call time), the surface catches the
 * rejection honestly and falls to the second rung. It is the ONLY built
 * asset the crypto scan excuses.
 */
export const LEGACY_ENGINE_MOUNT_CHUNK = /^solution-mount(?:-[A-Za-z0-9_-]+)?\.js$/;

/**
 * The browser mount's chunk sentinel: the DOM landmark string the browser
 * mount entry renders (`data-browser-mount="solution-browser-mount"` on
 * its root card). String literals survive minification, so every built
 * asset containing it is (part of) the browser mount's chunk — the scan
 * asserts at least one exists and none carries a marker.
 */
export const BROWSER_MOUNT_SENTINEL = "solution-browser-mount";

/** The built assets that are legacy local-engine mount chunks. */
export function legacyEngineMountAssets(): string[] {
  return builtAssets().filter((name) => LEGACY_ENGINE_MOUNT_CHUNK.test(name));
}

/** The built assets that contain the browser mount sentinel. */
export function browserMountAssets(): string[] {
  return builtAssets().filter((name) => {
    const file = join(WEB_ASSETS_DIR, name);
    if (!existsSync(file)) {
      return false;
    }
    return readFileSync(file, "utf8").includes(BROWSER_MOUNT_SENTINEL);
  });
}

/**
 * PROD-031 — the crypto-freeness scan: every built asset EXCEPT the legacy
 * local-engine mount chunks must contain NO crypto externalization markers
 * (and no fs/path markers either — the same excuse set covers only the
 * documented legacy rung). The browser mount's whole graph — wherever the
 * bundler splits it — is therefore proven crypto-free. Findings are
 * returned, never thrown; the caller asserts emptiness.
 */
export function scanBrowserGraphForCryptoMarkers(): ScanFinding[] {
  const legacy = new Set(legacyEngineMountAssets().map((name) => join(WEB_ASSETS_DIR, name)));
  const scanned = distAssetFiles().filter((file) => !legacy.has(file));
  return scanFilesForMarkers([...MARKERS, ...CRYPTO_MARKERS], scanned);
}

/* ------------------------------------------------------------------ */
/* Phase 3 — the real Chromium mount check                             */
/* ------------------------------------------------------------------ */

/**
 * Preflight: prove the Chromium binary exists (mirrors
 * tools/deployed/browser.ts — browser checks are NEVER silently skipped).
 * Returns the executable path on success; throws with the actionable
 * install command otherwise.
 */
export function chromiumExecutable(): string {
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
  return executablePath;
}

/** The mount check's observed shell facts (all the assertion evidence). */
export interface MountReport {
  /** True when the shell root mounted (`#app` non-empty with the app chrome). */
  readonly mounted: boolean;
  /** The auth-gate heading text, when the gate rendered (authed deployments). */
  readonly gateTitle: string | null;
  /** The shell header text (the app chrome that mounts first), when present. */
  readonly headerText: string | null;
  /** The in-`#app` h2 headings (gate title on authed deployments; the routed surface heading otherwise). */
  readonly contentHeadings: string[];
  /** Every pageerror event message, in order (must be ZERO). */
  readonly pageErrors: string[];
}

/**
 * The page globals the in-page evaluate callback touches, typed
 * STRUCTURALLY (the tools/ tsconfig deliberately compiles without the DOM
 * lib — the same discipline as tools/deployed/checks.ts: the browser
 * callback reaches the page's globals through `globalThis` narrowed to
 * this shape, the ONLY page globals the mount check uses).
 */
interface MountPageGlobal {
  readonly document: {
    readonly getElementById: (elementId: string) => { readonly childElementCount: number } | null;
    readonly querySelector: (selector: string) => { readonly textContent: string | null } | null;
    readonly querySelectorAll: (selector: string) => readonly { readonly textContent: string | null }[];
  };
}

/**
 * Serve apps/web/dist from an ephemeral loopback static server and mount
 * the built app in ONE real Chromium. No backend is served: the app's
 * same-origin API probe fails honestly, so the shell renders its demo
 * dataset (the documented behavior — never a blank page). Asserts are the
 * CALLER's job; this returns the full observation for the evidence lines.
 * The browser and the server are closed no matter what.
 */
export async function mountBuiltAppInChromium(): Promise<MountReport> {
  chromiumExecutable();
  const browser: Browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: (request): Response => serveStatic(request),
  });
  const pageErrors: string[] = [];
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();
    page.on("pageerror", (error: Error) => {
      pageErrors.push(error.message);
    });
    await page.goto(`http://127.0.0.1:${server.port}/`, {
      waitUntil: "load",
      timeout: BUDGETS.pageLoadMs,
    });
    // The bounded mount wait: the shell root (`#app`) becomes non-empty
    // with the app chrome (`div.app`) once React mounts. A timeout is a
    // FAILURE (reported below with the captured page errors), never a skip.
    let mounted = true;
    try {
      await page.waitForSelector("#app .app", { timeout: BUDGETS.mountMs });
    } catch {
      mounted = false;
    }
    // The settle window: trailing async page errors (module-init throwals
    // land immediately, but keep the window bounded and small).
    await page.waitForTimeout(BUDGETS.settleMs);
    const shell = await page.evaluate(() => {
      const pageGlobal = globalThis as unknown as MountPageGlobal;
      const document = pageGlobal.document;
      const app = document.getElementById("app");
      return {
        appChildCount: app?.childElementCount ?? 0,
        gateTitle: document.querySelector("h2#gate-title")?.textContent ?? null,
        headerText: document.querySelector("header.app-header")?.textContent ?? null,
        contentHeadings: Array.from(document.querySelectorAll("#app h2"))
          .map((heading) => heading.textContent ?? "")
          .slice(0, 5),
      };
    });
    await context.close();
    return {
      mounted: mounted && shell.appChildCount > 0,
      gateTitle: shell.gateTitle,
      headerText: shell.headerText,
      contentHeadings: shell.contentHeadings,
      pageErrors,
    };
  } finally {
    await browser.close();
    server.stop(true);
  }
}

/** The minimal static file server over apps/web/dist (loopback only). */
function serveStatic(request: Request): Response {
  const url = new URL(request.url);
  const path = url.pathname === "/" ? "/index.html" : url.pathname;
  const relative = path.replace(/^\/+/, "");
  if (relative.includes("..") || relative.length === 0) {
    return new Response("not found", { status: 404 });
  }
  const file = join(WEB_DIST_DIR, relative);
  if (!existsSync(file)) {
    // Unknown paths (e.g. the app's /healthz probe) 404 honestly — the
    // app's API mode resolves to "unavailable" and the demo shell renders.
    return new Response("not found", { status: 404 });
  }
  const type = contentTypeOf(extname(file));
  return new Response(readFileSync(file), {
    status: 200,
    headers: { "content-type": type },
  });
}

/** The content types the built app's assets need (module scripts require a JavaScript MIME). */
function contentTypeOf(extension: string): string {
  switch (extension) {
    case ".html":
      return "text/html; charset=utf-8";
    case ".js":
    case ".mjs":
      return "text/javascript; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".svg":
      return "image/svg+xml";
    case ".json":
      return "application/json; charset=utf-8";
    default:
      return "application/octet-stream";
  }
}

/** Render a mount report as the evidence lines for failure output. */
export function describeMountReport(report: MountReport): string {
  const lines = [
    `mounted: ${report.mounted}`,
    `gate title (h2#gate-title): ${report.gateTitle ?? "null"}`,
    `shell header: ${report.headerText === null ? "null" : `"${report.headerText.slice(0, 80)}"`}`,
    `content headings: ${report.contentHeadings.length === 0 ? "none" : report.contentHeadings.map((h) => `"${h}"`).join(", ")}`,
    `pageerror events: ${report.pageErrors.length}`,
  ];
  for (const [index, message] of report.pageErrors.entries()) {
    lines.push(`  [${index + 1}] ${message}`);
  }
  return lines.join("\n");
}

/* ------------------------------------------------------------------ */
/* Phase 4 — PROD-031: the local same-origin deployment stack           */
/* ------------------------------------------------------------------ */

/**
 * The local same-origin deployment stack: the built web bundle served
 * statically from ONE loopback origin that ALSO carries a session-
 * authenticated local backend (`bun run start` in backend/api — the same
 * runtime entry the deployment serves) behind its `/healthz`, `/readyz`
 * and `/v1/**` paths. This is the smallest honest equivalent of the
 * deployed product shape: the browser talks to the backend same-origin
 * only (the PROD-001 contract), the auth gate is live in demo-open mode
 * (the "Enter demo" path), and the solution routes are mounted in the
 * runtime entry.
 *
 * Everything is loopback + ephemeral; the backend child and the proxy are
 * torn down no matter what (stop() is idempotent).
 */
export interface LocalDeploymentStack {
  /** The loopback origin the BROWSER talks to (static + API same-origin). */
  readonly origin: string;
  /** Stops the proxy and kills the backend child (idempotent). */
  readonly stop: () => Promise<void>;
}

/** One free loopback port (bind-and-release — the honest probe). */
function freePort(): number {
  const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response("noop") });
  const port = server.port;
  server.stop(true);
  return port;
}

/**
 * Boot the local deployment stack: spawn the backend API (the local
 * adapter, `bun run start` in backend/api) on an ephemeral port under a
 * FRESH scratch data dir with the demo-open auth mode, wait for its
 * /healthz, then serve apps/web/dist from a same-origin loopback proxy
 * that forwards /healthz, /readyz and /v1/** to it. Deterministic env
 * (fixed test secret); bounded waits; guaranteed teardown.
 */
export async function startLocalDeploymentStack(options: {
  /** The fixed test AUTH_SECRET (never a real credential). */
  readonly authSecret: string;
  /** Bounded wait for the backend /healthz (default 30s). */
  readonly healthTimeoutMs?: number;
}): Promise<LocalDeploymentStack> {
  const backendPort = freePort();
  const dataDir = join(ROOT, "data", `web-bundle-gate-backend-${process.pid}-${backendPort}`);
  // A clean environment: DATABASE_URL is deliberately UNSET (unset → the
  // documented local-FS mode — the demo stack's own rule; an inherited
  // database URL would make the gate need a live Postgres, which a bundle
  // gate must never require).
  const env: Record<string, string> = { ...process.env };
  delete env.DATABASE_URL;
  const backend = Bun.spawn({
    cmd: [process.execPath, "run", "start"],
    cwd: join(ROOT, "backend", "api"),
    env: {
      ...env,
      HOST: "127.0.0.1",
      PORT: String(backendPort),
      AISE_DATA_DIR: dataDir,
      LOG_LEVEL: "warn",
      AISE_AUTH: "1",
      AISE_AUTH_MODE: "demo-open",
      AUTH_SECRET: options.authSecret,
    },
    stdout: "pipe",
    stderr: "pipe",
    stdin: "ignore",
  });
  const backendOrigin = `http://127.0.0.1:${backendPort}`;
  const deadline = Date.now() + (options.healthTimeoutMs ?? 30_000);
  let healthy = false;
  while (Date.now() < deadline) {
    if (backend.exitCode !== null) {
      const stderr = await new Response(backend.stderr).text();
      throw new Error(
        `web-bundle gate: the local backend exited (code ${backend.exitCode}) before becoming healthy\n` +
          `  backend stderr tail:\n${stderr.trim().split("\n").slice(-10).join("\n")}`,
      );
    }
    try {
      const response = await fetch(`${backendOrigin}/healthz`);
      if (response.ok) {
        healthy = true;
        break;
      }
    } catch {
      // not listening yet — keep waiting within the budget
    }
    await Bun.sleep(150);
  }
  if (!healthy) {
    backend.kill();
    throw new Error(
      `web-bundle gate: the local backend did not answer /healthz within ${options.healthTimeoutMs ?? 30_000}ms`,
    );
  }
  const proxy = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: (request): Response => proxySameOrigin(request, backendOrigin),
  });
  const origin = `http://127.0.0.1:${proxy.port}`;
  const stop = async (): Promise<void> => {
    proxy.stop(true);
    backend.kill();
    await backend.exited;
  };
  return { origin, stop };
}

/**
 * The same-origin proxy: static files from apps/web/dist; /healthz,
 * /readyz and /v1/** forwarded to the backend (method, headers and body
 * verbatim; set-cookie passes through so the demo session rides the
 * browser's cookie jar).
 */
function proxySameOrigin(request: Request, backendOrigin: string): Response {
  const url = new URL(request.url);
  if (url.pathname === "/healthz" || url.pathname === "/readyz" || url.pathname.startsWith("/v1/")) {
    const forwarded = new Request(`${backendOrigin}${url.pathname}${url.search}`, {
      method: request.method,
      headers: request.headers,
      ...(request.method === "GET" || request.method === "HEAD" ? {} : { body: request.body }),
    });
    return fetch(forwarded);
  }
  return serveStatic(request);
}

/* ------------------------------------------------------------------ */
/* Phase 5 — PROD-031: the solution-surface mount check                 */
/* ------------------------------------------------------------------ */

/** The page globals the solution mount check touches (structural, no DOM lib). */
interface SolutionMountPageGlobal {
  readonly document: {
    readonly querySelector: (selector: string) =>
      | { readonly textContent: string | null; readonly getAttribute: (name: string) => string | null }
      | null;
  };
}

/** The solution-surface mount check's observed facts (all the evidence). */
export interface SolutionMountReport {
  /** True when the app shell mounted through the live auth gate. */
  readonly shellMounted: boolean;
  /** True when the demo session was entered through the honest UI gate. */
  readonly demoSessionEntered: boolean;
  /** True when the WORKSPACE mounted (`#solution-workspace` present). */
  readonly workspaceMounted: boolean;
  /** The workspace root's binding marker (the browser mount's honest id). */
  readonly browserMountMarker: string | null;
  /** True when the honest engine-unavailable panel rendered instead. */
  readonly engineUnavailablePanel: boolean;
  /** Every pageerror event message, in order (must be ZERO). */
  readonly pageErrors: string[];
}

/** Render a solution mount report as the evidence lines. */
export function describeSolutionMountReport(report: SolutionMountReport): string {
  const lines = [
    `shell mounted: ${report.shellMounted}`,
    `demo session entered: ${report.demoSessionEntered}`,
    `workspace mounted (#solution-workspace): ${report.workspaceMounted}`,
    `browser mount marker: ${report.browserMountMarker ?? "null"}`,
    `engine-unavailable panel: ${report.engineUnavailablePanel}`,
    `pageerror events: ${report.pageErrors.length}`,
  ];
  for (const [index, message] of report.pageErrors.entries()) {
    lines.push(`  [${index + 1}] ${message}`);
  }
  return lines.join("\n");
}

/**
 * PROD-031 — the solution-surface mount check: against the local
 * same-origin deployment (built bundle + session-authenticated local
 * backend), load `/`, enter the demo session through the HONEST UI gate
 * ("Enter demo"), navigate to the demo project's solution surface and
 * observe which rung of the selection ladder rendered. Asserts are the
 * CALLER's job; the browser and the stack are torn down no matter what.
 */
export async function mountSolutionSurfaceInChromium(options: {
  readonly stack: LocalDeploymentStack;
  /** The demo project's solution route hash (default: the committed demo world). */
  readonly solutionHash?: string;
}): Promise<SolutionMountReport> {
  chromiumExecutable();
  const browser: Browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const pageErrors: string[] = [];
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    page.on("pageerror", (error: Error) => {
      pageErrors.push(error.message);
    });
    await page.goto(`${options.stack.origin}/`, {
      waitUntil: "load",
      timeout: BUDGETS.pageLoadMs,
    });
    // The shell mounts (the app chrome) — with the backend live the auth
    // gate is the first honest surface.
    let shellMounted = true;
    try {
      await page.waitForSelector("#app .app", { timeout: BUDGETS.mountMs });
    } catch {
      shellMounted = false;
    }
    // The honest session path: the "Enter demo" gate button.
    let demoSessionEntered = false;
    try {
      await page.waitForSelector("h2#gate-title", { timeout: BUDGETS.mountMs });
      await page.getByRole("button", { name: "Enter demo" }).click();
      await page.waitForSelector("h2#gate-title", { state: "detached", timeout: BUDGETS.mountMs });
      demoSessionEntered = true;
    } catch {
      demoSessionEntered = false;
    }
    // The solution surface (the demo wall world's project route).
    const solutionHash =
      options.solutionHash ?? "#/projects/proj-demo-001/solution?case=case-demo-wall-001";
    await page.goto(`${options.stack.origin}/${solutionHash}`, {
      waitUntil: "load",
      timeout: BUDGETS.pageLoadMs,
    });
    // The selection ladder resolves: EITHER the workspace mounts (the
    // browser rung) OR the honest engine-unavailable panel renders. The
    // mount wait is generous: the first rung's journey rejection + the
    // second rung's chunk load + the workspace opening all happen here.
    let workspaceMounted = false;
    try {
      await page.waitForSelector("#solution-workspace", { timeout: 30_000 });
      workspaceMounted = true;
    } catch {
      workspaceMounted = false;
    }
    await page.waitForTimeout(BUDGETS.settleMs);
    const surface = await page.evaluate(() => {
      const pageGlobal = globalThis as unknown as SolutionMountPageGlobal;
      const document = pageGlobal.document;
      const workspace = document.querySelector("#solution-workspace");
      const browserMount = document.querySelector("[data-browser-mount]");
      const unavailable = document.querySelector("[data-engine-available='false']");
      return {
        workspacePresent: workspace !== null,
        browserMountMarker: browserMount?.getAttribute("data-browser-mount") ?? null,
        engineUnavailablePanel: unavailable !== null,
      };
    });
    await context.close();
    return {
      shellMounted,
      demoSessionEntered,
      workspaceMounted: workspaceMounted && surface.workspacePresent,
      browserMountMarker: surface.browserMountMarker,
      engineUnavailablePanel: surface.engineUnavailablePanel,
      pageErrors,
    };
  } finally {
    await browser.close();
  }
}
