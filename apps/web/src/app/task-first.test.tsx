/**
 * PROD-017 — the task-first PRESENTATION tests: the task-first components
 * as PURE static renders (the surfaces-create.test.tsx discipline —
 * renderToStaticMarkup of pure components, no network, no clock, no
 * randomness).
 *
 * The EXPLICIT-STATES acceptance: loading, empty, error,
 * unavailable-provider and permission states are first-class renders —
 * never blank, never generic. Each test pins one state's honest content.
 */

import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import {
  AuthorizationPanel,
  NegotiationPanel,
  NextBestActionPanel,
  OperationResultNote,
  TaskFlowPanelBody,
  TaskFlowStripBody,
  TaskJourneyView,
} from "./task-first";
import { taskFlowView, operationResultView } from "./task-flow";
import {
  DEMO_TASK_PROJECT_ID,
  demoFailedOperationResult,
  demoSucceededOperationResult,
  demoTaskFlowBundle,
} from "./task-dataset";
import type { TaskFlowResourceData } from "./task-first";

const bundle = demoTaskFlowBundle();
const view = taskFlowView(bundle, DEMO_TASK_PROJECT_ID);
const data: TaskFlowResourceData = {
  mode: "demo",
  projectId: DEMO_TASK_PROJECT_ID,
  view,
  bundle,
};

describe("PROD-017 task-first panels (static renders, verbatim statements)", () => {
  test("the NBA panel renders the blocked status, prompt and typed blockers verbatim", () => {
    const html = renderToStaticMarkup(<NextBestActionPanel view={view} mode="demo" />);
    expect(html).toContain("blocked");
    expect(html).toContain("Depth capture cannot start");
    expect(html).toContain("capability-blocked");
    expect(html).toContain("The negotiated capability outcome is blocked");
    expect(html).toContain("authorization-denied");
    expect(html).toContain("missing-permission");
    expect(html).toContain("demo data");
  });

  test("the NBA panel renders the honest EMPTY state when no action is recorded", () => {
    const noAction = taskFlowView({ ...bundle, nextBestAction: null }, DEMO_TASK_PROJECT_ID);
    const html = renderToStaticMarkup(<NextBestActionPanel view={noAction} mode="demo" />);
    expect(html).toContain("No next-best-action recorded for this task");
    expect(html).toContain("the adapter never invents one");
  });

  test("the authorization panel renders grants AND every typed denial (W-R1)", () => {
    const html = renderToStaticMarkup(<AuthorizationPanel view={view} />);
    expect(html).toContain("reality:read");
    expect(html).toContain("evidence:submit");
    expect(html).toContain("reality:write");
    expect(html).toContain("missing-permission");
    expect(html).toContain("settings:tenant-admin");
    expect(html).toContain("forbidden-role");
    expect(html).toContain("Tenant administration requires the admin role");
  });

  test("the negotiation panel renders the blocked verdict with the domain reason verbatim", () => {
    const html = renderToStaticMarkup(<NegotiationPanel view={view} />);
    expect(html).toContain("blocked");
    expect(html).toContain("this task cannot run on this browser");
    expect(html).toContain("camera");
    expect(html).toContain("unsupported");
    expect(html).toContain("never a readiness statement");
  });

  test("the journey view renders every step with its honest record summary", () => {
    const html = renderToStaticMarkup(<TaskJourneyView view={view} />);
    expect(html).toContain("Open or create the project");
    expect(html).toContain("Inspect the SiteTwin and its evidence");
    expect(html).toContain("3 evidence items · 2 declared gaps");
    expect(html).toContain("v3 · PROPOSED · approval pending-review");
    expect(html).toContain("OBSERVED · 2 post-work evidence items");
    // The server's reality readiness statement renders VERBATIM.
    expect(html).toContain("Reality readiness (server-stated, verbatim)");
    expect(html).toContain("readiness partial · model v14 · 218 objects");
  });

  test("the full panel body renders the audit card with the contract versions", () => {
    const html = renderToStaticMarkup(<TaskFlowPanelBody data={data} />);
    expect(html).toContain("semantic objects (verbatim)");
    expect(html).toContain('data-contract-object="ProjectContext"');
    expect(html).toContain("Riverside Block B Refurbishment");
    expect(html).toContain("This browser adapter");
    expect(html).toContain("profile-browser-web-adapter");
  });

  test("the empty state: a project with no task-flow objects renders guidance + the next action", () => {
    const html = renderToStaticMarkup(
      <TaskFlowPanelBody
        data={{ mode: "demo", projectId: "proj-other", view: null, bundle: null }}
      />,
    );
    expect(html).toContain("No task-flow objects recorded for this project");
    expect(html).toContain("Open the demo task journey");
  });
});

describe("PROD-017 the strip (every primary screen's exposure)", () => {
  test("the blocked strip carries the prompt, the blocker codes and the journey link", () => {
    const html = renderToStaticMarkup(<TaskFlowStripBody data={data} />);
    expect(html).toContain('data-strip-state="blocked"');
    expect(html).toContain("Depth capture cannot start");
    expect(html).toContain("capability-blocked");
    expect(html).toContain("authorization-denied");
    expect(html).toContain("this browser cannot execute this task");
    expect(html).toContain("#/");
  });

  test("the empty strip names the honest state and the next useful action", () => {
    const html = renderToStaticMarkup(
      <TaskFlowStripBody
        data={{ mode: "demo", projectId: "proj-other", view: null, bundle: null }}
      />,
    );
    expect(html).toContain('data-strip-state="empty"');
    expect(html).toContain("No task-flow objects recorded for this project");
  });

  test("the no-action strip renders the honest 'not computed yet' state", () => {
    const noAction = taskFlowView({ ...bundle, nextBestAction: null }, DEMO_TASK_PROJECT_ID);
    const html = renderToStaticMarkup(
      <TaskFlowStripBody
        data={{ mode: "demo", projectId: DEMO_TASK_PROJECT_ID, view: noAction, bundle }}
      />,
    );
    expect(html).toContain('data-strip-state="no-action"');
    expect(html).toContain("No next-best-action recorded");
  });

  test("the actionable strip renders the prompt with the actionable tag", () => {
    const actionable = { ...bundle, nextBestAction: { ...bundle.nextBestAction!, status: "actionable" as const, blockers: [] } };
    const actionableView = taskFlowView(actionable, DEMO_TASK_PROJECT_ID);
    const html = renderToStaticMarkup(
      <TaskFlowStripBody
        data={{
          mode: "demo",
          projectId: DEMO_TASK_PROJECT_ID,
          view: actionableView,
          bundle: actionable,
        }}
      />,
    );
    expect(html).toContain('data-strip-state="actionable"');
  });
});

describe("PROD-017 the operation-result note (the terminal step)", () => {
  test("the failed operation renders status + typed failure + detail verbatim", () => {
    const html = renderToStaticMarkup(
      <OperationResultNote operation={operationResultView(demoFailedOperationResult())} />,
    );
    expect(html).toContain('data-operation-status="failed"');
    expect(html).toContain("provider-unavailable");
    expect(html).toContain("The reconstruction provider is currently unavailable");
    expect(html).toContain("No result references");
  });

  test("the succeeded operation renders its result refs verbatim", () => {
    const html = renderToStaticMarkup(
      <OperationResultNote operation={operationResultView(demoSucceededOperationResult())} />,
    );
    expect(html).toContain('data-operation-status="succeeded"');
    expect(html).toContain("mission-batch-9917");
    expect(html).toContain("evidence-f08d256a");
    expect(html).toContain("mission-step-42");
  });
});
