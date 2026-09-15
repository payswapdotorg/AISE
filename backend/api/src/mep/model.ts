/**
 * AISE-034 — MEP (mechanical / electrical / plumbing) semantic primitives.
 *
 * SCOPE AND AUTHORITY (read this first — architecture-lock "Authority"):
 *
 *  - This module is the MEP VOCABULARY layer: pipe / duct / cable-tray /
 *    equipment semantic primitives plus the typed connection vocabulary that
 *    topology.ts validates. It is NOT a second canonical model: the Reality
 *    Graph (AISE-016) stays the only canonical engineering-model authority,
 *    and every primitive here REFERENCES reality content by stable id ONLY.
 *  - GEOMETRY IS NEVER OWNED HERE: a primitive carries an id-only link
 *    (`realityNodeId` + optional `sourceArtifactId`) or a TYPED omission
 *    (UNKNOWN / NOT_OBSERVED / OCCLUDED — never a silent default). The
 *    geometry library (AISE-013) owns computation; this file imports no
 *    geometry code because re-deriving dimensions here would re-own another
 *    authority's surface. A primitive with no geometry link at all is a
 *    typed refusal (`missing_geometry_link`) — absence must be stated.
 *  - PROPERTY-ASSERTION DISCIPLINE (spec/domain-model.md "Property assertion
 *    shape"; spec/requirements.md R7 — provenance, derivation method,
 *    epistemic status, confidence and, where applicable, measurement
 *    uncertainty/tolerance): every consequential assertion carries value,
 *    typed unit (REQUIRED for numeric values), epistemic status, derivation
 *    method, non-empty provenance, and optionally measurement uncertainty
 *    and/or confidence. The shared `EpistemicStatus` / `Uncertainty` /
 *    `Confidence` vocabularies are reused VERBATIM from
 *    @aise/shared-contracts — no second enums. CONFIDENCE IS NOT MEASUREMENT
 *    UNCERTAINTY: they are separate fields, separately validated, and no
 *    code path in this module converts one into the other; putting a
 *    Confidence object in the uncertainty slot (or vice versa) is a typed
 *    refusal whose detail says exactly that.
 *  - PROVENANCE records reuse the Reality Graph's `ProvenanceRecord` shape
 *    (type-only import, read-only): role vocabulary SUPPORTS|DERIVED_FROM|
 *    CONTEXT|CONTRADICTS (shared-contracts, verbatim), evidence ids are
 *    64-lowercase-hex content addresses of Evidence-Graph records (existence
 *    checking stays with the Evidence authority — this module stores
 *    explicit references only), `recordedAt` is caller-supplied ISO-8601 UTC
 *    (injected-clock discipline; this module never reads a clock), and every
 *    record must name at least one source.
 *  - SYSTEM ATTRIBUTES ARE TYPED, never free-form strings where a vocabulary
 *    exists: service (closed per-family vocabulary), voltage class, equipment
 *    kind, terminal direction, segment flow, nominal size (positive finite
 *    number + unit "mm" + optional uncertainty). `UNKNOWN`, `NOT_OBSERVED`
 *    and `OCCLUDED` are FIRST-CLASS values for every typed attribute — an
 *    unknown service is `"UNKNOWN"`, never "", null or a defaulted guess,
 *    and none of the three ever implies absence of the thing itself.
 *
 * DETERMINISM: no clock, no randomness, no I/O, no network. Records are plain
 * JSON data; canonical serialization is the shared `canonicalJsonStringify`;
 * content ids are sha-256 over domain-tagged canonical JSON
 * (`AISE-MEP-PRIMITIVE-V1` / `-CONNECTION-V1` / `-SYSTEM-V1`). Constructors
 * and boundary parsers share ONE validation path (house rule: in-process and
 * wire records validate identically), and every produced record is
 * DEEP-FROZEN (purity: consumers cannot corrupt shared fixtures).
 *
 * REFUSALS are always TYPED: `MepError` with a stable code from
 * MEP_ERROR_CODES (every failure mode DISTINCT), never a bare string error,
 * never a silent default. Graph-level incompatibilities (class / direction /
 * service / diameter / voltage mismatches, dangling endpoints …) are NOT
 * parse refusals — they are typed topology findings reported by
 * topology.ts; this file refuses only malformed or non-vocabulary records.
 */

import {
  CONFIDENCE_KINDS,
  EPISTEMIC_STATUSES,
  ISO_8601_UTC_PATTERN,
  PROVENANCE_ROLES,
  UNCERTAINTY_KINDS,
  canonicalJsonStringify,
  type Confidence,
  type EpistemicStatus,
  type Uncertainty,
} from "@aise/shared-contracts";
import { sha256Hex } from "../lib/hash";
import type { ProvenanceRecord } from "../reality/model";

/* ------------------------------------------------------------------ */
/* Vocabularies (frozen: `as const` types + Object.freeze runtime)      */
/* ------------------------------------------------------------------ */

/** The four MEP primitive families this module owns vocabulary for. */
export const MEP_FAMILIES = Object.freeze(["pipe", "duct", "cable_tray", "equipment"] as const);
export type MepFamily = (typeof MEP_FAMILIES)[number];

/** Pipe service vocabulary (closed — a non-vocabulary service is a typed refusal). */
export const PIPE_SERVICES = Object.freeze([
  "domestic_cold_water",
  "domestic_hot_water",
  "heating_supply",
  "heating_return",
  "drainage_waste",
  "gas",
  "sprinkler",
] as const);
export type PipeService = (typeof PIPE_SERVICES)[number];

/** Duct service vocabulary (closed). */
export const DUCT_SERVICES = Object.freeze([
  "supply_air",
  "return_air",
  "extract_air",
  "fresh_air",
] as const);
export type DuctService = (typeof DUCT_SERVICES)[number];

/** Cable-tray service vocabulary (closed). */
export const TRAY_SERVICES = Object.freeze([
  "power",
  "lighting_power",
  "data",
  "control",
  "fire_alarm",
] as const);
export type TrayService = (typeof TRAY_SERVICES)[number];

/** Union of all family service vocabularies (equipment terminals accept any). */
export type MepService = PipeService | DuctService | TrayService;

/** All MEP services in one frozen list (equipment-terminal vocabulary). */
export const ALL_MEP_SERVICES = Object.freeze([
  ...PIPE_SERVICES,
  ...DUCT_SERVICES,
  ...TRAY_SERVICES,
] as const satisfies readonly MepService[]);

/** Per-family service vocabularies (segment validation lookup). */
export const FAMILY_SERVICES: Readonly<Record<MepFamily, readonly MepService[]>> = Object.freeze({
  pipe: PIPE_SERVICES,
  duct: DUCT_SERVICES,
  cable_tray: TRAY_SERVICES,
  equipment: ALL_MEP_SERVICES,
});

