/**
 * PROD-018 — the COMPOSITION PRESENTATION tests: the parity components and
 * the Outcomes surface body as PURE static renders (the
 * surfaces-create.test.tsx / task-first.test.tsx discipline —
 * renderToStaticMarkup of pure components over the REAL demo records, no
 * network, no clock, no randomness).
 *
 * The explicit-states acceptance: every card renders its honest content —
 * resolvable links as real routes, unresolved links with the recorded
 * reason, absent records as explicit empty states (never blank, never
 * generic, never invented).
 */

import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import {
  BeforeAfterCard,
  BoqLineBridgesCard,
  BoundaryLabelsCard,
  CanonicalActionBar,
  CaseCrossLinksCard,
  PlanRealityCard,
  TaskCompositionPanelBody,
} from "./components";
import {
  findOutcomes,
  OutcomesBody,
  type OutcomesData,
} from "../app/surfaces/Outcomes";
import { taskFlowView } from "../app/task-flow";
import {
  DEMO_TASK_PROJECT_ID,
  demoTaskFlowBundle,
} from "../app/task-dataset";
import {
  DEMO_PROJECT_ID,
  demoBoqImport,
  demoCase,
  demoEvidenceList,
  demoLensInput,
  demoReality,
  demoScenario,
  demoWorkspaceInput,
} from "../app/demo";
import {
  planRealityView,
  summaryBeforeAfterPairs,
} from "./plan-reality";
import {
  outcomeBoundaryLabels,
  quantityBoundaryLabels,
  validationBoundaryLabels,
} from "./boundary-labels";
import type { TaskFlowResourceData } from "../app/task-first";

const projectId = DEMO_PROJECT_ID;

describe("PROD-018 the canonical action bar (the four-journey vocabulary)", () => {
  test("renders the four canonical actions over the app's real routes", () => {
    const html = renderToStaticMarkup(<CanonicalActionBar projectId={projectId} />);
    expect(html).toContain("Capture");
    expect(html).toContain("Investigate");
    expect(html).toContain("Build solution");
    expect(html).toContain("Review outcome");
    expect(html).toContain(`#/projects/${projectId}/sitetwin`);
    expect(html).toContain(`#/projects/${projectId}/case`);
    expect(html).toContain(`#/projects/${projectId}/intervention`);
    expect(html).toContain(`#/projects/${projectId}/outcomes`);
  });

  test("marks the current action when the surface states one", () => {
    const html = renderToStaticMarkup(
      <CanonicalActionBar projectId={projectId} current="review-outcome" />,
    );
    expect(html).toContain('data-action="review-outcome"');
    expect(html.match(/aria-current="true"/g)?.length).toBe(1);
  });
});

describe("PROD-018 the cross-link cards (capture → issue → BOQ navigation)", () => {
  test("the case card renders the issue's evidence AND the honest affected-BOQ state", () => {
    const html = renderToStaticMarkup(
      <CaseCrossLinksCard
        projectId={projectId}
        caseView={demoCase(projectId)!}
        evidence={demoEvidenceList(projectId)}
        reality={demoReality(projectId)}
        lens={demoLensInput(projectId)}
        mode="demo"
      />,
    );
    expect(html).toContain("From this issue");
    expect(html).toContain("a1b2…c3d4");
    expect(html).toContain("b2c3…d4e5");
    expect(html).toContain("affected BOQ lines");
    expect(html).toContain("no BOQ row maps to them yet");
    expect(html).toContain("evidenceIds carries");
  });

  test("the BOQ bridges card renders spatial context, captures, issues and the boundary labels", () => {
    const lens = demoLensInput(projectId)!;
    const plaster = lens.items.find((item) => item.itemId === "sub-r12")!;
    const html = renderToStaticMarkup(
      <BoqLineBridgesCard
        projectId={projectId}
        item={plaster}
        boqImport={demoBoqImport(projectId)}
        workspace={demoWorkspaceInput(projectId)}
        caseViews={[demoCase(projectId)!]}
        boundaryLabels={quantityBoundaryLabels(plaster, null)}
        mode="demo"
      />,
    );
    expect(html).toContain("Action bridges — row 12");
    expect(html).toContain("Plaster to internal walls");
    expect(html).toContain("plan node wall-e");
    expect(html).toContain("Site A / Building 1 / Ground Floor");
    expect(html).toContain("source document capture");
    expect(html).toContain("geometry capture ev-001");
    expect(html).toContain("geometry capture ev-002");
    expect(html).toContain("At this consequential boundary");
    expect(html).toContain("mapping mapped — confidence medium");
    expect(html).toContain("issues are never inferred from quantities");
  });

  test("an unmapped row's bridges state the recorded mapping reason", () => {
    const lens = demoLensInput(projectId)!;
    const excavation = lens.items.find((item) => item.itemId === "sub-r14")!;
    const html = renderToStaticMarkup(
      <BoqLineBridgesCard
        projectId={projectId}
        item={excavation}
        boqImport={demoBoqImport(projectId)}
        workspace={demoWorkspaceInput(projectId)}
        caseViews={[]}
        boundaryLabels={quantityBoundaryLabels(excavation, null)}
        mode="demo"
      />,
    );
    expect(html).toContain("interpretation uncertain — no concept resolved");
  });
});

