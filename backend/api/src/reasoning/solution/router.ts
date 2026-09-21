/**
 * PROD-023 — the agent operation compiler HTTP surface (transport adapter
 * ONLY, router.ts).
 *
 * A PURE route factory following the execution router's conventions
 * (AISE-031): it never judges truth, approval or validation — it compiles
 * typed inputs through the deterministic compiler and returns the typed
 * outcome. NOT MOUNTED in server.ts/main.ts: the Tech Lead wires it at the
 * composition station (PROD-024/026 era) — importing this module mounts
 * nothing by itself.
 *
 *   POST /v1/solution-agent/compile
 *       Compile one utterance. Body `{ utterance, session }` where
 *       `session` is the caller-assembled AgentSessionContext (sessionId,
 *       agentId, userId?, proposedTo?, foci?, defaultFocusId?,
 *       recentOperations?). 200 with `{ ok: true, command: <CompiledCommand
 *       as JSON> }` — clarification/unsupported/ambiguous/unsafe-refusal
 *       outcomes are 200 TYPED OUTCOMES, not HTTP errors (a refusal is a
 *       first-class result, exactly like the reasoning gateway's).
 *   POST /v1/solution-agent/turn
 *       Decide the next interaction turn. Body `{ utterance, session,
 *       pendingClarification?, pendingProposal? }` → `{ ok: true,
 *       decision: <TurnDecision> }`. The decision carries the typed tool
 *       command to dispatch (the transport — or the caller — executes it
 *       through the tool port; this router performs no effects).
 *
 * Malformed JSON and wrong methods are the only transport errors (400 /
 * 405); paths that match no solution-agent route return null so the
 * server's default 404 applies.
 */

import { jsonResponse, methodNotAllowed } from "../../lib/http";
import type { Logger } from "../../lib/log";
import { SolutionCompilerError } from "./model";
import type { AgentSessionContext } from "./model";
import type { SolutionCommandCompiler } from "./model";
import { decideNextTurn } from "./interaction";
import type { PendingClarification, PendingProposal } from "./interaction";

/** Route factory options: the compiled seams this adapter exposes. */
export interface SolutionAgentRouteOptions {
  readonly compiler: SolutionCommandCompiler;
  /** Structured logger; optional — the adapter stays silent without it. */
  readonly logger?: Logger;
}

const COMPILE_PATH = "/v1/solution-agent/compile";
const TURN_PATH = "/v1/solution-agent/turn";

interface TurnRequestBody {
  readonly utterance?: unknown;
  readonly session?: unknown;
  readonly pendingClarification?: unknown;
  readonly pendingProposal?: unknown;
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

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireUtteranceAndSession(
  payload: unknown,
): { ok: true; utterance: string; session: AgentSessionContext } | { ok: false; detail: string } {
  if (!isPlainObject(payload)) {
    return { ok: false, detail: "the request body must be a JSON object" };
  }
  const utterance = payload.utterance;
  if (typeof utterance !== "string" || utterance.trim().length === 0) {
    return { ok: false, detail: "utterance must be a non-empty string" };
  }
  const session = payload.session;
  if (!isPlainObject(session) || typeof session.sessionId !== "string") {
    return { ok: false, detail: "session must be an AgentSessionContext object" };
  }
  return { ok: true, utterance, session: session as unknown as AgentSessionContext };
}

/**
 * Creates the solution-agent route factory. PURE transport: compiles and
 * decides; performs no effects (the caller dispatches tool commands
 * through the tool port).
 */
export function createSolutionAgentRoutes(options: SolutionAgentRouteOptions) {
  const compiler = options.compiler;
  const logger = options.logger;

  const compileErrorResponse = (error: SolutionCompilerError, requestId: string): Response => {
    const status =
      error.code === "invalid_utterance" || error.code === "invalid_session"
        ? 400
        : 422;
    return jsonResponse(
      status,
      { ok: false, error: error.code, detail: error.detail },
      requestId,
    );
  };

  return async function handleSolutionAgentRoutes(
    request: Request,
    requestId: string,
  ): Promise<Response | null> {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path !== COMPILE_PATH && path !== TURN_PATH) {
      return null;
    }
    if (request.method !== "POST") {
      return methodNotAllowed(requestId, "POST");
    }

    const body = await readJsonBody(request);
    if (!body.ok) {
      return jsonResponse(400, { ok: false, error: "malformed_json" }, requestId);
    }

    try {
      if (path === COMPILE_PATH) {
        const parsed = requireUtteranceAndSession(body.payload);
        if (!parsed.ok) {
          return jsonResponse(400, { ok: false, error: "invalid_request", detail: parsed.detail }, requestId);
        }
        const command = await compiler.compile({
          utterance: parsed.utterance,
          session: parsed.session,
        });
        logger?.info("solution_agent_compiled", {
          requestId,
          kind: command.kind,
        });
        return jsonResponse(200, { ok: true, command }, requestId);
      }

      // TURN_PATH
      const parsed = requireUtteranceAndSession(body.payload);
      if (!parsed.ok) {
        return jsonResponse(400, { ok: false, error: "invalid_request", detail: parsed.detail }, requestId);
      }
      const turnBody = body.payload as TurnRequestBody;
      const pendingClarification = isPlainObject(turnBody.pendingClarification)
        ? (turnBody.pendingClarification as unknown as PendingClarification)
        : undefined;
      const pendingProposal = isPlainObject(turnBody.pendingProposal)
        ? (turnBody.pendingProposal as unknown as PendingProposal)
        : undefined;
      const decision = await decideNextTurn(
        {
          utterance: parsed.utterance,
          session: parsed.session,
          ...(pendingClarification !== undefined ? { pendingClarification } : {}),
          ...(pendingProposal !== undefined ? { pendingProposal } : {}),
        },
        compiler,
      );
      logger?.info("solution_agent_turn", {
        requestId,
        decision: decision.decision,
      });
      return jsonResponse(200, { ok: true, decision }, requestId);
    } catch (error) {
      if (error instanceof SolutionCompilerError) {
        return compileErrorResponse(error, requestId);
      }
      const name = error instanceof Error ? error.name : "Error";
      logger?.warn("solution_agent_route_error", { requestId, errorName: name });
      return jsonResponse(
        500,
        { ok: false, error: "internal_error", detail: `unexpected ${name}` },
        requestId,
      );
    }
  };
}
