/**
 * HFX-000 — the machine-readable `ProviderProfile` schema + pure validators.
 *
 * Contract (docs/productization-layer-hardening-work-orders.md, "Mandatory
 * provider-evaluation fields"): EVERY evaluated provider must be
 * representable by a profile containing at least
 *
 *   providerId, technologyVersion, capabilities, supportedModalities,
 *   computeProfile, memoryProfile, latencyProfile, license, costProfile,
 *   inputContract, outputContract, provenanceContract,
 *   uncertaintyCharacteristics, failureModes, benchmarkResults
 *
 * — all fifteen are FIRST-CLASS fields of `ProviderProfile` (15/15; asserted
 * by profile.test.ts's coverage table). House validation pattern: TypeScript
 * discriminated unions + PURE validator functions returning typed failure
 * reasons (no zod, no throws, no silent coercion — the `solution-contract`
 * pure-validator discipline; see also `io.ts`, `benchmark.ts`).
 *
 * Governing doctrine encoded here:
 *   - `license` carries the identifier, a `commercialUse` boolean, an
 *     `intendedUse` declaration, whether that intended use is CLEARED, and
 *     the DERIVED `evaluationOnly` flag — true when commercial use or the
 *     intended use is not cleared (the layer-hardening "Dataset/model-use
 *     rule": training and evaluation are separate decisions; unless
 *     licensing and intended-use terms are explicitly cleared, a
 *     model/dataset is evaluation-only). The derivation invariant is
 *     ENFORCED by the validator (`license-flag-inconsistent`).
 *   - `failureModes` use the CLOSED vocabulary (failures.ts) — a profile
 *     cannot invent failure kinds.
 *   - `benchmarkResults` are REFERENCES (benchmark record ids), never
 *     inlined scores — validated as non-empty strings only; the registry
 *     event log is the authority for which records are actually attached.
 *   - Provider-specific classes/identifiers/formats must not cross the
 *     canonical AISE domain boundary: `inputContract`/`outputContract` are
 *     AISE-side DECLARED contracts; provider-native payloads are opaque
 *     (io.ts `OpaqueNativePayload`) and are never parsed into canonical
 *     domain types.
 *
 * Determinism: a profile is a declared value object — no timestamps, no
 * instance ids, no environment reads. `profileDigestOf` content-addresses
 * the DECLARED EVALUATION SEMANTICS (presentation fields excluded,
 * mirroring the house identity discipline: renaming a provider is not a
 * semantic change to the control plane).
 */

import { isFailureKind, type FailureKind } from "./failures";
import { sha256Canonical } from "./digest";

/* ------------------------------------------------------------------ */
/* Sealed kinds + closed vocabularies                                   */
/* ------------------------------------------------------------------ */

export const PROVIDER_PROFILE_KIND = "provider-profile" as const;
export const PROVIDER_PROFILE_SCHEMA_VERSION = "provider-profile/1" as const;

/** Closed modality vocabulary (what a provider may consume/emit). */
export const PROVIDER_MODALITIES = [
  "image",
  "video",
  "depth-map",
  "point-cloud",
  "mesh",
  "text",
  "document",
  "table",
] as const;
export type ProviderModality = (typeof PROVIDER_MODALITIES)[number];

/** Closed compute-accelerator vocabulary. */
export const COMPUTE_ACCELERATORS = ["none", "gpu", "tpu", "npu"] as const;
export type ComputeAccelerator = (typeof COMPUTE_ACCELERATORS)[number];

/** Closed cost-model vocabulary. */
export const COST_MODELS = [
  "none",
  "per-invocation",
  "per-token",
  "compute-time",
  "subscription",
] as const;
export type CostModel = (typeof COST_MODELS)[number];

/**
 * Closed uncertainty-calibration vocabulary. The control plane keeps
 * CONFIDENCE separate from MEASUREMENT UNCERTAINTY
 * (spec/architecture-lock.md "Truth and uncertainty").
 */
export const UNCERTAINTY_CALIBRATIONS = [
  "none-declared",
  "confidence-score",
  "calibrated-probabilistic",
  "measurement-uncertainty",
] as const;
export type UncertaintyCalibration = (typeof UNCERTAINTY_CALIBRATIONS)[number];

