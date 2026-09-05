/**
 * The deterministic IFC 4.3 export (AISE-018 — CRITICAL).
 *
 * REQ-011 acceptance over the canonical Reality Graph (AISE-011):
 *
 * - **AC-100 representative model exports to IFC** — the whole
 *   graph is emitted as a STEP physical file (ISO 10303-21)
 *   declaring `FILE_SCHEMA(('IFC4X3_ADD2'))`: project with SI
 *   units, geometric context, spatial structure, products with
 *   face-geometry representations, typed relationships, and AISE
 *   property sets.
 * - **AC-102 stable identifiers/property mapping** — every IFC
 *   entity carries a GUID deterministically derived from a
 *   model-scoped content hash (`ifcGuidOf`): the same object
 *   exports to the SAME guid every time. The canonical
 *   `objectId` rides on the IFC `Tag` attribute AND inside
 *   `Pset_AISEIdentity` (the explicit round-trip mapping); content
 *   hashes and provenance chains ride in
 *   `Pset_AISEIdentity`/`Pset_AISEProvenance`.
 * - **AC-103 exporters do not become a second authority** — the
 *   export is a PURE function of the immutable graph (plus an
 *   optional evidence graph VALUE): it stores nothing, mutates
 *   nothing, upgrades no epistemic state, and fabricates no
 *   geometry. Canonical model state and digests are unchanged by
 *   export operations (regression-tested).
 *
 * Fidelity discipline (mirroring AISE-017):
 * - dimensions are the canonical quantities VERBATIM (value, unit,
 *   uncertainty) in `Pset_AISECanonicalQuantities`, plus exact SI
 *   conversions in `BaseQuantities` — never recomputed from
 *   emitted coordinates;
 * - geometry coordinates are exact SI (metre) conversions of the
 *   canonical scene coordinates through the frozen unit
 *   vocabulary (the model frame unit governs);
 * - epistemic states pass through (`Pset_AISEIdentity`,
 *   `Pset_AISEAssertions`) — INFERRED is never upgraded to
 *   CONFIRMED; IFC has no native epistemic schema, so the states
 *   travel as explicit properties (preserved where supported);
 * - evidence metadata survives where supported: an optional
 *   evidence graph surfaces every live AND retracted link for each
 *   object in `Pset_AISEEvidence` with full source pins — retracted
 *   evidence is visible as retracted, never silently dropped;
 * - objects without structured geometry are exported WITHOUT body
 *   representation, flagged `GeometryExported=No` — never
 *   approximated into plausible IFC geometry.
 *
 * Determinism: canonical emission order (the graph's own canonical
 * object/space/relationship order), fixed derivations, pure
 * arithmetic, canonical real literals. No clock, no randomness, no
 * environment reads — two exports of the same graph are
 * byte-identical (regression-scanned and tested). The FILE_NAME
 * timestamp and IfcOwnerHistory CreationDate are the deterministic
 * epoch placeholder (`1970-01-01T00:00:00Z` / `0`) so re-exports
 * stay byte-stable; real temporal facts (recordedAt, verifiedAt)
 * travel inside evidence/assertion property values verbatim.
 */
import {
  deepFreeze,
  sha256Hex,
  subjectKey,
} from "@aise/engineering-model";
import type {
  EvidenceGraph,
  EvidenceLink,
  EvidenceRecord,
  ModelInputRef,
  ModelLengthUnit,
  ModelUncertainty,
  PropertyAssertion,
  RealityModelGraph,
  RealityObject,
  RealityObjectClass,
  SpaceNode,
  StructuredPlanarGeometry,
  Vec3,
} from "@aise/engineering-model";
import { ExportIfcError } from "./errors.js";
import { ifcGuidOf } from "./guid.js";
import {
  SpfWriter,
  UNSET,
  DERIVED,
  en,
  int,
  list,
  real,
  ref,
  str,
  type SpfValue,
} from "./spf.js";

// ---------------------------------------------------------------------------
// Public contract
// ---------------------------------------------------------------------------

/** Export request options. */
export interface IfcExportOptions {
  /**
   * The committed version number of the graph being exported.
   * REQUIRED when `evidence` is supplied: evidence subjects are
   * version-pinned, so the export must know which version's
   * subjects to resolve.
   */
  readonly version?: number;
  /**
   * The evidence graph whose links surface as per-object
   * `Pset_AISEEvidence` (live AND retracted, with source pins).
   * Optional: without it the export emits no evidence claims
   * (absence is honest — no fabricated evidence).
   */
  readonly evidence?: EvidenceGraph;
}

/** The deterministic IFC 4.3 export artifact. */
export interface IfcExportDocument {
  readonly kind: "ifc-4x3-export";
  readonly modelId: string;
  readonly projectId: string;
  /** The canonical digest of the exact graph this was exported from. */
  readonly graphDigest: string;
  /** The committed version (present iff supplied with the request). */
  readonly version?: number;
  /** The digest of the evidence graph consumed (present iff supplied). */
  readonly evidenceDigest?: string;
  /** The STEP schema identifier declared in the file header. */
  readonly schema: "IFC4X3_ADD2";
  /** The complete ISO 10303-21 STEP physical file text. */
  readonly spf: string;
  /** Byte length of `spf` (observability; the text is the truth). */
  readonly byteLength: number;
  /** SHA-256 of `spf` — the deterministic identity of this export. */
  readonly contentHash: string;
  /** Number of STEP entities in the DATA section. */
  readonly entityCount: number;
  /** Derived counts (observability; the file is the truth). */
  readonly counts: {
    readonly objects: number;
    readonly products: number;
    readonly openings: number;
    readonly spaces: number;
    readonly propertySets: number;
    readonly quantities: number;
    readonly evidenceLinks: number;
  };
  /** The explicit v1 limitations of this export (honest display). */
  readonly limitations: readonly string[];
}

/**
 * The explicit v1 limitations of the IFC export — part of the
 * document contract (the dispatch acceptance: limitations are
 * explicit). Every consumer displays them alongside the file.
 */
