/**
 * HFX-000 — provider evaluation control-plane service.
 *
 * THIN deterministic orchestration over the `@aise/provider-registry`
 * package (the work order's "service.ts (thin orchestration over the
 * package)"):
 *
 *  - the service owns an IN-MEMORY EVENT-SOURCED registry (the package's
 *    append-only log + derived state). DETERMINISTIC: identical request
 *    sequences produce identical registry states and identical response
 *    bytes — no clock (no event ever carries a timestamp: the log order IS
 *    the time), no randomness, NO NETWORK EGRESS (this module never
 *    invokes a provider over the network; adapters submit raw executions
 *    for normalization against the DECLARED contracts).
 *  - every domain decision is made by the PACKAGE (profile validation,
 *    the state machine, the license/use promotion gate, manifest sealing
 *    and verification); the package's typed failure kinds map 1:1 onto
 *    this module's stable service codes.
 *  - the environment fingerprint of every sealed manifest is DECLARED,
 *    NOT SENSED: a fixed constant below — the service never reads
 *    process.versions, process.platform or any runtime environment (that
 *    would break the determinism contract).
 */

import {
  applyRegistryEvent,
  createProviderRegistry,
  inputDigestOf,
  normalizeResult,
  providerResultDigestOf,
  requestPromotion,
  sealProvenanceManifest,
  validateBenchmarkRecord,
  validateProviderProfile,
  validateProviderInput,
} from "@aise/provider-registry";
import type {
  EnvironmentFingerprint,
  ProviderRegistry,
  RegistryEntry,
  RegistryEventFailure,
} from "@aise/provider-registry";
import {
  ProviderServiceError,
  entrySummaryOf,
  parseBenchmarkIntakeRequest,
  parseEvaluationStartRequest,
  parseExecutionNormalizeRequest,
  parseProfilePayloadRequest,
  parsePromotionDecideRequest,
  parseProvenanceManifestRequest,
  parseProvenanceSealRequest,
  parseRegistryQueryRequest,
  type BenchmarkIntakeResponse,
  type ExecutionNormalizeResponse,
  type ProfileValidateResponse,
  type PromotionDecideResponse,
  type ProviderEntrySummary,
  type ProvenanceManifestResponse,
  type ProvenanceSealResponse,
  type RegistryQueryResponse,
  type RegisterResponse,
} from "./model";

/** The DECLARED environment fingerprint (never sensed — see header). */
const DECLARED_ENVIRONMENT: EnvironmentFingerprint = {
  declaredRuntime: "bun",
  declaredPlatform: "aise-backend-deterministic",
  codeVersion: "hfx-000/provider-registry/1",
  statement:
    "declared, not sensed — the backend module never reads the runtime environment " +
    "(determinism contract: identical request sequences produce identical states)",
};

/** Maps a package registry-event failure onto the typed service error. */
function fromRegistryFailure(failure: RegistryEventFailure): ProviderServiceError {
  switch (failure.kind) {
    case "invalid-profile": {
      const issues = (failure.underlying ?? [])
        .map((entry) => `${entry.path || "(root)"} ${entry.detail}`)
        .join("; ");
      return new ProviderServiceError(
        "invalid_profile",
        `the profile failed typed validation${issues === "" ? "" : `: ${issues}`}`,
      );
    }
    case "invalid-benchmark-record": {
      const issues = (failure.underlying ?? [])
        .map((entry) => `${entry.path || "(root)"} ${entry.detail}`)
        .join("; ");
      return new ProviderServiceError(
        "invalid_benchmark_record",
        `the benchmark record failed typed validation${issues === "" ? "" : `: ${issues}`}`,
      );
    }
    case "invalid-provenance-manifest": {
      const issues = (failure.underlying ?? [])
        .map((entry) => `${entry.path || "(root)"} ${entry.detail}`)
        .join("; ");
      return new ProviderServiceError(
        "invalid_provenance_manifest",
        `the provenance manifest failed typed verification${issues === "" ? "" : `: ${issues}`}`,
      );
    }
    case "invalid-event-shape":
      return new ProviderServiceError("invalid_request", failure.detail);
    case "unknown-provider":
      return new ProviderServiceError("unknown_provider", failure.detail);
    case "registration-conflict":
      return new ProviderServiceError("registration_conflict", failure.detail);
    case "unlawful-transition":
      return new ProviderServiceError("unlawful_transition", failure.detail);
    case "record-provider-mismatch":
      return new ProviderServiceError("record_provider_mismatch", failure.detail);
    case "manifest-provider-mismatch":
      return new ProviderServiceError("manifest_provider_mismatch", failure.detail);
    case "promotion-gate-refused": {
      const refusals = (failure.refusals ?? []).map((refusal) => `${refusal.kind}: ${refusal.detail}`).join("; ");
      return new ProviderServiceError(
        "promotion_gate_refused",
        `the promotion gate refused the decision${refusals === "" ? "" : `: ${refusals}`}`,
      );
    }
  }
}

