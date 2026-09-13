# @aise/shared-contracts

Versioned, cross-platform wire contracts for AISE (Work Item AISE-003, SHARED —
ZAI primary / GEMINI secondary).

**TypeScript source of truth + committed JSON Schemas** so the Android client
(and any other non-TypeScript consumer) uses the same shapes without a
TypeScript dependency.

**Data shapes only.** No business logic, no I/O, no client or server behavior,
no readiness thresholds (readiness scoring is AISE-022). No field implies the
device or an engine is an authority. Every epistemic distinction in
`spec/domain-model.md` survives these contracts: `OBSERVED` / `INFERRED` /
`CONFIRMED` / `PROPOSED` statuses, uncertainty separate from confidence,
evidence references, provenance.

## Layout

```text
src/contracts.version.ts   CONTRACT_VERSION + per-family version map
src/common.ts              shared primitives (ids, timestamps, uncertainty,
                           confidence, canonical JSON)
src/errors.ts              typed contract errors
src/codec.ts               decode / decodeStrict / encode engine
src/strictness.ts          strict-mode unknown-key detection (schema walking)
src/capability.ts          DeviceCapabilityProfile, CapabilityDescriptor
src/mission.ts             CaptureMission, CaptureStep, ReferenceControl, EvidenceGap
src/evidence.ts            Evidence, ProvenanceLink, Derivation, EvidenceBundle
src/model.ts               PropertyAssertion, RealityObject, Observation, Measurement
src/sync.ts                CaptureSessionEnvelope, SyncBatch, SyncAck
src/registry.ts            the authoritative wire-object registry
src/index.ts               public API
scripts/generate-schemas.ts  `bun run gen:schemas` (deterministic)
schemas/                   COMMITTED generated JSON Schemas (draft-07) + manifest
fixtures/                  committed test corpus (valid / invalid / version-mismatch)
```

## Contract families and wire objects

| Family | Wire objects |
|---|---|
| `capability` | `CapabilityDescriptor`, `DeviceCapabilityProfile` |
| `mission` | `CaptureMission`, `CaptureStep`, `ReferenceControl`, `EvidenceGap` |
| `evidence` | `Evidence`, `ProvenanceLink`, `Derivation`, `EvidenceBundle` |
| `model` | `PropertyAssertion`, `RealityObject`, `Observation`, `Measurement` |
| `sync` | `CaptureSessionEnvelope`, `SyncBatch`, `SyncAck` |

Every wire object — top-level or embedded — carries a required
`contractVersion` (strict semver). The registry (`src/registry.ts`) is the
authoritative, name-sorted list; `schemas/manifest.json` mirrors it for
non-TypeScript consumers.

## Versioning policy

The package version IS the contract version (`package.json` ==
`CONTRACT_VERSION` == every family version at v1.0.0; asserted by tests).

Bump rules:

- **MAJOR** — any removal, rename, type narrowing, enum-value removal, or
  semantic change to an existing field.
- **MINOR** — additive changes only: new optional fields, new enum values,
  new wire objects, relaxed constraints. Same-major payloads from a newer
  minor MUST remain decodable by older minors (see compatibility policy).
- **PATCH** — documentation/description-only changes.

## Compatibility policy

Decoding (`decodeX`):

1. A `contractVersion` that is a **valid semver with a different major**
   (e.g. `0.9.0`, `2.0.0`) fails fast with a typed
   `ContractVersionMismatchError` — never silently accepted, never coerced.
2. A **same-major** version with any minor/patch/prerelease difference is
   accepted (forward/backward compatibility within a major).
3. A **missing or malformed** `contractVersion` is a schema violation and
   surfaces as `ContractDecodeError` with an issue located at the
   `contractVersion` path.
4. Unknown fields are **preserved** (see below).

Strict decoding (`decodeXStrict`): additionally rejects unknown keys at any
object nesting level (issue code `unrecognized_keys`). Use for canonical
validation in producers and internal pipelines. Open maps (`z.record`
fields, e.g. acquisition metadata and capability details) stay open in both
modes — their keys are data, not schema drift.

