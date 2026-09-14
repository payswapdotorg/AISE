/**
 * Dictionary tests (AISE-014) — the deterministic interpretation tables:
 * unit aliases (>= 25 mandated cases incl. case/punctuation variants),
 * unknown/near-miss unit discipline, concept classification (representative
 * descriptions + the mandated ambiguous cases), abbreviation expansion, and
 * dictionary invariants (sizes, uniqueness, version format).
 */

import { describe, expect, test } from "bun:test";
import type { BoqCell } from "../model";
import {
  ABBREVIATION_DICTIONARY,
  CONCEPT_DICTIONARY,
  DICTIONARY_VERSION,
  UNIT_ALIAS_TO_CODE,
  UNIT_CODES,
  UNIT_NEAR_SPELLINGS,
} from "./dictionaries";
import { interpretDescription, interpretUnit } from "./normalizer";
import type { InterpretationConfidence, InterpretationMethod } from "./types";

/** Minimal description/unit cell for interpretation-level tests. */
function cell(ref: string, value: string | number, raw: string): BoqCell {
  return {
    ref,
    column: ref.replace(/[0-9]/g, ""),
    row: Number(ref.replace(/[A-Z]/g, "")),
    value,
    type: typeof value === "string" ? "string" : "number",
    raw,
  };
}

function unit(ref: string, value: string): BoqCell {
  return cell(ref, value, value);
}

function description(ref: string, value: string): BoqCell {
  return cell(ref, value, value);
}

describe("unit dictionary: aliases -> canonical codes (>= 25 cases)", () => {
  const aliasCases: ReadonlyArray<[string, string]> = [
    // volume
    ["CUM", "m3"],
    ["cum", "m3"],
    ["cu.m", "m3"],
    ["cu m", "m3"],
    ["cubic metre", "m3"],
    ["cubic meter", "m3"],
    ["m³", "m3"],
    ["cbm", "m3"],
    ["m^3", "m3"],
    // area
    ["SQM", "m2"],
    ["sqm", "m2"],
    ["sq.m", "m2"],
    ["sq m", "m2"],
    ["square metre", "m2"],
    ["m²", "m2"],
    ["sq", "m2"],
    ["m^2", "m2"],
    // length
    ["metre", "m"],
    ["meter", "m"],
    ["lm", "m"],
    ["rmt", "m"],
    ["lin.m", "m"],
    ["millimetre", "mm"],
    // mass
    ["kgs", "kg"],
    ["kilogram", "kg"],
    ["kilo", "kg"],
    ["tonnes", "t"],
    ["ton", "t"],
    // volume (liquid)
    ["litre", "l"],
    ["ltr", "l"],
    // count (the design's "No." family -> nr)
    ["each", "nr"],
    ["pc", "nr"],
    ["pcs", "nr"],
    ["nos", "nr"],
    ["No.", "nr"],
    ["no", "nr"],
    ["number", "nr"],
    ["EA", "nr"],
    // assemblies / time / practice
    ["sets", "set"],
    ["lots", "lot"],
    ["hrs", "hr"],
    ["hour", "hr"],
    ["days", "day"],
    ["bags", "bag"],
    ["trips", "trip"],
  ];

  test("every alias maps to its canonical code as a dictionary_synonym", () => {
    expect(aliasCases.length).toBeGreaterThanOrEqual(25);
    for (const [value, code] of aliasCases) {
      const interpretation = interpretUnit(unit("C1", value), [`S!C1`]);
      expect(interpretation.unitCode).toBe(code);
      expect(interpretation.method).toBe("dictionary_synonym");
      expect(interpretation.confidence).toBe("medium");
      expect(interpretation.originalText).toBe(value);
      expect(interpretation.normalizedText).toBe(code);
    }
  });

  test("canonical codes are dictionary_exact (high), incl. case/whitespace/period/parens variants", () => {
    const exactCases: ReadonlyArray<[string, string]> = [
      ["m3", "m3"],
      ["m2", "m2"],
      ["kg", "kg"],
      ["M3", "m3"], // case-folding of the code itself
      ["KG", "kg"],
      ["  m3  ", "m3"], // surrounding whitespace
      ["m3.", "m3"], // trailing period stripped
      ["(m2)", "m2"], // one enclosing paren pair unwrapped
      ["Nr", "nr"],
    ];
    for (const [value, code] of exactCases) {
      const interpretation = interpretUnit(unit("C1", value), ["S!C1"]);
      expect(interpretation.unitCode).toBe(code);
      expect(interpretation.method).toBe("dictionary_exact");
      expect(interpretation.confidence).toBe("high");
      expect(interpretation.originalText).toBe(value);
    }
  });
});

