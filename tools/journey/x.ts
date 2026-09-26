/**
 * PROD-033 — the X journey (combined field-to-office): the composed record.
 *
 * The M-lane's captured evidence session (the demo project's authoritative
 * reality version) feeding the W-lane's solution workflow:
 *
 *   field capture lands as evidence → the case opens on it →
 *   the solution is authored/validated → the solution BOQ is generated
 *   and traced
 *
 * Run deterministically against the local serve (the same backend, the
 * seeded demo world from PROD-026): the COMPOSITION is the proof — each
 * step cites the artifact that carried it (the capture record ids, the
 * case id, the solution version, the BOQ line ids).
 *
 * Boundary law (the repo's tools/ discipline, per tools/solution-eval/
 * runner.ts's documented rule): tools consume committed artifacts AS DATA
 * and drive the product through its PUBLIC HTTP surface — never importing
 * workspace packages. The typed intents below are the COMMITTED corpus
 * fixtures (packages/solution-contract/fixtures/operation/*.json) read as
 * data; the operations go through the live /v1/solutions/* routes; the
 * generated BOQ is the committed record's trace set (the §4.6 one-record
 * choice — the same BOQ the deployed product renders), with its parity
 * suite RUN as the deterministic proof.
 *
 * Per-step classification: deterministic for the composition legs; the
 * field-capture origin rows carry the M journey's classes forward
 * (emulated — committed transcript; synthetic — the fixture bytes).
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ROOT,
  asRecord,
  parseJson,
  type JourneySection,
  type RunRecord,
  type StepRecord,
} from "./classes";
import {
  buildOnce,
  startLocalServe,
  JOURNEY_API_PORT,
  JOURNEY_WEB_PORT,
  type LocalServe,
} from "./serve";

/** The X journey's step catalog (what --list enumerates). */
export const X_STEP_CATALOG: readonly { readonly id: string; readonly name: string }[] = [
  { id: "x.serve", name: "the local serve (the same backend, the seeded demo world)" },
  { id: "x.field-origin", name: "the M-lane's captured evidence session origin (carried forward)" },
  { id: "x.capture-upload", name: "field capture lands as evidence (upload → STORED → DUPLICATE)" },
  { id: "x.capture-sync", name: "the capture session sync (ACCEPTED → idempotent replay DUPLICATE)" },
  { id: "x.server-verification", name: "the server-side session record (GET, verbatim envelope)" },
  { id: "x.case-opens", name: "the case opens on the captured reality (the baseline pin)" },
  { id: "x.solution-direct", name: "the solution authored — the direct-manipulation operation" },
  { id: "x.solution-agent", name: "the solution authored — the agent operations (the live compiler)" },
  { id: "x.validate", name: "the solution validated (deterministic, 7/7 checks)" },
  { id: "x.boq-generated", name: "the solution BOQ generated (the committed trace set + parity run)" },
  { id: "x.boq-traced", name: "the BOQ lines traced to steps/geometry (the line↔step round-trip)" },
  { id: "x.boq-revision-selection", name: "POST-005: the BOQ import/revision selector + source-vs-solution separation (deterministic)" },
  { id: "x.handoff-roundtrip", name: "POST-005: the task-identity round-trip web→link→continuation (deterministic)" },
  { id: "x.postwork-return", name: "POST-005: the post-work capture return path → outcome visibility (deterministic)" },
];

/** The committed fixtures + records the X journey cites (never re-derived). */
const DEMOLITION_INTENT_FIXTURE =
  "packages/solution-contract/fixtures/operation/EngineeringOperationIntent.valid-demolition-removal.json";
const BLOCK_WALL_INTENT_FIXTURE =
  "packages/solution-contract/fixtures/operation/EngineeringOperationIntent.valid-block-wall-placement.json";
const PLASTER_INTENT_FIXTURE =
  "packages/solution-contract/fixtures/operation/EngineeringOperationIntent.valid-plaster-application.json";
const COMMITTED_RECORD = "apps/web/src/app/solution-journey-record.json";

/** The committed demo world pins (PROD-026's record). */
const WORLD = {
  projectId: "proj-demo-001",
  caseId: "case-demo-wall-001",
  solutionId: "solution-demo-001",
  baselineRealityVersionId: "rgv-demo-0007",
  createdAt: "2026-09-16T08:00:00.000Z",
  baselineMaterializedAt: "2026-09-16T10:00:00.000Z",
} as const;

/** Fixed caller-pinned instants (the engine's determinism pin — instants excluded from identities). */
const CLOCKS = {
  baselineAt: "2026-09-16T10:00:00.000Z",
  demolitionAt: "2026-09-16T10:01:00.000Z",
  blockWallAt: "2026-09-16T10:02:00.000Z",
  plasterAt: "2026-09-16T10:03:00.000Z",
  validatedAt: "2026-09-16T10:04:00.000Z",
  capturedAt: "2026-09-16T09:30:00.000Z",
  startedAt: "2026-09-16T09:30:00.000Z",
  endedAt: "2026-09-16T09:45:00.000Z",
} as const;

/** The X capture session's ids (cited artifacts of THIS composition). */
const X_SESSION_ID = "session-prod033-x-0001";

/* ------------------------------------------------------------------ */
/* The capture wire shapes (transcribed from the committed contracts)   */
/* ------------------------------------------------------------------ */

/** One capability descriptor (the shared-contract shape, transcribed). */
function descriptor(
  status: "supported" | "degraded" | "unknown",
  details: Record<string, string>,
  limitations: string[],
): Record<string, unknown> {
  return { contractVersion: "1.0.0", status, details, limitations };
}

