/**
 * POST-006 — the ACCEPTANCE discoverability sweep for every bridge
 * POST-004 / POST-004B / POST-005 landed (plan §6 Wave 1 Worker 3, item 1;
 * plan §7 acceptance criteria "Discoverability" + "No orphaned
 * capabilities").
 *
 * The acceptance question is the USER's question, asked surface-by-surface:
 * for every new capability, is there AT LEAST ONE obvious user-facing entry
 * from an appropriate task context — reached by navigation, labeled in task
 * language, never requiring source knowledge? Three lanes per plan §6:
 *
 *  - BROWSER bridges (POST-004 nav/entry/staging/disclosure, POST-004B
 *    solution-world card + principal-resolution hold, POST-005's four
 *    bridge surfaces): each bridge's own SURFACE composes it, its entry is
 *    visible task vocabulary, and an inbound navigation path exists;
 *  - MOBILE bridges (the aise://task task handoff + deep-link
 *    continuation + post-work entry): the WEB side of each bridge emits
 *    the canonical deep link (the mobile adapter's entry point) from its
 *    task context, the links round-trip through the adapter-contract
 *    codec, and the committed Android entry (manifest VIEW intent filter)
 *    + the journey replay rows exist — read from the committed sources
 *    (the task-handoff.android-wiring.test.ts file-reading discipline:
 *    reading committed files is not an import-zone crossing);
 *  - COMBINED bridges (the X-journey continuations): the web-built
 *    handoff's continuation key survives the deep-link codec round-trip
 *    from every emitting surface.
 *
 * Static-render honesty (the established convention): effects never run in
 * static rendering, so fetch-driven panels render their LOADING state —
 * surface renders prove the WIRING (the bridge panel is composed on its
 * task surface), and the BODY renders over the committed demo/task-flow
 * records prove the VISIBLE entries (headings, actions, task language).
 */

import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ReactNode } from "react";
import { parseHash, formatRoute, type Route } from "./router";
import { AppShell } from "./AppShell";
import { NotFound, UnresolvedPrincipalPanel } from "./App";
import { AppEnvironmentContext } from "./environment";
import { ProjectSurfaceNav } from "./components";
import { CanonicalActionBar, TaskCompositionPanelBody } from "../parity/components";
import {
  TaskFirstLanding,
  TaskFlowPanelBody,
  TaskFlowStripBody,
  type TaskFlowResourceData,
} from "./task-first";
import { taskFlowView } from "./task-flow";
import { demoTaskFlowBundle, DEMO_TASK_PROJECT_ID } from "./task-dataset";
import {
  DEMO_PROJECT_ID,
  DEMO_SCENARIO_PROJECT_ID,
  DEMO_SOLUTION_PROJECT_ID,
  demoCase,
  demoEvidenceList,
  demoScenario,
} from "./demo";
import type { ApiStatus } from "./api";
import { viewerGeometries } from "../viewer/fixtures";
import type { ViewerScenario } from "../viewer";
import { Dashboard } from "./surfaces/Dashboard";
import { Projects } from "./surfaces/Projects";
import { ProjectOverview } from "./surfaces/ProjectOverview";
import {
  CaptureMission,
  CrossDeviceHandoffBody,
  fieldCaptureHandoff,
} from "./surfaces/CaptureMission";
import { SiteTwin } from "./surfaces/SiteTwin";
import { BoqLensSurface, BoqRevisionSelectorCard } from "./surfaces/BoqLens";
import { CaseBody, MissingEvidenceCaptureBridgeBody } from "./surfaces/EngineeringCase";
import { StudioBody } from "./surfaces/InterventionStudio";
import type { InterventionData } from "./surfaces/InterventionStudio";
import { SolutionSurface } from "./surfaces/Solution";
import { OutcomesBody } from "./surfaces/Outcomes";
import { Settings } from "./surfaces/Settings";
import { parseFieldTaskDeepLink } from "@aise/adapter-contract/task-handoff";
import type { FieldTaskHandoff } from "@aise/adapter-contract/task-handoff";

/* ------------------------------------------------------------------ */
/* The environment + fixtures                                          */
/* ------------------------------------------------------------------ */

