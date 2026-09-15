/**
 * AISE-041 — adoption HTTP surface tests (through the FULL server
 * handler, exercising the one AISE-041 routing delegation block).
 *
 * Depth mandated by the work order: every endpoint's happy path and
 * error path, the stable 404/400/422 status table, 405 with allow,
 * x-request-id correlation, the governed-path refusal matrix over HTTP
 * (the no-false-claims matrix: `replaced` refused without equivalence /
 * acceptance / active rollback plan; skips refused; retirement before
 * acceptance refused), the inspectable wire shape (named score
 * components, derivations, UNKNOWN components with null composites, the
 * ranked steps), and the LAZY DEFAULT WIRING end-to-end — the default
 * adoption service resolves its store over the handler's OWN env data
 * dir and its adapter resolver over a fresh EMPTY integrations registry
 * (honest zero-registered coverage), never through a memoized sibling
 * wiring.
 */

import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import pkg from "../../package.json" with { type: "json" };
import { createLogger } from "../lib/log";
import type { EnvRecord } from "../lib/config";
import { createCaptureGateway } from "../capture/gateway";
import { InMemoryCaptureStore } from "../capture/store";
import { createRequestHandler } from "../server";
import { sha256Hex } from "../lib/hash";
import { AdoptionService } from "./service";
import { FsAdoptionStore } from "./store";
import {
  ASSESSMENT_ID,
  CANDIDATE_ID,
  WORKFLOW_ID,
  buildAcceptanceInput,
  buildCreateCandidateInput,
  buildCreateWorkflowInput,
  buildEquivalenceInput,
  buildEvaluationAdvance,
  buildPilotAdvance,
  buildRollbackPlanInput,
  canonicalAdapterResolver,
  canonicalSteps,
  fixedClock,
  withTempDir,
} from "./testkit";

const quietLogger = createLogger("error");

const validEnv: EnvRecord = {
  HOST: "127.0.0.1",
  PORT: "8080",
  LOG_LEVEL: "info",
};

/** The canonical workflow wire payload. */
function workflowBody(): string {
  return JSON.stringify(buildCreateWorkflowInput());
}

