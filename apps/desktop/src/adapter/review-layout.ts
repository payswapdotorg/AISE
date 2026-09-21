/**
 * PROD-020 — the desktop adapter's HIGH-DENSITY REVIEW SURFACE MODEL.
 *
 * The dense table/pane layout descriptions for review workflows over the
 * shared semantic objects (the work order's "optimize for high-density
 * review"): a pure, declarative composition of the task-flow bundle into
 * review COLUMNS of PANES, each pane backed by one contract object and
 * rendering its fields VERBATIM through the render registry, plus a dense
 * EVIDENCE TABLE (one row per evidence content id + one row per declared
 * gap — the provenance-visibility surface).
 *
 * PRESENTATION ONLY — NEVER AUTHORITY: the layout model never mutates,
 * re-derives, upgrades or hides authoritative content. Panes carry the
 * DECODED contract objects read-only; every consequential value rendered
 * in a pane traces verbatim to its contract field (asserted by tests:
 * pane values deep-equal the decoded bundle's). Epistemic seals
 * (`PROPOSED`, `OBSERVED`), readiness statements, denials, failures and
 * blockers are carried exactly as the server stated them.
 *
 * Keyboard focus order (`focusOrder`) is derived from the pane order —
 * the deterministic tab path the shortcut registry's focus commands
 * target. Density profiles change only row sizing/visibility hints, never
 * which fields are presented (a dense layout may COLLAPSE a pane but the
 * conformance presentation claim stays complete — collapsed panes are
 * still "presented" behind an expansion affordance, and the registry, not
 * the density, defines presentation).
 *
 * Determinism: pure data + pure functions; no clock, no randomness, no IO.
 */

import type {
  EvidenceSummary,
  OperationResult,
} from "@aise/adapter-contract";
import type { CapabilityNegotiation } from "@aise/adapter-contract";
import type { TaskFlowBundle } from "./seam";
import { renderContractObject, type RenderedFieldLine } from "./render-registry";

/* ------------------------------------------------------------------ */
/* The layout vocabulary                                                */
/* ------------------------------------------------------------------ */

/** Density profiles of the review workspace (sizing hints only). */
export const DENSITY_PROFILES = ["comfortable", "compact", "dense"] as const;
export type DensityProfile = (typeof DENSITY_PROFILES)[number];

/** The pane kinds of the high-density review workspace. */
export const REVIEW_PANE_KINDS = [
  "project-context",
  "reality",
  "evidence",
  "boq",
  "engineering-case",
  "intervention-scenario",
  "outcome",
  "next-best-action",
  "authorization",
  "negotiation",
  "operation-result",
] as const;
export type ReviewPaneKind = (typeof REVIEW_PANE_KINDS)[number];

/** The stable pane id (the shortcut registry's focus targets). */
export type ReviewPaneId = `pane:${ReviewPaneKind}`;

/** One high-density review pane over one contract object. */
export interface ReviewPane {
  readonly paneId: ReviewPaneId;
  readonly kind: ReviewPaneKind;
  /** The contract object name the pane renders (render-registry key). */
  readonly objectName: string;
  /** The pane's headline (the dense viewport's collapsed title). */
  readonly title: string;
  /** The verbatim rendered field lines (render-registry order). */
  readonly lines: readonly RenderedFieldLine[];
  /** Honest empty-state text when the bundle holds no record. */
  readonly emptyState: string | null;
}

/** One dense evidence-table row (provenance surface). */
export interface EvidenceTableRow {
  readonly rowId: string;
  readonly kind: "evidence-item" | "evidence-gap";
  /** The evidence content id or the gap id. */
  readonly ref: string;
  /** `MISSING` / `WEAK` / … for gaps; `—` for items. */
  readonly gapKind: string | null;
  /** The verbatim description (gap) or `evidence content id` (item). */
  readonly detail: string;
}

/** The dense evidence table (items + declared gaps, provenance visible). */
export interface EvidenceTable {
  readonly rows: readonly EvidenceTableRow[];
}

/** One column of the high-density workspace. */
export interface ReviewColumn {
  readonly columnId: string;
  readonly title: string;
  readonly paneIds: readonly ReviewPaneId[];
}

/** The complete high-density review workspace description. */
export interface ReviewLayout {
  readonly density: DensityProfile;
  readonly columns: readonly ReviewColumn[];
  readonly panes: readonly ReviewPane[];
  readonly evidenceTable: EvidenceTable;
  /** The deterministic keyboard focus order (pane order). */
  readonly focusOrder: readonly ReviewPaneId[];
  /** Pane ids whose record is ABSENT in the bundle (honest empty states). */
  readonly emptyPanes: readonly ReviewPaneId[];
}