export const IFC_EXPORT_LIMITATIONS: readonly string[] = Object.freeze([
  "v1 exports face geometry (planar rectangles) as GeometricCurveSet body representations (IfcPolyline outlines in storey-relative coordinates): the canonical model carries face rectangles without thickness, so no wall thickness, no solid extrusions, and no opening-void extrusion are represented - nothing is fabricated.",
  "geometry coordinates are exact SI (metre) conversions of the canonical scene coordinates through the frozen unit vocabulary (the model frame unit governs); canonical quantity values travel VERBATIM (value, unit, uncertainty) in Pset_AISECanonicalQuantities and as SI conversions in BaseQuantities - never recomputed from emitted coordinates.",
  "the FILE_NAME timestamp and IfcOwnerHistory CreationDate are the deterministic epoch placeholder (1970-01-01T00:00:00Z / 0) so re-exports are byte-identical; actual temporal facts (recordedAt, verifiedAt, linkedAt) travel inside evidence/assertion property values verbatim.",
  "the spatial spine (site/building/storey) is export scaffolding whenever the model's spaces do not provide it - scaffolding entities carry no measured data; model space identities, kinds, frames and parent chains travel on the mapped entities in Pset_AISESpace (ROOM maps to IfcSpace).",
  "all elements are contained in the single export storey (v1: model spaces carry no floor elevation, so multi-storey assignment would be invented); the model's space parent chains are preserved as Pset_AISESpace.ParentSpaceId properties rather than restructured IFC aggregation.",
  "door/window bodies and their opening voids carry the same face-rectangle curve set (the model has one face geometry per object); door-swing and window-glazing symbol representations are out of scope for v1.",
  "epistemic states, confidence, uncertainty and measurement-vs-estimate distinctions pass through as explicit property values (Pset_AISEIdentity, Pset_AISEAssertions); IFC has no native epistemic schema and the export never upgrades INFERRED to CONFIRMED.",
  "schema conformance is machine-checked for the emitted entity subset (ISO 10303-21 syntax, entity signatures, referential integrity, GUID validity/uniqueness, unit discipline) by the built-in validator, which the runtime applies to its own output; full EXPRESS rule validation of IFC4X3_ADD2 requires external tooling (e.g. IfcOpenShell / bSI validation service).",
  "objects without structured geometry (asset-only) are exported without body representation, flagged GeometryExported=No in Pset_AISEIdentity - never approximated into plausible IFC geometry.",
  "evidence metadata surfaces only for the supplied evidence graph and only for links pinned to THIS model and version: live and retracted links are both visible with their status; without an evidence graph the export claims no evidence at all.",
]);

/** AISE property-set names (the explicit round-trip vocabulary). */
export const AISE_PSET_NAMES = Object.freeze({
  identity: "Pset_AISEIdentity",
  provenance: "Pset_AISEProvenance",
  assertions: "Pset_AISEAssertions",
  evidence: "Pset_AISEEvidence",
  canonicalQuantities: "Pset_AISECanonicalQuantities",
  space: "Pset_AISESpace",
  baseQuantities: "BaseQuantities",
});

// ---------------------------------------------------------------------------
// Deterministic constants
// ---------------------------------------------------------------------------

const EXPORTER_VERSION = "1.0.0";
const EXPORTER_NAME = "AISE Export IFC";
const EXPORTER_IDENTIFIER = "aise-export-ifc";
const DETERMINISTIC_EPOCH = "1970-01-01T00:00:00Z";
const ORGANIZATION_NAME = "AI Site Engineer (AISE)";
/** IFC geometric-context modeling precision (convention, not a model measurement). */
const MODELING_PRECISION = 1e-5;

/** The exact SI length factor of the frozen unit vocabulary. */
function siLengthFactor(unit: ModelLengthUnit): number {
  switch (unit) {
    case "meter":
      return 1;
    case "millimeter":
      return 0.001;
    case "centimeter":
      return 0.01;
    case "inch":
      return 0.0254;
    case "foot":
      return 0.3048;
    default:
      throw new ExportIfcError(
        "VALIDATION_FAILED",
        `frame carries a unit outside the frozen length vocabulary: ${String(unit)}`,
        { details: { field: "frame.unit", value: String(unit) } },
      );
  }
}

/** The exact SI area factor of the frozen unit vocabulary. */
function siAreaFactor(unit: string): number {
  switch (unit) {
    case "square_meter":
      return 1;
    case "square_millimeter":
      return 0.001 * 0.001;
    case "square_centimeter":
      return 0.01 * 0.01;
    case "square_inch":
      return 0.0254 * 0.0254;
    case "square_foot":
      return 0.3048 * 0.3048;
    default:
      throw new ExportIfcError(
        "VALIDATION_FAILED",
        `area quantity carries a unit outside the frozen area vocabulary: ${unit}`,
        { details: { field: "area.unit", value: unit } },
      );
  }
}

// ---------------------------------------------------------------------------
// Evidence index (subjects pinned to this model + version)
// ---------------------------------------------------------------------------

/** Links relevant to one exported model+version, indexed by subject key. */
interface EvidenceIndex {
  readonly bySubject: ReadonlyMap<string, readonly EvidenceLink[]>;
  readonly records: ReadonlyMap<string, EvidenceRecord>;
  readonly retractedLinks: ReadonlySet<string>;
  readonly retractedRecords: ReadonlySet<string>;
}

function buildEvidenceIndex(modelId: string, version: number, evidence: EvidenceGraph): EvidenceIndex {
  const bySubject = new Map<string, EvidenceLink[]>();
  for (const link of evidence.links) {
    if (link.subject.modelId !== modelId || link.subject.version !== version) {
      continue;
    }
    const key = subjectKey(link.subject);
    bySubject.set(key, [...(bySubject.get(key) ?? []), link]);
  }
  const records = new Map(evidence.records.map((record) => [record.evidenceId, record] as const));
  const retractedLinks = new Set(evidence.linkRetractions.map((event) => event.linkId));
  const retractedRecords = new Set(evidence.evidenceRetractions.map((event) => event.evidenceId));
  return { bySubject, records, retractedLinks, retractedRecords };
}

// ---------------------------------------------------------------------------
// Emission state
// ---------------------------------------------------------------------------

interface EmissionState {
  readonly writer: SpfWriter;
  readonly graph: RealityModelGraph;
  readonly modelId: string;
  readonly siFactor: number;
  readonly owner: number;
  readonly context: number;
  readonly identityAxis: number;
  readonly storeyPlacement: number;
  readonly storeyGuid: string;
  readonly evidenceIndex?: EvidenceIndex;
  /** Running counts (observability). */
  products: number;
  openings: number;
  propertySets: number;
  quantities: number;
  evidenceLinks: number;
  /** Element entity ids for the containment relationship (non-opening products). */
  readonly elementIds: number[];
}

// ---------------------------------------------------------------------------
// Text composition (deterministic, printable ASCII)
// ---------------------------------------------------------------------------

/** Uncertainty as explicit text (never collapsed into the value). */
function uncertaintyText(uncertainty: ModelUncertainty): string {
  switch (uncertainty.kind) {
    case "standard":
      return `+/-${uncertainty.u} (standard)`;
    case "expanded":
      return `+/-${uncertainty.U} (expanded, k=${uncertainty.coverageFactor})`;
    case "tolerance":
      return `+${uncertainty.upperOffset}/${uncertainty.lowerOffset} (tolerance)`;
  }
}

/** One canonical quantity as verbatim text. */
function quantityText(quantity: {
  readonly value: number;
  readonly unit: string;
  readonly uncertainty?: ModelUncertainty;
}): string {
  const core = `${quantity.value} ${quantity.unit}`;
  return quantity.uncertainty === undefined ? core : `${core} ${uncertaintyText(quantity.uncertainty)}`;
}

/** One property assertion as a complete, lossless text record. */
function assertionText(assertion: PropertyAssertion): string {
  const parts: string[] = [assertion.status];
  if (assertion.quantity !== undefined) {
    parts.push(quantityText(assertion.quantity));
    if (assertion.kind !== undefined) {
      parts.push(assertion.kind);
    }
  }
  if (assertion.presence !== undefined) {
    parts.push(`${assertion.presence} (presence)`);
  }
  if (assertion.confidence !== undefined) {
    parts.push(`confidence ${assertion.confidence}`);
  }
  if (assertion.method !== undefined) {
    parts.push(`method ${assertion.method}`);
  }
  if (assertion.evidenceRefs !== undefined && assertion.evidenceRefs.length > 0) {
    parts.push(`evidence ${assertion.evidenceRefs.join(",")}`);
  }
  if (assertion.verifiedBy !== undefined) {
    parts.push(`verifiedBy ${assertion.verifiedBy}`);
  }
  if (assertion.verifiedAt !== undefined) {
    parts.push(`verifiedAt ${assertion.verifiedAt}`);
  }
  return parts.join(" | ");
}

