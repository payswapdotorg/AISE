/**
 * AISE-028 — Impact service tests (the deterministic compute engine).
 *
 * Covers the work order's loud parts: quantities from deterministic
 * geometry/state deltas; BOQ impacts with source mapping (delta + BOQ item,
 * unmapped honesty); the unit discipline matrix; uncertainty propagation
 * (an uncertain input never yields a false-precision output); the
 * PROPOSED-literal / never-authoritative discipline; byte-identical
 * recomputation; write-once idempotent persistence with the divergence
 * guard; and the typed refusal matrix.
 */

import { describe, expect, test } from "bun:test";
import { canonicalJsonStringify } from "@aise/shared-contracts";
import { ImpactError, type ImpactErrorCode, type ImpactLine } from "./model";
import { ImpactService } from "./service";
import { FsImpactStore, InMemoryImpactStore } from "./store";
import {
  CANONICAL_COMPUTE,
  CANONICAL_COMPUTE_UNPRICED,
  CANONICAL_RATES,
  ENTRY_BLOCKWORK_ID,
  ENTRY_FIREBOARD_ID,
  ENTRY_PARTITION_ID,
  ENTRY_PLASTER_ID,
  FIXED_LATER,
  FIXED_NOW,
  IMPORT_ID,
  SCENARIO_ID,
  STEP_AREA_ID,
  STEP_MODIFY_ID,
  STEP_PARTITION_ID,
  STEP_REMOVE_ID,
  buildCanonicalMappingInput,
  buildCanonicalScenarioInput,
  buildUncertainScenarioInput,
  buildUnitlessMappingInput,
  canonicalResolvers,
  fixedClock,
  importIdOf,
  makeMappingResolver,
  makeScenarioResolver,
  withTempDir,
} from "./testkit";

function expectImpactError(fn: () => Promise<unknown>, code: ImpactErrorCode): Promise<void> {
  return fn().then(
    () => {
      throw new Error(`expected an ImpactError (${code}) but nothing was thrown`);
    },
    (error: unknown) => {
      expect(error).toBeInstanceOf(ImpactError);
      expect((error as ImpactError).code).toBe(code);
    },
  );
}

/** Deep-mutable mirror of a (readonly) fixture type. */
type Mutable<T> = T extends readonly (infer U)[]
  ? Mutable<U>[]
  : T extends object
    ? { -readonly [K in keyof T]: Mutable<T[K]> }
    : T;

/** Deep mutable copy of a plain-data fixture (tests edit copies, never the frozen constants). */
function editable<T>(value: T): Mutable<T> {
  return JSON.parse(JSON.stringify(value)) as Mutable<T>;
}

/** A fresh service over the in-memory store + canonical resolvers. */
function canonicalService(): ImpactService {
  return new ImpactService({
    store: new InMemoryImpactStore(),
    clock: fixedClock,
    ...canonicalResolvers(),
  });
}

