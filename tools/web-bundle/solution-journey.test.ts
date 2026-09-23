/**
 * PROD-031 — the solution workspace's BROWSER-JOURNEY gate (§6 of the work
 * order): a real Chromium walking journey 2's legs against the built web
 * bundle + a session-authenticated local backend (ONE same-origin loopback
 * deployment — the smallest honest equivalent of the deployed shape), so
 * the browser execution path is a GATE, not a demo.
 *
 * Three tests, each failing EXPLICITLY (never silently skipped):
 *
 *   1. the crypto-freeness scan — every built asset EXCEPT the documented
 *      legacy local-engine mount chunk carries NO Node-builtin
 *      externalization markers (the browser mount's whole graph is
 *      crypto-free), and the browser mount's chunk exists;
 *   2. the twelve-step journey (the §6 legs): open the demo project's
 *      solution surface through the honest "Enter demo" gate → the
 *      WORKSPACE mounts through the selection ladder's second rung (the
 *      browser engine binding — never the engine-unavailable panel) → ONE
 *      direct-manipulation operation (the committed demolition fixture)
 *      → the agent leg ONE command (the committed "Rebuild the damaged
 *      wall with blocks." script: clarification → answer → confirm) →
 *      validation visible over v1 → the generated BOQ renders → ONE BOQ
 *      line click → the line→step trace deep link renders → the observed
 *      scene UNCHANGED (the read-only anchors) — with ZERO pageerror
 *      events across the whole session;
 *   3. the negative control is NOT re-asserted here (it is the PRE-fix
 *      tree's capture — docs/productization-evidence/PROD-031/
 *      negative-control.md); this suite asserts the POST-fix behavior the
 *      same check's positive side pins.
 *
 * The typed outcomes assert the COMMITTED identities of the recorded
 * reference journey (PROD-026's record, pinned byte-exact by
 * apps/web/src/app/solution-journey-record.test.ts): the demolition and
 * block-wall operation ids are engine derivations over the committed
 * corpus fixtures, so the browser session's FRESH authoring run produces
 * the same identities (the equivalence the composition-model gate proves
 * Node-side; here the same engine executes server-side).
 *
 * Timeouts are generous on purpose: the vite build takes seconds to tens
 * of seconds, the backend child needs its /healthz, and every interaction
 * leg round-trips the live same-origin routes.
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium } from "playwright";
import type { Browser, Page } from "playwright";
import {
  browserMountAssets,
  buildWebAppOnce,
  chromiumExecutable,
  legacyEngineMountAssets,
  scanBrowserGraphForCryptoMarkers,
  startLocalDeploymentStack,
  type LocalDeploymentStack,
} from "./gate";

const ROOT = resolve(import.meta.dir, "..", "..");

/**
 * The COMMITTED journey record (the browser mount's own record source —
 * read as DATA, exactly the module's §4.6 "one record" choice). Its line
 * ids feed the BOQ-line click and the line→step deep link; its operation
 * id prefixes are the asserted typed outcomes.
 */
const committedRecord = JSON.parse(
  readFileSync(
    join(ROOT, "apps", "web", "src", "app", "solution-journey-record.json"),
    "utf8",
  ),
) as {
  readonly world: {
    readonly projectId: string;
    readonly caseId: string;
    readonly solutionId: string;
    readonly baselineRealityVersionId: string;
  };
  readonly boqTraceSet: {
    readonly lineTraces: readonly {
      readonly boqLineId: string;
      readonly itemDescription: string;
    }[];
  };
};

/* The committed demo world pins (PROD-026's record, the parity gate's). */
const DEMO_PROJECT_ID = "proj-demo-001";
const DEMO_CASE_ID = "case-demo-wall-001";
const DEMO_BASELINE_REALITY_VERSION = "rgv-demo-0007";
const SOLUTION_HASH = `#/projects/${DEMO_PROJECT_ID}/solution?case=${DEMO_CASE_ID}`;

