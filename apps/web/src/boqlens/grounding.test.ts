/**
 * AISE-024 BOQ Lens tests — THE R8 ACCEPTANCE (traceability), health checks
 * (the claims-without-provenance invariant + mutation matrix) and search.
 *
 * Grounding acceptance: every `data-claim-id` in the rendered HTML resolves
 * through `traceClaim` to a NON-EMPTY chain of source cells / interpretation
 * records / mapping records / explicit inference markers. A claim with
 * fabricated or missing provenance trips the health check (mutations).
 */

import { describe, expect, test } from "bun:test";
import * as lens from "./index";
import { BoqLensError } from "./errors";
import { boqLensInput } from "./fixtures";
import type { BoqLensInput, TraceChain } from "./model";

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function claimIdsIn(html: string): string[] {
  return [...html.matchAll(/data-claim-id="([^"]+)"/g)].map((match) => match[1] ?? "");
}

function trace(claimId: string, input: BoqLensInput = boqLensInput()): TraceChain {
  return lens.traceClaim(claimId, input);
}

function refsOf(chain: TraceChain): string[] {
  return chain.steps.map((step) => step.ref);
}

/** The fixture item at `index` (typed access — fixtures always have it). */
function itemAt(input: BoqLensInput, index: number) {
  const item = input.items[index];
  if (item === undefined) {
    throw new Error(`fixture item at index ${index} is missing`);
  }
  return item;
}

/* ------------------------------------------------------------------ */
/* THE grounding acceptance                                            */
/* ------------------------------------------------------------------ */

