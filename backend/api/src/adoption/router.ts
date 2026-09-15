/**
 * AISE-041 — Workflow migration and switching-friction profiler HTTP
 * surface (transport adapter ONLY).
 *
 * Contract (spec/work-orders.md §041; R20; this surface never judges
 * truth and never migrates anything: it applies typed inputs through the
 * deterministic adoption service and reads back canonical records):
 *
 *   POST /v1/adoption/workflows
 *       Inventory one incumbent workflow (typed §041 attribute per step —
 *       each a known value or the EXPLICIT "UNKNOWN" marker). Body
 *       `{ workflowId, organizationId, name, description?, steps:
 *       [WorkflowStep…], actor }`. Id reuse is 422 `workflow_exists`.
 *   GET  /v1/adoption/workflows            -> inventory list summaries
 *   GET  /v1/adoption/workflows/:id        -> full inventory record
 *   POST /v1/adoption/workflows/:id/steps  -> append one step (steps are
 *       never removed; duplicate step ids are 422 `step_exists`).
 *   POST /v1/adoption/workflows/:id/assessments
 *       Run the profiler: integration readiness + switching friction
 *       (explicit weights, per-component derivations, UNKNOWN components
 *       never defaulted, null composites while unknown) + the ranked
 *       replacement-opportunity steps. Body `{ assessmentId, actor }`.
 *   GET  /v1/adoption/assessments[/:id]    -> assessment list / full
 *       derived record.
 *   POST /v1/adoption/candidates           -> propose a migration
 *       candidate (state `proposed`). Body `{ candidateId, workflowId,
 *       stepId, aiseReplacementBoundary, rationale, actor }`. Unknown
 *       workflow/step references are 422 `unknown_workflow` /
 *       `unknown_step`.
 *   GET  /v1/adoption/candidates[/:id]     -> candidate list / record.
 *   POST /v1/adoption/candidates/:id/rollback-plans
 *       Append one rollback plan (active). Body `{ planId, description,
 *       restorationSteps, owner, actor }`.
 *   POST /v1/adoption/candidates/:id/rollback-plans/:planId/retire
 *       Retire one plan — refused before operational acceptance with 422
 *       `rollback_plan_still_required` (the retention gate).
 *   POST /v1/adoption/candidates/:id/equivalence
 *       Record the SemanticEquivalenceRecord (establishedHow,
 *       evidenceIds, REQUIRED limits). Only while evaluating/piloted.
 *   POST /v1/adoption/candidates/:id/acceptance
 *       Record the operational acceptance. Only while piloted.
 *   POST /v1/adoption/candidates/:id/advance
 *       THE governed state machine. Body `{ to, evidenceIds?, actor }`.
 *       No skips (422 `transition_out_of_sequence`); `replaced` requires
 *       equivalence + acceptance + an active rollback plan (422
 *       `equivalence_record_required` / `acceptance_record_required` /
 *       `rollback_plan_required` — the no-false-claims matrix);
 *       `evaluating` requires a plan + evaluation evidence;
 *       `piloted` requires a plan + pilot-outcome evidence.
 *   POST /v1/adoption/candidates/:id/rollback
 *       THE recorded reverse transition (422 `rollback_plan_required`
 *       without an active plan; provenance: actor, timestamp, plan id).
 *
 * HTTP STATUS MAPPING — the single authoritative place for this
 * translation (mirrors the gaps/comparison router discipline; do not
 * duplicate elsewhere):
 *
 *   not-found codes  -> 404 (workflow_not_found | candidate_not_found |
 *                          assessment_not_found | rollback_plan_not_found)
 *   invalid ids      -> 400 (invalid_workflow_id | invalid_candidate_id |
 *                          invalid_assessment_id | invalid_plan_id |
 *                          malformed_json)
 *   everything else  -> 422 (typed validation/semantic codes listed above
 *                          plus invalid_* payload codes and the corrupted
 *                          persisted-record guards invalid_*_record)
 *
 * Every response carries the `x-request-id` correlation header (see
 * `lib/http.ts`); wrong methods get 405 with an explicit `allow`; paths
 * that match no adoption route return null so the server's default 404
 * applies.
 */

import { jsonResponse, methodNotAllowed } from "../lib/http";
import type { Logger } from "../lib/log";
import {
  AdoptionError,
  parseAdvanceCandidateInput,
  parseAppendStepInput,
  parseCreateCandidateInput,
  parseCreateWorkflowInput,
  parseRecordAcceptanceInput,
  parseRecordEquivalenceInput,
  parseRecordRollbackPlanInput,
  parseRetireRollbackPlanInput,
  parseRollbackCandidateInput,
  parseRunAssessmentInput,
  validateAssessmentId,
  validateCandidateId,
  validatePlanId,
  validateWorkflowId,
} from "./model";
import { AdoptionService } from "./service";

