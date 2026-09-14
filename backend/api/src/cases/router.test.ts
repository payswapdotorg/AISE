/**
 * AISE-025 — Engineering Case HTTP surface tests (through the FULL server
 * handler, exercising the one AISE-025 routing delegation block).
 *
 * Depth mandated by the CRITICAL work order: every endpoint's happy path
 * and error path, stable 422 codes, 404/405, x-request-id correlation, the
 * lazy default wiring, and the full governed lifecycle over HTTP.
 */

import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import pkg from "../../package.json" with { type: "json" };
import { createLogger } from "../lib/log";
import type { EnvRecord } from "../lib/config";
import { createCaptureGateway } from "../capture/gateway";
import { InMemoryCaptureStore } from "../capture/store";
import { createRequestHandler } from "../server";
import { CaseService } from "./service";
import { FsCaseStore } from "./store";
import { sha256Hex } from "../lib/hash";
import { EV_ROOF_VIDEO, EV_WALL_PHOTO, fixedClock, withTempDir } from "./testkit";

const quietLogger = createLogger("error");

const validEnv: EnvRecord = {
  HOST: "127.0.0.1",
  PORT: "8080",
  LOG_LEVEL: "info",
};

/** Handler with the AISE-025 routing block backed by an injected FS store. */
function handlerWith(root: string): (request: Request) => Promise<Response> {
  return createRequestHandler({
    envSource: () => validEnv,
    version: pkg.version,
    logger: quietLogger,
    capture: createCaptureGateway({ store: new InMemoryCaptureStore(), clock: fixedClock }),
    cases: {
      service: new CaseService({ store: new FsCaseStore(join(root, "data")), clock: fixedClock }),
      logger: quietLogger,
    },
  });
}

function postJson(path: string, body: string, headers?: Record<string, string>): Request {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    body,
    headers: { "content-type": "application/json", ...headers },
  });
}

function get(path: string, headers?: Record<string, string>): Request {
  return new Request(`http://localhost${path}`, { method: "GET", headers });
}

function put(path: string): Request {
  return new Request(`http://localhost${path}`, { method: "PUT" });
}

interface ErrorBody {
  ok: boolean;
  error: string;
  detail?: string;
}

const CREATE_BODY = JSON.stringify({
  caseId: "case-http-1",
  title: "Damp ingress, north elevation",
  links: { nodeIds: ["node-wall-north"], captureSessionIds: ["session-42"] },
});

