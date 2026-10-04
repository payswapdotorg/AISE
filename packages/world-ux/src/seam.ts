/**
 * WORLD-P4 — the world-ux seam: the lane statement, the ten package
 * laws and the UNIFIED lane-failure presentation.
 *
 * THE PACKAGE'S ONE JOB (directive §4 "The product MUST feel like an
 * engineering game" + the 2026-10-02 product directive recorded in
 * docs/TECH-LEAD-HANDOFF.md): transform the AISE primary experience
 * from a navigation-dense dashboard into a SPATIAL ENVIRONMENT with a
 * RESTRAINED HUD. This package defines the HUD and the spatial surface
 * as READ-ONLY typed projections COMPOSING the six landed world
 * packages — it never re-defines any lane surface, never owns
 * engineering state, and never becomes an authority
 * (spec/technology-substitution-contract.md §7; handoff §10).
 *
 * THE SEVEN HUD PANELS (handoff §4 "In-world HUD", verbatim roles):
 *
 *   Objective    the current engineering problem (P2 problem lane +
 *                LIVE clash→problem bindings from the P3 coordination
 *                family — wiring note #4);
 *   Evidence     the evidence/readiness state (P1/P2 evidence
 *                vocabularies — readiness verdicts, typed gaps);
 *   Constraints  the governed constraints observed in scope (P2 case
 *                context + P3 what-if/declared tolerance observations);
 *   Agent        the currently active specialist / bounded action (P2
 *                actions + lane operators; BOUNDED_AGENT proposes,
 *                never decides);
 *   Validation   the current solution status (P2 deterministic check
 *                gate + P3 lane verification);
 *   Cost/BOQ     the live consequence of the selected proposed
 *                operation (P3 quantity-consequence projections — a
 *                VIEW; the BOQ Graph stays the ONLY quantity
 *                authority);
 *   Timeline     the optional execution sequence / 4D view (P3
 *                sequencing playback phases over the P0-C simulation
 *                contract).
 *
 * THE TEN PACKAGE LAWS (binding on every family):
 *
 *  1. READ-ONLY PROJECTION — every panel and every surface view is a
 *     pure function of composed lane state; building a HUD model or a
 *     station scene never mutates any lane record (the governed
 *     changes API stays the only write path).
 *  2. HUD-EXPLAINS-NEVER-REPLACES — the HUD explains engineering
 *     state; it never replaces the scene (handoff §4). The station
 *     surface owns the spatial presentation; the panels are chrome.
 *  3. HONEST PANEL STATES — every panel carries an explicit
 *     contentState from {POPULATED, EMPTY, UNAVAILABLE}: POPULATED
 *     means real lane data, EMPTY means the lane answered "none in
 *     scope" (never fabricated filler), UNAVAILABLE means the source
 *     refused/erroed and the typed failure is carried (ANCHOR honesty:
 *     zero fabricated data; negatives fail closed).
 *  4. UNIFIED FAILURE PRESENTATION — the three lanes' `LaneFailure`
 *     shapes are presented in ONE form (see `WorldUxFailure`): the
 *     `kind` comes from the CLOSED HFX-000 vocabulary and is carried
 *     VERBATIM; the `detail` is carried VERBATIM; the family names the
 *     refusing lane surface. The P1 lane's `{kind, port, detail,
 *     subjectId}` is presented with its port AS the family and its
 *     subjectId appended to the detail — kind+detail preserved
 *     verbatim (the recorded P4 seam decision on the P3 wiring note).
 *  5. GHOST-REMOVED RESOLVABILITY — an element id deleted by a ghost
 *     (proposed) operation STAYS RESOLVABLE in the composed station
 *     scene: it resolves with status `proposed-removed` and its
 *     captured node intact (the P3 wiring note — the runtime overlay
 *     owns the visual removal; identity never dangles).
 *  6. PROVENANCE FAIL-CLOSED — an authored intent whose provenance
 *     violates the solution-contract invariant
 *     `missing_operation_provenance` (no evidence ids, no derivation
 *     note, no command text) REFUSES the station composition (the P3
 *     wiring note — attribution is never optional).
 *  7. IDENTITY QUARANTINE — substrate-shaped ids never enter the
 *     station: a pick or selection carrying a substrate-looking id is
 *     refused (the lanes' `looksLikeSubstrateId` law, composed here at
 *     the UX boundary); no substrate object id ever becomes canonical
 *     AISE identity (handoff §10).
 *  8. NO-UI-AUTHORITY — the HUD never renders a verdict the engine
 *     did not render, never computes a quantity the BOQ Graph did not
 *     derive, never upgrades an epistemic class (PROPOSED stays
 *     PROPOSED; INFERRED stays INFERRED; OBSERVED stays OBSERVED).
 *  9. DETERMINISM — no network, no clock reads, no randomness, no
 *     I/O: the same composed sources produce the byte-identical
 *     station model (content-derived station identity).
 * 10. SUBSTITUTION DOUBLES — every wiring port has in-memory
 *     reference AND alternate doubles that compose the REAL lane
 *     fixtures (the P1 fixture world, the P2 lane run, the P3 lane
 *     run) — the package compiles and its tests run with ZERO
 *     substrate installed, and the reference/alternate kits produce
 *     byte-identical station models (the substitution law).
 */

