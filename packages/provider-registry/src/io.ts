/**
 * HFX-000 — the normalized provider I/O boundary.
 *
 * What a provider execution may carry IN and OUT of the control plane:
 *
 *   ProviderInput  → { kind, capability, payload } — the NORMALIZED input,
 *                    validated against the profile's declared INPUT
 *                    contract (`validateProviderInput`);
 *   ProviderResult → the NORMALIZED result: either contract-validated
 *                    `outputs` (+ their digest) or an EXPLICIT failure from
 *                    the closed vocabulary — never both, never neither.
 *
 * PROVIDER-NATIVE FORMATS NEVER CROSS THIS BOUNDARY AS DOMAIN TYPES: a raw
 * provider execution may carry `providerNative` — an OPAQUE payload
 * (mediaType + arbitrary JSON) captured for PROVENANCE ONLY. It is carried
 * verbatim, digested, and never parsed into any canonical AISE domain type
 * (the technology-substitution rule: provider-specific identifiers/types
 * stay outside canonical domain semantics; provider identity, version,
 * configuration and input digests belong in provenance).
 *
 * `normalizeResult` validates a raw provider-shaped payload against the
 * OUTPUT contract declared in the profile: PURE, TYPED FAILURES, NO
 * THROWS — every refusal is a discriminated union member
 * (`contract-mismatch` with structured issues being the main one).
 */

import { isFailureKind, type FailureKind } from "./failures";
import { sha256Canonical } from "./digest";
import type { ContractFieldSpec, ProviderIOContract, ProviderProfile } from "./profile";

/* ------------------------------------------------------------------ */
/* Normalized input                                                     */
/* ------------------------------------------------------------------ */

export const PROVIDER_INPUT_KIND = "provider-input" as const;

/** The normalized input a provider execution may carry IN. */
export interface ProviderInput {
  readonly kind: typeof PROVIDER_INPUT_KIND;
  readonly capability: string;
  readonly payload: Record<string, unknown>;
}

/** One typed input-validation failure (mirrors the contract issue shape). */
export interface ContractIssue {
  readonly path: string;
  readonly expected: string;
  readonly actual: string;
}

export type ProviderInputValidation =
  | { readonly ok: true; readonly input: ProviderInput; readonly inputDigest: string }
  | { readonly ok: false; readonly failures: readonly InputValidationFailure[] };

export const INPUT_VALIDATION_FAILURE_KINDS = [
  "not-an-object",
  "capability-not-offered",
  "payload-contract-mismatch",
] as const;
export type InputValidationFailureKind = (typeof INPUT_VALIDATION_FAILURE_KINDS)[number];

export interface InputValidationFailure {
  readonly kind: InputValidationFailureKind;
  readonly detail: string;
  readonly issues?: readonly ContractIssue[];
}

/* ------------------------------------------------------------------ */
/* Opaque native payload (provenance only)                              */
/* ------------------------------------------------------------------ */

/**
 * A provider-native payload captured for provenance ONLY. The control plane
 * NEVER parses this into a canonical domain type — it is carried verbatim
 * and digested (`opaqueNativeDigestOf`).
 */
export interface OpaqueNativePayload {
  readonly mediaType: string;
  readonly payload: unknown;
}

/** sha-256 over the canonical JSON of the opaque native payload. */
export function opaqueNativeDigestOf(native: OpaqueNativePayload): string {
  return sha256Canonical(native);
}

/* ------------------------------------------------------------------ */
/* Normalized result                                                    */
/* ------------------------------------------------------------------ */

export const PROVIDER_RESULT_KIND = "provider-result" as const;

/** An explicit provider failure observation (closed vocabulary). */
export interface ProviderFailureObservation {
  readonly kind: FailureKind;
  readonly detail: string;
}

/**
 * The normalized result a provider execution may carry OUT: either
 * contract-validated outputs (status "ok") or an explicit failure from the
 * closed vocabulary (status "failed"). The optional `providerNative` opaque
 * payload rides along for provenance only.
 */
export interface ProviderResult {
  readonly kind: typeof PROVIDER_RESULT_KIND;
  readonly capability: string;
  readonly inputDigest: string;
  readonly status: "ok" | "failed";
  /** Present iff status is "ok": the contract-validated outputs. */
  readonly outputs?: Record<string, unknown>;
  /** Present iff status is "ok": sha-256 over the canonical outputs JSON. */
  readonly outputDigest?: string;
  /** Present iff status is "failed": the explicit closed-vocabulary failure. */
  readonly failure?: ProviderFailureObservation;
  /** Optional opaque provider-native payload (provenance only, never parsed). */
  readonly providerNative?: OpaqueNativePayload;
}

