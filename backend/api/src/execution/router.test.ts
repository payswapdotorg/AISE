/**
 * AISE-031 — Execution/outcome HTTP surface tests (through the FULL server
 * handler, exercising the one AISE-031 routing delegation block).
 *
 * Depth mandated by the work order: every endpoint's happy path and error
 * path, the stable 404/400/422 status table, 405 with allow, x-request-id
 * correlation, the lazy default wiring (env dataDir — read-only resolvers
 * over the DEFAULT intervention/case wiring and the FsEvidenceStore) and
 * the full record→outcome→lineage lifecycle over HTTP.
 */

import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import pkg from "../../package.json" with { type: "json" };
import { canonicalJsonStringify } from "@aise/shared-contracts";
import { createLogger } from "../lib/log";
import type { EnvRecord } from "../lib/config";
import { createCaptureGateway } from "../capture/gateway";
import { InMemoryCaptureStore } from "../capture/store";
import { createRequestHandler } from "../server";
import { sha256Hex } from "../lib/hash";
import { CaseService } from "../cases/service";
import { FsCaseStore } from "../cases/store";
import { InterventionService } from "../intervention/service";
import { FsInterventionStore } from "../intervention/store";
import { buildBaselineStorey, makeBaselineResolver } from "../intervention/testkit";
import { ExecutionService } from "./service";
import { FsExecutionStore } from "./store";
import {
  CANONICAL_EXECUTION,
  CANONICAL_OUTCOME,
  CASE_ID,
  EV_FIRE_CERT,
  EV_POSTWORK_SCAN,
  EV_WORK_PHOTOS,
  EXECUTION_ID,
  FIXED_APPROVAL,
  FIXED_EXECUTED,
  FIXED_NOW,
  KNOWN_EVIDENCE,
  SCENARIO_ID,
  SESSION_POSTWORK_1,
  SESSION_WORK_1,
  STATE_3_ID,
  buildCaseContext,
  buildScenarioContextWithStatus,
  canonicalResolvers,
  evidenceIdOf,
  fixedClock,
  makeCaseContextResolver,
  makeEvidenceMembershipResolver,
  makeInterventionContextResolver,
  withTempDir,
} from "./testkit";

const quietLogger = createLogger("error");

const validEnv: EnvRecord = {
  HOST: "127.0.0.1",
  PORT: "8080",
  LOG_LEVEL: "info",
};

