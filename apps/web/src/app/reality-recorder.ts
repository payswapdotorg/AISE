/**
 * PROD-016 — the reality RECORDER's pure logic (no React, no fetch).
 *
 * THE REALITY-MATERIALIZATION SEAM (the parity scorecard's open item #1,
 * 2026-09-29): "a UI path from captured evidence to a first reality
 * version (reconstruction-driven or composed with evidence provenance)" —
 * the one place a first-time user still needed the API to cross
 * capture → reality → intervention. This module is the composed-with-
 * evidence-provenance path: a draft model, typed client-side defect
 * checks (every defect NAMED, never thrown — the create-forms
 * discipline) and the EXACT wire mapping to the reality graph's governed
 * changes API (`POST /v1/reality/projects/:id/changes`, engine-validated
 * server-side; the client pre-checks only what the engine would refuse).
 *
 * Honesty:
 *  - the node/relationship vocabularies are the backend's CLOSED lists,
 *    mirrored verbatim and PINNED BY TEST (no second enum drift);
 *  - epistemic statuses reuse the shared contract's EPISTEMIC_STATUSES
 *    VERBATIM (the backend's own "no second enum" rule);
 *  - every assertion (node, each property, relationship) carries at
 *    least one provenance source (evidenceId from the live register
 *    and/or a derivation note) — `missing_provenance` is pre-checked
 *    client-side and still enforced by the engine;
 *  - numeric properties require a typed unit (`parseStepPropertyLines`
 *    is reused — the same parser the intervention append-step panel
 *    uses; one parser, no drift);
 *  - relationship endpoints must exist IN THE DRAFT (the engine's
 *    final-state `dangling_reference` check pre-checked client-side);
 *  - the panel NEVER invents content: captions and options come from
 *    the record's own fields only (the evidence-picker discipline).
 */

import { parseStepPropertyLines } from "./create-forms";
import { EPISTEMIC_STATUSES } from "../../../../packages/shared-contracts/src/index";
// ANCHOR-003a (read-only consumer): the plan-context typed shape is carried
// from the anchoring contract's OWN modules — vocabularies.ts (the closed
// PLAN_CONTEXT_KINDS) and request.ts (planContextSchema + the PlanContext
// type) — NEVER the package barrel index (which re-exports the supervised
// subprocess runner's node:child_process and would leak Node-builtin
// markers into the browser bundle — the PROD-030/031 bundle gates exist
// to catch exactly that).
import { PLAN_CONTEXT_KINDS } from "../../../../packages/anchoring-contract/src/vocabularies";
import {
  planContextSchema,
  type PlanContext,
} from "../../../../packages/anchoring-contract/src/request";

/* ------------------------------------------------------------------ */
/* Closed vocabularies (mirrors, pinned by test)                       */
/* ------------------------------------------------------------------ */

/**
 * The reality NodeKind closed vocabulary — mirrors
 * `backend/api/src/reality/model.ts` NODE_KINDS VERBATIM (single source
 * is the backend; `reality-recorder.test.ts` pins the exact list so a
 * backend change fails this suite until the mirror is updated).
 */
export const REALITY_NODE_KINDS = [
  "project",
  "site",
  "building",
  "storey",
  "space",
  "element",
  "opening",
  "system",
  "issue",
  "annotation",
] as const;

/**
 * The reality relationship closed vocabulary — mirrors
 * `backend/api/src/reality/model.ts` RELATIONSHIP_KINDS VERBATIM
 * (pinned by the same test).
 */
export const REALITY_RELATIONSHIP_KINDS = [
  "contains",
  "bounded-by",
  "adjacent-to",
  "supports",
  "part-of",
  "opens-into",
  "references",
] as const;

/** The epistemic statuses the engine accepts (shared contract, verbatim). */
export const REALITY_EPISTEMIC_STATUSES: readonly string[] = EPISTEMIC_STATUSES;

/** The provenance roles the engine accepts — mirrors PROVENANCE_ROLES. */
export const REALITY_PROVENANCE_ROLES = [
  "SUPPORTS",
  "DERIVED_FROM",
  "CONTEXT",
  "CONTRADICTS",
] as const;

/* ------------------------------------------------------------------ */
/* Draft model                                                          */
/* ------------------------------------------------------------------ */

