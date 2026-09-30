# ANCHOR-002 — Deferment note

The ANCHOR-002 work order's own words: "the real-photoset production gate — DECLARED, not executed here: the production ADAPTER implementation (a second work order) is explicitly gated on a real-photoset evidence run (the recommendation's own gate). ANCHOR-002 delivers the CONTRACT + the runner + the evaluation-stage registration; the real-photoset run and any production promotion are OUT OF SCOPE (named in the deliverables' deferment note)."

## Deferred, with evidence pointers

1. **The production adapter work order (the real-photoset gate).** The ANCHOR-001 recommendation (`docs/productization-evidence/ANCHOR-001/recommendation.md`) gates it verbatim: "Gate any production adapter implementation on a REAL-PHOTOSET evidence run: the synthetic fixture proves the lane, not the world. The run needs a real photoset with per-photo provenance (the PROD-033 web-sourcing pattern), a real plan drawing/raster, and the same measurements + negative ledger." The contract layer delivered here is the wire the future adapter implements against (`anchor002-anchoring-contract/1`); until that run exists, the reference lane sits at `benchmarked` (evaluation stage) and every promotion request answers the typed `license-blocked` refusal (`registration.md`) — the gate is enforced by the control plane, not by convention.

2. **The reference adapter exercising the NEW contract end to end.** The spike's adapter ran against `anchor001-anchoring-port/1` (its evidence is frozen). Re-running it (or its successor) behind `anchor002-anchoring-contract/1` — including exercising the typed PARTIAL outcome with a real mixed-quality capture — belongs to the adapter work order. The contract layer proves the outcome vocabulary, accounting and guard laws with deterministic in-repo subprocess drills (`negative-ledger.md` neg-001..neg-016).

3. **Budget calibration beyond the v2.1 declaration.** The frozen honest miss is carried forward, never hidden: budget95 covers realized error on only 6/10 synthetic-fixture stills (the benchmark record's `budget95Coverage` 0.4; `ANCHOR-001/measurements.md` §4). Empirical calibration per capture regime (or cross-validation-aware budgets with honest coverage statistics) is gated on the real-photoset run — PORT.md §7's third open question.

4. **Line-art plan registration.** PORT.md §7's second open question: real floor plans are line drawings without shared texture with photos; the automatic path needs either an intermediate orthophoto/raster base map or a geometric (wall-line) registration lane — a separate method, a separate adapter, a separate future work order. The plan-context kind vocabulary stays closed at `plan-raster` (versioned by the contract).

5. **3D/elevation anchoring.** Out of scope by the work order; the homography anchors a still to the plan's floor plane, and `camera_poses` stays with the existing reconstruction contract.

## Not deferred (delivered here, for the record)

The typed contract package, the port laws as tested invariants, the typed PARTIAL outcome, the supervised subprocess runner, the evaluation-stage registration with its committed benchmark/provenance evidence, and this evidence tree — see `SCORECARD.md` and `README.md`.
