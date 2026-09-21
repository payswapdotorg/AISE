/**
 * PROD-025 — the deterministic derivation suite.
 *
 * Proves:
 *  - the wall-upgrade happy path: 7 lines, 3 sections, engine-matching
 *    quantities/units/totals, snapshot + version attachment, NO derivation
 *    time field;
 *  - determinism: deriving twice from the same snapshot yields the
 *    IDENTICAL BOQ (byte-identical canonical JSON, identical boqId);
 *  - the fail-closed snapshot gates (identity, integrity, outcome, digest,
 *    declaration, empty version) with the typed reason codes;
 *  - quantities come FROM THE ENGINE's outputs only: line values equal the
 *    engine inventory's sums, and a TAMPERED engine-recorded value flows
 *    through verbatim (never recomputed from parameters);
 *  - contribution kinds (created/modified/removed) and version pinning
 *    (line ids and trace ids differ across versions);
 *  - line identity is provenance-blind (attribution is not semantics).
 */

import { describe, expect, test } from "bun:test";
import { canonicalJsonStringify } from "@aise/shared-contracts";
import { deriveStateQuantities } from "@aise/solution-engine";
import {
  deriveSolutionBoq,
  snapshotCertifiesVersion,
  SolutionBoqError,
} from "./index";
import {
  failedWorld,
  lineLessOpWorld,
  tamperedWorld,
  unknownOutcomeWorld,
  validateWorld,
  versionPairWorld,
  wallUpgradeWorld,
} from "./testkit";

describe("the wall-upgrade happy path", () => {
  const world = wallUpgradeWorld();

  test("generates 7 lines across the 3 contract-category sections", () => {
    const boq = deriveSolutionBoq({ version: world.version, snapshot: world.snapshot });
    expect(boq.lines.length).toBe(7);
    expect(boq.sections.map((section) => section.sectionId)).toEqual([
      "site-preparation",
      "structure",
      "enclosure",
    ]);
    expect(boq.sections.map((section) => section.lineIds.length)).toEqual([2, 3, 2]);
  });

  test("every line carries an explicit unit honored from the engine quantity", () => {
    const boq = deriveSolutionBoq({ version: world.version, snapshot: world.snapshot });
    const units = boq.lines.map((line) => `${line.quantity.value} ${line.unit}`).sort();
    expect(units).toEqual(["0.375 m3", "0.5 m3", "1.2 m3", "12 m2", "12.5 m2", "5 m2", "65 count"]);
  });

  test("materials and calculation methods are carried and CITED from the engine", () => {
    const boq = deriveSolutionBoq({ version: world.version, snapshot: world.snapshot });
    for (const line of boq.lines) {
      expect(line.calculationMethod.calculationRef).toBe(line.quantity.calculationRef);
      expect(line.calculationMethod.methodSource).toContain(
        "packages/solution-engine/src/quantity-models.ts",
      );
      // the cited reference is the ENGINE's versioned scheme — never restated
      expect(line.calculationMethod.calculationRef.startsWith("aise-solution-engine/quantity/")).toBe(
        true,
      );
    }
    const blockLines = boq.lines.filter((line) => line.activity === "block-wall-placement");
    expect(new Set(blockLines.map((line) => line.material))).toEqual(new Set(["concrete-block"]));
    const plasterLines = boq.lines.filter((line) => line.activity === "plaster-application");
    expect(new Set(plasterLines.map((line) => line.material))).toEqual(new Set(["cement-plaster"]));
  });

  test("attaches the validation snapshot identity and the solution/version identity", () => {
    const boq = deriveSolutionBoq({ version: world.version, snapshot: world.snapshot });
    expect(boq.solutionId).toBe(world.version.solutionId);
    expect(boq.versionNumber).toBe(world.version.versionNumber);
    expect(boq.validationSnapshotRef).toBe(world.snapshot.snapshotId);
    expect(boq.validationSnapshot.snapshotId).toBe(world.snapshot.snapshotId);
    expect(boq.validationSnapshot.outcome).toBe("pass");
    expect(boq.validationSnapshot.inputDigest).toBe(world.snapshot.inputDigest);
    expect(boq.validationSnapshot.checkSummary.length).toBe(world.snapshot.checks.length);
    expect(boq.baselineRealityVersionId).toBe(world.version.states[0]!.baselineRealityVersionId);
    expect(boq.traceSet.validationSnapshotRef).toBe(world.snapshot.snapshotId);
    for (const line of boq.lines) {
      expect(line.trace.validationSnapshotRef).toBe(world.snapshot.snapshotId);
      expect(line.trace.solutionId).toBe(world.version.solutionId);
      expect(line.trace.versionNumber).toBe(world.version.versionNumber);
    }
  });

  test("carries NO derivation time — determinism pin (no clock field exists)", () => {
    const boq = deriveSolutionBoq({ version: world.version, snapshot: world.snapshot });
    const text = canonicalJsonStringify(boq);
    expect(text.includes("generatedAt")).toBe(false);
    expect(text.includes("derivationTime")).toBe(false);
    expect(text.includes("derivedAt")).toBe(false);
    expect(boq.artifactKind).toBe("solution-generated-boq");
    expect(boq.epistemicClass).toBe("PROPOSED");
  });

  test("echoes the ENGINE's net totals verbatim (never recomputed)", () => {
    const boq = deriveSolutionBoq({ version: world.version, snapshot: world.snapshot });
    const inventory = deriveStateQuantities(world.version);
    expect(boq.totals).toEqual(inventory.totals);
  });

  test("contribution kinds: removal work is 'removed', additive work is 'created'", () => {
    const boq = deriveSolutionBoq({ version: world.version, snapshot: world.snapshot });
    for (const line of boq.lines) {
      const kinds = line.contributions.map((contribution) => contribution.contributionKind);
      if (line.direction === "removed") {
        expect(kinds).toEqual(["removed"]);
      } else {
        expect(kinds).toEqual(["created"]);
      }
    }
  });
});

