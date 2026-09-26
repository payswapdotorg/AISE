import { currentWorkspace, previewIntent, projectWorkspace } from "@spike/server/workspace";

/** GBIM-003 — engine dry-run of a staged intent (applyOperation result discarded). */
export async function POST(request: Request): Promise<Response> {
  const body = (await request.json()) as { intent?: unknown };
  const record = currentWorkspace();
  const { preview } = previewIntent(record, body.intent);
  return Response.json({ ...preview, workspaceEcho: { versionNumber: projectWorkspace(record).versionNumber } });
}
