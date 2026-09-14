/**
 * AISE-026 — Intervention Studio HTTP surface tests (through the FULL
 * server handler, exercising the one AISE-026 routing delegation block).
 *
 * Depth mandated by the CRITICAL work order: every endpoint's happy path
 * and error path, the stable 404/400/422 status table, 405 with allow,
 * x-request-id correlation, the lazy default wiring (env dataDir — over
 * the DEFAULT reality wiring, read-only) and the full governed lifecycle
 * over HTTP.
 */

import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import pkg from "../../package.json" with { type: "json" };
import { createLogger } from "../lib/log";
import type { EnvRecord } from "../lib/config";
import { createCaptureGateway } from "../capture/gateway";
import { InMemoryCaptureStore } from "../capture/store";
import { createRequestHandler } from "../server";
import { sha256Hex } from "../lib/hash";
import { InterventionService } from "./service";
import { FsInterventionStore } from "./store";
import {
  EV_FIRE_SPEC,
  EV_POINT_CLOUD,
  FIXED_APPROVAL,
  FIXED_NOW,
  PROJECT_ID,
  buildBaselineStorey,
  buildLaterBaseline,
  emptyBaselineResolver,
  fixedClock,
  makeBaselineResolver,
  withTempDir,
} from "./testkit";

const quietLogger = createLogger("error");

const validEnv: EnvRecord = {
  HOST: "127.0.0.1",
  PORT: "8080",
  LOG_LEVEL: "info",
};

/** Handler with the AISE-026 routing block backed by an injected FS store. */
function handlerWith(root: string): (request: Request) => Promise<Response> {
  return createRequestHandler({
    envSource: () => validEnv,
    version: pkg.version,
    logger: quietLogger,
    capture: createCaptureGateway({ store: new InMemoryCaptureStore(), clock: fixedClock }),
    interventions: {
      service: new InterventionService({
        store: new FsInterventionStore(join(root, "data")),
        clock: fixedClock,
        baselineResolver: makeBaselineResolver(PROJECT_ID, [
          buildBaselineStorey(),
          buildLaterBaseline(),
        ]),
      }),
      logger: quietLogger,
    },
  });
}

function postJson(path: string, body: string, headers?: Record<string, string>): Request {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    body,
    headers: { "content-type": "application/json", ...headers },
  });
}

function get(path: string, headers?: Record<string, string>): Request {
  return new Request(`http://localhost${path}`, { method: "GET", headers });
}

function put(path: string): Request {
  return new Request(`http://localhost${path}`, { method: "PUT" });
}

interface ErrorBody {
  ok: boolean;
  error: string;
  detail?: string;
}

async function errorBody(response: Response): Promise<ErrorBody> {
  return (await response.json()) as ErrorBody;
}

const SCENARIO_HTTP_ID = "scenario-http-1";
const CREATE_BODY = JSON.stringify({
  scenarioId: SCENARIO_HTTP_ID,
  projectId: PROJECT_ID,
  title: "Office refit over HTTP",
  baselineVersionId: "v001",
});

const STEP_FIRE_BODY = JSON.stringify({
  kind: "property_change",
  targetNodeId: "wall-north",
  property: { key: "fireRating", value: "REI90" },
  rationale: "Fire strategy upgrade.",
  provenance: { evidenceIds: [EV_FIRE_SPEC] },
});

const STEP_ADD_BODY = JSON.stringify({
  kind: "element_addition",
  targetNodeId: "wall-partition-new",
  node: {
    kind: "element",
    properties: [
      { key: "thickness", value: 120, unit: "mm" },
      { key: "fireRating", value: "REI30" },
    ],
  },
  parentNodeId: "space-office-101",
  provenance: {
    evidenceIds: [],
    derivationNote: "Partition per drawing A-101 rev C.",
  },
});

const STEP_REMOVE_BODY = JSON.stringify({
  kind: "proposed_removal",
  targetNodeId: "wall-east",
  reason: "Obsolete partition demolished.",
  provenance: { evidenceIds: [EV_POINT_CLOUD] },
});