export interface AdoptionRouteOptions {
  /** The adoption policy engine over an injected store + clock + read-only adapter resolver. */
  readonly service: AdoptionService;
  /** Structured logger for domain-level request events. */
  readonly logger: Logger;
}

/* ------------------------------------------------------------------ */
/* Helpers                                                              */
/* ------------------------------------------------------------------ */

function pathSegments(url: URL): string[] {
  return url.pathname.split("/").filter((segment) => segment !== "");
}

async function readJsonBody(
  request: Request,
): Promise<{ ok: true; payload: unknown } | { ok: false }> {
  const text = await request.text();
  try {
    return { ok: true, payload: JSON.parse(text) as unknown };
  } catch {
    return { ok: false };
  }
}

function decodeSegment(segment: string): string | null {
  try {
    return decodeURIComponent(segment);
  } catch {
    return null;
  }
}

/** 404 vs 400 vs 422 — the single authoritative status table (see header). */
function adoptionErrorResponse(error: AdoptionError, requestId: string): Response {
  const status =
    error.code === "workflow_not_found" ||
    error.code === "candidate_not_found" ||
    error.code === "assessment_not_found" ||
    error.code === "rollback_plan_not_found"
      ? 404
      : error.code === "invalid_workflow_id" ||
          error.code === "invalid_candidate_id" ||
          error.code === "invalid_assessment_id" ||
          error.code === "invalid_plan_id"
        ? 400
        : 422;
  return jsonResponse(
    status,
    { ok: false, error: error.code, detail: error.detail },
    requestId,
  );
}

function malformedJson(requestId: string): Response {
  return jsonResponse(
    400,
    { ok: false, error: "malformed_json", detail: "request body is not valid JSON" },
    requestId,
  );
}

/** Parse the request body as JSON; malformed bodies answer 400 directly. */
async function jsonBodyOr(
  request: Request,
  requestId: string,
): Promise<{ ok: true; payload: unknown } | { ok: false; response: Response }> {
  const body = await readJsonBody(request);
  if (!body.ok) {
    return { ok: false, response: malformedJson(requestId) };
  }
  return { ok: true, payload: body.payload };
}

/* ------------------------------------------------------------------ */
/* Router                                                               */
/* ------------------------------------------------------------------ */

/**
 * Route and answer one request against the adoption surface. Returns
 * null when the path is not an adoption route (the server then answers
 * 404). Error mapping happens HERE only (see module header).
 */
