# WORLD-P0-C — the substrate license/use matrix (recorded BEFORE adoption)

Gate 3 of the world program requires the license matrix per substrate
before any runtime adoption. No substrate is adopted in P0: this matrix
is the recorded precondition for the P3/P5 wiring decisions (the Layer-3
solution game loop and the desktop packaging). Each entry records the
SPDX identifier, the verbatim citation of the license's title/notice
lines AS VERIFIED at the recorded source, the distribution compatibility
across the program's web + desktop + Android targets, the attribution
duties, the patent clauses, and the verdict with conditions.

**Verification (NOW, at delivery time):** FreeCAD's license was read
from the FreeCAD 1.0.0 conda AppImage actually executed in this sandbox
(`--appimage-extract` → `usr/share/doc/FreeCAD/LICENSE.html` and the
runtime banner); Tauri/wry/tao licenses were read live from crates.io
(`https://crates.io/api/v1/crates/<crate>` `versions[].license` fields);
Electron's license was read from the version INSTALLED in this repo's
lockfile (`node_modules/.bun/electron@44.5.1/.../package.json` +
LICENSE file). Babylon.js / CesiumJS / OpenUSD / glTF / OCCT /
IfcOpenShell / web-ifc are consumed in this item ONLY as the P0-A/P0-B
sibling CONTRACT types — no runtime dependency is introduced by this
package, so their license rows live in the sibling matrices
(`docs/world-program-evidence/WORLD-P0-A/LICENSE-MATRIX.md`,
`docs/world-program-evidence/WORLD-P0-B/LICENSE-MATRIX.md`) and are
cross-referenced below, not re-litigated.

## FreeCAD — the parametric CAD substrate (the reference implementation)

- **Version measured:** 1.0.0 (conda AppImage
  `FreeCAD_1.0.0-conda-Linux-x86_64-py311.AppImage`, build 39109 (Git),
  commit `2fcc5317fe3aee96ca73475986a577719fc78e20`, 2024-11-18;
  executed headless via `FreeCADCmd` — see PERFORMANCE-OBSERVATIONS.md).
- **SPDX:** `LGPL-2.0-or-later` — FreeCAD self-describes as **"LGPL2+"**
  (verbatim from the bundled LICENSE.html: *"The FreeCAD application is
  licensed under the terms of the LGPL2+ license, as stated below."*),
  and the license text actually bundled is the **"GNU LIBRARY GENERAL
  PUBLIC LICENSE Version 2, June 1991"** (title block, verbatim:
  *"GNU LIBRARY GENERAL PUBLIC LICENSE Version 2, June 1991 Copyright
  (C) 1991 Free Software Foundation, Inc. 51 Franklin St, Fifth Floor,
  Boston, MA 02110-1301, USA"*). The runtime banner states, verbatim:
  *"FreeCAD is free and open-source software licensed under the terms
  of LGPL2+ license."* Honest nuance: the work order's shorthand
  "LGPL-2.1+" is the community's common reading; the AppImage's own
  bundled text is the Library GPL v2 (June 1991), so the precise SPDX
  for what was verified HERE is `LGPL-2.0-or-later` ("LGPL2+"). Both
  readings are weak-copyleft, library-level, with an
  "or any later version" choice — the practical analysis below is
  identical under either.
- **Where verified:** the executed AppImage's
  `usr/share/doc/FreeCAD/LICENSE.html` and the `FreeCADCmd` console
  banner (both quoted verbatim above; transcripts in
  `transcripts/freecad-headless-parametric-probe.json`). Official
  statement mirrored at https://wiki.freecad.org/Licence .
- **Distribution compatibility (web + desktop + Android):**
  - *Server/desktop sidecar lane (the recorded direction):* FreeCAD runs
    as a LOCAL SIDECAR PROCESS — exactly the deployment the desktop
    contract's `SidecarSpec` types. Process-boundary isolation
    satisfies the LGPL's relinking/replacement duties cleanly: the end
    user can replace the whole FreeCAD sidecar binary (or run their own
    build) without touching AISE code; AISE communicates through IPC
    over the typed adapter contract, not linked calls. No AISE code is
    statically or dynamically linked INTO FreeCAD and vice versa.
  - *Server/SaaS lane:* unproblematic (no distribution to end users;
    copyleft triggers don't fire for internal use).
  - *Browser/wasm lane:* not a FreeCAD lane at all (FreeCAD is a native
    desktop/console toolchain — this is exactly why it sits behind a
    sidecar contract rather than a browser port).
  - *Android:* a FreeCAD Android sidecar is conceivable but out of the
    recorded direction; if ever pursued, the same process-isolation
    analysis applies per platform.
- **Attribution duties:** preserve copyright notices, the license text,
  and the LGPL notice in distributions of the FreeCAD sidecar; state
  changes made to FreeCAD itself (AISE records any patched FreeCAD
  build in the sidecar spec provenance).
- **Patent clauses:** LGPL-2.0/2.1 has no explicit patent grant
  (recorded honestly); the "or later" option allows electing LGPL-3.0
  (which incorporates the GPLv3 patent grant) if that ever becomes
  material.
- **Verdict + conditions:** **APPROVED-WITH-CONDITIONS** for the
  desktop/server parametric-CAD sidecar lane. Conditions: (1) FreeCAD
  ships ONLY as an isolated local sidecar process behind the
  `cad.parametric/1` adapter — never linked into, bundled inside, or
  forked into AISE code; (2) the sidecar distribution preserves
  FreeCAD's notices and states changes; (3) the adapter contract (this
  package) stays the only integration surface so the substrate remains
  replaceable (the substitution doubles prove the contract without
  FreeCAD). Not adopted in P0; no runtime dependency wired.

## Tauri + wry/tao — the desktop shell candidate (Rust)

- **Versions observed:** tauri 2.12.1, wry 0.57.0, tao 0.37.1
  (crates.io, live check at delivery time).
- **SPDX:** tauri `Apache-2.0 OR MIT` (crates.io `versions[].license`,
  verbatim); wry `Apache-2.0 OR MIT`; tao `Apache-2.0`. The companion
  npm CLI `@tauri-apps/cli` 2.12.1 is `Apache-2.0 OR MIT` (npm registry
  `license` field, verbatim).
- **Where verified:** `https://crates.io/api/v1/crates/tauri` (and
  `/wry`, `/tao`) — the `license` field of the current stable
  versions; `https://registry.npmjs.org/@tauri-apps/cli/latest`.
- **Distribution compatibility:** permissive dual licensing (Apache-2.0
  OR MIT) across ALL lanes — web, desktop, Android — including
  proprietary distribution. The shell binary links wry/tao (Apache-2.0)
  statically; Apache-2.0 requires preserving notices and the
  NOTICE-file discipline, and grants an express patent license with
  defensive termination terms. No copyleft anywhere in the stack.
- **Attribution duties:** include Apache-2.0 license texts and notices
  for the Rust crates in desktop distributions (standard
  cargo-about/cargo-deny discipline).
- **Patent clauses:** Apache-2.0 §3 grants a patent license for
  contributor contributions with §6 defensive termination; MIT has no
  explicit patent grant (the OR choice covers both).
- **Verdict + conditions:** **APPROVED** for the desktop shell lane
  (permissive, all targets). Condition: re-verify the exact pinned
  versions' license fields at the adoption commit (the crates.io
  reading here is at 2.12.1/0.57.0/0.37.1).