describe("unit dictionary: unknown and near-miss units (never guessed)", () => {
  test("completely unknown unit: unresolved + uncertain, no alternatives, no unitCode", () => {
    const interpretation = interpretUnit(unit("C1", "xyzzy"), ["S!C1"]);
    expect(interpretation.method).toBe("unresolved");
    expect(interpretation.confidence).toBe("uncertain");
    expect(interpretation.unitCode).toBeUndefined();
    expect(interpretation.normalizedText).toBeUndefined();
    expect(interpretation.alternatives ?? []).toHaveLength(0);
    expect(interpretation.originalText).toBe("xyzzy");
    expect(interpretation.notes).toContain("unmatched unit text");
  });

  test("single near-miss candidate (edit distance <= 2): low confidence, alternative recorded, NOT applied", () => {
    // "kge" is distance 1 from the canonical "kg" and > 2 from every other
    // code/alias spelling.
    const interpretation = interpretUnit(unit("C1", "kge"), ["S!C1"]);
    expect(interpretation.method).toBe("unresolved");
    expect(interpretation.confidence).toBe("low");
    expect(interpretation.unitCode).toBeUndefined();
    expect(interpretation.alternatives).toEqual([{ code: "kg", reason: "edit distance 1 from 'kg'" }]);
    expect(interpretation.notes).toContain("not applied");
  });

  test("multiple near-miss candidates: uncertain with all alternatives recorded (ordered by distance)", () => {
    const interpretation = interpretUnit(unit("C1", "m33"), ["S!C1"]);
    expect(interpretation.method).toBe("unresolved");
    expect(interpretation.confidence).toBe("uncertain");
    expect(interpretation.unitCode).toBeUndefined();
    const alternatives = interpretation.alternatives ?? [];
    expect(alternatives.length).toBeGreaterThanOrEqual(2);
    expect(alternatives[0]).toEqual({ code: "m3", reason: "edit distance 1 from 'm3'" });
    expect(alternatives.some((alternative) => alternative.code === "m")).toBe(true);
  });

  test("near-miss via an ALIAS spelling maps to the alias's canonical code as alternative", () => {
    // "cumm" is distance 1 from the alias "cu m" (code m3).
    const interpretation = interpretUnit(unit("C1", "cumm"), ["S!C1"]);
    expect(interpretation.unitCode).toBeUndefined();
    expect(interpretation.confidence).toBe("uncertain");
    expect(interpretation.alternatives?.[0]?.code).toBe("m3");
  });

  test("non-text and blank unit cells: honest unresolved, verbatim preserved", () => {
    const numeric = interpretUnit(cell("C1", 120, "120.0"), ["S!C1"]);
    expect(numeric.method).toBe("unresolved");
    expect(numeric.confidence).toBe("uncertain");
    expect(numeric.originalText).toBe("120.0");
    expect(numeric.unitCode).toBeUndefined();
    const blank = interpretUnit(unit("C2", "   "), ["S!C2"]);
    expect(blank.method).toBe("unresolved");
    expect(blank.notes).toContain("blank unit cell");
  });
});

