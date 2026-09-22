/**
 * HFX-000 — provider evaluation control-plane endpoints, domain model.
 *
 * Contract (docs/productization-layer-hardening-work-orders.md governing
 * rule; docs/huggingface-hardening-execution-plan.md §HF-0;
 * spec/architecture-lock.md technology substitution):
 *
 * THE PROVIDER HTTP SURFACE IS A THIN, DETERMINISTIC TRANSPORT over the
 * `@aise/provider-registry` package — never an authority and never a
 * provider store:
 *
 *  - the service owns an IN-MEMORY EVENT-SOURCED registry (the package's
 *    append-only log + derived state); it is DETERMINISTIC — identical
 *    request sequences produce identical registry states and identical
 *    response bytes. No clock (no event carries a timestamp — the log
 *    order IS the time), no randomness, NO NETWORK EGRESS (providers are
 *    never invoked over HTTP by this module; adapters submit raw
 *    executions for normalization).
 *  - every wire payload is validated through the package's PURE typed
 *    validators (profiles, benchmark records, provenance manifests, raw
 *    executions); every refusal carries a stable machine-readable code —
 *    never a silent coercion, never a fabricated result.
 *  - the license/use gate is enforced in the PACKAGE's state machine; a
 *    refused promotion is a RECORDED `rejected` decision carrying the
 *    typed refusal reasons (a 200 answer with the decision — refusals are
 *    data, not transport errors), while an unlawful request (e.g. a
 *    promotion decision before benchmarking) is a typed 422.
 *
 * This module owns the request/response shapes, the typed error registry
 * and the boundary parsers (shape → typed codes, the solution-boq
 * module's hand-rolled discipline). Policy lives in service.ts; transport
 * in router.ts.
 */

import type { ProviderProfile, ProvenanceManifest, RegistryEntry } from "@aise/provider-registry";

/* ------------------------------------------------------------------ */
/* Typed errors (stable codes; the router maps them to HTTP)            */
/* ------------------------------------------------------------------ */

export const PROVIDER_SERVICE_ERROR_CODES = Object.freeze([
  // shape / boundary validation (400/422 at the HTTP boundary)
  "malformed_json",
  "invalid_request",
  "invalid_profile",
  "invalid_input",
  "invalid_execution",
  "invalid_benchmark_record",
  "normalization_refused",
  // registry lookups (404)
  "unknown_provider",
  "unknown_manifest",
  // registry state machine (422 — mirrors @aise/provider-registry's typed failures)
  "registration_conflict",
  "unlawful_transition",
  "record_provider_mismatch",
  "manifest_provider_mismatch",
  "invalid_provenance_manifest",
  "promotion_gate_refused",
] as const);
export type ProviderServiceErrorCode = (typeof PROVIDER_SERVICE_ERROR_CODES)[number];

/** One typed provider-endpoint error (fail closed, never silent). */
export class ProviderServiceError extends Error {
  readonly code: ProviderServiceErrorCode;
  readonly detail: string;

  constructor(code: ProviderServiceErrorCode, detail: string) {
    super(`${code}: ${detail}`);
    this.name = "ProviderServiceError";
    this.code = code;
    this.detail = detail;
  }
}

/* ------------------------------------------------------------------ */
/* Request shapes                                                       */
/* ------------------------------------------------------------------ */

/** POST /v1/providers/profile/validate | /v1/providers/register. */
export interface ProfilePayloadRequest {
  readonly profile: unknown;
}

/** POST /v1/providers/registry/query — one entry or the full list. */
export interface RegistryQueryRequest {
  readonly providerId?: string;
  readonly technologyVersion?: string;
}

/** POST /v1/providers/evaluation/start. */
export interface EvaluationStartRequest {
  readonly providerId: string;
  readonly technologyVersion: string;
}

/**
 * POST /v1/providers/execution/normalize — the normalized-input + raw
 * provider execution pair. BOTH directions of the I/O boundary are
 * exercised: the input is validated against the profile's declared INPUT
 * contract, the raw execution against the OUTPUT contract.
 */
export interface ExecutionNormalizeRequest {
  readonly providerId: string;
  readonly technologyVersion: string;
  readonly input: unknown;
  readonly execution: unknown;
}

/** POST /v1/providers/benchmarks/intake. */
export interface BenchmarkIntakeRequest {
  readonly record: unknown;
}

/** POST /v1/providers/provenance/seal. */
export interface ProvenanceSealRequest {
  readonly providerId: string;
  readonly technologyVersion: string;
}

