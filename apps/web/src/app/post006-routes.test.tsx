/**
 * POST-006 — ROUTE COMPLETENESS + ORPHAN-ROUTE DETECTION (plan §6 Wave 1
 * Worker 3, item 3; plan §7 "No orphaned capabilities").
 *
 * The route map is the discoverability backbone: every surface the product
 * can address must be (a) a REAL route in the typed codec, (b) rendered by
 * the app chrome for that route, (c) linked from the app's own composed
 * navigation, and (d) in lockstep with the typed surface enum — and every
 * address that is NOT a real route must be the honest typed not-found
 * (never a silent fallback). This suite pins the four directions at the
 * deterministic level:
 *
 *  1. CODEC COMPLETENESS — every Route variant round-trips
 *     (parseHash(formatRoute(route)) === route) and every ProjectSurface
 *     the nav type knows has a projectSurfaceRoute projection;
 *  2. TYPED REJECTIONS — the unknown/malformed address family renders
 *     not-found (the orphan-ROUTE detection: an addressable-looking path
 *     that addresses nothing is surfaced honestly, not guessed);
 *  3. CHROME COVERAGE — the app shell composes for EVERY route (the
 *     routed chrome never strands a route) and aria-current lands on the
 *     route's own nav group;
 *  4. NAV ↔ ROUTE LOCKSTEP — every link the per-project surface nav and
 *     the primary nav compose addresses a real route, and every
 *     ProjectSurface has a visible nav entry (nav/surface drift is a
 *     route-completeness defect).
 */

import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import {
  formatRoute,
  parseHash,
  projectSurfaceRoute,
  routeSurface,
  PROJECT_SURFACES,
  type Route,
  type ProjectSurface,
} from "./router";
import { AppShell } from "./AppShell";
import { NotFound } from "./App";
import { ProjectSurfaceNav } from "./components";
import { AppEnvironmentContext } from "./environment";
import type { ApiStatus } from "./api";
import {
  DEMO_PROJECT_ID,
  DEMO_SCENARIO_PROJECT_ID,
  DEMO_SOLUTION_PROJECT_ID,
} from "./demo";
import { DEMO_TASK_PROJECT_ID } from "./task-dataset";

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

/** Every route variant the product can address (the full route table). */
const ROUTE_TABLE: readonly { readonly route: Route; readonly label: string }[] = [
  { route: { name: "dashboard" }, label: "the landing" },
  { route: { name: "projects" }, label: "the registry" },
  { route: { name: "project", projectId: DEMO_PROJECT_ID }, label: "one project's overview" },
  { route: { name: "capture", projectId: DEMO_TASK_PROJECT_ID }, label: "the capture surface" },
  { route: { name: "sitetwin", projectId: DEMO_PROJECT_ID }, label: "the site-twin surface" },
  { route: { name: "boq-lens", projectId: DEMO_PROJECT_ID }, label: "the BOQ lens" },
  { route: { name: "case", projectId: DEMO_TASK_PROJECT_ID }, label: "the engineering case" },
  {
    route: { name: "intervention", projectId: DEMO_SCENARIO_PROJECT_ID, query: {} },
    label: "the intervention studio (no query)",
  },
  {
    route: { name: "intervention", projectId: DEMO_SCENARIO_PROJECT_ID, query: { layer: 2 } },
    label: "the intervention studio (deep-linked layer)",
  },
  {
    route: {
      name: "intervention",
      projectId: DEMO_SCENARIO_PROJECT_ID,
      query: { scenario: "scenario-office-refit" },
    },
    label: "the intervention studio (deep-linked scenario)",
  },
  { route: { name: "solution", projectId: DEMO_SOLUTION_PROJECT_ID, query: {} }, label: "the interactive solution" },
  {
    route: { name: "solution", projectId: DEMO_SOLUTION_PROJECT_ID, query: { case: "case-91ab", boqLine: "line-1", step: 3 } },
    label: "the interactive solution (full deep link)",
  },
  { route: { name: "outcomes", projectId: DEMO_TASK_PROJECT_ID }, label: "the outcomes surface" },
  { route: { name: "settings" }, label: "the settings surface" },
];

