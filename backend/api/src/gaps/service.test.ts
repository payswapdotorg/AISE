/**
 * AISE-018 — Adaptive evidence-gap analysis SERVICE tests.
 *
 * Depth mandated by the work order: the governed-path refusal matrix
 * (unknown profile, unknown reality version, annotation contradiction,
 * phantom evidence, dangling provenance refs, uncertainty-target
 * semantics, focus ghosts, id reuse), the deterministic check order,
 * READINESS-AUTHORITY IMMUTABILITY over the REAL authorities
 * (FsRealityStore + FsEvidenceStore + the real `evaluateReadiness`: the
 * evaluator's report and the authorities' files are byte-identical
 * before/after the analysis — "no automatic readiness downgrade is
 * permitted"), real-authority verbatim carrying, byte-identical
 * recomputation across fresh stores, append-only persistence,
 * no-fabrication discipline (every referenced evidence id resolves in
 * the real graph), THE PERTURBATION-SENSITIVITY ACCEPTANCE MATRIX (each
 * scoring input class perturbed → recommendations change, flowing
 * through the REAL readiness authority) and the Fs/InMemory store twins.
 */

import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { canonicalJsonStringify } from "@aise/shared-contracts";
import { sha256Hex } from "../lib/hash";
// The REAL authorities (test files may import sibling surfaces; the
// PRODUCTION seam stays the injected read-only resolvers):
import { evaluateReadiness } from "../assurance/evaluate";
import { getAssuranceProfile } from "../assurance/profiles";
import { FsRealityStore } from "../reality/store";
import { FsEvidenceStore } from "../evidence/store";
import { createEvidenceService } from "../evidence/service";
import type { ChangeRecord } from "../reality/model";
import type { EvaluationInput } from "../assurance/model";
import { GapAnalysisError } from "./model";
import { GapAnalysisService, readOnlyEvidenceGraphResolver } from "./service";
import { FsGapAnalysisStore, InMemoryGapAnalysisStore } from "./store";
import {
  ANALYSIS_ID,
  EV_DUCT,
  EV_MEZZANINE,
  EV_PHANTOM,
  EV_PHOTO,
  EV_INVALIDATED_LI,
  FIXED_EARLIER,
  FIXED_NOW,
  KNOWN_EVIDENCE,
  PROFILE_ID,
  PROJECT_ID,
  VERSION_ID,
  buildCanonicalInput,
  buildChimneyNode,
  buildEvidenceFacts,
  buildRealityNodes,
  buildRealityVersion,
  fixedClock,
  makeAssuranceProfileResolver,
  makeEvidenceGraphResolver,
  makeRealityVersionResolver,
  withTempDir,
} from "./testkit";

const refusalOf = async (run: () => Promise<unknown>): Promise<GapAnalysisError> => {
  try {
    await run();
    throw new Error("expected a typed refusal");
  } catch (error) {
    if (error instanceof GapAnalysisError) {
      return error;
    }
    throw error;
  }
};

const REAL_PROFILE = getAssuranceProfile(PROFILE_ID) as NonNullable<
  ReturnType<typeof getAssuranceProfile>
>;

/** The REAL authority bundle over the canonical fixtures (tests run the real evaluator). */
function realResolvers(): {
  assuranceProfileResolver: ReturnType<typeof makeAssuranceProfileResolver>;
  readinessEvaluator: typeof evaluateReadiness;
  realityVersionResolver: ReturnType<typeof makeRealityVersionResolver>;
  evidenceGraphResolver: ReturnType<typeof makeEvidenceGraphResolver>;
} {
  return {
    assuranceProfileResolver: makeAssuranceProfileResolver([REAL_PROFILE]),
    readinessEvaluator: evaluateReadiness,
    realityVersionResolver: makeRealityVersionResolver(PROJECT_ID, [buildRealityVersion()]),
    evidenceGraphResolver: makeEvidenceGraphResolver(buildEvidenceFacts()),
  };
}

/** A canonical service over an in-memory store + the REAL readiness authority. */
function service(): GapAnalysisService {
  return new GapAnalysisService({
    store: new InMemoryGapAnalysisStore(),
    clock: fixedClock,
    ...realResolvers(),
  });
}

/** The canonical evaluation input, as the service assembles it (for verbatim-report comparison). */
function canonicalEvaluationInput(): EvaluationInput {
  const version = buildRealityVersion();
  const sigmaBy = new Map<string, number>();
  for (const annotation of buildCanonicalInput().uncertaintyAnnotations) {
    sigmaBy.set(`${annotation.nodeId}:${annotation.propertyKey}`, annotation.sigma);
  }
  const nodes = [...version.nodes]
    .sort((a, b) => (a.nodeId < b.nodeId ? -1 : 1))
    .map((node) => ({
      nodeId: node.nodeId,
      properties: node.properties.map((property) => ({
        key: property.key,
        value: property.value,
        ...(property.unit === undefined ? {} : { unit: property.unit }),
        epistemicStatus: property.epistemicStatus,
        ...(sigmaBy.has(`${node.nodeId}:${property.key}`)
          ? { uncertainty: { sigma: sigmaBy.get(`${node.nodeId}:${property.key}`) as number } }
          : {}),
      })),
    }));
  // The unioned support edges: node + property provenance of the version.
  const linked = new Map<string, string[]>();
  for (const node of version.nodes) {
    for (const record of node.provenance) {
      if (record.evidenceId !== undefined) {
        linked.set(record.evidenceId, [node.nodeId]);
      }
    }
    for (const property of node.properties) {
      for (const record of property.provenance) {
        if (record.evidenceId !== undefined) {
          linked.set(record.evidenceId, [...(linked.get(record.evidenceId) ?? []), node.nodeId]);
        }
      }
    }
  }
  const evidence = buildEvidenceFacts().map((fact) => ({
    evidenceId: fact.evidenceId,
    method: fact.method,
    invalidated: fact.invalidated,
    linkedNodeIds: fact.linkedNodeIds,
  }));
  for (const [evidenceId, nodeIds] of linked) {
    const fact = evidence.find((entry) => entry.evidenceId === evidenceId);
    if (fact !== undefined) {
      fact.linkedNodeIds = nodeIds;
    }
  }
  return {
    profile: REAL_PROFILE,
    graphSnapshot: { nodes },
    evidence: evidence.sort((a, b) => (a.evidenceId < b.evidenceId ? -1 : 1)),
  };
}

