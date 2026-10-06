/**
 * WORLD-P5 — the world ROUTE tests (the product shell's typed hash
 * codec, extended additively): the `#/world` route parses + formats +
 * round-trips; the closed query set rejects unknown parameters; the
 * desktop journey's composed URL (`#/world`) resolves to the route.
 */

import { describe, expect, test } from "bun:test";
import { formatRoute, parseHash, routeKey, routeSurface } from "./router";

describe("WORLD-P5 — the world route (the typed hash codec)", () => {
  test("the bare world route parses and formats canonically", () => {
    expect(parseHash("#/world")).toEqual({ name: "world", query: {} });
    expect(formatRoute({ name: "world", query: {} })).toBe("#/world");
  });

  test("the live scope + deep links parse and round-trip verbatim", () => {
    const hash = "#/world?project=proj-live-001&case=case-9&element=plan-wall-001&panel=objective";
    const route = parseHash(hash);
    expect(route).toEqual({
      name: "world",
      query: {
        project: "proj-live-001",
        case: "case-9",
        element: "plan-wall-001",
        panel: "objective",
      },
    });
    if (route.name === "world") {
      expect(formatRoute(route)).toBe(hash);
      expect(routeKey(route)).toBe(hash);
    }
  });

  test("the closed query set rejects unknown parameters (typed not-found)", () => {
    expect(parseHash("#/world?unknown=x").name).toBe("not-found");
    expect(parseHash("#/world?project=").name).toBe("not-found");
    expect(parseHash("#/world?project").name).toBe("not-found");
  });

  test("the surface mapping carries the world surface", () => {
    expect(routeSurface(parseHash("#/world"))).toBe("world");
  });

  test("the desktop journey's composed URL resolves to the world route", () => {
    /* The desktop world journey composes `${target.url}#/world` — the
     * hash this parses is exactly that composed route. */
    expect(parseHash("#/world")).toEqual({ name: "world", query: {} });
  });
});
