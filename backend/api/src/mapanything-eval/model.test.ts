/**
 * HFX-101 — the MODEL tests: the registered candidate profile (the 15/15
 * mandatory-field gate, the evaluation-only license derivation), the task +
 * variant vocabularies, the fail-closed capture-set/uncertainty parsers,
 * the task-coherence validator and the derived-version address.
 */

import { describe, expect, test } from "bun:test";
import {
  MANDATORY_PROFILE_FIELDS,
  validateProviderProfile,
  deriveEvaluationOnly,
} from "@aise/provider-registry";
import {
  DECLARED_COST_MODELS,
  DECLARED_MODALITIES,
  MAPANYTHING_BEHAVIOR_MATRIX_CELLS,
  MAPANYTHING_DECLARED_FALLBACK,
  MAPANYTHING_DOUBLE_BEHAVIOR_CLASSES,
  MAPANYTHING_EVAL_VARIANTS,
  MAPANYTHING_LICENSE_IDENTIFIER,
  MAPANYTHING_PROVIDER_ID,
  MAPANYTHING_TASKS,
  MAPANYTHING_TECHNOLOGY_VERSION,
  MapAnythingEvalError,
  canonicalDigestOf,
  derivedReconstructionVersionIdOf,
  mapAnythingLicenseDeclaration,
  mapAnythingProfile,
  parseMapAnythingCaptureSet,
  parseUncertaintyDeclaration,
  validatedMapAnythingProfile,
  validateMapAnythingTaskCoherence,
} from "./model";
import type { MapAnythingCorpusTask } from "./model";

describe("HFX-101 model: the registered MapAnything candidate profile", () => {
  test("validates through the control plane's validateProviderProfile (15/15 mandatory fields)", () => {
    const validation = validateProviderProfile(mapAnythingProfile());
    expect(validation.ok).toBe(true);
    if (validation.ok) {
      expect(validation.profile.providerId).toBe(MAPANYTHING_PROVIDER_ID);
      expect(validation.profile.technologyVersion).toBe(MAPANYTHING_TECHNOLOGY_VERSION);
    }
    const profile = mapAnythingProfile() as unknown as Record<string, unknown>;
    for (const field of MANDATORY_PROFILE_FIELDS) {
      expect(profile[field]).toBeDefined();
    }
  });

  test("the validated profile carries a 64-hex control-plane content digest", () => {
    const { profileDigest } = validatedMapAnythingProfile();
    expect(profileDigest).toMatch(/^[0-9a-f]{64}$/);
  });

  test("the capability declarations cover multi-image reconstruction, metric depth and registration (Layer-1-aligned)", () => {
    const { profile } = validatedMapAnythingProfile();
    for (const capability of [
      "reconstruction",
      "depth",
      "multi-image-reconstruction",
      "metric-depth",
      "registration",
    ]) {
      expect((profile.capabilities as readonly string[]).includes(capability)).toBe(true);
    }
    // ONLY what the lane's fixtures exercise — no novel-view, no segmentation:
    expect(profile.capabilities.length).toBe(5);
  });

  test("the cost model comes from COST_MODELS (per-invocation) with declared latency/resource envelopes", () => {
    const { profile } = validatedMapAnythingProfile();
    expect(DECLARED_COST_MODELS.includes(profile.costProfile.model)).toBe(true);
    expect(profile.costProfile.model).toBe("per-invocation");
    expect(profile.costProfile.unitCost).toBeGreaterThan(0);
    expect(profile.computeProfile.accelerator).toBe("gpu");
    expect(profile.latencyProfile.timeoutMs).toBeGreaterThanOrEqual(
      profile.latencyProfile.expectedMsP95,
    );
    expect(profile.memoryProfile.recommendedMiB).toBeGreaterThanOrEqual(
      profile.memoryProfile.minimumMiB,
    );
    expect(DECLARED_MODALITIES.includes(profile.supportedModalities[0] as string)).toBe(true);
  });

  test("the license is evaluation-only (deriveEvaluationOnly — the binding dataset/model-use rule)", () => {
    const license = mapAnythingLicenseDeclaration();
    expect(license.identifier).toBe(MAPANYTHING_LICENSE_IDENTIFIER);
    expect(deriveEvaluationOnly(license)).toBe(true);
    expect(license.evaluationOnly).toBe(true);
    const { profile } = validatedMapAnythingProfile();
    expect(profile.license.evaluationOnly).toBe(true);
    expect(profile.license.commercialUse).toBe(false);
    expect(profile.license.intendedUseCleared).toBe(false);
  });

  test("the uncertainty characteristics declare measurement-uncertainty, separate from confidence", () => {
    const { profile } = validatedMapAnythingProfile();
    expect(profile.uncertaintyCharacteristics.calibration).toBe("measurement-uncertainty");
    expect(profile.uncertaintyCharacteristics.confidenceSeparateFromMeasurementUncertainty).toBe(
      true,
    );
  });

  test("the failure modes use the CLOSED vocabulary only (no invented kinds)", () => {
    const { profile } = validatedMapAnythingProfile();
    for (const mode of profile.failureModes) {
      expect(
        [
          "perception-failure",
          "retrieval-failure",
          "reasoning-failure",
          "unsupported-data",
          "operation-semantic-failure",
          "resource-exhaustion",
          "timeout",
          "license-blocked",
          "contract-mismatch",
        ].includes(mode.kind),
      ).toBe(true);
    }
    // the declared capture requirements + the declared fallback are documented in the conditions/behaviors
    const declared = profile.failureModes
      .map((mode) => `${mode.condition} ${mode.behavior}`)
      .join(" ");
    expect(declared).toContain("coverage");
    expect(declared).toContain("overlap");
    expect(declared).toContain(MAPANYTHING_DECLARED_FALLBACK);
  });
});

