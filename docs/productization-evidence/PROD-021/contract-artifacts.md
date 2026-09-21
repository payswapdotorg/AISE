# PROD-021 — Interactive solution graph and engineering operation contract: contract artifacts evidence

**Work order:** `docs/productization-work-orders.md` §PROD-021 (SHARED;
depends on AISE-026, AISE-027, AISE-028, PROD-016).
**Governing records:** `spec/governance/architecture-change-record-005.md`
(the interactive engineering solution workflow) bounded by ACR-004
(client adapters over one core) and ACR-006 (three-layer hardening).
**Base SHA:** `1068ebbbb5eb9ba9335b8d5a77e28fb04aeb74d2` + Lead overlay v2
(overlay base `f9b7a34c26b23dd51de1adba953d1882126f5953`).
**Contract version shipped:** `SOLUTION_CONTRACT_VERSION = 1.0.0` (the
package version IS the contract version; every family — solution,
operation, state, validation, capability, trace, domain — ships it,
asserted by `src/version.test.ts`).

## What exists, where

| Artifact | Location | Count |
| --- | --- | --- |
| Contract package | `packages/solution-contract/` (`@aise/solution-contract`) | 28 src files (18 modules + 10 test files), 2 scripts |
| TypeScript source of truth (zod) | `src/solution.ts`, `src/operation.ts`, `src/intent.ts`, `src/state.ts`, `src/validation.ts`, `src/capability.ts`, `src/negotiation.ts`, `src/trace.ts`, `src/domain.ts` | 14 wire objects (the 10 work-order-named graph/trace objects + `EngineeringOperationIntent`, `OperationCapabilityProfile`, `OperationCapabilityNegotiation`, `SolutionDomainDescriptor`) |
| Codec engine (decode/decodeStrict/encode) | `src/codec.ts`, `src/errors.ts` | typed `SolutionContractDecodeError` / `SolutionContractEncodeError` / `SolutionContractVersionMismatchError` / `SolutionContractLifecycleError` |
| Lifecycle state machine | `src/lifecycle.ts` — the governed transition table + `assertSolutionLifecycleTransition` | draft → validated \| superseded \| abandoned; validated → superseded \| abandoned; superseded/abandoned terminal |
| Deterministic identities | `src/identity.ts` — `deriveEngineeringOperationId`, `deriveProposedStateId`, `deriveValidationSnapshotId`, `deriveSolutionBoqLineTraceId` | sha-256 over canonical JSON of curated semantic projections; provenance/timestamps/contractVersion EXCLUDED |
| Cross-field invariants | `src/invariants.ts` — 17 typed invariant codes + per-object checkers + `checkSolutionContractObject` dispatcher | units, anchoring, provenance, dependencies, state/version consistency, snapshot worst-of, trace pinning, capability uniqueness |
| Operation capability negotiation | `src/negotiation.ts` — `negotiateOperationCapability` (pure) | outcomes `executable \| blocked \| unsupported \| unknown`, 9 honest reason codes, `missingParameters` (the agent's clarification driver) |
| Bidirectional BOQ traces | `src/trace.ts` — `SolutionBoqLineTrace`, `SolutionBoqTraceSet`, `resolveOperationsForLine`, `resolveLinesForOperation`, `findContribution` | both directions + closed round trip |
| Reference constants | `src/domain.ts` (`REFERENCE_BUILDING_DOMAIN`, `BUILDING_OPERATION_TYPES`, `BUILDING_OPERATION_CATEGORIES`), `src/capability.ts` (`REFERENCE_BUILDING_OPERATION_PROFILE`, `REFERENCE_PARTIAL_BUILDING_OPERATION_PROFILE`) | Phase 1 building vertical, 10 operation types across 6 categories, 2 reference engine profiles |
| Registry | `src/registry.ts` — name-sorted, drives generation + tests | 14 objects |
| Generated JSON Schemas | `schemas/<family>/<Object>.schema.json` + `schemas/manifest.json` | 15 files, self-contained draft-07, open (`additionalProperties: true`), proposal seals as `const: "PROPOSED"` |
| Fixture corpus | `fixtures/<family>/<Object>.<kind>.json` | 86 files: 43 valid, 29 typed-invalid, 14 version-mismatch |
| Package README | `packages/solution-contract/README.md` — layout, versioning/compatibility policy, one-constructor-two-origins, lifecycle, negotiation, trace rules, extensibility path, the NO-MUTATION-PATH-for-authoritative-reality invariant | — |
| Spec formalization | `spec/solution-operation-contract.md` (NEW — explicitly assigned to PROD-021) — object inventory, lifecycle state machine, negotiation rules, BOQ trace identity rules, extensibility path, the package as checkable artifact set | — |

Fixture corpus per family (valid + invalid + version-mismatch):

| Family | Files | Valid | Invalid | Version-mismatch |
| --- | --- | --- | --- | --- |
| solution | 10 | 4 | 4 | 2 |
| operation | 38 | 22 | 11 | 5 |
| state | 5 | 2 | 2 | 1 |
| validation | 5 | 2 | 2 | 1 |
| capability | 14 | 8 | 4 | 2 |
| trace | 10 | 4 | 4 | 2 |
| domain | 4 | 1 | 2 | 1 |

Canonical primitives (semver, ISO-8601 UTC timestamps, stable ids, content
ids, uncertainty, canonical JSON, the strict-mode schema walker, capability
statuses) are IMPORTED from `@aise/shared-contracts` — one source of truth
for the canonical vocabulary across contract packages; that package is
never modified. The package imports nothing from `apps/`, `backend/` or
root scripts (the boundary scanner confirms: `packages/ -> packages/` only,
plus bare specifiers).

## Exact commands and expected output

All commands run from the repository root unless noted. Deterministic: no
network, no clock, no randomness.

### 1. Regenerate the JSON Schemas

```bash
cd packages/solution-contract
bun run gen:schemas
```

Expected output (exact):

```text
wrote 15 schema files under schemas/ (14 objects + manifest)
```

Byte-stability: regeneration on a clean tree produces a zero-byte diff
(the committed files are rewritten with identical bytes); the
byte-stability is additionally guarded by
`packages/solution-contract/src/schema-files.test.ts`
("regeneration is byte-identical to the committed files").

### 2. Run the package's contract suite

```bash
cd packages/solution-contract
bun test
```

Expected summary (exact):

```text
 141 pass
 0 fail
 3310 expect() calls
Ran 141 tests across 10 files.
```

The 141 tests (10 files) cover: version map + object catalogues (6),
codec behavior — version gate, unknown-field policy, canonical bytes,
round-trip over every valid fixture (14), the governed lifecycle (11),
deterministic identities incl. the direct-vs-agent equivalence proof (19),
cross-field invariants incl. the corpus guarantee (21), operation
capability negotiation (17), bidirectional BOQ traces (16),
no-authority negatives (12), committed fixtures vs committed JSON Schemas
(ajv) + codecs + invariants + building-operation coverage (17), and
byte-stable schema artifacts (9).

### 3. The full deterministic gate

```bash
bun run verify
```

Expected summary lines (exact; N = 141 new tests):

```text
 3715 pass
 0 fail
 61617 expect() calls
Ran 3715 tests across 225 files.
==> boundaries
  scanned 620 source files across apps/, backend/, packages/, tools/
  no cross-zone import violations
VERIFY: PASS
```

(3715 = 3574 baseline + 141 new; typecheck and lint steps pass clean.)

## Acceptance mapping

- **same operation intent via direct manipulation or agent** — one
  constructor surface (`createOperationIntent`), two provenance origins;
  the committed pair
  `fixtures/operation/EngineeringOperationIntent.valid-excavation-direct.json`
  / `...valid-excavation-agent.json` carries identical semantics with
  different provenance, and `identity.test.ts` proves both origins derive
  the SAME `operationId` (provenance is excluded from the identity
  projection by design).
- **deterministic identity/parameters/units/target/provenance/version** —
  `src/identity.ts` derivations + `identity.test.ts` (determinism,
  discrimination, exclusion proofs, and re-derivation of every recorded id
  from the decoded fixtures); typed units (schema + the
  `numeric_parameter_without_unit` invariant); anchored targets; required
  provenance; version context in every identity.
- **proposed state separate from observed reality** — the literal
  `"PROPOSED"` seals on `ProposedState.epistemicStatus` and
  `Solution.epistemicClass` (schema-level; committed `invalid-epistemic`
  fixtures are rejected), read-only `baselineRealityVersionId` pins, and
  the no-mutation-path authority tests (`authority.test.ts`).
- **extensible beyond buildings without client authority** — open
  `vertical`/`operationType` wire vocabularies behind
  `SolutionDomainDescriptor`; the committed `valid-future-vertical-mep.json`
  intent decodes and negotiates to an honest explicit `unsupported`
  (`negotiation.test.ts`); `BUILDING_OPERATION_TYPES` is engine-owned
  reference data, asserted against the reference profile.
- **BOQ traces bidirectional + version-pinned** —
  `resolveOperationsForLine` / `resolveLinesForOperation` with the closed
  round trip over the committed trace set (`trace.test.ts`); version pins
  (schema-required fields + the `trace_set_version_pin_mismatch` /
  snapshot-pin invariants + `deriveSolutionBoqLineTraceId` version
  discrimination).

## Deviations / notes

- The packet's §4.4 names "executable / unsupported / blocked" outcomes;
  the shipped vocabulary is `executable | blocked | unsupported | unknown`
  because the packet ALSO mandates following the adapter-contract's
  negotiation honesty rules, whose frozen discipline is that an
  UNDETERMINED capability must never be conflated with a definitive
  refusal. The `unknown` outcome carries that rule (documented in the
  package README and in `spec/solution-operation-contract.md`); the three
  packet-named outcomes are unchanged in meaning.
- Cross-field invariants ship as typed checker functions
  (`src/invariants.ts`) rather than zod refinements, following the
  repo's contract-package discipline of plain `.passthrough()` wire
  schemas (the shared strict-decode schema walker supports ZodObject /
  ZodArray / optional only — refinements would silently disable strict
  mode). This mirrors the intervention model's boundary-parser approach.
