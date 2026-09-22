/**
 * PROD-030 — the web browser-bundle gate suite (wired into `bun run verify`
 * through bun test's default test-file discovery — the same pickup that
 * already runs tools/reality-eval/benchmark.test.ts; NO root config change
 * is needed or made).
 *
 * Runs the gate of ./gate.ts over the apps/web production bundle:
 *
 *   1. the scan — every built asset under apps/web/dist/assets/*.js plus
 *      the built index.html contains NO Node-builtin import/externalization
 *      markers (the defect class: a Node-only fixtures loader re-exported
 *      from a shared-contract barrel, externalized by the bundler, crashing
 *      module evaluation in a plain browser);
 *   2. the real Chromium mount — the built app MOUNTS (shell root
 *      non-empty / the auth-gate heading visible) with ZERO pageerror
 *      events. A missing Chromium FAILS EXPLICITLY with the install
 *      command (mirroring tools/deployed/browser.ts) — browser checks are
 *      never silently skipped.
 *
 * Timeouts are generous on purpose: the vite build takes seconds to tens
 * of seconds and the bun default 5s would flake.
 */

import { beforeAll, describe, expect, test } from "bun:test";
import { buildWebAppOnce, describeMountReport, mountBuiltAppInChromium, scanDistForMarkers } from "./gate";

/** The vite build + artifact proof, ONCE for the whole suite. */
beforeAll(() => buildWebAppOnce(), 240_000);

describe("PROD-030 web browser-bundle gate (build → scan → real Chromium mount)", () => {
  test(
    "the built browser bundle contains no Node-builtin externalization markers",
    () => {
      const findings = scanDistForMarkers();
      // The full finding list (asset + marker + excerpt) IS the failure
      // evidence — expect() prints it verbatim.
      expect(findings).toEqual([]);
    },
    60_000,
  );

  test(
    "the built web app mounts in a real Chromium with zero pageerror events",
    async () => {
      const report = await mountBuiltAppInChromium();
      if (!report.mounted || report.pageErrors.length > 0) {
        throw new Error(
          `web-bundle gate: MOUNT FAILURE — the built app did not mount cleanly in Chromium\n` +
            describeMountReport(report),
        );
      }
      // The mounted shell must carry real content: the auth-gate heading
      // (h2#gate-title) on an authed deployment, or the routed surface's
      // heading on this static server (no backend → the honest demo shell).
      expect(report.mounted).toBe(true);
      expect(report.pageErrors).toEqual([]);
      expect(report.gateTitle !== null || report.contentHeadings.length > 0).toBe(true);
    },
    120_000,
  );
});
