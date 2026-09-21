/**
 * PROD-002 — router codec tests (pure, deterministic, no DOM).
 */

import { describe, expect, test } from "bun:test";
import {
  formatRoute,
  parseHash,
  projectSurfaceRoute,
  PROJECT_SURFACES,
  routeKey,
  routeSurface,
  type Route,
} from "./router";

function roundTrip(route: Route): void {
  expect(parseHash(formatRoute(route))).toEqual(route);
}

describe("PROD-002 router codec", () => {
  describe("dashboard + top-level routes", () => {
    test("empty / root hashes render the dashboard", () => {
      expect(parseHash("")).toEqual({ name: "dashboard" });
      expect(parseHash("#")).toEqual({ name: "dashboard" });
      expect(parseHash("#/")).toEqual({ name: "dashboard" });
    });

    test("projects + settings parse without query", () => {
      expect(parseHash("#/projects")).toEqual({ name: "projects" });
      expect(parseHash("#/settings")).toEqual({ name: "settings" });
    });

    test("unknown top-level paths are explicit not-found (never a fallback)", () => {
      const route = parseHash("#/admin");
      expect(route).toEqual({ name: "not-found", hash: "#/admin" });
      expect(routeSurface(route)).toBe("not-found");
    });

    test("a query on a query-less route is not-found (typed rejection)", () => {
      expect(parseHash("#/projects?x=1").name).toBe("not-found");
      expect(parseHash("#/settings?x=1").name).toBe("not-found");
      expect(parseHash("#/?x=1").name).toBe("not-found");
    });
  });

  describe("project routes", () => {
    test("project overview parses with verbatim id", () => {
      expect(parseHash("#/projects/proj-riverside-refit")).toEqual({
        name: "project",
        projectId: "proj-riverside-refit",
      });
    });

    test("project ids are percent-encoded verbatim (no second id scheme)", () => {
      const route: Route = { name: "project", projectId: "proj/a b" };
      const text = formatRoute(route);
      expect(text).toBe("#/projects/proj%2Fa%20b");
      expect(parseHash(text)).toEqual(route);
    });

    test("every project surface parses", () => {
      expect(parseHash("#/projects/p1/sitetwin")).toEqual({
        name: "sitetwin",
        projectId: "p1",
      });
      expect(parseHash("#/projects/p1/boq-lens")).toEqual({
        name: "boq-lens",
        projectId: "p1",
      });
      expect(parseHash("#/projects/p1/case")).toEqual({ name: "case", projectId: "p1" });
      expect(parseHash("#/projects/p1/intervention")).toEqual({
        name: "intervention",
        projectId: "p1",
        query: {},
      });
    });

    test("the outcomes surface parses and rejects queries (PROD-018)", () => {
      expect(parseHash("#/projects/p1/outcomes")).toEqual({
        name: "outcomes",
        projectId: "p1",
      });
      expect(parseHash("#/projects/p1/outcomes?x=1").name).toBe("not-found");
      expect(routeSurface({ name: "outcomes", projectId: "p1" })).toBe("outcomes");
      expect(projectSurfaceRoute("outcomes", "p1")).toEqual({
        name: "outcomes",
        projectId: "p1",
      });
      expect(formatRoute({ name: "outcomes", projectId: "p1" })).toBe(
        "#/projects/p1/outcomes",
      );
      expect(PROJECT_SURFACES.map((surface) => surface.surface)).toContain("outcomes");
    });

    test("unknown surface names and trailing segments are not-found", () => {
      expect(parseHash("#/projects/p1/evidence").name).toBe("not-found");
      expect(parseHash("#/projects/p1/boq-lens/extra").name).toBe("not-found");
      expect(parseHash("#/projects//boq-lens").name).toBe("not-found");
    });

    test("empty project ids are rejected", () => {
      expect(parseHash("#/projects/%20").name).toBe("not-found");
    });

    test("invalid percent-encodings are rejected, not guessed", () => {
      expect(parseHash("#/projects/proj%zz").name).toBe("not-found");
    });
  });

  describe("intervention layer query", () => {
    test("a valid layer parameter parses", () => {
      expect(parseHash("#/projects/p1/intervention?layer=2")).toEqual({
        name: "intervention",
        projectId: "p1",
        query: { layer: 2 },
      });
      expect(parseHash("#/projects/p1/intervention?layer=0")).toEqual({
        name: "intervention",
        projectId: "p1",
        query: { layer: 0 },
      });
    });

    test("non-numeric, negative or unknown parameters are rejected", () => {
      expect(parseHash("#/projects/p1/intervention?layer=x").name).toBe("not-found");
      expect(parseHash("#/projects/p1/intervention?layer=-1").name).toBe("not-found");
      expect(parseHash("#/projects/p1/intervention?step=1").name).toBe("not-found");
      expect(parseHash("#/projects/p1/intervention?layer").name).toBe("not-found");
    });
  });

  describe("format + round-trips", () => {
    test("canonical formatting of every route shape", () => {
      expect(formatRoute({ name: "dashboard" })).toBe("#/");
      expect(formatRoute({ name: "projects" })).toBe("#/projects");
      expect(formatRoute({ name: "project", projectId: "p1" })).toBe("#/projects/p1");
      expect(formatRoute({ name: "settings" })).toBe("#/settings");
      expect(
        formatRoute({ name: "intervention", projectId: "p1", query: { layer: 3 } }),
      ).toBe("#/projects/p1/intervention?layer=3");
      expect(formatRoute({ name: "intervention", projectId: "p1", query: {} })).toBe(
        "#/projects/p1/intervention",
      );
    });

    test("every route shape round-trips verbatim", () => {
      roundTrip({ name: "dashboard" });
      roundTrip({ name: "projects" });
      roundTrip({ name: "settings" });
      roundTrip({ name: "project", projectId: "proj-riverside-refit" });
      roundTrip({ name: "sitetwin", projectId: "p1" });
      roundTrip({ name: "boq-lens", projectId: "p1" });
      roundTrip({ name: "case", projectId: "p1" });
      roundTrip({ name: "outcomes", projectId: "p1" });
      roundTrip({ name: "intervention", projectId: "p1", query: {} });
      roundTrip({ name: "intervention", projectId: "p1", query: { layer: 2 } });
    });

    test("routeKey is the canonical hash (stable identity)", () => {
      expect(routeKey({ name: "sitetwin", projectId: "p1" })).toBe("#/projects/p1/sitetwin");
    });
  });

  describe("surface mapping (navigation grouping)", () => {
    test("each route maps to its primary navigation surface", () => {
      expect(routeSurface({ name: "dashboard" })).toBe("dashboard");
      expect(routeSurface({ name: "projects" })).toBe("projects");
      expect(routeSurface({ name: "project", projectId: "p" })).toBe("projects");
      expect(routeSurface({ name: "sitetwin", projectId: "p" })).toBe("sitetwin");
      expect(routeSurface({ name: "boq-lens", projectId: "p" })).toBe("boq-lens");
      expect(routeSurface({ name: "case", projectId: "p" })).toBe("case");
      expect(routeSurface({ name: "outcomes", projectId: "p" })).toBe("outcomes");
      expect(
        routeSurface({ name: "intervention", projectId: "p", query: {} }),
      ).toBe("intervention");
      expect(routeSurface({ name: "settings" })).toBe("settings");
    });
  });
});
