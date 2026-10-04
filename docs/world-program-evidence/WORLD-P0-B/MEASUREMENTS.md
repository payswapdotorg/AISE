# WORLD-P0-B — the real-substrate measurements (NOW-measured)

**Honesty law (the ANCHOR doctrine, unchanged):** every number below was
measured by the re-measurement runs at re-delivery time against the
committed fixtures, with the toolchain and fixture digests recorded in
each transcript. Nothing is copied from any earlier run. The transcripts
are the primary record; this file is the readable index.

## Measurement protocol

- **Fixtures:** the EXACT in-repo constants the contract tests drill,
  extracted programmatically from the package source (never re-typed):
  - `minimal-semantic-model.ifc` — sha256
    `d5be93d5d8ae79b4c30f40c6f3d46607e4b76eac717ac075a27a6b1c2526ecb8`
    (2770 bytes)
  - `geometry-fixture.json` — sha256
    `468946518758900fa4c7cbc3e9e524d63f309a5d555e483dac7a5780cc4af816`
    (10 shapes)
  - `field-fixture.json` — sha256
    `3e13495bd2434eaedfeef563ed3909fb3147c967a60cf2544e3b3a04e5f208fe`
    (9 samples)
- **Toolchain (substrate-venv, recorded per transcript):** CPython
  3.12.14; ifcopenshell **0.9.0**; cadquery-ocp **8.0.1.0.0** (the OCCT
  8.0.1 OCCT kernels through OCP); vtk **9.6.2**.
- **Method:** each family's fixture was fed to the real engine through
  its public kernel APIs (typed entity access for IFC, B-Rep kernels for
  OCCT, filters/arrays for VTK); the value each engine returned is the
  value recorded. Where a kernel does not exist (the L1 norm) or rejects
  the input shape (2-component vectors), the fallback method is recorded
  verbatim in the transcript — the honest method note, never a silent
  substitution.

## The measured agreement table

The contract's substitution doubles hand-compute the fixture facts in
pure TypeScript; the real engines measured the same fixtures through
their real kernels. Agreement is exact, value for value:

### IFC interpretation (ifcopenshell 0.9.0)

| Fact | Contract (doubles) | Real engine (NOW) |
| --- | --- | --- |
| schema identifier | `IFC4` | `IFC4` |
| entity census | 37 statements | 37 entities |
| spatial tree (project→site→building→storey) | 4 nodes, GUIDs + names as committed | identical (4/4) |
| elements (wall/slab/opening/door) | 4, GUIDs + names as committed | identical (4/4) |
| storey containment edge | #23, 4 related GUIDs | #23, identical list |
| Pset_WallCommon | IsExternal=true, LoadBearing=false, ThermalTransmittance=0.35 | `true`, `false`, `0.35` |
| relationship counts | aggregation 3, containment 1, voiding 1, property-definition 2, classification 1 | 3 / 1 / 1 / 2 / 1 |
| classification association | #42 → wall #13, code `23.27.10.11.11.24.11` at slot 0 of #41 | #42 → #13, slot 0 carries the same code string (see finding 1) |

### Exact geometry (OCCT 8.0.1 via OCP)

| Operation | Contract (doubles) | Real engine (NOW) |
| --- | --- | --- |
| box volume (solid-0) | 30 | 30.0 (BRepGProp::VolumeProperties) |
| polygon area (face-0) | 16 | 16.0 (BRepGProp::SurfaceProperties) |
| segment length (edge-1) | 13 | 13.0 (GCPnts_AbscissaPoint) |
| distance point-point (vertex-0/1) | 5 | 5.0 (BRepExtrema) |
| distance point-segment (vertex-2/edge-0) | 4 | 4.0 (BRepExtrema) |
| containment verdict (vertex-3, inside) | `true` | point-to-face distance 0.0 → `true` |
| containment verdict (vertex-4, near boundary) | `within-tolerance` | distance 0.001 ≤ declared 0.01 → `within-tolerance` |
| containment verdict (vertex-5, outside) | `false` | distance 8.48528… > 0.01 → `false` |

### Scientific field (VTK 9.6.2)

