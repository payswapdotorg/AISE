/**
 * AISE-024 BOQ Lens tests — the grounded natural-language explanation:
 * deterministic template assembly, fragment grounding (cell ref, verbatim
 * text, concept code, confidence, mapping target count), uncertain and
 * absent-record honesty, and the explicit `[inference: …]` marker for
 * computed amounts that the source never stated.
 */

import { describe, expect, test } from "bun:test";
import { explainBoqItem } from "./explain";
import { renderBoqLens } from "./render";
import {
  boqLensInput,
  fixtureInterpretation,
  fixtureItem,
  fixtureMapping,
} from "./fixtures";
import type { BoqLensItem } from "./model";

/* ------------------------------------------------------------------ */
/* The work-order example shape (row 12)                               */
/* ------------------------------------------------------------------ */

describe("explainBoqItem — grounded sentence assembly", () => {
  test("deterministic sentence for the fixture plaster row: every mandated fragment present", () => {
    const sentence = explainBoqItem(
      fixtureItem("sub-r12"),
      fixtureInterpretation("sub-r12"),
      fixtureMapping("sub-r12"),
    );
    // Cell ref (grounded in the description cell):
    expect(sentence).toContain("source cell Substructure!B12");
    // Verbatim original text:
    expect(sentence).toContain('"Plaster to internal walls"');
    // Concept code, derived-marked, with confidence and method:
    expect(sentence).toContain("is interpreted as PLASTERING (derived interpretation, medium confidence, dictionary_synonym, matched on keyword 'plaster')");
    // Mapping target count + location + mapping confidence:
    expect(sentence).toContain("is mapped to 4 reality elements on Site A / Building 1 / Ground Floor (mapping confidence medium, method normalized_concept_match)");
    // Quantity + unit (+ derived normalized unit) + rate:
    expect(sentence).toContain("220 m2 (normalized SQM, derived) at GHS 12.5/unit");
    // Stated amount, grounded in the amount cell:
    expect(sentence).toContain("Stated amount: GHS 2,750.00 (source cell Substructure!F12)");
    expect(sentence).toContain("Row 12");
  });

  test("the full sentence is exactly the deterministic assembly (snapshot)", () => {
    const sentence = explainBoqItem(
      fixtureItem("sub-r12"),
      fixtureInterpretation("sub-r12"),
      fixtureMapping("sub-r12"),
    );
    expect(sentence).toBe(
      'Row 12 "Plaster to internal walls" (source cell Substructure!B12, 220 m2 (normalized SQM, derived) at GHS 12.5/unit) is interpreted as PLASTERING (derived interpretation, medium confidence, dictionary_synonym, matched on keyword \'plaster\') and is mapped to 4 reality elements on Site A / Building 1 / Ground Floor (mapping confidence medium, method normalized_concept_match). Stated amount: GHS 2,750.00 (source cell Substructure!F12).',
    );
  });

  test("two calls produce byte-identical sentences (no clock, no randomness)", () => {
    const item = fixtureItem("fin-r4");
    const first = explainBoqItem(item, fixtureInterpretation("fin-r4"), fixtureMapping("fin-r4"));
    const second = explainBoqItem(item, fixtureInterpretation("fin-r4"), fixtureMapping("fin-r4"));
    expect(first).toBe(second);
  });

  test("the rendered QS view embeds the explanation (HTML-escaped, claim-anchored)", () => {
    const html = renderBoqLens(boqLensInput());
    expect(html).toContain('data-claim-id="claim:explanation:sub-r12"');
    expect(html).toContain(
      "Row 12 &quot;Plaster to internal walls&quot; (source cell Substructure!B12",
    );
    // The raw ampersand in row 5's verbatim text is escaped in HTML.
    expect(html).toContain("Paint walls &amp; ceil.  emulsion");
  });
});

/* ------------------------------------------------------------------ */
/* Ungrounded fragments: inference markers or omission — never plain   */
/* ------------------------------------------------------------------ */

