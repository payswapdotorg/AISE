# @aise/shared-contracts — AISE-003 shared contract package

Versioned, machine-readable interchange contracts used by the Android
field app (Gemini) and Z.ai-owned web/cloud services. This package is
the **only** initial bilateral integration surface between the two
platforms (`spec/work-orders/AISE-003.md`).

## Ownership declaration

- **Work item:** AISE-003 — Shared contracts between Android and Web/Cloud
- **Owner:** SHARED — primary **ZAI**, secondary **GEMINI**
- **Implemented contract version:** 1.0
- **Z.ai defines semantic contract changes.** Gemini confirms Android
  viability and implements only the Android consumer side.
- Any bilateral implementation change requires an explicit
  coordination record.

## Authority boundaries (non-negotiable)

- Contracts describe **interchange semantics only**. They do not
  become the canonical database, Reality Graph, or engineering-model
  authority (`spec/architecture-lock.md` §1).
- No platform-specific business logic lives in this package
  (`spec/architecture-lock.md` §4: device-specific sensing stays
  behind device adapters; canonical project data is device-neutral).
- Raw captures are immutable evidence artifacts; derived model
  versions are versioned and prior versions remain discoverable
  (`spec/architecture-lock.md` §2).

## Contract inventory (v1.0)

| Contract area (work order) | Schema | Fixtures |
| --- | --- | --- |
| Project/capture-session identity | `contracts/project.schema.json`, `contracts/capture-session.schema.json` | `project.full.json`, `capture-session.full.json`, `capture-session.minimal.json` |
| Capture asset/package manifest | `contracts/capture-package.schema.json` | `capture-package.full.json` |
| Acquisition metadata | `contracts/capture-package.schema.json` (`$defs/acquisitionMetadata`) | embedded in `capture-package.full.json` |
| Upload/idempotency semantics | `contracts/upload-request.schema.json`, `contracts/upload-result.schema.json` | `upload-request.json`, `upload-result.accepted.json`, `upload-result.duplicate.json` |
| Synchronization error semantics | `contracts/sync-error.schema.json` | `sync-error.retryable.json`, `sync-error.fatal.json`, `sync-error.version-unsupported.json` |
| Model/version identifiers | `contracts/model-version.schema.json` | `model-version.full.json`, `model-object-ref.json` |
| Common epistemic-state vocabulary | `contracts/common.schema.json` (`$defs/epistemicState`, `$defs/observationPresence`) | `evidence-vocabulary.json` |
| Measurement/confidence/uncertainty transport fields | `contracts/common.schema.json` (`$defs/measurement`, `$defs/uncertainty`, `$defs/confidence`) | `measurement.transport.full.json`, `measurement.transport.estimate.json` |
| Compatibility/versioning rules | `src/versions.ts`, `src/compat.ts` + this README | exercised by `src/compatibility.test.ts` |

Schemas are JSON Schema **draft 2020-12** documents with stable `$id`s
under `https://contracts.aise.example/1.0/`. Every envelope carries
`contractVersion: "1.0"`.

The last three fixture rows are **fragments**: they validate against
`$defs` inside `common.schema.json` rather than a standalone envelope
schema, because epistemic marks and measurements travel inside larger
assertion payloads defined by later work items (Reality Graph,
engineering model).

## Semantic rules encoded by the contracts

- **Epistemic states** are exactly `OBSERVED`, `INFERRED`,
  `CONFIRMED`, `PROPOSED`; observation presence is exactly `UNKNOWN`,
  `NOT_OBSERVED`, `OCCLUDED`. There is deliberately **no**
  `CONFIRMED_ABSENT` value — absence must never be encoded as
  confirmed fact (architecture-lock §2).
- **Confidence ≠ uncertainty.** `confidence` is a 0..1 model
  probability; `uncertainty` is a metrological ± with unit and
  interpretation. One can never substitute for the other
  (requirements REQ-008).
- **Measurements vs estimates are distinct** (`kind`), so an
  estimate can never silently pose as a measurement
  (architecture-lock §3).
- **Idempotency:** one `idempotencyKey` per logical upload, reused
  across retries. Same key + same `contentHash` → outcome `DUPLICATE`
  (success, no second logical asset). Same key + different hash →
  `IDEMPOTENCY_CONFLICT` (halt, not retry) — interrupted
  synchronization resumes without duplicating logical capture assets
  (requirements AC-012).
