/**
 * Canonical serialization and content hashing for geometry
 * measurement provenance (AISE-009).
 *
 * Mirrors the AISE-008 reconstruction discipline, kept package-local
 * (the reconstruction package is a protected surface and must not
 * become a dependency of the geometry primitives): the canonical
 * form is fully deterministic for the same content —
 *
 * - object keys are sorted;
 * - array order is preserved (order is content);
 * - `undefined`-valued object members are treated as absent;
 * - non-finite numbers and unsupported types are rejected loudly —
 *   input geometry that cannot be canonically serialized cannot be
 *   provenance-pinned, so it must not enter the measurement path.
 *
 * Point sets are hashed in their canonical (sorted) order, so the
 * content hash of a point set is invariant to the order in which
 * the caller supplied the same points.
 */
import { createHash } from "node:crypto";

/**
 * Serializes a JSON-shaped value canonically (sorted keys, no
 * undefined members). Throws on values with no canonical JSON form.
 */
export function canonicalJsonString(value: unknown): string {
  return serialize(value);
}

/** SHA-256 of the UTF-8 encoding of a string, lowercase hex. */
export function sha256Hex(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/** Canonical content hash of a JSON-shaped value. */
export function canonicalContentHash(value: unknown): string {
  return sha256Hex(canonicalJsonString(value));
}

function serialize(value: unknown): string {
  if (value === null) {
    return "null";
  }
  switch (typeof value) {
    case "string":
      return JSON.stringify(value);
    case "boolean":
      return value ? "true" : "false";
    case "number":
      if (!Number.isFinite(value)) {
        throw new Error(
          `cannot canonically serialize non-finite number: ${String(value)}`,
        );
      }
      return Object.is(value, -0) ? "0" : JSON.stringify(value);
    case "object": {
      if (Array.isArray(value)) {
        return `[${value.map((item) => serialize(item)).join(",")}]`;
      }
      const record = value as Record<string, unknown>;
      const keys = Object.keys(record)
        .filter((key) => record[key] !== undefined)
        .sort();
      const members = keys.map(
        (key) => `${JSON.stringify(key)}:${serialize(record[key])}`,
      );
      return `{${members.join(",")}}`;
    }
    default:
      throw new Error(`cannot canonically serialize value of type ${typeof value}`);
  }
}
