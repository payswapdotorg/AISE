# @aise/backend-api

AISE HTTP API service — the capture ingestion boundary (capture
gateway) plus the AISE-001 foundation surface.

## Runtime

```bash
npm run dev:api   # from the repository root
```

- Binds `AISE_API_HOST:AISE_API_PORT` (defaults `127.0.0.1:8080`).
- `GET /healthz` — liveness: service identity, environment, uptime.
- `GET /readyz` — readiness, including the capture store kind.
- Fails closed at boot on invalid configuration (exit code 1, structured
  `config.invalid` record).
- SIGINT/SIGTERM → `api.shutdown` → `api.stopped` → exit 0.
- Routing-level errors keep the foundation shapes: unknown paths →
  `404 {"error":"not_found"}`, wrong methods → `405`, wrong media
  types → `415 {"error":"unsupported_media_type"}`.

## Capture ingestion surface (AISE-004, `/v1`)

The gateway receives the finalized AISE-003 v1.0 contracts
(`@aise/shared-contracts`), validates them structurally and
semantically, preserves raw-evidence metadata, enforces idempotent
upload semantics, and maintains capture-session state — **without
becoming the canonical Reality Graph authority** (AISE-011).

| Method & path | Body | Success | Purpose |
| --- | --- | --- | --- |
| `POST /v1/projects` | Project envelope | `201` (identical re-post: `200`) | Register a project identity |
| `GET /v1/projects/{id}` | — | `200` | Read a registered project |
| `POST /v1/sessions` | CaptureSession envelope | `201`/`200` | Register a session under an existing project |
| `GET /v1/sessions/{id}` | — | `200` | Session envelope + ingestion summary |
| `PUT /v1/sessions/{id}` | CaptureSession envelope | `200` | Maintain lifecycle state (forward-only transitions; identity fields immutable) |
| `POST /v1/packages` | CapturePackage manifest | `201`/`200` | Register a manifest (structural + cross-field semantics + linkage) |
| `POST /v1/uploads` | multipart/form-data | `201 ACCEPTED` / `200 DUPLICATE` | One logical upload: `request` part (upload-request JSON envelope, `application/json`) + `payload` part (raw asset bytes) |
| `GET /v1/sessions/{sid}/assets/{aid}` | — | `200` | Asset evidence record (`status: "accepted"` with immutable raw-evidence metadata, or `"declared"`) |

### Ingestion order and idempotency rules (contract invariants)

One logical upload is one single-shot multipart request. The gateway
processes it in this order, failing closed at each step with an
AISE-003 sync-error envelope:

1. **Envelope version dispatch** — cross-MAJOR versions are rejected
   with `CONTRACT_VERSION_UNSUPPORTED` + `details.supportedVersions`;
   newer same-MAJOR minors are read tolerantly (unknown fields
   dropped, v1.0 subset strict-validated);
2. **Envelope schema validation** — writer-strict v1.0 contracts
   (malformed payloads → `400 VALIDATION_FAILED` with
   `details.validationErrors`);
3. **Payload size limit** (`PAYLOAD_TOO_LARGE`, 413);
4. **Session/project linkage** — unknown session → `404
   SESSION_NOT_FOUND`; asset not declared by any registered manifest
   → `404 ASSET_NOT_FOUND`; `part` (multi-part transfer, reserved for
   a future revision) → `400 VALIDATION_FAILED`;
5. **Idempotency key check** (envelope data, before byte
   verification):
   - same key + different declared content hash → `409
     IDEMPOTENCY_CONFLICT`, **never retryable**;
   - same key + same hash but a different logical asset → `409
     IDEMPOTENCY_CONFLICT` (the key is bound to one logical upload);
6. **Manifest consistency** — the upload's declared hash and byteSize
   must equal the manifest entry (`400 VALIDATION_FAILED`);
7. **Byte verification** — payload length must equal the declared
   byteSize (`400`), then the server-computed SHA-256 must equal the
   declared hash (`422 CHECKSUM_MISMATCH`, retryable with
   `retryAfterMs`);
