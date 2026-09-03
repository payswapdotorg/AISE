/**
 * Filesystem access to the canonical schema and fixture files.
 *
 * Schemas and fixtures are loaded from disk (not imported as modules)
 * so the exact same files are consumable from any platform: the
 * Android side and CI can read `contracts/` and `fixtures/`
 * directly, while this package exposes them programmatically.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Absolute path of the machine-readable schema directory. */
export const CONTRACTS_DIR: string = join(packageRoot, "contracts");

/** Absolute path of the representative fixture directory. */
export const FIXTURES_DIR: string = join(packageRoot, "fixtures");

/**
 * Machine-readable schema document names shipped with this package.
 * Schemas are JSON Schema draft 2020-12 documents.
 */
export const CONTRACT_FILES: readonly string[] = [
  "common.schema.json",
  "project.schema.json",
  "capture-session.schema.json",
  "capture-package.schema.json",
  "upload-request.schema.json",
  "upload-result.schema.json",
  "sync-error.schema.json",
  "model-version.schema.json",
] as const;

/** The `$id` base URI under which all v1.0 schemas are registered. */
export const SCHEMA_ID_BASE = "https://contracts.aise.example/1.0";

/** Reads one schema document from `contracts/` as a parsed value. */
export function loadSchema(name: string): unknown {
  const file = join(CONTRACTS_DIR, name);
  if (!existsSync(file)) {
    throw new Error(`schema not found: ${name}`);
  }
  return JSON.parse(readFileSync(file, "utf8")) as unknown;
}

/** Loads every schema document as a name → document record. */
export function loadAllSchemas(): Record<string, unknown> {
  const schemas: Record<string, unknown> = {};
  for (const name of CONTRACT_FILES) {
    schemas[name] = loadSchema(name);
  }
  return schemas;
}

/** Reads one fixture from `fixtures/` as a parsed value. */
export function loadFixtureJson(name: string): unknown {
  const file = join(FIXTURES_DIR, name);
  if (!existsSync(file)) {
    throw new Error(`fixture not found: ${name}`);
  }
  return JSON.parse(readFileSync(file, "utf8")) as unknown;
}

/** Lists the fixture file names available in `fixtures/`. */
export function listFixtures(): string[] {
  return readdirSync(FIXTURES_DIR).filter((file) => file.endsWith(".json"));
}
