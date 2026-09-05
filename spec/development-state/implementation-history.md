# AISE Implementation History

This is the durable accepted-milestone history for fresh architect recovery.

`program-state.json` remains the machine-readable current-state authority. This file records accepted implementation history so a fresh session does not need conversation history or PR search to understand what has already landed.

## Accepted milestones

| Work Item | Status | PR | Merge SHA | Notes |
|---|---|---:|---|---|
| AISE-001 | FINALIZED | #4 | `c448f587637f4ad45281ec89ce21daeb96cdfdb` | Repository/runtime foundation |
| AISE-002 | FINALIZED | #5 | `52e3a722735dd3265e23177a5191f27f245decb1` | Android foundation |
| AISE-003 | FINALIZED | #6 | `492fbddc3b7633b49ff6e710ba291a01f78fcb75` | Shared contracts |
| AISE-004 | FINALIZED | #7 | `55146bae0edd0724a487e30becb458493b1c003d` | Capture ingestion API |
| AISE-008 | FINALIZED | #9 | recorded in program state | Reconstruction foundation |
| AISE-009 | FINALIZED | #11 | `77edaca38fadea95c431d4f191642e0395d8cc17` | Geometry primitives |
| AISE-010 | FINALIZED | #12 | `5c840c1465fa5213e02b547dd03ad456066fe820` | Architectural semantics |
| AISE-011 | FINALIZED | #13 | `b1731536203e6bc4698f5804cea882675c798abf` | Reality Graph core |
| AISE-012 | FINALIZED | #14 | `80e7c6f7f5552d6b8562fe7c0c3954c8ad74da1a` | Evidence/provenance graph |
| AISE-013 | FINALIZED | #15 | `66a9e329dd145f38ee69d3286278039f44e9ea70` | Confidence/uncertainty/readiness |
| AISE-014 | FINALIZED | #19 | `934e32479d929bcdabf846663e6b625d24bdb8c3` | Self-consistency/geometry QA |
| AISE-015 | FINALIZED | #32 | `197bce9ec96198a049d3db29675c14800729987c` | Web workspace foundation |
| AISE-016 | FINALIZED | #35 | `51ffa38a2887d39671b83ef174d2517c5fab248d` | Evidence-aware review UI |
| AISE-017 | FINALIZED | #38 | `077fcb2120b06d0aa93ab47d612e9f193113e99c` | 2D plan generation |
| AISE-018 | FINALIZED | #41 | `2286090ee542c4d82e9608e72a96f32957748bae` | IFC export |
| AISE-019 | FINALIZED | #44 | `b63f973c8512c3728413625911c37854a16ed3f5` | DXF/PDF output |
| AISE-020 | FINALIZED | #23 | `8d351c43ca9cfed43ea507296ceedc2bffd3a12a` | Task intent/assurance engine |
| AISE-021 | FINALIZED | #26 | `0de293d7081e4d9b4dae6ef30e8d1dedc0d7bef4` | Engineering rules |
| AISE-022 | FINALIZED | #29 | `f79730b5bed0906a95c94c6d9bfcfa143d8a96b4` | Golden capture benchmark |
| AISE-026 | FINALIZED | #47 | `9a65b56804c26d79b76132b984c2a2e32660eb74` | MEP pipe reconstruction |

## Explicit non-finalized history

- AISE-005 merged as PR #8 but remains **BLOCKED** because the separate Android instrumentation verification failed post-merge. Its merge does not constitute finalized acceptance.
- AISE-006 has implementation work on PR #10 but remains blocked by hard dependency AISE-005.
- AISE-027 is **PR_OPEN**, not finalized. Current implementation PR is #3, head `59166b974780768051246d1341ca60dcbb0c45e0`.

## Synchronization rule

When a Work Item is accepted and merged, update this history with the exact PR and merge SHA only after architect acceptance. Do not record agent claims as accepted history. Keep current execution state synchronized in `program-state.json` and `implementation-roadmap.md`.
