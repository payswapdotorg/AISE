/**
 * HFX-303 tests — the GENERATED-VISUAL FALLBACK pane: the honest
 * fallback notice (canonical views remain, the failure is recorded and
 * visible — never a gap, never a silent omission).
 */

import { describe, expect, test } from "bun:test";
import { renderInterventionViewer } from "../render";
import { frameOf } from "../sync";
import { viewerInput, deepFreeze } from "../fixtures";
import type { GeneratedVisualFallbackRecord } from "./model";
import { GENERATED_FALLBACK_LEAD, generatedFallbackLines } from "./fallback";

function wireFallbackRecord(
  overrides: Partial<GeneratedVisualFallbackRecord> = {},
): GeneratedVisualFallbackRecord {
  return {
    kind: "visual-fallback-record",
    schemaVersion: "visual-fallback/1",
    fallbackId: "ef".repeat(32),
    visualClass: "elevation-hypothesis",
    state: {
      solutionId: "scenario-office-refit",
      versionRef: "v001",
      stateId: "e2".repeat(32),
      stateIndex: 2,
      appliedOperationIds: ["step-0000000000000001", "step-0000000000000002"],
    },
    reason: {
      reasonKind: "provider-failure",
      failure: {
        kind: "unsupported-data",
        detail: "the visual provider does not declare this visual class — explicit refusal",
      },
    },
    canonicalProjectionDigests: {
      plan: "aa".repeat(32),
      axonometric: "bb".repeat(32),
    },
    statement:
      "visual generation unavailable — the canonical deterministic 2D/3D projections remain the engineering views; the fallback itself is recorded, never a silent gap",
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

describe("the generated-visual fallback pane", () => {
  test("a provider FAILURE renders the typed failure notice — the canonical panes remain", () => {
    const record = wireFallbackRecord();
    const html = renderInterventionViewer(
      viewerInput({ stateIndex: 2, generatedVisualFallback: record }),
    );
    const pane = paneOf(html, "pane-generated-fallback");
    expect(pane).toContain(GENERATED_FALLBACK_LEAD);
    expect(pane).toContain(record.reason.reasonKind === "provider-failure"
      ? record.reason.failure.kind
      : "");
    expect(pane).toContain(record.reason.reasonKind === "provider-failure"
      ? record.reason.failure.detail
      : "");
    // The canonical panes are all still present.
    for (const paneId of ["pane-3d", "pane-2d", "pane-boq"]) {
      expect(html).toContain(`<section class="pane" id="${paneId}"`);
    }
    // No generated pane appears (the fallback replaced it).
    expect(html).not.toContain(`id="pane-generated"`);
  });

  test("a MISSING provider renders the provider-absent notice — never a gap", () => {
    const record = wireFallbackRecord({
      reason: {
        reasonKind: "provider-absent",
        detail: "no visual-generation provider is configured for this request",
      },
    });
    const html = renderInterventionViewer(
      viewerInput({ stateIndex: 2, generatedVisualFallback: record }),
    );
    const pane = paneOf(html, "pane-generated-fallback");
    expect(pane).toContain("No visual-generation provider was available");
    expect(pane).toContain(record.reason.reasonKind === "provider-absent"
      ? record.reason.detail
      : "");
    expect(pane).toContain(record.statement);
  });

  test("the notice carries the fallback record's identity + canonical projection pins", () => {
    const record = wireFallbackRecord();
    const html = renderInterventionViewer(
      viewerInput({ stateIndex: 2, generatedVisualFallback: record }),
    );
    const pane = paneOf(html, "pane-generated-fallback");
    expect(pane).toContain(`data-fallback-id="${record.fallbackId}"`);
    expect(pane).toContain(`data-fallback-reason="${record.reason.reasonKind}"`);
    expect(pane).toContain(record.canonicalProjectionDigests.plan.slice(0, 16));
    expect(pane).toContain(record.state.stateId);
  });

  test("the canonical panes are BYTE-IDENTICAL with and without the fallback notice", () => {
    const without = renderInterventionViewer(viewerInput({ stateIndex: 2 }));
    const withFallback = renderInterventionViewer(
      viewerInput({ stateIndex: 2, generatedVisualFallback: wireFallbackRecord() }),
    );
    for (const paneId of ["pane-3d", "pane-2d", "pane-boq"]) {
      expect(paneOf(withFallback, paneId)).toBe(paneOf(without, paneId));
    }
  });

  test("the fallback renderer is deterministic and pure (frozen input)", () => {
    const record = deepFreeze(wireFallbackRecord());
    const input = viewerInput({ stateIndex: 2, generatedVisualFallback: record });
    const frame = frameOf(input.scenario, 2);
    expect(generatedFallbackLines(record, frame).join("\n")).toBe(
      generatedFallbackLines(record, frame).join("\n"),
    );
    expect(renderInterventionViewer(input)).toBe(renderInterventionViewer(input));
  });

  test("a MALFORMED fallback record fails closed at the input gate", () => {
    const broken = { ...wireFallbackRecord(), fallbackId: "" };
    expect(() =>
      renderInterventionViewer(
        viewerInput({ stateIndex: 2, generatedVisualFallback: broken }),
      ),
    ).toThrow(/generatedVisualFallback/);
  });
});