/** One node being composed (all fields are raw user input, unvalidated). */
export interface RealityNodeDraft {
  /** Caller-supplied stable id (1..256 chars, unique within the draft). */
  readonly nodeId: string;
  /** One of REALITY_NODE_KINDS (validated, never trusted). */
  readonly kind: string;
  /** One of REALITY_EPISTEMIC_STATUSES (validated, never trusted). */
  readonly epistemicStatus: string;
  /** `key = value unit` lines (the append-step parser is reused). */
  readonly propertyLines: string;
  /** Evidence content ids (64-hex) from the live register's picker. */
  readonly provenanceEvidenceIds: readonly string[];
  /** Explicit derivation note (evidence OR note — one is REQUIRED). */
  readonly provenanceDerivationNote: string;
}

/** One relationship being composed between two DRAFT nodes. */
export interface RealityRelationDraft {
  readonly fromNodeId: string;
  readonly toNodeId: string;
  /** One of REALITY_RELATIONSHIP_KINDS (validated, never trusted). */
  readonly kind: string;
  readonly provenanceEvidenceIds: readonly string[];
  readonly provenanceDerivationNote: string;
}

/** The whole snapshot draft: which reality project + what to assert. */
export interface RealitySnapshotDraft {
  /** The reality project id (created first when unknown — 404/exists). */
  readonly projectId: string;
  readonly nodes: readonly RealityNodeDraft[];
  readonly relations: readonly RealityRelationDraft[];
}

/** The wire shape of one provenance record (engine-validated server-side). */
export interface WireProvenanceRecord {
  readonly role: string;
  readonly evidenceId?: string;
  readonly derivationNote?: string;
  readonly recordedAt: string;
}

/** The wire shape of one property record. */
export interface WirePropertyRecord {
  readonly key: string;
  readonly value: string | number | boolean;
  readonly unit?: string;
  readonly epistemicStatus: string;
  readonly provenance: readonly WireProvenanceRecord[];
}

/** The wire shape of one upsert-node change record. */
export interface WireUpsertNode {
  readonly op: "upsert-node";
  readonly node: {
    readonly nodeId: string;
    readonly kind: string;
    readonly epistemicStatus: string;
    readonly properties: readonly WirePropertyRecord[];
    readonly provenance: readonly WireProvenanceRecord[];
  };
}

/** The wire shape of one upsert-relationship change record. */
export interface WireUpsertRelationship {
  readonly op: "upsert-relationship";
  readonly relationship: {
    readonly relationshipId: string;
    readonly fromNodeId: string;
    readonly toNodeId: string;
    readonly kind: string;
    readonly provenance: readonly WireProvenanceRecord[];
  };
}

/** One change record of the governed changes API (the closed op set used here). */
export type RealityChangeRecord = WireUpsertNode | WireUpsertRelationship;

/** The exact POST body of `/v1/reality/projects/:id/changes`. */
export interface RealityChangesRequestBody {
  readonly changes: readonly RealityChangeRecord[];
}

/* ------------------------------------------------------------------ */
/* Validation (every defect NAMED, never thrown)                       */
/* ------------------------------------------------------------------ */

function nonEmpty(value: string): boolean {
  return value.trim().length > 0;
}

function isStableId(value: string): boolean {
  return value.length >= 1 && value.length <= 256;
}

function isContentId(value: string): boolean {
  return /^[0-9a-f]{64}$/.test(value);
}

/**
 * Validate a snapshot draft against the reality engine's own rules (the
 * typed refusals the client can predict) plus the draft's structural
 * invariants (duplicate ids, dangling endpoints, duplicate derived
 * relationship ids). Returns the named defects in deterministic order;
 * an empty list means the draft maps cleanly to the wire body.
 */