describe("cases HTTP surface: create and read", () => {
  test("POST /v1/cases creates the case; x-request-id echoes; file at the path convention", async () => {
    await withTempDir(async (root) => {
      const handler = handlerWith(root);
      const response = await handler(postJson("/v1/cases", CREATE_BODY, { "x-request-id": "corr-case-1" }));
      expect(response.status).toBe(200);
      expect(response.headers.get("x-request-id")).toBe("corr-case-1");
      const body = (await response.json()) as {
        ok: boolean;
        case: { caseId: string; status: string; history: unknown[] };
      };
      expect(body.ok).toBe(true);
      expect(body.case.caseId).toBe("case-http-1");
      expect(body.case.status).toBe("open");
      expect(body.case.history).toHaveLength(1);
      expect(
        existsSync(join(root, "data", "cases", `${sha256Hex("case-http-1")}.json`)),
      ).toBe(true);
    });
  });

  test("create rejections: duplicate 422 case_exists, shape 422 invalid_case, malformed JSON 400", async () => {
    await withTempDir(async (root) => {
      const handler = handlerWith(root);
      await handler(postJson("/v1/cases", CREATE_BODY));
      const duplicate = await handler(postJson("/v1/cases", CREATE_BODY));
      expect(duplicate.status).toBe(422);
      expect(((await duplicate.json()) as ErrorBody).error).toBe("case_exists");
      const badShape = await handler(postJson("/v1/cases", JSON.stringify({ caseId: "x" })));
      expect(badShape.status).toBe(422);
      expect(((await badShape.json()) as ErrorBody).error).toBe("invalid_case");
      const malformed = await handler(postJson("/v1/cases", "{nope"));
      expect(malformed.status).toBe(400);
      expect(((await malformed.json()) as ErrorBody).error).toBe("malformed_json");
    });
  });

  test("GET /v1/cases/:id returns the full record with SEPARATE fact/inference arrays", async () => {
    await withTempDir(async (root) => {
      const handler = handlerWith(root);
      await handler(postJson("/v1/cases", CREATE_BODY));
      const response = await handler(get("/v1/cases/case-http-1", { "x-request-id": "corr-case-2" }));
      expect(response.status).toBe(200);
      expect(response.headers.get("x-request-id")).toBe("corr-case-2");
      const body = (await response.json()) as {
        ok: boolean;
        case: { observations: unknown[]; hypotheses: unknown[]; links: unknown };
      };
      expect(body.ok).toBe(true);
      expect(body.case.observations).toEqual([]);
      expect(body.case.hypotheses).toEqual([]);
      expect(body.case.observations).not.toBe(body.case.hypotheses);
    });
  });

  test("GET /v1/cases/:id unknown → 404 case_not_found; wrong method → 405 with allow", async () => {
    await withTempDir(async (root) => {
      const handler = handlerWith(root);
      const unknown = await handler(get("/v1/cases/ghost"));
      expect(unknown.status).toBe(404);
      expect(((await unknown.json()) as ErrorBody).error).toBe("case_not_found");
      const wrongMethod = await handler(put("/v1/cases/case-http-1"));
      expect(wrongMethod.status).toBe(405);
      expect(wrongMethod.headers.get("allow")).toBe("GET");
      const rootPut = await handler(put("/v1/cases"));
      expect(rootPut.status).toBe(405);
      expect(rootPut.headers.get("allow")).toBe("GET, POST");
    });
  });

  test("GET /v1/cases lists summaries; generated x-request-id when absent; oversize id → 400", async () => {
    await withTempDir(async (root) => {
      const handler = handlerWith(root);
      await handler(postJson("/v1/cases", CREATE_BODY));
      const listed = await handler(get("/v1/cases"));
      expect(listed.status).toBe(200);
      expect(listed.headers.get("x-request-id")).toBeTruthy();
      const body = (await listed.json()) as {
        ok: boolean;
        cases: Array<{ caseId: string; status: string; counts: Record<string, number> }>;
      };
      expect(body.cases).toHaveLength(1);
      expect(body.cases[0]?.caseId).toBe("case-http-1");
      expect(body.cases[0]?.counts).toEqual({
        observations: 0,
        hypotheses: 0,
        missingEvidence: 0,
        openMissingEvidence: 0,
      });
      const oversize = await handler(get(`/v1/cases/${"x".repeat(257)}`));
      expect(oversize.status).toBe(400);
      expect(((await oversize.json()) as ErrorBody).error).toBe("invalid_case_id");
    });
  });
});

