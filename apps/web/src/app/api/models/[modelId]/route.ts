/**
 * `GET /api/models/[modelId]` — one model's summary + version
 * history (authenticated, read-only).
 */
import { NextResponse } from "next/server";
import { loadWebConfig } from "@/server/config";
import { sessionFromRequest } from "@/server/session";
import { listModels, listVersions } from "@/server/model-store";

export async function GET(
  request: Request,
  context: { params: Promise<{ modelId: string }> },
): Promise<NextResponse> {
  const config = loadWebConfig();
  const nowSec = Math.floor(Date.now() / 1000);
  if (sessionFromRequest(config, request, nowSec) === undefined) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const { modelId } = await context.params;
  const model = listModels().find((candidate) => candidate.modelId === modelId);
  if (model === undefined) {
    return NextResponse.json({ error: "not_found", modelId }, { status: 404 });
  }
  return NextResponse.json({
    modelId: model.modelId,
    projectId: model.projectId,
    versions: listVersions(modelId),
  });
}

export async function POST(): Promise<NextResponse> {
  return NextResponse.json({ error: "method_not_allowed" }, { status: 405 });
}

export async function PUT(): Promise<NextResponse> {
  return NextResponse.json({ error: "method_not_allowed" }, { status: 405 });
}

export async function DELETE(): Promise<NextResponse> {
  return NextResponse.json({ error: "method_not_allowed" }, { status: 405 });
}
