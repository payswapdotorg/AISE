/**
 * AISE-022 device-awareness tests — THE NO-DOWNGRADE DISCRIMINATION (core
 * invariant of this Work Item): identical evidence evaluated with weak vs
 * strong device profiles must yield byte-identical readiness verdicts and
 * dimension results; ONLY gap remediation hints (deviceHint) may differ,
 * and the exact difference set is asserted. A weak device never lowers the
 * bar; it gets the same NOT_READY/INSUFFICIENT_DATA verdict plus
 * escalation-oriented remediation annotations.
 */

import { describe, expect, test } from "bun:test";
import { canonicalJsonStringify } from "@aise/shared-contracts";
import {
  DIMENSIONAL_SURVEY_PROFILE,
  serializeReadinessReport,
  type DeviceRemediationHint,
  type ReadinessGap,
  type ReadinessReport,
} from "./index";
import { device, evidence, evaluate, gapOf, node, outcomeOf, prop } from "./testkit";

const WEAK_DEVICE = device({
  "capability.depth_sensing": "unavailable",
  "capability.visual_reconstruction": "available",
});
const STRONG_DEVICE = device({
  "capability.depth_sensing": "available",
  "capability.visual_reconstruction": "available",
});

/** One short depth pass + good properties: verdict NOT_READY for EVERY device. */
function shortEvidence(): ReturnType<typeof evidence>[] {
  return [evidence("ev-depth-1", "DEPTH_SENSING", { linkedNodeIds: ["space-1", "space-2"] })];
}

function surveyNodes(): ReturnType<typeof node>[] {
  return [
    node("space-1", [
      prop("room.height", 2.7, { unit: "m", sigma: 0.01 }),
      prop("room.width", 4.2, { unit: "m", sigma: 0.01 }),
      prop("element.material", "concrete"),
    ]),
    node("space-2", [
      prop("room.height", 3.1, { unit: "m", sigma: 0.015 }),
      prop("room.width", 3.0, { unit: "m", sigma: 0.015 }),
      prop("element.material", "brick"),
    ]),
  ];
}

/** Gap projection without the deviceHint (for exact-difference-set checks). */
function gapWithoutHint(gap: ReadinessGap): Omit<ReadinessGap, "deviceHint"> {
  return {
    gapId: gap.gapId,
    dimensionId: gap.dimensionId,
    critical: gap.critical,
    requirement: gap.requirement,
    remediation: gap.remediation,
  };
}