describe("determinism", () => {
  const world = wallUpgradeWorld();

  test("deriving twice from the same snapshot yields the IDENTICAL BOQ", () => {
    const first = deriveSolutionBoq({ version: world.version, snapshot: world.snapshot });
    const second = deriveSolutionBoq({ version: world.version, snapshot: world.snapshot });
    expect(second.boqId).toBe(first.boqId);
    expect(canonicalJsonStringify(second)).toBe(canonicalJsonStringify(first));
  });

  test("the same version under a pass snapshot and an unknown snapshot differs", () => {
    const unknownWorld = unknownOutcomeWorld();
    const passBoq = deriveSolutionBoq({ version: unknownWorld.version, snapshot: validateWorld(unknownWorld.version) });
    const unknownBoq = deriveSolutionBoq({
      version: unknownWorld.version,
      snapshot: unknownWorld.snapshot,
    });
    // same work lines (same values), different identity (assumption inventory differs)
    expect(unknownBoq.boqId).not.toBe(passBoq.boqId);
    expect(unknownBoq.lines.map((line) => line.quantity.value)).toEqual(
      passBoq.lines.map((line) => line.quantity.value),
    );
    expect(unknownBoq.assumptions.length).toBeGreaterThan(passBoq.assumptions.length);
    // the assumption inventory is part of the line's identity-stable payload
    const passLineIds = new Set(passBoq.lines.map((line) => `${line.activity}/${line.unit}`));
    for (const line of unknownBoq.lines) {
      const key = `${line.activity}/${line.unit}`;
      if (passLineIds.has(key)) {
        const passLine = passBoq.lines.find(
          (entry) => `${entry.activity}/${entry.unit}` === key,
        );
        expect(line.boqLineId).not.toBe(passLine?.boqLineId);
      }
    }
  });
});

