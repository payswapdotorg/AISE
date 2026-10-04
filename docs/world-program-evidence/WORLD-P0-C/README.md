# WORLD-P0-C — the world-solution substrate contracts (evidence)

**Item:** WORLD-P0-C — Solution-layer + desktop substrate contracts.
**Base:** `8440d0c` (the pinned WORLD-P0-B-complete state; the P0-C
gate was OPEN at this commit).
**Branch:** `work/WORLD-P0-C`.
**Deliverable:** `packages/world-solution-substrate/` — the
substrate-neutral typed adapter contracts for the Layer-3 solution
world + the desktop shell, plus this evidence directory.

**Status:** contracts proven implementable WITHOUT their substrates;
FreeCAD 1.0.0 was OBSERVED headless in-sandbox (measured, this
directory) but NOT INTEGRATED — P0 defines the ports; WORLD-P3 wires
the solution-game-loop occupants and WORLD-P5 the desktop packaging.

## What was delivered

`@aise/world-solution-substrate` (six public faces) composes the
sibling P0-A/P0-B contract types into Solution-layer operations:

- **`src/seam.ts`** — the shared Solution-lane law layer: the ten seam
  laws (substrate ids are namespaced external labels —
  freecad-document/freecad-object/usd-path/gltf-part/sidecar-process —
  never canonical identity; the canonical Solution Graph stays the only
  authority; unsupported is recorded, never computed; tolerances are
  declared, never implicit; determinism; ghost-distinctness end-to-end;
  the thin-shell law; no second desktop authority), the digest
  discipline, the HFX-000 failure vocabulary re-use, provider
  descriptors + per-result provenance, the non-interference guard.
- **`src/scene/`** — the Solution scene-usage contract
  (`solution.scene-usage/1`): presents proposed/ghost state through the
  P0-A Babylon scene-runtime port with the ghost law enforced
  end-to-end (structural verification BEFORE any substrate call; pick
  identity guard at the last hop back to AISE), what-if variants
  through the P0-A USD composition port (explicit AISE-side selection;
  pathBindings law; composed-identity and un-ghosting tripwires), and
  solution assets through the P0-A glTF delivery port (fail-closed
  whole-presentation delivery). TWO in-memory substitution doubles
  (direct eager orchestration vs plan/execute) over the P0-A in-memory
  port doubles — the layered zero-substrate proof.
- **`src/cad/`** — the parametric CAD adapter contract
  (`cad.parametric/1`, FreeCAD the reference implementation): typed
  model create/mutate/query with closed sketch/feature vocabularies and
  the numeric-requires-a-unit discipline; the documented deterministic
  FreeCAD object-name projection (external labels only); the
  derived-shape table projection into the P0-B exact-geometry
  vocabulary with the DECLARED tolerance carried verbatim (the adapter
  never computes predicates); glTF export into the P0-A delivery
  vocabulary and IFC export into the P0-B interpretation vocabulary.
  TWO independent doubles (direct document model vs journaled
  replay/recompute) with byte-identical outputs.
- **`src/simulation/`** — the execution-simulation contract
  (`simulation.execution/1`): deterministic 4D typed transforms over
  the CANONICAL Solution Graph + EngineeringOperation vocabulary (the
  tests simulate the committed solution-contract wire fixtures decoded
  through the shared codec): completion-before sequencing, the DAG
  discipline, declared-duration and declared-clock laws, time-anchored
  world states tied to the canonical proposed-state layer chain, and
  simulated-progress capture entering the Outcome lane as PROPOSED
  (structurally — CONFIRMED is unrepresentable). The port has NO
  write-back (structural authority law). TWO independent doubles
  (boundary-set iteration vs grouped event sweep).
