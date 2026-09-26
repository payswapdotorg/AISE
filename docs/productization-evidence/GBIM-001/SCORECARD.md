# GBIM-001 — Scorecard (gate record, not a ranking)

**Decision vocabulary** (per `docs/geometry-bim-spike-scorecard-2026-09-25.md`):
PROVEN / PARTIAL / DIVERGENT / REFUSED / DEFERRED.

| Dimension | Verdict | Evidence line |
|---|---|---|
| Canonical semantics | **PROVEN** | AISE-owned ids (`op-001..op-010`) echoed verbatim; provider shapes only in deletable `externalReferences` (replay step C); no engine/package file modified by the spike (git diff = evidence tree only); neg-005/006/007 fail closed at the port. |
| Exact geometry | **PROVEN** | All 10 ops produce valid closed-manifold BRep solids (BRepCheck `isValidBRep: true` everywhere); deterministic digests identical across reruns (`sha256:d189ea5a…`, provenance.md §2); 8 of 9 shared quantities EXACTLY equal to the unmodified engine, 1 declared divergence (block-count, parametric-only). |
| Quantities | **PROVEN** (divergences D-1…D-5 declared, none silent) | Same fixture yields semantically compatible quantities wherever both lanes compute (wall 4.8 m³, opening 1.89 m², footing 0.048 m³/0.16 m², slab 9.6 m³/48 m² — exact equality); net-vs-gross wall volume gap quantified (4.8 vs 4.062 m³) with proposed `opening-void-volume` reconciliation (semantic-comparison.md §2). |
| Validation | **PROVEN** | 7 mandatory negative cases + 2 engineered discrimination variants ALL fail closed with typed reason codes and zero emitted geometry/quantities (negative-tests.md; `results/negative-cases.json`). |
| Provenance | **PROVEN** | Every response carries provider/kernel/binding/authoring/python/platform identities + `inputDigest` + `adapterSourceDigest`; kernel version cross-checked against the binary; replayable (identical digests). |
| IFC/BIM | **DEFERRED** | Owned by GBIM-002 per the work-order split; this port deliberately carries no IFC — nothing claimed, nothing hidden. |
| Rendering | **DEFERRED** | Owned by GBIM-003; the spike port emits numbers, not scenes; rendering-only differences structurally cannot alter identity/quantities/validation. |
| Direct/NL equivalence | **PARTIAL** | The port is intent-origin-agnostic BY CONSTRUCTION (it consumes the same neutral operation shape the direct-manipulation and agent paths compile to; AISE `origin` vocabulary untouched) — but no NL-authoring equivalence test was executed inside this spike's ten-op gate; honest gap, not a silent pass. |
| Negative/discrimination | **PROVEN** | Harness catches every declared divergence, including the engineered ones the DECLARED relation cannot see (neg-002b geometric containment, neg-004b geometric connectivity) and the guard-level corruption (neg-007, four typed refusals). |
| Historical replay | **PROVEN** | Provider physically removed (`mv occt_adapter.py → .disabled`) and externalReferences deleted — canonical record remains fully interpretable with pure-stdlib validation; canonical quantities cross-check exactly against the unmodified engine (historical-replay.md, 4/4 steps OK). |
| Licensing/use | **PROVEN** | OCCT LGPL-2.1-with-exception (arms-length process-boundary use documented), CadQuery Apache-2.0, OCP wheel redistributes OCCT under upstream terms; FreeCAD REFUSED for sandbox install-path only (no license blocker found). Documented BEFORE any adoption (provenance.md §4). |
| Performance | **PROVEN** | Deterministic benchmark (10 ops ≈ 52 ms kernel time; digests identical) + observed runtime (≈1.9 s cold process incl. kernel import; ≈476 MB peak RSS) vs engine lane <100 ms — trade-off stated, not hidden (provenance.md §3). |
| Maintainability | **PROVEN** | Adapter ≈ 700 lines Python + ≈ 200 lines stdlib guard; process boundary keeps the AISE side at zero new runtime dependencies; fully replaceable (FreeCAD or raw-OCP path would implement the same JSON contract). Caveat stated: the provider-side venv is ~1.8 GB with the CadQuery pin — the DEFERRED authoring-layer decision (recommendation.md §5) exists precisely to shrink it. |

**Gate result:** the exact-kernel lane passes the acceptance sheet with
every in-scope dimension PROVEN, two sibling-owned dimensions honestly
DEFERRED, and one (Direct/NL equivalence) PARTIAL for an untested — not
failed — sub-claim. No dimension REFUSED except FreeCAD's sandbox install
(a toolchain-honesty refusal, not a product verdict).

**Fork gate (charter §6):** all four fork tests FAIL to hold →
**ADAPT, DO NOT FORK** (recommendation.md).
