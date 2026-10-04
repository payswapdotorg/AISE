/**
 * WORLD-P2 — the EVIDENCE family test suite (stages 3–4: EVIDENCE +
 * MISSING-EVIDENCE DETECTION).
 *
 * Drills: the Evidence Envelope laws (duplicate identity refused,
 * unresolvable provenance refused, invalidating-air refused); the
 * fail-closed detection laws (empty requirement set refused, unresolved
 * subject refused, vacuous READY impossible); the typed gap kinds and
 * the worst-of verdict roll-up on both fixture scenarios (A: NOT_READY
 * with the MISSING steel-section gap; B: READY); the invalidated-evidence
 * discounting; the epistemic-floor discipline (the BIM file's INFERRED
 * LoadBearing candidate never satisfies an OBSERVED floor); the
 * uncertainty-bound discipline (sigma not reported / sigma above bound /
 * unit mismatch); the two substitution doubles' BYTE-IDENTICAL reports;
 * and the monotonicity fuzz (adding valid evidence never decreases the
 * readiness verdict).
 */

import { describe, expect, test } from "bun:test";
import {
  alternateMissingEvidenceDouble,
  bindProblemEvidence,
  detectThroughEvidencePort,
  referenceMissingEvidenceDouble,
  sealMissingEvidenceReport,
  verdictOfGapKind,
  worstOfVerdicts,
  type MissingEvidenceDetector,
  type MissingEvidenceReport,
} from "./index";
import {
  BAD_COUNT_REQUIREMENT_SET,
  DUPLICATE_EVIDENCE_INPUT,
  EMPTY_REQUIREMENT_SET,
  FIXTURE_ASSERTION_DEFLECTION,
  FIXTURE_ASSERTION_MATERIAL,
  FIXTURE_ASSERTION_STEEL_SECTION,
  FIXTURE_EVIDENCE_GAUGE,
  FIXTURE_EVIDENCE_PHOTO_1,
  FIXTURE_EVIDENCE_PHOTO_2,
  FIXTURE_PROVENANCE_LINKS,
  REQ_ID_IMAGERY,
  REQ_ID_MATERIAL,
  REQ_ID_STEEL_SECTION,
  SCENARIO_A_EVIDENCE_INPUT,
  SCENARIO_B_EVIDENCE_INPUT,
  UNRESOLVED_LINK_INPUT,
  UNRESOLVED_SUBJECT_INPUT,
  UNRESOLVED_SUBJECT_REQUIREMENT_SET,
} from "./corpus";
import {
  FIXTURE_PROBLEM,
  FIXTURE_PROBLEM_ID,
  FIXTURE_WALL_OBJECT_ID,
  PROBLEM_FIXTURE_RECORDED_AT,
} from "../problem/corpus";
import { fixtureScenarioA, fixtureScenarioB } from "../lane";
import { alternateContextAssemblerDouble, referenceContextAssemblerDouble } from "../problem";
import { CONTRACT_VERSION } from "@aise/shared-contracts";
import { textDigestOf } from "../seam";

/** Both substitution doubles (every detection test runs over BOTH paths). */
const DOUBLES: readonly { readonly name: string; readonly detector: MissingEvidenceDetector }[] = [
  { name: "reference", detector: referenceMissingEvidenceDouble },
  { name: "alternate", detector: alternateMissingEvidenceDouble },
];

/** The scenario contexts, assembled once through the reference assembler. */
const CONTEXT_A = (() => {
  const scenario = fixtureScenarioA();
  const outcome = referenceContextAssemblerDouble.assemble({
    problem: FIXTURE_PROBLEM,
    scene: scenario.scene,
    realityObjects: scenario.realityObjects,
    measurements: scenario.measurements,
    propertyAssertions: scenario.propertyAssertions,
    observations: scenario.observations,
    substrateCandidates: scenario.substrateCandidates,
    assembledAt: scenario.assembledAt,
  });
  if (!outcome.ok) {
    throw new Error(outcome.failure.detail);
  }
  return outcome.value;
})();

