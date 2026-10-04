# WORLD-P0-B — the world-understanding substrate contracts (evidence)

**Item:** WORLD-P0-B — Understanding-layer substrate contracts.
**Branch:** `work/WORLD-P0-B` (base `09dd9c3`, the world-program activation
commit).
**Deliverable:** `packages/world-understanding-substrate/` — the
provider-neutral typed adapter contracts for the three Layer-2 substrate
families, plus this evidence directory.
**Status:** contracts proven implementable WITHOUT their substrates; the
real substrates are OBSERVED (measured, this directory) but NOT INTEGRATED
— P0 defines the ports, P1/P2 wire the occupants.

## What was delivered

`@aise/world-understanding-substrate` carries four surfaces:

- **`src/seam.ts`** — the shared seam: the ten AISE mapping laws, the
  canonical digest discipline (`canonicalDigestOf`, `textDigestOf`,
  `providerDescriptorDigestOf`), the namespaced external-label doctrine
  (`ifc-guid` / `ifc-step-ref` / `occt-topology` / `vtk-dataobject`), the
  closed mapping-block validator (`validateAiseMappingBlock`), the
  non-interference guard (`deepFreeze`), and the typed outcome shape
  (`SubstrateOutcome` / `refused`).
- **`src/ifc/`** — the IFC-interpretation family: request/result contracts
  (`ifc-interpretation-request/1`, `ifc-interpretation-result/1`), the
  five intent flags, the closed spatial-role / relationship-kind /
  quantity-kind / omission-kind vocabularies, the governed port
  (`interpretThroughIfcPort`), a hand-authored minimal IFC4 STEP fixture,
  and TWO independent in-memory doubles (a statement scanner and a
  character tokenizer) that both parse the fixture byte-identically.
- **`src/geometry/`** — the exact-geometry family: shape table (point /
  segment / polygon / box), the closed operation / quantity vocabularies,
  the governed port (`computeThroughGeometryPort`), and TWO independent
  doubles (direct closed-form expressions vs a generic micro-kernel
  decomposition) that agree bit-for-bit on the fixture.
- **`src/field/`** — the scientific-field family: the structured-grid
  request/result contracts (scalar + vector point data), the closed
  operation vocabulary (extent / mean / norm-l1 / vector-magnitude /
  divergence / integral / the above-threshold predicate), the
  tolerance-must-be-declared law, and TWO independent doubles (closed-form
  expressions vs decomposed accumulation kernels).
- **`src/profiles.ts`** — the six `ProviderProfile` registrations (two per
  family: reference + alternate) carrying the 15 provider-registry fields,
  including `profileDigestOf` content digests and the empty-benchmark
  honesty bound (no real measurements in the profile tables — the real
  measurements live in THIS directory).

The provider directories (`src/{ifc,geometry,field}/providers/`) are
deliberately EMPTY: P0 records the license matrix and the measured
observations BEFORE any runtime adoption; no substrate code is wired.

## Gates (all green)

1. **Baseline preserved + the new battery:** `bun run verify` PASS
   **6615/6615** (the R7 baseline 6502 plus the substrate's 113 new
   tests: seam 17 / ifc 28 / geometry 27 / field 29 / profiles 12);
   typecheck over all 11 workspace tsconfigs, eslint clean, boundaries
   scan 1134 files with no cross-zone import violations, 5 fuzz seeds
   × 1000 iterations, 0 bug marks.
2. **Substitution law honored:** every family is proven implementable by
   two independent in-memory doubles with byte-identical outputs; no
   substrate type or ID leaks into canonical AISE meaning (drilled by the
   identity-law tests: guids, TopoDS names and VTK dataobject names are
   namespaced external labels, never identity).
3. **License matrix recorded BEFORE adoption:** `LICENSE-MATRIX.md`
   (IfcOpenShell LGPL-3.0-or-later; OCCT LGPL-2.1 with the OCCT exception;
   VTK BSD-3-Clause; web-ifc MPL-2.0 verified against the npm registry).
4. **Honesty laws:** the real-engine observations in `MEASUREMENTS.md`
   are NOW-measured numbers with fixture digests and toolchain versions;
   the profiles' benchmark tables are honestly empty; the two real-engine
   divergences the measurement found (the IFCCLASSIFICATIONREFERENCE
   slot-order reading and the IFCELEMENTQUANTITY 7-attribute reading) are
   recorded as findings, never papered over.
5. **Evidence committed:** this directory (3 md + 6 JSON transcripts).

## Evidence shape

| File | Content |
| --- | --- |
| `README.md` | this index |
| `MEASUREMENTS.md` | the NOW-measured real-substrate numbers, the measurement protocol, and the measured findings |
| `LICENSE-MATRIX.md` | the per-substrate license/use matrix (gate 3, recorded before adoption) |
| `transcripts/ifcopenshell-fixture-read.json` | IfcOpenShell 0.9.0 reading the minimal IFC4 fixture: schema, entity census, spatial tree, elements, psets, relationship counts, the quantity-set reading |
| `transcripts/ifcopenshell-classification-ref-probe.json` | the IFCCLASSIFICATIONREFERENCE #41 deep probe: get_info dump, named accessors, association traversal (the fixture-order finding) |
| `transcripts/ocp-shape-kernels.json` | OCCT shape kernels on the geometry fixture: box volume, polygon area, segment length |
| `transcripts/ocp-distances-predicates.json` | OCCT BRepExtrema distances + the three containment probes classified only at the DECLARED tolerance |
| `transcripts/vtk-scalar-reductions.json` | VTK scalar reductions: extent, mean, norm-l1, integral |
| `transcripts/vtk-vector-ops.json` | VTK vector kernels: magnitude at node 5, divergence at node 4 |

## Honesty bounds

- No substrate is integrated, imported, or required by the package at
  runtime — the measurement runs are evidence, not dependencies.
- The measurement toolchain (substrate-venv: ifcopenshell 0.9.0,
  cadquery-ocp 8.0.1.0.0, vtk 9.6.2, CPython 3.12.14) is recorded per
  transcript with the fixture sha256 digests; every number was measured
  at re-delivery time and nothing is copied from any earlier run.
- The un-run/unsupported lanes (real web-ifc browser runtime, real
  ParaView pipelines, IFC geometry interpretation) are NOT measured here
  and are declared as future-occupant scope, not as capability.
