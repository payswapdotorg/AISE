/**
 * PROD-002 — API seam tests (injected fetch stubs only: no network, no
 * timers, deterministic).
 */

import { describe, expect, test } from "bun:test";
import {
  describeApiFailure,
  fetchJson,
  loadCaseDetailLive,
  loadCaseSummariesLive,
  loadProjectsLive,
  loadRealityLive,
  loadScenarioIndexLive,
  loadScenarioLive,
  probeApi,
  type FetchLike,
} from "./api";
import { canonicalScenario } from "../viewer/fixtures";

/** A fetch stub answering each path with canned behavior (deterministic). */
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

/** The canonical scenario wrapped in the API envelope. */
function scenarioResponse() {
  return { ok: true, scenario: canonicalScenario() };
}

describe("PROD-002 API seam", () => {
  describe("probeApi (the API mode)", () => {
    test("healthy + ready → available", async () => {
      const status = await probeApi(stubFetch({ "/healthz": {}, "/readyz": {} }));
      expect(status.mode).toBe("available");
      expect(status.healthz).toBe("ok");
      expect(status.readyz).toBe("ok");
    });

    test("healthz failing → unavailable with readyz skipped", async () => {
      const status = await probeApi(
        stubFetch({ "/healthz": { status: 500, body: { ok: false } } }),
      );
      expect(status.mode).toBe("unavailable");
      expect(status.healthz).toBe("failed");
      expect(status.readyz).toBe("skipped");
      expect(status.detail).toContain("demo data");
    });

    test("network failure on healthz → unavailable (dev without backend)", async () => {
      const status = await probeApi(stubFetch({ "/healthz": "throw" }));
      expect(status.mode).toBe("unavailable");
      expect(status.healthz).toBe("failed");
    });

    test("healthz ok but readyz failing → unavailable, readyz failed", async () => {
      const status = await probeApi(
        stubFetch({ "/healthz": {}, "/readyz": { status: 503, body: { ok: false } } }),
      );
      expect(status.mode).toBe("unavailable");
      expect(status.readyz).toBe("failed");
    });

    test("non-JSON health bodies fail honestly (no ok:true envelope)", async () => {
      const status = await probeApi(
        stubFetch({ "/healthz": { body: "plain text" }, "/readyz": {} }),
      );
      expect(status.mode).toBe("unavailable");
    });
  });

  describe("fetchJson (never throws)", () => {
    test("parses ok JSON", async () => {
      const result = await fetchJson(stubFetch({ "/x": { body: { hello: 1 } } }), "/x");
      expect(result).toEqual({ ok: true, value: { hello: 1 } });
    });

    test("network errors become typed network failures", async () => {
      const result = await fetchJson(stubFetch({ "/x": "throw" }), "/x");
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.failure.kind).toBe("network");
        expect(result.failure.detail).toContain("network is down");
      }
    });

    test("HTTP errors become typed http failures carrying the status", async () => {
      const result = await fetchJson(
        stubFetch({ "/x": { status: 404, body: { ok: false } } }),
        "/x",
      );
      expect(result.ok).toBe(false);
      if (!result.ok && result.failure.kind === "http") {
        expect(result.failure.status).toBe(404);
        expect(describeApiFailure(result.failure)).toContain("HTTP 404");
      }
    });

    test("broken JSON becomes a typed invalid failure", async () => {
      const broken: FetchLike = async () => new Response("{not json", { status: 200 });
      const result = await fetchJson(broken, "/x");
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.failure.kind).toBe("invalid");
      }
    });
  });

  describe("scenario adapter (viewer request builders, same-origin)", () => {
    test("a genuine scenario record loads live and validates", async () => {
      const result = await loadScenarioLive(
        stubFetch({
          "/v1/interventions/scenario-office-refit": { body: scenarioResponse() },
        }),
        "scenario-office-refit",
      );
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.scenario.record.scenarioId).toBe("scenario-office-refit");
        expect(result.scenario.endpoint).toBe("/v1/interventions/scenario-office-refit");
        expect(result.scenario.record.states.length).toBe(4);
      }
    });

    test("a structurally invalid scenario record is rejected, never coerced", async () => {
      const result = await loadScenarioLive(
        stubFetch({
          "/v1/interventions/bad": {
            body: { ok: true, scenario: { scenarioId: "bad", states: "nope" } },
          },
        }),
        "bad",
      );
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.failure.kind).toBe("invalid");
        expect(result.failure.detail).toContain("states must be an array");
      }
    });

    test("a 404 scenario is an http failure (NOT a silent fallback)", async () => {
      const result = await loadScenarioLive(stubFetch({}), "missing");
      expect(result.ok).toBe(false);
      if (!result.ok && result.failure.kind === "http") {
        expect(result.failure.status).toBe(404);
      }
    });

    test("missing envelope (ok !== true) is invalid", async () => {
      const result = await loadScenarioLive(
        stubFetch({ "/v1/interventions/x": { body: { scenario: {} } } }),
        "x",
      );
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.failure.kind).toBe("invalid");
        expect(result.failure.detail).toContain("envelope");
      }
    });
  });

  describe("scenario index adapter", () => {
    test("lists summaries verbatim", async () => {
      const result = await loadScenarioIndexLive(
        stubFetch({
          "/v1/interventions": {
            body: {
              ok: true,
              scenarios: [
                {
                  scenarioId: "s1",
                  projectId: "p1",
                  title: "T",
                  status: "draft",
                  stateCount: 2,
                },
              ],
            },
          },
        }),
      );
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.scenarios.length).toBe(1);
        expect(result.scenarios[0]?.projectId).toBe("p1");
      }
    });

    test("a summary missing stateCount is rejected", async () => {
      const result = await loadScenarioIndexLive(
        stubFetch({
          "/v1/interventions": {
            body: { ok: true, scenarios: [{ scenarioId: "s1", projectId: "p1" }] },
          },
        }),
      );
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.failure.detail).toContain("stateCount");
      }
    });
  });

  describe("projects adapter", () => {
    test("lists identity project records", async () => {
      const result = await loadProjectsLive(
        stubFetch({
          "/v1/identity/organizations/org-northwind/projects": {
            body: {
              ok: true,
              projects: [
                {
                  projectId: "p1",
                  organizationId: "org-northwind",
                  name: "Riverside",
                  createdAt: "2025-01-01T00:00:00Z",
                },
              ],
            },
          },
        }),
        "org-northwind",
      );
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.projects[0]?.record.name).toBe("Riverside");
      }
    });

    test("an invalid project record is rejected with the defect named", async () => {
      const result = await loadProjectsLive(
        stubFetch({
          "/v1/identity/organizations/o/projects": {
            body: { ok: true, projects: [{ projectId: "p1" }] },
          },
        }),
        "o",
      );
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.failure.detail).toContain("organizationId");
      }
    });
  });

  describe("reality adapter (404 = honest empty)", () => {
    test("adapts a GraphVersion into the shell's RealityPaneView with sources", async () => {
      const result = await loadRealityLive(
        stubFetch({
          "/v1/reality/projects/p1/versions/latest": {
            body: {
              ok: true,
              version: {
                versionId: "v010",
                createdAt: "2025-07-01T00:00:00Z",
                nodes: [
                  {
                    nodeId: "wall-north",
                    kind: "wall",
                    epistemicStatus: "CONFIRMED",
                    properties: [
                      { key: "thickness", value: 240, unit: "mm" },
                      { key: "fireRating", value: "REI90" },
                    ],
                    provenance: [
                      { evidenceId: "aa", recordedAt: "2025-07-01T00:00:00Z" },
                      { evidenceId: "aa", recordedAt: "2025-07-01T00:00:00Z" },
                    ],
                  },
                ],
              },
            },
          },
        }),
        "p1",
      );
      expect(result.ok).toBe(true);
      if (result.ok && result.view !== null) {
        expect(result.view.versionId).toBe("v010");
        expect(result.view.nodes.length).toBe(1);
        const node = result.view.nodes[0]!;
        expect(node.summary.value).toBe("thickness 240 mm · fireRating REI90");
        expect(node.evidenceIds.map((entry) => entry.value)).toEqual(["aa"]);
        expect(node.source).toEqual({ module: "reality", recordId: "v010:wall-north" });
      }
    });

    test("a 404 (no snapshot yet) is an honest empty view, not an error", async () => {
      const result = await loadRealityLive(stubFetch({}), "p1");
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.view).toBeNull();
      }
    });

    test("an invalid version record is rejected", async () => {
      const result = await loadRealityLive(
        stubFetch({
          "/v1/reality/projects/p1/versions/latest": {
            body: { ok: true, version: { versionId: "v1" } },
          },
        }),
        "p1",
      );
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.failure.detail).toContain("createdAt");
      }
    });
  });

  describe("cases adapter", () => {
    test("lists case summaries verbatim", async () => {
      const result = await loadCaseSummariesLive(
        stubFetch({
          "/v1/cases": {
            body: {
              ok: true,
              cases: [
                {
                  caseId: "case-007",
                  title: "Fire rating discrepancy",
                  status: "in-review",
                  createdAt: "2025-01-01T00:00:00Z",
                  updatedAt: "2025-01-02T00:00:00Z",
                  counts: {
                    observations: 3,
                    hypotheses: 2,
                    missingEvidence: 1,
                    openMissingEvidence: 1,
                  },
                },
              ],
            },
          },
        }),
      );
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.cases[0]?.counts.observations).toBe(3);
      }
    });

    test("loads a full case record; 404 is honest empty", async () => {
      const missing = await loadCaseDetailLive(stubFetch({}), "nope");
      expect(missing.ok).toBe(true);
      if (missing.ok) {
        expect(missing.record).toBeNull();
      }
      const found = await loadCaseDetailLive(
        stubFetch({
          "/v1/cases/c1": {
            body: {
              ok: true,
              case: {
                caseId: "c1",
                title: "T",
                status: "open",
                observations: [],
                hypotheses: [],
                missingEvidence: [],
              },
            },
          },
        }),
        "c1",
      );
      expect(found.ok).toBe(true);
    });

    test("a case record missing an array field is rejected", async () => {
      const result = await loadCaseDetailLive(
        stubFetch({
          "/v1/cases/c1": { body: { ok: true, case: { caseId: "c1", title: "T", status: "x" } } },
        }),
        "c1",
      );
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.failure.detail).toContain("observations");
      }
    });
  });
});