describe("intervention HTTP surface: create and read", () => {
  test("POST /v1/interventions creates the scenario; x-request-id echoes; file at the path convention", async () => {
    await withTempDir(async (root) => {
      const handler = handlerWith(root);
      const response = await handler(
        postJson("/v1/interventions", CREATE_BODY, { "x-request-id": "corr-int-1" }),
      );
      expect(response.status).toBe(200);
      expect(response.headers.get("x-request-id")).toBe("corr-int-1");
      const body = (await response.json()) as { ok: boolean; scenario: { states: unknown[] } };
      expect(body.ok).toBe(true);
      expect(body.scenario.states).toHaveLength(1);
      expect(
        existsSync(
          join(root, "data", "interventions", `${sha256Hex(SCENARIO_HTTP_ID)}.json`),
        ),
      ).toBe(true);
      const text = readFileSync(
        join(root, "data", "interventions", `${sha256Hex(SCENARIO_HTTP_ID)}.json`),
        "utf8",
      );
      expect(text).toContain('"baselineVersionId": "v001"');
    });
  });

  test("GET /v1/interventions lists summaries; GET /:id returns the record; 404 unknown", async () => {
    await withTempDir(async (root) => {
      const handler = handlerWith(root);
      await handler(postJson("/v1/interventions", CREATE_BODY));
      const listResponse = await handler(get("/v1/interventions"));
      expect(listResponse.status).toBe(200);
      const list = (await listResponse.json()) as {
        scenarios: { scenarioId: string; stateCount: number }[];
      };
      expect(list.scenarios).toHaveLength(1);
      expect(list.scenarios[0]?.scenarioId).toBe(SCENARIO_HTTP_ID);
      expect(list.scenarios[0]?.stateCount).toBe(1);

      const readResponse = await handler(get(`/v1/interventions/${SCENARIO_HTTP_ID}`));
      expect(readResponse.status).toBe(200);
      const record = (await readResponse.json()) as { scenario: { status: string } };
      expect(record.scenario.status).toBe("draft");

      const missing = await handler(get("/v1/interventions/scenario-none"));
      expect(missing.status).toBe(404);
      expect((await errorBody(missing)).error).toBe("scenario_not_found");
    });
  });

  test("duplicate creation is 422 scenario_exists; malformed JSON is 400", async () => {
    await withTempDir(async (root) => {
      const handler = handlerWith(root);
      await handler(postJson("/v1/interventions", CREATE_BODY));
      const duplicate = await handler(postJson("/v1/interventions", CREATE_BODY));
      expect(duplicate.status).toBe(422);
      expect((await errorBody(duplicate)).error).toBe("scenario_exists");
      const malformed = await handler(postJson("/v1/interventions", "{oops"));
      expect(malformed.status).toBe(400);
      expect((await errorBody(malformed)).error).toBe("malformed_json");
    });
  });

  test("baseline_not_found is 404; baseline_mismatch is 422 (typed status table)", async () => {
    await withTempDir(async (root) => {
      const handler = createRequestHandler({
        envSource: () => validEnv,
        version: pkg.version,
        logger: quietLogger,
        capture: createCaptureGateway({ store: new InMemoryCaptureStore(), clock: fixedClock }),
        interventions: {
          service: new InterventionService({
            store: new FsInterventionStore(join(root, "data")),
            clock: fixedClock,
            baselineResolver: emptyBaselineResolver(),
          }),
          logger: quietLogger,
        },
      });
      const missing = await handler(postJson("/v1/interventions", CREATE_BODY));
      expect(missing.status).toBe(404);
      expect((await errorBody(missing)).error).toBe("baseline_not_found");

      const mismatchHandler = createRequestHandler({
        envSource: () => validEnv,
        version: pkg.version,
        logger: quietLogger,
        capture: createCaptureGateway({ store: new InMemoryCaptureStore(), clock: fixedClock }),
        interventions: {
          service: new InterventionService({
            store: new FsInterventionStore(join(root, "data-b")),
            clock: fixedClock,
            baselineResolver: {
              resolveBaseline: async () => buildLaterBaseline(),
            },
          }),
          logger: quietLogger,
        },
      });
      const mismatch = await mismatchHandler(postJson("/v1/interventions", CREATE_BODY));
      expect(mismatch.status).toBe(422);
      expect((await errorBody(mismatch)).error).toBe("baseline_mismatch");
    });
  });
});

