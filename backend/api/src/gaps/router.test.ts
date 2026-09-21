/**
 * AISE-018 — Adaptive evidence-gap HTTP surface tests (through the FULL
 * server handler, exercising the one AISE-018 routing delegation block).
 *
 * Depth mandated by the work order: every endpoint's happy path and
 * error path, the stable 404/400/422 status table, 405 with allow,
 * x-request-id correlation, the governed-path refusal matrix over HTTP,
 * the ranked wire shape (named score components and derivations arrive
 * inspectable), and the LAZY DEFAULT WIRING end-to-end — the default gap
 * service resolves its three READ-ONLY reference resolvers over the
 * handler's OWN env data dir (a REAL reality project built through the
 * default reality wiring; evidence registered through the default
 * evidence wiring; the REAL shipped assurance profile and the REAL
 * evaluateReadiness evaluator), never through a memoized sibling wiring.
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
import { sha256Hex } from "../lib/hash";
import { GapAnalysisService } from "./service";
import { FsGapAnalysisStore } from "./store";
import {
  ANALYSIS_ID,
  EV_DUCT,
  EV_INVALIDATED_LI,
  EV_PHANTOM,
  EV_DEPTH_A,
  PROFILE_ID,
  PROJECT_ID,
  buildCanonicalInput,
  buildChimneyNode,
  buildEvidenceFacts,
  buildRealityNodes,
  buildRealityVersion,
  CHIMNEY_TOMBSTONE_REASON,
  FIXED_NOW,
  fixedClock,
  makeAssuranceProfileResolver,
  makeEvidenceGraphResolver,
  makeRealityVersionResolver,
  withTempDir,
} from "./testkit";
import { evaluateReadiness } from "../assurance/evaluate";
import { getAssuranceProfile } from "../assurance/profiles";

const quietLogger = createLogger("error");

const validEnv: EnvRecord = {
  HOST: "127.0.0.1",
  PORT: "8080",
  LOG_LEVEL: "info",
};

/** The canonical request body (wire shape, parser-normalized on the way in). */
function gapAnalysisBody(): string {
  const input = buildCanonicalInput();
  return JSON.stringify({
    analysisId: input.analysisId,
    taskRef: input.taskRef,
    annotations: input.annotations,
    uncertaintyAnnotations: input.uncertaintyAnnotations,
    taskFocus: input.taskFocus,
    effortContext: { byMethod: {} },
    methodPreferences: {},
  });
}

