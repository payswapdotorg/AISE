/**
 * `POST /review/api/decide` — THE review write channel (AISE-016).
 *
 * This is the ONLY mutation endpoint in the review surface, and
 * it is a governed model change, not a UI mutation: the request
 * is parsed fail-closed (`parseReviewDecisionBody` — malformed
 * input never reaches canonical code), authenticated (401
 * before any data), and executed through `applyDecision`, which
 * builds a NEW committed version through the canonical
 * constructors and links evidence through the mapping boundary.
 * Nothing about this route edits a view, a store handle, or a
 * committed graph in place.
 *
 * Discipline (mirrors the AISE-015 read-surface contract):
 * - 401 before ANY data when unauthenticated;
 * - 400 with the COMPLETE error list when the body is malformed
 *   (never a silent coercion, never a guess);
 * - 404/400 with machine-readable codes when the target
 *   model/version/entity/property/evidence does not resolve;
 * - 200 with the DecisionOutcome (new version, digest) when the
 *   governed change commits;
 * - every other failure fails CLOSED (500, no partial state).
 */
import { NextResponse } from "next/server";
import { loadWebConfig } from "@/server/config";
import { sessionFromRequest } from "@/server/session";
import { parseReviewDecisionBody } from "../../server/decision-contract";
import { applyDecision, ReviewDecisionError } from "../../server/review-store";

export async function POST(request: Request): Promise<NextResponse> {
  // --- authentication (before any data) ------------------------------------
  const config = loadWebConfig();
  const session = sessionFromRequest(config, request, Math.floor(Date.now() / 1000));
  if (session === undefined) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  // --- body parse (fail closed; malformed JSON is a 400) --------------------
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return NextResponse.json({ error: "unsupported_media_type" }, { status: 400 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  // --- the contract parse (complete error list, never a guess) ---------------
  const parsed = parseReviewDecisionBody(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: "invalid_request", errors: parsed.errors }, { status: 400 });
  }

  // --- the governed write path (never a UI mutation) -------------------------
  try {
    // Review decisions carry their own REAL instants (the honest clock of
    // the actor's action — deterministic only in tests, which inject `now`).
    // `toISOString()` already matches the contract timestamp pattern
    // (RFC 3339 UTC, fractional seconds allowed).
    const now = new Date().toISOString();
    const outcome = applyDecision(parsed.request, session.user, now);
    return NextResponse.json({ outcome });
  } catch (error) {
    if (error instanceof ReviewDecisionError) {
      return NextResponse.json(
        { error: error.code, message: error.message },
        { status: error.httpStatus },
      );
    }
    // Unknown failures fail closed with no detail leak.
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

/** Read discipline: the decide surface is POST-only. */
export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ error: "method_not_allowed" }, { status: 405 });
}

export async function PUT(): Promise<NextResponse> {
  return NextResponse.json({ error: "method_not_allowed" }, { status: 405 });
}

export async function DELETE(): Promise<NextResponse> {
  return NextResponse.json({ error: "method_not_allowed" }, { status: 405 });
}
