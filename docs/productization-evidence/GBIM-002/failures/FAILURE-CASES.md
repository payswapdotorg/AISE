# GBIM-002 — Negative / Discrimination Cases (charter §5)

**Machine evidence:** `results/negatives-report.json` (23 cases)
**Summary:** 20 REFUSED-FAIL-CLOSED · 3 DIVERGENCE-CAUGHT · 0 missed · 0 unexpected passes.

Fail-closed means: a typed refusal with a machine-readable reason — no fabricated
geometry, no silent pass, no invented approval. Every case below was executed,
not reasoned about.

## Mandatory negatives (charter §5) — all refused fail-closed

| # | Case | Gate that fires | Evidence |
|---|---|---|---|
| 1 | Impossible wall thickness (0 / −200 / 5000 mm) | `parameter_not_positive` / `impossible_wall_thickness` (spike-declared bound 1.0 m for the room fixture) | refused before any IFC projection |
| 2 | Opening outside host wall (x = 20 m on an 8 m wall) | `opening_outside_host` (containment gate) | refused pre-projection; see div-1 for the raw-IFC counterpart |
| 3 | Negative dimensions (wall length, opening width, slab thickness, column height, beam depth, footing length = −5) | `parameter_not_positive` ×6 | refused; the engine never guesses a sign |
| 4 | Disconnected footing (moved 10 m from the column it supports) | CROSS-operation contact gate `supported_element_disconnected` — per-op gates pass; only the AISE-side check catches it (IFC4 has no mandatory support relationship) | refused pre-projection |
| 5 | Duplicate operation identity (the wall's AISE operation id forged onto the beam) | identity-is-content equality (same content + same position ⇒ same id) **plus** importer gate `duplicate-external-reference` | forged artifact `results/neg-duplicate-operation-id.ifc` flagged with both elements named |
| 6 | Unsupported operation (`create-dome-shell`; also canonical `excavation`) | `capability_unsupported` — the spike catalogue refuses the unknown type; `excavation` is refused because an act with a quantity model is not an IFC4 product | refused; IFC-interop vs AISE-canonical boundary documented |
| 7 | Malformed provider response (7 variants) | see below | all refused |

## Malformed provider response — the lenient-parser findings

IfcOpenShell 0.8.5's STEP parser is **lenient**, which the spike measured:

- A file **truncated at 60%** opens silently with 44 of 63 `IfcRoot`s —
  ~30% of the model vanishes without any error.
- A syntactically-broken entity line (`#9999=IFCWALL('broken`) is partially
  parsed — the provider **fabricates** a wall from broken syntax.
- A file whose header lies (`FILE_SCHEMA(('IFC2X3'))` over IFC4 content)
  opens under the lie, with IFC4 attributes silently misinterpreted.

The adapter therefore wraps every open in integrity layers (see
`scripts/import_ifc.py::safe_open`):

| Variant | Integrity layer that refuses | Outcome |
|---|---|---|
| garbage bytes | provider parse exception | REFUSED `malformed_ifc` |
| truncated STEP (60%) | STEP terminator `END-ISO-10303-21;` absent | REFUSED `truncated_step_file` |
| invalid STEP syntax | `ifcopenshell.validate` (6 findings on the fabricated entity) | REFUSED `schema_validation_failed` |
| schema header mismatch | importer schema pin (IFC4) + validate (78 findings) | REFUSED `schema_pin_mismatch` |
| schema-valid wall, `XDim = −5.0` | geometry kernel (negative/nonsense volume rejected) | REFUSED — file opened, kernel refused, no fabricated geometry |
| schema-valid wall, empty Body representation | geometry kernel | REFUSED — no shape created from nothing |

## Engineered divergences — the harness catches each declared divergence

| # | Divergence | Observation | Caught by |
|---|---|---|---|
| div-1 | Raw IFC4 with the void placed 12 m outside its host wall | **the IFC schema accepts the file** (schema-valid); the wall keeps its gross 4.8 m³ (no cut) — the void floats ignored | round-trip quantity comparison vs the AISE reference (4.134 m² net expected ⇒ mismatch ⇒ typed failure). AISE-side containment gates are mandatory pre-projection; IFC schema validation is structural, not engineering |
| div-2 | Millimetre-default unit hazard (naive `unit.assign_unit()` + metre-scale hand-built representation) | the schema accepts the file; the slab's kernel volume is 1e-9 of the AISE reference (1000× linear error) | quantity comparison against the AISE reference (`div-2` verified scale factor 1e9) |
| div-3 | No constraint propagation (door fill left 900 mm in the widened 1000 mm opening) | `IfcDoor.OverallWidth = 0.9` vs opening width 1.0 m — a 100 mm divergence the file itself will never report | harness comparison of door attributes vs void geometry |

## Interpretation (what the negatives prove)

1. **The IFC schema does not validate engineering** — it validates structure.
   Every engineering gate in this list (thickness, containment, contact,
   positivity, uniqueness) fires only because AISE owns it. A provider-only
   integration would accept five of these seven cases silently.
2. **The provider's parser must be wrapped, not trusted** — silent truncation
   and entity fabrication are measured provider behaviors in 0.8.5, and the
   adapter's integrity layers (terminator, schema pin, schema validation)
   are load-bearing.
3. **Fail-closed is achievable and cheap** — every refusal above is a typed,
   machine-readable reason produced in milliseconds; none required fabricating
   geometry or guessing.