export function validateRealitySnapshotDraft(draft: RealitySnapshotDraft): readonly string[] {
  const defects: string[] = [];
  if (!isStableId(draft.projectId)) {
    defects.push("project id must be 1..256 characters");
  }
  if (draft.nodes.length === 0) {
    defects.push("at least one node is required — a snapshot with no assertions is not a snapshot");
  }
  const nodeIds = new Set<string>();
  draft.nodes.forEach((node, index) => {
    const where = `node ${String(index + 1)}`;
    if (!isStableId(node.nodeId)) {
      defects.push(`${where}: node id must be 1..256 characters`);
    } else if (nodeIds.has(node.nodeId)) {
      defects.push(`${where}: duplicate node id "${node.nodeId}" — node ids are unique within a version`);
    } else {
      nodeIds.add(node.nodeId);
    }
    if (!(REALITY_NODE_KINDS as readonly string[]).includes(node.kind)) {
      defects.push(
        `${where}: kind "${node.kind}" is not in the closed NodeKind vocabulary (${REALITY_NODE_KINDS.join("|")})`,
      );
    }
    if (!(REALITY_EPISTEMIC_STATUSES as readonly string[]).includes(node.epistemicStatus)) {
      defects.push(
        `${where}: epistemic status "${node.epistemicStatus}" is not one of ${REALITY_EPISTEMIC_STATUSES.join("|")}`,
      );
    }
    const parsed = parseStepPropertyLines(node.propertyLines);
    if (!parsed.ok) {
      for (const defect of parsed.defects) {
        defects.push(`${where} properties — ${defect}`);
      }
    }
    if (node.provenanceEvidenceIds.length === 0 && !nonEmpty(node.provenanceDerivationNote)) {
      defects.push(
        `${where}: missing provenance — pick at least one evidence record or write a derivation note (the engine refuses source-less assertions)`,
      );
    }
    node.provenanceEvidenceIds.forEach((id, idIndex) => {
      if (!isContentId(id)) {
        defects.push(`${where}: provenance evidence ${String(idIndex + 1)} is not a 64-hex content address`);
      }
    });
  });
  const relationIds = new Set<string>();
  draft.relations.forEach((relation, index) => {
    const where = `relation ${String(index + 1)}`;
    if (!nodeIds.has(relation.fromNodeId)) {
      defects.push(
        `${where}: "from" node "${relation.fromNodeId}" is not composed in this snapshot (dangling endpoints are refused)`,
      );
    }
    if (!nodeIds.has(relation.toNodeId)) {
      defects.push(
        `${where}: "to" node "${relation.toNodeId}" is not composed in this snapshot (dangling endpoints are refused)`,
      );
    }
    if (!(REALITY_RELATIONSHIP_KINDS as readonly string[]).includes(relation.kind)) {
      defects.push(
        `${where}: kind "${relation.kind}" is not in the closed relationship vocabulary (${REALITY_RELATIONSHIP_KINDS.join("|")})`,
      );
    }
    const relationshipId = derivedRelationshipId(relation);
    if (relationshipId.length > 256) {
      defects.push(`${where}: the derived relationship id exceeds 256 characters — shorten the node ids`);
    } else if (relationIds.has(relationshipId)) {
      defects.push(`${where}: duplicate relationship "${relationshipId}" — the same directed edge is asserted twice`);
    } else {
      relationIds.add(relationshipId);
    }
    if (relation.provenanceEvidenceIds.length === 0 && !nonEmpty(relation.provenanceDerivationNote)) {
      defects.push(
        `${where}: missing provenance — pick at least one evidence record or write a derivation note`,
      );
    }
    relation.provenanceEvidenceIds.forEach((id, idIndex) => {
      if (!isContentId(id)) {
        defects.push(`${where}: provenance evidence ${String(idIndex + 1)} is not a 64-hex content address`);
      }
    });
  });
  return defects;
}

/* ------------------------------------------------------------------ */
/* Wire mapping                                                         */
/* ------------------------------------------------------------------ */

/**
 * The deterministic relationship id for a draft relation:
 * `<from>--<kind>--> <to>` (stable, readable, unique per directed edge —
 * the caller-supplied stable-id discipline the engine requires).
 */
export function derivedRelationshipId(relation: RealityRelationDraft): string {
  return `${relation.fromNodeId}--${relation.kind}-->${relation.toNodeId}`;
}

/** Build the node's provenance records: one SUPPORTS per evidence id + one DERIVED_FROM note when present. */
function provenanceRecordsOf(
  evidenceIds: readonly string[],
  derivationNote: string,
  recordedAt: string,
): WireProvenanceRecord[] {
  const records: WireProvenanceRecord[] = evidenceIds.map((evidenceId) => ({
    role: "SUPPORTS",
    evidenceId,
    recordedAt,
  }));
  if (nonEmpty(derivationNote)) {
    records.push({ role: "DERIVED_FROM", derivationNote: derivationNote.trim(), recordedAt });
  }
  return records;
}

/**
 * Map a validated draft to the EXACT POST body of the governed changes
 * API. Node upserts come FIRST, relationship upserts AFTER (the engine
 * applies a change set sequentially and checks final-state referential
 * integrity — a relationship may only reference nodes that exist by the
 * time the set completes). Numeric properties keep their typed units
 * verbatim; every node's provenance is stamped onto the node AND each of
 * its properties (the form says so: "Evidence behind this node applies
 * to the node and every property you list").
 */
