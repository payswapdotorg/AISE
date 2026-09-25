/**
 * HFX-303 tests — the GENERATED-VISUAL PANE: the always-present
 * banner, the per-region labels, the provenance block, determinism,
 * purity and the no-leak-into-the-canonical-panes law.
 */

import { describe, expect, test } from "bun:test";
import { renderInterventionViewer } from "../render";
import { frameOf, stateAt } from "../sync";
import { viewerInput, viewerInputAt, deepFreeze } from "../fixtures";
import type { ViewerInput } from "../model";
import type { GeneratedVisualArtifact } from "./model";
import { GENERATED_VISUAL_BANNER, generatedPaneLines } from "./pane";

/* ------------------------------------------------------------------ */
/* A hand-built wire artifact (the mirror discipline's test fixture)    */
/* ------------------------------------------------------------------ */

function wireArtifact(overrides: Partial<GeneratedVisualArtifact> = {}): GeneratedVisualArtifact {
  return {
    kind: "visual-artifact",
    schemaVersion: "visual-artifact/1",
    artifactId: "ab".repeat(32),
    visualClass: "elevation-hypothesis",
    content: {
      mediaType: "image/svg+xml",
      svg: `<svg height="10" viewBox="0 0 10 10" width="10" xmlns="http://www.w3.org/2000/svg">\n<rect data-region-id="fixture-band" fill="none" height="8" width="8" x="1" y="1"/>\n</svg>\n`,
    },
    provenance: {
      solutionId: "scenario-office-refit",
      versionRef: "v001",
      stateId: "e2".repeat(32),
      stateIndex: 2,
      appliedOperationIds: ["step-0000000000000001", "step-0000000000000002"],
      stateContentDigest: "cd".repeat(32),
      provider: {
        providerId: "visual-hypothesis-reference",
        technologyVersion: "1.0.0-inrepo-v1",
        descriptorDigest: "dd".repeat(32),
      },
      laneStatement:
        "presentation-only hypothesis rendering — a generated visual is never engineering geometry authority and can never change quantities, validation or canonical Solution Graph state",
    },
    labels: [
      {
        regionId: "fixture-band",
        regionKind: "hypothesized-finish",
        label: "GENERATED — hypothesized finish zone (beyond deterministic geometry)",
        basis: "beyond-deterministic-geometry",
        detail: "an illustrative finish hypothesis — presentation only",
      },
    ],
    canonicalComparison: {
      canonicalShapeCount: 4,
      renderedCanonicalShapeCount: 4,
      excessRegionCount: 1,
      statement: "every canonical shape drawn; the labeled band is the only beyond-geometry content",
    },
    ...overrides,
  };
}

function paneOf(html: string, paneId: string): string {
  const start = html.indexOf(`<section class="pane" id="${paneId}"`);
  if (start === -1) {
    throw new Error(`pane not found: ${paneId}`);
  }
  const end = html.indexOf("</section>", start);
  return html.slice(start, end);
}