describe("HFX-101 model: the vocabularies (frozen reference data)", () => {
  test("the declared task set is exactly the three exercised task kinds", () => {
    expect([...MAPANYTHING_TASKS]).toEqual([
      "multi-image-reconstruction",
      "metric-depth",
      "registration",
    ]);
  });

  test("the behavior-matrix cells are the four mandated cells", () => {
    expect([...MAPANYTHING_BEHAVIOR_MATRIX_CELLS]).toEqual([
      "grounded-pass",
      "degraded-evidence",
      "failed-invocation",
      "unsupported-task-combination",
    ]);
  });

  test("the double behavior classes are the four mandated classes", () => {
    expect([...MAPANYTHING_DOUBLE_BEHAVIOR_CLASSES]).toEqual([
      "well-grounded",
      "degraded-evidence",
      "failing",
      "unsupported-task",
    ]);
  });

  test("the variant keys are the candidate + the two reference-path providers", () => {
    expect([...MAPANYTHING_EVAL_VARIANTS]).toEqual([
      "mapanything",
      "reference-reconstruction",
      "reference-depth",
    ]);
  });
});

describe("HFX-101 model: the fail-closed parsers", () => {
  test("a well-formed capture set parses (frames, poses, intrinsics, passes)", () => {
    const parsed = parseMapAnythingCaptureSet({
      captureSetId: "cap-test",
      purpose: "registration",
      frames: [
        {
          frameId: "F1",
          station: "S1",
          pose: { position: [1, 2, 3], orientation: [0, 0, 0, 1] },
          intrinsics: { fx: 1000, fy: 1000, cx: 640, cy: 360 },
          observedSurfaceIds: ["floor"],
          pointCount: 100,
          evidenceRevision: "r1",
        },
        {
          frameId: "F2",
          station: "S2",
          pose: { position: [2, 2, 3], orientation: [0, 0, 0, 1] },
          intrinsics: { fx: 1000, fy: 1000, cx: 640, cy: 360 },
          observedSurfaceIds: ["floor", "ceiling"],
          pointCount: 120,
          evidenceRevision: "r2",
        },
      ],
      passes: [
        { passId: "A", frameIds: ["F1"] },
        { passId: "B", frameIds: ["F2"] },
      ],
      note: "test capture set",
    });
    expect(parsed.frames.length).toBe(2);
    expect(parsed.passes?.length).toBe(2);
    expect(parsed.frames[0]?.pose.position).toEqual([1, 2, 3]);
  });

  test("malformed capture sets fail closed (duplicate frame ids, bad pose, unknown pass frame)", () => {
    const frame = {
      frameId: "F1",
      station: "S1",
      pose: { position: [1, 2, 3], orientation: [0, 0, 0, 1] },
      intrinsics: { fx: 1000, fy: 1000, cx: 640, cy: 360 },
      observedSurfaceIds: [],
      pointCount: 100,
      evidenceRevision: "r1",
    };
    expect(() =>
      parseMapAnythingCaptureSet({
        captureSetId: "cap",
        purpose: "multi-image-reconstruction",
        frames: [frame, frame],
        note: "n",
      }),
    ).toThrow(MapAnythingEvalError);
    expect(() =>
      parseMapAnythingCaptureSet({
        captureSetId: "cap",
        purpose: "multi-image-reconstruction",
        frames: [{ ...frame, pose: { position: [1, 2], orientation: [0, 0, 0, 1] } }],
        note: "n",
      }),
    ).toThrow(MapAnythingEvalError);
    expect(() =>
      parseMapAnythingCaptureSet({
        captureSetId: "cap",
        purpose: "multi-image-reconstruction",
        frames: [frame],
        passes: [{ passId: "A", frameIds: ["UNKNOWN"] }, { passId: "B", frameIds: ["F1"] }],
        note: "n",
      }),
    ).toThrow(MapAnythingEvalError);
    expect(() =>
      parseMapAnythingCaptureSet({ captureSetId: "cap", purpose: "not-a-task", frames: [frame], note: "n" }),
    ).toThrow(MapAnythingEvalError);
  });

  test("the uncertainty declaration parser fails closed", () => {
    expect(parseUncertaintyDeclaration({ role: "answer-sigma", sigmaM: 0.002, unit: "m", statement: "s" }).sigmaM).toBe(0.002);
    expect(() => parseUncertaintyDeclaration({ role: "bogus", sigmaM: 1, unit: "m", statement: "s" })).toThrow(MapAnythingEvalError);
    expect(() => parseUncertaintyDeclaration({ role: "answer-sigma", sigmaM: -1, unit: "m", statement: "s" })).toThrow(MapAnythingEvalError);
    expect(() => parseUncertaintyDeclaration({ role: "answer-sigma", sigmaM: 1, unit: "mm", statement: "s" })).toThrow(MapAnythingEvalError);
  });

  test("the task-coherence validator fails closed on incoherent corpus tasks", () => {
    const base = {
      taskId: "t",
      taskVersion: "1.0.0",
      taskKind: "novel-view-synthesis",
      matrixCell: "grounded-pass",
      behaviorClass: "well-grounded",
      capability: "reconstruction",
      evidence: { description: "d", captureSet: {}, evidenceRevisions: ["r1"] },
      expected: { kind: "reconstruction-scene", fixtureId: "f" },
      criteria: { thresholds: [], expectedFailureKinds: [] },
      expectedVerdict: "pass",
      expectedFailureKind: "none",
      uncertainty: null,
    } as unknown as MapAnythingCorpusTask;
    // an unsupported task kind outside the unsupported-task-combination cell:
    expect(() => validateMapAnythingTaskCoherence(base)).toThrow(MapAnythingEvalError);
    // a grounded-pass cell without the answer-sigma uncertainty:
    expect(() =>
      validateMapAnythingTaskCoherence({
        ...base,
        taskKind: "multi-image-reconstruction",
        expectedFailureKind: "unsupported-data",
      } as unknown as MapAnythingCorpusTask),
    ).toThrow(MapAnythingEvalError);
    // a refusal cell without a declared expected failure kind:
    expect(() =>
      validateMapAnythingTaskCoherence({
        ...base,
        taskKind: "multi-image-reconstruction",
        matrixCell: "degraded-evidence",
        behaviorClass: "degraded-evidence",
        expected: { kind: "explicit-refusal" },
        expectedFailureKind: "none",
      } as unknown as MapAnythingCorpusTask),
    ).toThrow(MapAnythingEvalError);
  });
});