export function realitySnapshotRequestBody(
  draft: RealitySnapshotDraft,
  recordedAtIso: string,
): { readonly ok: true; readonly body: RealityChangesRequestBody } | { readonly ok: false; readonly defects: readonly string[] } {
  const defects = validateRealitySnapshotDraft(draft);
  if (defects.length > 0) {
    return { ok: false, defects };
  }
  const changes: RealityChangeRecord[] = [];
  for (const node of draft.nodes) {
    const parsed = parseStepPropertyLines(node.propertyLines);
    // validateRealitySnapshotDraft already returned on parse defects.
    const properties: WirePropertyRecord[] = (parsed.ok ? parsed.properties : []).map((property) => ({
      key: property.key,
      value: property.value,
      ...(property.unit === undefined ? {} : { unit: property.unit }),
      epistemicStatus: node.epistemicStatus,
      provenance: provenanceRecordsOf(
        node.provenanceEvidenceIds,
        node.provenanceDerivationNote,
        recordedAtIso,
      ),
    }));
    changes.push({
      op: "upsert-node",
      node: {
        nodeId: node.nodeId,
        kind: node.kind,
        epistemicStatus: node.epistemicStatus,
        properties,
        provenance: provenanceRecordsOf(
          node.provenanceEvidenceIds,
          node.provenanceDerivationNote,
          recordedAtIso,
        ),
      },
    });
  }
  for (const relation of draft.relations) {
    changes.push({
      op: "upsert-relationship",
      relationship: {
        relationshipId: derivedRelationshipId(relation),
        fromNodeId: relation.fromNodeId,
        toNodeId: relation.toNodeId,
        kind: relation.kind,
        provenance: provenanceRecordsOf(
          relation.provenanceEvidenceIds,
          relation.provenanceDerivationNote,
          recordedAtIso,
        ),
      },
    });
  }
  return { ok: true, body: { changes } };
}

/* ------------------------------------------------------------------ */
/* Result view (what the panel renders after the POST)                  */
/* ------------------------------------------------------------------ */

/** The honest result of a recorded snapshot (record fields only). */
export interface RealityRecordedView {
  readonly projectId: string;
  readonly versionId: string;
  readonly nodeCount: number;
  readonly relationshipCount: number;
  readonly changeCount: number;
}

/* ------------------------------------------------------------------ */
/* ANCHOR-003a — the plan-context seam (the plan-image import lane)    */
/*                                                                     */
/* The reality recorder's READABLE plan/floor-context surface. The     */
/* shipped anchoring contract (`packages/anchoring-contract`, wire id  */
/* `anchor002-anchoring-contract/1`) consumes plan context of kind     */
/* `plan-raster` with the rasterToScene HANDEDNESS LAW as a first-     */
/* class field — this seam imports a plan image through the EXISTING   */
/* digest→asset→registration path (PROD-016/016b: `webCryptoSha256` →  */
/* `uploadCaptureAssetLive` → `registerEvidenceLive` — never a new     */
/* storage seam) and declares a plan-context record whose typed shape  */
/* is CARRIED FROM THE CONTRACT (PLAN_CONTEXT_KINDS + planContextSchema */
/* imported read-only; the record is validated by the contract's OWN   */
/* schema — never reinvented here). NO anchoring execution happens     */
/* here (a separate worker's lane).                                    */
/*                                                                     */
/* The ACTIVE plan context for a project/version is recorded through   */
/* the EXISTING governed state seam — the reality graph's changes API  */
/* (`POST /v1/reality/projects/:id/changes`) as ONE annotation node    */
/* with the STABLE id `active-plan-context` (selecting a different     */
/* plan raster upserts the same node: at most one active plan context  */
/* per version, by construction — no new authority, no second          */
/* canonical model). Every defect is NAMED, never thrown; refusals     */
/* carry ZERO side effects.                                            */
/* ------------------------------------------------------------------ */

/**
 * The closed plan-context kinds — REUSED VERBATIM from the anchoring
 * contract (the single source is `packages/anchoring-contract`; the
 * colocated test pins the equality so a contract change fails this
 * suite until the seam is updated — no second-enum drift).
 */
export const PLAN_CONTEXT_KIND_OPTIONS: readonly string[] = PLAN_CONTEXT_KINDS;

/**
 * The stable annotation-node id carrying the ACTIVE plan context. The
 * upsert semantics of the governed changes API make re-selection a
 * same-id upsert: the new version carries exactly ONE active plan
 * context node (the previous one is replaced, versions keep history).
 */
export const PLAN_CONTEXT_ANNOTATION_NODE_ID = "active-plan-context";

/**
 * The honest acquisition method for an imported plan drawing — a plan
 * raster is an imported DOCUMENT REGION (a drawing), never STILL_IMAGERY
 * (photos). The plan-raster list filter keys on exactly this pair:
 * `DOCUMENT_REGION` + an `image/*` media type (what the evidence index
 * exposes; the register stays the authority).
 */
export const PLAN_IMPORT_ACQUISITION_METHOD = "DOCUMENT_REGION";