describe("impact service: quantities from deterministic state deltas", () => {
  test("the canonical 5-step impact produces every line kind with correct signed quantities", async () => {
    const record = await canonicalService().computeImpact(CANONICAL_COMPUTE);
    const report = record.report;
    expect(report.summary.lineCount).toBe(9);
    // wall-east (removed): thickness -180mm + geometry line
    // wall-north: fireRating (non-numeric), thickness +60mm, geometry line
    // wall-partition-new (added): fireRating (non-numeric), thickness +120mm, geometry line
    // space-office-101: area +2.5m2
    const byNode = new Map<string, ImpactLine[]>();
    for (const line of report.lines) {
      const bucket = byNode.get(line.targetNodeId) ?? [];
      bucket.push(line);
      byNode.set(line.targetNodeId, bucket);
    }
    expect([...byNode.keys()]).toEqual([
      "space-office-101",
      "wall-east",
      "wall-north",
      "wall-partition-new",
    ]);

    const eastThickness = byNode.get("wall-east")!.find(
      (line) => line.basis.propertyKey === "thickness",
    )!;
    expect(eastThickness.kind).toBe("element_removed");
    expect(eastThickness.quantity).toEqual({ value: -180, unit: "mm", uncertainty: null });
    expect(eastThickness.stepId).toBe(STEP_REMOVE_ID);
    expect(eastThickness.stepIndex).toBe(3);
    expect(eastThickness.severedRelationshipIds).toEqual([
      "rel-bounded-east",
      "rel-contains-wall-east",
    ]);

    const northThickness = byNode.get("wall-north")!.find(
      (line) => line.basis.propertyKey === "thickness",
    )!;
    expect(northThickness.kind).toBe("property_delta");
    expect(northThickness.quantity).toEqual({ value: 60, unit: "mm", uncertainty: null });
    // ATTRIBUTION PRECISION: the thickness was re-set by step 4 (the
    // element_modification), not by step 1 (which touched only fireRating).
    expect(northThickness.stepId).toBe(STEP_MODIFY_ID);
    expect(northThickness.stepIndex).toBe(4);
    expect(northThickness.basis.fromValue).toBe(240);
    expect(northThickness.basis.fromUnit).toBe("mm");
    expect(northThickness.basis.toValue).toBe(300);
    expect(northThickness.basis.toUnit).toBe("mm");

    const partitionThickness = byNode.get("wall-partition-new")!.find(
      (line) => line.basis.propertyKey === "thickness",
    )!;
    expect(partitionThickness.kind).toBe("element_added");
    expect(partitionThickness.quantity).toEqual({ value: 120, unit: "mm", uncertainty: null });
    expect(partitionThickness.stepId).toBe(STEP_PARTITION_ID);

    const area = byNode.get("space-office-101")![0]!;
    expect(area.kind).toBe("property_delta");
    expect(area.quantity).toEqual({ value: 2.5, unit: "m2", uncertainty: null });
    expect(area.stepId).toBe(STEP_AREA_ID);
    expect(area.basis.fromValue).toBe(42.5);
    expect(area.basis.toValue).toBe(45);
  });

  test("non-numeric property deltas are recorded verbatim with a typed omission, never a zero", async () => {
    const record = await canonicalService().computeImpact(CANONICAL_COMPUTE);
    const fireRating = record.report.lines.find(
      (line) => line.basis.propertyKey === "fireRating" && line.targetNodeId === "wall-north",
    )!;
    expect(fireRating.quantity).toBeNull();
    expect(fireRating.omissionCode).toBe("non_quantifiable_property");
    expect(fireRating.basis.fromValue).toBe("REI60");
    expect(fireRating.basis.toValue).toBe("REI90");
    const partitionRating = record.report.lines.find(
      (line) => line.basis.propertyKey === "fireRating" && line.targetNodeId === "wall-partition-new",
    )!;
    expect(partitionRating.omissionCode).toBe("non_quantifiable_property");
    expect(partitionRating.basis.fromValue).toBeUndefined();
    expect(partitionRating.basis.toValue).toBe("REI30");
  });

  test("a numeric delta across DIFFERENT units is a typed omission — no conversion is invented", async () => {
    const scenario = editable(buildCanonicalScenarioInput());
    // Step 4 re-proposes the thickness in centimetres: 240mm -> 30cm.
    scenario.states = scenario.states.map((state) => ({
      ...state,
      nodes: state.nodes.map((entry) =>
        entry.nodeId === "wall-north" && state.stateIndex >= 4
          ? {
              ...entry,
              properties: entry.properties.map((property) =>
                property.key === "thickness"
                  ? { key: "thickness", value: 30, unit: "cm" }
                  : property,
              ),
            }
          : entry,
      ),
    }));
    (scenario.steps[3]!.change as unknown as {
      properties?: { key: string; value: number; unit: string }[];
    }).properties = [{ key: "thickness", value: 30, unit: "cm" }];
    const service = new ImpactService({
      store: new InMemoryImpactStore(),
      clock: fixedClock,
      scenarioResolver: makeScenarioResolver([scenario]),
      mappingResolver: makeMappingResolver([buildCanonicalMappingInput()]),
    });
    const record = await service.computeImpact(CANONICAL_COMPUTE);
    const thickness = record.report.lines.find(
      (line) => line.targetNodeId === "wall-north" && line.basis.propertyKey === "thickness",
    )!;
    expect(thickness.quantity).toBeNull();
    expect(thickness.omissionCode).toBe("unit_mismatch_not_computed");
    expect(thickness.basis.fromValue).toBe(240);
    expect(thickness.basis.fromUnit).toBe("mm");
    expect(thickness.basis.toValue).toBe(30);
    expect(thickness.basis.toUnit).toBe("cm");
  });

  test("plane/polygon geometry deltas omit with geometry_ref_unresolved; mesh refs with non_projectable_geometry_kind", async () => {
    const record = await canonicalService().computeImpact(CANONICAL_COMPUTE);
    for (const line of record.report.lines.filter((entry) => entry.kind === "geometry_delta")) {
      expect(line.quantity).toBeNull();
      expect(line.omissionCode).toBe("geometry_ref_unresolved");
    }
    // The partition's added geometry + wall-north's swapped geometry +
    // wall-east's removed geometry: three geometry lines in total.
    expect(record.report.lines.filter((entry) => entry.kind === "geometry_delta")).toHaveLength(3);

    // A mesh-ref variant: the added partition carries a mesh geometry.
    const scenario = editable(buildCanonicalScenarioInput());
    for (const state of scenario.states) {
      for (const entry of state.nodes) {
        if (entry.nodeId === "wall-partition-new" && entry.geometry !== undefined) {
          (entry as { geometry?: { kind: string; ref: string } }).geometry = {
            kind: "mesh-ref",
            ref: "mesh-partition-001",
          };
        }
      }
    }
    (scenario.steps[1]!.change as { node: { geometry?: { kind: string; ref: string } } }).node.geometry = {
      kind: "mesh-ref",
      ref: "mesh-partition-001",
    };
    const service = new ImpactService({
      store: new InMemoryImpactStore(),
      clock: fixedClock,
      scenarioResolver: makeScenarioResolver([scenario]),
      mappingResolver: makeMappingResolver([buildCanonicalMappingInput()]),
    });
    const meshRecord = await service.computeImpact(CANONICAL_COMPUTE);
    const meshLine = meshRecord.report.lines.find(
      (line) => line.kind === "geometry_delta" && line.targetNodeId === "wall-partition-new",
    )!;
    expect(meshLine.omissionCode).toBe("non_projectable_geometry_kind");
  });

  test("an added/removed element with NO quantifiable content gets one explicit omission line", async () => {
    const scenario = editable(buildCanonicalScenarioInput());
    // The partition carries neither properties nor geometry.
    for (const state of scenario.states) {
      state.nodes = state.nodes
        .filter((entry) => entry.nodeId !== "wall-partition-new")
        .concat(
          state.stateIndex >= 2
            ? [
                {
                  nodeId: "wall-partition-new",
                  origin: "scenario",
                  appliedStepIds: [STEP_PARTITION_ID],
                  kind: "element",
                  properties: [],
                },
              ]
            : [],
        );
    }
    (scenario.steps[1]!.change as unknown as {
      node: { kind: string; properties: unknown[]; geometry?: unknown };
    }).node = {
      kind: "element",
      properties: [],
    };
    const service = new ImpactService({
      store: new InMemoryImpactStore(),
      clock: fixedClock,
      scenarioResolver: makeScenarioResolver([scenario]),
      mappingResolver: makeMappingResolver([buildCanonicalMappingInput()]),
    });
    const record = await service.computeImpact(CANONICAL_COMPUTE);
    const partitionLines = record.report.lines.filter(
      (line) => line.targetNodeId === "wall-partition-new",
    );
    expect(partitionLines).toHaveLength(1);
    expect(partitionLines[0]!.omissionCode).toBe("element_without_quantifiable_content");
    expect(partitionLines[0]!.quantity).toBeNull();
    expect(partitionLines[0]!.stepId).toBe(STEP_PARTITION_ID);
  });

  test("layer 0 (the pure baseline overlay) has an honestly EMPTY impact — zero lines, not a guess", async () => {
    const record = await canonicalService().computeImpact({
      scenarioId: SCENARIO_ID,
      stateIndex: 0,
      importId: IMPORT_ID,
    });
    expect(record.report.lines).toEqual([]);
    expect(record.report.summary.lineCount).toBe(0);
    expect(record.report.summary.quantityLineCount).toBe(0);
    expect(record.report.stateIndex).toBe(0);
  });

  test('"latest" resolves to the last materialized layer', async () => {
    const record = await canonicalService().computeImpact({
      scenarioId: SCENARIO_ID,
      stateIndex: "latest",
      importId: IMPORT_ID,
    });
    expect(record.report.stateIndex).toBe(5);
    expect(record.request.stateIndex).toBe(5);
  });

  test("line ordering is canonical (nodeId, kind order, key) and ids are stable", async () => {
    const record = await canonicalService().computeImpact(CANONICAL_COMPUTE);
    const keys = record.report.lines.map(
      (line) => `${line.targetNodeId}:${line.kind}:${line.basis.propertyKey ?? "geometry"}`,
    );
    expect(keys).toEqual([
      "space-office-101:property_delta:area",
      "wall-east:element_removed:thickness",
      "wall-east:geometry_delta:geometry",
      "wall-north:property_delta:fireRating",
      "wall-north:property_delta:thickness",
      "wall-north:geometry_delta:geometry",
      "wall-partition-new:element_added:fireRating",
      "wall-partition-new:element_added:thickness",
      "wall-partition-new:geometry_delta:geometry",
    ]);
    const ids = new Set(record.report.lines.map((line) => line.lineId));
    expect(ids.size).toBe(record.report.lines.length);
  });
});