const CONTEXT_B = (() => {
  const scenario = fixtureScenarioB();
  const outcome = alternateContextAssemblerDouble.assemble({
    problem: FIXTURE_PROBLEM,
    scene: scenario.scene,
    realityObjects: scenario.realityObjects,
    measurements: scenario.measurements,
    propertyAssertions: scenario.propertyAssertions,
    observations: scenario.observations,
    substrateCandidates: scenario.substrateCandidates,
    assembledAt: scenario.assembledAt,
  });
  if (!outcome.ok) {
    throw new Error(outcome.failure.detail);
  }
  return outcome.value;
})();

/** Detects on one scenario through one double (asserts ok). */
function detectFixture(
  detector: MissingEvidenceDetector,
  evidenceInput: typeof SCENARIO_A_EVIDENCE_INPUT,
  context: typeof CONTEXT_A,
): MissingEvidenceReport {
  const envelopeOutcome = bindProblemEvidence(evidenceInput, context);
  expect(envelopeOutcome.ok).toBe(true);
  if (!envelopeOutcome.ok) {
    throw new Error(envelopeOutcome.failure.detail);
  }
  const reportOutcome = detectThroughEvidencePort(detector, {
    requirements: {
      problemId: FIXTURE_PROBLEM_ID,
      requirements: [
        {
          kind: "evidence_sufficiency",
          requirementId: REQ_ID_IMAGERY,
          subjectRef: FIXTURE_WALL_OBJECT_ID,
          method: "STILL_IMAGERY",
          requiredCount: 2,
          description: "Two independent crack photos.",
        },
        {
          kind: "uncertainty_bound",
          requirementId: REQ_ID_STEEL_SECTION,
          subjectRef: FIXTURE_WALL_OBJECT_ID,
          propertyKey: "remaining_steel_section",
          requiredUnit: "mm2",
          maxSigma: 3,
          description: "Remaining steel section with 1σ ≤ 3.0 mm².",
        },
        {
          kind: "epistemic_floor",
          requirementId: REQ_ID_MATERIAL,
          subjectRef: FIXTURE_WALL_OBJECT_ID,
          propertyKey: "structural_material",
          minStatus: "OBSERVED",
          description: "Material observed, not BIM-asserted.",
        },
      ],
    },
    envelope: envelopeOutcome.value,
    context,
    detectedAt: PROBLEM_FIXTURE_RECORDED_AT,
  });
  expect(reportOutcome.ok).toBe(true);
  if (!reportOutcome.ok) {
    throw new Error(reportOutcome.failure.detail);
  }
  return reportOutcome.value;
}

describe("evidence — the Evidence Envelope laws (stage 3)", () => {
  test("the fixture envelope binds cleanly and carries the drawing bundle", () => {
    const outcome = bindProblemEvidence(SCENARIO_B_EVIDENCE_INPUT, CONTEXT_B);
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.value.evidence).toHaveLength(4);
      expect(outcome.value.provenanceLinks).toHaveLength(4);
      expect(outcome.value.bundles).toHaveLength(2);
      expect(outcome.value.invalidatedContentIds).toEqual([]);
      expect(outcome.value.kind).toBe("problem-evidence-envelope");
    }
  });

  test("duplicate evidence identity is refused (identity IS the content address)", () => {
    const outcome = bindProblemEvidence(DUPLICATE_EVIDENCE_INPUT, CONTEXT_B);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.failure.detail).toContain("duplicate");
    }
  });

  test("a provenance link citing unregistered evidence is refused", () => {
    const outcome = bindProblemEvidence(UNRESOLVED_LINK_INPUT, CONTEXT_B);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.failure.detail).toContain("not in the envelope");
    }
  });

  test("a provenance link citing an unresolvable subject is refused", () => {
    const outcome = bindProblemEvidence(UNRESOLVED_SUBJECT_INPUT, CONTEXT_B);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.failure.detail).toContain("does not resolve in the case context");
    }
  });

  test("invalidating evidence that is not in the envelope is refused", () => {
    const input = {
      ...SCENARIO_B_EVIDENCE_INPUT,
      invalidatedContentIds: [textDigestOf("AISE-WORLD-P2-evidence-not-in-envelope")],
    };
    const outcome = bindProblemEvidence(input, CONTEXT_B);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.failure.detail).toContain("invalidating air");
    }
  });

  test("an envelope for a different problem is refused", () => {
    const input = {
      ...SCENARIO_B_EVIDENCE_INPUT,
      problemId: textDigestOf("AISE-WORLD-P2-a-different-problem"),
    };
    const outcome = bindProblemEvidence(input, CONTEXT_B);
    expect(outcome.ok).toBe(false);
  });
});

