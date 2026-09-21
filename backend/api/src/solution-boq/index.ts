/**
 * PROD-025 — Solution BOQ public surface.
 *
 * Consumers (server.ts at the integration station, future adapter
 * surfaces, developer tooling) import from HERE only. The module is a
 * transport adapter over the `@aise/solution-boq` package: model
 * (request/response shapes, typed error registry, boundary parsers) +
 * service (thin deterministic orchestration) + router (the PURE route
 * factory — not mounted; the Tech Lead wires it in server.ts).
 *
 * THE RECORD-KEEPER BOUNDARY, restated at the surface: this module has NO
 * write path into any source BOQ store — the generated BOQ is a separate
 * derived projection referencing a source BOQ by identity only (see
 * source-distinction.test.ts for the non-overwrite proof).
 */

export {
  SOLUTION_BOQ_SERVICE_ERROR_CODES,
  SolutionBoqServiceError,
  parseGenerateBoqRequest,
  parseLineOperationsRequest,
  parseOperationLinesRequest,
  parseReadbackBoqRequest,
  type GenerateBoqRequest,
  type GenerateBoqResponse,
  type LineOperationsRequest,
  type LineOperationsResponse,
  type OperationLinesRequest,
  type OperationLinesResponse,
  type ReadbackBoqRequest,
  type ReadbackBoqResponse,
  type SolutionBoqServiceErrorCode,
} from "./model";
export { SolutionBoqService } from "./service";
export { handleSolutionBoqRequest, type SolutionBoqRouteOptions } from "./router";
