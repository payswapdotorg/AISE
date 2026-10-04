# WORLD-P0-B — the substrate license/use matrix (recorded BEFORE adoption)

Gate 3 of the world program requires the license matrix per substrate
before any runtime adoption. No substrate is adopted in P0: this matrix
is the recorded precondition for the P1/P2 wiring decisions. Each entry
records the SPDX identifier, the verbatim citation of the license's
title and notice lines as verified in the installed artifacts (the
wheel metadata / license files / npm registry), the distribution
compatibility across the program's web + desktop + mobile targets, the
attribution duties, the patent clauses, and the verdict with conditions.

**Verification (NOW, at re-delivery time):** the three Python
substrates' license declarations were read from the installed wheels in
the measurement venv (`pip show`, dist-info `METADATA` classifiers, and
the packaged license files); web-ifc's license was read live from the
npm registry (`web-ifc@0.0.78`, `license: MPL-2.0`).

## IfcOpenShell — the IFC interpretation substrate

- **Version measured:** 0.9.0 (wheel `ifcopenshell-0.9.0`).
- **SPDX:** `LGPL-3.0-or-later` (wheel classifier, verbatim:
  `License :: OSI Approved :: GNU Lesser General Public License v3 or later (LGPLv3+)`).
- **Verbatim citation (title block):** "GNU LESSER GENERAL PUBLIC
  LICENSE Version 3, 29 June 2007"; copyright line: "Copyright (C) 2007
  Free Software Foundation, Inc. <https://fsf.org/>". Canonical text:
  https://www.gnu.org/licenses/lgpl-3.0.html . The wheel bundles OCCT
  kernels, which carry their own LGPL-2.1 + OCCT exception terms (next
  entry) — both apply to a distributed binary.
- **Distribution compatibility:** server-side/SaaS use (the P0/P1
  interpretation lane) is unproblematic — no distribution to end users
  occurs, so the copyleft triggers do not fire. Desktop distribution
  requires the ability to relink/replace the LGPL library (dynamic
  linking preferred; static linking requires providing object files).
  Browser/wasm distribution is the same duty made heavier (wasm build
  provenance and relinkability must be preserved); the recorded
  direction is web-ifc for the browser lane, not wasm IfcOpenShell.
  Mobile follows the desktop rules per platform.
- **Attribution duties:** preserve copyright notices, license texts,
  and the LGPL notice on distribution; state changes made to the
  library.
- **Patent clauses:** LGPL-3.0 incorporates the GPLv3 patent grant
  (section 11) — contributors grant a patent license for their
  contributions; the anti-surrender terms apply.
- **Verdict + conditions:** **ADOPTABLE for the server interpretation
  lane** under LGPL-3.0-or-later with the conditions recorded above
  (dynamic linkage discipline, notice preservation, changes stated).
  Not adopted in P0; no code wired.

## OCCT via OCP (cadquery-ocp) — the exact geometry substrate

- **Version measured:** OCCT 8.0.1 through the `cadquery-ocp`
  8.0.1.0.0 wheel (the OCP binding wheel itself is declared
  `Apache-2.0` in its METADATA).
- **SPDX (the kernels):** `LGPL-2.1-only WITH OCCT-exception-1.0`; the
  binding wheel's own code: `Apache-2.0`.
- **Verbatim citation (title block):** "GNU LESSER GENERAL PUBLIC
  LICENSE Version 2.1, February 1999"; copyright line: "Copyright (C)
  1991, 1999 Free Software Foundation, Inc." The Open CASCADE Exception
  (OCCT-exception-1.0) grants permission to combine OCCT with
  independent modules into a combined work and to convey that combined
  work under terms of the licensee's choice, provided the OCCT code
  itself retains its license and notices. Canonical texts:
  https://old.opencascade.com/licenses/licensing-exception/ and the
  OCCT sources' LICENSE and occt-exception files.
- **Distribution compatibility:** web server lane — unproblematic.
  Desktop — the exception exists precisely to permit embedding OCCT in
  larger works; conditions (notice preservation, no relicensing of
  OCCT itself, source of modified OCCT files) are recorded and
  satisfiable. Browser — a wasm OCCT build is heavy but legally on the
  same terms; the recorded browser direction is the geometry-family
  alternative lane, not wasm OCCT. Mobile — as desktop.