describe("evidence — the fail-closed detection laws (stage 4)", () => {
  test("an empty requirement set is refused — never vacuously READY", () => {
    const envelopeOutcome = bindProblemEvidence(SCENARIO_B_EVIDENCE_INPUT, CONTEXT_B);
    expect(envelopeOutcome.ok).toBe(true);
    if (!envelopeOutcome.ok) {
      throw new Error(envelopeOutcome.failure.detail);
    }
    const outcome = detectThroughEvidencePort(referenceMissingEvidenceDouble, {
      requirements: EMPTY_REQUIREMENT_SET,
      envelope: envelopeOutcome.value,
      context: CONTEXT_B,
      detectedAt: PROBLEM_FIXTURE_RECORDED_AT,
    });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.failure.kind).toBe("contract-mismatch");
      expect(outcome.failure.detail).toContain("never vacuously READY");
    }
  });

  test("a requirement whose subject does not resolve is refused", () => {
    const envelopeOutcome = bindProblemEvidence(SCENARIO_B_EVIDENCE_INPUT, CONTEXT_B);
    expect(envelopeOutcome.ok).toBe(true);
    if (!envelopeOutcome.ok) {
      throw new Error(envelopeOutcome.failure.detail);
    }
    const outcome = detectThroughEvidencePort(referenceMissingEvidenceDouble, {
      requirements: UNRESOLVED_SUBJECT_REQUIREMENT_SET,
      envelope: envelopeOutcome.value,
      context: CONTEXT_B,
      detectedAt: PROBLEM_FIXTURE_RECORDED_AT,
    });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.failure.detail).toContain("does not resolve");
    }
  });

  test("a malformed requirement (requiredCount 0) is refused by the validator", () => {
    const envelopeOutcome = bindProblemEvidence(SCENARIO_B_EVIDENCE_INPUT, CONTEXT_B);
    expect(envelopeOutcome.ok).toBe(true);
    if (!envelopeOutcome.ok) {
      throw new Error(envelopeOutcome.failure.detail);
    }
    const outcome = detectThroughEvidencePort(referenceMissingEvidenceDouble, {
      requirements: BAD_COUNT_REQUIREMENT_SET,
      envelope: envelopeOutcome.value,
      context: CONTEXT_B,
      detectedAt: PROBLEM_FIXTURE_RECORDED_AT,
    });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.failure.detail).toContain("requiredCount");
    }
  });
});

