/**
 * AISE-038 — Developer API/SDK HTTP surface (transport adapter ONLY).
 *
 * Contract (spec/work-orders.md §038; R21 — stable provider-neutral APIs;
 * this surface publishes the CONTRACT, it never judges domain truth):
 *
 *   GET /v1/sdk
 *       The discovery document: the stated API version, the version
 *       registry, the six work-order domains' stable operations with
 *       scopes (verbatim from the AISE-036 identity registry), idempotency
 *       classes, error-code registries, the honest out-of-scope namespace
 *       disclosure and this surface's own routes.
 *   GET /v1/sdk/contract
 *       The full machine-readable contract: the operation registry plus
 *       the version registry (additions-only discipline).
 *
 * Both responses are stamped with `apiVersion` (the contract version)
 * and are BYTE-IDENTICAL across requests — the documents are pure
 * functions of the frozen contract (no clock, no randomness, no
 * environment).
 *
 * HTTP STATUS MAPPING — the single authoritative place for this
 * translation (mirrors the sibling router discipline):
 *
 *   GET on a known sdk route            -> 200 (document envelope)
 *   any other method on a known route   -> 405 with an explicit `allow`
 *   deeper/unknown /v1/sdk/... shapes   -> null (the server-wide 404)
 *
 * Every response carries the `x-request-id` correlation header (see
 * `lib/http.ts`). Paths that match no sdk route return null so the
 * server's default 404 applies.
 */

import { jsonResponse, methodNotAllowed } from "../lib/http";
import type { Logger } from "../lib/log";
import { SDK_CONTRACT, type SdkContract } from "./model";
import { buildSdkDiscoveryDocument } from "./discovery";

export interface SdkRouteOptions {
  /**
   * The contract this surface publishes. Optional: defaults to the
   * shipped SDK_CONTRACT (the frozen registry data validated at module
   * load); tests may inject a purpose-built contract.
   */
  readonly contract?: SdkContract;
  /** Structured logger for surface-level request events. */
  readonly logger: Logger;
}

function pathSegments(url: URL): string[] {
  return url.pathname.split("/").filter((segment) => segment !== "");
}

/** The contract document served at GET /v1/sdk/contract. */
function contractDocument(contract: SdkContract): Record<string, unknown> {
  return {
    versionRegistry: {
      current: contract.versionRegistry.currentVersion,
      versions: contract.versionRegistry.versions.map((version) => ({
        version,
        operations: contract.versionRegistry.operationIdsAt(version),
      })),
    },
    governedNamespaces: contract.governedNamespaces,
    domains: contract.domains,
  };
}

/**
 * Route and answer one request against the developer API/SDK contract
 * surface. Returns null when the path is not an sdk route (the server
 * then answers 404).
 */
export async function handleSdkRequest(
  request: Request,
  url: URL,
  requestId: string,
  options: SdkRouteOptions,
): Promise<Response | null> {
  const segments = pathSegments(url);
  if (segments[0] !== "v1" || segments[1] !== "sdk") {
    return null;
  }
  const contract = options.contract ?? SDK_CONTRACT;
  const { logger } = options;

  /* GET /v1/sdk — the discovery document -------------------------------- */

  if (segments.length === 2) {
    if (request.method !== "GET") {
      return methodNotAllowed(requestId, "GET");
    }
    const discovery = buildSdkDiscoveryDocument(contract);
    logger.info("sdk_discovery_read", { requestId, apiVersion: discovery.apiVersion });
    return jsonResponse(
      200,
      { ok: true, apiVersion: discovery.apiVersion, discovery },
      requestId,
    );
  }

  /* GET /v1/sdk/contract — the machine-readable contract ---------------- */

  if (segments.length === 3 && segments[2] === "contract") {
    if (request.method !== "GET") {
      return methodNotAllowed(requestId, "GET");
    }
    logger.info("sdk_contract_read", {
      requestId,
      apiVersion: contract.versionRegistry.currentVersion,
    });
    return jsonResponse(
      200,
      {
        ok: true,
        apiVersion: contract.versionRegistry.currentVersion,
        contract: contractDocument(contract),
      },
      requestId,
    );
  }

  // A /v1/sdk/... path with no matching route shape falls through to the
  // server-wide 404.
  return null;
}