/** The demo environment's probed status (API absent — the committed demo world). */
const DEMO_STATUS: ApiStatus = {
  mode: "unavailable",
  healthz: "failed",
  readyz: "skipped",
  detail: "the API did not answer /healthz on this origin — showing demo data",
  providers: null,
};

/** Wrap a node in the app environment (the real App always provides one). */
function withEnv(node: ReactNode): ReactNode {
  return (
    <AppEnvironmentContext.Provider
      value={{
        apiStatus: DEMO_STATUS,
        fetchImpl: (input) => Promise.reject(new Error(`no transport for ${input}`)),
        principalId: "user-alice",
      }}
    >
      {node}
    </AppEnvironmentContext.Provider>
  );
}

const bundle = demoTaskFlowBundle();
const taskData: TaskFlowResourceData = {
  mode: "demo",
  projectId: DEMO_TASK_PROJECT_ID,
  view: taskFlowView(bundle, DEMO_TASK_PROJECT_ID),
  bundle,
};

/** Pull the emitted deep link out of a static render (HTML-unescaped). */
function extractDeepLink(html: string): string {
  const match = /href="(aise:\/\/task[^"]*)"/.exec(html);
  expect(match).not.toBeNull();
  return match![1]!.replace(/&amp;/g, "&");
}

/** One deterministic prepared handoff (the bridge builders' output shape). */
const gapHandoff: FieldTaskHandoff = fieldCaptureHandoff({
  projectId: DEMO_TASK_PROJECT_ID,
  taskId: `task-capture-${bundle.evidence?.gaps[0]?.gapId ?? "gap-4471"}`,
  intent: bundle.evidence?.gaps[0]?.description ?? "capture the missing reference",
  targetRefs: [bundle.caseSummary?.caseId ?? "case-91ab", bundle.evidence?.gaps[0]?.gapId ?? "gap-4471"],
  epistemicState: bundle.caseSummary?.status ?? "under-review",
  originSurface: "capture",
  versionContext: {},
  issuedAt: "2026-09-26T12:00:00.000Z",
});

/* ------------------------------------------------------------------ */
/* The full surface corpus (all eleven routed surfaces, demo mode)     */
/* ------------------------------------------------------------------ */

const SURFACES: readonly { readonly name: string; readonly node: ReactNode }[] = [
  { name: "dashboard", node: withEnv(<Dashboard />) },
  { name: "projects", node: withEnv(<Projects />) },
  { name: "project", node: withEnv(<ProjectOverview projectId={DEMO_PROJECT_ID} />) },
  { name: "capture", node: withEnv(<CaptureMission projectId={DEMO_TASK_PROJECT_ID} />) },
  { name: "sitetwin", node: withEnv(<SiteTwin projectId={DEMO_PROJECT_ID} />) },
  { name: "boq-lens", node: withEnv(<BoqLensSurface projectId={DEMO_PROJECT_ID} />) },
  { name: "case", node: withEnv(<CaseBody data={caseData()} />) },
  { name: "intervention", node: withEnv(<StudioBody data={studioData()} layer={0} selectedNodeId={null} onSelectNode={() => {}} onReload={() => {}} />) },
  { name: "solution", node: withEnv(<SolutionSurface projectId={DEMO_SOLUTION_PROJECT_ID} query={{}} />) },
  { name: "outcomes", node: withEnv(<OutcomesBody data={outcomeData()} query="" onQuery={() => {}} hits={null} />) },
  {
    name: "settings",
    node: withEnv(
      <Settings principalId="user-alice" onPrincipalChange={() => {}} onReprobe={() => {}} />,
    ),
  },
];

/** The demo case body's data (the pilot project's records — the demo case). */
function caseData() {
  return {
    mode: "demo" as const,
    projectId: DEMO_PROJECT_ID,
    demo: {
      caseView: demoCase(DEMO_PROJECT_ID),
      evidence: demoEvidenceList(DEMO_PROJECT_ID),
      scenario: demoScenario(DEMO_PROJECT_ID),
    },
    live: null,
  };
}