describe("the fail-closed snapshot gates", () => {
  const world = wallUpgradeWorld();

  test("a snapshot pinning a different solution/version is refused", () => {
    const otherSnapshot = { ...structuredClone(world.snapshot), versionNumber: 2 };
    expect(() =>
      deriveSolutionBoq({ version: world.version, snapshot: otherSnapshot }),
    ).toThrow(/snapshot_version_mismatch/);
  });

  test("a tampered snapshot identity is refused (integrity re-derivation)", () => {
    const tampered = structuredClone(world.snapshot);
    tampered.checkSummary = undefined;
    const different = {
      ...tampered,
      snapshotId: `${"0".repeat(63)}1`,
    };
    expect(() => deriveSolutionBoq({ version: world.version, snapshot: different })).toThrow(
      /snapshot_identity_mismatch/,
    );
  });

  test("a snapshot certifying OTHER bytes is refused (inputDigest mismatch)", () => {
    const { tampered, originalSnapshot } = tamperedWorld();
    expect(() =>
      deriveSolutionBoq({ version: tampered.version, snapshot: originalSnapshot }),
    ).toThrow(/snapshot_input_digest_mismatch/);
  });

  test("a failed validation outcome is refused", () => {
    const failed = failedWorld();
    expect(failed.snapshot.outcome).toBe("fail");
    expect(() => deriveSolutionBoq({ version: failed.version, snapshot: failed.snapshot })).toThrow(
      /snapshot_outcome_fail/,
    );
  });

  test("a version declaring a DIFFERENT snapshot is refused", () => {
    const declared = structuredClone(world.version);
    declared.status = "validated";
    declared.validationSnapshotRef = `${"a".repeat(64)}`;
    expect(() =>
      deriveSolutionBoq({ version: declared, snapshot: world.snapshot }),
    ).toThrow(/snapshot_declaration_mismatch/);
  });

  test("the lifecycle-declared form (validated + snapshotRef) is accepted", () => {
    const declared = structuredClone(world.version);
    declared.status = "validated";
    declared.validationSnapshotRef = world.snapshot.snapshotId;
    expect(snapshotCertifiesVersion(world.snapshot, declared)).toBe(true);
    const boq = deriveSolutionBoq({ version: declared, snapshot: world.snapshot });
    expect(boq.boqId).toBe(
      deriveSolutionBoq({ version: world.version, snapshot: world.snapshot }).boqId,
    );
  });

  test("a version with no quantity-carrying operation is refused (empty BOQ)", () => {
    const stripped = lineLessOpWorld();
    const emptyVersion = structuredClone(stripped.version);
    // strip the excavation's quantity effects too → zero quantity surface
    for (const operation of emptyVersion.operations) {
      operation.effects = operation.effects.filter((effect) => effect.effectKind !== "quantity-impact");
    }
    const snapshot = validateWorld(emptyVersion);
    expect(() => deriveSolutionBoq({ version: emptyVersion, snapshot })).toThrow(
      /empty_version/,
    );
  });

  test("every refusal is a typed SolutionBoqError with a stable code", () => {
    const failed = failedWorld();
    try {
      deriveSolutionBoq({ version: failed.version, snapshot: failed.snapshot });
      throw new Error("expected a refusal");
    } catch (error) {
      expect(error).toBeInstanceOf(SolutionBoqError);
      expect((error as SolutionBoqError).code).toBe("snapshot_outcome_fail");
      expect((error as SolutionBoqError).detail.length).toBeGreaterThan(0);
    }
  });
});

