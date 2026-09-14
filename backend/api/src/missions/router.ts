/**
 * Mission planning HTTP surface (AISE-007) — the transport adapter for the
 * pure planner (`missions/planner.ts`) over an injected mission store.
 *
 * Contract (spec/work-orders.md §007; spec/requirements.md R1 "capability
 * snapshot is persisted; plan varies by device; limitations and escalation
 * paths are explicit"):
 *
 *   POST /v1/missions/plan
 *       Body: `{ intent, assurance, deviceProfile, existingEvidence? }`.
 *       `deviceProfile` is validated with `decodeDeviceCapabilityProfileStrict`
 *       (canonical validation for an internal pipeline — the profile is
 *       persisted verbatim inside the mission). Returns 200 with the planned
 *       mission (state "draft", persisted at revision 0) or, when the device
 *       is inadequate for the intent, the escalation envelope:
 *       `{ ok: true, escalated: true, escalationReason, recommendation,
 *       mission }` with the mission persisted at state "escalated". Escalation
 *       is a VALID planning outcome, not a transport error — it is explicit in
 *       the body (R1) and never lowers the assurance target.
 *
 *   GET  /v1/missions/:id
 *       Stored mission (latest revision) plus its append-only revision
 *       history, or 404 `mission_not_found`.
 *
 *   GET  /v1/missions
 *       List projection: missionId, state, intent, revision (sorted by id).
 *
 * HTTP STATUS MAPPING (single authoritative place for this surface):
 *   plan happy path / escalation -> 200 (mission or escalation envelope)
 *   bad_request results         -> 400 (malformed JSON, invalid intent /
 *                                    assurance / existingEvidence, device
 *                                    profile that fails the strict wire
 *                                    contract, unsupported contract version)
 *   unknown mission id          -> 404
 *   wrong methods               -> 405 with an explicit `allow`
 *
 * Every response carries the `x-request-id` correlation header (see
 * `lib/http.ts`); paths that match no missions route return null so the
 * server's default 404 applies. The router owns NO clock and NO randomness —
 * the planner's determinism is injected upstream.
 */

import {
  ContractDecodeError,
  ContractVersionMismatchError,
  decodeDeviceCapabilityProfileStrict,
  evidenceMethodSchema,
  type ContractIssue,
  type DeviceCapabilityProfile,
} from "@aise/shared-contracts";
import { loadConfig, type EnvSource } from "../lib/config";
import { jsonResponse, methodNotAllowed } from "../lib/http";
import type { Logger } from "../lib/log";
import type { ExistingEvidenceHint, MissionPlanner, PlanningInput } from "./planner";
import { createMissionPlanner } from "./planner";
import { FsMissionStore, InMemoryMissionStore, type MissionStore } from "./store";

export interface MissionsRouteOptions {
  /** Pure mission planner (deterministic given its injected clock/ids). */
  readonly planner: MissionPlanner;
  /** Append-only mission persistence. */
  readonly store: MissionStore;
  /** Structured logger for domain-level request events. */
  readonly logger: Logger;
}

function pathSegments(url: URL): string[] {
  return url.pathname.split("/").filter((segment) => segment !== "");
}

function summarizeIssues(issues: ReadonlyArray<ContractIssue>): Array<{
  path: string;
  code: string;
}> {
  return issues.map((issue) => ({
    path: issue.path.length === 0 ? "<root>" : issue.path.map(String).join("/"),
    code: issue.code,
  }));
}

/* ------------------------------------------------------------------ */
/* POST /v1/missions/plan — request parsing and validation              */
/* ------------------------------------------------------------------ */

type PlanRequestResult =
  | { readonly kind: "input"; readonly input: PlanningInput }
  | {
      readonly kind: "bad_request";
      readonly error: string;
      readonly detail: string;
      readonly issues?: ReadonlyArray<{ path: string; code: string }>;
    };

const MAX_TEXT = 4096;
const MAX_SHORT_TEXT = 256;

function badRequest(
  error: string,
  detail: string,
  issues?: ReadonlyArray<{ path: string; code: string }>,
): PlanRequestResult {
  return { kind: "bad_request", error, detail, ...(issues === undefined ? {} : { issues }) };
}

