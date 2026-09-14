/**
 * AISE-024 BOQ Lens tests — document rendering: the three persona views,
 * cost hierarchy + provenance footnotes, health stats, verbatim
 * preservation, honest unknowns, determinism, purity and input validation.
 * Fixtures are hand-built structural mirrors (fixtures.ts — apps/web cannot
 * import backend sources; see the boundary note there).
 */

import { describe, expect, test } from "bun:test";
import * as lens from "./index";
import { boqLensInput, deepFreeze, fixtureItem } from "./fixtures";
import { BoqLensError } from "./errors";
import type { BoqLensInput } from "./model";

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function render(input: BoqLensInput = boqLensInput()): string {
  return lens.renderBoqLens(input);
}

/** Extract one view's markup (views contain no nested top-level sections). */
function viewOf(html: string, viewId: string): string {
  const start = html.indexOf(`<section class="view" id="${viewId}"`);
  if (start === -1) {
    throw new Error(`view not found: ${viewId}`);
  }
  const end = html.indexOf(`<section class="view" id="`, start + 1);
  return html.slice(start, end === -1 ? undefined : end);
}

function countMatches(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

/** A fixture input with one mutation applied (tests mutate freely). */
function breaking(mutate: (input: BoqLensInput) => void): BoqLensInput {
  const input = boqLensInput();
  mutate(input);
  return input;
}

/** The fixture item at `index` as a mutable record (typed access helper). */
function itemAt(input: BoqLensInput, index: number): Record<string, unknown> {
  const item = input.items[index];
  if (item === undefined) {
    throw new Error(`fixture item at index ${index} is missing`);
  }
  return item as unknown as Record<string, unknown>;
}

/* ------------------------------------------------------------------ */
/* Document rendering                                                  */
/* ------------------------------------------------------------------ */

describe("BOQ Lens document rendering", () => {
  test("renders a complete HTML document with the view selector and all three views in deterministic order", () => {
    const html = render();
    expect(html.startsWith("<!doctype html>\n<html lang=\"en\">\n")).toBe(true);
    expect(html.endsWith("</body>\n</html>\n")).toBe(true);
    expect(html).toContain('<nav class="view-selector"');
    expect(html).toContain('<a href="#view-executive">Executive</a>');
    expect(html).toContain('<a href="#view-qs">QS detail</a>');
    expect(html).toContain('<a href="#view-contractor">Contractor tasks</a>');
    const exec = html.indexOf('id="view-executive"');
    const qs = html.indexOf('id="view-qs"');
    const contractor = html.indexOf('id="view-contractor"');
    expect(exec).toBeGreaterThan(-1);
    expect(qs).toBeGreaterThan(exec);
    expect(contractor).toBeGreaterThan(qs);
    expect(html).toContain(`data-import-id="imp-2024-boq-001"`);
    expect(html).toContain(`data-mapping-version="1"`);
    expect(html).toContain(`data-generator="${lens.BOQ_LENS_GENERATOR_VERSION}"`);
  });

  test("two renders of the same input are byte-identical; a structurally-equal clone renders the same bytes", () => {
    const input = boqLensInput();
    expect(render(input)).toBe(render(input));
    const clone = JSON.parse(JSON.stringify(input)) as BoqLensInput;
    expect(render(clone)).toBe(render(input));
  });

  test("rendering is pure: a deep-frozen input renders and the input is unchanged afterwards", () => {
    const input = deepFreeze(boqLensInput());
    expect(() => render(input)).not.toThrow();
    const before = JSON.stringify(input);
    render(input);
    expect(JSON.stringify(input)).toBe(before);
  });

  test("input validation rejects malformed inputs with typed invalid_input errors", () => {
    const cases: Array<[BoqLensInput, string]> = [
      [
        breaking((input) => {
          (input as unknown as Record<string, unknown>).importId = "";
        }),
        "empty importId",
      ],
      [
        breaking((input) => {
          (input.items[1] as unknown as Record<string, unknown>).itemId = "sub-r12";
        }),
        "duplicate itemId",
      ],
      [
        breaking((input) => {
          (input.items[0] as unknown as Record<string, unknown>).rowNumber = 0;
        }),
        "rowNumber 0",
      ],
      [
        breaking((input) => {
          const mapping = itemAt(input, 0).mapping as Record<string, unknown>;
          mapping.status = "guessed";
        }),
        "invalid mapping status",
      ],
      [
        breaking((input) => {
          const quantity = itemAt(input, 0).quantity as Record<string, unknown>;
          quantity.value = "220";
        }),
        "non-numeric quantity value",
      ],
      [
        breaking((input) => {
          (input.items[0] as unknown as Record<string, unknown>).originalText = "";
        }),
        "empty originalText",
      ],
      [
        breaking((input) => {
          (input as unknown as Record<string, unknown>).sourceCellRefs = "Substructure!B12";
        }),
        "non-array sourceCellRefs",
      ],
    ];
    for (const [input, label] of cases) {
      try {
        lens.renderBoqLens(input);
        throw new Error(`expected invalid_input for: ${label}`);
      } catch (error) {
        expect(error).toBeInstanceOf(BoqLensError);
        expect((error as BoqLensError).code).toBe("invalid_input");
      }
    }
  });
});

/* ------------------------------------------------------------------ */
/* Executive view                                                      */
/* ------------------------------------------------------------------ */

describe("executive view", () => {
  test("renders section totals, item counts and the grand total with fixture numbers", () => {
    const exec = viewOf(render(), "view-executive");
    expect(exec).toContain("GHS 27,350.00");
    expect(exec).toContain("GHS 3,766.50");
    expect(exec).toContain("GHS 31,116.50");
    expect(exec).toContain(`data-claim-id="claim:section-total:0"`);
    expect(exec).toContain(`data-claim-id="claim:section-total:1"`);
    expect(exec).toContain(`data-claim-id="claim:grand-total"`);
    expect(exec).toContain("2 mapped / 0 ambiguous / 1 unmapped");
    expect(exec).toContain("1 mapped / 1 ambiguous / 1 unmapped");
  });

  test("every total carries a provenance footnote listing the contributing cell refs", () => {
    const exec = viewOf(render(), "view-executive");
    expect(exec).toContain('<li data-for="claim:section-total:0">');
    expect(exec).toContain(
      "Substructure!F12 (2,750.00) + Substructure!F13 (14,700.00) + Substructure!F14 (9,900.00)",
    );
    expect(exec).toContain("Finishes!F4 (1,824.00) + Finishes!F5 (1,942.50)");
    expect(exec).toContain('<li data-for="claim:grand-total">');
  });

  test("excluded items are annotated with an explicit inference marker, never assumed zero", () => {
    const exec = viewOf(render(), "view-executive");
    expect(exec).toContain(
      "[inference: excludes 1 item(s) without a stated amount (never assumed zero)]",
    );
  });

  test("amounts in a different currency are excluded, never converted (honest money discipline)", () => {
    const input = breaking((broken) => {
      const item = itemAt(broken, 5);
      item.currency = "EUR";
      item.amount = { cellRef: "Finishes!F6", value: 500 };
      (broken as unknown as Record<string, unknown>).sourceCellRefs = [
        ...broken.sourceCellRefs,
        "Finishes!F6",
      ];
    });
    const exec = viewOf(render(input), "view-executive");
    // The GHS totals are unchanged (the EUR item is excluded, not converted).
    expect(exec).toContain("GHS 3,766.50");
    expect(exec).toContain("GHS 31,116.50");
    expect(exec).toContain("[inference: excludes 1 item(s) stated in a different currency (never converted)");
  });

  test("renders mapping health stats with claim ids and correct fixture ratios", () => {
    const exec = viewOf(render(), "view-executive");
    expect(exec).toContain(`data-claim-id="claim:health:mapped"`);
    expect(exec).toContain("Mapped: 3 of 6 items (50%)");
    expect(exec).toContain("Ambiguous: 1 of 6 items (16.67%)");
    expect(exec).toContain("Unmapped: 2 of 6 items (33.33%)");
    expect(exec).toContain("Concepts resolved: 5 of 6 (83.33%)");
    expect(exec).toContain("Concepts unresolved: 1 of 6 (16.67%)");
    expect(exec).toContain("Claims without provenance: 0");
  });

  test("contains NO per-item claim noise (no item rows in the executive view)", () => {
    const exec = viewOf(render(), "view-executive");
    expect(countMatches(exec, "claim:item:")).toBe(0);
    expect(countMatches(exec, "claim:explanation:")).toBe(0);
  });

  test("surfaces itemized provenance defects when the input is broken", () => {
    const input = breaking((broken) => {
      const amount = itemAt(broken, 0).amount as Record<string, unknown>;
      amount.cellRef = null;
    });
    const exec = viewOf(render(input), "view-executive");
    expect(exec).toContain("Claims without provenance: 1");
    expect(exec).toContain('data-defect="true"');
    expect(exec).toContain("stated amount (2750) has no source cell ref");
  });
});

/* ------------------------------------------------------------------ */
/* QS view                                                             */
/* ------------------------------------------------------------------ */

describe("QS view", () => {
  test("preserves the original wording VERBATIM (byte-compared substrings, messy spacing included)", () => {
    const qs = viewOf(render(), "view-qs");
    expect(qs).toContain("Plaster to internal walls");
    expect(qs).toContain("Excavate reduced level dig  S/b  (see note 3)");
    expect(qs).toContain("Paint walls &amp; ceil.  emulsion");
    expect(qs).toContain("Scaffold hire (preliminary item)");
  });

  test("renders normalized concept/unit marked derived, with confidence and method", () => {
    const qs = viewOf(render(), "view-qs");
    expect(qs).toContain("PLASTERING (derived · medium · dictionary_synonym)");
    expect(qs).toContain("CONCRETE (derived · high · dictionary_exact)");
    expect(qs).toContain("→ SQM (derived · high)");
    expect(qs).toContain("(no concept resolved) · uncertain · unresolved · 2 competing recorded");
    expect(qs).toContain("no unit code resolved · uncertain · unresolved");
  });

  test("renders mapping status, target counts, confidence and locations per row", () => {
    const qs = viewOf(render(), "view-qs");
    expect(qs).toContain("mapped · 4 target(s) · medium · Site A / Building 1 / Ground Floor");
    expect(qs).toContain("mapped · 5 target(s) · medium · Site A / Building 1 / Ground Floor");
    expect(qs).toContain("mapped · 1 target(s) · high · Site A / Building 1");
    expect(qs).toContain("ambiguous · 2 candidate(s) · low");
    expect(qs).toContain("unmapped · uncertain · interpretation uncertain — no concept resolved");
  });

  test("claims with uncertain confidence render an explicit interpretation-uncertain badge", () => {
    const qs = viewOf(render(), "view-qs");
    expect(qs).toContain('data-uncertain="true"');
    expect(countMatches(qs, "interpretation uncertain</span>")).toBe(2);
  });

  test("renders stated numbers with their source cell refs", () => {
    const qs = viewOf(render(), "view-qs");
    expect(qs).toContain("220 m2 [Substructure!D12]");
    expect(qs).toContain("GHS 12.5/unit [Substructure!E12]");
    expect(qs).toContain("GHS 2,750.00 [Substructure!F12]");
    expect(qs).toContain("no stated numbers");
  });

  test("carries item, interpretation, mapping and explanation claim ids on every row", () => {
    const qs = viewOf(render(), "view-qs");
    for (const itemId of ["sub-r12", "sub-r13", "sub-r14", "fin-r4", "fin-r5", "fin-r6"]) {
      expect(qs).toContain(`data-claim-id="claim:item:${itemId}"`);
      expect(qs).toContain(`data-claim-id="claim:interpretation:${itemId}"`);
      expect(qs).toContain(`data-claim-id="claim:mapping:${itemId}"`);
      expect(qs).toContain(`data-claim-id="claim:explanation:${itemId}"`);
    }
    expect(countMatches(qs, 'class="explanation"')).toBe(6);
  });
});

/* ------------------------------------------------------------------ */
/* Contractor view                                                     */
/* ------------------------------------------------------------------ */

describe("contractor view", () => {
  test("groups tasks by mapped location with location-group claim ids", () => {
    const contractor = viewOf(render(), "view-contractor");
    expect(contractor).toContain(`data-claim-id="claim:location:0"`);
    expect(contractor).toContain("<h3>Site A / Building 1 / Ground Floor</h3>");
    expect(contractor).toContain(`data-claim-id="claim:location:1"`);
    expect(contractor).toContain("<h3>Site A / Building 1</h3>");
    // The Ground Floor group holds rows 12 and 5; the building-only group row 13.
    const groundFloor = contractor.slice(
      contractor.indexOf("<h3>Site A / Building 1 / Ground Floor</h3>"),
      contractor.indexOf('<section class="location-group"', contractor.indexOf("<h3>Site A / Building 1 / Ground Floor</h3>")),
    );
    expect(groundFloor).toContain('data-claim-id="claim:item:sub-r12"');
    expect(groundFloor).toContain('data-claim-id="claim:item:fin-r5"');
    expect(groundFloor).not.toContain('data-claim-id="claim:item:sub-r13"');
  });

  test("lists unmapped/ambiguous items separately under location unconfirmed with honest reasons", () => {
    const contractor = viewOf(render(), "view-contractor");
    expect(contractor).toContain(`data-claim-id="claim:location:unconfirmed"`);
    expect(contractor).toContain("<h3>Location unconfirmed</h3>");
    expect(contractor).toContain("mapping unmapped (interpretation uncertain — no concept resolved, no mapping attempted)");
    expect(contractor).toContain("mapping ambiguous (2 competing candidates recorded, no target committed)");
    expect(contractor).toContain("no candidates in the graph snapshot");
    const unconfirmed = contractor.slice(contractor.indexOf("<h3>Location unconfirmed</h3>"));
    for (const itemId of ["sub-r14", "fin-r4", "fin-r6"]) {
      expect(unconfirmed).toContain(`data-claim-id="claim:item:${itemId}"`);
    }
  });

  test("a mapped item without a spacePath goes to location unconfirmed, not a guessed group", () => {
    const input = breaking((broken) => {
      const mapping = itemAt(broken, 0).mapping as { targets?: { spacePath?: readonly string[] }[] };
      for (const target of mapping.targets ?? []) {
        delete (target as { spacePath?: readonly string[] }).spacePath;
      }
    });
    const contractor = viewOf(render(input), "view-contractor");
    expect(contractor).toContain("mapped without a recorded location");
    // Row 12 sits in the unconfirmed group (honest unknown)...
    const unconfirmed = contractor.slice(contractor.indexOf("<h3>Location unconfirmed</h3>"));
    expect(unconfirmed).toContain('data-claim-id="claim:item:sub-r12"');
    // ...while the Ground Floor group (kept alive by row 5) does NOT list it.
    const confirmed = contractor.slice(0, contractor.indexOf("<h3>Location unconfirmed</h3>"));
    expect(confirmed).toContain('data-claim-id="claim:item:fin-r5"');
    expect(confirmed).not.toContain('data-claim-id="claim:item:sub-r12"');
  });

  test("task rows carry quantities and source cell refs", () => {
    const contractor = viewOf(render(), "view-contractor");
    expect(contractor).toContain('Row 12 — "Plaster to internal walls" — 220 m2 · GHS 12.5/unit — source Substructure!B12');
    expect(contractor).toContain('Row 6 — "Scaffold hire (preliminary item)" — source Finishes!B6');
  });
});

/* ------------------------------------------------------------------ */
/* Fixture helper sanity (fixtureItem clones are mutable in tests)     */
/* ------------------------------------------------------------------ */

describe("fixture helper", () => {
  test("fixtureItem returns deep-cloned items (mutation does not leak into the module fixture)", () => {
    const item = fixtureItem("sub-r12");
    (item as unknown as Record<string, unknown>).rowNumber = 999;
    expect(fixtureItem("sub-r12").rowNumber).toBe(12);
    expect(() => fixtureItem("nope")).toThrow();
  });
});