describe("PROD-018 plan-vs-reality and before/after cards", () => {
  test("the card renders both sides with their distinct version ids", () => {
    const view = planRealityView({
      projectId,
      workspace: demoWorkspaceInput(projectId),
      reality: demoReality(projectId),
      evidenceCount: demoEvidenceList(projectId).length,
      scenario: demoScenario("project-zurich-hq"),
    });
    const html = renderToStaticMarkup(<PlanRealityCard view={view} />);
    expect(html).toContain("Plan — the pinned, as-designed/reconstructed model");
    expect(html).toContain("Reality — the captured, evidence-backed snapshot");
    expect(html).toContain(">plan</span>");
    expect(html).toContain(">reality</span>");
    expect(html).toContain("v002");
    expect(html).toContain("v003");
    expect(html).toContain("DIFFERENT records");
  });

  test("the before/after card renders the composed pair with its post-work evidence", () => {
    const bundle = demoTaskFlowBundle();
    const pairs = summaryBeforeAfterPairs(DEMO_TASK_PROJECT_ID, bundle.scenario, bundle.outcome);
    const html = renderToStaticMarkup(<BeforeAfterCard pairs={pairs} mode="demo" />);
    expect(html).toContain("Before / after");
    expect(html).toContain("PROPOSED v3");
    expect(html).toContain("OBSERVED");
    expect(html).toContain("196b5ab5");
    expect(html).toContain("comparison available");
  });

  test("the before/after empty state names the honest gap", () => {
    const html = renderToStaticMarkup(<BeforeAfterCard pairs={[]} mode="demo" />);
    expect(html).toContain("No before/after pairs recorded for this project");
  });
});

describe("PROD-018 the boundary-labels card (consequential boundaries)", () => {
  test("renders the outcome boundary's OBSERVED state and post-work evidence", () => {
    const bundle = demoTaskFlowBundle();
    const html = renderToStaticMarkup(
      <BoundaryLabelsCard sets={[outcomeBoundaryLabels(bundle.outcome, null, null)]} />,
    );
    expect(html).toContain("Uncertainty, provenance and verification");
    expect(html).toContain("is OBSERVED — observed only with post-work evidence");
    expect(html).toContain("post-work evidence");
    expect(html).toContain("comparison is recorded as available");
  });

  test("renders the validation boundary's PROPOSED seal and typed failure", () => {
    const bundle = demoTaskFlowBundle();
    const html = renderToStaticMarkup(
      <BoundaryLabelsCard
        sets={[validationBoundaryLabels(bundle.scenario, null)]}
      />,
    );
    expect(html).toContain("is PROPOSED — a proposal, never observed reality");
    expect(html).toContain("approval pending-review");
  });
});

describe("PROD-018 the composed task-first panel (honest per-step states)", () => {
  const bundle = demoTaskFlowBundle();
  const data: TaskFlowResourceData = {
    mode: "demo",
    projectId: DEMO_TASK_PROJECT_ID,
    view: taskFlowView(bundle, DEMO_TASK_PROJECT_ID),
    bundle,
  };

  test("renders the four actions with present/absent states and the gap suggestions", () => {
    const html = renderToStaticMarkup(<TaskCompositionPanelBody data={data} />);
    expect(html).toContain("The composed journey");
    expect(html).toContain('data-composed-steps="true"');
    expect(html).toContain('data-step-state="present"');
    expect(html).toContain("Next actions the records suggest");
    expect(html).toContain("Depth capture cannot start");
    expect(html).toContain("gap-missing");
    expect(html).toContain("calibrated reference dimension");
    expect(html).toContain("basis: the server&#x27;s NextBestAction");
    expect(html).toContain("basis: the evidence summary&#x27;s declared gap gap-4471");
  });

  test("the honest empty state renders when no task-flow objects exist", () => {
    const html = renderToStaticMarkup(
      <TaskCompositionPanelBody
        data={{ mode: "demo", projectId: "proj-other", view: null, bundle: null }}
      />,
    );
    expect(html).toContain("No task-flow objects recorded for this project");
  });
});

describe("PROD-018 the Outcomes surface (outcome discovery, first-class)", () => {
  const bundle = demoTaskFlowBundle();
  const data: OutcomesData = {
    mode: "demo",
    projectId: DEMO_TASK_PROJECT_ID,
    demo: { bundle, scenarioPresent: false },
    live: null,
  };

  test("the body renders the observed outcome, the pair and the boundary labels", () => {
    let query = "";
    const html = renderToStaticMarkup(
      <OutcomesBody data={data} query={query} onQuery={(next) => { query = next; }} hits={null} />,
    );
    expect(html).toContain("Find outcomes");
    expect(html).toContain("The observed outcome");
    expect(html).toContain("outcome-77e2");
    expect(html).toContain("OBSERVED");
    expect(html).toContain("Before / after");
    expect(html).toContain("Uncertainty, provenance and verification");
    expect(html).toContain("Plan vs reality");
  });

  test("findOutcomes matches by case, intervention and evidence (recorded ids only)", () => {
    const world = { bundle, executions: [], comparisons: [] };
    // by case
    expect(findOutcomes("case-91ab", world)).toHaveLength(1);
    // by intervention/scenario
    expect(findOutcomes("scenario-55c1", world)).toHaveLength(1);
    // by post-work evidence content id
    const hits = findOutcomes("196b5ab5d99835a2", world);
    expect(hits).toHaveLength(1);
    expect(hits[0]!.matchedOn.some((entry) => entry.startsWith("196b5ab5"))).toBe(true);
    // no match — the honest empty
    expect(findOutcomes("does-not-exist", world)).toHaveLength(0);
    // blank query — no search at all
    expect(findOutcomes("   ", world)).toHaveLength(0);
  });

  test("the demo empty state for a project with no outcome records", () => {
    const html = renderToStaticMarkup(
      <OutcomesBody
        data={{
          mode: "demo",
          projectId: "proj-other",
          demo: { bundle: null, scenarioPresent: false },
          live: null,
        }}
        query=""
        onQuery={() => {}}
        hits={null}
      />,
    );
    expect(html).toContain("No outcome records held for this project in the demo dataset");
  });
});