/** Closed native-payload policy of the provenance contract. */
export const NATIVE_PAYLOAD_POLICIES = ["opaque-required", "opaque-optional", "none"] as const;
export type NativePayloadPolicy = (typeof NATIVE_PAYLOAD_POLICIES)[number];

/* ------------------------------------------------------------------ */
/* Declared I/O contracts                                               */
/* ------------------------------------------------------------------ */

/** Closed field-type vocabulary of a declared contract field. */
export const CONTRACT_FIELD_TYPES = [
  "number",
  "integer",
  "string",
  "boolean",
  "number-array",
] as const;
export type ContractFieldType = (typeof CONTRACT_FIELD_TYPES)[number];

/**
 * One declared field of a provider input/output contract. The constraints
 * are machine-checkable by io.ts's pure `validatePayloadAgainstContract`
 * (typed `contract-mismatch` issues, never throws):
 *   - `min`/`max` bound numbers, integers and number-array ELEMENTS;
 *   - `minLength`/`maxLength` bound string lengths and array lengths.
 */
export interface ContractFieldSpec {
  readonly name: string;
  readonly type: ContractFieldType;
  readonly required: boolean;
  readonly description: string;
  readonly min?: number;
  readonly max?: number;
  readonly minLength?: number;
  readonly maxLength?: number;
}

/**
 * The AISE-side DECLARED contract for one direction of the provider
 * boundary. Provider-native formats never appear here — they are carried as
 * opaque provenance payloads (io.ts).
 */
export interface ProviderIOContract {
  readonly contractId: string;
  readonly modality: ProviderModality;
  readonly fields: readonly ContractFieldSpec[];
}

/* ------------------------------------------------------------------ */
/* License declaration (the dataset/model-use gate input)               */
/* ------------------------------------------------------------------ */

/**
 * The license/use declaration of a provider profile.
 *
 * `evaluationOnly` is DERIVED: true unless BOTH commercial use is permitted
 * AND the declared intended use is explicitly cleared for production. The
 * validator enforces the invariant
 * `evaluationOnly === !(commercialUse && intendedUseCleared)`.
 */
export interface LicenseDeclaration {
  readonly identifier: string;
  readonly commercialUse: boolean;
  readonly intendedUse: string;
  readonly intendedUseCleared: boolean;
  readonly evaluationOnly: boolean;
}

/** The clearance inputs the evaluation-only flag derives from. */
export interface LicenseClearanceInput {
  readonly commercialUse: boolean;
  readonly intendedUseCleared: boolean;
}

/**
 * Derives the evaluation-only flag (pure): true when commercial use OR the
 * declared intended use is not cleared. The layer-hardening dataset/model-use
 * rule in one function.
 */
export function deriveEvaluationOnly(license: LicenseClearanceInput): boolean {
  return !(license.commercialUse && license.intendedUseCleared);
}

/** The declaration input before the flag is derived. */
export interface LicenseDeclarationInput {
  readonly identifier: string;
  readonly commercialUse: boolean;
  readonly intendedUse: string;
  readonly intendedUseCleared: boolean;
}

/** Normalizes a declaration input into the full declaration (derives the flag). */
export function toLicenseDeclaration(license: LicenseDeclarationInput): LicenseDeclaration {
  return { ...license, evaluationOnly: deriveEvaluationOnly(license) };
}

/* ------------------------------------------------------------------ */
/* Failure modes (closed vocabulary only)                               */
/* ------------------------------------------------------------------ */

/** One declared failure mode — the kind MUST come from failures.ts. */
export interface FailureModeDeclaration {
  readonly kind: FailureKind;
  readonly condition: string;
  readonly behavior: string;
}

/* ------------------------------------------------------------------ */
/* Resource / cost / uncertainty profiles                               */
/* ------------------------------------------------------------------ */

export interface ComputeProfile {
  readonly accelerator: ComputeAccelerator;
  readonly minimumCores: number;
  readonly recommendedCores: number;
  readonly offlineCapable: boolean;
  readonly statement: string;
}

export interface MemoryProfile {
  readonly minimumMiB: number;
  readonly recommendedMiB: number;
  readonly statement: string;
}

