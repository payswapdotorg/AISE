import { currentWorkspace, projectWorkspace } from "@spike/server/workspace";

/**
 * GBIM-003 — open/reset the spike workspace (GET or POST {}).
 * The workspace projection is a pure render of engine outputs.
 */
export async function GET(): Promise<Response> {
  return Response.json({ workspace: projectWorkspace(currentWorkspace()) });
}

export async function POST(): Promise<Response> {
  return Response.json({ workspace: projectWorkspace(currentWorkspace()) });
}