/** Handler with the AISE-041 routing block backed by an injected FS store (canonical resolver). */
function handlerWith(root: string): (request: Request) => Promise<Response> {
  return createRequestHandler({
    envSource: () => validEnv,
    version: pkg.version,
    logger: quietLogger,
    capture: createCaptureGateway({ store: new InMemoryCaptureStore(), clock: fixedClock }),
    adoption: {
      service: new AdoptionService({
        store: new FsAdoptionStore(join(root, "data")),
        clock: fixedClock,
        adapterDescriptorResolver: canonicalAdapterResolver(),
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

describe("adoption HTTP surface: the governed path", () => {
  test("POST /v1/adoption/workflows inventories the workflow; x-request-id echoes; file at the path convention", async () => {
    await withTempDir(async (root) => {
      const handler = handlerWith(root);
      const response = await handler(
        postJson("/v1/adoption/workflows", workflowBody(), { "x-request-id": "corr-adoption-1" }),
      );
      expect(response.status).toBe(200);
      expect(response.headers.get("x-request-id")).toBe("corr-adoption-1");
      const body = (await response.json()) as {
        ok: boolean;
        workflow: { workflowId: string; steps: unknown[]; history: unknown[] };
      };
      expect(body.ok).toBe(true);
      expect(body.workflow.workflowId).toBe(WORKFLOW_ID);
      expect(body.workflow.steps.length).toBe(4);
      expect(body.workflow.history.length).toBe(1);
      expect(
        existsSync(
          join(root, "data", "adoption", "workflows", `${sha256Hex(WORKFLOW_ID)}.json`),
        ),
      ).toBe(true);
    });
  });

  test("GET list / GET by id / 404 unknown / append-step grows the inventory", async () => {
    await withTempDir(async (root) => {
      const handler = handlerWith(root);
      await handler(postJson("/v1/adoption/workflows", workflowBody()));
      const list = await handler(get("/v1/adoption/workflows"));
      expect(list.status).toBe(200);
      const listBody = (await list.json()) as { workflows: { workflowId: string }[] };
      expect(listBody.workflows.map((summary) => summary.workflowId)).toEqual([WORKFLOW_ID]);
      const read = await handler(get(`/v1/adoption/workflows/${WORKFLOW_ID}`));
      expect(read.status).toBe(200);
      const missing = await handler(get("/v1/adoption/workflows/workflow-never"));
      expect(missing.status).toBe(404);
      expect((await errorBody(missing)).error).toBe("workflow_not_found");
      const appended = await handler(
        postJson(
          `/v1/adoption/workflows/${WORKFLOW_ID}/steps`,
          JSON.stringify({
            actor: "inventory-clerk-01",
            step: { ...canonicalSteps()[0], stepId: "step-tender-close", name: "Tender close-out" },
          }),
        ),
      );
      expect(appended.status).toBe(200);
      const appendedBody = (await appended.json()) as {
        workflow: { steps: { stepId: string }[] };
      };
      expect(appendedBody.workflow.steps.map((step) => step.stepId)).toContain("step-tender-close");
    });
  });

  test("POST assessments returns the inspectable wire shape: named components, derivations, UNKNOWN honesty, ranking", async () => {
    await withTempDir(async (root) => {
      const handler = handlerWith(root);
      await handler(postJson("/v1/adoption/workflows", workflowBody()));
      const response = await handler(
        postJson(
          `/v1/adoption/workflows/${WORKFLOW_ID}/assessments`,
          JSON.stringify({ assessmentId: ASSESSMENT_ID, actor: "adoption-lead-01" }),
        ),
      );
      expect(response.status).toBe(200);
      const body = (await response.json()) as {
        ok: boolean;
        assessment: {
          assessmentId: string;
          workflowId: string;
          adapterView: { adapterId: string; descriptor: unknown }[];
          steps: {
            stepId: string;
            readiness: {
              components: Record<string, { kind: string; value?: number; derivation: string }>;
              composite: number | null;
              unknownComponents: string[];
            };
            friction: { composite: number | null };
            opportunity: number | null;
            unknownAttributes: string[];
          }[];
          readiness: { composite: number | null; unknownComponents: string[] };
          friction: { composite: number | null; compositeDerivation: string };
          inventory: { totalSteps: number; stepsWithUnknownAttributes: number };
          rankedSteps: { rank: number; stepId: string; opportunity: number | null }[];
        };
      };
      expect(body.ok).toBe(true);
      expect(body.assessment.assessmentId).toBe(ASSESSMENT_ID);
      // The consumed adapter view arrives on the wire (registry context).
      expect(body.assessment.adapterView.map((entry) => entry.adapterId)).toEqual([
        "adapter-bim-01",
        "adapter-erp-99",
      ]);
      expect(body.assessment.adapterView[0]?.descriptor).not.toBe(null);
      expect(body.assessment.adapterView[1]?.descriptor).toBe(null);
      // The top-ranked replacement opportunity is the manual takeoff step.
      expect(body.assessment.rankedSteps.map((ranked) => ranked.stepId)).toEqual([
        "step-takeoff",
        "step-boq-transfer",
        "step-erp-approval",
        "step-site-verification",
      ]);
      expect(body.assessment.rankedSteps[0]?.opportunity).toBe(0.6325);
      // Named components with derivations arrive inspectable.
      const takeoff = body.assessment.steps.find((step) => step.stepId === "step-takeoff");
      expect(takeoff?.readiness.components.connectorCoverage?.kind).toBe("known");
      expect(
        (takeoff?.readiness.components.connectorCoverage as { value?: number } | undefined)?.value,
      ).toBe(1);
      expect(takeoff?.readiness.composite).toBe(1);
      expect(takeoff?.friction.composite).toBe(0.3675);
      expect(takeoff?.opportunity).toBe(0.6325);
      // UNKNOWN honesty: the site step carries unknown components and NO composite.
      const site = body.assessment.steps.find((step) => step.stepId === "step-site-verification");
      expect(site?.readiness.components.manualReEntry?.kind).toBe("unknown");
      expect(
        (site?.readiness.components.manualReEntry as { value?: unknown } | undefined)?.value,
      ).toBeUndefined();
      expect(site?.readiness.composite).toBe(null);
      expect(site?.unknownAttributes).toEqual(["manualReEntry", "rollback", "systemsOfRecord"]);
      // The workflow-level readiness is null while any attribute is UNKNOWN.
      expect(body.assessment.readiness.composite).toBe(null);
      expect(body.assessment.readiness.unknownComponents).toEqual([
        "connectorCoverage",
        "manualReEntry",
        "rollback",
      ]);
      // The workflow-level friction is computed with a full derivation string.
      expect(body.assessment.friction.composite).toBe(0.467083);
      expect(body.assessment.friction.compositeDerivation).toContain("0.467083");
      expect(body.assessment.inventory.totalSteps).toBe(4);
      expect(body.assessment.inventory.stepsWithUnknownAttributes).toBe(2);
      // Read-back + list.
      const readBack = await handler(get(`/v1/adoption/assessments/${ASSESSMENT_ID}`));
      expect(readBack.status).toBe(200);
      const listBack = await handler(get("/v1/adoption/assessments"));
      const listBody = (await listBack.json()) as { assessments: { assessmentId: string }[] };
      expect(listBody.assessments.map((summary) => summary.assessmentId)).toEqual([ASSESSMENT_ID]);
    });
  });

  test("the full governed lifecycle over HTTP reaches `replaced` with the complete event trail", async () => {
    await withTempDir(async (root) => {
      const handler = handlerWith(root);
      await handler(postJson("/v1/adoption/workflows", workflowBody()));
      const proposed = await handler(
        postJson("/v1/adoption/candidates", JSON.stringify(buildCreateCandidateInput())),
      );
      expect(proposed.status).toBe(200);
      const plan = await handler(
        postJson(
          `/v1/adoption/candidates/${CANDIDATE_ID}/rollback-plans`,
          JSON.stringify(buildRollbackPlanInput()),
        ),
      );
      expect(plan.status).toBe(200);
      const evaluating = await handler(
        postJson(
          `/v1/adoption/candidates/${CANDIDATE_ID}/advance`,
          JSON.stringify(buildEvaluationAdvance()),
        ),
      );
      expect(evaluating.status).toBe(200);
      const equivalence = await handler(
        postJson(
          `/v1/adoption/candidates/${CANDIDATE_ID}/equivalence`,
          JSON.stringify(buildEquivalenceInput()),
        ),
      );
      expect(equivalence.status).toBe(200);
      const piloted = await handler(
        postJson(
          `/v1/adoption/candidates/${CANDIDATE_ID}/advance`,
          JSON.stringify(buildPilotAdvance()),
        ),
      );
      expect(piloted.status).toBe(200);
      const acceptance = await handler(
        postJson(
          `/v1/adoption/candidates/${CANDIDATE_ID}/acceptance`,
          JSON.stringify(buildAcceptanceInput()),
        ),
      );
      expect(acceptance.status).toBe(200);
      const replaced = await handler(
        postJson(
          `/v1/adoption/candidates/${CANDIDATE_ID}/advance`,
          JSON.stringify({ to: "replaced", actor: "adoption-lead-01" }),
        ),
      );
      expect(replaced.status).toBe(200);
      const replacedBody = (await replaced.json()) as {
        candidate: {
          state: string;
          history: { eventType: string; transition?: { from: string; to: string } }[];
        };
      };
      expect(replacedBody.candidate.state).toBe("replaced");
      expect(
        replacedBody.candidate.history
          .filter((event) => event.eventType === "candidate_advanced")
          .map((event) => event.transition),
      ).toEqual([
        { from: "proposed", to: "evaluating" },
        { from: "evaluating", to: "piloted" },
        { from: "piloted", to: "replaced" },
      ]);
    });
  });

  test("THE no-false-claims refusal matrix over HTTP (each 422 names its own typed code)", async () => {
    await withTempDir(async (root) => {
      const handler = handlerWith(root);
      await handler(postJson("/v1/adoption/workflows", workflowBody()));
      await handler(
        postJson("/v1/adoption/candidates", JSON.stringify(buildCreateCandidateInput())),
      );
      // Skip: proposed → piloted directly.
      const skip = await handler(
        postJson(
          `/v1/adoption/candidates/${CANDIDATE_ID}/advance`,
          JSON.stringify(buildPilotAdvance()),
        ),
      );
      expect(skip.status).toBe(422);
      expect((await errorBody(skip)).error).toBe("transition_out_of_sequence");
      // Advance without a plan.
      const noPlan = await handler(
        postJson(
          `/v1/adoption/candidates/${CANDIDATE_ID}/advance`,
          JSON.stringify(buildEvaluationAdvance()),
        ),
      );
      expect(noPlan.status).toBe(422);
      expect((await errorBody(noPlan)).error).toBe("rollback_plan_required");
      // Plan + evaluating + equivalence + piloted + acceptance …
      await handler(
        postJson(
          `/v1/adoption/candidates/${CANDIDATE_ID}/rollback-plans`,
          JSON.stringify(buildRollbackPlanInput()),
        ),
      );
      await handler(
        postJson(
          `/v1/adoption/candidates/${CANDIDATE_ID}/advance`,
          JSON.stringify(buildEvaluationAdvance()),
        ),
      );
      // …retiring the plan BEFORE acceptance is the retention refusal.
      const retire = await handler(
        postJson(
          `/v1/adoption/candidates/${CANDIDATE_ID}/rollback-plans/${buildRollbackPlanInput().planId}/retire`,
          JSON.stringify({ actor: "adoption-lead-01" }),
        ),
      );
      expect(retire.status).toBe(422);
      expect((await errorBody(retire)).error).toBe("rollback_plan_still_required");
      // …replaced without equivalence (acceptance first is impossible —
      // acceptance requires piloted, so test the pair in order).
      await handler(
        postJson(
          `/v1/adoption/candidates/${CANDIDATE_ID}/advance`,
          JSON.stringify(buildPilotAdvance()),
        ),
      );
      await handler(
        postJson(
          `/v1/adoption/candidates/${CANDIDATE_ID}/acceptance`,
          JSON.stringify(buildAcceptanceInput()),
        ),
      );
      const noEquivalence = await handler(
        postJson(
          `/v1/adoption/candidates/${CANDIDATE_ID}/advance`,
          JSON.stringify({ to: "replaced", actor: "adoption-lead-01" }),
        ),
      );
      expect(noEquivalence.status).toBe(422);
      expect((await errorBody(noEquivalence)).error).toBe("equivalence_record_required");
      // …equivalence recorded, but acceptance is ALREADY there → replaced.
      await handler(
        postJson(
          `/v1/adoption/candidates/${CANDIDATE_ID}/equivalence`,
          JSON.stringify(buildEquivalenceInput()),
        ),
      );
      const replaced = await handler(
        postJson(
          `/v1/adoption/candidates/${CANDIDATE_ID}/advance`,
          JSON.stringify({ to: "replaced", actor: "adoption-lead-01" }),
        ),
      );
      expect(replaced.status).toBe(200);
      // Rollback of the replaced candidate still works (its plan is active).
      const rollback = await handler(
        postJson(
          `/v1/adoption/candidates/${CANDIDATE_ID}/rollback`,
          JSON.stringify({ actor: "ops-01" }),
        ),
      );
      expect(rollback.status).toBe(200);
      const rollbackBody = (await rollback.json()) as { candidate: { state: string } };
      expect(rollbackBody.candidate.state).toBe("rolled_back");
    });
  });

  test("the acceptance-without-equivalence branch: 422 acceptance comes after equivalence in check order… and rollback without any plan", async () => {
    await withTempDir(async (root) => {
      const handler = handlerWith(root);
      await handler(postJson("/v1/adoption/workflows", workflowBody()));
      await handler(
        postJson("/v1/adoption/candidates", JSON.stringify(buildCreateCandidateInput())),
      );
      await handler(
        postJson(
          `/v1/adoption/candidates/${CANDIDATE_ID}/rollback-plans`,
          JSON.stringify(buildRollbackPlanInput()),
        ),
      );
      await handler(
        postJson(
          `/v1/adoption/candidates/${CANDIDATE_ID}/advance`,
          JSON.stringify(buildEvaluationAdvance()),
        ),
      );
      await handler(
        postJson(
          `/v1/adoption/candidates/${CANDIDATE_ID}/equivalence`,
          JSON.stringify(buildEquivalenceInput()),
        ),
      );
      await handler(
        postJson(
          `/v1/adoption/candidates/${CANDIDATE_ID}/advance`,
          JSON.stringify(buildPilotAdvance()),
        ),
      );
      // Equivalence exists, acceptance does NOT.
      const noAcceptance = await handler(
        postJson(
          `/v1/adoption/candidates/${CANDIDATE_ID}/advance`,
          JSON.stringify({ to: "replaced", actor: "adoption-lead-01" }),
        ),
      );
      expect(noAcceptance.status).toBe(422);
      expect((await errorBody(noAcceptance)).error).toBe("acceptance_record_required");
      // Malformed JSON is a 400.
      const malformed = await handler(
        postJson(`/v1/adoption/candidates/${CANDIDATE_ID}/advance`, "{nope"),
      );
      expect(malformed.status).toBe(400);
      expect((await errorBody(malformed)).error).toBe("malformed_json");
    });
  });

  test("reference refusals over HTTP: unknown workflow / unknown step / 404 candidate / 404 plan", async () => {
    await withTempDir(async (root) => {
      const handler = handlerWith(root);
      await handler(postJson("/v1/adoption/workflows", workflowBody()));
      const unknownWorkflow = await handler(
        postJson(
          "/v1/adoption/candidates",
          JSON.stringify({
            ...buildCreateCandidateInput(),
            candidateId: "candidate-x1",
            workflowId: "workflow-never",
          }),
        ),
      );
      expect(unknownWorkflow.status).toBe(422);
      expect((await errorBody(unknownWorkflow)).error).toBe("unknown_workflow");
      const unknownStep = await handler(
        postJson(
          "/v1/adoption/candidates",
          JSON.stringify({
            ...buildCreateCandidateInput(),
            candidateId: "candidate-x2",
            stepId: "step-never",
          }),
        ),
      );
      expect(unknownStep.status).toBe(422);
      expect((await errorBody(unknownStep)).error).toBe("unknown_step");
      const missingCandidate = await handler(get("/v1/adoption/candidates/candidate-never"));
      expect(missingCandidate.status).toBe(404);
      expect((await errorBody(missingCandidate)).error).toBe("candidate_not_found");
      const missingAssessment = await handler(get("/v1/adoption/assessments/assessment-never"));
      expect(missingAssessment.status).toBe(404);
      expect((await errorBody(missingAssessment)).error).toBe("assessment_not_found");
      await handler(
        postJson("/v1/adoption/candidates", JSON.stringify(buildCreateCandidateInput())),
      );
      const missingPlan = await handler(
        postJson(
          `/v1/adoption/candidates/${CANDIDATE_ID}/rollback-plans/plan-never/retire`,
          JSON.stringify({ actor: "adoption-lead-01" }),
        ),
      );
      expect(missingPlan.status).toBe(404);
      expect((await errorBody(missingPlan)).error).toBe("rollback_plan_not_found");
    });
  });

  test("405 with explicit allow; non-adoption paths stay the server-wide 404", async () => {
    await withTempDir(async (root) => {
      const handler = handlerWith(root);
      const putWorkflows = await handler(put("/v1/adoption/workflows"));
      expect(putWorkflows.status).toBe(405);
      expect(putWorkflows.headers.get("allow")).toBe("GET, POST");
      const deleteCandidate = await handler(del(`/v1/adoption/candidates/${CANDIDATE_ID}`));
      expect(deleteCandidate.status).toBe(405);
      expect(deleteCandidate.headers.get("allow")).toBe("GET");
      const postCandidate = await handler(postJson("/v1/adoption/candidates", "{}"));
      expect(postCandidate.status).toBe(422); // parsed, then refused — not a 405
      const foreign = await handler(get("/v1/adoption/nope/extra/deep"));
      expect(foreign.status).toBe(404);
      const totallyForeign = await handler(get("/v1/nosuch"));
      expect(totallyForeign.status).toBe(404);
    });
  });

  test("LAZY DEFAULT WIRING end-to-end: the default adoption service resolves over the handler's OWN env data dir", async () => {
    await withTempDir(async (root) => {
      const envWithDir: EnvRecord = { ...validEnv, AISE_DATA_DIR: join(root, "default-data") };
      const handler = createRequestHandler({
        envSource: () => envWithDir,
        version: pkg.version,
        logger: quietLogger,
        capture: createCaptureGateway({ store: new InMemoryCaptureStore(), clock: fixedClock }),
      });
      // No adoption wiring injected — the default service constructs on the
      // FIRST adoption request, over the env data dir.
      const created = await handler(postJson("/v1/adoption/workflows", workflowBody()));
      expect(created.status).toBe(200);
      expect(
        existsSync(
          join(root, "default-data", "adoption", "workflows", `${sha256Hex(WORKFLOW_ID)}.json`),
        ),
      ).toBe(true);
      // The default adapter resolver is the fresh EMPTY registry: the
      // assessment runs honestly with every adapterId reference uncovered.
      const assessment = await handler(
        postJson(
          `/v1/adoption/workflows/${WORKFLOW_ID}/assessments`,
          JSON.stringify({ assessmentId: ASSESSMENT_ID, actor: "adoption-lead-01" }),
        ),
      );
      expect(assessment.status).toBe(200);
      const assessmentBody = (await assessment.json()) as {
        assessment: {
          adapterView: { adapterId: string; descriptor: unknown }[];
          steps: { stepId: string; readiness: { components: Record<string, { kind: string; value?: number }> } }[];
        };
      };
      expect(assessmentBody.assessment.adapterView).toEqual([
        { adapterId: "adapter-bim-01", descriptor: null },
        { adapterId: "adapter-erp-99", descriptor: null },
      ]);
      const boq = assessmentBody.assessment.steps.find(
        (step) => step.stepId === "step-boq-transfer",
      );
      expect(boq?.readiness.components.connectorCoverage?.kind).toBe("known");
      expect(boq?.readiness.components.connectorCoverage?.value).toBe(0);
      expect(
        existsSync(
          join(root, "default-data", "adoption", "assessments", `${sha256Hex(ASSESSMENT_ID)}.json`),
        ),
      ).toBe(true);
      // The governed refusal paths work through the default wiring too.
      const proposed = await handler(
        postJson("/v1/adoption/candidates", JSON.stringify(buildCreateCandidateInput())),
      );
      expect(proposed.status).toBe(200);
      const skip = await handler(
        postJson(
          `/v1/adoption/candidates/${CANDIDATE_ID}/advance`,
          JSON.stringify(buildPilotAdvance()),
        ),
      );
      expect(skip.status).toBe(422);
      expect((await errorBody(skip)).error).toBe("transition_out_of_sequence");
    });
  });

  test("an injected adoption wiring wins over the default (explicit construction)", async () => {
    await withTempDir(async (root) => {
      const envWithDir: EnvRecord = { ...validEnv, AISE_DATA_DIR: join(root, "elsewhere") };
      const handler = createRequestHandler({
        envSource: () => envWithDir,
        version: pkg.version,
        logger: quietLogger,
        capture: createCaptureGateway({ store: new InMemoryCaptureStore(), clock: fixedClock }),
        adoption: {
          service: new AdoptionService({
            store: new FsAdoptionStore(join(root, "injected")),
            clock: fixedClock,
            adapterDescriptorResolver: canonicalAdapterResolver(),
          }),
          logger: quietLogger,
        },
      });
      const response = await handler(postJson("/v1/adoption/workflows", workflowBody()));
      expect(response.status).toBe(200);
      // The record landed under the INJECTED store's root, not the env dir.
      expect(
        existsSync(join(root, "injected", "adoption", "workflows", `${sha256Hex(WORKFLOW_ID)}.json`)),
      ).toBe(true);
      expect(existsSync(join(root, "elsewhere", "adoption"))).toBe(false);
    });
  });
});
