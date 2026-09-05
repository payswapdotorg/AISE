/**
 * Deterministic change records (AISE-031).
 *
 * A change record is one independently reviewable fact about what
 * changed between two committed versions. Records are:
 *
 * - **deterministic** — `changeId` is derived from the record's
 *   canonical content (identity binds content; the validator
 *   re-derives it);
 * - **decomposed** — geometry/semantic/evidence changes are separate
 *   records; an epistemic transition never rides along a quantity
 *   change (confidence and uncertainty are separate axes); the
 *   presence of an optional structured-geometry quantity is its own
 *   added/removed record, never silently dropped;
 * - **provenance-carrying** — the authoritative producer summary of
 *   the relevant side(s): object-family records carry the per-object
 *   producer provenance of the compared graphs; space/relationship
 *   records carry the compared versions' commit producers (spaces
 *   and relationships carry no per-entity provenance in the Reality
 *   Graph v1 — the version producer is the first and only authority,
 *   never a synthesized second one);
 * - **honest** — added/removed report identity facts only; no
 *   correspondence ("the same wall moved") is ever inferred
 *   (AISE-011 identity discipline).
 *
 * `null` in a previous/current pair means "absent/unstated on that
 * side" — a real value, never a fabricated default.
 */
import { canonicalJsonString, sha256Hex } from "@aise/engineering-model";
import type {
  EpistemicState,
  ModelPresence,
  ModelUncertainty,
  ModelUnit,
  ModelLengthUnit,
  MeasurementKind,
} from "@aise/engineering-model";
import { historySubjectKey, type HistorySubjectRef } from "./subjects.js";

export type ChangeCategory =
  | "object"
  | "geometry"
  | "property"
  | "space"
  | "relationship"
  | "evidence";

export type ChangeKind =
  // object lifecycle/existence
  | "object-added"
  | "object-removed"
  | "object-epistemic-changed"
  | "object-name-changed"
  // geometry (structured mechanism)
  | "geometry-added"
  | "geometry-removed"
  | "geometry-frame-changed"
  | "geometry-extent-changed"
  | "geometry-quantity-changed"
  | "geometry-quantity-added"
  | "geometry-quantity-removed"
  | "geometry-quality-changed"
  | "geometry-assets-changed"
  // property assertions (object- or space-owned)
  | "property-added"
  | "property-removed"
  | "property-shape-changed"
  | "property-quantity-changed"
  | "property-status-changed"
  | "property-presence-changed"
  | "property-confidence-changed"
  | "property-kind-changed"
  | "property-evidence-changed"
  // spaces
  | "space-added"
  | "space-removed"
  | "space-name-changed"
  | "space-parent-changed"
  | "space-frame-changed"
  // relationships (identity-only in v1)
  | "relationship-added"
  | "relationship-removed"
  // evidence validity (AISE-012 projection flips)
  | "evidence-validity-invalidated"
  | "evidence-validity-restored";

/** Canonical rank of categories (report ordering). */
export const CATEGORY_RANK: Readonly<Record<ChangeCategory, number>> = Object.freeze({
  object: 0,
  geometry: 1,
  property: 2,
  space: 3,
  relationship: 4,
  evidence: 5,
});

/** Canonical rank of kinds (tie-break inside one subject). */
const KIND_RANK: Readonly<Record<ChangeKind, number>> = Object.freeze({
  "object-added": 0,
  "object-removed": 1,
  "object-epistemic-changed": 2,
  "object-name-changed": 3,
  "geometry-added": 0,
  "geometry-removed": 1,
  "geometry-frame-changed": 2,
  "geometry-extent-changed": 3,
  "geometry-quantity-changed": 4,
  "geometry-quantity-added": 5,
  "geometry-quantity-removed": 6,
  "geometry-quality-changed": 7,
  "geometry-assets-changed": 8,
  "property-added": 0,
  "property-removed": 1,
  "property-shape-changed": 2,
  "property-quantity-changed": 3,
  "property-status-changed": 4,
  "property-presence-changed": 5,
  "property-confidence-changed": 6,
  "property-kind-changed": 7,
  "property-evidence-changed": 8,
  "space-added": 0,
  "space-removed": 1,
  "space-name-changed": 2,
  "space-parent-changed": 3,
  "space-frame-changed": 4,
  "relationship-added": 0,
  "relationship-removed": 1,
  "evidence-validity-invalidated": 0,
  "evidence-validity-restored": 1,
});