describe("HFX-101 model: the derived-version address", () => {
  test("the version id is deterministic and ordinal-sensitive (a reprocess is a NEW version)", () => {
    const base = {
      runId: "run@mapanything",
      providerId: MAPANYTHING_PROVIDER_ID,
      technologyVersion: MAPANYTHING_TECHNOLOGY_VERSION,
      inputDigest: "a".repeat(64),
    };
    const v1 = derivedReconstructionVersionIdOf({ ...base, ordinal: 1 });
    const v1Again = derivedReconstructionVersionIdOf({ ...base, ordinal: 1 });
    const v2 = derivedReconstructionVersionIdOf({ ...base, ordinal: 2 });
    expect(v1).toBe(v1Again);
    expect(v1).not.toBe(v2);
    expect(v1).toMatch(/^drv-[0-9a-f]{24}$/);
    // the input digest is part of the address (different evidence, different version):
    const other = derivedReconstructionVersionIdOf({ ...base, inputDigest: "b".repeat(64), ordinal: 1 });
    expect(other).not.toBe(v1);
  });

  test("the canonical digest helper is the shared wire canonicalization (sorted keys)", () => {
    expect(canonicalDigestOf({ b: 1, a: 2 })).toBe(canonicalDigestOf({ a: 2, b: 1 }));
    expect(canonicalDigestOf({ b: 1, a: 2 })).not.toBe(canonicalDigestOf({ a: 2, b: 3 }));
  });
});