/** POST /v1/providers/provenance/manifest — retrieval. */
export interface ProvenanceManifestRequest {
  readonly providerId: string;
  readonly technologyVersion: string;
  readonly manifestId?: string;
}

/** POST /v1/providers/promotion/decide. */
export interface PromotionDecideRequest {
  readonly providerId: string;
  readonly technologyVersion: string;
}

/* ------------------------------------------------------------------ */
/* Response shapes                                                      */
/* ------------------------------------------------------------------ */

/** The deterministic entry summary every state answer carries. */
export interface ProviderEntrySummary {
  readonly providerId: string;
  readonly technologyVersion: string;
  readonly state: string;
  readonly profileDigest: string;
  readonly capabilities: readonly string[];
  readonly evaluationOnly: boolean;
  readonly license: {
    readonly identifier: string;
    readonly commercialUse: boolean;
    readonly intendedUse: string;
    readonly intendedUseCleared: boolean;
    readonly evaluationOnly: boolean;
  };
  readonly normalizedExecutionCount: number;
  readonly benchmarkRecordIds: readonly string[];
  readonly provenanceManifestIds: readonly string[];
  readonly promotionDecision:
    | {
        readonly decision: "promoted" | "rejected";
        readonly checks: readonly { readonly gate: string; readonly passed: boolean; readonly detail: string }[];
        readonly refusals: readonly { readonly kind: string; readonly detail: string }[];
      }
    | null;
  readonly retirementReason: string | null;
}

export interface ProfileValidateResponse {
  readonly valid: true;
  readonly profileDigest: string;
  readonly evaluationOnly: boolean;
}

export interface RegisterResponse {
  readonly entry: ProviderEntrySummary;
}

export interface RegistryQueryResponse {
  readonly entries: readonly ProviderEntrySummary[];
}

export interface ExecutionNormalizeResponse {
  readonly result: {
    readonly status: "ok" | "failed";
    readonly capability: string;
    readonly inputDigest: string;
    readonly outputDigest?: string;
    readonly failure?: { readonly kind: string; readonly detail: string };
    readonly providerNative?: { readonly mediaType: string; readonly payload: unknown };
  };
  readonly entry: ProviderEntrySummary;
}

export interface BenchmarkIntakeResponse {
  readonly recordId: string;
  readonly entry: ProviderEntrySummary;
}

export interface ProvenanceSealResponse {
  readonly manifest: ProvenanceManifest;
  readonly entry: ProviderEntrySummary;
}

export interface ProvenanceManifestResponse {
  readonly manifests: readonly ProvenanceManifest[];
}

export interface PromotionDecideResponse {
  readonly decision: "promoted" | "rejected";
  readonly checks: readonly { readonly gate: string; readonly passed: boolean; readonly detail: string }[];
  readonly refusals: readonly { readonly kind: string; readonly detail: string }[];
  readonly entry: ProviderEntrySummary;
}

/* ------------------------------------------------------------------ */
/* Boundary parsers (shape → typed errors; hand-rolled discipline)      */
/* ------------------------------------------------------------------ */

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function requireProviderKey(payload: Record<string, unknown>): { providerId: string; technologyVersion: string } {
  const providerId = payload["providerId"];
  const technologyVersion = payload["technologyVersion"];
  if (typeof providerId !== "string" || providerId.trim().length === 0) {
    throw new ProviderServiceError(
      "invalid_request",
      "providerId is required and must be a non-empty string",
    );
  }
  if (typeof technologyVersion !== "string" || technologyVersion.trim().length === 0) {
    throw new ProviderServiceError(
      "invalid_request",
      "technologyVersion is required and must be a non-empty string",
    );
  }
  return { providerId, technologyVersion };
}

/** The entry summary projection (pure; derived from the package's entry). */
export function entrySummaryOf(entry: RegistryEntry): ProviderEntrySummary {
  return {
    providerId: entry.providerId,
    technologyVersion: entry.technologyVersion,
    state: entry.state,
    profileDigest: entry.profileDigest,
    capabilities: [...entry.profile.capabilities],
    evaluationOnly: entry.profile.license.evaluationOnly,
    license: {
      identifier: entry.profile.license.identifier,
      commercialUse: entry.profile.license.commercialUse,
      intendedUse: entry.profile.license.intendedUse,
      intendedUseCleared: entry.profile.license.intendedUseCleared,
      evaluationOnly: entry.profile.license.evaluationOnly,
    },
    normalizedExecutionCount: entry.normalizedExecutions.length,
    benchmarkRecordIds: entry.benchmarkRecords.map((record) => record.recordId),
    provenanceManifestIds: entry.provenanceManifests.map((manifest) => manifest.manifestId),
    promotionDecision: entry.promotionDecision,
    retirementReason: entry.retirementReason,
  };
}

