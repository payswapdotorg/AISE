/**
 * WORLD-P3 — the Layer-3 experience-lane SEAM.
 *
 * The shared law layer under the four family contracts (authoring/
 * coordination/ quantify/ sequencing/) and the lane runner: the lane
 * statement, the seven-stage lane identity, the operator discipline (the
 * WHO of the interactive world), the digest discipline (RE-EXPORTED
 * VERBATIM from the P0-B understanding-substrate seam — this lane
 * COMPOSES that substrate, it never re-defines its surfaces), the typed
 * outcome shape with the HFX-000 closed failure vocabulary (imported
 * from `@aise/provider-registry`, never modified, never extended), and
 * the deep-freeze non-interference guard.
 *
 * THE LANE (directive §1 Layer 3, docs/TECH-LEAD-HANDOFF.md):
 *
 *   PROBLEM → ENTER WORLD → INSPECT → GRAB / MOVE / REPLACE / ADD /
 *   REMOVE → PREVIEW PROPOSED STATE → RUN ENGINEERING VALIDATION →
 *   SEE CONSEQUENCES → ACCEPT / REVISE → GENERATE SOLUTION BOQ →
 *   SIMULATE EXECUTION → CAPTURE OUTCOME
 *
 * compressed, as the work order fixes it, into the seven typed stages:
 *
 *   AUTHOR → COORDINATE → CLASH-DETECT → QUANTIFY → WHAT-IF →
 *   SEQUENCE → REPLAY
 *
 * "The word 'game' describes the interaction model, not a relaxation of
 * engineering rigor."
 *
 * THE TEN LANE LAWS (binding on every family, enforced by the family
 * validators and drilled by the colocated test suites):
 *
 *   1. DM↔NL EQUIVALENCE LAW: BOTH authoring input modalities — the
 *      direct-manipulation gesture stream and the natural-language
 *      utterance — resolve to the SAME typed operation (the same
 *      `EngineeringOperationIntent` semantics, hence the same
 *      content-derived operation identity). Only the PROVENANCE differs
 *      (origin: direct-manipulation with interactionDetail vs agent
 *      with commandText); no input modality receives different
 *      engineering authority (ACR-005/006, the substitution contract §4
 *      requirement 2).
 *   2. NL-SUBSTRATE LAW: the natural-language command parser is a
 *      REPLACEABLE SUBSTRATE behind a port — exactly like the LLM law
 *      of P2 and the geometry/IFC substrates of P0-B. Its outputs are
 *      UNTRUSTED candidate drafts: the controlled entry point
 *      re-validates every parsed draft against the closed typed
 *      command vocabulary and REFUSES rogue output (an LLM/NLU engine
 *      never authors engineering semantics directly — directive §10
 *      "let an LLM directly mutate authoritative geometry").
 *   3. GHOST-DISTINCTNESS LAW (the P0-A law, carried END-TO-END):
 *      every proposed/what-if element the lane presents is a ghost node
 *      (isGhost: true) — structurally distinct from captured reality at
 *      every layer of the composition. A swap can never make proposed
 *      state indistinguishable from captured reality.
 *   4. IDENTITY-QUARANTINE LAW: substrate-side identifiers — USD object
 *      paths, glTF node indices, OCCT topology names, FreeCAD
 *      document/object names — are NAMESPACED EXTERNAL LABELS at most,
 *      never canonical AISE identity; a substrate-shaped id in a
 *      canonical identity field is a typed refusal. Cross-model
 *      coordination REFUSES element-id collisions: one stable AISE id
 *      names one element in the coordinated world, ever.
 *   5. BOQ-AUTHORITY LAW: the BOQ Graph stays the ONLY quantity
 *      authority. This lane VIEWS it and PROJECTS live consequences
 *      from ENGINE-derived quantities carried verbatim (calculation
 *      method CITED, never restated); a projection is typed PROPOSED
 *      and is never a generated BOQ; no parallel quantity authority
 *      exists anywhere in this package.
 *   6. SIMULATION-NON-AUTHORITY LAW: the simulation substrate computes
 *      trajectories; the canonical Solution Graph stays the only
 *      authority (directive §10). Sequencing compiles DECLARED activity
 *      orderings into the P0-C simulation contract; simulated progress
 *      is PROPOSED, never CONFIRMED.
 *   7. TOLERANCE-DECLARED LAW: clash verdicts answer from the CLOSED
 *      vocabulary clear / within-tolerance / clash — never a silent
 *      boolean; the declared tolerance is carried VERBATIM in every
 *      verdict; the tolerance decision stays with the consumer (the
 *      P0-B discipline, delegated to).
 *   8. FAIL-CLOSED LAW: unsupported is RECORDED, never computed. Every
 *      refusal is a typed `LaneFailure` whose kind comes from the CLOSED
 *      HFX-000 vocabulary (`@aise/provider-registry` FAILURE_KINDS —
 *      imported, never modified) and is machine-readable evidence.
 *   9. DETERMINISM LAW: no network, no clock reads, no randomness, no
 *      I/O in the contract core. Every instant is a DECLARED input.
 *      Identical requests through the same double produce byte-identical
 *      content-addressed outputs.
 *  10. REPLAY LAW: the interactive solution session records as a
 *      chained, content-addressed replay log — every lane transition
 *      one auditable entry; replay is deterministic and byte-identical
 *      (the audit trail of the interactive world).
 */