/**
 * Connection port classes — the medium a port/terminal carries. A port
 * connects ONLY to a port of a compatible class (topology.ts enforces it;
 * class equality is the rule). For SEGMENT endpoints the class is DERIVED
 * from the service via the frozen SERVICE_PORT_CLASSES table (single source
 * of truth); for equipment terminals it is declared explicitly per terminal.
 */
export const PORT_CLASSES = Object.freeze(["water", "waste", "gas", "air", "power", "signal"] as const);
export type PortClass = (typeof PORT_CLASSES)[number];

/** Frozen service → port-class mapping (total over every MEP service). */
export const SERVICE_PORT_CLASSES: Readonly<Record<MepService, PortClass>> = Object.freeze({
  domestic_cold_water: "water",
  domestic_hot_water: "water",
  heating_supply: "water",
  heating_return: "water",
  drainage_waste: "waste",
  gas: "gas",
  sprinkler: "water",
  supply_air: "air",
  return_air: "air",
  extract_air: "air",
  fresh_air: "air",
  power: "power",
  lighting_power: "power",
  data: "signal",
  control: "signal",
  fire_alarm: "signal",
});

/** Voltage classes for electrical endpoints (typed, closed). */
export const VOLTAGE_CLASSES = Object.freeze(["ELV", "LV", "MV", "HV"] as const);
export type VoltageClass = (typeof VOLTAGE_CLASSES)[number];

/** Equipment kind vocabulary (typed in/out terminal carriers). */
export const EQUIPMENT_KINDS = Object.freeze([
  "pump",
  "valve",
  "tee",
  "reducer",
  "cap",
  "air_handler",
  "fan_coil_unit",
  "vav_box",
  "diffuser",
  "grille",
  "boiler",
  "chiller",
  "water_heater",
  "distribution_board",
  "junction_box",
  "panel",
  "transformer",
  "sensor",
] as const);
export type EquipmentKind = (typeof EQUIPMENT_KINDS)[number];

/**
 * Equipment terminal directions — equipment has TYPED in/out terminals.
 * `inlet` maps to endpoint direction "in", `outlet` to "out".
 */
export const TERMINAL_DIRECTIONS = Object.freeze(["inlet", "outlet", "bidirectional"] as const);
export type TerminalDirection = (typeof TERMINAL_DIRECTIONS)[number];

/**
 * Segment flow vocabulary: for `a_to_b` content enters at port a and leaves
 * at port b (port a = "in", port b = "out"); `b_to_a` is the mirror;
 * `bidirectional` makes both ports bidirectional.
 */
export const SEGMENT_FLOWS = Object.freeze(["a_to_b", "b_to_a", "bidirectional"] as const);
export type SegmentFlow = (typeof SEGMENT_FLOWS)[number];

/**
 * Honest-absence values (architecture-lock "Truth and uncertainty"):
 * `UNKNOWN`, `NOT_OBSERVED` and `OCCLUDED` are FIRST-CLASS attribute values.
 * They never imply absence of the thing itself and are never silently
 * defaulted — a typed attribute is either a vocabulary value or one of
 * these, and the boundary parser refuses everything else.
 */
export const ABSENCE_KINDS = Object.freeze(["UNKNOWN", "NOT_OBSERVED", "OCCLUDED"] as const);
export type AbsenceKind = (typeof ABSENCE_KINDS)[number];

/** Segment families (the three run kinds). */
export type SegmentFamily = Exclude<MepFamily, "equipment">;

/* ------------------------------------------------------------------ */
/* Typed errors (stable codes; every failure mode DISTINCT)             */
/* ------------------------------------------------------------------ */

export const MEP_ERROR_CODES = Object.freeze([
  // shape / discriminator validation
  "invalid_primitive",
  "invalid_family",
  "invalid_connection",
  "invalid_system",
  "invalid_id",
  // vocabulary validation (typed attributes)
  "invalid_service",
  "invalid_equipment_kind",
  "invalid_port_class",
  "invalid_voltage_class",
  "invalid_terminal_direction",
  "invalid_flow",
  "invalid_absence",
  // quantity / nominal size validation
  "invalid_quantity",
  "invalid_nominal_size",
  // assertion discipline (property assertion shape)
  "invalid_property",
  "numeric_property_without_unit",
  "invalid_epistemic_status",
  "invalid_confidence",
  "invalid_uncertainty",
  "missing_method",
  // provenance / evidence discipline
  "invalid_provenance",
  "invalid_evidence_id",
  "invalid_timestamp",
  "missing_provenance",
  // geometry linkage (id-only references or typed omission — never silent)
  "invalid_geometry_link",
  "missing_geometry_link",
  // equipment terminals
  "invalid_terminals",
  "duplicate_terminal_id",
  // structural duplicates inside one system / one primitive
  "duplicate_property_key",
  "duplicate_primitive_id",
  "duplicate_connection_id",
  // endpoint references on connections
  "invalid_endpoint_ref",
] as const);
export type MepErrorCode = (typeof MEP_ERROR_CODES)[number];

/** Typed rejection carrying a stable code (never a bare string error). */
export class MepError extends Error {
  readonly code: MepErrorCode;
  readonly detail: string;

  constructor(code: MepErrorCode, detail: string) {
    super(`${code}: ${detail}`);
    this.name = "MepError";
    this.code = code;
    this.detail = detail;
  }
}

/** Type guard for MepError (rethrown foreign errors stay foreign). */
export function isMepError(error: unknown): error is MepError {
  return error instanceof MepError;
}

/* ------------------------------------------------------------------ */
/* Quantities with honest absence                                       */
/* ------------------------------------------------------------------ */

/**
 * A known quantity: finite value + typed unit + optional measurement
 * uncertainty (never a confidence — see the module header).
 */
export interface PresentQuantity {
  readonly presence: "PRESENT";
  readonly value: number;
  readonly unit: string;
  readonly uncertainty?: Uncertainty;
}

/**
 * An honestly-absent quantity: which of UNKNOWN / NOT_OBSERVED / OCCLUDED
 * it is stays recorded verbatim (they are distinct states, never coerced),
 * plus an optional bounded explanation.
 */
export interface AbsentQuantity {
  readonly presence: AbsenceKind;
  readonly detail?: string;
}

/** Nominal size / diameter / width as a quantity or a typed absence. */
export type MepQuantity = PresentQuantity | AbsentQuantity;

/* ------------------------------------------------------------------ */
/* Property assertions (the domain-model "Property assertion shape")     */
/* ------------------------------------------------------------------ */

/**
 * One consequential property assertion on an MEP primitive — the MEP
 * vocabulary's carrier for the spec/domain-model.md property-assertion
 * shape: value, unit (required for numeric values), epistemic status
 * (shared vocabulary, verbatim), optional confidence (belief support),
 * optional measurement uncertainty (a property of the measurement — the
 * two are never interchangeable), derivation method (required, R7) and
 * non-empty provenance (`source_evidence` in the domain-model naming;
 * carried as Reality-Graph-shaped provenance records here).
 */
