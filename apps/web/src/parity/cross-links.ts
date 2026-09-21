/**
 * PROD-018 — the COMPOSITION CROSS-LINK MODEL (pure logic).
 *
 * The competitive-parity composition's navigation backbone: capture →
 * issue → BOQ navigation ("an issue opens its evidence and its affected
 * BOQ lines; a BOQ line opens its evidence and issues; a capture opens
 * the issues+quantities derived from it") as PURE JOINS over RECORDED
 * references only:
 *
 *  - a capture's issues come from the evidence record's OWN
 *    `relatedCaseIds`;
 *  - an issue's evidence comes from the case record's OWN `evidenceIds`;
 *  - a capture's derived quantities come from the BOQ import's OWN
 *    `sourceEvidenceId` (the document capture the lens rows derive from);
 *  - a BOQ line's spatial context comes from its mapping record's OWN
 *    targets (nodeId + spacePath + nodeVersionId);
 *  - a BOQ line's captures come from the import's source evidence plus
 *    the workspace's evidence entries linked to the target nodes;
 *  - a reality node's captures come from the node's OWN `evidenceIds`;
 *  - an issue's AFFECTED BOQ lines are the honest join: the BOQ rows whose
 *    mapping targets include a reality node this case's evidence
 *    supports — when the records support no such row, that is the explicit
 *    `unresolved` state with the recorded reason (never an invented link,
 *    never a silent empty).
 *
 * NO SECOND NAVIGATION MODEL: every resolvable target is a real app route
 * (`formatRoute` — the app's one router). Unresolvable targets carry the
 * honest reason verbatim. Determinism: pure functions; no clock, no
 * randomness, no IO, no React.
 */

import type {
  BoqPaneView,
  CasePaneView,
  EvidencePaneView,
  RealityPaneView,
} from "../shell";
import type { BoqLensInput, BoqLensItem } from "../boqlens";
import type { WorkspaceInput } from "../workspace";
import { formatRoute } from "../app/router";
import { plural, shortId } from "../app/format";

/* ------------------------------------------------------------------ */
/* Link shapes                                                          */
/* ------------------------------------------------------------------ */

/** The cross-link kinds the composition renders (the parity journeys). */
export type CrossLinkKind =
  | "capture-to-issue"
  | "issue-to-capture"
  | "capture-to-quantity"
  | "boq-line-to-spatial"
  | "boq-line-to-capture"
  | "boq-line-to-issue"
  | "reality-node-to-capture";

/** A link that resolves to a real app route. */
export interface CrossLinkRouteTarget {
  readonly kind: "route";
  readonly href: string;
  readonly label: string;
}

/**
 * A link the records cannot resolve: the RECORDED reference exists but no
 * record answers it here (e.g. a mapping target node absent from the
 * project's pinned model, or a case whose evidence supports no mapped BOQ
 * row). The reason is stated — never a guess, never a hidden gap.
 */
export interface CrossLinkUnresolvedTarget {
  readonly kind: "unresolved";
  readonly label: string;
  readonly reason: string;
}

export type CrossLinkTarget = CrossLinkRouteTarget | CrossLinkUnresolvedTarget;

/** One composed cross-link (from an entity to a resolvable-or-honest target). */
export interface CrossLink {
  readonly kind: CrossLinkKind;
  /** The source entity's stable id (evidence/case/BOQ-row/node id). */
  readonly fromId: string;
  /** The source entity's one-line label. */
  readonly fromLabel: string;
  readonly target: CrossLinkTarget;
  /** The RECORDED reference the join is grounded in (never interpretation). */
  readonly basis: string;
}

/* ------------------------------------------------------------------ */
/* Route helpers (the app's one router — no second scheme)              */
/* ------------------------------------------------------------------ */

function caseRoute(projectId: string): string {
  return formatRoute({ name: "case", projectId });
}

function sitetwinRoute(projectId: string): string {
  return formatRoute({ name: "sitetwin", projectId });
}

function boqLensRoute(projectId: string): string {
  return formatRoute({ name: "boq-lens", projectId });
}

/* ------------------------------------------------------------------ */
/* capture → issues / quantities                                        */
/* ------------------------------------------------------------------ */

/**
 * The cross-links OF ONE CAPTURE: the issues the evidence record relates
 * (`relatedCaseIds`, verbatim) and the quantities derived from it (when
 * this capture is the BOQ import's source document capture — the lens rows
 * derive from those source bytes).
 */
