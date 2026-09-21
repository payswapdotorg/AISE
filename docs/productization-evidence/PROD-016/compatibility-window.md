# PROD-016 — Compatibility-window ruling

## The ruling

**From the merge of PROD-016, adapter workers must not change the shared
semantic contract without a new governed SHARED Work Item.**

The shared semantic contract is the versioned, checkable artifact set owned
by `packages/adapter-contract/` (`@aise/adapter-contract`,
`ADAPTER_CONTRACT_VERSION = 1.0.0`) together with the prose contract it
formalizes (`spec/client-adapter-contract.md`):

- the twelve semantic objects (`ProjectContext`, `TaskIntent`,
  `CapabilityDescriptor`, `EvidenceSummary`, `RealitySummary`, `BOQContext`,
  `EngineeringCaseSummary`, `InterventionScenarioSummary`, `OutcomeSummary`,
  `NextBestAction`, `AuthorizationContext`, `OperationResult`) and the three
  capability-negotiation objects (`ClientCapabilityProfile`,
  `TaskCapabilityRequirements`, `CapabilityNegotiation`);
- their zod source of truth, committed draft-07 JSON Schemas + manifest, and
  committed fixture corpus;
- the capability negotiation semantics (domain outcomes
  `satisfied | unsupported | unknown`; overall outcomes
  `permitted | degraded | unknown | blocked`; the interaction-mode
  derivation; the blocked-tasks-permit-no-modes rule; the never-lower-the-
  assurance invariant);
- the conformance harness check catalogue (`CONFORMANCE_CHECKS`, C0–C9) and
  the authoritative-field map (`AUTHORITATIVE_FIELDS`);
- the no-client-authority invariant the package enforces structurally.

## Why

This is the mechanism that lets PROD-017 (`apps/web/**`), PROD-019
(`apps/android/**`) and PROD-020 (`apps/desktop/**`) run CONCURRENTLY
without shared-file contention (the adapter wave's disjoint-surface
partition, `docs/productization-work-orders.md` "Cross-item composition and
branch-safety rules"): the three workers consume one frozen semantic
boundary and may not edit it. "They must not modify shared contract files
after PROD-016 merges. A discovered shared-contract defect is escalated to
the Tech Lead as a new shared work item."

## What adapter workers MAY still do without a shared Work Item

Everything inside their own protected surface, including:

- implementing platform bindings and passing `runConformance` (C0–C9);
- declaring their own honest `ClientCapabilityProfile` (facts about their
  platform — open `adapterKind` vocabulary, own details/limitations);
- rendering the semantic objects with any platform-appropriate controls;
- defining presentation vocabularies, navigation, offline behavior and
  platform affordances (ACR-004 client responsibilities);
- adding adapter-LOCAL tests, including platform-specific conformance for
  the 12-item client conformance suite of `spec/client-adapter-contract.md`;
- consuming the contract at any same-major version (additive minors are
  decodable by older consumers within the major).

## What requires a new governed SHARED Work Item

Any change to the shared semantic contract enumerated above, including:

- adding, removing, renaming or re-typing a field of any contract object;
- adding or removing a wire object, family, enum value or interaction mode;
- changing the negotiation semantics (orderings, outcome models, mode
  derivation, blocking rules);
- changing the conformance check catalogue or the authoritative-field map
  in a way that alters what adapters must preserve;
- changing the versioning/compatibility policy or bumping the major
  version.

Version bumps follow the package's documented policy (MAJOR for any
removal/rename/narrowing/semantic change; MINOR for additive-only; PATCH
for documentation) — and every bump of the shared contract, of ANY size, is
a governed change that goes through a SHARED work item, not an adapter
branch.

## How to request one

1. **Stop and escalate** — do not prototype the change inside an adapter
   branch. The worker records the defect/need (file, object, field, the
   semantic problem) and reports it to the Tech Lead as a governed finding,
   per `spec/agent-ownership.md` (SHARED is "used only where a change must
   atomically span client and server contracts… Every shared item names
   primary/secondary agent and exact files/interfaces") and
   `spec/development-protocol.md` §7 (workers stop and raise a record for
   changes to authority boundaries or epistemic semantics).
2. **Tech Lead triage** — the Tech Lead decides whether the finding is a
   contract defect (new SHARED work item), an adapter-local presentation
   concern (stays in the adapter item), or an architecture change
   (Architecture Change Record per `spec/governance/` — e.g. if a client
   would need to own canonical engineering state, ACR-004's stop condition
   applies).
3. **New SHARED work item** — authored as a section in
   `docs/productization-work-orders.md` naming: owner SHARED, the exact
   files/interfaces (`packages/adapter-contract/**`, the spec, the fixtures
   and schemas), the version bump class (MAJOR/MINOR/PATCH), the required
   evidence (contract schema/fixtures + conformance suite + compatibility
   notes, mirroring PROD-016's evidence obligations), and the adapter
   workers' migration steps.
4. **Merge order** — the shared item merges BEFORE any adapter item that
   depends on the new semantics; the three adapter surfaces stay disjoint
   throughout (the same wave protocol as `spec/development-protocol.md` §3).

## Standing constraints the window preserves

- The Assurance Engine stays the only task-readiness authority;
  `RealitySummary.readinessStatus` is carried opaque and read-only.
- Authorization stays server-provided; `AuthorizationContext` denials must
  always be surfaced, never locally overridden.
- Intervention/solution states remain proposals until post-execution
  evidence; `InterventionScenarioSummary.epistemicState` preserves the
  frozen epistemic vocabulary.
- Capability negotiation never changes the assurance requirement — device
  capability changes capture method, operator burden and escalation, never
  the truth standard.
- `UNKNOWN`/`unknown` is never conflated with absence or `unavailable` at
  any contract boundary.
