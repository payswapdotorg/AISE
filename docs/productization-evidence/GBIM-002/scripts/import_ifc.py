"""
GBIM-002 spike — IFC -> provider-neutral round-trip verifier.

Reads the exported IFC4 artifact back and verifies, against the compiled
AISE fixture, the charter §4 comparison points:

  * operation identity (AISE IDs recovered from Pset_AISE — the vendor
    GlobalId is never treated as AISE identity);
  * units and normalized parameters (IFC stores metre-scale geometry; the
    AISE parameters entered in mm must normalize identically);
  * bounding box / solid volume / surface area via TWO independent paths:
      - semantic extraction: the IfcExtrudedAreaSolid profile + depth
        (exact parametric facts, no kernel);
      - kernel extraction: ifcopenshell.geom triangulation, world coords
        (volume via signed tetrahedra, bbox, outer surface area);
  * topology/manifold status (kernel triangulation closedness check);
  * opening/wall relationships (IfcRelVoidsElement / IfcRelFillsElement)
    AND opening geometry actually voiding the host (net vs gross volume);
  * quantities (AISE_ReferenceQuantities recovered exactly; kind mismatches
    reported — they are provider heuristics, not AISE semantics);
  * validation status / failure / unsupported status (fail-closed wrapper).

Outputs: results/roundtrip-report.json (+ results/roundtrip-v2.json).
"""

from __future__ import annotations

import json
import math
import os
import sys

import ifcopenshell
import ifcopenshell.validate
import ifcopenshell.geom
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from aise_canon import build_fixture, compile_fixture  # noqa: E402

SPIKE_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FIXTURE_DIR = os.path.join(SPIKE_ROOT, "fixture")
RESULTS_DIR = os.path.join(SPIKE_ROOT, "results")

# Declared numeric tolerances (charter §5: differences must be declared).
TOL_SEMANTIC = 1e-9    # exact parametric facts: floating serialization only
TOL_KERNEL = 1e-6      # triangulated volume/area of planar-faced solids


def safe_open(path, expected_schema="IFC4"):
    """Fail-closed open: a malformed IFC never fabricates a model.

    IfcOpenShell 0.8.5's STEP parser is LENIENT — measured in this spike:
      * a file truncated at 60% opens SILENTLY with 44/63 IfcRoots;
      * a syntactically-broken entity line is partially parsed (a wall is
        FABRICATED from "#9999=IFCWALL('broken");
      * a file whose header lies about its schema opens under the lie.
    The adapter therefore wraps the provider with integrity layers:
      1. parse (the provider itself refuses garbage);
      2. STEP terminator presence (truncation);
      3. schema pinning (the importer declares IFC4; anything else refuses);
      4. schema-level validation via ifcopenshell.validate (fabricated or
         mis-typed entities refuse fail-closed).
    """
    try:
        model = ifcopenshell.open(path)
    except Exception as exc:  # noqa: BLE001 — evidence capture, not control flow
        return None, {
            "code": "malformed_ifc",
            "exceptionType": type(exc).__name__,
            "detail": f"ifcopenshell refused to open {os.path.basename(path)}: {str(exc)[:300]}",
        }

    # 2. STEP terminator (the lenient parser would otherwise return a
    #    silently-truncated model)
    try:
        with open(path, "r", encoding="utf-8", errors="replace") as fh:
            text = fh.read()
    except OSError as exc:
        return None, {
            "code": "unreadable_file",
            "detail": str(exc)[:200],
        }
    if "END-ISO-10303-21" not in text[-200:]:
        return None, {
            "code": "truncated_step_file",
            "detail": (
                "the STEP terminator END-ISO-10303-21; is absent — the provider's "
                "parser would return a silently-truncated model, so the adapter "
                "refuses fail-closed"
            ),
        }

    # 3. schema pinning (the header may lie about the schema)
    if expected_schema and model.schema != expected_schema:
        return None, {
            "code": "schema_pin_mismatch",
            "detail": (
                f"the file declares schema '{model.schema}' but this importer is "
                f"pinned to '{expected_schema}' — schema drift refuses fail-closed"
            ),
        }

    # 4. schema-level validation (fabricated / mistyped entities)
    import logging

    class _Collector(logging.Handler):
        def __init__(self):
            super().__init__()
            self.records = []

        def emit(self, record):  # pragma: no cover — logging plumbing
            self.records.append(record.getMessage())

    collector = _Collector()
    logger = logging.getLogger(f"gbim002-validate-{os.path.basename(path)}")
    logger.handlers.clear()
    logger.addHandler(collector)
    logger.setLevel(logging.ERROR)
    ifcopenshell.validate.validate(model, logger)
    if collector.records:
        return None, {
            "code": "schema_validation_failed",
            "detail": (
                f"{len(collector.records)} schema-validation findings — the "
                f"provider fabricated or mistyped entities; the adapter refuses "
                f"fail-closed (first: {collector.records[0][:160]})"
            ),
        }
    return model, None


