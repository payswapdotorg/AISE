/**
 * JSON Schema (draft 2020-12) validation for every AISE shared
 * contract. This is the reference validator for the Z.ai side; the
 * schema files themselves are language-neutral so the Android side
 * can validate the same fixtures with any 2020-12 implementation.
 *
 * The `uuid` and `date-time` formats are defined by the reference
 * regular expressions below (single source, language-neutral; the
 * Android side must apply equivalent semantics).
 */
import { Ajv2020 } from "ajv/dist/2020.js";
import { CONTRACT_FILES, loadAllSchemas, SCHEMA_ID_BASE } from "./io.js";

export interface ValidationOutcome {
  ok: boolean;
  /** Human-readable validation failures (empty when ok). */
  errors: string[];
}

/** RFC 4122 UUID (any version), case-insensitive. */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** RFC 3339 date-time: date, "T", time with optional fraction, offset or "Z". */
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

const ajv = new Ajv2020({ allErrors: true });

ajv.addFormat("uuid", {
  type: "string",
  validate: (data: string) => UUID_PATTERN.test(data),
});

ajv.addFormat("date-time", {
  type: "string",
  validate: (data: string) => DATE_TIME_PATTERN.test(data),
});

const schemaDocuments = loadAllSchemas();
for (const name of CONTRACT_FILES) {
  ajv.addSchema(schemaDocuments[name] as object);
}

function schemaId(file: string): string {
  return `${SCHEMA_ID_BASE}/${file}`;
}

function validatorFor(file: string): Validator {
  const validate = ajv.getSchema(schemaId(file));
  if (validate === undefined) {
    throw new Error(`schema not registered: ${file}`);
  }
  return validate as unknown as Validator;
}

function fragmentValidator(schemaFile: string, fragment: string): Validator {
  const compiled = ajv.compile({ $ref: `${schemaId(schemaFile)}#/$defs/${fragment}` });
  return compiled as unknown as Validator;
}

function outcome(validate: Validator, payload: unknown): ValidationOutcome {
  const ok = validate(payload);
  if (ok) {
    return { ok: true, errors: [] };
  }
  const errors = (validate.errors ?? []).map(
    (error) => `${error.instancePath || "(root)"} ${error.message ?? "invalid"}`,
  );
  return { ok: false, errors };
}

const projectValidator = validatorFor("project.schema.json");
const sessionValidator = validatorFor("capture-session.schema.json");
const packageValidator = validatorFor("capture-package.schema.json");
const uploadRequestValidator = validatorFor("upload-request.schema.json");
const uploadResultValidator = validatorFor("upload-result.schema.json");
const syncErrorValidator = validatorFor("sync-error.schema.json");
const modelVersionValidator = validatorFor("model-version.schema.json");
const objectRefValidator = fragmentValidator("model-version.schema.json", "modelObjectRef");
const measurementValidator = fragmentValidator("common.schema.json", "measurement");
const epistemicStateValidator = fragmentValidator("common.schema.json", "epistemicState");
const observationPresenceValidator = fragmentValidator("common.schema.json", "observationPresence");

/** Validates a project identity payload. */
export function validateProject(payload: unknown): ValidationOutcome {
  return outcome(projectValidator, payload);
}

/** Validates a capture session payload. */
export function validateCaptureSession(payload: unknown): ValidationOutcome {
  return outcome(sessionValidator, payload);
}

/** Validates a capture package manifest payload. */
export function validateCapturePackage(payload: unknown): ValidationOutcome {
  return outcome(packageValidator, payload);
}

/** Validates an upload request payload. */
export function validateUploadRequest(payload: unknown): ValidationOutcome {
  return outcome(uploadRequestValidator, payload);
}

/** Validates an upload result payload. */
export function validateUploadResult(payload: unknown): ValidationOutcome {
  return outcome(uploadResultValidator, payload);
}

/** Validates a synchronization error envelope. */
export function validateSyncError(payload: unknown): ValidationOutcome {
  return outcome(syncErrorValidator, payload);
}

/** Validates a model version identifier payload. */
export function validateModelVersion(payload: unknown): ValidationOutcome {
  return outcome(modelVersionValidator, payload);
}

/** Validates a model object reference payload. */
export function validateModelObjectRef(payload: unknown): ValidationOutcome {
  return outcome(objectRefValidator, payload);
}

/** Validates a measurement/estimate transport record. */
export function validateMeasurement(payload: unknown): ValidationOutcome {
  return outcome(measurementValidator, payload);
}

/** Validates a single epistemic state value. */
export function validateEpistemicState(payload: unknown): ValidationOutcome {
  return outcome(epistemicStateValidator, payload);
}

/** Validates a single observation presence value. */
export function validateObservationPresence(payload: unknown): ValidationOutcome {
  return outcome(observationPresenceValidator, payload);
}
