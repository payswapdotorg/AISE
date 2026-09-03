# @aise/backend-api

AISE HTTP API service (foundation boundary).

AISE-001 scope: process boundary, request routing shape, structured request
logging, graceful shutdown and health endpoints. **No product endpoints** —
the capture ingestion API arrives with AISE-004 and will extend this service
inside its declared surfaces.

Runtime:

```bash
npm run dev:api   # from the repository root
```

- Binds `AISE_API_HOST:AISE_API_PORT` (defaults `127.0.0.1:8080`).
- `GET /healthz` — liveness: service identity, environment, uptime.
- `GET /readyz` — readiness (foundation: static ready; real dependency
  checks arrive with AISE-004).
- Unknown paths return `404 {"error":"not_found"}`; wrong methods on known
  paths return `405 {"error":"method_not_allowed"}`.
- Fails closed at boot on invalid configuration (exit code 1, structured
  `config.invalid` record).
- SIGINT/SIGTERM → `api.shutdown` → `api.stopped` → exit 0.