describe("cases HTTP surface: observations and hypotheses", () => {
  async function prepared(root: string): Promise<(request: Request) => Promise<Response>> {
    const handler = handlerWith(root);
    await handler(postJson("/v1/cases", CREATE_BODY));
    return handler;
  }

  test("POST observations happy path: OBSERVED fact with verbatim evidence ids", async () => {
    await withTempDir(async (root) => {
      const handler = await prepared(root);
      const response = await handler(
        postJson(
          "/v1/cases/case-http-1/observations",
          JSON.stringify({
            statement: "Efflorescence on the north wall.",
            evidenceIds: [EV_WALL_PHOTO, EV_ROOF_VIDEO],
            measurementRefs: ["meas-moisture-7"],
          }),
        ),
      );
      expect(response.status).toBe(200);
      const body = (await response.json()) as {
        ok: boolean;
        observation: {
          observationId: string;
          epistemicStatus: string;
          evidenceIds: string[];
          measurementRefs: string[];
        };
      };
      expect(body.observation.epistemicStatus).toBe("OBSERVED");
      expect(body.observation.evidenceIds).toEqual([EV_WALL_PHOTO, EV_ROOF_VIDEO]);
      expect(body.observation.observationId).toMatch(/^obs-[0-9a-f]{16}$/);
      const record = await handler(get("/v1/cases/case-http-1"));
      const caseBody = (await record.json()) as { case: { observations: unknown[] } };
      expect(caseBody.case.observations).toHaveLength(1);
    });
  });

  test("POST observations rejections: evidence, epistemic separation, unknown case", async () => {
    await withTempDir(async (root) => {
      const handler = await prepared(root);
      const noEvidence = await handler(
        postJson("/v1/cases/case-http-1/observations", JSON.stringify({ statement: "s" })),
      );
      expect(noEvidence.status).toBe(422);
      expect(((await noEvidence.json()) as ErrorBody).error).toBe("observation_without_evidence");
      const claimedInference = await handler(
        postJson(
          "/v1/cases/case-http-1/observations",
          JSON.stringify({ statement: "s", evidenceIds: [EV_WALL_PHOTO], epistemicStatus: "INFERRED" }),
        ),
      );
      expect(claimedInference.status).toBe(422);
      expect(((await claimedInference.json()) as ErrorBody).error).toBe("invalid_epistemic_status");
      const unknownCase = await handler(
        postJson("/v1/cases/ghost/observations", JSON.stringify({ statement: "s", evidenceIds: [EV_WALL_PHOTO] })),
      );
      expect(unknownCase.status).toBe(404);
      expect(((await unknownCase.json()) as ErrorBody).error).toBe("case_not_found");
      const wrongMethod = await handler(get("/v1/cases/case-http-1/observations"));
      expect(wrongMethod.status).toBe(405);
      expect(wrongMethod.headers.get("allow")).toBe("POST");
    });
  });

  test("POST hypotheses happy path and typed rejections", async () => {
    await withTempDir(async (root) => {
      const handler = await prepared(root);
      const observation = (await (
        await handler(
          postJson("/v1/cases/case-http-1/observations", JSON.stringify({ statement: "s", evidenceIds: [EV_WALL_PHOTO] })),
        )
      ).json()) as { observation: { observationId: string } };
      const happy = await handler(
        postJson(
          "/v1/cases/case-http-1/hypotheses",
          JSON.stringify({
            statement: "Failed render admits rainwater.",
            epistemicStatus: "INFERRED",
            supportingObservationIds: [observation.observation.observationId],
            contradictingObservationIds: [],
            confidence: "medium",
          }),
        ),
      );
      expect(happy.status).toBe(200);
      const hypothesisBody = (await happy.json()) as {
        hypothesis: { hypothesisId: string; epistemicStatus: string; confidence: string };
      };
      expect(hypothesisBody.hypothesis.epistemicStatus).toBe("INFERRED");
      const unknownRef = await handler(
        postJson(
          "/v1/cases/case-http-1/hypotheses",
          JSON.stringify({
            statement: "s",
            epistemicStatus: "INFERRED",
            supportingObservationIds: ["obs-ghost"],
            contradictingObservationIds: [],
            confidence: "low",
          }),
        ),
      );
      expect(unknownRef.status).toBe(422);
      const unknownRefBody = (await unknownRef.json()) as ErrorBody;
      expect(unknownRefBody.error).toBe("unknown_observation_ref");
      expect(unknownRefBody.detail ?? "").toContain("obs-ghost");
      const asObserved = await handler(
        postJson(
          "/v1/cases/case-http-1/hypotheses",
          JSON.stringify({
            statement: "s",
            epistemicStatus: "OBSERVED",
            supportingObservationIds: [],
            contradictingObservationIds: [],
            confidence: "low",
          }),
        ),
      );
      expect(asObserved.status).toBe(422);
      expect(((await asObserved.json()) as ErrorBody).error).toBe("invalid_epistemic_status");
      const badConfidence = await handler(
        postJson(
          "/v1/cases/case-http-1/hypotheses",
          JSON.stringify({
            statement: "s",
            epistemicStatus: "PROPOSED",
            supportingObservationIds: [],
            contradictingObservationIds: [],
            confidence: "certain",
          }),
        ),
      );
      expect(badConfidence.status).toBe(422);
      expect(((await badConfidence.json()) as ErrorBody).error).toBe("invalid_confidence");
    });
  });
});

