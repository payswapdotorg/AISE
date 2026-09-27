/**
 * QA-002 (D3 + D8) — the ONE shared task-flow resource and the live-404
 * demo-fallback tests.
 *
 * D3 (the production defect): the Capture surface rendered the IDENTICAL
 * degraded banner 3× and Project Overview 2× (one per independent
 * `useTaskFlow` consumer), and one page load fired the task-flow GET once
 * per consumer. D8 (the Lead-verified live defect): the banner's Impact
 * line promised "the committed demo task journey below remains executable
 * and is badged demo" — but NOTHING rendered below (the live-404 branch
 * returned {kind:"unavailable"} and every consumer rendered the banner
 * only), and the `aise://task` cross-device handoff was unreachable.
 *
 * This suite pins the fix at the deterministic level:
 *
 *  - the LOADER (loadTaskFlow): live-404 → READY outcome carrying the
 *    committed demo bundle marked `demoFallback` (the verbatim not-served
 *    reason + Impact line), badged demo, corpus identity; live-200 →
 *    ready live data with NO fallback; demo mode unchanged; exactly ONE
 *    fetch per load (fetch-counting stub);
 *  - the BANNER (TaskFlowDegradedBanner): the honest unavailable state
 *    VERBATIM + "Check again" (the retry stays the caller's reload);
 *  - the SURFACE (TaskFlowSurface): non-fallback states render the
 *    children with no banner;
 *  - the CONSUMERS' existing render paths over the fallback data: the
 *    journey/mission/strip render the demo bundle badged demo, and the
 *    CrossDeviceHandoffBody emits the `aise://task` deep link that
 *    ROUND-TRIPS through the adapter-contract codec (the X-journey bridge
 *    reachable on live deployments);
 *  - [browser-level] banner count = 1 per surface, task-flow fetch count
 *    = 1 per surface load, journey BELOW the banner — pinned by
 *    apps/web/src/app/qa002-browser.test.tsx in real Chromium.
 *
 * Deterministic: pure loaders with stubbed transports + static renders of
 * pure bodies over the committed demo records. No clock, no randomness.
 */

import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import {
  loadTaskFlow,
  TaskFlowDegradedBanner,
  TaskFlowSurface,
  TaskFlowPanelBody,
  TaskFlowStripBody,
  type TaskFlowResourceData,
} from "./task-first";
import { CaptureMissionBody, CrossDeviceHandoffBody, fieldCaptureHandoff } from "./surfaces/CaptureMission";
import { demoTaskFlowBundle, DEMO_TASK_PROJECT_ID } from "./task-dataset";
import { taskFlowView } from "./task-flow";
import type { AppEnvironment } from "./environment";
import { AppEnvironmentContext } from "./environment";
import type { FetchLike } from "./api";
import { parseFieldTaskDeepLink } from "@aise/adapter-contract/task-handoff";
import type { FieldTaskHandoff } from "@aise/adapter-contract/task-handoff";

/* ------------------------------------------------------------------ */
/* The verbatim degraded-banner wording (contractual — never reworded)   */
/* ------------------------------------------------------------------ */

const NOT_SERVED_REASON =
  "this deployment answers the API but does not serve the task-flow adapter contract objects (/v1/adapter/projects/:id/task-flow answered HTTP 404)";
const NOT_SERVED_IMPACT =
  "the task-first journey cannot run on live records here; the committed demo task journey below remains executable and is badged demo — never presented as live authority";

/* ------------------------------------------------------------------ */
/* Loader-test transports (fetch-counting stubs)                        */
/* ------------------------------------------------------------------ */

/** A live-API environment whose transport counts every call. */
function liveEnvironment(
  answer: (input: string) => Response | undefined,
): { readonly environment: AppEnvironment; readonly calls: string[] } {
  const calls: string[] = [];
  const fetchImpl: FetchLike = async (input: string) => {
    calls.push(input);
    const response = answer(input);
    if (response !== undefined) {
      return response;
    }
    return new Response("not stubbed", { status: 404 });
  };
  return {
    environment: {
      apiStatus: {
        mode: "available",
        healthz: "ok",
        readyz: "ok",
        detail: "live API on this origin",
        providers: null,
      },
      fetchImpl,
      principalId: "user-alice",
    },
    calls,
  };
}

