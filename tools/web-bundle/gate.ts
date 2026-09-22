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
 * Three phases, each failing EXPLICITLY (never silently skipped):
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
  const findings: ScanFinding[] = [];
  const files = [
    join(WEB_DIST_DIR, "index.html"),
    ...builtAssets().map((name) => join(WEB_ASSETS_DIR, name)),
  ];
  for (const file of files) {
    if (!existsSync(file)) {
      continue;
    }
    const contents = readFileSync(file, "utf8");
    for (const marker of MARKERS) {
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