/** Handler with the AISE-031 routing block backed by an injected FS store. */
function handlerWith(root: string): (request: Request) => Promise<Response> {
  return createRequestHandler({
    envSource: () => validEnv,
    version: pkg.version,
    logger: quietLogger,
    capture: createCaptureGateway({ store: new InMemoryCaptureStore(), clock: fixedClock }),
    executions: {
      service: new ExecutionService({
        store: new FsExecutionStore(join(root, "data")),
        clock: fixedClock,
        ...canonicalResolvers(),
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

function del(path: string): Request {
  return new Request(`http://localhost${path}`, { method: "DELETE" });
}

interface ErrorBody {
  ok: boolean;
  error: string;
  detail?: string;
}

async function errorBody(response: Response): Promise<ErrorBody> {
  return (await response.json()) as ErrorBody;
}

const EXECUTION_BODY = JSON.stringify({
  executionRecordId: EXECUTION_ID,
  caseId: CASE_ID,
  scenarioId: SCENARIO_ID,
  stateId: STATE_3_ID,
  executedStepIds: CANONICAL_EXECUTION.executedStepIds,
  evidenceIds: [EV_WORK_PHOTOS, EV_FIRE_CERT],
  captureSessionIds: [SESSION_WORK_1],
  executedAt: FIXED_EXECUTED,
});

const OUTCOME_BODY = JSON.stringify({
  caseId: CASE_ID,
  statement: CANONICAL_OUTCOME.statement,
  evidenceIds: [EV_POSTWORK_SCAN],
  captureSessionIds: [SESSION_POSTWORK_1],
});

/** A 64-hex id that is NOT any canonical fixture id. */
const GHOST_STATE_ID = sha256Hex("execution-router-ghost-state");
const GHOST_STEP_ID = `step-${"0".repeat(16)}`;

describe("execution HTTP surface: record and read", () => {
  test("POST /v1/executions records the execution; x-request-id echoes; file at the path convention", async () => {
    await withTempDir(async (root) => {
      const handler = handlerWith(root);
      const response = await handler(postJson("/v1/executions", EXECUTION_BODY, { "x-request-id": "corr-exec-1" }));
      expect(response.status).toBe(200);
      expect(response.headers.get("x-request-id")).toBe("corr-exec-1");
      const body = (await response.json()) as {
        ok: boolean;
        execution: {
          executionRecordId: string;
          stateTransition: {
            scenarioId: string;
            stateId: string;
            fromStatus: string;
            toStatus: string;
            executionRecordId: string;
            evidenceIds: string[];
            recordedAt: string;
          };
          history: { eventType: string; eventId: string }[];
          outcomes: unknown[];
        };
      };
      expect(body.ok).toBe(true);
      expect(body.execution.executionRecordId).toBe(EXECUTION_ID);
      expect(body.execution.stateTransition).toEqual({
        scenarioId: SCENARIO_ID,
        stateId: STATE_3_ID,
        fromStatus: "PROPOSED",
        toStatus: "EXECUTED",
        executionRecordId: EXECUTION_ID,
        evidenceIds: [EV_WORK_PHOTOS, EV_FIRE_CERT],
        recordedAt: FIXED_NOW,
      });
      expect(body.execution.history.map((event) => event.eventType)).toEqual([
        "execution_recorded",
      ]);
      expect(body.execution.outcomes).toEqual([]);
      // Canonical bytes at executions/<sha256(id)>.json.
      const path = join(root, "data", "executions", `${sha256Hex(EXECUTION_ID)}.json`);
      expect(existsSync(path)).toBe(true);
      expect(readFileSync(path, "utf8")).toBe(canonicalJsonStringify(body.execution));
    });
  });

  test("GET /v1/executions lists summaries; GET /:id returns the record; 404 unknown", async () => {
    await withTempDir(async (root) => {
      const handler = handlerWith(root);
      await handler(postJson("/v1/executions", EXECUTION_BODY));
      const list = await handler(get("/v1/executions", { "x-request-id": "corr-list" }));
      expect(list.status).toBe(200);
      expect(list.headers.get("x-request-id")).toBe("corr-list");
      const listBody = (await list.json()) as {
        ok: boolean;
        executions: { executionRecordId: string; executedStepCount: number; evidenceCount: number }[];
      };
      expect(listBody.ok).toBe(true);
      expect(listBody.executions).toHaveLength(1);
      expect(listBody.executions[0]?.executionRecordId).toBe(EXECUTION_ID);
      expect(listBody.executions[0]?.executedStepCount).toBe(3);
      expect(listBody.executions[0]?.evidenceCount).toBe(2);

      const one = await handler(get(`/v1/executions/${EXECUTION_ID}`));
      expect(one.status).toBe(200);
      const oneBody = (await one.json()) as { ok: boolean; execution: { caseId: string } };
      expect(oneBody.ok).toBe(true);
      expect(oneBody.execution.caseId).toBe(CASE_ID);

      const missing = await handler(get("/v1/executions/execution-ghost"));
      expect(missing.status).toBe(404);
      expect((await errorBody(missing)).error).toBe("execution_not_found");
    });
  });

  test("the typed governed-path rejections over HTTP (status table 422)", async () => {
    await withTempDir(async (root) => {
      const handler = createRequestHandler({
        envSource: () => validEnv,
        version: pkg.version,
        logger: quietLogger,
        capture: createCaptureGateway({ store: new InMemoryCaptureStore(), clock: fixedClock }),
        executions: {
          service: new ExecutionService({
            store: new FsExecutionStore(join(root, "data")),
            clock: fixedClock,
            interventionContextResolver: makeInterventionContextResolver([
              buildScenarioContextWithStatus("draft"),
            ]),
            caseContextResolver: makeCaseContextResolver([buildCaseContext()]),
            evidenceMembershipResolver: makeEvidenceMembershipResolver(KNOWN_EVIDENCE),
          }),
          logger: quietLogger,
        },
      });
      // A draft scenario refuses with scenario_not_approved, naming it.
      const notApproved = await handler(postJson("/v1/executions", EXECUTION_BODY));
      expect(notApproved.status).toBe(422);
      const notApprovedBody = await errorBody(notApproved);
      expect(notApprovedBody.error).toBe("scenario_not_approved");
      expect(notApprovedBody.detail).toContain(SCENARIO_ID);
      expect(notApprovedBody.detail).toContain("draft");
    });
    await withTempDir(async (root) => {
      const handler = handlerWith(root);
      // Unknown case reference.
      const unknownCase = await handler(
        postJson("/v1/executions", JSON.stringify({ ...JSON.parse(EXECUTION_BODY), caseId: "case-none" })),
      );
      expect(unknownCase.status).toBe(422);
      expect((await errorBody(unknownCase)).error).toBe("unknown_case_ref");
      // Unknown scenario reference.
      const unknownScenario = await handler(
        postJson("/v1/executions", JSON.stringify({ ...JSON.parse(EXECUTION_BODY), scenarioId: "scenario-none" })),
      );
      expect(unknownScenario.status).toBe(422);
      const scenarioBody = await errorBody(unknownScenario);
      expect(scenarioBody.error).toBe("unknown_scenario_ref");
      expect(scenarioBody.detail).toContain("scenario-none");
      // Unknown state layer.
      const unknownState = await handler(
        postJson("/v1/executions", JSON.stringify({ ...JSON.parse(EXECUTION_BODY), stateId: GHOST_STATE_ID })),
      );
      expect(unknownState.status).toBe(422);
      const stateBody = await errorBody(unknownState);
      expect(stateBody.error).toBe("unknown_state_ref");
      expect(stateBody.detail).toContain(GHOST_STATE_ID);
      // Unknown step id (names the id).
      const unknownStep = await handler(
        postJson(
          "/v1/executions",
          JSON.stringify({
            ...JSON.parse(EXECUTION_BODY),
            executedStepIds: [GHOST_STEP_ID],
          }),
        ),
      );
      expect(unknownStep.status).toBe(422);
      const stepBody = await errorBody(unknownStep);
      expect(stepBody.error).toBe("unknown_step_ref");
      expect(stepBody.detail).toContain(GHOST_STEP_ID);
      // Unknown evidence.
      const ghostEvidence = evidenceIdOf("router-never-registered");
      const unknownEvidence = await handler(
        postJson("/v1/executions", JSON.stringify({ ...JSON.parse(EXECUTION_BODY), evidenceIds: [ghostEvidence] })),
      );
      expect(unknownEvidence.status).toBe(422);
      const evidenceBody = await errorBody(unknownEvidence);
      expect(evidenceBody.error).toBe("unknown_evidence_ref");
      expect(evidenceBody.detail).toContain(ghostEvidence);
    });
  });

  test("execution_exists, shape rejections and malformed JSON (422/422/400)", async () => {
    await withTempDir(async (root) => {
      const handler = handlerWith(root);
      await handler(postJson("/v1/executions", EXECUTION_BODY));
      const duplicate = await handler(postJson("/v1/executions", EXECUTION_BODY));
      expect(duplicate.status).toBe(422);
      expect((await errorBody(duplicate)).error).toBe("execution_exists");

      const stepless = await handler(
        postJson("/v1/executions", JSON.stringify({ ...JSON.parse(EXECUTION_BODY), executedStepIds: [] })),
      );
      expect(stepless.status).toBe(422);
      expect((await errorBody(stepless)).error).toBe("execution_without_steps");

      const malformed = await handler(postJson("/v1/executions", "{oops"));
      expect(malformed.status).toBe(400);
      expect((await errorBody(malformed)).error).toBe("malformed_json");

      // Path-shape 400s: undecodable and oversized execution ids.
      const undecodable = await handler(get("/v1/executions/%ZZ"));
      expect(undecodable.status).toBe(400);
      expect((await errorBody(undecodable)).error).toBe("invalid_execution_id");
      const oversized = await handler(get(`/v1/executions/${"x".repeat(257)}`));
      expect(oversized.status).toBe(400);
      expect((await errorBody(oversized)).error).toBe("invalid_execution_id");
    });
  });
});

describe("execution HTTP surface: outcomes", () => {
  test("POST /v1/executions/:id/outcomes records an OBSERVED outcome over HTTP", async () => {
    await withTempDir(async (root) => {
      const handler = handlerWith(root);
      await handler(postJson("/v1/executions", EXECUTION_BODY));
      const outcome = await handler(
        postJson(`/v1/executions/${EXECUTION_ID}/outcomes`, OUTCOME_BODY, { "x-request-id": "corr-out-1" }),
      );
      expect(outcome.status).toBe(200);
      expect(outcome.headers.get("x-request-id")).toBe("corr-out-1");
      const body = (await outcome.json()) as {
        ok: boolean;
        outcome: {
          outcomeId: string;
          epistemicStatus: string;
          executionRecordId: string;
          caseId: string;
          captureSessionIds: string[];
        };
      };
      expect(body.ok).toBe(true);
      expect(body.outcome.outcomeId).toMatch(/^out-[0-9a-f]{16}$/);
      expect(body.outcome.epistemicStatus).toBe("OBSERVED");
      expect(body.outcome.executionRecordId).toBe(EXECUTION_ID);
      expect(body.outcome.caseId).toBe(CASE_ID);
      expect(body.outcome.captureSessionIds).toEqual([SESSION_POSTWORK_1]);
      // The record now carries the outcome + its outcome_recorded event.
      const record = (await (await handler(get(`/v1/executions/${EXECUTION_ID}`))).json()) as {
        execution: {
          outcomes: { outcomeId: string }[];
          history: { eventType: string }[];
        };
      };
      expect(record.execution.outcomes.map((entry) => entry.outcomeId)).toEqual([
        body.outcome.outcomeId,
      ]);
      expect(record.execution.history.map((event) => event.eventType)).toEqual([
        "execution_recorded",
        "outcome_recorded",
      ]);
    });
  });

  test("outcome rejections over HTTP: 404 unknown execution; 422 mismatch/evidence/status shape", async () => {
    await withTempDir(async (root) => {
      const handler = handlerWith(root);
      const missing = await handler(
        postJson("/v1/executions/execution-ghost/outcomes", OUTCOME_BODY),
      );
      expect(missing.status).toBe(404);
      expect((await errorBody(missing)).error).toBe("execution_not_found");

      await handler(postJson("/v1/executions", EXECUTION_BODY));
      const mismatch = await handler(
        postJson(
          `/v1/executions/${EXECUTION_ID}/outcomes`,
          JSON.stringify({ ...JSON.parse(OUTCOME_BODY), caseId: "case-somewhere-else" }),
        ),
      );
      expect(mismatch.status).toBe(422);
      expect((await errorBody(mismatch)).error).toBe("outcome_case_mismatch");

      const evidenceless = await handler(
        postJson(
          `/v1/executions/${EXECUTION_ID}/outcomes`,
          JSON.stringify({ ...JSON.parse(OUTCOME_BODY), evidenceIds: [] }),
        ),
      );
      expect(evidenceless.status).toBe(422);
      expect((await errorBody(evidenceless)).error).toBe("outcome_without_evidence");

      // Epistemic discipline AT THE BOUNDARY: an INFERRED outcome is 422.
      const inferred = await handler(
        postJson(
          `/v1/executions/${EXECUTION_ID}/outcomes`,
          JSON.stringify({ ...JSON.parse(OUTCOME_BODY), epistemicStatus: "INFERRED" }),
        ),
      );
      expect(inferred.status).toBe(422);
      expect((await errorBody(inferred)).error).toBe("invalid_outcome");

      const malformed = await handler(
        postJson(`/v1/executions/${EXECUTION_ID}/outcomes`, "{oops"),
      );
      expect(malformed.status).toBe(400);
      expect((await errorBody(malformed)).error).toBe("malformed_json");
    });
  });
});

describe("execution HTTP surface: the state execution view", () => {
  test("GET /v1/executions/states/:scenarioId/:stateId is PROPOSED before, EXECUTED after", async () => {
    await withTempDir(async (root) => {
      const handler = handlerWith(root);
      const before = await handler(
        get(`/v1/executions/states/${SCENARIO_ID}/${STATE_3_ID}`, { "x-request-id": "corr-state-1" }),
      );
      expect(before.status).toBe(200);
      expect(before.headers.get("x-request-id")).toBe("corr-state-1");
      const beforeBody = (await before.json()) as {
        ok: boolean;
        stateExecution: { epistemicStatus: string; stateIndex: number };
      };
      expect(beforeBody.ok).toBe(true);
      expect(beforeBody.stateExecution.epistemicStatus).toBe("PROPOSED");
      expect(beforeBody.stateExecution.stateIndex).toBe(3);

      await handler(postJson("/v1/executions", EXECUTION_BODY));
      const after = await handler(get(`/v1/executions/states/${SCENARIO_ID}/${STATE_3_ID}`));
      expect(after.status).toBe(200);
      const afterBody = (await after.json()) as {
        stateExecution: {
          epistemicStatus: string;
          executionRecordId?: string;
          evidenceIds?: string[];
        };
      };
      expect(afterBody.stateExecution.epistemicStatus).toBe("EXECUTED");
      expect(afterBody.stateExecution.executionRecordId).toBe(EXECUTION_ID);
      expect(afterBody.stateExecution.evidenceIds).toEqual([EV_WORK_PHOTOS, EV_FIRE_CERT]);

      const unknownScenario = await handler(
        get(`/v1/executions/states/scenario-none/${STATE_3_ID}`),
      );
      expect(unknownScenario.status).toBe(422);
      expect((await errorBody(unknownScenario)).error).toBe("unknown_scenario_ref");
      const unknownState = await handler(
        get(`/v1/executions/states/${SCENARIO_ID}/${GHOST_STATE_ID}`),
      );
      expect(unknownState.status).toBe(422);
      expect((await errorBody(unknownState)).error).toBe("unknown_state_ref");
    });
  });
});

describe("execution HTTP surface: the verified lineage", () => {
  test("GET /v1/executions/lineage/:caseId returns the full verified chain over HTTP", async () => {
    await withTempDir(async (root) => {
      const handler = handlerWith(root);
      await handler(postJson("/v1/executions", EXECUTION_BODY));
      await handler(postJson(`/v1/executions/${EXECUTION_ID}/outcomes`, OUTCOME_BODY));
      const lineage = await handler(
        get(`/v1/executions/lineage/${CASE_ID}`, { "x-request-id": "corr-lin-1" }),
      );
      expect(lineage.status).toBe(200);
      expect(lineage.headers.get("x-request-id")).toBe("corr-lin-1");
      const body = (await lineage.json()) as {
        ok: boolean;
        lineage: {
          caseId: string;
          case: { observations: unknown[]; hypotheses: unknown[] };
          executions: {
            executionRecordId: string;
            scenario: { status: string };
            executedState: { stateIndex: number };
            postWorkCaptureSessionIds: string[];
            stateTransition: { toStatus: string };
            outcomes: { epistemicStatus: string }[];
          }[];
        };
      };
      expect(body.ok).toBe(true);
      expect(body.lineage.caseId).toBe(CASE_ID);
      expect(body.lineage.case.observations).toHaveLength(2);
      expect(body.lineage.case.hypotheses).toHaveLength(1);
      expect(body.lineage.executions).toHaveLength(1);
      const entry = body.lineage.executions[0]!;
      expect(entry.executionRecordId).toBe(EXECUTION_ID);
      expect(entry.scenario.status).toBe("approved");
      expect(entry.executedState.stateIndex).toBe(3);
      expect(entry.stateTransition.toStatus).toBe("EXECUTED");
      expect(entry.postWorkCaptureSessionIds).toEqual([SESSION_WORK_1, SESSION_POSTWORK_1]);
      expect(entry.outcomes[0]?.epistemicStatus).toBe("OBSERVED");
    });
  });

  test("lineage missing-link refusals over HTTP (404 case; 422 chain codes)", async () => {
    await withTempDir(async (root) => {
      const handler = handlerWith(root);
      // Unknown case: 404 case_not_found.
      const unknown = await handler(get("/v1/executions/lineage/case-none"));
      expect(unknown.status).toBe(404);
      expect((await errorBody(unknown)).error).toBe("case_not_found");
      // Known case, no execution yet: 422 lineage_missing_execution.
      const noExecution = await handler(get(`/v1/executions/lineage/${CASE_ID}`));
      expect(noExecution.status).toBe(422);
      expect((await errorBody(noExecution)).error).toBe("lineage_missing_execution");
      // Execution without outcome: 422 lineage_missing_outcome.
      await handler(postJson("/v1/executions", EXECUTION_BODY));
      const noOutcome = await handler(get(`/v1/executions/lineage/${CASE_ID}`));
      expect(noOutcome.status).toBe(422);
      expect((await errorBody(noOutcome)).error).toBe("lineage_missing_outcome");
    });

    // No post-work capture anywhere on the chain: 422 lineage_missing_capture
    // (isolated handler so the complete first chain cannot satisfy the hop).
    await withTempDir(async (root) => {
      const handler = handlerWith(root);
      await handler(
        postJson(
          "/v1/executions",
          JSON.stringify({ ...JSON.parse(EXECUTION_BODY), captureSessionIds: undefined }),
        ),
      );
      await handler(
        postJson(
          `/v1/executions/${EXECUTION_ID}/outcomes`,
          JSON.stringify({ ...JSON.parse(OUTCOME_BODY), captureSessionIds: undefined }),
        ),
      );
      const noCapture = await handler(get(`/v1/executions/lineage/${CASE_ID}`));
      expect(noCapture.status).toBe(422);
      expect((await errorBody(noCapture)).error).toBe("lineage_missing_capture");
      // Path-shape 400: oversized case id.
      const oversized = await handler(get(`/v1/executions/lineage/${"y".repeat(257)}`));
      expect(oversized.status).toBe(400);
      expect((await errorBody(oversized)).error).toBe("invalid_case_id");
    });
  });
});

describe("execution HTTP surface: method discipline", () => {
  test("405 with allow on wrong methods; unknown subpaths fall to the server 404", async () => {
    await withTempDir(async (root) => {
      const handler = handlerWith(root);
      await handler(postJson("/v1/executions", EXECUTION_BODY));

      const putRoot = await handler(put("/v1/executions"));
      expect(putRoot.status).toBe(405);
      expect(putRoot.headers.get("allow")).toBe("GET, POST");

      const putOne = await handler(put(`/v1/executions/${EXECUTION_ID}`));
      expect(putOne.status).toBe(405);
      expect(putOne.headers.get("allow")).toBe("GET");

      const getOutcomes = await handler(get(`/v1/executions/${EXECUTION_ID}/outcomes`));
      expect(getOutcomes.status).toBe(405);
      expect(getOutcomes.headers.get("allow")).toBe("POST");

      const postLineage = await handler(postJson(`/v1/executions/lineage/${CASE_ID}`, "{}"));
      expect(postLineage.status).toBe(405);
      expect(postLineage.headers.get("allow")).toBe("GET");

      const postStates = await handler(
        postJson(`/v1/executions/states/${SCENARIO_ID}/${STATE_3_ID}`, "{}"),
      );
      expect(postStates.status).toBe(405);
      expect(postStates.headers.get("allow")).toBe("GET");

      // Unknown subpath shapes fall through to the server-wide 404.
      const foreign = await handler(get(`/v1/executions/${EXECUTION_ID}/mystery`));
      expect(foreign.status).toBe(404);
      expect((await errorBody(foreign)).error).toBe("not_found");
      const deep = await handler(del(`/v1/executions/${EXECUTION_ID}/outcomes/extra`));
      expect(deep.status).toBe(404);
      expect((await errorBody(deep)).error).toBe("not_found");
    });
  });
});

describe("execution HTTP surface: lazy default wiring", () => {
  test("the default wiring records executions over the env data dir; references resolve through read-only resolvers over THAT data dir", async () => {
    await withTempDir(async (root) => {
      const envWithDir: EnvRecord = { ...validEnv, AISE_DATA_DIR: join(root, "data") };
      // The sibling SETUP writers (intervention + case) are injected over the
      // env data dir — but `executions` is NOT injected: the execution surface
      // under test is the LAZY DEFAULT wiring, which resolves its three
      // read-only reference resolvers over the handler's OWN env data dir
      // (never through a shared memoized sibling wiring, so handler/test
      // ordering can never point it at another data dir).
      const handler = createRequestHandler({
        envSource: () => envWithDir,
        version: pkg.version,
        logger: quietLogger,
        capture: createCaptureGateway({ store: new InMemoryCaptureStore(), clock: fixedClock }),
        interventions: {
          service: new InterventionService({
            store: new FsInterventionStore(join(root, "data")),
            clock: fixedClock,
            baselineResolver: makeBaselineResolver("project-zurich-hq", [buildBaselineStorey()]),
          }),
          logger: quietLogger,
        },
        cases: {
          service: new CaseService({ store: new FsCaseStore(join(root, "data")), clock: fixedClock }),
          logger: quietLogger,
        },
      });

      // 1. Evidence through the DEFAULT evidence wiring (per-handler, same
      //    data dir) — the execution default resolver reads this store.
      const executionEvidence = evidenceIdOf("default-wiring-work");
      const postWorkEvidence = evidenceIdOf("default-wiring-postwork");
      for (const contentId of [executionEvidence, postWorkEvidence]) {
        const evidence = await handler(
          postJson(
            "/v1/evidence",
            JSON.stringify({
              contractVersion: "1.0.0",
              contentId,
              byteSize: 2048,
              mediaType: "image/jpeg",
              capturedAt: FIXED_EXECUTED,
              acquisitionMethod: "STILL_IMAGERY",
              acquisitionMetadata: { "mission.id": "mission-2026-000042" },
            }),
          ),
        );
        expect(evidence.status).toBe(200);
      }

      // 2. The engineering case over the same data dir.
      const caseId = "case-default-wiring";
      const created = await handler(
        postJson(
          "/v1/cases",
          JSON.stringify({
            caseId,
            title: "Fire compartment non-compliance",
            links: { nodeIds: [], evidenceIds: [], captureSessionIds: [] },
          }),
        ),
      );
      expect(created.status).toBe(200);
      const observed = await handler(
        postJson(
          `/v1/cases/${caseId}/observations`,
          JSON.stringify({
            statement: "Measured rating REI60.",
            evidenceIds: [executionEvidence],
          }),
        ),
      );
      expect(observed.status).toBe(200);

      // 3. The intervention scenario over the same data dir: one property
      //    change step on the baseline wall, then full governance.
      const scenarioId = "scenario-default-wiring";
      const scenario = await handler(
        postJson(
          "/v1/interventions",
          JSON.stringify({
            scenarioId,
            projectId: "project-zurich-hq",
            title: "Lazy default wiring execution",
            baselineVersionId: "v001",
          }),
        ),
      );
      expect(scenario.status).toBe(200);
      const step = await handler(
        postJson(
          `/v1/interventions/${scenarioId}/steps`,
          JSON.stringify({
            kind: "property_change",
            targetNodeId: "wall-north",
            property: { key: "fireRating", value: "REI90" },
            rationale: "Fire strategy upgrade.",
            provenance: { evidenceIds: [executionEvidence] },
          }),
        ),
      );
      expect(step.status).toBe(200);
      const stepBody = (await step.json()) as {
        step: { stepId: string };
        state: { stateId: string };
      };
      // Governance: reference → under_review → approved.
      await handler(
        postJson(
          `/v1/interventions/${scenarioId}/approval-reference`,
          JSON.stringify({
            caseId,
            reviewDecision: "approved",
            reviewedAt: FIXED_APPROVAL,
          }),
        ),
      );
      await handler(
        postJson(`/v1/interventions/${scenarioId}/status`, JSON.stringify({ status: "under_review" })),
      );
      const approved = await handler(
        postJson(`/v1/interventions/${scenarioId}/status`, JSON.stringify({ status: "approved" })),
      );
      expect(approved.status).toBe(200);

      // 4. THE EXECUTION through the DEFAULT execution wiring: every
      //    reference resolves through the three read-only resolvers over
      //    the env data dir.
      const executionId = "execution-default-wiring-1";
      const execution = await handler(
        postJson(
          "/v1/executions",
          JSON.stringify({
            executionRecordId: executionId,
            caseId,
            scenarioId,
            stateId: stepBody.state.stateId,
            executedStepIds: [stepBody.step.stepId],
            evidenceIds: [executionEvidence],
            captureSessionIds: ["session-default-work"],
            executedAt: FIXED_EXECUTED,
          }),
        ),
      );
      expect(execution.status).toBe(200);
      const executionBody = (await execution.json()) as {
        execution: { stateTransition: { toStatus: string } };
      };
      expect(executionBody.execution.stateTransition.toStatus).toBe("EXECUTED");
      expect(
        existsSync(join(root, "data", "executions", `${sha256Hex(executionId)}.json`)),
      ).toBe(true);

      // 5. The outcome, then the verified lineage — all through the default
      //    execution wiring.
      const outcome = await handler(
        postJson(
          `/v1/executions/${executionId}/outcomes`,
          JSON.stringify({
            caseId,
            statement: "Post-work scan confirms the REI90 compartment line.",
            evidenceIds: [postWorkEvidence],
            captureSessionIds: ["session-default-postwork"],
          }),
        ),
      );
      expect(outcome.status).toBe(200);
      const lineage = await handler(get(`/v1/executions/lineage/${caseId}`));
      expect(lineage.status).toBe(200);
      const lineageBody = (await lineage.json()) as {
        lineage: {
          case: { observations: unknown[] };
          executions: {
            postWorkCaptureSessionIds: string[];
            outcomes: unknown[];
          }[];
        };
      };
      expect(lineageBody.lineage.case.observations).toHaveLength(1);
      expect(lineageBody.lineage.executions).toHaveLength(1);
      expect(lineageBody.lineage.executions[0]?.postWorkCaptureSessionIds).toEqual([
        "session-default-work",
        "session-default-postwork",
      ]);
      expect(lineageBody.lineage.executions[0]?.outcomes).toHaveLength(1);

      // The derived state view through the default wiring.
      const stateView = await handler(
        get(`/v1/executions/states/${scenarioId}/${stepBody.state.stateId}`),
      );
      expect(stateView.status).toBe(200);
      const stateViewBody = (await stateView.json()) as {
        stateExecution: { epistemicStatus: string; executionRecordId?: string };
      };
      expect(stateViewBody.stateExecution.epistemicStatus).toBe("EXECUTED");
      expect(stateViewBody.stateExecution.executionRecordId).toBe(executionId);

      // Non-execution traffic stays a plain 404.
      const foreign = await handler(get("/v1/executions/nope/extra/deep"));
      expect(foreign.status).toBe(404);
    });
  });
});
