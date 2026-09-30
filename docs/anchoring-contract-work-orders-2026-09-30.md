# AISE — Shared Anchoring Contract Work Orders (2026-09-30)

Authorization basis: the delivered ANCHOR-001 spike (merged 0dae734; `docs/productization-evidence/ANCHOR-001/recommendation.md` — verdict "NEW SHARED ANCHORING CONTRACT WORK ITEM — then adapter implementation, gated on a real-photoset evidence run. No ACR needed. No deferment."), the parity scorecard's open item 2 follow-through, and the GBIM-004 Work Item's structural precedent (`docs/shared-geometry-contract-work-item-2026-09-30.md` — the DEFINED-in-work-order-format pattern, here with execution AUTHORIZED for the contract layer).

Execution: ONE worker per work item; the Lead gates every delivery (branch review, `bun run verify` at the delivered SHA, merge, deploy, journey-verify).

---

## ANCHOR-002 — The Shared Anchoring Contract (the provider-neutral anchoring port, lifted into a typed contract)

**Protected primary surfaces:** a NEW `packages/anchoring-contract` package (additive only) and the `packages/provider-registry` registration path. Do NOT alter canonical solution semantics (`packages/solution-contract`, `packages/solution-engine` stay authoritative and unmodified), the spike evidence tree (`docs/productization-evidence/ANCHOR-001/` — frozen, read-only), the frozen 1.1.0 evidence/shared contracts (`packages/shared-contracts`, `backend/`), or any app surface (`apps/web`, `apps/android`).

### Objective

Lift the spike-proven `anchor001-anchoring-port/1` (`ANCHOR-001/PORT.md` §2/§3) into ONE typed, provider-neutral anchoring contract in `packages/` following the `solution-contract` codec discipline — so that every anchoring provider and every anchoring consumer implements against the same closed wire shapes, the same AISE-owned identity discipline, and the same fail-closed laws, keeping "no provider type crosses the canonical contract" physically true (a process boundary), not merely conventional (PORT.md §1).

### Required work (scope)

- **The typed port contract** — `AnchoringRequest`/`AnchoringResponse` as zod-coded schemas in the new package: `schemaVersion`, `portVersion` (a NEW versioned id — `anchor002-anchoring-contract/1` — never the spike's disposable id), `executionId`, `authority: "AISE"`, `units: "SI"`, AISE-owned content ids (64-hex sha-256, provider re-verification of every bytes digest), the `planContext` with the rasterToScene HANDEDNESS LAW as a first-class contract field (PORT.md §5 — carried verbatim in its typed form), closed plan-context kinds (the spike exercised `plan-raster`; the vocabulary is closed and versioned), closed still evidence methods, and the per-still `bytesPath` convention.
- **The port laws as typed, tested invariants** (PORT.md §4): (1) no provider type crosses — unknown fields refused with the field named; (2) AISE owns identity — ids echoed never invented, provider refs only in `externalReferences`; (3) fail closed BEFORE anchoring — the gate order (input sanity → content-id re-verification → evidence-method support → plan-context support → parameters) with every refusal carrying ZERO hypotheses.
- **The typed PARTIAL outcome — DESIGNED IN** (PORT.md §7's first open question, resolved at the contract layer): a typed `partial` outcome with per-still results — the anchored stills carry their hypotheses; the refused stills carry their typed per-still reasonCodes; the whole-request outcome vocabulary becomes `anchored | partial | refused` (closed, versioned). The CONTRACT defines it and tests it; the reference provider exercising it is optional at this layer (the spike's whole-request discipline remains a legal provider policy).
- **The AISE-side supervised subprocess runner** — the GBIM-004 pattern: input digest, timeout, stdio JSON, the output guard (the AISE-side schema guard lifted from `ANCHOR-001/aise-side/guard.ts` into the package as a typed, tested invariant).
- **Provider registration through the promotion gates** — the OpenCV reference lane (the spike's adapter) enters `packages/provider-registry` as an EVALUATION-stage provider: registered → evaluation → benchmarked → promoted; NOT a default provider merely because the spike succeeded (the substitution-contract §6 discipline).
- **The real-photoset production gate — DECLARED, not executed here:** the production ADAPTER implementation (a second work order) is explicitly gated on a real-photoset evidence run (the recommendation's own gate). ANCHOR-002 delivers the CONTRACT + the runner + the evaluation-stage registration; the real-photoset run and any production promotion are OUT OF SCOPE (named in the deliverables' deferment note).

### OUT OF SCOPE

Any production adapter promotion; the real-photoset run; line-art plan registration (PORT.md §7 names it — a separate method lane, a separate future adapter); 3D/elevation anchoring; budget calibration beyond carrying the v2.1 declaration forward; any change to `packages/shared-contracts`, `backend/`, `apps/web`, `apps/android`, or the ANCHOR-001 evidence tree.

### Acceptance (completion gate)

- The typed contract exists in `packages/anchoring-contract` under the codec discipline; the port laws are enforced by tests: an unknown field is refused with the field named; a provider handle leak is refused; every refusal carries zero hypotheses; the PARTIAL outcome's per-still results typecheck and round-trip through the codec.
- The supervised subprocess runner is implemented and tested (input digest recorded; timeout enforced; output guarded).
- The reference provider registration exists at evaluation stage with benchmark + provenance records committed as evidence — and is NOT a default provider.
- The substitution-contract §4 conformance set is green for the contract layer on the merged commit lineage: contract conformance, negative/discrimination tests, provenance continuity, failure-path tests.
- Deterministic tests (the spike's byte-identical determinism discipline referenced, not re-run — the spike's evidence is frozen).
- `bun run verify` PASSES at the delivered tree with the new tests included in the counts.

### Deliverables

The contract package (typed schemas + invariant tests + the runner + the guard), the evaluation-stage registration and its benchmark/provenance evidence, and an evidence tree under `docs/productization-evidence/ANCHOR-002/` following the spike-evidence discipline (scorecard-shaped gate record, negative ledger, provenance) — with the deferment note naming the production adapter's real-photoset gate.
