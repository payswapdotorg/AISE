/**
 * `@aise/world-layer1-experience` — the EVIDENCE family contract
 * (WORLD-P1, `src/evidence/`).
 *
 * Every lane output binds to the EVIDENCE ENVELOPE: the existing
 * shared-contracts seam types (`Evidence`, `Derivation`,
 * `ProvenanceLink` — imported, never redefined). Capture-derived
 * facts enter as INFERRED with their provenance chain; the "what is
 * actually here?" and "what changed?" answers are TYPED EVIDENCE-
 * BACKED QUERIES — never bare substrate reads, never fabricated
 * presence/absence.
 *
 * THE ANSWER HONESTY LAW (the ANCHOR doctrine): `not-covered` and
 * `unverifiable` NEVER imply absence — they mean exactly "the capture
 * did not declare coverage there" and "no coverage was declared at
 * all". A point outside every declared volume is NOT evidence that
 * nothing exists at that point; the vocabulary keeps that distinction
 * machine-readable.
 */

import type { Derivation, ProvenanceLink } from "@aise/shared-contracts";
import type { SceneElementId } from "@aise/world-reality-substrate";
import type { NavigableWorld } from "../world/contract";
import type { ComparisonReport } from "../compare/contract";
import type { MeasurementResult } from "../compare/contract";
import type { SpatializedWorldFragment } from "../capture/contract";

/* Re-export for the one-line import site (the world provenance type). */
export type { ElementProvenance } from "../world/contract";

/* ------------------------------------------------------------------ */
/* Evidence envelope bindings                                            */
/* ------------------------------------------------------------------ */

/**
 * One lane output's binding to the Evidence Envelope: the subject
 * (open lower_snake_case kind + AISE stable id), the provenance links
 * (shared-contracts `ProvenanceLink` — the Evidence Graph seam), the
 * derivation (how the subject was produced), and the epistemic status
 * the subject's assertions enter with (capture-derived ⇒ INFERRED —
 * the lane never promotes).
 */
export interface EvidenceEnvelopeBinding {
  readonly subjectKind: string;
  readonly subjectId: string;
  readonly links: readonly ProvenanceLink[];
  readonly derivation: Derivation;
  /** Capture-derived facts enter as INFERRED (the lane law). */
  readonly epistemicStatus: "INFERRED";
}

/* ------------------------------------------------------------------ */
/* "What is actually here?" — the typed query + the honest answers        */
/* ------------------------------------------------------------------ */

/** The closed answer vocabulary — NONE of these imply absence. */
export const WHAT_IS_HERE_ANSWER_KINDS = [
  /** One or more capture elements' declared volumes contain the point. */
  "element-bound",
  /** Inside the declared coverage bounds; no element volume claims it. */
  "coverage-only",
  /** Outside every declared coverage bound — NOT absence, only no declared coverage. */
  "not-covered",
  /** No coverage was declared at all — the honest unverifiable. */
  "unverifiable",
] as const;
export type WhatIsHereAnswerKind = (typeof WHAT_IS_HERE_ANSWER_KINDS)[number];

export function isWhatIsHereAnswerKind(value: unknown): value is WhatIsHereAnswerKind {
  return (
    typeof value === "string" &&
    (WHAT_IS_HERE_ANSWER_KINDS as readonly string[]).includes(value)
  );
}

/** The "what is actually here?" query: a site-frame point, world-bound. */
export interface WhatIsHereQuery {
  readonly point: readonly [number, number, number];
  readonly worldRevision: number;
}

/** The evidence-backed answer (element ids + provenance chains + status). */
export interface WhatIsHereResult {
  readonly answerKind: WhatIsHereAnswerKind;
  /** The capture elements whose declared volumes contain the point. */
  readonly elementIds: readonly SceneElementId[];
  /** The per-element provenance chains (never a bare read). */
  readonly provenance: readonly {
    readonly elementId: SceneElementId;
    readonly evidenceContentIds: readonly string[];
  }[];
  /** The capture coverage that decided the answer (honest context). */
  readonly coverageBasis: string | null;
  readonly epistemicStatus: "INFERRED";
}

/* ------------------------------------------------------------------ */
/* "What changed?" — the typed world-difference query                    */
/* ------------------------------------------------------------------ */

/** The "what changed?" query: two world revisions of the same world. */
export interface WhatChangedQuery {
  readonly fromWorld: NavigableWorld;
  readonly toWorld: NavigableWorld;
}

/**
 * The typed change record for one element (the closed change kinds):
 * `added` (in the new world only), `removed` (in the old only),
 * `moved` (transform translation changed),
 * `evidence-changed` (the evidence chain changed),
 * `unchanged`.
 */
export const ELEMENT_CHANGE_KINDS = [
  "added",
  "removed",
  "moved",
  "evidence-changed",
  "unchanged",
] as const;
export type ElementChangeKind = (typeof ELEMENT_CHANGE_KINDS)[number];

export interface ElementChangeRecord {
  readonly elementId: SceneElementId;
  readonly changeKind: ElementChangeKind;
  /** The evidence chains of both sides (empty on the absent side). */
  readonly fromEvidenceContentIds: readonly string[];
  readonly toEvidenceContentIds: readonly string[];
}

/** The "what changed?" result: the full typed difference with provenance. */
export interface WhatChangedResult {
  readonly fromWorldRevision: number;
  readonly toWorldRevision: number;
  readonly changes: readonly ElementChangeRecord[];
  readonly counts: readonly { readonly changeKind: ElementChangeKind; readonly count: number }[];
}

/* ------------------------------------------------------------------ */
/* The controlled family port                                           */
/* ------------------------------------------------------------------ */

/** The evidence-family port: the controlled entry point surface. */
export interface EvidenceLanePort {
  readonly portId: "layer1.evidence/1";

  /** EVIDENCE: bind a spatialized fragment to the envelope. */
  bindFragment(
    fragment: SpatializedWorldFragment,
  ): import("../failures").LaneOutcome<EvidenceEnvelopeBinding>;

  /** EVIDENCE: bind a composed world to the envelope (per-element links). */
  bindWorld(
    world: NavigableWorld,
  ): import("../failures").LaneOutcome<EvidenceEnvelopeBinding>;

  /** EVIDENCE: bind a comparison report to the envelope. */
  bindComparison(
    report: ComparisonReport,
    world: NavigableWorld,
  ): import("../failures").LaneOutcome<EvidenceEnvelopeBinding>;

  /** EVIDENCE: bind measurement results to the envelope. */
  bindMeasurements(
    results: readonly MeasurementResult[],
  ): import("../failures").LaneOutcome<EvidenceEnvelopeBinding>;

  /** EVIDENCE-BACKED QUERY: "what is actually here?" */
  whatIsHere(
    world: NavigableWorld,
    query: WhatIsHereQuery,
  ): import("../failures").LaneOutcome<WhatIsHereResult>;

  /** EVIDENCE-BACKED QUERY: "what changed?" */
  whatChanged(
    query: WhatChangedQuery,
  ): import("../failures").LaneOutcome<WhatChangedResult>;
}

/** The evidence-family port names used in typed refusals. */
export const EVIDENCE_PORTS = {
  bindFragment: "layer1.evidence.bind-fragment",
  bindWorld: "layer1.evidence.bind-world",
  bindComparison: "layer1.evidence.bind-comparison",
  bindMeasurements: "layer1.evidence.bind-measurements",
  whatIsHere: "layer1.evidence.what-is-here",
  whatChanged: "layer1.evidence.what-changed",
} as const;
