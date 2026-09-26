/**
 * POST-004 — navigation/interaction hardening: the static-render exit-gate
 * suite for the task-first primary navigation, the direct build-solution
 * entry, the staged solution journey and the specialist-details progressive
 * disclosure (plan §2A, §2G, §2H, §2K of
 * docs/post-production-discoverability-and-device-validation-plan-2026-09-25.md).
 *
 * DISCIPLINE (the app's established convention): every check is a
 * `renderToStaticMarkup` projection of pure components with hand-constructed
 * fixtures — no network (effects never run in static rendering), no clock,
 * no randomness. The assertions pin the WORK ORDER's outcomes:
 *
 *  1. the primary navigation speaks TASK LANGUAGE FIRST (Capture →
 *     Investigate → Understand costs → Build solution → Review outcome,
 *     in journey order, before the registry) and carries NO specialist
 *     dataset vocabulary (Corpus / Pilot / Scenario / Demo) in the default
 *     view;
 *  2. "Build solution" exposes the INTERACTIVE SOLUTION WORKSPACE DIRECTLY
 *     (its nav target IS the solution route — no Intervention-Studio-first
 *     hop) and presents "Build an intervention" vs "Build interactively"
 *     with the plain-language distinction — on the nav, on the Intervention
 *     Studio and on the Solution surface;
 *  3. Plan → Validate → Approve → Execute → Compare is VISIBLY STAGED with
 *     the current stage and the next allowed action, derived HONESTLY from
 *     the loaded records (each recorded state of the governed journey maps
 *     to its stage; a terminal status never claims progress);
 *  4. the specialist record (steps + provenance, the status audit, the
 *     status timeline) renders behind native <details> progressive
 *     disclosure — one click away, still in the markup, never removed.
 */

import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { AppShell } from "./AppShell";
import { DashboardBody, type DashboardData } from "./surfaces/Dashboard";
import {
  ApprovalPanel,
  BuildSolutionPathsCard,
  StudioBody,
} from "./surfaces/InterventionStudio";
import type { InterventionData } from "./surfaces/InterventionStudio";
import { SolutionSurface } from "./surfaces/Solution";
import { parseHash, formatRoute } from "./router";
import type { Route } from "./router";
import {
  DEMO_SOLUTION_PROJECT_ID,
} from "./demo";
import { DEMO_TASK_PROJECT_ID } from "./task-dataset";
import {
  approvedScenario,
  canonicalScenario,
  viewerGeometries,
} from "../viewer/fixtures";
import type { ViewerScenario } from "../viewer";
import type {
  ComparisonSummaryRecord,
  ExecutionSummaryRecord,
} from "./api";

/* ------------------------------------------------------------------ */
/* Fixtures                                                            */
/* ------------------------------------------------------------------ */

/** A fetch that must NEVER be called in static rendering. */
function neverFetch(): (input: string, init?: RequestInit) => Promise<Response> {
  return () => Promise.reject(new Error("static render must not fetch"));
}

const STAGE_PROJECT = "proj-stage-test";

/** One recorded execution (live shape; the stage card projects it verbatim). */
const EXECUTION: ExecutionSummaryRecord = {
  executionRecordId: "exec-post004-1",
  caseId: "case-post004",
  scenarioId: "scn-post004",
  stateId: "state-post004",
  executedStepCount: 3,
  evidenceCount: 2,
  outcomeCount: 1,
  executedAt: "2026-07-13T14:30:00.000Z",
  recordedAt: "2026-07-13T14:31:00.000Z",
};

/** One recorded comparison (live shape). */
const COMPARISON: ComparisonSummaryRecord = {
  comparisonId: "cmp-post004-1",
  projectId: STAGE_PROJECT,
  versionId: "v003",
  designSystemClass: "office_refit",
  designSourceRecordId: "scn-post004",
  designRevision: null,
  totalEntries: 12,
  discrepancies: 2,
  computedAt: "2026-07-14T09:00:00.000Z",
};

/** Build one InterventionData around a scenario (the honest hand fixture). */
function interventionData(
  scenario: ViewerScenario | null,
  overrides: Partial<Pick<InterventionData, "executions" | "comparisons" | "mode">> = {},
): InterventionData {
  return {
    mode: overrides.mode ?? "demo",
    projectId: STAGE_PROJECT,
    scenario,
    scenarioSummaries:
      scenario === null
        ? []
        : [
            {
              scenarioId: scenario.scenarioId,
              title: scenario.title,
              status: scenario.status,
              stateCount: scenario.states.length,
            },
          ],
    unknownScenario: null,
    geometries: scenario === null ? [] : viewerGeometries(),
    executions: overrides.executions ?? [],
    comparisons: overrides.comparisons ?? [],
  };
}