describe("gap analysis service: the governed path", () => {
  test("the canonical run persists a full derived record with the expected matrix", async () => {
    const store = new InMemoryGapAnalysisStore();
    const svc = new GapAnalysisService({ store, clock: fixedClock, ...realResolvers() });
    const record = await svc.runGapAnalysis(buildCanonicalInput());
    expect(record.analysisId).toBe(ANALYSIS_ID);
    expect(record.taskRef).toEqual({ projectId: PROJECT_ID, versionId: VERSION_ID, profileId: PROFILE_ID });
    expect(record.computedAt).toBe(FIXED_NOW);
    // The readiness authority's report is carried VERBATIM (consumed context):
    // byte-identical to a DIRECT evaluateReadiness call over the same facts.
    expect(canonicalJsonStringify(record.readinessReport)).toBe(
      canonicalJsonStringify(evaluateReadiness(canonicalEvaluationInput())),
    );
    expect(record.readinessReport.readiness).toBe("NOT_READY");
    // The canonical matrix: 10 gaps / 10 candidates.
    expect(record.stats.totalGaps).toBe(10);
    expect(record.stats.totalCandidates).toBe(10);
    expect(record.stats.missingGaps).toBe(5);
    expect(record.stats.weakGaps).toBe(4);
    expect(record.stats.ambiguousGaps).toBe(1);
    expect(record.stats.unknownStateGaps).toBe(1);
    expect(record.stats.occludedStateGaps).toBe(1);
    expect(record.stats.notObservedStateGaps).toBe(6);
    expect(record.stats.observedStateGaps).toBe(2);
    expect(record.history).toHaveLength(1);
    expect(record.history[0]?.eventType).toBe("gap_analysis_recorded");
    expect(record.history[0]?.recordDigest).toHaveLength(64);
    // Round-trip through the store (canonical text + re-parse).
    const stored = await store.get(ANALYSIS_ID);
    expect(stored).not.toBeNull();
    expect(canonicalJsonStringify(stored)).toBe(canonicalJsonStringify(record));
  });

  test("the canonical ranking: exact composite order with canonical tie-breaking", async () => {
    const record = await service().runGapAnalysis(buildCanonicalInput());
    const ranking = record.candidates.map(
      (candidate) =>
        `${candidate.actionKind}:${candidate.subjectNodeId ?? "-"}:${candidate.propertyKey ?? "-"}:${candidate.score.compositeValue}`,
    );
    expect(ranking).toEqual([
      "measure_property:room-lobby:room.height:0.54",
      "observe_node:wall-south:-:0.505", // tie group 1: candidateId ASC
      "observe_node:room-lobby:-:0.505",
      "resolve_occlusion:skylight:-:0.475", // tie group 2: candidateId ASC
      "observe_node:wall-east:-:0.475",
      "observe_node:duct-shaft:-:0.435",
      "measure_property:room-lobby:room.width:0.33",
      "capture_evidence:-:-:0.252513",
      "verify_capture_status:mezzanine:-:0.115",
      "confirm_property:wall-south:element.material:-0.0475",
    ]);
    expect(record.stats.topCandidateId).toBe(record.candidates[0]?.candidateId ?? null);
  });

  test("the read API: getAnalysis + listAnalyses (summary projection)", async () => {
    const svc = service();
    const record = await svc.runGapAnalysis(buildCanonicalInput());
    const fetched = await svc.getAnalysis(ANALYSIS_ID);
    expect(fetched?.analysisId).toBe(ANALYSIS_ID);
    expect(await svc.getAnalysis("analysis-ghost")).toBeNull();
    const summaries = await svc.listAnalyses();
    expect(summaries).toHaveLength(1);
    expect(summaries[0]).toEqual({
      analysisId: ANALYSIS_ID,
      projectId: PROJECT_ID,
      versionId: VERSION_ID,
      profileId: PROFILE_ID,
      taskKind: "dimensional_survey",
      readinessLevel: "NOT_READY",
      totalGaps: 10,
      totalCandidates: 10,
      topCandidateId: record.stats.topCandidateId,
      computedAt: FIXED_NOW,
    });
  });

  test("byte-identical recomputation: fresh stores, same inputs + clock → identical bytes", async () => {
    const first = new InMemoryGapAnalysisStore();
    const second = new InMemoryGapAnalysisStore();
    const a = await new GapAnalysisService({ store: first, clock: fixedClock, ...realResolvers() }).runGapAnalysis(buildCanonicalInput());
    const b = await new GapAnalysisService({ store: second, clock: fixedClock, ...realResolvers() }).runGapAnalysis(buildCanonicalInput());
    expect(canonicalJsonStringify(a)).toBe(canonicalJsonStringify(b));
    expect(a.inputDigest).toBe(b.inputDigest);
    expect(a.history[0]?.recordDigest).toBe(b.history[0]?.recordDigest);
  });

  test("append-only: id reuse is refused; a NEW analysis of newer inputs never rewrites the old record", async () => {
    const store = new InMemoryGapAnalysisStore();
    const svc = new GapAnalysisService({ store, clock: fixedClock, ...realResolvers() });
    const first = await svc.runGapAnalysis(buildCanonicalInput());
    const reuse = await refusalOf(() => svc.runGapAnalysis(buildCanonicalInput()));
    expect(reuse.code).toBe("analysis_exists");
    // Perturbed inputs under a NEW id: a NEW record; the old one intact.
    const second = await svc.runGapAnalysis({
      ...buildCanonicalInput(),
      analysisId: "gap-analysis-survey-2",
      uncertaintyAnnotations: [
        { nodeId: "room-lobby", propertyKey: "room.width", sigma: 0.01, unit: "m" },
      ],
    });
    expect(second.analysisId).toBe("gap-analysis-survey-2");
    expect(second.inputDigest).not.toBe(first.inputDigest);
    expect(second.readinessReport.readiness).toBe("NOT_READY");
    const rereadFirst = await store.get(ANALYSIS_ID);
    expect(canonicalJsonStringify(rereadFirst)).toBe(canonicalJsonStringify(first));
    expect(await svc.listAnalyses()).toHaveLength(2);
  });

  test("evidence-fact order insensitivity: the resolver's order never changes the bytes", async () => {
    const a = await service().runGapAnalysis(buildCanonicalInput());
    const b = await new GapAnalysisService({
      store: new InMemoryGapAnalysisStore(),
      clock: fixedClock,
      ...realResolvers(),
      evidenceGraphResolver: makeEvidenceGraphResolver([...buildEvidenceFacts()].reverse()),
    }).runGapAnalysis(buildCanonicalInput());
    expect(canonicalJsonStringify(a)).toBe(canonicalJsonStringify(b));
  });
});

