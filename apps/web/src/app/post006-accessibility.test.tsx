/**
 * POST-006 — ACCESSIBILITY at the deterministic level (plan §6 Wave 1
 * Worker 3, item 4): semantic HTML, ARIA contracts, focus-order proxies
 * and the touch-target element contract, swept over the FULL composed
 * corpus (the eleven routed surfaces + the shell chrome + the four new
 * POST-005 bridge bodies + the POST-004 navigation surfaces).
 *
 * What static rendering can prove (and this suite pins):
 *  - SEMANTIC HTML: the landmark structure (header / nav / main / footer),
 *    the skip link as the first focusable, exactly one h1 per surface,
 *    card titles as h2, native <details>/<summary> disclosure;
 *  - ARIA: aria-current on the active nav entry, aria-expanded +
 *    aria-controls on the drawer toggle, role="status" / aria-live on
 *    async states, labelled form controls (every input has its <label
 *    for>), alt text on every image, aria-label on every icon-only
 *    button;
 *  - FOCUS ORDER (proxies): no positive tabindex anywhere (the DOM order
 *    IS the tab order), the skip link precedes the nav;
 *  - TOUCH TARGETS (the element contract): every interactive element is a
 *    native button / a / input / select (the app CSS sizes them; divs
 *    with click handlers or role="button" would escape both the sizing
 *    and the keyboard semantics) — the MEASURED sizes at both breakpoints
 *    are the live harness's proof (tools/post006/acceptance.ts).
 *
 * The axe-core scans + measured touch-target sizes + contrast at BOTH
 * viewports run in the live harness; this suite is the deterministic
 * layer that fails fast in `bun run verify`.
 */