/** The demo dataset shape the dashboard body renders. */
const DASHBOARD_DEMO: DashboardData = {
  mode: "demo",
  demo: {
    projects: [],
    lens: { items: 12, mapped: 9, ambiguous: 1, unmapped: 2 },
    scenario: { title: "Office refit, ground floor", layers: 5, steps: 3 },
    connectors: 2,
    evidence: 6,
  },
  live: null,
};

/** Every `#/` hash link one render composes (in-page anchors excluded). */
function hashLinks(html: string): string[] {
  return [...html.matchAll(/href="(#[^"]+)"/g)]
    .map((match) => match[1]!)
    .filter((href) => href.startsWith("#/"));
}

/* ------------------------------------------------------------------ */
/* 1. The task-first primary navigation vocabulary                      */
/* ------------------------------------------------------------------ */

describe("POST-004 — the task-first primary navigation (plan §2A)", () => {
  const shell = renderToStaticMarkup(
    <AppShell route={{ name: "dashboard" }} apiStatus={null}>
      <span />
    </AppShell>,
  );

  test("the five task verbs label the primary entries, in journey order", () => {
    const order = ["Capture", "Investigate", "Understand costs", "Build solution", "Review outcome"];
    const positions = order.map((label) => shell.indexOf(`>${label}</a>`));
    for (const position of positions) {
      expect(position).toBeGreaterThanOrEqual(0);
    }
    for (let index = 1; index < positions.length; index += 1) {
      expect(positions[index]!).toBeGreaterThan(positions[index - 1]!);
    }
    // Task language comes FIRST: the last task entry precedes the registry.
    const registry = shell.indexOf('href="#/projects"');
    expect(registry).toBeGreaterThanOrEqual(0);
    expect(positions[positions.length - 1]!).toBeLessThan(registry);
  });

  test("the default nav carries NO specialist dataset vocabulary", () => {
    expect(shell).not.toContain("Corpus");
    expect(shell).not.toContain("Pilot");
    expect(shell).not.toContain("Scenario");
    expect(shell).not.toContain("Demo");
  });

  test("every nav link addresses a real route (no dead pointers)", () => {
    const dead = hashLinks(shell).filter((href) => parseHash(href).name === "not-found");
    expect(dead).toEqual([]);
  });

  test("every per-project surface keeps an obvious entry from the primary nav", () => {
    const surfaces = [
      "capture",
      "sitetwin",
      "boq-lens",
      "case",
      "intervention",
      "solution",
      "outcomes",
    ] as const;
    const missing = surfaces.filter(
      (surface) => !new RegExp(`href="#/projects/[^"]+/${surface}"`).test(shell),
    );
    expect(missing).toEqual([]);
  });

  test("aria-current lands on the TASK entry of the active route (not just the registry)", () => {
    const cases: readonly { readonly route: Route; readonly label: string }[] = [
      { route: { name: "capture", projectId: DEMO_TASK_PROJECT_ID }, label: ">Capture</a>" },
      { route: { name: "case", projectId: DEMO_TASK_PROJECT_ID }, label: ">Investigate</a>" },
      {
        route: { name: "boq-lens", projectId: DEMO_TASK_PROJECT_ID },
        label: ">Understand costs</a>",
      },
      {
        route: { name: "solution", projectId: DEMO_SOLUTION_PROJECT_ID, query: {} },
        label: ">Build solution</a>",
      },
      { route: { name: "outcomes", projectId: DEMO_TASK_PROJECT_ID }, label: ">Review outcome</a>" },
    ];
    for (const { route, label } of cases) {
      const html = renderToStaticMarkup(
        <AppShell route={route} apiStatus={null}>
          <span />
        </AppShell>,
      );
      const current = html.indexOf('aria-current="page"');
      expect(current).toBeGreaterThanOrEqual(0);
      expect(html.slice(current)).toContain(label);
    }
  });
});

/* ------------------------------------------------------------------ */
/* 2. "Build solution" exposes the interactive workspace DIRECTLY       */
/* ------------------------------------------------------------------ */

