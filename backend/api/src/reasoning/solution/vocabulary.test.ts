/**
 * QA-004 — vocabulary tests: the AREA-QUANTITY language tables (D5a).
 *
 * The area-governance grammar of vocabulary.ts classifies utterance spans
 * whose measurements are AREA quantities ("over a 2.5 by 2.5 metre area",
 * "covering 2.5 by 2.5 m", "12.5 m2", "about 6 square metres"). A
 * measurement inside such a span is an AREA fact — it must NEVER bind a
 * linear parameter slot (the D5a misattribution bound an area side
 * "2.5 m" to a plaster THICKNESS slot, canonicalized to 2500 mm, and the
 * proposal was offered as confirmable beside its own violation notice).
 *
 * These tests pin the scanner directly: the governed spans, and — as
 * important — the NON-governed language (plain linear measurements, delta
 * "by" phrases, bare "X by Y m" pairs without area semantics) that must
 * keep flowing through the existing binding path unchanged.
 */

import { describe, expect, test } from "bun:test";
import { scanAreaQuantitySpans } from "./vocabulary";

/** The governed substring covered by one span (deterministic, readable). */
function governedText(text: string): string[] {
  return scanAreaQuantitySpans(text).map((span) => text.slice(span.start, span.end));
}

describe("QA-004 vocabulary: area-quantity language marks its governed spans", () => {
  test("the 'X by Y <unit> … area' family (the Lead's exact phrasing)", () => {
    const spans = governedText(
      "Apply a cement plaster coat to the damaged wall faces over a 2.5 by 2.5 metre area.",
    );
    expect(spans).toHaveLength(1);
    expect(spans[0]).toContain("2.5 by 2.5 metre");
    expect(spans[0]).toContain("area");
  });

  test("the family variants: meters/m spellings, units on both sides, hyphens, adjective before 'area'", () => {
    for (const utterance of [
      "Plaster the wall over a 2.5 by 2.5 meter area.",
      "Plaster the wall over a 2.5 m by 2.5 m area.",
      "Plaster the wall over a 2.5-by-2.5-metre area.",
      "Plaster the wall over a 2.5 by 2.5 metre damaged area.",
      "Render over a 2 x 3 m area of the wall.",
    ]) {
      const spans = governedText(utterance);
      expect(spans.length, utterance).toBeGreaterThanOrEqual(1);
    }
  });

  test("the 'covering X by Y <unit>' family", () => {
    const spans = governedText("Apply cement plaster covering 2.5 by 2.5 m.");
    expect(spans).toHaveLength(1);
    expect(spans[0]).toContain("covering");
    expect(spans[0]).toContain("2.5 by 2.5 m");
  });

  test("explicit area units and markers: m2, square metres", () => {
    expect(governedText("Plaster the wall over an area of 12.5 m2.")).toHaveLength(1);
    expect(governedText("Plaster the wall over about 6 square metres.")).toHaveLength(1);
    expect(governedText("Plaster the wall over 6 square meters of face.")).toHaveLength(1);
  });
});

describe("QA-004 vocabulary: plain linear language is NOT area-governed (no over-matching)", () => {
  test("dimension-adjacent linear measurements govern nothing", () => {
    expect(
      governedText("Excavate a pit 1.5 m deep, 2 m wide and 3 m long."),
    ).toEqual([]);
    expect(governedText("Plaster the affected wall faces 30 mm thick.")).toEqual([]);
    expect(governedText("Lay blocks to a height of 1 m along this wall.")).toEqual([]);
    expect(governedText("Apply plaster 20 or 30 mm thick.")).toEqual([]);
  });

  test("delta 'by' phrases are NOT the by-dimensions area family", () => {
    expect(governedText("Make the excavation deeper by 0.5 m.")).toEqual([]);
    expect(governedText("Deepen the pit by 500 mm.")).toEqual([]);
    expect(governedText("Increase the excavation depth by 50 cm.")).toEqual([]);
  });

  test("a bare 'X by Y m' pair WITHOUT area semantics is not governed (by alone is not area language)", () => {
    expect(governedText("Cut an opening 1 by 2 m in this wall.")).toEqual([]);
    expect(governedText("Demolish a wall section 5 m by 2.4 m.")).toEqual([]);
  });

  test("the word 'area' without a governed measurement pair governs nothing", () => {
    expect(governedText("Demolish the wall near the foundation.")).toEqual([]);
    expect(governedText("Excavate the pit area south of the building.")).toEqual([]);
  });
});
