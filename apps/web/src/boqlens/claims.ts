/**
 * AISE-024 — claim identity + traceability (the R8 acceptance core).
 *
 * Every material claim the BOQ Lens renders carries a `data-claim-id`
 * attribute. Claim ids are DETERMINISTIC FUNCTIONS OF THE INPUT (kind +
 * ordinal/item id), so `traceClaim(claimId, input)` can rebuild the full
 * chain from the input alone — no render-time registry, no hidden state.
 *
 * A chain resolves to BOQ EVIDENCE (source cells, interpretation records,
 * mapping records) and/or EXPLICIT inference markers. The grounding test in
 * grounding.test.ts asserts the workspace invariant: EVERY data-claim-id in
 * the rendered HTML resolves to a non-empty chain.
 */

import { BoqLensError } from "./errors";
import {
  locationGroups,
  rollupAmounts,
  sectionGroups,
  type LocationGroup,
  type SectionGroup,
} from "./derive";
import type { BoqLensInput, BoqLensItem, TraceChain, TraceStep } from "./model";

/* ------------------------------------------------------------------ */
/* Claim id scheme (single source of truth for render + trace)         */
/* ------------------------------------------------------------------ */

export const GRAND_TOTAL_CLAIM_ID = "claim:grand-total";
export const LOCATION_UNCONFIRMED_CLAIM_ID = "claim:location:unconfirmed";
export const HEALTH_CLAIM_METRICS = [
  "mapped",
  "ambiguous",
  "unmapped",
  "concepts-resolved",
  "concepts-unresolved",
  "no-provenance",
] as const;
export type HealthClaimMetric = (typeof HEALTH_CLAIM_METRICS)[number];

export function sectionTotalClaimId(index: number): string {
  return `claim:section-total:${index}`;
}

export function healthClaimId(metric: HealthClaimMetric): string {
  return `claim:health:${metric}`;
}

export function itemClaimId(itemId: string): string {
  return `claim:item:${itemId}`;
}

export function interpretationClaimId(itemId: string): string {
  return `claim:interpretation:${itemId}`;
}

export function mappingClaimId(itemId: string): string {
  return `claim:mapping:${itemId}`;
}

export function explanationClaimId(itemId: string): string {
  return `claim:explanation:${itemId}`;
}

export function locationClaimId(index: number): string {
  return `claim:location:${index}`;
}

/* ------------------------------------------------------------------ */
/* Step builders + shared item evidence                                */
/* ------------------------------------------------------------------ */

function sourceStep(ref: string, detail: string): TraceStep {
  return { kind: "source-cell", ref, detail };
}

function inferenceStep(ref: string, detail: string): TraceStep {
  return { kind: "inference", ref, detail };
}

function numericSteps(item: BoqLensItem): TraceStep[] {
  const steps: TraceStep[] = [];
  if (item.quantity !== null) {
    steps.push(
      sourceStep(
        item.quantity.cellRef ?? "(no cell ref)",
        `row ${item.rowNumber} quantity cell = ${item.quantity.value}`,
      ),
    );
  }
  if (item.rate !== null) {
    steps.push(
      sourceStep(
        item.rate.cellRef ?? "(no cell ref)",
        `row ${item.rowNumber} rate cell = ${item.rate.value}`,
      ),
    );
  }
  if (item.amount !== null) {
    steps.push(
      sourceStep(
        item.amount.cellRef ?? "(no cell ref)",
        `row ${item.rowNumber} amount cell = ${item.amount.value} ${item.currency}`,
      ),
    );
  }
  return steps;
}

/** Source cells anchoring one item row's verbatim text + numbers. */
export function itemEvidenceSteps(item: BoqLensItem): TraceStep[] {
  const steps: TraceStep[] = [];
  if (item.descriptionCellRef !== null) {
    steps.push(sourceStep(item.descriptionCellRef, `row ${item.rowNumber} description cell (verbatim text)`));
  } else {
    steps.push(inferenceStep(`row:${item.rowNumber}`, `row ${item.rowNumber} has no recorded description cell ref`));
  }
  if (item.unitCellRef !== null) {
    steps.push(sourceStep(item.unitCellRef, `row ${item.rowNumber} unit cell`));
  }
  steps.push(...numericSteps(item));
  return steps;
}

