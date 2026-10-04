# WORLD-P0-C — performance observations (measured-in-sandbox, method + numbers)

**Honesty laws (ANCHOR doctrine):** every number below was MEASURED in
this sandbox at delivery time with the method recorded; every lane that
could not be measured is declared BLOCKED with the protocol that would
settle it. ZERO fabricated numbers — no number is copied from any
earlier run, sibling item or vendor claim. Where a figure is officially
documented rather than measured, it is labeled as such and cited.

## Measured lane 1 — FreeCAD 1.0.0 headless (the parametric CAD reference)

**Toolchain (verified in-sandbox):** FreeCAD 1.0.0 conda AppImage
`FreeCAD_1.0.0-conda-Linux-x86_64-py311.AppImage` (679,702,928 bytes,
sha256 of the download verified during transfer by HTTPS; build 39109
(Git), commit `2fcc5317fe3aee96ca73475986a577719fc78e20`, 2024-11-18),
extracted with `--appimage-extract` (no FUSE), executed via
`squashfs-root/usr/bin/freecadcmd` (headless, no GUI, no display),
bundled Python 3.11.9. Host: x86_64 Linux (Debian trixie-class
sandbox), CPython 3.12.14 as the orchestration shell.

**Method:** the probe scripts
(`transcripts/cad_probe.py`, `transcripts/cad_export_probe.py`) drive
the FreeCADCmd scripting surface with `time.perf_counter()` brackets;
each run was executed twice (the transcripts are the second runs —
first runs warm the module cache; both runs' outputs were compared and
the semantic values were identical). Full payloads:
`transcripts/freecad-headless-parametric-probe.json`,
`transcripts/freecad-export-probe.json` (sha256 recorded below).

**Numbers (the parametric probe):**

| Measurement | Value |
| --- | --- |
| `import FreeCAD` (preloaded in FreeCADCmd) | 0.0 ms |
| 4-segment rectangle sketch + 2 constraints (`Sketcher::SketchObject`) | 291.1 ms (first-use module init included) |
| `PartDesign::Pad` define + `Profile` bind + `Length = 3.0` | 9.3 ms |
| `doc.recompute()` (sketch + pad, cold) | 25.9 ms |
| `doc.recompute()` after `Length = 4.0` (parameter-change rebuild) | 2.2 ms |
| Pad volume at Length=3 | 15.0 (mm³ — FreeCAD-native units) |
| Pad volume at Length=4 | 20.0 (mm³) |
| Bound box (Length=4) | x 0..5, y 0..1, z 0..4 (mm) |
| Topology of the pad solid | 8 vertices / 12 edges / 6 faces |
| `pad.Length` read-back | value 4.0, unit `Unit: mm (1,0,0,0,0,0,0,0) [Length]` |

**Cross-check against the P0-C CAD substitution double (the exactness
proof):** the SAME fixture (a 5×1 rectangle sketched on the XY plane at
the origin, padded by 4 along +Z, in meters) projects through the
in-repo double's derived-shape table to the box
`min (0,0,0) / max (5,1,4)` with volume **20** — and the real FreeCAD
measured box `0..5 × 0..1 × 0..4` with volume **20.0**. The
double's documented closed-form projection and the real engine's
measured geometry AGREE on the fixture (different unit scales:
FreeCAD-native mm vs the contract's declared m — mapped by the adapter
lane, not by the contract).

**Numbers (the export probe):**

| Measurement | Value |
| --- | --- |
| Mesh/STL export of the pad (`Mesh.export`) | 14.8 ms, output 684 bytes (sha256 `77c07504…`, sample committed) |
| IFC export `Import.export([pad], '*.ifc')` | returned in 4.1–15.1 ms but produced NO FILE (silent no-op — see the finding below) |
| ifcopenshell inside the AppImage | importable, version 0.7.0 |
| Core glTF exporter presence | none (probe negative) |

**Measured finding (recorded honestly, never papered over):** FreeCAD
1.0.0 headless `Import.export(..., '.ifc')` silently produced no output
file for a bare `PartDesign::Pad`, a `Part::Box`, AND an
`Arch.makeWall` object (no exception, no file; verified with absolute
paths and a re-run). The real-adapter IFC lane therefore needs
BIM-context objects or direct IfcOpenShell API usage — handed to
WORLD-P3 as the recorded direction, NOT as a P0 defect (the P0
contract's IFC export lane is proven by the in-repo double's round-trip
through the P0-B interpretation port).

## Measured lane 2 — the in-repo contract battery (deterministic, no substrate)