/** The demo intervention body's data (the demo scenario project's records). */
function studioData(): InterventionData {
  const scenario: ViewerScenario | null = demoScenario(DEMO_SCENARIO_PROJECT_ID);
  return {
    mode: "demo",
    projectId: DEMO_SCENARIO_PROJECT_ID,
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
    executions: [],
    comparisons: [],
  };
}

/** The demo outcomes body's data (the corpus project's task-flow bundle). */
function outcomeData() {
  return {
    mode: "demo" as const,
    projectId: DEMO_TASK_PROJECT_ID,
    demo: {
      bundle,
      scenarioPresent: demoScenario(DEMO_TASK_PROJECT_ID) !== null,
    },
    live: null,
  };
}

/** The composed chrome + journey panels (the navigation contexts). */
const CHROME: readonly { readonly name: string; readonly node: ReactNode }[] = [
  {
    name: "app-shell",
    node: <AppShell route={{ name: "dashboard" }} apiStatus={DEMO_STATUS}><div /></AppShell>,
  },
  { name: "not-found", node: <NotFound hash="#/nope" /> },
  { name: "landing", node: withEnv(<TaskFirstLanding />) },
  { name: "task-flow-panel", node: <TaskFlowPanelBody data={taskData} /> },
  { name: "task-flow-strip", node: <TaskFlowStripBody data={taskData} /> },
  { name: "composed-journey", node: <TaskCompositionPanelBody data={taskData} /> },
  {
    name: "canonical-actions",
    node: <CanonicalActionBar projectId={DEMO_TASK_PROJECT_ID} />,
  },
  {
    name: "project-surface-nav",
    node: <ProjectSurfaceNav projectId={DEMO_TASK_PROJECT_ID} current="capture" />,
  },
];

/** The names of the eleven routed surfaces in the corpus (the chrome entries excluded). */
const SURFACE_NAMES: ReadonlySet<string> = new Set([
  "dashboard",
  "projects",
  "project",
  "capture",
  "sitetwin",
  "boq-lens",
  "case",
  "intervention",
  "solution",
  "outcomes",
  "settings",
]);

const RENDERED: readonly { readonly name: string; readonly html: string }[] = [
  ...SURFACES,
  ...CHROME,
].map((entry) => ({ name: entry.name, html: renderToStaticMarkup(entry.node) }));

const byName = (name: string): string => RENDERED.find((entry) => entry.name === name)!.html;

/* ------------------------------------------------------------------ */
/* Lane BROWSER — every new bridge has an obvious entry on its surface */
/* ------------------------------------------------------------------ */