/** Parses the POST /v1/providers/profile/validate|register body (fail closed). */
export function parseProfilePayloadRequest(payload: unknown): ProfilePayloadRequest {
  if (!isRecord(payload)) {
    throw new ProviderServiceError("invalid_request", "expected a JSON object body");
  }
  const profile = payload["profile"];
  if (!isRecord(profile)) {
    throw new ProviderServiceError(
      "invalid_profile",
      "profile must be a ProviderProfile-shaped object (typed seal 'provider-profile')",
    );
  }
  return { profile };
}

/** Parses the POST /v1/providers/registry/query body (fail closed). */
export function parseRegistryQueryRequest(payload: unknown): RegistryQueryRequest {
  if (!isRecord(payload)) {
    throw new ProviderServiceError("invalid_request", "expected a JSON object body");
  }
  const providerId = payload["providerId"];
  const technologyVersion = payload["technologyVersion"];
  if (providerId === undefined && technologyVersion === undefined) {
    return {}; // the full-entry listing
  }
  if (typeof providerId !== "string" || typeof technologyVersion !== "string") {
    throw new ProviderServiceError(
      "invalid_request",
      "providerId and technologyVersion must be provided TOGETHER (or neither, for the full listing)",
    );
  }
  return { providerId, technologyVersion };
}

/** Parses the POST /v1/providers/evaluation/start body (fail closed). */
export function parseEvaluationStartRequest(payload: unknown): EvaluationStartRequest {
  if (!isRecord(payload)) {
    throw new ProviderServiceError("invalid_request", "expected a JSON object body");
  }
  return requireProviderKey(payload);
}

/** Parses the POST /v1/providers/execution/normalize body (fail closed). */
export function parseExecutionNormalizeRequest(payload: unknown): ExecutionNormalizeRequest {
  if (!isRecord(payload)) {
    throw new ProviderServiceError("invalid_request", "expected a JSON object body");
  }
  const { providerId, technologyVersion } = requireProviderKey(payload);
  const input = payload["input"];
  if (!isRecord(input)) {
    throw new ProviderServiceError(
      "invalid_input",
      "input must be a ProviderInput-shaped object (typed seal 'provider-input')",
    );
  }
  const execution = payload["execution"];
  if (!isRecord(execution)) {
    throw new ProviderServiceError(
      "invalid_execution",
      "execution must be a raw provider execution object (outputs or an explicit failure)",
    );
  }
  return { providerId, technologyVersion, input, execution };
}

/** Parses the POST /v1/providers/benchmarks/intake body (fail closed). */
export function parseBenchmarkIntakeRequest(payload: unknown): BenchmarkIntakeRequest {
  if (!isRecord(payload)) {
    throw new ProviderServiceError("invalid_request", "expected a JSON object body");
  }
  const record = payload["record"];
  if (!isRecord(record)) {
    throw new ProviderServiceError(
      "invalid_benchmark_record",
      "record must be a BenchmarkRecord-shaped object (typed seal 'provider-benchmark-record')",
    );
  }
  return { record };
}

/** Parses the POST /v1/providers/provenance/seal body (fail closed). */
export function parseProvenanceSealRequest(payload: unknown): ProvenanceSealRequest {
  if (!isRecord(payload)) {
    throw new ProviderServiceError("invalid_request", "expected a JSON object body");
  }
  return requireProviderKey(payload);
}

/** Parses the POST /v1/providers/provenance/manifest body (fail closed). */
export function parseProvenanceManifestRequest(payload: unknown): ProvenanceManifestRequest {
  if (!isRecord(payload)) {
    throw new ProviderServiceError("invalid_request", "expected a JSON object body");
  }
  const { providerId, technologyVersion } = requireProviderKey(payload);
  const manifestId = payload["manifestId"];
  if (manifestId !== undefined && (typeof manifestId !== "string" || manifestId.trim().length === 0)) {
    throw new ProviderServiceError(
      "invalid_request",
      "manifestId, when present, must be a non-empty string (the manifest's content address)",
    );
  }
  return { providerId, technologyVersion, ...(manifestId === undefined ? {} : { manifestId }) };
}

/** Parses the POST /v1/providers/promotion/decide body (fail closed). */
export function parsePromotionDecideRequest(payload: unknown): PromotionDecideRequest {
  if (!isRecord(payload)) {
    throw new ProviderServiceError("invalid_request", "expected a JSON object body");
  }
  return requireProviderKey(payload);
}

/** Re-exports the package types used by the service surface. */
export type { ProviderProfile };