/**
 * The committed corpus operation-identity prefix (PROD-026's recorded
 * journey, step 4: `78be478643fcbb4a…` the demolition-removal). The engine
 * derives an operation's id from the typed intent alone (instants are
 * excluded from every identity derivation), and the browser session's
 * direct-manipulation leg builds the SAME intent (`intent-direct-0`, the
 * committed corpus parameters), so the fresh run produces the SAME id.
 *
 * The AGENT leg is different, honestly: the record's step-5 identity
 * (`281417008f64faec…`) was authored through the scripted agent double
 * (the test-only mirror, its own committed corpus intent id), while the
 * live browser journey compiles through the REAL PROD-023 backend
 * compiler — whose deterministic intent carries its own id (and the
 * live request clock's `authoredAt`). The browser test therefore asserts
 * the agent leg's TYPED CONTENT (block-wall-placement, origin agent,
 * concrete-block, 5 m × 1 m × 0.1 m — the same operation the record
 * holds) and the id's engine-derivation SHAPE, never the double's id.
 */
const DEMOLITION_OPERATION_ID_PREFIX = "78be478643fcbb4a";

/** The fixed test AUTH_SECRET (never a real credential). */
const GATE_AUTH_SECRET = "prod031-web-bundle-gate-test-secret";

/** Every budget is bounded. */
const BUDGETS = {
  /** The local backend's /healthz wait. */
  backendHealthMs: 60_000,
  /** The whole twelve-step journey (build is memoized separately). */
  journeyMs: 240_000,
  /** One interaction leg's settle wait. */
  legMs: 20_000,
} as const;

/** The vite build ONCE for the whole suite (memoized in gate.ts). */
beforeAll(() => buildWebAppOnce(), 240_000);

/** The local same-origin deployment stack, ONE for the whole suite. */
let stack: LocalDeploymentStack | null = null;
beforeAll(async () => {
  stack = await startLocalDeploymentStack({
    authSecret: GATE_AUTH_SECRET,
    healthTimeoutMs: BUDGETS.backendHealthMs,
  });
}, 120_000);

afterAll(async () => {
  await stack?.stop();
});