export function captureCrossLinks(
  projectId: string,
  capture: EvidencePaneView,
  caseView: CasePaneView | null,
  boqImport: BoqPaneView | null,
  lens: BoqLensInput | null,
): readonly CrossLink[] {
  const links: CrossLink[] = [];
  for (const related of capture.relatedCaseIds) {
    const recorded = caseView !== null && caseView.caseId === related.value;
    links.push({
      kind: "capture-to-issue",
      fromId: capture.evidenceId,
      fromLabel: `capture ${shortId(capture.evidenceId)} (${capture.acquisitionMethod.value})`,
      target: recorded
        ? {
            kind: "route",
            href: caseRoute(projectId),
            label: `case ${related.value}`,
          }
        : {
            kind: "unresolved",
            label: `case ${related.value}`,
            reason:
              "the evidence record names this case, but no case record for it is held on this project in this build — the reference stays visible, never a guess",
          },
      basis: `the evidence record's relatedCaseIds carries ${related.value} (recorded reference)`,
    });
  }
  const isBoqSource =
    boqImport !== null &&
    boqImport.sourceEvidenceId !== null &&
    boqImport.sourceEvidenceId.value === capture.evidenceId;
  if (isBoqSource && boqImport !== null) {
    const rows = lens?.items ?? [];
    links.push({
      kind: "capture-to-quantity",
      fromId: capture.evidenceId,
      fromLabel: `capture ${shortId(capture.evidenceId)} (document region)`,
      target:
        rows.length === 0
          ? {
              kind: "unresolved",
              label: `import ${boqImport.importId}`,
              reason:
                "this capture is the import's recorded source, but the lens input carries no rows for it yet",
            }
          : {
              kind: "route",
              href: boqLensRoute(projectId),
              label: `${plural(rows.length, "BOQ row")} derived from this capture`,
            },
      basis: `the BOQ import ${boqImport.importId} records this capture as its source evidence (sourceEvidenceId)`,
    });
  }
  return links;
}

/* ------------------------------------------------------------------ */
/* issue → evidence / affected BOQ lines                                */
/* ------------------------------------------------------------------ */

/**
 * The cross-links OF ONE ISSUE (the engineering case): its evidence (the
 * case record's OWN evidenceIds — links into the SiteTwin evidence
 * records) and its AFFECTED BOQ lines — the honest join through the
 * reality nodes the case's evidence supports: a BOQ row is affected when
 * its mapping targets include one of those nodes. When no row qualifies,
 * that is the explicit unresolved state with the recorded reason.
 */
export function issueCrossLinks(
  projectId: string,
  caseView: CasePaneView,
  evidence: readonly EvidencePaneView[],
  reality: RealityPaneView | null,
  lens: BoqLensInput | null,
): readonly CrossLink[] {
  const links: CrossLink[] = [];
  const heldEvidence = new Set(evidence.map((record) => record.evidenceId));
  for (const evidenceId of caseView.evidenceIds) {
    links.push({
      kind: "issue-to-capture",
      fromId: caseView.caseId,
      fromLabel: `case ${caseView.caseId} — ${caseView.title.value}`,
      target: heldEvidence.has(evidenceId.value)
        ? {
            kind: "route",
            href: sitetwinRoute(projectId),
            label: `capture ${shortId(evidenceId.value)}`,
          }
        : {
            kind: "unresolved",
            label: `capture ${shortId(evidenceId.value)}`,
            reason:
              "the case record names this evidence, but no evidence record for it is held on this project in this build",
          },
      basis: `the case record's evidenceIds carries ${evidenceId.value} (recorded reference)`,
    });
  }

  // The affected-BOQ-lines join: case evidence → reality nodes carrying
  // that evidence → BOQ rows whose mapping targets include such a node.
  const caseEvidence = new Set(caseView.evidenceIds.map((entry) => entry.value));
  const supportedNodes: string[] = [];
  for (const node of reality?.nodes ?? []) {
    if (node.evidenceIds.some((entry) => caseEvidence.has(entry.value))) {
      supportedNodes.push(node.nodeId);
    }
  }
  const affected =
    lens?.items.filter((item) => {
      const targets = item.mapping?.targets ?? [];
      return targets.some((target) => supportedNodes.includes(target.nodeId));
    }) ?? [];
  if (affected.length > 0) {
    for (const item of affected) {
      links.push({
        kind: "boq-line-to-issue",
        fromId: caseView.caseId,
        fromLabel: `case ${caseView.caseId}`,
        target: {
          kind: "route",
          href: boqLensRoute(projectId),
          label: `BOQ row ${item.sectionTitle ?? ""}!${String(item.rowNumber)}`,
        },
        basis: "the row's mapping targets include a reality node this case's evidence supports",
      });
    }
  } else {
    links.push({
      kind: "boq-line-to-issue",
      fromId: caseView.caseId,
      fromLabel: `case ${caseView.caseId}`,
      target: {
        kind: "unresolved",
        label: "affected BOQ lines",
        reason:
          reality === null
            ? "no reality snapshot is recorded for this project, so the case-evidence → node → mapping join has no substrate yet"
            : supportedNodes.length === 0
              ? "no reality node on this snapshot is supported by this case's evidence — the mapping records are the join authority and none qualifies"
              : `the recorded mappings target other nodes (${supportedNodes.join(", ")} are the nodes this case's evidence supports) — no BOQ row maps to them yet; the BOQ Lens states the full mapping coverage`,
      },
      basis: "the recorded mapping entries are the only case→quantity join (never an interpretation)",
    });
  }
  return links;
}

