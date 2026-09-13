# AISE v2 Development Protocol

## 1. Source of truth

Repository artifacts are authoritative. Chat is never a dependency. Architecture, requirements, work-items, work-orders, dependency graph, roadmap, machine state and handoffs must remain synchronized.

## 2. Work lifecycle

```text
DRAFT → READY → ACTIVATED → IMPLEMENTING → PR_OPEN → VERIFYING
                                  ↑             ↓
                                  └── changes ← REVIEW
                                                 ↓
                                              MERGED
                                                 ↓
                                             FINALIZED
                                                 ↓
                                              DOGFOOD
                                                 ↓
                                            NEW SIGNAL
```

## 3. Three-worker wave protocol

The Tech Lead starts no more than three work items at once. Before dispatch:

1. recompute dependency eligibility from machine state;
2. verify surface disjointness;
3. verify required fixtures/tooling are available;
4. identify shared contracts and merge order;
5. define the composition checkpoint.

Prefer three-worker waves when safe; use one or two when dependencies make a third unsafe.

## 4. Completion

Worker narrative is not evidence. The worker supplies tests, benchmark/physical evidence, acceptance mapping, changed surfaces and exact SHA. The Tech Lead reviews the evidence and repository state.

## 5. CRITICAL work

Changes touching reality reconstruction, measurements, evidence, readiness, verification, BOQ quantity mappings or intervention simulation require golden/physical benchmark evidence where applicable, mutation/discrimination tests for claimed protections, and independent architecture review.

## 6. Dogfood

Every major composition milestone is used on realistic physical/project fixtures. Failures become governed Work Items. A screenshot or mocked API is insufficient for a reality claim.

## 7. Architecture changes

Workers stop and raise an Architecture Change Record for changes to authority boundaries, epistemic semantics, task assurance semantics, canonical model meaning, device-vs-server authority, or proposal-vs-reality state handling.

## 8. Post-merge state

After an accepted merge, record exact merged SHA, evidence, status and newly eligible work in `spec/development-state/program-state.json` and `spec/implementation-roadmap.md`.
