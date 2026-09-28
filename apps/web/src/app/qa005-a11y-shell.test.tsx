/**
 * QA-005 — the a11y shell polish proofs (D6a/D6b/D6c), failing-first:
 *
 *  D6a — no duplicate identical headings on the dashboard: the page-head h1
 *    asks "What do you need to do?" and the task-intent entry card's h2 must
 *    NAME WHAT THE CARD HOLDS (the entry-point chooser), so a screen-reader
 *    user navigating by headings never hears the same heading twice with no
 *    distinguishing context (WCAG 2.4.6 / 1.3.1);
 *  D6b — exactly ONE <main> per page: the document shell (index.html) mounts
 *    the app on a NON-landmark wrapper (div#app — was main#app) and the
 *    AppShell's main#main-content.app-main is the single main landmark on
 *    every route, carrying the skip-link contract ("Skip to main content"
 *    → #main-content) intact;
 *  D6c — the contextual integrations card's DataBadge follows the task-flow
 *    DATA's own provenance mode (the QA-002 shared-resource seam): a live-404
 *    demo-fallback payload badges demo (never "live API" over the fallback
 *    corpus refs), a live-served payload badges live API, the offline demo
 *    dataset keeps its demo badge.
 *
 * Plus ONE recorded out-of-lane finding (the post006 FINDING A11Y-1
 * discipline): the solution route's page composes the solution workspace's
 * own main#solution-workspace INSIDE the shell main — pinned as the current
 * state for the Lead (the solution workspace is outside this lane's owned
 * surfaces; a fix flips that assertion).
 */

import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ReactNode } from "react";
import { AppShell } from "./AppShell";
import { NotFound } from "./App";
import { AppEnvironmentContext } from "./environment";
import type { Route } from "./router";
import type { ApiStatus } from "./api";
import { taskFlowView } from "./task-flow";
import { demoTaskFlowBundle, DEMO_TASK_PROJECT_ID } from "./task-dataset";
import type { TaskFlowResourceData } from "./task-first";
import { TaskFirstLanding, TaskFlowPanelBody } from "./task-first";
import { ContextualIntegrationsPanelBody } from "./contextual-integrations";
import { Dashboard, DashboardBody } from "./surfaces/Dashboard";
import type { DashboardData } from "./surfaces/Dashboard";
import { Projects } from "./surfaces/Projects";
import { ProjectOverview } from "./surfaces/ProjectOverview";
import { SiteTwin } from "./surfaces/SiteTwin";
import { CaptureMission } from "./surfaces/CaptureMission";
import { BoqLensSurface } from "./surfaces/BoqLens";
import { EngineeringCase } from "./surfaces/EngineeringCase";
import { InterventionStudio } from "./surfaces/InterventionStudio";
import { Outcomes } from "./surfaces/Outcomes";
import { Settings } from "./surfaces/Settings";
import {
  DEMO_PROJECT_ID,
  DEMO_SCENARIO_PROJECT_ID,
  DEMO_SOLUTION_PROJECT_ID,
} from "./demo";
import { SolutionSurface } from "./surfaces/Solution";

/* ------------------------------------------------------------------ */
/* Fixtures                                                            */
/* ------------------------------------------------------------------ */

const DEMO_STATUS: ApiStatus = {
  mode: "unavailable",
  healthz: "failed",
  readyz: "skipped",
  detail: "the API did not answer /healthz on this origin — showing demo data",
  providers: null,
};

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

const INDEX_HTML = readFileSync(join(import.meta.dir, "..", "..", "index.html"), "utf8");

/**
 * The markup with HTML comments removed — a DOM-structure proof counts
 * ELEMENTS, and a documentation comment that names a tag (e.g. the QA-005
 * rationale in index.html) is not that element.
 */
function withoutComments(html: string): string {
  return html.replace(/<!--[\s\S]*?-->/g, "");
}

/** Every route the shell can address (the twelve typed shapes). */
const ROUTES: readonly Route[] = [
  { name: "dashboard" },
  { name: "projects" },
  { name: "project", projectId: DEMO_PROJECT_ID },
  { name: "capture", projectId: DEMO_TASK_PROJECT_ID },
  { name: "sitetwin", projectId: DEMO_PROJECT_ID },
  { name: "boq-lens", projectId: DEMO_PROJECT_ID },
  { name: "case", projectId: DEMO_PROJECT_ID },
  { name: "intervention", projectId: DEMO_SCENARIO_PROJECT_ID, query: {} },
  { name: "solution", projectId: DEMO_SOLUTION_PROJECT_ID, query: {} },
  { name: "outcomes", projectId: DEMO_TASK_PROJECT_ID },
  { name: "settings" },
  { name: "not-found", hash: "#/qa005-no-such-address" },
];