describe("impact service: BOQ impacts and source mapping (R8/R9/R11 traceability)", () => {
  test("every quantity line maps to its BOQ item mappings with verbatim source anchors", async () => {
    const record = await canonicalService().computeImpact(CANONICAL_COMPUTE);
    const northThickness = record.report.lines.find(
      (line) => line.targetNodeId === "wall-north" && line.basis.propertyKey === "thickness",
    )!;
    // ONE-TO-MANY: two entries target wall-north (plaster + fire board).
    expect(northThickness.boqMappings).toHaveLength(2);
    const plaster = northThickness.boqMappings.find(
      (entry) => entry.entryId === ENTRY_PLASTER_ID,
    )!;
    expect(plaster.originalText).toBe("Plaster to walls, skim finish");
    expect(plaster.sectionTitle).toBe("Finishes");
    expect(plaster.rowNumber).toBe(4);
    expect(plaster.descriptionCellRef).toBe("Finishes!B4");
    expect(plaster.unitCellRef).toBe("Finishes!C4");
    expect(plaster.unitText).toBe("m2");
    expect(plaster.status).toBe("mapped");
    expect(plaster.confidence).toBe("high");
    // m2 (BOQ) vs mm (delta): lexically DIFFERENT — never a conversion.
    expect(plaster.unitRelation).toBe("different");
    const fireboard = northThickness.boqMappings.find(
      (entry) => entry.entryId === ENTRY_FIREBOARD_ID,
    )!;
    expect(fireboard.unitText).toBe("mm");
    expect(fireboard.unitRelation).toBe("same");
    // The blockwork unit text carries source whitespace (" mm ") — the
    // lexical relation trims OUTER whitespace only.
    const eastThickness = record.report.lines.find(
      (line) => line.targetNodeId === "wall-east" && line.basis.propertyKey === "thickness",
    )!;
    const blockwork = eastThickness.boqMappings.find(
      (entry) => entry.entryId === ENTRY_BLOCKWORK_ID,
    )!;
    expect(blockwork.unitRelation).toBe("same");
  });

  test("unmapped deltas are reported honestly as lines with NO mappings — never dropped", async () => {
    const record = await canonicalService().computeImpact(CANONICAL_COMPUTE);
    const area = record.report.lines.find(
      (line) => line.targetNodeId === "space-office-101",
    )!;
    expect(area.boqMappings).toEqual([]);
    expect(record.report.summary.unmappedLineCount).toBe(1);
    expect(record.report.summary.mappedLineCount).toBe(8);
    // Ambiguous/unmapped BOQ entries never attach to lines (no committed
    // targets) and foreign entries match nothing.
    const entryIds = new Set(
      record.report.lines.flatMap((line) => line.boqMappings.map((entry) => entry.entryId)),
    );
    expect(entryIds.has(ENTRY_PLASTER_ID)).toBe(true);
    // wall-east: 2 lines × 1 mapping; wall-north: 3 lines × 2 mappings;
    // partition: 3 lines × 1 mapping; space: 1 line × 0 mappings.
    expect(record.report.summary.boqMappingRefCount).toBe(11);
  });

  test("unit relations degrade to `unknown` when the BOQ source unit cell is unresolvable", async () => {
    const service = new ImpactService({
      store: new InMemoryImpactStore(),
      clock: fixedClock,
      scenarioResolver: makeScenarioResolver([buildCanonicalScenarioInput()]),
      mappingResolver: makeMappingResolver([buildUnitlessMappingInput()]),
    });
    const record = await service.computeImpact(CANONICAL_COMPUTE);
    const northThickness = record.report.lines.find(
      (line) => line.targetNodeId === "wall-north" && line.basis.propertyKey === "thickness",
    )!;
    for (const mapping of northThickness.boqMappings) {
      expect(mapping.unitRelation).toBe("unknown");
    }
    // Nothing can be priced across an unknown relation.
    expect(record.report.costImpacts).toHaveLength(0);
  });
});