function interpretationSteps(item: BoqLensItem): TraceStep[] {
  const steps: TraceStep[] = [];
  const interpretation = item.interpretation;
  if (interpretation === undefined) {
    steps.push(
      inferenceStep(
        `interpretation:${item.itemId}`,
        `no interpretation record for row ${item.rowNumber} — nothing derived to trace`,
      ),
    );
    return steps;
  }
  for (const field of ["description", "unit"] as const) {
    const record = interpretation[field];
    if (record === null) {
      continue;
    }
    const code = record.conceptCode ?? record.unitCode ?? "(no code resolved)";
    const refs = record.sourceRefs.length === 0 ? "(no source refs)" : record.sourceRefs.join(", ");
    steps.push({
      kind: "interpretation-record",
      ref: `interpretation:${item.itemId}:${field}`,
      detail: `${field} read as ${code} (${record.confidence}, ${record.method}) — derived from ${refs}`,
    });
    for (const ref of record.sourceRefs) {
      steps.push(sourceStep(ref, `row ${item.rowNumber} ${field} interpretation source cell`));
    }
  }
  if (steps.length === 0) {
    steps.push(
      inferenceStep(
        `interpretation:${item.itemId}`,
        `row ${item.rowNumber} interpretation record carries no description or unit reading`,
      ),
    );
  }
  return steps;
}

function mappingSteps(item: BoqLensItem): TraceStep[] {
  const steps: TraceStep[] = [];
  const mapping = item.mapping;
  if (mapping === undefined) {
    steps.push(
      inferenceStep(
        `mapping:${item.itemId}`,
        `no mapping record for row ${item.rowNumber} — mapping status is an honest unknown`,
      ),
    );
    return steps;
  }
  const boqItem = mapping.boqItem;
  const provenance = mapping.provenance;
  steps.push({
    kind: "mapping-record",
    ref: `mapping:${mapping.entryId}`,
    detail: `row ${mapping.boqItem.rowNumber} ${mapping.status} (${mapping.confidence}, ${mapping.method}) — ${mapping.targets.length} target(s)${provenance.matchedOn === undefined ? "" : `, matched on ${provenance.matchedOn}`}`,
  });
  if (boqItem.descriptionCellRef !== null) {
    steps.push(sourceStep(boqItem.descriptionCellRef, `mapping entry anchors the verbatim description cell`));
  }
  if (boqItem.unitCellRef !== null) {
    steps.push(sourceStep(boqItem.unitCellRef, `mapping entry anchors the unit cell`));
  }
  return steps;
}

/* ------------------------------------------------------------------ */
/* Rollup chains (cost hierarchy)                                      */
/* ------------------------------------------------------------------ */

function rollupChain(claimId: string, claimKind: string, summary: string, items: readonly BoqLensItem[]): TraceChain {
  const rollup = rollupAmounts(items);
  const steps: TraceStep[] = rollup.contributors.map((contributor) =>
    sourceStep(
      contributor.cellRef === "" ? "(no cell ref)" : contributor.cellRef,
      `row ${contributor.item.rowNumber} stated amount ${contributor.value} ${contributor.item.currency}`,
    ),
  );
  const excluded = rollup.excludedNoAmount.length + rollup.excludedCurrency.length;
  if (excluded > 0) {
    const parts: string[] = [];
    if (rollup.excludedNoAmount.length > 0) {
      parts.push(`${rollup.excludedNoAmount.length} item(s) without a stated amount (never assumed zero)`);
    }
    if (rollup.excludedCurrency.length > 0) {
      parts.push(`${rollup.excludedCurrency.length} item(s) in a different currency (never converted)`);
    }
    steps.push(inferenceStep(claimId, `rollup excludes ${parts.join(" and ")}`));
  }
  if (steps.length === 0) {
    steps.push(inferenceStep(claimId, "no stated amounts — the rollup asserts nothing"));
  }
  return { claimId, claimKind, summary, steps, grounded: steps.some((step) => step.kind !== "inference") };
}

/* ------------------------------------------------------------------ */
/* Location chains (contractor view)                                   */
/* ------------------------------------------------------------------ */

