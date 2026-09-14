/**
 * BOQ-to-reality mapping domain model (AISE-017) — the EXPLICIT derived
 * mapping records between BOQ items (AISE-011/014) and Reality Graph nodes
 * (AISE-016).
 *
 * Contract (spec/work-orders.md §017; spec/architecture-lock.md "BOQ Lens"):
 *
 *  - Mappings are EXPLICIT DERIVED INTERPRETATIONS: neither the source
 *    `BoqDocument` (AISE-011) nor the Reality Graph (AISE-016) is ever
 *    written by this module. Mismatch is REPORTED (entry status/reason),
 *    never silently resolved, and both sources keep their identity.
 *  - Every entry carries PROVENANCE (dictionary/normalizer versions, what
 *    the match was derived from, an injected clock reading) and a CONFIDENCE
 *    (`"uncertain"` is a first-class, expected outcome — never guessed away).
 *  - ONE-TO-MANY is structural: `targets` is an array (one BOQ row ->
 *    many reality objects, e.g. "plaster to walls" -> every wall). MANY-TO-
 *    ONE arises naturally: many rows can target the same node through
 *    separate entries.
 *  - Append-only revisions: a mapping record is versioned monotonically
 *    (`version`); manual edits create a NEW version — earlier versions'
 *    bytes are never rewritten (store discipline, mirrored in tests).
 *
 * Single validation path: `parseGraphSnapshot` / `parseManualMappingInput`
 * (wire + in-process inputs) and `parseMappingRecord` (stored bytes) are the
 * ONLY validators — the matcher, store and service all consume validated
 * records, mirroring the reality model's one-validation-path discipline.
 */

import { sha256Hex } from "../../lib/hash";
import { BoqError } from "../model";

/* ------------------------------------------------------------------ */
/* Errors                                                              */
/* ------------------------------------------------------------------ */

/** Stable machine-readable codes for typed mapping refusals. */
export const MAPPING_ERROR_CODES = [
  "invalid_graph_snapshot",
  "invalid_manual_input",
  "invalid_mapping_record",
  "entry_not_found",
] as const;
export type MappingErrorCode = (typeof MAPPING_ERROR_CODES)[number];

/** Typed mapping-domain refusal. Never carries source bytes. */
export class MappingError extends BoqError {
  readonly code: MappingErrorCode;

  constructor(code: MappingErrorCode, detail: string) {
    super("boq:mapping", detail);
    this.name = "MappingError";
    this.code = code;
  }
}

/* ------------------------------------------------------------------ */
/* Mapping records (derived, versioned)                                */
/* ------------------------------------------------------------------ */

/** Lifecycle of one BOQ row's mapping. Ambiguous/unmapped are FIRST-CLASS. */
export const MAPPING_STATUSES = ["mapped", "ambiguous", "unmapped"] as const;
export type MappingStatus = (typeof MAPPING_STATUSES)[number];

/** Explicit confidence of one entry. `"uncertain"` is honest unknown. */
export const MAPPING_CONFIDENCES = ["high", "medium", "low", "uncertain"] as const;
export type MappingConfidence = (typeof MAPPING_CONFIDENCES)[number];

/** How the entry was derived. `"unresolved"` is never silently upgraded. */
export const MAPPING_METHODS = [
  "normalized_concept_match",
  "location_match",
  "manual",
  "unresolved",
] as const;
export type MappingMethod = (typeof MAPPING_METHODS)[number];

/** The BOQ-side anchor of one entry — VERBATIM source identity (R8). */
export interface BoqItemRef {
  /** Detected section title above the item's header; null when none. */
  readonly sectionTitle: string | null;
  readonly rowNumber: number;
  /** First description-cell source ref, e.g. "Finishes!B4"; null when absent. */
  readonly descriptionCellRef: string | null;
  /** First unit-cell source ref, e.g. "Finishes!C4"; null when absent. */
  readonly unitCellRef: string | null;
  /** VERBATIM description text (source spelling/whitespace untouched). */
  readonly originalText: string;
}

/**
 * One mapped reality-graph node. `spacePath` carries location breadcrumbs
 * (site/building/storey/space) as supplied by the caller's graph snapshot;
 * `nodeVersionId` records which graph version the target was seen in.
 */