/** Parse + validate the plan request body (pure; no I/O). */
function parsePlanRequest(rawBody: string): PlanRequestResult {
  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return badRequest("malformed_json", "request body is not valid JSON");
  }
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
    return badRequest("schema_invalid", "request body must be a JSON object");
  }
  const record = payload as Record<string, unknown>;

  // deviceProfile — strict wire-contract validation (the planner trusts the
  // typed input; validation happens exactly here at the boundary).
  let deviceProfile: DeviceCapabilityProfile;
  try {
    deviceProfile = decodeDeviceCapabilityProfileStrict(record["deviceProfile"]);
  } catch (error) {
    if (error instanceof ContractVersionMismatchError) {
      return badRequest(
        "version_unsupported",
        `deviceProfile contract version mismatch: expected ${error.expected} (or same major), received ${error.received}`,
      );
    }
    if (error instanceof ContractDecodeError) {
      return badRequest(
        "device_profile_invalid",
        "deviceProfile does not satisfy the DeviceCapabilityProfile wire contract",
        summarizeIssues(error.issues),
      );
    }
    throw error;
  }

  // intent — bounded non-empty text.
  const intent = record["intent"];
  if (typeof intent !== "string" || intent.trim().length === 0 || intent.length > MAX_TEXT) {
    return badRequest("invalid_intent", `intent must be a non-empty string of at most ${MAX_TEXT} characters`);
  }

  // assurance — summary + optional profile reference (the fixed truth
  // standard; unknown keys are dropped at this boundary, never interpreted).
  const assuranceValue = record["assurance"];
  if (assuranceValue === null || typeof assuranceValue !== "object" || Array.isArray(assuranceValue)) {
    return badRequest("invalid_assurance", "assurance must be a JSON object");
  }
  const assuranceRecord = assuranceValue as Record<string, unknown>;
  const summary = assuranceRecord["summary"];
  if (typeof summary !== "string" || summary.trim().length === 0 || summary.length > MAX_TEXT) {
    return badRequest("invalid_assurance", `assurance.summary must be a non-empty string of at most ${MAX_TEXT} characters`);
  }
  const profileRef = assuranceRecord["assuranceProfileRef"];
  if (
    profileRef !== undefined &&
    (typeof profileRef !== "string" || profileRef.length === 0 || profileRef.length > MAX_SHORT_TEXT)
  ) {
    return badRequest("invalid_assurance", `assurance.assuranceProfileRef must be a string of at most ${MAX_SHORT_TEXT} characters`);
  }
  const assurance =
    profileRef === undefined ? { summary } : { summary, assuranceProfileRef: profileRef };

  // existingEvidence — optional ordered hints about already-captured evidence.
  let existingEvidence: ExistingEvidenceHint[] | undefined;
  const hints = record["existingEvidence"];
  if (hints !== undefined) {
    if (!Array.isArray(hints)) {
      return badRequest("invalid_existing_evidence", "existingEvidence must be an array");
    }
    existingEvidence = [];
    for (const hint of hints) {
      if (hint === null || typeof hint !== "object" || Array.isArray(hint)) {
        return badRequest("invalid_existing_evidence", "each existingEvidence entry must be a JSON object");
      }
      const hintRecord = hint as Record<string, unknown>;
      if (!evidenceMethodSchema.safeParse(hintRecord["method"]).success) {
        return badRequest("invalid_existing_evidence", "each existingEvidence entry needs a valid evidence method");
      }
      const coverageNote = hintRecord["coverageNote"];
      if (
        coverageNote !== undefined &&
        (typeof coverageNote !== "string" || coverageNote.length === 0 || coverageNote.length > MAX_TEXT)
      ) {
        return badRequest("invalid_existing_evidence", `existingEvidence coverageNote must be a string of at most ${MAX_TEXT} characters`);
      }
      existingEvidence.push(
        coverageNote === undefined
          ? { method: hintRecord["method"] as ExistingEvidenceHint["method"] }
          : { method: hintRecord["method"] as ExistingEvidenceHint["method"], coverageNote },
      );
    }
  }

  return {
    kind: "input",
    input:
      existingEvidence === undefined
        ? { intent, assurance, deviceProfile }
        : { intent, assurance, deviceProfile, existingEvidence },
  };
}