| Operation | Contract (doubles) | Real engine (NOW) |
| --- | --- | --- |
| extent | 14 | 14.0 (vtkDataArray::GetRange → [0, 14]) |
| mean | 7 | 7.0 (vtkImageAccumulate::GetMean) |
| norm-l1 | 63 | 63.0 (reduction over vtkDataArray::GetTuple — VTK ships no L1-norm filter; method recorded) |
| integral | 28 | 28.0 (vtkIntegrateAttributes, this wheel's FiltersParallel module) |
| vector-magnitude @ node 5 | 5 | 5.0 (vtkVectorNorm) |
| divergence @ node 4 | 5 | 5.0 (vtkGradientFilter ComputeDivergence, central differences) |

**Measured agreement: 22 of 22 compared facts, exact.** The substitution
doubles' arithmetic is the real engines' arithmetic on the same fixtures.

## The measured findings (honest records, never papered over)

1. **The IFCCLASSIFICATIONREFERENCE #41 fixture-order finding.** The
   fixture writes
   `#41=IFCCLASSIFICATIONREFERENCE('23.27.10.11.11.24.11','Walls',$,#40,$)`
   and the corpus documents slot 0 as `Identification`. ifcopenshell
   0.9.0 parsing under IFC4 reads slot 0 as **`Location`** (the IFC4
   IfcExternalReference attribute order is Location, Identification,
   Name): measured `Location='23.27.10.11.11.24.11'`,
   `Identification='Walls'`, `Name=None` (transcript:
   `ifcopenshell-classification-ref-probe.json`, get_info dump). The
   OmniClass code VALUE is recoverable at slot 0 in both readings, so the
   doubles' slot-0 extraction yields the intended code; the divergence is
   the schema-level attribute NAME of the slot. Recorded for the future
   real-occupant wiring: the adapter must map by POSITION with the IFC4
   schema order, not by the 2x3-flavored name order.
2. **The IFCELEMENTQUANTITY 7-attribute reading.** The fixture's `#35`
   carries the IFC2x3-flavored seven attributes (a `Units` slot at
   position 5); IFC4's IfcElementQuantity has six. ifcopenshell 0.9.0
   measured `Quantities = None` (the typed reader takes slot 5, which the
   fixture fills with `$`) and refuses raw slot-6 access
   (`get_argument(6)` → engine error, recorded verbatim). The property-set
   side (IfcPropertySet, 5 attributes) reads perfectly. Finding recorded:
   a future fixture revision may drop the `Units` slot; the contract's
   documented slot table stands as the in-repo convention.
3. **Engine iteration order is NOT statement order.** Iterating the file
   yields ifcopenshell's internal hash order (measured first-to-last: 42,
   41, 40, 39, …, 1, 30, 14…24) — not the STEP statement order. The
   contract's extraction order derives from the STEP text itself (both
   doubles parse statement order), so no engine iteration order can leak
   into AISE semantics; the measurement confirms this discipline is
   required, not stylistic.
4. **VTK's vector kernels are 3-component-first.** The fixture's vector
   samples are 2-component `(u, v)`; vtkVectorNorm on the 2-component
   array emits `No vector norm to compute!` and vtkGradientFilter skips
   divergence with `Input array must have exactly three components`
   (both recorded verbatim in the transcript). The measurement pads
   `z=0` — exact for the 2D field — and this padding is an
   adapter-boundary duty recorded for the real-occupant wiring.
5. **vtkIntegrateAttributes ships in FiltersParallel** in the vtk 9.6.2
   wheel (not FiltersGeneral); the import path is recorded in the
   transcript.
6. **vtkVectorNorm's output array is unnamed** (fetched positionally;
   `GetArrayName(0)` is `None`) — an integration detail recorded for the
   future wiring.
7. **web-ifc (the browser-runtime alternative) is reviewed, not
   measured:** its license (MPL-2.0, npm registry `web-ifc@0.0.78`,
   verified at re-delivery time) is recorded in LICENSE-MATRIX.md; no
   browser measurement lane exists in this sandbox — declared, not
   computed.

## What these measurements are NOT

- They are not integration: the package imports none of these engines;
  the runs live in the measurement scripts and transcripts only.
- They are not performance benchmarks: no timings are recorded and the
  profile tables stay honestly empty.
- They are not a capability claim over real production IFC files: the
  fixture is the committed minimal model; real-world corpus variance is
  future-occupant scope (P1/P2 measurement protocol).
