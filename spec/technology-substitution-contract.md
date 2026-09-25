# AISE Technology Substitution Contract

**Status:** BINDING (materialized by PROD-033 from FROZEN sources — this file
transcribes law that was already frozen in the documents below; it invents no
policy. Every section cites its source. Any conflict between this file and a
cited frozen source is resolved in favor of the frozen source, and the conflict
must be reported as a defect in THIS file.)

**Sources (frozen):**
`spec/architecture-lock.md` (v2.2 baseline),
`spec/governance/architecture-change-record-004.md`,
`spec/governance/architecture-change-record-005.md`,
`spec/governance/architecture-change-record-006.md`,
`docs/PRODUCTION-READINESS-GATE.md` (Gate I),
`docs/productization-evidence/PROD-029/**` (the substitution-evaluation model),
the HFX evidence structure
(`docs/productization-evidence/HFX-000/`, `HFX-101/`, `HFX-201/`, `HFX-204/`,
`HFX-301/`).

---

## 1. Purpose and authority

Technology substitution is an architectural requirement across Layers 1–3.
Capture SDKs, reconstruction engines, spatial systems, LLMs, retrieval/agent
frameworks, geometry/constraint/physics engines, operation planners, renderers
and interaction runtimes must be replaceable behind stable AISE contracts
(`spec/governance/architecture-change-record-004.md` "Mandatory technology
rule", restating `spec/architecture-lock.md` §Technology substitution).

A provider swap must preserve domain semantics, authority, epistemic state,
provenance, uncertainty, assurance and client contracts
(`spec/architecture-lock.md` §Technology substitution). Provider-specific
types/IDs must not become canonical domain meaning (same source).

This contract is binding across all layers
(`spec/architecture-lock.md` §Technology substitution: "The full technology
substitution contract is `spec/technology-substitution-contract.md` and is
binding across all layers."). `docs/PRODUCTION-READINESS-GATE.md` Gate I makes
it a product-readiness condition: AISE is not product-ready unless the
implementation remains replaceable at the technology boundaries this contract
defines.

## 2. The three laws

1. **Substitution is not semantics change.** A provider swap must preserve
   domain semantics, authority, epistemic state, provenance and client
   contracts (`spec/architecture-lock.md`). A substituted provider can never
   change operation semantics, validation verdicts or quantity semantics — and
   it can never hide that it did
   (`backend/api/src/solution-eval/model.ts`, PROD-029's model header).
2. **Tolerances are declared, never implicit.** The evaluation harness compares
   canonical equality exactly; a real difference is recorded, never averaged
   away, and the tolerance decision stays with the consumer
   (`docs/productization-evidence/PROD-029/divergence-analysis.md` §2 "Design
   note (the tolerance question)"). Evaluation thresholds are
   scenario-declared, never provider-negotiated
   (`docs/productization-evidence/PROD-027/evaluation-entry-point.md`; the HFX
   benchmark gate rule "`|value| > threshold`, per instance",
   `docs/productization-evidence/HFX-101/provider-comparison.md`).
3. **Unsupported is recorded, never computed.** An unsupported input is
   answered by explicit refusal — never by fabricated output
   (`docs/productization-evidence/HFX-000/failure-vocabulary.md`). A refusal is
   machine-readable evidence: no record, no manifest, no events
   (`docs/productization-evidence/PROD-029/evaluation-entry-point.md`, the
   `substitution-refused` verdict). A provider's outputs never cross the
   boundary silently downgraded (`docs/productization-evidence/HFX-101/`:
   "NEVER silently-downgraded geometry — no outputs cross the boundary").

## 3. The swappable technology boundaries per layer

Every technology below sits BEHIND a stable AISE port; provider-specific types
must not cross the domain-contract boundary, and canonical IDs must not encode
vendor-specific meaning (`spec/architecture-lock.md` §Technology substitution).

- **Layer 1 — REALITY** (capture → spatial context → evidence →
  reconstruction → readiness): capture SDKs, device/sensor integrations,
  tracking/registration, reconstruction engines, semantic extraction, spatial
  indexing, 2D/3D rendering (`spec/architecture-lock.md`). Reconstruction
  providers are replaceable providers behind the common reconstruction
  contract — WorldSculpt, World Labs Atlas, Magic Leap Atlas, classical
  SfM/MVS, LiDAR/depth fusion, reference-constrained reconstruction,
  specialist instruments and future engines are optional providers
  (`spec/architecture-lock.md` §Reconstruction provider examples). The
  deterministic demo provider is the guaranteed free path
  (`docs/productization-roadmap.md` "Heavy reconstruction/GPU providers are
  optional accelerators").
- **Layer 2 — UNDERSTANDING** (question → Evidence Envelope → reasoning →
  deterministic checks → bounded action): LLMs, multimodal models, embeddings,
  retrieval/vector systems, agent frameworks, tool-routing systems, local
  models and deterministic reasoning/rules implementations
  (`spec/architecture-lock.md`). Reasoning providers remain replaceable;
  evidence, uncertainty, authorization and verification semantics do not
  depend on a specific model or framework (`spec/architecture-lock.md`
  §Layer 2 Evidence Envelope).
- **Layer 3 — SOLUTION** (problem → typed EngineeringOperation → proposed
  states → validation → solution BOQ): geometry kernels, constraint/physics
  engines, operation planners, scene graphs, renderers, interaction frameworks
  and optimization/search engines (`spec/architecture-lock.md`). The
  substitution-evaluable seams are the operation compiler, the engine
  execution, the validation and the BOQ derivation
  (`docs/productization-evidence/PROD-029/substitution-matrix.md`: the four
  seams `operation-compiler | engine-execution | validation | boq-derivation`).

Client adapters (browser, mobile, desktop) are adapters over the one product
core and never own canonical engineering state — a client may own
presentation, platform interaction, bounded offline caches and upload/download
transport, nothing more (`spec/governance/architecture-change-record-004.md`).
External construction systems of record remain authoritative for their own
domains; AISE stores explicit references, mappings and synchronization
provenance (`spec/architecture-lock.md` §Authority).

## 4. Conformance requirements

A replacement technology is accepted ONLY after ALL of the following pass, on
the same merged commit lineage, before replacing an existing provider
(`spec/architecture-lock.md` §Technology substitution;
`spec/governance/architecture-change-record-006.md` §Required evidence):

1. **Contract conformance** — the candidate satisfies the stable AISE port's
   contract (the closed canonical wire shapes; unknown fields are refused with
   the field named — `backend/api/src/solution-eval/model.ts`, PROD-029's
   canonical-projection guard).
2. **Semantic-equivalence tests** — the same inputs through the candidate and
   the incumbent produce equivalent canonical outputs at every comparison
   point (§5 below). Both authoring paths (direct manipulation and
   natural-language agent commands) resolve to the same operation contract —
   no input modality receives different engineering authority
   (`spec/governance/architecture-change-record-006.md` §Layer 3).
3. **Negative/discrimination tests** — a harness that only proves the happy
   path is a failed delivery: declared-divergence cells must be CAUGHT and
   recorded with exactly their declared failure kind, from the closed
   vocabulary (`tools/solution-eval/runner.ts`, the PROD-029 day-27 gate;
   `spec/governance/architecture-change-record-005.md` §Evidence requirement:
   "deterministic tests, negative/discrimination tests, provenance tests").
4. **Provenance continuity** — provider identity, version, configuration and
   input digests/diagnostics/limitations belong in provenance
   (`spec/architecture-lock.md` §Technology substitution); historical records
   remain interpretable without the replaced provider (same source). The
   provenance manifest is sealed per benchmark run
   (`docs/productization-evidence/HFX-000/control-plane.md`).
5. **Failure-path tests** — the candidate's failure and unsupported behavior
   remains explicit (`docs/PRODUCTION-READINESS-GATE.md` Gate I): timeouts,
   refusals and degraded evidence are typed, bounded and never silently
   downgraded.
6. **Dependent-layer regression** — the layers that consume the substituted
   component re-run their gates (`docs/PRODUCTION-READINESS-GATE.md` Gate I:
   "dependent-layer regression passes").
7. **Compatibility window / rollback** — a compatibility window/rollback path
   is required when migration risk warrants it
   (`spec/governance/architecture-change-record-004.md` §Compatibility rule;
   `docs/TECH-LEAD-HANDOFF.md` "Architecture records and mandatory technology
   rule"). An incumbent step is not considered replaced without semantic
   equivalence, operational acceptance and rollback capability
   (`spec/architecture-lock.md` §Incumbent integration and adoption).

## 5. The substitution-evaluation model (PROD-029)

The provider-neutral harness for Layer-3 substitution evaluation is
`evaluateSubstitution(scenario, registryLog)`
(`docs/productization-evidence/PROD-029/evaluation-entry-point.md`;
`backend/api/src/solution-eval/`). Its laws:

- **The canonical comparison points/kinds** — `operation-identity`,
  `state-digest`, `quantity-value`, `validation-verdict`, `boq-line`
  (`docs/productization-evidence/PROD-029/evaluation-entry-point.md`; the
  frozen `DIVERGENCE_KIND_BY_POINT` mapping in
  `backend/api/src/solution-eval/model.ts`: verdict points map to
  `reasoning-failure`, the rest to `operation-semantic-failure`; shape
  divergence maps to `contract-mismatch`).
- **The canonical-projection model** — every JSON-in-string provider field is
  parsed and validated against a closed canonical shape; unknown fields are
  refused with the field named and recorded as `contract-mismatch`; every
  value at every comparison point is a canonical scalar (string | number)
  (`backend/api/src/solution-eval/model.ts`, the D26 boundary guard).
- **The comparison discipline** — canonical equality is compared EXACTLY
  (byte-equal digests); a difference is real and must be RECORDED (never
  averaged away); the tolerance decision stays with the consumer
  (`docs/productization-evidence/PROD-029/divergence-analysis.md`).
- **The verdict vocabulary** — `substitution-proven` / `divergence-recorded` /
  `substitution-refused` (a refusal is machine-readable evidence: no record,
  no manifest, no events — `docs/productization-evidence/PROD-029/
  evaluation-entry-point.md`).
- **The divergence kinds** — the closed vocabulary {`operation-semantic-
  failure`, `reasoning-failure`, `contract-mismatch`} over the four seams
  (`docs/productization-evidence/PROD-029/substitution-matrix.md`:
  4 seams × {faithful, divergent} = 8 scenarios, 4 substitution-proven, 4
  divergence-recorded, 0 refused).

## 6. The control plane and the evidence discipline

Every candidate provider moves through the provider-evaluation control plane
(`packages/provider-registry`, `backend/api/src/providers/`):
`registration → evaluation → execution → normalized result → benchmark →
provenance → promotion decision` (`docs/productization-evidence/HFX-000/
control-plane.md`). Its laws:

- the provider profile carries the full mandatory field set (all 15/15);
  the registry event log is append-only; the promotion state machine is
  `registered/evaluation/benchmarked/promoted/rejected/retired`;
- the promotion gate refuses on license-use-clearance, benchmark-evidence and
  provenance-continuity dimensions — a research-only license is REJECTED with
  a typed `license-blocked` refusal regardless of recordable metrics ("the
  refusal is license-driven, not metric-driven" — HFX-000);
- the control plane is deterministic: no network, no clock reads, no
  randomness; a crafted log that appends a promotion event for an
  evaluation-only provider fails replay with `promotion-gate-refused`
  (anti-smuggling);
- benchmark records and provenance manifests are content-addressed (64-hex
  canonical digests) and committed as evidence
  (`docs/productization-evidence/HFX-101/`, `HFX-201/`, `HFX-204/`,
  `HFX-301/`: provider comparison reports, benchmark reports, manifests);
- the evidence must identify which technologies were compared and which
  results are empirical versus deterministic test results; no provider swap is
  accepted solely on visual similarity or model confidence
  (`docs/PRODUCTION-READINESS-GATE.md` Gate I).

## 7. Authority laws

- Provider types never become canonical: provider-specific types must not
  cross the domain-contract boundary, and canonical IDs must not encode
  vendor-specific meaning (`spec/architecture-lock.md`).
- The swap never lowers assurance: replacement does not lower assurance
  thresholds or bypass verification (`docs/PRODUCTION-READINESS-GATE.md`
  Gate I); a provider swap must preserve domain semantics, authority,
  epistemic state, provenance and client contracts
  (`spec/architecture-lock.md`); LLMs and agents are non-authoritative
  planners, translators, explainers and tool users (`spec/architecture-lock.md`
  §Authority); agents may not invent dimensions/materials/evidence, write
  authoritative geometry, bypass validation, or declare readiness/approval
  (`docs/TECH-LEAD-HANDOFF.md` §Agent boundary, restating ACR-005).
- The truth vocabulary survives every swap: `OBSERVED`, `INFERRED`,
  `CONFIRMED`, `PROPOSED` remain distinct; `UNKNOWN`, `NOT_OBSERVED`,
  `OCCLUDED` never imply absence; confidence never substitutes for measurement
  uncertainty; estimates never silently become measurements
  (`spec/architecture-lock.md` §Truth and uncertainty).

## 8. Stop condition

Raise a new Architecture Change Record if a provider or client needs to own
canonical engineering state, change epistemic semantics, bypass server
authorization, or introduce a parallel domain/service contract that is not an
adapter over the shared core (`spec/governance/
architecture-change-record-004.md` §Stop condition — the same stop discipline
applies to any substitution that would breach §7). Any change touching
technology substitution is CRITICAL assurance and requires the applicable
benchmark, negative/discrimination and physical evidence
(`spec/architecture-lock.md` §Critical assurance).