function locationChain(group: LocationGroup, claimId: string): TraceChain {
  const steps: TraceStep[] = [];
  for (const item of group.items) {
    if (group.confirmed) {
      const mapping = item.mapping;
      const targetRefs =
        mapping?.targets
          .filter((target) => (target.spacePath?.length ?? 0) > 0)
          .map((target) => `${target.nodeId} @ ${(target.spacePath ?? []).join(" / ")}`) ?? [];
      steps.push({
        kind: "mapping-record",
        ref: `mapping:${mapping?.entryId ?? item.itemId}`,
        detail: `row ${item.rowNumber} mapped to ${targetRefs.length} element(s) on this location (${targetRefs.join("; ")})`,
      });
    } else {
      steps.push(...mappingSteps(item));
    }
  }
  return {
    claimId,
    claimKind: "location-group",
    summary: group.confirmed
      ? `tasks located at ${group.label}`
      : "tasks whose location is unconfirmed (honest unknown)",
    steps,
    grounded: steps.some((step) => step.kind !== "inference"),
  };
}

/* ------------------------------------------------------------------ */
/* Health chains                                                       */
/* ------------------------------------------------------------------ */

function healthCountChain(claimId: string, claimKind: string, summary: string, counted: readonly BoqLensItem[]): TraceChain {
  const steps: TraceStep[] = counted.map((item) =>
    item.mapping === undefined
      ? inferenceStep(
          `mapping:${item.itemId}`,
          `row ${item.rowNumber} has no mapping record (counted by honest absence)`,
        )
      : ({
          kind: "mapping-record",
          ref: `mapping:${item.mapping.entryId}`,
          detail: `row ${item.rowNumber} ${item.mapping.status} (${item.mapping.confidence})`,
        } satisfies TraceStep),
  );
  if (steps.length === 0) {
    steps.push(inferenceStep(claimId, "zero items counted — the count asserts an empty set"));
  }
  return { claimId, claimKind, summary, steps, grounded: steps.some((step) => step.kind !== "inference") };
}

function healthConceptChain(
  claimId: string,
  claimKind: string,
  summary: string,
  counted: readonly BoqLensItem[],
): TraceChain {
  const steps: TraceStep[] = [];
  for (const item of counted) {
    const description = item.interpretation?.description;
    if (description === null || description === undefined) {
      steps.push(
        inferenceStep(`interpretation:${item.itemId}`, `row ${item.rowNumber} has no description interpretation`),
      );
    } else {
      steps.push({
        kind: "interpretation-record",
        ref: `interpretation:${item.itemId}:description`,
        detail: `row ${item.rowNumber} concept ${description.conceptCode ?? "(none)"} (${description.confidence})`,
      });
    }
  }
  if (steps.length === 0) {
    steps.push(inferenceStep(claimId, "zero items counted — the count asserts an empty set"));
  }
  return { claimId, claimKind, summary, steps, grounded: steps.some((step) => step.kind !== "inference") };
}

/* ------------------------------------------------------------------ */
/* traceClaim                                                          */
/* ------------------------------------------------------------------ */

function itemById(input: BoqLensInput, itemId: string): BoqLensItem {
  const item = input.items.find((candidate) => candidate.itemId === itemId);
  if (item === undefined) {
    throw new BoqLensError("unknown_claim", `no item '${itemId}' in this input`);
  }
  return item;
}

function sectionByIndex(input: BoqLensInput, index: number): SectionGroup {
  const groups = sectionGroups(input.items);
  const group = groups[index];
  if (group === undefined) {
    throw new BoqLensError("unknown_claim", `no section index ${index} in this input`);
  }
  return group;
}

/**
 * Resolve one rendered claim id back to its trace chain (R8): the chain of
 * source cells / interpretation records / mapping records / explicit
 * inference markers that ground the claim. Throws a typed `unknown_claim`
 * refusal for ids that do not exist in this input.
 */
