/**
 * AISE-028 — Impact domain model tests.
 *
 * Covers: the boundary parser matrix (including the PROPOSED-literal
 * rejection of claimed OBSERVED impact figures), the id validators, the
 * uncertainty propagation helpers (the no-false-precision discipline), the
 * content-derived ids/digest determinism and the stored-record parser
 * (digest tampering, non-PROPOSED statuses, structural refusals).
 */

import { describe, expect, test } from "bun:test";
import { canonicalJsonStringify } from "@aise/shared-contracts";
import { sha256Hex } from "../lib/hash";
import type { BoqDocument } from "../boq/model";
import {
  IMPACT_COST_OMISSION_CODES,
  IMPACT_ERROR_CODES,
  IMPACT_LINE_KINDS,
  IMPACT_OMISSION_CODES,
  IMPACT_UNIT_RELATIONS,
  ImpactError,
  deriveCostId,
  deriveImpactId,
  deriveLineId,
  impactReportDigest,
  parseComputeImpactInput,
  parseImpactRecord,
  propagateCostUncertainty,
  propagateDeltaUncertainty,
  propagateSingleUncertainty,
  resolveUnitText,
  validateImpactId,
  validateImportRefId,
  validateScenarioRefId,
  type ImpactErrorCode,
  type ImpactRate,
} from "./model";
import {
  CANONICAL_COMPUTE,
  CANONICAL_RATES,
  IMPORT_ID,
  SCENARIO_ID,
  canonicalResolvers,
  fixedClock,
} from "./testkit";
import { ImpactService } from "./service";
import { InMemoryImpactStore } from "./store";

function expectImpactError(fn: () => unknown, code: ImpactErrorCode): void {
  try {
    fn();
    throw new Error(`expected an ImpactError (${code}) but nothing was thrown`);
  } catch (error) {
    expect(error).toBeInstanceOf(ImpactError);
    expect((error as ImpactError).code).toBe(code);
  }
}