describe("evidence — the fixture verdicts (the two scenarios)", () => {
  for (const double of DOUBLES) {
    test(`scenario A through the ${double.name} double: NOT_READY with the MISSING steel-section gap`, () => {
      const report = detectFixture(double.detector, SCENARIO_A_EVIDENCE_INPUT, CONTEXT_A);
      expect(report.verdict).toBe("NOT_READY");
      const gapKinds = report.gaps.map((gap) => gap.kind).sort();
      expect(gapKinds).toEqual(["MISSING", "WEAK"]);
      const steelGap = report.gaps.find((gap) => gap.requirementId === REQ_ID_STEEL_SECTION);
      expect(steelGap).toBeDefined();
      expect(steelGap!.kind).toBe("MISSING");
      expect(steelGap!.detail).toContain("remaining_steel_section");
      /* Every gap carries an explicit open remediation task with a task id. */
      for (const gap of report.gaps) {
        expect(gap.remediationTask.status).toBe("open");
        expect(gap.remediationTask.taskId).toMatch(/^[0-9a-f]{64}$/);
        expect(gap.gapId).toMatch(/^[0-9a-f]{64}$/);
      }
    });

    test(`scenario B through the ${double.name} double: READY, no gaps`, () => {
      const report = detectFixture(double.detector, SCENARIO_B_EVIDENCE_INPUT, CONTEXT_B);
      expect(report.verdict).toBe("READY");
      expect(report.gaps).toEqual([]);
      for (const assessment of report.perRequirement) {
        expect(assessment.satisfied).toBe(true);
      }
    });
  }

  test("the two doubles produce BYTE-IDENTICAL reports on both scenarios", () => {
    const referenceA = detectFixture(referenceMissingEvidenceDouble, SCENARIO_A_EVIDENCE_INPUT, CONTEXT_A);
    const alternateA = detectFixture(alternateMissingEvidenceDouble, SCENARIO_A_EVIDENCE_INPUT, CONTEXT_A);
    expect(referenceA).toEqual(alternateA);
    expect(referenceA.reportId).toBe(alternateA.reportId);
    const referenceB = detectFixture(referenceMissingEvidenceDouble, SCENARIO_B_EVIDENCE_INPUT, CONTEXT_B);
    const alternateB = detectFixture(alternateMissingEvidenceDouble, SCENARIO_B_EVIDENCE_INPUT, CONTEXT_B);
    expect(referenceB).toEqual(alternateB);
  });

  test("determinism: the seal is the content digest of the report minus its own id", () => {
    for (const double of DOUBLES) {
      const first = detectFixture(double.detector, SCENARIO_A_EVIDENCE_INPUT, CONTEXT_A);
      const second = detectFixture(double.detector, SCENARIO_A_EVIDENCE_INPUT, CONTEXT_A);
      expect(first).toEqual(second);
      const { reportId, ...body } = first;
      const resealed = sealMissingEvidenceReport(body);
      expect(resealed.reportId).toBe(reportId);
    }
  });
});