describe("R8 grounding acceptance — every rendered claim traces to source", () => {
  test("every data-claim-id in the rendered HTML resolves to a non-empty trace chain", () => {
    const input = boqLensInput();
    const html = lens.renderBoqLens(input);
    const claimIds = [...new Set(claimIdsIn(html))];
    // The fixture renders 36 distinct claims across the three views.
    expect(claimIds.length).toBe(36);
    for (const claimId of claimIds) {
      const chain = trace(claimId, input);
      expect(chain.steps.length).toBeGreaterThan(0);
      expect(chain.claimId).toBe(claimId);
    }
  });

  test("every chain on the clean fixture is grounded (at least one BOQ-evidence step)", () => {
    const input = boqLensInput();
    const html = lens.renderBoqLens(input);
    for (const claimId of new Set(claimIdsIn(html))) {
      const chain = trace(claimId, input);
      expect(chain.grounded).toBe(true);
      expect(chain.steps.some((step) => step.kind === "source-cell" || step.kind === "interpretation-record" || step.kind === "mapping-record")).toBe(true);
    }
  });

  test("an item claim traces to the description, unit and numeric source cells", () => {
    const chain = trace("claim:item:sub-r12");
    expect(refsOf(chain)).toContain("Substructure!B12");
    expect(refsOf(chain)).toContain("Substructure!C12");
    expect(refsOf(chain)).toContain("Substructure!D12");
    expect(refsOf(chain)).toContain("Substructure!E12");
    expect(refsOf(chain)).toContain("Substructure!F12");
    expect(chain.steps.every((step) => step.kind === "source-cell" || step.kind === "inference")).toBe(true);
  });

  test("an interpretation claim cites the interpretation record and its source refs", () => {
    const chain = trace("claim:interpretation:sub-r12");
    const record = chain.steps.find((step) => step.kind === "interpretation-record");
    expect(record).toBeDefined();
    expect(record?.ref).toBe("interpretation:sub-r12:description");
    expect(record?.detail).toContain("PLASTERING");
    expect(refsOf(chain)).toContain("Substructure!B12");
    expect(refsOf(chain)).toContain("Substructure!C12");
  });

  test("a mapping claim cites the mapping entry, its provenance and its anchor cells", () => {
    const chain = trace("claim:mapping:sub-r12");
    const record = chain.steps.find((step) => step.kind === "mapping-record");
    expect(record?.ref).toBe("mapping:entry-sub-r12");
    expect(record?.detail).toContain("mapped (medium, normalized_concept_match)");
    expect(record?.detail).toContain("concept PLASTERING → wall elements");
    expect(refsOf(chain)).toContain("Substructure!B12");
    expect(refsOf(chain)).toContain("Substructure!C12");
  });

  test("section totals trace to exactly their contributing amount cells", () => {
    const substructure = trace("claim:section-total:0");
    expect(refsOf(substructure)).toEqual(["Substructure!F12", "Substructure!F13", "Substructure!F14"]);
    expect(substructure.steps.every((step) => step.kind === "source-cell")).toBe(true);
    const finishes = trace("claim:section-total:1");
    expect(refsOf(finishes)).toEqual(["Finishes!F4", "Finishes!F5", "claim:section-total:1"]);
    expect(finishes.steps[2]?.kind).toBe("inference");
    expect(finishes.steps[2]?.detail).toContain("1 item(s) without a stated amount (never assumed zero)");
  });

  test("the grand-total chain lists every contributing cell and the exclusion inference", () => {
    const chain = trace("claim:grand-total");
    expect(refsOf(chain)).toEqual([
      "Substructure!F12",
      "Substructure!F13",
      "Substructure!F14",
      "Finishes!F4",
      "Finishes!F5",
      "claim:grand-total",
    ]);
    expect(chain.steps[5]?.kind).toBe("inference");
  });

  test("an explanation claim composes item + interpretation + mapping evidence", () => {
    const chain = trace("claim:explanation:sub-r12");
    const kinds = new Set(chain.steps.map((step) => step.kind));
    expect(kinds.has("source-cell")).toBe(true);
    expect(kinds.has("interpretation-record")).toBe(true);
    expect(kinds.has("mapping-record")).toBe(true);
  });

  test("location groups trace to the mapping records that locate them", () => {
    const groundFloor = trace("claim:location:0");
    const records = groundFloor.steps.filter((step) => step.kind === "mapping-record");
    expect(records.map((step) => step.ref).sort()).toEqual(["mapping:entry-fin-r5", "mapping:entry-sub-r12"]);
    expect(records[0]?.detail).toContain("wall-e @ Site A / Building 1 / Ground Floor");
  });

  test("the location-unconfirmed group traces to the honest-unknown mapping records", () => {
    const chain = trace("claim:location:unconfirmed");
    const records = chain.steps.filter((step) => step.kind === "mapping-record");
    expect(records.map((step) => step.ref).sort()).toEqual([
      "mapping:entry-fin-r4",
      "mapping:entry-fin-r6",
      "mapping:entry-sub-r14",
    ]);
    expect(records.some((step) => step.detail.includes("unmapped"))).toBe(true);
    expect(records.some((step) => step.detail.includes("row 4"))).toBe(true);
  });

  test("health-stat claims trace to the entries they count", () => {
    const mapped = trace("claim:health:mapped");
    expect(mapped.steps.filter((step) => step.kind === "mapping-record").map((step) => step.ref).sort()).toEqual([
      "mapping:entry-fin-r5",
      "mapping:entry-sub-r12",
      "mapping:entry-sub-r13",
    ]);
    const unresolved = trace("claim:health:concepts-unresolved");
    expect(unresolved.steps.map((step) => step.ref)).toEqual(["interpretation:sub-r14:description"]);
  });

  test("an input without an unconfirmed group refuses the unconfirmed claim id", () => {
    const input = boqLensInput();
    (input as unknown as Record<string, unknown>).items = input.items.filter(
      (item) => item.mapping?.status === "mapped",
    );
    expect(trace("claim:location:0", input).claimKind).toBe("location-group");
    try {
      trace("claim:location:unconfirmed", input);
      throw new Error("expected unknown_claim");
    } catch (error) {
      expect(error).toBeInstanceOf(BoqLensError);
      expect((error as BoqLensError).code).toBe("unknown_claim");
    }
  });

  test("unknown claim ids are typed refusals, never empty chains", () => {
    for (const claimId of [
      "claim:bogus",
      "claim:item:nope",
      "claim:interpretation:nope",
      "claim:mapping:nope",
      "claim:explanation:nope",
      "claim:section-total:99",
      "claim:location:99",
      "claim:health:bogus",
    ]) {
      try {
        trace(claimId);
        throw new Error(`expected unknown_claim for ${claimId}`);
      } catch (error) {
        expect(error).toBeInstanceOf(BoqLensError);
        expect((error as BoqLensError).code).toBe("unknown_claim");
      }
    }
  });

  test("traceClaim is pure: a deep-frozen input traces and is unchanged", () => {
    const input = boqLensInput();
    Object.freeze(input);
    const before = JSON.stringify(input);
    expect(trace("claim:item:fin-r5", input).steps.length).toBeGreaterThan(0);
    expect(JSON.stringify(input)).toBe(before);
  });
});