describe("no-downgrade discrimination (core)", () => {
  test("identical evidence + weak vs strong device: readiness and dimensions are BYTE-identical", () => {
    const weak = evaluate(DIMENSIONAL_SURVEY_PROFILE, surveyNodes(), shortEvidence(), WEAK_DEVICE);
    const strong = evaluate(DIMENSIONAL_SURVEY_PROFILE, surveyNodes(), shortEvidence(), STRONG_DEVICE);
    expect(weak.readiness).toBe(strong.readiness);
    expect(canonicalJsonStringify(weak.dimensions)).toBe(canonicalJsonStringify(strong.dimensions));
    expect(canonicalJsonStringify({ readiness: weak.readiness })).toBe(
      canonicalJsonStringify({ readiness: strong.readiness }),
    );
  });

  test("the exact difference set is gap.deviceHint — nothing else in the report differs", () => {
    const weak = evaluate(DIMENSIONAL_SURVEY_PROFILE, surveyNodes(), shortEvidence(), WEAK_DEVICE);
    const strong = evaluate(DIMENSIONAL_SURVEY_PROFILE, surveyNodes(), shortEvidence(), STRONG_DEVICE);
    // Verdict surfaces identical…
    expect(weak.readiness).toBe(strong.readiness);
    expect(canonicalJsonStringify(weak.dimensions)).toBe(canonicalJsonStringify(strong.dimensions));
    // …gaps identical once the annotation is stripped…
    expect(canonicalJsonStringify(weak.gaps.map(gapWithoutHint))).toBe(
      canonicalJsonStringify(strong.gaps.map(gapWithoutHint)),
    );
    // …and the annotation exists ONLY on the evidence-method gap.
    const differing = weak.gaps.filter(
      (gap, index) => canonicalJsonStringify(gap.deviceHint) !== canonicalJsonStringify(strong.gaps[index]?.deviceHint),
    );
    expect(differing.map((gap) => gap.dimensionId)).toEqual(["spatial-depth-evidence"]);
  });

  test("weak device gets the SAME fail-closed verdict (NOT_READY), never 'ready enough for this device'", () => {
    const weak = evaluate(DIMENSIONAL_SURVEY_PROFILE, surveyNodes(), shortEvidence(), WEAK_DEVICE);
    const noDevice = evaluate(DIMENSIONAL_SURVEY_PROFILE, surveyNodes(), shortEvidence());
    expect(weak.readiness).toBe("NOT_READY");
    expect(weak.readiness).toBe(noDevice.readiness);
    expect(canonicalJsonStringify(weak.dimensions)).toBe(canonicalJsonStringify(noDevice.dimensions));
  });

  test("gap.requirement is byte-identical across none/weak/strong device profiles (the bar never changes)", () => {
    const none = evaluate(DIMENSIONAL_SURVEY_PROFILE, surveyNodes(), shortEvidence());
    const weak = evaluate(DIMENSIONAL_SURVEY_PROFILE, surveyNodes(), shortEvidence(), WEAK_DEVICE);
    const strong = evaluate(DIMENSIONAL_SURVEY_PROFILE, surveyNodes(), shortEvidence(), STRONG_DEVICE);
    for (const report of [none, weak, strong]) {
      const depthGap = gapOf(report, "spatial-depth-evidence");
      expect(depthGap?.requirement).toEqual({ kind: "evidence_sufficiency", method: "DEPTH_SENSING", minCount: 2 });
    }
    expect(
      canonicalJsonStringify(weak.gaps.map((gap) => gap.requirement)),
    ).toBe(canonicalJsonStringify(strong.gaps.map((gap) => gap.requirement)));
  });
});

