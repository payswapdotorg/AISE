/**
 * Provider execution gateway (PROD-009) — public surface.
 *
 * Barrel over the gateway's provider-neutral modules: the type/model layer,
 * the deterministic service core and the execution record store. The
 * testkit (`gateway/testkit.ts`) is TEST SUPPORT ONLY and is deliberately
 * NOT exported here — production modules must never import it.
 */

export {
  EXECUTION_STATUSES,
  GENERATED_COMPLETION_LABEL,
  TERMINAL_EXECUTION_STATUSES,
  decodeExecutionRequest,
  isGeneratedCompletionLabel,
  isTerminalExecutionStatus,
} from "./model";
export type {
  ExecutionEvent,
  ExecutionGatewayOutcome,
  ExecutionProvenance,
  ExecutionRecord,
  ExecutionRequest,
  ExecutionRequestDecode,
  ExecutionResult,
  ExecutionStatus,
  GeneratedCompletionLabel,
} from "./model";
export {
  ExecutionGatewayError,
  createExecutionGateway,
  outcomeOfExecution,
} from "./service";
export type {
  ExecutionGateway,
  ExecutionGatewayDeps,
  ExecutionGatewayErrorCode,
} from "./service";
export { FsExecutionStore, InMemoryExecutionStore, ExecutionStoreError } from "./store";
export type { ExecutionStore, ExecutionStoreErrorCode } from "./store";