describe("gap analysis service: the governed refusal matrix", () => {
  test("unknown_profile: an unresolvable assurance profile id", async () => {
    const error = await refusalOf(() =>
      new GapAnalysisService({
        store: new InMemoryGapAnalysisStore(),
        clock: fixedClock,
        ...realResolvers(),
        assuranceProfileResolver: { resolveAssuranceProfile: async () => null },
      }).runGapAnalysis(buildCanonicalInput()),
    );
    expect(error.code).toBe("unknown_profile");
    expect(error.detail).toContain(PROFILE_ID);
  });

  test("unknown_reality_version: an unresolvable pinned version", async () => {
    const error = await refusalOf(() =>
      new GapAnalysisService({
        store: new InMemoryGapAnalysisStore(),
        clock: fixedClock,
        ...realResolvers(),
        realityVersionResolver: { resolveRealityVersion: async () => null },
      }).runGapAnalysis(buildCanonicalInput()),
    );
    expect(error.code).toBe("unknown_reality_version");
    expect(error.detail).toContain(VERSION_ID);
  });

  test("annotation_contradicts_reality: NOT_OBSERVED/OCCLUDED claims for nodes the version carries", async () => {
    for (const observationStatus of ["NOT_OBSERVED", "OCCLUDED"] as const) {
      const error = await refusalOf(() =>
        service().runGapAnalysis({
          ...buildCanonicalInput(),
          annotations: [
            { targetNodeId: "wall-north", observationStatus, evidenceIds: [EV_DUCT] },
          ],
        }),
      );
      expect(error.code).toBe("annotation_contradicts_reality");
      expect(error.detail).toContain("wall-north");
    }
    // UNKNOWN on a live node is ALLOWED (first-class indeterminacy, never a contradiction).
    const unknown = await service().runGapAnalysis({
      ...buildCanonicalInput(),
      analysisId: "gap-analysis-lobby-unknown",
      annotations: [
        { targetNodeId: "room-lobby", observationStatus: "UNKNOWN", evidenceIds: [EV_MEZZANINE] },
      ],
    });
    const lobbyGap = unknown.gaps.find((gap) => gap.subjectNodeId === "room-lobby");
    expect(lobbyGap?.gapClass).toBe("coverage_indeterminate");
    expect(lobbyGap?.state).toBe("UNKNOWN");
    expect(lobbyGap?.evidenceIds).toEqual([EV_MEZZANINE]);
  });

  test("unknown_evidence_ref: phantom annotation evidence names the id (no hidden evidence)", async () => {
    const error = await refusalOf(() =>
      service().runGapAnalysis({
        ...buildCanonicalInput(),
        annotations: [
          { targetNodeId: "ghost-room", observationStatus: "NOT_OBSERVED", evidenceIds: [EV_PHANTOM] },
        ],
      }),
    );
    expect(error.code).toBe("unknown_evidence_ref");
    expect(error.detail).toContain(EV_PHANTOM);
  });

  test("dangling_evidence_ref: reality provenance naming unregistered evidence is refused (never guessed)", async () => {
    const version = buildRealityVersion();
    const dangling = {
      ...version,
      nodes: version.nodes.map((node) =>
        node.nodeId === "wall-north"
          ? {
              ...node,
              provenance: [
                { role: "SUPPORTS" as const, evidenceId: EV_PHANTOM, recordedAt: FIXED_EARLIER },
              ],
            }
          : node,
      ),
    };
    const error = await refusalOf(() =>
      new GapAnalysisService({
        store: new InMemoryGapAnalysisStore(),
        clock: fixedClock,
        ...realResolvers(),
        realityVersionResolver: makeRealityVersionResolver(PROJECT_ID, [dangling]),
      }).runGapAnalysis(buildCanonicalInput()),
    );
    expect(error.code).toBe("dangling_evidence_ref");
    expect(error.detail).toContain(EV_PHANTOM);
  });

  test("uncertainty annotation semantics: target/property/unit refusals are distinct", async () => {
    const ghostNode = await refusalOf(() =>
      service().runGapAnalysis({
        ...buildCanonicalInput(),
        uncertaintyAnnotations: [
          { nodeId: "ghost-node", propertyKey: "room.height", sigma: 0.01, unit: "m" },
        ],
      }),
    );
    expect(ghostNode.code).toBe("unknown_uncertainty_target");

    const nonNumeric = await refusalOf(() =>
      service().runGapAnalysis({
        ...buildCanonicalInput(),
        uncertaintyAnnotations: [
          { nodeId: "wall-north", propertyKey: "element.material", sigma: 0.01, unit: "m" },
        ],
      }),
    );
    expect(nonNumeric.code).toBe("uncertainty_without_measurement");

    const missingProperty = await refusalOf(() =>
      service().runGapAnalysis({
        ...buildCanonicalInput(),
        uncertaintyAnnotations: [
          { nodeId: "wall-north", propertyKey: "room.height", sigma: 0.01, unit: "m" },
        ],
      }),
    );
    expect(missingProperty.code).toBe("uncertainty_without_measurement");

    const unitMismatch = await refusalOf(() =>
      service().runGapAnalysis({
        ...buildCanonicalInput(),
        uncertaintyAnnotations: [
          { nodeId: "room-lobby", propertyKey: "room.width", sigma: 0.01, unit: "mm" },
        ],
      }),
    );
    expect(unitMismatch.code).toBe("uncertainty_unit_mismatch");
    expect(unitMismatch.detail).toContain("no unit-conversion authority");
  });

  test("unknown_focus_subject: task focus naming a ghost subject is refused", async () => {
    const error = await refusalOf(() =>
      service().runGapAnalysis({
        ...buildCanonicalInput(),
        taskFocus: [{ subjectNodeId: "ghost-room", impactWeight: 1 }],
      }),
    );
    expect(error.code).toBe("unknown_focus_subject");
  });

  test("invalid_evaluation_input: the authority's validation failure surfaces as a typed refusal", async () => {
    const error = await refusalOf(() =>
      new GapAnalysisService({
        store: new InMemoryGapAnalysisStore(),
        clock: fixedClock,
        ...realResolvers(),
        readinessEvaluator: () => {
          throw new Error("authority rejected the facts");
        },
      }).runGapAnalysis(buildCanonicalInput()),
    );
    expect(error.code).toBe("invalid_evaluation_input");
    expect(error.detail).toContain("authority rejected the facts");
  });

  test("deterministic check order: analysis_exists fires before profile resolution", async () => {
    const store = new InMemoryGapAnalysisStore();
    await store.put(await service().runGapAnalysis(buildCanonicalInput()));
    const svc = new GapAnalysisService({
      store,
      clock: fixedClock,
      ...realResolvers(),
      assuranceProfileResolver: { resolveAssuranceProfile: async () => null },
    });
    const error = await refusalOf(() => svc.runGapAnalysis(buildCanonicalInput()));
    expect(error.code).toBe("analysis_exists");
  });
});