8. **Outcome**:
   - first commit → `201 UploadResult { outcome: "ACCEPTED",
     receivedHash }` and the immutable evidence record is stored;
   - retry with the same key/hash/asset → `200 UploadResult {
     outcome: "DUPLICATE", duplicateOf, receivedHash }` — a success,
     never a second logical asset, never a mutation;
   - a *new* key for an already-committed asset → `200 DUPLICATE`
     identifying the original asset (documented decision below);
   - **a failed upload consumes nothing**: only committed uploads are
     indexed by idempotency key, so a checksum failure leaves the key
     free for a corrected retry.

### Error semantics

Every ingestion failure is an AISE-003 v1.0 `SyncError` envelope
(validated against the schema in tests): `contractVersion`, `code`,
`message`, `retryable`, optional `retryAfterMs` and code-specific
`details`. Retry decisions are data-driven (`retryable` /
`retryAfterMs`), never message parsing. HTTP statuses: `400`
malformed, `404` unknown project/session/asset, `409` conflicts
(idempotency and resource re-registration with different content),
`413` payload too large, `422` checksum mismatch, `500` internal
(retryable).

## Persistence (documented placeholder)

State lives in an **in-memory `CaptureStore`** (create-if-absent
project/session/package registration, idempotency-key and
per-asset-unique upload commits, immutable upload records). It is
process-local and lost on restart. It is explicitly **not** the
canonical Reality Graph and not a second engineering-model authority —
the Reality Graph (AISE-011) remains the only canonical structured
authority. Durable ingestion storage is deferred future work; the
composite store operations are the seam a durable implementation must
preserve.

## Design decisions (flagged for review)

- **Multipart single-request upload encoding** — the gateway's HTTP
  normalization of the v1.0 single-shot transfer: the upload-request
  JSON envelope travels as the `request` part (validated as received
  against the real schema) and the asset bytes as the `payload` part,
  so `UploadResult.receivedHash` (server-computed hash of stored
  bytes) is honest. Architecture §4.2 assigns this normalization to
  the capture gateway.
- **New idempotency key for an already-committed asset → `DUPLICATE`**
  — the contract defines DUPLICATE for the same key + same hash; a
  new key for the same asset is outside that literal rule. The
  gateway answers with a success DUPLICATE identifying the original
  asset rather than inventing a new error code or mutating the
  immutable record: no second logical asset is created and the client
  can reconcile. Strict alternative (reject as conflict) is a one-line
  change if review prefers it.
- **Forward-only session status transitions** and immutable session
  identity fields — "maintain" without ambiguity; backwards
  transitions and identity drift are rejected fail-closed.
- **Resource re-registration**: identical content → `200`
  idempotent; different content → `409 VALIDATION_FAILED` (the
  sync-error vocabulary has no dedicated code for resource
  re-registration conflicts, and `IDEMPOTENCY_CONFLICT` is
  upload-specific).

## Limits (v1.0 constants, injectable in tests)

- JSON envelope bodies: 8 MiB (`413` beyond).
- One asset payload: 128 MiB (`413` beyond), plus 1 MiB multipart
  framing overhead on the wire.
- Known limitation: the body reader drains (without buffering) past
  the cap so clients can complete sends and receive the 413; there is
  no idle-stream timeout in v1.0.

## Known limitations (v1.0)

- In-memory persistence only (see above); no listing endpoints
  (project/session enumerations) — reads are by identity.
- Single-shot uploads only; the `part` descriptor is rejected until
  the resumable contract revision (AISE-006).
- No authentication/authorization yet (error codes are reserved in
  the contract vocabulary).
- Asset bytes are held in memory with the evidence record; durable
  object storage arrives with the persistence work item.
- Upload GET responses expose evidence metadata, never payload bytes.

## Verification

```bash
npm test           # 88 tests: foundation server, contract consumer,
                   # multipart parser units, store/error invariants,
                   # and the full HTTP-level ingestion evidence suite
npm run typecheck  # strict TypeScript, no emit
```

The repository's `npm run verify` includes both. CI runs
`npm run verify` (see the root `README.md` verification contract).