describe("evidence — the per-requirement disciplines", () => {
  test("invalidated evidence is discounted, never silently deleted", () => {
    const input = {
      ...SCENARIO_B_EVIDENCE_INPUT,
      invalidatedContentIds: [FIXTURE_EVIDENCE_PHOTO_2.contentId],
    };
    const envelopeOutcome = bindProblemEvidence(input, CONTEXT_B);
    expect(envelopeOutcome.ok).toBe(true);
    if (!envelopeOutcome.ok) {
      throw new Error(envelopeOutcome.failure.detail);
    }
    expect(envelopeOutcome.value.evidence).toHaveLength(4); /* the record STAYS */
    const report = detectFixture(
      referenceMissingEvidenceDouble,
      input,
      CONTEXT_B,
    );
    /* Photo 2 discounted: imagery 1-of-2 → WEAK; steel-section assertion cites
     * photo 2 but assertions are not invalidated by the envelope; the verdict
     * drops to READY_WITH_NOTES through the imagery gap. */
    expect(report.verdict).toBe("READY_WITH_NOTES");
    const imageryAssessment = report.perRequirement.find(
      (assessment) => assessment.requirementId === REQ_ID_IMAGERY,
    );
    expect(imageryAssessment).toBeDefined();
    if (imageryAssessment?.kind === "evidence_sufficiency") {
      expect(imageryAssessment.validCount).toBe(1);
      expect(imageryAssessment.invalidCount).toBe(1);
      expect(imageryAssessment.satisfied).toBe(false);
    }
  });

  test("the epistemic floor is not satisfied by INFERRED substrate candidates", () => {
    /* A context whose ONLY material assertions are the substrate's INFERRED
     * properties on the wall candidate — the floor requires OBSERVED, so
     * the gap is honest (a file says so; the site may differ). */
    const wallCandidate = CONTEXT_B.substrateCandidates[0]!.aise.realityObjects.find(
      (object) => object.kind === "wall",
    );
    expect(wallCandidate).toBeDefined();
    const context = {
      ...CONTEXT_B,
      propertyAssertions: CONTEXT_B.substrateCandidates[0]!.aise.propertyAssertions,
    };
    const envelopeOutcome = bindProblemEvidence(SCENARIO_B_EVIDENCE_INPUT, CONTEXT_B);
    expect(envelopeOutcome.ok).toBe(true);
    if (!envelopeOutcome.ok) {
      throw new Error(envelopeOutcome.failure.detail);
    }
    const report = detectThroughEvidencePort(referenceMissingEvidenceDouble, {
      requirements: {
        problemId: FIXTURE_PROBLEM_ID,
        requirements: [
          {
            kind: "epistemic_floor",
            requirementId: REQ_ID_MATERIAL,
            subjectRef: wallCandidate!.objectId,
            propertyKey: "LoadBearing",
            minStatus: "OBSERVED",
            description: "The BIM file's word is not an observation.",
          },
        ],
      },
      envelope: envelopeOutcome.value,
      context,
      detectedAt: PROBLEM_FIXTURE_RECORDED_AT,
    });
    expect(report.ok).toBe(true);
    if (report.ok) {
      expect(report.value.verdict).toBe("READY_WITH_NOTES");
      const gap = report.value.gaps[0]!;
      expect(gap.kind).toBe("WEAK");
      expect(gap.detail).toContain("below the required floor OBSERVED");
    }
  });

  test("sigma-not-reported answers WEAK, never a fabricated zero", () => {
    const context = {
      ...CONTEXT_B,
      propertyAssertions: [
        {
          ...FIXTURE_ASSERTION_DEFLECTION,
          uncertainty: undefined,
        },
      ],
    };
    const envelopeOutcome = bindProblemEvidence(SCENARIO_B_EVIDENCE_INPUT, CONTEXT_B);
    expect(envelopeOutcome.ok).toBe(true);
    if (!envelopeOutcome.ok) {
      throw new Error(envelopeOutcome.failure.detail);
    }
    const report = detectThroughEvidencePort(referenceMissingEvidenceDouble, {
      requirements: {
        problemId: FIXTURE_PROBLEM_ID,
        requirements: [
          {
            kind: "uncertainty_bound",
            requirementId: REQ_ID_STEEL_SECTION,
            subjectRef: FIXTURE_WALL_OBJECT_ID,
            propertyKey: "midspan_deflection",
            requiredUnit: "mm",
            maxSigma: 3,
            description: "Deflection with 1σ ≤ 3.0 mm.",
          },
        ],
      },
      envelope: envelopeOutcome.value,
      context,
      detectedAt: PROBLEM_FIXTURE_RECORDED_AT,
    });
    expect(report.ok).toBe(true);
    if (report.ok) {
      expect(report.value.verdict).toBe("READY_WITH_NOTES");
      const gap = report.value.gaps[0]!;
      expect(gap.kind).toBe("WEAK");
      expect(gap.detail).toContain("declares a 1σ");
    }
  });

  test("sigma above the bound answers WEAK with the measured maximum named", () => {
    const context = {
      ...CONTEXT_B,
      propertyAssertions: [
        {
          ...FIXTURE_ASSERTION_STEEL_SECTION,
          uncertainty: { kind: "STATISTICAL" as const, plusMinus: 4.5, level: "1σ" },
        },
      ],
    };
    const envelopeOutcome = bindProblemEvidence(SCENARIO_B_EVIDENCE_INPUT, CONTEXT_B);
    expect(envelopeOutcome.ok).toBe(true);
    if (!envelopeOutcome.ok) {
      throw new Error(envelopeOutcome.failure.detail);
    }
    const report = detectThroughEvidencePort(referenceMissingEvidenceDouble, {
      requirements: {
        problemId: FIXTURE_PROBLEM_ID,
        requirements: [
          {
            kind: "uncertainty_bound",
            requirementId: REQ_ID_STEEL_SECTION,
            subjectRef: FIXTURE_WALL_OBJECT_ID,
            propertyKey: "remaining_steel_section",
            requiredUnit: "mm2",
            maxSigma: 3,
            description: "Sigma bound drill.",
          },
        ],
      },
      envelope: envelopeOutcome.value,
      context,
      detectedAt: PROBLEM_FIXTURE_RECORDED_AT,
    });
    expect(report.ok).toBe(true);
    if (report.ok) {
      expect(report.value.verdict).toBe("READY_WITH_NOTES");
      const gap = report.value.gaps[0]!;
      expect(gap.detail).toContain("4.5");
      expect(gap.detail).toContain("above the declared bound 3");
    }
  });

  test("a unit mismatch answers AMBIGUOUS", () => {
    const context = {
      ...CONTEXT_B,
      propertyAssertions: [
        { ...FIXTURE_ASSERTION_STEEL_SECTION, unit: "cm2" },
      ],
    };
    const envelopeOutcome = bindProblemEvidence(SCENARIO_B_EVIDENCE_INPUT, CONTEXT_B);
    expect(envelopeOutcome.ok).toBe(true);
    if (!envelopeOutcome.ok) {
      throw new Error(envelopeOutcome.failure.detail);
    }
    const report = detectThroughEvidencePort(referenceMissingEvidenceDouble, {
      requirements: {
        problemId: FIXTURE_PROBLEM_ID,
        requirements: [
          {
            kind: "uncertainty_bound",
            requirementId: REQ_ID_STEEL_SECTION,
            subjectRef: FIXTURE_WALL_OBJECT_ID,
            propertyKey: "remaining_steel_section",
            requiredUnit: "mm2",
            maxSigma: 3,
            description: "Unit mismatch drill.",
          },
        ],
      },
      envelope: envelopeOutcome.value,
      context,
      detectedAt: PROBLEM_FIXTURE_RECORDED_AT,
    });
    expect(report.ok).toBe(true);
    if (report.ok) {
      expect(report.value.verdict).toBe("READY_WITH_NOTES");
      const gap = report.value.gaps[0]!;
      expect(gap.kind).toBe("AMBIGUOUS");
      expect(gap.detail).toContain("unit");
    }
  });
});

