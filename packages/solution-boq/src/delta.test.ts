/**
 * PROD-025 — version-pair delta suite.
 *
 * Proves:
 *  - the committed version-pair world (same solution, v1 → v2): every
 *    changed line carries its quantity delta AND the operation-level
 *    lineage (contributions added/removed — v2's re-applied operations);
 *  - lines matched by SEMANTIC key (never by version-pinned boqLineId);
 *  - added/removed line kinds over disjoint work worlds;
 *  - the same version under two declared snapshots: identical work,
 *    unchanged lines (the delta is work-aware, not identity-paranoid);
 *  - cross-solution comparison is a typed refusal.
 */

import { describe, expect, test } from "bun:test";
import {
  boqLineSemanticKey,
  deriveSolutionBoq,
  diffSolutionBoqs,
} from "./index";
import {
  contractIntent,
  replayWorld,
  unknownOutcomeWorld,
  validateWorld,
  versionPairWorld,
} from "./testkit";

describe("the committed version pair (v1 wall upgrade → v2 revision)", () => {
  const pair = versionPairWorld();
  const v1 = deriveSolutionBoq({ version: pair.v1.version, snapshot: pair.v1.snapshot });
  const v2 = deriveSolutionBoq({ version: pair.v2.version, snapshot: pair.v2.snapshot });
  const delta = diffSolutionBoqs(v1, v2);

  test("pins both BOQ identities, versions and snapshots", () => {
    expect(delta.solutionId).toBe(v1.solutionId);
    expect(delta.fromBoqId).toBe(v1.boqId);
    expect(delta.toBoqId).toBe(v2.boqId);
    expect(delta.fromVersionNumber).toBe(1);
    expect(delta.toVersionNumber).toBe(2);
    expect(delta.fromSnapshotRef).toBe(v1.validationSnapshotRef);
    expect(delta.toSnapshotRef).toBe(v2.validationSnapshotRef);
  });

  test("the block wall grew: 3 changed lines with the exact quantity deltas", () => {
    const wallArea = delta.lines.find(
      (line) =>
        line.kind === "changed" &&
        line.semanticKey.activity === "block-wall-placement" &&
        line.semanticKey.dimension === "area",
    );
    expect(wallArea?.quantityDelta).toBe(1); // 5 → 6 m2
    expect(wallArea?.fromLine?.quantity.value).toBe(5);
    expect(wallArea?.toLine?.quantity.value).toBe(6);
    const wallVolume = delta.lines.find(
      (line) =>
        line.kind === "changed" &&
        line.semanticKey.activity === "block-wall-placement" &&
        line.semanticKey.dimension === "volume",
    );
    expect(wallVolume?.quantityDelta).toBe(0.1); // 0.5 → 0.6 m3
    const blockCount = delta.lines.find(
      (line) =>
        line.kind === "changed" &&
        line.semanticKey.activity === "block-wall-placement" &&
        line.semanticKey.dimension === "count",
    );
    expect(blockCount?.quantityDelta).toBe(13); // 65 → 78 blocks
  });

  test("the plaster line merged a second pass: +5 m2 with the new operation lineage", () => {
    const plasterArea = delta.lines.find(
      (line) =>
        line.kind === "changed" &&
        line.semanticKey.activity === "plaster-application" &&
        line.semanticKey.dimension === "area",
    );
    expect(plasterArea?.quantityDelta).toBe(5); // 12.5 → 17.5 m2
    expect(plasterArea?.toLine?.contributions.length).toBe(2);
    // v2's plaster operations are NEW identities (revision is versioning)
    expect(plasterArea?.contributionsAdded?.length).toBe(2);
    expect(plasterArea?.contributionsRemoved?.length).toBe(1);
    const v2OpIds = new Set(pair.v2.version.operations.map((operation) => operation.operationId));
    for (const id of plasterArea?.contributionsAdded ?? []) {
      expect(v2OpIds.has(id)).toBe(true);
    }
  });

  test("re-applied identical work shows as changed lineage without a quantity delta", () => {
    const demolitionArea = delta.lines.find(
      (line) =>
        line.kind === "changed" &&
        line.semanticKey.activity === "demolition-removal" &&
        line.semanticKey.dimension === "area",
    );
    expect(demolitionArea?.fromLine?.quantity.value).toBe(12);
    expect(demolitionArea?.toLine?.quantity.value).toBe(12);
    expect(demolitionArea?.quantityDelta).toBeUndefined(); // value identical
    expect(demolitionArea?.contributionsAdded?.length).toBe(1); // v2's re-applied demolition
    expect(demolitionArea?.contributionsRemoved?.length).toBe(1);
  });

  test("lines never match by version-pinned boqLineId (semantic keys only)", () => {
    const v1Ids = new Set(v1.lines.map((line) => line.boqLineId));
    for (const line of v2.lines) {
      expect(v1Ids.has(line.boqLineId)).toBe(false);
    }
    // yet every v2 line matched its v1 counterpart by semantic key
    expect(delta.summary.changed + delta.summary.unchanged).toBe(v2.lines.length);
    expect(delta.summary.added).toBe(0);
    expect(delta.summary.removed).toBe(0);
  });
});