/** One provenance input reference (the AISE-017 trace vocabulary). */
function provenanceInputText(input: ModelInputRef): string {
  switch (input.kind) {
    case "scene":
      return `scene:${input.sceneId}@${input.contentHash}[${input.epistemic}]`;
    case "object":
      return `object:${input.serviceId}/${input.objectId}@${input.contentHash}[${input.epistemic}]`;
    case "point-set":
      return `point-set:points-${input.contentHash.slice(0, 16)}@${input.contentHash}[${input.epistemic}]`;
  }
}

/** The evidence record's source, as a compact verbatim summary. */
function evidenceSourceText(record: EvidenceRecord): string {
  const source = record.source;
  switch (source.kind) {
    case "capture":
      return `capture ${source.sessionId}/${source.assetId} (${source.assetType}, ${source.byteSize} bytes)`;
    case "manual-measurement":
      return `manual measurement ${source.value} ${source.unit} by ${source.measuredBy} via ${source.method} at ${source.measuredAt}`;
    case "document":
      return `document ${source.documentId}${source.title !== undefined ? ` "${source.title}"` : ""}`;
    case "human-observation":
      return `observation by ${source.observer}: ${source.statement}`;
  }
}

// ---------------------------------------------------------------------------
// Fail-closed input validation
// ---------------------------------------------------------------------------

function requireFinite(value: number, field: string, modelId: string): void {
  if (!Number.isFinite(value)) {
    throw new ExportIfcError("NON_FINITE_INPUT", `${field} must be finite: ${String(value)}`, {
      details: { field, value: String(value), modelId },
    });
  }
}

function validateGraphInputs(graph: RealityModelGraph): void {
  for (const object of graph.objects) {
    const geometry = object.geometry?.structured;
    if (geometry === undefined) {
      continue;
    }
    for (const [index, corner] of geometry.rectangle.corners.entries()) {
      requireFinite(corner.x, `object ${object.objectId} corner ${index}.x`, graph.modelId);
      requireFinite(corner.y, `object ${object.objectId} corner ${index}.y`, graph.modelId);
      requireFinite(corner.z, `object ${object.objectId} corner ${index}.z`, graph.modelId);
    }
    const center = geometry.rectangle.center;
    requireFinite(center.x, `object ${object.objectId} center.x`, graph.modelId);
    requireFinite(center.y, `object ${object.objectId} center.y`, graph.modelId);
    requireFinite(center.z, `object ${object.objectId} center.z`, graph.modelId);
    for (const assertion of object.properties) {
      if (assertion.quantity !== undefined) {
        requireFinite(
          assertion.quantity.value,
          `object ${object.objectId} property ${assertion.key}`,
          graph.modelId,
        );
      }
      if (assertion.confidence !== undefined) {
        requireFinite(
          assertion.confidence,
          `object ${object.objectId} property ${assertion.key} confidence`,
          graph.modelId,
        );
      }
    }
  }
}

/**
 * Resolves the declared coordinate frame: the FIRST space in
 * canonical order that declares one (fail closed when no space
 * does — no invented world frame). Mirrors the AISE-017
 * discipline of a single declared frame governing the export.
 */
function declaredFrameOf(graph: RealityModelGraph): { up: Vec3; e1: Vec3; unit: ModelLengthUnit } {
  const space = graph.spaces.find((candidate) => candidate.frame !== undefined);
  if (space === undefined || space.frame === undefined) {
    throw new ExportIfcError(
      "FRAME_DECLARATION_MISSING",
      "no space in the graph declares a coordinate frame; no IFC world coordinate system can be derived",
      { details: { modelId: graph.modelId, spaces: graph.spaces.length } },
    );
  }
  return { up: space.frame.up, e1: planBasisE1(space.frame.up), unit: space.frame.unit };
}

/** The plan basis first axis (X, then Y, then Z priority — the AISE-017 rule). */
function planBasisE1(up: Vec3): Vec3 {
  const candidates: readonly Vec3[] = [
    { x: 1, y: 0, z: 0 },
    { x: 0, y: 1, z: 0 },
    { x: 0, y: 0, z: 1 },
  ];
  let best = candidates[0]!;
  let bestAlignment = Math.abs(dot(best, up));
  for (let index = 1; index < candidates.length; index += 1) {
    const candidate = candidates[index]!;
    const alignment = Math.abs(dot(candidate, up));
    if (alignment < bestAlignment) {
      best = candidate;
      bestAlignment = alignment;
    }
  }
  const projection = scale(up, dot(best, up));
  const orthogonal: Vec3 = {
    x: best.x - projection.x,
    y: best.y - projection.y,
    z: best.z - projection.z,
  };
  return unitOf(orthogonal);
}

function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function scale(v: Vec3, factor: number): Vec3 {
  return { x: v.x * factor, y: v.y * factor, z: v.z * factor };
}

function unitOf(v: Vec3): Vec3 {
  const magnitude = Math.sqrt(dot(v, v));
  if (!Number.isFinite(magnitude) || magnitude <= 0) {
    throw new ExportIfcError(
      "VALIDATION_FAILED",
      `world axis derivation produced a degenerate vector (|v| = ${String(magnitude)})`,
      { details: { magnitude: String(magnitude) } },
    );
  }
  return { x: v.x / magnitude, y: v.y / magnitude, z: v.z / magnitude };
}

// ---------------------------------------------------------------------------
// The export
// ---------------------------------------------------------------------------

/**
 * Exports one canonical Reality Graph (plus an optional evidence
 * graph) into a deterministic, schema-valid IFC 4.3 STEP physical
 * file.
 *
 * Fail-closed contract: invalid inputs (non-finite coordinates,
 * missing frame declaration, evidence/version mismatch, evidence
 * links without records) throw `ExportIfcError` BEFORE any output
 * is produced. The emission itself is pure — the graph is never
 * mutated (deep-freeze + digest regression tested).
 */