import type { FailureKind } from "@aise/provider-registry";
import {
  canonicalDigestOf,
  deepFreeze,
  isCanonicalDigest,
  textDigestOf,
} from "@aise/world-understanding-substrate";

/* The digest + freeze disciplines are the P0-B seam's — re-exported
 * VERBATIM, never re-defined (this lane composes that substrate). */
export { canonicalDigestOf, textDigestOf, isCanonicalDigest, deepFreeze };

/* ------------------------------------------------------------------ */
/* Lane identity                                                        */
/* ------------------------------------------------------------------ */

export const LAYER3_LANE_ID = "layer3-experience" as const;

export const LAYER3_LANE_STATEMENT =
  "AISE Layer-3 experience lane (WORLD-P3): the SYNCHRO/Revit/Navisworks-parity lane — " +
  "interactive spatial authoring, model coordination, tolerance-declared clash detection, " +
  "live BOQ quantity consequences, what-if alternatives, execution sequencing and solution " +
  "replay — as typed contracts composing the five landed world packages with the existing " +
  "deterministic solution engine and BOQ Graph seams. Direct manipulation and natural-language " +
  "commands resolve to the SAME typed operation; proposed state presents as ghosts, never " +
  "captured reality; the BOQ Graph stays the only quantity authority; the simulation substrate " +
  "computes trajectories while the Solution Graph stays the only authority; no substrate id " +
  "ever becomes canonical AISE identity; unsupported is recorded, never computed.";

/** The seven lane stages, in order (the work order's Layer-3 lane). */
export const LAYER3_STAGE_NAMES = [
  "AUTHOR",
  "COORDINATE",
  "CLASH_DETECT",
  "QUANTIFY",
  "WHAT_IF",
  "SEQUENCE",
  "REPLAY",
] as const;
export type Layer3StageName = (typeof LAYER3_STAGE_NAMES)[number];

export function isLayer3StageName(value: unknown): value is Layer3StageName {
  return (
    typeof value === "string" &&
    (LAYER3_STAGE_NAMES as readonly string[]).includes(value)
  );
}

/** The closed family vocabulary of this package. */
export const LAYER3_FAMILIES = [
  "authoring",
  "coordination",
  "quantify",
  "sequencing",
] as const;
export type Layer3Family = (typeof LAYER3_FAMILIES)[number];

export function isLayer3Family(value: unknown): value is Layer3Family {
  return (
    typeof value === "string" &&
    (LAYER3_FAMILIES as readonly string[]).includes(value)
  );
}

/* ------------------------------------------------------------------ */
/* The operator discipline (the WHO of the interactive world)           */
/* ------------------------------------------------------------------ */

/**
 * Closed operator-role vocabulary — the Layer-3 author of an interactive
 * command or lane event. Mirrors the P2 actor discipline so the audit
 * trails compose in WORLD-P4; authority-bearing roles (REVIEWER) stay
 * governed by the review records, never assumed here.
 */
export const LANE_OPERATOR_ROLES = [
  "engineer",
  "field_engineer",
  "reviewer",
  "system",
  "bounded_agent",
] as const;
export type LaneOperatorRole = (typeof LANE_OPERATOR_ROLES)[number];