export interface MepPropertyAssertion {
  readonly key: string;
  readonly value: string | number | boolean;
  /** REQUIRED for numeric values; must be absent for non-numeric values. */
  readonly unit?: string;
  readonly epistemicStatus: EpistemicStatus;
  /** Optional probabilistic/qualitative support. NEVER a substitute for uncertainty. */
  readonly confidence?: Confidence;
  /** Optional measurement uncertainty/tolerance where applicable. */
  readonly uncertainty?: Uncertainty;
  /** How the value was obtained or derived (R7: required, bounded text). */
  readonly method: string;
  readonly provenance: readonly ProvenanceRecord[];
}

/* ------------------------------------------------------------------ */
/* Geometry linkage (id-only reference or typed omission)               */
/* ------------------------------------------------------------------ */

/**
 * Geometry is REFERENCED, never owned: `realityNodeId` is the stable id of
 * the Reality Graph node that owns the geometry (the Reality Graph and the
 * geometry library own all geometry and measurement; this module never
 * re-derives either), with an optional source artifact id.
 */
export interface ReferencedGeometry {
  readonly link: "referenced";
  readonly realityNodeId: string;
  readonly sourceArtifactId?: string;
}

/**
 * An honest geometry omission: the primitive exists but its geometry link
 * could not be established, and WHY is typed (UNKNOWN / NOT_OBSERVED /
 * OCCLUDED — distinct states, never a silent default, never implying the
 * primitive does not exist).
 */
export interface OmittedGeometry {
  readonly link: "omitted";
  readonly omission: AbsenceKind;
  readonly detail?: string;
}

export type MepGeometryLink = ReferencedGeometry | OmittedGeometry;

/* ------------------------------------------------------------------ */
/* Primitives                                                           */
/* ------------------------------------------------------------------ */

/** Fields every MEP primitive carries (the assertion discipline baseline). */
export interface MepPrimitiveBase {
  /** Caller-supplied stable id (opaque, 1..256 chars — StableId semantics). */
  readonly primitiveId: string;
  readonly family: MepFamily;
  /** Shared epistemic vocabulary, verbatim; this module never assigns it. */
  readonly epistemicStatus: EpistemicStatus;
  /** Non-empty provenance (every consequential assertion carries it). */
  readonly provenance: readonly ProvenanceRecord[];
  /** Id-only geometry reference or a typed omission — never silent. */
  readonly geometry: MepGeometryLink;
  /** Additional typed property assertions (assertion-shape discipline). */
  readonly properties: readonly MepPropertyAssertion[];
  readonly note?: string;
}

/** A pipe run primitive. */
export interface MepPipe extends MepPrimitiveBase {
  readonly family: "pipe";
  readonly service: PipeService | AbsenceKind;
  /** Nominal diameter in mm (or a typed absence — never a guessed 0). */
  readonly nominalSize: MepQuantity;
  readonly flow: SegmentFlow | AbsenceKind;
  /** Optional voltage class (typed; meaningful mainly for trays). */
  readonly voltageClass?: VoltageClass | AbsenceKind;
}

/** A duct run primitive. */
export interface MepDuct extends MepPrimitiveBase {
  readonly family: "duct";
  readonly service: DuctService | AbsenceKind;
  /** Nominal (equivalent) diameter in mm, or a typed absence. */
  readonly nominalSize: MepQuantity;
  readonly flow: SegmentFlow | AbsenceKind;
  readonly voltageClass?: VoltageClass | AbsenceKind;
}

/** A cable-tray run primitive. */
export interface MepCableTray extends MepPrimitiveBase {
  readonly family: "cable_tray";
  readonly service: TrayService | AbsenceKind;
  /** Nominal tray width in mm (the tray analogue of a nominal diameter). */
  readonly nominalSize: MepQuantity;
  readonly flow: SegmentFlow | AbsenceKind;
  readonly voltageClass?: VoltageClass | AbsenceKind;
}

/**
 * A typed in/out terminal on equipment. Every attribute is explicit: a
 * value from its vocabulary or a typed absence (UNKNOWN / NOT_OBSERVED /
 * OCCLUDED) — an UNKNOWN terminal state is what makes topology hops
 * honestly unvalidatable (topology.ts reports them, never guesses).
 */
export interface MepEquipmentTerminal {
  readonly terminalId: string;
  readonly direction: TerminalDirection | AbsenceKind;
  readonly portClass: PortClass | AbsenceKind;
  readonly service: MepService | AbsenceKind;
  readonly nominalSize: MepQuantity;
  readonly voltageClass?: VoltageClass | AbsenceKind;
}

/** An equipment primitive with typed terminals. */
export interface MepEquipment extends MepPrimitiveBase {
  readonly family: "equipment";
  readonly equipmentKind: EquipmentKind;
  /** Equipment-level voltage class (typed system attribute). */
  readonly voltageClass?: VoltageClass | AbsenceKind;
  /** Typed in/out terminals (possibly empty — e.g. a standalone sensor). */
  readonly terminals: readonly MepEquipmentTerminal[];
}

export type MepPrimitive = MepPipe | MepDuct | MepCableTray | MepEquipment;
export type MepSegment = MepPipe | MepDuct | MepCableTray;

/* ------------------------------------------------------------------ */
/* Connections and systems                                              */
/* ------------------------------------------------------------------ */

/**
 * A typed endpoint reference: a segment port (every segment has exactly the
 * two structural ports "a" and "b") or an equipment terminal. Connections
 * never carry coordinates or geometry — connectivity is semantic.
 */
export type MepEndpointRef =
  | { readonly segmentId: string; readonly port: "a" | "b" }
  | { readonly equipmentId: string; readonly terminalId: string };

/**
 * A typed connection between two endpoints. Connection EXISTENCE is a
 * consequential assertion: it carries the shared epistemic status and
 * non-empty provenance like every other assertion in this module.
 */
export interface MepConnection {
  readonly connectionId: string;
  readonly from: MepEndpointRef;
  readonly to: MepEndpointRef;
  readonly epistemicStatus: EpistemicStatus;
  readonly provenance: readonly ProvenanceRecord[];
}

/**
 * A whole MEP system: a set of primitives plus the connections between
 * their endpoints. The canonical order is id-sorted (input order is not
 * data): `parseMepSystem` normalizes, so two inputs differing only in
 * listing order produce byte-identical systems.
 */
export interface MepSystem {
  readonly systemId: string;
  readonly primitives: readonly MepPrimitive[];
  readonly connections: readonly MepConnection[];
}

/* ------------------------------------------------------------------ */
/* Draft input types (constructors — no defaults for epistemic fields)  */
/* ------------------------------------------------------------------ */

/**
 * Segment draft: the caller MUST state service, nominal size, flow,
 * epistemic status, provenance and the geometry link — there are no
 * defaults to silently fall into (an unknown must be typed as such).
 */
