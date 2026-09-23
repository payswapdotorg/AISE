/**
 * PROD-034 — the CROSS-ROUTE DISCOVERABILITY SWEEP (the item's navigation
 * pass: the primary journey's threading actually exposes the new surfaces).
 *
 * One navigation pass over the app shell's composed renders (static —
 * the surfaces-create.test.tsx discipline, wrapped in the app environment
 * so context-driven pieces render their real states): every hash link the
 * journey composes is PARSED (no dead pointers — a link that addresses no
 * real route is a defect), every surface is POINTED-TO (no orphaned
 * surface — reachable only by typing an address is a discoverability
 * defect), and each new element of this work item (the capture mission,
 * the BOQ import, the envelope cards, the contextual integrations, the
 * provider notes) is threaded at its intended point.
 *
 * Static-render honesty: resource-driven panels render their LOADING state
 * here (effects do not run in static markup) — the always-rendered panels
 * prove the surface wiring, and the ready-state threading is proven by the
 * pure bodies (the same render functions the panels call).
 */

import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { parseHash, formatRoute, type Route } from "./router";
import { AppShell } from "./AppShell";
import { NotFound } from "./App";
import { CanonicalActionBar, TaskCompositionPanelBody } from "../parity/components";
import { ProjectSurfaceNav } from "./components";
import { AppEnvironmentContext } from "./environment";
import {
  TaskFirstLanding,
  TaskFlowPanelBody,
  TaskFlowStripBody,
} from "./task-first";
import type { TaskFlowResourceData } from "./task-first";
import {
  BrowserCaptureLimitsCard,
  CaptureMissionBody,
  CaptureUploadCardBody,
  CaptureMission,
} from "./surfaces/CaptureMission";
import { BoqImportPanelBody } from "./surfaces/BoqImport";
import { BoqLensSurface } from "./surfaces/BoqLens";
import { ContextualIntegrationsPanelBody } from "./contextual-integrations";
import { CaseBody } from "./surfaces/EngineeringCase";
import { taskFlowView } from "./task-flow";
import { demoTaskFlowBundle, DEMO_TASK_PROJECT_ID } from "./task-dataset";
import {
  DEMO_PROJECT_ID,
  demoCase,
  demoEvidenceList,
  demoScenario,
} from "./demo";
import type { ApiStatus } from "./api";

/** The demo environment's probed status (API absent — the committed demo world). */
const DEMO_STATUS: ApiStatus = {
  mode: "unavailable",
  healthz: "failed",
  readyz: "skipped",
  detail: "the API did not answer /healthz on this origin — showing demo data",
  providers: null,
};

const bundle = demoTaskFlowBundle();
const taskData: TaskFlowResourceData = {
  mode: "demo",
  projectId: DEMO_TASK_PROJECT_ID,
  view: taskFlowView(bundle, DEMO_TASK_PROJECT_ID),
  bundle,
};

const noop = () => {};

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

/* The navigation corpus: every composed render the journey threads through. */
const CORPUS: readonly { readonly name: string; readonly node: ReactNode }[] = [
  {
    name: "app-shell",
    node: (
      <AppShell route={{ name: "dashboard" }} apiStatus={DEMO_STATUS}>
        <div />
      </AppShell>
    ),
  },
  { name: "not-found", node: <NotFound hash="#/nope" /> },
  { name: "canonical-actions", node: <CanonicalActionBar projectId={DEMO_TASK_PROJECT_ID} /> },
  {
    name: "project-surface-nav",
    node: <ProjectSurfaceNav projectId={DEMO_TASK_PROJECT_ID} current="capture" />,
  },
  { name: "task-flow-panel", node: <TaskFlowPanelBody data={taskData} /> },
  { name: "task-flow-strip", node: <TaskFlowStripBody data={taskData} /> },
  { name: "composed-journey", node: <TaskCompositionPanelBody data={taskData} /> },
  { name: "capture-mission", node: <CaptureMissionBody data={taskData} /> },
  {
    name: "capture-upload",
    node: (
      <CaptureUploadCardBody
        projectId={DEMO_TASK_PROJECT_ID}
        demo={true}
        digestAvailable={true}
        file={null}
        reading={false}
        submitting={false}
        outcome={null}
        onFileSelected={noop}
        onSubmit={noop}
      />
    ),
  },
  { name: "browser-capture-limits", node: <BrowserCaptureLimitsCard /> },
  {
    name: "boq-import",
    node: (
      <BoqImportPanelBody
        projectId={DEMO_PROJECT_ID}
        demo={true}
        format="csv"
        onFormat={noop}
        file={null}
        reading={false}
        submitting={false}
        outcome={null}
        onFileSelected={noop}
        onSubmit={noop}
      />
    ),
  },
  {
    name: "contextual-integrations",
    node: <ContextualIntegrationsPanelBody data={taskData} demo={true} />,
  },
  {
    name: "case-surface",
    node: (
      <CaseBody
        data={{
          mode: "demo",
          projectId: DEMO_PROJECT_ID,
          demo: {
            caseView: demoCase(DEMO_PROJECT_ID),
            evidence: demoEvidenceList(DEMO_PROJECT_ID),
            scenario: demoScenario(DEMO_PROJECT_ID),
          },
          live: null,
        }}
      />
    ),
  },
  { name: "landing", node: withEnv(<TaskFirstLanding />) },
  {
    name: "capture-surface",
    node: withEnv(<CaptureMission projectId={DEMO_TASK_PROJECT_ID} />),
  },
  {
    name: "boq-lens-surface",
    node: withEnv(<BoqLensSurface projectId={DEMO_PROJECT_ID} />),
  },
];