describe("evidence — the worst-of verdict law + the monotonicity fuzz", () => {
  test("the verdict contributions and the worst-of roll-up obey the frozen order", () => {
    expect(verdictOfGapKind("MISSING")).toBe("NOT_READY");
    expect(verdictOfGapKind("WEAK")).toBe("READY_WITH_NOTES");
    expect(verdictOfGapKind("AMBIGUOUS")).toBe("READY_WITH_NOTES");
    expect(worstOfVerdicts([])).toBe("READY");
    expect(worstOfVerdicts(["READY", "READY_WITH_NOTES"])).toBe("READY_WITH_NOTES");
    expect(worstOfVerdicts(["READY_WITH_NOTES", "NOT_READY"])).toBe("NOT_READY");
    expect(worstOfVerdicts(["NOT_READY", "INSUFFICIENT_DATA"])).toBe("INSUFFICIENT_DATA");
    expect(worstOfVerdicts(["READY", "NOT_READY", "READY_WITH_NOTES"])).toBe("NOT_READY");
  });

  test("fuzz: growing valid evidence is monotone and order-independent", () => {
    let seed = 0x2e02;
    const next = (): number => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed;
    };
    const verdictRank: Record<string, number> = {
      INSUFFICIENT_DATA: 0,
      NOT_READY: 1,
      READY_WITH_NOTES: 2,
      READY: 3,
    };
    /* The base envelope carries only the drawing + gauge (no photos): the
     * imagery requirement is MISSING → NOT_READY. Adding valid photos must
     * be monotone: 0 → NOT_READY, 1 → READY_WITH_NOTES, ≥2 → READY. */
    const verdictsByCount: string[] = [];
    for (let photoCount = 0; photoCount <= 4; photoCount += 1) {
      const photos = Array.from({ length: photoCount }, (_, index) => ({
        ...FIXTURE_EVIDENCE_PHOTO_1,
        contentId: textDigestOf(`AISE-WORLD-P2-fuzz-photo-${index}`),
      }));
      const input = {
        ...SCENARIO_B_EVIDENCE_INPUT,
        evidence: [
          ...SCENARIO_B_EVIDENCE_INPUT.evidence.filter(
            (record) => record.acquisitionMethod !== "STILL_IMAGERY",
          ),
          ...photos,
        ],
        provenanceLinks: [
          ...SCENARIO_B_EVIDENCE_INPUT.provenanceLinks.filter(
            (link) => !photos.concat([FIXTURE_EVIDENCE_PHOTO_1, FIXTURE_EVIDENCE_PHOTO_2]).some((photo) => photo.contentId === link.evidenceContentId),
          ),
          ...photos.map((photo) => ({
            contractVersion: CONTRACT_VERSION,
            subjectKind: "reality_object",
            subjectId: FIXTURE_WALL_OBJECT_ID,
            evidenceContentId: photo.contentId,
            role: "SUPPORTS" as const,
          })),
        ],
      };
      const report = detectFixture(referenceMissingEvidenceDouble, input, CONTEXT_B);
      verdictsByCount.push(report.verdict);
    }
    expect(verdictsByCount[0]).toBe("NOT_READY");
    expect(verdictsByCount[1]).toBe("READY_WITH_NOTES");
    expect(verdictsByCount[2]).toBe("READY");
    for (let index = 1; index < verdictsByCount.length; index += 1) {
      expect(verdictRank[verdictsByCount[index]!]!).toBeGreaterThanOrEqual(
        verdictRank[verdictsByCount[index - 1]!]!,
      );
    }
    /* Order independence: the same photo set in a shuffled link order yields
     * the identical report id. */
    for (let iteration = 0; iteration < 200; iteration += 1) {
      const photoCount = 2 + (next() % 3);
      const photos = Array.from({ length: photoCount }, (_, index) => ({
        ...FIXTURE_EVIDENCE_PHOTO_1,
        contentId: textDigestOf(`AISE-WORLD-P2-fuzz-photo-${index}`),
      }));
      const links = photos.map((photo) => ({
        contractVersion: CONTRACT_VERSION,
        subjectKind: "reality_object",
        subjectId: FIXTURE_WALL_OBJECT_ID,
        evidenceContentId: photo.contentId,
        role: "SUPPORTS" as const,
      }));
      const baseEvidence = SCENARIO_B_EVIDENCE_INPUT.evidence.filter(
        (record) => record.acquisitionMethod !== "STILL_IMAGERY",
      );
      const shuffledLinks = [...links];
      for (let swap = shuffledLinks.length - 1; swap > 0; swap -= 1) {
        const pick = next() % (swap + 1);
        const held = shuffledLinks[swap]!;
        shuffledLinks[swap] = shuffledLinks[pick]!;
        shuffledLinks[pick] = held;
      }
      const first = detectFixture(
        referenceMissingEvidenceDouble,
        {
          ...SCENARIO_B_EVIDENCE_INPUT,
          evidence: [...baseEvidence, ...photos],
          provenanceLinks: shuffledLinks,
        },
        CONTEXT_B,
      );
      const second = detectFixture(
        alternateMissingEvidenceDouble,
        {
          ...SCENARIO_B_EVIDENCE_INPUT,
          evidence: [...photos.slice().reverse(), ...baseEvidence],
          provenanceLinks: shuffledLinks.slice().reverse(),
        },
        CONTEXT_B,
      );
      expect(first.reportId).toBe(second.reportId);
      expect(first.verdict).toBe("READY");
    }
  });

  test("the provenance links and gauge evidence are the committed fixtures", () => {
    expect(FIXTURE_PROVENANCE_LINKS).toHaveLength(4);
    expect(FIXTURE_EVIDENCE_GAUGE.acquisitionMethod).toBe("MANUAL_MEASUREMENT");
    expect(FIXTURE_EVIDENCE_PHOTO_1.acquisitionMethod).toBe("STILL_IMAGERY");
    expect(FIXTURE_EVIDENCE_PHOTO_2.acquisitionMethod).toBe("STILL_IMAGERY");
    expect(FIXTURE_ASSERTION_MATERIAL.status).toBe("OBSERVED");
  });
});