describe("intervention HTTP surface: steps and states", () => {
  test("the canonical 3-step scenario over HTTP (addition + property change + removal)", async () => {
    await withTempDir(async (root) => {
      const handler = handlerWith(root);
      await handler(postJson("/v1/interventions", CREATE_BODY));
      for (const [index, body] of [STEP_FIRE_BODY, STEP_ADD_BODY, STEP_REMOVE_BODY].entries()) {
        const response = await handler(
          postJson(`/v1/interventions/${SCENARIO_HTTP_ID}/steps`, body, {
            "x-request-id": `corr-step-${String(index)}`,
          }),
        );
        expect(response.status).toBe(200);
        expect(response.headers.get("x-request-id")).toBe(`corr-step-${String(index)}`);
        const payload = (await response.json()) as {
          step: { stepIndex: number; stepId: string };
          state: { stateIndex: number; stateId: string; nodes: unknown[] };
        };
        expect(payload.step.stepIndex).toBe(index + 1);
        expect(payload.state.stateIndex).toBe(index + 1);
        expect(payload.step.stepId).toMatch(/^step-[0-9a-f]{16}$/);
        expect(payload.state.stateId).toMatch(/^[0-9a-f]{64}$/);
      }
      // Layer 3: wall-east tombstoned, partition added, all PROPOSED.
      const latest = await handler(get(`/v1/interventions/${SCENARIO_HTTP_ID}/states/latest`));
      expect(latest.status).toBe(200);
      const state = (await latest.json()) as {
        state: {
          nodes: { nodeId: string; node: { epistemicStatus: string } }[];
          proposedTombstones: { nodeId: string }[];
        };
      };
      expect(
        state.state.nodes.every((entry) => entry.node.epistemicStatus === "PROPOSED"),
      ).toBe(true);
      expect(state.state.nodes.find((entry) => entry.nodeId === "wall-east")).toBeUndefined();
      expect(state.state.proposedTombstones.map((stone) => stone.nodeId)).toEqual(["wall-east"]);
      expect(state.state.nodes.find((entry) => entry.nodeId === "wall-partition-new")).toBeDefined();
    });
  });

  test("state reads: index 0..N + latest; 404 state_not_found; 400 invalid_state_index; 405", async () => {
    await withTempDir(async (root) => {
      const handler = handlerWith(root);
      await handler(postJson("/v1/interventions", CREATE_BODY));
      await handler(postJson(`/v1/interventions/${SCENARIO_HTTP_ID}/steps`, STEP_FIRE_BODY));
      for (const selector of ["0", "1", "latest"]) {
        const response = await handler(
          get(`/v1/interventions/${SCENARIO_HTTP_ID}/states/${selector}`),
        );
        expect(response.status).toBe(200);
      }
      const outOfRange = await handler(get(`/v1/interventions/${SCENARIO_HTTP_ID}/states/9`));
      expect(outOfRange.status).toBe(404);
      expect((await errorBody(outOfRange)).error).toBe("state_not_found");
      const malformed = await handler(get(`/v1/interventions/${SCENARIO_HTTP_ID}/states/abc`));
      expect(malformed.status).toBe(400);
      expect((await errorBody(malformed)).error).toBe("invalid_state_index");
      const wrongMethod = await handler(
        postJson(`/v1/interventions/${SCENARIO_HTTP_ID}/states/latest`, "{}"),
      );
      expect(wrongMethod.status).toBe(405);
      expect(wrongMethod.headers.get("allow")).toBe("GET");
      // Unknown scenario on the states route is 404 scenario_not_found.
      const unknownScenario = await handler(get("/v1/interventions/scenario-none/states/0"));
      expect(unknownScenario.status).toBe(404);
      expect((await errorBody(unknownScenario)).error).toBe("scenario_not_found");
    });
  });

  test("typed step rejections over HTTP (unknown_node_ref, missing_provenance, numeric unit)", async () => {
    await withTempDir(async (root) => {
      const handler = handlerWith(root);
      await handler(postJson("/v1/interventions", CREATE_BODY));
      const unknown = await handler(
        postJson(`/v1/interventions/${SCENARIO_HTTP_ID}/steps`, JSON.stringify({
          kind: "property_change",
          targetNodeId: "wall-ghost",
          property: { key: "x", value: "probe" },
          provenance: { evidenceIds: [EV_FIRE_SPEC] },
        })),
      );
      expect(unknown.status).toBe(422);
      const unknownError = await errorBody(unknown);
      expect(unknownError.error).toBe("unknown_node_ref");
      expect(unknownError.detail).toContain("wall-ghost");

      const noProvenance = await handler(
        postJson(`/v1/interventions/${SCENARIO_HTTP_ID}/steps`, JSON.stringify({
          kind: "note",
          targetNodeId: "wall-north",
          text: "x",
          provenance: { evidenceIds: [] },
        })),
      );
      expect(noProvenance.status).toBe(422);
      expect((await errorBody(noProvenance)).error).toBe("missing_provenance");

      const unitless = await handler(
        postJson(`/v1/interventions/${SCENARIO_HTTP_ID}/steps`, JSON.stringify({
          kind: "property_change",
          targetNodeId: "wall-north",
          property: { key: "thickness", value: 300 },
          provenance: { evidenceIds: [EV_FIRE_SPEC] },
        })),
      );
      expect(unitless.status).toBe(422);
      expect((await errorBody(unitless)).error).toBe("numeric_value_without_unit");
    });
  });

  test("405 with allow on wrong methods; unknown subpaths fall to the server 404", async () => {
    await withTempDir(async (root) => {
      const handler = handlerWith(root);
      await handler(postJson("/v1/interventions", CREATE_BODY));
      const putRoot = await handler(put("/v1/interventions"));
      expect(putRoot.status).toBe(405);
      expect(putRoot.headers.get("allow")).toBe("GET, POST");
      const putOne = await handler(put(`/v1/interventions/${SCENARIO_HTTP_ID}`));
      expect(putOne.status).toBe(405);
      expect(putOne.headers.get("allow")).toBe("GET");
      const getSteps = await handler(get(`/v1/interventions/${SCENARIO_HTTP_ID}/steps`));
      expect(getSteps.status).toBe(405);
      expect(getSteps.headers.get("allow")).toBe("POST");
      const foreign = await handler(get("/v1/interventions/some-id/unknown-action"));
      expect(foreign.status).toBe(404);
      expect((await errorBody(foreign)).error).toBe("not_found");
    });
  });
});

