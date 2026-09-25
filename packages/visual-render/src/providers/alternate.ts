/**
 * HFX-303 — the ALTERNATE visual renderer (the SWAP lane's second lane).
 *
 * An INDEPENDENT implementation with a visibly different presentation
 * style: a dark blueprint-themed rendering with a side legend panel, a
 * dotted context-sketch margin as its illustrative addition, and its own
 * SVG construction (no shared code with the reference renderer — the
 * independence is the point: it proves provider replacement changes
 * PRESENTATION only, while the canonical state, projections, quantities
 * and validation stay byte-identical through the swap).
 *
 * Same lane laws, independently honored:
 *  - draws ONLY from the request's canonical projection snapshots;
 *  - the honest empty case renders the empty notice with no illustration;
 *  - no numeric engineering claims in text content;
 *  - unsupported classes are explicit `unsupported-data` refusals;
 *  - every illustrative region is declared in the label manifest.
 *
 * An IN-REPO deterministic fixture (no network, no model, no clock, no
 * randomness) — a future real renderer occupies the port the same way.
 */

import type {
  GeneratedRegionLabel,
  VisualRenderOutcome,
  VisualRenderProvider,
  VisualStateRequest,
} from "../port";
import { sealVisualArtifact } from "../provenance";
import { providerReferenceOf } from "../provenance";
import {
  VISUAL_LANE_STATEMENT,
  type VisualProviderDescriptor,
} from "../descriptor";

/* ------------------------------------------------------------------ */
/* The descriptor                                                       */
/* ------------------------------------------------------------------ */

export const ALTERNATE_VISUAL_PROVIDER_ID = "visual-blueprint-alternate" as const;
export const ALTERNATE_VISUAL_TECHNOLOGY_VERSION = "1.0.0-inrepo-v1" as const;

/** The alternate provider's descriptor (deterministic reference data). */
export function alternateVisualDescriptor(): VisualProviderDescriptor {
  return {
    kind: "visual-provider-descriptor",
    schemaVersion: "visual-provider-descriptor/1",
    providerId: ALTERNATE_VISUAL_PROVIDER_ID,
    technologyVersion: ALTERNATE_VISUAL_TECHNOLOGY_VERSION,
    displayName: "Blueprint Alternate Renderer",
    description:
      "An independent second deterministic in-repo renderer with a visibly different presentation " +
      "style: dark blueprint ground, light linework, a left legend panel and a dotted context-sketch " +
      "margin as the illustrative addition. The swap lane's proof that provider replacement is " +
      "presentation-only.",
    presentationStyle: {
      name: "dark blueprint study",
      statement:
        "slate blueprint ground, light cyan linework with a dotted grid, a left legend column, " +
        "and a dotted illustrative context margin around the canonical extents",
    },
    capabilities: ["elevation-hypothesis", "context-sketch"],
    declaredLimitations: [
      "deterministic in-repo SVG stylization — no learned generation, no external model behind this fixture",
      "renders the canonical PLAN projection in a vertical legend-plus-drawing layout; the axonometric snapshot is reference-only",
      "declines the material-study class (not among this provider's capabilities) with an explicit unsupported-data refusal",
      "the context-sketch margin is illustrative only — with no canonical shapes the visual renders the honest empty notice and no margin",
      "carries no numeric engineering claims — quantities and validation belong to the canonical engine, never to a visual",
    ],
    numericClaimPolicy: "illustrative-only",
    failureModes: [
      {
        kind: "unsupported-data",
        condition: "a request whose visual class is not among the declared capabilities (e.g. material-study)",
        behavior: "explicit unsupported-data refusal — never a fabricated rendering",
      },
      {
        kind: "contract-mismatch",
        condition: "a request that violates the visual state request contract",
        behavior: "typed refusal carried from the lane's request gate — never a silent coercion",
      },
    ],
    laneStatement: VISUAL_LANE_STATEMENT,
  };
}

/* ------------------------------------------------------------------ */
/* Local deterministic presentation primitives (INDEPENDENT of the      */
/* reference renderer — no shared helpers, by design)                   */
/* ------------------------------------------------------------------ */

/** Canonical number text (1e-6 rounding, −0 canonicalized). */
function num(value: number): string {
  const rounded = Math.round((value === 0 ? 0 : value) * 1e6) / 1e6;
  return `${rounded}`;
}