describe("impact service: costs are only ever explicit, same-unit, caller-priced", () => {
  test("cost impacts are computed only for rate-supplied same-unit pairs, signed", async () => {
    const record = await canonicalService().computeImpact(CANONICAL_COMPUTE);
    // wall-north thickness × fireboard (mm, EUR 2.75): +60 × 2.75 = +165.
    // wall-east thickness × blockwork (mm, CHF 85.5): -180 × 85.5 = -15390 (credit).
    // partition thickness × partition entry (mm, CHF 120): +120 × 120 = +14400.
    expect(record.report.costImpacts).toHaveLength(3);
    const north = record.report.costImpacts.find(
      (cost) => cost.entryId === ENTRY_FIREBOARD_ID,
    )!;
    expect(north.amount).toBeCloseTo(165, 10);
    expect(north.rate.currency).toBe("EUR");
    expect(north.quantity.value).toBe(60);
    expect(north.epistemicStatus).toBe("PROPOSED");
    const east = record.report.costImpacts.find(
      (cost) => cost.entryId === ENTRY_BLOCKWORK_ID,
    )!;
    expect(east.amount).toBeCloseTo(-15390, 10);
    const partition = record.report.costImpacts.find(
      (cost) => cost.entryId === ENTRY_PARTITION_ID,
    )!;
    expect(partition.amount).toBeCloseTo(14400, 10);
    // Every cost figure traces to BOTH its quantity line and its entry.
    const lineIds = new Set(record.report.lines.map((line) => line.lineId));
    for (const cost of record.report.costImpacts) {
      expect(lineIds.has(cost.lineId)).toBe(true);
    }
  });

  test("unpriced pairs carry the typed reason (rate_not_supplied / unit_mismatch_not_priced)", async () => {
    const record = await canonicalService().computeImpact(CANONICAL_COMPUTE);
    // wall-north thickness × plaster (m2 vs mm, rate supplied) -> mismatch.
    // area line: UNMAPPED (no pair at all, so no unpriced entry).
    // fireRating lines: no quantity -> not_applicable, no pair.
    expect(record.report.unpricedPairs).toHaveLength(1);
    expect(record.report.unpricedPairs[0]!.code).toBe("unit_mismatch_not_priced");
    expect(record.report.unpricedPairs[0]!.entryId).toBe(ENTRY_PLASTER_ID);
    expect(record.report.summary.unpricedByReason).toEqual({
      rate_not_supplied: 0,
      unit_mismatch_not_priced: 1,
    });
  });

  test("with NO rates supplied every pair is rate_not_supplied and NO cost is invented", async () => {
    const record = await canonicalService().computeImpact(CANONICAL_COMPUTE_UNPRICED);
    expect(record.report.costImpacts).toHaveLength(0);
    expect(record.report.rates).toEqual([]);
    // Four quantified mapped pairs (wall-east thickness, wall-north thickness
    // ×2 entries, partition thickness) — every one honestly unpriced.
    expect(record.report.summary.unpricedPairCount).toBe(4);
    expect(record.report.summary.unpricedByReason.rate_not_supplied).toBe(4);
  });

  test("cost uncertainty is |rate| × sigma_quantity (an uncertain quantity yields an uncertain cost)", async () => {
    const service = new ImpactService({
      store: new InMemoryImpactStore(),
      clock: fixedClock,
      scenarioResolver: makeScenarioResolver([buildUncertainScenarioInput()]),
      mappingResolver: makeMappingResolver([buildCanonicalMappingInput()]),
    });
    const record = await service.computeImpact(CANONICAL_COMPUTE);
    const north = record.report.costImpacts.find(
      (cost) => cost.entryId === ENTRY_FIREBOARD_ID,
    )!;
    // sigma_thickness = sqrt(0.7^2 + 0.5^2); sigma_cost = 2.75 × that.
    expect(north.uncertainty).toBeCloseTo(2.75 * Math.sqrt(0.7 * 0.7 + 0.5 * 0.5), 10);
    const east = record.report.costImpacts.find(
      (cost) => cost.entryId === ENTRY_BLOCKWORK_ID,
    )!;
    expect(east.uncertainty).toBeCloseTo(85.5 * 0.2, 10);
  });

  test("the caller-supplied rates are recorded VERBATIM on the report (cost provenance)", async () => {
    const record = await canonicalService().computeImpact(CANONICAL_COMPUTE);
    expect(record.report.rates).toEqual([...CANONICAL_RATES]);
  });
});