export function isLaneOperatorRole(value: unknown): value is LaneOperatorRole {
  return (
    typeof value === "string" &&
    (LANE_OPERATOR_ROLES as readonly string[]).includes(value)
  );
}

/**
 * One operator identity: a typed who. `operatorId` is an AISE-side
 * stable id (never a substrate id); `role` comes from the closed
 * vocabulary. The BOUNDED_AGENT role marks the NL-command lane acting —
 * it may PROPOSE commands, never decide engineering outcomes (the
 * NL-substrate law).
 */
export interface LaneOperator {
  readonly operatorId: string;
  readonly role: LaneOperatorRole;
}

/* ------------------------------------------------------------------ */
/* The typed outcome (the fail-closed carrier)                          */
/* ------------------------------------------------------------------ */

/**
 * A typed lane failure: the kind comes from the CLOSED HFX-000
 * vocabulary (`@aise/provider-registry` FAILURE_KINDS — imported, never
 * modified, never extended: this file invents no failure kinds), the
 * family names which lane port refused, the detail is the honest
 * reason, the subject the AISE-side id in hand. Never a throw, never a
 * silent gap, never partial output.
 */
export interface LaneFailure {
  readonly kind: FailureKind;
  readonly family: Layer3Family;
  readonly detail: string;
}

/** The discriminated outcome of one lane port call. */
export type LaneOutcome<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly failure: LaneFailure };

/** A typed refusal bound to one lane family (law #8). */
export function laneRefused<T>(
  family: Layer3Family,
  kind: FailureKind,
  detail: string,
): LaneOutcome<T> {
  return { ok: false, failure: { kind, family, detail } };
}

/** Type guard: is this lane outcome a refusal? */
export function isLaneRefusal<T>(
  outcome: LaneOutcome<T>,
): outcome is { readonly ok: false; readonly failure: LaneFailure } {
  return outcome.ok === false;
}

/* ------------------------------------------------------------------ */
/* Shared small helpers                                                 */
/* ------------------------------------------------------------------ */

/** ISO-8601 UTC instant with milliseconds (the declared-instant shape). */
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

export function isDeclaredInstant(value: unknown): value is string {
  return typeof value === "string" && ISO_INSTANT.test(value);
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * The house sealing discipline (from the P0-B seam): the content-derived
 * 64-hex id of a record — sha-256 over the canonical JSON of the record
 * with its own id field removed. Re-derivable, never a substrate label.
 */
export function contentIdOf(
  record: Record<string, unknown>,
  idField: string,
): string {
  const clone: Record<string, unknown> = {};
  for (const key of Object.keys(record).sort()) {
    if (key !== idField) {
      clone[key] = record[key];
    }
  }
  return canonicalDigestOf(clone);
}

/**
 * Substrate-shaped id patterns (the identity-quarantine tripwire, law
 * #4). Mirrors the P1 `SUBSTRATE_ID_PATTERNS` discipline so all three
 * experience lanes refuse the same substrate id shapes: a canonical id
 * field carrying one of these shapes is a typed contract-mismatch
 * refusal naming the pattern.
 */
export const SUBSTRATE_ID_PATTERNS: readonly {
  readonly name: string;
  readonly pattern: RegExp;
}[] = [
  { name: "ifc-guid", pattern: /^[0-9A-Za-z_$]{22}$/ },
  { name: "usd-prim-path", pattern: /^\/[A-Za-z][\w]*\/[\w/.:-]*$/ },
  { name: "gltf-node-ref", pattern: /^(node|mesh|material|accessor|buffer):\d+$/ },
  { name: "assimp-mesh-name", pattern: /^aiMesh::/ },
  { name: "cesium-entity-id", pattern: /^cesium-entity:/ },
  { name: "freecad-object-name", pattern: /^(Sketch|Pad|Pocket|Box|Line)\/?$/ },
];

/**
 * Does this id LOOK like a substrate-side identifier? (The identity-
 * quarantine tripwire of law #4.)
 */
export function looksLikeSubstrateId(value: string): string | null {
  for (const entry of SUBSTRATE_ID_PATTERNS) {
    if (entry.pattern.test(value)) {
      return entry.name;
    }
  }
  return null;
}

/** Deterministic clamp helper shared by family validators. */
export function isFinitePositive(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}