import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ReactNode } from "react";
import { AppShell } from "./AppShell";
import { NotFound, UnresolvedPrincipalPanel } from "./App";
import { AppEnvironmentContext } from "./environment";
import { ProjectSurfaceNav } from "./components";
import {
  TaskFirstLanding,
  TaskFlowPanelBody,
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
import { BoqLensSurface } from "./surfaces/BoqLens";
import { CaseBody, EngineeringCase, MissingEvidenceCaptureBridgeBody } from "./surfaces/EngineeringCase";
import { StudioBody, InterventionStudio } from "./surfaces/InterventionStudio";
import type { InterventionData } from "./surfaces/InterventionStudio";
import { SolutionSurface } from "./surfaces/Solution";
import { Outcomes, OutcomesBody } from "./surfaces/Outcomes";
import { Settings } from "./surfaces/Settings";

/* ------------------------------------------------------------------ */
/* The corpus (the eleven surfaces + the chrome + the bridge bodies)   */
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

const bundle = demoTaskFlowBundle();
const taskData: TaskFlowResourceData = {
  mode: "demo",
  projectId: DEMO_TASK_PROJECT_ID,
  view: taskFlowView(bundle, DEMO_TASK_PROJECT_ID),
  bundle,
};

const gapHandoff = fieldCaptureHandoff({
  projectId: DEMO_TASK_PROJECT_ID,
  taskId: `task-capture-${bundle.evidence?.gaps[0]?.gapId ?? "gap-4471"}`,
  intent: bundle.evidence?.gaps[0]?.description ?? "capture the missing reference",
  targetRefs: [bundle.caseSummary?.caseId ?? "case-91ab", bundle.evidence?.gaps[0]?.gapId ?? "gap-4471"],
  epistemicState: bundle.caseSummary?.status ?? "under-review",
  originSurface: "capture",
  versionContext: {},
  issuedAt: "2026-09-26T12:00:00.000Z",
});

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

/** The full acceptance corpus: every routed surface + chrome + bridges. */
const CORPUS: readonly { readonly name: string; readonly html: string }[] = [
  {
    name: "app-shell",
    html: renderToStaticMarkup(
      <AppShell route={{ name: "dashboard" }} apiStatus={DEMO_STATUS}>
        <div />
      </AppShell>,
    ),
  },
  { name: "not-found", html: renderToStaticMarkup(<NotFound hash="#/nope" />) },
  { name: "unresolved-principal", html: renderToStaticMarkup(<UnresolvedPrincipalPanel />) },
  { name: "landing", html: renderToStaticMarkup(withEnv(<TaskFirstLanding />)) },
  { name: "dashboard", html: renderToStaticMarkup(withEnv(<Dashboard />)) },
  { name: "projects", html: renderToStaticMarkup(withEnv(<Projects />)) },
  { name: "project", html: renderToStaticMarkup(withEnv(<ProjectOverview projectId={DEMO_PROJECT_ID} />)) },
  { name: "capture", html: renderToStaticMarkup(withEnv(<CaptureMission projectId={DEMO_TASK_PROJECT_ID} />)) },
  { name: "sitetwin", html: renderToStaticMarkup(withEnv(<SiteTwin projectId={DEMO_PROJECT_ID} />)) },
  { name: "boq-lens", html: renderToStaticMarkup(withEnv(<BoqLensSurface projectId={DEMO_PROJECT_ID} />)) },
  {
    name: "case",
    html: renderToStaticMarkup(withEnv(<EngineeringCase projectId={DEMO_PROJECT_ID} />)),
  },
  {
    name: "case-body",
    html: renderToStaticMarkup(
      withEnv(
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
        />,
      ),
    ),
  },
  {
    name: "intervention",
    html: renderToStaticMarkup(withEnv(<InterventionStudio projectId={DEMO_SCENARIO_PROJECT_ID} layer={0} />)),
  },
  {
    name: "intervention-body",
    html: renderToStaticMarkup(
      withEnv(<StudioBody data={studioData()} layer={0} selectedNodeId={null} onSelectNode={() => {}} onReload={() => {}} />),
    ),
  },
  {
    name: "solution",
    html: renderToStaticMarkup(withEnv(<SolutionSurface projectId={DEMO_SOLUTION_PROJECT_ID} query={{}} />)),
  },
  {
    name: "outcomes",
    html: renderToStaticMarkup(withEnv(<Outcomes projectId={DEMO_TASK_PROJECT_ID} />)),
  },
  {
    name: "outcomes-body",
    html: renderToStaticMarkup(
      withEnv(
        <OutcomesBody
          data={{
            mode: "demo",
            projectId: DEMO_TASK_PROJECT_ID,
            demo: { bundle, scenarioPresent: demoScenario(DEMO_TASK_PROJECT_ID) !== null },
            live: null,
          }}
          query=""
          onQuery={() => {}}
          hits={null}
        />,
      ),
    ),
  },
  {
    name: "settings",
    html: renderToStaticMarkup(
      withEnv(<Settings principalId="user-alice" onPrincipalChange={() => {}} onReprobe={() => {}} />),
    ),
  },
  { name: "task-flow-panel", html: renderToStaticMarkup(<TaskFlowPanelBody data={taskData} />) },
  {
    name: "project-surface-nav",
    html: renderToStaticMarkup(withEnv(<ProjectSurfaceNav projectId={DEMO_TASK_PROJECT_ID} current="capture" />)),
  },
  /* The four POST-005 bridge bodies (their ready states — the deepest
     interactive markup the surfaces compose). */
  {
    name: "bridge-handoff",
    html: renderToStaticMarkup(<CrossDeviceHandoffBody data={taskData} handoff={gapHandoff} onPrepare={() => {}} />),
  },
  {
    name: "bridge-missing-evidence",
    html: renderToStaticMarkup(
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
        prepared={{ key: bundle.evidence?.gaps[0]?.gapId ?? "gap-4471", handoff: gapHandoff }}
        onPrepare={() => {}}
      />,
    ),
  },
];

const byName = (name: string): string => CORPUS.find((entry) => entry.name === name)!.html;

/* ------------------------------------------------------------------ */
/* Semantic HTML — landmarks, skip link, headings, disclosure          */
/* ------------------------------------------------------------------ */

describe("POST-006 accessibility — semantic HTML", () => {
  test("the shell composes the landmark structure (header / nav / main / footer) with the nav labelled", () => {
    const shell = byName("app-shell");
    expect(shell).toContain("<header");
    expect(shell).toContain('<nav');
    expect(shell).toContain('id="primary-nav"');
    expect(shell).toContain('aria-label="Primary"');
    expect(shell).toContain("<main");
    expect(shell).toContain('id="main-content"');
    expect(shell).toContain("<footer");
  });

  test("the document shell (index.html) declares lang, charset, viewport and a title", () => {
    const html = readFileSync(join(import.meta.dir, "..", "..", "index.html"), "utf8");
    expect(html).toMatch(/<html[^>]*lang=/);
    expect(html).toContain("<title>");
    expect(html).toMatch(/<meta[^>]*charset=/);
    expect(html).toMatch(/<meta[^>]*name="viewport"/);
  });

  test("the skip link is the FIRST focusable element (before the header and the nav)", () => {
    const shell = byName("app-shell");
    const skipIndex = shell.indexOf('class="skip-link"');
    const headerIndex = shell.indexOf("<header");
    const navIndex = shell.indexOf("<nav");
    expect(skipIndex).toBeGreaterThanOrEqual(0);
    expect(skipIndex).toBeLessThan(headerIndex);
    expect(skipIndex).toBeLessThan(navIndex);
    expect(shell).toContain('href="#main-content"');
    expect(shell).toContain("Skip to main content");
  });

  test("every routed SURFACE composes EXACTLY ONE h1 (its page identity) — the eleven composed surfaces", () => {
    const PAGE_HEAD_SURFACES = new Set([
      "dashboard",
      "projects",
      "project",
      "capture",
      "sitetwin",
      "boq-lens",
      "case",
      "intervention",
      "outcomes",
      "settings",
      // POST-006-R1: FINDING A11Y-1 remediated — the Interactive Solution
      // surface now composes its page identity as a visually-hidden h1
      // (the repo's sr-only pattern). It joins the exactly-one-h1 sweep.
      "solution",
    ]);
    const failures: string[] = [];
    for (const { name, html } of CORPUS) {
      if (!PAGE_HEAD_SURFACES.has(name)) {
        continue;
      }
      const h1Count = (html.match(/<h1[\s>]/g) ?? []).length;
      if (h1Count !== 1) {
        failures.push(`${name}: ${String(h1Count)} h1 elements`);
      }
    }
    expect(failures).toEqual([]);
  });

  test("FINDING A11Y-1 REMEDIATED (POST-006-R1): the Interactive Solution surface composes its page identity as a visually-hidden h1", () => {
    // The pinned finding, FLIPPED by the POST-006-R1 remediation lane (the
    // pin existed to be flipped — this test now ASSERTS the remediation):
    // the solution route composes its page identity ("Build solution" —
    // the task-first vocabulary's name for the destination, the primary
    // nav's label) as a top-level h1 in the repo's sr-only pattern —
    // visually hidden (NO visual redesign of the accepted surface), first
    // in DOM order (before every card h2), carrying the page identity for
    // the accessibility tree (axe page-has-heading-one) and heading
    // navigation, in BOTH ladder branches (the world-held body and the
    // honest empty state render under the same page identity).
    const solution = byName("solution");
    const h1Count = (solution.match(/<h1[\s>]/g) ?? []).length;
    expect(h1Count).toBe(1);
    // the sr-only contract (the repo's canonical visually-hidden pattern,
    // lifted into the app stylesheet from the solution workspace's own):
    expect(solution).toMatch(/<h1[^>]*class="sr-only"[^>]*>Build solution<\/h1>/);
    // the h1 PRECEDES the first card h2 (the heading hierarchy stays flat
    // and ordered — the page identity, then the card titles):
    const h1Index = solution.search(/<h1[\s>]/);
    const h2Index = solution.search(/<h2[\s>]/);
    expect(h1Index).toBeGreaterThanOrEqual(0);
    expect(h2Index).toBeGreaterThan(h1Index);
    expect(solution).toContain("<h2"); // its card titles remain h2
  });

  test("card titles are h2 (the heading hierarchy stays flat and ordered)", () => {
    const failures: string[] = [];
    for (const { name, html } of CORPUS) {
      if (name === "app-shell" || name === "not-found" || name === "unresolved-principal" || name.endsWith("-body") || name.startsWith("bridge-")) {
        continue; // chrome, meta panels and body/bridge renders (no page h1 of their own by design)
      }
      const h1Index = html.search(/<h1[\s>]/);
      const h2Index = html.search(/<h2[\s>]/);
      if (h2Index >= 0 && h1Index >= 0 && h2Index < h1Index) {
        failures.push(`${name}: an h2 precedes the h1`);
      }
    }
    expect(failures).toEqual([]);
  });

  test("the specialist disclosures are native <details> with a <summary> (keyboard-focusable)", () => {
    const studio = byName("intervention-body");
    expect(studio).toContain("<details");
    const detailsWithoutSummary = (studio.match(/<details(?![^>]*>[\s\S]*?<summary)/g) ?? []).length;
    expect(detailsWithoutSummary).toBe(0);
  });
});

/* ------------------------------------------------------------------ */
/* ARIA contracts                                                      */
/* ------------------------------------------------------------------ */

describe("POST-006 accessibility — ARIA contracts", () => {
  test("the drawer toggle carries aria-expanded + aria-controls + an aria-label (icon-only button named)", () => {
    const shell = byName("app-shell");
    expect(shell).toContain('aria-expanded=');
    expect(shell).toContain('aria-controls="primary-nav"');
    expect(shell).toMatch(/aria-label="(Open|Close) navigation menu"/);
  });

  test("the active nav entry carries aria-current=\"page\" (both navs)", () => {
    expect(byName("app-shell")).toContain('aria-current="page"');
    expect(byName("project-surface-nav")).toContain('aria-current="page"');
  });

  test("every async state announces politely (role=status + aria-live=polite), never assertive noise", () => {
    const failures: string[] = [];
    for (const { name, html } of CORPUS) {
      for (const match of html.matchAll(/<div[^>]*class="state state-loading"[^>]*>/g)) {
        const tag = match[0];
        if (!tag.includes('role="status"') || !tag.includes('aria-live="polite"')) {
          failures.push(`${name}: a loading state without the polite announcement contract`);
        }
      }
      if (html.includes('aria-live="assertive"')) {
        failures.push(`${name}: an assertive live region (reserved for true urgency only)`);
      }
    }
    expect(failures).toEqual([]);
  });

  test("every form control is labelled (each input/select/textarea has a <label for> or an aria-label)", () => {
    const failures: string[] = [];
    for (const { name, html } of CORPUS) {
      // every input id must have a matching <label for>, unless the control
      // carries its own aria-label
      for (const match of html.matchAll(/<(input|select|textarea)\b[^>]*>/g)) {
        const tag = match[0];
        if (tag.includes("aria-label=") || tag.includes("aria-labelledby=")) {
          continue;
        }
        const idMatch = /id="([^"]+)"/.exec(tag);
        if (idMatch === null) {
          failures.push(`${name}: a form control with no id and no aria-label (${tag.slice(0, 60)})`);
          continue;
        }
        if (!html.includes(`for="${idMatch[1]}"`)) {
          failures.push(`${name}: the control id=${idMatch[1]} has no <label for>`);
        }
      }
    }
    expect(failures).toEqual([]);
  });

  test("every image carries an alt (empty alt allowed for decorative)", () => {
    const failures: string[] = [];
    for (const { name, html } of CORPUS) {
      for (const match of html.matchAll(/<img\b[^>]*>/g)) {
        if (!match[0].includes("alt=")) {
          failures.push(`${name}: an img without alt (${match[0].slice(0, 60)})`);
        }
      }
    }
    expect(failures).toEqual([]);
  });

  test("the prepared handoff callout announces itself (role=status) and the deep link is a real anchor", () => {
    const handoff = byName("bridge-handoff");
    expect(handoff).toContain('data-handoff-link="true"');
    expect(handoff).toContain('role="status"');
    expect(handoff).toMatch(/<a href="aise:\/\/task[^"]*"/);
  });
});