import { FAILURE_KINDS } from "@aise/provider-registry";
import type { FailureKind } from "@aise/provider-registry";

/* ------------------------------------------------------------------ */
/* The lane identity                                                   */
/* ------------------------------------------------------------------ */

/** The package's lane id (the world program's registry key). */
export const WORLD_UX_LANE_ID = "world-ux" as const;

/** The one-line lane statement (the world program's P4 scope). */
export const WORLD_UX_STATEMENT =
  "WORLD-P4 — the game-world UX transformation: the primary spatial " +
  "surface with the restrained seven-panel in-world HUD " +
  "(objective/evidence/constraints/agent/validation/cost-boq/timeline) " +
  "as read-only typed projections composing the six landed world " +
  "packages; the HUD explains engineering state without replacing the " +
  "scene.";

/* ------------------------------------------------------------------ */
/* The closed panel vocabulary (handoff §4, verbatim roles)            */
/* ------------------------------------------------------------------ */

/** The seven HUD panel ids — a CLOSED vocabulary (handoff §4). */
export const HUD_PANEL_IDS = [
  "objective",
  "evidence",
  "constraints",
  "agent",
  "validation",
  "cost-boq",
  "timeline",
] as const;
export type HudPanelId = (typeof HUD_PANEL_IDS)[number];

/** Type guard: a HUD panel id from the closed seven. */
export function isHudPanelId(value: unknown): value is HudPanelId {
  return (
    typeof value === "string" &&
    (HUD_PANEL_IDS as readonly string[]).includes(value)
  );
}

/** The canonical panel order (presentation order is part of the contract). */
export const HUD_PANEL_ORDER: readonly HudPanelId[] = HUD_PANEL_IDS;

/** The display titles (presentation labels, never identity). */
export const HUD_PANEL_TITLES: Readonly<Record<HudPanelId, string>> = {
  objective: "Objective",
  evidence: "Evidence",
  constraints: "Constraints",
  agent: "Agent",
  validation: "Validation",
  "cost-boq": "Cost / BOQ",
  timeline: "Timeline",
};

/* ------------------------------------------------------------------ */
/* The honest content states (law #3)                                  */
/* ------------------------------------------------------------------ */

/** The honest panel content states — a CLOSED vocabulary. */
export const HUD_CONTENT_STATES = ["POPULATED", "EMPTY", "UNAVAILABLE"] as const;
export type HudContentState = (typeof HUD_CONTENT_STATES)[number];

/** Type guard: a content state from the closed set. */
export function isHudContentState(value: unknown): value is HudContentState {
  return (
    typeof value === "string" &&
    (HUD_CONTENT_STATES as readonly string[]).includes(value)
  );
}