describe("intervention HTTP surface: governance (approval reference + status)", () => {
  test("approval-reference recorded verbatim; approved requires it (mutation over HTTP)", async () => {
    await withTempDir(async (root) => {
      const handler = handlerWith(root);
      await handler(postJson("/v1/interventions", CREATE_BODY));
      await handler(postJson(`/v1/interventions/${SCENARIO_HTTP_ID}/steps`, STEP_FIRE_BODY));
      // draft → approved is illegal; draft → under_review first.
      const illegal = await handler(
        postJson(`/v1/interventions/${SCENARIO_HTTP_ID}/status`, JSON.stringify({ status: "approved" })),
      );
      expect(illegal.status).toBe(422);
      expect((await errorBody(illegal)).error).toBe("invalid_status_transition");
      const review = await handler(
        postJson(`/v1/interventions/${SCENARIO_HTTP_ID}/status`, JSON.stringify({ status: "under_review" })),
      );
      expect(review.status).toBe(200);
      // approved WITHOUT a reference: typed refusal.
      const unreference = await handler(
        postJson(`/v1/interventions/${SCENARIO_HTTP_ID}/status`, JSON.stringify({ status: "approved" })),
      );
      expect(unreference.status).toBe(422);
      expect((await errorBody(unreference)).error).toBe("approval_reference_required");
      // Record the reference (verbatim) — then approval succeeds.
      const reference = await handler(
        postJson(
          `/v1/interventions/${SCENARIO_HTTP_ID}/approval-reference`,
          JSON.stringify({
            caseId: "case-http-review",
            reviewDecision: "approved",
            reviewedAt: FIXED_APPROVAL,
          }),
          { "x-request-id": "corr-approval" },
        ),
      );
      expect(reference.status).toBe(200);
      expect(reference.headers.get("x-request-id")).toBe("corr-approval");
      const approved = await handler(
        postJson(`/v1/interventions/${SCENARIO_HTTP_ID}/status`, JSON.stringify({ status: "approved" })),
      );
      expect(approved.status).toBe(200);
      const record = (await approved.json()) as { scenario: { status: string; approvalReference: unknown } };
      expect(record.scenario.status).toBe("approved");
      expect(record.scenario.approvalReference).toEqual({
        caseId: "case-http-review",
        reviewDecision: "approved",
        reviewedAt: FIXED_APPROVAL,
      });
      // Terminal: further steps refuse.
      const terminal = await handler(
        postJson(`/v1/interventions/${SCENARIO_HTTP_ID}/steps`, STEP_REMOVE_BODY),
      );
      expect(terminal.status).toBe(422);
      expect((await errorBody(terminal)).error).toBe("scenario_terminal");
      // Terminal: no transitions out.
      const out = await handler(
        postJson(`/v1/interventions/${SCENARIO_HTTP_ID}/status`, JSON.stringify({ status: "draft" })),
      );
      expect(out.status).toBe(422);
      expect((await errorBody(out)).error).toBe("invalid_status_transition");
    });
  });

  test("superseded path and unknown status values over HTTP", async () => {
    await withTempDir(async (root) => {
      const handler = handlerWith(root);
      await handler(postJson("/v1/interventions", CREATE_BODY));
      const superseded = await handler(
        postJson(`/v1/interventions/${SCENARIO_HTTP_ID}/status`, JSON.stringify({ status: "superseded" })),
      );
      expect(superseded.status).toBe(200);
      const unknown = await handler(
        postJson(`/v1/interventions/${SCENARIO_HTTP_ID}/status`, JSON.stringify({ status: "closed" })),
      );
      expect(unknown.status).toBe(422);
      expect((await errorBody(unknown)).error).toBe("invalid_status_transition");
    });
  });
});