describe("concept dictionary: representative descriptions", () => {
  const conceptCases: ReadonlyArray<
    [string, string, InterpretationMethod, InterpretationConfidence]
  > = [
    // [description, conceptCode, method, confidence]
    ["Concrete 25MPa foundation", "CONCRETE_WORK", "dictionary_exact", "high"],
    ["Steel reinforcement Y12", "REINFORCEMENT", "dictionary_exact", "high"],
    ["Formwork to footings", "FORMWORK", "dictionary_exact", "high"],
    ["Blockwork 225mm", "MASONRY", "dictionary_synonym", "medium"],
    ["Plaster to internal walls", "PLASTERING", "dictionary_exact", "high"],
    ["shuttering to columns", "FORMWORK", "dictionary_synonym", "medium"],
    ["rc blinding to foundations", "CONCRETE_WORK", "dictionary_synonym", "medium"],
    ["Excavation and backfilling", "EXCAVATION", "dictionary_synonym", "medium"],
    ["Damp proof membrane to basement", "WATERPROOFING", "dictionary_synonym", "medium"],
    ["structural steel beam", "STEELWORK", "dictionary_synonym", "medium"],
    ["emulsion paint to walls", "PAINTING", "dictionary_synonym", "medium"],
    ["glazing to windows", "DOORS_WINDOWS", "dictionary_exact", "high"],
    ["conduit and wiring", "ELECTRICAL", "dictionary_synonym", "medium"],
    ["PVC pipe 110mm", "PLUMBING", "dictionary_synonym", "medium"],
    ["ceramic tiles to floor", "TILING", "dictionary_synonym", "medium"],
    ["timber skirting", "CARPENTRY", "dictionary_synonym", "medium"],
    ["kerb and paving", "PAVING", "dictionary_exact", "high"],
    ["mineral wool insulation", "INSULATION", "dictionary_synonym", "medium"],
    ["scaffolding to facade", "SCAFFOLDING", "dictionary_exact", "high"],
    ["Concrete block wall 225mm", "MASONRY", "dictionary_synonym", "medium"],
    ["Provide Y12 as scheduled", "REINFORCEMENT", "pattern", "medium"],
  ];

  test("each description classifies to the expected concept with the expected method", () => {
    for (const [value, conceptCode, method, confidence] of conceptCases) {
      const interpretation = interpretDescription(description("B1", value), ["S!B1"]);
      expect(interpretation.conceptCode).toBe(conceptCode);
      expect(interpretation.method).toBe(method);
      expect(interpretation.confidence).toBe(confidence);
      expect(interpretation.originalText).toBe(value);
      expect(interpretation.notes).toContain("concept matched on keyword");
    }
  });

  test("'Steel reinforcement Y12' beats the weak generic 'steel' keyword (longest match wins)", () => {
    const interpretation = interpretDescription(description("B1", "Steel reinforcement Y12"), ["S!B1"]);
    expect(interpretation.conceptCode).toBe("REINFORCEMENT");
    expect(interpretation.alternatives ?? []).toHaveLength(0);
  });

  test("ambiguous 'steel work': STEELWORK vs REINFORCEMENT alternatives -> uncertain, no conceptCode", () => {
    const interpretation = interpretDescription(description("B1", "steel work"), ["S!B1"]);
    expect(interpretation.method).toBe("unresolved");
    expect(interpretation.confidence).toBe("uncertain");
    expect(interpretation.conceptCode).toBeUndefined();
    const codes = (interpretation.alternatives ?? []).map((alternative) => alternative.code);
    expect(codes.sort()).toEqual(["REINFORCEMENT", "STEELWORK"]);
    expect(interpretation.alternatives?.every((a) => a.reason.includes("'steel'"))).toBe(true);
  });

  test("ambiguous bare 'block': MASONRY vs CONCRETE_WORK alternatives -> uncertain", () => {
    const interpretation = interpretDescription(description("B1", "block"), ["S!B1"]);
    expect(interpretation.conceptCode).toBeUndefined();
    expect(interpretation.confidence).toBe("uncertain");
    const codes = (interpretation.alternatives ?? []).map((alternative) => alternative.code);
    expect(codes.sort()).toEqual(["CONCRETE_WORK", "MASONRY"]);
  });

  test("unknown description: unresolved + uncertain, never a default concept", () => {
    const interpretation = interpretDescription(description("B1", "Xyzzy mystery works package"), ["S!B1"]);
    expect(interpretation.method).toBe("unresolved");
    expect(interpretation.confidence).toBe("uncertain");
    expect(interpretation.conceptCode).toBeUndefined();
    expect(interpretation.alternatives ?? []).toHaveLength(0);
    expect(interpretation.notes).toContain("no concept keyword matched");
  });
});