/** Producer summary pinned on each record (full ModelProvenance stays in the pinned versions). */
export interface ProvenanceSummary {
  readonly serviceId: string;
  readonly method: string;
  readonly methodVersion: string;
}

/** A measured value with unit and (possibly absent) uncertainty — passed through verbatim. */
export interface QuantitySnapshot {
  readonly value: number;
  readonly unit: ModelUnit;
  readonly uncertainty?: ModelUncertainty;
}

/**
 * The derived delta of a quantity change — uncertainty separation:
 * the delta carries the RSS of the two sides' STANDARD
 * uncertainties only when both sides state standard uncertainties;
 * otherwise it is absent (never a guessed or folded value).
 */
export interface QuantityDelta {
  readonly value: number;
  readonly unit: ModelUnit;
  readonly combinedUncertainty?: { readonly kind: "standard"; readonly u: number };
}

/** Frame snapshot (plane point + normal + axes) for structured-geometry frame changes. */
export interface FrameSnapshot {
  readonly planePoint: { readonly x: number; readonly y: number; readonly z: number };
  readonly normal: { readonly x: number; readonly y: number; readonly z: number };
  readonly axisU: { readonly x: number; readonly y: number; readonly z: number };
  readonly axisV: { readonly x: number; readonly y: number; readonly z: number };
}

/** Rectangle extent snapshot (canonical bounds). */
export interface ExtentSnapshot {
  readonly uMin: number;
  readonly uMax: number;
  readonly vMin: number;
  readonly vMax: number;
}

/** Fit-quality snapshot (point count + residuals; deterministic, no confidence). */
export interface QualitySnapshot {
  readonly pointCount: number;
  readonly residualRms: number;
  readonly residualMaxAbs: number;
}

/** Space frame snapshot (up axis + declared unit). */
export interface SpaceFrameSnapshot {
  readonly up: { readonly x: number; readonly y: number; readonly z: number };
  readonly unit: ModelLengthUnit;
}

/** Which sides a record's provenance summary pins. */
export interface ProvenancePair {
  readonly previous?: ProvenanceSummary;
  readonly current?: ProvenanceSummary;
}

/** One deterministic, independently reviewable change record. */
export interface ChangeRecord {
  /** Deterministic identity derived from the record's canonical content. */
  readonly changeId: string;
  readonly category: ChangeCategory;
  readonly kind: ChangeKind;
  readonly subject: HistorySubjectRef;
  /**
   * Which version the record's subject (or, for single-quantity
   * records, the carried quantity) exists in (added/removed records
   * only).
   */
  readonly side?: "from" | "to";
  /** Existence-state transition (object epistemic / property status). */
  readonly epistemic?: { readonly previous: EpistemicState; readonly current: EpistemicState };
  /** Presence-state transition (valueless assertions). */
  readonly presence?: { readonly previous: ModelPresence; readonly current: ModelPresence };
  /** Quantity passthrough — both sides verbatim, uncertainty included. */
  readonly quantity?: {
    readonly previous: QuantitySnapshot;
    readonly current: QuantitySnapshot;
  };
  /** Derived delta (same unit; combined uncertainty only when both sides state standard). */
  readonly quantityDelta?: QuantityDelta;
  /**
   * Single-side verbatim quantity snapshot — the presence of an
   * optional structured-geometry quantity that exists only in the
   * version named by `side` (added/removed quantity records; never
   * a fabricated counterpart on the absent side).
   */
  readonly singleQuantity?: QuantitySnapshot;
  /** Model-probability transition (AC-070 axis — separate from uncertainty; null = unstated). */
  readonly confidence?: { readonly previous: number | null; readonly current: number | null };
  /** measurement↔estimate transition (lock §3). */
  readonly measurementKind?: { readonly previous: MeasurementKind; readonly current: MeasurementKind };
  /** Assertion shape transition (quantity ↔ presence). */
  readonly shape?: { readonly previous: "quantity" | "presence"; readonly current: "quantity" | "presence" };
  /** Reference-set change (evidence refs / geometry asset content hashes). */
  readonly refs?: { readonly previous: readonly string[]; readonly current: readonly string[] };
  readonly frame?: { readonly previous: FrameSnapshot; readonly current: FrameSnapshot };
  readonly extent?: { readonly previous: ExtentSnapshot; readonly current: ExtentSnapshot };
  readonly quality?: { readonly previous: QualitySnapshot; readonly current: QualitySnapshot };
  readonly spaceFrame?: { readonly previous: SpaceFrameSnapshot; readonly current: SpaceFrameSnapshot };
  readonly name?: { readonly previous: string | null; readonly current: string | null };
  readonly parent?: { readonly previous: string | null; readonly current: string | null };
  readonly provenance?: ProvenancePair;
  /** Evidence validity flip (AISE-012 projection comparison). */
  readonly validity?: { readonly previous: boolean; readonly current: boolean };
  /** Why the invalid side is invalid (reasons of the side that is invalid). */
  readonly invalidationReasons?: readonly string[];
  /** Human-reviewable deterministic reason. */
  readonly detail: string;
}