/** The demo-bundle wire payload (the decoded bundle re-decodes at the seam). */
function servedTaskFlowResponse(): Response {
  return new Response(JSON.stringify({ ok: true, flow: demoTaskFlowBundle() }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

/* ------------------------------------------------------------------ */
/* D8 — the loader's live-404 branch returns the demo fallback           */
/* ------------------------------------------------------------------ */

describe("QA-002 D8 — loadTaskFlow's live-404 branch carries the committed demo fallback", () => {
  test("live 404 → READY with the demo bundle, the verbatim degraded facts, demo badge and corpus identity", async () => {
    const { environment, calls } = liveEnvironment(() =>
      new Response("no task-flow objects on this deployment", { status: 404 }),
    );
    const outcome = await loadTaskFlow(environment, "proj-demo-001")();
    expect(outcome.kind).toBe("ready");
    if (outcome.kind !== "ready") {
      return;
    }
    // The honest degraded facts ride the data (verbatim, contractual).
    expect(outcome.data.demoFallback).toEqual({
      reason: NOT_SERVED_REASON,
      impact: NOT_SERVED_IMPACT,
    });
    // The journey is badged demo (the DataBadge vocabulary: this record
    // comes from the built-in demo dataset) and keeps the CORPUS project's
    // identity — never presented as the requested project's live records.
    expect(outcome.data.mode).toBe("demo");
    expect(outcome.data.projectId).toBe(DEMO_TASK_PROJECT_ID);
    expect(outcome.data.bundle).toEqual(demoTaskFlowBundle());
    expect(outcome.data.view).not.toBeNull();
    // ONE fetch for the whole load (the fallback adds no shadow request).
    expect(calls).toEqual([`/v1/adapter/projects/proj-demo-001/task-flow`]);
  });

  test("live 200 → READY with the LIVE bundle and NO demo fallback (live authority only)", async () => {
    const { environment, calls } = liveEnvironment((input) =>
      input.includes("/task-flow") ? servedTaskFlowResponse() : undefined,
    );
    const outcome = await loadTaskFlow(environment, "proj-demo-001")();
    expect(outcome.kind).toBe("ready");
    if (outcome.kind !== "ready") {
      return;
    }
    expect(outcome.data.demoFallback).toBeUndefined();
    expect(outcome.data.mode).toBe("api");
    expect(outcome.data.projectId).toBe("proj-demo-001");
    expect(outcome.data.bundle).not.toBeNull();
    expect(outcome.data.view).not.toBeNull();
    expect(calls).toEqual([`/v1/adapter/projects/proj-demo-001/task-flow`]);
  });

  test("a non-404 live failure stays the retryable ERROR state (never silently demo)", async () => {
    const { environment } = liveEnvironment(() =>
      new Response("boom", { status: 500 }),
    );
    const outcome = await loadTaskFlow(environment, "proj-demo-001")();
    expect(outcome.kind).toBe("error");
  });

  test("offline demo mode is unchanged: the corpus journey without any fallback marker, no fetch at all", async () => {
    const calls: string[] = [];
    const environment: AppEnvironment = {
      apiStatus: {
        mode: "unavailable",
        healthz: "failed",
        readyz: "skipped",
        detail: "the API did not answer /healthz on this origin — showing demo data",
        providers: null,
      },
      fetchImpl: async (input: string) => {
        calls.push(input);
        return new Response("never", { status: 404 });
      },
      principalId: "user-alice",
    };
    const corpus = await loadTaskFlow(environment, DEMO_TASK_PROJECT_ID)();
    expect(corpus.kind).toBe("ready");
    if (corpus.kind === "ready") {
      expect(corpus.data.mode).toBe("demo");
      expect(corpus.data.demoFallback).toBeUndefined();
      expect(corpus.data.view).not.toBeNull();
    }
    const other = await loadTaskFlow(environment, "proj-other")();
    expect(other.kind).toBe("ready");
    if (other.kind === "ready") {
      expect(other.data.view).toBeNull();
      expect(other.data.bundle).toBeNull();
      expect(other.data.demoFallback).toBeUndefined();
    }
    expect(calls).toEqual([]);
  });
});

/* ------------------------------------------------------------------ */
/* D3 — the ONE degraded banner (verbatim) at the surface level          */
/* ------------------------------------------------------------------ */

describe("QA-002 D3 — the surface-level degraded banner renders the unavailable state VERBATIM", () => {
  test("the banner carries the contractual reason, Impact line, Check-again affordance and the provider note", () => {
    // A live-API environment (the only state where the demo fallback
    // exists) so the provider-status note under the banner renders too.
    const liveEnvironmentValue: AppEnvironment = {
      apiStatus: {
        mode: "available",
        healthz: "ok",
        readyz: "ok",
        detail: "live API on this origin",
        providers: null,
      },
      fetchImpl: async () => new Response("{}", { status: 404 }),
      principalId: "user-alice",
    };
    const html = renderToStaticMarkup(
      <AppEnvironmentContext.Provider value={liveEnvironmentValue}>
        <TaskFlowDegradedBanner
          fallback={{ reason: NOT_SERVED_REASON, impact: NOT_SERVED_IMPACT }}
          onRetry={() => {}}
        />
      </AppEnvironmentContext.Provider>,
    );
    expect(html).toContain("Unavailable in this deployment");
    expect(html).toContain(NOT_SERVED_REASON);
    expect(html).toContain(`Impact: ${NOT_SERVED_IMPACT}`);
    expect(html).toContain("Check again");
    expect(html).toContain('data-provider-note="the task-first flow"');
    expect(html).toContain('class="state state-unavailable"');
  });

  test("TaskFlowSurface renders its children with NO banner outside the demo-fallback state", () => {
    const html = renderToStaticMarkup(
      <TaskFlowSurface projectId={DEMO_TASK_PROJECT_ID}>
        <div data-surface-child="true">the surface body</div>
      </TaskFlowSurface>,
    );
    expect(html).toContain('data-surface-child="true"');
    expect(html).not.toContain("Unavailable in this deployment");
    expect(html).not.toContain(NOT_SERVED_IMPACT);
  });
});

/* ------------------------------------------------------------------ */
/* D8 — the consumers' existing render paths over the demo fallback      */
/* ------------------------------------------------------------------ */

/** The ready-with-demo-fallback resource data (exactly what live-404 produces). */
const fallbackData: TaskFlowResourceData = {
  mode: "demo",
  projectId: DEMO_TASK_PROJECT_ID,
  view: taskFlowView(demoTaskFlowBundle(), DEMO_TASK_PROJECT_ID),
  bundle: demoTaskFlowBundle(),
  demoFallback: { reason: NOT_SERVED_REASON, impact: NOT_SERVED_IMPACT },
};

/** One handoff prepared from the fallback data (the panel's own projection). */
const fallbackHandoff: FieldTaskHandoff = fieldCaptureHandoff({
  projectId: DEMO_TASK_PROJECT_ID,
  taskId: `task-capture-${demoTaskFlowBundle().evidence?.gaps[0]?.gapId ?? "gap"}`,
  intent: demoTaskFlowBundle().evidence?.gaps[0]?.description ?? "capture",
  targetRefs: [
    demoTaskFlowBundle().caseSummary?.caseId ?? "case",
    demoTaskFlowBundle().evidence?.gaps[0]?.gapId ?? "gap",
  ],
  epistemicState: demoTaskFlowBundle().caseSummary?.status ?? "under-review",
  originSurface: "capture",
  versionContext: {},
  issuedAt: "2026-09-26T18:15:00.000Z",
});

describe("QA-002 D8 — the demo-fallback journey renders through the consumers' existing paths (badged demo)", () => {
  test("the full task-flow panel body renders the demo journey with the demo badge", () => {
    const html = renderToStaticMarkup(<TaskFlowPanelBody data={fallbackData} />);
    expect(html).toContain("The golden journey");
    expect(html).toContain("Riverside Block B Refurbishment");
    expect(html).toContain("demo data");
    expect(html).not.toContain("live API");
  });

  test("the strip renders the demo next-best-action (the existing demo-bundle path)", () => {
    const html = renderToStaticMarkup(<TaskFlowStripBody data={fallbackData} />);
    expect(html).toContain('data-strip-state="blocked"');
    expect(html).toContain("Depth capture cannot start");
  });

  test("the capture mission renders the demo mission's declared gaps, badged demo", () => {
    const html = renderToStaticMarkup(<CaptureMissionBody data={fallbackData} />);
    expect(html).toContain("The capture mission");
    expect(html).toContain('data-mission-gaps="true"');
    expect(html).toContain("gap-4471");
    expect(html).toContain("demo data");
  });

  test("the cross-device handoff renders with the demo fallback, scoped honestly to the corpus demo", () => {
    const html = renderToStaticMarkup(
      <CrossDeviceHandoffBody data={fallbackData} handoff={null} onPrepare={() => {}} />,
    );
    expect(html).toContain("Continue this task on the mobile field app");
    expect(html).toContain(`data-handoff-demo-fallback="true"`);
    expect(html).toContain(DEMO_TASK_PROJECT_ID);
    expect(html).toContain("committed demo task journey");
    expect(html).toContain("badged demo, never this project");
    expect(html).toContain('data-handoff-prepare="idle"');
    expect(html).toContain("demo data");
  });

  test("the prepared fallback handoff emits the aise://task deep link and round-trips the codec (the X-journey bridge)", () => {
    const html = renderToStaticMarkup(
      <CrossDeviceHandoffBody data={fallbackData} handoff={fallbackHandoff} onPrepare={() => {}} />,
    );
    expect(html).toContain('data-handoff-link="true"');
    expect(html).toContain('data-handoff-uri="aise"');
    const match = /href="(aise:\/\/task[^"]*)"/.exec(html);
    expect(match).not.toBeNull();
    const parsed = parseFieldTaskDeepLink(match![1]!.replace(/&amp;/g, "&"));
    expect(parsed.kind).toBe("valid");
    if (parsed.kind === "valid") {
      // The continuation key is the DEMO task's honest identity.
      expect(parsed.handoff.projectId).toBe(DEMO_TASK_PROJECT_ID);
      expect(parsed.handoff.taskId).toBe(
        `task-capture-${demoTaskFlowBundle().evidence?.gaps[0]?.gapId ?? "gap"}`,
      );
      expect(parsed.handoff.purpose).toBe("field-capture");
    }
  });

  test("a LIVE bundle (no fallback marker) renders the handoff with NO demo-fallback scoping note", () => {
    const liveData: TaskFlowResourceData = {
      mode: "api",
      projectId: "proj-demo-001",
      view: taskFlowView(demoTaskFlowBundle(), "proj-demo-001"),
      bundle: demoTaskFlowBundle(),
    };
    const html = renderToStaticMarkup(
      <CrossDeviceHandoffBody data={liveData} handoff={null} onPrepare={() => {}} />,
    );
    expect(html).not.toContain("data-handoff-demo-fallback");
    expect(html).toContain("live API");
  });
});