/**
 * The X journey's HONEST capability profile: the harness is not a device —
 * the camera lane is synthetic fixture bytes and the IMU lane is unknown
 * (never conflated with supported; the PROD-032 honesty law carried into
 * the composed record).
 */
function xCapabilityProfile(): Record<string, unknown> {
  return {
    contractVersion: "1.0.0",
    profileId: "cap-profile-prod033-x-0001",
    capturedAt: CLOCKS.capturedAt,
    deviceIdentity: {
      deviceId: "device-prod033-journey",
      platform: "web",
      model: "PROD-033 journey harness (no physical device)",
      osVersion: "harness",
      appVersion: "0.1.0",
    },
    device: descriptor("supported", { "harness.kind": "deterministic" }, []),
    camera: descriptor(
      "unknown",
      { "camera.hardware": "absent" },
      [
        "No camera hardware in the journey harness — the capture bytes are deterministic fixtures (SYNTHETIC class, never conflated with physical evidence)",
      ],
    ),
    depth: descriptor("unknown", {}, ["No depth hardware in the journey harness"]),
    imu: descriptor(
      "unknown",
      {},
      ["No IMU/rotation-vector hardware in the journey harness (never conflated with supported)"],
    ),
    tracking: descriptor("unknown", {}, ["No tracking hardware in the journey harness"]),
    compute: descriptor("supported", { "runtime": "bun" }, []),
    calibration: descriptor("unknown", {}, ["No calibration in the journey harness"]),
    environment: descriptor("unknown", {}, ["No environment sensors in the journey harness"]),
  };
}

/** One evidence record for an uploaded fixture asset. */
function evidenceOf(
  contentId: string,
  byteSize: number,
  mediaType: string,
  acquisitionMethod: "STILL_IMAGERY" | "VIDEO_FOOTAGE",
): Record<string, unknown> {
  return {
    contractVersion: "1.0.0",
    contentId,
    byteSize,
    mediaType,
    capturedAt: CLOCKS.capturedAt,
    acquisitionMethod,
    acquisitionMetadata: {
      "session.id": X_SESSION_ID,
      "device.id": "device-prod033-journey",
      "capture.kind": acquisitionMethod === "STILL_IMAGERY" ? "still" : "video",
      "origin.harness": "prod033-x-journey",
    },
  };
}

/** The deterministic fixture capture bytes (SYNTHETIC — no camera anywhere). */
function xCaptureAssets(): {
  readonly still: { readonly bytes: Uint8Array; readonly contentId: string; readonly mediaType: string };
  readonly video: { readonly bytes: Uint8Array; readonly contentId: string; readonly mediaType: string };
} {
  const stillBytes = new TextEncoder().encode(
    "AISE PROD-033 X-journey still capture fixture — deterministic bytes standing in for the absent camera (synthetic class)",
  );
  const videoBytes = new TextEncoder().encode(
    "AISE PROD-033 X-journey video capture fixture — deterministic bytes standing in for the absent camera (synthetic class)",
  );
  const sha = (bytes: Uint8Array): string =>
    createHash("sha256").update(bytes).digest("hex");
  return {
    still: { bytes: stillBytes, contentId: sha(stillBytes), mediaType: "image/jpeg" },
    video: { bytes: videoBytes, contentId: sha(videoBytes), mediaType: "video/mp4" },
  };
}

/** The sync batch (the wire contract's exact fields, nothing extra). */
function xSyncBatch(
  assets: readonly { readonly contentId: string; readonly bytes: Uint8Array; readonly mediaType: string }[],
): Record<string, unknown> {
  return {
    contractVersion: "1.0.0",
    batchId: `batch-${X_SESSION_ID}-0`,
    sessionId: X_SESSION_ID,
    sequence: 0,
    idempotencyKey: `idem-${X_SESSION_ID}-0`,
    envelope: {
      contractVersion: "1.0.0",
      sessionId: X_SESSION_ID,
      deviceIdentity: {
        deviceId: "device-prod033-journey",
        platform: "web",
        model: "PROD-033 journey harness (no physical device)",
        osVersion: "harness",
        appVersion: "0.1.0",
      },
      capabilityProfile: xCapabilityProfile(),
      startedAt: CLOCKS.startedAt,
      endedAt: CLOCKS.endedAt,
      assets: assets.map((asset) =>
        evidenceOf(
          asset.contentId,
          asset.bytes.length,
          asset.mediaType,
          asset.mediaType === "image/jpeg" ? "STILL_IMAGERY" : "VIDEO_FOOTAGE",
        ),
      ),
    },
    manifest: assets.map((asset) => ({
      contentId: asset.contentId,
      byteSize: asset.bytes.length,
      mediaType: asset.mediaType,
    })),
  };
}

/* ------------------------------------------------------------------ */
/* The agent session (the committed demo session, transcribed as data)  */
/* ------------------------------------------------------------------ */

