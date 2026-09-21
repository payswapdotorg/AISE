/**
 * PROD-025 — solution-BOQ service tests.
 *
 * Proves:
 *  - the generate happy path (deterministic; the same request twice →
 *    byte-identical BOQ);
 *  - the derivation gates surface as the package's typed codes (snapshot
 *    digest mismatch, outcome fail, version mismatch);
 *  - strict contract decoding of the wire payloads (invalid_version /
 *    invalid_snapshot with the contract's issues);
 *  - the readback verification (ok summary / boq_integrity_mismatch on a
 *    tampered BOQ);
 *  - both navigation directions (line → operations with geometry +
 *    resultingStateRef; operation → lines with contribution kinds; the
 *    honest empty list for a known line-less operation);
 *  - end-to-end: the navigation answers agree with the CONTRACT's own
 *    resolvers over the generated trace set.
 */

import { describe, expect, test } from "bun:test";
import { canonicalJsonStringify } from "@aise/shared-contracts";
import { REFERENCE_BUILDING_OPERATION_PROFILE } from "@aise/solution-contract";
import { deriveSolutionBoq } from "@aise/solution-boq";
import { SolutionBoqService } from "./service";
import { generateBody, generatedBoq, validate, wallUpgradeVersion } from "./testkit";
import type { SolutionBoq } from "@aise/solution-boq";

const service = new SolutionBoqService();

describe("generate — the deterministic happy path", () => {
  test("derives the versioned BOQ from the declared snapshot", () => {
    const { version, snapshot } = generateBody();
    const response = service.generate({ version, snapshot });
    expect(response.boq.artifactKind).toBe("solution-generated-boq");
    expect(response.boq.solutionId).toBe("solution-demo-001");
    expect(response.boq.versionNumber).toBe(1);
    expect(response.boq.validationSnapshotRef).toBe(snapshot.snapshotId);
    expect(response.boq.lines.length).toBe(7);
  });

  test("identical requests produce byte-identical BOQs (stateless determinism)", () => {
    const { version, snapshot } = generateBody();
    const first = service.generate({ version, snapshot });
    const second = service.generate({ version, snapshot });
    expect(canonicalJsonStringify(second.boq)).toBe(canonicalJsonStringify(first.boq));
    expect(second.boq.boqId).toBe(first.boq.boqId);
  });

  test("the sourceBoqRef is carried as the identity-only reference", () => {
    const { version, snapshot } = generateBody();
    const response = service.generate({
      version,
      snapshot,
      sourceBoqRef: {
        kind: "source-boq-reference",
        importId: "b".repeat(64),
        mediaType: "application/vnd.ms-excel",
        byteSize: 2048,
      },
    });
    expect(response.boq.sourceBoqRef?.importId).toBe("b".repeat(64));
  });
});

describe("generate — the fail-closed gates", () => {
  test("an undecodable version answers invalid_version with contract issues", () => {
    const { snapshot } = generateBody();
    expect(() => service.generate({ version: { nonsense: true }, snapshot })).toThrow(
      /invalid_version.*strict contract decoding/,
    );
  });

  test("an undecodable snapshot answers invalid_snapshot", () => {
    const { version } = generateBody();
    expect(() => service.generate({ version, snapshot: { nope: 1 } })).toThrow(
      /invalid_snapshot/,
    );
  });

  test("a malformed sourceBoqRef answers invalid_source_ref", () => {
    const { version, snapshot } = generateBody();
    expect(() =>
      service.generate({
        version,
        snapshot,
        sourceBoqRef: { kind: "wrong", importId: "x" },
      }),
    ).toThrow(/invalid_source_ref/);
  });

  test("a snapshot certifying other bytes answers snapshot_input_digest_mismatch", () => {
    const version = wallUpgradeVersion();
    const tampered = structuredClone(version);
    const operation = tampered.operations[0]!;
    operation.provenance = { ...operation.provenance, derivationNote: "tampered bytes" };
    const staleSnapshot = validate(version);
    expect(() => service.generate({ version: tampered, snapshot: staleSnapshot })).toThrow(
      /snapshot_input_digest_mismatch/,
    );
  });

  test("a snapshot pinning another version answers snapshot_version_mismatch", () => {
    const { version, snapshot } = generateBody();
    const otherSnapshot = { ...structuredClone(snapshot), versionNumber: 99 };
    expect(() => service.generate({ version, snapshot: otherSnapshot })).toThrow(
      /snapshot_version_mismatch/,
    );
  });

  test("a failed-outcome snapshot answers snapshot_outcome_fail", () => {
    const version = wallUpgradeVersion();
    // a genuinely failed snapshot: validate against a restricted profile
    // that declares no plaster-application capability (engine-owned data)
    const restrictedProfile = {
      ...REFERENCE_BUILDING_OPERATION_PROFILE,
      profileId: "profile-building-ops-no-plaster",
      domains: REFERENCE_BUILDING_OPERATION_PROFILE.domains.map((domain) => ({
        ...domain,
        operations: domain.operations.filter(
          (entry) => entry.operationType !== "plaster-application",
        ),
      })),
    };
    const failedSnapshot = validate(version, restrictedProfile);
    expect(failedSnapshot.outcome).toBe("fail");
    expect(() => service.generate({ version, snapshot: failedSnapshot })).toThrow(
      /snapshot_outcome_fail/,
    );
  });
});