/**
 * The semantic projection hashed into a normalized result digest: the
 * capability, status, outputs/failure — EXCLUDING the opaque native payload
 * (native bytes are attribution, not normalized semantics; their digest is
 * carried separately by `opaqueNativeDigestOf`).
 */
export function providerResultDigestOf(result: ProviderResult): string {
  return sha256Canonical({
    kind: PROVIDER_RESULT_KIND,
    capability: result.capability,
    inputDigest: result.inputDigest,
    status: result.status,
    outputs: result.outputs,
    failure: result.failure,
  });
}

/** sha-256 over the canonical JSON of a validated outputs record. */
export function outputsDigestOf(outputs: Record<string, unknown>): string {
  return sha256Canonical(outputs);
}

/** sha-256 over the canonical JSON of a normalized input (the IN digest). */
export function inputDigestOf(input: ProviderInput): string {
  return sha256Canonical({
    kind: PROVIDER_INPUT_KIND,
    capability: input.capability,
    payload: input.payload,
  });
}

/* ------------------------------------------------------------------ */
/* The contract-checking engine (pure, typed issues)                    */
/* ------------------------------------------------------------------ */

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function describeType(value: unknown): string {
  if (value === null) {
    return "null";
  }
  if (Array.isArray(value)) {
    return `array(${value.length})`;
  }
  return typeof value;
}

/**
 * Validates a payload object against a DECLARED contract (pure; every
 * violation is a typed `contract-mismatch` issue). Contracts are CLOSED:
 * unknown fields are violations (a provider may not invent outputs). Only
 * REQUIRED fields must be present; an optional-but-present field is checked
 * exactly like a required one.
 */
export function validatePayloadAgainstContract(
  payload: unknown,
  contract: ProviderIOContract,
  basePath: string,
): readonly ContractIssue[] {
  if (!isRecord(payload)) {
    return [
      {
        path: basePath,
        expected: "a JSON object matching the declared contract",
        actual: describeType(payload),
      },
    ];
  }
  const issues: ContractIssue[] = [];
  const seen = new Set<string>();
  for (const field of contract.fields) {
    seen.add(field.name);
    const value = payload[field.name];
    if (value === undefined) {
      if (field.required) {
        issues.push({
          path: `${basePath}.${field.name}`,
          expected: `${field.type} (required)`,
          actual: "missing",
        });
      }
      continue;
    }
    issues.push(...validateFieldValue(`${basePath}.${field.name}`, field, value));
  }
  for (const key of Object.keys(payload)) {
    if (!seen.has(key)) {
      issues.push({
        path: `${basePath}.${key}`,
        expected: "not declared by the contract (contracts are closed)",
        actual: `unknown field of type ${describeType(payload[key])}`,
      });
    }
  }
  return issues;
}

function validateFieldValue(path: string, field: ContractFieldSpec, value: unknown): readonly ContractIssue[] {
  const issues: ContractIssue[] = [];
  const bounded = (issuePath: string, number: number): void => {
    if (field.min !== undefined && number < field.min) {
      issues.push({
        path: issuePath,
        expected: `>= ${field.min}`,
        actual: String(number),
      });
    }
    if (field.max !== undefined && number > field.max) {
      issues.push({
        path: issuePath,
        expected: `<= ${field.max}`,
        actual: String(number),
      });
    }
  };
  const lengthBounded = (length: number): void => {
    if (field.minLength !== undefined && length < field.minLength) {
      issues.push({
        path,
        expected: `length >= ${field.minLength}`,
        actual: `length ${length}`,
      });
    }
    if (field.maxLength !== undefined && length > field.maxLength) {
      issues.push({
        path,
        expected: `length <= ${field.maxLength}`,
        actual: `length ${length}`,
      });
    }
  };

  switch (field.type) {
    case "number": {
      if (typeof value !== "number" || !Number.isFinite(value)) {
        issues.push({ path, expected: "finite number", actual: describeType(value) });
      } else {
        bounded(path, value);
      }
      break;
    }
    case "integer": {
      if (typeof value !== "number" || !Number.isInteger(value)) {
        issues.push({ path, expected: "integer", actual: describeType(value) });
      } else {
        bounded(path, value);
      }
      break;
    }
    case "string": {
      if (typeof value !== "string") {
        issues.push({ path, expected: "string", actual: describeType(value) });
      } else {
        lengthBounded(value.length);
      }
      break;
    }
    case "boolean": {
      if (typeof value !== "boolean") {
        issues.push({ path, expected: "boolean", actual: describeType(value) });
      }
      break;
    }
    case "number-array": {
      if (!Array.isArray(value)) {
        issues.push({ path, expected: "array of finite numbers", actual: describeType(value) });
        break;
      }
      lengthBounded(value.length);
      for (const [index, entry] of value.entries()) {
        const elementPath = `${path}[${index}]`;
        if (typeof entry !== "number" || !Number.isFinite(entry)) {
          issues.push({
            path: elementPath,
            expected: "finite number",
            actual: describeType(entry),
          });
        } else {
          bounded(elementPath, entry);
        }
      }
      break;
    }
  }
  return issues;
}