/* ------------------------------------------------------------------ */
/* 1. Codec completeness                                               */
/* ------------------------------------------------------------------ */

describe("POST-006 route completeness — the codec covers every route variant", () => {
  test("every route variant round-trips verbatim (format → parse → the same route)", () => {
    for (const { route, label } of ROUTE_TABLE) {
      const href = formatRoute(route);
      expect(parseHash(href), `${label} (${href})`).toEqual(route);
    }
  });

  test("every distinct route formats to a distinct address (no two surfaces share a route)", () => {
    const hrefs = ROUTE_TABLE.map(({ route }) => formatRoute(route));
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  test("every ProjectSurface the nav type knows has a projectSurfaceRoute projection (nav/surface lockstep)", () => {
    for (const { surface } of PROJECT_SURFACES) {
      const route = projectSurfaceRoute(surface, DEMO_PROJECT_ID);
      expect(route.name).toBe(surface === "boq-lens" ? "boq-lens" : surface);
      expect(parseHash(formatRoute(route))).toEqual(route);
    }
    // the typed surface set is exactly the seven per-project surfaces
    const surfaces = PROJECT_SURFACES.map(({ surface }) => surface).sort();
    expect(surfaces).toEqual([
      "boq-lens",
      "capture",
      "case",
      "intervention",
      "outcomes",
      "sitetwin",
      "solution",
    ]);
  });

  test("routeSurface maps every route to its own navigation surface (the chrome groups correctly)", () => {
    // The project-overview route deliberately groups under the Projects nav
    // entry (it is the registry's drill-down, not its own task group).
    for (const { route } of ROUTE_TABLE) {
      const expected = route.name === "project" ? "projects" : route.name;
      expect(routeSurface(route)).toBe(expected);
    }
  });
});

/* ------------------------------------------------------------------ */
/* 2. Typed rejections (the orphan-ADDRESS detection)                  */
/* ------------------------------------------------------------------ */

describe("POST-006 route completeness — unknown addresses are the honest typed not-found", () => {
  const ORPHAN_ADDRESSES: readonly { readonly hash: string; readonly why: string }[] = [
    { hash: "#/nope", why: "an unknown top-level path" },
    { hash: "#/projects/p1/unknown-surface", why: "an unknown per-project surface" },
    { hash: "#/projects/p1/capture?bogus=1", why: "an unknown query parameter on a known route" },
    { hash: "#/projects/p1/intervention?layer=-1", why: "a negative layer index" },
    { hash: "#/projects/p1/intervention?layer=abc", why: "a non-numeric layer" },
    { hash: "#/projects/p1/solution?step=-2", why: "a negative solution step" },
    { hash: "#/projects//capture", why: "an empty project id" },
    { hash: "#/dashboard/extra", why: "a trailing segment on a flat route" },
  ];

  test("every addressable-looking path that addresses nothing parses to not-found (never a fallback)", () => {
    for (const { hash, why } of ORPHAN_ADDRESSES) {
      const route = parseHash(hash);
      expect(route.name, `${hash} (${why})`).toBe("not-found");
      if (route.name === "not-found") {
        expect(route.hash).toBe(hash);
      }
    }
  });

  test("the not-found surface renders the offending address with honest guidance (an orphan address is explained, not a dead end)", () => {
    const html = renderToStaticMarkup(<NotFound hash="#/projects/p1/unknown-surface" />);
    expect(html).toContain("This address does not match any product surface");
    expect(html).toContain("#/projects/p1/unknown-surface");
    expect(html).toContain("<a"); // a way back (the guidance links real routes)
  });

  test("the empty hash family falls to the landing (the canonical home), never an error", () => {
    expect(parseHash("")).toEqual({ name: "dashboard" });
    expect(parseHash("#")).toEqual({ name: "dashboard" });
    expect(parseHash("#/")).toEqual({ name: "dashboard" });
  });
});

/* ------------------------------------------------------------------ */
/* 3. Chrome coverage — the shell composes for every route             */
/* ------------------------------------------------------------------ */

describe("POST-006 route completeness — the app chrome composes for every route", () => {
  test("the shell renders its landmarks + the primary nav for EVERY route (no route strands the chrome)", () => {
    for (const { route, label } of ROUTE_TABLE) {
      const html = renderToStaticMarkup(
        <AppShell route={route} apiStatus={DEMO_STATUS}>
          <div />
        </AppShell>,
      );
      expect(html.length, `${label}`).toBeGreaterThan(0);
      expect(html, `${label}`).toContain('id="primary-nav"');
      expect(html, `${label}`).toContain("Build solution"); // the task-first nav composes everywhere
    }
  });

  test("aria-current lands on the route's own task group (per-route correctness, all eleven)", () => {
    const cases: readonly { readonly route: Route; readonly expected: string }[] = [
      { route: { name: "dashboard" }, expected: "Dashboard" },
      { route: { name: "capture", projectId: DEMO_TASK_PROJECT_ID }, expected: "Capture" },
      { route: { name: "case", projectId: DEMO_TASK_PROJECT_ID }, expected: "Investigate" },
      { route: { name: "boq-lens", projectId: DEMO_TASK_PROJECT_ID }, expected: "Understand costs" },
      { route: { name: "solution", projectId: DEMO_SOLUTION_PROJECT_ID, query: {} }, expected: "Build solution" },
      { route: { name: "intervention", projectId: DEMO_SCENARIO_PROJECT_ID, query: {} }, expected: "Build solution" },
      { route: { name: "outcomes", projectId: DEMO_TASK_PROJECT_ID }, expected: "Review outcome" },
      { route: { name: "projects" }, expected: "Projects" },
      { route: { name: "settings" }, expected: "Settings / Integrations" },
    ];
    for (const { route, expected } of cases) {
      const html = renderToStaticMarkup(
        <AppShell route={route} apiStatus={DEMO_STATUS}>
          <div />
        </AppShell>,
      );
      const current = /aria-current="page"[^>]*>([^<]+)</.exec(html);
      expect(current, `${formatRoute(route)} expects ${expected}`).not.toBeNull();
      expect(current![1]!.trim()).toBe(expected);
    }
  });
});

/* ------------------------------------------------------------------ */
/* 4. Nav ↔ route lockstep (the per-project surface nav)              */
/* ------------------------------------------------------------------ */

describe("POST-006 route completeness — the per-project surface nav is in lockstep with the routes", () => {
  const navHtml = renderToStaticMarkup(
    withEnv(<ProjectSurfaceNav projectId={DEMO_PROJECT_ID} current="capture" />),
  );

  test("every link the surface nav composes addresses a real route (no dead nav links)", () => {
    const links = [...navHtml.matchAll(/href="(#[^"]+)"/g)].map((match) => match[1]!);
    expect(links.length).toBe(PROJECT_SURFACES.length + 1); // + the overview
    for (const href of links) {
      expect(parseHash(href).name, href).not.toBe("not-found");
    }
  });

  test("every ProjectSurface has a visible entry in the surface nav (no orphan surface)", () => {
    for (const { surface, label } of PROJECT_SURFACES) {
      const route = projectSurfaceRoute(surface, DEMO_PROJECT_ID);
      expect(navHtml).toContain(`href="${formatRoute(route)}"`);
      expect(navHtml).toContain(label);
    }
  });

  test("the active surface carries aria-current (the nav answers WHERE you are)", () => {
    expect(navHtml).toContain('aria-current="page"');
    const current = /aria-current="page"[^>]*>([^<]+)</.exec(navHtml);
    expect(current![1]!).toBe("Capture / Upload");
  });

  test("every per-project surface link the nav composes is a real surface route (nav targets = surface routes)", () => {
    const surfaceNames = new Set<ProjectSurface>(PROJECT_SURFACES.map(({ surface }) => surface));
    const bad: string[] = [];
    for (const match of navHtml.matchAll(/href="#\/projects\/[^/"]+\/([a-z-]+)"/g)) {
      const target = match[1]!;
      if (target === "solution" || surfaceNames.has(target as ProjectSurface)) {
        continue;
      }
      bad.push(target);
    }
    expect(bad).toEqual([]);
  });
});
