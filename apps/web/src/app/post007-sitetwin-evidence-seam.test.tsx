/**
 * POST-007 — the SiteTwin live evidence seam's targeted assertions (the
 * app's established static-render convention: renderToStaticMarkup
 * projections of pure components with hand-constructed fixtures — no
 * network, no clock, no randomness).
 *
 * DEFECT (live-reproduced 2026-09-29): the SiteTwin's api mode hardcoded
 * `evidence: []` and rendered "Evidence records are not readable through
 * this build's API seam" — while `GET /v1/evidence` answers 200 and the
 * Intervention Studio evidence picker in the SAME app already consumed
 * `loadEvidenceIndexLive`. The seam is now wired: the register is loaded,
 * adapted into `EvidencePaneView`s and filtered to the records the
 * project's reality snapshot references through node provenance ("captures
 * behind the reality graph" — the card's own meta).
 *
 * Asserted here:
 *  1. `liveEvidencePaneViews` — the live index adapter (verbatim fields,
 *     `evidence/<contentId>` sources, honest-empty relatedCaseIds,
 *     invalidation mapping);
 *  2. `realityReferencedEvidenceIds` — the live filter (dedup, first-seen
 *     order, null reality = no references);
 *  3. `SiteTwinBody` — api mode renders the evidence table for referenced
 *     records and the NEW honest empty state when none are referenced (the
 *     old "not readable through this build's API seam" text is gone);
 *     demo mode's empty state is unchanged.
 */
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { liveEvidencePaneViews, type EvidenceIndexItem } from "./api";
import { realityReferencedEvidenceIds, SiteTwinBody } from "./surfaces/SiteTwin";
import type { EvidencePaneView, RealityPaneView } from "../shell";

const EV_A = "34867d9a0db6be51a7cbc73d62d424c61b5563c7549e914fc42881c283abe157";
const EV_B = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const PROJECT = "proj-riverside-refit";

function indexItem(contentId: string, invalidated = false): EvidenceIndexItem {
  return {
    evidence: {
      contentId,
      acquisitionMethod: "STILL_IMAGERY",
      mediaType: "image/jpeg",
      byteSize: 59685,
      capturedAt: "2026-09-29T07:52:07.720Z",
    },
    invalidation: invalidated
      ? { reason: "superseded by a later capture", invalidatedAt: "2026-09-29T09:00:00.000Z" }
      : null,
  };
}

function liveEvidenceView(evidenceId: string): EvidencePaneView {
  const source = { module: "evidence" as const, recordId: evidenceId };
  return {
    source,
    projectId: PROJECT,
    evidenceId,
    acquisitionMethod: { value: "STILL_IMAGERY", source },
    mediaType: { value: "image/jpeg", source },
    byteSize: { value: 59685, source },
    capturedAt: { value: "2026-09-29T07:52:07.720Z", source },
    invalidationReason: null,
    relatedCaseIds: [],
  };
}

describe("POST-007 liveEvidencePaneViews (the live register adapter)", () => {
  test("every scalar carries its verbatim evidence/<contentId> source; relatedCaseIds stays honestly empty", () => {
    const views = liveEvidencePaneViews([indexItem(EV_A)], PROJECT);
    expect(views.length).toBe(1);
    const view = views[0];
    if (view === undefined) {
      throw new Error("unreachable: exactly one view expected");
    }
    expect(view.evidenceId).toBe(EV_A);
    expect(view.projectId).toBe(PROJECT);
    expect(view.source).toEqual({ module: "evidence", recordId: EV_A });
    expect(view.acquisitionMethod).toEqual({ value: "STILL_IMAGERY", source: { module: "evidence", recordId: EV_A } });
    expect(view.mediaType.value).toBe("image/jpeg");
    expect(view.byteSize.value).toBe(59685);
    expect(view.capturedAt.value).toBe("2026-09-29T07:52:07.720Z");
    expect(view.invalidationReason).toBe(null);
    expect(view.relatedCaseIds).toEqual([]);
  });

  test("an invalidated record maps its reason verbatim (invalidation is a state, not a deletion)", () => {
    const views = liveEvidencePaneViews([indexItem(EV_B, true)], PROJECT);
    const view = views[0];
    if (view === undefined) {
      throw new Error("unreachable: exactly one view expected");
    }
    expect(view.invalidationReason).toEqual({
      value: "superseded by a later capture",
      source: { module: "evidence", recordId: EV_B },
    });
  });
});

describe("POST-007 realityReferencedEvidenceIds (the live filter)", () => {
  const versionSource = { module: "reality" as const, recordId: "v002" };
  function realityWith(ids: readonly (readonly string[])[]): RealityPaneView {
    return {
      source: versionSource,
      projectId: PROJECT,
      versionId: "v002",
      versionCreatedAt: { value: "2026-09-29T07:52:07.742Z", source: versionSource },
      nodes: ids.map((evidenceIds, index) => {
        const nodeSource = { module: "reality" as const, recordId: `v002:n${String(index)}` };
        return {
          source: nodeSource,
          nodeId: `n${String(index)}`,
          kind: "element",
          epistemicStatus: "OBSERVED" as const,
          summary: { value: "", source: nodeSource },
          evidenceIds: evidenceIds.map((value) => ({ value, source: nodeSource })),
        };
      }),
    };
  }

  test("node provenance evidence ids, deduped in first-seen order", () => {
    const reality = realityWith([[EV_A, EV_B], [EV_A]]);
    expect(realityReferencedEvidenceIds(reality)).toEqual([EV_A, EV_B]);
  });

  test("no snapshot (null) references nothing — never an error", () => {
    expect(realityReferencedEvidenceIds(null)).toEqual([]);
  });
});

describe("POST-007 SiteTwinBody (the evidence card's live seam)", () => {
  function renderBody(mode: "demo" | "api", evidence: readonly EvidencePaneView[]): string {
    return renderToStaticMarkup(
      <SiteTwinBody
        data={{
          mode,
          projectId: PROJECT,
          workspace: null,
          reality: null,
          evidence,
        }}
        selectedNodeId={null}
        onSelectNode={() => {}}
      />,
    );
  }

  test("api mode with referenced records renders the evidence table (the seam is wired)", () => {
    const markup = renderBody("api", [liveEvidenceView(EV_A)]);
    expect(markup.includes("Evidence records")).toBe(true);
    expect(markup.includes(EV_A.slice(0, 8))).toBe(true);
    expect(markup.includes("STILL_IMAGERY")).toBe(true);
    expect(markup.includes("image/jpeg")).toBe(true);
    expect(markup.includes("not readable through this build")).toBe(false);
    expect(markup.includes("No evidence records referenced")).toBe(false);
  });

  test("api mode with NO referenced records renders the new honest empty state, never the old seam note", () => {
    const markup = renderBody("api", []);
    expect(markup.includes("No evidence records referenced by this project&#x27;s reality graph")).toBe(true);
    expect(markup.includes("GET /v1/evidence")).toBe(true);
    expect(markup.includes("not readable through this build")).toBe(false);
    expect(markup.includes("no GET route this build consumes")).toBe(false);
  });

  test("demo mode's empty state is unchanged (the demo world's own wording)", () => {
    const markup = renderBody("demo", []);
    expect(markup.includes("No evidence records for this project")).toBe(true);
    expect(markup.includes("demo dataset holds evidence only for the pilot project")).toBe(true);
  });
});
