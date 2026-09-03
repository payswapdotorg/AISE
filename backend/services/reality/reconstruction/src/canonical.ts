/**
 * Canonical serialization and content hashing for reconstruction
 * artifacts (AISE-008).
 *
 * Derived artifacts are content-addressed: their `contentHash` is the
 * SHA-256 of a canonical JSON serialization of everything that
 * constitutes their content (points, coordinate frames, scene
 * references, provenance, epistemic state). The canonical form is
 * fully deterministic for the same content:
 *
 * - object keys are sorted;
 * - array order is preserved (order is content);
 * - `undefined`-valued object members are treated as absent;
 * - non-finite numbers and unsupported types are rejected loudly
 *   (an artifact whose content cannot be serialized canonically
 *   cannot be integrity-verified, so it must not exist).
 *
 * Bookkeeping fields that are intentionally NOT content (artifact
 * locators and creation timestamps) are excluded by the callers
 * before hashing; every other field is covered. `createdAt` is
 * bookkeeping rather than content so that two runs of the same
 * pipeline over the same inputs yield the same `contentHash`
 * (reproducibility), while still being recorded on the artifact.
 */
import { createHash } from "node:crypto";

/**
 * Serializes a JSON-shaped value canonically (sorted keys, no
 * undefined members). Throws on values that have no canonical JSON
 * form (functions, symbols, non-finite numbers, sparse holes).
 */
export function canonicalJsonString(value: unknown): string {
  return serialize(value);
}

/** SHA-256 of the UTF-8 encoding of a string, lowercase hex. */
export function sha256Hex(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/** SHA-256 of raw bytes, lowercase hex. */
export function sha256HexBytes(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
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
      // JSON.stringify gives the shortest round-trip form for the
      // same numeric value; -0 normalizes to "0" via Object.is below.
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
