import { describe, expect, it } from "vitest";
import { runModelQa } from "../runtime.js";
import {
  confirmedRoomHeight,
  handBuiltGraph,
  smallMapping,
  smallRoomGraph,
  SURVEY_EVIDENCE_ID,
  OTHER_EVIDENCE_ID,
} from "../testing.js";
import { propertyAssertion } from "@aise/engineering-model";
import type { QaRunInput, ReadinessContextInput } from "../inputs.js";

const PROFILE = "CRITICAL" as const;

function qa(input: Omit<QaRunInput, "version" | "profile">) {
  return runModelQa({ ...input, version: 1, profile: PROFILE });
}

function codes(report: ReturnType<typeof qa>): string[] {
  return report.findings.map((finding) => finding.code);
}

describe("epistemic family — CONFIRMED assertion verification state", () => {
  it("a CONFIRMED assertion with live covering support is clean", () => {
    const graph = handBuiltGraph(
      smallRoomGraph(),
      (draft) => {
        (draft.spaces[0]! as { properties?: unknown[] }).properties = [confirmedRoomHeight()];
      },
    );
    const report = qa({ graph, mapping: smallMapping({ linkRoomHeight: true }) });
    expect(codes(report)).not.toContain("CONFIRMATION_INVALIDATED");
    expect(codes(report)).not.toContain("CONFIRMATION_UNSUPPORTED");
  });

  it("a CONFIRMED assertion whose link was retracted is CONFIRMATION_INVALIDATED (AC-063)", () => {
    const graph = handBuiltGraph(
      smallRoomGraph(),
      (draft) => {
        (draft.spaces[0]! as { properties?: unknown[] }).properties = [confirmedRoomHeight()];
      },
    );
    const report = qa({ graph, mapping: smallMapping({ linkRoomHeight: true, retractRoomHeightLink: true }) });
    expect(codes(report)).toContain("CONFIRMATION_INVALIDATED");
    const finding = report.findings.find((f) => f.code === "CONFIRMATION_INVALIDATED")!;
    expect(finding.outcome).toBe("CONTRADICTION");
    expect(finding.blocking).toBe(true);
    expect(finding.evidenceRefs).toEqual([SURVEY_EVIDENCE_ID]);
    expect(finding.epistemic?.assertionStatus).toBe("CONFIRMED");
    expect(finding.detail).toContain("retracted");
  });

  it("a CONFIRMED assertion with a mapping but no live link is CONFIRMATION_INVALIDATED (AC-062: NO_LIVE_SUPPORT)", () => {
    const graph = handBuiltGraph(
      smallRoomGraph(),
      (draft) => {
        (draft.spaces[0]! as { properties?: unknown[] }).properties = [confirmedRoomHeight()];
      },
    );
    const report = qa({ graph, mapping: smallMapping() });
    expect(codes(report)).toContain("CONFIRMATION_INVALIDATED");
    const finding = report.findings.find((f) => f.code === "CONFIRMATION_INVALIDATED")!;
    expect(finding.outcome).toBe("CONTRADICTION");
    expect(finding.detail).toContain("NO_LIVE_SUPPORT");
  });

  it("a CONFIRMED assertion with NO mapping at all is CONFIRMATION_UNSUPPORTED", () => {
    const graph = handBuiltGraph(
      smallRoomGraph(),
      (draft) => {
        (draft.spaces[0]! as { properties?: unknown[] }).properties = [confirmedRoomHeight()];
      },
    );
    const report = qa({ graph });
    expect(codes(report)).toContain("CONFIRMATION_UNSUPPORTED");
  });

  it("a CONFIRMATION_UNSUPPORTED finding is advisory at LIGHT (policy table)", () => {
    const graph = handBuiltGraph(
      smallRoomGraph(),
      (draft) => {
        (draft.spaces[0]! as { properties?: unknown[] }).properties = [confirmedRoomHeight()];
      },
    );
    const light = runModelQa({ graph, version: 1, profile: "LIGHT" });
    const finding = light.findings.find((f) => f.code === "CONFIRMATION_UNSUPPORTED");
    expect(finding?.blocking).toBe(false);
  });

  it("non-CONFIRMED assertions never produce confirmation findings", () => {
    const graph = handBuiltGraph(
      smallRoomGraph(),
      (draft) => {
        (draft.spaces[0]! as { properties?: unknown[] }).properties = [
          propertyAssertion({
            key: "roomHeight",
            quantity: { value: 2.7, unit: "meter" },
            status: "INFERRED",
            kind: "estimate",
          }),
        ];
      },
    );
    const report = qa({ graph, mapping: smallMapping() });
    expect(codes(report)).not.toContain("CONFIRMATION_INVALIDATED");
    expect(codes(report)).not.toContain("CONFIRMATION_UNSUPPORTED");
  });
});