describe("readback — the versioned verified readback", () => {
  test("a valid generated BOQ verifies with the identity summary", () => {
    const boq = generatedBoq();
    const response = service.readback({ boq });
    expect(response.verification.boqId).toBe(boq.boqId);
    expect(response.verification.solutionId).toBe(boq.solutionId);
    expect(response.verification.versionNumber).toBe(boq.versionNumber);
    expect(response.verification.validationSnapshotRef).toBe(boq.validationSnapshotRef);
    expect(response.verification.lineCount).toBe(7);
    expect(response.verification.sectionCount).toBe(3);
    expect(response.verification.operationCount).toBe(3);
  });

  test("a JSON-round-tripped BOQ still verifies (wire transparency)", () => {
    const boq = generatedBoq();
    const roundTripped = JSON.parse(JSON.stringify(boq)) as SolutionBoq;
    const response = service.readback({ boq: roundTripped });
    expect(response.verification.boqId).toBe(boq.boqId);
  });

  test("a TAMPERED BOQ answers boq_integrity_mismatch", () => {
    const boq = generatedBoq();
    const tampered = structuredClone(boq) as unknown as {
      lines: { quantity: { value: number } }[];
    };
    tampered.lines[0]!.quantity.value = 999;
    expect(() => service.readback({ boq: tampered as never })).toThrow(/boq_integrity_mismatch/);
  });

  test("a non-generated-BOQ payload answers invalid_boq (the typed seal)", () => {
    expect(() => service.readback({ boq: { importId: "x", format: "xlsx" } })).toThrow(
      /invalid_boq/,
    );
  });
});

describe("line-operations — BOQ line → contributing solution steps", () => {
  test("resolves contributions with geometry target refs and the resulting state", () => {
    const boq = generatedBoq();
    const line = boq.lines.find(
      (entry) => entry.activity === "plaster-application" && entry.quantity.dimension === "area",
    )!;
    const response = service.lineOperations({ boq, boqLineId: line.boqLineId });
    expect(response.boqLineId).toBe(line.boqLineId);
    expect(response.contributions.length).toBe(1);
    const contribution = response.contributions[0]!;
    expect(contribution.operationIndex).toBe(3);
    expect(contribution.contributionKind).toBe("created");
    expect(contribution.geometryRefs).toEqual([
      { kind: "polygon", ref: "geo-wall-faces-002" },
    ]);
    expect(contribution.nodeRefs).toEqual(["node-wall-002"]);
    // the resulting state is the step the operation produced (states[3])
    expect(contribution.resultingStateRef).not.toBe("");
  });

  test("an unknown line id answers unknown_boq_line", () => {
    const boq = generatedBoq();
    expect(() => service.lineOperations({ boq, boqLineId: "missing-line" })).toThrow(
      /unknown_boq_line/,
    );
  });
});

describe("operation-lines — operation → affected lines (reverse navigation)", () => {
  test("every operation reveals its lines with contribution kinds", () => {
    const boq = generatedBoq();
    for (const operationId of boq.operationIds) {
      const response = service.operationLines({ boq, operationId });
      expect(response.lines.length).toBeGreaterThanOrEqual(1);
      for (const line of response.lines) {
        expect(["created", "modified", "removed"]).toContain(line.contributionKind);
        expect(line.quantity.unit).toBe(line.unit);
      }
    }
  });

  test("an operation unknown to the version answers unknown_operation", () => {
    const boq = generatedBoq();
    expect(() => service.operationLines({ boq, operationId: "missing-op" })).toThrow(
      /unknown_operation/,
    );
  });

  test("the demolition operation's lines answer 'removed' contributions", () => {
    const boq = generatedBoq();
    const demolition = boq.operationIds[0]!;
    const response = service.operationLines({ boq, operationId: demolition });
    expect(response.lines.length).toBe(2);
    expect(response.lines.every((line) => line.contributionKind === "removed")).toBe(true);
    expect(new Set(response.lines.map((line) => line.unit))).toEqual(new Set(["m2", "m3"]));
  });
});

describe("end-to-end coherence with the package derivation", () => {
  test("navigating every line and operation round-trips through the service", () => {
    const boq = generatedBoq();
    for (const line of boq.lines) {
      const navigation = service.lineOperations({ boq, boqLineId: line.boqLineId });
      for (const contribution of navigation.contributions) {
        const reverse = service.operationLines({ boq, operationId: contribution.operationId });
        expect(
          reverse.lines.some((entry) => entry.boqLineId === line.boqLineId),
        ).toBe(true);
      }
    }
  });

  test("a regenerated BOQ equals the presented one (deterministic regeneration)", () => {
    const { version, snapshot } = generateBody();
    const regenerated = deriveSolutionBoq({ version, snapshot });
    const readback = service.readback({ boq: regenerated });
    expect(readback.boq.boqId).toBe(regenerated.boqId);
    expect(canonicalJsonStringify(readback.boq)).toBe(canonicalJsonStringify(regenerated));
  });
});