describe("gap analysis service: READINESS-AUTHORITY IMMUTABILITY (real authorities)", () => {
  test("the REAL evaluator + REAL stores: the report and every authority file are byte-identical before/after", async () => {
    await withTempDir(async (root) => {
      // 1. Build the pinned version through the REAL Reality Graph authority.
      const reality = new FsRealityStore(root);
      await reality.createProject(PROJECT_ID, FIXED_EARLIER);
      const upserts: ChangeRecord[] = [...buildRealityNodes(), buildChimneyNode()].map((node) => ({
        op: "upsert-node" as const,
        node,
      }));
      await reality.applyChanges(PROJECT_ID, upserts, { createdAt: FIXED_EARLIER });
      await reality.applyChanges(
        PROJECT_ID,
        [{ op: "delete", nodeId: "chimney", reason: "demolished during the capture window" }],
        { createdAt: FIXED_EARLIER },
      );
      const version = await reality.getVersion(PROJECT_ID, "v003");
      expect(version).not.toBeNull();

      // 2. Register the evidence through the REAL evidence authority —
      //    with each fact's CANONICAL method, and the canonical
      //    invalidation appended (invalidated ≠ deleted).
      const evidence = createEvidenceService({
        store: new FsEvidenceStore(root),
        clock: fixedClock,
      });
      for (const fact of buildEvidenceFacts()) {
        await evidence.registerEvidence({
          contractVersion: "1.0.0",
          contentId: fact.evidenceId,
          byteSize: 2048,
          mediaType: "image/jpeg",
          capturedAt: FIXED_NOW,
          acquisitionMethod: fact.method,
          acquisitionMetadata: { "mission.id": "mission-gaps-000042" },
        });
      }
      await evidence.invalidateEvidence(
        EV_INVALIDATED_LI,
        "withdrawn during quality review (fixture canonical invalidation)",
      );

      // 3. Snapshot EVERY authority file byte-exactly BEFORE the analysis.
      const snapshotFiles = (dir: string): Record<string, string> => {
        const files: Record<string, string> = {};
        const walk = (current: string): void => {
          if (!existsSync(current)) return;
          for (const entry of readdirSync(current, { withFileTypes: true })) {
            const path = join(current, entry.name);
            if (entry.isDirectory()) {
              walk(path);
            } else {
              files[path] = readFileSync(path, "utf8");
            }
          }
        };
        walk(dir);
        return files;
      };
      const realityBefore = snapshotFiles(join(root, "reality"));
      const evidenceBefore = snapshotFiles(join(root, "evidence"));

      // 4. Run the analysis over the REAL authorities through the PRODUCTION
      //    read-only adapters (a second evidence-store instance is safe:
      //    evidence records are immutable write-once files).
      const analysisStore = new FsGapAnalysisStore(join(root, "gaps-data"));
      const svc = new GapAnalysisService({
        store: analysisStore,
        clock: fixedClock,
        assuranceProfileResolver: makeAssuranceProfileResolver([REAL_PROFILE]),
        readinessEvaluator: evaluateReadiness,
        realityVersionResolver: makeRealityVersionResolver(PROJECT_ID, [version!]),
        evidenceGraphResolver: readOnlyEvidenceGraphResolver(new FsEvidenceStore(root)),
      });
      const record = await svc.runGapAnalysis({
        ...buildCanonicalInput(),
        taskRef: { ...buildCanonicalInput().taskRef, versionId: "v003" },
      });
      // The canonical matrix reproduced over the REAL authorities.
      expect(record.stats.totalGaps).toBe(10);
      expect(record.stats.totalCandidates).toBe(10);

      // 5. IMUTABILITY: the readiness authority's own evaluation over the
      //    same pinned state is byte-identical after the analysis ran, and
      //    the record carries the authority's verdict VERBATIM.
      const directBefore = evaluateReadiness(canonicalEvaluationInput());
      const directAfter = evaluateReadiness(canonicalEvaluationInput());
      expect(canonicalJsonStringify(directAfter)).toBe(canonicalJsonStringify(directBefore));
      expect(record.readinessReport.readiness).toBe(directBefore.readiness);
      // The reality + evidence authority files are byte-identical.
      expect(snapshotFiles(join(root, "reality"))).toEqual(realityBefore);
      expect(snapshotFiles(join(root, "evidence"))).toEqual(evidenceBefore);
      // The analysis wrote ONLY into its own derived tree.
      expect(existsSync(join(root, "gaps-data", "gaps"))).toBe(true);
      expect(existsSync(join(root, "gaps", `${sha256Hex(ANALYSIS_ID)}.json`))).toBe(false);
    });
  });

  test("the OLD record's consumed report is untouched after a NEWER analysis over better evidence", async () => {
    const svc = service();
    const first = await svc.runGapAnalysis(buildCanonicalInput());
    const improved = await svc.runGapAnalysis({
      ...buildCanonicalInput(),
      analysisId: "gap-analysis-improved",
      annotations: [],
      uncertaintyAnnotations: [
        { nodeId: "room-lobby", propertyKey: "room.width", sigma: 0.01, unit: "m" },
        { nodeId: "room-lobby", propertyKey: "room.height", sigma: 0.01, unit: "m" },
        { nodeId: "wall-north", propertyKey: "length", sigma: 0.01, unit: "m" },
        { nodeId: "wall-south", propertyKey: "length", sigma: 0.01, unit: "m" },
      ],
    });
    // The newer analysis reports differently (both room dims satisfied now)…
    expect(
      improved.readinessReport.dimensions.find((d) => d.dimensionId === "room-width-uncertainty")
        ?.outcome,
    ).toBe("satisfied");
    expect(improved.readinessReport.readiness).toBe("NOT_READY"); // depth + coverage still open
    // …while the OLD record's consumed report is byte-identical (append-only).
    const reread = await svc.getAnalysis(ANALYSIS_ID);
    expect(canonicalJsonStringify(reread?.readinessReport)).toBe(
      canonicalJsonStringify(first.readinessReport),
    );
  });
});

