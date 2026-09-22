/**
 * HFX-201 — the MODEL tests: the registered candidate profiles (validated
 * through the control plane's `validateProviderProfile`), the structured
 * fixture parsers (fail closed on malformed fixtures) and the Layer-2
 * bundle projection.
 */

import { describe, expect, test } from "bun:test";
import {
  MANDATORY_PROFILE_FIELDS,
  PROVIDER_MODALITIES,
  COST_MODELS,
  deriveEvaluationOnly,
  validateProviderProfile,
} from "@aise/provider-registry";
import {
  DECLARED_COST_MODELS,
  DECLARED_MODALITIES,
  QWEN3_VL_8B_PROVIDER_ID,
  QWEN3_VL_8B_TECHNOLOGY_VERSION,
  QWEN3_VL_30B_A3B_PROVIDER_ID,
  QWEN3_VL_30B_A3B_TECHNOLOGY_VERSION,
  QWEN3_VL_LICENSE_IDENTIFIER,
  QWEN3_VL_VARIANTS,
  VLM_BEHAVIOR_MATRIX_CELLS,
  VLM_DETERMINISTIC_CHECKS,
  VLM_DOUBLE_BEHAVIOR_CLASSES,
  VLM_EVAL_BENCHMARK_ID,
  VLM_EVAL_CAPABILITY,
  VLM_EVAL_ERROR_CODES,
  VLM_EVAL_SUITE_ID,
  VlmEvalError,
  fixtureContentTextOf,
  fixtureFactsOf,
  isVlmVariantKey,
  parseVlmCorpusScenarioSpec,
  parseVlmDoubleScriptSpec,
  parseVlmEvidenceFixture,
  parseVlmImageFixture,
  parseVlmOcrFixture,
  parseVlmVariantKey,
  parseVlmVideoFixture,
  qwen3Vl8bProfile,
  qwen3Vl30bA3bProfile,
  qwen3VlCandidateProfiles,
  qwen3VlLicenseDeclaration,
  qwen3VlLicenseStatus,
  qwen3VlVariantIdentity,
  toLayer2Bundle,
  toLayer2EvidenceItem,
  validatedQwen3VlProfile,
} from "./model";
import { VLM_EVAL_CORPUS } from "./corpus";