/* ------------------------------------------------------------------ */
/* The package families (the refusal surface names)                    */
/* ------------------------------------------------------------------ */

/** The four package families (which family refused). */
export const WORLD_UX_FAMILIES = ["hud", "surface", "wiring", "station"] as const;
export type WorldUxFamily = (typeof WORLD_UX_FAMILIES)[number];

/** Type guard: a package family. */
export function isWorldUxFamily(value: unknown): value is WorldUxFamily {
  return (
    typeof value === "string" &&
    (WORLD_UX_FAMILIES as readonly string[]).includes(value)
  );
}

/* ------------------------------------------------------------------ */
/* The UNIFIED lane-failure presentation (law #4 — the recorded seam   */
/* decision on the P3 wiring note)                                     */
/* ------------------------------------------------------------------ */

/**
 * The unified lane-failure presentation: the one failure shape every
 * HUD panel and station surface carries.
 *
 * SEAM DECISION (recorded — WORLD-P4, on the P3 wiring note "LaneFailure
 * unified as the P2/P3 family shape"): the P2 and P3 lanes carry
 * `{kind, family, detail}`; the P1 lane carries `{kind, port, detail,
 * subjectId}`. The unified presentation keeps the P2/P3 SHAPE
 * (`{kind, family, detail}`) and maps P1 onto it: `family` := the P1
 * port VERBATIM (the port already names the refusing surface, e.g.
 * `layer1.capture.spatialize`), and the subjectId is APPENDED to the
 * detail (`" [subject: <id>]"`) when present. The `kind` (the CLOSED
 * HFX-000 vocabulary, imported — never modified, never extended) and
 * the `detail` are carried VERBATIM in every case. Nothing is dropped,
 * nothing is invented, no failure kind is added.
 */
export interface WorldUxFailure {
  /** From the CLOSED HFX-000 vocabulary — carried VERBATIM. */
  readonly kind: FailureKind;
  /** The refusing lane surface (P2/P3 family or P1 port, verbatim). */
  readonly family: string;
  /** The honest reason — carried VERBATIM (P1: subjectId appended). */
  readonly detail: string;
}

/** The P1 lane failure shape (imported structurally, never re-defined). */
export interface Layer1LaneFailureShape {
  readonly kind: FailureKind;
  readonly port: string;
  readonly detail: string;
  readonly subjectId: string | null;
}

/** The P2/P3 lane failure shape (imported structurally, never re-defined). */
export interface FamilyLaneFailureShape {
  readonly kind: FailureKind;
  readonly family: string;
  readonly detail: string;
}

/** Unify a P1-shaped lane failure (family := port; subject appended). PURE. */
export function unifyLayer1Failure(failure: Layer1LaneFailureShape): WorldUxFailure {
  const subjectSuffix =
    failure.subjectId === null ? "" : ` [subject: ${failure.subjectId}]`;
  return {
    kind: failure.kind,
    family: failure.port,
    detail: `${failure.detail}${subjectSuffix}`,
  };
}

/** Unify a P2/P3-shaped lane failure (already the family shape). PURE. */
export function unifyFamilyLaneFailure(failure: FamilyLaneFailureShape): WorldUxFailure {
  return {
    kind: failure.kind,
    family: failure.family,
    detail: failure.detail,
  };
}

/** Type guard: a well-formed unified failure (closed kind, non-empty text). */
export function isWorldUxFailure(value: unknown): value is WorldUxFailure {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Partial<WorldUxFailure>;
  return (
    typeof candidate.kind === "string" &&
    (FAILURE_KINDS as readonly string[]).includes(candidate.kind) &&
    typeof candidate.family === "string" &&
    candidate.family.length > 0 &&
    typeof candidate.detail === "string" &&
    candidate.detail.length > 0
  );
}

