/**
 * Committed JSON Schema artifact tests (PROD-016).
 *
 * Guards the deterministic generation contract (mirroring the
 * shared-contracts discipline):
 *  - regenerating the schema set in memory must be BYTE-IDENTICAL to the
 *    committed files (zero diff on a clean tree — also checked out-of-band
 *    by `bun run gen:schemas && git status --porcelain`);
 *  - the committed set contains exactly the generated files, nothing else;
 *  - every schema is self-contained (no $ref/$defs/definitions), pinned to
 *    the draft-07 dialect, and open (`additionalProperties: true` — unknown
 *    fields are legal on the wire within the same major version).
 *
 * Deterministic: reads only committed files; no network, no clock.
 */

import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { generateSchemaFiles, JSON_SCHEMA_DIALECT } from "../scripts/lib/generate";
import { ADAPTER_WIRE_OBJECTS } from "./registry";
import { ADAPTER_CONTRACT_VERSION } from "./adapter-contracts.version";

const SCHEMAS_ROOT = join(import.meta.dir, "..", "schemas");

/** Recursively lists committed files under schemas/, POSIX-relative. */
function committedSchemaFiles(): string[] {
  const paths: string[] = [];
  const walk = (relative: string): void => {
    const absolute = join(SCHEMAS_ROOT, relative);
    for (const entry of readdirSync(absolute, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name),
    )) {
      const child = relative === "" ? entry.name : `${relative}/${entry.name}`;
      if (entry.isDirectory()) {
        walk(child);
      } else if (entry.isFile() && entry.name.endsWith(".json")) {
        paths.push(child);
      }
    }
  };
  walk("");
  return paths.sort();
}

/** Deep-collects all object keys (used to prove self-containment). */
function collectKeys(value: unknown, keys: Set<string>): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectKeys(item, keys);
    }
  } else if (value !== null && typeof value === "object") {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      keys.add(key);
      collectKeys(child, keys);
    }
  }
}

describe("byte-stable schema generation", () => {
  test("regeneration is byte-identical to the committed files", () => {
    const generated = generateSchemaFiles();
    expect(generated.length).toBe(ADAPTER_WIRE_OBJECTS.length + 1); // objects + manifest
    for (const file of generated) {
      const committed = readFileSync(join(SCHEMAS_ROOT, "..", file.path), "utf8");
      expect(committed).toBe(file.content);
    }
  });

  test("the committed set contains exactly the generated files", () => {
    const generatedPaths = generateSchemaFiles()
      .map((file) => file.path.replace(/^schemas\//, ""))
      .sort();
    expect(committedSchemaFiles()).toEqual(generatedPaths);
  });
});

describe("committed schema artifacts", () => {
  test("every schema is valid JSON pinned to draft-07 and open for unknown fields", () => {
    for (const entry of ADAPTER_WIRE_OBJECTS) {
      const schema = JSON.parse(
        readFileSync(join(SCHEMAS_ROOT, entry.family, `${entry.name}.schema.json`), "utf8"),
      ) as Record<string, unknown>;
      expect(schema["$schema"]).toBe(JSON_SCHEMA_DIALECT);
      expect(schema["type"]).toBe("object");
      expect(schema["additionalProperties"]).toBe(true);
    }
  });

  test("every schema is self-contained (no $ref, $defs or definitions anywhere)", () => {
    for (const entry of ADAPTER_WIRE_OBJECTS) {
      const schema = JSON.parse(
        readFileSync(join(SCHEMAS_ROOT, entry.family, `${entry.name}.schema.json`), "utf8"),
      );
      const keys = new Set<string>();
      collectKeys(schema, keys);
      expect(keys.has("$ref")).toBe(false);
      expect(keys.has("$defs")).toBe(false);
      expect(keys.has("definitions")).toBe(false);
    }
  });

  test("every schema requires a semver contractVersion property", () => {
    for (const entry of ADAPTER_WIRE_OBJECTS) {
      const schema = JSON.parse(
        readFileSync(join(SCHEMAS_ROOT, entry.family, `${entry.name}.schema.json`), "utf8"),
      ) as { required?: string[]; properties?: Record<string, unknown> };
      expect(schema.required).toContain("contractVersion");
      expect(schema.properties?.["contractVersion"]).toBeDefined();
    }
  });

  test("the manifest matches the registry and the contract version", () => {
    const manifest = JSON.parse(readFileSync(join(SCHEMAS_ROOT, "manifest.json"), "utf8")) as {
      contractVersion: string;
      objects: Array<{ name: string; family: string; file: string; contractVersion: string }>;
    };
    expect(manifest.contractVersion).toBe(ADAPTER_CONTRACT_VERSION);
    expect(manifest.objects.map((object) => object.name)).toEqual(
      ADAPTER_WIRE_OBJECTS.map((entry) => entry.name),
    );
    for (const object of manifest.objects) {
      expect(object.contractVersion).toBe(ADAPTER_CONTRACT_VERSION);
      expect(object.file).toBe(`schemas/${object.family}/${object.name}.schema.json`);
    }
  });
});