describe("the generated-visual pane (labeling semantics + provenance display)", () => {
  test("the ALWAYS-PRESENT banner renders — the work order's labeling criterion", () => {
    const html = renderInterventionViewer(viewerInput({ generatedVisual: wireArtifact() }));
    const pane = paneOf(html, "pane-generated");
    expect(pane).toContain(GENERATED_VISUAL_BANNER);
    expect(pane).toContain("NOT ENGINEERING GEOMETRY");
    expect(pane).toContain(`data-generated-banner="true"`);
  });

  test("the artifact's SVG is embedded and every label-manifest region is labeled", () => {
    const artifact = wireArtifact();
    const html = renderInterventionViewer(viewerInput({ generatedVisual: artifact }));
    const pane = paneOf(html, "pane-generated");
    expect(pane).toContain(artifact.content.svg.trimEnd());
    for (const label of artifact.labels) {
      expect(pane).toContain(`data-region-id="${label.regionId}"`);
      expect(pane).toContain(label.label);
      expect(pane).toContain(label.detail);
    }
  });

  test("the provenance block renders the state revision, operations and provider identity", () => {
    const artifact = wireArtifact();
    const html = renderInterventionViewer(viewerInputAt(2, { }));
    void html;
    const withVisual = renderInterventionViewer(
      viewerInput({ generatedVisual: artifact, stateIndex: 2 }),
    );
    const pane = paneOf(withVisual, "pane-generated");
    expect(pane).toContain(artifact.provenance.stateId);
    if (artifact.provenance.stateContentDigest !== undefined) {
      expect(pane).toContain(artifact.provenance.stateContentDigest);
    }
    expect(pane).toContain(artifact.provenance.provider.providerId);
    expect(pane).toContain(artifact.provenance.provider.technologyVersion);
    expect(pane).toContain(artifact.provenance.provider.descriptorDigest);
    expect(pane).toContain(artifact.provenance.appliedOperationIds.join(","));
    // The pane header carries the artifact + provider identity pins.
    expect(pane).toContain(`data-artifact-id="${artifact.artifactId}"`);
    expect(pane).toContain(`data-provider-id="${artifact.provenance.provider.providerId}"`);
  });

  test("the pane carries the SAME layer identity attributes as the canonical panes (§027 anchor)", () => {
    const input = viewerInput({ generatedVisual: wireArtifact(), stateIndex: 2 });
    const html = renderInterventionViewer(input);
    const state = stateAt(input.scenario, 2);
    const frame = frameOf(input.scenario, 2);
    const pane = paneOf(html, "pane-generated");
    expect(pane).toContain(`data-state-id="${frame.stateId}"`);
    expect(pane).toContain(`data-state-index="2"`);
    expect(pane).toContain(`data-scenario-id="${frame.scenarioId}"`);
    expect(pane).toContain(`data-baseline-version-id="${frame.baselineVersionId}"`);
    expect(pane).toContain(`data-applied-step-ids="${frame.appliedStepIds.join(",")}"`);
    void state;
  });

  test("an artifact with NO beyond-geometry labels renders the honest none note", () => {
    const artifact = wireArtifact({ labels: [], canonicalComparison: {
      canonicalShapeCount: 4,
      renderedCanonicalShapeCount: 4,
      excessRegionCount: 0,
      statement: "all canonical content",
    } });
    const html = renderInterventionViewer(viewerInput({ generatedVisual: artifact }));
    expect(paneOf(html, "pane-generated")).toContain(
      "No labeled regions beyond deterministic geometry",
    );
  });

  test("the canonical panes are BYTE-IDENTICAL with and without the generated pane attached", () => {
    const without = renderInterventionViewer(viewerInput({ stateIndex: 2 }));
    const withVisual = renderInterventionViewer(
      viewerInput({ stateIndex: 2, generatedVisual: wireArtifact() }),
    );
    for (const paneId of ["pane-3d", "pane-2d", "pane-boq"]) {
      expect(paneOf(withVisual, paneId)).toBe(paneOf(without, paneId));
    }
    // The generated pane is composed AFTER the canonical panes.
    const boqEnd = withVisual.indexOf(`</section>`, withVisual.indexOf(`id="pane-boq"`));
    const generatedStart = withVisual.indexOf(`id="pane-generated"`);
    expect(generatedStart).toBeGreaterThan(boqEnd);
  });

  test("the pane renderer is deterministic and pure (frozen input, no mutation)", () => {
    const artifact = deepFreeze(wireArtifact());
    const input = viewerInput({ generatedVisual: artifact, stateIndex: 2 });
    const frame = frameOf(input.scenario, 2);
    const first = generatedPaneLines(artifact, frame).join("\n");
    const second = generatedPaneLines(artifact, frame).join("\n");
    expect(first).toBe(second);
    // The full document renders twice byte-identically.
    expect(renderInterventionViewer(input)).toBe(renderInterventionViewer(input));
  });

  test("a MALFORMED generated visual fails closed at the input gate (never a broken pane)", () => {
    const broken = { ...wireArtifact(), artifactId: "" };
    expect(() =>
      renderInterventionViewer(viewerInput({ generatedVisual: broken })),
    ).toThrow(/generatedVisual/);
    const brokenContent: GeneratedVisualArtifact = {
      ...wireArtifact(),
      content: { mediaType: "image/svg+xml", svg: "" },
    };
    expect(() =>
      renderInterventionViewer(viewerInput({ generatedVisual: brokenContent })),
    ).toThrow(/generatedVisual/);
  });

  test("purity: the generated pane adds NO browser API, no fetch, no script, no event handler", () => {
    const html = renderInterventionViewer(viewerInput({ generatedVisual: wireArtifact() }));
    const pane = paneOf(html, "pane-generated");
    expect(pane).not.toMatch(/<script/);
    expect(pane).not.toMatch(/on[a-z]+=/);
    expect(pane).not.toMatch(/fetch\(/);
  });
});

export type { ViewerInput };
