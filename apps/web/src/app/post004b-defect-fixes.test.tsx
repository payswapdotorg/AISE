/**
 * POST-004B — the three POST-003 defect fixes' targeted assertions (the
 * app's established static-render convention: renderToStaticMarkup
 * projections of pure components with hand-constructed fixtures — no
 * network, no clock, no randomness; resource-driven panels render their
 * loading state because effects never run in static markup).
 *
 *  1. (POST-003 Defect 2) the interactive-solution demo world
 *     (proj-demo-001) is REACHABLE from the Projects surface: a
 *     clearly-labeled card in the "Build solution" task vocabulary links
 *     the solution route directly — in demo mode AND in live mode (the
 *     deployed shape, where the identity registry lists only the demo
 *     tenant's two seeded projects and the world would otherwise be
 *     reachable only by direct-hash knowledge);
 *  2. (POST-003 Defect 3) the data surfaces are GATED on acting-principal
 *     resolution: a signed-in session with NO remembered principal (the
 *     cold already-authenticated load in a tab without the remembered id)
 *     renders the honest hold panel — a requester-guarded identity read
 *     never fires with the demo-vocabulary default principal — and every
 *     other combination stays resolved (the W journey's shape, the
 *     pre-auth contract, demo mode, and the not-yet-settled probe states).
 */

import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { parseHash, formatRoute } from "./router";
import { AppEnvironmentContext } from "./environment";
import {
  actingPrincipalUnresolved,
  UnresolvedPrincipalPanel,
} from "./App";
import { Projects, SolutionWorldCard } from "./surfaces/Projects";
import { DEMO_SOLUTION_PROJECT_ID } from "./demo";
import type { ApiStatus } from "./api";

/** A fetch that must NEVER be called in static rendering. */
function neverFetch(): (input: string, init?: RequestInit) => Promise<Response> {
  return () => Promise.reject(new Error("static render must not fetch"));
}

/** The demo environment's probed status (API absent — the committed demo world). */
const DEMO_STATUS: ApiStatus = {
  mode: "unavailable",
  healthz: "failed",
  readyz: "skipped",
  detail: "the API did not answer /healthz on this origin — showing demo data",
  providers: null,
};

/** A live deployment's probed status (the deployed shape of the Projects surface). */
const LIVE_STATUS: ApiStatus = {
  mode: "available",
  healthz: "ok",
  readyz: "ok",
  detail: "the API answered /healthz on this origin",
  providers: null,
};

/** Wrap a node in the app environment (the real App always provides one). */
function withEnv(node: ReactNode, status: ApiStatus): ReactNode {
  return (
    <AppEnvironmentContext.Provider
      value={{
        apiStatus: status,
        fetchImpl: neverFetch(),
        principalId: "user-alice",
      }}
    >
      {node}
    </AppEnvironmentContext.Provider>
  );
}

/** The walkthrough route the affordance must address (the same route the primary nav's "Build solution" entry and the Dashboard's journey step 5 use). */
const SOLUTION_HREF = formatRoute({
  name: "solution",
  projectId: DEMO_SOLUTION_PROJECT_ID,
  query: {},
});

/* ------------------------------------------------------------------ */
/* 1. The demo-solution world is reachable from the Projects surface   */
/* ------------------------------------------------------------------ */

describe("POST-004B — the solution-world affordance on Projects (Defect 2)", () => {
  test("the card speaks the Build solution task vocabulary and links the walkthrough route directly", () => {
    const html = renderToStaticMarkup(<SolutionWorldCard />);
    expect(html).toContain("Build solution — the interactive walkthrough");
    expect(html).toContain("Build solution — open the interactive walkthrough");
    expect(html).toContain(`href="${SOLUTION_HREF}"`);
  });

  test("the card never presents the walkthrough as a registry project (honest labeling)", () => {
    const html = renderToStaticMarkup(<SolutionWorldCard />);
    expect(html).toContain("outside this organization&#x27;s registry");
    expect(html).toContain("its own project");
  });

  test("the affordance's link addresses a real route (no dead pointer)", () => {
    const route = parseHash(SOLUTION_HREF);
    expect(route.name).toBe("solution");
    if (route.name === "solution") {
      expect(route.projectId).toBe(DEMO_SOLUTION_PROJECT_ID);
    }
  });

  test("the affordance is wired on the Projects surface in DEMO mode", () => {
    const html = renderToStaticMarkup(withEnv(<Projects />, DEMO_STATUS));
    expect(html).toContain(`href="${SOLUTION_HREF}"`);
    expect(html).toContain("Build solution — the interactive walkthrough");
  });

  test("the affordance is wired on the Projects surface in LIVE mode (the deployed shape)", () => {
    // Static rendering renders the registry list's loading state; the
    // affordance card is always-rendered on the surface, so the link is
    // present BEFORE any registry answer — exactly the orphaned-world gap.
    const html = renderToStaticMarkup(withEnv(<Projects />, LIVE_STATUS));
    expect(html).toContain(`href="${SOLUTION_HREF}"`);
    expect(html).toContain("Build solution — the interactive walkthrough");
  });
});

/* ------------------------------------------------------------------ */
/* 2. The data surfaces are gated on principal resolution              */
/* ------------------------------------------------------------------ */

describe("POST-004B — the principal-resolution gate (Defect 3)", () => {
  test("TRUE only for the defect shape: live API + signed-in + NO remembered principal", () => {
    expect(
      actingPrincipalUnresolved({
        apiAvailable: true,
        gateStatus: "signed-in",
        sessionPrincipalId: null,
      }),
    ).toBe(true);
  });

  test("a remembered principal resolves (the W journey's shape — Enter demo remembers the id)", () => {
    expect(
      actingPrincipalUnresolved({
        apiAvailable: true,
        gateStatus: "signed-in",
        sessionPrincipalId: "demo-evaluator",
      }),
    ).toBe(false);
  });

  test("the pre-auth contract stays resolved (auth-inactive deployment — the documented default stands)", () => {
    expect(
      actingPrincipalUnresolved({
        apiAvailable: true,
        gateStatus: "inactive",
        sessionPrincipalId: null,
      }),
    ).toBe(false);
  });

  test("demo mode stays resolved (API unavailable — the demo dataset, no guarded reads)", () => {
    expect(
      actingPrincipalUnresolved({
        apiAvailable: false,
        gateStatus: "signed-in",
        sessionPrincipalId: null,
      }),
    ).toBe(false);
  });

  test("the not-yet-settled and signed-out probe states stay resolved (the gate/loading panels own those renders)", () => {
    for (const gateStatus of ["probing", "signed-out", "error"] as const) {
      expect(
        actingPrincipalUnresolved({
          apiAvailable: true,
          gateStatus,
          sessionPrincipalId: null,
        }),
      ).toBe(false);
    }
  });

  test("the hold panel states the situation honestly and points to the user menu", () => {
    const html = renderToStaticMarkup(<UnresolvedPrincipalPanel />);
    expect(html).toContain("has not resolved the acting principal");
    expect(html).toContain("display-only by design");
    expect(html).toContain("never fire with a guessed default principal");
    expect(html).toContain("Use the user menu to sign out");
  });
});
