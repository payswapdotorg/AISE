# WORLD-P0-C real FreeCAD capability probe (FreeCADCmd scripting surface)
# Method: AppImage-extracted FreeCAD 1.0.0 FreeCADCmd, headless, no GUI.
import json, sys, time

t_start = time.perf_counter()
import FreeCAD as App
t_import = time.perf_counter() - t_start

doc = App.newDocument("AISEProbe")
t0 = time.perf_counter()
sketch = doc.addObject("Sketcher::SketchObject", "Sketch_lintel_profile")
sketch.Placement = App.Placement(App.Vector(0, 0, 0), App.Rotation(0, 0, 0, 1))
# the WORLD-P0-C fixture rectangle: (0,0)->(5,0)->(5,1)->(0,1)
import Part, Sketcher
sketch.addGeometry(Part.LineSegment(App.Vector(0, 0, 0), App.Vector(5, 0, 0)), False)
sketch.addGeometry(Part.LineSegment(App.Vector(5, 0, 0), App.Vector(5, 1, 0)), False)
sketch.addGeometry(Part.LineSegment(App.Vector(5, 1, 0), App.Vector(0, 1, 0)), False)
sketch.addGeometry(Part.LineSegment(App.Vector(0, 1, 0), App.Vector(0, 0, 0)), False)
sketch.addConstraint(Sketcher.Constraint("Horizontal", 0))
sketch.addConstraint(Sketcher.Constraint("Vertical", 1))
t_sketch = time.perf_counter() - t0

t0 = time.perf_counter()
pad = doc.addObject("PartDesign::Pad", "Pad_feature_001")
pad.Profile = sketch
pad.Length = 3.0
t_pad_def = time.perf_counter() - t0

t0 = time.perf_counter()
doc.recompute()
t_recompute = time.perf_counter() - t0

# the deterministic-rebuild law probe: recompute again, then change a
# parameter and recompute — the box volume must track the parameter
volume_first = pad.Shape.Volume
pad.Length = 4.0
t0 = time.perf_counter()
doc.recompute()
t_recompute2 = time.perf_counter() - t0
volume_after = pad.Shape.Volume

# typed parametric surface: read the feature's parameter with its unit
length_value = pad.Length.Value
length_unit = str(pad.Length.Unit)

# document/object NAMES (the external-label law carriers)
doc_name = doc.Name
obj_names = [o.Name for o in doc.Objects]

# shapes: bounding box of the pad (the derived-geometry projection analog)
bb = pad.Shape.BoundBox
result = {
    "freecad_version": App.Version(),
    "python_version": sys.version.split()[0],
    "timings_ms": {
        "import_freecad": round(t_import * 1000, 1),
        "build_sketch": round(t_sketch * 1000, 1),
        "define_pad": round(t_pad_def * 1000, 1),
        "recompute_1": round(t_recompute * 1000, 1),
        "recompute_2": round(t_recompute2 * 1000, 1),
    },
    "volume_at_length_3": round(volume_first, 6),
    "volume_at_length_4": round(volume_after, 6),
    "length_value": length_value,
    "length_unit": length_unit,
    "document_name": doc_name,
    "object_names": obj_names,
    "bound_box": {
        "xmin": round(bb.XMin, 6), "xmax": round(bb.XMax, 6),
        "ymin": round(bb.YMin, 6), "ymax": round(bb.YMax, 6),
        "zmin": round(bb.ZMin, 6), "zmax": round(bb.ZMax, 6),
    },
    "vertex_count": pad.Shape.Vertexes.__len__(),
    "edge_count": pad.Shape.Edges.__len__(),
    "face_count": pad.Shape.Faces.__len__(),
}
print(json.dumps(result, indent=2))