export interface LatencyProfile {
  readonly expectedMsP50: number;
  readonly expectedMsP95: number;
  readonly timeoutMs: number;
  readonly statement: string;
}

export interface CostProfile {
  readonly model: CostModel;
  /** Non-negative; MUST be 0 when `model` is "none" (enforced). */
  readonly unitCost: number;
  readonly currency: string;
  readonly quotaPolicy: string;
}

export interface UncertaintyCharacteristics {
  readonly calibration: UncertaintyCalibration;
  /**
   * True when the provider's confidence outputs are kept SEPARATE from any
   * measurement uncertainty it declares (the architecture-lock rule).
   */
  readonly confidenceSeparateFromMeasurementUncertainty: boolean;
  readonly notes: string;
}

/**
 * What the provider must emit for provenance. This is the declared shape of
 * the provenance the normalized result and the manifest are sealed from —
 * provider identity, configuration digest, input digests and the
 * native-payload policy.
 */
export interface ProvenanceContract {
  readonly providerIdentityRequired: boolean;
  readonly configurationDigestRequired: boolean;
  readonly inputDigestRequired: boolean;
  readonly nativePayloadPolicy: NativePayloadPolicy;
}

/* ------------------------------------------------------------------ */
/* The profile                                                          */
/* ------------------------------------------------------------------ */

/**
 * The machine-readable provider profile — every mandatory field from the
 * layer-hardening work orders plus the typed seal and two presentation
 * fields. A declared VALUE OBJECT: immutable, no clock, no environment.
 */
export interface ProviderProfile {
  readonly kind: typeof PROVIDER_PROFILE_KIND;
  readonly schemaVersion: typeof PROVIDER_PROFILE_SCHEMA_VERSION;
  readonly providerId: string;
  readonly technologyVersion: string;
  /** Presentation only — excluded from the profile digest. */
  readonly displayName: string;
  /** Presentation only — excluded from the profile digest. */
  readonly description: string;
  readonly capabilities: readonly string[];
  readonly supportedModalities: readonly ProviderModality[];
  readonly computeProfile: ComputeProfile;
  readonly memoryProfile: MemoryProfile;
  readonly latencyProfile: LatencyProfile;
  readonly license: LicenseDeclaration;
  readonly costProfile: CostProfile;
  readonly inputContract: ProviderIOContract;
  readonly outputContract: ProviderIOContract;
  readonly provenanceContract: ProvenanceContract;
  readonly uncertaintyCharacteristics: UncertaintyCharacteristics;
  readonly failureModes: readonly FailureModeDeclaration[];
  /** Benchmark record ids — REFERENCES, never inlined scores. */
  readonly benchmarkResults: readonly string[];
}

/* ------------------------------------------------------------------ */
/* Typed validation failures                                            */
/* ------------------------------------------------------------------ */

/** Closed vocabulary of profile validation failure kinds. */
export const PROFILE_VALIDATION_FAILURE_KINDS = [
  "not-an-object",
  "missing-field",
  "type-mismatch",
  "value-out-of-range",
  "empty-list",
  "vocabulary-violation",
  "license-flag-inconsistent",
  "duplicate-contract-field",
  "cost-model-inconsistent",
] as const;
export type ProfileValidationFailureKind = (typeof PROFILE_VALIDATION_FAILURE_KINDS)[number];

/** One typed profile validation failure (stable kind + path + detail). */
export interface ProfileValidationFailure {
  readonly kind: ProfileValidationFailureKind;
  readonly path: string;
  readonly detail: string;
}

/** The discriminated validation outcome — ok carries the typed profile. */
export type ProviderProfileValidation =
  | { readonly ok: true; readonly profile: ProviderProfile; readonly profileDigest: string }
  | { readonly ok: false; readonly failures: readonly ProfileValidationFailure[] };

/* ------------------------------------------------------------------ */
/* The pure validator                                                   */
/* ------------------------------------------------------------------ */

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === "boolean";
}

function inVocabulary<T extends string>(
  value: unknown,
  vocabulary: readonly T[],
): value is T {
  return typeof value === "string" && (vocabulary as readonly string[]).includes(value);
}