describe("quantities come from the ENGINE's outputs only", () => {
  const world = wallUpgradeWorld();

  test("every line value equals the sum of the engine inventory's quantities", () => {
    const boq = deriveSolutionBoq({ version: world.version, snapshot: world.snapshot });
    const inventory = deriveStateQuantities(world.version);
    for (const line of boq.lines) {
      const matching = inventory.perOperation.filter(
        (quantity) =>
          quantity.operationType === line.activity &&
          quantity.dimension === line.quantity.dimension &&
          quantity.unit === line.unit &&
          quantity.direction === line.direction,
      );
      const expected = matching.reduce((sum, quantity) => sum + quantity.value, 0);
      expect(line.quantity.value).toBe(expected);
      for (const contribution of line.contributions) {
        const opQuantities = matching.filter(
          (quantity) => quantity.operationId === contribution.operationId,
        );
        expect(contribution.operationValue).toBe(
          opQuantities.reduce((sum, quantity) => sum + quantity.value, 0),
        );
      }
    }
  });

  test("a TAMPERED engine-recorded value flows through verbatim (no recomputation)", () => {
    const { tampered } = tamperedWorld();
    const boq = deriveSolutionBoq({ version: tampered.version, snapshot: tampered.snapshot });
    const wallVolumeLine = boq.lines.find(
      (line) => line.activity === "block-wall-placement" && line.quantity.dimension === "volume",
    );
    // the parameters would compute 5 × 1 × 0.1 = 0.5; the ENGINE-RECORDED
    // (tampered) value is 0.55 and MUST be carried verbatim
    expect(wallVolumeLine?.quantity.value).toBe(0.55);
    expect(wallVolumeLine?.trace.quantity.value).toBe(0.55);
    // and the engine-echoed totals agree with the tampered record
    const volumeTotal = boq.totals.find(
      (total) => total.dimension === "volume" && total.unit === "m3",
    );
    expect(volumeTotal?.addedValue).toBe(0.55 + 0.375);
  });
});

describe("version pinning and provenance blindness", () => {
  test("the same work item under two versions derives different line and trace ids", () => {
    const pair = versionPairWorld();
    const v1 = deriveSolutionBoq({ version: pair.v1.version, snapshot: pair.v1.snapshot });
    const v2 = deriveSolutionBoq({ version: pair.v2.version, snapshot: pair.v2.snapshot });
    const v1Line = v1.lines.find(
      (line) => line.activity === "demolition-removal" && line.quantity.dimension === "area",
    );
    const v2Line = v2.lines.find(
      (line) => line.activity === "demolition-removal" && line.quantity.dimension === "area",
    );
    expect(v1Line).toBeDefined();
    expect(v2Line).toBeDefined();
    expect(v1Line?.boqLineId).not.toBe(v2Line?.boqLineId);
    expect(v1Line?.traceId).not.toBe(v2Line?.traceId);
    expect(v1.versionNumber).toBe(1);
    expect(v2.versionNumber).toBe(2);
    expect(v2.parentVersionNumber).toBe(1);
  });

  test("line identity is provenance-blind: attribution is not semantics", () => {
    // the CONTRACT's direct-manipulation vs agent excavation pair: identical
    // semantics, different provenance → identical operations → identical lines
    const direct = wallUpgradeWorld();
    const agentVersion = structuredClone(direct.version);
    for (const operation of agentVersion.operations) {
      operation.provenance = {
        ...operation.provenance,
        origin: "agent",
        authoredBy: "agent-other",
        commandText: "Rebuild the wall differently, please.",
        derivationNote: undefined,
      };
    }
    const agentSnapshot = validateWorld(agentVersion);
    const directBoq = deriveSolutionBoq({ version: direct.version, snapshot: direct.snapshot });
    const agentBoq = deriveSolutionBoq({ version: agentVersion, snapshot: agentSnapshot });
    // the work lines are IDENTICAL (line ids exclude provenance)…
    expect(agentBoq.lines.map((line) => line.boqLineId)).toEqual(
      directBoq.lines.map((line) => line.boqLineId),
    );
    // …while the document identity differs (the certified bytes differ)
    expect(agentBoq.boqId).not.toBe(directBoq.boqId);
  });
});