/* ------------------------------------------------------------------ */
/* Routing                                                              */
/* ------------------------------------------------------------------ */

/**
 * Route and answer one request against the missions surface. Returns null
 * when the path is not a missions route (the server then answers 404).
 */
export async function handleMissionsRequest(
  request: Request,
  url: URL,
  requestId: string,
  options: MissionsRouteOptions,
): Promise<Response | null> {
  const segments = pathSegments(url);
  if (segments[0] !== "v1" || segments[1] !== "missions") {
    return null;
  }
  const { planner, store, logger } = options;

  /* POST /v1/missions/plan ---------------------------------------------- */

  if (segments.length === 3 && segments[2] === "plan") {
    if (request.method !== "POST") {
      return methodNotAllowed(requestId, "POST");
    }
    const result = parsePlanRequest(await request.text());
    if (result.kind === "bad_request") {
      logger.warn("missions_plan_bad_request", {
        requestId,
        error: result.error,
        detail: result.detail,
      });
      return jsonResponse(
        400,
        {
          ok: false,
          error: result.error,
          detail: result.detail,
          ...(result.issues === undefined ? {} : { issues: result.issues }),
        },
        requestId,
      );
    }

    const planning = planner.plan(result.input);
    const mission = await store.save(planning.mission);
    logger.info("missions_plan", {
      requestId,
      missionId: mission.missionId,
      state: mission.state,
      escalated: planning.kind === "escalated",
      steps: mission.steps.length,
    });
    if (planning.kind === "escalated") {
      const escalation = mission.escalation as { reason: string; recommendation: string } | undefined;
      return jsonResponse(
        200,
        {
          ok: true,
          escalated: true,
          escalationReason: planning.escalationReason,
          recommendation: escalation?.recommendation ?? "",
          mission,
        },
        requestId,
      );
    }
    return jsonResponse(200, { ok: true, mission }, requestId);
  }

  /* GET /v1/missions ---------------------------------------------------- */

  if (segments.length === 2) {
    if (request.method !== "GET") {
      return methodNotAllowed(requestId, "GET");
    }
    const missions = await store.list();
    logger.info("missions_list", { requestId, count: missions.length });
    return jsonResponse(200, { ok: true, missions }, requestId);
  }

  /* GET /v1/missions/:missionId ----------------------------------------- */

  if (segments.length === 3 && segments[2] !== "plan") {
    if (request.method !== "GET") {
      return methodNotAllowed(requestId, "GET");
    }
    let missionId: string;
    try {
      missionId = decodeURIComponent(segments[2] ?? "");
    } catch {
      return jsonResponse(400, { ok: false, error: "invalid_mission_id" }, requestId);
    }
    // The stored mission comes back with its latest revision and history.
    const stored = await store.get(missionId);
    if (stored === null) {
      return jsonResponse(404, { ok: false, error: "mission_not_found" }, requestId);
    }
    logger.info("missions_read", {
      requestId,
      missionId,
      revision: stored.current.revision,
      state: stored.current.state,
    });
    return jsonResponse(
      200,
      { ok: true, mission: stored.current, history: stored.history },
      requestId,
    );
  }

  // A /v1/missions/... path with no matching route shape falls through to the
  // server-wide 404.
  return null;
}

/* ------------------------------------------------------------------ */
/* Default wiring (used by server.ts when no explicit options exist)    */
/* ------------------------------------------------------------------ */

/**
 * Default missions wiring for the HTTP handler: file-system mission store
 * rooted at the configured data dir when the environment resolves, an
 * in-memory store otherwise (e.g. partial environments in tests). The
 * planner itself stays pure/deterministic; runtime ids and timestamps come
 * from the platform here — determinism is a property of the planner GIVEN
 * its injections.
 */
export function createDefaultMissionsRouting(options: {
  readonly envSource: EnvSource;
  readonly logger: Logger;
}): MissionsRouteOptions {
  let store: MissionStore;
  try {
    store = new FsMissionStore(loadConfig(options.envSource()).dataDir);
  } catch {
    store = new InMemoryMissionStore();
  }
  return {
    planner: createMissionPlanner({
      clock: () => new Date().toISOString(),
      idFactory: () => crypto.randomUUID(),
    }),
    store,
    logger: options.logger,
  };
}