/* ------------------------------------------------------------------ */
/* reality node → captures                                              */
/* ------------------------------------------------------------------ */

/** One reality node's captures (the node's OWN evidenceIds, verbatim). */
export function realityNodeCrossLinks(
  projectId: string,
  node: RealityPaneView["nodes"][number],
  evidence: readonly EvidencePaneView[],
): readonly CrossLink[] {
  const heldEvidence = new Set(evidence.map((record) => record.evidenceId));
  return node.evidenceIds.map((entry) => ({
    kind: "reality-node-to-capture" as const,
    fromId: node.nodeId,
    fromLabel: `reality node ${node.nodeId} (${node.kind})`,
    target: heldEvidence.has(entry.value)
      ? {
          kind: "route" as const,
          href: sitetwinRoute(projectId),
          label: `capture ${shortId(entry.value)}`,
        }
      : {
          kind: "unresolved" as const,
          label: `capture ${shortId(entry.value)}`,
          reason:
            "the reality node names this evidence, but no evidence record for it is held on this project in this build",
        },
    basis: `the reality node's evidenceIds carries ${entry.value} (recorded reference)`,
  }));
}

/* ------------------------------------------------------------------ */
/* BOQ line → spatial context / captures / issues (the action bridges)  */
/* ------------------------------------------------------------------ */

/**
 * The cross-links OF ONE BOQ QUANTITY LINE (the BOQ Lens action bridges):
 *
 *  - SPATIAL CONTEXT: the mapping record's targets (nodeId + spacePath),
 *    resolved against the project's pinned projection workspace when one
 *    is held — an absent node is the explicit unresolved state;
 *  - CAPTURES: the import's source document capture plus the workspace
 *    evidence entries linked to the target nodes (the evidence grounding
 *    the geometry behind the quantity);
 *  - ISSUES: the engineering cases whose recorded evidence is linked to a
 *    node this row maps to — the honest join (see {@link issueCrossLinks});
 *    when the records support none, that renders as the recorded reason,
 *    never a fabricated link.
 */
