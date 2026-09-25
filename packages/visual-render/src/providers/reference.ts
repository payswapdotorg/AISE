/**
 * HFX-303 — the REFERENCE hypothesis-renderer.
 *
 * The reference implementation of what a bounded visual provider IS: a
 * deterministic stylized SVG renderer that DRAWS FROM the canonical state —
 * the request's already-computed canonical projection snapshots (the
 * caller's projection seam produced them; this provider never derives
 * geometry) — PLUS DECLARED illustrative additions clearly beyond
 * deterministic geometry (a hatched "hypothesized finish" band anchored to
 * the canonical extents), every addition listed in the artifact's
 * generated/hypothetical label manifest.
 *
 * HONESTY RULES (mirroring the AISE-020/021/026 discipline):
 *  - canonical shapes are drawn VERBATIM from the projections (plan mode);
 *  - a state with NO canonical shapes renders the honest EMPTY visual —
 *    "no deterministic geometry in this state" — and NO illustrative
 *    additions (an illustration anchored to nothing is fabricated extent);
 *  - the provider emits NO numeric engineering claims: the only <text>
 *    content is the style banner and region labels (the tolerance-free
 *    law; SVG coordinate attributes are presentation geometry, not text
 *    claims);
 *  - a visual class outside the declared capabilities is an explicit
 *    `unsupported-data` refusal — never a fabricated rendering.
 *
 * An IN-REPO deterministic fixture proving the LANE (no network, no model,
 * no clock, no randomness): real external visual-generation models are
 * future occupants behind the same port.
 */