describe("impact service: uncertainty propagation (never false precision)", () => {
  test("an uncertain length yields an uncertain quantity: sigma = sqrt(sigma_to^2 + sigma_from^2)", async () => {
    const service = new ImpactService({
      store: new InMemoryImpactStore(),
      clock: fixedClock,
      scenarioResolver: makeScenarioResolver([buildUncertainScenarioInput()]),
      mappingResolver: makeMappingResolver([buildCanonicalMappingInput()]),
    });
    const record = await service.computeImpact(CANONICAL_COMPUTE);
    const northThickness = record.report.lines.find(
      (line) => line.targetNodeId === "wall-north" && line.basis.propertyKey === "thickness",
    )!;
    expect(northThickness.quantity!.value).toBe(60);
    expect(northThickness.quantity!.uncertainty).toBeCloseTo(
      Math.sqrt(0.7 * 0.7 + 0.5 * 0.5),
      12,
    );
    const partition = record.report.lines.find(
      (line) => line.targetNodeId === "wall-partition-new" && line.basis.propertyKey === "thickness",
    )!;
    expect(partition.quantity!.uncertainty).toBeCloseTo(0.3, 12);
    const east = record.report.lines.find(
      (line) => line.targetNodeId === "wall-east" && line.basis.propertyKey === "thickness",
    )!;
    expect(east.quantity!.uncertainty).toBeCloseTo(0.2, 12);
  });

  test("a one-sided unknown sigma dominates to null — never a partial-precision guess", async () => {
    const service = new ImpactService({
      store: new InMemoryImpactStore(),
      clock: fixedClock,
      scenarioResolver: makeScenarioResolver([buildUncertainScenarioInput()]),
      mappingResolver: makeMappingResolver([buildCanonicalMappingInput()]),
    });
    const record = await service.computeImpact(CANONICAL_COMPUTE);
    // area: baseline side states NO sigma (42.5), proposed side states 0.15.
    const area = record.report.lines.find(
      (line) => line.targetNodeId === "space-office-101",
    )!;
    expect(area.quantity!.value).toBeCloseTo(2.5, 12);
    expect(area.quantity!.uncertainty).toBeNull();
  });
});

