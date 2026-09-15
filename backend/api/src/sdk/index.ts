/**
 * AISE-038 — Developer API/SDK public surface.
 *
 * Consumers (server.ts, future language bindings, AISE-040 adoption shell,
 * external developers) import from HERE only. The module is a CONTRACT
 * LAYER over the existing route authorities: model (operation contracts,
 * scope discipline against the AISE-036 frozen permission registry,
 * error-code registries, the additions-only version registry, the
 * route-drift check) + discovery (the deterministic discovery document)
 * + client (typed request builders over the registered routes) + router
 * (the /v1/sdk discovery + contract transport).
 *
 * THE CONTRACT BOUNDARY, restated at the surface: this module imports NO
 * sibling domain module at runtime (type-only imports from the domain
 * models for wire shapes; the identity permission registry is read via
 * the JSON fixture pinned verbatim by contract tests). It never
 * re-implements domain logic, never creates a second canonical model,
 * and never bypasses a domain authority — the six work-order domains'
 * routes keep answering through their owning routers; this surface only
 * describes them and helps callers construct correct requests.
 */

export {
  IDENTITY_PERMISSIONS_FIXTURE,
  SDK_API_VERSION,
  SDK_CONTRACT,
  SDK_CONTRACT_ERROR_CODES,
  SDK_DRIFT_CODES,
  SDK_IDEMPOTENCY_CLASSES,
  SDK_IDEMPOTENCY_CLASS_DESCRIPTIONS,
  SdkContractError,
  buildSdkContract,
  buildSdkVersionRegistry,
  checkRouteDrift,
  parseSdkScope,
  sdkRouteShape,
  type RouterFact,
  type SdkContract,
  type SdkContractErrorCode,
  type SdkContractInput,
  type SdkDomainContract,
  type SdkDomainContractInput,
  type SdkDriftCode,
  type SdkHttpMethod,
  type SdkHttpOperation,
  type SdkIdempotencyClass,
  type SdkInProcessOperation,
  type SdkOperation,
  type SdkOperationId,
  type SdkRouteDrift,
  type SdkTransport,
  type SdkVersionRegistry,
  type SdkVersionStep,
} from "./model";
export {
  SDK_OUT_OF_SCOPE_NAMESPACES,
  SDK_SURFACE_ROUTES,
  buildSdkDiscoveryDocument,
  renderSdkDiscoveryDocument,
  type SdkDiscoveryDocument,
} from "./discovery";
export {
  SDK_CLIENT_ERROR_CODES,
  SdkClientError,
  createSdkClient,
  sdkRequestToFetchRequest,
  type SdkBoqClient,
  type SdkCaptureClient,
  type SdkCasesClient,
  type SdkClient,
  type SdkInterventionsClient,
  type SdkRealityClient,
  type SdkRequestBody,
  type SdkRequest,
} from "./client";
export { handleSdkRequest, type SdkRouteOptions } from "./router";