export function exportIfc(graph: RealityModelGraph, options: IfcExportOptions = {}): IfcExportDocument {
  if (
    graph === null ||
    typeof graph !== "object" ||
    typeof graph.modelId !== "string" ||
    !Array.isArray(graph.spaces) ||
    !Array.isArray(graph.objects)
  ) {
    throw new ExportIfcError("VALIDATION_FAILED", "export input must be a reality model graph", {
      details: { field: "graph" },
    });
  }
  const { version, evidence } = options;
  if (evidence !== undefined && version === undefined) {
    throw new ExportIfcError(
      "VALIDATION_FAILED",
      "version is required when an evidence graph is supplied (evidence subjects are version-pinned)",
      { details: { field: "version", modelId: graph.modelId } },
    );
  }
  if (evidence !== undefined && version !== undefined && (!Number.isInteger(version) || version < 1)) {
    throw new ExportIfcError("VALIDATION_FAILED", `version must be a positive integer: ${String(version)}`, {
      details: { field: "version", value: String(version) },
    });
  }
  if (evidence !== undefined && evidence.projectId !== graph.projectId) {
    throw new ExportIfcError(
      "EVIDENCE_PROJECT_MISMATCH",
      `the evidence graph belongs to project ${evidence.projectId}; the model graph belongs to ${graph.projectId}`,
      { details: { evidenceProject: evidence.projectId, modelProject: graph.projectId } },
    );
  }
  validateGraphInputs(graph);
  const frame = declaredFrameOf(graph);
  const siFactor = siLengthFactor(frame.unit);
  const evidenceIndex =
    evidence !== undefined && version !== undefined ? buildEvidenceIndex(graph.modelId, version, evidence) : undefined;

  // Emission failures that are NOT ExportIfcError are data-dependent
  // rejections of the writer's invariants (non-printable-ASCII text,
  // malformed identifiers) — fail closed as validation errors.
  let emission: EmissionResult;
  try {
    emission = emit(graph, frame, siFactor, evidenceIndex, version);
  } catch (error) {
    if (error instanceof ExportIfcError) {
      throw error;
    }
    const message = error instanceof Error ? error.message : String(error);
    throw new ExportIfcError("VALIDATION_FAILED", `IFC emission rejected an input: ${message}`, {
      details: { cause: message, modelId: graph.modelId },
    });
  }

  const document: IfcExportDocument = {
    kind: "ifc-4x3-export",
    modelId: graph.modelId,
    projectId: graph.projectId,
    graphDigest: graph.digest,
    ...(version !== undefined ? { version } : {}),
    ...(evidence !== undefined ? { evidenceDigest: evidence.digest } : {}),
    schema: "IFC4X3_ADD2",
    spf: emission.spf,
    byteLength: emission.spf.length,
    contentHash: sha256Hex(emission.spf),
    entityCount: emission.entityCount,
    counts: Object.freeze({
      objects: graph.objects.length,
      products: emission.state.products,
      openings: emission.state.openings,
      spaces: graph.spaces.length,
      propertySets: emission.state.propertySets,
      quantities: emission.state.quantities,
      evidenceLinks: emission.state.evidenceLinks,
    }),
    limitations: IFC_EXPORT_LIMITATIONS,
  };
  return deepFreeze(document);
}

interface EmissionResult {
  readonly spf: string;
  readonly entityCount: number;
  readonly state: EmissionState;
}

// --- guid seeds -------------------------------------------------------------------

const SPINE_LABELS = { site: "site", building: "building", storey: "storey" } as const;

function spaceGuid(modelId: string, spaceId: string): string {
  return ifcGuidOf(`${modelId}:space:${spaceId}`);
}

function objectGuid(modelId: string, objectId: string): string {
  return ifcGuidOf(`${modelId}:object:${objectId}`);
}

function openingGuid(modelId: string, objectId: string): string {
  return ifcGuidOf(`${modelId}:opening:${objectId}`);
}