describe("impact service: PROPOSED-literal / never-authoritative discipline", () => {
  test("every line, cost figure and the report itself are PROPOSED — observed reality is never claimed", async () => {
    const record = await canonicalService().computeImpact(CANONICAL_COMPUTE);
    expect(record.report.epistemicStatus).toBe("PROPOSED");
    for (const line of record.report.lines) {
      expect(line.epistemicStatus).toBe("PROPOSED");
    }
    for (const cost of record.report.costImpacts) {
      expect(cost.epistemicStatus).toBe("PROPOSED");
    }
  });

  test("the report records the scenario's governance status VERBATIM (no interpretation)", async () => {
    const record = await canonicalService().computeImpact(CANONICAL_COMPUTE);
    expect(record.report.scenarioStatus).toBe("under_review");
    expect(record.report.scenarioId).toBe(SCENARIO_ID);
    expect(record.report.baselineVersionId).toBe("v001");
    expect(record.report.appliedStepIds).toHaveLength(5);
  });
});

describe("impact service: determinism and write-once persistence", () => {
  test("byte-identical recomputation: two fresh services, same inputs + clock -> identical canonical bytes", async () => {
    const first = await canonicalService().computeImpact(CANONICAL_COMPUTE);
    const second = await canonicalService().computeImpact(CANONICAL_COMPUTE);
    expect(canonicalJsonStringify(second)).toBe(canonicalJsonStringify(first));
    expect(second.impactId).toBe(first.impactId);
  });

  test("a different clock changes ONLY recordedAt — the report bytes stay identical", async () => {
    const first = await canonicalService().computeImpact(CANONICAL_COMPUTE);
    const later = new ImpactService({
      store: new InMemoryImpactStore(),
      clock: (): string => FIXED_LATER,
      ...canonicalResolvers(),
    });
    const second = await later.computeImpact(CANONICAL_COMPUTE);
    expect(canonicalJsonStringify(second.report)).toBe(canonicalJsonStringify(first.report));
    expect(second.recordedAt).toBe(FIXED_LATER);
    expect(first.recordedAt).toBe(FIXED_NOW);
  });

  test("idempotent re-computation returns the STORED record byte-identically", async () => {
    const service = canonicalService();
    const first = await service.computeImpact(CANONICAL_COMPUTE);
    const second = await service.computeImpact(CANONICAL_COMPUTE);
    expect(canonicalJsonStringify(second)).toBe(canonicalJsonStringify(first));
  });

  test("a stored record that diverges from the fresh recomputation is a typed refusal", async () => {
    await withTempDir(async (root) => {
      const store = new FsImpactStore(root);
      const service = new ImpactService({
        store,
        clock: fixedClock,
        ...canonicalResolvers(),
      });
      const record = await service.computeImpact(CANONICAL_COMPUTE);
      // Tamper COHERENTLY: re-derive the digest over a changed report body,
      // so the record still parses — only the recomputation can catch it.
      const tampered = {
        ...record,
        report: { ...record.report, title: "Tampered title" },
      };
      const { impactReportDigest } = await import("./model");
      const coherent = {
        ...tampered,
        reportDigest: impactReportDigest(tampered.report),
        history: tampered.history.map((event) => ({
          ...event,
          reportDigest: impactReportDigest(tampered.report),
        })),
      };
      const { promises: fs } = await import("node:fs");
      await fs.writeFile(store.pathOf(record.impactId), canonicalJsonStringify(coherent));
      await expectImpactError(
        () => service.computeImpact(CANONICAL_COMPUTE),
        "impact_record_divergence",
      );
    });
  });

  test("a new mapping revision derives a NEW impact record; the old record is preserved (append-only)", async () => {
    const service = canonicalService();
    const first = await service.computeImpact(CANONICAL_COMPUTE);
    const revised = {
      ...buildCanonicalMappingInput(),
      version: 2,
      entries: buildCanonicalMappingInput().entries.map((entry) =>
        entry.entryId === ENTRY_PLASTER_ID ? { ...entry, unitText: "mm" } : entry,
      ),
    };
    const revisedService = new ImpactService({
      store: new InMemoryImpactStore(),
      clock: fixedClock,
      scenarioResolver: makeScenarioResolver([buildCanonicalScenarioInput()]),
      mappingResolver: makeMappingResolver([revised]),
    });
    const second = await revisedService.computeImpact(CANONICAL_COMPUTE);
    expect(second.impactId).not.toBe(first.impactId);
    expect(second.request.mappingVersion).toBe(2);
    // The original record is still readable (never rewritten or erased).
    expect(await service.getImpact(first.impactId)).not.toBeNull();
    // The plaster entry now being mm-united means one more priced pair.
    expect(second.report.costImpacts).toHaveLength(4);
  });

  test("different rates derive a different impact id (the rates are identity inputs)", async () => {
    const first = await canonicalService().computeImpact(CANONICAL_COMPUTE);
    const second = await canonicalService().computeImpact({
      ...CANONICAL_COMPUTE,
      rates: CANONICAL_RATES.slice(0, 2),
    });
    expect(second.impactId).not.toBe(first.impactId);
  });
});

