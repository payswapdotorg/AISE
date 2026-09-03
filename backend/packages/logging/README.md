# @aise/backend-logging

Structured logging for AISE backend services.

Foundation contract (AISE-001):

- One JSON object per line on stdout: `ts`, `level`, `msg`, optional `module`
  plus caller-provided fields.
- Log levels `debug | info | warn | error`; records below the configured
  threshold are not emitted.
- Values whose field name looks secret-like (`password`, `secret`, `token`,
  `authorization`, `credential`, `api key`, `private key`, …) are redacted to
  `[REDACTED]` at every nesting depth before serialisation — logging must
  never become a secret-leak channel.
- `ts`/`level`/`msg`/`module` are reserved keys and win over caller fields.
- Unserialisable field values (e.g. circular structures) degrade to a
  `log_failure` marker line instead of crashing the service.
- `sink` and `now` are injectable so tests are fully deterministic.

This package has no dependencies and no configuration coupling: it is safe
to use before configuration has been validated (bootstrap errors are still
structured).