/* ------------------------------------------------------------------ */
/* Input validation (the IN direction of the boundary)                  */
/* ------------------------------------------------------------------ */

/**
 * Validates an unknown payload as a normalized `ProviderInput` against the
 * profile's declared input contract and capability list. PURE, typed
 * failures, no throws.
 */
export function validateProviderInput(input: unknown, profile: ProviderProfile): ProviderInputValidation {
  if (!isRecord(input) || input["kind"] !== PROVIDER_INPUT_KIND) {
    return {
      ok: false,
      failures: [
        {
          kind: "not-an-object",
          detail: `expected a ProviderInput object (typed seal '${PROVIDER_INPUT_KIND}')`,
        },
      ],
    };
  }
  const capability = input["capability"];
  if (typeof capability !== "string" || capability.trim().length === 0) {
    return {
      ok: false,
      failures: [{ kind: "not-an-object", detail: "capability must be a non-empty string" }],
    };
  }
  if (!(profile.capabilities as readonly string[]).includes(capability)) {
    return {
      ok: false,
      failures: [
        {
          kind: "capability-not-offered",
          detail: `capability '${capability}' is not declared by provider '${profile.providerId}' (${profile.technologyVersion}) — offered: [${profile.capabilities.join(", ")}]`,
        },
      ],
    };
  }
  const payload = input["payload"];
  if (!isRecord(payload)) {
    return {
      ok: false,
      failures: [{ kind: "not-an-object", detail: "payload must be a JSON object" }],
    };
  }
  const issues = validatePayloadAgainstContract(payload, profile.inputContract, "payload");
  if (issues.length > 0) {
    return {
      ok: false,
      failures: [
        {
          kind: "payload-contract-mismatch",
          detail: "the input payload violates the provider's declared input contract",
          issues,
        },
      ],
    };
  }
  const typed = input as unknown as ProviderInput;
  return { ok: true, input: typed, inputDigest: inputDigestOf(typed) };
}

/* ------------------------------------------------------------------ */
/* normalizeResult (the OUT direction of the boundary)                  */
/* ------------------------------------------------------------------ */

/** The raw, provider-shaped execution an adapter submits for normalization. */
export interface RawProviderExecution {
  readonly capability?: string;
  readonly outputs?: Record<string, unknown>;
  readonly failure?: { readonly kind: string; readonly detail: string };
  readonly providerNative?: OpaqueNativePayload;
}

export const NORMALIZE_FAILURE_KINDS = [
  "not-provider-shaped",
  "capability-mismatch",
  "failure-kind-out-of-vocabulary",
  "contract-mismatch",
  "outputs-and-failure",
  "empty-execution",
] as const;
export type NormalizeFailureKind = (typeof NORMALIZE_FAILURE_KINDS)[number];

/** One typed normalization refusal reason (never a throw). */
export interface NormalizeFailure {
  readonly kind: NormalizeFailureKind;
  readonly detail: string;
  /** Present for contract-mismatch: the structured issues. */
  readonly issues?: readonly ContractIssue[];
}

export type NormalizeResultOutcome =
  | { readonly ok: true; readonly result: ProviderResult }
  | { readonly ok: false; readonly failure: NormalizeFailure };