export interface MepSegmentDraft {
  readonly primitiveId: string;
  readonly service: MepService | AbsenceKind;
  readonly nominalSize: MepQuantity;
  readonly flow: SegmentFlow | AbsenceKind;
  readonly epistemicStatus: EpistemicStatus;
  readonly provenance: readonly ProvenanceRecord[];
  readonly geometry: MepGeometryLink;
  readonly voltageClass?: VoltageClass | AbsenceKind;
  readonly properties?: readonly MepPropertyAssertion[];
  readonly note?: string;
}

/** Equipment draft (terminals are required, possibly empty). */
export interface MepEquipmentDraft {
  readonly primitiveId: string;
  readonly equipmentKind: EquipmentKind;
  readonly terminals: readonly MepEquipmentTerminal[];
  readonly epistemicStatus: EpistemicStatus;
  readonly provenance: readonly ProvenanceRecord[];
  readonly geometry: MepGeometryLink;
  readonly voltageClass?: VoltageClass | AbsenceKind;
  readonly properties?: readonly MepPropertyAssertion[];
  readonly note?: string;
}

/** Connection draft. */
export interface MepConnectionDraft {
  readonly connectionId: string;
  readonly from: MepEndpointRef;
  readonly to: MepEndpointRef;
  readonly epistemicStatus: EpistemicStatus;
  readonly provenance: readonly ProvenanceRecord[];
}

/** System draft. */
export interface MepSystemDraft {
  readonly systemId: string;
  readonly primitives: readonly MepPrimitive[];
  readonly connections: readonly MepConnection[];
}

/* ------------------------------------------------------------------ */
/* Internal validation helpers                                          */
/* ------------------------------------------------------------------ */

const ISO_UTC = new RegExp(ISO_8601_UTC_PATTERN);
const CONTENT_ID = /^[0-9a-f]{64}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isId(value: unknown): value is string {
  return typeof value === "string" && value.length >= 1 && value.length <= 256;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isAbsenceKind(value: unknown): value is AbsenceKind {
  return typeof value === "string" && (ABSENCE_KINDS as readonly string[]).includes(value);
}

function isEpistemicStatus(value: unknown): value is EpistemicStatus {
  return typeof value === "string" && (EPISTEMIC_STATUSES as readonly string[]).includes(value);
}

function isProvenanceRole(value: unknown): value is ProvenanceRecord["role"] {
  return typeof value === "string" && (PROVENANCE_ROLES as readonly string[]).includes(value);
}

function isUncertaintyKind(value: unknown): value is Uncertainty["kind"] {
  return typeof value === "string" && (UNCERTAINTY_KINDS as readonly string[]).includes(value);
}

function isConfidenceKind(value: unknown): value is Confidence["kind"] {
  return typeof value === "string" && (CONFIDENCE_KINDS as readonly string[]).includes(value);
}

/** Deterministic description of an offending value for refusal details. */
function describeValue(value: unknown): string {
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (Array.isArray(value)) return "an array";
  return "an object";
}

/** Recursively freeze plain JSON data (records are data only — no cycles). */
function deepFreeze<T>(value: T): T {
  if (Array.isArray(value)) {
    for (const item of value) {
      deepFreeze(item);
    }
    return Object.freeze(value);
  }
  if (value !== null && typeof value === "object") {
    for (const key of Object.getOwnPropertyNames(value)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
    return Object.freeze(value);
  }
  return value;
}

/** UTF-16 code-unit order comparison (locale-independent, deterministic). */
function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function requireId(value: unknown, what: string): string {
  if (!isId(value)) {
    throw new MepError("invalid_id", `${what}: must be a non-empty string (<=256 chars); got ${describeValue(value)}`);
  }
  return value;
}

function requireIsoTimestamp(value: unknown, what: string): string {
  if (typeof value !== "string" || !ISO_UTC.test(value)) {
    throw new MepError(
      "invalid_timestamp",
      `${what}: must be ISO 8601 UTC with millisecond precision and Z suffix; got ${describeValue(value)}`,
    );
  }
  return value;
}

/** Optional bounded text: absent (undefined/null) → undefined, else validated. */
function optionalBoundedText(
  value: unknown,
  what: string,
  code: MepErrorCode,
): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== "string" || value.length < 1 || value.length > 4096) {
    throw new MepError(code, `${what}: must be bounded text (1..4096 chars)`);
  }
  return value;
}

/* ------------------------------------------------------------------ */
/* Uncertainty / confidence policy (typed, never conflated)             */
/* ------------------------------------------------------------------ */

/**
 * Parse an optional measurement uncertainty. Per-kind requirements follow
 * the shared-contract policy (DIMENSIONAL → plusMinus; STATISTICAL →
 * plusMinus + level; INTERVAL → lower ≤ upper). A Confidence object here
 * is a typed refusal — confidence is support for a belief, uncertainty is
 * a property of the measurement, and they are never interchangeable.
 */
function parseOptionalUncertainty(value: unknown, where: string): Uncertainty | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (!isRecord(value)) {
    throw new MepError("invalid_uncertainty", `${where}: must be an object`);
  }
  const kind = value["kind"];
  if (!isUncertaintyKind(kind)) {
    throw new MepError(
      "invalid_uncertainty",
      `${where}: kind must be one of ${UNCERTAINTY_KINDS.join("|")} (a confidence object does not belong here — confidence is never measurement uncertainty); got ${describeValue(kind)}`,
    );
  }
  const plusMinus = value["plusMinus"];
  if (plusMinus !== undefined && plusMinus !== null && !(isFiniteNumber(plusMinus) && plusMinus >= 0)) {
    throw new MepError("invalid_uncertainty", `${where}: plusMinus must be a finite number >= 0`);
  }
  const level = optionalBoundedText(value["level"], `${where} level`, "invalid_uncertainty");
  const lower = value["lower"];
  const upper = value["upper"];
  if (lower !== undefined && lower !== null && !isFiniteNumber(lower)) {
    throw new MepError("invalid_uncertainty", `${where}: lower must be a finite number`);
  }
  if (upper !== undefined && upper !== null && !isFiniteNumber(upper)) {
    throw new MepError("invalid_uncertainty", `${where}: upper must be a finite number`);
  }
  if (kind === "DIMENSIONAL" && !isFiniteNumber(plusMinus)) {
    throw new MepError("invalid_uncertainty", `${where}: DIMENSIONAL uncertainty requires plusMinus`);
  }
  if (kind === "STATISTICAL" && (!isFiniteNumber(plusMinus) || level === undefined)) {
    throw new MepError(
      "invalid_uncertainty",
      `${where}: STATISTICAL uncertainty requires plusMinus and level`,
    );
  }
  if (kind === "INTERVAL") {
    if (!isFiniteNumber(lower) || !isFiniteNumber(upper)) {
      throw new MepError("invalid_uncertainty", `${where}: INTERVAL uncertainty requires lower and upper`);
    }
    if (lower > upper) {
      throw new MepError(
        "invalid_uncertainty",
        `${where}: INTERVAL lower must not exceed upper (got ${String(lower)} > ${String(upper)})`,
      );
    }
  }
  return deepFreeze({
    kind,
    ...(isFiniteNumber(plusMinus) ? { plusMinus } : {}),
    ...(level === undefined ? {} : { level }),
    ...(isFiniteNumber(lower) ? { lower } : {}),
    ...(isFiniteNumber(upper) ? { upper } : {}),
  });
}