/**
 * The provider evaluation control-plane service: a deterministic,
 * event-sourced in-memory registry over the `@aise/provider-registry`
 * package. Instantiate once per process; every method is a pure function
 * of (current registry state, request payload).
 */
export class ProviderService {
  private registry: ProviderRegistry = createProviderRegistry();

  /** POST /v1/providers/profile/validate — pure validation, no state change. */
  validateProfile(payload: unknown): ProfileValidateResponse {
    const request = parseProfilePayloadRequest(payload);
    const validation = validateProviderProfile(request.profile);
    if (!validation.ok) {
      const issues = validation.failures
        .map((failure) => `${failure.path || "(root)"} ${failure.kind}: ${failure.detail}`)
        .join("; ");
      throw new ProviderServiceError(
        "invalid_profile",
        `the profile failed typed validation (${validation.failures.length} failure(s)): ${issues}`,
      );
    }
    return {
      valid: true,
      profileDigest: validation.profileDigest,
      evaluationOnly: validation.profile.license.evaluationOnly,
    };
  }

  /** POST /v1/providers/register — validate + register (idempotent). */
  register(payload: unknown): RegisterResponse {
    const request = parseProfilePayloadRequest(payload);
    const validation = validateProviderProfile(request.profile);
    if (!validation.ok) {
      const issues = validation.failures
        .map((failure) => `${failure.path || "(root)"} ${failure.kind}: ${failure.detail}`)
        .join("; ");
      throw new ProviderServiceError(
        "invalid_profile",
        `the profile failed typed validation (${validation.failures.length} failure(s)): ${issues}`,
      );
    }
    const result = applyRegistryEvent(this.registry, {
      kind: "provider-registered",
      profile: validation.profile,
    });
    if (!result.ok) {
      throw fromRegistryFailure(result.failure);
    }
    this.registry = result.registry;
    return { entry: entrySummaryOf(this.requireEntry(validation.profile.providerId, validation.profile.technologyVersion)) };
  }

  /** POST /v1/providers/registry/query — one entry or the full listing. */
  queryRegistry(payload: unknown): RegistryQueryResponse {
    const request = parseRegistryQueryRequest(payload);
    if (request.providerId === undefined || request.technologyVersion === undefined) {
      return { entries: this.registry.entries.map(entrySummaryOf) };
    }
    return { entries: [entrySummaryOf(this.requireEntry(request.providerId, request.technologyVersion))] };
  }

  /** POST /v1/providers/evaluation/start — the registered → evaluation transition. */
  startEvaluation(payload: unknown): RegisterResponse {
    const request = parseEvaluationStartRequest(payload);
    const result = applyRegistryEvent(this.registry, {
      kind: "evaluation-started",
      providerId: request.providerId,
      technologyVersion: request.technologyVersion,
    });
    if (!result.ok) {
      throw fromRegistryFailure(result.failure);
    }
    this.registry = result.registry;
    return { entry: entrySummaryOf(this.requireEntry(request.providerId, request.technologyVersion)) };
  }