export interface MappingTarget {
  readonly nodeVersionId?: string;
  /** Stable reality-graph node id (AISE-016 caller stable id). */
  readonly nodeId: string;
  readonly spacePath?: readonly string[];
  readonly matchNote?: string;
}

/** One competing reading that was RECORDED, not applied (ambiguous only). */
export interface MappingAlternative {
  readonly targetNodeId: string;
  readonly reason: string;
}

/** Provenance of one entry — what derived it and when (injected clock). */
export interface MappingProvenance {
  /** Dictionary version of the interpretation source (AISE-014). */
  readonly dictionaryVersion?: string;
  /** Normalizer identity of the interpretation source (AISE-014). */
  readonly normalizerVersion?: string;
  /** Deterministic derivation note (concept, matched property, location). */
  readonly matchedOn?: string;
  /** Injected clock reading (ISO) — no Date.now inside the pure matcher. */
  readonly recordedAt: string;
}

/** One BOQ row's mapping outcome. */
export interface MappingEntry {
  /** Content-derived stable id (sheet + row); identical inputs -> same id. */
  readonly entryId: string;
  readonly boqItem: BoqItemRef;
  /** Many targets = one-to-many support (may be empty for ambiguous/unmapped). */
  readonly targets: readonly MappingTarget[];
  readonly status: MappingStatus;
  readonly confidence: MappingConfidence;
  readonly method: MappingMethod;
  readonly provenance: MappingProvenance;
  readonly alternatives?: readonly MappingAlternative[];
  /** Deterministic reason for ambiguous/unmapped entries (reported mismatch). */
  readonly reason?: string;
}

/** One versioned mapping record for one BOQ import (append-only revisions). */
export interface BoqMapping {
  /** Deterministic lineage id: sha256("boq-mapping:" + importId). */
  readonly mappingId: string;
  readonly importId: string;
  /** Monotonic mapping revision; 1 is the first matcher-derived version. */
  readonly version: number;
  readonly entries: readonly MappingEntry[];
}

/* ------------------------------------------------------------------ */
/* Aggregate stats + identity                                          */
/* ------------------------------------------------------------------ */

/** Response-level counters (the router carries these on every mapping body). */
export interface MappingStats {
  readonly mapped: number;
  readonly ambiguous: number;
  readonly unmapped: number;
  readonly byConfidence: {
    readonly high: number;
    readonly medium: number;
    readonly low: number;
    readonly uncertain: number;
  };
}

/** Deterministic stats over one mapping's entries (pure). */
export function computeMappingStats(mapping: BoqMapping): MappingStats {
  let mapped = 0;
  let ambiguous = 0;
  let unmapped = 0;
  const byConfidence = { high: 0, medium: 0, low: 0, uncertain: 0 };
  for (const entry of mapping.entries) {
    if (entry.status === "mapped") {
      mapped += 1;
    } else if (entry.status === "ambiguous") {
      ambiguous += 1;
    } else {
      unmapped += 1;
    }
    byConfidence[entry.confidence] += 1;
  }
  return { mapped, ambiguous, unmapped, byConfidence };
}

/** Deterministic mapping lineage identity for one import (pure). */
export function mappingIdentity(importId: string): string {
  return sha256Hex("boq-mapping:" + importId);
}

/** Version file name: v001.json (zero-padded to 3+, monotonic order). */
export function mappingVersionFileName(version: number): string {
  return `v${String(version).padStart(3, "0")}.json`;
}

/* ------------------------------------------------------------------ */
/* Input validation — the single validation path                       */
/* ------------------------------------------------------------------ */

/**
 * Structural node view of a Reality Graph snapshot. A `RealityNode`
 * (AISE-016) satisfies this shape structurally; `spacePath` is the
 * caller-computed location breadcrumb (derived from contains-relationships
 * by the snapshot builder — relationship walking stays with AISE-016).
 */
export interface SnapshotNode {
  readonly nodeId: string;
  /** AISE-016 node kind (project|site|building|storey|space|element|...). */
  readonly kind?: string;
  /** Structural subset of PropertyRecord: semantic.kind / element.material. */
  readonly properties?: readonly { key: string; value: string | number | boolean }[];
  /** Location breadcrumbs, outermost first (site, building, storey, space). */
  readonly spacePath?: readonly string[];
  /** Graph version the snapshot was taken from (recorded on targets). */
  readonly nodeVersionId?: string;
}