/** Every `#/` hash link one corpus render composes (in-page anchors excluded). */
function hashLinks(html: string): string[] {
  return [...html.matchAll(/href="(#[^"]+)"/g)]
    .map((match) => match[1]!)
    .filter((href) => href.startsWith("#/"));
}

/** The rendered corpus (rendered once; every check reads the same pass). */
const RENDERED: readonly { readonly name: string; readonly html: string }[] = CORPUS.map(
  (entry) => ({ name: entry.name, html: renderToStaticMarkup(entry.node) }),
);

describe("PROD-034 cross-route sweep — no dead pointers", () => {
  test("every hash link the journey composes addresses a real route", () => {
    const dead: string[] = [];
    for (const { name, html } of RENDERED) {
      for (const href of hashLinks(html)) {
        const route = parseHash(href);
        if (route.name === "not-found") {
          dead.push(`${name}: ${href}`);
        }
      }
    }
    expect(dead).toEqual([]);
  });
});

describe("PROD-034 cross-route sweep — no orphaned surfaces", () => {
  const ROUTES: readonly Route[] = [
    { name: "dashboard" },
    { name: "projects" },
    { name: "project", projectId: DEMO_TASK_PROJECT_ID },
    { name: "capture", projectId: DEMO_TASK_PROJECT_ID },
    { name: "sitetwin", projectId: DEMO_TASK_PROJECT_ID },
    { name: "boq-lens", projectId: DEMO_TASK_PROJECT_ID },
    { name: "case", projectId: DEMO_TASK_PROJECT_ID },
    { name: "intervention", projectId: DEMO_TASK_PROJECT_ID, query: {} },
    { name: "solution", projectId: DEMO_PROJECT_ID, query: {} },
    { name: "outcomes", projectId: DEMO_TASK_PROJECT_ID },
    { name: "settings" },
  ];

  test("every product surface is pointed-to by at least one composed render", () => {
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

  test("the capture mission is threaded from MANY points (action bar, surface nav, gap suggestions, app nav, guidance)", () => {
    // Any project's capture address counts (the guidance links the pilot
    // project's; the canonical bar links the corpus project's).
    const pointing = RENDERED.filter(({ html }) =>
      /href="#\/projects\/[^"]+\/capture"/.test(html),
    ).map((entry) => entry.name);
    expect(pointing.length).toBeGreaterThanOrEqual(6);
    expect(pointing).toContain("canonical-actions");
    expect(pointing).toContain("project-surface-nav");
    expect(pointing).toContain("composed-journey");
    expect(pointing).toContain("app-shell");
    expect(pointing).toContain("not-found");
  });

  test("the BOQ import is discoverable from the journey (the boq-lens step) and lives on the lens surface", () => {
    const boqHref = formatRoute({ name: "boq-lens", projectId: DEMO_TASK_PROJECT_ID });
    expect(RENDERED.find((entry) => entry.name === "task-flow-panel")!.html).toContain(
      `href="${boqHref}"`,
    );
    // The lens SURFACE mounts the import panel (always rendered) AND the
    // contextual-integrations panel (its task-flow resource renders the
    // shared loading state alongside the strip's).
    const lens = RENDERED.find((entry) => entry.name === "boq-lens-surface")!.html;
    expect(lens).toContain("Import a SOURCE BOQ");
    const taskFlowLoading = (lens.match(/Loading the task-first flow…/g) ?? []).length;
    expect(taskFlowLoading).toBe(2);
  });
});

describe("PROD-034 cross-route sweep — the new elements are threaded where they belong", () => {
  test("the LANDING composes the task-first flow AND the contextual integrations panel", () => {
    const landing = RENDERED.find((entry) => entry.name === "landing")!.html;
    // The canonical actions (the capture entry) + the intent form.
    expect(landing).toContain(
      `href="${formatRoute({ name: "capture", projectId: DEMO_TASK_PROJECT_ID })}"`,
    );
    expect(landing).toContain("What do you need to do?");
    // The task-flow panel AND the integrations panel both mount (each
    // renders the shared task-flow loading state).
    const loadingCount = (landing.match(/Loading the task-first flow…/g) ?? []).length;
    expect(loadingCount).toBe(2);
  });

  test("the capture SURFACE mounts the guided mission, the upload entry and the honest limits card", () => {
    const surface = RENDERED.find((entry) => entry.name === "capture-surface")!.html;
    expect(surface).toContain("Upload one capture asset");
    expect(surface).toContain("What this browser can and cannot capture");
    expect(surface).toContain("Capture / Upload");
  });

  test("the evidence envelope is visible at BOTH consequential decisions (readiness + case)", () => {
    expect(RENDERED.find((entry) => entry.name === "task-flow-panel")!.html).toContain(
      "Why this readiness verdict?",
    );
    expect(RENDERED.find((entry) => entry.name === "case-surface")!.html).toContain(
      "What is this case based on?",
    );
  });

  test("the contextual integrations render the incumbent reference and point at the brokered panel", () => {
    const integrations = RENDERED.find(
      (entry) => entry.name === "contextual-integrations",
    )!.html;
    expect(integrations).toContain("ERP-BOQ-2026-0042");
    expect(integrations).toContain(`href="${formatRoute({ name: "settings" })}"`);
  });

  test("the provider-status note renders at the provider-gated capture entry (consistent vocabulary)", () => {
    const surface = RENDERED.find((entry) => entry.name === "capture-surface")!.html;
    expect(surface).toContain('data-provider-note="the capture upload"');
    expect(surface).toContain("demo data");
    expect(surface).toContain("provider statuses are not probeable");
  });

  test("the strip's journey link answers the dashboard (the thread back to the landing)", () => {
    const strip = RENDERED.find((entry) => entry.name === "task-flow-strip")!.html;
    expect(strip).toContain(`href="${formatRoute({ name: "dashboard" })}"`);
  });
});