  /**
   * POST /v1/providers/execution/normalize — validate the declared input
   * against the profile's INPUT contract, normalize the raw provider
   * execution against the OUTPUT contract, and record the normalized
   * execution (BOTH directions of the I/O boundary in one endpoint).
   */
  normalizeExecution(payload: unknown): ExecutionNormalizeResponse {
    const request = parseExecutionNormalizeRequest(payload);
    const entry = this.requireEntry(request.providerId, request.technologyVersion);

    const inputValidation = validateProviderInput(request.input, entry.profile);
    if (!inputValidation.ok) {
      const issues = inputValidation.failures
        .map((failure) => `${failure.kind}: ${failure.detail}${failure.issues === undefined ? "" : ` [${failure.issues.map((issue) => `${issue.path} expected ${issue.expected}, got ${issue.actual}`).join("; ")}]`}`)
        .join("; ");
      throw new ProviderServiceError(
        "invalid_input",
        `the declared input failed typed validation: ${issues}`,
      );
    }
    const inputDigest = inputDigestOf(inputValidation.input);

    const normalization = normalizeResult(request.execution, entry.profile, { inputDigest });
    if (!normalization.ok) {
      const failure = normalization.failure;
      const issues =
        failure.issues === undefined
          ? ""
          : ` [${failure.issues.map((issue) => `${issue.path} expected ${issue.expected}, got ${issue.actual}`).join("; ")}]`;
      throw new ProviderServiceError(
        "normalization_refused",
        `normalization refused (${failure.kind}): ${failure.detail}${issues}`,
      );
    }
    const result = normalization.result;

    const applied = applyRegistryEvent(this.registry, {
      kind: "execution-normalized",
      providerId: request.providerId,
      technologyVersion: request.technologyVersion,
      execution: {
        capability: result.capability,
        inputDigest,
        normalizedResultDigest: providerResultDigestOf(result),
      },
    });
    if (!applied.ok) {
      throw fromRegistryFailure(applied.failure);
    }
    this.registry = applied.registry;

    return {
      result: {
        status: result.status,
        capability: result.capability,
        inputDigest: result.inputDigest,
        ...(result.outputDigest === undefined ? {} : { outputDigest: result.outputDigest }),
        ...(result.failure === undefined ? {} : { failure: result.failure }),
        ...(result.providerNative === undefined ? {} : { providerNative: result.providerNative }),
      },
      entry: entrySummaryOf(this.requireEntry(request.providerId, request.technologyVersion)),
    };
  }

  /** POST /v1/providers/benchmarks/intake — a benchmark record attaches. */
  intakeBenchmark(payload: unknown): BenchmarkIntakeResponse {
    const request = parseBenchmarkIntakeRequest(payload);
    const validation = validateBenchmarkRecord(request.record);
    if (!validation.ok) {
      const issues = validation.failures
        .map((failure) => `${failure.path || "(root)"} ${failure.kind}: ${failure.detail}`)
        .join("; ");
      throw new ProviderServiceError(
        "invalid_benchmark_record",
        `the benchmark record failed typed validation (${validation.failures.length} failure(s)): ${issues}`,
      );
    }
    const result = applyRegistryEvent(this.registry, {
      kind: "benchmark-recorded",
      record: validation.record,
    });
    if (!result.ok) {
      throw fromRegistryFailure(result.failure);
    }
    this.registry = result.registry;
    return {
      recordId: validation.record.recordId,
      entry: entrySummaryOf(
        this.requireEntry(validation.record.providerId, validation.record.technologyVersion),
      ),
    };
  }

