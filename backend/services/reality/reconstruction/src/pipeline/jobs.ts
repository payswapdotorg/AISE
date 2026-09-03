/**
 * Reconstruction job model (AISE-008).
 *
 * The pipeline's asynchronous unit. Two job types exist in the
 * foundation: preprocessing a session (always available, fully
 * implemented) and running the full reconstruction chain for a
 * session (preprocess → pose → engine → artifacts; requires
 * registered stages and fails closed otherwise).
 *
 * This model is deliberately internal to the reconstruction surface:
 * the AISE-001 `@aise/backend-jobs` package pins its `JobType` to
 * system-level types by design ("product job types are introduced by
 * their own Work Items together with their contracts"), so
 * reconstruction job types live here, behind this surface, until a
 * later SHARED work item unifies the transport.
 */
import type { ReconstructionErrorCode } from "../errors.js";
import type { Timestamp, Uuid } from "@aise/shared-contracts";

export type ReconstructionJobType =
  | "reconstruction.preprocess_session"
  | "reconstruction.reconstruct_session";

export type ReconstructionJobState = "PENDING" | "RUNNING" | "SUCCEEDED" | "FAILED";

export interface ReconstructionJobFailure {
  readonly code: ReconstructionErrorCode;
  readonly message: string;
  readonly retryable: boolean;
}

export interface ReconstructionJobRecord {
  readonly id: Uuid;
  readonly type: ReconstructionJobType;
  readonly sessionId: Uuid;
  readonly state: ReconstructionJobState;
  readonly enqueuedAt: Timestamp;
  readonly startedAt: Timestamp | undefined;
  readonly finishedAt: Timestamp | undefined;
  readonly failure: ReconstructionJobFailure | undefined;
}
