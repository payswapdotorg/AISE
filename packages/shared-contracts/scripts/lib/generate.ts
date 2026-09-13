/**
 * Deterministic JSON Schema generation core (AISE-003).
 *
 * Shared by the CLI entry (`scripts/generate-schemas.ts`) and the
 * byte-stability test: regeneration over a clean tree must produce a
 * ZERO-byte diff against the committed `schemas/` directory.
 *
 * Determinism rules:
 *  - iterates the wire-object registry in its fixed name-sorted order;
 *  - one self-contained draft-07 schema per wire object (`$refStrategy:
 *    "none"` — no `$ref`/`$defs`, so Android tooling can consume each file
 *    standalone);
 *  - object keys are recursively sorted;
 *  - no timestamps, no absolute paths, no environment data in the output;
 *  - files are written as 2-space-indented JSON with a trailing newline.
 */

import { zodToJsonSchema } from "zod-to-json-schema";
import { CONTRACT_VERSION, FAMILY_VERSIONS } from "../../src/contracts.version";
import { WIRE_OBJECTS } from "../../src/registry";
import { canonicalizeJson } from "../../src/common";

/** The JSON Schema dialect emitted for every committed schema file. */
export const JSON_SCHEMA_DIALECT = "http://json-schema.org/draft-07/schema#";

export interface GeneratedSchemaFile {
  /** Path relative to the package root, POSIX-style. */
  readonly path: string;
  readonly content: string;
}

/** Recursively sorts keys and pins the draft-07 `$schema` dialect. */
function toStableSchema(schema: unknown): unknown {
  const sorted = canonicalizeJson(schema);
  if (sorted !== null && typeof sorted === "object" && !Array.isArray(sorted)) {
    return { $schema: JSON_SCHEMA_DIALECT, ...(sorted as Record<string, unknown>) };
  }
  return sorted;
}

function render(schema: unknown): string {
  return `${JSON.stringify(toStableSchema(schema), null, 2)}\n`;
}

/**
 * Generates every schema file (plus the manifest) IN MEMORY. The CLI writes
 * them to `schemas/`; the byte-stability test compares them against the
 * committed files. Pure: no I/O, no clock, no network.
 */
export function generateSchemaFiles(): ReadonlyArray<GeneratedSchemaFile> {
  const files: GeneratedSchemaFile[] = [];

  for (const entry of WIRE_OBJECTS) {
    const jsonSchema = zodToJsonSchema(entry.schema, {
      $refStrategy: "none",
      target: "jsonSchema7",
    });
    files.push({
      path: `schemas/${entry.family}/${entry.name}.schema.json`,
      content: render(jsonSchema),
    });
  }

  const manifest = {
    contractVersion: CONTRACT_VERSION,
    dialect: JSON_SCHEMA_DIALECT,
    families: FAMILY_VERSIONS,
    objects: WIRE_OBJECTS.map((entry) => ({
      name: entry.name,
      family: entry.family,
      contractVersion: entry.contractVersion,
      file: `schemas/${entry.family}/${entry.name}.schema.json`,
    })),
  };
  files.push({
    path: "schemas/manifest.json",
    content: `${JSON.stringify(canonicalizeJson(manifest), null, 2)}\n`,
  });

  return files;
}
