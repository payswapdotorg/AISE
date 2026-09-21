# PROD-016 — Shared client adapter contract: contract artifacts evidence

**Work order:** `docs/productization-work-orders.md` §PROD-016 (SHARED; depends on
PROD-003).
**Governing record:** `spec/governance/architecture-change-record-004.md` (client
adapters over a single AISE product core), bounded by ACR-005/ACR-006.
**Base SHA:** `1068ebbbb5eb9ba9335b8d5a77e28fb04aeb74d2`.
**Contract version shipped:** `ADAPTER_CONTRACT_VERSION = 1.0.0` (the package version
IS the contract version; every family — context, capability, domain, action,
authorization, result — ships it, asserted by `src/version.test.ts`).

## What exists, where

| Artifact | Location | Count |
| --- | --- | --- |
| Contract package | `packages/adapter-contract/` (`@aise/adapter-contract`) | 23 src files (15 modules + 8 test files), 2 scripts |
| TypeScript source of truth (zod) | `src/context.ts`, `src/capability.ts`, `src/negotiation.ts`, `src/domain.ts`, `src/action.ts`, `src/authorization.ts`, `src/result.ts` | 15 wire objects (the twelve semantic objects + `ClientCapabilityProfile`, `TaskCapabilityRequirements`, `CapabilityNegotiation`) |
| Codec engine (decode/decodeStrict/encode) | `src/codec.ts`, `src/errors.ts` | typed `AdapterContractDecodeError` / `AdapterContractEncodeError` / `AdapterContractVersionMismatchError` |
| Capability negotiation | `src/negotiation.ts` — `negotiateCapabilities` (pure), `deriveInteractionModes`, `INTERACTION_MODES` (12 modes) | per-domain `satisfied \| unsupported \| unknown`, overall `permitted \| degraded \| unknown \| blocked` |
| Reference profiles | `src/reference-profiles.ts` — `REFERENCE_PROFILES` (browser, mobile-field, desktop-rich-shell) + 5 reference requirement sets | committed as wire fixtures; byte/test-pinned to the constants |
| Conformance harness | `src/conformance.ts` — `runConformance(binding, corpus)`, `CONFORMANCE_CHECKS` (C0–C9), `AUTHORITATIVE_FIELDS`, `createLosslessBinding` | pure (no I/O); `src/fixtures-loader.ts` is the only fs-touching helper |
| Registry | `src/registry.ts` — name-sorted, drives generation + tests | 15 objects |
| Generated JSON Schemas | `schemas/<family>/<Object>.schema.json` + `schemas/manifest.json` | 16 files, self-contained draft-07, open (`additionalProperties: true`) |
| Fixture corpus | `fixtures/<family>/<Object>.<kind>.json` | 65 files: 27 valid, 30 typed-invalid, 8 version-mismatch |
| Package README | `packages/adapter-contract/README.md` — layout, versioning/compatibility policy, negotiation summary, harness usage, the NO-CLIENT-AUTHORITY invariant | — |
| Spec formalization | `spec/client-adapter-contract.md` — new "Checkable contract artifacts (PROD-016)" section + no-authority enforcement note (existing prose preserved) | — |

Fixture corpus per family (valid + invalid + version-mismatch):

| Family | Files | Invalid | Version-mismatch |
| --- | --- | --- | --- |
| context | 7 | 4 | 1 |
| capability | 24 | 8 | 3 |
| domain | 19 | 12 | 1 |
| action | 5 | 2 | 1 |
| authorization | 5 | 2 | 1 |
| result | 5 | 2 | 1 |

Canonical primitives (semver, ISO-8601 UTC timestamps, stable ids, content ids,
epistemic statuses, capability statuses, gap kinds, canonical JSON, strict-mode
schema walker) are IMPORTED from `@aise/shared-contracts` — one source of truth for
the canonical vocabulary; that package is never modified.

## Exact commands and expected output

All commands run from the repository root unless noted. Deterministic: no network,
no clock, no randomness.

### 1. Regenerate the JSON Schemas

```bash
cd packages/adapter-contract
bun run gen:schemas
```

Expected output (exact):

```text
wrote 16 schema files under schemas/ (15 objects + manifest)
```

Byte-stability: regeneration on a clean tree produces a zero-byte diff
(`git status --porcelain packages/adapter-contract/schemas` is empty); the
byte-stability is additionally guarded in CI by
`packages/adapter-contract/src/schema-files.test.ts`
("regeneration is byte-identical to the committed files").

### 2. Run the package's conformance/contract suite

```bash
cd packages/adapter-contract
bun test
```

Expected summary (exact):

```text
 84 pass
 0 fail
 2257 expect() calls
Ran 84 tests across 8 files.
```

Test files: `version.test.ts`, `registry.test.ts`, `codec.test.ts`,
`fixtures.test.ts`, `schema-files.test.ts`, `negotiation.test.ts`,
`conformance.test.ts`, `authority.test.ts`.

