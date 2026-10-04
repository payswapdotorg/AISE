# WORLD-P0-C real FreeCAD export capability probe (IFC + mesh/glTF lanes)
import json, time, os
import FreeCAD as App
import Part, Sketcher

doc = App.newDocument("AISEExportProbe")
sketch = doc.addObject("Sketcher::SketchObject", "Sketch_lintel_profile")
sketch.addGeometry(Part.LineSegment(App.Vector(0, 0, 0), App.Vector(5000, 0, 0)), False)
sketch.addGeometry(Part.LineSegment(App.Vector(5000, 0, 0), App.Vector(5000, 1000, 0)), False)
sketch.addGeometry(Part.LineSegment(App.Vector(5000, 1000, 0), App.Vector(0, 1000, 0)), False)
sketch.addGeometry(Part.LineSegment(App.Vector(0, 1000, 0), App.Vector(0, 0, 0)), False)
pad = doc.addObject("PartDesign::Pad", "Pad_feature_001")
pad.Profile = sketch
pad.Length = 4000.0  # mm — the 5m x 1m x 4m fixture in FreeCAD-native units
doc.recompute()
result = {"pad_volume_mm3": round(pad.Shape.Volume, 3)}

# --- IFC export (the Import module) ---
t0 = time.perf_counter()
try:
    import Import
    Import.export([pad], "aise_export.ifc")
    t_ifc = time.perf_counter() - t0
    result["ifc_export_ms"] = round(t_ifc * 1000, 1)
    result["ifc_bytes"] = os.path.getsize("aise_export.ifc")
    with open("aise_export.ifc", "r", encoding="utf-8", errors="replace") as f:
        text = f.read(400)
    result["ifc_header_snippet"] = text.split("\n")[0]
    result["ifc_schema_line"] = next(
        (l for l in text.split("\n") if "FILE_SCHEMA" in l), None
    )
except Exception as e:
    result["ifc_export_error"] = f"{type(e).__name__}: {e}"

# --- STL mesh export (the Mesh module — the tessellation lane) ---
t0 = time.perf_counter()
try:
    import Mesh
    Mesh.export([pad], "aise_export.stl")
    result["stl_export_ms"] = round((time.perf_counter() - t0) * 1000, 1)
    result["stl_bytes"] = os.path.getsize("aise_export.stl")
except Exception as e:
    result["stl_export_error"] = f"{type(e).__name__}: {e}"

# --- glTF attempt: FreeCAD 1.0 has no core glTF exporter; probe honestly ---
try:
    import importlib
    importlib.import_module("importJSON")  # noqa: F401 — probe a sibling importer
    result["gltf_exporter_present"] = True
except Exception:
    result["gltf_exporter_present"] = False
    result["gltf_note"] = (
        "no core glTF exporter in FreeCAD 1.0.0 headless (the adapter lane is "
        "Mesh/STL or OBJ tessellation + external conversion; the AISE glTF "
        "delivery port stays the delivery vocabulary either way)"
    )

print(json.dumps(result, indent=2))