describe("HFX-201 model: the two registered Qwen3-VL candidate profiles", () => {
  test("both variants are separate profiles: distinct provider ids AND technology versions, same family", () => {
    const v8 = qwen3Vl8bProfile();
    const v30 = qwen3Vl30bA3bProfile();
    expect(v8.providerId).toBe(QWEN3_VL_8B_PROVIDER_ID);
    expect(v30.providerId).toBe(QWEN3_VL_30B_A3B_PROVIDER_ID);
    expect(v8.providerId).not.toBe(v30.providerId);
    expect(v8.technologyVersion).toBe(QWEN3_VL_8B_TECHNOLOGY_VERSION);
    expect(v30.technologyVersion).toBe(QWEN3_VL_30B_A3B_TECHNOLOGY_VERSION);
    expect(v8.technologyVersion).not.toBe(v30.technologyVersion);
    // same family: identical capability/modality declarations + license
    expect(v8.capabilities).toEqual(v30.capabilities);
    expect(v8.supportedModalities).toEqual(v30.supportedModalities);
    expect(v8.license.identifier).toBe(QWEN3_VL_LICENSE_IDENTIFIER);
    expect(v30.license.identifier).toBe(QWEN3_VL_LICENSE_IDENTIFIER);
  });

  test("both profiles pass the control plane's 15/15 mandatory-field validation", () => {
    for (const profile of qwen3VlCandidateProfiles()) {
      const validation = validateProviderProfile(profile);
      expect(validation.ok).toBe(true);
      for (const field of MANDATORY_PROFILE_FIELDS) {
        expect((profile as unknown as Record<string, unknown>)[field]).toBeDefined();
      }
    }
  });

  test("the capability/modality declarations cover image, video, OCR and spatial-reference tasks", () => {
    const profile = qwen3Vl8bProfile();
    expect(profile.supportedModalities).toEqual(["image", "video", "document", "text"]);
    expect(profile.capabilities).toContain("multimodal-reasoning");
    expect(profile.capabilities).toContain("image-reasoning");
    expect(profile.capabilities).toContain("video-reasoning");
    expect(profile.capabilities).toContain("ocr-text-extraction");
    expect(profile.capabilities).toContain("spatial-reference-resolution");
    for (const modality of profile.supportedModalities) {
      expect(PROVIDER_MODALITIES).toContain(modality);
    }
  });

  test("the cost model comes from the closed COST_MODELS vocabulary with declared latency/resource metadata", () => {
    const v8 = qwen3Vl8bProfile();
    const v30 = qwen3Vl30bA3bProfile();
    expect(COST_MODELS).toContain(v8.costProfile.model);
    expect(v8.costProfile.model).toBe("per-token");
    expect(v30.costProfile.model).toBe("per-token");
    expect(v8.costProfile.unitCost).toBeGreaterThan(0);
    expect(v30.costProfile.unitCost).toBeGreaterThan(v8.costProfile.unitCost);
    expect(v30.memoryProfile.recommendedMiB).toBeGreaterThan(v8.memoryProfile.recommendedMiB);
    expect(v30.latencyProfile.expectedMsP95).toBeGreaterThan(v8.latencyProfile.expectedMsP95);
    // the declared vocabularies mirror the control plane's frozen lists
    expect(DECLARED_MODALITIES).toEqual([...PROVIDER_MODALITIES]);
    expect(DECLARED_COST_MODELS).toEqual([...COST_MODELS]);
  });

  test("the license is evaluation-only unless proven otherwise (the binding dataset/model-use rule)", () => {
    const license = qwen3VlLicenseDeclaration();
    expect(license.commercialUse).toBe(false);
    expect(license.intendedUseCleared).toBe(false);
    expect(license.evaluationOnly).toBe(true);
    expect(deriveEvaluationOnly(license)).toBe(true);
    expect(qwen3VlLicenseStatus()).toBe("evaluation-only");
    for (const profile of qwen3VlCandidateProfiles()) {
      const validation = validateProviderProfile(profile);
      expect(validation.ok && validation.profile.license.evaluationOnly).toBe(true);
    }
  });

  test("the failure modes use the closed vocabulary only (no invented kinds)", () => {
    for (const profile of qwen3VlCandidateProfiles()) {
      expect(profile.failureModes.length).toBeGreaterThan(0);
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
          ],
        ).toContain(mode.kind);
      }
    }
  });

  test("validatedQwen3VlProfile returns the typed profile + content digest; unknown variants fail closed", () => {
    for (const variant of QWEN3_VL_VARIANTS) {
      const { profile, profileDigest } = validatedQwen3VlProfile(variant);
      expect(profile.providerId).toBe(variant);
      expect(profileDigest).toMatch(/^[0-9a-f]{64}$/);
      const identity = qwen3VlVariantIdentity(variant);
      expect(identity.capability).toBe(VLM_EVAL_CAPABILITY);
    }
    expect(() => parseVlmVariantKey("gpt-5-vision")).toThrow(VlmEvalError);
    expect(isVlmVariantKey("qwen3-vl-8b")).toBe(true);
    expect(isVlmVariantKey("claude-vision")).toBe(false);
  });

  test("the declared I/O contracts are the Layer-2 envelope contracts (provider replacement never changes the schema)", () => {
    const profile = qwen3Vl8bProfile();
    expect(profile.inputContract.fields.map((field) => field.name)).toEqual([
      "bundleJson",
      "behaviorTag",
      "variantScript",
    ]);
    expect(profile.outputContract.fields.map((field) => field.name)).toEqual(["envelopeJson"]);
    expect(profile.provenanceContract.nativePayloadPolicy).toBe("opaque-required");
  });
});