/** The reality side of one matcher run: just the nodes (by design). */
export interface GraphSnapshot {
  readonly nodes: readonly SnapshotNode[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown, what: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string") {
    throw new MappingError("invalid_graph_snapshot", `${what} must be a string`);
  }
  return value;
}

/**
 * Parse/validate a graph snapshot from UNKNOWN wire JSON (or in-process
 * input). Throws `MappingError` (`invalid_graph_snapshot`) naming the first
 * offending node — deterministic, so callers can answer stable 400s.
 */
export function parseGraphSnapshot(value: unknown): GraphSnapshot {
  if (!isRecord(value) || !Array.isArray(value.nodes)) {
    throw new MappingError("invalid_graph_snapshot", "body must be an object with a nodes array");
  }
  const nodes: SnapshotNode[] = [];
  for (let index = 0; index < value.nodes.length; index += 1) {
    const candidate = value.nodes[index];
    if (!isRecord(candidate)) {
      throw new MappingError("invalid_graph_snapshot", `node at index ${index} is not an object`);
    }
    if (typeof candidate.nodeId !== "string" || candidate.nodeId.length === 0) {
      throw new MappingError(
        "invalid_graph_snapshot",
        `node at index ${index} requires a non-empty nodeId string`,
      );
    }
    const kind = optionalString(candidate.kind, `node ${candidate.nodeId} kind`);
    const nodeVersionId = optionalString(
      candidate.nodeVersionId,
      `node ${candidate.nodeId} nodeVersionId`,
    );
    if (candidate.properties !== undefined) {
      if (!Array.isArray(candidate.properties)) {
        throw new MappingError(
          "invalid_graph_snapshot",
          `node ${candidate.nodeId} properties must be an array`,
        );
      }
      for (const property of candidate.properties) {
        if (
          !isRecord(property) ||
          typeof property.key !== "string" ||
          (typeof property.value !== "string" &&
            typeof property.value !== "number" &&
            typeof property.value !== "boolean")
        ) {
          throw new MappingError(
            "invalid_graph_snapshot",
            `node ${candidate.nodeId} has a malformed property entry`,
          );
        }
      }
    }
    if (candidate.spacePath !== undefined) {
      if (
        !Array.isArray(candidate.spacePath) ||
        candidate.spacePath.some((part) => typeof part !== "string")
      ) {
        throw new MappingError(
          "invalid_graph_snapshot",
          `node ${candidate.nodeId} spacePath must be an array of strings`,
        );
      }
    }
    nodes.push({
      nodeId: candidate.nodeId,
      ...(kind !== undefined ? { kind } : {}),
      ...(candidate.properties !== undefined ? { properties: candidate.properties } : {}),
      ...(candidate.spacePath !== undefined ? { spacePath: candidate.spacePath } : {}),
      ...(nodeVersionId !== undefined ? { nodeVersionId } : {}),
    });
  }
  return { nodes };
}

/** Manual mapping payload: an explicit human decision on one entry. */
export interface ManualMappingInput {
  readonly entryId: string;
  readonly targets: readonly MappingTarget[];
  readonly note?: string;
}

function parseManualTargets(value: unknown): readonly MappingTarget[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new MappingError("invalid_manual_input", "targets must be a non-empty array");
  }
  const targets: MappingTarget[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const candidate = value[index];
    if (!isRecord(candidate) || typeof candidate.nodeId !== "string" || candidate.nodeId === "") {
      throw new MappingError(
        "invalid_manual_input",
        `target at index ${index} requires a non-empty nodeId string`,
      );
    }
    if (candidate.spacePath !== undefined) {
      if (
        !Array.isArray(candidate.spacePath) ||
        candidate.spacePath.some((part) => typeof part !== "string")
      ) {
        throw new MappingError(
          "invalid_manual_input",
          `target ${candidate.nodeId} spacePath must be an array of strings`,
        );
      }
    }
    if (candidate.matchNote !== undefined && typeof candidate.matchNote !== "string") {
      throw new MappingError(
        "invalid_manual_input",
        `target ${candidate.nodeId} matchNote must be a string`,
      );
    }
    targets.push({
      nodeId: candidate.nodeId,
      ...(candidate.spacePath !== undefined ? { spacePath: candidate.spacePath } : {}),
      ...(candidate.matchNote !== undefined ? { matchNote: candidate.matchNote } : {}),
    });
  }
  return targets;
}