describe("POST-006 discoverability — BROWSER bridges (POST-004/004B/005)", () => {
  test("the task-first navigation is the entry from EVERY routed surface (no surface strands the journey)", () => {
    // Every routed surface produces real markup (its page-head/crumbs
    // thread back to the journey), and the shell's primary nav labels the
    // journey's task verbs — the entry context is present everywhere.
    for (const { name, html } of RENDERED) {
      if (!SURFACE_NAMES.has(name)) {
        continue;
      }
      expect(html.length).toBeGreaterThan(0);
    }
    const shell = byName("app-shell");
    for (const verb of ["Dashboard", "Capture", "Investigate", "Understand costs", "Build solution", "Review outcome", "Projects"]) {
      expect(shell).toContain(verb);
    }
  });

  test("the direct build-solution entry: the nav's target IS the interactive workspace (both build paths as subs)", () => {
    const shell = byName("app-shell");
    const solutionHref = formatRoute({
      name: "solution",
      projectId: DEMO_SOLUTION_PROJECT_ID,
      query: {},
    });
    // the PRIMARY entry targets the solution route directly…
    expect(shell).toContain(`href="${solutionHref}"`);
    // …with both paths presented in plain language (no studio-first hop)
    expect(shell).toContain("Build interactively");
    expect(shell).toContain("Build an intervention");
    const interventionHref = formatRoute({
      name: "intervention",
      projectId: DEMO_SCENARIO_PROJECT_ID,
      query: {},
    });
    expect(shell).toContain(`href="${interventionHref}"`);
    expect(shell).not.toMatch(new RegExp(`href="#/projects/[^"]+/intervention"[^>]*>\\s*Build solution`));
  });

  test("POST-004B the solution world is discoverable from the Projects surface in BOTH modes (no source knowledge needed)", () => {
    // The Projects SURFACE always composes the SolutionWorldCard (it is not
    // registry-driven), and its entry is visible task vocabulary linking
    // the walkthrough route directly.
    const projects = byName("projects");
    expect(projects).toContain("Build solution — the interactive walkthrough");
    expect(projects).toContain("open the interactive walkthrough");
    expect(projects).toContain(
      `href="${formatRoute({ name: "solution", projectId: DEMO_SOLUTION_PROJECT_ID, query: {} })}"`,
    );
    // honesty labeling: the walkthrough world is its own project, never
    // presented as an identity-registry project
    expect(projects).toContain("outside this organization");
  });

  test("the staged solution journey renders on the intervention surface (Plan → Validate → Approve → Execute → Compare)", () => {
    const studio = byName("intervention");
    expect(studio).toContain("Plan");
    expect(studio).toContain("Validate");
    expect(studio).toContain("Approve");
    expect(studio).toContain("Execute");
    expect(studio).toContain("Compare");
  });

  test("the specialist details sit behind progressive disclosure on the intervention surface (kept, one click away)", () => {
    const studio = byName("intervention");
    expect(studio).toContain("<details");
    expect(studio).toContain("<summary");
  });

  test("the solution surface orients BOTH build paths at arrival (a Build-solution entry lands oriented)", () => {
    const solution = byName("solution");
    expect(solution).toContain('data-build-paths="true"');
    expect(solution).toContain("Build an intervention");
    expect(solution).toContain("Build interactively");
  });

  test("POST-004B the principal-resolution hold panel is the honest entry state (visible, actionable, no dead ends)", () => {
    const html = renderToStaticMarkup(<UnresolvedPrincipalPanel />);
    expect(html).toContain("session is authenticated");
    expect(html).toContain("sign out");
    expect(html).toContain("sign in again");
    expect(html).toContain("enter the demo");
    // the hold states its reason (no silent guess) and its resolution path
    expect(html).toContain("held");
    expect(html).toContain("remembered per tab at sign-in");
  });
});

/* ------------------------------------------------------------------ */
/* Lane BROWSER — the four POST-005 bridge surfaces                    */
/* ------------------------------------------------------------------ */