describe("POST-004 — the build-solution entry (plan §2G)", () => {
  const shell = renderToStaticMarkup(
    <AppShell route={{ name: "dashboard" }} apiStatus={null}>
      <span />
    </AppShell>,
  );
  const solutionHref = formatRoute({
    name: "solution",
    projectId: DEMO_SOLUTION_PROJECT_ID,
    query: {},
  });
  const interventionHref = formatRoute({
    name: "intervention",
    projectId: "project-zurich-hq",
    query: {},
  });

  test("the nav's Build solution target IS the interactive workspace (no studio-first hop)", () => {
    const buildIndex = shell.indexOf(">Build solution</a>");
    expect(buildIndex).toBeGreaterThanOrEqual(0);
    // the entry's own href (the first href before the label text) is the solution route
    const hrefBefore = shell.slice(0, buildIndex).lastIndexOf('href="');
    expect(hrefBefore).toBeGreaterThanOrEqual(0);
    expect(shell.slice(hrefBefore).startsWith(`href="${solutionHref}"`)).toBe(true);
  });

  test("the nav presents BOTH build paths with the plain-language distinction", () => {
    expect(shell).toContain("Build interactively");
    expect(shell).toContain("Build an intervention");
    expect(shell).toContain(`href="${interventionHref}"`);
    // the plain-language distinction is in the labels themselves
    expect(shell).toContain("design and validate in the live workspace");
    expect(shell).toContain("layer-by-layer steps");
  });

  test("the Intervention Studio presents both paths at the TOP (a Build-solution arrival orients first)", () => {
    const html = renderToStaticMarkup(
      <StudioBody
        data={interventionData(canonicalScenario())}
        layer={0}
        selectedNodeId={null}
        onSelectNode={() => undefined}
        onReload={() => undefined}
      />,
    );
    expect(html).toContain('data-build-paths="true"');
    expect(html).toContain("Build an intervention — you are here");
    expect(html).toContain("Build interactively");
    // the interactive path is ONE CLICK away, in the same project
    expect(html).toContain(
      `href="${formatRoute({ name: "solution", projectId: STAGE_PROJECT, query: {} })}"`,
    );
    // the paths card renders BEFORE the technical surface (the layer walk)
    expect(html.indexOf('data-build-paths="true"')).toBeGreaterThanOrEqual(0);
    expect(html.indexOf(">Layer navigation<")).toBeGreaterThanOrEqual(0);
    expect(html.indexOf('data-build-paths="true"')).toBeLessThan(
      html.indexOf(">Layer navigation<"),
    );
  });

  test("the Solution surface presents both paths (the step-by-step path one click away)", () => {
    const html = renderToStaticMarkup(
      <SolutionSurface projectId={DEMO_SOLUTION_PROJECT_ID} query={{}} />,
    );
    expect(html).toContain('data-build-paths="true"');
    expect(html).toContain("Build interactively — you are here");
    expect(html).toContain("Build an intervention");
    expect(html).toContain(
      `href="${formatRoute({ name: "intervention", projectId: DEMO_SOLUTION_PROJECT_ID, query: {} })}"`,
    );
    // the honest staged position: Plan + Validate here; Approve/Execute/Compare
    // continue in the step-by-step workspace (no fabricated current stage)
    expect(html).toContain('data-stage-context="true"');
    expect(html).toContain("Plan → Validate → Approve → Execute → Compare");
    expect(html).toContain("step-by-step intervention workspace");
  });

  test("the dashboard journey step offers both build paths in plain language", () => {
    const html = renderToStaticMarkup(<DashboardBody data={DASHBOARD_DEMO} />);
    expect(html).toContain("Build solution — interactively");
    expect(html).toContain("as recorded steps");
    expect(html).toContain("both stay proposals until executed");
  });

  test("BuildSolutionPathsCard alone: the distinction is plain, both paths present", () => {
    const html = renderToStaticMarkup(
      <BuildSolutionPathsCard projectId={STAGE_PROJECT} current="intervention" />,
    );
    expect(html).toContain("Build an intervention — you are here");
    expect(html).toContain("Open the interactive workspace");
    expect(html).toContain("both paths stay proposals until executed");
  });
});

/* ------------------------------------------------------------------ */
/* 3. Plan → Validate → Approve → Execute → Compare, visibly staged     */
/* ------------------------------------------------------------------ */