/**
 * Parse an optional confidence. PROBABILISTIC values are probabilities in
 * [0,1]; QUALITATIVE values are non-negative ordinals on the (optional)
 * basis scale. An Uncertainty object here is a typed refusal.
 */
function parseOptionalConfidence(value: unknown, where: string): Confidence | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (!isRecord(value)) {
    throw new MepError("invalid_confidence", `${where}: must be an object`);
  }
  const kind = value["kind"];
  if (!isConfidenceKind(kind)) {
    throw new MepError(
      "invalid_confidence",
      `${where}: kind must be one of ${CONFIDENCE_KINDS.join("|")} (an uncertainty object does not belong here — measurement uncertainty is never confidence); got ${describeValue(kind)}`,
    );
  }
  const confidenceValue = value["value"];
  if (!isFiniteNumber(confidenceValue) || confidenceValue < 0) {
    throw new MepError("invalid_confidence", `${where}: value must be a finite number >= 0`);
  }
  if (kind === "PROBABILISTIC" && confidenceValue > 1) {
    throw new MepError(
      "invalid_confidence",
      `${where}: PROBABILISTIC value must be a probability in [0,1]; got ${String(confidenceValue)}`,
    );
  }
  const basis = optionalBoundedText(value["basis"], `${where} basis`, "invalid_confidence");
  return deepFreeze({
    kind,
    value: confidenceValue,
    ...(basis === undefined ? {} : { basis }),
  });
}

/* ------------------------------------------------------------------ */
/* Provenance (Reality-Graph record discipline, mirrored)               */
/* ------------------------------------------------------------------ */

function parseProvenanceRecord(value: unknown, where: string): ProvenanceRecord {
  if (!isRecord(value)) {
    throw new MepError("invalid_provenance", `${where}: not an object`);
  }
  const role = value["role"];
  if (!isProvenanceRole(role)) {
    throw new MepError(
      "invalid_provenance",
      `${where}: role must be one of ${PROVENANCE_ROLES.join("|")}`,
    );
  }
  const recordedAt = requireIsoTimestamp(value["recordedAt"], `${where} recordedAt`);
  const evidenceId = value["evidenceId"];
  if (evidenceId !== undefined && evidenceId !== null && !(typeof evidenceId === "string" && CONTENT_ID.test(evidenceId))) {
    throw new MepError(
      "invalid_evidence_id",
      `${where}: evidenceId must be a content address (64 lowercase hex); got ${describeValue(evidenceId)}`,
    );
  }
  const sourceArtifactId = value["sourceArtifactId"];
  if (sourceArtifactId !== undefined && sourceArtifactId !== null && !isId(sourceArtifactId)) {
    throw new MepError("invalid_provenance", `${where}: sourceArtifactId must be a non-empty string`);
  }
  const derivationNote = value["derivationNote"];
  if (
    derivationNote !== undefined &&
    derivationNote !== null &&
    (typeof derivationNote !== "string" || derivationNote.length < 1 || derivationNote.length > 4096)
  ) {
    throw new MepError("invalid_provenance", `${where}: derivationNote must be bounded text`);
  }
  if (
    (evidenceId === undefined || evidenceId === null) &&
    sourceArtifactId === undefined &&
    (derivationNote === undefined || derivationNote === null)
  ) {
    throw new MepError(
      "invalid_provenance",
      `${where}: names no source (need evidenceId, sourceArtifactId or derivationNote)`,
    );
  }
  return deepFreeze({
    role,
    ...(evidenceId === undefined || evidenceId === null ? {} : { evidenceId }),
    ...(sourceArtifactId === undefined || sourceArtifactId === null ? {} : { sourceArtifactId }),
    ...(derivationNote === undefined || derivationNote === null ? {} : { derivationNote }),
    recordedAt,
  });
}

function parseProvenanceList(value: unknown, where: string): readonly ProvenanceRecord[] {
  if (value === undefined || value === null) {
    throw new MepError("missing_provenance", `${where}: at least one provenance record is required`);
  }
  if (!Array.isArray(value)) {
    throw new MepError("invalid_provenance", `${where}: expected an array`);
  }
  if (value.length === 0) {
    throw new MepError("missing_provenance", `${where}: at least one provenance record is required`);
  }
  const records = value.map((entry, index) =>
    parseProvenanceRecord(entry, `${where}[${String(index)}]`),
  );
  return deepFreeze(records);
}

/* ------------------------------------------------------------------ */
/* Quantities and typed attributes                                      */
/* ------------------------------------------------------------------ */

/**
 * Parse a nominal size (diameter for pipes/ducts, width for trays):
 * PRESENT requires a finite value > 0 and unit "mm" (the module's fixed
 * size unit — a typed refusal names any other unit); an absence keeps its
 * kind verbatim. Uncertainty, when present, follows the per-kind policy.
 */
function parseNominalSize(value: unknown, where: string): MepQuantity {
  if (!isRecord(value)) {
    throw new MepError(
      "invalid_quantity",
      `${where}: nominal size must be an object with a presence discriminator (PRESENT|UNKNOWN|NOT_OBSERVED|OCCLUDED)`,
    );
  }
  const presence = value["presence"];
  if (presence === "PRESENT") {
    const sizeValue = value["value"];
    if (!isFiniteNumber(sizeValue) || sizeValue <= 0) {
      throw new MepError(
        "invalid_nominal_size",
        `${where}: PRESENT nominal size requires a finite value > 0; got ${describeValue(sizeValue)}`,
      );
    }
    const unit = value["unit"];
    if (unit !== "mm") {
      throw new MepError(
        "invalid_nominal_size",
        `${where}: nominal size unit must be "mm"; got ${describeValue(unit)}`,
      );
    }
    const uncertainty = parseOptionalUncertainty(value["uncertainty"], `${where} uncertainty`);
    return deepFreeze({
      presence: "PRESENT",
      value: sizeValue,
      unit: "mm",
      ...(uncertainty === undefined ? {} : { uncertainty }),
    });
  }
  if (isAbsenceKind(presence)) {
    const detail = optionalBoundedText(value["detail"], `${where} detail`, "invalid_absence");
    return deepFreeze({ presence, ...(detail === undefined ? {} : { detail }) });
  }
  throw new MepError(
    "invalid_quantity",
    `${where}: presence must be PRESENT|UNKNOWN|NOT_OBSERVED|OCCLUDED; got ${describeValue(presence)}`,
  );
}