const validImage = {
  kind: "image",
  evidenceId: "IMG-X",
  revision: "r1",
  description: "a photo",
  elements: [
    {
      elementId: "EL-1",
      elementType: "structural-element",
      name: "a beam",
      row: 1,
      columnStart: 2,
      columnEnd: 3,
      facts: ["the beam is visible"],
    },
  ],
};

describe("HFX-201 model: the fixture parsers fail closed on malformed fixtures", () => {
  test("a valid image fixture parses", () => {
    const fixture = parseVlmImageFixture(validImage);
    expect(fixture.kind).toBe("image");
    expect(fixture.elements[0]?.elementId).toBe("EL-1");
  });

  test("malformed image fixtures are rejected (duplicates, bad rows, empty facts)", () => {
    expect(() => parseVlmImageFixture({ ...validImage, kind: "video" })).toThrow(VlmEvalError);
    expect(() =>
      parseVlmImageFixture({
        ...validImage,
        elements: [...validImage.elements, { ...validImage.elements[0] }],
      }),
    ).toThrow(/duplicate element id/);
    expect(() =>
      parseVlmImageFixture({
        ...validImage,
        elements: [{ ...validImage.elements[0]!, row: 0 }],
      }),
    ).toThrow(/row/);
    expect(() =>
      parseVlmImageFixture({
        ...validImage,
        elements: [{ ...validImage.elements[0]!, columnEnd: 1 }],
      }),
    ).toThrow(/columnEnd/);
    expect(() =>
      parseVlmImageFixture({
        ...validImage,
        elements: [{ ...validImage.elements[0]!, facts: [] }],
      }),
    ).toThrow(/facts/);
  });

  test("video fixtures require frames with observations; measurements need a positive sigma", () => {
    const validVideo = {
      kind: "video",
      evidenceId: "VID-X",
      revision: "r1",
      description: "a walkthrough",
      frames: [
        { frameId: "F1", tMs: 0, observations: [{ field: "w", value: "1" }] },
      ],
      facts: ["the video shows a crack"],
      measurement: { sigma: 0.05, unit: "mm" },
    };
    expect(parseVlmVideoFixture(validVideo).frames.length).toBe(1);
    expect(() => parseVlmVideoFixture({ ...validVideo, frames: [] })).toThrow(VlmEvalError);
    expect(() =>
      parseVlmVideoFixture({ ...validVideo, frames: [{ ...validVideo.frames[0]!, frameId: "F1" }, { ...validVideo.frames[0]!, frameId: "F1" }] }),
    ).toThrow(/duplicate frame id/);
    expect(() => parseVlmVideoFixture({ ...validVideo, measurement: { sigma: 0, unit: "mm" } })).toThrow(/sigma/);
    expect(() => parseVlmVideoFixture({ ...validVideo, facts: [] })).toThrow(/facts/);
  });

  test("OCR fixtures: illegible regions carry a null value — never a guessed one", () => {
    const validOcr = {
      kind: "ocr",
      evidenceId: "OCR-X",
      revision: "r2",
      description: "a nameplate",
      regions: [
        {
          regionId: "R1",
          field: "serial",
          value: "SN-1",
          legible: true,
          bbox: { x1: 0, y1: 0, x2: 10, y2: 5 },
          facts: ["region R1 states serial SN-1"],
        },
        {
          regionId: "R2",
          field: "date",
          value: null,
          legible: false,
          bbox: { x1: 0, y1: 6, x2: 10, y2: 9 },
          facts: ["region R2 is illegible"],
        },
      ],
    };
    expect(parseVlmOcrFixture(validOcr).regions.length).toBe(2);
    expect(() =>
      parseVlmOcrFixture({
        ...validOcr,
        regions: [{ ...validOcr.regions[0]!, legible: true, value: undefined }],
      }),
    ).toThrow(/value/);
    expect(() =>
      parseVlmOcrFixture({
        ...validOcr,
        regions: [{ ...validOcr.regions[1]!, legible: false, value: "2024-01-01" }],
      }),
    ).toThrow(/illegible/);
    expect(() =>
      parseVlmOcrFixture({
        ...validOcr,
        regions: [{ ...validOcr.regions[0]!, bbox: {} }],
      }),
    ).toThrow(/bbox/);
    expect(() => parseVlmEvidenceFixture({ kind: "lidar" })).toThrow(/kind/);
  });
});