describe("epistemic family — cited evidence registration", () => {
  it("an assertion citing an unregistered evidence id is EVIDENCE_REF_UNREGISTERED", () => {
    const graph = handBuiltGraph(
      smallRoomGraph(),
      (draft) => {
        (draft.spaces[0]! as { properties?: unknown[] }).properties = [
          propertyAssertion({
            key: "roomHeight",
            quantity: { value: 2.7, unit: "meter" },
            status: "OBSERVED",
            kind: "measurement",
            evidenceRefs: ["ev-never-registered"],
          }),
        ];
      },
    );
    const report = qa({ graph, mapping: smallMapping() });
    expect(codes(report)).toContain("EVIDENCE_REF_UNREGISTERED");
    const finding = report.findings.find((f) => f.code === "EVIDENCE_REF_UNREGISTERED")!;
    expect(finding.evidenceRefs).toEqual(["ev-never-registered"]);
    expect(finding.outcome).toBe("INSUFFICIENT_EVIDENCE");
  });

  it("citing registered evidence is clean", () => {
    const graph = handBuiltGraph(
      smallRoomGraph(),
      (draft) => {
        (draft.spaces[0]! as { properties?: unknown[] }).properties = [
          propertyAssertion({
            key: "roomHeight",
            quantity: { value: 2.7, unit: "meter" },
            status: "OBSERVED",
            kind: "measurement",
            evidenceRefs: [SURVEY_EVIDENCE_ID, OTHER_EVIDENCE_ID],
          }),
        ];
      },
    );
    const report = qa({ graph, mapping: smallMapping() });
    expect(codes(report)).not.toContain("EVIDENCE_REF_UNREGISTERED");
  });

  it("without a mapping, registration cannot be verified — no finding is invented", () => {
    const graph = handBuiltGraph(
      smallRoomGraph(),
      (draft) => {
        (draft.spaces[0]! as { properties?: unknown[] }).properties = [
          propertyAssertion({
            key: "roomHeight",
            quantity: { value: 2.7, unit: "meter" },
            status: "OBSERVED",
            kind: "measurement",
            evidenceRefs: ["ev-anything"],
          }),
        ];
      },
    );
    const report = qa({ graph });
    expect(codes(report)).not.toContain("EVIDENCE_REF_UNREGISTERED");
  });
});

describe("epistemic family — no-silent-upgrade over geometry assets", () => {
  it("an OBSERVED object over INFERRED assets is EPISTEMIC_UPGRADE_VIOLATION", () => {
    const graph = handBuiltGraph(smallRoomGraph(), (draft) => {
      const floor = draft.objects.find((object) => object.objectClass === "FLOOR") as {
        geometry: { assetRefs?: Array<Record<string, unknown>> };
        epistemicState: string;
      };
      floor.geometry.assetRefs = [
        { kind: "point-cloud", contentHash: "e".repeat(64), pointCount: 5000, epistemic: "INFERRED" },
      ];
      floor.epistemicState = "OBSERVED";
    });
    const report = qa({ graph });
    expect(codes(report)).toContain("EPISTEMIC_UPGRADE_VIOLATION");
    const finding = report.findings.find((f) => f.code === "EPISTEMIC_UPGRADE_VIOLATION")!;
    expect(finding.outcome).toBe("CONTRADICTION");
    expect(finding.epistemic?.objectState).toBe("OBSERVED");
  });

  it("an INFERRED object over INFERRED assets is the honest extraction state", () => {
    const graph = handBuiltGraph(smallRoomGraph(), (draft) => {
      const floor = draft.objects.find((object) => object.objectClass === "FLOOR") as {
        geometry: { assetRefs?: Array<Record<string, unknown>> };
      };
      floor.geometry.assetRefs = [
        { kind: "point-cloud", contentHash: "e".repeat(64), pointCount: 5000, epistemic: "INFERRED" },
      ];
    });
    expect(codes(qa({ graph }))).not.toContain("EPISTEMIC_UPGRADE_VIOLATION");
  });

  it("a CONFIRMED object over PROPOSED assets is an upgrade violation", () => {
    const graph = handBuiltGraph(smallRoomGraph(), (draft) => {
      const floor = draft.objects.find((object) => object.objectClass === "FLOOR") as {
        geometry: { assetRefs?: Array<Record<string, unknown>> };
        epistemicState: string;
      };
      floor.geometry.assetRefs = [
        { kind: "point-cloud", contentHash: "e".repeat(64), pointCount: 5000, epistemic: "PROPOSED" },
      ];
      floor.epistemicState = "CONFIRMED";
    });
    expect(codes(qa({ graph }))).toContain("EPISTEMIC_UPGRADE_VIOLATION");
  });

  it("an object with no assets has nothing to violate (vacuously clean)", () => {
    expect(codes(qa({ graph: smallRoomGraph() }))).not.toContain("EPISTEMIC_UPGRADE_VIOLATION");
  });
});