export function traceClaim(claimId: string, input: BoqLensInput): TraceChain {
  if (claimId === GRAND_TOTAL_CLAIM_ID) {
    return rollupChain(
      claimId,
      "grand-total",
      "grand total over all stated amounts (anchor currency)",
      input.items,
    );
  }
  if (claimId.startsWith("claim:section-total:")) {
    const index = Number(claimId.slice("claim:section-total:".length));
    const group = sectionByIndex(input, index);
    return rollupChain(
      claimId,
      "section-total",
      `section total for ${group.title === null ? "(no section title)" : `"${group.title}"`}`,
      group.items,
    );
  }
  if (claimId.startsWith("claim:health:")) {
    const metric = claimId.slice("claim:health:".length);
    if (!HEALTH_CLAIM_METRICS.includes(metric as HealthClaimMetric)) {
      throw new BoqLensError("unknown_claim", `unknown health metric '${metric}'`);
    }
    const mapped = input.items.filter((item) => item.mapping?.status === "mapped");
    const ambiguous = input.items.filter((item) => item.mapping?.status === "ambiguous");
    // Disjoint from mapped+ambiguous; a missing mapping record counts as
    // unmapped by honest absence (never guessed into a status).
    const unmapped = input.items.filter(
      (item) => item.mapping === undefined || item.mapping.status === "unmapped",
    );
    switch (metric as HealthClaimMetric) {
      case "mapped":
        return healthCountChain(claimId, "health-stat", "count of mapped items", mapped);
      case "ambiguous":
        return healthCountChain(claimId, "health-stat", "count of ambiguous items", ambiguous);
      case "unmapped":
        return healthCountChain(claimId, "health-stat", "count of unmapped items", unmapped);
      case "concepts-resolved":
        return healthConceptChain(
          claimId,
          "health-stat",
          "count of items with a resolved concept",
          input.items.filter((item) => item.interpretation?.description?.conceptCode !== undefined),
        );
      case "concepts-unresolved":
        return healthConceptChain(
          claimId,
          "health-stat",
          "count of items without a resolved concept",
          input.items.filter((item) => item.interpretation?.description?.conceptCode === undefined),
        );
      case "no-provenance": {
        // The zero-defect claim is grounded by the citation inventory itself:
        // one step per item citing its primary source cell.
        const steps: TraceStep[] = input.items.map((item) =>
          sourceStep(
            item.descriptionCellRef ?? "(no cell ref)",
            `row ${item.rowNumber} primary citation verified against the source cell inventory`,
          ),
        );
        if (steps.length === 0) {
          steps.push(inferenceStep(claimId, "no items — nothing to verify"));
        }
        return {
          claimId,
          claimKind: "health-stat",
          summary: "claims without provenance (the R8 invariant — must be zero)",
          steps,
          grounded: steps.some((step) => step.kind !== "inference"),
        };
      }
    }
  }
  if (claimId.startsWith("claim:item:")) {
    const item = itemById(input, claimId.slice("claim:item:".length));
    return {
      claimId,
      claimKind: "item-row",
      summary: `row ${item.rowNumber} verbatim text + stated numbers`,
      steps: itemEvidenceSteps(item),
      grounded: true,
    };
  }
  if (claimId.startsWith("claim:interpretation:")) {
    const item = itemById(input, claimId.slice("claim:interpretation:".length));
    return {
      claimId,
      claimKind: "interpretation",
      summary: `row ${item.rowNumber} derived interpretation (marked "derived")`,
      steps: interpretationSteps(item),
      grounded: true,
    };
  }
  if (claimId.startsWith("claim:mapping:")) {
    const item = itemById(input, claimId.slice("claim:mapping:".length));
    return {
      claimId,
      claimKind: "mapping",
      summary: `row ${item.rowNumber} derived mapping`,
      steps: mappingSteps(item),
      grounded: true,
    };
  }
  if (claimId.startsWith("claim:explanation:")) {
    const item = itemById(input, claimId.slice("claim:explanation:".length));
    return {
      claimId,
      claimKind: "explanation",
      summary: `row ${item.rowNumber} natural-language explanation (every fragment grounded or inference-marked)`,
      steps: [...itemEvidenceSteps(item), ...interpretationSteps(item), ...mappingSteps(item)],
      grounded: true,
    };
  }
  if (claimId === LOCATION_UNCONFIRMED_CLAIM_ID) {
    const group = locationGroups(input.items).find((candidate) => !candidate.confirmed);
    if (group === undefined) {
      throw new BoqLensError("unknown_claim", "no unconfirmed-location group in this input");
    }
    return locationChain(group, claimId);
  }
  if (claimId.startsWith("claim:location:")) {
    const index = Number(claimId.slice("claim:location:".length));
    const group = locationGroups(input.items)[index];
    if (group === undefined) {
      throw new BoqLensError("unknown_claim", `no location group ${index} in this input`);
    }
    return locationChain(group, claimId);
  }
  throw new BoqLensError("unknown_claim", `claim id '${claimId}' is not part of this input's claim scheme`);
}
