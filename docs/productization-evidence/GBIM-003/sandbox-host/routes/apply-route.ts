import { applyIntentToWorkspace, commitWorkspace, currentWorkspace, projectWorkspace } from "@spike/server/workspace";

/**
 * GBIM-003 — the ONE mutation path: decode -> engine applyOperation ->
 * validate -> BOQ -> new projection. Both authoring lanes (direct
 * manipulation and agent) submit here.
 */
export async function POST(request: Request): Promise<Response> {
  const body = (await request.json()) as { intent?: unknown; origin?: string };
  const origin =
    body.origin === "agent" ? "agent" : body.origin === "revision" ? "revision" : "direct-manipulation";
  const outcome = applyIntentToWorkspace(currentWorkspace(), body.intent, origin);
  if (outcome.ok && outcome.record !== null) {
    commitWorkspace(outcome.record);
    return Response.json({
      ok: true,
      operationId: outcome.result !== null && outcome.result.outcome === "applied" ? outcome.result.operation.operationId : null,
      stateId: outcome.result !== null && outcome.result.outcome === "applied" ? outcome.result.resultingState.stateId : null,
      message: outcome.message,
      workspace: projectWorkspace(outcome.record),
      refusalReasons: [],
    });
  }
  return Response.json({
    ok: false,
    operationId: null,
    stateId: null,
    message: outcome.message,
    workspace: null,
    refusalReasons:
      outcome.result !== null && outcome.result.outcome !== "applied"
        ? outcome.result.reasons.map((reason) => `${reason.code}: ${reason.detail}`)
        : [],
  });
}