/** XML escaping of the five significant characters. */
function esc(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

/** The alternate palette (presentation only). */
const ALT = {
  ground: "#0f172a",
  line: "#a5f3fc",
  lineDim: "#67e8f9",
  legend: "#e0f2fe",
  marginDots: "#fbbf24",
  grid: "#1e293b",
} as const;

/** The legend column width + paddings (screen units). */
const LEGEND_W = 150;
const PAD = 10;

/* ------------------------------------------------------------------ */
/* The renderer                                                         */
/* ------------------------------------------------------------------ */

/** The alternate blueprint renderer (a deterministic fixture provider). */
export function createAlternateVisualProvider(): VisualRenderProvider {
  const descriptor = alternateVisualDescriptor();
  return {
    descriptor,
    renderVisual(state: VisualStateRequest): VisualRenderOutcome {
      if (!descriptor.capabilities.includes(state.visualClass)) {
        return {
          ok: false,
          failure: {
            kind: "unsupported-data",
            detail:
              `the blueprint alternate renderer does not declare the visual class '${state.visualClass}' — ` +
              `explicit refusal (this provider renders elevation-hypothesis and context-sketch only)`,
          },
        };
      }

      const shapes = state.canonicalProjections.plan.shapes;
      const labels: GeneratedRegionLabel[] = [];
      const drawLines: string[] = [];

      if (shapes.length === 0) {
        // The honest empty case — the alternate's own wording, same law.
        const w = 340;
        const h = 130;
        const svg = [
          `<svg height="${num(h)}" viewBox="0 0 ${num(w)} ${num(h)}" width="${num(w)}" xmlns="http://www.w3.org/2000/svg">`,
          `<rect data-region-id="alt-ground" fill="${ALT.ground}" height="${num(h)}" width="${num(w)}" x="0" y="0"/>`,
          `<text data-region-id="alt-empty-note" fill="${ALT.line}" font-family="ui-monospace, monospace" font-size="12" text-anchor="middle" x="${num(w / 2)}" y="${num(h / 2)}">EMPTY STATE — no deterministic geometry, nothing sketched</text>`,
          `</svg>`,
        ].join("\n");
        return {
          ok: true,
          artifact: sealVisualArtifact({
            visualClass: state.visualClass,
            content: { mediaType: "image/svg+xml", svg: `${svg}\n` },
            labels: [],
            canonicalComparison: {
              canonicalShapeCount: 0,
              renderedCanonicalShapeCount: 0,
              excessRegionCount: 0,
              statement:
                "no canonical shapes arrived — the alternate renders its honest empty notice and no illustrative margin",
            },
            state: state.state,
            provider: providerReferenceOf(descriptor),
          }),
        };
      }

      // Canonical shapes: light linework, dotted for non-observed origins.
      let minX = Number.POSITIVE_INFINITY;
      let minY = Number.POSITIVE_INFINITY;
      let maxX = Number.NEGATIVE_INFINITY;
      let maxY = Number.NEGATIVE_INFINITY;
      for (const shape of shapes) {
        for (const [x, y] of shape.points) {
          if (x < minX) minX = x;
          if (y < minY) minY = y;
          if (x > maxX) maxX = x;
          if (y > maxY) maxY = y;
        }
      }
      for (const shape of shapes) {
        const isObserved = shape.origin === "observed" || shape.origin === "baseline";
        const pts = shape.points.map(([x, y]) => `${num(x)},${num(y)}`).join(" ");
        drawLines.push(
          `<polygon data-node-id="${esc(shape.nodeId)}" fill="none" points="${pts}" stroke="${isObserved ? ALT.line : ALT.lineDim}" stroke-width="1.25"${isObserved ? "" : ` stroke-dasharray="1 3"`}/>`,
        );
      }

      // The illustrative addition: a dotted context-sketch margin frame
      // AROUND the canonical extents — beyond deterministic geometry.
      const regionId = "alt-context-sketch-margin";
      const frameX = minX - PAD;
      const frameY = minY - PAD;
      const frameW = maxX - minX + 2 * PAD;
      const frameH = maxY - minY + 2 * PAD;
      drawLines.push(
        `<rect data-region-id="${regionId}" fill="none" height="${num(frameH)}" stroke="${ALT.marginDots}" stroke-dasharray="1 4" stroke-width="2" width="${num(frameW)}" x="${num(frameX)}" y="${num(frameY)}"/>`,
      );
      labels.push({
        regionId,
        regionKind: "hypothesized-context",
        label: "GENERATED — context sketch margin (beyond deterministic geometry)",
        basis: "beyond-deterministic-geometry",
        detail:
          "an illustrative surroundings hypothesis framed around the canonical extents — no " +
          "deterministic record describes this context; it is presentation only and implies no quantity, material or validation",
      });

      // Layout: legend column on the LEFT, drawing on the right.
      const contentW = Math.max(maxX - minX, 1);
      const contentH = Math.max(maxY - minY, 1);
      const totalW = LEGEND_W + contentW + 3 * PAD;
      const totalH = contentH + 2 * PAD;
      const translateX = LEGEND_W + 2 * PAD - minX + PAD;
      const translateY = PAD - minY;
      const legendLines = [
        `<text data-region-id="alt-legend-title" fill="${ALT.legend}" font-family="ui-monospace, monospace" font-size="11" font-weight="700" x="${num(PAD)}" y="${num(PAD + 12)}">BLUEPRINT ALTERNATE</text>`,
        `<text data-region-id="alt-legend-banner" fill="${ALT.legend}" font-family="ui-monospace, monospace" font-size="10" x="${num(PAD)}" y="${num(PAD + 28)}">HYPOTHETICAL VISUAL —</text>`,
        `<text data-region-id="alt-legend-banner-2" fill="${ALT.legend}" font-family="ui-monospace, monospace" font-size="10" x="${num(PAD)}" y="${num(PAD + 42)}">NOT ENGINEERING GEOMETRY</text>`,
        `<line data-region-id="alt-legend-rule" stroke="${ALT.grid}" stroke-width="1" x1="${num(PAD)}" x2="${num(LEGEND_W - PAD)}" y1="${num(PAD + 52)}" y2="${num(PAD + 52)}"/>`,
        `<text data-region-id="alt-legend-observed" fill="${ALT.line}" font-family="ui-monospace, monospace" font-size="10" x="${num(PAD)}" y="${num(PAD + 68)}">solid: observed geometry</text>`,
        `<text data-region-id="alt-legend-proposed" fill="${ALT.lineDim}" font-family="ui-monospace, monospace" font-size="10" x="${num(PAD)}" y="${num(PAD + 82)}">dotted: proposed change</text>`,
        `<text data-region-id="alt-legend-margin" fill="${ALT.marginDots}" font-family="ui-monospace, monospace" font-size="10" x="${num(PAD)}" y="${num(PAD + 96)}">framed: sketch margin</text>`,
      ];
      const svg = [
        `<svg height="${num(totalH)}" viewBox="${num(-PAD)} ${num(-PAD)} ${num(totalW + PAD)} ${num(totalH + 2 * PAD)}" width="${num(totalW)}" xmlns="http://www.w3.org/2000/svg">`,
        `<rect data-region-id="alt-ground" fill="${ALT.ground}" height="${num(totalH + 2 * PAD)}" width="${num(totalW + PAD)}" x="${num(-PAD)}" y="${num(-PAD)}"/>`,
        ...legendLines,
        `<g data-region-id="alt-drawing" transform="translate(${num(translateX)},${num(translateY)})">`,
        ...drawLines,
        `</g>`,
        `</svg>`,
      ].join("\n");

      return {
        ok: true,
        artifact: sealVisualArtifact({
          visualClass: state.visualClass,
          content: { mediaType: "image/svg+xml", svg: `${svg}\n` },
          labels,
          canonicalComparison: {
            canonicalShapeCount: shapes.length,
            renderedCanonicalShapeCount: shapes.length,
            excessRegionCount: labels.filter(
              (label) => label.basis === "beyond-deterministic-geometry",
            ).length,
            statement:
              "every canonical shape of the plan projection is drawn verbatim in the blueprint style; the labeled context-sketch margin is the only content beyond deterministic geometry",
          },
          state: state.state,
          provider: providerReferenceOf(descriptor),
        }),
      };
    },
  };
}