/* ------------------------------------------------------------------ */
/* Health checks                                                       */
/* ------------------------------------------------------------------ */

describe("health checks", () => {
  test("mapping coverage stats are correct for the fixture", () => {
    const health = lens.computeBoqHealth(boqLensInput());
    expect(health.totalItems).toBe(6);
    expect(health.mapped).toBe(3);
    expect(health.ambiguous).toBe(1);
    expect(health.unmapped).toBe(2);
    expect(health.byMappingConfidence).toEqual({ high: 1, medium: 2, low: 2, uncertain: 1 });
    expect(health.conceptsResolved).toBe(5);
    expect(health.conceptsUnresolved).toBe(1);
    expect(health.uncertainInterpretations).toBe(2);
  });

  test("THE invariant: claims without provenance is ZERO on the clean fixture", () => {
    const health = lens.computeBoqHealth(boqLensInput());
    expect(health.claimsWithoutProvenance).toBe(0);
    expect(health.provenanceDefects).toEqual([]);
  });

  test("MUTATION: an interpretation record stripped of source refs trips the invariant", () => {
    const input = boqLensInput();
    const description = itemAt(input, 0).interpretation?.description;
    if (description === null || description === undefined) {
      throw new Error("fixture row 12 must carry a description interpretation");
    }
    (description as unknown as Record<string, unknown>).sourceRefs = [];
    const health = lens.computeBoqHealth(input);
    expect(health.claimsWithoutProvenance).toBeGreaterThan(0);
    expect(health.provenanceDefects.some((defect) => defect.includes("cites no source refs"))).toBe(true);
    expect(health.provenanceDefects.some((defect) => defect.includes("row 12"))).toBe(true);
  });

  test("MUTATION: a fabricated cell ref (not in the source document) trips the invariant", () => {
    const input = boqLensInput();
    (input.items[1] as unknown as Record<string, unknown>).descriptionCellRef = "Substructure!Z999";
    const health = lens.computeBoqHealth(input);
    expect(health.claimsWithoutProvenance).toBe(1);
    expect(health.provenanceDefects[0]).toContain("fabricated provenance");
  });

  test("MUTATION: a stated amount without a cell ref trips the invariant", () => {
    const input = boqLensInput();
    const amount = itemAt(input, 2).amount;
    if (amount === null) {
      throw new Error("fixture row 14 must carry an amount");
    }
    (amount as unknown as Record<string, unknown>).cellRef = null;
    const health = lens.computeBoqHealth(input);
    expect(health.claimsWithoutProvenance).toBe(1);
    expect(health.provenanceDefects[0]).toContain("has no source cell ref");
  });

  test("MUTATION: a mapping entry anchoring no source cell trips the invariant", () => {
    const input = boqLensInput();
    const boqItem = itemAt(input, 5).mapping?.boqItem as unknown as Record<string, unknown>;
    boqItem.descriptionCellRef = null;
    boqItem.unitCellRef = null;
    const health = lens.computeBoqHealth(input);
    expect(health.claimsWithoutProvenance).toBe(1);
    expect(health.provenanceDefects[0]).toContain("anchors no source cell");
  });

  test("MUTATION: a valid cell ref added to the inventory resolves the fabrication defect (discrimination)", () => {
    const input = boqLensInput();
    (itemAt(input, 1) as unknown as Record<string, unknown>).descriptionCellRef = "Substructure!B99";
    // Not in the inventory → fabricated.
    expect(lens.computeBoqHealth(input).claimsWithoutProvenance).toBe(1);
    (input as unknown as Record<string, unknown>).sourceCellRefs = [
      ...input.sourceCellRefs,
      "Substructure!B99",
    ];
    expect(lens.computeBoqHealth(input).claimsWithoutProvenance).toBe(0);
  });

  test("an empty input has zero counts and no defects (fail-open honesty)", () => {
    const health = lens.computeBoqHealth({
      importId: "imp-empty",
      sourceName: "empty.xlsx",
      dictionaryVersion: null,
      mappingVersion: null,
      sourceCellRefs: [],
      items: [],
    });
    expect(health.totalItems).toBe(0);
    expect(health.claimsWithoutProvenance).toBe(0);
  });
});