/** Parse/validate a manual mapping payload from unknown wire JSON. */
export function parseManualMappingInput(value: unknown): ManualMappingInput {
  if (!isRecord(value)) {
    throw new MappingError("invalid_manual_input", "body must be an object");
  }
  if (typeof value.entryId !== "string" || value.entryId === "") {
    throw new MappingError("invalid_manual_input", "entryId must be a non-empty string");
  }
  const targets = parseManualTargets(value.targets);
  if (value.note !== undefined && typeof value.note !== "string") {
    throw new MappingError("invalid_manual_input", "note must be a string");
  }
  return {
    entryId: value.entryId,
    targets,
    ...(value.note !== undefined ? { note: value.note } : {}),
  };
}

/* ------------------------------------------------------------------ */
/* Stored-record parsing (store reads)                                 */
/* ------------------------------------------------------------------ */

function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((part) => typeof part === "string");
}

/**
 * Parse a stored mapping record defensively (typed error on garbage or
 * identity mismatch) — the Fs and in-memory stores both funnel reads here.
 */
export function parseMappingRecord(text: string, importId: string): BoqMapping {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new MappingError("invalid_mapping_record", `mapping for '${importId}' is not valid JSON`);
  }
  if (!isRecord(value)) {
    throw new MappingError("invalid_mapping_record", `mapping for '${importId}' is not an object`);
  }
  if (value.importId !== importId || typeof value.mappingId !== "string") {
    throw new MappingError(
      "invalid_mapping_record",
      `mapping for '${importId}' carries a mismatching identity`,
    );
  }
  if (typeof value.version !== "number" || !Number.isInteger(value.version) || value.version < 1) {
    throw new MappingError("invalid_mapping_record", `mapping for '${importId}' has a bad version`);
  }
  if (!Array.isArray(value.entries)) {
    throw new MappingError("invalid_mapping_record", `mapping for '${importId}' has no entries`);
  }
  for (let index = 0; index < value.entries.length; index += 1) {
    const entry = value.entries[index];
    if (!isRecord(entry) || typeof entry.entryId !== "string") {
      throw new MappingError("invalid_mapping_record", `entry ${index} is malformed`);
    }
    const item = entry.boqItem;
    if (
      !isRecord(item) ||
      !(item.sectionTitle === null || typeof item.sectionTitle === "string") ||
      typeof item.rowNumber !== "number" ||
      typeof item.originalText !== "string" ||
      !(item.descriptionCellRef === null || typeof item.descriptionCellRef === "string") ||
      !(item.unitCellRef === null || typeof item.unitCellRef === "string")
    ) {
      throw new MappingError("invalid_mapping_record", `entry ${index} boqItem is malformed`);
    }
    if (!Array.isArray(entry.targets)) {
      throw new MappingError("invalid_mapping_record", `entry ${index} targets is malformed`);
    }
    for (const target of entry.targets) {
      if (!isRecord(target) || typeof target.nodeId !== "string") {
        throw new MappingError("invalid_mapping_record", `entry ${index} has a malformed target`);
      }
      if (target.spacePath !== undefined && !isStringArray(target.spacePath)) {
        throw new MappingError("invalid_mapping_record", `entry ${index} target spacePath is bad`);
      }
    }
    if (
      !MAPPING_STATUSES.includes(entry.status as MappingStatus) ||
      !MAPPING_CONFIDENCES.includes(entry.confidence as MappingConfidence) ||
      !MAPPING_METHODS.includes(entry.method as MappingMethod) ||
      !isRecord(entry.provenance) ||
      typeof entry.provenance.recordedAt !== "string"
    ) {
      throw new MappingError("invalid_mapping_record", `entry ${index} status/provenance is bad`);
    }
  }
  return value as unknown as BoqMapping;
}
