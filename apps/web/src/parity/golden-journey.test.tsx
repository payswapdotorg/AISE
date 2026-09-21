/**
 * PROD-018 — the FINAL GOLDEN JOURNEY REPLAY: one end-to-end pass through
 * evidence → understanding → intervention → execution → outcome continuity
 * IN THE COMPOSED APP (the PROD-018 acceptance core).
 *
 * The replay drives the app's REAL seams — the same modules the browser
 * runs (no test doubles of app code; only the fetch transport is
 * injected, exactly like golden-journey.test.tsx):
 *
 *   0. ROUTER      — every journey address parses to the real route (the
 *                    composed cross-links are navigable, not decoration);
 *   1. EVIDENCE    — the task-flow adapter seam (loadTaskFlowLive over a
 *                    contract-serving stub) answers the joined bundle; the
 *                    evidence summary's declared gaps become the composed
 *                    Capture suggestions; the pilot world's capture opens
 *                    its issue (the recorded relatedCaseIds join);
 *   2. UNDERSTANDING — the issue opens its evidence AND its affected BOQ
 *                    lines (the honest join); the BOQ quantity line opens
 *                    its spatial context + captures + the consequential
 *                    boundary's uncertainty/provenance labels;
 *   3. INTERVENTION — the scenario stays PROPOSED (never upgraded); the
 *                    validation boundary carries the epistemic seal and
 *                    the approval state verbatim;
 *   4. EXECUTION   — the executions adapter (the real api.ts seam over a
 *                    stub) answers the recorded execution; the before/
 *                    after pair composes from the verbatim record;
 *   5. OUTCOME     — the outcome is OBSERVED with post-work evidence;
 *                    outcome discovery finds it by case, intervention and
 *                    evidence; the Outcomes surface renders it; the
 *                    outcome boundary carries the recorded labels.
 *
 * Determinism: stub fetches with fixed payloads; no clock, no randomness,
 * no network. The task-flow stub bodies are the committed PROD-016 corpus
 * values — what a contract-serving deployment answers.
 */

import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { formatRoute, parseHash, type Route } from "../app/router";
import {
  loadComparisonsLive,
  loadExecutionsLive,
  loadScenarioIndexLive,
  loadTaskFlowLive,
  type FetchLike,
} from "../app/api";
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
  demoWorkspaceInput,
} from "../app/demo";
import { captureCrossLinks, boqLineCrossLinks, issueCrossLinks } from "./cross-links";
import {
  canonicalAction,
  canonicalActionHref,
  nextActionSuggestions,
  normalizeTaskTypeAction,
} from "./action-labels";
import {
  liveBeforeAfterPairs,
  planRealityView,
  summaryBeforeAfterPairs,
} from "./plan-reality";
import {
  outcomeBoundaryLabels,
  quantityBoundaryLabels,
  validationBoundaryLabels,
} from "./boundary-labels";
import {
  BeforeAfterCard,
  BoqLineBridgesCard,
  BoundaryLabelsCard,
  CanonicalActionBar,
  CaseCrossLinksCard,
  PlanRealityCard,
} from "./components";
import { TaskCompositionPanelBody } from "./components";
import {
  findOutcomes,
  OutcomesBody,
  type OutcomesData,
} from "../app/surfaces/Outcomes";
import type { TaskFlowResourceData } from "../app/task-first";

/* ------------------------------------------------------------------ */
/* The stub transport (the golden-journey.test.tsx discipline)           */
/* ------------------------------------------------------------------ */

function stubFetch(
  routes: Readonly<Record<string, { readonly status?: number; readonly body?: unknown } | "throw">>,
): FetchLike {
  return async (input: string) => {
    const route = routes[input];
    if (route === undefined) {
      return new Response("not stubbed", { status: 404 });
    }
    if (route === "throw") {
      throw new TypeError("network is down");
    }
    const status = route.status ?? 200;
    const body = route.body ?? { ok: true };
    return new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });
  };
}