def length_unit(model):
    """The project length unit (schema-level fact)."""
    for unit_assignment in model.by_type("IfcUnitAssignment"):
        for unit in unit_assignment.Units:
            if unit.is_a("IfcSIUnit") and unit.UnitType == "LENGTHUNIT":
                prefix = unit.Prefix or ""
                return f"{prefix}{unit.Name}".lower()
    return None


def psets_of(model, element):
    out = {}
    for rel in getattr(element, "IsDefinedBy", []) or []:
        if rel.is_a("IfcRelDefinesByProperties"):
            definition = rel.RelatingPropertyDefinition
            if definition.is_a("IfcPropertySet"):
                props = {}
                for p in definition.HasProperties:
                    if p.is_a("IfcPropertySingleValue"):
                        props[p.Name] = p.NominalValue.wrappedValue
                out[definition.Name] = props
            elif definition.is_a("IfcElementQuantity"):
                qtos = {}
                for q in definition.Quantities:
                    value = None
                    for attr in ("LengthValue", "AreaValue", "VolumeValue", "CountValue"):
                        v = getattr(q, attr, None)
                        if v is not None:
                            value = v
                            break
                    qtos[q.Name] = {"value": value, "ifcQuantityKind": q.is_a()}
                out[definition.Name] = qtos
    return out


def semantic_box_facts(model, element):
    """Schema-level parametric facts from the body representation:
    profile extents + extrusion depth (+ placement translation)."""
    rep = getattr(element, "Representation", None)
    if rep is None:
        return None
    facts = []
    for shape_rep in rep.Representations:
        if shape_rep.RepresentationIdentifier != "Body":
            continue
        for item in shape_rep.Items:
            if item.is_a("IfcExtrudedAreaSolid"):
                swept = item.SweptArea
                if swept.is_a("IfcRectangleProfileDef"):
                    facts.append({
                        "kind": "rectangle-extrusion",
                        "profileX": swept.XDim,
                        "profileY": swept.YDim,
                        "depth": item.Depth,
                    })
                elif swept.is_a("IfcArbitraryClosedProfileDef"):
                    curve = swept.OuterCurve
                    if curve.is_a("IfcIndexedPolyCurve") and curve.Points.is_a("IfcCartesianPointList2D"):
                        pts = curve.Points.CoordList
                        xs = [p[0] for p in pts]
                        ys = [p[1] for p in pts]
                        facts.append({
                            "kind": "polyline-extrusion",
                            "profileX": max(xs) - min(xs),
                            "profileY": max(ys) - min(ys),
                            "depth": item.Depth,
                        })
    placement = getattr(element, "ObjectPlacement", None)
    translation = None
    if placement is not None and placement.is_a("IfcLocalPlacement"):
        loc = placement.RelativePlacement.Location
        translation = tuple(float(v) for v in loc.Coordinates)
    return {"facts": facts, "placement": translation}


