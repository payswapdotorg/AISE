# GBIM-001 — Provider Provenance, Reproducibility, Performance

## 1. Provenance (recorded inside EVERY provider response)

| field | value |
|---|---|
| providerId | `occt-cadquery-spike` |
| kernel | OpenCASCADE Technology (OCCT) |
| kernelVersion | **7.9.3** (cross-checked against the OCP binary: string `7.9.3.1`; wheel `cadquery-ocp 7.9.3.1.1`. OCCT 8.0.1 was also installed and verified first — see adapter-notes.md §1) |
| binding | cadquery-ocp 7.9.3.1.1 |
| authoringLayer | cadquery 2.8.0 |
| pythonVersion | 3.12.14 |
| platform | Linux x86_64 |
| inputDigest | `sha256:3a0c8d2ff1879f4369feca650933eaa7e512edb9c57e499dd43105ef52ca5887` (canonical input incl. fixture + `gbim001-placement-policy/1`) |
| adapterSourceDigest | `sha256:c94851c048021d239dce11e0b6a46e257dbb9987b731bcbfb139e625684c714d` (sha256 of `occt_adapter.py` itself — the config digest) |
| sceneStateDigest (run 1) | `sha256:0c915714275fbbf394519a72e37395ac41daef0230d7732ea44f2b165ce12bc3` |

Install provenance: PyPI wheels into `/home/z/my-project/gbim001-venv`
(persisted volume; ~1.8 GB with transitive deps). Exact commands in
adapter-notes.md §1.

## 2. Reproducibility

**Claim:** the provider is a pure function of its input — byte-identical
input JSON → byte-identical deterministic projection.

**Method** (`adapter/run_fixture.py`): two SEPARATE provider processes,
identical canonical input; digests computed over the response with
non-deterministic fields excluded (`executionId`, `executionTimeMs` —
performance observations, not semantics).

| run | deterministic digest |
|---|---|
| run 1 | `sha256:d189ea5aaa251862ce143fdc65f0cfb16e1a0d9de818c3d964846ed3b9f0bed9` |
| run 2 | `sha256:d189ea5aaa251862ce143fdc65f0cfb16e1a0d9de818c3d964846ed3b9f0bed9` |

**Result: identical** — all ten operations, all measurements, all
quantities, all validation checks, the scene-state digest and the
provenance digests reproduce exactly. Recorded in
`results/reproducibility.json`.

Caveat (honest): floating-point determinism is asserted for THIS
kernel/binding/platform combination; cross-version or cross-platform
relocation of e.g. `BRepGProp` summation order is not claimed. The port
therefore carries versions + digests in every response — a future
production lane would pin them exactly like the existing
`tools/geometry-eval/scenario.json` pins (`engineCodeVersion`,
`substituteImplementationVersion`).

## 3. Performance / resource observations (this sandbox, single run)

| metric | value |
|---|---|
| per-op kernel time (after warm import) | op-001 wall 1.99 ms · op-002 opening+cut 10.96 ms · op-003 door 0.85 ms · op-004 window+cut 16.11 ms · op-005 column 0.77 ms · op-006 footing 1.41 ms · op-007 slab 1.30 ms · op-008 beam 0.76 ms · op-009 partition 1.16 ms · op-010 revise 16.39 ms |
| total kernel time, 10 ops | ~52 ms |
| full provider process wall (cold: python + OCP import + 10 ops) | ~1.9 s |
| provider peak RSS | ~476 MB (kernel + bindings resident) |
| AISE comparison lane (bun, real engine, 4 models) | < 100 ms, ~tens of MB |

Trade-off, stated plainly (charter §4 "performance/resource observations"):
the exact kernel is ~40× slower per fixture than closed-form arithmetic
and costs ~0.5 GB resident per provider process — irrelevant for
interactive fixture-scale work, and the price of boolean truth (net
volumes, exact voids, geometric validation) that closed forms cannot
produce. A production lane keeps the closed-form models as the fast path
for the Phase-1 vocabulary and uses the exact kernel where the
engineering question needs BRep truth (openings netting, containment,
connectivity).

## 4. Licensing / use posture (official terms)

- **OCCT:** Open CASCADE Public License (LGPL-2.1 with exception) —
  https://opencascade.com/ — permits commercial use with dynamic/arms-length
  linking; the process-boundary design in PORT.md is exactly the
  arms-length consumption the license encourages. No fork required or
  performed.
- **CadQuery:** Apache-2.0 — https://cadquery.readthedocs.io/ (via PyPI
  package metadata). Permissive; no copyleft obligations on AISE.
- **OCP (cadquery-ocp wheel):** redistributes OCCT under its upstream
  license (wheel metadata: LGPL-2.1-with-exception for the OCCT runtime).
- **FreeCAD:** LGPL-2.1+ — REFUSED in this sandbox for install-path
  reasons only (conda distribution); no license blocker identified for a
  future desktop-lane evaluation.