/** Input to record construction (identity is derived). */
export type ChangeRecordInput = Omit<ChangeRecord, "changeId">;

/** Any optional payload field of a change record (pre-identity). */
type RecordField = keyof ChangeRecordInput;

/** Fields that are legitimately optional per-kind (not required even when listed). */
const OPTIONAL_FIELDS = new Set<RecordField>([
  "quantityDelta",
  "invalidationReasons",
]);

/** Which fields each kind MUST carry (validator binding). */
const KIND_FIELDS: Readonly<Record<ChangeKind, readonly RecordField[]>> = Object.freeze({
  "object-added": ["side", "provenance"],
  "object-removed": ["side", "provenance"],
  "object-epistemic-changed": ["epistemic", "provenance"],
  "object-name-changed": ["name", "provenance"],
  "geometry-added": ["provenance"],
  "geometry-removed": ["provenance"],
  "geometry-frame-changed": ["frame", "provenance"],
  "geometry-extent-changed": ["extent", "provenance"],
  "geometry-quantity-changed": ["quantity", "quantityDelta", "provenance"],
  "geometry-quantity-added": ["side", "singleQuantity", "provenance"],
  "geometry-quantity-removed": ["side", "singleQuantity", "provenance"],
  "geometry-quality-changed": ["quality", "provenance"],
  "geometry-assets-changed": ["refs", "provenance"],
  "property-added": ["provenance"],
  "property-removed": ["provenance"],
  "property-shape-changed": ["shape", "provenance"],
  "property-quantity-changed": ["quantity", "quantityDelta", "provenance"],
  "property-status-changed": ["epistemic", "provenance"],
  "property-presence-changed": ["presence", "provenance"],
  "property-confidence-changed": ["confidence", "provenance"],
  "property-kind-changed": ["measurementKind", "provenance"],
  "property-evidence-changed": ["refs", "provenance"],
  "space-added": ["side", "provenance"],
  "space-removed": ["side", "provenance"],
  "space-name-changed": ["name", "provenance"],
  "space-parent-changed": ["parent", "provenance"],
  "space-frame-changed": ["spaceFrame", "provenance"],
  "relationship-added": ["side", "provenance"],
  "relationship-removed": ["side", "provenance"],
  "evidence-validity-invalidated": ["validity", "invalidationReasons"],
  "evidence-validity-restored": ["validity", "invalidationReasons"],
});

/** Every optional payload field (for the forbidden-field computation). */
const ALL_PAYLOAD_FIELDS: readonly RecordField[] = [
  "epistemic",
  "presence",
  "quantity",
  "quantityDelta",
  "singleQuantity",
  "confidence",
  "measurementKind",
  "shape",
  "refs",
  "frame",
  "extent",
  "quality",
  "spaceFrame",
  "name",
  "parent",
  "provenance",
  "validity",
  "invalidationReasons",
  "side",
];

