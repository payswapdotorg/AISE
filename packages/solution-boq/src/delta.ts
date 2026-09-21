/**
 * Version-pair BOQ deltas (PROD-025) — "same solution, two versions → two
 * BOQs with correct delta lineage".
 *
 * `diffSolutionBoqs(from, to)` compares two generated BOQs of the SAME
 * solution (version 1 vs version 2, or the same version under two declared
 * snapshots) and reports per-line ADDED / CHANGED / REMOVED / UNCHANGED
 * work with the OPERATION-LEVEL LINEAGE of every change:
 *
 *  - lines are matched across the two BOQs by their SEMANTIC work-item key
 *    (section, element, activity, dimension, unit, direction, material,
 *    calculation reference) — NOT by `boqLineId`: line ids are
 *    version-pinned by construction, so they NEVER match across versions
 *    (the contract's identity discipline);
 *  - a matched pair is CHANGED when the quantity value or the contributing
 *    operation set differs; the delta carries the quantity delta and the
 *    ADDED/REMOVED contribution operation ids (the delta lineage: WHICH
 *    new solution steps modified the line);
 *  - ordering is deterministic (`to` document order, then `from`-only
 *    removed lines in `to`-parallel order).
 *
 * PURE and DETERMINISTIC. Refuses cross-solution comparisons with a typed
 * error.
 */

import { SolutionBoqError } from "./errors";
import type { SolutionBoq, SolutionBoqLine } from "./model";

/* ------------------------------------------------------------------ */
/* The semantic (cross-version-stable) work-item key                    */
/* ------------------------------------------------------------------ */

/** The version-independent semantic key of a line (the identity minus pins). */
export interface BoqLineSemanticKey {
  readonly sectionId: string;
  readonly buildingElement: string;
  readonly activity: string;
  readonly dimension: string;
  readonly unit: string;
  readonly direction: string;
  readonly material?: string;
  readonly calculationRef: string;
}

/** Extracts a line's semantic work-item key (stable across versions). */
export function boqLineSemanticKey(line: SolutionBoqLine): BoqLineSemanticKey {
  return {
    sectionId: line.sectionId,
    buildingElement: line.buildingElement,
    activity: line.activity,
    dimension: line.quantity.dimension,
    unit: line.unit,
    direction: line.direction,
    ...(line.material === undefined ? {} : { material: line.material }),
    calculationRef: line.quantity.calculationRef,
  };
}

function semanticKeyText(key: BoqLineSemanticKey): string {
  return JSON.stringify(key);
}

/* ------------------------------------------------------------------ */
/* The delta                                                            */
/* ------------------------------------------------------------------ */

/** One per-line delta entry. */
export interface SolutionBoqDeltaLine {
  readonly kind: "added" | "changed" | "removed" | "unchanged";
  readonly semanticKey: BoqLineSemanticKey;
  /** The prior line (absent for `added`). */
  readonly fromLine?: SolutionBoqLine;
  /** The successor line (absent for `removed`). */
  readonly toLine?: SolutionBoqLine;
  /** to.value − from.value (present for `changed`). */
  readonly quantityDelta?: number;
  /** Operations contributing only in `to` (the change's new lineage). */
  readonly contributionsAdded?: readonly string[];
  /** Operations contributing only in `from` (dropped lineage). */
  readonly contributionsRemoved?: readonly string[];
}

/** The version-pair delta of two generated BOQs of one solution. */
export interface SolutionBoqDelta {
  readonly solutionId: string;
  readonly fromBoqId: string;
  readonly toBoqId: string;
  readonly fromVersionNumber: number;
  readonly toVersionNumber: number;
  readonly fromSnapshotRef: string;
  readonly toSnapshotRef: string;
  readonly lines: readonly SolutionBoqDeltaLine[];
  readonly summary: {
    readonly added: number;
    readonly changed: number;
    readonly removed: number;
    readonly unchanged: number;
  };
}

/**
 * Compares two generated BOQs of the SAME solution and reports the
 * per-line work delta with operation-level lineage. Deterministic;
 * `solution_mismatch` when the BOQs pin different solutions.
 */
export function diffSolutionBoqs(from: SolutionBoq, to: SolutionBoq): SolutionBoqDelta {
  if (from.solutionId !== to.solutionId) {
    throw new SolutionBoqError(
      "solution_mismatch",
      `cannot diff BOQs of different solutions: '${from.solutionId}' ` +
        `(version ${from.versionNumber}) vs '${to.solutionId}' ` +
        `(version ${to.versionNumber}) — a version-pair delta is within one ` +
        `solution's lineage`,
    );
  }
  const fromByKey = new Map(from.lines.map((line) => [semanticKeyText(boqLineSemanticKey(line)), line] as const));
  const toByKey = new Map(to.lines.map((line) => [semanticKeyText(boqLineSemanticKey(line)), line] as const));

  const lines: SolutionBoqDeltaLine[] = [];
  for (const toLine of to.lines) {
    const key = boqLineSemanticKey(toLine);
    const fromLine = fromByKey.get(semanticKeyText(key));
    if (fromLine === undefined) {
      lines.push({ kind: "added", semanticKey: key, toLine });
      continue;
    }
    const toOps = new Set(toLine.contributions.map((c) => c.operationId));
    const fromOps = new Set(fromLine.contributions.map((c) => c.operationId));
    const contributionsAdded = toLine.contributions
      .map((c) => c.operationId)
      .filter((id) => !fromOps.has(id));
    const contributionsRemoved = fromLine.contributions
      .map((c) => c.operationId)
      .filter((id) => !toOps.has(id));
    const valueChanged = fromLine.quantity.value !== toLine.quantity.value;
    const lineageChanged = contributionsAdded.length > 0 || contributionsRemoved.length > 0;
    if (!valueChanged && !lineageChanged) {
      lines.push({ kind: "unchanged", semanticKey: key, fromLine, toLine });
      continue;
    }
    lines.push({
      kind: "changed",
      semanticKey: key,
      fromLine,
      toLine,
      ...(valueChanged
        ? {
            quantityDelta: Number(
              (toLine.quantity.value - fromLine.quantity.value).toFixed(10),
            ),
          }
        : {}),
      ...(lineageChanged
        ? {
            contributionsAdded,
            contributionsRemoved,
          }
        : {}),
    });
  }
  for (const fromLine of from.lines) {
    const key = boqLineSemanticKey(fromLine);
    if (!toByKey.has(semanticKeyText(key))) {
      lines.push({ kind: "removed", semanticKey: key, fromLine });
    }
  }

  return {
    solutionId: from.solutionId,
    fromBoqId: from.boqId,
    toBoqId: to.boqId,
    fromVersionNumber: from.versionNumber,
    toVersionNumber: to.versionNumber,
    fromSnapshotRef: from.validationSnapshotRef,
    toSnapshotRef: to.validationSnapshotRef,
    lines,
    summary: {
      added: lines.filter((line) => line.kind === "added").length,
      changed: lines.filter((line) => line.kind === "changed").length,
      removed: lines.filter((line) => line.kind === "removed").length,
      unchanged: lines.filter((line) => line.kind === "unchanged").length,
    },
  };
}