/** The declared raster scale's typed unit (pixels per meter). */
export const PLAN_RASTER_SCALE_UNIT = "px/m";
/** The world-origin pixel coordinates' typed unit. */
export const PLAN_RASTER_PX_UNIT = "px";

/**
 * The annotation node's property keys (the plan-context record's wire
 * form on the reality graph — closed, test-pinned; every key is carried
 * verbatim from the contract's own field names).
 */
export const PLAN_CONTEXT_PROPERTY_KEYS = [
  "plan.kind",
  "plan.planId",
  "plan.contentId",
  "plan.mediaType",
  "plan.bytesPath",
  "raster.pixelsPerMeter",
  "raster.xDirection",
  "raster.yDirection",
  "raster.worldOriginPx.x",
  "raster.worldOriginPx.y",
] as const;

/**
 * Where the AISE side pinned the plan bytes — the content-addressed
 * store's own addressing convention (the capture gateway's asset route,
 * consumed read-only; the store is the authority).
 */
export function planBytesPath(contentId: string): string {
  return `/v1/capture/assets/${contentId}`;
}

/** One imported plan raster as the evidence register lists it (record fields only). */
export interface PlanRasterOption {
  readonly contentId: string;
  readonly mediaType: string;
  readonly byteSize: number;
  readonly capturedAt: string;
  /** Honest caption from the record's own fields, nothing invented. */
  readonly caption: string;
}

/**
 * The structural slice of the evidence index item the plan-raster filter
 * consumes (assignable from the live index items — no import from the
 * api module keeps this module pure; the panel passes the live items).
 */
export interface PlanRasterSourceItem {
  readonly evidence: {
    readonly contentId: string;
    readonly acquisitionMethod: string;
    readonly mediaType: string;
    readonly byteSize: number;
    readonly capturedAt: string;
  };
  readonly invalidation: { readonly reason: string; readonly invalidatedAt: string } | null;
}

/**
 * Map the LIVE evidence register's items into the imported-plan-raster
 * options: an UNINVALIDATED record whose media type is an image AND whose
 * acquisition method is DOCUMENT_REGION (an imported drawing — the plan
 * lane's own registration discipline). Captions come from the record's
 * own fields only (the evidence-picker discipline); invalidated records
 * are excluded (invalidated ≠ deleted, but never offered for a new
 * activation).
 */
export function planRasterOptionsFromLive(
  items: readonly PlanRasterSourceItem[],
): readonly PlanRasterOption[] {
  const options: PlanRasterOption[] = [];
  for (const item of items) {
    if (item.invalidation !== null) {
      continue;
    }
    if (!item.evidence.mediaType.startsWith("image/")) {
      continue;
    }
    if (item.evidence.acquisitionMethod !== PLAN_IMPORT_ACQUISITION_METHOD) {
      continue;
    }
    options.push({
      contentId: item.evidence.contentId,
      mediaType: item.evidence.mediaType,
      byteSize: item.evidence.byteSize,
      capturedAt: item.evidence.capturedAt,
      caption: `${item.evidence.acquisitionMethod} · ${item.evidence.mediaType} · ${String(item.evidence.byteSize)} bytes · ${item.evidence.capturedAt}`,
    });
  }
  return options;
}

/**
 * The plan lane's pre-upload gate: a NON-IMAGE media type is refused BY
 * NAME before any upload happens (fail closed BEFORE side effects — the
 * bytes are never read, hashed or POSTed). Returns null when acceptable.
 */
export function planImageUploadDefect(mediaType: string): string | null {
  if (mediaType.startsWith("image/")) {
    return null;
  }
  return `the plan lane imports raster images only — media type "${mediaType}" is refused before any upload (zero side effects)`;
}

/** One plan-context declaration draft (raw user input over the records' own fields). */
export interface PlanImportDraft {
  /** One of PLAN_CONTEXT_KINDS (validated, never trusted). */
  readonly kind: string;
  /** The AISE-owned plan identity (1..256 chars). */
  readonly planId: string;
  /** The stored plan bytes' content address (64-hex, prefilled from the upload). */
  readonly imageContentId: string;
  /** The stored plan bytes' media type (prefilled; must be image/*). */
  readonly imageMediaType: string;
  /** Where the AISE side pinned the plan bytes (prefilled from the store route). */
  readonly bytesPath: string;
  /** Declared raster scale, pixels per meter (strictly positive). */
  readonly pixelsPerMeter: string;
  /** Declared world-origin pixel, x component. */
  readonly worldOriginX: string;
  /** Declared world-origin pixel, y component. */
  readonly worldOriginY: string;
  /** The rasterToScene handedness law's column direction (closed literal). */
  readonly xDirection: string;
  /** The rasterToScene handedness law's row direction (closed literal). */
  readonly yDirection: string;
}

