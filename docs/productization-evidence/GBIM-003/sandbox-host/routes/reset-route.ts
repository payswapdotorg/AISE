import { projectWorkspace, resetWorkspace } from "@spike/server/workspace";

/** GBIM-003 — reset the workspace to the fixture template (deterministic rebuild). */
export async function POST(): Promise<Response> {
  return Response.json({ workspace: projectWorkspace(resetWorkspace()) });
}
