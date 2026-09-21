# AISE Client Adapter Contract

## Purpose

Define one platform-neutral contract for the browser, mobile and desktop adapters.

Clients are not separate AISE products and must not duplicate domain semantics. They adapt the shared task/capability contract to platform-specific input/output affordances.

## Checkable contract artifacts (PROD-016)

This prose contract is formalized as a **versioned, testable contract
package**: `packages/adapter-contract/` (`@aise/adapter-contract`).

- **Contract version:** `ADAPTER_CONTRACT_VERSION = 1.0.0` (the package
  version IS the contract version; every contract family — context,
  capability, domain, action, authorization, result — ships it; asserted
  by tests).
- **The twelve semantic objects** named below (plus the three
  capability-negotiation objects `ClientCapabilityProfile`,
  `TaskCapabilityRequirements`, `CapabilityNegotiation`) are versioned,
  checkable wire objects: zod schemas as the TypeScript source of truth,
  committed self-contained draft-07 JSON Schemas under
  `packages/adapter-contract/schemas/` with a manifest for non-TypeScript
  consumers (Android), and a committed fixture corpus (valid /
  typed-invalid / version-mismatch per object family).
- **Capability negotiation:** a platform-neutral `ClientCapabilityProfile`
  (screen, input, sensors, camera/depth, offline storage, notifications,
  deep links — all seven domains required, `unknown` never conflated with
  `unavailable`) plus a server-owned `TaskCapabilityRequirements` set map
  through the pure `negotiateCapabilities` function to permitted
  interaction modes and explicit per-domain `satisfied | unsupported |
  unknown` outcomes with an overall `permitted | degraded | unknown |
  blocked` verdict. A blocked task permits NO interaction modes — the
  adapter must render the explicit blocked reason. The three reference
  profiles (`browser`, `mobile-field`, `desktop-rich-shell`) are
  representable through the same contract and negotiate to different,
  honest capability sets. Negotiation changes capture method, operator
  burden and escalation — never the assurance requirement.
- **Conformance harness:** adapter workers (PROD-017/019/020) call
  `runConformance(adapterBinding, corpus)` with their platform binding
  (emission, presented fields, supported interaction modes, declared
  profile) to prove they render/round-trip the semantic objects without
  reinterpreting authoritative fields. The stable check catalogue is
  exported as data (`CONFORMANCE_CHECKS`, C0–C9: corpus completeness,
  profile validity, lossless round-trip, canonical wire bytes,
  required-field presentation, authoritative-field presentation, honest
  interaction modes, denial/failure/blocked-action surfacing).
  `createLosslessBinding(profile)` is the golden template.
- **No client authority:** authoritative fields are carried opaque and
  read-only (`AUTHORITATIVE_FIELDS`); the package exposes no mutation path
  for authoritative state; the only client-authored objects are
  `TaskIntent` (intent, not authority) and the client's own capability
  declarations (honest facts). This invariant is documented and
  discrimination-tested (sabotage bindings fail explicit checks).
- **Regeneration / tests:** `cd packages/adapter-contract && bun run
  gen:schemas` regenerates the committed schemas byte-identically;
  `bun test` runs the package's suite; the root `bun run verify` gate
  picks the package up automatically.
- **Compatibility window:** from the PROD-016 merge, adapter workers must
  not change this shared semantic contract without a new governed SHARED
  work item — see
  `docs/productization-evidence/PROD-016/compatibility-window.md`.

## Core contract

Every adapter consumes and emits the same semantic objects:

```text
ProjectContext
TaskIntent
CapabilityDescriptor
EvidenceSummary
RealitySummary
BOQContext
EngineeringCaseSummary
InterventionScenarioSummary
OutcomeSummary
NextBestAction
AuthorizationContext
OperationResult
```

The client may choose how to present these objects but may not reinterpret authoritative fields.

## Task-first interaction

The primary interaction model is:

```text
Task intent
  ↓
Current context
  ↓
Known evidence
  ↓
Evidence gaps / blockers
  ↓
Next best action
  ↓
User action
  ↓
Server-authoritative result
```

The adapter should not expose internal service/module boundaries as the primary navigation model.

## Platform profiles

### Browser

Optimize for project-wide inspection, collaboration, BOQ/reality analysis, comparisons, review, intervention planning and administration.

### Mobile

Optimize for field capture, guided missions, immediate issue creation, offline operation and rapid evidence submission. Native camera/depth/LiDAR/sensor APIs are permitted.

### Desktop

Optimize for high-density review, large-file workflows, multi-window use and optional local integration/file-system affordances. A desktop implementation may be a wrapper around the same web/application contracts.

## Shared invariants

All adapters must preserve:

- epistemic state;
- evidence provenance;
- uncertainty;
- authorization decisions;
- proposal-versus-observation distinction;
- version identity;
- source-of-record identity;
- provider identity where exposed;
- deterministic operation semantics.

## Responsive/interaction equivalence

Equivalent tasks may use different controls:

```text
Browser:     menus, keyboard, table, panels, drag/inspect
Desktop:     windows, keyboard shortcuts, files, panels
Mobile:      camera, gestures, voice, scan controls, offline queue
```

They must resolve to the same domain action contract.

## Client conformance suite

For each adapter, test:

1. project open/create;
2. task selection;
3. evidence inspection;
4. next-best-action rendering;
5. evidence submission;
6. BOQ item inspection;
7. Engineering Case inspection/update;
8. intervention state inspection;
9. outcome comparison;
10. authorization denial;
11. unavailable provider/failure state;
12. offline/resume where supported.

A client passes conformance only when it demonstrates semantic equivalence and does not create a second authority.

## No client authority

The client must never decide:

- whether a measurement is authoritative;
- whether evidence is sufficient;
- whether an intervention is approved;
- whether an external source is superseded;
- whether a provider result is engineering-ready;
- whether a user is authorized beyond server-provided authorization results.

The contract package enforces this structurally: authoritative fields are
carried opaque/read-only (`AUTHORITATIVE_FIELDS` in
`packages/adapter-contract/src/conformance.ts`), the package exposes no
mutation path for authoritative state, and the conformance harness fails
any binding that drops, mutates or hides authoritative fields.