describe("POST-004 — the staged solution journey (plan §2H)", () => {
  /** Render StudioBody for one scenario state and return its markup. */
  function stageMarkup(data: InterventionData): string {
    return renderToStaticMarkup(
      <StudioBody
        data={data}
        layer={0}
        selectedNodeId={null}
        onSelectNode={() => undefined}
        onReload={() => undefined}
      />,
    );
  }

  test("the five stages render in journey order on every state", () => {
    const html = stageMarkup(interventionData(canonicalScenario()));
    const positions = ["plan", "validate", "approve", "execute", "compare"].map(
      (stage) => html.indexOf(`data-stage="${stage}"`),
    );
    for (const position of positions) {
      expect(position).toBeGreaterThanOrEqual(0);
    }
    for (let index = 1; index < positions.length; index += 1) {
      expect(positions[index]!).toBeGreaterThan(positions[index - 1]!);
    }
    expect(html).toContain("Plan → Validate → Approve → Execute → Compare");
  });

  test("no plan yet: current stage Plan, next action = create the first plan", () => {
    const html = stageMarkup(interventionData(null));
    expect(html).toContain('data-current-stage="plan"');
    expect(html).toContain('data-next-action="create-scenario"');
    expect(html).toContain("Create the first intervention plan");
  });

  test("draft plan: current stage Plan (composing), next action = append a step", () => {
    const html = stageMarkup(interventionData(canonicalScenario()));
    expect(html).toContain('data-current-stage="plan"');
    expect(html).toContain('data-next-action="append-step"');
    // nothing is claimed done while the plan is still being composed
    expect(html).not.toContain('data-stage-state="done"');
    // the Plan chip itself is the current one
    expect(html).toContain('data-stage="plan" data-stage-state="current"');
  });

  test("under review: stage Validate, Plan done, next action = record the review", () => {
    const underReview: ViewerScenario = {
      ...canonicalScenario(),
      status: "under_review",
      transitions: [
        { status: "draft", at: "2026-07-01T08:00:00.000Z" },
        { status: "under_review", at: "2026-07-02T08:00:00.000Z" },
      ],
    };
    const html = stageMarkup(interventionData(underReview));
    expect(html).toContain('data-current-stage="validate"');
    expect(html).toContain('data-next-action="scenario-approval"');
    expect(html).toContain("Record the case review and decide");
    expect(html).toContain('data-stage="plan" data-stage-state="done"');
  });

  test("approved, nothing executed: stage Execute, next action = record the execution", () => {
    const html = stageMarkup(interventionData(approvedScenario(), { mode: "api" }));
    expect(html).toContain('data-current-stage="execute"');
    expect(html).toContain('data-next-action="record-execution"');
    expect(html).toContain("Record the execution");
  });

  test("approved + executed, no comparison: stage Compare, next action = run it", () => {
    const html = stageMarkup(
      interventionData(approvedScenario(), { mode: "api", executions: [EXECUTION] }),
    );
    expect(html).toContain('data-current-stage="compare"');
    expect(html).toContain('data-next-action="run-comparison"');
    expect(html).toContain("Run the plan-vs-reality comparison");
  });

  test("approved + executed + compared: the journey is complete, next = review the outcome", () => {
    const html = stageMarkup(
      interventionData(approvedScenario(), {
        mode: "api",
        executions: [EXECUTION],
        comparisons: [COMPARISON],
      }),
    );
    expect(html).toContain('data-current-stage="complete"');
    expect(html).toContain('data-next-action="outcomes"');
    expect(html).toContain(
      `href="${formatRoute({ name: "outcomes", projectId: STAGE_PROJECT })}"`,
    );
    expect((html.match(/data-stage-state="done"/g) ?? []).length).toBe(5);
  });

  test("a terminal status never claims progress (honest terminal state)", () => {
    const rejected: ViewerScenario = { ...canonicalScenario(), status: "rejected" };
    const html = stageMarkup(interventionData(rejected));
    expect(html).toContain('data-current-stage="terminal"');
    expect(html).toContain('data-terminal-status="rejected"');
    expect(html).not.toContain('data-stage-state="done"');
    expect(html).toContain("no further stages");
  });
});

/* ------------------------------------------------------------------ */
/* 4. Specialist details behind progressive disclosure                  */
/* ------------------------------------------------------------------ */