/** The full emission pass. */
function emit(
  graph: RealityModelGraph,
  frame: { up: Vec3; e1: Vec3; unit: ModelLengthUnit },
  siFactor: number,
  evidenceIndex: EvidenceIndex | undefined,
  version: number | undefined,
): EmissionResult {
  const writer = new SpfWriter();
  const modelId = graph.modelId;

  // --- A: ownership, units, context ---------------------------------------
  const person = writer.add("IFCPERSON", [
    str("AISE"),
    str("Resident Worker"),
    UNSET,
    UNSET,
    UNSET,
    UNSET,
    UNSET,
    UNSET,
  ]);
  const organization = writer.add("IFCORGANIZATION", [
    UNSET,
    str(ORGANIZATION_NAME),
    str("deterministic IFC 4.3 export from the canonical Reality Graph"),
    UNSET,
    UNSET,
  ]);
  const personAndOrganization = writer.add("IFCPERSONANDORGANIZATION", [ref(person), ref(organization), UNSET]);
  const application = writer.add("IFCAPPLICATION", [
    ref(organization),
    str(EXPORTER_VERSION),
    str(EXPORTER_NAME),
    str(EXPORTER_IDENTIFIER),
  ]);
  const ownerHistory = writer.add("IFCOWNERHISTORY", [
    ref(personAndOrganization),
    ref(application),
    en("READWRITE"),
    UNSET,
    UNSET,
    UNSET,
    int(0),
  ]);

  const unitLength = writer.add("IFCSIUNIT", [DERIVED, en("LENGTHUNIT"), UNSET, en("METRE")]);
  const unitArea = writer.add("IFCSIUNIT", [DERIVED, en("AREAUNIT"), UNSET, en("SQUARE_METRE")]);
  const unitAngle = writer.add("IFCSIUNIT", [DERIVED, en("PLANEANGLEUNIT"), UNSET, en("RADIAN")]);
  const unitAssignment = writer.add("IFCUNITASSIGNMENT", [
    list([ref(unitLength), ref(unitArea), ref(unitAngle)]),
  ]);

  const originPoint = writer.add("IFCCARTESIANPOINT", [list([real(0), real(0), real(0)])]);
  const upDirection = writer.add("IFCDIRECTION", [
    list([real(frame.up.x), real(frame.up.y), real(frame.up.z)]),
  ]);
  const e1Direction = writer.add("IFCDIRECTION", [
    list([real(frame.e1.x), real(frame.e1.y), real(frame.e1.z)]),
  ]);
  const worldCoordinateSystem = writer.add("IFCAXIS2PLACEMENT3D", [
    ref(originPoint),
    ref(upDirection),
    ref(e1Direction),
  ]);
  const context = writer.add("IFCGEOMETRICREPRESENTATIONCONTEXT", [
    UNSET,
    str("Model"),
    int(3),
    real(MODELING_PRECISION),
    ref(worldCoordinateSystem),
    UNSET,
  ]);
  const identityAxis = writer.add("IFCAXIS2PLACEMENT3D", [ref(originPoint), UNSET, UNSET]);

  // --- B: project -----------------------------------------------------------
  const projectGuid = ifcGuidOf(`${modelId}:project`);
  const project = writer.add("IFCPROJECT", [
    str(projectGuid),
    ref(ownerHistory),
    str(modelId),
    str(`AISE deterministic IFC 4.3 export (graph digest ${graph.digest})`),
    UNSET,
    UNSET,
    UNSET,
    list([ref(context)]),
    ref(unitAssignment),
  ]);

  // --- C: spatial spine + mapped spaces -------------------------------------
  const siteSpaces = graph.spaces.filter((space) => space.kind === "SITE");
  const buildingSpaces = graph.spaces.filter((space) => space.kind === "FACILITY" || space.kind === "BUILDING");
  const levelSpaces = graph.spaces.filter((space) => space.kind === "LEVEL");
  const roomSpaces = graph.spaces.filter((space) => space.kind === "ROOM");

  const spineSiteSpace = siteSpaces[0];
  const spineBuildingSpace = buildingSpaces[0];
  const spineStoreySpace = levelSpaces[0];

  const spineSiteGuid =
    spineSiteSpace !== undefined ? spaceGuid(modelId, spineSiteSpace.spaceId) : ifcGuidOf(`${modelId}:spine:site`);
  const spineBuildingGuid =
    spineBuildingSpace !== undefined
      ? spaceGuid(modelId, spineBuildingSpace.spaceId)
      : ifcGuidOf(`${modelId}:spine:building`);
  const spineStoreyGuid =
    spineStoreySpace !== undefined
      ? spaceGuid(modelId, spineStoreySpace.spaceId)
      : ifcGuidOf(`${modelId}:spine:storey`);

  const sitePlacement = writer.add("IFCLOCALPLACEMENT", [UNSET, ref(identityAxis)]);
  const site = writer.add("IFCSITE", [
    str(spineSiteGuid),
    ref(ownerHistory),
    str(spineSiteSpace?.name ?? `AISE Export ${SPINE_LABELS.site}`),
    str(
      spineSiteSpace !== undefined
        ? `AISE space ${spineSiteSpace.spaceId}`
        : "export scaffolding (no mapped model space)",
    ),
    UNSET,
    spineSiteSpace?.name !== undefined ? str(spineSiteSpace.name) : UNSET,
    ref(sitePlacement),
    UNSET,
    UNSET,
    UNSET,
  ]);
  const buildingPlacement = writer.add("IFCLOCALPLACEMENT", [ref(sitePlacement), ref(identityAxis)]);
  const building = writer.add("IFCBUILDING", [
    str(spineBuildingGuid),
    ref(ownerHistory),
    str(spineBuildingSpace?.name ?? `AISE Export ${SPINE_LABELS.building}`),
    str(
      spineBuildingSpace !== undefined
        ? `AISE space ${spineBuildingSpace.spaceId}`
        : "export scaffolding (no mapped model space)",
    ),
    UNSET,
    spineBuildingSpace?.name !== undefined ? str(spineBuildingSpace.name) : UNSET,
    ref(buildingPlacement),
    UNSET,
    UNSET,
    UNSET,
    UNSET,
  ]);
  const storeyPlacement = writer.add("IFCLOCALPLACEMENT", [ref(buildingPlacement), ref(identityAxis)]);
  const storey = writer.add("IFCSTOREY", [
    str(spineStoreyGuid),
    ref(ownerHistory),
    str(spineStoreySpace?.name ?? `AISE Export ${SPINE_LABELS.storey}`),
    str(
      spineStoreySpace !== undefined
        ? `AISE space ${spineStoreySpace.spaceId}`
        : "export scaffolding (no mapped model space)",
    ),
    UNSET,
    spineStoreySpace?.name !== undefined ? str(spineStoreySpace.name) : UNSET,
    ref(storeyPlacement),
    UNSET,
    UNSET,
  ]);

  const state: EmissionState = {
    writer,
    graph,
    modelId,
    siFactor,
    owner: ownerHistory,
    context,
    identityAxis,
    storeyPlacement,
    storeyGuid: spineStoreyGuid,
    ...(evidenceIndex !== undefined ? { evidenceIndex } : {}),
    products: 0,
    openings: 0,
    propertySets: 0,
    quantities: 0,
    evidenceLinks: 0,
    elementIds: [],
  };

  // Spine aggregation chain (project → site → building → storey).
  writer.add("IFCRELAGGREGATES", [
    str(ifcGuidOf(`${modelId}|relAgg|project|${spineSiteGuid}`)),
    ref(ownerHistory),
    UNSET,
    UNSET,
    ref(project),
    list([ref(site)]),
  ]);
  writer.add("IFCRELAGGREGATES", [
    str(ifcGuidOf(`${modelId}|relAgg|${spineSiteGuid}|${spineBuildingGuid}`)),
    ref(ownerHistory),
    UNSET,
    UNSET,
    ref(site),
    list([ref(building)]),
  ]);
  writer.add("IFCRELAGGREGATES", [
    str(ifcGuidOf(`${modelId}|relAgg|${spineBuildingGuid}|${spineStoreyGuid}`)),
    ref(ownerHistory),
    UNSET,
    UNSET,
    ref(building),
    list([ref(storey)]),
  ]);

  // Additional mapped spaces of the structural kinds, plus rooms.
  const extraSites = siteSpaces.slice(1);
  const extraBuildings = buildingSpaces.filter((space) => space !== spineBuildingSpace);
  const extraStoreys = levelSpaces.filter((space) => space !== spineStoreySpace);

  const extraSiteIds: number[] = [];
  for (const space of extraSites) {
    extraSiteIds.push(emitStructuralSpace(state, space, "IFCSITE", UNSET, spaceGuid(modelId, space.spaceId), version));
  }
  const extraBuildingIds: number[] = [];
  for (const space of extraBuildings) {
    extraBuildingIds.push(
      emitStructuralSpace(state, space, "IFCBUILDING", ref(sitePlacement), spaceGuid(modelId, space.spaceId), version),
    );
  }
  const extraStoreyIds: number[] = [];
  for (const space of extraStoreys) {
    extraStoreyIds.push(
      emitStructuralSpace(state, space, "IFCSTOREY", ref(buildingPlacement), spaceGuid(modelId, space.spaceId), version),
    );
  }
  const roomIds: number[] = [];
  for (const space of roomSpaces) {
    roomIds.push(emitRoomSpace(state, space, version));
  }

  // Grouped aggregation rels for the additional spaces.
  if (extraSiteIds.length > 0) {
    writer.add("IFCRELAGGREGATES", [
      str(
        ifcGuidOf(
          `${modelId}|relAgg|project|${extraSites.map((space) => spaceGuid(modelId, space.spaceId)).join(",")}`,
        ),
      ),
      ref(ownerHistory),
      UNSET,
      UNSET,
      ref(project),
      list(extraSiteIds.map((id) => ref(id))),
    ]);
  }
  if (extraBuildingIds.length > 0) {
    writer.add("IFCRELAGGREGATES", [
      str(
        ifcGuidOf(
          `${modelId}|relAgg|${spineSiteGuid}|${extraBuildings
            .map((space) => spaceGuid(modelId, space.spaceId))
            .join(",")}`,
        ),
      ),
      ref(ownerHistory),
      UNSET,
      UNSET,
      ref(site),
      list(extraBuildingIds.map((id) => ref(id))),
    ]);
  }
  if (extraStoreyIds.length > 0) {
    writer.add("IFCRELAGGREGATES", [
      str(
        ifcGuidOf(
          `${modelId}|relAgg|${spineBuildingGuid}|${extraStoreys
            .map((space) => spaceGuid(modelId, space.spaceId))
            .join(",")}`,
        ),
      ),
      ref(ownerHistory),
      UNSET,
      UNSET,
      ref(building),
      list(extraStoreyIds.map((id) => ref(id))),
    ]);
  }
  if (roomIds.length > 0) {
    writer.add("IFCRELAGGREGATES", [
      str(
        ifcGuidOf(
          `${modelId}|relAgg|${spineStoreyGuid}|${roomSpaces.map((space) => spaceGuid(modelId, space.spaceId)).join(",")}`,
        ),
      ),
      ref(ownerHistory),
      UNSET,
      UNSET,
      ref(storey),
      list(roomIds.map((id) => ref(id))),
    ]);
  }

  // Spine-fused spaces carry their model space metadata as psets.
  if (spineSiteSpace !== undefined) {
    emitSpacePsets(state, site, spineSiteSpace, version);
  }
  if (spineBuildingSpace !== undefined) {
    emitSpacePsets(state, building, spineBuildingSpace, version);
  }
  if (spineStoreySpace !== undefined) {
    emitSpacePsets(state, storey, spineStoreySpace, version);
  }

  // --- D: products -----------------------------------------------------------
  const productIdsByObject = new Map<
    string,
    { productId: number; guid: string; openingId?: number; openingGuid?: string }
  >();
  const parentWallIds = new Map<string, string>();
  for (const relationship of graph.relationships) {
    if (relationship.type === "OPENING_IN") {
      parentWallIds.set(relationship.fromId, relationship.toId);
    }
  }

  for (const object of graph.objects) {
    const emitted = emitProduct(state, object);
    productIdsByObject.set(object.objectId, emitted);

    if (object.objectClass === "DOOR" || object.objectClass === "WINDOW") {
      const parentWallId = parentWallIds.get(object.objectId);
      if (parentWallId === undefined) {
        continue;
      }
      const parent = productIdsByObject.get(parentWallId);
      if (parent === undefined) {
        throw new ExportIfcError(
          "VALIDATION_FAILED",
          `opening ${object.objectId} references parent wall ${parentWallId}, which is not a WALL emitted before it in canonical order`,
          { details: { objectId: object.objectId, parentWallId } },
        );
      }
      writer.add("IFCRELVOIDSELEMENT", [
        str(ifcGuidOf(`${modelId}|relVoids|${objectGuid(modelId, parentWallId)}|${emitted.openingGuid}`)),
        ref(ownerHistory),
        UNSET,
        UNSET,
        ref(parent.productId),
        ref(emitted.openingId!),
      ]);
      writer.add("IFCRELFILLSELEMENT", [
        str(ifcGuidOf(`${modelId}|relFills|${emitted.openingGuid}|${emitted.guid}`)),
        ref(ownerHistory),
        UNSET,
        UNSET,
        ref(emitted.openingId!),
        ref(emitted.productId),
      ]);
    }
  }

  // --- E: containment (all non-opening products in the export storey) ------
  if (state.elementIds.length > 0) {
    writer.add("IFCRELCONTAINEDINSPATIALSTRUCTURE", [
      str(
        ifcGuidOf(
          `${modelId}|relContained|${spineStoreyGuid}|${graph.objects
            .filter((object) => object.objectClass !== "DOOR" && object.objectClass !== "WINDOW")
            .map((object) => objectGuid(modelId, object.objectId))
            .join(",")}`,
        ),
      ),
      ref(ownerHistory),
      UNSET,
      UNSET,
      list(state.elementIds.map((id) => ref(id))),
      ref(storey),
    ]);
  }

  const header = [
    "FILE_DESCRIPTION(('AISE IFC 4.3 export - deterministic, evidence-aware'),'2;1');",
    `FILE_NAME('${modelId}.ifc','${DETERMINISTIC_EPOCH}',('AISE Export IFC'),('${ORGANIZATION_NAME}'),'${EXPORTER_NAME} ${EXPORTER_VERSION}','${EXPORTER_IDENTIFIER}','AISE');`,
    "FILE_SCHEMA(('IFC4X3_ADD2'));",
  ];
  const spf = writer.toFile(header);
  return { spf, entityCount: writer.count, state };
}