function isFiniteNumber(value: string): number | null {
  const parsed = Number(value.trim());
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Validate a plan-context declaration draft against the contract's own
 * rules (every defect NAMED, never thrown; deterministic order): the
 * closed plan-context kind vocabulary (an unknown kind is refused WITH
 * THE KIND NAMED), the AISE-owned 64-hex content id (a wrong digest is
 * refused), the image-only media type (non-image content is refused),
 * the strictly-positive raster scale, the world-origin pixel pair, and
 * the rasterToScene HANDEDNESS LAW's closed literals (east-right /
 * north-up — never an implicit assumption).
 */
export function validatePlanImportDraft(draft: PlanImportDraft): readonly string[] {
  const defects: string[] = [];
  const kind = draft.kind.trim();
  if (!(PLAN_CONTEXT_KINDS as readonly string[]).includes(kind)) {
    defects.push(
      `plan-context kind "${kind}" is not in the closed plan-context vocabulary (${PLAN_CONTEXT_KINDS.join("|")})`,
    );
  }
  const planId = draft.planId.trim();
  if (planId.length === 0 || planId.length > 256) {
    defects.push("plan id must be 1..256 characters (the AISE-owned plan identity)");
  }
  if (!/^[0-9a-f]{64}$/.test(draft.imageContentId.trim())) {
    defects.push(
      "plan image content id must be a 64-hex sha-256 content address (the digest of the stored plan bytes)",
    );
  }
  const mediaType = draft.imageMediaType.trim();
  if (!mediaType.startsWith("image/")) {
    defects.push(
      `plan image media type "${mediaType}" is not an image media type — the plan-raster lane imports raster images only`,
    );
  }
  const bytesPath = draft.bytesPath.trim();
  if (bytesPath.length === 0 || bytesPath.length > 256) {
    defects.push("plan bytes path must be 1..256 characters (where the AISE side pinned the plan bytes)");
  }
  const scale = isFiniteNumber(draft.pixelsPerMeter);
  if (scale === null || scale <= 0) {
    defects.push("pixels per meter must be a finite positive number (the declared raster scale)");
  }
  if (draft.xDirection.trim() !== "east-right") {
    defects.push(
      `raster x direction "${draft.xDirection.trim()}" is not the closed literal "east-right" (the rasterToScene handedness law)`,
    );
  }
  if (draft.yDirection.trim() !== "north-up") {
    defects.push(
      `raster y direction "${draft.yDirection.trim()}" is not the closed literal "north-up" (the rasterToScene handedness law)`,
    );
  }
  if (isFiniteNumber(draft.worldOriginX) === null) {
    defects.push("world origin x must be a finite number (the raster pixel at the scene origin)");
  }
  if (isFiniteNumber(draft.worldOriginY) === null) {
    defects.push("world origin y must be a finite number (the raster pixel at the scene origin)");
  }
  return defects;
}

/**
 * Map a validated draft to the EXACT `PlanContext` record of the
 * anchoring contract — and validate it against the CONTRACT'S OWN
 * `planContextSchema` (the typed shape is carried from the contract,
 * never reinvented; a schema refusal is mapped to named defects, fail
 * closed). The returned record is the contract-parsed value.
 */
export function planContextRecord(
  draft: PlanImportDraft,
): { readonly ok: true; readonly record: PlanContext } | { readonly ok: false; readonly defects: readonly string[] } {
  const defects = validatePlanImportDraft(draft);
  if (defects.length > 0) {
    return { ok: false, defects };
  }
  const candidate = {
    kind: draft.kind.trim() as PlanContext["kind"],
    planId: draft.planId.trim(),
    imageContentId: draft.imageContentId.trim(),
    imageMediaType: draft.imageMediaType.trim(),
    bytesPath: draft.bytesPath.trim(),
    rasterToScene: {
      pixelsPerMeter: isFiniteNumber(draft.pixelsPerMeter) as number,
      xDirection: "east-right" as const,
      yDirection: "north-up" as const,
      worldOriginPx: [
        isFiniteNumber(draft.worldOriginX) as number,
        isFiniteNumber(draft.worldOriginY) as number,
      ],
    },
  };
  const parsed = planContextSchema.safeParse(candidate);
  if (!parsed.success) {
    const schemaDefects = parsed.error.issues.map(
      (issue) =>
        `the anchoring contract's planContext schema refused the declaration: ${issue.path.join(".")} — ${issue.message}`,
    );
    return { ok: false, defects: [...defects, ...schemaDefects] };
  }
  return { ok: true, record: parsed.data as PlanContext };
}