  /** POST /v1/providers/provenance/seal — seal the portable manifest from the entry state. */
  sealProvenance(payload: unknown): ProvenanceSealResponse {
    const request = parseProvenanceSealRequest(payload);
    const entry = this.requireEntry(request.providerId, request.technologyVersion);
    if (entry.normalizedExecutions.length === 0) {
      throw new ProviderServiceError(
        "unlawful_transition",
        "a provenance manifest may seal only after at least one NORMALIZED EXECUTION — run /execution/normalize first",
      );
    }
    const lastExecution = entry.normalizedExecutions[entry.normalizedExecutions.length - 1]!;
    const manifest = sealProvenanceManifest({
      profile: entry.profile,
      inputDigests: entry.normalizedExecutions.map((execution) => execution.inputDigest),
      normalizedResultDigest: lastExecution.normalizedResultDigest,
      benchmarkRecords: [...entry.benchmarkRecords],
      environment: DECLARED_ENVIRONMENT,
      reproducibilityStatement:
        `sealed from the registry's derived state: ${entry.normalizedExecutions.length} normalized ` +
        `execution(s) and ${entry.benchmarkRecords.length} benchmark record(s) for provider ` +
        `'${entry.providerId}' (${entry.technologyVersion}) — the manifest is fully determined by ` +
        `the append-only registry event log (deterministic replay reproduces it byte-identically)`,
    });
    const result = applyRegistryEvent(this.registry, {
      kind: "provenance-sealed",
      manifest,
    });
    if (!result.ok) {
      throw fromRegistryFailure(result.failure);
    }
    this.registry = result.registry;
    return {
      manifest,
      entry: entrySummaryOf(this.requireEntry(request.providerId, request.technologyVersion)),
    };
  }

  /** POST /v1/providers/provenance/manifest — retrieval of the sealed manifests. */
  provenanceManifests(payload: unknown): ProvenanceManifestResponse {
    const request = parseProvenanceManifestRequest(payload);
    const entry = this.requireEntry(request.providerId, request.technologyVersion);
    const manifests = [...entry.provenanceManifests];
    if (request.manifestId === undefined) {
      return { manifests };
    }
    const found = manifests.filter((manifest) => manifest.manifestId === request.manifestId);
    if (found.length === 0) {
      throw new ProviderServiceError(
        "unknown_manifest",
        `manifest '${request.manifestId}' is not sealed for provider '${request.providerId}' (${request.technologyVersion}) — ${manifests.length} manifest(s) sealed`,
      );
    }
    return { manifests: found };
  }

  /**
   * POST /v1/providers/promotion/decide — the promotion decision with
   * typed refusal reasons. A REFUSED promotion is a RECORDED rejected
   * decision (a 200 answer: refusals are data); an unlawful request (the
   * entry is not benchmarked) is a typed 422.
   */
  decidePromotion(payload: unknown): PromotionDecideResponse {
    const request = parsePromotionDecideRequest(payload);
    const result = requestPromotion(this.registry, request.providerId, request.technologyVersion);
    if (!result.ok) {
      throw fromRegistryFailure(result.failure);
    }
    this.registry = result.registry;
    const decided = this.requireEntry(request.providerId, request.technologyVersion);
    if (decided.promotionDecision === null) {
      throw new ProviderServiceError(
        "promotion_gate_refused",
        "the promotion decision was applied but no decision record exists (internal invariant)",
      );
    }
    return {
      decision: decided.promotionDecision.decision,
      checks: decided.promotionDecision.checks,
      refusals: decided.promotionDecision.refusals,
      entry: entrySummaryOf(decided),
    };
  }

  /* ---------------------------------------------------------------- */
  /* Internal helpers                                                  */
  /* ---------------------------------------------------------------- */

  private requireEntry(providerId: string, technologyVersion: string): RegistryEntry {
    const entry = this.registry.entryOf(providerId, technologyVersion);
    if (entry === undefined) {
      throw new ProviderServiceError(
        "unknown_provider",
        `provider '${providerId}' (${technologyVersion}) is not registered — register the profile first`,
      );
    }
    return entry;
  }
}

/** Re-exported for the router's mount-point documentation consumers. */
export type { ProviderEntrySummary };