/**
 * Validates a raw provider-shaped payload against the OUTPUT contract
 * declared in the profile and normalizes it into a `ProviderResult`.
 *
 * PURE DETERMINISTIC COMPUTATION: no network, no clock, no randomness, no
 * throws. Every refusal is a typed `NormalizeFailure`; a raw payload that
 * declares BOTH outputs and a failure is ambiguous (`outputs-and-failure`);
 * one that declares neither is empty (`empty-execution`); an explicit
 * failure whose kind is outside the closed vocabulary is
 * `failure-kind-out-of-vocabulary`; outputs that violate the declared
 * contract are `contract-mismatch` with structured issues. The opaque
 * `providerNative` payload, when present, is carried through verbatim for
 * provenance only — never parsed.
 */
export function normalizeResult(
  raw: unknown,
  profile: ProviderProfile,
  context: { readonly inputDigest: string },
): NormalizeResultOutcome {
  if (!isRecord(raw)) {
    return {
      ok: false,
      failure: {
        kind: "not-provider-shaped",
        detail: "a raw provider execution must be a JSON object",
      },
    };
  }
  const rawCapability = raw["capability"];
  if (rawCapability !== undefined) {
    if (typeof rawCapability !== "string" || rawCapability.trim().length === 0) {
      return {
        ok: false,
        failure: {
          kind: "not-provider-shaped",
          detail: "capability, when present, must be a non-empty string",
        },
      };
    }
    if (!(profile.capabilities as readonly string[]).includes(rawCapability)) {
      return {
        ok: false,
        failure: {
          kind: "capability-mismatch",
          detail: `capability '${rawCapability}' is not declared by provider '${profile.providerId}' (${profile.technologyVersion}) — offered: [${profile.capabilities.join(", ")}]`,
        },
      };
    }
  }
  const outputs = raw["outputs"];
  const failure = raw["failure"];
  const native = raw["providerNative"];

  if (native !== undefined && (!isRecord(native) || typeof native["mediaType"] !== "string")) {
    return {
      ok: false,
      failure: {
        kind: "not-provider-shaped",
        detail: "providerNative, when present, must be { mediaType: string, payload: <opaque> }",
      },
    };
  }

  if (outputs !== undefined && failure !== undefined) {
    return {
      ok: false,
      failure: {
        kind: "outputs-and-failure",
        detail: "a raw provider execution declaring BOTH outputs and a failure is ambiguous — exactly one is required",
      },
    };
  }

  const capability =
    typeof rawCapability === "string" && rawCapability.trim().length > 0
      ? rawCapability
      : profile.capabilities[0] ?? "";

  if (failure !== undefined) {
    if (!isRecord(failure)) {
      return {
        ok: false,
        failure: {
          kind: "not-provider-shaped",
          detail: "failure, when present, must be { kind, detail }",
        },
      };
    }
    const kind = failure["kind"];
    if (!isFailureKind(kind)) {
      return {
        ok: false,
        failure: {
          kind: "failure-kind-out-of-vocabulary",
          detail: `failure kind '${String(kind)}' is not in the CLOSED failure vocabulary — providers cannot invent failure kinds`,
        },
      };
    }
    const detail = failure["detail"];
    if (typeof detail !== "string" || detail.trim().length === 0) {
      return {
        ok: false,
        failure: {
          kind: "not-provider-shaped",
          detail: "failure.detail must be a non-empty string",
        },
      };
    }
    const result: ProviderResult = {
      kind: PROVIDER_RESULT_KIND,
      capability,
      inputDigest: context.inputDigest,
      status: "failed",
      failure: { kind, detail },
      ...(native === undefined ? {} : { providerNative: native as unknown as OpaqueNativePayload }),
    };
    return { ok: true, result };
  }

  if (outputs === undefined) {
    return {
      ok: false,
      failure: {
        kind: "empty-execution",
        detail: "a raw provider execution must declare outputs or an explicit failure — neither is present",
      },
    };
  }

  if (!isRecord(outputs)) {
    return {
      ok: false,
      failure: {
        kind: "not-provider-shaped",
        detail: "outputs, when present, must be a JSON object",
      },
    };
  }

  const issues = validatePayloadAgainstContract(outputs, profile.outputContract, "outputs");
  if (issues.length > 0) {
    return {
      ok: false,
      failure: {
        kind: "contract-mismatch",
        detail: "the raw outputs violate the provider's declared output contract",
        issues,
      },
    };
  }

  const result: ProviderResult = {
    kind: PROVIDER_RESULT_KIND,
    capability,
    inputDigest: context.inputDigest,
    status: "ok",
    outputs,
    outputDigest: outputsDigestOf(outputs),
    ...(native === undefined ? {} : { providerNative: native as unknown as OpaqueNativePayload }),
  };
  return { ok: true, result };
}