describe("intervention HTTP surface: lazy default wiring", () => {
  test("the default wiring constructs the service from the env data dir over the DEFAULT reality store", async () => {
    await withTempDir(async (root) => {
      const envWithDir: EnvRecord = { ...validEnv, AISE_DATA_DIR: join(root, "data") };
      const handler = createRequestHandler({
        envSource: () => envWithDir,
        version: pkg.version,
        logger: quietLogger,
        capture: createCaptureGateway({ store: new InMemoryCaptureStore(), clock: fixedClock }),
      });
      // Build reality through the DEFAULT reality wiring (same data dir):
      // project + one change set -> v002.
      const project = await handler(
        postJson("/v1/reality/projects", JSON.stringify({ projectId: PROJECT_ID })),
      );
      expect(project.status).toBe(200);
      const change = await handler(
        postJson(
          `/v1/reality/projects/${PROJECT_ID}/changes`,
          JSON.stringify({
            changes: [
              {
                op: "upsert-node",
                node: {
                  nodeId: "wall-http-probe",
                  kind: "element",
                  epistemicStatus: "OBSERVED",
                  properties: [
                    {
                      key: "thickness",
                      value: 200,
                      unit: "mm",
                      epistemicStatus: "OBSERVED",
                      provenance: [
                        { role: "SUPPORTS", evidenceId: EV_POINT_CLOUD, recordedAt: FIXED_NOW },
                      ],
                    },
                  ],
                  provenance: [
                    { role: "SUPPORTS", evidenceId: EV_POINT_CLOUD, recordedAt: FIXED_NOW },
                  ],
                },
              },
            ],
          }),
        ),
      );
      expect(change.status).toBe(200);
      const version = (await change.json()) as { version: { versionId: string } };
      expect(version.version.versionId).toBe("v002");
      // Create the scenario PINNED to v002 through the DEFAULT intervention
      // wiring — the read-only baseline resolver reads the reality store.
      const created = await handler(
        postJson("/v1/interventions", JSON.stringify({
          scenarioId: SCENARIO_HTTP_ID,
          projectId: PROJECT_ID,
          title: "Lazy default wiring",
          baselineVersionId: "v002",
        })),
      );
      expect(created.status).toBe(200);
      expect(
        existsSync(join(root, "data", "interventions", `${sha256Hex(SCENARIO_HTTP_ID)}.json`)),
      ).toBe(true);
      // Layer 0 carries the reality node as PROPOSED (the overlay).
      const latest = await handler(get(`/v1/interventions/${SCENARIO_HTTP_ID}/states/latest`));
      expect(latest.status).toBe(200);
      const state = (await latest.json()) as {
        state: { nodes: { nodeId: string; node: { epistemicStatus: string } }[] };
      };
      const probe = state.state.nodes.find((entry) => entry.nodeId === "wall-http-probe");
      expect(probe?.node.epistemicStatus).toBe("PROPOSED");
      // Pinning v001 (the empty initial version) also resolves.
      const pinnedV1 = await handler(
        postJson("/v1/interventions", JSON.stringify({
          scenarioId: "scenario-http-v1",
          projectId: PROJECT_ID,
          title: "Pinned to the empty initial version",
          baselineVersionId: "v001",
        })),
      );
      expect(pinnedV1.status).toBe(200);
    });
  });
});