/* ------------------------------------------------------------------ */
/* Search                                                              */
/* ------------------------------------------------------------------ */

describe("searchBoqItems", () => {
  test("matches the VERBATIM original text (case-insensitive)", () => {
    const results = lens.searchBoqItems("PLASTER", boqLensInput());
    expect(results.map((result) => result.itemId)).toEqual(["sub-r12"]);
    expect(results[0]?.matchedIn).toEqual(["original-text", "normalized-concept"]);
    expect(results[0]?.rowNumber).toBe(12);
    expect(results[0]?.cellRefs).toEqual([
      "Substructure!B12",
      "Substructure!C12",
      "Substructure!D12",
      "Substructure!E12",
      "Substructure!F12",
    ]);
  });

  test("matches normalized concepts (derived haystacks)", () => {
    const results = lens.searchBoqItems("floor_finish", boqLensInput());
    expect(results.map((result) => result.itemId)).toEqual(["fin-r4"]);
    expect(results[0]?.matchedIn).toEqual(["normalized-concept"]);
  });

  test("matches normalized unit codes", () => {
    const results = lens.searchBoqItems("cbm", boqLensInput());
    expect(results.map((result) => result.itemId)).toEqual(["sub-r13", "sub-r14"]);
    expect(results.every((result) => result.matchedIn.includes("normalized-unit"))).toBe(true);
  });

  test("matches target locations (mapped space paths)", () => {
    const results = lens.searchBoqItems("GROUND FLOOR", boqLensInput());
    expect(results.map((result) => result.itemId)).toEqual(["sub-r12", "fin-r5"]);
    expect(results.every((result) => result.matchedIn.includes("target-location"))).toBe(true);
  });

  test("no match and empty/blank queries return an empty array", () => {
    const input = boqLensInput();
    expect(lens.searchBoqItems("xyz-no-match", input)).toEqual([]);
    expect(lens.searchBoqItems("", input)).toEqual([]);
    expect(lens.searchBoqItems("   ", input)).toEqual([]);
  });

  test("results are in input order and deterministic across calls", () => {
    const input = boqLensInput();
    const first = lens.searchBoqItems("s", input);
    const second = lens.searchBoqItems("s", input);
    expect(first).toEqual(second);
    // Every fixture row matches "s" somewhere; input order is preserved.
    expect(first.map((result) => result.itemId)).toEqual([
      "sub-r12",
      "sub-r13",
      "sub-r14",
      "fin-r4",
      "fin-r5",
      "fin-r6",
    ]);
  });

  test("ambiguous items expose no location haystack (alternatives are not asserted locations)", () => {
    const results = lens.searchBoqItems("first floor", boqLensInput());
    expect(results).toEqual([]);
  });
});