describe("device remediation hint content (annotation only)", () => {
  test("weak device (no depth): hint switches remediation to governed substitution candidates, requirement unchanged", () => {
    const report = evaluate(DIMENSIONAL_SURVEY_PROFILE, surveyNodes(), shortEvidence(), WEAK_DEVICE);
    const hint = gapOf(report, "spatial-depth-evidence")?.deviceHint as DeviceRemediationHint;
    expect(hint.requiredMethod).toBe("DEPTH_SENSING");
    expect(hint.requiredMethodPlausibility).toBe("unavailable");
    expect(hint.alternativeMethods.map((alternative) => alternative.method)).toEqual([
      "CALIBRATED_REFERENCE",
      "MANUAL_MEASUREMENT",
      "SPECIALIST_INSTRUMENT",
    ]);
    expect(hint.note).toContain("UNCHANGED");
    expect(hint.note).toContain("CALIBRATED_REFERENCE");
    expect(hint.consultedCapabilityFacts).toContainEqual({
      key: "capability.depth_sensing",
      value: "unavailable",
    });
  });

  test("strong device (depth available): hint says capture more of the required method, no alternatives suggested", () => {
    const report = evaluate(DIMENSIONAL_SURVEY_PROFILE, surveyNodes(), shortEvidence(), STRONG_DEVICE);
    const hint = gapOf(report, "spatial-depth-evidence")?.deviceHint as DeviceRemediationHint;
    expect(hint.requiredMethodPlausibility).toBe("available");
    expect(hint.alternativeMethods).toEqual([]);
    expect(hint.note).toContain("capture 1 more valid DEPTH_SENSING evidence item");
  });

  test("degraded capability: hint marks degraded, expects higher operator burden, no alternatives", () => {
    const report = evaluate(
      DIMENSIONAL_SURVEY_PROFILE,
      surveyNodes(),
      shortEvidence(),
      device({ "capability.depth_sensing": "degraded" }),
    );
    const hint = gapOf(report, "spatial-depth-evidence")?.deviceHint as DeviceRemediationHint;
    expect(hint.requiredMethodPlausibility).toBe("degraded");
    expect(hint.alternativeMethods).toEqual([]);
    expect(hint.note).toContain("degraded");
  });

  test("no device profile -> gaps carry no deviceHint at all", () => {
    const report = evaluate(DIMENSIONAL_SURVEY_PROFILE, surveyNodes(), shortEvidence());
    for (const gap of report.gaps) {
      expect(gap.deviceHint).toBeUndefined();
    }
    expect(serializeReadinessReport(report)).not.toContain("deviceHint");
  });

  test("missing capability fact stays UNDETERMINED (unknown is never collapsed to unavailable)", () => {
    const report = evaluate(DIMENSIONAL_SURVEY_PROFILE, surveyNodes(), shortEvidence(), device({}));
    const hint = gapOf(report, "spatial-depth-evidence")?.deviceHint as DeviceRemediationHint;
    expect(hint.requiredMethodPlausibility).toBe("undetermined");
    expect(hint.note).toContain("no capability fact");
    expect(report.readiness).toBe("NOT_READY");
  });

  test("unrecognized capability value stays UNDETERMINED and is named", () => {
    const report = evaluate(
      DIMENSIONAL_SURVEY_PROFILE,
      surveyNodes(),
      shortEvidence(),
      device({ "capability.depth_sensing": "maybe?" }),
    );
    const hint = gapOf(report, "spatial-depth-evidence")?.deviceHint as DeviceRemediationHint;
    expect(hint.requiredMethodPlausibility).toBe("undetermined");
    expect(hint.note).toContain("not recognized");
  });

  test("alternatives carry their own device plausibility", () => {
    const report = evaluate(
      DIMENSIONAL_SURVEY_PROFILE,
      surveyNodes(),
      shortEvidence(),
      device({
        "capability.depth_sensing": "unavailable",
        "capability.manual_measurement": "available",
        "capability.specialist_instrument": "unavailable",
      }),
    );
    const hint = gapOf(report, "spatial-depth-evidence")?.deviceHint as DeviceRemediationHint;
    expect(hint.alternativeMethods).toEqual([
      { method: "CALIBRATED_REFERENCE", plausibility: "undetermined" },
      { method: "MANUAL_MEASUREMENT", plausibility: "available" },
      { method: "SPECIALIST_INSTRUMENT", plausibility: "unavailable" },
    ]);
    expect(hint.consultedCapabilityFacts).toEqual([
      { key: "capability.depth_sensing", value: "unavailable" },
      { key: "capability.manual_measurement", value: "available" },
      { key: "capability.specialist_instrument", value: "unavailable" },
    ]);
  });

  test("non-evidence gaps never receive a device hint (annotation scope is method-related gaps)", () => {
    const report = evaluate(
      DIMENSIONAL_SURVEY_PROFILE,
      [node("space-1", [prop("room.width", 4.2, { unit: "m", sigma: 0.01 })])],
      [evidence("e1", "DEPTH_SENSING")],
      WEAK_DEVICE,
    );
    expect(gapOf(report, "room-height-uncertainty")?.deviceHint).toBeUndefined();
    expect(gapOf(report, "surface-coverage")?.deviceHint).toBeUndefined();
    expect(gapOf(report, "spatial-depth-evidence")?.deviceHint).toBeDefined();
  });

  test("device profile cannot change a dimension outcome even when EVERY capability is unavailable", () => {
    const fullyWeak = device(
      Object.fromEntries(
        [
          "capability.depth_sensing",
          "capability.visual_reconstruction",
          "capability.calibrated_reference",
          "capability.manual_measurement",
          "capability.specialist_instrument",
          "capability.video_footage",
          "capability.still_imagery",
          "capability.instrument_reading",
          "capability.human_answer",
          "capability.document_region",
        ].map((key) => [key, "unavailable"]),
      ),
    );
    const nodes = surveyNodes();
    const evidenceFacts = shortEvidence();
    const withDevice: ReadinessReport = evaluate(DIMENSIONAL_SURVEY_PROFILE, nodes, evidenceFacts, fullyWeak);
    const withoutDevice: ReadinessReport = evaluate(DIMENSIONAL_SURVEY_PROFILE, nodes, evidenceFacts);
    expect(withDevice.readiness).toBe(withoutDevice.readiness);
    expect(canonicalJsonStringify(withDevice.dimensions)).toBe(canonicalJsonStringify(withoutDevice.dimensions));
    expect(outcomeOf(withDevice, "spatial-depth-evidence").outcome).toBe(
      outcomeOf(withoutDevice, "spatial-depth-evidence").outcome,
    );
  });
});