describe("HFX-201 model: the double scripts and corpus specs parse fail-closed", () => {
  test("a replay script requires an envelope; a refusal script is control-channel-shaped", () => {
    expect(() =>
      parseVlmDoubleScriptSpec({
        behaviorClass: "well-grounded",
        layer2Behavior: "replay",
        envelope: { evidenceIds: ["E1"], facts: [], assumptions: [], unknowns: [], deterministicChecks: [], resultClaim: null, resultStatus: "supported", invalidationConditions: [] },
      }),
    ).not.toThrow();
    expect(() =>
      parseVlmDoubleScriptSpec({ behaviorClass: "well-grounded", layer2Behavior: "replay" }),
    ).toThrow(/envelope/);
    expect(() =>
      parseVlmDoubleScriptSpec({ behaviorClass: "mystical", layer2Behavior: "replay" }),
    ).toThrow(/behaviorClass/);
    expect(() =>
      parseVlmDoubleScriptSpec({ behaviorClass: "refusing", layer2Behavior: "refuse" }),
    ).not.toThrow();
    expect(() =>
      parseVlmDoubleScriptSpec({ behaviorClass: "refusing", layer2Behavior: "refuse", refusalDetail: "" }),
    ).toThrow(/refusalDetail/);
    expect(() =>
      parseVlmDoubleScriptSpec({ behaviorClass: "refusing", layer2Behavior: "teleport" }),
    ).toThrow(/layer2Behavior/);
  });

  test("a corpus spec missing a variant script is rejected — every registered variant runs the same corpus", () => {
    const [sample] = VLM_EVAL_CORPUS;
    if (sample === undefined) {
      throw new Error("the corpus is empty");
    }
    const roundTripped = JSON.parse(JSON.stringify(sample)) as Record<string, unknown>;
    const scripts = roundTripped["scripts"] as Record<string, unknown>;
    delete scripts["qwen3-vl-30b-a3b"];
    expect(() => parseVlmCorpusScenarioSpec(roundTripped)).toThrow(/qwen3-vl-30b-a3b/);
  });

  test("the committed corpus specs round-trip through the fail-closed parser", () => {
    for (const spec of VLM_EVAL_CORPUS) {
      const roundTripped = JSON.parse(JSON.stringify(spec));
      expect(() => parseVlmCorpusScenarioSpec(roundTripped)).not.toThrow();
      const parsed = parseVlmCorpusScenarioSpec(roundTripped);
      expect(parsed.scenarioId).toBe(spec.scenarioId);
      expect(parsed.matrixCell).toBe(spec.matrixCell);
    }
  });

  test("expected failure kinds cannot invent vocabulary; out-of-scope specs cannot name required evidence", () => {
    const [sample] = VLM_EVAL_CORPUS;
    if (sample === undefined) {
      throw new Error("the corpus is empty");
    }
    const invented = JSON.parse(JSON.stringify(sample)) as Record<string, unknown>;
    const kinds = invented["expectedFailureKinds"] as Record<string, unknown>;
    kinds["qwen3-vl-8b"] = "cosmic-failure";
    expect(() => parseVlmCorpusScenarioSpec(invented)).toThrow(/cannot invent failure vocabulary/);
    const scoped = JSON.parse(JSON.stringify(sample)) as Record<string, unknown>;
    scoped["scope"] = "out-of-scope";
    scoped["requiredEvidenceIds"] = ["IMG-NORTH-2"];
    expect(() => parseVlmCorpusScenarioSpec(scoped)).toThrow(/out-of-scope/);
  });
});