describe("POST-006 discoverability — the four POST-005 bridge surfaces", () => {
  test("the CROSS-DEVICE HANDOFF bridge is composed on the Capture surface with its visible task context", () => {
    // Surface wiring: the capture surface composes the handoff panel (its
    // task-flow resource renders the shared loading state statically —
    // the always-rendered panel proves the composition).
    const capture = byName("capture");
    expect(capture).toContain("Loading the task-first flow…");
    // Visible entry (the body over the committed records): the heading is
    // task language naming the next action's device.
    const handoff = renderToStaticMarkup(
      <CrossDeviceHandoffBody data={taskData} handoff={null} onPrepare={() => {}} />,
    );
    expect(handoff).toContain("Continue this task on the mobile field app");
    expect(handoff).toContain("belongs on the phone");
  });

  test("the BOQ REVISION SELECTOR bridge is composed on the BOQ Lens surface with a NAMED import (never a silent guess)", () => {
    // Surface wiring: the lens surface ALWAYS composes the selector card.
    const lens = byName("boq-lens");
    expect(lens).toContain('data-selector-state="loading"');
    // Visible entry: every recorded import is listed with its own Inspect
    // action and the source-vs-solution separation is stated.
    const selector = renderToStaticMarkup(
      <BoqRevisionSelectorCard
        mode="demo"
        projectId={DEMO_PROJECT_ID}
        imports={[
          { importId: "imp-2024-boq-001", format: "xlsx", byteSize: 38214, parseStatus: "parsed" },
          { importId: "imp-2025-boq-002", format: "csv", byteSize: 12045, parseStatus: "parsed" },
        ]}
        selectedImportId="imp-2024-boq-001"
        onSelectImport={() => {}}
      />,
    );
    expect(selector).toContain("SOURCE BOQ documents");
    expect(selector).toContain('data-inspect-import="imp-2024-boq-001"');
    expect(selector).toContain('data-inspect-import="imp-2025-boq-002"');
    expect(selector).toContain("Inspecting");
  });

  test("the MISSING-EVIDENCE → CAPTURE bridge is composed on the Case surface (each open declaration → its own capture task)", () => {
    // Surface wiring: the Case BODY (the pilot project's demo records)
    // composes the bridge panel (its task-flow resource renders the shared
    // loading state statically — the always-rendered panel proves it).
    const caseHtml = byName("case");
    expect(caseHtml).toContain("Loading the task-first flow…");
    // Visible entry (the body over the committed records): the entry is
    // case-specific capture vocabulary, not a generic capture pointer.
    const bridge = renderToStaticMarkup(
      <MissingEvidenceCaptureBridgeBody
        projectId={DEMO_TASK_PROJECT_ID}
        mode="demo"
        caseId={bundle.caseSummary?.caseId ?? "case-91ab"}
        caseStatus={bundle.caseSummary?.status ?? "under-review"}
        entries={(bundle.evidence?.gaps ?? []).map((gap) => ({
          key: gap.gapId,
          kind: gap.kind,
          description: gap.description,
          status: "open",
        }))}
        missingEvidenceCount={bundle.evidence?.gaps.length ?? 0}
        prepared={null}
        onPrepare={() => {}}
      />,
    );
    expect(bridge).toContain("Capture the missing evidence — for this case");
    expect(bridge).toContain("capture this evidence");
    expect(bridge).toContain("on this device");
    expect(bridge).toContain("field device");
    // both device paths are offered per open declaration
    expect(bridge).toContain('data-bridge-device="this-device"');
    expect(bridge).toContain('data-bridge-device="field-device"');
    // the this-device path joins THIS project's capture surface
    expect(bridge).toContain(`href="#/projects/${DEMO_TASK_PROJECT_ID}/capture"`);
  });

  test("the POST-WORK CAPTURE RETURN bridge is composed on the Outcomes surface (the completed return path visible)", () => {
    const outcomes = byName("outcomes");
    expect(outcomes).toContain("post-work evidence");
    expect(outcomes).toContain('data-postwork-landed="true"');
  });
});

/* ------------------------------------------------------------------ */
/* Lane MOBILE — the aise://task entries (web side + committed Android */
/* side + the replay rows)                                             */
/* ------------------------------------------------------------------ */

describe("POST-006 discoverability — MOBILE bridges (task handoff + deep-link continuation + post-work entry)", () => {
  const REPO_ROOT = join(import.meta.dir, "..", "..", "..", "..");

  test("every web-side bridge that emits a task handoff renders the canonical aise://task link (the mobile entry)", () => {
    const handoff = renderToStaticMarkup(
      <CrossDeviceHandoffBody data={taskData} handoff={gapHandoff} onPrepare={() => {}} />,
    );
    expect(handoff).toContain(`data-handoff-link="true"`);
    expect(extractDeepLink(handoff).startsWith("aise://task?")).toBe(true);
  });

  test("the case bridge's prepared per-declaration handoff renders the deep link from the case's task context", () => {
    const entries = (bundle.evidence?.gaps ?? []).map((gap) => ({
      key: gap.gapId,
      kind: gap.kind,
      description: gap.description,
      status: "open",
    }));
    const html = renderToStaticMarkup(
      <MissingEvidenceCaptureBridgeBody
        projectId={DEMO_TASK_PROJECT_ID}
        mode="demo"
        caseId={bundle.caseSummary?.caseId ?? "case-91ab"}
        caseStatus={bundle.caseSummary?.status ?? "under-review"}
        entries={entries}
        missingEvidenceCount={entries.length}
        prepared={{ key: entries[0]?.key ?? "gap-4471", handoff: gapHandoff }}
        onPrepare={() => {}}
      />,
    );
    expect(html).toContain(`data-bridge-handoff="${entries[0]?.key ?? "gap-4471"}"`);
    expect(extractDeepLink(html).startsWith("aise://task?")).toBe(true);
  });

  test("the committed Android entry exists (manifest VIEW intent filter, singleTask) — source-level, deterministic", () => {
    const manifest = readFileSync(
      join(REPO_ROOT, "apps/android/app/src/main/AndroidManifest.xml"),
      "utf8",
    );
    expect(manifest).toContain('android:scheme="aise"');
    expect(manifest).toContain('android:host="task"');
    expect(manifest).toContain("android.intent.action.VIEW");
    expect(manifest).toContain("android:launchMode="); // singleTask routing (onNewIntent)
  });

  test("every new mobile/combined bridge has a journey replay row (the harness records the continuation lanes)", () => {
    const mSource = readFileSync(join(REPO_ROOT, "tools/journey/m.ts"), "utf8");
    for (const row of ["m.handoff-envelope", "m.deeplink-continuation", "m.postwork-entry"]) {
      expect(mSource).toContain(`id: "${row}"`);
    }
    const xSource = readFileSync(join(REPO_ROOT, "tools/journey/x.ts"), "utf8");
    for (const row of ["x.boq-revision-selection", "x.handoff-roundtrip", "x.postwork-return"]) {
      expect(xSource).toContain(`id: "${row}"`);
    }
  });
});

