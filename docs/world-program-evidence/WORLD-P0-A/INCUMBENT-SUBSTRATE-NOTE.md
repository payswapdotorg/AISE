# WORLD-P0-A Incumbent Substrate Note — the Three.js lane

**Work item:** WORLD-P0-A (worker-a, reality substrate contracts)

The 2026-10-02 FINAL PRODUCT PARITY / EXPERIENCE / MULTIPLATFORM
DIRECTIVE (`docs/TECH-LEAD-HANDOFF.md`) names the replacement rationale
for the incumbent Layer-1 evaluation substrate, and
`spec/world-program.md` §P0 acceptance detail requires this note to
record it and to state the do-not-migrate decision explicitly.

## The incumbent

The GBIM spike (Track G, `docs/geometry-bim-technology-spike-2026-09-25.md`
and the spike's scorecard) evaluated a **Three.js** lane as the
rendering/scene substrate for the geometry/BIM surface. That evaluation
was exploratory ADAPT evidence: it proved the seam and produced a
scorecard, and by the spike's own rules it selected NO default provider
and forked nothing.

## The replacement rationale (from the directive)

- The product's primary experience becomes a persistent,
  evidence-grounded, game-like engineering WORLD; the scene substrate
  must therefore be evaluated against world-class engine criteria —
  scene-graph scale, instancing, WebGPU/WebGL reach, tooling, longevity
  — rather than spike-convenience criteria.
- Babylon.js carries the parity burden for the interactive world
  surface (the directive's incumbent-parity targets are OpenSpace /
  SYNCHRO / Procore-class experiences), with a scene runtime, material
  system, picking, WebGPU path and a large engineering surface for the
  same class of permissive license (Apache-2.0; see LICENSE-MATRIX.md).
- The substrate stays REPLACEABLE behind the lane contract either way:
  this package's `babylon` lane publishes the substrate-neutral scene
  runtime port; Three.js, Babylon.js or a future engine are swappable
  providers behind it, and provider ids never become canonical AISE
  identity.

## The decision recorded for THIS wave

**The GBIM spike is NOT migrated.** Its Three.js evaluation evidence
stays closed exactly as recorded (Track G closure state); no spike code,
dependency or conclusion is imported by WORLD-P0-A. The spike's seam
learnings remain historical context only. Any future composition of the
spike's lane with the world program would be a NEW governed work item
with its own evidence, per the program's hard prohibitions (directive
§10: do not mutate existing completed work items).
