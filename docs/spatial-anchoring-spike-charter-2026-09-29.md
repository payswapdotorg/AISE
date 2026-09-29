# AISE — Automatic Spatial Anchoring Spike Charter
**Authorization basis:** `docs/layered-competitive-parity-scorecard-2026-09-29.md` open item 2 (L1: "images mapped to plan/floor context automatically — OpenSpace's Spatial AI signature; research-grade; AISE's task-directed gaps ledger is the honest alternative today") + `docs/productization-roadmap.md` §Post-readiness R&D (the evidence-spike pattern established by `docs/geometry-bim-technology-spike-2026-09-25.md`).

**Status: AUTHORIZED — evidence collection only.** This charter is deliberately NOT a provider-selection, adoption, or fork mandate. Any subsequent implementation recommendation must pass `spec/technology-substitution-contract.md`, preserve AISE authority/provenance/uncertainty, and state whether the next action is adapter implementation, a new shared anchoring contract Work Item, an Architecture Change Record, or deferment.

## ANCHOR-001 — Automatic spatial anchoring spike

**Protected primary surfaces:** a spike sandbox package/directory and `docs/productization-evidence/ANCHOR-001/`. Do not alter the Reality Graph semantics, the evidence register, the governed changes API, or any canonical engine code. The spike must be removable without touching canonical state (the GBIM-001 discipline: the spike's git diff touches NO engine/package file).

### Objective

Answer, with evidence: can captured stills be automatically mapped to plan/floor context behind a provider boundary — anchoring field evidence to spatial context without the human composing the reality graph by hand — while AISE semantics (operation identity, provenance, uncertainty, fail-closed behavior) remain unchanged?

### Required work

- Define the smallest provider-neutral anchoring port needed by Layer 1: input = evidence content ids (registered stills) + a plan/floor context (the reality-graph node vocabulary or an imported drawing region); output = an anchoring hypothesis (pose/registration/transform with an explicit uncertainty budget and confidence), as a CANDIDATE that AISE gates accept or reject — never a direct Reality Graph write.
- Implement a disposable/reference adapter against one concrete automatic path (e.g. 2D feature matching + homography to a plan image, or a Structure-from-Motion pose over a photoset). The concrete provider choice is the worker's; it must be free-tier/local-first (no paid API dependency) and its licensing posture must be documented.
- Exercise the shared fixture pattern: the site-photoset discipline (real construction photos — the GBIM canonical-fixture pattern; real photos may be sourced the way PROD-033/full-architecture E2E sourced them) plus the existing reality-graph node vocabulary.
- Measure: registration accuracy where ground truth is constructible, determinism/reproducibility (same inputs → same anchoring hypothesis), runtime, and provider provenance (provider/version/config/input digests — complete and replayable).
- Exercise negatives: no-plan case, single-image case, repeated-texture/textureless cases, mismatched plan, and unsupported evidence methods — each must FAIL CLOSED with an explicit typed state; no fabricated anchors.
- Record what the anchored hypothesis would mean for the existing UX seams (the capture surface's registration panel, the SiteTwin reality recorder): would an accepted anchor prefill the recorder's composition, and what would the human approval step look like? (Design notes only — no UI implementation.)

### Acceptance

- AISE operation/state identity remains provider-neutral; no provider type crosses the canonical contract.
- Anchoring outputs are candidates with explicit uncertainty; nothing enters the Reality Graph without the governed changes API.
- Divergences, failure modes, and unsupported cases are explicit and recorded.
- The spike is evidence collection only: removable, no canonical changes, no fork proposal.
- The recommendation states the next action: adapter implementation, a new shared anchoring contract Work Item, an ACR, or deferment — with the four fork tests evaluated if any adaptation is proposed.

### Deliverables

`docs/productization-evidence/ANCHOR-001/` containing: the port definition, the adapter notes, the fixture and its provenance, the measured results (accuracy/determinism/runtime/provenance), the negative-case ledger, the UX design notes, and the recommendation.
