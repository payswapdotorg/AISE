# GBIM-002 — Historical-Replay Proof (provider removal)

**Machine evidence:** `results/replay-report.json` — 7/7 checks passed.
**Script:** `scripts/replay_aise.py` (run it: `python replay_aise.py`).

## The claim under test (charter §5)

> Historical AISE records must remain interpretable if a candidate is later removed.

## The demonstration

`replay_aise.py` installs an import-system guard that **hard-blocks**
`ifcopenshell`, `OCC` and `OCP` for the entire process — any accidental
provider import fails loudly (`ImportError: GBIM-002 replay guard…`).
The script then, with the provider impossible to load:

1. loads **only** the persisted AISE record (`fixture/aise-fixture-v1.json`
   — the committed historical record) and the mapping sidecar (read as
   reference metadata only);
2. re-derives the complete AISE-side meaning from the canonical fixture
   definition (pure Python, no I/O beyond the JSON, no clock, no provider):
   - solution/version/baseline identity — identical;
   - all **10 operation ids** — bit-identical;
   - the **11-layer state hash chain** (state ids + content digests) — identical;
   - all **14 reference quantities** — identical values/units/labels, with the
     four canonical gaps still recorded as gaps;
   - the configuration/input digest — identical;
3. verifies the IFC artifacts were **not read** (the three `.ifc` files on
   disk are irrelevant to interpretation — they are projections, not records);
4. asserts at exit that **no provider module was ever imported**.

## What this establishes

- AISE records are **self-describing**: interpretation needs only the AISE
  semantics (operation content, typed parameters, the quantity models) —
  none of which live in IFC.
- The IFC GUIDs in the mapping sidecar remain what the architecture says:
  **external references** — provenance cross-links that are useful but never
  required. Remove every `.ifc` file and every historical record still reads.
- Removing the IfcOpenShell candidate later (replacing it, freezing it, or
  deleting it) strands **no AISE history**: the projection is regenerable
  from the AISE side at any time (the deterministic export profile even
  makes the regenerated file byte-identical).

## The reverse direction (documented, deliberately lossy)

GUID → AISE resolution *does* require the IFC artifact — that direction is a
desktop-tool convenience, not an interpretation requirement. The AISE ID is
always the primary key; the sidecar map (`fixture/aise-ifc-map.json`) carries
the association for tools that start from an IFC file.