describe("impact model: boundary parser matrix", () => {
  test("the canonical input parses (latest + numeric indices, rates sorted canonically)", () => {
    const parsed = parseComputeImpactInput({
      scenarioId: SCENARIO_ID,
      stateIndex: 5,
      importId: IMPORT_ID,
      rates: {
        [CANONICAL_RATES[3]!.entryId]: { amount: 42, currency: "CHF" },
        [CANONICAL_RATES[0]!.entryId]: { amount: 85.5, currency: "CHF" },
      },
    });
    expect(parsed.scenarioId).toBe(SCENARIO_ID);
    expect(parsed.stateIndex).toBe(5);
    expect(parsed.importId).toBe(IMPORT_ID);
    // Rates come out SORTED by entryId regardless of the input key order.
    expect(parsed.rates?.map((rate) => rate.entryId)).toEqual(
      [...(parsed.rates ?? [])].map((rate) => rate.entryId).sort(),
    );
  });

  test('"latest" is an accepted stateIndex literal', () => {
    const parsed = parseComputeImpactInput({
      scenarioId: SCENARIO_ID,
      stateIndex: "latest",
      importId: IMPORT_ID,
    });
    expect(parsed.stateIndex).toBe("latest");
  });

  test("a non-object body is invalid_impact", () => {
    expectImpactError(() => parseComputeImpactInput("nope"), "invalid_impact");
    expectImpactError(() => parseComputeImpactInput([1, 2]), "invalid_impact");
    expectImpactError(() => parseComputeImpactInput(null), "invalid_impact");
  });

  test("missing scenarioId / importId are invalid_impact; missing stateIndex is never defaulted", () => {
    expectImpactError(
      () => parseComputeImpactInput({ stateIndex: 1, importId: IMPORT_ID }),
      "invalid_impact",
    );
    expectImpactError(
      () => parseComputeImpactInput({ scenarioId: "", stateIndex: 1, importId: IMPORT_ID }),
      "invalid_impact",
    );
    expectImpactError(
      () => parseComputeImpactInput({ scenarioId: SCENARIO_ID, importId: IMPORT_ID }),
      "invalid_impact",
    );
    expectImpactError(
      () => parseComputeImpactInput({ scenarioId: SCENARIO_ID, stateIndex: 1, importId: "" }),
      "invalid_impact",
    );
    expectImpactError(
      () => parseComputeImpactInput({ scenarioId: SCENARIO_ID, stateIndex: 1, importId: "x" }),
      "invalid_import_ref",
    );
  });

  test("oversized scenarioId is invalid_scenario_ref; malformed importId is invalid_import_ref", () => {
    expectImpactError(
      () =>
        parseComputeImpactInput({
          scenarioId: "x".repeat(257),
          stateIndex: 1,
          importId: IMPORT_ID,
        }),
      "invalid_scenario_ref",
    );
    expectImpactError(
      () =>
        parseComputeImpactInput({
          scenarioId: SCENARIO_ID,
          stateIndex: 1,
          importId: "not-hex",
        }),
      "invalid_import_ref",
    );
  });

  test("malformed stateIndex values are invalid_state_index (floats, negatives, junk strings)", () => {
    for (const stateIndex of [1.5, -1, "2", null, true, {}]) {
      expectImpactError(
        () => parseComputeImpactInput({ scenarioId: SCENARIO_ID, stateIndex, importId: IMPORT_ID }),
        "invalid_state_index",
      );
    }
    expect(() =>
      parseComputeImpactInput({ scenarioId: SCENARIO_ID, stateIndex: 0, importId: IMPORT_ID }),
    ).not.toThrow();
  });

  test("PROPOSED-LITERAL at the boundary: a claimed OBSERVED/INFERRED/CONFIRMED impact is a typed rejection", () => {
    for (const claimed of ["OBSERVED", "INFERRED", "CONFIRMED"]) {
      expectImpactError(
        () =>
          parseComputeImpactInput({
            scenarioId: SCENARIO_ID,
            stateIndex: 1,
            importId: IMPORT_ID,
            epistemicStatus: claimed,
          }),
        "invalid_epistemic_status",
      );
    }
    // Claiming PROPOSED explicitly is accepted (it is the only truth).
    expect(() =>
      parseComputeImpactInput({
        scenarioId: SCENARIO_ID,
        stateIndex: 1,
        importId: IMPORT_ID,
        epistemicStatus: "PROPOSED",
      }),
    ).not.toThrow();
  });

  test("malformed rate maps are invalid_rate_input (never silently dropped)", () => {
    expectImpactError(
      () => parseComputeImpactInput({ ...CANONICAL_COMPUTE, rates: [] }),
      "invalid_rate_input",
    );
    expectImpactError(
      () =>
        parseComputeImpactInput({
          ...CANONICAL_COMPUTE,
          rates: { entry: { amount: -1, currency: "CHF" } },
        }),
      "invalid_rate_input",
    );
    expectImpactError(
      () =>
        parseComputeImpactInput({
          ...CANONICAL_COMPUTE,
          rates: { entry: { amount: Number.NaN, currency: "CHF" } },
        }),
      "invalid_rate_input",
    );
    expectImpactError(
      () =>
        parseComputeImpactInput({
          ...CANONICAL_COMPUTE,
          rates: { entry: { amount: 10, currency: "" } },
        }),
      "invalid_rate_input",
    );
    expectImpactError(
      () =>
        parseComputeImpactInput({
          ...CANONICAL_COMPUTE,
          rates: { entry: { amount: 10, currency: "x".repeat(17) } },
        }),
      "invalid_rate_input",
    );
    expectImpactError(
      () => parseComputeImpactInput({ ...CANONICAL_COMPUTE, rates: { entry: 42 } }),
      "invalid_rate_input",
    );
    // A zero rate is a legitimate explicit figure (finite, >= 0).
    expect(() =>
      parseComputeImpactInput({ ...CANONICAL_COMPUTE, rates: { entry: { amount: 0, currency: "CHF" } } }),
    ).not.toThrow();
  });
});

describe("impact model: id validators", () => {
  test("validateImpactId accepts only 64-hex content ids", () => {
    expect(() => validateImpactId(sha256Hex("impact"))).not.toThrow();
    expectImpactError(() => validateImpactId("imp-1234"), "invalid_impact_id");
    expectImpactError(() => validateImpactId(""), "invalid_impact_id");
    expectImpactError(() => validateImpactId(`imp-${"a".repeat(63)}`), "invalid_impact_id");
  });

  test("validateScenarioRefId mirrors the intervention authority's bounds", () => {
    expect(() => validateScenarioRefId("s")).not.toThrow();
    expectImpactError(() => validateScenarioRefId(""), "invalid_scenario_ref");
    expectImpactError(() => validateScenarioRefId("x".repeat(257)), "invalid_scenario_ref");
  });

  test("validateImportRefId accepts only 64-hex import content ids", () => {
    expect(() => validateImportRefId(IMPORT_ID)).not.toThrow();
    expectImpactError(() => validateImportRefId("v001"), "invalid_import_ref");
  });
});