/** Parse a typed service: family vocabulary value or a typed absence. */
function parseService(
  value: unknown,
  allowed: readonly MepService[],
  what: string,
  where: string,
): MepService | AbsenceKind {
  if (isAbsenceKind(value)) {
    return value;
  }
  if (typeof value === "string" && (allowed as readonly string[]).includes(value)) {
    return value as MepService;
  }
  throw new MepError(
    "invalid_service",
    `${where}: ${what} must be one of ${allowed.join("|")} or an absence (UNKNOWN|NOT_OBSERVED|OCCLUDED); got ${describeValue(value)}`,
  );
}

/** Parse a typed vocabulary attribute or absence (single shared path). */
function parseVocabularyValue<T extends string>(
  value: unknown,
  vocabulary: readonly T[],
  code: MepErrorCode,
  what: string,
  where: string,
): T | AbsenceKind {
  if (isAbsenceKind(value)) {
    return value;
  }
  if (typeof value === "string" && (vocabulary as readonly string[]).includes(value)) {
    return value as T;
  }
  throw new MepError(
    code,
    `${where}: ${what} must be one of ${vocabulary.join("|")} or an absence (UNKNOWN|NOT_OBSERVED|OCCLUDED); got ${describeValue(value)}`,
  );
}

/**
 * Parse an optional voltage class: absent (undefined/null) means "no
 * voltage class asserted" (kept distinct from the typed absences); present
 * values must be in the vocabulary or a typed absence.
 */
function parseOptionalVoltageClass(
  value: unknown,
  where: string,
): VoltageClass | AbsenceKind | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (isAbsenceKind(value)) {
    return value;
  }
  if (typeof value === "string" && (VOLTAGE_CLASSES as readonly string[]).includes(value)) {
    return value as VoltageClass;
  }
  throw new MepError(
    "invalid_voltage_class",
    `${where}: voltage class must be one of ${VOLTAGE_CLASSES.join("|")}, an absence (UNKNOWN|NOT_OBSERVED|OCCLUDED) or absent (unasserted); got ${describeValue(value)}`,
  );
}

/* ------------------------------------------------------------------ */
/* Geometry linkage, properties, terminals                              */
/* ------------------------------------------------------------------ */

function parseGeometryLink(value: unknown, where: string): MepGeometryLink {
  if (!isRecord(value)) {
    throw new MepError("invalid_geometry_link", `${where}: geometry link must be an object`);
  }
  const link = value["link"];
  if (link === "referenced") {
    const realityNodeId = requireId(value["realityNodeId"], `${where} realityNodeId`);
    const sourceArtifactId = value["sourceArtifactId"];
    if (sourceArtifactId !== undefined && sourceArtifactId !== null && !isId(sourceArtifactId)) {
      throw new MepError("invalid_geometry_link", `${where}: sourceArtifactId must be a non-empty string`);
    }
    return deepFreeze({
      link: "referenced",
      realityNodeId,
      ...(sourceArtifactId === undefined || sourceArtifactId === null
        ? {}
        : { sourceArtifactId }),
    });
  }
  if (link === "omitted") {
    const omission = value["omission"];
    if (!isAbsenceKind(omission)) {
      throw new MepError(
        "invalid_absence",
        `${where}: geometry omission must be one of ${ABSENCE_KINDS.join("|")}; got ${describeValue(omission)}`,
      );
    }
    const detail = optionalBoundedText(value["detail"], `${where} detail`, "invalid_geometry_link");
    return deepFreeze({ link: "omitted", omission, ...(detail === undefined ? {} : { detail }) });
  }
  throw new MepError(
    "invalid_geometry_link",
    `${where}: link must be "referenced" or "omitted"; got ${describeValue(link)}`,
  );
}

function parsePropertyAssertion(value: unknown, where: string): MepPropertyAssertion {
  if (!isRecord(value)) {
    throw new MepError("invalid_property", `${where}: not an object`);
  }
  const key = value["key"];
  if (!isId(key)) {
    throw new MepError("invalid_property", `${where}: missing/invalid key`);
  }
  const propertyValue = value["value"];
  if (
    typeof propertyValue !== "string" &&
    typeof propertyValue !== "boolean" &&
    !isFiniteNumber(propertyValue)
  ) {
    throw new MepError(
      "invalid_property",
      `${where}: value must be a finite number, string or boolean`,
    );
  }
  const epistemicStatus = value["epistemicStatus"];
  if (!isEpistemicStatus(epistemicStatus)) {
    throw new MepError(
      "invalid_epistemic_status",
      `${where}: epistemicStatus must be one of ${EPISTEMIC_STATUSES.join("|")}`,
    );
  }
  const unit = value["unit"];
  if (typeof propertyValue === "number") {
    if (typeof unit !== "string" || unit.length < 1 || unit.length > 256) {
      throw new MepError(
        "numeric_property_without_unit",
        `${where}: numeric value requires a typed unit`,
      );
    }
  } else if (unit !== undefined && unit !== null) {
    throw new MepError(
      "invalid_property",
      `${where}: unit is only applicable to numeric values`,
    );
  }
  const method = value["method"];
  if (typeof method !== "string" || method.length < 1 || method.length > 4096) {
    throw new MepError(
      "missing_method",
      `${where}: derivation method is required (bounded text, R7 provenance discipline)`,
    );
  }
  const confidence = parseOptionalConfidence(value["confidence"], `${where} confidence`);
  const uncertainty = parseOptionalUncertainty(value["uncertainty"], `${where} uncertainty`);
  if (uncertainty !== undefined && typeof propertyValue !== "number") {
    throw new MepError(
      "invalid_uncertainty",
      `${where}: measurement uncertainty applies only to numeric values`,
    );
  }
  const provenance = parseProvenanceList(value["provenance"], `${where} provenance`);
  return deepFreeze({
    key,
    value: propertyValue,
    ...(unit === undefined || unit === null ? {} : { unit }),
    epistemicStatus,
    ...(confidence === undefined ? {} : { confidence }),
    ...(uncertainty === undefined ? {} : { uncertainty }),
    method,
    provenance,
  });
}

function parsePropertyList(value: unknown, where: string): readonly MepPropertyAssertion[] {
  if (value === undefined) {
    return deepFreeze([]);
  }
  if (value === null || !Array.isArray(value)) {
    throw new MepError("invalid_property", `${where}: must be an array`);
  }
  const seen = new Set<string>();
  const properties = value.map((entry, index) => {
    const property = parsePropertyAssertion(entry, `${where}[${String(index)}]`);
    if (seen.has(property.key)) {
      throw new MepError(
        "duplicate_property_key",
        `${where}: duplicate property key ${JSON.stringify(property.key)}`,
      );
    }
    seen.add(property.key);
    return property;
  });
  return deepFreeze(properties);
}

