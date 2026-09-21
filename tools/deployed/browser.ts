/**
 * PROD-012 — deployed-browser verification: browser preflight, launch and
 * the page factory.
 *
 * - The preflight proves Chromium is actually installed and prints an
 *   ACTIONABLE error (the exact `bunx playwright install chromium`
 *   command) when it is not — browser checks are never silently skipped
 *   (§0a: the runner must FAIL EXPLICITLY if the browser is missing).
 * - Chromium launches with `--no-sandbox` (worker sandboxes run without
 *   the namespace privileges the sandboxed renderer needs) plus
 *   `--disable-dev-shm-usage` (container /dev/shm is often tiny).
 * - One browser instance serves the whole run. Each check gets its OWN
 *   BrowserContext (created and closed sequentially, one at a time): the
 *   session-lifecycle check REQUIRES a pristine anonymous cookie jar to
 *   prove mint → whoami → logout → fail-closed 401, and the shell check
 *   must observe the anonymous gate — cookie isolation is verification
 *   semantics, not load: no two pages ever exist at once, and the pacing
 *   stays human-scale against the shared free-tier deployment.
 * - Every page is wired into the run-wide ConsoleGuard BEFORE navigation.
 */

import { existsSync } from "node:fs";
import { chromium } from "playwright";
import type { Browser, BrowserContext, Page } from "playwright";
import type { ConsoleGuard } from "./console-guard";
import type { Viewport } from "./config";

/** One isolated (context, page) pair plus its guaranteed close. */
export interface CheckPage {
  readonly context: BrowserContext;
  readonly page: Page;
  close(): Promise<void>;
}

/**
 * Preflight: prove the Chromium binary exists. Returns the executable
 * path on success; throws with the actionable install command otherwise.
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

/** Launch the single browser instance for the whole run. */
export async function launchBrowser(): Promise<Browser> {
  return chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
}

/**
 * Create an isolated context + page for one check, wired into the guard.
 * The returned handle MUST be closed (checks do it in their finally
 * blocks; the runner's browser close is the last-resort backstop).
 */
export async function newCheckPage(
  browser: Browser,
  guard: ConsoleGuard,
  label: string,
  viewport: Viewport,
): Promise<CheckPage> {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
  });
  const page = await context.newPage();
  guard.attach(page, label);
  let closed = false;
  return {
    context,
    page,
    async close(): Promise<void> {
      if (closed) {
        return;
      }
      closed = true;
      await context.close();
    },
  };
}