describe("cases HTTP surface: missing evidence, waivers and the governed lifecycle", () => {
  async function progressed(root: string): Promise<{
    handler: (request: Request) => Promise<Response>;
    missingId: string;
  }> {
    const handler = handlerWith(root);
    await handler(postJson("/v1/cases", CREATE_BODY));
    await handler(postJson("/v1/cases/case-http-1/observations", JSON.stringify({ statement: "s", evidenceIds: [EV_WALL_PHOTO] })));
    const observation = (await (
      await handler(get("/v1/cases/case-http-1"))
    ).json()) as { case: { observations: Array<{ observationId: string }> } };
    const hypothesis = (
      (await (
        await handler(
          postJson(
            "/v1/cases/case-http-1/hypotheses",
            JSON.stringify({
              statement: "h",
              epistemicStatus: "INFERRED",
              supportingObservationIds: [observation.case.observations[0]?.observationId],
              contradictingObservationIds: [],
              confidence: "low",
            }),
          ),
        )
      ).json()) as { hypothesis: { hypothesisId: string } }
    ).hypothesis;
    const missing = (
      (await (
        await handler(
          postJson(
            "/v1/cases/case-http-1/missing-evidence",
            JSON.stringify({
              description: "Roof drainage condition unknown.",
              kind: "MISSING",
              wouldResolve: [hypothesis.hypothesisId],
              requestedMethod: "drone photo pass",
            }),
          ),
        )
      ).json()) as { missingEvidence: { missingId: string } }
    ).missingEvidence;
    return { handler, missingId: missing.missingId };
  }

  test("POST missing-evidence happy path and typed rejections", async () => {
    await withTempDir(async (root) => {
      const { handler } = await progressed(root);
      const unknownHypothesis = await handler(
        postJson(
          "/v1/cases/case-http-1/missing-evidence",
          JSON.stringify({ description: "d", kind: "MISSING", wouldResolve: ["hyp-ghost"] }),
        ),
      );
      expect(unknownHypothesis.status).toBe(422);
      expect(((await unknownHypothesis.json()) as ErrorBody).error).toBe("unknown_hypothesis_ref");
      const badKind = await handler(
        postJson(
          "/v1/cases/case-http-1/missing-evidence",
          JSON.stringify({ description: "d", kind: "GONE", wouldResolve: [] }),
        ),
      );
      expect(badKind.status).toBe(422);
      expect(((await badKind.json()) as ErrorBody).error).toBe("invalid_missing_evidence");
      const wrongMethod = await handler(get("/v1/cases/case-http-1/missing-evidence"));
      expect(wrongMethod.status).toBe(405);
      expect(wrongMethod.headers.get("allow")).toBe("POST");
    });
  });

  test("collect: happy → collected; unknown → 404; double-collect → 422 missing_evidence_not_open", async () => {
    await withTempDir(async (root) => {
      const { handler, missingId } = await progressed(root);
      const collected = await handler(
        postJson(`/v1/cases/case-http-1/missing-evidence/${missingId}/collect`, ""),
      );
      expect(collected.status).toBe(200);
      const body = (await collected.json()) as { missingEvidence: { status: string } };
      expect(body.missingEvidence.status).toBe("collected");
      const unknown = await handler(postJson("/v1/cases/case-http-1/missing-evidence/mis-ghost/collect", ""));
      expect(unknown.status).toBe(404);
      expect(((await unknown.json()) as ErrorBody).error).toBe("missing_evidence_not_found");
      const again = await handler(
        postJson(`/v1/cases/case-http-1/missing-evidence/${missingId}/collect`, ""),
      );
      expect(again.status).toBe(422);
      expect(((await again.json()) as ErrorBody).error).toBe("missing_evidence_not_open");
    });
  });

  test("waive: note recorded (never silent); missing note → 422 waiver_note_required", async () => {
    await withTempDir(async (root) => {
      const { handler, missingId } = await progressed(root);
      const missingNote = await handler(
        postJson(`/v1/cases/case-http-1/missing-evidence/${missingId}/waive`, JSON.stringify({})),
      );
      expect(missingNote.status).toBe(422);
      expect(((await missingNote.json()) as ErrorBody).error).toBe("waiver_note_required");
      const waived = await handler(
        postJson(
          `/v1/cases/case-http-1/missing-evidence/${missingId}/waive`,
          JSON.stringify({ note: "Roof replaced in 2024 works — gap moot." }),
        ),
      );
      expect(waived.status).toBe(200);
      const body = (await waived.json()) as {
        missingEvidence: { status: string; waiverNote: string };
      };
      expect(body.missingEvidence.status).toBe("waived");
      expect(body.missingEvidence.waiverNote).toBe("Roof replaced in 2024 works — gap moot.");
      const malformed = await handler(
        postJson(`/v1/cases/case-http-1/missing-evidence/${missingId}/waive`, "{nope"),
      );
      expect(malformed.status).toBe(400);
      expect(((await malformed.json()) as ErrorBody).error).toBe("malformed_json");
    });
  });

  test("full governed lifecycle over HTTP: review pins digest, resolve, then immutable", async () => {
    await withTempDir(async (root) => {
      const { handler, missingId } = await progressed(root);
      await handler(postJson(`/v1/cases/case-http-1/missing-evidence/${missingId}/collect`, ""));
      const resolveTooEarly = await handler(postJson("/v1/cases/case-http-1/resolve", ""));
      expect(resolveTooEarly.status).toBe(422);
      expect(((await resolveTooEarly.json()) as ErrorBody).error).toBe("review_required_for_resolution");
      const badReview = await handler(
        postJson(
          "/v1/cases/case-http-1/review",
          JSON.stringify({ reviewer: "eng-reviewer-1", decision: "maybe", note: "n" }),
        ),
      );
      expect(badReview.status).toBe(422);
      expect(((await badReview.json()) as ErrorBody).error).toBe("invalid_review");
      const review = await handler(
        postJson(
          "/v1/cases/case-http-1/review",
          JSON.stringify({ reviewer: "eng-reviewer-1", decision: "approved", note: "Chain verified." }),
        ),
      );
      expect(review.status).toBe(200);
      const reviewBody = (await review.json()) as {
        review: { evidenceStateDigest: string; decision: string };
      };
      expect(reviewBody.review.evidenceStateDigest).toMatch(/^[0-9a-f]{64}$/);
      const underReview = (await (
        await handler(get("/v1/cases/case-http-1"))
      ).json()) as { case: { status: string } };
      expect(underReview.case.status).toBe("under_review");
      const resolved = await handler(postJson("/v1/cases/case-http-1/resolve", ""));
      expect(resolved.status).toBe(200);
      const resolvedBody = (await resolved.json()) as { case: { status: string } };
      expect(resolvedBody.case.status).toBe("resolved");
      const lateMutation = await handler(
        postJson("/v1/cases/case-http-1/observations", JSON.stringify({ statement: "late", evidenceIds: [EV_WALL_PHOTO] })),
      );
      expect(lateMutation.status).toBe(422);
      expect(((await lateMutation.json()) as ErrorBody).error).toBe("already_resolved");
      const resolveAgain = await handler(postJson("/v1/cases/case-http-1/resolve", ""));
      expect(resolveAgain.status).toBe(422);
      expect(((await resolveAgain.json()) as ErrorBody).error).toBe("already_resolved");
    });
  });

  test("unknown case subpaths fall through to the server 404", async () => {
    await withTempDir(async (root) => {
      const handler = handlerWith(root);
      const nonsense = await handler(postJson("/v1/cases/case-http-1/nonsense", "{}"));
      expect(nonsense.status).toBe(404);
      expect(((await nonsense.json()) as ErrorBody).error).toBe("not_found");
      const deep = await handler(postJson("/v1/cases/case-http-1/missing-evidence/mis-1/nonsense", "{}"));
      expect(deep.status).toBe(404);
    });
  });

  test("the lazy default wiring constructs the case service from the env data dir", async () => {
    await withTempDir(async (root) => {
      const envWithDir: EnvRecord = { ...validEnv, AISE_DATA_DIR: join(root, "data") };
      const handler = createRequestHandler({
        envSource: () => envWithDir,
        version: pkg.version,
        logger: quietLogger,
        capture: createCaptureGateway({ store: new InMemoryCaptureStore(), clock: fixedClock }),
      });
      const response = await handler(postJson("/v1/cases", CREATE_BODY));
      expect(response.status).toBe(200);
      expect(
        existsSync(join(root, "data", "cases", `${sha256Hex("case-http-1")}.json`)),
      ).toBe(true);
      // Canonical bytes: the default wiring produces the same file shape.
      const text = readFileSync(join(root, "data", "cases", `${sha256Hex("case-http-1")}.json`), "utf8");
      expect(text).toContain('"caseId": "case-http-1"');
    });
  });
});