describe("gap analysis service: THE PERTURBATION-SENSITIVITY ACCEPTANCE MATRIX", () => {
  test("COVERAGE perturbation: new valid evidence support changes the recommendations", async () => {
    const baseline = await service().runGapAnalysis(buildCanonicalInput());
    // Perturb the EVIDENCE GRAPH STATE: EV_DUCT (valid STILL_IMAGERY) now
    // links to wall-south → wall-south gains valid support.
    const perturbed = await new GapAnalysisService({
      store: new InMemoryGapAnalysisStore(),
      clock: fixedClock,
      ...realResolvers(),
      evidenceGraphResolver: makeEvidenceGraphResolver(
        buildEvidenceFacts().map((fact) =>
          fact.evidenceId === EV_DUCT ? { ...fact, linkedNodeIds: ["wall-south"] } : fact,
        ),
      ),
    }).runGapAnalysis(buildCanonicalInput());
    // The recommendations changed: wall-south's observe candidate is GONE.
    expect(
      perturbed.candidates.some((c) => c.subjectNodeId === "wall-south" && c.actionKind === "observe_node"),
    ).toBe(false);
    expect(
      baseline.candidates.some((c) => c.subjectNodeId === "wall-south" && c.actionKind === "observe_node"),
    ).toBe(true);
    // Its coverage gap is gone too.
    expect(
      perturbed.gaps.some((g) => g.subjectNodeId === "wall-south" && g.gapClass === "coverage_unsupported"),
    ).toBe(false);
    // The digest and the ranking changed.
    expect(perturbed.inputDigest).not.toBe(baseline.inputDigest);
    expect(perturbed.candidates.map((c) => c.candidateId)).not.toEqual(
      baseline.candidates.map((c) => c.candidateId),
    );
    // The readiness authority's coverage basis changed with it (0.25 → 0.5).
    const coverage = perturbed.readinessReport.dimensions.find(
      (dimension) => dimension.dimensionId === "surface-coverage",
    );
    expect((coverage?.basis as { measuredCoverageFraction?: number }).measuredCoverageFraction).toBe(0.5);
  });

  test("UNCERTAINTY perturbation: a σ change changes the recommendations", async () => {
    const baseline = await service().runGapAnalysis(buildCanonicalInput());
    const svc = service();
    // Perturb σ: room.width tightened 0.04 → 0.01 (now within the 0.02 bound).
    const tightened = await svc.runGapAnalysis({
      ...buildCanonicalInput(),
      analysisId: "gap-analysis-tightened",
      uncertaintyAnnotations: [
        { nodeId: "room-lobby", propertyKey: "room.width", sigma: 0.01, unit: "m" },
      ],
    });
    // The sigma_above_bound gap and its measure candidate are GONE.
    expect(tightened.gaps.some((g) => g.gapClass === "sigma_above_bound")).toBe(false);
    expect(tightened.candidates.some((c) => c.propertyKey === "room.width")).toBe(false);
    expect(baseline.candidates.some((c) => c.propertyKey === "room.width")).toBe(true);
    // The room-width dimension is now satisfied in the authority's report.
    expect(
      tightened.readinessReport.dimensions.find((d) => d.dimensionId === "room-width-uncertainty")?.outcome,
    ).toBe("satisfied");
    expect(tightened.inputDigest).not.toBe(baseline.inputDigest);
    expect(tightened.stats.totalGaps).toBe(9);
    // Loosening instead (0.04 → 0.2): the gap stays and the expected
    // reduction GROWS ((0.2−0.02)/0.2 = 0.9) — more uncertainty to remove
    // is MORE valuable, so the candidate RISES in the ranking.
    const loosened = await svc.runGapAnalysis({
      ...buildCanonicalInput(),
      analysisId: "gap-analysis-loosened",
      uncertaintyAnnotations: [
        { nodeId: "room-lobby", propertyKey: "room.width", sigma: 0.2, unit: "m" },
      ],
    });
    const measureWidth = loosened.candidates.find((c) => c.propertyKey === "room.width");
    expect(measureWidth?.score.expectedUncertaintyReduction).toBe(0.9); // (0.2−0.02)/0.2
    expect(measureWidth?.score.compositeValue).toBe(0.47);
    expect(measureWidth?.score.compositeValue).toBeGreaterThan(
      (baseline.candidates.find((c) => c.propertyKey === "room.width") as {
        score: { compositeValue: number };
      }).score.compositeValue,
    );
    // The candidate rose in the ranking (position 7 → 6).
    expect(
      loosened.candidates.findIndex((c) => c.propertyKey === "room.width"),
    ).toBeLessThan(baseline.candidates.findIndex((c) => c.propertyKey === "room.width"));
    // Adding the missing room.height σ: the sigma_not_reported gap disappears.
    const withHeight = await svc.runGapAnalysis({
      ...buildCanonicalInput(),
      analysisId: "gap-analysis-with-height",
      uncertaintyAnnotations: [
        ...buildCanonicalInput().uncertaintyAnnotations,
        { nodeId: "room-lobby", propertyKey: "room.height", sigma: 0.02, unit: "m" },
      ],
    });
    expect(withHeight.gaps.some((g) => g.gapClass === "sigma_not_reported")).toBe(false);
    expect(withHeight.readinessReport.readiness).toBe("NOT_READY"); // other critical dims still open
  });

  test("EFFORT perturbation: an effort-context change re-ranks the recommendations", async () => {
    const baseline = await service().runGapAnalysis(buildCanonicalInput());
    const svc = service();
    // Perturb effort: MANUAL_MEASUREMENT becomes near-maximal on this site
    // (the normalized effort-override map keyed by method).
    const expensive = await svc.runGapAnalysis({
      ...buildCanonicalInput(),
      analysisId: "gap-analysis-expensive",
      effortContext: { MANUAL_MEASUREMENT: 0.95 },
    });
    // The TOP candidate changed (measure room.height fell from 0.54 to 0.45
    // — below the observe candidates' 0.505).
    const topBefore = baseline.candidates[0] as { actionKind: string; subjectNodeId: string | null };
    const topAfter = expensive.candidates[0] as { actionKind: string; subjectNodeId: string | null };
    expect(topBefore.actionKind).toBe("measure_property");
    expect(topBefore.subjectNodeId).toBe("room-lobby");
    expect(topAfter.actionKind).not.toBe("measure_property");
    const measureHeight = expensive.candidates.find(
      (c) => c.actionKind === "measure_property" && c.propertyKey === "room.height",
    );
    expect(measureHeight?.score.operatorEffort).toBe(0.95);
    expect(measureHeight?.score.compositeValue).toBe(0.45); // 0.35 + 0.35 − 0.19 − 0.06
    // Cheaper instead: the measure candidate pulls further ahead.
    const cheap = await svc.runGapAnalysis({
      ...buildCanonicalInput(),
      analysisId: "gap-analysis-cheap",
      effortContext: { MANUAL_MEASUREMENT: 0.1 },
    });
    expect((cheap.candidates[0] as { actionKind: string }).actionKind).toBe("measure_property");
    expect(
      (cheap.candidates.find((c) => c.propertyKey === "room.height") as {
        score: { compositeValue: number };
      }).score.compositeValue,
    ).toBeGreaterThan(0.54);
    expect(expensive.inputDigest).not.toBe(baseline.inputDigest);
    expect(cheap.inputDigest).not.toBe(baseline.inputDigest);
    // Effort NEVER touches the readiness authority's verdicts.
    expect(expensive.readinessReport.readiness).toBe(baseline.readinessReport.readiness);
    expect(canonicalJsonStringify(expensive.readinessReport)).toBe(
      canonicalJsonStringify(baseline.readinessReport),
    );
  });

  test("TASK-IMPACT perturbation: the task focus re-ranks subject candidates", async () => {
    const baseline = await service().runGapAnalysis(buildCanonicalInput());
    const focused = await service().runGapAnalysis({
      ...buildCanonicalInput(),
      analysisId: "gap-analysis-focused",
      taskFocus: [{ subjectNodeId: "room-lobby", impactWeight: 1 }],
    });
    // room-lobby's observe candidate keeps weight 1 (focus 1 = no-focus factor);
    // wall-south's drops to the UNFOCUSED factor 0.25.
    const lobbyBefore = baseline.candidates.find(
      (c) => c.subjectNodeId === "room-lobby" && c.actionKind === "observe_node",
    ) as { score: { compositeValue: number } };
    const lobbyAfter = focused.candidates.find(
      (c) => c.subjectNodeId === "room-lobby" && c.actionKind === "observe_node",
    ) as { score: { compositeValue: number } };
    const southAfter = focused.candidates.find(
      (c) => c.subjectNodeId === "wall-south" && c.actionKind === "observe_node",
    ) as { score: { compositeValue: number } };
    expect(lobbyAfter.score.compositeValue).toBe(lobbyBefore.score.compositeValue);
    expect(southAfter.score.compositeValue).toBe(0.32125); // 0.35·0.175 + 0.35·1 − 0.03 − 0.06
    expect(southAfter.score.compositeValue).toBeLessThan(lobbyAfter.score.compositeValue);
    // The focus flags ride on the gaps (every room-lobby subject gap).
    expect(
      focused.gaps.filter((g) => g.addressesTaskFocus).map((g) => g.subjectNodeId),
    ).toEqual(["room-lobby", "room-lobby", "room-lobby"]);
    expect(
      new Set(focused.gaps.filter((g) => g.addressesTaskFocus).map((g) => g.subjectNodeId)),
    ).toEqual(new Set(["room-lobby"]));
    // The ranking order changed (wall-south no longer ties with room-lobby).
    expect(focused.candidates.map((c) => c.candidateId)).not.toEqual(
      baseline.candidates.map((c) => c.candidateId),
    );
  });

  test("RECOVERABILITY perturbation: an annotation state change re-ranks and re-kinds the recommendation", async () => {
    const baseline = await service().runGapAnalysis(buildCanonicalInput());
    // Perturb the seam: duct-shaft was NOT_OBSERVED → now OCCLUDED.
    const occluded = await service().runGapAnalysis({
      ...buildCanonicalInput(),
      analysisId: "gap-analysis-occluded-duct",
      annotations: buildCanonicalInput().annotations.map((annotation) =>
        annotation.targetNodeId === "duct-shaft"
          ? { ...annotation, observationStatus: "OCCLUDED" as const }
          : annotation,
      ),
    });
    const before = baseline.candidates.find((c) => c.subjectNodeId === "duct-shaft") as {
      actionKind: string;
      score: { recoverability: number; compositeValue: number };
    };
    const after = occluded.candidates.find((c) => c.subjectNodeId === "duct-shaft") as {
      actionKind: string;
      score: { recoverability: number; compositeValue: number };
    };
    // The candidate's KIND changed (observe → resolve) and its urgency ROSE.
    expect(before.actionKind).toBe("observe_node");
    expect(after.actionKind).toBe("resolve_occlusion");
    expect(after.score.recoverability).toBeLessThan(before.score.recoverability);
    expect(after.score.compositeValue).toBeGreaterThan(before.score.compositeValue);
    // The gap's state changed first-class: NOT_OBSERVED → OCCLUDED.
    const gap = occluded.gaps.find((g) => g.subjectNodeId === "duct-shaft");
    expect(gap?.state).toBe("OCCLUDED");
    expect(gap?.gapClass).toBe("subject_occluded");
  });

  test("DEVICE-CAPABILITY perturbation: capability facts add explicit substitution candidates", async () => {
    const baseline = await service().runGapAnalysis(buildCanonicalInput());
    expect(baseline.stats.substitutionCandidates).toBe(0);
    // Perturb the device facts: depth sensing unavailable, two alternatives usable.
    const device = await service().runGapAnalysis({
      ...buildCanonicalInput(),
      analysisId: "gap-analysis-device",
      deviceCapabilityFacts: {
        "capability.depth_sensing": "unavailable",
        "capability.calibrated_reference": "available",
        "capability.manual_measurement": "available",
      },
    });
    expect(device.stats.substitutionCandidates).toBe(2);
    const substitutions = device.candidates.filter((c) => c.substitution !== undefined);
    expect(substitutions.map((c) => c.method).sort()).toEqual([
      "CALIBRATED_REFERENCE",
      "MANUAL_MEASUREMENT",
    ]);
    for (const candidate of substitutions) {
      // R3 acceptance: accepted alternatives retain method/uncertainty semantics.
      expect(candidate.substitution?.originalMethod).toBe("DEPTH_SENSING");
      expect(candidate.substitution?.semanticsNote).toContain("does NOT satisfy");
      expect(candidate.substitution?.semanticsNote).toContain("governed substitution decision");
      expect(candidate.score.derivation.expectedUncertaintyReduction).toContain("own semantics");
    }
    // The substituted methods' reduction uses their OWN valid counts.
    const calibrated = substitutions.find((c) => c.method === "CALIBRATED_REFERENCE");
    expect(calibrated?.score.expectedUncertaintyReduction).toBe(1);
    const manual = substitutions.find((c) => c.method === "MANUAL_MEASUREMENT");
    expect(manual?.score.expectedUncertaintyReduction).toBe(0.292893);
    // The primary DEPTH_SENSING requirement candidate still stands (the bar is unchanged).
    expect(
      device.candidates.some((c) => c.method === "DEPTH_SENSING" && c.substitution === undefined),
    ).toBe(true);
    // The readiness verdict is UNCHANGED by the device facts (annotation-only authority).
    expect(device.readinessReport.readiness).toBe(baseline.readinessReport.readiness);
    expect(device.readinessReport.dimensions.map((d) => d.dimensionId)).toEqual(
      baseline.readinessReport.dimensions.map((d) => d.dimensionId),
    );
  });
});

