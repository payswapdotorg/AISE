# AISE ↔ Codex Universal Integration Strategy

## Decision

AISE is a standalone construction-engineering vertical. `payswapdotorg/codex` is the reusable agent/workflow/execution substrate. AISE should plug into Codex rather than live inside Codex's domain core.

## Why

Codex Universal already owns agent turns, model portability, workflow semantics, execution environments, capabilities, resources, skills/plugins, MCP, approvals, sandboxing and workflow evidence. AISE additionally requires domain authorities that must remain independent: Reality Graph, Evidence Graph, Assurance Engine, Verification Engine, BOQ Graph, Engineering Case, Intervention and Outcome history.

Putting those authorities into Codex would entangle construction semantics with a general-purpose runtime and make AISE changes compete with Codex's upstream compatibility and runtime evolution.

## Target architecture

```text
Construction systems of record
 BOQ | BIM | CAD | PM | ERP | Docs
         ↕ connectors
AISE Vertical / Domain Platform
 Reality | Evidence | Assurance | BOQ | Cases | Interventions
         ↕ API / MCP / capability pack
Codex Universal
 Workflow + agents + models + skills/plugins + execution
```

## Initial integration: zero Codex-core changes

AISE SHALL first integrate using interfaces Codex already exposes:

1. Stable APIs for AISE domain reads/actions.
2. Optional MCP capabilities.
3. A Codex workflow/plugin pack declaring AISE capabilities, resources, scopes and prerequisites.
4. Workflow definitions that invoke AISE through Codex's existing capability system.
5. Evidence correlation between Codex execution IDs and AISE case/capture/intervention IDs.

This requires no Codex core change and cannot block Codex's ongoing Work Orders.

## What Codex orchestrates

Codex is well suited to multi-step engineering workflows, document/BOQ triage, connector operations, report drafting, evidence-review orchestration, human approval routing, cross-system actions, scheduling, and parallel specialist agents.

## What AISE owns

AISE remains authoritative for engineering reality, measurement and uncertainty, evidence provenance, capture missions and evidence sufficiency, reconstruction/model versions, BOQ interpretation/mapping, engineering cases, intervention proposed states, post-work observed outcomes, readiness and verification.

Codex may request these operations, but cannot directly invent, rewrite or promote AISE state.

## Codex integration pack

The AISE repository should eventually publish a package containing a manifest, capability declarations, resource requirements, permission scopes, MCP endpoint metadata, workflow templates, schemas, compatibility constraints, verification fixtures and install/upgrade metadata.

Illustrative capabilities:

```text
aise.get_project_context
aise.search_evidence
aise.explain_boq_item
aise.inspect_issue
aise.request_missing_evidence
aise.get_readiness
aise.create_intervention_scenario
aise.render_intervention_state
aise.record_execution
aise.compare_outcome
```

These names remain illustrative until the relevant Work Item freezes the contract.

## Incumbent-first operating model

AISE + Codex should not force customers to abandon existing systems. AISE becomes the project-facing context/action surface while connectors invoke systems of record behind the scenes.

```text
existing system
  → connect
  → expose context in AISE
  → use AISE as primary interface
  → migrate one workflow
  → prove equivalence
  → migrate another workflow
  → selectively retire incumbent steps
```

## Switching-friction instrumentation

For each workflow, measure incumbent applications touched, manual re-entry, required permissions/accounts, irreversible actions, artifact transfers, approvals, system-of-record constraints, training burden, latency, rollback complexity, and abandonment points. These measurements feed `AISE-041` and pilot decisions.

## Integration safety

- External system output is untrusted input.
- AISE provenance retains external identifiers and timestamps.
- Connector failure cannot make an AISE fact appear confirmed.
- Missing capabilities produce explicit diagnostics.
- External-authority actions remain permission gated.
- Codex workflow completion never implies engineering approval.
- Codex owns its workflow versions; AISE owns its domain state.

## Future Codex-side adapter

After the integration pack is exercised in pilots, a thin native adapter may be proposed in `payswapdotorg/codex`. It should translate Codex capability/resource semantics to AISE's stable external contract only. It must not copy AISE domain models or make Codex the source of truth.

Any Codex-core modification remains governed by Codex's own Architecture Change Request and Work Order process.
