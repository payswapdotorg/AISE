/**
 * Reader-view JSON Schema compilation for tolerant reading of
 * newer-MINOR (same-MAJOR) ingestion payloads (AISE-004).
 *
 * The finalized AISE-003 reader obligation
 * (packages/shared-contracts README, "Reader obligations") says that
 * inside one MAJOR version a reader of an older MINOR must tolerate
 * newer-MINOR payloads: ignore unrecognized fields and treat
 * unrecognized enum values as the `unknown` sentinel
 * (`UNKNOWN_ENUM` / `EnumOrUnknown<T>` from `@aise/shared-contracts`),
 * never mapping them onto an existing member.
 *
 * This module compiles a *reader view* of the canonical v1.0 schemas:
 * the exact schema documents shipped by `@aise/shared-contracts`
 * (loaded through its public `loadAllSchemas` API, so no copy of the
 * contract is maintained in this service), with exactly one
 * transformation — every `enum` vocabulary additionally admits the
 * `unknown` reader sentinel. That is the machine-level equivalent of
 * the package's `EnumOrUnknown<T>` type: enum membership becomes
 * `known-members | "unknown"`.
 *
 * Deliberately NOT widened:
 * - `const` constraints (for example `checksumAlgorithm: "sha256"`):
 *   the implemented obligation covers unknown fields and unknown
 *   enum values only, and a value this gateway cannot verify against
 *   its own processing is rejected fail-closed;
 * - structural constraints (types, required fields, patterns,
 *   lengths): a newer-MINOR payload still has to satisfy the whole
 *   v1.0 subset it declares to carry.
 *
 * The `uuid` and `date-time` formats are re-registered with patterns
 * equivalent to the reference regexes in
 * `@aise/shared-contracts/src/validate.ts`. The shared-contracts
 * README explicitly requires non-package consumers (it names the
 * Android side; this gateway applies the same rule) to "apply
 * equivalent semantics". Equivalence is pinned by tests that route
 * the canonical fixtures and v1.0 member values through these
 * validators.
 */
import { Ajv2020 } from "ajv/dist/2020.js";
import { SCHEMA_ID_BASE, UNKNOWN_ENUM, loadAllSchemas } from "@aise/shared-contracts";

/** Envelope kinds the ingestion boundary reads. */
export type ReaderViewKind = "project" | "session" | "package" | "uploadRequest";

/** Schema documents the reader view needs (the four ingestion envelopes plus their shared `$defs` target). */
const READER_VIEW_SCHEMA_FILES: readonly string[] = [
  "common.schema.json",
  "project.schema.json",
  "capture-session.schema.json",
  "capture-package.schema.json",
  "upload-request.schema.json",
];

/** RFC 4122 UUID (any version), case-insensitive — equivalent to the shared reference pattern. */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** RFC 3339 date-time — equivalent to the shared reference pattern. */
const DATE_TIME_PATTERN =
  /^\d{4}-\d{2}-\d{2}[Tt]\d{2}:\d{2}:\d{2}(\.\d+)?([Zz]|[+-]\d{2}:\d{2})$/;

interface ValidatorError {
  instancePath?: string;
  message?: string;
}

interface Validator {
  (data: unknown): boolean;
  errors?: ValidatorError[] | null;
}

export interface ReaderViewOutcome {
  ok: boolean;
  /** Human-readable validation failures (empty when ok). */
  errors: string[];
}

/**
 * Deep-clones a schema document while appending the `unknown` reader
 * sentinel to every `enum` vocabulary it contains. This is the only
 * transformation applied to the canonical documents.
 */
function withUnknownEnumAdmitted(node: unknown): unknown {
  if (Array.isArray(node)) {
    return node.map(withUnknownEnumAdmitted);
  }
  if (typeof node === "object" && node !== null) {
    const source = node as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(source)) {
      out[key] =
        key === "enum" && Array.isArray(value) && !value.includes(UNKNOWN_ENUM)
          ? [...value, UNKNOWN_ENUM]
          : withUnknownEnumAdmitted(value);
    }
    return out;
  }
  return node;
}

function buildReaderValidators(): Record<ReaderViewKind, Validator> {
  const ajv = new Ajv2020({ allErrors: true });
  ajv.addFormat("uuid", {
    type: "string",
    validate: (data: string) => UUID_PATTERN.test(data),
  });
  ajv.addFormat("date-time", {
    type: "string",
    validate: (data: string) => DATE_TIME_PATTERN.test(data),
  });

  const canonical = loadAllSchemas();
  for (const file of READER_VIEW_SCHEMA_FILES) {
    const document = canonical[file];
    if (document === undefined) {
      throw new Error(`canonical schema not found for the reader view: ${file}`);
    }
    ajv.addSchema(withUnknownEnumAdmitted(document) as object);
  }

  const fileByKind: Record<ReaderViewKind, string> = {
    project: "project.schema.json",
    session: "capture-session.schema.json",
    package: "capture-package.schema.json",
    uploadRequest: "upload-request.schema.json",
  };

  const validators = {} as Record<ReaderViewKind, Validator>;
  for (const kind of Object.keys(fileByKind) as ReaderViewKind[]) {
    const validate = ajv.getSchema(`${SCHEMA_ID_BASE}/${fileByKind[kind]}`);
    if (validate === undefined) {
      throw new Error(`reader-view schema not registered: ${fileByKind[kind]}`);
    }
    validators[kind] = validate as unknown as Validator;
  }
  return validators;
}

let readerValidators: Record<ReaderViewKind, Validator> | undefined;

function validatorsFor(kind: ReaderViewKind): Validator {
  readerValidators ??= buildReaderValidators();
  const validate = readerValidators[kind];
  if (validate === undefined) {
    throw new Error(`no reader-view validator for kind: ${kind}`);
  }
  return validate;
}

/**
 * Validates a tolerant projection (unknown fields dropped, unknown
 * enum values mapped to the sentinel) against the reader view of the
 * canonical v1.0 schema: structurally strict v1.0, with the `unknown`
 * sentinel admitted as an enum value.
 */
export function validateReaderView(kind: ReaderViewKind, payload: unknown): ReaderViewOutcome {
  const validate = validatorsFor(kind);
  const ok = validate(payload);
  if (ok) {
    return { ok: true, errors: [] };
  }
  const errors = (validate.errors ?? []).map(
    (error) => `${error.instancePath || "(root)"} ${error.message ?? "invalid"}`,
  );
  return { ok: false, errors };
}
