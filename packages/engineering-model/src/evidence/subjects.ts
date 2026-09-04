/**
 * Assertion subjects: what an evidence link can point at
 * (AISE-012).
 *
 * Architecture-lock §1: "The Evidence subsystem is the
 * authoritative provenance mapping for engineering assertions."
 * The mapping's targets are ASSERTIONS in committed model
 * versions — never free-floating claims. A subject therefore
 * pins:
 *
 * - the model identity and the committed, immutable version
 *   number (assertions live in versions; links to v1 stay valid
 *   history when v2 exists);
 * - the entity: an object's EXISTENCE assertion, an object
 *   property assertion, or a space property assertion;
 * - the property key for property subjects.
 *
 * Resolution (`resolveSubject`) walks the actual graph — the
 * subject either resolves to real committed content or it does
 * not exist, and callers at the persistence boundary reject
 * unresolvable subjects fail-closed (no links into thin air).
 *
 * The subject carries NO assertion content — no value, unit,
 * epistemic state, geometry. That is the no-second-authority
 * guarantee: the evidence mapping references the canonical
 * model; it never copies or re-states it.
 */
import { EvidenceError } from "./errors.js";
import type { RealityModelGraph, RealityObject, SpaceNode } from "../model.js";
import type { PropertyAssertion } from "../assertions.js";

const ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;
const PROPERTY_KEY_PATTERN = /^[a-zA-Z][a-zA-Z0-9_.-]*$/;

/** What a link can assert evidence about. */
export type EvidenceSubjectKind =
  /** An object's existence/geometry assertion (the object's epistemic state). */
  | "object-existence"
  /** One property assertion on an object. */
  | "object-property"
  /** One property assertion on a space. */
  | "space-property";

/** A reference to one assertion in one committed model version. */
export interface EvidenceSubject {
  readonly kind: EvidenceSubjectKind;
  readonly modelId: string;
  /** The committed, immutable version the assertion lives in. */
  readonly version: number;
  /** Object identity (object-* kinds). */
  readonly objectId?: string;
  /** Space identity (space-property kind). */
  readonly spaceId?: string;
  /** Property key (*-property kinds). */
  readonly propertyKey?: string;
}

/** Builds and validates a subject reference (fail closed). */
export function evidenceSubject(subject: EvidenceSubject): EvidenceSubject {
  validateSubject(subject);
  return subject;
}

/** Validates subject shape and per-kind field requirements. */
export function validateSubject(subject: EvidenceSubject): void {
  if (subject === null || typeof subject !== "object") {
    throw new EvidenceError("SUBJECT_INVALID", "subject must be a record", {
      details: { field: "subject" },
    });
  }
  if (typeof subject.modelId !== "string" || !ID_PATTERN.test(subject.modelId)) {
    throw new EvidenceError("SUBJECT_INVALID", `subject.modelId must match ${ID_PATTERN}: ${String(subject.modelId)}`, {
      details: { field: "modelId", value: String(subject.modelId) },
    });
  }
  if (!Number.isInteger(subject.version) || subject.version < 1) {
    throw new EvidenceError("SUBJECT_INVALID", `subject.version must be a positive integer: ${String(subject.version)}`, {
      details: { field: "version", value: String(subject.version) },
    });
  }
  switch (subject.kind) {
    case "object-existence":
      requireSubjectId(subject.objectId, "objectId", "object-existence");
      rejectSubjectField(subject.spaceId, "spaceId", "object-existence");
      rejectSubjectField(subject.propertyKey, "propertyKey", "object-existence");
      return;
    case "object-property":
      requireSubjectId(subject.objectId, "objectId", "object-property");
      requirePropertyKey(subject.propertyKey);
      rejectSubjectField(subject.spaceId, "spaceId", "object-property");
      return;
    case "space-property":
      requireSubjectId(subject.spaceId, "spaceId", "space-property");
      requirePropertyKey(subject.propertyKey);
      rejectSubjectField(subject.objectId, "objectId", "space-property");
      return;
    default:
      throw new EvidenceError("SUBJECT_INVALID", `subject.kind must be object-existence|object-property|space-property: ${String(subject.kind)}`, {
        details: { field: "kind", value: String(subject.kind) },
      });
  }
}

