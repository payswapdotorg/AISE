export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

/**
 * Foundation job types. Intentionally limited to system-level types with no
 * product semantics; product job types are introduced by their own Work
 * Items (reconstruction, exports, …) together with their contracts.
 */
export type JobType = "system.heartbeat" | "system.noop";

export interface JobRecord {
  readonly id: string;
  readonly type: JobType;
  readonly payload: JsonValue;
  /** ISO-8601 timestamp of enqueue time. */
  readonly enqueuedAt: string;
}
