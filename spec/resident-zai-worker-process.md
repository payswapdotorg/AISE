# Resident Z.ai Worker Process

**Status:** GOVERNED OPERATIONAL PROCESS  
**Architecture:** AISE v1.0  
**Purpose:** Adapt the proven controller-style implementation loop to AISE without importing controller code or making worker-session state authoritative.

## 1. Authority model

The AISE repository remains the only durable development authority. In particular:

1. frozen architecture defines architectural truth;
2. `spec/implementation-roadmap.md` and `spec/development-state/program-state.json` define governed work-item state and eligibility;
3. `spec/work-orders.md` defines the implementation contract;
4. GitHub defines PR, CI, review, commit, and merge execution evidence;
5. a resident Z.ai session is only an execution handle and conversational continuity mechanism.

A Z.ai session must never become a second roadmap, requirements store, completion authority, or merge authority.

## 2. Resident-session model

For a Work Item, prefer one persistent Z.ai worker session for the life of the implementation/change loop.

The session is bound operationally to:

- repository identity;
- Work Item identity;
- exact base SHA for the current implementation iteration;
- Work Order path;
- declared owned surface;
- forbidden surfaces;
- required checks and evidence requirements;
- the single PR/branch for that Work Item.

The session identifier is non-authoritative. On restart or session loss, the next worker reconstructs its position from repository state and GitHub evidence rather than trusting conversational memory.

A new resident session is allowed only when the prior session is lost, explicitly escalated, or the governed Work Item changes. A review iteration normally resumes the same session and the same PR.

## 3. Dispatch packet

The Architect sends Z.ai a repository-resolved dispatch packet, not an unconstrained prompt. At minimum it contains:

```text
work_item
work_order_path
architecture_version
repository
base_sha
branch_name
pr_number (when resuming)
owned_surfaces
forbidden_surfaces
acceptance_criteria
required_checks
assurance_profile
stop_conditions
previous_review_packet (when resuming after review)
```

The worker must verify the base SHA, Work Order, scope, and current PR identity before changing code.

The dispatch packet is the worker's operational input; the repository remains the authority.

## 4. Implementation loop

The governed loop is:

```text
READY
  ↓
ARCHITECT ACTIVATES
  ↓
DISPATCH RESIDENT Z.AI SESSION
  ↓
Z.AI verifies exact base + Work Order + scope
  ↓
IMPLEMENT
  ↓
TEST + EVIDENCE
  ↓
OPEN/UPDATE THE ONE PR
  ↓
ARCHITECT independently inspects GitHub + repository state
  ↓
┌───────────────────────────────┐
│ REQUEST_CHANGES               │
│ → immutable review packet     │
│ → resume same Z.ai session    │
│ → change same PR              │
│ → rerun required checks       │
└───────────────┬───────────────┘
                ↓
             APPROVE
                ↓
        MERGE POLICY GATE
                ↓
             MERGED
                ↓
        POST-MERGE RECONCILIATION
                ↓
        NEXT GOVERNED WORK ITEM
```

The resident session does not get a privileged path around the merge gate.

## 5. Review packet contract

Every Architect `REQUEST_CHANGES` response is converted into a durable review packet containing:

- exact PR head SHA reviewed;
- intended base SHA;
- Work Item;
- review iteration;
- stable finding ID for each issue;
- severity;
- affected path(s);
- acceptance criterion;
- exact required change;
- any verification command or evidence requirement needed to close it.

The packet is sent back verbatim to the resident Z.ai session. Findings are not paraphrased in transit and are never silently dropped.

A new commit on the PR invalidates approval bound to the older head. The Architect must review the new exact head before merge.

## 6. Independent evidence rule

Z.ai's report is evidence supplied by the worker, not proof by itself. The Architect independently verifies:

- current PR head and base;
- changed-file scope;
- required CI workflows and terminal conclusions;
- repository work-item state and eligibility;
- review state and unresolved findings;
- required benchmarks, golden captures, discrimination tests, and physical evidence where mandated.

A worker claiming green checks does not make the checks green.

## 7. Merge and reconciliation

Architect review and merge are separate operations.

Merge is permitted only when the current governed repository state, exact PR head/base, scope, required checks, review state, and all Work Item predicates agree.

After merge:

1. verify the actual merge commit;
2. record objective evidence in `program-state.json`;
3. set the Work Item `FINALIZED` only after post-merge verification succeeds;
4. synchronize the roadmap ledger;
5. recompute dependency eligibility;
6. activate only explicitly governed next work.

A post-merge verification failure immediately blocks dependent work until corrective verification succeeds.

## 8. Restart and failure recovery

The resident session may disappear at any time. That event does not change governed state.

On restart, reconstruct from:

- current repository machine state;
- current Work Order;
- current PR and exact head SHA;
- GitHub CI/review evidence;
- active handoff and durable review packet.

Never infer progress from an absent process, stale local workspace, or remembered conversation.

If repository authority contradicts GitHub state, stop and escalate rather than guessing.

## 9. Scope and parallelism

One Work Item remains one branch and at most one active PR. A resident session does not change ownership or permit cross-scope edits.

Parallel Work Items may still run only when the existing AISE dependency, surface-conflict, assurance, and explicit-activation rules permit them.

## 10. AISE operating mode from this point

For the remainder of this project, the Architect (ChatGPT) is the semantic controller of the implementation loop:

- identifies the next explicitly activated Work Item;
- constructs the worker dispatch request from repository truth;
- independently reviews worker output;
- emits exact review packets for change iterations;
- verifies merge predicates;
- reconciles state after merge;
- selects the next governed activation.

Z.ai is the resident implementation worker. Its session is kept alive across normal review/change iterations where the external execution environment permits. Session continuity improves efficiency but never changes authority.

Where direct Z.ai transport is not available to the Architect environment, the exact dispatch/review packet remains the canonical payload to relay into the resident session; no semantic content may be changed during relay.

## 11. Non-goals

This process does not copy or depend on controller source code. It adopts only the implementation-process properties: repository-derived dispatch, persistent worker continuity, exact review packets, independent evidence verification, fail-closed recovery, separate merge authorization, and post-merge reconciliation.