/** The corpus task-flow wire answer (what a contract-serving deployment returns). */
function taskFlowWire(): Record<string, unknown> {
  const bundle = demoTaskFlowBundle();
  return {
    ok: true,
    flow: {
      context: bundle.context,
      reality: bundle.reality,
      evidence: bundle.evidence,
      boq: bundle.boq,
      caseSummary: bundle.caseSummary,
      scenario: bundle.scenario,
      outcome: bundle.outcome,
      nextBestAction: bundle.nextBestAction,
      authorization: bundle.authorization,
      requirements: bundle.requirements,
    },
  };
}

/** The recorded execution answer (the executions namespace's own shape). */
const EXECUTIONS_WIRE = {
  ok: true,
  executions: [
    {
      executionRecordId: "exec-4402",
      caseId: "case-91ab",
      scenarioId: "scenario-55c1",
      stateId: "state-3-final",
      executedStepCount: 3,
      evidenceCount: 2,
      outcomeCount: 1,
      executedAt: "2026-01-16T13:10:00.000Z",
      recordedAt: "2026-01-16T13:15:00.000Z",
    },
  ],
} as const;

/** The recorded comparison answer (the comparisons namespace's own shape). */
const COMPARISONS_WIRE = {
  ok: true,
  comparisons: [
    {
      comparisonId: "cmp-118",
      projectId: "proj-7f3a2b",
      versionId: "v014",
      designSystemClass: "bim-ifc",
      designSourceRecordId: "IFC-MODEL-0042",
      designRevision: "C3",
      totalEntries: 214,
      discrepancies: 6,
      computedAt: "2026-01-16T14:20:00.000Z",
    },
  ],
} as const;

/** The scenario-index answer (the interventions namespace's own shape). */
const SCENARIOS_WIRE = {
  ok: true,
  scenarios: [
    {
      scenarioId: "scenario-55c1",
      projectId: "proj-7f3a2b",
      title: "Level 2 masonry reconstruction",
      status: "approved",
      stateCount: 4,
    },
  ],
} as const;