/** The structural slice of a graph annotation node the reader consumes. */
export interface AnnotationNodeLike {
  readonly nodeId: string;
  readonly kind: string;
  readonly properties: readonly {
    readonly key: string;
    readonly value: string | number | boolean;
    readonly unit?: string;
  }[];
}

/** The structural slice of a graph version the active-plan-context reader consumes. */
export interface GraphVersionNodesLike {
  readonly versionId: string;
  readonly nodes: readonly AnnotationNodeLike[];
}

function propertyOf(node: AnnotationNodeLike, key: string): { readonly value: string | number | boolean } | null {
  for (const property of node.properties) {
    if (property.key === key) {
      return property;
    }
  }
  return null;
}

function finiteNumberOf(value: string | number | boolean): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * Read ONE graph annotation node back into the contract's `PlanContext`
 * record — the readable surface's typed reader (every consumer of the
 * active plan context goes through here; the rebuild is validated
 * against the contract's OWN schema). Every refusal is NAMED: a node
 * that is not an annotation, a plan-context kind outside the closed
 * vocabulary (THE KIND NAMED), a wrong digest, a non-image media type,
 * a missing property, a non-numeric scale or origin, or a handedness
 * literal other than east-right/north-up. ZERO side effects: this is a
 * pure read.
 */
export function planContextOfAnnotationNode(
  node: AnnotationNodeLike,
): { readonly ok: true; readonly record: PlanContext } | { readonly ok: false; readonly defects: readonly string[] } {
  const defects: string[] = [];
  if (node.kind !== "annotation") {
    return {
      ok: false,
      defects: [
        `node "${node.nodeId}" is not an annotation node (kind "${node.kind}") — the plan context rides annotation nodes only`,
      ],
    };
  }
  const required = PLAN_CONTEXT_PROPERTY_KEYS;
  const values = new Map<string, string | number | boolean>();
  for (const key of required) {
    const property = propertyOf(node, key);
    if (property === null) {
      defects.push(`the annotation is missing the required property "${key}"`);
      continue;
    }
    values.set(key, property.value);
  }
  if (defects.length > 0) {
    return { ok: false, defects };
  }
  const kind = values.get("plan.kind");
  if (typeof kind !== "string" || !(PLAN_CONTEXT_KINDS as readonly string[]).includes(kind)) {
    defects.push(
      `plan-context kind "${typeof kind === "string" ? kind : String(kind)}" is not in the closed plan-context vocabulary (${PLAN_CONTEXT_KINDS.join("|")})`,
    );
  }
  const planId = values.get("plan.planId");
  if (typeof planId !== "string" || planId.trim().length === 0 || planId.length > 256) {
    defects.push('the declared plan id is not bounded text (1..256 characters)');
  }
  const contentId = values.get("plan.contentId");
  if (typeof contentId !== "string" || !/^[0-9a-f]{64}$/.test(contentId)) {
    defects.push(
      `the declared plan image content id is not a 64-hex sha-256 content address (found "${typeof contentId === "string" ? contentId : String(contentId)}")`,
    );
  }
  const mediaType = values.get("plan.mediaType");
  if (typeof mediaType !== "string" || !mediaType.startsWith("image/")) {
    defects.push(
      `the declared plan image media type is not an image media type (found "${typeof mediaType === "string" ? mediaType : String(mediaType)}")`,
    );
  }
  const bytesPath = values.get("plan.bytesPath");
  if (typeof bytesPath !== "string" || bytesPath.trim().length === 0 || bytesPath.length > 256) {
    defects.push("the declared plan bytes path is not bounded text (1..256 characters)");
  }
  const scale = finiteNumberOf(values.get("raster.pixelsPerMeter") as string | number | boolean);
  if (scale === null || scale <= 0) {
    defects.push("the declared raster scale must be a finite positive number");
  }
  const xDirection = values.get("raster.xDirection");
  if (xDirection !== "east-right") {
    defects.push(`the declared raster x direction must be the closed literal "east-right" (found "${String(xDirection)}")`);
  }
  const yDirection = values.get("raster.yDirection");
  if (yDirection !== "north-up") {
    defects.push(`the declared raster y direction must be the closed literal "north-up" (found "${String(yDirection)}")`);
  }
  const originX = finiteNumberOf(values.get("raster.worldOriginPx.x") as string | number | boolean);
  if (originX === null) {
    defects.push("the declared world origin x must be a finite number");
  }
  const originY = finiteNumberOf(values.get("raster.worldOriginPx.y") as string | number | boolean);
  if (originY === null) {
    defects.push("the declared world origin y must be a finite number");
  }
  if (defects.length > 0) {
    return { ok: false, defects };
  }
  const candidate = {
    kind: kind as PlanContext["kind"],
    planId: planId as string,
    imageContentId: contentId as string,
    imageMediaType: mediaType as string,
    bytesPath: bytesPath as string,
    rasterToScene: {
      pixelsPerMeter: scale as number,
      xDirection: "east-right" as const,
      yDirection: "north-up" as const,
      worldOriginPx: [originX as number, originY as number],
    },
  };
  const parsed = planContextSchema.safeParse(candidate);
  if (!parsed.success) {
    const schemaDefects = parsed.error.issues.map(
      (issue) =>
        `the anchoring contract's planContext schema refused the rebuilt record: ${issue.path.join(".")} — ${issue.message}`,
    );
    return { ok: false, defects: schemaDefects };
  }
  return { ok: true, record: parsed.data as PlanContext };
}

