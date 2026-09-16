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
    test("lists identity project records (requester-guarded read)", async () => {
      const result = await loadProjectsLive(
        stubFetch({
          "/v1/identity/organizations/org-northwind/projects?requester=user-alice": {
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
        "user-alice",
      );
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.projects[0]?.record.name).toBe("Riverside");
      }
    });

    test("an invalid project record is rejected with the defect named", async () => {
      const result = await loadProjectsLive(
        stubFetch({
          "/v1/identity/organizations/o/projects?requester=user-alice": {
            body: { ok: true, projects: [{ projectId: "p1" }] },
          },
        }),
        "o",
        "user-alice",
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

/* ------------------------------------------------------------------ */
/* PROD-010 — the typed 4xx envelope + the live write-path adapters     */
/* ------------------------------------------------------------------ */

import {
  appendStepLive,
  createCaseLive,
  createLiveAuthorizationPort,
  createProjectLive,
  createScenarioLive,
  loadCaseLineageLive,
  loadComparisonLive,
  loadEvidenceIndexLive,
  loadLatestRealityVersionLive,
  recordApprovalReferenceLive,
  recordExecutionLive,
  recordOutcomeLive,
  runComparisonLive,
  transitionScenarioStatusLive,
} from "./api";

/** A fetch stub that RECORDS every call (for exact POST body assertions). */
function recordingFetch(
  status: number,
  body: unknown,
): { readonly calls: { readonly input: string; readonly init?: RequestInit }[]; readonly fetchImpl: FetchLike } {
  const calls: { input: string; init?: RequestInit }[] = [];
  const fetchImpl: FetchLike = async (input, init) => {
    calls.push({ input, init });
    return new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });
  };
  return { calls, fetchImpl };
}

const HEX64 = "a".repeat(64);
const projectAnswer = {
  ok: true,
  project: {
    projectId: "p1",
    organizationId: "org-northwind",
    name: "Riverside",
    createdAt: "2026-01-01T00:00:00.000Z",
  },
};
const caseAnswer = {
  ok: true,
  case: {
    caseId: "case-007",
    title: "Wall mismatch",
    status: "open",
    observations: [],
    hypotheses: [],
    missingEvidence: [],
  },
};
const stepAnswer = {
  ok: true,
  step: { stepId: "step-001", stepIndex: 1, kind: "property_change", targetNodeId: "wall-north" },
  state: { stateId: HEX64, stateIndex: 1, nodes: [] },
};
const executionAnswer = {
  ok: true,
  execution: {
    executionRecordId: "exec-001",
    caseId: "case-007",
    scenarioId: "scenario-office-refit",
    stateId: HEX64,
    executedStepIds: ["step-001"],
    evidenceIds: [HEX64],
    captureSessionIds: [],
    executedAt: "2026-03-02T09:00:00.000Z",
    recordedAt: "2026-03-02T09:05:00.000Z",
    stateTransition: { fromStatus: "PROPOSED", toStatus: "EXECUTED", evidenceIds: [HEX64] },
    outcomes: [],
  },
};
const outcomeAnswer = {
  ok: true,
  outcome: {
    outcomeId: "outcome-001",
    executionRecordId: "exec-001",
    caseId: "case-007",
    statement: "The wall was rebuilt to spec.",
    epistemicStatus: "OBSERVED",
    evidenceIds: [HEX64],
  },
};
const comparisonAnswer = {
  ok: true,
  comparison: {
    comparisonId: "comp-001",
    realityRef: { projectId: "p1", versionId: "v002" },
    stats: { totalEntries: 3, discrepancies: 1 },
    inputDigest: "b".repeat(64),
    computedAt: "2026-03-02T10:00:00.000Z",
  },
};
const lineageAnswer = {
  ok: true,
  lineage: {
    caseId: "case-007",
    executions: [
      {
        executionRecordId: "exec-001",
        executedAt: "2026-03-02T09:00:00.000Z",
        executedStepIds: ["step-001"],
        executionEvidenceIds: [HEX64],
        outcomes: [
          { outcomeId: "outcome-001", statement: "Rebuilt to spec.", epistemicStatus: "OBSERVED" },
        ],
      },
    ],
  },
};

describe("PROD-010 typed 4xx envelope", () => {
  test("a typed envelope surfaces code/reason/issues as ADDITIVE fields", async () => {
    const result = await fetchJson(
      stubFetch({
        "/x": {
          status: 422,
          body: { ok: false, error: "unknown_node_ref", detail: "node nope does not exist" },
        },
      }),
      "/x",
    );
    expect(result.ok).toBe(false);
    if (!result.ok && result.failure.kind === "http") {
      expect(result.failure.status).toBe(422);
      expect(result.failure.detail).toBe("/x answered HTTP 422");
      expect(result.failure.code).toBe("unknown_node_ref");
      expect(result.failure.reason).toBe("node nope does not exist");
    }
  });

  test("issues ride bounded with a truncation marker", async () => {
    const result = await fetchJson(
      stubFetch({
        "/x": {
          status: 400,
          body: {
            ok: false,
            error: "schema_invalid",
            detail: "request body does not satisfy the Evidence wire contract",
            issues: [
              { path: "contentId", code: "invalid_string" },
              { path: "byteSize", code: "invalid_type" },
            ],
          },
        },
      }),
      "/x",
    );
    expect(result.ok).toBe(false);
    if (!result.ok && result.failure.kind === "http") {
      expect(result.failure.issues).toEqual([
        "contentId: invalid_string",
        "byteSize: invalid_type",
      ]);
      expect(describeApiFailure(result.failure)).toBe(
        "/x answered HTTP 400 — schema_invalid: request body does not satisfy the Evidence wire contract" +
          " [issues: contentId: invalid_string; byteSize: invalid_type]",
      );
    }
  });

  test("more than five issues are truncated with an explicit marker", async () => {
    const result = await fetchJson(
      stubFetch({
        "/x": {
          status: 400,
          body: {
            ok: false,
            error: "schema_invalid",
            detail: "bad",
            issues: [1, 2, 3, 4, 5, 6, 7].map((n) => `issue-${String(n)}`),
          },
        },
      }),
      "/x",
    );
    expect(result.ok).toBe(false);
    if (!result.ok && result.failure.kind === "http") {
      expect(result.failure.issues).toHaveLength(6);
      expect(result.failure.issues?.[5]).toBe("… (+2 more)");
    }
  });

  test("malformed/HTML bodies keep the exact generic detail (no code guessed)", async () => {
    const html: FetchLike = async () =>
      new Response("<html>proxy error</html>", { status: 502 });
    const result = await fetchJson(html, "/x");
    expect(result.ok).toBe(false);
    if (!result.ok && result.failure.kind === "http") {
      expect(result.failure.detail).toBe("/x answered HTTP 502");
      expect(result.failure.code).toBeUndefined();
      expect(result.failure.reason).toBeUndefined();
      expect(describeApiFailure(result.failure)).toBe("/x answered HTTP 502");
    }
  });

  test("a 2xx response is unchanged by the envelope work", async () => {
    const result = await fetchJson(stubFetch({ "/x": { body: { ok: true, hello: 1 } } }), "/x");
    expect(result).toEqual({ ok: true, value: { ok: true, hello: 1 } });
  });
});

describe("PROD-010 write-path adapters (exact wire contracts)", () => {
  test("createProjectLive posts the identity router's exact body", async () => {
    const { calls, fetchImpl } = recordingFetch(200, projectAnswer);
    const result = await createProjectLive(fetchImpl, "org-northwind", {
      projectId: "p1",
      name: "Riverside",
      actor: "user-alice",
    });
    expect(result.ok).toBe(true);
    expect(calls[0]?.input).toBe("/v1/identity/organizations/org-northwind/projects");
    expect(calls[0]?.init?.method).toBe("POST");
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({
      projectId: "p1",
      name: "Riverside",
      actor: "user-alice",
    });
  });

  test("createProjectLive percent-encodes the org id and surfaces typed 4xxs", async () => {
    const { calls, fetchImpl } = recordingFetch(422, {
      ok: false,
      error: "cross_tenant",
      detail: "the actor is not a member of this organization",
    });
    const result = await createProjectLive(fetchImpl, "org/with space", {
      projectId: "p1",
      name: "X",
      actor: "user-alice",
    });
    expect(result.ok).toBe(false);
    expect(calls[0]?.input).toBe("/v1/identity/organizations/org%2Fwith%20space/projects");
    if (!result.ok && result.failure.kind === "http") {
      expect(result.failure.code).toBe("cross_tenant");
    }
  });

  test("createLiveAuthorizationPort relays the question verbatim; decision is 200 data", async () => {
    const { calls, fetchImpl } = recordingFetch(200, {
      ok: true,
      decision: {
        allowed: true,
        grant: {
          membershipId: "mem-1",
          roleId: "org-founder",
          permission: "identity:write",
          scope: { kind: "organization" },
        },
      },
    });
    const port = createLiveAuthorizationPort(fetchImpl);
    const decision = await port.decide({
      principalId: "user-alice",
      permission: "identity:write",
      target: { kind: "organization", organizationId: "org-northwind" },
    });
    expect(calls[0]?.input).toBe("/v1/identity/authorize");
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({
      principalId: "user-alice",
      permission: "identity:write",
      target: { kind: "organization", organizationId: "org-northwind" },
    });
    expect(decision.allowed).toBe(true);
  });

  test("createLiveAuthorizationPort THROWS on transport failure (never guesses)", async () => {
    const port = createLiveAuthorizationPort(stubFetch({ "/v1/identity/authorize": "throw" }));
    await expect(
      port.decide({
        principalId: "user-alice",
        permission: "identity:write",
        target: { kind: "organization", organizationId: "org-northwind" },
      }),
    ).rejects.toThrow("network failure");
  });

  test("loadProjectsLive surfaces the typed 422 requester_required", async () => {
    const result = await loadProjectsLive(
      stubFetch({
        "/v1/identity/organizations/o/projects?requester=user-alice": {
          status: 422,
          body: {
            ok: false,
            error: "requester_required",
            detail: "guarded reads require a `requester` query parameter",
          },
        },
      }),
      "o",
      "user-alice",
    );
    expect(result.ok).toBe(false);
    if (!result.ok && result.failure.kind === "http") {
      expect(result.failure.status).toBe(422);
      expect(result.failure.code).toBe("requester_required");
    }
  });

  test("createScenarioLive posts the intervention router's exact body", async () => {
    const { calls, fetchImpl } = recordingFetch(200, scenarioResponse());
    const result = await createScenarioLive(fetchImpl, {
      scenarioId: "scenario-office-refit",
      projectId: "project-zurich-hq",
      title: "Office refit",
      baselineVersionId: "v002",
    });
    expect(result.ok).toBe(true);
    expect(calls[0]?.input).toBe("/v1/interventions");
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({
      scenarioId: "scenario-office-refit",
      projectId: "project-zurich-hq",
      title: "Office refit",
      baselineVersionId: "v002",
    });
  });

  test("appendStepLive posts the flat body on a percent-encoded :id/steps path", async () => {
    const { calls, fetchImpl } = recordingFetch(200, stepAnswer);
    const result = await appendStepLive(fetchImpl, "scenario/one", {
      kind: "property_change",
      targetNodeId: "wall-north",
      property: { key: "thickness", value: 240, unit: "mm" },
      provenance: { evidenceIds: [HEX64] },
    });
    expect(result.ok).toBe(true);
    expect(calls[0]?.input).toBe("/v1/interventions/scenario%2Fone/steps");
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({
      kind: "property_change",
      targetNodeId: "wall-north",
      property: { key: "thickness", value: 240, unit: "mm" },
      provenance: { evidenceIds: [HEX64] },
    });
    if (result.ok) {
      expect(result.record.step.stepId).toBe("step-001");
      expect(result.record.state.stateId).toBe(HEX64);
    }
  });

  test("appendStepLive surfaces typed 422s (unknown_node_ref / missing_provenance)", async () => {
    for (const code of ["unknown_node_ref", "missing_provenance", "numeric_value_without_unit"]) {
      const result = await appendStepLive(
        stubFetch({
          "/v1/interventions/s/steps": {
            status: 422,
            body: { ok: false, error: code, detail: `typed: ${code}` },
          },
        }),
        "s",
        {
          kind: "note",
          targetNodeId: "wall-north",
          text: "note",
          provenance: { evidenceIds: [HEX64] },
        },
      );
      expect(result.ok).toBe(false);
      if (!result.ok && result.failure.kind === "http") {
        expect(result.failure.code).toBe(code);
      }
    }
  });

  test("createCaseLive posts the probe-verified body (projectId = auth body scope)", async () => {
    const { calls, fetchImpl } = recordingFetch(200, caseAnswer);
    const result = await createCaseLive(fetchImpl, {
      caseId: "case-007",
      projectId: "p1",
      title: "Wall mismatch",
      summary: "The wall differs from the design.",
      createdBy: "user-alice",
      links: { nodeIds: ["wall-north"], evidenceIds: [HEX64], captureSessionIds: [] },
    });
    expect(result.ok).toBe(true);
    expect(calls[0]?.input).toBe("/v1/cases");
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({
      caseId: "case-007",
      projectId: "p1",
      title: "Wall mismatch",
      summary: "The wall differs from the design.",
      createdBy: "user-alice",
      links: { nodeIds: ["wall-north"], evidenceIds: [HEX64], captureSessionIds: [] },
    });
  });

  test("createCaseLive surfaces the typed 422 case_exists", async () => {
    const result = await createCaseLive(
      stubFetch({
        "/v1/cases": {
          status: 422,
          body: { ok: false, error: "case_exists", detail: "case case-007 already exists" },
        },
      }),
      {
        caseId: "case-007",
        projectId: "p1",
        title: "Wall mismatch",
        links: { nodeIds: [], evidenceIds: [], captureSessionIds: [] },
      },
    );
    expect(result.ok).toBe(false);
    if (!result.ok && result.failure.kind === "http") {
      expect(result.failure.code).toBe("case_exists");
    }
  });

  test("loadEvidenceIndexLive validates the register's pairs", async () => {
    const result = await loadEvidenceIndexLive(
      stubFetch({
        "/v1/evidence": {
          body: {
            ok: true,
            evidence: [
              {
                evidence: {
                  contentId: HEX64,
                  acquisitionMethod: "STILL_IMAGERY",
                  mediaType: "image/jpeg",
                  byteSize: 1024,
                  capturedAt: "2026-01-01T00:00:00.000Z",
                },
                invalidation: null,
              },
            ],
          },
        },
      }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.items[0]?.evidence.contentId).toBe(HEX64);
      expect(result.items[0]?.invalidation).toBe(null);
    }
  });

  test("loadEvidenceIndexLive rejects a malformed entry (never coerced)", async () => {
    const result = await loadEvidenceIndexLive(
      stubFetch({
        "/v1/evidence": { body: { ok: true, evidence: [{ evidence: { contentId: "nope" } }] } },
      }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure.kind).toBe("invalid");
    }
  });

  test("loadLatestRealityVersionLive answers version:null on 404 (honest empty)", async () => {
    const result = await loadLatestRealityVersionLive(
      stubFetch({
        "/v1/reality/projects/p1/versions/latest": { status: 404, body: { ok: false } },
      }),
      "p1",
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.version).toBe(null);
    }
  });

  test("loadLatestRealityVersionLive validates the version record", async () => {
    const result = await loadLatestRealityVersionLive(
      stubFetch({
        "/v1/reality/projects/p1/versions/latest": {
          body: {
            ok: true,
            version: {
              versionId: "v002",
              createdAt: "2026-01-01T00:00:00.000Z",
              nodes: [{ nodeId: "wall-north", kind: "wall", epistemicStatus: "OBSERVED" }],
            },
          },
        },
      }),
      "p1",
    );
    expect(result.ok).toBe(true);
    if (result.ok && result.version !== null) {
      expect(result.version.versionId).toBe("v002");
      expect(result.version.nodeCount).toBe(1);
    }
  });

  test("recordApprovalReferenceLive posts { caseId, reviewDecision, reviewedAt }", async () => {
    const { calls, fetchImpl } = recordingFetch(200, scenarioResponse());
    const result = await recordApprovalReferenceLive(fetchImpl, "scenario-office-refit", {
      caseId: "case-007",
      reviewDecision: "approved",
      reviewedAt: "2026-03-01T12:00:00.000Z",
    });
    expect(result.ok).toBe(true);
    expect(calls[0]?.input).toBe("/v1/interventions/scenario-office-refit/approval-reference");
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({
      caseId: "case-007",
      reviewDecision: "approved",
      reviewedAt: "2026-03-01T12:00:00.000Z",
    });
  });

  test("approval-reference 422s (approval_reference_exists) are typed", async () => {
    const result = await recordApprovalReferenceLive(
      stubFetch({
        "/v1/interventions/s/approval-reference": {
          status: 422,
          body: { ok: false, error: "approval_reference_exists", detail: "already recorded" },
        },
      }),
      "s",
      { caseId: "case-007", reviewDecision: "approved", reviewedAt: "2026-03-01T12:00:00.000Z" },
    );
    expect(result.ok).toBe(false);
    if (!result.ok && result.failure.kind === "http") {
      expect(result.failure.code).toBe("approval_reference_exists");
    }
  });

  test("transitionScenarioStatusLive posts { status } and answers { scenario }", async () => {
    const { calls, fetchImpl } = recordingFetch(200, scenarioResponse());
    const result = await transitionScenarioStatusLive(fetchImpl, "scenario-office-refit", {
      status: "under_review",
    });
    expect(result.ok).toBe(true);
    expect(calls[0]?.input).toBe("/v1/interventions/scenario-office-refit/status");
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({ status: "under_review" });
  });

  test("status 422s (invalid_status_transition / approval_reference_required) are typed", async () => {
    for (const code of ["invalid_status_transition", "approval_reference_required", "scenario_terminal"]) {
      const result = await transitionScenarioStatusLive(
        stubFetch({
          "/v1/interventions/s/status": {
            status: 422,
            body: { ok: false, error: code, detail: `typed: ${code}` },
          },
        }),
        "s",
        { status: "approved" },
      );
      expect(result.ok).toBe(false);
      if (!result.ok && result.failure.kind === "http") {
        expect(result.failure.code).toBe(code);
      }
    }
  });

  test("recordExecutionLive posts the exact body; captureSessionIds omitted when absent", async () => {
    const { calls, fetchImpl } = recordingFetch(200, executionAnswer);
    const result = await recordExecutionLive(fetchImpl, {
      executionRecordId: "exec-001",
      caseId: "case-007",
      scenarioId: "scenario-office-refit",
      stateId: HEX64,
      executedStepIds: ["step-001"],
      evidenceIds: [HEX64],
      executedAt: "2026-03-02T09:00:00.000Z",
      actor: "user-alice",
    });
    expect(result.ok).toBe(true);
    expect(calls[0]?.input).toBe("/v1/executions");
    const body = JSON.parse(String(calls[0]?.init?.body)) as Record<string, unknown>;
    expect(body).toEqual({
      executionRecordId: "exec-001",
      caseId: "case-007",
      scenarioId: "scenario-office-refit",
      stateId: HEX64,
      executedStepIds: ["step-001"],
      evidenceIds: [HEX64],
      executedAt: "2026-03-02T09:00:00.000Z",
      actor: "user-alice",
    });
    expect("captureSessionIds" in body).toBe(false);
    if (result.ok) {
      expect(result.record.stateTransition.toStatus).toBe("EXECUTED");
    }
  });

  test("recordOutcomeLive posts the exact body on the percent-encoded path", async () => {
    const { calls, fetchImpl } = recordingFetch(200, outcomeAnswer);
    const result = await recordOutcomeLive(fetchImpl, "exec/001", {
      caseId: "case-007",
      statement: "The wall was rebuilt to spec.",
      evidenceIds: [HEX64],
      observedAt: "2026-03-03T09:00:00.000Z",
      actor: "user-alice",
    });
    expect(result.ok).toBe(true);
    expect(calls[0]?.input).toBe("/v1/executions/exec%2F001/outcomes");
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({
      caseId: "case-007",
      statement: "The wall was rebuilt to spec.",
      evidenceIds: [HEX64],
      observedAt: "2026-03-03T09:00:00.000Z",
      actor: "user-alice",
    });
  });

  test("outcome 422s (outcome_case_mismatch / outcome_without_evidence) are typed", async () => {
    for (const code of ["outcome_case_mismatch", "outcome_without_evidence", "unknown_step_ref"]) {
      const result = await recordOutcomeLive(
        stubFetch({
          "/v1/executions/e/outcomes": {
            status: 422,
            body: { ok: false, error: code, detail: `typed: ${code}` },
          },
        }),
        "e",
        { caseId: "case-007", statement: "s", evidenceIds: [HEX64] },
      );
      expect(result.ok).toBe(false);
      if (!result.ok && result.failure.kind === "http") {
        expect(result.failure.code).toBe(code);
      }
    }
  });

  test("runComparisonLive posts the exact nested body (optionals omitted when absent)", async () => {
    const { calls, fetchImpl } = recordingFetch(200, comparisonAnswer);
    const result = await runComparisonLive(fetchImpl, {
      comparisonId: "comp-001",
      realityRef: { projectId: "p1", versionId: "v002" },
      designReference: {
        sourceOfRecord: {
          systemClass: "arch-cad",
          systemInstanceId: "arch-cad-prod-01",
          sourceRecordId: "IFC-MODEL-0042",
          revision: "C3",
          retrievedAt: "2026-03-01T08:00:00.000Z",
        },
        items: [
          {
            designItemId: "item-1",
            targetNodeId: "wall-north",
            label: "North wall",
            properties: [{ key: "thickness", value: 240, unit: "mm" }],
          },
        ],
      },
    });
    expect(result.ok).toBe(true);
    expect(calls[0]?.input).toBe("/v1/comparisons");
    const body = JSON.parse(String(calls[0]?.init?.body)) as Record<string, unknown>;
    expect(body).toEqual({
      comparisonId: "comp-001",
      realityRef: { projectId: "p1", versionId: "v002" },
      designReference: {
        sourceOfRecord: {
          systemClass: "arch-cad",
          systemInstanceId: "arch-cad-prod-01",
          sourceRecordId: "IFC-MODEL-0042",
          revision: "C3",
          retrievedAt: "2026-03-01T08:00:00.000Z",
        },
        items: [
          {
            designItemId: "item-1",
            targetNodeId: "wall-north",
            label: "North wall",
            properties: [{ key: "thickness", value: 240, unit: "mm" }],
          },
        ],
      },
    });
    expect("tolerances" in body).toBe(false);
    expect("coverage" in body).toBe(false);
  });

  test("loadComparisonLive + loadCaseLineageLive validate their records", async () => {
    const comparison = await loadComparisonLive(
      stubFetch({ "/v1/comparisons/comp-001": { body: comparisonAnswer } }),
      "comp-001",
    );
    expect(comparison.ok).toBe(true);
    if (comparison.ok) {
      expect(comparison.record.stats.discrepancies).toBe(1);
    }
    const lineage = await loadCaseLineageLive(
      stubFetch({ "/v1/executions/lineage/case-007": { body: lineageAnswer } }),
      "case-007",
    );
    expect(lineage.ok).toBe(true);
    if (lineage.ok) {
      expect(lineage.record.executions[0]?.outcomes[0]?.epistemicStatus).toBe("OBSERVED");
    }
  });

  test("lineage typed refusals surface verbatim", async () => {
    const result = await loadCaseLineageLive(
      stubFetch({
        "/v1/executions/lineage/case-007": {
          status: 422,
          body: {
            ok: false,
            error: "lineage_missing_outcome",
            detail: "execution exec-001 has no recorded outcome",
          },
        },
      }),
      "case-007",
    );
    expect(result.ok).toBe(false);
    if (!result.ok && result.failure.kind === "http") {
      expect(result.failure.code).toBe("lineage_missing_outcome");
      expect(describeApiFailure(result.failure)).toContain("lineage_missing_outcome");
    }
  });
});