/* ------------------------------------------------------------------ */
/* Lane COMBINED — the continuation key survives from every emitter    */
/* ------------------------------------------------------------------ */

describe("POST-006 discoverability — COMBINED (web → link → continuation, deterministic)", () => {
  test("the handoff emitted from the capture surface's task context round-trips through the codec (identity preserved)", () => {
    const handoff = renderToStaticMarkup(
      <CrossDeviceHandoffBody data={taskData} handoff={gapHandoff} onPrepare={() => {}} />,
    );
    const parsed = parseFieldTaskDeepLink(extractDeepLink(handoff));
    expect(parsed.kind).toBe("valid");
    if (parsed.kind === "valid") {
      expect(parsed.handoff).toEqual(gapHandoff);
      expect(parsed.handoff.taskId).toBe(gapHandoff.taskId);
      expect(parsed.handoff.projectId).toBe(DEMO_TASK_PROJECT_ID);
    }
  });
});

/* ------------------------------------------------------------------ */
/* No orphan surface: every routed surface has an inbound path          */
/* ------------------------------------------------------------------ */

describe("POST-006 discoverability — no orphan surface (every surface reachable by navigation)", () => {
  const ROUTES: readonly Route[] = [
    { name: "dashboard" },
    { name: "projects" },
    { name: "project", projectId: DEMO_PROJECT_ID },
    { name: "capture", projectId: DEMO_TASK_PROJECT_ID },
    { name: "sitetwin", projectId: DEMO_PROJECT_ID },
    { name: "boq-lens", projectId: DEMO_PROJECT_ID },
    { name: "case", projectId: DEMO_TASK_PROJECT_ID },
    { name: "intervention", projectId: DEMO_SCENARIO_PROJECT_ID, query: {} },
    { name: "solution", projectId: DEMO_SOLUTION_PROJECT_ID, query: {} },
    { name: "outcomes", projectId: DEMO_TASK_PROJECT_ID },
    { name: "settings" },
  ];

  test("every product route is pointed-to by at least one composed render (surface or chrome)", () => {
    const orphans: string[] = [];
    for (const route of ROUTES) {
      const href = formatRoute(route);
      const pointedTo = RENDERED.some(({ html }) => html.includes(`href="${href}"`));
      if (!pointedTo) {
        orphans.push(`${route.name} (${href})`);
      }
    }
    expect(orphans).toEqual([]);
  });

  test("every hash link any composed render carries addresses a real route (no dead pointers, new bridges included)", () => {
    const dead: string[] = [];
    for (const { name, html } of RENDERED) {
      for (const match of html.matchAll(/href="(#[^"]+)"/g)) {
        const href = match[1]!;
        if (!href.startsWith("#/")) {
          continue; // in-page anchors
        }
        // attribute values carry HTML-escaped ampersands — unescape before
        // the route codec sees them (a query link is not a dead pointer).
        const unescaped = href.replace(/&amp;/g, "&");
        if (parseHash(unescaped).name === "not-found") {
          dead.push(`${name}: ${href}`);
        }
      }
    }
    expect(dead).toEqual([]);
  });
});