/** Handler with the AISE-018 routing block backed by an injected FS store (canonical resolvers). */
function handlerWith(root: string): (request: Request) => Promise<Response> {
  return createRequestHandler({
    envSource: () => validEnv,
    version: pkg.version,
    logger: quietLogger,
    capture: createCaptureGateway({ store: new InMemoryCaptureStore(), clock: fixedClock }),
    gaps: {
      service: new GapAnalysisService({
        store: new FsGapAnalysisStore(join(root, "data")),
        clock: fixedClock,
        assuranceProfileResolver: makeAssuranceProfileResolver([
          getAssuranceProfile(PROFILE_ID) as NonNullable<ReturnType<typeof getAssuranceProfile>>,
        ]),
        readinessEvaluator: evaluateReadiness,
        realityVersionResolver: makeRealityVersionResolver(PROJECT_ID, [buildRealityVersion()]),
        evidenceGraphResolver: makeEvidenceGraphResolver(buildEvidenceFacts()),
      }),
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

function del(path: string): Request {
  return new Request(`http://localhost${path}`, { method: "DELETE" });
}

interface ErrorBody {
  ok: boolean;
  error: string;
  detail?: string;
}

async function errorBody(response: Response): Promise<ErrorBody> {
  return (await response.json()) as ErrorBody;
}

describe("gap HTTP surface: the governed path", () => {
  test("POST /v1/gaps runs the analysis; x-request-id echoes; canonical file at the path convention", async () => {
    await withTempDir(async (root) => {
      const handler = handlerWith(root);
      const response = await handler(
        postJson("/v1/gaps", gapAnalysisBody(), { "x-request-id": "corr-gaps-1" }),
      );
      expect(response.status).toBe(200);
      expect(response.headers.get("x-request-id")).toBe("corr-gaps-1");
      const body = (await response.json()) as {
        ok: boolean;
        analysis: {
          analysisId: string;
          stats: { totalGaps: number; totalCandidates: number };
          readinessReport: { readiness: string };
        };
      };
      expect(body.ok).toBe(true);
      expect(body.analysis.analysisId).toBe(ANALYSIS_ID);
      expect(body.analysis.stats.totalGaps).toBe(10);
      expect(body.analysis.stats.totalCandidates).toBe(10);
      expect(body.analysis.readinessReport.readiness).toBe("NOT_READY");
      const path = join(root, "data", "gaps", `${sha256Hex(ANALYSIS_ID)}.json`);
      expect(existsSync(path)).toBe(true);
    });
  });

  test("the wire carries the ranked order with the named, inspectable score components", async () => {
    await withTempDir(async (root) => {
      const handler = handlerWith(root);
      const response = await handler(postJson("/v1/gaps", gapAnalysisBody()));
      expect(response.status).toBe(200);
      const body = (await response.json()) as {
        analysis: {
          candidates: {
            actionKind: string;
            subjectNodeId: string | null;
            score: {
              taskImpact: number;
              expectedUncertaintyReduction: number;
              operatorEffort: number;
              recoverability: number;
              compositeValue: number;
              derivation: Record<string, string>;
            };
            addressesGapIds: string[];
          }[];
          gaps: { gapId: string; kind: string; state: string; gapClass: string }[];
        };
      };
      const gapIds = new Set(body.analysis.gaps.map((gap) => gap.gapId));
      let previousComposite = Number.POSITIVE_INFINITY;
      for (const candidate of body.analysis.candidates) {
        // Ranked order: composite DESC.
        expect(candidate.score.compositeValue).toBeLessThanOrEqual(previousComposite);
        previousComposite = candidate.score.compositeValue;
        // The four named components arrive inspectable with derivations.
        for (const field of [
          "taskImpact",
          "expectedUncertaintyReduction",
          "operatorEffort",
          "recoverability",
        ]) {
          expect(candidate.score.derivation[field]).toBeTruthy();
        }
        // Every recommendation names its gaps.
        expect(candidate.addressesGapIds.length).toBeGreaterThanOrEqual(1);
        for (const gapId of candidate.addressesGapIds) {
          expect(gapIds.has(gapId)).toBe(true);
        }
      }
      // The first-class states arrive on the wire verbatim.
      const states = new Set(body.analysis.gaps.map((gap) => gap.state));
      expect(states.has("OCCLUDED")).toBe(true);
      expect(states.has("UNKNOWN")).toBe(true);
      expect(states.has("NOT_OBSERVED")).toBe(true);
    });
  });

  test("GET /v1/gaps lists summaries; GET /:id returns the record; 404 unknown", async () => {
    await withTempDir(async (root) => {
      const handler = handlerWith(root);
      await handler(postJson("/v1/gaps", gapAnalysisBody()));
      const list = await handler(get("/v1/gaps", { "x-request-id": "corr-list" }));
      expect(list.status).toBe(200);
      expect(list.headers.get("x-request-id")).toBe("corr-list");
      const listBody = (await list.json()) as {
        analyses: { analysisId: string; readinessLevel: string; totalGaps: number }[];
      };
      expect(listBody.analyses).toHaveLength(1);
      expect(listBody.analyses[0]?.analysisId).toBe(ANALYSIS_ID);
      expect(listBody.analyses[0]?.readinessLevel).toBe("NOT_READY");
      expect(listBody.analyses[0]?.totalGaps).toBe(10);

      const one = await handler(get(`/v1/gaps/${ANALYSIS_ID}`));
      expect(one.status).toBe(200);
      const oneBody = (await one.json()) as { analysis: { analysisId: string; history: unknown[] } };
      expect(oneBody.analysis.analysisId).toBe(ANALYSIS_ID);
      expect(oneBody.analysis.history).toHaveLength(1);

      const missing = await handler(get("/v1/gaps/analysis-ghost"));
      expect(missing.status).toBe(404);
      expect((await errorBody(missing)).error).toBe("analysis_not_found");
    });
  });

  test("400: malformed JSON and invalid ids", async () => {
    await withTempDir(async (root) => {
      const handler = handlerWith(root);
      const malformed = await handler(postJson("/v1/gaps", "{not json"));
      expect(malformed.status).toBe(400);
      expect((await errorBody(malformed)).error).toBe("malformed_json");
      const tooLong = await handler(get(`/v1/gaps/${"x".repeat(257)}`));
      expect(tooLong.status).toBe(400);
      expect((await errorBody(tooLong)).error).toBe("invalid_analysis_id");
      const badVersion = await handler(
        postJson(
          "/v1/gaps",
          JSON.stringify({
            ...JSON.parse(gapAnalysisBody()),
            taskRef: { projectId: PROJECT_ID, versionId: "2", profileId: PROFILE_ID },
          }),
        ),
      );
      expect(badVersion.status).toBe(400);
      expect((await errorBody(badVersion)).error).toBe("invalid_version_id");
    });
  });

  test("422: the governed refusal matrix over HTTP", async () => {
    await withTempDir(async (root) => {
      const handler = handlerWith(root);
      const body = gapAnalysisBody();

      const unknownProfile = await handler(
        postJson(
          "/v1/gaps",
          JSON.stringify({
            ...JSON.parse(body),
            taskRef: { projectId: PROJECT_ID, versionId: "v002", profileId: "assurance-profile/none/v9" },
          }),
        ),
      );
      expect(unknownProfile.status).toBe(422);
      expect((await errorBody(unknownProfile)).error).toBe("unknown_profile");

      const unknownVersion = await handler(
        postJson(
          "/v1/gaps",
          JSON.stringify({
            ...JSON.parse(body),
            taskRef: { projectId: "project-other", versionId: "v001", profileId: PROFILE_ID },
          }),
        ),
      );
      expect(unknownVersion.status).toBe(422);
      expect((await errorBody(unknownVersion)).error).toBe("unknown_reality_version");

      const phantomEvidence = await handler(
        postJson(
          "/v1/gaps",
          JSON.stringify({
            ...JSON.parse(body),
            annotations: [
              { targetNodeId: "ghost-room", observationStatus: "NOT_OBSERVED", evidenceIds: [EV_PHANTOM] },
            ],
          }),
        ),
      );
      expect(phantomEvidence.status).toBe(422);
      const phantomError = await errorBody(phantomEvidence);
      expect(phantomError.error).toBe("unknown_evidence_ref");
      expect(phantomError.detail).toContain(EV_PHANTOM);

      const contradiction = await handler(
        postJson(
          "/v1/gaps",
          JSON.stringify({
            ...JSON.parse(body),
            annotations: [
              { targetNodeId: "wall-north", observationStatus: "NOT_OBSERVED", evidenceIds: [EV_DUCT] },
            ],
          }),
        ),
      );
      expect(contradiction.status).toBe(422);
      expect((await errorBody(contradiction)).error).toBe("annotation_contradicts_reality");

      const badAnnotation = await handler(
        postJson(
          "/v1/gaps",
          JSON.stringify({
            ...JSON.parse(body),
            annotations: [{ targetNodeId: "x", observationStatus: "MAYBE", evidenceIds: [EV_DUCT] }],
          }),
        ),
      );
      expect(badAnnotation.status).toBe(422);
      expect((await errorBody(badAnnotation)).error).toBe("invalid_annotation");

      const unitMismatch = await handler(
        postJson(
          "/v1/gaps",
          JSON.stringify({
            ...JSON.parse(body),
            uncertaintyAnnotations: [
              { nodeId: "room-lobby", propertyKey: "room.width", sigma: 0.01, unit: "mm" },
            ],
          }),
        ),
      );
      expect(unitMismatch.status).toBe(422);
      expect((await errorBody(unitMismatch)).error).toBe("uncertainty_unit_mismatch");

      // Id reuse over HTTP (append-only).
      const first = await handler(postJson("/v1/gaps", body));
      expect(first.status).toBe(200);
      const reuse = await handler(postJson("/v1/gaps", body));
      expect(reuse.status).toBe(422);
      expect((await errorBody(reuse)).error).toBe("analysis_exists");
    });
  });

  test("405 with explicit allow on wrong methods; fall-through 404; health unaffected", async () => {
    await withTempDir(async (root) => {
      const handler = handlerWith(root);
      const putRoot = await handler(put("/v1/gaps"));
      expect(putRoot.status).toBe(405);
      expect(putRoot.headers.get("allow")).toBe("GET, POST");
      const delRoot = await handler(del("/v1/gaps"));
      expect(delRoot.status).toBe(405);
      expect(delRoot.headers.get("allow")).toBe("GET, POST");
      const postOne = await handler(postJson(`/v1/gaps/${ANALYSIS_ID}`, "{}"));
      expect(postOne.status).toBe(405);
      expect(postOne.headers.get("allow")).toBe("GET");
      const delOne = await handler(del(`/v1/gaps/${ANALYSIS_ID}`));
      expect(delOne.status).toBe(405);
      expect(delOne.headers.get("allow")).toBe("GET");
      // Unmatched subpaths fall through to the server-wide 404.
      const deep = await handler(get("/v1/gaps/some-id/rows/extra"));
      expect(deep.status).toBe(404);
      const foreign = await handler(get("/v1/gapsX"));
      expect(foreign.status).toBe(404);
      // Health traffic is unaffected by the gaps block.
      const health = await handler(get("/healthz"));
      expect(health.status).toBe(200);
    });
  });
});

describe("gap HTTP surface: lazy default wiring (end-to-end)", () => {
  test("the default wiring analyzes over the env data dir: a REAL reality project + REAL evidence + the REAL readiness authority, all through their own default wirings", async () => {
    await withTempDir(async (root) => {
      const envWithDir: EnvRecord = { ...validEnv, AISE_DATA_DIR: join(root, "data") };
      // NO injected gaps wiring: the surface under test is the LAZY DEFAULT,
      // which resolves its three read-only reference resolvers over the
      // handler's OWN env data dir — the REAL FsRealityStore and the REAL
      // FsEvidenceStore of THIS handler (never a memoized sibling wiring,
      // so handler/test ordering can never point it at another data dir),
      // and the REAL shipped assurance profile + evaluateReadiness.
      const handler = createRequestHandler({
        envSource: () => envWithDir,
        version: pkg.version,
        logger: quietLogger,
        capture: createCaptureGateway({ store: new InMemoryCaptureStore(), clock: fixedClock }),
      });

      // 1. The REALITY authority through the DEFAULT reality wiring:
      //    v001 empty → v002 the four canonical nodes + chimney → v003 the
      //    chimney tombstone.
      const created = await handler(
        postJson("/v1/reality/projects", JSON.stringify({ projectId: PROJECT_ID })),
      );
      expect(created.status).toBe(200);
      const upserts = [...buildRealityNodes(), buildChimneyNode()].map((node) => ({
        op: "upsert-node",
        node,
      }));
      const nodesApplied = await handler(
        postJson(`/v1/reality/projects/${PROJECT_ID}/changes`, JSON.stringify({ changes: upserts })),
      );
      expect(nodesApplied.status).toBe(200);
      const tombstoneApplied = await handler(
        postJson(
          `/v1/reality/projects/${PROJECT_ID}/changes`,
          JSON.stringify({
            changes: [{ op: "delete", nodeId: "chimney", reason: CHIMNEY_TOMBSTONE_REASON }],
          }),
        ),
      );
      expect(tombstoneApplied.status).toBe(200);
      const versionPath = join(
        root,
        "data",
        "reality",
        sha256Hex(PROJECT_ID),
        "versions",
        "v003.json",
      );
      const versionBytesBefore = readFileSync(versionPath, "utf8");

      // 2. The EVIDENCE authority through the DEFAULT evidence wiring (the
      //    default gaps resolver reads THIS store), each fact with its
      //    canonical method, plus the canonical invalidation.
      for (const fact of buildEvidenceFacts()) {
        const evidence = await handler(
          postJson(
            "/v1/evidence",
            JSON.stringify({
              contractVersion: "1.0.0",
              contentId: fact.evidenceId,
              byteSize: 2048,
              mediaType: "image/jpeg",
              capturedAt: FIXED_NOW,
              acquisitionMethod: fact.method,
              acquisitionMetadata: { "mission.id": "mission-gaps-000042" },
            }),
          ),
        );
        expect(evidence.status).toBe(200);
      }
      const invalidation = await handler(
        postJson(
          `/v1/evidence/${EV_INVALIDATED_LI}/invalidation`,
          JSON.stringify({ reason: "withdrawn during quality review (fixture canonical invalidation)" }),
        ),
      );
      expect(invalidation.status).toBe(200);
      const evidenceBytesBefore = readFileSync(
        join(root, "data", "evidence", "records", `${sha256Hex(EV_DEPTH_A)}.json`),
        "utf8",
      );

      // 3. THE GAP ANALYSIS through the DEFAULT gaps wiring: the pinned
      // reality version resolves read-only over the env data dir; the
      // evidence graph state resolves over the same dir; the readiness
      // authority's own evaluator computes the consumed report.
      const input = buildCanonicalInput();
      const response = await handler(
        postJson(
          "/v1/gaps",
          JSON.stringify({
            analysisId: input.analysisId,
            taskRef: { ...input.taskRef, versionId: "v003" },
            annotations: input.annotations,
            uncertaintyAnnotations: input.uncertaintyAnnotations,
          }),
        ),
      );
      expect(response.status).toBe(200);
      const body = (await response.json()) as {
        ok: boolean;
        analysis: {
          analysisId: string;
          stats: {
            totalGaps: number;
            totalCandidates: number;
            occludedStateGaps: number;
            unknownStateGaps: number;
          };
          readinessReport: { readiness: string; taskKind: string };
          candidates: { actionKind: string; subjectNodeId: string | null }[];
          gaps: { gapClass: string; subjectNodeId: string | null; state: string }[];
        };
      };
      expect(body.ok).toBe(true);
      expect(body.analysis.analysisId).toBe(ANALYSIS_ID);
      expect(body.analysis.stats.totalGaps).toBe(10);
      expect(body.analysis.stats.totalCandidates).toBe(10);
      expect(body.analysis.stats.occludedStateGaps).toBe(1);
      expect(body.analysis.stats.unknownStateGaps).toBe(1);
      expect(body.analysis.readinessReport.readiness).toBe("NOT_READY");
      expect(body.analysis.readinessReport.taskKind).toBe("dimensional_survey");
      const occluded = body.analysis.gaps.find((gap) => gap.state === "OCCLUDED");
      expect(occluded?.subjectNodeId).toBe("skylight");
      expect(
        existsSync(join(root, "data", "gaps", `${sha256Hex(ANALYSIS_ID)}.json`)),
      ).toBe(true);

      // 4. THE AUTHORITIES ARE NEVER ALTERED over HTTP: the reality and
      //    evidence authority files are byte-identical after the analysis.
      expect(readFileSync(versionPath, "utf8")).toBe(versionBytesBefore);
      expect(
        readFileSync(join(root, "data", "evidence", "records", `${sha256Hex(EV_DEPTH_A)}.json`), "utf8"),
      ).toBe(evidenceBytesBefore);

      // 5. Read-back through the default wiring.
      const readBack = await handler(get(`/v1/gaps/${ANALYSIS_ID}`));
      expect(readBack.status).toBe(200);
      const list = await handler(get("/v1/gaps"));
      const listBody = (await list.json()) as { analyses: { analysisId: string }[] };
      expect(listBody.analyses.map((summary) => summary.analysisId)).toEqual([ANALYSIS_ID]);

      // 6. The refusal paths through the default wiring too.
      const unknownVersion = await handler(
        postJson(
          "/v1/gaps",
          JSON.stringify({
            ...input,
            analysisId: "gap-analysis-default-refused",
            taskRef: { projectId: "project-other", versionId: "v001", profileId: PROFILE_ID },
          }),
        ),
      );
      expect(unknownVersion.status).toBe(422);
      expect((await errorBody(unknownVersion)).error).toBe("unknown_reality_version");
      const unknownProfile = await handler(
        postJson(
          "/v1/gaps",
          JSON.stringify({
            ...input,
            analysisId: "gap-analysis-default-refused-2",
            taskRef: { projectId: PROJECT_ID, versionId: "v003", profileId: "assurance-profile/none/v9" },
          }),
        ),
      );
      expect(unknownProfile.status).toBe(422);
      expect((await errorBody(unknownProfile)).error).toBe("unknown_profile");
      // Non-gaps traffic stays a plain 404.
      const foreign = await handler(get("/v1/gaps/nope/extra/deep"));
      expect(foreign.status).toBe(404);
    });
  });

  test("two handlers over different data dirs never share the default gaps wiring (FIX-001 module-memo leak regression)", async () => {
    await withTempDir(async (rootA) => {
      // Handler A: default gaps wiring over root A — the first /v1/gaps
      // request resolves it and, on the broken build, PINS the module-level
      // memo for the whole process.
      const envWithDirA: EnvRecord = { ...validEnv, AISE_DATA_DIR: join(rootA, "data") };
      const handlerA = createRequestHandler({
        envSource: () => envWithDirA,
        version: pkg.version,
        logger: quietLogger,
        capture: createCaptureGateway({ store: new InMemoryCaptureStore(), clock: fixedClock }),
      });
      const createdA = await handlerA(
        postJson("/v1/reality/projects", JSON.stringify({ projectId: PROJECT_ID })),
      );
      expect(createdA.status).toBe(200);
      const upsertsA = [...buildRealityNodes(), buildChimneyNode()].map((node) => ({
        op: "upsert-node",
        node,
      }));
      const nodesAppliedA = await handlerA(
        postJson(
          `/v1/reality/projects/${PROJECT_ID}/changes`,
          JSON.stringify({ changes: upsertsA }),
        ),
      );
      expect(nodesAppliedA.status).toBe(200);
      const tombstoneAppliedA = await handlerA(
        postJson(
          `/v1/reality/projects/${PROJECT_ID}/changes`,
          JSON.stringify({
            changes: [{ op: "delete", nodeId: "chimney", reason: CHIMNEY_TOMBSTONE_REASON }],
          }),
        ),
      );
      expect(tombstoneAppliedA.status).toBe(200);
      for (const fact of buildEvidenceFacts()) {
        const evidence = await handlerA(
          postJson(
            "/v1/evidence",
            JSON.stringify({
              contractVersion: "1.0.0",
              contentId: fact.evidenceId,
              byteSize: 2048,
              mediaType: "image/jpeg",
              capturedAt: FIXED_NOW,
              acquisitionMethod: fact.method,
              acquisitionMetadata: { "mission.id": "mission-gaps-000042" },
            }),
          ),
        );
        expect(evidence.status).toBe(200);
      }
      const invalidationA = await handlerA(
        postJson(
          `/v1/evidence/${EV_INVALIDATED_LI}/invalidation`,
          JSON.stringify({ reason: "withdrawn during quality review (fixture canonical invalidation)" }),
        ),
      );
      expect(invalidationA.status).toBe(200);
      const inputA = buildCanonicalInput();
      const responseA = await handlerA(
        postJson(
          "/v1/gaps",
          JSON.stringify({
            analysisId: inputA.analysisId,
            taskRef: { ...inputA.taskRef, versionId: "v003" },
            annotations: inputA.annotations,
            uncertaintyAnnotations: inputA.uncertaintyAnnotations,
          }),
        ),
      );
      expect(responseA.status).toBe(200);

      await withTempDir(async (rootB) => {
        // Handler B: a SECOND handler over a DIFFERENT data dir, same default
        // wiring discipline. On the broken build the default wiring is A's
        // pinned module-level memo over root A, where project
        // `${PROJECT_ID}-b` does not exist → the analysis fails (non-200).
        // On the fixed build B analyzes over ITS OWN root B → 200.
        const envWithDirB: EnvRecord = { ...validEnv, AISE_DATA_DIR: join(rootB, "data") };
        const handlerB = createRequestHandler({
          envSource: () => envWithDirB,
          version: pkg.version,
          logger: quietLogger,
          capture: createCaptureGateway({ store: new InMemoryCaptureStore(), clock: fixedClock }),
        });
        const projectB = `${PROJECT_ID}-b`;
        const createdB = await handlerB(
          postJson("/v1/reality/projects", JSON.stringify({ projectId: projectB })),
        );
        expect(createdB.status).toBe(200);
        const upsertsB = [...buildRealityNodes(), buildChimneyNode()].map((node) => ({
          op: "upsert-node",
          node,
        }));
        const nodesAppliedB = await handlerB(
          postJson(
            `/v1/reality/projects/${projectB}/changes`,
            JSON.stringify({ changes: upsertsB }),
          ),
        );
        expect(nodesAppliedB.status).toBe(200);
        const tombstoneAppliedB = await handlerB(
          postJson(
            `/v1/reality/projects/${projectB}/changes`,
            JSON.stringify({
              changes: [{ op: "delete", nodeId: "chimney", reason: CHIMNEY_TOMBSTONE_REASON }],
            }),
          ),
        );
        expect(tombstoneAppliedB.status).toBe(200);
        for (const fact of buildEvidenceFacts()) {
          const evidence = await handlerB(
            postJson(
              "/v1/evidence",
              JSON.stringify({
                contractVersion: "1.0.0",
                contentId: fact.evidenceId,
                byteSize: 2048,
                mediaType: "image/jpeg",
                capturedAt: FIXED_NOW,
                acquisitionMethod: fact.method,
                acquisitionMetadata: { "mission.id": "mission-gaps-000042" },
              }),
            ),
          );
          expect(evidence.status).toBe(200);
        }
        const invalidationB = await handlerB(
          postJson(
            `/v1/evidence/${EV_INVALIDATED_LI}/invalidation`,
            JSON.stringify({ reason: "withdrawn during quality review (fixture canonical invalidation)" }),
          ),
        );
        expect(invalidationB.status).toBe(200);
        const inputB = buildCanonicalInput();
        const responseB = await handlerB(
          postJson(
            "/v1/gaps",
            JSON.stringify({
              analysisId: `${ANALYSIS_ID}-b`,
              taskRef: { ...inputB.taskRef, projectId: projectB, versionId: "v003" },
              annotations: inputB.annotations,
              uncertaintyAnnotations: inputB.uncertaintyAnnotations,
            }),
          ),
        );
        expect(responseB.status).toBe(200);
        const bodyA = (await responseA.json()) as { ok: boolean };
        expect(bodyA.ok).toBe(true);
        const bodyB = (await responseB.json()) as { ok: boolean };
        expect(bodyB.ok).toBe(true);
        // B wrote to ITS OWN data dir — never to A's.
        expect(
          existsSync(join(rootB, "data", "gaps", `${sha256Hex(`${ANALYSIS_ID}-b`)}.json`)),
        ).toBe(true);
      });
    });
  });

  test("an injected gaps wiring wins over the default (explicit construction)", async () => {
    await withTempDir(async (root) => {
      const envWithDir: EnvRecord = { ...validEnv, AISE_DATA_DIR: join(root, "elsewhere") };
      const handler = createRequestHandler({
        envSource: () => envWithDir,
        version: pkg.version,
        logger: quietLogger,
        capture: createCaptureGateway({ store: new InMemoryCaptureStore(), clock: fixedClock }),
        gaps: {
          service: new GapAnalysisService({
            store: new FsGapAnalysisStore(join(root, "injected")),
            clock: fixedClock,
            assuranceProfileResolver: makeAssuranceProfileResolver([
              getAssuranceProfile(PROFILE_ID) as NonNullable<ReturnType<typeof getAssuranceProfile>>,
            ]),
            readinessEvaluator: evaluateReadiness,
            realityVersionResolver: makeRealityVersionResolver(PROJECT_ID, [
              buildRealityVersion(),
            ]),
            evidenceGraphResolver: makeEvidenceGraphResolver(buildEvidenceFacts()),
          }),
          logger: quietLogger,
        },
      });
      const response = await handler(postJson("/v1/gaps", gapAnalysisBody()));
      expect(response.status).toBe(200);
      // The record landed under the INJECTED store's root, not the env dir.
      expect(
        existsSync(join(root, "injected", "gaps", `${sha256Hex(ANALYSIS_ID)}.json`)),
      ).toBe(true);
      expect(existsSync(join(root, "elsewhere", "gaps"))).toBe(false);
    });
  });
});