/** Fields that MUST be absent on a kind (validator binding). */
function forbiddenFields(kind: ChangeKind): readonly RecordField[] {
  const allowed = new Set<string>(KIND_FIELDS[kind]);
  return ALL_PAYLOAD_FIELDS.filter((field) => !allowed.has(field as string));
}

/** The canonical content a record's identity binds. */
function recordContent(record: ChangeRecordInput): unknown {
  return [
    "history-change/v1",
    record.category,
    record.kind,
    historySubjectKey(record.subject),
    record.side ?? null,
    record.epistemic ?? null,
    record.presence ?? null,
    record.quantity ?? null,
    record.quantityDelta ?? null,
    record.singleQuantity ?? null,
    record.confidence ?? null,
    record.measurementKind ?? null,
    record.shape ?? null,
    record.refs ?? null,
    record.frame ?? null,
    record.extent ?? null,
    record.quality ?? null,
    record.spaceFrame ?? null,
    record.name ?? null,
    record.parent ?? null,
    record.provenance ?? null,
    record.validity ?? null,
    record.invalidationReasons ?? null,
    record.detail,
  ];
}

/** Derives the deterministic record identity from the record's content. */
export function deriveChangeId(record: ChangeRecordInput): string {
  return sha256Hex(canonicalJsonString(recordContent(record)));
}

/** Builds a change record, deriving its identity (fail-closed on shape violations). */
export function makeChange(record: ChangeRecordInput): ChangeRecord {
  checkRecordShapeInput(record);
  return Object.freeze({ ...record, changeId: deriveChangeId(record) }) as ChangeRecord;
}

/** Checks kind→field bindings and identity binding on a built record. */
export function checkRecordShape(record: ChangeRecord): void {
  checkRecordShapeInput(record);
  if (deriveChangeId(record) !== record.changeId) {
    throw new Error("changeId does not bind the record content");
  }
}

function checkRecordShapeInput(record: ChangeRecordInput): void {
  const required = KIND_FIELDS[record.kind];
  if (required === undefined) {
    throw new Error(`unregistered change kind: ${String(record.kind)}`);
  }
  for (const field of required) {
    if (record[field] === undefined && !OPTIONAL_FIELDS.has(field)) {
      throw new Error(`change kind "${record.kind}" requires field "${String(field)}"`);
    }
  }
  for (const field of forbiddenFields(record.kind)) {
    if (record[field] !== undefined) {
      throw new Error(`change kind "${record.kind}" forbids field "${String(field)}"`);
    }
  }
  if (typeof record.detail !== "string" || record.detail.length === 0) {
    throw new Error("change record requires a non-empty detail");
  }
  if (record.category !== categoryOfKind(record.kind)) {
    throw new Error(
      `change kind "${record.kind}" does not belong to category "${String(record.category)}"`,
    );
  }
}

/** The category a kind belongs to (kind↔category binding). */
export function categoryOfKind(kind: ChangeKind): ChangeCategory {
  if (kind.startsWith("object-")) return "object";
  if (kind.startsWith("geometry-")) return "geometry";
  if (kind.startsWith("property-")) return "property";
  if (kind.startsWith("space-")) return "space";
  if (kind.startsWith("relationship-")) return "relationship";
  return "evidence";
}

/** Canonical sort comparator for change records. */
export function compareRecords(a: ChangeRecord, b: ChangeRecord): number {
  const byCategory = CATEGORY_RANK[a.category] - CATEGORY_RANK[b.category];
  if (byCategory !== 0) return byCategory;
  const aKey = historySubjectKey(a.subject);
  const bKey = historySubjectKey(b.subject);
  if (aKey < bKey) return -1;
  if (aKey > bKey) return 1;
  const aRank = KIND_RANK[a.kind];
  const bRank = KIND_RANK[b.kind];
  if (aRank !== bRank) return aRank - bRank;
  if (a.changeId < b.changeId) return -1;
  if (a.changeId > b.changeId) return 1;
  return 0;
}