Encoding (`encodeX`):

- Stamps `contractVersion` with the family version when the value does not
  carry one.
- Rejects values carrying any other version (`ContractVersionMismatchError`)
  or a non-string version (`ContractEncodeError`) — never silently rewrites.
- Emits **canonical JSON**: recursively sorted object keys (lexicographic,
  UTF-16 code-unit order), 2-space indent, trailing newline. The same value
  always encodes to identical bytes.

### Unknown-field policy (explicit)

Within the same major version, the default decode **preserves** unknown
fields — forward compatibility, and evidence/audit data must never be
silently dropped. Both paths are explicitly tested:

- **Preserve path**: `decodeX` keeps unknown fields at the top level, in
  nested objects and inside array elements, and they survive a full
  encode → parse → decode round trip.
- **Reject path**: `decodeXStrict` throws a typed `ContractDecodeError`
  listing every unknown key path.

## Identity, content addressing and timestamps

- **`ContentId`** — exactly 64 lowercase hex characters (sha-256). The
  normative derivation is the frozen `AISE-CONTENT-V1` canonical encoding
  from the AISE-002 Android foundation (`ContentIdentity.kt`): sha-256 over
  `TAG | len(payload) | payload | count(metadata) | sorted entries`, metadata
  keys sorted by UTF-8 byte sequence. Clients (AISE-005) and the ingestion
  gateway (AISE-004) re-derive it; it is never trusted from the wire.
- **`StableId`** — opaque non-empty string assigned by the owning authority
  (server for missions/model objects; client for sessions/batches).
- **Timestamps** — ISO 8601 UTC, millisecond precision, literal `Z` suffix
  only (`YYYY-MM-DDTHH:MM:SS.sssZ`). Timezone-free by construction.
- **Acquisition metadata** — open `Record<string, string>`. Well-known keys
  (`ACQUISITION_METADATA_KEYS`) match the AISE-002 advisory vocabulary:
  `mission.id`, `session.id`, `device.id`, `capture.kind`,
  `acquisition.sensorId`. Producers may add keys; consumers must preserve
  keys they do not understand.

## JSON Schemas (for Android and other non-TypeScript consumers)

- Generated from the zod source by `bun run gen:schemas` (in this package).
- **Committed** under `schemas/` — one self-contained draft-07 file per wire
  object (no `$ref`/`$defs`) plus `schemas/manifest.json`.
- **Byte-stable**: sorted keys, no timestamps, deterministic order.
  Regeneration on a clean tree produces a zero-byte diff; a bun test guards
  this in CI (`schema-files.test.ts`).
- The wire schemas are **open** (`additionalProperties: true`): unknown
  fields are legal on the wire within the same major version. Schema-level
  validation checks shape; version compatibility is enforced by the codec.

## Fixtures

`fixtures/<family>/<Object>.<kind>.json`:

- `*.valid*.json` — schema-valid and codec-decodable; round-trip tested.
- `*.invalid-*.json` — deliberately schema-invalid (at least 2 per family).
- `*.version-mismatch.json` — schema-valid payloads carrying a cross-major
  `contractVersion`; the codec must reject them with a typed error.

All fixture timestamps and content ids are fixed constants — no clock, no
randomness, no network in tests.

## Consumption

TypeScript (bun workspaces):

```ts
import {
  decodeSyncBatch,
  encodeDeviceCapabilityProfile,
  ContractVersionMismatchError,
} from "@aise/shared-contracts";
```

Android / non-TypeScript: consume `schemas/<family>/<Object>.schema.json`
(files are self-contained draft-07) and `schemas/manifest.json` for
discovery. Field semantics are documented in the schema `description`s and
in this README.

## Non-goals (owned by later work items)

- Client or server implementation of any contract (AISE-004/005).
- Capability detection (AISE-006), mission planning (AISE-007), evidence
  persistence (AISE-008).
- Readiness/assurance evaluation (AISE-022) — contracts carry assurance
  targets as statements and references only.
- Transport, retry policy, chunking, conflict resolution logic (AISE-004/005)
  — the sync shapes only carry the fields those policies need.
