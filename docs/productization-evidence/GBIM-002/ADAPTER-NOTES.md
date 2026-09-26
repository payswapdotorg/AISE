# GBIM-002 — Desktop Adapter Notes (Bonsai / Blender)

**Machine evidence:** `results/adapter-bonsai-report.json`
**Script:** `scripts/adapter_bonsai.py`

## Evaluation mode (honest classification)

| Surface | Mode | Classification |
|---|---|---|
| Bonsai GUI (Blender add-on) | not runnable: headless sandbox, no display, and the add-on is not pip-installable (it ships via Blender's extension platform / the IfcOpenShell repository) | **REFUSED** (recorded, not guessed: `pip install bpy` on this sandbox's Python 3.12 returns `No matching distribution found for bpy` — Blender's wheels target its embedded 3.11 interpreter; python3.11 is not present) |
| Blender headless (`bpy`) | install attempted, measured, recorded | **REFUSED** in-sandbox (see above) — no evidence was fabricated in its place |
| Bonsai's editing core (`ifcopenshell.api`) | **executed in-sandbox** — the venv ships the exact module surface Bonsai's Blender tools drive (`pset.edit_pset`, `geometry.edit_object_placement`, `root.create_entity`, `feature.add_filling`, …) | **PROVEN at the API level** |
| Desktop workflow / UX claims | docs-level only | **DEFERRED** to any later desktop pilot; no GUI conclusions are drawn here |

## The executed evidence — a Bonsai-style user edit session

Against the SAME fixture IFC artifact, the exact `ifcopenshell.api` call
sequence a Bonsai user session produces was replayed headlessly:

1. `pset.edit_pset` — a property edit on `Pset_AISE` (desktop-review stamp);
2. `geometry.edit_object_placement` — move the beam +100 mm (delta-composed
   with the current placement);
3. `root.create_entity` + representation + placement + containment — add a
   new `IfcWall` **without any AISE mapping reference** (desktop-authored).

Saved to `results/bonsai-edit.ifc`, then verified through the
provider-neutral reader:

- **10/10 AISE operation references survive** the desktop editing session;
- the geometry edit is **visible and consistent** to the neutral reader
  (beam z-min 2.7 m, as expected after the move);
- the desktop-authored wall is **flagged fail-closed** as an external
  addition — it never silently merges into the Reality Graph; an explicit
  AISE-side import review is required before it becomes an operation;
- the window opening (a projection artifact of `create-window`) is
  classified as such — not mistaken for a desktop addition (openings
  voiding a mapped host / filled by a mapped element are artifacts of the
  mapped fenestration operation).

## Fork-gate assessment (charter §6, the four tests)

**Blender — do not fork.** No §6(1) required-capability gap was found: every
capability this spike needed from the desktop surface (inspect, edit
properties, move, add, save) is delivered by the existing API surface
(`ifcopenshell.api` + Blender's native extension API). Running Blender as a
separate process keeps GPL obligations inside the Blender process.

**Bonsai — adapter, not a fork candidate.** Bonsai's value is the Blender-side
UX over the same IfcOpenShell core this spike exercises; the adapter boundary
stays at the file/API level. No evidence suggests a capability that would
require forking Bonsai; none of the four §6 tests are met.

**Presentation convenience is not a fork reason** (acceptance criterion):
the only candidate inconveniences found (no constraint propagation, no
revision graph, no engineering validation in the schema) are all handled
better on the AISE side of the boundary than any fork could.

## License / use posture (measured where possible)

| Component | License | Evidence |
|---|---|---|
| IfcOpenShell 0.8.5 | **LGPL-3.0-or-later** | installed wheel dist-info METADATA (in-sandbox, verifiable) |
| Blender | GPL-2.0-or-later (GPL-3.0-or-later components) | docs-level: blender.org/about/license — verify before adoption; separate-process usage keeps obligations contained |
| Bonsai | distributed within the IfcOpenShell project (LGPL-3.0-or-later per its repository) | docs-level: bonsaibim.org + the IfcOpenShell repository — verify the add-on's license block before adoption |

LGPL-3.0-or-later for the interop library is compatible with AISE's
provider-boundary architecture (dynamic use, no fork, no relicensing of
AISE code); the definitive legal review is a pre-adoption step, not a
spike output.

## What a real desktop pilot must still show (deferred)

- GUI usability of the AISE-mapped artifact in Bonsai (psets, quantity
  sets, selection by AISE id);
- save-round-trip fidelity when Bonsai's own tools regenerate geometry
  (e.g. wall regeneration may rewrite representations — the AISE psets are
  preserved by Bonsai's pset model, but representation-level drift must be
  re-measured with the real GUI);
- multi-user workflow (Blender is a single-editor model; AISE-side versioning
  is the concurrency authority).