/* ------------------------------------------------------------------ */
/* Focus order (static proxies) + the touch-target element contract    */
/* ------------------------------------------------------------------ */

describe("POST-006 accessibility — focus order + touch-target element contract", () => {
  test("NO positive tabindex anywhere (the DOM order IS the tab order)", () => {
    const failures: string[] = [];
    for (const { name, html } of CORPUS) {
      for (const match of html.matchAll(/tabindex="([0-9]+)"/g)) {
        if (Number(match[1]) > 0) {
          failures.push(`${name}: tabindex=${match[1]}`);
        }
      }
    }
    expect(failures).toEqual([]);
  });

  test("every interactive element is a NATIVE control (button / a / input / select / textarea / summary)", () => {
    const failures: string[] = [];
    for (const { name, html } of CORPUS) {
      if (html.includes('role="button"')) {
        failures.push(`${name}: a div/span button (role="button") — escapes the sizing + keyboard contract`);
      }
      // an anchor with no href is not focusable — every <a must be a link
      // or an in-page anchor with href
      for (const match of html.matchAll(/<a\b(?![^>]*\bhref=)[^>]*>/g)) {
        failures.push(`${name}: an <a> without href (${match[0].slice(0, 60)})`);
      }
    }
    expect(failures).toEqual([]);
  });

  test("every button carries discernible text or an aria-label (no anonymous buttons)", () => {
    const failures: string[] = [];
    for (const { name, html } of CORPUS) {
      for (const match of html.matchAll(/<button\b[^>]*>([\s\S]*?)<\/button>/g)) {
        const attrs = match[0].slice(0, match[0].indexOf(">"));
        const content = match[1] ?? "";
        const textful = content.replace(/<[^>]*>/g, "").trim().length > 0;
        if (!textful && !attrs.includes("aria-label=")) {
          failures.push(`${name}: a button with no text and no aria-label`);
        }
      }
    }
    expect(failures).toEqual([]);
  });

  test("POST-006-R1: the stylesheet carries the inline-link touch floor + the file-input sizing (the measured-size remediation's substrate)", () => {
    // The POST-006 live ledger's 21 serious touch-target findings (the
    // inline prose links at 15–19px tall + the two file inputs at 21px)
    // are remediated AT THE STYLESHEET (the repo's interactive-element
    // sizing convention lives in CSS — the element contract above pins
    // the native-control half, this pins the sizing half). The measured
    // proof stays with the live harness (tools/post006/acceptance.ts,
    // check E — never wired into bun run verify, the journey-harness
    // law); this static pin fails fast if the remediation rules are
    // removed from the shipped stylesheet, so the escape cannot recur
    // silently between live audits.
    const css = readFileSync(join(import.meta.dir, "..", "styles", "app.css"), "utf8");
    // the inline prose-link touch floor (WCAG 2.5.8 AA) over every
    // measured context: journey links, crumbs, callout/task-strip/
    // notes/pane-foot prose, the BOQ source/solution panels:
    expect(css).toContain(".journey-body a");
    expect(css).toContain(".crumbs a");
    expect(css).toContain(".callout a");
    expect(css).toContain(".task-strip-line a");
    expect(css).toContain(".notes-list a");
    expect(css).toContain(".pane-foot a");
    expect(css).toContain("p[data-boq-class] a");
    // the floor's mechanism (vertical padding grows the measured target
    // box past 24×24 without touching the visual language):
    expect(css).toMatch(/\.pane-foot a,\s*\n\s*p\[data-boq-class\] a \{\s*\n\s*padding-block: 5px;/);
    // the file input joins the input sizing convention (min-height:
    // --touch — the same floor every other input clears):
    expect(css).toMatch(/input\[type="file"\] \{\s*\n\s*min-height: var\(--touch\);/);
    // the sr-only utility (FINDING A11Y-1's visually-hidden heading — the
    // repo's canonical pattern, now in the always-loaded app stylesheet):
    expect(css).toMatch(/\.sr-only \{[^}]*clip: rect\(0, 0, 0, 0\);[^}]*\}/);
  });
});