/**
 * Read the ACTIVE plan context out of a graph version (null version or
 * no annotation node with the stable id → `active: null`, the honest
 * empty state; a malformed active node → NAMED defects, never coerced).
 */
export function activePlanContextOfVersion(
  version: GraphVersionNodesLike | null,
): { readonly ok: true; readonly active: PlanContext | null } | { readonly ok: false; readonly defects: readonly string[] } {
  if (version === null) {
    return { ok: true, active: null };
  }
  const node = version.nodes.find((entry) => entry.nodeId === PLAN_CONTEXT_ANNOTATION_NODE_ID);
  if (node === undefined) {
    return { ok: true, active: null };
  }
  const read = planContextOfAnnotationNode(node);
  if (!read.ok) {
    return { ok: false, defects: read.defects };
  }
  return { ok: true, active: read.record };
}

/** The declared-convention derivation note carried on the annotation's provenance. */
const PLAN_CONTEXT_DERIVATION_NOTE =
  "ANCHOR-003a plan-context declaration: the rasterToScene convention (pixelsPerMeter, worldOriginPx and the east-right/north-up handedness law) as declared at import and validated by the anchoring contract's own planContextSchema.";

/**
 * Build the ACTIVE-plan-context change record — ONE `upsert-node`
 * annotation under the STABLE id `active-plan-context`, carrying the
 * full declared plan-context record as typed properties (numbers with
 * their typed units — px/m and px; strings unitless, the engine's own
 * rule) and the plan raster's evidence record as SUPPORTS provenance
 * plus the declaration note as DERIVED_FROM. Selecting a different
 * plan raster upserts the SAME node id (the versioning engine replaces
 * it — exactly one active plan context per version).
 */
export function activePlanContextChangeRecord(
  record: PlanContext,
  recordedAtIso: string,
): WireUpsertNode {
  const provenance = provenanceRecordsOf([record.imageContentId], PLAN_CONTEXT_DERIVATION_NOTE, recordedAtIso);
  return {
    op: "upsert-node",
    node: {
      nodeId: PLAN_CONTEXT_ANNOTATION_NODE_ID,
      kind: "annotation",
      epistemicStatus: "PROPOSED",
      properties: [
        { key: "plan.kind", value: record.kind, epistemicStatus: "PROPOSED", provenance },
        { key: "plan.planId", value: record.planId, epistemicStatus: "PROPOSED", provenance },
        { key: "plan.contentId", value: record.imageContentId, epistemicStatus: "PROPOSED", provenance },
        { key: "plan.mediaType", value: record.imageMediaType, epistemicStatus: "PROPOSED", provenance },
        { key: "plan.bytesPath", value: record.bytesPath, epistemicStatus: "PROPOSED", provenance },
        {
          key: "raster.pixelsPerMeter",
          value: record.rasterToScene.pixelsPerMeter,
          unit: PLAN_RASTER_SCALE_UNIT,
          epistemicStatus: "PROPOSED",
          provenance,
        },
        { key: "raster.xDirection", value: record.rasterToScene.xDirection, epistemicStatus: "PROPOSED", provenance },
        { key: "raster.yDirection", value: record.rasterToScene.yDirection, epistemicStatus: "PROPOSED", provenance },
        {
          key: "raster.worldOriginPx.x",
          value: record.rasterToScene.worldOriginPx[0] as number,
          unit: PLAN_RASTER_PX_UNIT,
          epistemicStatus: "PROPOSED",
          provenance,
        },
        {
          key: "raster.worldOriginPx.y",
          value: record.rasterToScene.worldOriginPx[1] as number,
          unit: PLAN_RASTER_PX_UNIT,
          epistemicStatus: "PROPOSED",
          provenance,
        },
      ],
      provenance,
    },
  };
}