**Method:** `bun test packages/world-solution-substrate/` on the
delivery tree (Bun 1.3.14); durations are wall-clock of the full suite
run (not contract outputs — determinism is asserted by content
equality, never by timing).

| Measurement | Value |
| --- | --- |
| New package test battery | 119 tests / 6 files, 619 expect() calls, ~0.20–0.22 s wall |
| Full repo battery (baseline preserved) | 6705 baseline + 119 new = 6824/6824 pass, ~23 s wall |
| Verify gate | typecheck (13 workspace tsconfigs) + eslint + boundaries: PASS |
| Boundary scan | 1170 source files, 0 cross-zone import violations |

**Sandbox environment note (recorded for reproducibility, not a
contract fact):** the initial verify run in this sandbox FAILED
typecheck on `backend/api/src/main.ts` (`"SIGINT" is not assignable to
'"memoryPressure"'`) — diagnosed as an artifact of the sandbox's
directory layout: the repo was initially nested inside a parent
directory carrying an unrelated `node_modules/@types/node@25`, which
TypeScript's ancestor-walk picked up for global `process` typing. The
identical tree (base commit + this package + this lockfile diff)
typechecks CLEAN in a location without a polluting ancestor
(reproduced both ways in this sandbox; the delivery tree now lives at
a clean path). No repository file was modified to work around it — the
base tree's own gates pass as-is in a clean checkout, which is what
the TL's reconstruction will see.

## BLOCKED lanes (declared honestly — measurement protocols recorded)

1. **BLOCKED: real desktop-shell measurements (Tauri AND Electron).**
   Reason: this sandbox has no display server, no webview runtime and
   no Rust toolchain; no real shell binary was executed (the in-repo
   doubles model contract behavior only). Protocol for WORLD-P5: at a
   station with a display, run BOTH shell candidates against the SAME
   `desktop.shell/1` scripted session — measure (a) installer size,
   (b) idle + world-loaded RSS (Babylon scene of the committed
   fixtures), (c) sidecar spawn/teardown wall time for the
   OCCT/IfcOpenShell/FreeCAD `SidecarSpec`s, (d) per-platform WebGPU
   device creation through each candidate's webview (Windows/macOS/
   Linux), (e) the shutdown no-orphans check under forced kill.
2. **BLOCKED: WebGPU availability per platform webview.** Reason: no
   display/webview (see the decision record §2 for the officially
   documented status with citations, all labeled documented-not-
   measured). Protocol: as (d) above, plus recording the exact
   WebView2/WKWebView/WebKitGTK/Electron-Chromium versions at the
   measurement station.
3. **BLOCKED: Babylon.js scene-runtime performance.** Reason: the
   usage contract composes the P0-A port; GPU behavior is WORLD-P3's
   measurement lane (the P0-A evidence records the same boundary).
   Protocol: WORLD-P3's game-loop lane — load the committed fixture
   scenes through the real Babylon adapter, measure frame time /
   draw calls / pick latency at the world scales P3 defines.
4. **BLOCKED: OCCT/OCP and IfcOpenShell direct re-measurement.** The
   P0-B evidence (`docs/world-program-evidence/WORLD-P0-B/MEASUREMENTS.md`)
   already measured these substrates at THIS program's fixture scale;
   this item consumed their contracts and did not re-measure (no
   duplicated numbers here — see the P0-B record). Protocol: re-run
   the P0-B measurement scripts against the CAD-sidecar deployment
   shape (process boundary + IPC) at WORLD-P3, adding the
   spawn/IPC-overhead brackets that the sidecar model introduces.

## Transcript checksums (evidence integrity)

| Artifact | sha256 |
| --- | --- |
| `transcripts/freecad-headless-parametric-probe.json` | `ae94ef3d5fa40417e41d2f8f53ca7c75fd97d546d11ef4d028258a71dc98e8e9` |
| `transcripts/freecad-export-probe.json` | `c844afba3bd178fdac5646bdf9957c8d6b85e2416dbe153929748e5b321aa078` |
| `transcripts/cad_probe.py` | `69befacf9dee6c3b94f008453354392f18d533c3775c2c462ce44fd56c938a74` |
| `transcripts/cad_export_probe.py` | `981f750afda4729e063475258978ef1ac46ff414b2366b21e550468766d4e763` |
| `transcripts/freecad-stl-export-sample.stl` | `77c07504535ad099c6f8422f3d496b15c894a76d8d9f777e1705eb96af1b90c5` |

(The FreeCAD AppImage itself is 679,702,928 bytes; it is a publicly
re-downloadable release artifact, not committed evidence.)