/**
 * The canonical, collision-free key form of a subject (indexing
 * and identity input). Components are pattern-validated, so the
 * separators cannot appear inside them.
 */
export function subjectKey(subject: EvidenceSubject): string {
  validateSubject(subject);
  const entity = subject.objectId ?? subject.spaceId;
  const property = subject.propertyKey !== undefined ? `/${subject.propertyKey}` : "";
  return `${subject.modelId}@${subject.version}::${subject.kind}:${entity}${property}`;
}

// ---------------------------------------------------------------------------
// Resolution against committed graph content
// ---------------------------------------------------------------------------

/** What a resolved subject points at inside the graph. */
export type ResolvedSubject =
  | { readonly kind: "object-existence"; readonly object: RealityObject }
  | { readonly kind: "object-property"; readonly object: RealityObject; readonly assertion: PropertyAssertion }
  | { readonly kind: "space-property"; readonly space: SpaceNode; readonly assertion: PropertyAssertion };

/**
 * Resolves a subject against one committed version's graph.
 * Returns `undefined` when the referenced entity or property
 * does not exist in that graph — callers at boundaries treat
 * that as fail-closed (SUBJECT_NOT_FOUND). A subject whose
 * modelId does not match the graph's model never resolves.
 */
export function resolveSubject(subject: EvidenceSubject, graph: RealityModelGraph): ResolvedSubject | undefined {
  validateSubject(subject);
  if (subject.modelId !== graph.modelId) {
    return undefined;
  }
  switch (subject.kind) {
    case "object-existence": {
      const object = graph.objects.find((candidate) => candidate.objectId === subject.objectId);
      return object !== undefined ? { kind: "object-existence", object } : undefined;
    }
    case "object-property": {
      const object = graph.objects.find((candidate) => candidate.objectId === subject.objectId);
      if (object === undefined) {
        return undefined;
      }
      const assertion = object.properties.find(
        (candidate) => candidate.key === subject.propertyKey,
      );
      return assertion !== undefined
        ? { kind: "object-property", object, assertion }
        : undefined;
    }
    case "space-property": {
      const space = graph.spaces.find((candidate) => candidate.spaceId === subject.spaceId);
      if (space === undefined) {
        return undefined;
      }
      const assertion = space.properties?.find((candidate) => candidate.key === subject.propertyKey);
      return assertion !== undefined
        ? { kind: "space-property", space, assertion }
        : undefined;
    }
  }
}

/** Human-facing description of a subject (reports and errors). */
export function describeSubject(subject: EvidenceSubject): string {
  validateSubject(subject);
  switch (subject.kind) {
    case "object-existence":
      return `object "${subject.objectId}" (existence, model ${subject.modelId} v${subject.version})`;
    case "object-property":
      return `object "${subject.objectId}" property "${subject.propertyKey}" (model ${subject.modelId} v${subject.version})`;
    case "space-property":
      return `space "${subject.spaceId}" property "${subject.propertyKey}" (model ${subject.modelId} v${subject.version})`;
  }
}

// ---------------------------------------------------------------------------
// Field validators
// ---------------------------------------------------------------------------

function requireSubjectId(value: string | undefined, field: string, kind: EvidenceSubjectKind): void {
  if (typeof value !== "string" || !ID_PATTERN.test(value)) {
    throw new EvidenceError("SUBJECT_INVALID", `${kind}: ${field} must match ${ID_PATTERN}: ${String(value)}`, {
      details: { field, value: String(value), kind },
    });
  }
}

function requirePropertyKey(value: string | undefined): void {
  if (typeof value !== "string" || !PROPERTY_KEY_PATTERN.test(value)) {
    throw new EvidenceError("SUBJECT_INVALID", `subject.propertyKey must match ${PROPERTY_KEY_PATTERN}: ${String(value)}`, {
      details: { field: "propertyKey", value: String(value) },
    });
  }
}

function rejectSubjectField(value: string | undefined, field: string, kind: EvidenceSubjectKind): void {
  if (value !== undefined) {
    throw new EvidenceError("SUBJECT_INVALID", `${kind}: ${field} must not be present`, {
      details: { field, value: String(value), kind },
    });
  }
}