const bundle = demoTaskFlowBundle();
const demoTaskData: TaskFlowResourceData = {
  mode: "demo",
  projectId: DEMO_TASK_PROJECT_ID,
  view: taskFlowView(bundle, DEMO_TASK_PROJECT_ID),
  bundle,
};

/**
 * The visible text of every h1/h2 in a static render (inner tags stripped,
 * whitespace collapsed). Headings that are explicitly hidden from assistive
 * tech (sr-only / aria-hidden) are not "visible text" and are excluded.
 */
function visibleHeadings(html: string, level: 1 | 2): string[] {
  const pattern = new RegExp(`<h${level}(\\s[^>]*)?>([\\s\\S]*?)</h${level}>`, "g");
  const texts: string[] = [];
  for (const match of html.matchAll(pattern)) {
    const attrs = match[1] ?? "";
    if (attrs.includes("sr-only") || attrs.includes('aria-hidden="true"')) {
      continue;
    }
    texts.push((match[2] ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim());
  }
  return texts;
}

/** The demo dataset shape the dashboard body renders (the ready overview). */
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

/* ------------------------------------------------------------------ */
/* D6a — no duplicate identical headings on the dashboard              */
/* ------------------------------------------------------------------ */

describe("QA-005 D6a — the dashboard's headings are distinct and descriptive", () => {
  test("no h1/h2 pair carries identical visible text; the page question stays the h1 and the entry card names itself", () => {
    // The dashboard page, composed from its loading frame (page-head h1 +
    // the task-first landing) and its ready bodies (the workspace overview,
    // the task-flow panel, the integrations card) — every h2 the page can
    // show, against the page's single h1.
    const page = [
      renderToStaticMarkup(withEnv(<Dashboard />)),
      renderToStaticMarkup(<DashboardBody data={DASHBOARD_DEMO} />),
      renderToStaticMarkup(<TaskFlowPanelBody data={demoTaskData} />),
      renderToStaticMarkup(<ContextualIntegrationsPanelBody data={demoTaskData} demo />),
    ].join("\n");

    const h1s = visibleHeadings(page, 1);
    const h2s = visibleHeadings(page, 2);
    // The page identity: exactly the one page-head h1, kept by the fix.
    expect(h1s).toEqual(["What do you need to do?"]);
    // No h2 may repeat an h1 verbatim (the pre-fix defect: the task-intent
    // card's h2 was the identical "What do you need to do?").
    const duplicates = h2s.filter((title) => h1s.includes(title));
    expect(duplicates).toEqual([]);
    // The entry card's h2 now names what the card holds (the entry-point
    // chooser) instead of echoing the page question.
    expect(h2s).toContain("Choose where to start");
    expect(h2s).toContain("Workspace overview");
  });

  test("the landing's own markup carries the renamed entry card (the old duplicate question string is gone from the landing)", () => {
    // The landing composition (canonical action bar + the intent card +
    // the task-flow panel + the integrations card): post-fix the page-head
    // question lives ONLY in the page-head h1 (Dashboard) — never again as
    // the entry card's heading.
    const landing = renderToStaticMarkup(withEnv(<TaskFirstLanding />));
    expect(landing).toContain("Choose where to start");
    expect(landing).not.toContain("What do you need to do?");
  });
});

/* ------------------------------------------------------------------ */
/* D6b — exactly one main per page, the skip link targets it           */
/* ------------------------------------------------------------------ */

describe("QA-005 D6b — one main landmark per page", () => {
  test("the document shell mounts the app on a NON-landmark wrapper (no <main> in index.html)", () => {
    // The outer wrapper was main#app (a <main> inside a <main> once the
    // shell renders — invalid HTML, two competing main landmarks). The fix:
    // a plain div#app mount; the shell's main#main-content is the page's
    // only main. (Comments stripped: the QA-005 rationale comment names the
    // old tag — a comment is not an element.)
    const document = withoutComments(INDEX_HTML);
    expect(document).toContain('<div id="app"></div>');
    expect(/<main\b/.test(document)).toBe(false);
  });

  test("every route's shell renders EXACTLY ONE main (main#main-content.app-main) and the skip link targets it", () => {
    const failures: string[] = [];
    for (const route of ROUTES) {
      const shell = renderToStaticMarkup(
        <AppShell route={route} apiStatus={DEMO_STATUS}>
          <div />
        </AppShell>,
      );
      // The shell itself: exactly one main, the skip-link target.
      const mainCount = (shell.match(/<main\b/g) ?? []).length;
      if (mainCount !== 1) {
        failures.push(`${route.name}: the shell renders ${String(mainCount)} main elements`);
      }
      if (!/<main\b[^>]*id="main-content"[^>]*>/.test(shell)) {
        failures.push(`${route.name}: the single main is not #main-content`);
      }
      if (!/<main\b[^>]*class="app-main"[^>]*>/.test(shell)) {
        failures.push(`${route.name}: the single main is not .app-main`);
      }
      // The skip-link contract: "Skip to main content" precedes the main
      // and its href is the main's id.
      const skipHref = shell.indexOf('href="#main-content"');
      const mainOpen = shell.search(/<main\b/);
      if (!shell.includes("Skip to main content")) {
        failures.push(`${route.name}: the skip link label is missing`);
      }
      if (skipHref < 0 || mainOpen < 0 || skipHref > mainOpen) {
        failures.push(`${route.name}: the skip link does not precede the main`);
      }
      // The composed PAGE (the document's mount element + the shell):
      // still exactly one main — the mount contributes none. The mount
      // element itself must be the plain div (a main#app mount is the D6b
      // defect: two nested mains on every page).
      const document = withoutComments(INDEX_HTML);
      const mount = /<[a-z]+ id="app">\s*<\/[a-z]+>/.exec(document);
      if (mount === null) {
        failures.push(`${route.name}: index.html declares no #app mount element`);
      } else {
        if (!mount[0].startsWith("<div")) {
          failures.push(
            `${route.name}: the #app mount is not a plain div (${mount[0]})`,
          );
        }
        const composed = withoutComments(
          document.replace(
            mount[0],
            mount[0].replace("></", `>${shell}</`),
          ),
        );
        const composedCount = (composed.match(/<main\b/g) ?? []).length;
        if (composedCount !== 1) {
          failures.push(
            `${route.name}: the composed page carries ${String(composedCount)} main landmarks`,
          );
        }
      }
    }
    expect(failures).toEqual([]);
  });

  test("no routed surface's own markup introduces a second main (the surfaces render inside the shell's main)", () => {
    // The recorded exception: the solution surface's lazy workspace carries
    // its own main#solution-workspace — pinned separately below as the
    // out-of-lane FINDING QA-005-B.
    const surfaces: readonly { readonly name: string; readonly html: string }[] = [
      { name: "dashboard", html: renderToStaticMarkup(withEnv(<Dashboard />)) },
      { name: "projects", html: renderToStaticMarkup(withEnv(<Projects />)) },
      {
        name: "project",
        html: renderToStaticMarkup(withEnv(<ProjectOverview projectId={DEMO_PROJECT_ID} />)),
      },
      {
        name: "capture",
        html: renderToStaticMarkup(withEnv(<CaptureMission projectId={DEMO_TASK_PROJECT_ID} />)),
      },
      {
        name: "sitetwin",
        html: renderToStaticMarkup(withEnv(<SiteTwin projectId={DEMO_PROJECT_ID} />)),
      },
      {
        name: "boq-lens",
        html: renderToStaticMarkup(withEnv(<BoqLensSurface projectId={DEMO_PROJECT_ID} />)),
      },
      {
        name: "case",
        html: renderToStaticMarkup(withEnv(<EngineeringCase projectId={DEMO_PROJECT_ID} />)),
      },
      {
        name: "intervention",
        html: renderToStaticMarkup(
          withEnv(<InterventionStudio projectId={DEMO_SCENARIO_PROJECT_ID} layer={0} />),
        ),
      },
      {
        name: "outcomes",
        html: renderToStaticMarkup(withEnv(<Outcomes projectId={DEMO_TASK_PROJECT_ID} />)),
      },
      {
        name: "settings",
        html: renderToStaticMarkup(
          withEnv(
            <Settings
              principalId="user-alice"
              onPrincipalChange={() => {}}
              onReprobe={() => {}}
            />,
          ),
        ),
      },
      { name: "not-found", html: renderToStaticMarkup(<NotFound hash="#/qa005-nope" />) },
    ];
    const failures: string[] = [];
    for (const { name, html } of surfaces) {
      const mainCount = (html.match(/<main\b/g) ?? []).length;
      if (mainCount !== 0) {
        failures.push(`${name}: the surface markup carries ${String(mainCount)} main elements`);
      }
    }
    expect(failures).toEqual([]);
  });

  test("FINDING QA-005-B (recorded, out of lane): the solution route composes a SECOND main inside the shell main — pinned for the Lead", async () => {
    // Honest recorded finding — NOT fixed by this lane (the solution
    // workspace, apps/web/src/solution/**, is outside QA-005's owned
    // surfaces; the Lead governs the fix): SolutionWorkspaceBody renders
    // its own <main id="solution-workspace"> INSIDE the shell's
    // main#main-content, so the solution page carries two competing main
    // landmarks even after D6b's mount fix. This pins the CURRENT state so
    // a solution-lane fix flips this assertion.
    //
    // The solution surface's selection ladder is a cached lazy resource
    // (a dynamic import + the composed journey record — it settles
    // asynchronously). Warm it and WAIT, bounded, for the SETTLED body (the
    // same settled state the suite's earlier files produce; explicit here
    // so this proof is order-independent).
    renderToStaticMarkup(withEnv(<SolutionSurface projectId={DEMO_SOLUTION_PROJECT_ID} query={{}} />));
    const deadline = Date.now() + 60_000;
    for (;;) {
      const probe = renderToStaticMarkup(
        withEnv(<SolutionSurface projectId={DEMO_SOLUTION_PROJECT_ID} query={{}} />),
      );
      if (probe.includes('id="solution-workspace"')) {
        break;
      }
      if (Date.now() > deadline) {
        throw new Error("the solution surface's lazy ladder did not settle within the bounded wait");
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    const page = renderToStaticMarkup(
      withEnv(
        <AppShell
          route={{ name: "solution", projectId: DEMO_SOLUTION_PROJECT_ID, query: {} }}
          apiStatus={DEMO_STATUS}
        >
          <SolutionSurface projectId={DEMO_SOLUTION_PROJECT_ID} query={{}} />
        </AppShell>,
      ),
    );
    // The settled workspace body carries its own main landmark…
    expect(page).toContain('id="solution-workspace"');
    const mainCount = (page.match(/<main\b/g) ?? []).length;
    // …so the composed solution page currently renders TWO mains (the
    // shell's main#main-content plus the nested workspace main).
    expect(mainCount).toBe(2);
    expect(page.search(/<main\b[^>]*id="main-content"/)).toBeGreaterThanOrEqual(0);
  });
});

/* ------------------------------------------------------------------ */
/* D6c — the integrations card's badge follows the DATA's mode         */
/* ------------------------------------------------------------------ */

describe("QA-005 D6c — the integrations card badges the data it renders", () => {
  test("a live-404 demo-fallback payload badges DEMO (never 'live API' over the fallback corpus refs)", () => {
    // The live deployment answered the API (the environment is live) but
    // the task-flow adapter route 404'd: the shared resource carries the
    // committed demo bundle as the honest fallback. The card renders those
    // fallback refs — its badge must say demo.
    const fallbackData: TaskFlowResourceData = {
      mode: "demo",
      projectId: DEMO_TASK_PROJECT_ID,
      view: taskFlowView(bundle, DEMO_TASK_PROJECT_ID),
      bundle,
      demoFallback: {
        reason:
          "this deployment answers the API but does not serve the task-flow adapter contract objects (/v1/adapter/projects/:id/task-flow answered HTTP 404)",
        impact:
          "the task-first journey cannot run on live records here; the committed demo task journey below remains executable and is badged demo — never presented as live authority",
      },
    };
    const html = renderToStaticMarkup(
      <ContextualIntegrationsPanelBody data={fallbackData} demo={false} />,
    );
    // The card renders the fallback's corpus reference…
    expect(html).toContain("ERP-BOQ-2026-0042");
    // …badged demo — the pre-fix defect badged "live API" here (the badge
    // followed the ENVIRONMENT instead of the data).
    expect(html).toContain("data-badge-demo");
    expect(html).not.toContain("data-badge-api");
    // The bindings section keeps its own honest live state (the registry is
    // not readable in this build — unchanged by this fix).
    expect(html).toContain('data-integration-state="not-readable"');
  });

  test("a live-served payload badges LIVE API (the served path is unchanged)", () => {
    const servedData: TaskFlowResourceData = {
      mode: "api",
      projectId: DEMO_TASK_PROJECT_ID,
      view: taskFlowView(bundle, DEMO_TASK_PROJECT_ID),
      bundle,
    };
    const html = renderToStaticMarkup(
      <ContextualIntegrationsPanelBody data={servedData} demo={false} />,
    );
    expect(html).toContain("data-badge-api");
    expect(html).not.toContain("data-badge-demo");
  });

  test("the offline demo dataset keeps its demo badge (the offline path is unchanged)", () => {
    const html = renderToStaticMarkup(
      <ContextualIntegrationsPanelBody data={demoTaskData} demo />,
    );
    expect(html).toContain("data-badge-demo");
    expect(html).not.toContain("data-badge-api");
  });
});