export async function handleAdoptionRequest(
  request: Request,
  url: URL,
  requestId: string,
  options: AdoptionRouteOptions,
): Promise<Response | null> {
  const segments = pathSegments(url);
  if (segments[0] !== "v1" || segments[1] !== "adoption") {
    return null;
  }
  const { service, logger } = options;

  try {
    /* /v1/adoption/workflows ----------------------------------------- */

    if (segments[2] === "workflows") {
      if (segments.length === 3) {
        if (request.method === "POST") {
          const body = await jsonBodyOr(request, requestId);
          if (!body.ok) {
            return body.response;
          }
          const record = await service.createWorkflow(
            parseCreateWorkflowInput(body.payload),
          );
          logger.info("adoption_workflow_recorded", {
            requestId,
            workflowId: record.workflowId,
            organizationId: record.organizationId,
            stepCount: record.steps.length,
          });
          return jsonResponse(200, { ok: true, workflow: record }, requestId);
        }
        if (request.method === "GET") {
          const workflows = await service.listWorkflows();
          return jsonResponse(200, { ok: true, workflows }, requestId);
        }
        return methodNotAllowed(requestId, "GET, POST");
      }

      const workflowId = decodeSegment(segments[3] ?? "");
      if (workflowId === null || workflowId.length === 0) {
        return jsonResponse(
          400,
          { ok: false, error: "invalid_workflow_id", detail: "workflow id is not decodable" },
          requestId,
        );
      }

      if (segments.length === 4) {
        if (request.method !== "GET") {
          return methodNotAllowed(requestId, "GET");
        }
        try {
          validateWorkflowId(workflowId);
        } catch (error) {
          if (error instanceof AdoptionError) {
            return adoptionErrorResponse(error, requestId);
          }
          throw error;
        }
        const record = await service.getWorkflow(workflowId);
        if (record === null) {
          return jsonResponse(
            404,
            {
              ok: false,
              error: "workflow_not_found",
              detail: `workflow ${workflowId} does not exist`,
            },
            requestId,
          );
        }
        logger.info("adoption_workflow_read", {
          requestId,
          workflowId,
          stepCount: record.steps.length,
        });
        return jsonResponse(200, { ok: true, workflow: record }, requestId);
      }

      if (segments.length === 5 && segments[4] === "steps") {
        if (request.method !== "POST") {
          return methodNotAllowed(requestId, "POST");
        }
        const body = await jsonBodyOr(request, requestId);
        if (!body.ok) {
          return body.response;
        }
        const record = await service.appendStep(
          workflowId,
          parseAppendStepInput(body.payload),
        );
        logger.info("adoption_workflow_step_appended", {
          requestId,
          workflowId,
          stepId: record.steps[record.steps.length - 1]?.stepId,
          stepCount: record.steps.length,
        });
        return jsonResponse(200, { ok: true, workflow: record }, requestId);
      }

      if (segments.length === 5 && segments[4] === "assessments") {
        if (request.method !== "POST") {
          return methodNotAllowed(requestId, "POST");
        }
        const body = await jsonBodyOr(request, requestId);
        if (!body.ok) {
          return body.response;
        }
        const record = await service.runAssessment(
          workflowId,
          parseRunAssessmentInput(body.payload),
        );
        logger.info("adoption_assessment_recorded", {
          requestId,
          assessmentId: record.assessmentId,
          workflowId,
          readinessComposite: record.readiness.composite,
          frictionComposite: record.friction.composite,
          topOpportunityStepId: record.rankedSteps[0]?.stepId ?? null,
        });
        return jsonResponse(200, { ok: true, assessment: record }, requestId);
      }

      // Unknown deeper workflow path falls through to the server 404.
      return null;
    }

    /* /v1/adoption/assessments --------------------------------------- */

    if (segments[2] === "assessments") {
      if (segments.length === 3) {
        if (request.method !== "GET") {
          return methodNotAllowed(requestId, "GET");
        }
        const assessments = await service.listAssessments();
        return jsonResponse(200, { ok: true, assessments }, requestId);
      }
      if (segments.length === 4) {
        if (request.method !== "GET") {
          return methodNotAllowed(requestId, "GET");
        }
        const assessmentId = decodeSegment(segments[3] ?? "");
        if (assessmentId === null || assessmentId.length === 0) {
          return jsonResponse(
            400,
            { ok: false, error: "invalid_assessment_id", detail: "assessment id is not decodable" },
            requestId,
          );
        }
        try {
          validateAssessmentId(assessmentId);
        } catch (error) {
          if (error instanceof AdoptionError) {
            return adoptionErrorResponse(error, requestId);
          }
          throw error;
        }
        const record = await service.getAssessment(assessmentId);
        if (record === null) {
          return jsonResponse(
            404,
            {
              ok: false,
              error: "assessment_not_found",
              detail: `assessment ${assessmentId} does not exist`,
            },
            requestId,
          );
        }
        logger.info("adoption_assessment_read", {
          requestId,
          assessmentId,
          workflowId: record.workflowId,
        });
        return jsonResponse(200, { ok: true, assessment: record }, requestId);
      }
      return null;
    }

    /* /v1/adoption/candidates ---------------------------------------- */

    if (segments[2] === "candidates") {
      if (segments.length === 3) {
        if (request.method === "POST") {
          const body = await jsonBodyOr(request, requestId);
          if (!body.ok) {
            return body.response;
          }
          const record = await service.createCandidate(
            parseCreateCandidateInput(body.payload),
          );
          logger.info("adoption_candidate_proposed", {
            requestId,
            candidateId: record.candidateId,
            workflowId: record.workflowId,
            stepId: record.stepId,
          });
          return jsonResponse(200, { ok: true, candidate: record }, requestId);
        }
        if (request.method === "GET") {
          const candidates = await service.listCandidates();
          return jsonResponse(200, { ok: true, candidates }, requestId);
        }
        return methodNotAllowed(requestId, "GET, POST");
      }

      const candidateId = decodeSegment(segments[3] ?? "");
      if (candidateId === null || candidateId.length === 0) {
        return jsonResponse(
          400,
          { ok: false, error: "invalid_candidate_id", detail: "candidate id is not decodable" },
          requestId,
        );
      }
      try {
        validateCandidateId(candidateId);
      } catch (error) {
        if (error instanceof AdoptionError) {
          return adoptionErrorResponse(error, requestId);
        }
        throw error;
      }

      if (segments.length === 4) {
        if (request.method !== "GET") {
          return methodNotAllowed(requestId, "GET");
        }
        const record = await service.getCandidate(candidateId);
        if (record === null) {
          return jsonResponse(
            404,
            {
              ok: false,
              error: "candidate_not_found",
              detail: `candidate ${candidateId} does not exist`,
            },
            requestId,
          );
        }
        logger.info("adoption_candidate_read", {
          requestId,
          candidateId,
          state: record.state,
        });
        return jsonResponse(200, { ok: true, candidate: record }, requestId);
      }

      if (segments.length === 5) {
        const action = segments[4];
        if (request.method !== "POST") {
          return methodNotAllowed(requestId, "POST");
        }
        const body = await jsonBodyOr(request, requestId);
        if (!body.ok) {
          return body.response;
        }
        if (action === "equivalence") {
          const record = await service.recordEquivalence(
            candidateId,
            parseRecordEquivalenceInput(body.payload),
          );
          logger.info("adoption_equivalence_recorded", {
            requestId,
            candidateId,
            evidenceIds: record.equivalence?.evidenceIds,
          });
          return jsonResponse(200, { ok: true, candidate: record }, requestId);
        }
        if (action === "acceptance") {
          const record = await service.recordAcceptance(
            candidateId,
            parseRecordAcceptanceInput(body.payload),
          );
          logger.info("adoption_acceptance_recorded", {
            requestId,
            candidateId,
            evidenceIds: record.acceptance?.evidenceIds,
          });
          return jsonResponse(200, { ok: true, candidate: record }, requestId);
        }
        if (action === "rollback-plans") {
          const record = await service.recordRollbackPlan(
            candidateId,
            parseRecordRollbackPlanInput(body.payload),
          );
          logger.info("adoption_rollback_plan_recorded", {
            requestId,
            candidateId,
            planCount: record.rollbackPlans.length,
          });
          return jsonResponse(200, { ok: true, candidate: record }, requestId);
        }
        if (action === "advance") {
          const record = await service.advanceCandidate(
            candidateId,
            parseAdvanceCandidateInput(body.payload),
          );
          logger.info("adoption_candidate_advanced", {
            requestId,
            candidateId,
            state: record.state,
          });
          return jsonResponse(200, { ok: true, candidate: record }, requestId);
        }
        if (action === "rollback") {
          const record = await service.rollbackCandidate(
            candidateId,
            parseRollbackCandidateInput(body.payload),
          );
          logger.info("adoption_candidate_rolled_back", {
            requestId,
            candidateId,
            state: record.state,
          });
          return jsonResponse(200, { ok: true, candidate: record }, requestId);
        }
        // Unknown candidate sub-action falls through to the server 404.
        return null;
      }

      if (
        segments.length === 7 &&
        segments[4] === "rollback-plans" &&
        segments[6] === "retire"
      ) {
        if (request.method !== "POST") {
          return methodNotAllowed(requestId, "POST");
        }
        const planId = decodeSegment(segments[5] ?? "");
        if (planId === null || planId.length === 0) {
          return jsonResponse(
            400,
            { ok: false, error: "invalid_plan_id", detail: "plan id is not decodable" },
            requestId,
          );
        }
        try {
          validatePlanId(planId);
        } catch (error) {
          if (error instanceof AdoptionError) {
            return adoptionErrorResponse(error, requestId);
          }
          throw error;
        }
        const body = await jsonBodyOr(request, requestId);
        if (!body.ok) {
          return body.response;
        }
        const record = await service.retireRollbackPlan(
          candidateId,
          planId,
          parseRetireRollbackPlanInput(body.payload),
        );
        logger.info("adoption_rollback_plan_retired", {
          requestId,
          candidateId,
          planId,
        });
        return jsonResponse(200, { ok: true, candidate: record }, requestId);
      }

      // Unknown deeper candidate path falls through to the server 404.
      return null;
    }

    // Unknown adoption collection falls through to the server 404.
    return null;
  } catch (error) {
    if (error instanceof AdoptionError) {
      logger.warn("adoption_request_rejected", {
        requestId,
        code: error.code,
        detail: error.detail,
      });
      return adoptionErrorResponse(error, requestId);
    }
    throw error; // unexpected -> the server handler's 500 path
  }
}