describe("PROD-018 golden journey replay (evidence → understanding → intervention → execution → outcome)", () => {
  /* 0. The router: the journey's addresses are real routes. ---------- */
  test("0. every composed journey address parses to the real route (navigable, not decoration)", () => {
    const addresses: readonly Route[] = [
      { name: "dashboard" },
      { name: "project", projectId: DEMO_TASK_PROJECT_ID },
      { name: "sitetwin", projectId: DEMO_TASK_PROJECT_ID },
      { name: "case", projectId: DEMO_TASK_PROJECT_ID },
      { name: "boq-lens", projectId: DEMO_PROJECT_ID },
      { name: "intervention", projectId: DEMO_TASK_PROJECT_ID, query: {} },
      { name: "outcomes", projectId: DEMO_TASK_PROJECT_ID },
    ];
    for (const route of addresses) {
      expect(parseHash(formatRoute(route))).toEqual(route);
    }
    // The four canonical actions' hrefs are exactly these routes.
    for (const action of ["capture", "investigate", "build-solution", "review-outcome"]) {
      const definition = canonicalAction(action)!;
      const href = canonicalActionHref(definition, DEMO_TASK_PROJECT_ID);
      expect(parseHash(href).name).not.toBe("not-found");
    }
  });

  /* 1. Evidence: the adapter seam + the composed capture suggestions. -- */
  test("1a. the task-flow adapter seam answers the joined bundle (the REAL seam, stubbed transport)", async () => {
    const fetchImpl = stubFetch({
      [`/v1/adapter/projects/${DEMO_TASK_PROJECT_ID}/task-flow`]: {
        body: taskFlowWire(),
      },
    });
    const result = await loadTaskFlowLive(fetchImpl, DEMO_TASK_PROJECT_ID);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    const bundle = result.flow;
    expect(bundle.evidence?.totalItems).toBe(3);
    expect(bundle.evidence?.gaps.map((gap) => gap.gapId)).toEqual(["gap-4471", "gap-4472"]);
    expect(bundle.caseSummary?.caseId).toBe("case-91ab");
    expect(bundle.scenario?.epistemicState).toBe("PROPOSED");
    expect(bundle.outcome?.epistemicState).toBe("OBSERVED");

    // The composed task-first panel renders over the seam's answer: the
    // four actions + the honest gap suggestions.
    const data: TaskFlowResourceData = {
      mode: "api",
      projectId: DEMO_TASK_PROJECT_ID,
      view: taskFlowView(bundle, DEMO_TASK_PROJECT_ID),
      bundle,
    };
    const html = renderToStaticMarkup(<TaskCompositionPanelBody data={data} />);
    expect(html).toContain('data-step-state="present"');
    expect(html).toContain("Depth capture cannot start");
    expect(html).toContain("gap-4471");
    expect(html).toContain("gap-4472");
    expect(html).toContain("#/projects/proj-7f3a2b/sitetwin");
  });

  test("1b. a capture opens the issue derived from it (the recorded relatedCaseIds join)", () => {
    const links = captureCrossLinks(
      DEMO_PROJECT_ID,
      demoEvidenceList(DEMO_PROJECT_ID)[0]!,
      demoCase(DEMO_PROJECT_ID),
      demoBoqImport(DEMO_PROJECT_ID),
      demoLensInput(DEMO_PROJECT_ID),
    );
    const issue = links.find((link) => link.kind === "capture-to-issue")!;
    expect(issue.target.kind).toBe("route");
    expect(issue.target.label).toContain("case-007");
    expect(parseHash(issue.target.kind === "route" ? issue.target.href : "#/").name).toBe(
      "case",
    );
  });

  test("1c. the evidence gaps become typed Capture suggestions (the honest gap states)", () => {
    const bundle = demoTaskFlowBundle();
    const suggestions = nextActionSuggestions(
      DEMO_TASK_PROJECT_ID,
      bundle.evidence,
      bundle.nextBestAction,
    );
    expect(suggestions).toHaveLength(3);
    expect(suggestions[0]!.state).toBe("blocked");
    expect(suggestions[1]!.state).toBe("gap-missing");
    expect(suggestions[2]!.state).toBe("gap-weak");
    expect(suggestions[1]!.action.label).toBe("Capture");
  });

  /* 2. Understanding: the issue → evidence → quantities composition. --- */
  test("2a. the issue opens its evidence and its affected BOQ lines (the honest join)", () => {
    const links = issueCrossLinks(
      DEMO_PROJECT_ID,
      demoCase(DEMO_PROJECT_ID)!,
      demoEvidenceList(DEMO_PROJECT_ID),
      demoReality(DEMO_PROJECT_ID),
      demoLensInput(DEMO_PROJECT_ID),
    );
    const evidence = links.filter((link) => link.kind === "issue-to-capture");
    expect(evidence).toHaveLength(2);
    for (const link of evidence) {
      expect(link.target.kind).toBe("route");
    }
    const affected = links.find((link) => link.kind === "boq-line-to-issue")!;
    expect(affected.target.kind).toBe("unresolved");
    expect(affected.target.kind === "unresolved" ? affected.target.reason : "").toContain(
      "no BOQ row maps to them yet",
    );
  });

  test("2b. the BOQ quantity line opens its spatial context, captures and boundary labels", () => {
    const lens = demoLensInput(DEMO_PROJECT_ID)!;
    const plaster = lens.items.find((item) => item.itemId === "sub-r12")!;
    const links = boqLineCrossLinks(
      DEMO_PROJECT_ID,
      plaster,
      demoBoqImport(DEMO_PROJECT_ID),
      demoWorkspaceInput(DEMO_PROJECT_ID),
      [demoCase(DEMO_PROJECT_ID)!],
    );
    const spatial = links.filter((link) => link.kind === "boq-line-to-spatial");
    expect(spatial).toHaveLength(4);
    for (const link of spatial) {
      expect(link.target.kind).toBe("route");
      expect(link.target.kind === "route" ? link.target.label : "").toContain("plan node");
    }
    const captures = links.filter((link) => link.kind === "boq-line-to-capture");
    expect(captures).toHaveLength(4);

    // The consequential-boundary labels the quantity carries.
    const boundary = quantityBoundaryLabels(plaster, null);
    expect(
      boundary.labels.some((label) => label.text.startsWith("mapping mapped — confidence medium")),
    ).toBe(true);
    expect(boundary.labels.some((label) => label.text.startsWith("source cells"))).toBe(true);
  });

  test("2c. the plan-vs-reality composition keeps the two sides distinct", () => {
    const view = planRealityView({
      projectId: DEMO_PROJECT_ID,
      workspace: demoWorkspaceInput(DEMO_PROJECT_ID),
      reality: demoReality(DEMO_PROJECT_ID),
      evidenceCount: demoEvidenceList(DEMO_PROJECT_ID).length,
      scenario: null,
    });
    const html = renderToStaticMarkup(<PlanRealityCard view={view} />);
    expect(html).toContain("v002");
    expect(html).toContain("v003");
    expect(html).toContain("DIFFERENT records");
  });

  /* 3. Intervention: the proposal stays a proposal. -------------------- */
  test("3. the intervention step keeps PROPOSED distinct and the task type maps to Build solution", () => {
    const bundle = demoTaskFlowBundle();
    expect(bundle.scenario?.epistemicState).toBe("PROPOSED");
    expect(bundle.scenario?.approvalState).toBe("pending-review");
    const validation = validationBoundaryLabels(bundle.scenario, null);
    expect(
      validation.labels.some((label) => label.text.includes("never observed reality")),
    ).toBe(true);
    // The journey's task (field capture) normalizes to Capture; the
    // intervention-review task type normalizes to Build solution.
    expect(normalizeTaskTypeAction("intervention-review").kind).toBe("canonical");
    const html = renderToStaticMarkup(
      <BoundaryLabelsCard sets={[validationBoundaryLabels(bundle.scenario, null)]} />,
    );
    expect(html).toContain("approval pending-review");
  });

  /* 4. Execution: the real adapters + the before/after composition. ----- */
  test("4a. the executions/comparisons adapters answer and the pair composes verbatim", async () => {
    const fetchImpl = stubFetch({
      "/v1/executions": { body: EXECUTIONS_WIRE },
      "/v1/comparisons": { body: COMPARISONS_WIRE },
      "/v1/interventions": { body: SCENARIOS_WIRE },
    });
    const [executions, comparisons, scenarios] = await Promise.all([
      loadExecutionsLive(fetchImpl),
      loadComparisonsLive(fetchImpl),
      loadScenarioIndexLive(fetchImpl),
    ]);
    expect(executions.ok).toBe(true);
    expect(comparisons.ok).toBe(true);
    expect(scenarios.ok).toBe(true);
    if (!executions.ok || !comparisons.ok || !scenarios.ok) {
      return;
    }
    // The project's scenario join (the honest attribution).
    const scenarioIds = scenarios.scenarios
      .filter((entry) => entry.projectId === DEMO_TASK_PROJECT_ID)
      .map((entry) => entry.scenarioId);
    const projectExecutions = executions.executions.filter((execution) =>
      scenarioIds.includes(execution.scenarioId),
    );
    expect(projectExecutions).toHaveLength(1);
    expect(projectExecutions[0]!.executionRecordId).toBe("exec-4402");

    const pairs = liveBeforeAfterPairs(
      DEMO_TASK_PROJECT_ID,
      projectExecutions,
      comparisons.comparisons.filter(
        (comparison) => comparison.projectId === DEMO_TASK_PROJECT_ID,
      ),
    );
    expect(pairs).toHaveLength(2);
    expect(pairs[0]!.pairId).toBe("execution:exec-4402");
    expect(pairs[0]!.before.recordId).toBe("state-3-final");
    expect(pairs[1]!.pairId).toBe("comparison:cmp-118");
    expect(pairs[1]!.after.state).toContain("6 discrepancies");

    const html = renderToStaticMarkup(<BeforeAfterCard pairs={pairs} mode="api" />);
    expect(html).toContain("exec-4402");
    expect(html).toContain("cmp-118");
    expect(html).toContain("IFC-MODEL-0042");
  });

  /* 5. Outcome: discovery, the observed state and the boundary labels. -- */
  test("5. the outcome is discoverable, OBSERVED, and carries its post-work evidence", () => {
    const bundle = demoTaskFlowBundle();
    const world = { bundle, executions: [], comparisons: [] };
    // Find by case, by intervention, by post-work evidence id.
    expect(findOutcomes("case-91ab", world)).toHaveLength(1);
    expect(findOutcomes("scenario-55c1", world)).toHaveLength(1);
    expect(findOutcomes("556f8ba4f8de534d", world)).toHaveLength(1);
    // The composed pair and boundary labels.
    const pairs = summaryBeforeAfterPairs(DEMO_TASK_PROJECT_ID, bundle.scenario, bundle.outcome);
    expect(pairs[0]!.after.state).toBe("OBSERVED");
    expect(pairs[0]!.evidenceRefs).toHaveLength(2);
    const boundary = outcomeBoundaryLabels(bundle.outcome, null, null);
    expect(
      boundary.labels.some((label) => label.text.includes("observed only with post-work evidence")),
    ).toBe(true);
  });

  test("5b. the Outcomes surface renders the full outcome step (discovery + pair + boundary)", () => {
    const bundle = demoTaskFlowBundle();
    const data: OutcomesData = {
      mode: "demo",
      projectId: DEMO_TASK_PROJECT_ID,
      demo: { bundle, scenarioPresent: false },
      live: null,
    };
    const hits = findOutcomes("case-91ab", { bundle, executions: [], comparisons: [] });
    const html = renderToStaticMarkup(
      <OutcomesBody data={data} query="case-91ab" onQuery={() => {}} hits={hits} />,
    );
    expect(html).toContain("1 matching outcome record");
    expect(html).toContain("outcome-77e2");
    expect(html).toContain("Before / after");
    expect(html).toContain("Uncertainty, provenance and verification");
  });

  /* The continuity assertion: one composed pass over the real seams. ---- */
  test("the full replay composes: every stage's records chain through the app's real routes", () => {
    const bundle = demoTaskFlowBundle();
    const view = taskFlowView(bundle, DEMO_TASK_PROJECT_ID);
    // The journey's stages in order, each with its record and its route.
    const stages = [
      { stage: "evidence", record: bundle.evidence?.subjectRef ?? "—", route: parseHash("#/projects/proj-7f3a2b/sitetwin").name },
      { stage: "understanding", record: bundle.caseSummary?.caseId ?? "—", route: parseHash("#/projects/proj-7f3a2b/case").name },
      { stage: "intervention", record: bundle.scenario?.scenarioId ?? "—", route: parseHash("#/projects/proj-7f3a2b/intervention").name },
      { stage: "outcome", record: bundle.outcome?.outcomeId ?? "—", route: parseHash("#/projects/proj-7f3a2b/outcomes").name },
    ];
    expect(stages.map((stage) => stage.route)).toEqual([
      "sitetwin",
      "case",
      "intervention",
      "outcomes",
    ]);
    expect(stages.map((stage) => stage.record)).toEqual([
      "case-91ab",
      "case-91ab",
      "scenario-55c1",
      "outcome-77e2",
    ]);
    expect(view.steps.length).toBe(6);
    // The composed task-first journey renders every stage honestly.
    const data: TaskFlowResourceData = {
      mode: "demo",
      projectId: DEMO_TASK_PROJECT_ID,
      view,
      bundle,
    };
    const html = renderToStaticMarkup(
      <>
        <CanonicalActionBar projectId={DEMO_TASK_PROJECT_ID} />
        <TaskCompositionPanelBody data={data} />
        <CaseCrossLinksCard
          projectId={DEMO_PROJECT_ID}
          caseView={demoCase(DEMO_PROJECT_ID)!}
          evidence={demoEvidenceList(DEMO_PROJECT_ID)}
          reality={demoReality(DEMO_PROJECT_ID)}
          lens={demoLensInput(DEMO_PROJECT_ID)}
          mode="demo"
        />
        <BoqLineBridgesCard
          projectId={DEMO_PROJECT_ID}
          item={demoLensInput(DEMO_PROJECT_ID)!.items[0]!}
          boqImport={demoBoqImport(DEMO_PROJECT_ID)}
          workspace={demoWorkspaceInput(DEMO_PROJECT_ID)}
          caseViews={[]}
            boundaryLabels={quantityBoundaryLabels(demoLensInput(DEMO_PROJECT_ID)!.items[0]!, null)}
          mode="demo"
        />
      </>,
    );
    expect(html).toContain("Capture");
    expect(html).toContain("Investigate");
    expect(html).toContain("Build solution");
    expect(html).toContain("Review outcome");
    expect(html).toContain("From this issue");
    expect(html).toContain("Action bridges");
  });
});