describe("impact model: uncertainty propagation (the no-false-precision discipline)", () => {
  test("a two-sided delta propagates sigma = sqrt(sigma_to^2 + sigma_from^2)", () => {
    const measurement = propagateDeltaUncertainty(300, 240, 0.7, 0.5);
    expect(measurement.value).toBe(60);
    expect(measurement.uncertainty).toBeCloseTo(Math.sqrt(0.7 * 0.7 + 0.5 * 0.5), 12);
  });

  test("an unknown sigma on EITHER side dominates to null — never a false-precision number", () => {
    expect(propagateDeltaUncertainty(300, 240, 0.7, undefined).uncertainty).toBeNull();
    expect(propagateDeltaUncertainty(300, 240, undefined, 0.5).uncertainty).toBeNull();
    expect(propagateDeltaUncertainty(300, 240, undefined, undefined).uncertainty).toBeNull();
  });

  test("single-sided quantities carry the property's own stated sigma; absent stays null", () => {
    expect(propagateSingleUncertainty(120, 0.3)).toEqual({ value: 120, uncertainty: 0.3 });
    expect(propagateSingleUncertainty(120, undefined).uncertainty).toBeNull();
  });

  test("cost uncertainty is |rate| * sigma_quantity; null stays null", () => {
    expect(propagateCostUncertainty(15390, 85.5, 2)).toBeCloseTo(171, 12);
    expect(propagateCostUncertainty(15390, 85.5, null)).toBeNull();
  });

  test("no stated uncertainty anywhere serializes as explicit null — NEVER as zero", async () => {
    const service = new ImpactService({
      store: new InMemoryImpactStore(),
      clock: fixedClock,
      ...canonicalResolvers(),
    });
    const record = await service.computeImpact(CANONICAL_COMPUTE);
    const text = canonicalJsonStringify(record);
    for (const line of record.report.lines) {
      if (line.quantity !== null) {
        // The discipline: an absent sigma is "not stated" (null), never 0.
        expect(line.quantity.uncertainty === null || line.quantity.uncertainty > 0).toBe(true);
      }
    }
    expect(text).not.toMatch(/"uncertainty"\s*:\s*0\b/);
    const thickness = record.report.lines.find(
      (line) => line.targetNodeId === "wall-north" && line.basis.propertyKey === "thickness",
    );
    expect(thickness?.quantity?.uncertainty).toBeNull();
  });
});

describe("impact model: content-derived ids and digests", () => {
  test("deriveImpactId is deterministic and sensitive to every identity input", () => {
    const identity = {
      scenarioId: SCENARIO_ID,
      stateId: sha256Hex("state-a"),
      stateIndex: 3,
      baselineVersionId: "v001",
      importId: IMPORT_ID,
      mappingId: sha256Hex("mapping"),
      mappingVersion: 2,
      rates: [] as readonly ImpactRate[],
    };
    expect(deriveImpactId(identity)).toBe(deriveImpactId(identity));
    expect(deriveImpactId({ ...identity, stateIndex: 4 })).not.toBe(deriveImpactId(identity));
    expect(deriveImpactId({ ...identity, mappingVersion: 3 })).not.toBe(deriveImpactId(identity));
    expect(
      deriveImpactId({
        ...identity,
        rates: [{ entryId: "e", amount: 1, currency: "CHF" }],
      }),
    ).not.toBe(deriveImpactId(identity));
  });

  test("deriveLineId / deriveCostId are content-derived and collision-free across discriminators", () => {
    const impactId = sha256Hex("impact");
    const a = deriveLineId(impactId, "wall-north", "property_delta", "thickness");
    const b = deriveLineId(impactId, "wall-north", "property_delta", "fireRating");
    const c = deriveLineId(impactId, "wall-north", "geometry_delta", "geometry");
    expect(new Set([a, b, c]).size).toBe(3);
    expect(a.startsWith("line-")).toBe(true);
    expect(deriveCostId(a, "entry-1").startsWith("cost-")).toBe(true);
    expect(deriveCostId(a, "entry-1")).not.toBe(deriveCostId(a, "entry-2"));
  });

  test("impactReportDigest pins the canonical report bytes", async () => {
    const service = new ImpactService({
      store: new InMemoryImpactStore(),
      clock: fixedClock,
      ...canonicalResolvers(),
    });
    const record = await service.computeImpact(CANONICAL_COMPUTE);
    expect(record.reportDigest).toBe(impactReportDigest(record.report));
    // A single byte of report content changes the digest.
    const tampered = { ...record.report, title: record.report.title + "!" };
    expect(impactReportDigest(tampered)).not.toBe(record.reportDigest);
  });
});

