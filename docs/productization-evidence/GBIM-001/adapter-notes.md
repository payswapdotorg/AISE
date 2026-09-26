# GBIM-001 — Adapter Notes (disposable OCCT reference provider)

## 1. Toolchain evaluated

| candidate | version | install outcome | role in spike |
|---|---|---|---|
| **OCCT via OCP** (`cadquery-ocp` wheel) | OCCT **7.9.3** (final), OCCT **8.0.1** (initially installed, then downgraded by cadquery's pin) | installed from PyPI into `/home/z/my-project/gbim001-venv` (persisted, ~1.8 GB incl. transitive deps) | **the exact kernel — the evaluated path** |
| **CadQuery** (authoring layer) | 2.8.0 | installed; pins `cadquery-ocp<8.0` (hence the 7.9.3 downgrade); drags trame/vtk/casadi/nlopt/scipy/numba | **PROVEN as authoring layer** (box construction, booleans, face/edge queries) |
| **FreeCAD** | — | **REFUSED** for this sandbox: FreeCAD is conda-distributed; no pip wheel for headless python3.12 in this environment (install attempt would exceed the 30-min time-box; conda is not available). Classification is sandbox-honesty, not a product verdict — FreeCAD embeds the same OCCT kernel and remains a candidate for a desktop-integration lane (charter §6: "parametric/CAD worker, not canonical state"). |

Exact install commands (recorded verbatim):

```
python3 -m venv /home/z/my-project/gbim001-venv
/home/z/my-project/gbim001-venv/bin/pip install --no-cache-dir cadquery-ocp     # → cadquery-ocp 8.0.1.0.0 (OCCT 8.0.1)
/home/z/my-project/gbim001-venv/bin/pip install --no-cache-dir cadquery        # → cadquery 2.8.0 + cadquery-ocp 7.9.3.1.1 (OCCT 7.9.3)
```

Both kernel versions computed the canonical wall volume as exactly 4.8 m³
before the downgrade; the final adapter runs the CadQuery-pinned 7.9.3
stack. Version provenance is inside every provider response
(`provenance.kernelVersion`), cross-checked against the binary
(`strings OCP…so | grep 7.9.3` → `7.9.3.1`).

## 2. Adapter architecture (`adapter/occt_adapter.py`)

- **Out-of-process provider.** The adapter is a standalone Python process
  reading the canonical input (stdin/file) and writing the response to
  stdout. The kernel types stay inside the process — the port boundary is
  serialized JSON (see PORT.md §1).
- **Gate order mirrors the AISE engine** (`packages/solution-engine/src/apply.ts`):
  1. input sanity (`input-contract-violation`)
  2. duplicate operation identity (`duplicate-operation-identity` — whole-input refusal)
  3. capability gate (`unsupported-operation` — family named BEFORE any geometry)
  4. parameters (`missing-required-parameter`, `dimension-not-positive`)
  5. semantic/host (`opening-host-unresolved`, `opening-outside-host-wall`,
     `wall-thickness-impossible`, `footing-disconnected`,
     `footing-support-unresolved`, `door-opening-missing`, `revision-target-missing`)
  6. exact geometry + measurement
  7. topology validity (`BRepCheck_Analyzer`; invalid BRep would fail closed)
- **Deterministic state.** Scene state (walls, voids, panels, columns) is
  re-derivable: the wall is rebuilt from `base − Σ current voids` on every
  opening change; revise-opening reuses the pristine base for void-volume
  truth. No randomness anywhere; two identical runs produce byte-identical
  deterministic projections (provenance.md).
- **Exact measurement APIs**: `BRepGProp.VolumeProperties_s` (volume),
  `BRepGProp.SurfaceProperties_s` (surface area),
  `BRepBndLib.AddOptimal_s` (tight bounding box), `BRepCheck_Analyzer`
  (BRep validity), `TopExp_Explorer` counts (solids/shells/faces/edges/
  vertices), shell `Closed()` flags (manifold check), `Shape.intersect`
  (removed-material truth for openings).
- **Engineered divergence injection:** `--self-corrupt` deliberately
  breaks the response shape (unknown fields, string-for-number, a fake
  `TopoDS_Shape` handle) so the AISE-side guard's `contract-mismatch`
  refusal is exercised for real (neg-007).

## 3. AISE-side harness (`adapter/run_fixture.py`, `schema_guard.py`)

- `run_fixture.py` builds the canonical input, invokes the provider twice
  as separate subprocesses, validates both responses through the guard,
  writes `results/occt-run-{1,2}.json`, the reproducibility record and the
  AISE-shaped historical record.
- `schema_guard.py` is the D26-style projection guard: closed field sets,
  closed status vocabularies, finite-number checks, applied-vs-invalid
  shape rules, unit-required rule for quantities. Provider-free (stdlib)
  so it doubles as the historical-record validator.

## 4. Honest adapter limitations

- Element placement comes from the declared policy, not from Reality Graph
  anchors — the spike fixture has no anchors; production would need the
  full `OperationTarget` anchor discipline.
- One wall, one column, one footing, one beam, one partition — the fixture
  is a single room; no multi-storey, no curves (OCCT handles both; out of
  spike scope).
- The door/window leaf/glazing thicknesses are declared assumptions
  (50/40 mm), versioned with the placement policy.
- Boolean cut tools are oversize boxes through the wall (margin 0.05 m) —
  the REMOVED MATERIAL is measured exactly via base∩void, so quantities
  are not polluted by the margin.
- The adapter is single-shot (state lives only within one process run);
  AISE-side long-lived sessions would need a supervised provider daemon —
  a production concern, not a spike concern.
