# @aise/backend-worker

AISE background worker process (foundation boundary).

AISE-001 scope: a **separate process** from the API service that shares only
the `@aise/backend-jobs` boundary. It exists so that long-running/reality
processing can later live outside the request path without any product
authority being introduced at foundation time.

Runtime:

```bash
npm run dev:worker   # from the repository root
```

- Loads configuration with the same fail-closed rules as the API service.
- Polls the job queue at `AISE_WORKER_POLL_INTERVAL_MS` (default 1000 ms).
- Foundation handlers: `system.heartbeat` (logs a heartbeat) and
  `system.noop`. Product job types arrive with their own Work Items.
- The queue transport is in-memory at foundation time, so the standalone
  process idles by design; the durable transport arrives with AISE-004+.
- SIGINT/SIGTERM → `worker.shutdown` → `worker.stopped` → exit 0.