export function boqLineCrossLinks(
  projectId: string,
  item: BoqLensItem,
  boqImport: BoqPaneView | null,
  workspace: WorkspaceInput | null,
  caseViews: readonly CasePaneView[],
): readonly CrossLink[] {
  const links: CrossLink[] = [];
  const mapping = item.mapping ?? null;

  // Spatial context: each mapping target, resolved in the pinned workspace.
  for (const target of mapping?.targets ?? []) {
    const resolved =
      workspace?.graphSnapshot.nodes.some((node) => node.nodeId === target.nodeId) ?? false;
    const space =
      target.spacePath === undefined || target.spacePath.length === 0
        ? ""
        : ` — ${target.spacePath.join(" / ")}`;
    links.push({
      kind: "boq-line-to-spatial",
      fromId: item.itemId,
      fromLabel: `BOQ row ${item.sectionTitle ?? ""}!${String(item.rowNumber)}`,
      target: resolved
        ? {
            kind: "route",
            href: sitetwinRoute(projectId),
            label: `plan node ${target.nodeId}${space} (model ${target.nodeVersionId ?? "—"})`,
          }
        : {
            kind: "unresolved",
            label: `node ${target.nodeId}${space}`,
            reason:
              workspace === null
                ? "no pinned projection workspace is held for this project — the mapping target stays a recorded reference, not a navigable node"
                : "the pinned workspace carries no node with this id — the mapping target stays a recorded reference, not a navigable node",
          },
      basis: `the mapping entry ${mapping?.entryId ?? "(none)"} targets ${target.nodeId} (recorded mapping record)`,
    });
  }
  if ((mapping?.targets ?? []).length === 0) {
    const reason =
      mapping?.reason ??
      "no mapping record targets this row — the row stays unmapped (a recorded state, not an error)";
    links.push({
      kind: "boq-line-to-spatial",
      fromId: item.itemId,
      fromLabel: `BOQ row ${item.sectionTitle ?? ""}!${String(item.rowNumber)}`,
      target: {
        kind: "unresolved",
        label: "spatial context",
        reason,
      },
      basis: "the mapping record's own state (unmapped/ambiguous rows state their recorded reason)",
    });
  }

  // Captures: the import's source document capture.
  if (boqImport !== null && boqImport.sourceEvidenceId !== null) {
    links.push({
      kind: "boq-line-to-capture",
      fromId: item.itemId,
      fromLabel: `BOQ row ${item.sectionTitle ?? ""}!${String(item.rowNumber)}`,
      target: {
        kind: "route",
        href: sitetwinRoute(projectId),
        label: `source document capture ${shortId(boqImport.sourceEvidenceId.value)}`,
      },
      basis: `the BOQ import ${boqImport.importId} records its source evidence (sourceEvidenceId) — every row, including this one, derives from those source bytes`,
    });
  }

  // Captures: the workspace evidence entries linked to the target nodes.
  for (const entry of workspace?.evidence ?? []) {
    const linked = (mapping?.targets ?? []).some((target) =>
      entry.linkedNodeIds.includes(target.nodeId),
    );
    if (!linked) {
      continue;
    }
    links.push({
      kind: "boq-line-to-capture",
      fromId: item.itemId,
      fromLabel: `BOQ row ${item.sectionTitle ?? ""}!${String(item.rowNumber)}`,
      target: {
        kind: "route",
        href: sitetwinRoute(projectId),
        label: `geometry capture ${entry.evidenceId} (${entry.method})${entry.invalidated === true ? " — invalidated" : ""}`,
      },
      basis: `the pinned workspace's evidence entry ${entry.evidenceId} is linked to a node this row maps to (recorded linkedNodeIds)`,
    });
  }

  // Issues: the honest case join (recorded evidence references only).
  const targetNodeIds = new Set((mapping?.targets ?? []).map((target) => target.nodeId));
  const relatedCases = caseViews.filter((caseView) =>
    caseView.evidenceIds.some((evidenceId) =>
      workspace?.evidence.some(
        (entry) =>
          entry.evidenceId === evidenceId.value &&
          entry.linkedNodeIds.some((id) => targetNodeIds.has(id)),
      ),
    ),
  );
  if (relatedCases.length > 0) {
    for (const caseView of relatedCases) {
      links.push({
        kind: "boq-line-to-issue",
        fromId: item.itemId,
        fromLabel: `BOQ row ${item.sectionTitle ?? ""}!${String(item.rowNumber)}`,
        target: {
          kind: "route",
          href: caseRoute(projectId),
          label: `case ${caseView.caseId}`,
        },
        basis: "the case's recorded evidence is linked to a node this row maps to",
      });
    }
  } else {
    links.push({
      kind: "boq-line-to-issue",
      fromId: item.itemId,
      fromLabel: `BOQ row ${item.sectionTitle ?? ""}!${String(item.rowNumber)}`,
      target: {
        kind: "unresolved",
        label: "issues on this row",
        reason:
          "no engineering case's recorded evidence is linked to a node this row maps to — issues are never inferred from quantities; open the Engineering Case surface for the project's recorded cases",
      },
      basis: "issues join only through recorded case evidence (never an interpretation)",
    });
  }
  return links;
}