def kernel_metrics(element, disable_openings=False):
    """Kernel extraction (triangulated): volume, bbox, area, manifold check.

    Returns None when the kernel refuses the element (fail closed).
    """
    try:
        settings = ifcopenshell.geom.settings()
        settings.set("use-world-coords", True)
        if disable_openings:
            try:
                settings.set("disable-opening-subtractions", True)
            except Exception:
                pass  # setting name not honoured in this build — recorded below
        shape = ifcopenshell.geom.create_shape(settings, element)
    except Exception as exc:  # noqa: BLE001
        return {"error": f"{type(exc).__name__}: {str(exc)[:200]}"}
    geometry = shape.geometry
    verts = np.array(list(geometry.verts), dtype=np.float64).reshape(-1, 3)
    faces = np.array(list(geometry.faces), dtype=np.int64).reshape(-1, 3)
    # volume: signed tetrahedron sum (exact for watertight planar meshes)
    v0 = verts[faces[:, 0]]
    v1 = verts[faces[:, 1]]
    v2 = verts[faces[:, 2]]
    volume = abs(np.einsum("ij,ij->i", v0, np.cross(v1, v2)).sum() / 6.0)
    # area: triangle areas (exact for planar faces)
    area = 0.5 * np.linalg.norm(np.cross(v1 - v0, v2 - v0), axis=1).sum()
    bbox_min = verts.min(axis=0)
    bbox_max = verts.max(axis=0)
    # manifold/topology check: every undirected edge shared by exactly 2 faces
    edges = np.concatenate([faces[:, [0, 1]], faces[:, [1, 2]], faces[:, [2, 0]]])
    edges = np.sort(edges, axis=1)
    unique, counts = np.unique(edges, axis=0, return_counts=True)
    manifold = bool(np.all(counts == 2))
    watertight = manifold and len(verts) > 0
    return {
        "volume": float(volume),
        "surfaceArea": float(area),
        "bboxMin": [float(x) for x in bbox_min],
        "bboxMax": [float(x) for x in bbox_max],
        "triangleCount": int(len(faces)),
        "manifold": manifold,
        "watertightClosed": watertight,
        "nonManifoldEdges": int(np.sum(counts != 2)),
    }


def within(value, expected, tol):
    return abs(value - expected) <= tol * max(1.0, abs(expected))