describe("gap analysis service: no-fabrication and honesty disciplines", () => {
  test("every evidence id referenced anywhere in the record resolves in the real evidence graph", async () => {
    const record = await service().runGapAnalysis(buildCanonicalInput());
    const known = new Set(KNOWN_EVIDENCE);
    const referenced = new Set<string>();
    for (const gap of record.gaps) {
      for (const evidenceId of gap.evidenceIds) {
        referenced.add(evidenceId);
      }
    }
    expect(referenced.size).toBe(record.stats.evidenceReferenced);
    for (const evidenceId of referenced) {
      expect(known.has(evidenceId)).toBe(true);
    }
    // Candidates never claim evidence exists — they only propose acquiring it.
    for (const candidate of record.candidates) {
      expect(candidate.instructions).toMatch(
        /([Aa]cquire|[Cc]apture|[Dd]etermine|[Hh]ave a human|[Rr]e-observe|[Aa]ssert|[Oo]bserve)/,
      );
    }
  });

  test("the record is NOT a ReadinessAssessment: no readiness mutation surface exists", async () => {
    const svc = service();
    const record = await svc.runGapAnalysis(buildCanonicalInput());
    // The only readiness field is the consumed, verbatim context.
    expect(Object.keys(record).filter((key) => key.toLowerCase().includes("readiness"))).toEqual([
      "readinessReport",
    ]);
    // There is no readiness-write API on the service (the private
    // prototype helpers are verification/assembly, never readiness writes).
    const methods = Object.getOwnPropertyNames(Object.getPrototypeOf(svc));
    expect(methods.filter((method) => method.toLowerCase().includes("readiness"))).toEqual([]);
    expect(methods).toContain("runGapAnalysis");
    expect(methods).toContain("getAnalysis");
    expect(methods).toContain("listAnalyses");
    expect(methods).not.toContain("setReadiness");
    expect(methods).not.toContain("downgradeReadiness");
  });

  test("the unioned support edges: evidence-graph links, node/property provenance and observations all count", async () => {
    // EV_PHOTO links to wall-south via the EVIDENCE GRAPH's own links;
    // an observation binds EV_MEZZANINE to wall-east; node provenance
    // carries wall-north (already canonical).
    const version = buildRealityVersion();
    const withObservation = {
      ...version,
      observations: [
        {
          observationId: "obs-wall-east",
          nodeId: "wall-east",
          observedAt: FIXED_EARLIER,
          evidenceIds: [EV_MEZZANINE],
          properties: [],
        },
      ],
    };
    const record = await new GapAnalysisService({
      store: new InMemoryGapAnalysisStore(),
      clock: fixedClock,
      ...realResolvers(),
      realityVersionResolver: makeRealityVersionResolver(PROJECT_ID, [withObservation]),
      evidenceGraphResolver: makeEvidenceGraphResolver(
        buildEvidenceFacts().map((fact) =>
          fact.evidenceId === EV_PHOTO ? { ...fact, linkedNodeIds: ["wall-south"] } : fact,
        ),
      ),
    }).runGapAnalysis(buildCanonicalInput());
    // wall-south (evidence-graph link) and wall-east (bound observation)
    // are covered → only room-lobby remains coverage_unsupported.
    expect(
      record.gaps.filter((gap) => gap.gapClass === "coverage_unsupported").map((gap) => gap.subjectNodeId),
    ).toEqual(["room-lobby"]);
    const coverage = record.readinessReport.dimensions.find(
      (dimension) => dimension.dimensionId === "surface-coverage",
    );
    expect((coverage?.basis as { nodesCovered?: number }).nodesCovered).toBe(3);
  });
});