- **Attribution duties:** preserve OCCT's copyright notices, the
  LGPL-2.1 text, and the exception text in distributions.
- **Patent clauses:** LGPL-2.1 has no explicit patent grant (recorded
  honestly); the OCCT exception addresses combination, not patents.
- **Verdict + conditions:** **ADOPTABLE for the exact-geometry lane**
  under LGPL-2.1-only WITH OCCT-exception-1.0 (+ the Apache-2.0
  binding), conditions as recorded. Not adopted in P0; no code wired.

## VTK (vtkmodules) — the field/scientific-data substrate

- **Version measured:** 9.6.2 (wheel `vtk-9.6.2`).
- **SPDX:** `BSD-3-Clause` (wheel classifier verbatim:
  `License :: OSI Approved :: BSD License`; the packaged license file
  carries the VTK copyright header: "Copyright (c) 1993-2015 Ken
  Martin, Will Schroeder, Bill Lorensen. All rights reserved.").
- **Verbatim citation (notice block):** "Redistribution and use in
  source and binary forms, with or without modification, are permitted
  provided that the following conditions are met" — the three-clause
  conditions (retain the notice; reproduce in documentation; neither
  the names of the copyright holders nor contributors may be used to
  endorse). Canonical text: https://vtk.org/license/ and the wheel's
  packaged license file.
- **Distribution compatibility:** permissive across all lanes — web,
  desktop, and mobile — including wasm builds, subject only to the
  notice conditions.
- **Attribution duties:** reproduce the copyright notice, the license
  text, and the disclaimer in documentation and redistributions.
- **Patent clauses:** no explicit patent grant (BSD-3); the license
  text disclaims liability; no royalty obligations.
- **Verdict + conditions:** **ADOPTABLE for the field lane**
  (BSD-3-Clause permissive, attribution condition only). Not adopted in
  P0; no code wired.

## web-ifc — the browser-runtime IFC alternative (reviewed, not installed)

- **Version observed:** 0.0.78 (npm registry, live check at
  re-delivery time).
- **SPDX:** `MPL-2.0` (registry `license` field, verbatim).
- **Verbatim citation (title block):** "Mozilla Public License Version
  2.0"; canonical text: https://www.mozilla.org/en-US/MPL/2.0/ .
- **Distribution compatibility:** file-level weak copyleft — combining
  web-ifc with proprietary code is permitted; modifications to
  web-ifc's own source files must be made available under MPL-2.0.
  Browser bundling is the intended lane (the wasm runtime); providing
  the (already public) MPL-licensed sources satisfies the source
  availability duty. Server/desktop/mobile embedding is permitted on
  the same file-level terms.
- **Attribution duties:** preserve the license and notices on the
  MPL-covered files in distributions.
- **Patent clauses:** MPL-2.0 grants an express patent license for
  contributors' contributions with the usual defensive termination
  terms.
- **Verdict + conditions:** **REVIEWED, ADOPTION DEFERRED** — the
  browser IFC lane is web-ifc's to occupy in a later item; before
  wiring, the consuming item must re-verify the license at the pinned
  version and record the wasm build's provenance. No measurement of
  web-ifc exists in this item (honestly declared: the sandbox has no
  browser measurement lane for it in P0).

## Summary verdicts

| Substrate | SPDX | Distribution (web/desktop/mobile) | Verdict |
| --- | --- | --- | --- |
| IfcOpenShell 0.9.0 | LGPL-3.0-or-later | server lane clean; desktop/mobile dynamic-link duty | adoptable with conditions (not adopted in P0) |
| OCCT via OCP 8.0.1 | LGPL-2.1-only WITH OCCT-exception-1.0 (kernels); Apache-2.0 (binding) | embedding permitted by the exception | adoptable with conditions (not adopted in P0) |
| VTK 9.6.2 | BSD-3-Clause | permissive, all lanes | adoptable, attribution only (not adopted in P0) |
| web-ifc 0.0.78 | MPL-2.0 | file-level copyleft; browser lane intended | reviewed; adoption deferred to the consuming item |

No proprietary kernel is introduced anywhere in the matrix (the §10
prohibition holds). The license matrix is a precondition record: the
occupants of the ports this package defines will re-verify their row at
their own adoption commit before any runtime dependency lands.