/* ------------------------------------------------------------------ */
/* The composer                                                         */
/* ------------------------------------------------------------------ */

interface PaneSpec {
  readonly kind: ReviewPaneKind;
  readonly objectName: string;
  readonly title: string;
  readonly emptyState: string;
}

const PANE_SPECS: readonly PaneSpec[] = [
  {
    kind: "project-context",
    objectName: "ProjectContext",
    title: "Project Context",
    emptyState: "No project context is served for this project.",
  },
  {
    kind: "reality",
    objectName: "RealitySummary",
    title: "Reality Readiness",
    emptyState: "No reality summary is served for this project.",
  },
  {
    kind: "evidence",
    objectName: "EvidenceSummary",
    title: "Evidence & Gaps",
    emptyState: "No evidence summary is served for this subject.",
  },
  {
    kind: "boq",
    objectName: "BOQContext",
    title: "BOQ Context",
    emptyState: "No BOQ context is served for this project.",
  },
  {
    kind: "engineering-case",
    objectName: "EngineeringCaseSummary",
    title: "Engineering Case",
    emptyState: "No engineering case summary is served for this project.",
  },
  {
    kind: "intervention-scenario",
    objectName: "InterventionScenarioSummary",
    title: "Intervention Scenario",
    emptyState: "No intervention scenario summary is served for this project.",
  },
  {
    kind: "outcome",
    objectName: "OutcomeSummary",
    title: "Outcome",
    emptyState: "No outcome summary is served for this project.",
  },
  {
    kind: "next-best-action",
    objectName: "NextBestAction",
    title: "Next Best Action",
    emptyState: "No next-best-action is served for the current task.",
  },
  {
    kind: "authorization",
    objectName: "AuthorizationContext",
    title: "Authorization",
    emptyState: "No authorization context is served for this project.",
  },
  {
    kind: "negotiation",
    objectName: "CapabilityNegotiation",
    title: "Capability Negotiation",
    emptyState: "No capability requirements are served for the current task.",
  },
  {
    kind: "operation-result",
    objectName: "OperationResult",
    title: "Operation Result",
    emptyState: "No operation result has been answered yet.",
  },
];

function paneOf(
  spec: PaneSpec,
  record: object | null,
): ReviewPane {
  return {
    paneId: `pane:${spec.kind}` as ReviewPaneId,
    kind: spec.kind,
    objectName: spec.objectName,
    title: spec.title,
    lines:
      record === null
        ? []
        : renderContractObject(spec.objectName, record),
    emptyState: record === null ? spec.emptyState : null,
  };
}

/**
 * Compose the high-density review workspace over one decoded task-flow
 * bundle (+ the negotiation for the task's requirements, when the caller
 * has negotiated them, and the latest operation result, when a task intent
 * has been answered). The three-column dense arrangement mirrors the
 * task-first reading order:
 *
 *   column 1 — CONTEXT: project, reality, evidence (the current context,
 *              known evidence, gaps);
 *   column 2 — REVIEW SURFACES: BOQ (source-of-record visible), the
 *              engineering case, the intervention scenario (epistemic
 *              seal visible) and the outcome (post-work evidence
 *              visible);
 *   column 3 — ACTION: next best action (status + blockers), the
 *              authorization grants/denials, the capability negotiation
 *              verdict and the latest server-authoritative operation
 *              result.
 */
export function denseReviewLayout(
  bundle: TaskFlowBundle,
  options?: {
    readonly negotiation?: CapabilityNegotiation | null;
    readonly operationResult?: OperationResult | null;
    readonly density?: DensityProfile;
  },
): ReviewLayout {
  const density: DensityProfile = options?.density ?? "dense";

  const records: Readonly<Record<ReviewPaneKind, object | null>> = {
    "project-context": bundle.context,
    reality: bundle.reality,
    evidence: bundle.evidence,
    boq: bundle.boq,
    "engineering-case": bundle.caseSummary,
    "intervention-scenario": bundle.scenario,
    outcome: bundle.outcome,
    "next-best-action": bundle.nextBestAction,
    authorization: bundle.authorization,
    negotiation: options?.negotiation ?? null,
    "operation-result": options?.operationResult ?? null,
  };

  const panes: ReviewPane[] = PANE_SPECS.map((spec) => paneOf(spec, records[spec.kind]));
  const emptyPanes = panes
    .filter((pane) => pane.emptyState !== null)
    .map((pane) => pane.paneId);

  const columns: readonly ReviewColumn[] = [
    {
      columnId: "column:context",
      title: "Context & Evidence",
      paneIds: ["pane:project-context", "pane:reality", "pane:evidence"],
    },
    {
      columnId: "column:review",
      title: "Review Surfaces",
      paneIds: [
        "pane:boq",
        "pane:engineering-case",
        "pane:intervention-scenario",
        "pane:outcome",
      ],
    },
    {
      columnId: "column:action",
      title: "Action & Authorization",
      paneIds: [
        "pane:next-best-action",
        "pane:authorization",
        "pane:negotiation",
        "pane:operation-result",
      ],
    },
  ];

  return {
    density,
    columns,
    panes,
    evidenceTable: evidenceTableOf(bundle.evidence),
    focusOrder: panes.map((pane) => pane.paneId),
    emptyPanes,
  };
}

