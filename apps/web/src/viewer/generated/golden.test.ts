/**
 * HFX-303 tests — the NO-VISUAL BIT-IDENTITY golden: a render without
 * the optional generated-visual fields is BYTE-IDENTICAL to the
 * pre-HFX-303 viewer. The goldens under golden/ were generated from the
 * PRISTINE base commit (d11d03e) BEFORE any seam edit — if the seam
 * leaks even one byte into the no-visual path, these tests fail.
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { renderInterventionViewer } from "../render";
import {
  canonicalScenario,
  noteScenario,
  selectedViewerInput,
  shuffledGeometries,
  shuffledScenario,
  singleStateScenario,
  viewerInput,
  viewerInputAt,
} from "../fixtures";

function golden(name: string): string {
  return readFileSync(new URL(`./golden/${name}`, import.meta.url), "utf8");
}

describe("the no-visual path is bit-identical to the pre-change viewer (the golden)", () => {
  test("layer 2 (the canonical fixture input) renders the committed golden byte-for-byte", () => {
    expect(renderInterventionViewer(viewerInput())).toBe(golden("layer2-canonical.html"));
  });

  test("layer 0 (the pure baseline overlay) renders the committed golden byte-for-byte", () => {
    expect(renderInterventionViewer(viewerInputAt(0))).toBe(golden("layer0-baseline.html"));
  });

  test("layer 3 (the final layer, with the proposed removal) renders the committed golden byte-for-byte", () => {
    expect(renderInterventionViewer(viewerInputAt(3))).toBe(golden("layer3-final.html"));
  });

  test("a selected node renders the committed golden byte-for-byte", () => {
    expect(renderInterventionViewer(selectedViewerInput())).toBe(golden("selected-node.html"));
  });

  test("inputs that NEVER carried a generated visual still render byte-identically (the untouched surface)", () => {
    // The same fixtures the existing render tests drive — none carries a
    // generated visual, so every one of them must render exactly as
    // before the seam existed.
    const renders = [
      viewerInput({ scenario: canonicalScenario(), stateIndex: 1 }),
      viewerInput({ scenario: noteScenario(), stateIndex: 4 }),
      viewerInput({ scenario: singleStateScenario(), stateIndex: 0 }),
      viewerInput({ scenario: shuffledScenario(), geometries: shuffledGeometries() }),
      viewerInput({ selectedNodeId: "door-101" }),
    ];
    for (const input of renders) {
      const first = renderInterventionViewer(input);
      const second = renderInterventionViewer(input);
      expect(first).toBe(second); // determinism holds
      expect(first).not.toContain("pane-generated"); // no leak
      expect(first).not.toContain("GENERATED — HYPOTHETICAL");
      expect(first).not.toContain("Generated visual");
    }
  });
});