- **Retryability is data:** the sync-error `retryable` flag and
  `retryAfterMs` drive client retry decisions; clients must not
  parse `message` or switch on `code` to decide retries.
- **Model versions** are monotonic per `modelId`; `parentVersion`
  records lineage; object identity (`objectId`) is stable within one
  model version (requirements AC-042).
- **Device-neutral acquisition metadata:** `deviceRef`/`sensorRef`
  are opaque strings; no platform-specific fields exist in the
  contracts.

## Versioning and compatibility rules (explicit)

Contract versions are **MAJOR.MINOR** strings (for example `1.0`,
`1.1`, `2.0`).

**MINOR (additive, backward compatible):** adding optional fields,
adding enum values, adding error codes, loosening constraints.

**MAJOR (breaking):** removing or renaming a field, adding a required
field, changing a type, removing an enum value, tightening a
constraint, or changing the semantics of an existing field.

**Writer obligations:**

- Emit only fields defined by the version declared in
  `contractVersion`.
- Schemas are writer-strict (`additionalProperties: false`): typos
  and smuggled fields fail validation.

**Reader obligations:**

- Dispatch on `contractVersion` before deep parsing
  (`readContractVersion`).
- Never consume a payload from a different MAJOR version; reject with
  `CONTRACT_VERSION_UNSUPPORTED` and advertise
  `details.supportedVersions`.
- Inside one MAJOR, tolerate **newer-MINOR** payloads: ignore
  unrecognized fields (`stripUnknownFields`) and treat unrecognized
  enum values as `unknown` (`tolerateEnumValue`) — never map an
  unknown value onto an existing one.
- Derive retry behaviour from error data (`syncRetryDecision`), not
  from code strings.

These rules are implemented in `src/versions.ts` and `src/compat.ts`
and enforced by `src/compatibility.test.ts`, including simulated
newer-MINOR payloads (unknown field / unknown enum value) and
breaking-change detection.

## Formats

`uuid` and `date-time` are validated by the reference regular
expressions in `src/validate.ts` (RFC 4122 and RFC 3339
respectively). Any platform validating these schemas must apply
equivalent semantics. `contentHash` is constrained by pattern to
lowercase SHA-256 hex.

## Consumption

### Z.ai backend / web (TypeScript)

```ts
import {
  validateCapturePackage,
  checkCapturePackageSemantics,
  type CapturePackage,
} from "@aise/shared-contracts";

const payload: unknown = /* received JSON */;
const outcome = validateCapturePackage(payload);
if (outcome.ok) {
  const issues = checkCapturePackageSemantics(payload as CapturePackage);
  // issues is empty when cross-field invariants hold
}
```

The backend consumer test lives at
`backend/services/api/src/contract-consumer.test.ts` (explicitly
assigned by the work order).

### Android (Kotlin / Gemini)

The `contracts/` and `fixtures/` directories are language-neutral
JSON files — read them directly from the repository (or generated
artifacts of this package):

1. Validate the representative fixtures against the schemas with any
   draft 2020-12 implementation, or mirror the field checks in unit
   tests (the schema constraints are enumerated in
   `src/contracts.test.ts` as the reference negative cases).
2. Map enums with an unknown-value fallback: a future MINOR version
   may add enum values; map unrecognized values to an internal
   `unknown` state, never to a default member.
3. Convert timestamps (RFC 3339 strings here) freely to local
   representations; identifiers remain opaque strings.
4. Report Android viability against the exact fixture set as the
   Gemini-side validation record for AISE-003.

## Verification

Run inside this package (or via the repository root):

```bash
npm test            # 62 tests: fixtures, typed literals, negative cases, semantics
npm run typecheck   # strict TypeScript, no emit
```

The repository's `npm run verify` includes both. CI runs
`npm run verify` (see the root `README.md` verification contract).

## Known limitations (v1.0)

- Upload semantics are single-shot; resumable multi-part transfer is
  reserved for AISE-006 via the optional `part` object.
- Error codes cover synchronization between field client and capture
  gateway; client-local states (offline queue, storage pressure) are
  deliberately out of contract scope.
- Measurement transport covers scalar quantities with units;
  vector/geometric measurement transport arrives with the Reality
  Graph work items.
- Object identity is stable within a model version only; cross-version
  object stability is not promised by v1.0.
