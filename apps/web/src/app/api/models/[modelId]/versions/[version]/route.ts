/**
 * `GET /api/models/[modelId]/versions/[version]` — the full
 * read-only model-version view (authenticated).
 *
 * This is THE authoritative read: the canonical graph is
 * re-validated by the store on read, projected into the
 * read-only serializable view (`projectModelVersion`) and served
 * as JSON. The browser receives derived data only — no store
 * handles, no write affordance, epistemic states exact.
 */
import { NextResponse } from "next/server";
import { loadWebConfig } from "@/server/config";
import { sessionFromRequest } from "@/server/session";
import { getVersion } from "@/server/model-store";
import { projectModelVersion } from "@/server/model-view";

export async function GET(
  request: Request,
  context: { params: Promise<{ modelId: string; version: string }> },
): Promise<NextResponse> {
  const config = loadWebConfig();
  const nowSec = Math.floor(Date.now() / 1000);
  if (sessionFromRequest(config, request, nowSec) === undefined) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const { modelId, version } = await context.params;
  if (!/^\d+$/.test(version)) {
    return NextResponse.json({ error: "invalid_version" }, { status: 400 });
  }
  const stored = getVersion(modelId, Number(version));
  if (stored === undefined) {
    return NextResponse.json({ error: "not_found", modelId, version: Number(version) }, { status: 404 });
  }
  return NextResponse.json({ model: projectModelVersion(stored.graph, stored.record.version) });
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
