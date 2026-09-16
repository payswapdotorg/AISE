/**
 * PROD-010 — evidence-picker tests (pure, deterministic: no network, no
 * clock, no randomness).
 */

import { describe, expect, test } from "bun:test";
import {
  evidenceIdsFromField,
  evidenceOptionsFromDemo,
  evidenceOptionsFromLive,
  toggleEvidenceId,
} from "./evidence-picker";
import { demoEvidenceList, DEMO_PROJECT_ID } from "./demo";
import type { EvidenceIndexItem } from "./api";

const HEX64 = "a".repeat(64);
const HEX64B = "b".repeat(64);

function liveItem(
  contentId: string,
  overrides: Partial<EvidenceIndexItem["evidence"]> = {},
): EvidenceIndexItem {
  return {
    evidence: {
      contentId,
      acquisitionMethod: "STILL_IMAGERY",
      mediaType: "image/jpeg",
      byteSize: 1024,
      capturedAt: "2026-01-01T00:00:00.000Z",
      ...overrides,
    },
    invalidation: null,
  };
}

describe("PROD-010 evidence-picker — option mapping", () => {
  test("live register pairs map to options with captions from record fields only", () => {
    const options = evidenceOptionsFromLive([
      liveItem(HEX64, { acquisitionMethod: "DEPTH_SENSING", byteSize: 2048 }),
      liveItem(HEX64B, { mediaType: "application/pdf", capturedAt: "2026-02-02T00:00:00.000Z" }),
    ]);
    expect(options).toEqual([
      {
        evidenceId: HEX64,
        caption: "DEPTH_SENSING · image/jpeg · 2048 bytes · 2026-01-01T00:00:00.000Z",
        invalidated: false,
        invalidationReason: null,
      },
      {
        evidenceId: HEX64B,
        caption: "STILL_IMAGERY · application/pdf · 1024 bytes · 2026-02-02T00:00:00.000Z",
        invalidated: false,
        invalidationReason: null,
      },
    ]);
  });

  test("invalidated register entries are EXCLUDED from the pickable options", () => {
    const options = evidenceOptionsFromLive([
      liveItem(HEX64),
      {
        ...liveItem(HEX64B),
        invalidation: { reason: "superseded by re-capture", invalidatedAt: "2026-03-01T00:00:00.000Z" },
      },
    ]);
    expect(options).toHaveLength(1);
    expect(options[0]?.evidenceId).toBe(HEX64);
  });

  test("the demo dataset's OWN records map (invalidated excluded, ids verbatim)", () => {
    const views = demoEvidenceList(DEMO_PROJECT_ID);
    expect(views).toHaveLength(3); // wall-north (valid), wall-east (INVALIDATED), boq-source (valid)
    const options = evidenceOptionsFromDemo(views);
    expect(options).toHaveLength(2);
    // The dataset's OWN verbatim ids (the frozen fixtures' world — the BOQ
    // source fixture id is deliberately NOT 64-hex; verbatim is the rule).
    expect(options.map((option) => option.evidenceId)).toEqual([
      "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4",
      "c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7",
    ]);
    for (const option of options) {
      expect(option.invalidated).toBe(false);
      expect(option.caption).toContain("·");
    }
  });

  test("the demo dataset of another project maps to nothing (no borrowed data)", () => {
    expect(evidenceOptionsFromDemo(demoEvidenceList("some-other-project"))).toEqual([]);
  });
});

describe("PROD-010 evidence-picker — toggle math over comma-separated fields", () => {
  test("a field parses into a de-duplicated id list (blanks dropped)", () => {
    expect(evidenceIdsFromField(`${HEX64}, ${HEX64B} ,,${HEX64}`)).toEqual([HEX64, HEX64B]);
    expect(evidenceIdsFromField("")).toEqual([]);
  });

  test("toggling an absent id appends it; toggling a present id removes it", () => {
    expect(toggleEvidenceId("", HEX64)).toBe(HEX64);
    expect(toggleEvidenceId(HEX64, HEX64B)).toBe(`${HEX64}, ${HEX64B}`);
    expect(toggleEvidenceId(`${HEX64}, ${HEX64B}`, HEX64)).toBe(HEX64B);
    expect(toggleEvidenceId(`${HEX64}, ${HEX64B}`, HEX64B)).toBe(HEX64);
  });

  test("toggles round-trip through the parser (idempotent field math)", () => {
    let field = "";
    field = toggleEvidenceId(field, HEX64);
    field = toggleEvidenceId(field, HEX64B);
    field = toggleEvidenceId(field, HEX64);
    expect(evidenceIdsFromField(field)).toEqual([HEX64B]);
    field = toggleEvidenceId(field, HEX64B);
    expect(field).toBe("");
  });
});