describe("added and removed lines", () => {
  test("disjoint work worlds report every line as added/removed", () => {
    const excavationVersion = replayWorld([contractIntent("valid-excavation-direct")], 1);
    const excavationOnly = deriveSolutionBoq({
      version: excavationVersion,
      snapshot: validateWorld(excavationVersion),
    });
    const backfillVersion = replayWorld([contractIntent("valid-backfill")], 1);
    const backfillOnly = deriveSolutionBoq({
      version: backfillVersion,
      snapshot: validateWorld(backfillVersion),
    });
    const toBackfill = diffSolutionBoqs(excavationOnly, backfillOnly);
    expect(toBackfill.summary).toEqual({ added: 1, changed: 0, removed: 2, unchanged: 0 });
    const addedLine = toBackfill.lines.find((line) => line.kind === "added");
    expect(addedLine?.semanticKey.activity).toBe("backfill");
    expect(addedLine?.toLine).toBeDefined();
    expect(addedLine?.fromLine).toBeUndefined();
    const removedLine = toBackfill.lines.find((line) => line.kind === "removed");
    expect(removedLine?.fromLine).toBeDefined();
    expect(removedLine?.toLine).toBeUndefined();
  });
});

describe("work-aware deltas across snapshots of one version", () => {
  test("the same work under a pass and an unknown snapshot: all lines unchanged", () => {
    const world = unknownOutcomeWorld();
    const passBoq = deriveSolutionBoq({
      version: world.version,
      snapshot: validateWorld(world.version),
    });
    const unknownBoq = deriveSolutionBoq({ version: world.version, snapshot: world.snapshot });
    const delta = diffSolutionBoqs(passBoq, unknownBoq);
    expect(delta.summary.unchanged).toBe(passBoq.lines.length);
    expect(delta.summary.changed).toBe(0);
    for (const line of delta.lines) {
      expect(line.kind).toBe("unchanged");
    }
  });
});

describe("delta gates", () => {
  test("cross-solution comparison is a typed refusal", () => {
    const world = unknownOutcomeWorld();
    const a = deriveSolutionBoq({ version: world.version, snapshot: world.snapshot });
    const other = structuredClone(a) as { solutionId: string };
    other.solutionId = "solution-other-999";
    expect(() => diffSolutionBoqs(a, other as never)).toThrow(/solution_mismatch/);
  });

  test("the semantic key excludes version pins and assumption inventory", () => {
    const pair = versionPairWorld();
    const v1 = deriveSolutionBoq({ version: pair.v1.version, snapshot: pair.v1.snapshot });
    const plaster = v1.lines.find((line) => line.activity === "plaster-application");
    const key = boqLineSemanticKey(plaster!);
    expect(key).toEqual({
      sectionId: "enclosure",
      buildingElement: "wall-surface",
      activity: "plaster-application",
      dimension: "area",
      unit: "m2",
      direction: "added",
      material: "cement-plaster",
      calculationRef: "aise-solution-engine/quantity/plaster-application/v1",
    });
    expect(JSON.stringify(key).includes("boqLineId")).toBe(false);
    expect(JSON.stringify(key).includes("versionNumber")).toBe(false);
  });
});