/* ------------------------------------------------------------------ */
/* The typed outcome (the fail-closed carrier — same discipline as     */
/* every lane: never a throw, never a silent gap, never partial output)*/
/* ------------------------------------------------------------------ */

/** The discriminated outcome of every world-ux transform. */
export type WorldUxOutcome<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly failure: WorldUxFailure };

/** Build an ok outcome. */
export function worldUxOk<T>(value: T): WorldUxOutcome<T> {
  return { ok: true, value };
}

/** Build a typed refusal bound to one package family (law #3). */
export function worldUxRefused<T>(
  family: WorldUxFamily,
  kind: FailureKind,
  detail: string,
): WorldUxOutcome<T> {
  return { ok: false, failure: { kind, family, detail } };
}

/** Type guard: is this outcome a refusal? */
export function isWorldUxRefusal<T>(
  outcome: WorldUxOutcome<T>,
): outcome is { readonly ok: false; readonly failure: WorldUxFailure } {
  return outcome.ok === false;
}

/* ------------------------------------------------------------------ */
/* Shared small helpers (the digest + freeze discipline, re-implemented*/
/* per the house pattern — no cross-package runtime dependency beyond  */
/* the failure vocabulary)                                             */
/* ------------------------------------------------------------------ */

/** The canonical 64-hex digest pattern (content-derived identities). */
export const CANONICAL_DIGEST_PATTERN = /^[0-9a-f]{64}$/;

/** Type guard: a 64-hex canonical digest. */
export function isCanonicalDigest(value: unknown): value is string {
  return typeof value === "string" && CANONICAL_DIGEST_PATTERN.test(value);
}

/**
 * Canonical JSON stringify (sorted keys, no whitespace) — the digest
 * input discipline shared by every lane.
 */
export function canonicalJsonStringify(value: unknown): string {
  const canonicalize = (input: unknown): unknown => {
    if (Array.isArray(input)) {
      return input.map(canonicalize);
    }
    if (typeof input === "object" && input !== null) {
      const record = input as Record<string, unknown>;
      const keys = Object.keys(record).sort();
      const result: Record<string, unknown> = {};
      for (const key of keys) {
        result[key] = canonicalize(record[key]);
      }
      return result;
    }
    return input;
  };
  return JSON.stringify(canonicalize(value));
}

/** The content digest of a JSON-able value (deterministic, lowercase hex). */
export function canonicalDigestOf(value: unknown): string {
  const text = canonicalJsonStringify(value);
  // FNV-1a 64-bit over the canonical text — deterministic, dependency-free.
  let hash = 0xcbf29ce484222325n;
  const bytes = new TextEncoder().encode(text);
  for (const byte of bytes) {
    hash ^= BigInt(byte);
    hash = (hash * 0x100000001b3n) & 0xffffffffffffffffn;
  }
  return hash.toString(16).padStart(16, "0");
}

/** The digest of an arbitrary text (same discipline, over the raw text). */
export function textDigestOf(text: string): string {
  let hash = 0xcbf29ce484222325n;
  const bytes = new TextEncoder().encode(text);
  for (const byte of bytes) {
    hash ^= BigInt(byte);
    hash = (hash * 0x100000001b3n) & 0xffffffffffffffffn;
  }
  return hash.toString(16).padStart(16, "0");
}

/** Deep-freeze a value (the immutability discipline of every lane). */
export function deepFreeze<T>(value: T): T {
  if (Array.isArray(value)) {
    for (const entry of value) {
      deepFreeze(entry);
    }
    return Object.freeze(value) as T;
  }
  if (typeof value === "object" && value !== null) {
    for (const key of Object.keys(value as Record<string, unknown>)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
    return Object.freeze(value) as T;
  }
  return value;
}

/** ISO-8601 UTC instant with milliseconds (the declared-instant shape). */
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

/** Type guard: a declared ISO-8601 UTC instant (never a clock read). */
export function isDeclaredInstant(value: unknown): value is string {
  return typeof value === "string" && ISO_INSTANT.test(value);
}