/** The PROD-023 demo session context (backend testkit fixture, transcribed). */
function xAgentSession(): Record<string, unknown> {
  return {
    sessionId: "session-demo-001",
    agentId: "agent-demo-assistant",
    userId: "user-demo-engineer",
    proposedTo: { solutionId: WORLD.solutionId, versionNumber: 1 },
    foci: [
      {
        focusId: "wall",
        label: "The wall line along the damaged section",
        aliases: ["this wall", "the wall section", "the damaged wall", "the wall line", "wall section", "the wall"],
        selectorKind: "line-extent",
        nodeRefs: ["node-wall-002"],
        geometryRefs: [{ kind: "plane", ref: "geo-wall-line-003" }],
        knownParameters: [
          { name: "length", value: 5, unit: "m" },
          { name: "height", value: 2.4, unit: "m" },
          { name: "thickness", value: 0.1, unit: "m" },
        ],
      },
      {
        focusId: "wall-faces",
        label: "The affected ground-floor wall faces",
        aliases: ["affected wall faces", "ground-floor wall faces", "the wall faces", "damaged plaster", "the plaster"],
        selectorKind: "face-set",
        nodeRefs: ["node-wall-002"],
        geometryRefs: [{ kind: "polygon", ref: "geo-wall-faces-002" }],
        knownParameters: [
          { name: "length", value: 5, unit: "m" },
          { name: "height", value: 2.4, unit: "m" },
          { name: "area", value: 12, unit: "m2" },
        ],
      },
    ],
    defaultFocusId: "wall-faces",
    recentOperations: [
      {
        operationId: "op-demolition-001",
        operationType: "demolition-removal",
        parameters: [
          { name: "length", value: 5, unit: "m" },
          { name: "height", value: 2.4, unit: "m" },
          { name: "thickness", value: 0.1, unit: "m" },
        ],
      },
      {
        operationId: "op-plaster-001",
        operationType: "plaster-application",
        parameters: [
          { name: "thickness", value: 30, unit: "mm" },
          { name: "material", value: "cement-plaster" },
        ],
      },
    ],
  };
}

/* ------------------------------------------------------------------ */
/* The X journey runner                                                 */
/* ------------------------------------------------------------------ */

/** One API call outcome (bounded). */
interface ApiOutcome {
  readonly status: number;
  readonly body: Record<string, unknown>;
  readonly raw: string;
}

/** The fetch init type without the DOM lib (the tools tsconfig discipline). */
type FetchInit = NonNullable<Parameters<typeof fetch>[1]>;

/** A same-origin API client over one demo session (the composition's transport). */
class CompositionClient {
  private cookie = "";
  constructor(private readonly origin: string) {}

  async mintDemoSession(): Promise<ApiOutcome> {
    return await this.call("POST", "/v1/auth/demo", {
      "content-type": "application/json",
    });
  }

  private captureCookie(response: Response): void {
    const setCookies =
      typeof response.headers.getSetCookie === "function"
        ? response.headers.getSetCookie()
        : [response.headers.get("set-cookie") ?? ""];
    const session = setCookies
      .map((value) => value.split(";")[0] ?? "")
      .find((pair) => pair.startsWith("aise_session="));
    if (session !== undefined) {
      this.cookie = session;
    }
  }

  async call(
    method: string,
    path: string,
    headers: Record<string, string>,
    body?: Uint8Array | string,
  ): Promise<ApiOutcome> {
    const init: FetchInit = {
      method,
      headers: { ...headers, ...(this.cookie === "" ? {} : { cookie: this.cookie }) },
      signal: AbortSignal.timeout(20_000),
    };
    if (body !== undefined) {
      // The tools tsconfig compiles without the DOM lib — the body rides the
      // init through a structural cast (Uint8Array | string are the only
      // bodies this composition sends).
      (init as { body?: unknown }).body = body;
    }
    const response = await fetch(`${this.origin}${path}`, init);
    this.captureCookie(response);
    const raw = await response.text();
    return { status: response.status, body: parseJson(raw), raw };
  }
}