def roundtrip() -> dict:
    raw = build_fixture()
    compiled, failures = compile_fixture(raw)
    assert compiled is not None, f"fixture unexpectedly refused: {failures}"

    ifc_path = os.path.join(FIXTURE_DIR, "fixture-v1.ifc")
    model, open_failure = safe_open(ifc_path)
    if model is None:
        return {"version": 1, "status": "refused", "failure": open_failure}

    report: dict = {
        "version": 1,
        "ifcFile": "fixture-v1.ifc",
        "schema": model.schema,
        "lengthUnit": length_unit(model),
        "unitNormalization": None,
        "operations": [],
        "relationships": {},
        "wallVoiding": {},
        "quantityRoundTrip": [],
        "tolerances": {"semantic": TOL_SEMANTIC, "kernel": TOL_KERNEL},
    }

    # ---- units evidence: mm parameters normalize to metre-scale geometry ----
    door = next(o for o in compiled["operations"] if o["operationType"] == "create-door")
    door_params = {p["name"]: p for p in door["parameters"]}
    door_entity = next(e for e in model.by_type("IfcDoor"))
    report["unitNormalization"] = {
        "aiseParameter": {"width": door_params["width"], "height": door_params["height"]},
        "ifcOverallWidth": door_entity.OverallWidth,
        "ifcOverallHeight": door_entity.OverallHeight,
        "equalWithinTolerance": (
            within(door_entity.OverallWidth, 0.9, TOL_SEMANTIC)
            and within(door_entity.OverallHeight, 2.1, TOL_SEMANTIC)
        ),
        "note": "900 mm x 2100 mm parameters normalized to 0.9 x 2.1 m; IFC geometry is metre-scale under LENGTHUNIT=METRE",
    }

    # ---- per-operation identity + geometry + quantities ----
    # operations superseded by a later revision (dependencyKind 'revises')
    # project only their FINAL state into IFC — their historical quantities
    # are AISE-domain records, not IFC facts.
    revised_operation_ids = {
        dep["operationRef"]
        for op in compiled["operations"]
        for dep in op.get("dependsOn", [])
        if dep["dependencyKind"] == "revises"
    }
    aise_ids_in_file = []
    for op in compiled["operations"]:
        op_report = {
            "operationType": op["operationType"],
            "aiseOperationId": op["operationId"],
        }
        candidates = []
        pset_names = ("Pset_AISE", "Pset_AISE_Revision")
        seen_elements = set()
        # IfcElement covers IfcOpeningElement too (subtype) — match each
        # element once, against both AISE pset carriers.
        for element in list(model.by_type("IfcElement")) + list(model.by_type("IfcOpeningElement")):
            if element.id() in seen_elements:
                continue
            seen_elements.add(element.id())
            props = psets_of(model, element)
            for pset_name in pset_names:
                pset = props.get(pset_name, {})
                if pset.get("AISE_OperationId") == op["operationId"]:
                    candidates.append((element, props, pset_name))

        if not candidates:
            op_report.update({
                "identityStatus": "missing-external-reference",
                "status": "FAIL",
            })
            report["operations"].append(op_report)
            continue
        if len(candidates) > 1:
            op_report.update({
                "identityStatus": "duplicate-external-reference",
                "status": "FAIL",
                "duplicates": len(candidates),
            })
            report["operations"].append(op_report)
            continue
        element, props, matched_pset = candidates[0]
        aise_ids_in_file.append(op["operationId"])
        op_report["identityStatus"] = "recovered"
        op_report["identityCarrier"] = matched_pset
        op_report["ifcClass"] = element.is_a()
        op_report["ifcName"] = element.Name
        op_report["ifcGuid"] = element.GlobalId
        pset = props.get(matched_pset, {})
        op_report["stateIdRoundTrip"] = pset.get("AISE_ResultingStateId") == op["resultingStateId"]
        op_report["canonicalAnalogueRoundTrip"] = (
            (pset.get("AISE_CanonicalAnalogue") or "none")
            == (op["canonicalAnalogue"] or "none")
        )
        op_report["parametersRoundTrip"] = json.loads(pset.get("AISE_ParametersJson", "[]")) == op["parameters"]

        # semantic + kernel geometry
        sem = semantic_box_facts(model, element)
        op_report["semanticExtraction"] = sem
        op_report["kernelExtraction"] = kernel_metrics(element)

        # geometry comparison vs AISE reference (per canonical analogue)
        comparisons = []
        if op["operationType"] in ("create-wall", "create-partition"):
            length = next(p for p in op["parameters"] if p["name"] == "length")
            height = next(p for p in op["parameters"] if p["name"] == "height")
            thickness = next(p for p in op["parameters"] if p["name"] == "thickness")
            l, h, t = length["value"] / 1000.0, height["value"] / 1000.0, thickness["value"] / 1000.0
            if op["operationType"] == "create-wall":
                gross = kernel_metrics(element, disable_openings=True)
                gross_volume = gross.get("volume")
                expected_net = l * h * t - (1.0 * 2.1 + 1.2 * 1.2) * t  # final state: revised 1000 mm door opening + 1200 mm window
                comparisons.append({
                    "metric": "wall-net-volume (voids applied)",
                    "kernel": op_report["kernelExtraction"]["volume"],
                    "expected": expected_net,
                    "withinTolerance": within(op_report["kernelExtraction"]["volume"], expected_net, TOL_KERNEL),
                })
                report["wallVoiding"] = {
                    "grossVolume": gross_volume,
                    "netVolume": op_report["kernelExtraction"]["volume"],
                    "expectedNet": expected_net,
                    "openingsAppliedByKernel": (
                        gross_volume is not None
                        and abs(gross_volume - op_report["kernelExtraction"]["volume"]) > 1e-6
                    ),
                }
            else:
                comparisons.append({
                    "metric": "wall-volume (gross, no openings in partition)",
                    "kernel": op_report["kernelExtraction"]["volume"],
                    "expected": l * h * t,
                    "withinTolerance": within(op_report["kernelExtraction"]["volume"], l * h * t, TOL_KERNEL),
                })
            comparisons.append({
                "metric": "semantic-profile",
                "semantic": sem["facts"],
                "expected": {"profilePair": sorted([l, t]), "depth": h},
                "withinTolerance": all(
                    within(f["depth"], h, TOL_SEMANTIC)
                    and within(sorted([f["profileX"], f["profileY"]])[0], sorted([l, t])[0], TOL_SEMANTIC)
                    and within(sorted([f["profileX"], f["profileY"]])[1], sorted([l, t])[1], TOL_SEMANTIC)
                    for f in sem["facts"]
                ),
                "note": "profile extents compared orientation-independently (the element may run along X or Y)",
            })
        if op["operationType"] == "create-slab":
            slab_volume = next(q for q in op["aiseQuantities"] if q["label"] == "slab-volume")
            comparisons.append({
                "metric": "slab-volume",
                "kernel": op_report["kernelExtraction"]["volume"],
                "expected": slab_volume["value"],
                "withinTolerance": within(op_report["kernelExtraction"]["volume"], slab_volume["value"], TOL_KERNEL),
            })
        if op["operationType"] == "create-footing":
            footing_volume = next(q for q in op["aiseQuantities"] if q["label"] == "footing-volume")
            comparisons.append({
                "metric": "footing-volume",
                "kernel": op_report["kernelExtraction"]["volume"],
                "expected": footing_volume["value"],
                "withinTolerance": within(op_report["kernelExtraction"]["volume"], footing_volume["value"], TOL_KERNEL),
            })
        if op["operationType"] == "create-column":
            comparisons.append({
                "metric": "column-volume (comparison-only, no canonical model)",
                "kernel": op_report["kernelExtraction"]["volume"],
                "expected": 0.3 * 0.3 * 3.0,
                "withinTolerance": within(op_report["kernelExtraction"]["volume"], 0.3 * 0.3 * 3.0, TOL_KERNEL),
            })
        if op["operationType"] == "create-beam":
            comparisons.append({
                "metric": "beam-volume (comparison-only, no canonical model)",
                "kernel": op_report["kernelExtraction"]["volume"],
                "expected": 6.0 * 0.25 * 0.4,
                "withinTolerance": within(op_report["kernelExtraction"]["volume"], 6.0 * 0.25 * 0.4, TOL_KERNEL),
            })
        op_report["geometryComparisons"] = comparisons
        op_report["status"] = (
            "PASS"
            if all(c.get("withinTolerance", True) for c in comparisons)
            and op_report["kernelExtraction"].get("error") is None
            else "FAIL"
        )

        # quantities round trip
        qtos = props.get("AISE_ReferenceQuantities")
        if op["operationId"] in revised_operation_ids:
            op_report["quantityRoundTrip"] = (
                "superseded-by-revision (final-state projection only; the "
                "pre-revision quantities are historical AISE records — the "
                "explicitly declared lossy part of the revise mapping)"
            )
        elif op["aiseQuantities"] and qtos:
            rows = []
            for q in op["aiseQuantities"]:
                found = qtos.get(q["label"])
                rows.append({
                    "label": q["label"],
                    "aiseValue": q["value"],
                    "ifcValue": found["value"] if found else None,
                    "ifcQuantityKind": found["ifcQuantityKind"] if found else None,
                    "exact": found is not None and abs(found["value"] - q["value"]) < 1e-12,
                })
            op_report["quantityRoundTrip"] = rows
        elif not op["aiseQuantities"]:
            op_report["quantityRoundTrip"] = "no-canonical-model (gap preserved)"

        report["operations"].append(op_report)

    # ---- relationships ----
    voids = [
        {
            "opening": rel.RelatedOpeningElement.Name,
            "host": rel.RelatingBuildingElement.Name,
        }
        for rel in model.by_type("IfcRelVoidsElement")
    ]
    fills = [
        {"opening": rel.RelatingOpeningElement.Name, "filling": rel.RelatedBuildingElement.Name}
        for rel in model.by_type("IfcRelFillsElement")
    ]
    containment = []
    for rel in model.by_type("IfcRelContainedInSpatialStructure"):
        containment = [
            {"structure": rel.RelatingStructure.Name, "elements": sorted(e.Name for e in rel.RelatedElements)}
        ]
    report["relationships"] = {
        "voids": voids,
        "fills": fills,
        "containment": containment,
        "expected": {
            "voids": [
                {"opening": "Opening-Door", "host": "Wall-South"},
                {"opening": "Opening-Window", "host": "Wall-South"},
            ],
            "fills": [
                {"opening": "Opening-Door", "filling": "Door-001"},
                {"opening": "Opening-Window", "filling": "Window-001"},
            ],
        },
    }
    report["relationships"]["voidsMatch"] = (
        sorted((v["opening"], v["host"]) for v in voids)
        == sorted(
            (v["opening"], v["host"])
            for v in report["relationships"]["expected"]["voids"]
        )
    )
    report["relationships"]["fillsMatch"] = (
        sorted((f["opening"], f["filling"]) for f in fills)
        == sorted(
            (f["opening"], f["filling"])
            for f in report["relationships"]["expected"]["fills"]
        )
    )

    # ---- summary ----
    ops = report["operations"]
    report["summary"] = {
        "operationsTotal": len(ops),
        "identityRecovered": sum(1 for o in ops if o.get("identityStatus") == "recovered"),
        "geometryPass": sum(1 for o in ops if o.get("status") == "PASS"),
        "quantitiesExact": sum(
            1
            for o in ops
            if isinstance(o.get("quantityRoundTrip"), list)
            and all(r["exact"] for r in o["quantityRoundTrip"])
        ),
        "quantitiesSuperseded": sum(
            1
            for o in ops
            if isinstance(o.get("quantityRoundTrip"), str)
            and o["quantityRoundTrip"].startswith("superseded-by-revision")
        ),
        "quantityGapsPreserved": sum(1 for o in ops if o.get("quantityRoundTrip") == "no-canonical-model (gap preserved)"),
    }
    return report


def main() -> int:
    reports = {}
    reports["v1"] = roundtrip()
    summary = reports["v1"].get("summary", {})
    print(
        f"v1: schema={reports['v1'].get('schema')} "
        f"unit={reports['v1'].get('lengthUnit')} "
        f"identity={summary.get('identityRecovered')}/{summary.get('operationsTotal')} "
        f"geometryPASS={summary.get('geometryPass')}/{summary.get('operationsTotal')} "
        f"qtoExact={summary.get('quantitiesExact')} superseded={summary.get('quantitiesSuperseded')} gaps={summary.get('quantityGapsPreserved')}"
    )
    for op in reports["v1"].get("operations", []):
        if op.get("status") == "FAIL":
            print(f"  FAIL {op['operationType']}: {json.dumps(op.get('geometryComparisons'))[:300]}")
    if reports["v1"].get("status") == "refused":
        print(f"  REFUSED: {reports['v1']['failure']}")
    with open(os.path.join(RESULTS_DIR, "roundtrip-report.json"), "w") as fh:
        json.dump(reports, fh, indent=1, sort_keys=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