describe("explainBoqItem — honesty of ungrounded fragments", () => {
  test("an amount computed from quantity × rate is EXPLICITLY inference-marked, never asserted plain", () => {
    const item = fixtureItem("sub-r12");
    (item as unknown as Record<string, unknown>).amount = null;
    const sentence = explainBoqItem(item, fixtureInterpretation("sub-r12"), fixtureMapping("sub-r12"));
    expect(sentence).toContain("[inference: no amount stated in source; quantity × rate = GHS 2,750.00]");
    expect(sentence).not.toContain("Stated amount:");
  });

  test("an uncertain interpretation is stated as such, with the recorded competing readings", () => {
    const sentence = explainBoqItem(
      fixtureItem("sub-r14"),
      fixtureInterpretation("sub-r14"),
      fixtureMapping("sub-r14"),
    );
    expect(sentence).toContain("is not interpreted to a concept (interpretation uncertain, 2 competing readings recorded)");
    expect(sentence).not.toContain("is interpreted as");
  });

  test("an unmapped item states its unmapped status and the deterministic reason", () => {
    const sentence = explainBoqItem(
      fixtureItem("sub-r14"),
      fixtureInterpretation("sub-r14"),
      fixtureMapping("sub-r14"),
    );
    expect(sentence).toContain(
      "is not mapped to any reality element (unmapped: interpretation uncertain — no concept resolved, no mapping attempted)",
    );
  });

  test("an ambiguous mapping states the recorded candidates and that no target was committed", () => {
    const sentence = explainBoqItem(
      fixtureItem("fin-r4"),
      fixtureInterpretation("fin-r4"),
      fixtureMapping("fin-r4"),
    );
    expect(sentence).toContain("has an ambiguous mapping (2 competing candidates recorded, no target committed)");
  });

  test("an item without numbers omits the quantity fragment entirely (nothing fabricated)", () => {
    const sentence = explainBoqItem(
      fixtureItem("fin-r6"),
      fixtureInterpretation("fin-r6"),
      fixtureMapping("fin-r6"),
    );
    expect(sentence).toContain("(source cell Finishes!B6)");
    expect(sentence).not.toContain("at GHS");
    expect(sentence).not.toContain("Stated amount");
    expect(sentence).not.toContain("[inference");
  });

  test("a null interpretation record is stated as an honest absence", () => {
    const sentence = explainBoqItem(fixtureItem("sub-r12"), null, fixtureMapping("sub-r12"));
    expect(sentence).toContain("has no interpretation record (the description was not present in the normalized view)");
  });

  test("a null mapping record is stated as an honest absence", () => {
    const sentence = explainBoqItem(fixtureItem("sub-r12"), fixtureInterpretation("sub-r12"), null);
    expect(sentence).toContain("and has no mapping record.");
  });

  test("a description cell ref that is absent is stated, not invented", () => {
    const item = fixtureItem("sub-r13");
    (item as unknown as Record<string, unknown>).descriptionCellRef = null;
    const sentence = explainBoqItem(item, fixtureInterpretation("sub-r13"), fixtureMapping("sub-r13"));
    expect(sentence).toContain("(no description cell ref recorded, 35 m3");
  });

  test("mapped targets without a recorded location say so (absence is a fact of the record)", () => {
    const item = fixtureItem("sub-r13");
    const mapping = fixtureMapping("sub-r13");
    if (mapping === null) {
      throw new Error("fixture row 13 must carry a mapping entry");
    }
    for (const target of mapping.targets) {
      delete (target as { spacePath?: readonly string[] }).spacePath;
    }
    const sentence = explainBoqItem(item, fixtureInterpretation("sub-r13"), mapping);
    expect(sentence).toContain("is mapped to 1 reality element (location not recorded in mapping)");
  });
});

/* ------------------------------------------------------------------ */
/* Grammar/identity edge cases                                         */
/* ------------------------------------------------------------------ */

describe("explainBoqItem — deterministic grammar edges", () => {
  test("singular target count renders 'element' (not 'elements')", () => {
    const sentence = explainBoqItem(
      fixtureItem("sub-r13"),
      fixtureInterpretation("sub-r13"),
      fixtureMapping("sub-r13"),
    );
    expect(sentence).toContain("1 reality element on Site A / Building 1");
  });

  test("a quantity without a rate renders the quantity alone", () => {
    const item: BoqLensItem = { ...fixtureItem("fin-r4"), rate: null };
    const sentence = explainBoqItem(item, fixtureInterpretation("fin-r4"), fixtureMapping("fin-r4"));
    expect(sentence).toContain(", 48 m2 (normalized SQM, derived))");
    expect(sentence).not.toContain("/unit");
  });
});