describe("HFX-201 model: the fixture projection onto the Layer-2 canonical bundle", () => {
  test("image/video/OCR fixtures project with their ground-truth facts and revisions", () => {
    const image = parseVlmImageFixture(validImage);
    const item = toLayer2EvidenceItem(image);
    expect(item.kind).toBe("image");
    expect(item.evidenceId).toBe("IMG-X");
    expect(item.revision).toBe("r1");
    expect(item.facts).toEqual(["the beam is visible"]);
    expect(item.content).toContain("the beam is visible".length > 0 ? "a photo" : "");
    expect(fixtureFactsOf(image)).toEqual(["the beam is visible"]);

    const video = parseVlmVideoFixture({
      kind: "video",
      evidenceId: "VID-X",
      revision: "r1",
      description: "a walkthrough",
      frames: [{ frameId: "F1", tMs: 0, observations: [{ field: "w", value: "1" }] }],
      facts: ["the video shows a crack"],
      measurement: { sigma: 0.05, unit: "mm" },
    });
    const videoItem = toLayer2EvidenceItem(video);
    expect(videoItem.measurement).toEqual({ sigma: 0.05, unit: "mm" });
    expect(fixtureContentTextOf(video)).toContain("F1@0ms");

    const ocr = parseVlmOcrFixture({
      kind: "ocr",
      evidenceId: "OCR-X",
      revision: "r2",
      description: "a nameplate",
      regions: [
        {
          regionId: "R2",
          field: "date",
          value: null,
          legible: false,
          bbox: { x1: 0, y1: 6, x2: 10, y2: 9 },
          facts: ["region R2 is illegible"],
        },
      ],
    });
    const ocrItem = toLayer2EvidenceItem(ocr);
    expect(ocrItem.kind).toBe("document-section");
    expect(fixtureContentTextOf(ocr)).toContain("ILLEGIBLE");
  });

  test("toLayer2Bundle projects the question side with the offered checks and lane", () => {
    const [sample] = VLM_EVAL_CORPUS;
    if (sample === undefined) {
      throw new Error("the corpus is empty");
    }
    const bundle = toLayer2Bundle({
      scenarioId: "s@v",
      question: sample.question,
      authorizedContext: sample.authorizedContext,
      evidence: sample.evidence,
      requiredEvidenceIds: sample.requiredEvidenceIds,
      scope: sample.scope,
      offeredChecks: sample.checkPlan.map((plan) => plan.check),
    });
    expect(bundle.lane).toBe("multimodal-reasoning");
    expect(bundle.scenarioId).toBe("s@v");
    expect(bundle.evidence.length).toBe(sample.evidence.length);
    expect(bundle.offeredChecks.length).toBeGreaterThan(0);
  });

  test("the frozen vocabularies are pinned (suites, checks, behaviors, matrix, errors)", () => {
    expect(VLM_EVAL_SUITE_ID).toBe("qwen3-vl-provider-benchmark/1");
    expect(VLM_EVAL_BENCHMARK_ID).toBe("qwen3-vl-multimodal-benchmark/1");
    expect(VLM_EVAL_CAPABILITY).toBe("multimodal-reasoning");
    expect([...VLM_DOUBLE_BEHAVIOR_CLASSES]).toEqual(["well-grounded", "hallucinating", "refusing"]);
    expect([...VLM_BEHAVIOR_MATRIX_CELLS]).toEqual([
      "grounded-pass",
      "missing-evidence",
      "conflicting-evidence",
      "unsupported-question",
    ]);
    expect([...VLM_DETERMINISTIC_CHECKS]).toEqual([
      "vlm-fact-derivability-check",
      "vlm-spatial-reference-resolution-check",
      "vlm-field-value-recomputation-check",
      "vlm-conflict-detection-check",
    ]);
    expect([...QWEN3_VL_VARIANTS]).toEqual(["qwen3-vl-8b", "qwen3-vl-30b-a3b"]);
    expect([...VLM_EVAL_ERROR_CODES]).toContain("unknown_variant");
  });
});
