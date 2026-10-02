# AISE v2 Active Handoffs

## Current architecture handoff

Merged and finalized: AISE-007 (adaptive capture mission planner @ 56ee7db), AISE-008 (evidence/source service @ af01553), AISE-011 (BOQ ingestion @ 17fbad1). Wave 3 complete. Architecture 2.2 frozen; program state synchronized per development-protocol §8 (post-merge tree verify PASS, 310 tests).

In flight (activated, local-implementation mode): AISE-009 (guided mission executor — GEMINI Android surface), AISE-010 (reconstruction orchestration — ZAI backend), AISE-014 (BOQ normalization — ZAI backend; activated early per DAG pipelining, dep 011 finalized).

Execution mode note (2026-09-14): the successor Tech Lead implements via bounded local workers (worktree branches) with the same evidence standard: branch → tests → `bun run verify` (TS) / `:core:test` (Kotlin) → architect review → merge → state synchronization. Worker completion requires objective evidence per development-protocol §4.

## WORLD PROGRAM activation (2026-10-02, supersedes all "current/in-flight" statements above)

Activated per the 2026-10-02 FINAL PRODUCT PARITY/EXPERIENCE/MULTIPLATFORM
DIRECTIVE (recorded verbatim in `docs/TECH-LEAD-HANDOFF.md`). Program
definition: `spec/world-program.md`; machine state:
`spec/development-state/world-program-state.json`. Fresh work items
WORLD-P0-A…WORLD-P5 — all prior programs stay closed as recorded.

In flight: WORLD-P0-A (worker-a, reality substrate contracts) and
WORLD-P0-B (worker-b, understanding substrate contracts), dispatched
2026-10-02 evening via the replay station (agents tab, GLM-5.3,
Full-Stack). Next in graph: P0-C after both, then P1/P2, P3, P4, P5.
Delivery: worker sandbox bundles + narrative harvest, TL-only push, TL
independent verification before any composition. The substitution contract
remains binding law; the honesty laws (BLOCKED/NOT-DERIVABLE in-record,
fail-closed negatives) carry over unchanged.
