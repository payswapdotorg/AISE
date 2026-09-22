/**
 * HFX-000 — provider evaluation control-plane public surface.
 *
 * Consumers (server.ts at the integration station, future adapter
 * surfaces, developer tooling) import from HERE only. The module is a
 * thin transport adapter over the `@aise/provider-registry` package:
 * model (request/response shapes, typed error registry, boundary
 * parsers) + service (a deterministic in-memory event-sourced registry)
 * + router (the PURE route factory — not mounted; the Tech Lead wires it
 * in server.ts).
 *
 * THE CONTROL-PLANE BOUNDARY, restated at the surface: no provider-
 * specific type crosses into canonical AISE domain semantics — the
 * package below imports only the shared canonical-JSON serializer; raw
 * provider payloads enter as opaque executions and leave as normalized
 * results, benchmark records and digest-verifiable provenance manifests.
 */

export {
  PROVIDER_SERVICE_ERROR_CODES,
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
  type BenchmarkIntakeRequest,
  type BenchmarkIntakeResponse,
  type EvaluationStartRequest,
  type ExecutionNormalizeRequest,
  type ExecutionNormalizeResponse,
  type ProfilePayloadRequest,
  type ProfileValidateResponse,
  type PromotionDecideRequest,
  type PromotionDecideResponse,
  type ProviderEntrySummary,
  type ProviderServiceErrorCode,
  type ProvenanceManifestRequest,
  type ProvenanceManifestResponse,
  type ProvenanceSealRequest,
  type ProvenanceSealResponse,
  type RegistryQueryRequest,
  type RegistryQueryResponse,
  type RegisterResponse,
} from "./model";
export { ProviderService } from "./service";
export { handleProvidersRequest, type ProviderRouteOptions } from "./router";