What the suite proves, mapped to the acceptance criteria:

- **Versioned, testable shared adapter contract** — version-map tests
  (package version == `ADAPTER_CONTRACT_VERSION` == every family version),
  codec tests (version gate, typed errors, canonical bytes, unknown-field
  preserve/reject both ways), schema-file tests (byte-stable draft-07
  generation, manifest ↔ registry).
- **All three adapter profiles representable** — negotiation tests assert
  the three reference profiles decode from their committed fixtures and
  derive DIFFERENT honest interaction-mode sets (browser:
  menu-navigation, keyboard-shortcut, table-review, panel-inspection,
  drag-inspect, camera-capture; mobile-field: menu-navigation,
  panel-inspection, drag-inspect, camera-capture, gesture, voice-command,
  scan-control, offline-queue; desktop-rich-shell: menu-navigation,
  keyboard-shortcut, table-review, panel-inspection, drag-inspect,
  window-management, file-workflow, offline-queue).
- **Conformance fixtures cover the required task/result semantics** —
  `fixtures.test.ts` validates every fixture against the committed JSON
  Schemas with ajv AND the TypeScript codecs (valid: schema-valid +
  round-trip deep-equal; invalid: schema-INVALID; version-mismatch:
  schema-valid but codec-rejected with the typed error), including the task
  (`TaskIntent`), capability (`CapabilityDescriptor`,
  `ClientCapabilityProfile`, `TaskCapabilityRequirements`,
  `CapabilityNegotiation`), evidence (`EvidenceSummary`), authorization
  (`AuthorizationContext` valid-granted + valid-denial) and result
  (`OperationResult` valid-succeeded + valid-failed) families.
- **No client-side authority** — `authority.test.ts` (no
  authority-mutating export on the public API surface; authoritative-field
  map complete and schema-real; `TaskIntent`/`TaskCapabilityRequirements`/
  `CapabilityNegotiation` shapes cannot express
  readiness/authorization/sufficiency semantics) and `conformance.test.ts`
  sabotage bindings (dropping/mutating/hiding authoritative fields,
  claiming undeclared interaction modes, swallowing denials/failures/
  blockers each FAIL their specific checks — the discrimination tests for
  the claimed protection).
- **Deterministic negotiation** — the committed `CapabilityNegotiation`
  fixtures are the wire form of `negotiateCapabilities` output over the
  reference profile × requirement pairs; the same inputs always produce
  byte-identical negotiations; inputs are consumed read-only.

### 3. Run the whole-program gate

```bash
bun run verify
```

Expected final lines (exact):

```text
 3573 pass
 0 fail
 58273 expect() calls
Ran 3573 tests across 215 files. [7.38s]
==> boundaries
  scanned 590 source files across apps/, backend/, packages/, tools/
  no cross-zone import violations
VERIFY: PASS
```

3489 baseline tests + **84 new tests** (N = 84) = 3573, 0 fail; typecheck
and lint clean (the gate stops at the first failing step and would not
reach `VERIFY: PASS` otherwise); boundary scan clean — the package imports
only within `packages/` plus bare specifiers (`zod`, `@aise/shared-contracts`,
`node:fs`, `node:path`, `bun:test`, `ajv`, `zod-to-json-schema`).

### 4. Harness consumption (for the PROD-017/019/020 workers)

```ts
import {
  createLosslessBinding, loadCommittedFixtures, runConformance,
  REFERENCE_PROFILES,
} from "@aise/adapter-contract";

const report = runConformance(myPlatformBinding, loadCommittedFixtures());
// report.passed === true  ⇔  contract conformance C0–C9 holds
```

`createLosslessBinding(REFERENCE_PROFILES["browser"])` is the golden
template (passes every check by construction — asserted by tests). Android
(non-TypeScript) consumes `schemas/<family>/<Object>.schema.json` +
`schemas/manifest.json` and mirrors `CONFORMANCE_CHECKS` (C0–C9, exported
as data) against the same committed fixtures — see
`packages/adapter-contract/README.md` §Conformance harness.

## Workspace wiring

- Workspace membership via the existing `packages/*` glob in the root
  `package.json` workspaces (no root-script changes).
- `packages/adapter-contract/package.json`: scripts `test` (bun test) and
  `gen:schemas`; dependencies `@aise/shared-contracts` (workspace:*) and
  `zod` (the established contract stack — no new external dependencies);
  devDependencies `ajv` + `zod-to-json-schema` (same versions
  `@aise/shared-contracts` already uses).
- `bun install` records the workspace linkage in `bun.lock` (14 added
  lines: the `packages/adapter-contract` workspace entry and its lockfile
  registration — required for `bun install --frozen-lockfile` to keep
  working on a fresh clone; the mechanical consequence of wiring the
  package into the monorepo).
- `packages/adapter-contract/tsconfig.json` extends
  `../../tsconfig.base.json` (types: bun; include src + scripts), so the
  root `bun run verify` typecheck step picks the package up automatically.