function parseTerminals(value: unknown, where: string): readonly MepEquipmentTerminal[] {
  if (!Array.isArray(value)) {
    throw new MepError(
      "invalid_terminals",
      `${where}: equipment requires an explicit terminals array (possibly empty)`,
    );
  }
  const seen = new Set<string>();
  const terminals = value.map((entry, index) => {
    const terminalWhere = `${where}[${String(index)}]`;
    if (!isRecord(entry)) {
      throw new MepError("invalid_terminals", `${terminalWhere}: not an object`);
    }
    const terminalId = requireId(entry["terminalId"], `${terminalWhere} terminalId`);
    if (seen.has(terminalId)) {
      throw new MepError(
        "duplicate_terminal_id",
        `${where}: duplicate terminal id ${JSON.stringify(terminalId)}`,
      );
    }
    seen.add(terminalId);
    const direction = parseVocabularyValue(
      entry["direction"],
      TERMINAL_DIRECTIONS,
      "invalid_terminal_direction",
      "terminal direction",
      terminalWhere,
    );
    const portClass = parseVocabularyValue(
      entry["portClass"],
      PORT_CLASSES,
      "invalid_port_class",
      "terminal port class",
      terminalWhere,
    );
    const service = parseService(
      entry["service"],
      ALL_MEP_SERVICES,
      "terminal service",
      terminalWhere,
    );
    const nominalSize = parseNominalSize(entry["nominalSize"], `${terminalWhere} nominalSize`);
    const voltageClass = parseOptionalVoltageClass(entry["voltageClass"], `${terminalWhere} voltageClass`);
    return deepFreeze({
      terminalId,
      direction,
      portClass,
      service,
      nominalSize,
      ...(voltageClass === undefined ? {} : { voltageClass }),
    });
  });
  return deepFreeze(terminals);
}

/* ------------------------------------------------------------------ */
/* Primitive parsing (single path for in-process AND wire records)      */
/* ------------------------------------------------------------------ */

/** Common base fields for every family. */
function parsePrimitiveBase(
  value: Record<string, unknown>,
  family: MepFamily,
  where: string,
): Omit<MepPrimitiveBase, "family"> {
  const primitiveId = requireId(value["primitiveId"], `${where} primitiveId`);
  const epistemicStatus = value["epistemicStatus"];
  if (!isEpistemicStatus(epistemicStatus)) {
    throw new MepError(
      "invalid_epistemic_status",
      `${where}: epistemicStatus must be one of ${EPISTEMIC_STATUSES.join("|")}; got ${describeValue(epistemicStatus)}`,
    );
  }
  const provenance = parseProvenanceList(value["provenance"], `${where} provenance`);
  const rawGeometry = value["geometry"];
  if (rawGeometry === undefined || rawGeometry === null) {
    throw new MepError(
      "missing_geometry_link",
      `${where}: a primitive must either reference reality-graph geometry (link "referenced") or declare a typed omission (link "omitted") — geometry absence must be stated, never silent`,
    );
  }
  const geometry = parseGeometryLink(rawGeometry, `${where} geometry`);
  const properties = parsePropertyList(value["properties"], `${where} properties`);
  const note = optionalBoundedText(value["note"], `${where} note`, "invalid_primitive");
  return {
    primitiveId,
    epistemicStatus,
    provenance,
    geometry,
    properties,
    ...(note === undefined ? {} : { note }),
  };
}

function parseSegmentPrimitive(value: Record<string, unknown>, family: SegmentFamily): MepSegment {
  const primitiveId = requireId(value["primitiveId"], `${family} primitiveId`);
  const where = `${family} ${JSON.stringify(primitiveId)}`;
  const base = parsePrimitiveBase(value, family, where);
  const service = parseService(
    value["service"],
    FAMILY_SERVICES[family],
    `${family} service`,
    where,
  );
  const nominalSize = parseNominalSize(value["nominalSize"], `${where} nominalSize`);
  const flow = parseVocabularyValue(
    value["flow"],
    SEGMENT_FLOWS,
    "invalid_flow",
    "segment flow",
    where,
  );
  const voltageClass = parseOptionalVoltageClass(value["voltageClass"], `${where} voltageClass`);
  // The runtime checks above validated every field against `family`'s
  // vocabulary (service ∈ FAMILY_SERVICES[family]); the cast only re-narrows
  // the discriminator for the caller.
  return deepFreeze({
    ...base,
    family,
    primitiveId,
    service,
    nominalSize,
    flow,
    ...(voltageClass === undefined ? {} : { voltageClass }),
  }) as MepSegment;
}

function parseEquipmentPrimitive(value: Record<string, unknown>): MepEquipment {
  const primitiveId = requireId(value["primitiveId"], "equipment primitiveId");
  const where = `equipment ${JSON.stringify(primitiveId)}`;
  const base = parsePrimitiveBase(value, "equipment", where);
  const equipmentKind = value["equipmentKind"];
  if (typeof equipmentKind !== "string" || !(EQUIPMENT_KINDS as readonly string[]).includes(equipmentKind)) {
    throw new MepError(
      "invalid_equipment_kind",
      `${where}: equipmentKind must be one of ${EQUIPMENT_KINDS.join("|")}; got ${describeValue(equipmentKind)}`,
    );
  }
  const voltageClass = parseOptionalVoltageClass(value["voltageClass"], `${where} voltageClass`);
  const terminals = parseTerminals(value["terminals"], `${where} terminals`);
  return deepFreeze({
    ...base,
    family: "equipment",
    primitiveId,
    equipmentKind: equipmentKind as EquipmentKind,
    ...(voltageClass === undefined ? {} : { voltageClass }),
    terminals,
  });
}

/**
 * Runtime-validate one MEP primitive record (unknown keys are ignored —
 * open shapes, same forward-compatibility rule as the Reality Graph).
 * Produces a deep-frozen record; every refusal is a typed MepError.
 */
export function parseMepPrimitive(value: unknown): MepPrimitive {
  if (!isRecord(value)) {
    throw new MepError("invalid_primitive", "primitive: not an object");
  }
  const family = value["family"];
  if (family === "pipe" || family === "duct" || family === "cable_tray") {
    return parseSegmentPrimitive(value, family);
  }
  if (family === "equipment") {
    return parseEquipmentPrimitive(value);
  }
  throw new MepError(
    "invalid_family",
    `primitive family must be one of ${MEP_FAMILIES.join("|")}; got ${describeValue(family)}`,
  );
}

/* ------------------------------------------------------------------ */
/* Connection / system parsing                                          */
/* ------------------------------------------------------------------ */