describe("abbreviation dictionary: expansions preserve the original wording", () => {
  test("'Reinf. bar c/w bending schedule' expands; original stays verbatim; reversible modulo whitespace", () => {
    const original = "Reinf. bar c/w bending schedule";
    const interpretation = interpretDescription(description("B1", original), ["S!B1"]);
    expect(interpretation.originalText).toBe(original);
    expect(interpretation.normalizedText).toBe("Reinforcement bar complete with bending schedule");
    expect(interpretation.notes).toContain("'Reinf.'→'Reinforcement'");
    expect(interpretation.notes).toContain("'c/w'→'complete with'");
    // Removing the expansions recovers the original modulo whitespace.
    const recovered = (interpretation.normalizedText ?? "")
      .replace("Reinforcement", "Reinf.")
      .replace("complete with", "c/w");
    expect(recovered.replace(/\s+/g, " ").trim()).toBe(original.replace(/\s+/g, " ").trim());
  });

  test("expansion-enabled classification carries method 'abbreviation_expansion'", () => {
    // The raw text contains NO concept keyword; only after expanding
    // "Reinf." does REINFORCEMENT match.
    const interpretation = interpretDescription(description("B1", "Reinf. bar to footings"), ["S!B1"]);
    expect(interpretation.method).toBe("abbreviation_expansion");
    expect(interpretation.confidence).toBe("medium");
    expect(interpretation.conceptCode).toBe("REINFORCEMENT");
    expect(interpretation.normalizedText).toBe("Reinforcement bar to footings");
  });

  test("representative expansions (incl./exc./w//w/o/max/min/approx/dia/Ø/bw.)", () => {
    const cases: ReadonlyArray<[string, string]> = [
      ["incl. wastage 5%", "including wastage 5%"],
      ["exc. wastage", "excluding wastage"],
      ["formwork w/ props", "formwork with props"],
      ["pipe w/o joints", "pipe without joints"],
      ["max 5mm thk.", "maximum 5mm thickness"],
      ["min 2 bars", "minimum 2 bars"],
      ["Approx. 5m ht. bldg.", "Approximately 5m height building"],
      ["Ø12 bar", "diameter 12 bar"],
      ["bw. 225mm", "blockwork 225mm"],
      ["Struct. steelwork c/w connections", "Structural steelwork complete with connections"],
    ];
    for (const [value, normalized] of cases) {
      const interpretation = interpretDescription(description("B1", value), ["S!B1"]);
      expect(interpretation.normalizedText).toBe(normalized);
      expect(interpretation.originalText).toBe(value);
    }
  });

  test("full words are never expanded ('including', 'concrete', 'diameter' stay intact)", () => {
    const interpretation = interpretDescription(
      description("B1", "Concrete including diameter bars"),
      ["S!B1"],
    );
    expect(interpretation.normalizedText).toBe("Concrete including diameter bars");
    expect(interpretation.conceptCode).toBe("CONCRETE_WORK");
    expect(interpretation.notes).not.toContain("abbreviations expanded");
  });
});

describe("dictionary invariants (deterministic, versioned, code-defined)", () => {
  test("unit dictionary: >= 14 canonical codes, >= 25 aliases, all unique, no alias shadows a code", () => {
    expect(UNIT_CODES.length).toBeGreaterThanOrEqual(14);
    const aliasCount = UNIT_NEAR_SPELLINGS.length - UNIT_CODES.length;
    expect(aliasCount).toBeGreaterThanOrEqual(25);
    expect(new Set(UNIT_ALIAS_TO_CODE.keys()).size).toBe(aliasCount);
    for (const alias of UNIT_ALIAS_TO_CODE.keys()) {
      expect(UNIT_CODES).not.toContain(alias);
    }
    expect(new Set(UNIT_CODES).size).toBe(UNIT_CODES.length);
  });

  test("concept dictionary: >= 15 concepts, each with >= 3 synonym/pattern keywords", () => {
    expect(CONCEPT_DICTIONARY.length).toBeGreaterThanOrEqual(15);
    expect(new Set(CONCEPT_DICTIONARY.map((entry) => entry.code)).size).toBe(CONCEPT_DICTIONARY.length);
    for (const entry of CONCEPT_DICTIONARY) {
      expect(entry.canonical.length).toBeGreaterThanOrEqual(1);
      expect(entry.synonyms.length + entry.patterns.length).toBeGreaterThanOrEqual(3);
    }
  });

  test("abbreviation dictionary: >= 15 unique entries", () => {
    expect(ABBREVIATION_DICTIONARY.length).toBeGreaterThanOrEqual(15);
    expect(new Set(ABBREVIATION_DICTIONARY.map((entry) => entry.abbreviation)).size).toBe(
      ABBREVIATION_DICTIONARY.length,
    );
  });

  test("DICTIONARY_VERSION is a stable semver string recorded for provenance", () => {
    expect(DICTIONARY_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
    expect(DICTIONARY_VERSION).toBe("1.0.0");
  });
});