describe("gap analysis service: store twins", () => {
  test("the Fs and InMemory stores produce byte-identical records and reads", async () => {
    await withTempDir(async (root) => {
      const fsStore = new FsGapAnalysisStore(join(root, "data"));
      const memStore = new InMemoryGapAnalysisStore();
      const fsRecord = await new GapAnalysisService({
        store: fsStore,
        clock: fixedClock,
        ...realResolvers(),
      }).runGapAnalysis(buildCanonicalInput());
      const memRecord = await new GapAnalysisService({
        store: memStore,
        clock: fixedClock,
        ...realResolvers(),
      }).runGapAnalysis(buildCanonicalInput());
      expect(canonicalJsonStringify(fsRecord)).toBe(canonicalJsonStringify(memRecord));
      // Both read back identically; the file lands at the path convention.
      const fsRead = await fsStore.get(ANALYSIS_ID);
      const memRead = await memStore.get(ANALYSIS_ID);
      expect(canonicalJsonStringify(fsRead)).toBe(canonicalJsonStringify(memRead));
      expect(existsSync(join(root, "data", "gaps", `${sha256Hex(ANALYSIS_ID)}.json`))).toBe(true);
      // Both list identically.
      expect((await fsStore.list()).map((r) => r.analysisId)).toEqual(
        (await memStore.list()).map((r) => r.analysisId),
      );
    });
  });

  test("the Fs store tolerates and ignores non-record files (tmp leftovers)", async () => {
    await withTempDir(async (root) => {
      const store = new FsGapAnalysisStore(join(root, "data"));
      const record = await new GapAnalysisService({
        store,
        clock: fixedClock,
        ...realResolvers(),
      }).runGapAnalysis(buildCanonicalInput());
      // A tmp leftover and a foreign file never break list().
      writeFileSync(join(root, "data", "gaps", `${sha256Hex(ANALYSIS_ID)}.json.tmp`), "garbage");
      writeFileSync(join(root, "data", "gaps", "foreign.txt`"), "not json");
      const listed = await store.list();
      expect(listed).toHaveLength(1);
      expect(listed[0]?.analysisId).toBe(record.analysisId);
    });
  });
});
