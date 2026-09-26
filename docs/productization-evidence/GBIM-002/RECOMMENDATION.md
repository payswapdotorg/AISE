# GBIM-002 — Recommendation

## Verdict: **ADAPT** (IfcOpenShell + IFC4 as the interop projection behind the provider boundary; Bonsai/Blender as desktop adapter; **no fork**)

## Why adapt

1. **The architecture law survives contact with the real provider.**
   Ten fixture operations round-trip with AISE identity intact, exact
   geometry agreement across two independent extraction paths, exact
   quantity round-trips for every operation AISE has a model for, and
   fail-closed behavior on all 23 negative/discrimination cases — while
   IFC never becomes an authority (the provider-blocked replay proves the
   AISE record interprets itself without it).
2. **Everything IFC does badly is exactly what AISE already owns.** The
   measured gaps — no revision graph, no constraint propagation, no
   engineering validation, no act-quantity models, non-content-addressed
   files — are all AISE-domain semantics. Delegating them to a fork of
   Blender/Bonsai/IfcOpenShell would *move* authority out of AISE, the one
   thing the charter forbids.
3. **The fork gate (§6) is not close to being met.** No required capability
   was found that an adapter/add-on/API cannot deliver: the desktop
   surface's editing path is literally the same `ifcopenshell.api` this
   spike drives, and it preserves AISE references through a user edit
   session (10/10) while the neutral reader flags foreign additions
   fail-closed.
4. **The integration cost is small and contained.** One wheel dependency
   (LGPL-3.0-or-later), a file-level adapter boundary of a handful of
   operations (export/import/mapping/integrity layers), and a
   deterministic export profile that makes the projection byte-reproducible.

## Required adapter obligations (what a production IFC provider MUST ship, learned here)

1. **Integrity layers on every open** — the 0.8.5 parser silently accepts
   truncated files (measured: 44/63 roots), fabricates entities from broken
   syntax, and honors schema lies. The adapter must enforce: STEP
   terminator, schema pin, schema-level validation (all implemented in
   `scripts/import_ifc.py::safe_open`).
2. **Explicit SI-metre assignment** — IfcOpenShell's default project unit
   is millimetre while its helper APIs accept metres; hand-built
   representations are not converted (measured 1000× hazard). Assign
   `{"is_metric": True, "is_si": True, "raw": "metres"}` and quantity-compare.
3. **AISE IDs as external references only** — `Pset_AISE` (and
   `Pset_AISE_Revision` for revisions); the deterministic export profile
   (uuid5 GUIDs keyed BY AISE identity, zeroed stamps, sorted lists) if
   byte-reproducibility is wanted.
4. **Quantity re-projection at revision time** — IFC quantity sets are
   claims and go stale after edits; the adapter re-projects current-state
   quantities and never treats IFC quantities as computations.
5. **Engineering gates before projection** — containment, contact,
   positivity, thickness sanity, duplicate identity: the IFC schema will
   accept all of it otherwise (div-1, neg-1..neg-6).

## Successor handoff (what implementation should build next, if adopted)

1. A typed `IfcInteropProvider` behind the existing Layer-3 provider
   boundary: export (deterministic profile), import (integrity layers +
   mapping recovery), and the mapping sidecar keyed by AISE operation IDs.
2. An import-review flow for desktop-authored additions (unmapped
   elements → proposed AISE operations, never direct merge).
3. AISE catalogue extension decision for the four gaps (door, window,
   column, beam) — a domain decision, independent of IFC.
4. The desktop pilot (real Bonsai GUI) to close the REFUSED GUI-evidence
   classification, time-boxed, with the same artifact and reader.
5. Coordination with GBIM-001/GBIM-003: the geometry-kernel findings
   (exact solids) and the browser-renderer findings (web-ifc/That Open)
   share this fixture and mapping — one shared geometry-contract work
   item is the natural follow-up if all three wave-G0 spikes adapt.

## Explicit non-recommendations

- **Do not fork** Blender, Bonsai, IfcOpenShell, or OCCT (charter §1/§6:
  none of the four tests are met; presentation convenience is explicitly
  not a fork reason — and no presentation convenience was even lost).
- **Do not make IFC the storage authority** — an IFC file digest is
  provably not identity (raw-profile evidence); the AISE state chain is.
- **Do not trust IFC quantity sets or schema validation** as engineering
  validation — both are claims, not computations.