// --- space emission ------------------------------------------------------------

/** Emits one non-ROOM mapped space (extra site/building/storey). */
function emitStructuralSpace(
  state: EmissionState,
  space: SpaceNode,
  entityName: "IFCSITE" | "IFCBUILDING" | "IFCSTOREY",
  placementParent: SpfValue,
  guid: string,
  version: number | undefined,
): number {
  const placement = state.writer.add("IFCLOCALPLACEMENT", [placementParent, ref(state.identityAxis)]);
  const longName = space.name !== undefined ? str(space.name) : UNSET;
  let args: SpfValue[];
  if (entityName === "IFCSITE") {
    args = [
      str(guid),
      ref(state.owner),
      str(space.name ?? space.spaceId),
      str(`AISE space ${space.spaceId}`),
      UNSET,
      longName,
      ref(placement),
      UNSET,
      UNSET,
      UNSET,
    ];
  } else if (entityName === "IFCBUILDING") {
    args = [
      str(guid),
      ref(state.owner),
      str(space.name ?? space.spaceId),
      str(`AISE space ${space.spaceId}`),
      UNSET,
      longName,
      ref(placement),
      UNSET,
      UNSET,
      UNSET,
      UNSET,
    ];
  } else {
    args = [
      str(guid),
      ref(state.owner),
      str(space.name ?? space.spaceId),
      str(`AISE space ${space.spaceId}`),
      UNSET,
      longName,
      ref(placement),
      UNSET,
      UNSET,
    ];
  }
  const id = state.writer.add(entityName, args);
  emitSpacePsets(state, id, space, version);
  return id;
}

/** Emits one ROOM space as an IfcSpace under the export storey. */
function emitRoomSpace(state: EmissionState, space: SpaceNode, version: number | undefined): number {
  const guid = spaceGuid(state.modelId, space.spaceId);
  const placement = state.writer.add("IFCLOCALPLACEMENT", [ref(state.storeyPlacement), ref(state.identityAxis)]);
  const id = state.writer.add("IFCSPACE", [
    str(guid),
    ref(state.owner),
    str(space.name ?? space.spaceId),
    str(`AISE space ${space.spaceId}`),
    UNSET,
    ref(placement),
    UNSET,
    space.name !== undefined ? str(space.name) : UNSET,
    UNSET,
  ]);
  emitSpacePsets(state, id, space, version);
  return id;
}

/** Emits Pset_AISESpace (+ assertions + evidence) for a mapped space entity. */
function emitSpacePsets(
  state: EmissionState,
  entityId: number,
  space: SpaceNode,
  version: number | undefined,
): void {
  const spaceProperties: Array<[string, string]> = [
    ["SpaceId", space.spaceId],
    ["SpaceKind", space.kind],
  ];
  if (space.parentSpaceId !== undefined) {
    spaceProperties.push(["ParentSpaceId", space.parentSpaceId]);
  }
  if (space.frame !== undefined) {
    spaceProperties.push([
      "FrameUp",
      `[${space.frame.up.x},${space.frame.up.y},${space.frame.up.z}]`,
    ]);
    spaceProperties.push(["FrameUnit", space.frame.unit]);
  }
  emitPropertySet(state, entityId, AISE_PSET_NAMES.space, spaceProperties);

  if (space.properties !== undefined && space.properties.length > 0) {
    emitPropertySet(
      state,
      entityId,
      AISE_PSET_NAMES.assertions,
      space.properties.map((assertion) => [assertion.key, assertionText(assertion)] as [string, string]),
    );
  }

  if (state.evidenceIndex !== undefined && version !== undefined) {
    const links = spaceEvidenceLinks(state.evidenceIndex, state.modelId, version, space.spaceId);
    if (links.length > 0) {
      emitPropertySet(
        state,
        entityId,
        AISE_PSET_NAMES.evidence,
        links.map((link) => evidenceProperty(link, state.evidenceIndex!)),
      );
      state.evidenceLinks += links.length;
    }
  }
}

// --- product emission -----------------------------------------------------------

