/**
 * `GET /api/models` — the read-only model list (authenticated).
 *
 * Read-only discipline (the no-browser-canonical-authority
 * guarantee): this handler and every model handler serves GET
 * only; every other method is refused 405 BEFORE any model data
 * is considered; unauthenticated requests are refused 401.
 */
import { NextResponse } from "next/server";
import { loadWebConfig } from "@/server/config";
import { sessionFromRequest } from "@/server/session";
import { listModels, listVersions } from "@/server/model-store";

export async function GET(request: Request): Promise<NextResponse> {
  const config = loadWebConfig();
  const nowSec = Math.floor(Date.now() / 1000);
  const session = sessionFromRequest(config, request, nowSec);
  if (session === undefined) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const models = listModels().map((model) => ({
    ...model,
    versions: listVersions(model.modelId).length,
  }));
  return NextResponse.json({ models });
}

/** The read-only surface: mutations are structurally refused. */
export async function POST(): Promise<NextResponse> {
  return NextResponse.json({ error: "method_not_allowed" }, { status: 405 });
}

export async function PUT(): Promise<NextResponse> {
  return NextResponse.json({ error: "method_not_allowed" }, { status: 405 });
}

export async function DELETE(): Promise<NextResponse> {
  return NextResponse.json({ error: "method_not_allowed" }, { status: 405 });
}