describe("epistemic family — readiness context pinning", () => {
  const graph = smallRoomGraph();
  const mapping = smallMapping({ linkRoomHeight: true });
  const valid: ReadinessContextInput = {
    taskId: "task-comply",
    verdict: "READY",
    assuranceProfile: "CRITICAL",
    modelId: graph.modelId,
    version: 1,
    graphDigest: graph.digest,
    mappingDigest: mapping.digest,
  };

  it("a correctly pinned readiness context produces no finding", () => {
    const report = qa({ graph, mapping, readiness: valid });
    expect(codes(report)).not.toContain("READINESS_CONTEXT_MISMATCH");
    expect(report.readiness?.verdict).toBe("READY");
  });

  it("a stale graph digest pin is READINESS_CONTEXT_MISMATCH (contradiction)", () => {
    const report = qa({ graph, mapping, readiness: { ...valid, graphDigest: "0".repeat(64) } });
    expect(codes(report)).toContain("READINESS_CONTEXT_MISMATCH");
    expect(report.findings.find((f) => f.code === "READINESS_CONTEXT_MISMATCH")!.outcome).toBe("CONTRADICTION");
  });

  it("a wrong model/version pin is READINESS_CONTEXT_MISMATCH", () => {
    expect(codes(qa({ graph, mapping, readiness: { ...valid, modelId: "model-other" } }))).toContain(
      "READINESS_CONTEXT_MISMATCH",
    );
    expect(codes(qa({ graph, mapping, readiness: { ...valid, version: 7 } }))).toContain(
      "READINESS_CONTEXT_MISMATCH",
    );
  });

  it("a wrong mapping digest pin is READINESS_CONTEXT_MISMATCH", () => {
    expect(codes(qa({ graph, mapping, readiness: { ...valid, mappingDigest: "1".repeat(64) } }))).toContain(
      "READINESS_CONTEXT_MISMATCH",
    );
  });

  it("a readiness pin without a mapping is UNEVALUABLE (never silently matching)", () => {
    const report = qa({ graph, readiness: valid });
    const finding = report.findings.find((f) => f.code === "READINESS_CONTEXT_MISMATCH");
    expect(finding?.outcome).toBe("UNEVALUABLE");
  });
});

describe("epistemic family — provenance self-reference", () => {
  it("an object deriving from its own content hash is PROVENANCE_SELF_REFERENCE", () => {
    const graph = handBuiltGraph(smallRoomGraph(), (draft) => {
      const floor = draft.objects.find((object) => object.objectClass === "FLOOR") as {
        contentHash: string;
        provenance: { inputs: Array<Record<string, unknown>> };
      };
      floor.provenance.inputs = [
        { kind: "object", serviceId: "aise.semantics", method: "qa/test-source", objectId: "src-floor", contentHash: floor.contentHash, epistemic: "INFERRED" },
      ];
    });
    const report = qa({ graph });
    expect(codes(report)).toContain("PROVENANCE_SELF_REFERENCE");
    expect(report.findings.find((f) => f.code === "PROVENANCE_SELF_REFERENCE")!.outcome).toBe("CONTRADICTION");
  });

  it("distinct input hashes are clean", () => {
    expect(codes(qa({ graph: smallRoomGraph() }))).not.toContain("PROVENANCE_SELF_REFERENCE");
  });
});