/** The fifteen mandatory field names (the work-order list, verbatim order). */
export const MANDATORY_PROFILE_FIELDS = [
  "providerId",
  "technologyVersion",
  "capabilities",
  "supportedModalities",
  "computeProfile",
  "memoryProfile",
  "latencyProfile",
  "license",
  "costProfile",
  "inputContract",
  "outputContract",
  "provenanceContract",
  "uncertaintyCharacteristics",
  "failureModes",
  "benchmarkResults",
] as const;

/**
 * Validates an unknown payload as a `ProviderProfile`. PURE: collects every
 * typed failure (never throws, never early-exits on the first problem
 * except when the payload is not an object at all) and on success returns
 * the typed profile plus its deterministic content digest.
 */
export function validateProviderProfile(input: unknown): ProviderProfileValidation {
  if (!isRecord(input)) {
    return {
      ok: false,
      failures: [
        {
          kind: "not-an-object",
          path: "",
          detail: "a provider profile must be a JSON object",
        },
      ],
    };
  }

  const failures: ProfileValidationFailure[] = [];
  const fail = (kind: ProfileValidationFailureKind, path: string, detail: string): void => {
    failures.push({ kind, path, detail });
  };

  const requireString = (path: string, value: unknown, max = 4096): void => {
    if (!isNonEmptyString(value)) {
      fail("type-mismatch", path, `expected a non-empty string (max ${max})`);
    } else if (value.length > max) {
      fail("value-out-of-range", path, `string longer than ${max} characters`);
    }
  };
  const requireFiniteNumber = (path: string, value: unknown, min: number, max: number): void => {
    if (!isFiniteNumber(value)) {
      fail("type-mismatch", path, `expected a finite number in [${min}, ${max}]`);
    } else if (value < min || value > max) {
      fail("value-out-of-range", path, `number ${value} outside [${min}, ${max}]`);
    }
  };
  const requireBoolean = (path: string, value: unknown): void => {
    if (!isBoolean(value)) {
      fail("type-mismatch", path, "expected a boolean");
    }
  };
  const requireStringList = (
    path: string,
    value: unknown,
    options: { readonly allowEmpty: boolean; readonly max: number },
  ): void => {
    if (!Array.isArray(value)) {
      fail("type-mismatch", path, "expected an array of strings");
      return;
    }
    if (!options.allowEmpty && value.length === 0) {
      fail("empty-list", path, "at least one entry is required");
    }
    if (value.length > options.max) {
      fail("value-out-of-range", path, `more than ${options.max} entries`);
    }
    for (const [index, entry] of value.entries()) {
      if (!isNonEmptyString(entry) || entry.length > 256) {
        fail("type-mismatch", `${path}[${index}]`, "expected a non-empty string (max 256)");
      }
    }
  };
  const requireVocabulary = (
    path: string,
    value: unknown,
    vocabulary: readonly string[],
    vocabularyName: string,
  ): void => {
    if (!inVocabulary(value, vocabulary as readonly string[])) {
      fail(
        "vocabulary-violation",
        path,
        `'${String(value)}' is not in the closed ${vocabularyName} vocabulary`,
      );
    }
  };

  /* Seal + identity + presentation --------------------------------- */

  if (input["kind"] !== PROVIDER_PROFILE_KIND) {
    fail("type-mismatch", "kind", `expected the typed seal '${PROVIDER_PROFILE_KIND}'`);
  }
  if (input["schemaVersion"] !== PROVIDER_PROFILE_SCHEMA_VERSION) {
    fail(
      "type-mismatch",
      "schemaVersion",
      `expected the schema version '${PROVIDER_PROFILE_SCHEMA_VERSION}'`,
    );
  }
  requireString("providerId", input["providerId"], 256);
  requireString("technologyVersion", input["technologyVersion"], 256);
  requireString("displayName", input["displayName"]);
  requireString("description", input["description"]);

  /* Vocabularies ---------------------------------------------------- */

  requireStringList("capabilities", input["capabilities"], { allowEmpty: false, max: 64 });
  requireStringList("supportedModalities", input["supportedModalities"], {
    allowEmpty: false,
    max: 16,
  });
  if (Array.isArray(input["supportedModalities"])) {
    for (const [index, entry] of (input["supportedModalities"] as unknown[]).entries()) {
      requireVocabulary(`supportedModalities[${index}]`, entry, PROVIDER_MODALITIES, "modality");
    }
  }

  /* Resource / latency / cost profiles ------------------------------ */

  const compute = input["computeProfile"];
  if (isRecord(compute)) {
    requireVocabulary("computeProfile.accelerator", compute["accelerator"], COMPUTE_ACCELERATORS, "compute accelerator");
    requireFiniteNumber("computeProfile.minimumCores", compute["minimumCores"], 1, 1_000_000);
    requireFiniteNumber("computeProfile.recommendedCores", compute["recommendedCores"], 1, 1_000_000);
    requireBoolean("computeProfile.offlineCapable", compute["offlineCapable"]);
    requireString("computeProfile.statement", compute["statement"]);
    if (
      isFiniteNumber(compute["minimumCores"]) &&
      isFiniteNumber(compute["recommendedCores"]) &&
      compute["recommendedCores"] < compute["minimumCores"]
    ) {
      fail("value-out-of-range", "computeProfile.recommendedCores", "recommendedCores below minimumCores");
    }
  } else {
    fail("type-mismatch", "computeProfile", "expected the compute profile object");
  }

  const memory = input["memoryProfile"];
  if (isRecord(memory)) {
    requireFiniteNumber("memoryProfile.minimumMiB", memory["minimumMiB"], 1, 1_000_000_000);
    requireFiniteNumber("memoryProfile.recommendedMiB", memory["recommendedMiB"], 1, 1_000_000_000);
    requireString("memoryProfile.statement", memory["statement"]);
    if (
      isFiniteNumber(memory["minimumMiB"]) &&
      isFiniteNumber(memory["recommendedMiB"]) &&
      memory["recommendedMiB"] < memory["minimumMiB"]
    ) {
      fail("value-out-of-range", "memoryProfile.recommendedMiB", "recommendedMiB below minimumMiB");
    }
  } else {
    fail("type-mismatch", "memoryProfile", "expected the memory profile object");
  }

  const latency = input["latencyProfile"];
  if (isRecord(latency)) {
    requireFiniteNumber("latencyProfile.expectedMsP50", latency["expectedMsP50"], 0, 3_600_000);
    requireFiniteNumber("latencyProfile.expectedMsP95", latency["expectedMsP95"], 0, 3_600_000);
    requireFiniteNumber("latencyProfile.timeoutMs", latency["timeoutMs"], 1, 3_600_000);
    requireString("latencyProfile.statement", latency["statement"]);
    if (
      isFiniteNumber(latency["expectedMsP50"]) &&
      isFiniteNumber(latency["expectedMsP95"]) &&
      latency["expectedMsP95"] < latency["expectedMsP50"]
    ) {
      fail("value-out-of-range", "latencyProfile.expectedMsP95", "p95 below p50");
    }
    if (
      isFiniteNumber(latency["timeoutMs"]) &&
      isFiniteNumber(latency["expectedMsP95"]) &&
      latency["timeoutMs"] < latency["expectedMsP95"]
    ) {
      fail("value-out-of-range", "latencyProfile.timeoutMs", "timeout below the declared p95");
    }
  } else {
    fail("type-mismatch", "latencyProfile", "expected the latency profile object");
  }

  const cost = input["costProfile"];
  if (isRecord(cost)) {
    requireVocabulary("costProfile.model", cost["model"], COST_MODELS, "cost model");
    requireFiniteNumber("costProfile.unitCost", cost["unitCost"], 0, 1_000_000_000);
    requireString("costProfile.currency", cost["currency"], 64);
    requireString("costProfile.quotaPolicy", cost["quotaPolicy"]);
    if (
      cost["model"] === "none" &&
      isFiniteNumber(cost["unitCost"]) &&
      cost["unitCost"] !== 0
    ) {
      fail(
        "cost-model-inconsistent",
        "costProfile.unitCost",
        "a 'none' cost model must carry unitCost 0",
      );
    }
  } else {
    fail("type-mismatch", "costProfile", "expected the cost profile object");
  }

  /* License (the dataset/model-use gate input) ----------------------- */

  const license = input["license"];
  if (isRecord(license)) {
    requireString("license.identifier", license["identifier"], 256);
    requireBoolean("license.commercialUse", license["commercialUse"]);
    requireString("license.intendedUse", license["intendedUse"]);
    requireBoolean("license.intendedUseCleared", license["intendedUseCleared"]);
    requireBoolean("license.evaluationOnly", license["evaluationOnly"]);
    if (
      isBoolean(license["commercialUse"]) &&
      isBoolean(license["intendedUseCleared"]) &&
      isBoolean(license["evaluationOnly"])
    ) {
      const derived = deriveEvaluationOnly({
        commercialUse: license["commercialUse"],
        intendedUseCleared: license["intendedUseCleared"],
      });
      if (license["evaluationOnly"] !== derived) {
        fail(
          "license-flag-inconsistent",
          "license.evaluationOnly",
          `the derived evaluationOnly flag is ${String(derived)} (evaluationOnly is true when ` +
            `commercial use OR the declared intended use is not cleared) — the declared flag was ` +
            `${String(license["evaluationOnly"])}`,
        );
      }
    }
  } else {
    fail("type-mismatch", "license", "expected the license declaration object");
  }

  /* Declared I/O contracts ------------------------------------------ */

  const validateContract = (path: string, contract: unknown): void => {
    if (!isRecord(contract)) {
      fail("type-mismatch", path, "expected the declared contract object");
      return;
    }
    requireString(`${path}.contractId`, contract["contractId"], 256);
    requireVocabulary(`${path}.modality`, contract["modality"], PROVIDER_MODALITIES, "modality");
    const fields = contract["fields"];
    if (!Array.isArray(fields) || fields.length === 0) {
      fail("empty-list", `${path}.fields`, "at least one declared field is required");
      return;
    }
    if (fields.length > 64) {
      fail("value-out-of-range", `${path}.fields`, "more than 64 declared fields");
    }
    const seen = new Set<string>();
    for (const [index, entry] of (fields as unknown[]).entries()) {
      const fieldPath = `${path}.fields[${index}]`;
      if (!isRecord(entry)) {
        fail("type-mismatch", fieldPath, "expected a contract field object");
        continue;
      }
      requireString(`${fieldPath}.name`, entry["name"], 256);
      requireVocabulary(
        `${fieldPath}.type`,
        entry["type"],
        CONTRACT_FIELD_TYPES,
        "contract field type",
      );
      requireBoolean(`${fieldPath}.required`, entry["required"]);
      requireString(`${fieldPath}.description`, entry["description"]);
      for (const constraint of ["min", "max", "minLength", "maxLength"] as const) {
        const value = entry[constraint];
        if (value !== undefined) {
          requireFiniteNumber(`${fieldPath}.${constraint}`, value, 0, 1_000_000_000);
        }
      }
      const name = entry["name"];
      if (isNonEmptyString(name)) {
        if (seen.has(name)) {
          fail("duplicate-contract-field", `${fieldPath}.name`, `duplicate field name '${name}'`);
        }
        seen.add(name);
      }
    }
  };

  validateContract("inputContract", input["inputContract"]);
  validateContract("outputContract", input["outputContract"]);

  /* Provenance contract ---------------------------------------------- */

  const provenance = input["provenanceContract"];
  if (isRecord(provenance)) {
    requireBoolean("provenanceContract.providerIdentityRequired", provenance["providerIdentityRequired"]);
    requireBoolean("provenanceContract.configurationDigestRequired", provenance["configurationDigestRequired"]);
    requireBoolean("provenanceContract.inputDigestRequired", provenance["inputDigestRequired"]);
    requireVocabulary(
      "provenanceContract.nativePayloadPolicy",
      provenance["nativePayloadPolicy"],
      NATIVE_PAYLOAD_POLICIES,
      "native payload policy",
    );
  } else {
    fail("type-mismatch", "provenanceContract", "expected the provenance contract object");
  }

  /* Uncertainty characteristics -------------------------------------- */

  const uncertainty = input["uncertaintyCharacteristics"];
  if (isRecord(uncertainty)) {
    requireVocabulary(
      "uncertaintyCharacteristics.calibration",
      uncertainty["calibration"],
      UNCERTAINTY_CALIBRATIONS,
      "uncertainty calibration",
    );
    requireBoolean(
      "uncertaintyCharacteristics.confidenceSeparateFromMeasurementUncertainty",
      uncertainty["confidenceSeparateFromMeasurementUncertainty"],
    );
    requireString("uncertaintyCharacteristics.notes", uncertainty["notes"]);
  } else {
    fail("type-mismatch", "uncertaintyCharacteristics", "expected the uncertainty characteristics object");
  }

  /* Failure modes (closed vocabulary) --------------------------------- */

  const failureModes = input["failureModes"];
  if (Array.isArray(failureModes)) {
    if (failureModes.length === 0) {
      fail("empty-list", "failureModes", "at least one declared failure mode is required");
    }
    if (failureModes.length > 64) {
      fail("value-out-of-range", "failureModes", "more than 64 declared failure modes");
    }
    for (const [index, entry] of (failureModes as unknown[]).entries()) {
      const modePath = `failureModes[${index}]`;
      if (!isRecord(entry)) {
        fail("type-mismatch", modePath, "expected a failure mode object");
        continue;
      }
      const kind = entry["kind"];
      if (!isFailureKind(kind)) {
        fail(
          "vocabulary-violation",
          `${modePath}.kind`,
          `'${String(kind)}' is not in the CLOSED failure vocabulary — profiles cannot invent failure kinds`,
        );
      }
      requireString(`${modePath}.condition`, entry["condition"]);
      requireString(`${modePath}.behavior`, entry["behavior"]);
    }
  } else {
    fail("type-mismatch", "failureModes", "expected an array of failure mode declarations");
  }

  /* Benchmark results (references, never inlined scores) -------------- */

  const benchmarkResults = input["benchmarkResults"];
  if (Array.isArray(benchmarkResults)) {
    if (benchmarkResults.length > 256) {
      fail("value-out-of-range", "benchmarkResults", "more than 256 benchmark record references");
    }
    for (const [index, entry] of (benchmarkResults as unknown[]).entries()) {
      if (!isNonEmptyString(entry) || entry.length > 256) {
        fail(
          "type-mismatch",
          `benchmarkResults[${index}]`,
          "a benchmark result must be a RECORD REFERENCE (a non-empty benchmark record id string, max 256) — inlined scores are never accepted",
        );
      }
    }
  } else {
    fail("type-mismatch", "benchmarkResults", "expected an array of benchmark record id references");
  }

  if (failures.length > 0) {
    return { ok: false, failures };
  }

  // Post-validation trusted cast: every field has been shape-checked above.
  const profile = input as unknown as ProviderProfile;
  return { ok: true, profile, profileDigest: profileDigestOf(profile) };
}

