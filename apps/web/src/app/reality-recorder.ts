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
