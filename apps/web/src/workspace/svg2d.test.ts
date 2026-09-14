/**
 * AISE-021 2D pane tests — the local SVG presentation of the structural
 * Drawing2D (mirrors AISE-020's svg semantics): shapes with data-node-id,
 * opening symbols, dimension text with the σ discipline, selection
 * highlight and byte-determinism.
 */

import { describe, expect, test } from "bun:test";
import { DRAWING_SELECTED_STROKE, renderDrawing2dSvg } from "./svg2d";
import { floorPlanDrawing } from "./fixtures";

describe("2D pane SVG rendering", () => {
  test("renders polygons with data-node-id and the element's stroke weight", () => {
    const svg = renderDrawing2dSvg(floorPlanDrawing());
    expect(svg.startsWith('<svg height="')).toBe(true);
    expect(svg.endsWith("</svg>\n")).toBe(true);
    // Walls carry strokeKind "wall" → weight 2.
    expect(svg).toContain(
      '<polygon data-node-id="wall-e" fill="none" points="4.2,-0.3 4.5,-0.3 4.5,3.3 4.2,3.3" stroke="#000000" stroke-width="2"/>',
    );
    // The floor is a boundary element → weight 1.
    expect(svg).toContain('<polygon data-node-id="floor-1" fill="none" points="0,0 4.2,0 4.2,3 0,3"');
    expect(svg).toContain('stroke-width="1"');
  });

  test("renders openings as a symbol circle + letter, carrying data-node-id", () => {
    const svg = renderDrawing2dSvg(floorPlanDrawing());
    expect(svg).toContain('<circle cx="1" cy="0" data-node-id="door-1" fill="none" r="0.5"');
    expect(svg).toContain('<circle cx="2.7" cy="0" data-node-id="window-1" fill="none" r="0.5"');
    expect(svg).toContain(">D</text>");
    expect(svg).toContain(">W</text>");
  });

  test("renders dimension lines with data-dimension-id and value ± σ text", () => {
    const svg = renderDrawing2dSvg(floorPlanDrawing());
    expect(svg).toContain('data-dimension-id="dim:wall-e:wall-w"');
    expect(svg).toContain(">4.2 m ±0.01 m</text>");
    // Unknown σ: value only — never a fabricated ±0.
    expect(svg).toContain('data-dimension-id="dim:wall-n:wall-s"');
    expect(svg).toContain(">3 m</text>");
    expect(svg).not.toContain("±0 m");
  });

  test("derives the viewBox from the drawn bounds with 5% padding (hand-computed)", () => {
    const svg = renderDrawing2dSvg(floorPlanDrawing());
    // Bounds over elements + dimensions: x ∈ [−0.6, 4.5], y ∈ [−0.6, 3.3]
    // → width 5.1, height 3.9, extent 5.1, pad 0.255.
    expect(svg).toContain('viewBox="-0.855 -0.855 5.61 4.41"');
    expect(svg).toContain('height="4.41"');
    expect(svg).toContain('width="5.61"');
  });

  test("selection highlights exactly the selected node's element", () => {
    const drawing = floorPlanDrawing();
    const svg = renderDrawing2dSvg(drawing, "wall-n");
    expect((svg.match(/data-selected="true"/g) ?? []).length).toBe(1);
    expect(svg).toContain(`<polygon data-node-id="wall-n" data-selected="true"`);
    expect(svg).toContain(`stroke="${DRAWING_SELECTED_STROKE}"`);
    // Non-selected elements keep the plain stroke.
    expect(svg).toContain('<polygon data-node-id="wall-e" fill="none" points="4.2,-0.3');
    // Without a selection nothing is highlighted.
    expect(renderDrawing2dSvg(drawing)).not.toContain('data-selected="true"');
  });

  test("byte-deterministic for identical drawing + selection", () => {
    const drawing = floorPlanDrawing();
    expect(renderDrawing2dSvg(drawing)).toBe(renderDrawing2dSvg(drawing));
    expect(renderDrawing2dSvg(drawing, "wall-s")).toBe(renderDrawing2dSvg(drawing, "wall-s"));
  });

  test("an empty drawing renders the default unit box (no crash, no content)", () => {
    const svg = renderDrawing2dSvg({
      ...floorPlanDrawing(),
      elements: [],
      dimensions: [],
    });
    expect(svg).toContain("<svg");
    expect(svg).not.toContain("data-node-id");
    expect(svg).toContain('viewBox="-0.05 -0.05 1.1 1.1"');
  });
});