describe("impact model: vocabularies are frozen", () => {
  test("the registries are frozen and stable", () => {
    expect(Object.isFrozen(IMPACT_LINE_KINDS)).toBe(true);
    expect(Object.isFrozen(IMPACT_OMISSION_CODES)).toBe(true);
    expect(Object.isFrozen(IMPACT_COST_OMISSION_CODES)).toBe(true);
    expect(Object.isFrozen(IMPACT_UNIT_RELATIONS)).toBe(true);
    expect(Object.isFrozen(IMPACT_ERROR_CODES)).toBe(true);
    expect([...IMPACT_LINE_KINDS]).toEqual([
      "property_delta",
      "element_added",
      "element_removed",
      "geometry_delta",
    ]);
    expect([...IMPACT_OMISSION_CODES]).toContain("geometry_ref_unresolved");
    expect([...IMPACT_OMISSION_CODES]).toContain("non_projectable_geometry_kind");
    expect([...IMPACT_OMISSION_CODES]).toContain("unit_mismatch_not_computed");
    expect([...IMPACT_COST_OMISSION_CODES]).toEqual(["rate_not_supplied", "unit_mismatch_not_priced"]);
    expect([...IMPACT_UNIT_RELATIONS]).toEqual(["same", "different", "unknown", "not_applicable"]);
  });
});

describe("impact model: the stored-record parser (PROPOSED re-read discipline)", () => {
  async function computedRecordJson(): Promise<{ record: unknown; text: string }> {
    const service = new ImpactService({
      store: new InMemoryImpactStore(),
      clock: fixedClock,
      ...canonicalResolvers(),
    });
    const record = await service.computeImpact(CANONICAL_COMPUTE);
    return { record: JSON.parse(canonicalJsonStringify(record)), text: canonicalJsonStringify(record) };
  }

  test("a computed record round-trips through JSON -> parseImpactRecord byte-identically", async () => {
    const { record, text } = await computedRecordJson();
    const parsed = parseImpactRecord(record);
    expect(parsed.impactId).toBe((record as { impactId: string }).impactId);
    expect(canonicalJsonStringify(parsed)).toBe(text);
  });

  test("a stored line claiming OBSERVED is a typed rejection — never silently re-read as fact", async () => {
    const { record } = await computedRecordJson();
    const lines = (record as { report: { lines: { epistemicStatus: string }[] } }).report.lines;
    lines[0]!.epistemicStatus = "OBSERVED";
    expectImpactError(() => parseImpactRecord(record), "invalid_impact_record");
  });

  test("a stored line carrying BOTH a quantity and an omission code is a typed rejection", async () => {
    const { record } = await computedRecordJson();
    const lines = (record as { report: { lines: { omissionCode: unknown }[] } }).report.lines;
    const withQuantity = lines.find((line) => line.omissionCode === null)!;
    withQuantity.omissionCode = "geometry_ref_unresolved";
    expectImpactError(() => parseImpactRecord(record), "invalid_impact_record");
  });

  test("a stored line with NO quantity and NO omission code is a typed rejection (never a silent zero)", async () => {
    const { record } = await computedRecordJson();
    const lines = (record as { report: { lines: { omissionCode: unknown }[] } }).report.lines;
    const omissionLine = lines.find((line) => line.omissionCode !== null)!;
    omissionLine.omissionCode = null;
    expectImpactError(() => parseImpactRecord(record), "invalid_impact_record");
  });

  test("an unsorted stored rates array is a typed rejection (canonical order on disk)", async () => {
    const { record } = await computedRecordJson();
    const rates = (record as { report: { rates: unknown[] } }).report.rates;
    rates.reverse();
    expectImpactError(() => parseImpactRecord(record), "invalid_impact_record");
  });
});

describe("impact model: resolveUnitText (verbatim source-cell unit resolution)", () => {
  const document: BoqDocument = {
    sheets: [
      {
        name: "Finishes",
        dimension: null,
        mergedRanges: [],
        sections: [],
        rows: [
          {
            rowNumber: 4,
            cells: [
              { ref: "B4", column: "B", row: 4, value: "Plaster to walls", type: "string", raw: "Plaster to walls" },
              { ref: "C4", column: "C", row: 4, value: null, type: "empty", raw: " " },
            ],
          },
        ],
      },
    ],
  };

  test("resolves the VERBATIM raw text of the unit cell (whitespace untouched)", () => {
    expect(resolveUnitText(document, "Finishes!C4")).toBe(" ");
    expect(resolveUnitText(document, "Finishes!B4")).toBe("Plaster to walls");
  });

  test("unresolvable refs and absent documents are honest nulls, never guesses", () => {
    expect(resolveUnitText(document, "Masonry!C12")).toBeNull();
    expect(resolveUnitText(document, "Finishes!C99")).toBeNull();
    expect(resolveUnitText(document, null)).toBeNull();
    expect(resolveUnitText(undefined, "Finishes!C4")).toBeNull();
    expect(resolveUnitText(document, "malformed")).toBeNull();
    expect(resolveUnitText(document, "!C4")).toBeNull();
    expect(resolveUnitText(document, "Finishes!")).toBeNull();
  });
});