## Electron — the existing desktop thin shell (`apps/desktop`, PROD-020)

- **Version observed:** 44.5.1 — the version INSTALLED by this repo's
  own lockfile (`apps/desktop` declares `^44.4.3`; the lock resolves
  44.5.1).
- **SPDX:** `MIT` (the installed package.json `license` field, verbatim;
  the bundled LICENSE file header, verbatim: *"Copyright (c) Electron
  contributors"* / *"Copyright (c) 2013-2020 GitHub Inc."*).
- **Where verified:** this repo's
  `node_modules/.bun/electron@44.5.1/node_modules/electron/` (package.json
  + LICENSE); mirrored at https://www.electronjs.org/ .
- **Distribution compatibility:** MIT for the framework; the SHIPPED
  app additionally embeds Chromium + Node.js runtimes (Chromium's
  BSD-style + many third-party licenses; Node's MIT-ish). Electron's
  distribution duty is the bundled-licenses aggregation (Electron ships
  tooling/docs for the third-party notice set). Permissive across all
  lanes; the Android lane does not use Electron (the existing Android
  field adapter is separate, AISE-002).
- **Attribution duties:** preserve the MIT notice; aggregate the
  Chromium/Node third-party license set in desktop distributions
  (Electron's own documentation directs this).
- **Patent clauses:** MIT carries no explicit patent grant
  (recorded honestly); Chromium's BSD-style notices likewise.
- **Verdict + conditions:** **APPROVED** (it is the already-shipped
  PROD-020 thin shell; MIT + bundled notices). Condition: keep the
  third-party license aggregation in the packaged builds.

## Sibling substrates consumed as CONTRACT TYPES only (no new adoption)

- **Babylon.js, CesiumJS, OpenUSD, glTF, Assimp** — consumed in this
  package only through the P0-A port TYPES
  (`@aise/world-reality-substrate`); no runtime dependency is added.
  License rows: `docs/world-program-evidence/WORLD-P0-A/LICENSE-MATRIX.md`.
- **OCCT (via OCP), IfcOpenShell, web-ifc, VTK** — consumed only
  through the P0-B port TYPES (`@aise/world-understanding-substrate`)
  and, in the case of IfcOpenShell inside the FreeCAD AppImage,
  observed as the AppImage's bundled dependency (0.7.0 importable
  inside it — the AppImage's LGPL-class notices govern that bundle).
  License rows:
  `docs/world-program-evidence/WORLD-P0-B/LICENSE-MATRIX.md`.
- The `@aise/*` workspace packages consumed (`solution-contract`,
  `shared-contracts`, `provider-registry`) are this repository's own
  code — no external license introduced.

## Summary verdicts

| Substrate | SPDX (verified) | Distribution (web/desktop/mobile) | Verdict |
| --- | --- | --- | --- |
| FreeCAD 1.0.0 | LGPL-2.0-or-later ("LGPL2+", bundled Library-GPL v2 text) | sidecar-process isolation satisfies relinking/replacement duties; no browser lane | APPROVED-WITH-CONDITIONS (sidecar-only; notices preserved; contract-only integration) |
| Tauri 2.12.1 (wry 0.57.0 / tao 0.37.1) | Apache-2.0 OR MIT (tauri/wry); Apache-2.0 (tao) | permissive, all lanes | APPROVED (re-verify at pinned versions) |
| Electron 44.5.1 (in-repo lockfile) | MIT (+ bundled Chromium/Node notice set) | permissive; desktop lane | APPROVED (keep third-party aggregation) |
| Sibling ports (Babylon/USD/glTF/OCCT/IfcOpenShell/…) | see P0-A/P0-B matrices | contract types only — no adoption here | NOT ADOPTED in this item (cross-referenced) |

No proprietary CAD/BIM kernel is introduced anywhere in the matrix (the
§10 prohibition holds). The license matrix is a precondition record:
the future occupants of the ports this package defines re-verify their
row at their own adoption commit before any runtime dependency lands.