interface ProductEmission {
  readonly productId: number;
  readonly guid: string;
  readonly openingId?: number;
  readonly openingGuid?: string;
}

/** The IFC entity + predefined type of one object class. */
function classMapping(
  objectClass: RealityObjectClass,
): { entity: "IFCWALL" | "IFCSLAB" | "IFCCOVERING" | "IFCDOOR" | "IFCWINDOW"; predefined: string } {
  switch (objectClass) {
    case "WALL":
      return { entity: "IFCWALL", predefined: "SOLIDWALL" };
    case "FLOOR":
      return { entity: "IFCSLAB", predefined: "FLOOR" };
    case "CEILING":
      return { entity: "IFCCOVERING", predefined: "CEILING" };
    case "DOOR":
      return { entity: "IFCDOOR", predefined: "DOOR" };
    case "WINDOW":
      return { entity: "IFCWINDOW", predefined: "WINDOW" };
  }
}

/** Emits one model object (opening + product for doors/windows). */
function emitProduct(state: EmissionState, object: RealityObject): ProductEmission {
  const mapping = classMapping(object.objectClass);
  const guid = objectGuid(state.modelId, object.objectId);
  const geometry = object.geometry?.structured;
  const hasGeometry = geometry !== undefined;
  const isOpeningFill = object.objectClass === "DOOR" || object.objectClass === "WINDOW";

  const representation = hasGeometry ? emitBodyRepresentation(state, geometry) : UNSET;
  const placement = emitProductPlacement(state, geometry);

  let openingId: number | undefined;
  let openingGuidId: string | undefined;
  if (isOpeningFill) {
    const openGuid = openingGuid(state.modelId, object.objectId);
    openingGuidId = openGuid;
    openingId = state.writer.add("IFCOPENINGELEMENT", [
      str(openGuid),
      ref(state.owner),
      str(`${object.name ?? object.objectId} (opening)`),
      str(`AISE opening of object ${object.objectId}`),
      UNSET,
      ref(placement),
      representation,
      str(object.objectId),
    ]);
    state.openings += 1;
    emitIdentityPset(state, openingId, object, hasGeometry);
  }

  // Overall dimensions: canonical quantity values, exact SI conversion.
  const overallHeight =
    hasGeometry && isOpeningFill ? real(geometry.height.value * state.siFactor) : UNSET;
  const overallWidth = hasGeometry && isOpeningFill ? real(geometry.width.value * state.siFactor) : UNSET;

  const productId = state.writer.add(mapping.entity, [
    str(guid),
    ref(state.owner),
    str(object.name ?? object.objectId),
    str(`AISE object ${object.objectId} (epistemic ${object.epistemicState})`),
    UNSET,
    ref(placement),
    representation,
    str(object.objectId),
    ...(isOpeningFill ? [overallHeight, overallWidth] : []),
    en(mapping.predefined),
  ]);
  state.products += 1;
  state.elementIds.push(productId);

  emitIdentityPset(state, productId, object, hasGeometry);
  emitProvenancePset(state, productId, object);
  if (object.properties.length > 0) {
    emitPropertySet(
      state,
      productId,
      AISE_PSET_NAMES.assertions,
      object.properties.map((assertion) => [assertion.key, assertionText(assertion)] as [string, string]),
    );
  }
  if (hasGeometry) {
    emitCanonicalQuantityPsets(state, productId, geometry);
  }
  if (state.evidenceIndex !== undefined) {
    const links = objectEvidenceLinks(state.evidenceIndex, state.modelId, object.objectId);
    if (links.length > 0) {
      emitPropertySet(
        state,
        productId,
        AISE_PSET_NAMES.evidence,
        links.map((link) => evidenceProperty(link, state.evidenceIndex!)),
      );
      state.evidenceLinks += links.length;
    }
  }
  return {
    productId,
    guid,
    ...(openingId !== undefined ? { openingId } : {}),
    ...(openingGuidId !== undefined ? { openingGuid: openingGuidId } : {}),
  };
}

/** Product placement: translate-only, at the rectangle center (or origin). */
function emitProductPlacement(
  state: EmissionState,
  geometry: StructuredPlanarGeometry | undefined,
): number {
  if (geometry === undefined) {
    return state.writer.add("IFCLOCALPLACEMENT", [ref(state.storeyPlacement), ref(state.identityAxis)]);
  }
  const center = geometry.rectangle.center;
  const point = state.writer.add("IFCCARTESIANPOINT", [
    list([
      real(center.x * state.siFactor),
      real(center.y * state.siFactor),
      real(center.z * state.siFactor),
    ]),
  ]);
  const axis = state.writer.add("IFCAXIS2PLACEMENT3D", [ref(point), UNSET, UNSET]);
  return state.writer.add("IFCLOCALPLACEMENT", [ref(state.storeyPlacement), ref(axis)]);
}

/** The face-rectangle curve set body representation (GeometricSet). */
function emitBodyRepresentation(state: EmissionState, geometry: StructuredPlanarGeometry): SpfValue {
  const center = geometry.rectangle.center;
  const pointIds = geometry.rectangle.corners.map((corner) =>
    state.writer.add("IFCCARTESIANPOINT", [
      list([
        real((corner.x - center.x) * state.siFactor),
        real((corner.y - center.y) * state.siFactor),
        real((corner.z - center.z) * state.siFactor),
      ]),
    ]),
  );
  // Closed outline: the first corner repeats (shared entity reference).
  const closed = [...pointIds, pointIds[0]!];
  const polyline = state.writer.add("IFCPOLYLINE", [list(closed.map((id) => ref(id)))]);
  const curveSet = state.writer.add("IFCGEOMETRICCURVESET", [list([ref(polyline)])]);
  const shapeRepresentation = state.writer.add("IFCSHAPEREPRESENTATION", [
    ref(state.context),
    str("Body"),
    str("GeometricSet"),
    list([ref(curveSet)]),
  ]);
  const productShape = state.writer.add("IFCPRODUCTDEFINITIONSHAPE", [
    UNSET,
    UNSET,
    list([ref(shapeRepresentation)]),
  ]);
  return ref(productShape);
}

/** Pset_AISEIdentity — the explicit round-trip mapping (AC-102). */
function emitIdentityPset(
  state: EmissionState,
  entityId: number,
  object: RealityObject,
  hasGeometry: boolean,
): void {
  const properties: Array<[string, string]> = [
    ["ObjectId", object.objectId],
    ["ObjectClass", object.objectClass],
    ["ContentHash", object.contentHash],
    ["EpistemicState", object.epistemicState],
    ["EpistemicScope", "existence+geometry"],
    ["GeometryExported", hasGeometry ? "Yes" : "No"],
  ];
  if (object.name !== undefined) {
    properties.push(["Name", object.name]);
  }
  emitPropertySet(state, entityId, AISE_PSET_NAMES.identity, properties);
}

/** Pset_AISEProvenance — service, method, version, pinned inputs. */
function emitProvenancePset(state: EmissionState, entityId: number, object: RealityObject): void {
  emitPropertySet(state, entityId, AISE_PSET_NAMES.provenance, [
    ["ServiceId", object.provenance.serviceId],
    ["Method", object.provenance.method],
    ["MethodVersion", object.provenance.methodVersion],
    ["Inputs", object.provenance.inputs.map(provenanceInputText).join("; ")],
  ]);
}