describe("PROD-031 solution browser-journey gate (crypto-free mount → local deployment → real Chromium journey)", () => {
  test(
    "the browser mount's whole built graph is crypto-free (no Node-builtin markers outside the documented legacy engine chunk)",
    () => {
      // The browser mount's chunk(s) exist (the sentinel survives
      // minification — see gate.ts) …
      const mountChunks = browserMountAssets();
      expect(mountChunks.length).toBeGreaterThan(0);
      // … the legacy local-engine mount chunk is the ONLY excused asset …
      const legacyChunks = legacyEngineMountAssets();
      expect(legacyChunks.length).toBeLessThanOrEqual(1);
      // … and every OTHER asset (the browser mount's whole graph, wherever
      // the bundler split it) carries NO marker — the full finding list
      // (asset + marker + excerpt) is the failure evidence.
      const findings = scanBrowserGraphForCryptoMarkers();
      expect(findings).toEqual([]);
    },
    60_000,
  );

  test(
    "journey 2 walks in a real plain browser against the live same-origin engine routes (the twelve §6 legs, zero page errors)",
    async () => {
      if (stack === null) {
        throw new Error("web-bundle gate: the local deployment stack did not boot");
      }
      chromiumExecutable();
      const browser: Browser = await chromium.launch({
        headless: true,
        args: ["--no-sandbox", "--disable-dev-shm-usage"],
      });
      const pageErrors: string[] = [];
      try {
        const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
        const page: Page = await context.newPage();
        page.on("pageerror", (error: Error) => {
          pageErrors.push(error.message);
        });

        /* ---- Leg 1 — open the demo project's solution surface (through
         * the honest "Enter demo" gate; CURRENT BUILDING → PROBLEM). ---- */
        await page.goto(`${stack.origin}/`, { waitUntil: "load", timeout: 30_000 });
        await page.waitForSelector("h2#gate-title", { timeout: BUDGETS.legMs });
        await page.getByRole("button", { name: "Enter demo" }).click();
        await page.waitForSelector("h2#gate-title", { state: "detached", timeout: BUDGETS.legMs });
        await page.goto(`${stack.origin}/${SOLUTION_HASH}`, {
          waitUntil: "load",
          timeout: 30_000,
        });

        /* ---- Leg 2 — the WORKSPACE mounts through the selection ladder's
         * SECOND rung (the browser engine binding), never the honest
         * engine-unavailable panel. ---- */
        await page.waitForSelector('#solution-workspace[data-case-id="case-demo-wall-001"]', {
          timeout: 30_000,
        });
        await page.waitForSelector('[data-browser-mount="solution-browser-mount"]', {
          timeout: BUDGETS.legMs,
        });
        expect(await page.locator("#solution-engine-unavailable").count()).toBe(0);
        expect(await page.locator("#solution-backend-unreachable").count()).toBe(0);
        const workspace = page.locator("#solution-workspace");
        expect(await workspace.getAttribute("data-baseline-reality-version")).toBe(
          DEMO_BASELINE_REALITY_VERSION,
        );
        expect(await workspace.getAttribute("data-current-version")).toBe("1");
        expect(await workspace.getAttribute("data-cursor-state-index")).toBe("0");

        /* The observed scene's read-only anchors, captured BEFORE any
         * proposed work (the reality-seal leg asserts them unchanged). */
        await page.getByRole("button", { name: "Use the accessible view (no drawing)" }).click();
        const observedSceneBefore = await page
          .locator('[aria-label="Building contents (accessible view)"]')
          .innerText();

        /* ---- Leg 3 — ONE direct-manipulation operation: the committed
         * demolition fixture over the damaged wall faces (5 m × 2.4 m ×
         * 0.1 m — the recorded journey's step 4). ---- */
        await page
          .locator('li[data-element-id="node-wall-002"] > button', {
            hasText: "Damaged ground-floor wall faces",
          })
          .click();
        await page
          .locator('#solution-manipulation [data-action-id="node-wall-002:demolition-removal"] > button')
          .click();
        await page
          .locator(
            '#solution-manipulation form [data-parameter-name="length"]',
          )
          .fill("5");
        await page
          .locator('#solution-manipulation form [data-parameter-name="height"]')
          .fill("2.4");
        await page
          .locator('#solution-manipulation form [data-parameter-name="thickness"]')
          .fill("0.1");
        await page.getByRole("button", { name: "Remove the damaged section — apply" }).click();
        const demolition = page.locator(
          '#solution-operations [data-operation-type="demolition-removal"][data-origin="direct-manipulation"]',
        );
        await demolition.first().waitFor({ state: "visible", timeout: BUDGETS.legMs });
        // The committed corpus demolition identity (the typed outcome).
        expect(await demolition.first().getAttribute("data-operation-id")).toMatch(
          new RegExp(`^${DEMOLITION_OPERATION_ID_PREFIX}`),
        );
        expect(await page.locator("#solution-workspace").getAttribute("data-cursor-state-index")).toBe(
          "1",
        );

        /* ---- Leg 4 — the agent leg ONE command through the LIVE compiler
         * (the PROD-023 backend routes): the documented phrasing
         * (interaction.test.ts's golden-path vocabulary) with ONE missing
         * slot pair → clarification → answer → proposal → confirm. ---- */
        await page.locator("#agent-utterance").fill("Build the wall 5 m long and 0.1 m thick.");
        await page.getByRole("button", { name: "Send", exact: true }).click();
        await page.waitForSelector('[data-pending="clarification"]', {
          timeout: BUDGETS.legMs,
        });
        await page.locator("#agent-utterance").fill("1 m high, using concrete blocks, on the wall line along the damaged section");
        await page.getByRole("button", { name: "Send", exact: true }).click();
        await page.waitForSelector('[data-pending="proposal"]', { timeout: BUDGETS.legMs });
        expect(
          await page
            .locator('[data-pending="proposal"] [data-proposal-command="true"]')
            .innerText(),
        ).toMatch(/concrete-block wall 5 m long, 1 m high and 0\.1 m thick/i);
        await page
          .getByRole("button", { name: "Confirm the proposed operation and apply it" })
          .click();
        const blockWall = page.locator(
          '#solution-operations [data-operation-type="block-wall-placement"][data-origin="agent"]',
        );
        await blockWall.first().waitFor({ state: "visible", timeout: BUDGETS.legMs });
        // The typed content (the same operation the recorded journey's
        // step 5 holds): concrete-block, 5 m × 1 m × 0.1 m, over the wall
        // line — plus the engine-derivation id shape (see the header note
        // for why the live compiler's own intent id is asserted by shape).
        expect(await blockWall.first().innerText()).toMatch(/concrete-block/i);
        expect(await blockWall.first().getAttribute("data-operation-id")).toMatch(
          /^[0-9a-f]{64}$/,
        );
        expect(await page.locator("#solution-workspace").getAttribute("data-cursor-state-index")).toBe(
          "2",
        );

        /* ---- Leg 5 — validation visible over v1 (the engine's
         * deterministic Validate through the live route). ---- */
        await page.getByRole("button", { name: "Check this proposal (validate)" }).click();
        const validation = page.locator("#solution-validation");
        await validation.waitFor({ state: "visible", timeout: BUDGETS.legMs });
        expect(await validation.getAttribute("data-validation-outcome")).toBe("pass");
        const checks = validation.locator("li[data-check-id]");
        expect(await checks.count()).toBe(7);

        /* ---- Leg 6 — the generated BOQ renders (the guarded seam over
         * the committed trace set — the recorded v1 BOQ's 7 lines). ---- */
        const boqLines = page.locator("#solution-boq [data-boq-line-id]");
        expect(await boqLines.count()).toBe(committedRecord.boqTraceSet.lineTraces.length);
        // The recorded plaster line (the clicked line of leg 7).
        const plasterLine = committedRecord.boqTraceSet.lineTraces.find((line) =>
          line.itemDescription.includes("Plaster application to affected surfaces — cement-plaster, measured by volume"),
        );
        expect(plasterLine).toBeDefined();

        /* ---- Leg 7 — ONE BOQ line click (the recorded journey's
         * step 10): the line selects and its detail renders. ---- */
        await page
          .locator(`#solution-boq [data-boq-line-id="${plasterLine!.boqLineId}"] button`)
          .click();
        expect(
          await page
            .locator(`#solution-boq [data-boq-line-id="${plasterLine!.boqLineId}"]`)
            .getAttribute("data-selected"),
        ).toBe("true");

        /* ---- Leg 8 — the line→step trace deep link (the recorded
         * journey's step 11): the ONE router round-trips the query. ---- */
        const deepLink = `${SOLUTION_HASH}&boq-line=${plasterLine!.boqLineId}&step=3`;
        await page.goto(`${stack.origin}/${deepLink}`, { waitUntil: "load", timeout: 30_000 });
        await page.waitForSelector("#solution-boq-trace-panel", { timeout: 30_000 });
        expect(
          await page
            .locator(
              `#solution-boq-trace-panel [data-boq-line-id="${plasterLine!.boqLineId}"]`,
            )
            .getAttribute("data-selected"),
        ).toBe("true");
        expect(await page.locator("#solution-boq-trace-panel").innerText()).toContain(
          "the deep-linked solution step is step 3",
        );

        /* ---- Leg 9 — the observed scene UNCHANGED (the read-only
         * anchors): the accessible view's observed content is
         * byte-identical across the whole journey, and the workspace
         * still pins the baseline reality version. ---- */
        await page.getByRole("button", { name: "Use the accessible view (no drawing)" }).click();
        const observedSceneAfter = await page
          .locator('[aria-label="Building contents (accessible view)"]')
          .innerText();
        expect(observedSceneAfter).toBe(observedSceneBefore);
        expect(
          await page.locator("#solution-workspace").getAttribute("data-baseline-reality-version"),
        ).toBe(DEMO_BASELINE_REALITY_VERSION);

        /* ---- The honest close: ZERO pageerror events across the whole
         * session (the same law as the PROD-030 mount check). ---- */
        expect(pageErrors).toEqual([]);

        await context.close();
      } finally {
        await browser.close();
      }
    },
    BUDGETS.journeyMs,
  );
});
