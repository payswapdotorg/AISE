/**
 * Deterministic identity for the Reality Graph core (AISE-011).
 *
 * Identity rules (requirements AC-042, architecture-lock §2):
 *
 * - **Object identity is content-pinned to the SOURCE, not to the
 *   full object content**: an object's id is derived from the
 *   canonical serialization of {modelId, objectClass, source pin}.
 *   The source pin is the upstream producing identity (service,
 *   method, upstream object id, upstream content hash). Identity
 *   therefore survives later property additions and corrections
 *   (identity is lineage, not content), and honest discontinuity:
 *   a re-extraction that changes upstream content yields a new
 *   upstream content hash → a new identity — the version diff
 *   reports removal+addition, never a fabricated correspondence.
 * - **Relationship identity** is derived from the (type, from, to)
 *   triple: the same relationship can never exist twice.
 * - **Graph digest** is the canonical content hash of the ordered
 *   graph content — the deterministic backbone of version
 *   idempotency (identical content ⇒ identical digest ⇒ no new
 *   version) and change detection.
 * - **Collisions fail closed**: two different identities deriving
 *   the same id, or a duplicated id in one graph, throw
 *   `IDENTITY_COLLISION` — never silently merged.
 */
import { canonicalContentHash } from "./canonical.js";

const OBJECT_ID_PREFIX = "ro-";
const RELATION_ID_PREFIX = "rel-";
const ID_HEX_LENGTH = 16;

/** The identity input for a model object (the source pin). */
export interface ObjectIdentityInput {
  /** The model this object lives in (identity is model-scoped). */
  readonly modelId: string;
  /** The object's class. */
  readonly objectClass: string;
  /** The upstream producing service identity. */
  readonly sourceServiceId: string;
  /** The upstream producing method. */
  readonly sourceMethod: string;
  /** The upstream object identity. */
  readonly sourceObjectId: string;
  /** SHA-256 of the upstream object content. */
  readonly sourceContentHash: string;
}

/** Derives the deterministic object id (`ro-<hex16>`). */
export function deriveObjectId(input: ObjectIdentityInput): string {
  const hash = canonicalContentHash(input);
  return `${OBJECT_ID_PREFIX}${hash.slice(0, ID_HEX_LENGTH)}`;
}

/** Derives the deterministic relationship id (`rel-<hex16>`). */
export function deriveRelationId(
  type: string,
  fromId: string,
  toId: string,
): string {
  const hash = canonicalContentHash({ type, fromId, toId });
  return `${RELATION_ID_PREFIX}${hash.slice(0, ID_HEX_LENGTH)}`;
}

/**
 * Deep-freezes a JSON-shaped structure (arrays and plain objects).
 * Committed model content is immutable by construction: mutation
 * attempts on frozen structures throw in strict mode.
 */
export function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object") {
    return value;
  }
  if (!Object.isFrozen(value)) {
    Object.freeze(value);
  }
  // Recurse even into already-frozen containers: a frozen array
  // does not imply frozen members (Object.freeze is shallow), and
  // idempotent recursion is safe on acyclic JSON-shaped content
  // (provenance parameters are validated canonically serializable,
  // which rules out cycles).
  if (Array.isArray(value)) {
    for (const item of value) {
      deepFreeze(item);
    }
  } else {
    for (const key of Object.keys(value)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
  }
  return value;
}
