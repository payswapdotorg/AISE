/**
 * Strict decode mode (AISE-003): unknown-key detection by schema walking.
 *
 * The wire schemas are open (`.passthrough()`) so decoding PRESERVES unknown
 * keys — same-major forward compatibility. The strict decode mode rejects
 * unknown keys at every object nesting level WITHOUT a second family of
 * schemas: this module walks the single wire schema (zod's own public
 * metadata) alongside the decoded value and reports any key the schema does
 * not know about.
 *
 * Supported schema nodes: ZodObject (shape walk), ZodArray (element walk),
 * ZodOptional/ZodNullable (unwrap). Records are open maps BY DESIGN — their
 * keys are data, not schema drift, and are never reported. Unions in this
 * package contain only primitive members; object-bearing unions would need
 * extending here (asserted by tests over the registry).
 */

import { z } from "zod";

/**
 * Collects deterministic, sorted paths of keys present in `value` that the
 * schema does not define, e.g. `envelope.assets[1].someNewField`.
 */
export function collectUnknownKeyPaths(
  value: unknown,
  schema: z.ZodType<unknown>,
  path: ReadonlyArray<string> = [],
): string[] {
  if (schema instanceof z.ZodObject) {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      return [];
    }
    const record = value as Record<string, unknown>;
    const shape = schema.shape;
    const unknown: string[] = [];
    for (const key of Object.keys(record).sort()) {
      const childPath = [...path, key];
      const childSchema = shape[key];
      if (childSchema === undefined) {
        unknown.push(childPath.join("."));
      } else {
        unknown.push(...collectUnknownKeyPaths(record[key], childSchema, childPath));
      }
    }
    return unknown;
  }
  if (schema instanceof z.ZodArray) {
    if (!Array.isArray(value)) {
      return [];
    }
    const unknown: string[] = [];
    for (const [index, item] of value.entries()) {
      unknown.push(
        ...collectUnknownKeyPaths(item, schema.element, [...path, String(index)]),
      );
    }
    return unknown;
  }
  if (schema instanceof z.ZodOptional || schema instanceof z.ZodNullable) {
    return collectUnknownKeyPaths(value, schema.unwrap(), path);
  }
  // Leaves (strings, numbers, booleans, enums, records, primitive unions):
  // records are open maps by design; nothing else can carry unknown keys.
  return [];
}