/**
 * Build the dense evidence table: one row per evidence content id
 * (provenance visible — the content id IS the provenance anchor), then
 * one row per DECLARED gap (gap id, kind, verbatim description). Gaps are
 * never hidden or summarized away: `MISSING`/`WEAK` stay first-class
 * rows.
 */
export function evidenceTableOf(evidence: EvidenceSummary | null): EvidenceTable {
  if (evidence === null) {
    return { rows: [] };
  }
  const rows: EvidenceTableRow[] = evidence.evidenceContentIds.map(
    (contentId): EvidenceTableRow => ({
      rowId: `evidence:${contentId}`,
      kind: "evidence-item",
      ref: contentId,
      gapKind: null,
      detail: `evidence content id ${contentId}`,
    }),
  );
  for (const gap of evidence.gaps) {
    rows.push({
      rowId: `gap:${gap.gapId}`,
      kind: "evidence-gap",
      ref: gap.gapId,
      gapKind: gap.kind,
      detail: gap.description,
    });
  }
  return { rows };
}

/* ------------------------------------------------------------------ */
/* Lookups (pure)                                                       */
/* ------------------------------------------------------------------ */

/** The pane with the given id (null when the layout holds no such pane). */
export function paneById(layout: ReviewLayout, paneId: ReviewPaneId): ReviewPane | null {
  return layout.panes.find((pane) => pane.paneId === paneId) ?? null;
}

/** The next pane in keyboard focus order (wraps; null on unknown pane). */
export function nextFocusedPane(
  layout: ReviewLayout,
  currentPaneId: ReviewPaneId | null,
): ReviewPaneId | null {
  if (layout.focusOrder.length === 0) {
    return null;
  }
  if (currentPaneId === null) {
    return layout.focusOrder[0] ?? null;
  }
  const index = layout.focusOrder.indexOf(currentPaneId);
  if (index === -1) {
    return layout.focusOrder[0] ?? null;
  }
  const next = (index + 1) % layout.focusOrder.length;
  return layout.focusOrder[next] ?? null;
}

/**
 * The provenance spot-check lines of a layout — the specific verbatim
 * values the review workflow must keep visible for provenance: the BOQ's
 * source-of-record identity, the scenario's epistemic seal, the outcome's
 * post-work evidence ids, and the reality model version. Used by the
 * journey trace and by tests to assert provenance stays visible at every
 * density.
 */
export interface ProvenanceSpotCheck {
  readonly boqSourceOfRecord: string | null;
  readonly scenarioEpistemicState: string | null;
  readonly outcomePostWorkEvidence: readonly string[];
  readonly realityModelVersion: number | null;
}

export function provenanceSpotCheck(layout: ReviewLayout): ProvenanceSpotCheck {
  const lineOf = (paneId: ReviewPaneId, field: string): string | null => {
    const pane = paneById(layout, paneId);
    const line = pane?.lines.find((entry) => entry.field === field);
    return line !== undefined && line.text !== "absent" ? line.text : null;
  };
  const boq = paneById(layout, "pane:boq");
  const boqSourceOfRecord =
    boq !== null && boq.emptyState === null
      ? [lineOf("pane:boq", "sourceSystem"), lineOf("pane:boq", "sourceRecordRef")]
          .filter((part): part is string => part !== null)
          .join(" / ")
      : null;
  const outcome = paneById(layout, "pane:outcome");
  const outcomePostWorkEvidence =
    outcome !== null && outcome.emptyState === null
      ? (outcome.lines.find((entry) => entry.field === "postWorkEvidenceContentIds")?.text ?? "")
          .match(/[0-9a-f]{16,}/g) ?? []
      : [];
  const modelVersionLine = lineOf("pane:reality", "modelVersion");
  return {
    boqSourceOfRecord: boqSourceOfRecord === "" ? null : boqSourceOfRecord,
    scenarioEpistemicState: lineOf("pane:intervention-scenario", "epistemicState"),
    outcomePostWorkEvidence,
    realityModelVersion:
      modelVersionLine !== null && /^\d+$/.test(modelVersionLine)
        ? Number.parseInt(modelVersionLine, 10)
        : null,
  };
}
