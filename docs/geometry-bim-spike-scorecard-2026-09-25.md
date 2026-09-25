# AISE — Geometry / BIM Spike Scorecard
**Purpose:** common acceptance sheet for GBIM-001/002/003.

| Dimension | Evidence required | Pass condition |
|---|---|---|
| Canonical semantics | operation/state mapping | provider does not redefine AISE meaning |
| Exact geometry | dimensions/volume/area/topology | values are reproducible and differences are declared |
| Quantities | quantity derivation | same operation fixture yields semantically compatible quantities |
| Validation | invalid/unsupported cases | fail closed; no fabricated geometry or approval |
| Provenance | provider/version/config/input digests | complete and replayable |
| IFC/BIM | import/export/round trip | mapping is explicit; losses are visible |
| Rendering | 2D/3D interaction | presentation-only; no authority leakage |
| Direct/NL equivalence | operation identity | same semantic operation for equivalent intent |
| Negative/discrimination | engineered divergences | harness catches each declared divergence |
| Historical replay | remove provider | canonical records remain interpretable |
| Licensing/use | official terms | posture documented before adoption |
| Performance | deterministic benchmark + observed runtime | tradeoffs documented, not hidden |
| Maintainability | dependency/API surface | adapter boundary remains small and replaceable |

## Decision vocabulary
- PROVEN — evidence satisfies the declared gate.
- PARTIAL — useful evidence exists, but a required dimension remains unproven.
- DIVERGENT — candidate differs materially; difference is captured.
- REFUSED — candidate cannot be evaluated safely or lawfully for the intended use.
- DEFERRED — useful but not yet justified for production adoption.

The scorecard is not a ranking system. It is a gate/evidence record.