describe("impact service: the typed refusal matrix", () => {
  test("unknown scenario ref / out-of-range state / missing mapping", async () => {
    const service = canonicalService();
    await expectImpactError(
      () => service.computeImpact({ ...CANONICAL_COMPUTE, scenarioId: "scenario-none" }),
      "unknown_scenario_ref",
    );
    await expectImpactError(
      () => service.computeImpact({ ...CANONICAL_COMPUTE, stateIndex: 6 }),
      "state_not_found",
    );
    await expectImpactError(
      () => service.computeImpact({ ...CANONICAL_COMPUTE, importId: importIdOf("no-mapping") }),
      "mapping_not_available",
    );
  });

  test("an unattributable diff is scenario_projection_invalid — lines never go unattributed", async () => {
    const scenario = editable(buildCanonicalScenarioInput());
    // Corrupt: the thickness delta exists but NO step mentions `thickness`.
    scenario.steps = scenario.steps.filter((step) => step.stepIndex !== 4);
    const service = new ImpactService({
      store: new InMemoryImpactStore(),
      clock: fixedClock,
      scenarioResolver: makeScenarioResolver([scenario]),
      mappingResolver: makeMappingResolver([buildCanonicalMappingInput()]),
    });
    await expectImpactError(() => service.computeImpact(CANONICAL_COMPUTE), "scenario_projection_invalid");
  });

  test("a removed node without a tombstone is scenario_projection_invalid", async () => {
    const scenario = editable(buildCanonicalScenarioInput());
    const state5 = scenario.states[5]!;
    scenario.states[5] = {
      ...state5,
      proposedTombstones: [],
    };
    const service = new ImpactService({
      store: new InMemoryImpactStore(),
      clock: fixedClock,
      scenarioResolver: makeScenarioResolver([scenario]),
      mappingResolver: makeMappingResolver([buildCanonicalMappingInput()]),
    });
    await expectImpactError(() => service.computeImpact(CANONICAL_COMPUTE), "scenario_projection_invalid");
  });

  test("a non-consecutive step spine and a negative stated sigma are scenario_projection_invalid", async () => {
    const gapped = editable(buildCanonicalScenarioInput());
    (gapped.steps[2] as { stepIndex: number }).stepIndex = 9;
    const gappedService = new ImpactService({
      store: new InMemoryImpactStore(),
      clock: fixedClock,
      scenarioResolver: makeScenarioResolver([gapped]),
      mappingResolver: makeMappingResolver([buildCanonicalMappingInput()]),
    });
    await expectImpactError(
      () => gappedService.computeImpact(CANONICAL_COMPUTE),
      "scenario_projection_invalid",
    );

    const negative = editable(buildUncertainScenarioInput());
    const state5 = negative.states[5]!;
    negative.states[5] = {
      ...state5,
      nodes: state5.nodes.map((entry) =>
        entry.nodeId === "wall-north"
          ? {
              ...entry,
              properties: entry.properties.map((property) =>
                property.key === "thickness"
                  ? { ...property, uncertainty: -1 }
                  : property,
              ),
            }
          : entry,
      ),
    };
    const negativeService = new ImpactService({
      store: new InMemoryImpactStore(),
      clock: fixedClock,
      scenarioResolver: makeScenarioResolver([negative]),
      mappingResolver: makeMappingResolver([buildCanonicalMappingInput()]),
    });
    await expectImpactError(
      () => negativeService.computeImpact(CANONICAL_COMPUTE),
      "scenario_projection_invalid",
    );
  });

  test("getImpact/listImpacts: bad id shapes refuse; unknown ids are null; listing is sorted", async () => {
    const service = canonicalService();
    await expectImpactError(() => service.getImpact("not-hex"), "invalid_impact_id");
    expect(await service.getImpact(canonicalJsonStringify(service).slice(0, 64).replace(/[^0-9a-f]/g, "0") || "0".repeat(64))).toBeNull();
    const record = await service.computeImpact(CANONICAL_COMPUTE);
    expect(await service.getImpact(record.impactId)).not.toBeNull();
    const summaries = await service.listImpacts();
    expect(summaries).toHaveLength(1);
    expect(summaries[0]!.impactId).toBe(record.impactId);
    expect(summaries[0]!.lineCount).toBe(9);
    expect(summaries[0]!.costImpactCount).toBe(3);
  });
});
