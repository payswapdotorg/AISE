# GBIM-001 — Exact Geometry Kernel Spike (evidence tree)

**Work item:** GBIM-001 (issue #11, parent #10) — exact geometry: OCCT +
CadQuery/OCP comparison.  
**Base SHA:** `0bb8c87898ee59ceb5c37784078d7f6bcce82f10` (branch
`gbim001/geometry-spike`).  
**Charter:** `docs/geometry-bim-technology-spike-2026-09-25.md` · work
order: `docs/geometry-bim-spike-work-orders-2026-09-25.md` §GBIM-001 ·
scorecard sheet: `docs/geometry-bim-spike-scorecard-2026-09-25.md`.

## Index

| file | content |
|---|---|
| `PORT.md` | the smallest provider-neutral geometry port (the spike's core proposal) |
| `fixture-mapping.md` | GBIM-000 fixture → neutral ops + declared placement policy + negative mutations |
| `adapter-notes.md` | toolchain evaluation + adapter architecture + honest limitations |
| `semantic-comparison.md` | OCCT exact measurements vs current AISE engine behavior, divergences D-1…D-5 |
| `negative-tests.md` | the 7 mandatory + 2 engineered fail-closed cases |
| `provenance.md` | provider identities/versions/digests, reproducibility, performance, licensing |
| `historical-replay.md` | remove-provider / delete-external-refs / cross-check proof (4 steps) |
| `recommendation.md` | fork-gate verdict: ADAPT (no fork) + successor handoff |
| `SCORECARD.md` | the 13-dimension gate record |
| `adapter/` | the spike code (provider, canonical input builder, schema guard, harnesses) |
| `aise-reference/` | the AISE-side comparison lane (runs the REAL engine via bun) |
| `results/` | generated evidence JSON (canonical input, both OCCT runs, reproducibility, negative cases, AISE reference, historical record, replay proof) |

## Reproduce (sandbox with the persisted venv)

```
cd <repo>
/home/z/my-project/gbim001-venv/bin/python docs/productization-evidence/GBIM-001/adapter/run_fixture.py
/home/z/my-project/gbim001-venv/bin/python docs/productization-evidence/GBIM-001/adapter/negative_cases.py
bun docs/productization-evidence/GBIM-001/aise-reference/aise_reference.ts
/home/z/my-project/gbim001-venv/bin/python docs/productization-evidence/GBIM-001/adapter/replay_without_provider.py
```

Expected: guard PASS ×2, reproducible digests identical, 10/10 ops applied,
9/9 negative cases fail-closed, replay 4/4 steps OK.