/* ------------------------------------------------------------------ */
/* Identity                                                            */
/* ------------------------------------------------------------------ */

/**
 * The semantic projection hashed into a profile's digest: every mandatory
 * evaluation field. EXCLUDED: `displayName`/`description` (presentation —
 * renaming is not a semantic change, the house identity discipline) and the
 * `schemaVersion` seal (a same-schema bump must not re-address history).
 */
export function profileDigestOf(profile: ProviderProfile): string {
  return sha256Canonical({
    kind: PROVIDER_PROFILE_KIND,
    providerId: profile.providerId,
    technologyVersion: profile.technologyVersion,
    capabilities: [...profile.capabilities],
    supportedModalities: [...profile.supportedModalities],
    computeProfile: profile.computeProfile,
    memoryProfile: profile.memoryProfile,
    latencyProfile: profile.latencyProfile,
    license: profile.license,
    costProfile: profile.costProfile,
    inputContract: profile.inputContract,
    outputContract: profile.outputContract,
    provenanceContract: profile.provenanceContract,
    uncertaintyCharacteristics: profile.uncertaintyCharacteristics,
    failureModes: profile.failureModes,
    benchmarkResults: [...profile.benchmarkResults],
  });
}

/** Structural seal check (fast path guard; full checking is the validator). */
export function isProviderProfile(input: unknown): input is ProviderProfile {
  return (
    isRecord(input) &&
    input["kind"] === PROVIDER_PROFILE_KIND &&
    input["schemaVersion"] === PROVIDER_PROFILE_SCHEMA_VERSION &&
    isNonEmptyString(input["providerId"]) &&
    isNonEmptyString(input["technologyVersion"])
  );
}