import type {
  CanonicalProjectionSnapshot,
  GeneratedRegionLabel,
  VisualClass,
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

export const REFERENCE_VISUAL_PROVIDER_ID = "visual-hypothesis-reference" as const;
export const REFERENCE_VISUAL_TECHNOLOGY_VERSION = "1.0.0-inrepo-v1" as const;

/** The reference provider's descriptor (deterministic reference data). */
export function referenceVisualDescriptor(): VisualProviderDescriptor {
  return {
    kind: "visual-provider-descriptor",
    schemaVersion: "visual-provider-descriptor/1",
    providerId: REFERENCE_VISUAL_PROVIDER_ID,
    technologyVersion: REFERENCE_VISUAL_TECHNOLOGY_VERSION,
    displayName: "Reference Hypothesis Renderer",
    description:
      "Deterministic in-repo reference implementation of a bounded visual provider: a light " +
      "hypothesis-study rendering of the canonical plan projection with a declared hatched " +
      "hypothesized-finish band beyond deterministic geometry. Proves the lane; no external model.",
    presentationStyle: {
      name: "light hypothesis study",
      statement:
        "warm paper ground, dark ink canonical outlines (observed solid, proposed dashed), " +
        "one hatched illustrative band for the hypothesized finish, banner and region labels in plain text",
    },
    capabilities: ["elevation-hypothesis", "material-study", "context-sketch"],
    declaredLimitations: [
      "deterministic in-repo SVG stylization — no learned generation, no external model behind this fixture",
      "draws the canonical PLAN projection only; the axonometric snapshot is carried for reference but not rendered",
      "the hypothesized-finish band is anchored to the canonical extents — with no canonical shapes the visual renders the honest empty notice and no illustration",
      "carries no numeric engineering claims — quantities and validation belong to the canonical engine, never to a visual",
    ],
    numericClaimPolicy: "illustrative-only",
    failureModes: [
      {
        kind: "unsupported-data",
        condition: "a request whose visual class is not among the declared capabilities",
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
/* Local deterministic presentation primitives                          */
/* ------------------------------------------------------------------ */

/** Canonical number text (the house 1e-6 rounding discipline). */
function fmt(value: number): string {
  const canonical = value === 0 ? 0 : value;
  const rounded = Math.round(canonical * 1e6) / 1e6;
  return String(rounded);
}

/** XML text/attribute escaping (the five significant characters). */
function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

interface Bounds {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

function boundsOf(points: readonly (readonly [number, number])[]): Bounds {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const [x, y] of points) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return { minX, minY, maxX, maxY };
}

function pointsAttr(points: readonly (readonly [number, number])[]): string {
  return points.map(([x, y]) => `${fmt(x)},${fmt(y)}`).join(" ");
}

/** The reference palette (presentation only). */
const REFERENCE_PALETTE = {
  ground: "#fffdf5",
  ink: "#1c1917",
  inkObserved: "#292524",
  inkProposed: "#57534e",
  hatch: "#b45309",
  banner: "#92400e",
} as const;

/** Drawing margin + banner strip height (screen units). */
const MARGIN = 12;
const BANNER_HEIGHT = 26;

/** The hypothesized-finish band inset fraction of the canonical extents. */
const FINISH_BAND_INSET = 0.12;

/* ------------------------------------------------------------------ */
/* The renderer                                                         */
/* ------------------------------------------------------------------ */

/** The reference hypothesis-renderer (a deterministic fixture provider). */
export function createReferenceVisualProvider(): VisualRenderProvider {
  const descriptor = referenceVisualDescriptor();
  return {
    descriptor,
    renderVisual(state: VisualStateRequest): VisualRenderOutcome {
      if (!descriptor.capabilities.includes(state.visualClass)) {
        return {
          ok: false,
          failure: {
            kind: "unsupported-data",
            detail:
              `the reference hypothesis-renderer does not declare the visual class '${state.visualClass}' — ` +
              `explicit refusal, never a fabricated rendering`,
          },
        };
      }
      const plan: CanonicalProjectionSnapshot = state.canonicalProjections.plan;
      const canonicalShapes = plan.shapes;
      const labels: GeneratedRegionLabel[] = [];
      const bodyLines: string[] = [];

      // The honest empty case: no canonical shapes → NO illustration.
      if (canonicalShapes.length === 0) {
        const width = 320;
        const height = 120;
        bodyLines.push(
          `<svg height="${String(height)}" viewBox="${fmt(-MARGIN)} ${fmt(-MARGIN)} ${fmt(width + 2 * MARGIN)} ${fmt(height + 2 * MARGIN)}" width="${String(width)}" xmlns="http://www.w3.org/2000/svg">`,
          `<rect data-region-id="reference-ground" fill="${REFERENCE_PALETTE.ground}" height="${fmt(height + 2 * MARGIN)}" width="${fmt(width + 2 * MARGIN)}" x="${fmt(-MARGIN)}" y="${fmt(-MARGIN)}"/>`,
          `<text data-region-id="reference-empty-note" fill="${REFERENCE_PALETTE.ink}" font-family="system-ui, sans-serif" font-size="13" text-anchor="middle" x="${fmt(width / 2)}" y="${fmt(height / 2)}">No deterministic geometry in this state — nothing is hypothesized.</text>`,
          `</svg>`,
        );
        return {
          ok: true,
          artifact: sealVisualArtifact({
            visualClass: state.visualClass,
            content: {
              mediaType: "image/svg+xml",
              svg: `${bodyLines.join("\n")}\n`,
            },
            labels: [],
            canonicalComparison: {
              canonicalShapeCount: 0,
              renderedCanonicalShapeCount: 0,
              excessRegionCount: 0,
              statement:
                "the canonical projections carry no shapes — the visual renders the honest empty notice and no illustrative additions",
            },
            state: state.state,
            provider: providerReferenceOf(descriptor),
          }),
        };
      }

      // Canonical shapes: draw verbatim (plan mode), observed solid /
      // everything else dashed (the house presentation distinction).
      const allPoints = canonicalShapes.flatMap((shape) => [...shape.points]);
      const canonicalBounds = boundsOf(allPoints);
      for (const shape of canonicalShapes) {
        const observed = shape.origin === "observed" || shape.origin === "baseline";
        bodyLines.push(
          `<polygon data-node-id="${escapeXml(shape.nodeId)}" fill="none" points="${pointsAttr(shape.points)}" stroke="${observed ? REFERENCE_PALETTE.inkObserved : REFERENCE_PALETTE.inkProposed}" stroke-width="1.5"${observed ? "" : ` stroke-dasharray="4 2"`}/>`,
        );
      }

      // The declared illustrative addition: a hatched hypothesized-finish
      // band INSIDE the canonical extents — clearly beyond deterministic
      // geometry (no deterministic record describes a finish zone) and
      // labeled as such in the manifest.
      const bandWidth = (canonicalBounds.maxX - canonicalBounds.minX) * (1 - 2 * FINISH_BAND_INSET);
      const bandHeight = (canonicalBounds.maxY - canonicalBounds.minY) * (1 - 2 * FINISH_BAND_INSET);
      const bandX = canonicalBounds.minX + (canonicalBounds.maxX - canonicalBounds.minX) * FINISH_BAND_INSET;
      const bandY = canonicalBounds.minY + (canonicalBounds.maxY - canonicalBounds.minY) * FINISH_BAND_INSET;
      const regionId = "reference-hypothesized-finish-band";
      bodyLines.push(
        `<rect data-region-id="${regionId}" fill="url(#reference-hatch)" height="${fmt(Math.max(bandHeight, 1))}" stroke="${REFERENCE_PALETTE.hatch}" stroke-dasharray="2 3" stroke-width="1" width="${fmt(Math.max(bandWidth, 1))}" x="${fmt(bandX)}" y="${fmt(bandY)}"/>`,
      );
      labels.push({
        regionId,
        regionKind: "hypothesized-finish",
        label: "GENERATED — hypothesized finish zone (beyond deterministic geometry)",
        basis: "beyond-deterministic-geometry",
        detail:
          "an illustrative finish hypothesis drawn inside the canonical extents — no deterministic " +
          "record describes this zone; it is presentation only and implies no quantity, material or validation",
      });

      // Layout: banner strip above the drawing ground.
      const contentWidth = Math.max(canonicalBounds.maxX - canonicalBounds.minX, 1);
      const contentHeight = Math.max(canonicalBounds.maxY - canonicalBounds.minY, 1);
      const viewBoxX = canonicalBounds.minX - MARGIN;
      const viewBoxY = canonicalBounds.minY - MARGIN - BANNER_HEIGHT;
      const viewBoxW = contentWidth + 2 * MARGIN;
      const viewBoxH = contentHeight + 2 * MARGIN + BANNER_HEIGHT;
      const lines: string[] = [
        `<svg height="${fmt(viewBoxH)}" viewBox="${fmt(viewBoxX)} ${fmt(viewBoxY)} ${fmt(viewBoxW)} ${fmt(viewBoxH)}" width="${fmt(viewBoxW)}" xmlns="http://www.w3.org/2000/svg">`,
        `<defs>`,
        `<pattern data-region-id="reference-hatch-pattern" height="6" patternUnits="userSpaceOnUse" width="6">`,
        `<path d="M0 6 L6 0" stroke="${REFERENCE_PALETTE.hatch}" stroke-width="1"/>`,
        `</pattern>`,
        `</defs>`,
        `<rect data-region-id="reference-ground" fill="${REFERENCE_PALETTE.ground}" height="${fmt(viewBoxH)}" width="${fmt(viewBoxW)}" x="${fmt(viewBoxX)}" y="${fmt(viewBoxY)}"/>`,
        `<text data-region-id="reference-banner" fill="${REFERENCE_PALETTE.banner}" font-family="system-ui, sans-serif" font-size="12" font-weight="600" text-anchor="start" x="${fmt(viewBoxX + MARGIN)}" y="${fmt(viewBoxY + 16)}">REFERENCE HYPOTHESIS RENDER — NOT ENGINEERING GEOMETRY</text>`,
        ...bodyLines,
        `</svg>`,
      ];

      return {
        ok: true,
        artifact: sealVisualArtifact({
          visualClass: state.visualClass,
          content: { mediaType: "image/svg+xml", svg: `${lines.join("\n")}\n` },
          labels,
          canonicalComparison: {
            canonicalShapeCount: canonicalShapes.length,
            renderedCanonicalShapeCount: canonicalShapes.length,
            excessRegionCount: labels.filter(
              (label) => label.basis === "beyond-deterministic-geometry",
            ).length,
            statement:
              "every canonical shape of the plan projection is drawn verbatim; the labeled hypothesized-finish band is the only content beyond deterministic geometry",
          },
          state: state.state,
          provider: providerReferenceOf(descriptor),
        }),
      };
    },
  };
}

export type { VisualClass };
