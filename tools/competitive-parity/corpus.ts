/**
 * PROD-018 — the committed-corpus loader of the cross-adapter semantic
 * equivalence harness.
 *
 * Loads the COMMITTED adapter-contract artifacts as DATA (file reads —
 * the boundary matrix forbids tools → packages imports, and the harness
 * consumes committed artifacts, never contract code):
 *
 *  - `packages/adapter-contract/fixtures/**` — the PROD-016 fixture corpus
 *    (the same corpus every adapter's committed conformance run used);
 *  - `packages/adapter-contract/schemas/manifest.json` + the committed
 *    JSON Schemas — the contract version, the object registry and the
 *    schemas' own required/enum arrays (read as data, never re-implemented
 *    as validation logic).
 *
 * CANONICAL FORM (the shared contract's equality semantics — canonical
 * forms, not incidental formatting): two payloads are semantically equal
 * iff their `canonicalJson` forms are equal — a deterministic JSON
 * rendering with recursively sorted object keys. This is the same
 * canonical-bytes discipline the contract package's codec and the Android
 * mirror's integer-only codec both state ("sorted keys" — see the
 * PROD-019 conformance report §2).
 *
 * Determinism: pure reads of committed files; no clock, no randomness.
 */

import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

/** The repository root (this file lives at tools/competitive-parity/). */
export const REPO_ROOT = resolve(import.meta.dir, "..", "..");

/** The committed adapter-contract package root. */
export const CONTRACT_ROOT = join(REPO_ROOT, "packages", "adapter-contract");

/* ------------------------------------------------------------------ */
/* The canonical form                                                   */
/* ------------------------------------------------------------------ */

/** Sort one parsed JSON value's object keys recursively (arrays keep order). */
function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortValue);
  }
  if (typeof value === "object" && value !== null) {
    const record = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(record).sort()) {
      sorted[key] = sortValue(record[key]);
    }
    return sorted;
  }
  return value;
}

/**
 * The canonical JSON form of a parsed payload: recursively sorted object
 * keys, deterministic separators. Format-insensitive equality — the same
 * value in any whitespace/key-order renders identical bytes.
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

/** The sha256 of one canonical form (hex, `sha256:`-prefixed). */
export function canonicalDigest(value: unknown): string {
  return `sha256:${createHash("sha256").update(canonicalJson(value)).digest("hex")}`;
}

/** Parse a committed JSON file (deterministic; throws loudly on garbage). */
export function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8")) as unknown;
}

/* ------------------------------------------------------------------ */
/* The fixture corpus                                                   */
/* ------------------------------------------------------------------ */

/** One committed fixture record (the corpus-loader discipline). */
export interface FixtureRecord {
  /** Family-relative path, e.g. "capability/CapabilityNegotiation.valid-browser-field-depth-capture.json". */
  readonly fileName: string;
  readonly objectName: string;
  readonly family: string;
  readonly kind: "valid" | "invalid" | "version-mismatch";
  readonly payload: unknown;
}

/** The fixture kind from a file name (the PROD-016 naming convention). */
function fixtureKind(fileName: string): FixtureRecord["kind"] {
  // "Object.kind.json" — the kind is the second dot-segment ("valid",
  // "valid-…", "invalid-…", "version-mismatch").
  const segment = fileName.split(".")[1] ?? "";
  if (segment === "valid" || segment.startsWith("valid-")) {
    return "valid";
  }
  if (segment.startsWith("invalid-")) {
    return "invalid";
  }
  if (segment === "version-mismatch") {
    return "version-mismatch";
  }
  throw new Error(`unrecognized fixture kind in ${fileName}`);
}