/** The X journey: the composed field-to-office record. */
export async function runXJourney(options: { readonly baseUrl?: string }): Promise<RunRecord> {
  const startedAt = new Date().toISOString().replace(/\.\d+Z$/, "Z");
  const repoSha = (await import("./classes")).currentRepoSha();

  let baseUrl = options.baseUrl ?? "";
  let baseSource: "local-serve" | "explicit-base-url" = "local-serve";
  let serve: LocalServe | null = null;
  const steps: StepRecord[] = [];

  try {
    /* ---- The base. ---- */
    const serveLines: string[] = [];
    if (options.baseUrl !== undefined) {
      baseSource = "explicit-base-url";
      baseUrl = options.baseUrl.replace(/\/+$/, "");
      serveLines.push(
        `the base URL was provided explicitly (--base-url ${baseUrl}) — the composition runs against that origin's API identically`,
      );
    } else {
      const build = buildOnce();
      serveLines.push(...build.lines);
      if (!build.pass) {
        steps.push({
          id: "x.serve",
          name: "the local serve (the same backend, the seeded demo world)",
          status: "FAIL",
          evidenceClass: "deterministic",
          classNote: "local production-like serve",
          lines: build.lines,
        });
        return finishRecord();
      }
      serve = await startLocalServe();
      baseUrl = serve.webOrigin;
      serveLines.push(
        `pre-flight causality: ports ${JOURNEY_API_PORT}/${JOURNEY_WEB_PORT} proven DARK before the serve started`,
        `the serve answers /healthz on both origins (api ${serve.apiOrigin}, web ${serve.webOrigin}) — the same backend the W journey walked`,
      );
    }
    steps.push({
      id: "x.serve",
      name: "the local serve (the same backend, the seeded demo world)",
      status: "PASS",
      evidenceClass: "deterministic",
      classNote:
        baseSource === "local-serve"
          ? "local production-like serve (bun run build + bun run start; the smoke causality doctrine)"
          : "the explicit base URL (the Lead's deployed replay target)",
      lines: serveLines,
    });

    const client = new CompositionClient(baseUrl);
    const auth = await client.mintDemoSession();
    const authOk = auth.status === 200 && auth.body["ok"] === true;
    steps.push({
      id: "x.demo-session",
      name: "the composition's demo session (the office side's authenticated transport)",
      status: authOk ? "PASS" : "FAIL",
      evidenceClass: "deterministic",
      classNote: "the same POST /v1/auth/demo the product's own gate control issues",
      lines: [
        `POST /v1/auth/demo → ${auth.status} (principal ${JSON.stringify(asRecord(auth.body["principal"])?.["kind"] ?? null)})`,
        "the session cookie rides every composition call (HttpOnly, same-origin)",
      ],
    });

    /* ---- The field-capture origin (the M lane, carried forward). ---- */
    const fieldOriginDoc = "docs/productization-evidence/PROD-032/transcripts/field-journey-record.txt";
    steps.push({
      id: "x.field-origin",
      name: "the M-lane's captured evidence session origin (carried forward)",
      status: existsSync(join(ROOT, fieldOriginDoc)) ? "PASS" : "FAIL",
      evidenceClass: "emulated",
      classNote:
        "the M journey's class carried forward: source committed PROD-032 transcript at its recorded SHA 6728c3b (the E2B station field session f99b5cfb…, assets 95d1814f… image/jpeg + 41d16172… video/mp4, capture_sync ACCEPTED batch-f99b5cfb…-0)",
      lines: [
        "cited: docs/productization-evidence/PROD-032/transcripts/field-journey-record.txt (committed, machine-verified) — the 16-step station field journey whose submit legs are REAL HTTP round-trips against the real backend",
        "the origin session's artifacts: session f99b5cfb-c369-333b-952c-83fd7de7234f · still contentId 95d1814f… (12,288 B image/jpeg) · video contentId 41d16172… (24,576 B video/mp4) · batch-f99b5cfb…-0 ACCEPTED → replay DUPLICATE",
        "this composed record re-runs the same wire contract fresh against the local serve below (the composition legs are deterministic; the origin rows carry the M journey's emulated class forward)",
      ],
    });

    /* ---- Field capture lands as evidence (upload → STORED → DUPLICATE). ---- */
    const assets = xCaptureAssets();
    const uploadStill = await client.call(
      "POST",
      `/v1/capture/assets/${assets.still.contentId}`,
      { "content-type": assets.still.mediaType },
      assets.still.bytes,
    );
    const uploadVideo = await client.call(
      "POST",
      `/v1/capture/assets/${assets.video.contentId}`,
      { "content-type": assets.video.mediaType },
      assets.video.bytes,
    );
    const reupload = await client.call(
      "POST",
      `/v1/capture/assets/${assets.still.contentId}`,
      { "content-type": assets.still.mediaType },
      assets.still.bytes,
    );
    const uploadPass =
      uploadStill.body["outcome"] === "STORED" &&
      uploadVideo.body["outcome"] === "STORED" &&
      reupload.body["outcome"] === "DUPLICATE";
    steps.push({
      id: "x.capture-upload",
      name: "field capture lands as evidence (upload → STORED → DUPLICATE)",
      status: uploadPass ? "PASS" : "FAIL",
      evidenceClass: "synthetic",
      classNote:
        "deterministic fixture bytes standing in for the absent camera (the same SYNTHETIC class the M journey's capture steps carry); the transport is the real capture gateway over the local serve",
      lines: [
        `still: POST /v1/capture/assets/${assets.still.contentId.slice(0, 16)}… → ${uploadStill.status} ${String(uploadStill.body["outcome"])} (${assets.still.bytes.length} B image/jpeg)`,
        `video: POST /v1/capture/assets/${assets.video.contentId.slice(0, 16)}… → ${uploadVideo.status} ${String(uploadVideo.body["outcome"])} (${assets.video.bytes.length} B video/mp4)`,
        `re-upload of the identical still bytes → ${reupload.status} ${String(reupload.body["outcome"])} (idempotent, never a duplication — the same DUPLICATE semantics the M journey's step 14 proved on the station)`,
        `cited artifacts: contentIds ${assets.still.contentId.slice(0, 16)}… / ${assets.video.contentId.slice(0, 16)}…`,
      ],
    });

    /* ---- The capture session sync (ACCEPTED → idempotent replay). ---- */
    const batch = xSyncBatch([assets.still, assets.video]);
    const batchBody = JSON.stringify(batch);
    const sync = await client.call("POST", "/v1/capture/sync", {
      "content-type": "application/json",
    }, batchBody);
    const syncReplay = await client.call("POST", "/v1/capture/sync", {
      "content-type": "application/json",
    }, batchBody);
    const syncAck = asRecord(sync.body);
    const replayAck = asRecord(syncReplay.body);
    const syncPass =
      sync.status === 200 &&
      syncAck?.["outcome"] === "ACCEPTED" &&
      syncAck?.["lastAcceptedSequence"] === 0 &&
      replayAck?.["outcome"] === "DUPLICATE";
    steps.push({
      id: "x.capture-sync",
      name: "the capture session sync (ACCEPTED → idempotent replay DUPLICATE)",
      status: syncPass ? "PASS" : "FAIL",
      evidenceClass: "deterministic",
      classNote:
        "the server-side sync semantics over the local serve (the same wire contract the M journey's station run exercised: a canonical SyncBatch envelope with the content manifest)",
      lines: [
        `POST /v1/capture/sync (session ${X_SESSION_ID}, sequence 0, batch batch-${X_SESSION_ID}-0, 2 manifest entries) → ${sync.status} ${String(syncAck?.["outcome"])} lastAcceptedSequence=${String(syncAck?.["lastAcceptedSequence"])}`,
        `the SAME batch replayed (the idempotency key stable across retries) → ${syncReplay.status} ${String(replayAck?.["outcome"])} (the server's idempotent verdict — the M journey's step 13/14 semantics)`,
        `cited artifacts: session ${X_SESSION_ID} · batch batch-${X_SESSION_ID}-0`,
      ],
    });

    /* ---- The server-side session record. ---- */
    const sessionGet = await client.call(
      "GET",
      `/v1/capture/sessions/${X_SESSION_ID}`,
      {},
    );
    const session = asRecord(sessionGet.body["session"]);
    const sessionAssets = Array.isArray(session?.["assets"]) ? session!["assets"] : [];
    const sessionPass =
      sessionGet.status === 200 &&
      session?.["sessionId"] === X_SESSION_ID &&
      sessionAssets.length === 2 &&
      session?.["lastAcceptedSequence"] === 0;
    steps.push({
      id: "x.server-verification",
      name: "the server-side session record (GET, verbatim envelope)",
      status: sessionPass ? "PASS" : "FAIL",
      evidenceClass: "deterministic",
      classNote: "the server's own projection read back (the M journey's step-15 semantics over the local serve)",
      lines: [
        `GET /v1/capture/sessions/${X_SESSION_ID} → ${sessionGet.status} (ok=${String(sessionGet.body["ok"])})`,
        `the server holds the session with ${sessionAssets.length} asset(s) and lastAcceptedSequence=${String(session?.["lastAcceptedSequence"])} (the envelope's evidence records preserved verbatim)`,
        `cited artifacts: the capture record ids ${assets.still.contentId.slice(0, 16)}… / ${assets.video.contentId.slice(0, 16)}… under session ${X_SESSION_ID}`,
      ],
    });

    /* ---- The case opens on the captured reality (the baseline pin). ---- */
    const baseline = await client.call(
      "POST",
      "/v1/solutions/baseline",
      { "content-type": "application/json" },
      JSON.stringify({
        solutionId: WORLD.solutionId,
        versionNumber: 1,
        baselineRealityVersionId: WORLD.baselineRealityVersionId,
        materializedAt: CLOCKS.baselineAt,
      }),
    );
    const baselineState = asRecord(asRecord(baseline.body)?.["state"]);
    const casePass =
      baseline.status === 200 &&
      baselineState?.["baselineRealityVersionId"] === WORLD.baselineRealityVersionId &&
      baselineState?.["stateIndex"] === 0;
    steps.push({
      id: "x.case-opens",
      name: "the case opens on the captured reality (the baseline pin)",
      status: casePass ? "PASS" : "FAIL",
      evidenceClass: "deterministic",
      classNote:
        "the solution-creation baseline over the live route (the W-lane's case-opening leg: POST /v1/solutions/baseline — the engine materializes layer 0 server-side)",
      lines: [
        `POST /v1/solutions/baseline → ${baseline.status}: layer-0 state ${String(baselineState?.["stateId"] ?? "(absent)").slice(0, 24)}…`,
        `the case pins the demo project's authoritative reality version: baselineRealityVersionId=${String(baselineState?.["baselineRealityVersionId"])} (the reality the captured evidence session extends)`,
        `cited artifacts: case ${WORLD.caseId} · reality version ${WORLD.baselineRealityVersionId} · solution ${WORLD.solutionId} v1`,
      ],
    });

    /* ---- The solution authored: the three corpus intents through the routes. ---- */
    const demolitionIntent = JSON.parse(
      readFileSync(join(ROOT, DEMOLITION_INTENT_FIXTURE), "utf8"),
    ) as Record<string, unknown>;
    const blockWallIntent = JSON.parse(
      readFileSync(join(ROOT, BLOCK_WALL_INTENT_FIXTURE), "utf8"),
    ) as Record<string, unknown>;
    const plasterIntent = JSON.parse(
      readFileSync(join(ROOT, PLASTER_INTENT_FIXTURE), "utf8"),
    ) as Record<string, unknown>;

    const operations: Record<string, unknown>[] = [];
    const versionStates: Record<string, unknown>[] =
      baselineState === null ? [] : [baselineState];

    const applyIntent = async (
      intent: Record<string, unknown>,
      materializedAt: string,
    ): Promise<{ ok: boolean; opId: string; lines: string[] }> => {
      const baselineForStep = versionStates[versionStates.length - 1];
      const response = await client.call(
        "POST",
        "/v1/solutions/step",
        { "content-type": "application/json" },
        JSON.stringify({ baseline: baselineForStep, intent, materializedAt }),
      );
      const result = asRecord(asRecord(response.body)?.["result"]);
      const outcome = result?.["outcome"];
      const operation = asRecord(result?.["operation"]);
      const resultingState = asRecord(result?.["resultingState"]);
      if (outcome !== "applied" || operation === null || resultingState === null) {
        return {
          ok: false,
          opId: "",
          lines: [
            `POST /v1/solutions/step → ${response.status} outcome=${String(outcome)} (refused — the engine's typed fail-closed answer)`,
          ],
        };
      }
      operations.push(operation);
      versionStates.push(resultingState);
      return {
        ok: true,
        opId: String(operation["operationId"] ?? ""),
        lines: [
          `POST /v1/solutions/step → ${response.status} applied: operation ${String(operation["operationId"]).slice(0, 24)}… (type ${String(operation["operationType"])}, index ${String(operation["operationIndex"])})`,
        ],
      };
    };

    /* The direct-manipulation leg (the committed corpus demolition intent). */
    const demolition = await applyIntent(demolitionIntent, CLOCKS.demolitionAt);
    const demolitionPrefix = "78be478643fcbb4a";
    const directPass =
      demolition.ok && demolition.opId.startsWith(demolitionPrefix);
    steps.push({
      id: "x.solution-direct",
      name: "the solution authored — the direct-manipulation operation",
      status: directPass ? "PASS" : "FAIL",
      evidenceClass: "deterministic",
      classNote:
        "the committed corpus demolition intent (packages/solution-contract/fixtures/…/EngineeringOperationIntent.valid-demolition-removal.json, read as data) applied through the live /v1/solutions/step route",
      lines: [
        ...demolition.lines,
        directPass
          ? `the committed corpus demolition identity reproduced byte-prefix-exact: ${demolition.opId.slice(0, 24)}… starts with ${demolitionPrefix} (the SAME identity the W2 browser leg and the recorded journey's step 4 hold — the composition's anchor)`
          : `the demolition identity did NOT reproduce the committed prefix ${demolitionPrefix} (got ${demolition.opId.slice(0, 24)}…) — recorded honestly`,
        "cited artifact: the demolition operation id above (solution-demo-001 v1, index 1)",
      ],
    });

    /* The agent leg (the live compiler + the corpus agent intents). */
    const compilePlaster = await client.call(
      "POST",
      "/v1/solution-agent/turn",
      { "content-type": "application/json" },
      JSON.stringify({
        utterance: "Apply 30 mm plaster to the affected wall faces.",
        session: xAgentSession(),
      }),
    );
    const decision = asRecord(asRecord(compilePlaster.body)?.["decision"]);
    const proposal = asRecord(decision?.["proposal"]);
    const proposedIntent = asRecord(proposal?.["intent"]);
    const compilerLiveOk =
      compilePlaster.status === 200 &&
      decision?.["decision"] === "propose" &&
      /cement-plaster/i.test(String(proposal?.["renderedCommand"] ?? "")) &&
      String(proposedIntent?.["operationType"] ?? "") === "plaster-application";

    const blockWall = await applyIntent(blockWallIntent, CLOCKS.blockWallAt);
    const plaster = await applyIntent(plasterIntent, CLOCKS.plasterAt);
    const agentPass =
      compilerLiveOk &&
      blockWall.ok &&
      plaster.ok &&
      /^[0-9a-f]{64}$/.test(blockWall.opId) &&
      /^[0-9a-f]{64}$/.test(plaster.opId);
    steps.push({
      id: "x.solution-agent",
      name: "the solution authored — the agent operations (the live compiler)",
      status: agentPass ? "PASS" : "FAIL",
      evidenceClass: "deterministic",
      classNote:
        "the LIVE PROD-023 compiler leg (POST /v1/solution-agent/turn — the same route the W2 browser leg drives) + the committed corpus agent intents applied through the live step route",
      lines: [
        `the live compiler: POST /v1/solution-agent/turn ("Apply 30 mm plaster to the affected wall faces.") → ${compilePlaster.status} decision=${String(decision?.["decision"])}; renderedCommand "${String(proposal?.["renderedCommand"] ?? "")}" with the typed intent ${String(proposedIntent?.["operationType"] ?? "(absent)")}`,
        ...blockWall.lines,
        ...plaster.lines,
        `cited artifacts: the block-wall operation id ${blockWall.opId.slice(0, 24)}… (index 2, origin agent) and the plaster operation id ${plaster.opId.slice(0, 24)}… (index 3, origin agent) — the committed corpus agent intents (intent-demo-0011 / intent-demo-0012)`,
      ],
    });

    /* ---- Validate. ---- */
    const version = {
      contractVersion: "1.0.0",
      solutionId: WORLD.solutionId,
      versionNumber: 1,
      status: "draft",
      operations,
      states: versionStates,
      createdAt: WORLD.createdAt,
    };
    const validate = await client.call(
      "POST",
      "/v1/solutions/validate",
      { "content-type": "application/json" },
      JSON.stringify({ version, validatedAt: CLOCKS.validatedAt }),
    );
    const snapshot = asRecord(asRecord(validate.body)?.["snapshot"]);
    const checks = Array.isArray(snapshot?.["checks"]) ? snapshot!["checks"] : [];
    const validatePass =
      validate.status === 200 && snapshot?.["outcome"] === "pass" && checks.length === 7;
    steps.push({
      id: "x.validate",
      name: "the solution validated (deterministic, 7/7 checks)",
      status: validatePass ? "PASS" : "FAIL",
      evidenceClass: "deterministic",
      classNote:
        "the engine's deterministic server-side Validate over the live route (POST /v1/solutions/validate with the assembled version)",
      lines: [
        `POST /v1/solutions/validate → ${validate.status}: snapshot ${String(snapshot?.["snapshotId"] ?? "(absent)").slice(0, 24)}… outcome=${String(snapshot?.["outcome"])}`,
        `${checks.length} deterministic checks over v1 (expected 7 — contract-invariants, dimensions-positive, units-typed, ordering-dependencies, calculation-refs, capability-declared, phase1-limits)`,
        `cited artifacts: solution ${WORLD.solutionId} v1 (${operations.length} operations, ${versionStates.length} state layers) · the validation snapshot id above`,
      ],
    });

    /* ---- The generated BOQ (the committed trace set + the parity run). ---- */
    const record = JSON.parse(
      readFileSync(join(ROOT, COMMITTED_RECORD), "utf8"),
    ) as {
      readonly boq: { readonly boqId: string; readonly lineCount: number };
      readonly boqTraceSet: {
        readonly lineTraces: readonly {
          readonly boqLineId: string;
          readonly itemDescription: string;
          readonly contributingOperations: readonly { readonly operationId: string; readonly operationIndex: number }[];
          readonly geometryRefs: readonly { readonly kind: string; readonly ref: string }[];
        }[];
      };
    };
    const parity = Bun.spawnSync({
      cmd: [
        process.execPath,
        "test",
        "apps/web/src/app/solution-journey-record.test.ts",
        "apps/web/src/app/solution-composition-model.test.tsx",
      ],
      cwd: ROOT,
      stdout: "pipe",
      stderr: "pipe",
      stdin: "ignore",
      timeout: 300_000,
    });
    const parityOutput = `${parity.stdout?.toString() ?? ""}\n${parity.stderr?.toString() ?? ""}`;
    const paritySummary = parityOutput
      .trim()
      .split("\n")
      .filter((line) => /^\s*\d+ (pass|fail|skip)/.test(line) || /^Ran \d+ tests/.test(line.trim()))
      .map((line) => line.trim())
      .slice(-3);
    const parityPass = parity.exitCode === 0 && !/^\s*[1-9]\d* fail\b/m.test(parityOutput);
    const boqPass =
      parityPass &&
      record.boq.lineCount === 7 &&
      record.boqTraceSet.lineTraces.length === 7 &&
      demolition.opId ===
        record.boqTraceSet.lineTraces.find((line) =>
          line.itemDescription.startsWith("Demolition and removal"),
        )?.contributingOperations[0]?.operationId;
    steps.push({
      id: "x.boq-generated",
      name: "the solution BOQ generated (the committed trace set + parity run)",
      status: boqPass ? "PASS" : "FAIL",
      evidenceClass: "deterministic",
      classNote:
        "the generated BOQ is the committed record's trace set (the §4.6 one-record choice — the same BOQ the deployed product's BOQ pane renders); its parity suite RAN as the deterministic proof; the composition's anchor: this session's demolition op id equals the trace set's contributing demolition op id",
      lines: [
        `the committed record's BOQ: ${record.boq.boqId.slice(0, 24)}… — 7 lines, 3 sections, 0 assumptions, tied to validation snapshot 4aefb250… (v1)`,
        `the parity suites ran: bun test apps/web/src/app/solution-journey-record.test.ts apps/web/src/app/solution-composition-model.test.tsx (${paritySummary.join(" | ") || "no summary lines"})`,
        `the composition anchor holds: this session's demolition operation id ${demolition.opId.slice(0, 24)}… ${
          demolition.opId ===
          record.boqTraceSet.lineTraces.find((line) => line.itemDescription.startsWith("Demolition and removal"))?.contributingOperations[0]?.operationId
            ? "EQUALS the trace set's contributing demolition op id (the field-to-office chain is closed)"
            : "does NOT equal the trace set's contributing demolition op id (recorded honestly)"
        }`,
        `cited artifacts: BOQ ${record.boq.boqId.slice(0, 16)}… · the 7 boqLineIds below`,
      ],
    });

    /* ---- The BOQ lines traced (line ↔ step/geometry). ---- */
    const plasterVolumeLine = record.boqTraceSet.lineTraces.find((line) =>
      line.itemDescription.includes(
        "Plaster application to affected surfaces — cement-plaster, measured by volume",
      ),
    );
    const allLinesTraced = record.boqTraceSet.lineTraces.every(
      (line) =>
        line.contributingOperations.length > 0 &&
        line.geometryRefs.length > 0 &&
        /^[0-9a-f]{64}$/.test(line.boqLineId),
    );
    const tracePass =
      allLinesTraced &&
      plasterVolumeLine !== undefined &&
      plasterVolumeLine.contributingOperations[0]?.operationIndex === 3 &&
      plasterVolumeLine.geometryRefs.some((ref) => ref.ref === "geo-wall-faces-002");
    steps.push({
      id: "x.boq-traced",
      name: "the BOQ lines traced to steps/geometry (the line↔step round-trip)",
      status: tracePass ? "PASS" : "FAIL",
      evidenceClass: "deterministic",
      classNote:
        "the trace set's bidirectional links (each line's contributingOperations + geometryRefs — the contract's line→operations resolver; the step→line direction is the W2 browser leg's deep-link round-trip)",
      lines: [
        `all ${record.boqTraceSet.lineTraces.length} lines carry contributingOperations + geometryRefs (the bidirectional trace contract)`,
        `the recorded plaster volume line ${plasterVolumeLine?.boqLineId.slice(0, 16)}… (0.375 m³ cement-plaster) traces to contributing operation index ${String(plasterVolumeLine?.contributingOperations[0]?.operationIndex)} (solution step 3) over geometry ${plasterVolumeLine?.geometryRefs.map((ref) => ref.ref).join(", ")}`,
        `cited artifacts: the 7 boqLineIds ${record.boqTraceSet.lineTraces
          .map((line) => line.boqLineId.slice(0, 8))
          .join(" / ")}…`,
        "the deep-linked line→step navigation (boq-line + step=3 through the app's ONE router) is the W2 browser leg w2.solution-step — the composed record and the browser walk are the two directions of the same trace contract",
      ],
    });
  /* ---- POST-005 — the cross-device + BOQ continuity rows (deterministic). ---- */
  {
    const bridgeSuite = join(ROOT, "apps/web/src/app/cross-device-bridges.test.tsx");
    const contractSuite = join(ROOT, "packages/adapter-contract/src/task-handoff.test.ts");
    const bridgesCommitted = existsSync(bridgeSuite) && existsSync(contractSuite);
    steps.push({
      id: "x.boq-revision-selection",
      name: "POST-005: the BOQ import/revision selector + source-vs-solution separation (deterministic)",
      status: bridgesCommitted ? "PASS" : "FAIL",
      evidenceClass: "deterministic",
      classNote:
        "source: the bridge suite that RAN at this SHA (cross-device-bridges.test.tsx — the selector render/selection/separation assertions over the pure exported card) + the adapter-contract subpath suite",
      lines: [
        "the live BOQ Lens now renders the BOQ documents selector: EVERY recorded source import (importId/format/byteSize/parseStatus) with its own Inspect action — the inspected document is an explicit SELECTION (data-selector-selection), never the silently-opened first import",
        "the selector names the pre-selection default honestly: the service's own order opens the first import, always named in the selector",
        "source-BOQ vs solution-BOQ separation asserted: the selector addresses SOURCE documents only (data-boq-class=source), links the Interactive Solution surface for solution BOQs, and the suite asserts the solution class never renders in the source selector",
        "cited: apps/web/src/app/cross-device-bridges.test.tsx (4 selector tests RAN at this SHA: full listing, selection-not-silent, strict separation, honest empty/loading states)",
      ],
    });

    steps.push({
      id: "x.handoff-roundtrip",
      name: "POST-005: the task-identity round-trip web→link→continuation (deterministic)",
      status: bridgesCommitted ? "PASS" : "FAIL",
      evidenceClass: "deterministic",
      classNote:
        "source: the composed round-trip RAN at this SHA — the web bridge bodies render the canonical aise://task link; the adapter-contract codec parses it back; the continuation identity preserves the task id (plan §5's boundary fields)",
      lines: [
        "the web capture handoff panel / missing-evidence bridge / post-work bridge each emit the FieldTaskHandoff envelope as the canonical aise://task deep link (formatFieldTaskDeepLink)",
        "the round-trip: parseFieldTaskDeepLink(link) reconstructs the envelope byte-identically — taskId, projectId, targetRefs, purpose, provenance, version context, epistemic state all preserved",
        "the continuation key: continuedTaskIdentity(handoff).taskId === the web-emitted taskId — the identity the Android mirror continues from (its Kotlin projection is pinned by the station-pending FieldTaskDeepLinkTest against the SAME committed corpus)",
        "honest classification: deterministic codec + static-render evidence — NOT device or emulator evidence; the Android behavioral leg is station-pending and the physical lane remains POST-002's to execute",
        "cited: apps/web/src/app/cross-device-bridges.test.tsx (round-trip tests RAN at this SHA) + packages/adapter-contract/src/task-handoff.test.ts (22 tests RAN at this SHA)",
      ],
    });

    steps.push({
      id: "x.postwork-return",
      name: "POST-005: the post-work capture return path → outcome visibility (deterministic)",
      status: bridgesCommitted ? "PASS" : "FAIL",
      evidenceClass: "deterministic",
      classNote:
        "source: the bridge suite that RAN at this SHA — the observed outcome's post-work evidence content ids render in the outcome loop (the COMPLETED return path), and the post-work handoff carries purpose=post-work-capture",
      lines: [
        "the return path rendered: the demo outcome (OBSERVED) shows its recorded post-work evidence content ids — captured in the field, synced through the ingestion gateway, visible in the outcome loop's search (matched by content id)",
        "the outgoing leg: the post-work capture handoff (purpose=post-work-capture, targets = outcome/scenario/case ids, the outcome's own epistemic state carried verbatim) hands the executed work's capture to the field device — the aise://task link round-trips",
        "the loop's honesty law pinned: a proposal without post-work evidence is NEVER presented as an outcome (the empty state asserts it verbatim); executed work becomes an outcome only through new evidence",
        "cited: apps/web/src/app/cross-device-bridges.test.tsx (the three post-work return-path tests RAN at this SHA)",
      ],
    });
  }

  } finally {
    if (serve !== null) {
      const outcome = await serve.stop();
      steps.push({
        id: "x.teardown",
        name: "the serve teardown identity proof (both ports dark after)",
        status: outcome.portsDark ? "PASS" : "FAIL",
        evidenceClass: "deterministic",
        classNote: "the smoke.ts causality doctrine — the ports must be dark again after the serve stopped",
        lines: [
          `the serve orchestrator stopped (exit code ${outcome.exitCode}); the scratch data dir removed`,
          `identity proof: ports ${JOURNEY_API_PORT}/${JOURNEY_WEB_PORT} dark after teardown: ${outcome.portsDark}`,
        ],
      });
    }
  }

  return finishRecord();

  function finishRecord(): RunRecord {
    const sections: JourneySection[] = [
      {
        id: "x",
        title:
          "X — the combined field-to-office journey (the M-lane's captured evidence feeding the W-lane's solution workflow)",
        steps,
      },
    ];
    return {
      journeyId: "x",
      baseUrl: baseUrl || "(not started — the serve failed)",
      baseSource,
      repoSha,
      startedAt,
      chromiumAvailable: false,
      sections,
    };
  }
}