describe("POST-004 — the specialist-details disclosure (plan §2K)", () => {
  test("the step/provenance table renders inside a <details> disclosure (content kept)", () => {
    const html = renderToStaticMarkup(
      <StudioBody
        data={interventionData(canonicalScenario())}
        layer={0}
        selectedNodeId={null}
        onSelectNode={() => undefined}
        onReload={() => undefined}
      />,
    );
    expect(html).toContain("<details");
    expect(html).toContain('data-tech-details="true"');
    expect(html).toContain("Technical details — the recorded steps, kinds and provenance");
    // the technical record is ONE CLICK AWAY, not removed: the provenance
    // content stays in the markup
    expect(html).toContain("Provenance");
    expect(html).toContain("not yet applied");
  });

  test("the status timeline renders behind the disclosure (current status stays visible)", () => {
    const html = renderToStaticMarkup(
      <StudioBody
        data={interventionData(canonicalScenario())}
        layer={0}
        selectedNodeId={null}
        onSelectNode={() => undefined}
        onReload={() => undefined}
      />,
    );
    expect(html).toContain("Technical details — the recorded status timeline");
  });

  test("the approval panel keeps the plain result visible; the audit table is disclosed", () => {
    const html = renderToStaticMarkup(
      <ApprovalPanel
        scenario={approvedScenario()}
        mode="api"
        principalId="demo-evaluator"
        fetchImpl={neverFetch()}
        onTransitioned={() => undefined}
      />,
    );
    // the plain-language result stays visible
    expect(html).toContain("current status (verbatim)");
    expect(html).toMatch(/terminal|no further|final/i);
    // the audit trail is behind the disclosure, content intact
    expect(html).toContain("Technical details — the recorded status audit");
    expect(html).toContain("Recorded status");
  });
});

/* ------------------------------------------------------------------ */
/* The route map (exit-gate item 4, asserted)                          */
/* ------------------------------------------------------------------ */

describe("POST-004 — the before/after route map (no capability lost)", () => {
  test("every BASE nav deep link keeps an obvious entry at HEAD (the nav alone covers all surfaces)", () => {
    // The BASE nav's deep links: capture@proj-7f3a2b, sitetwin@proj-riverside-refit,
    // boq-lens@proj-riverside-refit, case@proj-riverside-refit,
    // intervention@project-zurich-hq, solution@proj-demo-001, outcomes@proj-7f3a2b.
    const shell = renderToStaticMarkup(
      <AppShell route={{ name: "dashboard" }} apiStatus={null}>
        <span />
      </AppShell>,
    );
    const baseEntries: readonly { readonly label: string; readonly route: Route }[] = [
      { label: "Corpus — Capture / Upload", route: { name: "capture", projectId: DEMO_TASK_PROJECT_ID } },
      { label: "Pilot — SiteTwin / Evidence", route: { name: "sitetwin", projectId: "proj-riverside-refit" } },
      { label: "Pilot — BOQ Lens", route: { name: "boq-lens", projectId: "proj-riverside-refit" } },
      { label: "Pilot — Engineering Case", route: { name: "case", projectId: "proj-riverside-refit" } },
      { label: "Scenario — Intervention Studio", route: { name: "intervention", projectId: "project-zurich-hq", query: {} } },
      { label: "Demo — Interactive Solution", route: { name: "solution", projectId: DEMO_SOLUTION_PROJECT_ID, query: {} } },
      { label: "Corpus — Outcomes", route: { name: "outcomes", projectId: DEMO_TASK_PROJECT_ID } },
    ];
    const lost: string[] = [];
    for (const entry of baseEntries) {
      const href = formatRoute(entry.route);
      // the capability keeps an entry when EITHER the exact project's link
      // or the surface entry (any project) is present in the primary nav
      const kept =
        shell.includes(`href="${href}"`) ||
        new RegExp(`href="#/projects/[^"]+/${entry.route.name}"`).test(shell);
      if (!kept) {
        lost.push(entry.label);
      }
    }
    expect(lost).toEqual([]);
  });

  test("the plain-language dashboard journey covers the five task verbs", () => {
    const html = renderToStaticMarkup(<DashboardBody data={DASHBOARD_DEMO} />);
    for (const verb of [
      "Capture the evidence",
      "Understand the cost scope",
      "Investigate the case",
      "Build solution",
      "Review the outcome",
    ]) {
      expect(html).toContain(verb);
    }
    expect(html).not.toContain("pilot world");
  });
});