function parseEndpointRef(value: unknown, where: string): MepEndpointRef {
  if (!isRecord(value)) {
    throw new MepError("invalid_endpoint_ref", `${where}: endpoint reference must be an object`);
  }
  const segmentId = value["segmentId"];
  const equipmentId = value["equipmentId"];
  if (segmentId !== undefined && equipmentId !== undefined) {
    throw new MepError(
      "invalid_endpoint_ref",
      `${where}: segmentId and equipmentId are mutually exclusive`,
    );
  }
  if (segmentId !== undefined) {
    const resolvedSegmentId = requireId(segmentId, `${where} segmentId`);
    const port = value["port"];
    if (port !== "a" && port !== "b") {
      throw new MepError(
        "invalid_endpoint_ref",
        `${where}: segment port must be "a" or "b"; got ${describeValue(port)}`,
      );
    }
    return deepFreeze({ segmentId: resolvedSegmentId, port });
  }
  if (equipmentId !== undefined) {
    const resolvedEquipmentId = requireId(equipmentId, `${where} equipmentId`);
    const terminalId = requireId(value["terminalId"], `${where} terminalId`);
    return deepFreeze({ equipmentId: resolvedEquipmentId, terminalId });
  }
  throw new MepError(
    "invalid_endpoint_ref",
    `${where}: needs either segmentId+port or equipmentId+terminalId`,
  );
}

/** Runtime-validate one connection record (deep-frozen output). */
export function parseMepConnection(value: unknown): MepConnection {
  if (!isRecord(value)) {
    throw new MepError("invalid_connection", "connection: not an object");
  }
  const connectionId = requireId(value["connectionId"], "connection connectionId");
  const where = `connection ${JSON.stringify(connectionId)}`;
  const from = parseEndpointRef(value["from"], `${where} from`);
  const to = parseEndpointRef(value["to"], `${where} to`);
  const epistemicStatus = value["epistemicStatus"];
  if (!isEpistemicStatus(epistemicStatus)) {
    throw new MepError(
      "invalid_epistemic_status",
      `${where}: epistemicStatus must be one of ${EPISTEMIC_STATUSES.join("|")}; got ${describeValue(epistemicStatus)}`,
    );
  }
  const provenance = parseProvenanceList(value["provenance"], `${where} provenance`);
  return deepFreeze({ connectionId, from, to, epistemicStatus, provenance });
}

/**
 * Runtime-validate a whole system record. Canonicalizes to id-sorted order
 * (UTF-16 code-unit order; input listing order is not data) and refuses
 * duplicate primitive/connection ids. Byte-identical round-trip: parsing
 * the canonical JSON of a system reproduces identical canonical bytes.
 */
export function parseMepSystem(value: unknown): MepSystem {
  if (!isRecord(value)) {
    throw new MepError("invalid_system", "system: not an object");
  }
  const systemId = requireId(value["systemId"], "system systemId");
  const rawPrimitives = value["primitives"];
  if (rawPrimitives === undefined || rawPrimitives === null || !Array.isArray(rawPrimitives)) {
    throw new MepError("invalid_system", "system: primitives must be an array");
  }
  const rawConnections = value["connections"];
  if (rawConnections === undefined || rawConnections === null || !Array.isArray(rawConnections)) {
    throw new MepError("invalid_system", "system: connections must be an array");
  }
  const primitives = rawPrimitives.map((entry) => parseMepPrimitive(entry));
  const primitiveIds = new Set<string>();
  for (const primitive of primitives) {
    if (primitiveIds.has(primitive.primitiveId)) {
      throw new MepError(
        "duplicate_primitive_id",
        `system: duplicate primitive id ${JSON.stringify(primitive.primitiveId)}`,
      );
    }
    primitiveIds.add(primitive.primitiveId);
  }
  const connections = rawConnections.map((entry) => parseMepConnection(entry));
  const connectionIds = new Set<string>();
  for (const connection of connections) {
    if (connectionIds.has(connection.connectionId)) {
      throw new MepError(
        "duplicate_connection_id",
        `system: duplicate connection id ${JSON.stringify(connection.connectionId)}`,
      );
    }
    connectionIds.add(connection.connectionId);
  }
  const sortedPrimitives = [...primitives].sort((a, b) =>
    compareStrings(a.primitiveId, b.primitiveId),
  );
  const sortedConnections = [...connections].sort((a, b) =>
    compareStrings(a.connectionId, b.connectionId),
  );
  return deepFreeze({ systemId, primitives: sortedPrimitives, connections: sortedConnections });
}

/* ------------------------------------------------------------------ */
/* Constructors (single validation path — parse under the hood)         */
/* ------------------------------------------------------------------ */

/** Define a pipe run primitive (validated + deep-frozen, family stamped). */
export function definePipeSegment(draft: MepSegmentDraft): MepPipe {
  const primitive = parseMepPrimitive({ ...draft, family: "pipe" });
  if (primitive.family !== "pipe") {
    throw new MepError("invalid_family", "unreachable: pipe constructor produced a non-pipe");
  }
  return primitive;
}

/** Define a duct run primitive (validated + deep-frozen, family stamped). */
export function defineDuctSegment(draft: MepSegmentDraft): MepDuct {
  const primitive = parseMepPrimitive({ ...draft, family: "duct" });
  if (primitive.family !== "duct") {
    throw new MepError("invalid_family", "unreachable: duct constructor produced a non-duct");
  }
  return primitive;
}

/** Define a cable-tray run primitive (validated + deep-frozen, family stamped). */
export function defineCableTray(draft: MepSegmentDraft): MepCableTray {
  const primitive = parseMepPrimitive({ ...draft, family: "cable_tray" });
  if (primitive.family !== "cable_tray") {
    throw new MepError("invalid_family", "unreachable: tray constructor produced a non-tray");
  }
  return primitive;
}

/** Define an equipment primitive with typed terminals (validated + frozen). */
export function defineEquipment(draft: MepEquipmentDraft): MepEquipment {
  const primitive = parseMepPrimitive({ ...draft, family: "equipment" });
  if (primitive.family !== "equipment") {
    throw new MepError("invalid_family", "unreachable: equipment constructor produced non-equipment");
  }
  return primitive;
}

/** Define a connection (validated + deep-frozen). */
export function defineMepConnection(draft: MepConnectionDraft): MepConnection {
  return parseMepConnection(draft);
}

/** Define a system (validated, canonicalized, deep-frozen). */
export function defineMepSystem(draft: MepSystemDraft): MepSystem {
  return parseMepSystem(draft);
}

/* ------------------------------------------------------------------ */
/* Content ids (determinism pin: sha-256 over domain-tagged canonical   */
/* JSON — stable per content, sensitive to any content change)          */
/* ------------------------------------------------------------------ */

/** sha-256 content id over the canonical JSON of one primitive. */
export function mepPrimitiveContentId(primitive: MepPrimitive): string {
  return sha256Hex(`AISE-MEP-PRIMITIVE-V1\n${canonicalJsonStringify(primitive)}`);
}

/** sha-256 content id over the canonical JSON of one connection. */
export function mepConnectionContentId(connection: MepConnection): string {
  return sha256Hex(`AISE-MEP-CONNECTION-V1\n${canonicalJsonStringify(connection)}`);
}

/** sha-256 content id over the canonical JSON of a whole system. */
export function mepSystemContentId(system: MepSystem): string {
  return sha256Hex(`AISE-MEP-SYSTEM-V1\n${canonicalJsonStringify(system)}`);
}