- **`src/desktop/`** — the desktop shell integration contract
  (`desktop.shell/1`): shell lifecycle state machine, window/view
  state (the closed product-lane vocabulary + the substrate-neutral
  world camera), and typed sidecar spawn/query/teardown for the
  OCCT/IfcOpenShell/FreeCAD heavy substrates with the idempotent
  teardown and no-orphans shutdown report. TWO doubles MODELING the
  two shell candidates (Tauri-like direct state model vs
  Electron-like event-queue reducer) with identical observable
  behavior.
- **`src/substitution.test.ts`** — the technology-substitution
  three-laws battery across all four families + the cross-cutting
  identity and authority laws.

## Gates (all green at the delivery tree)

1. **Baseline preserved + the new battery:** `bun run verify` PASS;
   `bun test` **6824/6824** (the 6705 baseline preserved exactly plus
   this package's 119 new tests: seam 12 / scene 21 / cad 27 /
   simulation 27 / desktop 14 / substitution 18); typecheck over all
   13 workspace tsconfigs, eslint clean, boundaries scan 1170 files
   with no cross-zone violations.
2. **Substitution law honored:** every family is proven implementable
   by two independent in-memory doubles with byte-identical outputs at
   every comparison point; no substrate type or ID leaks into
   canonical AISE meaning (drilled: the pick identity guard, the
   composed-identity tripwire, the FreeCAD external-label law, the
   seam's collision guard).
3. **License matrix recorded BEFORE adoption:** LICENSE-MATRIX.md
   (FreeCAD LGPL-2.0-or-later "LGPL2+" verified from the executed
   AppImage's bundled license text + runtime banner, with the
   sidecar-isolation analysis; Tauri/wry Apache-2.0 OR MIT, tao
   Apache-2.0, verified live from crates.io; Electron MIT verified
   from the repo's own installed lockfile version).
4. **Honesty laws:** the FreeCAD observations are NOW-measured numbers
   with probe scripts + JSON transcripts + checksums; the two real
   findings (the silent IFC-export no-op in headless FreeCAD; the
   mm-native unit discipline) are recorded as findings, never papered
   over; every unmeasurable lane is declared BLOCKED with its
   protocol.
5. **Evidence committed:** this directory (4 md + 6 transcript
   artifacts).

## Evidence shape

| File | Content |
| --- | --- |
| `README.md` | this index |
| `LICENSE-MATRIX.md` | the per-substrate license/use matrix (gate 3, recorded before adoption) |
| `DESKTOP-SHELL-DECISION.md` | the evidence-based Tauri vs Electron-thin-shell decision record with conditions and the WORLD-P5 re-decision trigger |
| `CAPABILITY-BOUNDARIES.md` | per substrate: can/cannot for the Solution lane, explicit non-goals, what stays behind the adapter |
| `PERFORMANCE-OBSERVATIONS.md` | the NOW-measured FreeCAD 1.0.0 headless numbers with method; the deterministic battery counts; the honest BLOCKED lanes with protocols |
| `transcripts/freecad-headless-parametric-probe.json` | FreeCAD 1.0.0 FreeCADCmd headless: version, timings, parametric rebuild semantics, external-label carriers, topology |
| `transcripts/freecad-export-probe.json` | the export probe: STL export measured; the silent IFC no-op finding; ifcopenshell-in-AppImage; glTF absence |
| `transcripts/cad_probe.py` / `cad_export_probe.py` | the exact probe scripts (method reproducibility) |
| `transcripts/freecad-stl-export-sample.stl` | the measured STL export artifact (684 bytes, checksummed) |

## Honesty bounds

- No substrate is integrated, imported, or required by the package at
  runtime — the FreeCAD measurement runs are evidence, not
  dependencies; the FreeCAD AppImage is a publicly re-downloadable
  release artifact, not committed evidence.
- The desktop-shell decision cites ONLY officially documented numbers
  where it does not measure (labeled per line); nothing about real
  shells was executed in this sandbox (no display, no webview, no Rust
  toolchain — declared, with the WORLD-P5 protocol).
- The in-repo doubles prove CONTRACT implementability, never substrate
  performance; no double-derived number is presented as a substrate
  measurement.
