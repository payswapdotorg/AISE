/**
 * Canonical serialization and content hashing for the Reality
 * Graph core (AISE-011).
 *
 * Mirrors the AISE-008/009/010 canonicalization discipline, kept
 * package-local: backend service packages are protected surfaces
 * and must not become dependencies of the canonical model package
 * (layering: the engineering model is the canonical authority; it
 * depends only on the shared cross-platform vocabulary).
 *
 * The canonical form is fully deterministic for the same content:
 *
 * - object keys are sorted;
 * - array order is preserved (order is content);
 * - `undefined`-valued object members are treated as absent;
 * - non-finite numbers and unsupported types are rejected loudly —
 *   model content that cannot be canonically serialized cannot be
 *   content-pinned, so it must not enter the model.
 *
 * Deterministic digests are the backbone of three separate
 * guarantees:
 * 1. **version idempotency** — the same graph content yields the
 *    same version digest, so a deterministic re-derivation commits
 *    no new model version (`already_present`);
 * 2. **deterministic identity** — object ids are derived from the
 *    canonical serialization of their identity inputs;
 * 3. **change detection** — version diffs compare digests.
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
