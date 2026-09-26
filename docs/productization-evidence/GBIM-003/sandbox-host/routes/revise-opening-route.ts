import { commitWorkspace, currentWorkspace, projectWorkspace, reviseOpening } from "@spike/server/workspace";

/** GBIM-003 — op-010 revise-opening through the engine's append-only revision path. */
export async function POST(request: Request): Promise<Response> {
  const body = (await request.json()) as { widthM?: number; heightM?: number };
  const width = typeof body.widthM === "number" && body.widthM > 0 ? body.widthM : 1.5;
  const height = typeof body.heightM === "number" && body.heightM > 0 ? body.heightM : 1.2;
  const outcome = reviseOpening(currentWorkspace(), width, height);
  if (outcome.record !== null) {
    commitWorkspace(outcome.record);
    return Response.json({
      ok: true,
      operationId: outcome.record.revision?.revisedOperationId ?? null,
      stateId: null,
      message: outcome.message,
      workspace: projectWorkspace(outcome.record),
      refusalReasons: [],
    });
  }
  return Response.json({ ok: false, operationId: null, stateId: null, message: outcome.message, workspace: null, refusalReasons: [] });
}
