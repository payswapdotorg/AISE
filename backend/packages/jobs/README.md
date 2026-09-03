# @aise/backend-jobs

Background job boundary for AISE backend services.

AISE-001 scope: define the **process/authority boundary** between the API
service and background processing, with no product-domain semantics.

- `JobQueue` is the boundary interface. `InMemoryJobQueue` is the foundation
  placeholder transport (single-process, in-memory). A durable, cross-process
  transport is intentionally deferred until capture ingestion exists
  (AISE-004 and later); swapping it in must not change worker semantics.
- `createWorker` runs a poll-execute loop with graceful, idempotent
  shutdown, per-job error isolation, and structured job lifecycle logs
  (`job.started` / `job.completed` / `job.failed` / `job.no_handler`).
- Foundation job types are limited to system-level types
  (`system.heartbeat`, `system.noop`). Product job types (reconstruction,
  exports, …) arrive with their own Work Items and must not be added here
  ad hoc.
- The worker has no product authority: it executes handlers it is given and
  never becomes a source of engineering truth.