/** Pset_AISECanonicalQuantities (verbatim) + BaseQuantities (SI). */
function emitCanonicalQuantityPsets(
  state: EmissionState,
  entityId: number,
  geometry: StructuredPlanarGeometry,
): void {
  const canonical: Array<[string, string]> = [
    ["Width", quantityText(geometry.width)],
    ["Height", quantityText(geometry.height)],
    ["Area", quantityText(geometry.area)],
  ];
  if (geometry.elevation !== undefined) {
    canonical.push(["Elevation", quantityText(geometry.elevation)]);
  }
  if (geometry.sillHeight !== undefined) {
    canonical.push(["SillHeight", quantityText(geometry.sillHeight)]);
  }
  if (geometry.headHeight !== undefined) {
    canonical.push(["HeadHeight", quantityText(geometry.headHeight)]);
  }
  emitPropertySet(state, entityId, AISE_PSET_NAMES.canonicalQuantities, canonical);

  const lengthQuantity = (name: string, quantity: { value: number; unit: string; uncertainty?: ModelUncertainty }): number => {
    const id = state.writer.add("IFCQUANTITYLENGTH", [
      str(name),
      UNSET,
      UNSET,
      real(quantity.value * state.siFactor),
      str(`canonical: ${quantityText(quantity)}`),
    ]);
    state.quantities += 1;
    return id;
  };
  const quantityIds: number[] = [
    lengthQuantity("Width", geometry.width),
    lengthQuantity("Height", geometry.height),
  ];
  const areaId = state.writer.add("IFCQUANTITYAREA", [
    str("Area"),
    UNSET,
    UNSET,
    real(geometry.area.value * siAreaFactor(geometry.area.unit)),
    str(`canonical: ${quantityText(geometry.area)}`),
  ]);
  state.quantities += 1;
  quantityIds.push(areaId);
  if (geometry.elevation !== undefined) {
    quantityIds.push(lengthQuantity("Elevation", geometry.elevation));
  }
  if (geometry.sillHeight !== undefined) {
    quantityIds.push(lengthQuantity("SillHeight", geometry.sillHeight));
  }
  if (geometry.headHeight !== undefined) {
    quantityIds.push(lengthQuantity("HeadHeight", geometry.headHeight));
  }
  const elementQuantity = state.writer.add("IFCELEMENTQUANTITY", [
    str(ifcGuidOf(`${state.modelId}|eq|${entityId}|BaseQuantities`)),
    ref(state.owner),
    str(AISE_PSET_NAMES.baseQuantities),
    UNSET,
    str("AISE canonical quantities - exact SI conversion of the verbatim values"),
    list(quantityIds.map((id) => ref(id))),
  ]);
  state.propertySets += 1;
  state.writer.add("IFCRELDEFINESBYPROPERTIES", [
    str(ifcGuidOf(`${state.modelId}|relDef|${entityId}|${AISE_PSET_NAMES.baseQuantities}`)),
    ref(state.owner),
    UNSET,
    UNSET,
    list([ref(entityId)]),
    ref(elementQuantity),
  ]);
}

// --- property-set plumbing --------------------------------------------------------

/** Emits one property set + its defining relationship. */
function emitPropertySet(
  state: EmissionState,
  entityId: number,
  psetName: string,
  properties: readonly (readonly [string, string])[],
): void {
  if (properties.length === 0) {
    return;
  }
  const propertyIds = properties.map(([name, value]) =>
    state.writer.add("IFCPROPERTYSINGLEVALUE", [str(name), UNSET, str(value), UNSET]),
  );
  const propertySet = state.writer.add("IFCPROPERTYSET", [
    str(ifcGuidOf(`${state.modelId}|pset|${entityId}|${psetName}`)),
    ref(state.owner),
    str(psetName),
    UNSET,
    list(propertyIds.map((id) => ref(id))),
  ]);
  state.propertySets += 1;
  state.writer.add("IFCRELDEFINESBYPROPERTIES", [
    str(ifcGuidOf(`${state.modelId}|relDef|${entityId}|${psetName}`)),
    ref(state.owner),
    UNSET,
    UNSET,
    list([ref(entityId)]),
    ref(propertySet),
  ]);
}

// --- evidence plumbing --------------------------------------------------------------

/** Links pinned to this object (existence + every property subject). */
function objectEvidenceLinks(
  index: EvidenceIndex,
  modelId: string,
  objectId: string,
): readonly EvidenceLink[] {
  const matches: EvidenceLink[] = [];
  for (const links of index.bySubject.values()) {
    for (const link of links) {
      const subject = link.subject;
      if (subject.modelId !== modelId) {
        continue;
      }
      if (
        (subject.kind === "object-existence" || subject.kind === "object-property") &&
        subject.objectId === objectId
      ) {
        matches.push(link);
      }
    }
  }
  matches.sort((a, b) => (a.linkId < b.linkId ? -1 : a.linkId > b.linkId ? 1 : 0));
  return matches;
}

/** Space-property links of one space. */
function spaceEvidenceLinks(
  index: EvidenceIndex,
  modelId: string,
  version: number,
  spaceId: string,
): readonly EvidenceLink[] {
  const matches: EvidenceLink[] = [];
  for (const links of index.bySubject.values()) {
    for (const link of links) {
      const subject = link.subject;
      if (
        subject.modelId === modelId &&
        subject.version === version &&
        subject.kind === "space-property" &&
        subject.spaceId === spaceId
      ) {
        matches.push(link);
      }
    }
  }
  matches.sort((a, b) => (a.linkId < b.linkId ? -1 : a.linkId > b.linkId ? 1 : 0));
  return matches;
}

/** One evidence link as a property [name, value] pair (honest status). */
function evidenceProperty(link: EvidenceLink, index: EvidenceIndex): [string, string] {
  const record = index.records.get(link.evidenceId);
  if (record === undefined) {
    throw new ExportIfcError(
      "EVIDENCE_RECORD_MISSING",
      `evidence link ${link.linkId} references record ${link.evidenceId}, which the evidence graph does not contain`,
      { details: { linkId: link.linkId, evidenceId: link.evidenceId } },
    );
  }
  const status = index.retractedLinks.has(link.linkId)
    ? "LINK_RETRACTED"
    : index.retractedRecords.has(record.evidenceId)
      ? "RECORD_RETRACTED"
      : "LIVE";
  const subjectLabel =
    link.subject.kind === "object-existence"
      ? "existence"
      : link.subject.kind === "object-property"
        ? `property ${link.subject.propertyKey}`
        : `space property ${link.subject.propertyKey}`;
  const value = [
    record.kind,
    evidenceSourceText(record),
    `record ${record.evidenceId} hash ${record.contentHash}`,
    `recordedBy ${record.recordedBy} at ${record.recordedAt}`,
    `status ${status}`,
    `subject ${subjectLabel}`,
    `linkedBy ${link.linkedBy} at ${link.linkedAt}`,
    ...(link.method !== undefined ? [`link method ${link.method}`] : []),
    ...(record.notes !== undefined ? [`notes ${record.notes}`] : []),
  ].join(" | ");
  return [`Evidence_${link.linkId}`, value];
}
