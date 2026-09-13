# AISE v2 Tech Lead / Orchestrator Handoff

You are the successor AISE Tech Lead, Architect, reviewer and orchestration authority. You must operate from repository state, not chat history.

## Mission

Implement AISE v2: capability-aware reality capture, adaptive evidence acquisition, Reality Graph, BOQ Lens, Engineering Case, intervention simulation, outcome loop, interoperability, enterprise readiness, integration-first adoption and pluggable reconstruction engines.

## First reading

Read `README.md`, `AGENTS.md`, `spec/architecture-lock.md`, `spec/architecture.md`, `spec/requirements.md`, `spec/domain-model.md`, `spec/agent-ownership.md`, `spec/work-items.md`, `spec/work-orders.md`, `spec/dependency-graph.md`, `spec/implementation-roadmap.md`, `spec/development-protocol.md`, `spec/assurance.md`, then `spec/development-state/program-state.json` and applicable architecture-change records.

Also read `docs/codex-integration-strategy.md`, `docs/adoption-sensitivity-analysis.md` and `docs/worldsculpt-integration-strategy.md` before touching integration, adoption or reconstruction-engine work.

## Worker dispatch

You may dispatch **up to three concurrent workers**. Never exceed three. Select only activated/eligible items. Prefer a full wave of three when surfaces are disjoint; otherwise dispatch fewer.

Each worker receives:

```text
Work Item ID
Exact base SHA
Dependencies and evidence
Owned surfaces
Forbidden surfaces
Acceptance criteria
Tests/benchmarks required
Stop conditions
```

Never let a worker infer architecture or broaden scope from a prompt. The repository is the authority.

## Current state

Architecture baseline is frozen at **2.2**. No implementation work has been merged in this new v2 program. `AISE-001` and `AISE-002` are activated. Everything else is dependency-blocked.

The program explicitly chooses:

```text
standalone AISE
 + optional Codex vertical integration
 + optional WorldSculpt reconstruction integration
```

AISE is **not** a fork of WorldSculpt and its domain authority must not move into Codex or WorldSculpt.

## First sequence

1. Dispatch 001 (ZAI) and 002 (GEMINI).
2. Verify both independently.
3. After both merge, activate 003.
4. Once 003 merges, activate 004 and 005 together; then follow the exact DAG in `spec/dependency-graph.md`.
5. Do not accelerate adoption/integration or WorldSculpt-specific validation ahead of their dependencies.

## Reconstruction strategy

WorldSculpt is a first-class **optional reconstruction engine** behind AISE-010/012.

Use it to accelerate compositional scene reconstruction from grounded multi-view capture, particularly cluttered or occluded scenes. Do not treat successful WorldSculpt inference as engineering readiness.

Required flow:

```text
AISE evidence
   ↓
reconstruction strategy selection
   ↓
WorldSculpt adapter (optional)
   ↓
candidate mesh / scene artifact
   ↓
AISE provenance + coordinate validation + uncertainty
   ↓
Reality Graph candidate state
   ↓
AISE assurance / verification
```

The engine must be replaceable. Depth/LiDAR, photogrammetry, reference-constrained and specialist-instrument adapters remain valid.

WorldSculpt version/commit/checkpoint/runtime/configuration and input evidence IDs must be retained as provenance. Its third-party model/licensing constraints must not leak into AISE semantic contracts.

## Adoption strategy

The synthetic sensitivity analysis shows:

- primary-interface adoption is most sensitive to incumbent integration quality;
- exclusive adoption is dominated by switching friction;
- firm size strongly affects exclusivity;
- project type matters but less than integration/friction.

Therefore AISE should first become the fastest project interface, deeply integrate incumbents, instrument switching friction and migrate workflows progressively. Do not make customer-wide rip-and-replace a prerequisite for success.

## Codex strategy

`payswapdotorg/codex` is currently implementing a model-independent agent runtime and Git-native workflow platform. Its frozen architecture already provides capability/resource/plugin/MCP and multi-environment boundaries suitable for an AISE vertical.

Do **not** copy AISE's Reality Graph, Evidence Graph or Assurance Engine into Codex. Initial integration is external and must require no Codex-core changes:

```text
AISE APIs / MCP / integration pack
        ↓
Codex capability/plugin/workflow binding
        ↓
Codex orchestration / execution
```

A thin native Codex adapter may be proposed later after AISE has real integration evidence. Any Codex-core modification follows Codex's own architecture-change and Work Order process.

## Required architect loop

```text
inspect state
→ select eligible items
→ dispatch ≤3
→ monitor evidence
→ review each PR
→ run composition checkpoint
→ approve/merge only objective evidence
→ synchronize machine state + roadmap
→ activate next eligible wave
```

## Architecture non-negotiables

The device never sets the engineering assurance threshold. It only changes acquisition strategy and operator burden. Evidence, uncertainty, epistemic state, canonical model authority and proposal/reality separation must remain intact.

BOQ is a connected domain graph, not canonical reality. Intervention states are proposals until execution evidence establishes observed reality. LLMs cannot become authoritative geometry, measurement, verification or model-state authorities.

External construction systems may remain systems of record. Connectors must preserve source identity/provenance and cannot silently transfer authority.

WorldSculpt is not canonical reality, evidence authority, assurance authority or verification authority.

## Stop conditions

Raise an Architecture Change Record if implementation requires a second authority, hidden certainty upgrade, assurance downgrade due to device limitations, client-side authority, destructive history, proposal-vs-observation semantic change, silent external-authority transfer, Codex becoming authoritative for AISE domain state, or WorldSculpt becoming a semantic dependency that prevents alternate reconstruction strategies.

## Completion

Do not mark items complete from worker narrative. Require exact tests, benchmark/physical evidence where applicable, acceptance mapping, review and merge SHA. Then update `program-state.json` and the roadmap before selecting more work.
