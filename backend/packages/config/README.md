# @aise/backend-config

Typed, fail-closed runtime configuration for AISE backend services.

Principles (AISE-001 foundation):

- Configuration values come **only** from environment variables (optionally
  seeded from a gitignored `.env` file via `loadEnvFileIfPresent()`).
  Secrets never live in source control.
- Required values have no defaults: when a required value is missing or
  invalid, `loadConfig` returns a failure listing **all** problems, and
  callers must exit non-zero (fail closed) instead of guessing.
- Optional values have explicit, documented defaults.

Supported variables:

| Variable | Required | Default | Validation |
|---|---|---|---|
| `AISE_ENV` | yes | — | `development` \| `test` \| `production` |
| `AISE_LOG_LEVEL` | no | `info` | `debug` \| `info` \| `warn` \| `error` |
| `AISE_API_HOST` | no | `127.0.0.1` | non-empty string |
| `AISE_API_PORT` | no | `8080` | integer 1–65535 |
| `AISE_WORKER_POLL_INTERVAL_MS` | no | `1000` | integer 50–600000 |

Unknown `AISE_*` variables are ignored; no logging side effects exist here so
validation stays pure and deterministic.