/** Load every committed fixture (family dirs in order, files in order). */
export function loadFixtureCorpus(): readonly FixtureRecord[] {
  const fixturesRoot = join(CONTRACT_ROOT, "fixtures");
  const records: FixtureRecord[] = [];
  for (const family of readdirSync(fixturesRoot, { withFileTypes: true }).sort((a, b) =>
    a.name.localeCompare(b.name),
  )) {
    if (!family.isDirectory()) {
      continue;
    }
    for (const file of readdirSync(join(fixturesRoot, family.name)).sort((a, b) =>
      a.localeCompare(b),
    )) {
      const fileName = `${family.name}/${file}`;
      records.push({
        fileName,
        objectName: file.substring(0, file.indexOf(".")),
        family: family.name,
        kind: fixtureKind(file),
        payload: readJson(join(fixturesRoot, family.name, file)),
      });
    }
  }
  return records;
}

/**
 * The corpus digest: a stable digest over every fixture's identity and
 * canonical form. Any committed corpus change changes the digest — the
 * committed equivalence report pins it, so a corpus change without
 * re-running the harness fails the gate.
 */
export function corpusDigest(records: readonly FixtureRecord[]): string {
  const hasher = createHash("sha256");
  for (const record of [...records].sort((a, b) => a.fileName.localeCompare(b.fileName))) {
    hasher.update(record.fileName);
    hasher.update("\u0000");
    hasher.update(canonicalJson(record.payload));
    hasher.update("\u0000");
  }
  return `sha256:${hasher.digest("hex")}`;
}

/* ------------------------------------------------------------------ */
/* The committed schemas (read as data)                                 */
/* ------------------------------------------------------------------ */

/** The manifest of the committed schema files. */
export interface SchemaManifest {
  readonly contractVersion: string;
  readonly objects: readonly {
    readonly name: string;
    readonly family: string;
    readonly contractVersion: string;
    readonly file: string;
  }[];
}

/** Load the committed schemas manifest. */
export function loadSchemaManifest(): SchemaManifest {
  const manifest = readJson(join(CONTRACT_ROOT, "schemas", "manifest.json")) as SchemaManifest;
  if (
    typeof manifest.contractVersion !== "string" ||
    !Array.isArray(manifest.objects) ||
    manifest.objects.length === 0
  ) {
    throw new Error("the committed schemas manifest is not structurally valid");
  }
  return manifest;
}

/** One committed schema, read as data (never re-implemented as validation). */
export interface SchemaData {
  readonly objectName: string;
  /** The schema's top-level `required` field names (sorted). */
  readonly required: readonly string[];
  /** The schema's enum arrays, keyed by their JSON path (e.g. "properties.outcome.enum"). */
  readonly enums: Readonly<Record<string, readonly string[]>>;
}

function collectEnums(node: unknown, path: string, into: Record<string, readonly string[]>): void {
  if (Array.isArray(node)) {
    return;
  }
  if (typeof node !== "object" || node === null) {
    return;
  }
  const record = node as Record<string, unknown>;
  if (Array.isArray(record.enum) && record.enum.every((entry) => typeof entry === "string")) {
    // The recorded key is the enum's JSON path (…".enum"), matching the
    // lookups the harness performs.
    into[path === "" ? "enum" : `${path}.enum`] = record.enum as readonly string[];
  }
  for (const [key, value] of Object.entries(record)) {
    if (key !== "enum") {
      collectEnums(value, path === "" ? key : `${path}.${key}`, into);
    }
  }
}

/** Load one object's committed schema as data. */
export function loadSchema(objectName: string): SchemaData {
  const manifest = loadSchemaManifest();
  const entry = manifest.objects.find((object) => object.name === objectName);
  if (entry === undefined) {
    throw new Error(`no committed schema for ${objectName}`);
  }
  const schema = readJson(join(CONTRACT_ROOT, entry.file)) as Record<string, unknown>;
  const required = Array.isArray(schema.required)
    ? (schema.required as unknown[]).filter((entry): entry is string => typeof entry === "string").sort()
    : [];
  const enums: Record<string, readonly string[]> = {};
  collectEnums(schema, "", enums);
  return { objectName, required, enums };
}

/** Read one evidence document's text (committed, read-only). */
export function readEvidenceDoc(relativePath: string): string {
  return readFileSync(join(REPO_ROOT, relativePath), "utf8");
}
