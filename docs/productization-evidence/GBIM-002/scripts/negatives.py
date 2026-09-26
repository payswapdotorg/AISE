"""
GBIM-002 spike — negative/discrimination harness (charter §5).

Every case must FAIL CLOSED: a typed refusal, never fabricated geometry,
never a silent pass. The harness covers the charter's mandatory negatives:

  1. impossible wall thickness
  2. opening outside host wall
  3. negative dimensions
  4. disconnected footing
  5. duplicate operation identity
  6. unsupported operation
  7. malformed provider response

plus engineered divergences the harness must CATCH (declared divergence
detection, not silent passes):

  D1. schema-valid IFC whose opening void lies outside the host wall
      (the IFC schema does not enforce engineering containment)
  D2. the millimetre-default unit hazard (naive project-unit assignment
      silently rescales hand-built geometry 1000x)
  D3. a door fill left at 900 mm after the opening widened to 1000 mm
      (no constraint propagation in IFC)

Outputs: results/negatives-report.json
"""

from __future__ import annotations

import copy
import json
import os
import sys

import ifcopenshell
import ifcopenshell.api
import ifcopenshell.geom
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from aise_canon import (  # noqa: E402
    HOST_WALL_GEOMETRY,
    SPIKE_SOLUTION_ID,
    build_fixture,
    compile_fixture,
    derive_operation_id,
    validate_operation,
)
from import_ifc import kernel_metrics, psets_of, safe_open  # noqa: E402

SPIKE_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FIXTURE_DIR = os.path.join(SPIKE_ROOT, "fixture")
RESULTS_DIR = os.path.join(SPIKE_ROOT, "results")

CASES = []


def record(case_id, title, expected, refused, evidence, divergence_caught=None):
    row = {
        "case": case_id,
        "title": title,
        "expectedBehavior": expected,
        "refused": refused,
        "evidence": evidence,
        "status": "REFUSED-FAIL-CLOSED" if refused else "PASSED-UNEXPECTEDLY",
    }
    if divergence_caught is not None:
        row["declaredDivergenceCaught"] = divergence_caught
        row["status"] = "DIVERGENCE-CAUGHT" if divergence_caught else "DIVERGENCE-MISSED"
    CASES.append(row)
    print(f"[{row['status']:<22}] {case_id}: {title}")
    return row


def _mutate(fixture, operation_type, param_name, new_value):
    fixture = copy.deepcopy(fixture)
    for op in fixture["operations"]:
        if op["operationType"] == operation_type:
            for p in op["parameters"]:
                if p["name"] == param_name:
                    p["value"] = new_value
    return fixture


# ---------------------------------------------------------------------------
# 1. impossible wall thickness
# ---------------------------------------------------------------------------

def case_impossible_wall_thickness():
    for bad in (0, -200, 5000):  # zero, negative, absurd (5 m)
        fixture = _mutate(build_fixture(), "create-wall", "thickness", bad)
        compiled, failures = compile_fixture(fixture)
        gate_codes = sorted({f["code"] for f in (failures or [])})
        record(
            f"neg-1/impossible-wall-thickness/{bad}",
            f"create-wall thickness {bad} mm (zero / negative / absurd)",
            "AISE-side gate refuses before any IFC projection",
            refused=compiled is None and bool(gate_codes),
            evidence={"gateCodes": gate_codes},
        )


# ---------------------------------------------------------------------------
# 2. opening outside host wall
# ---------------------------------------------------------------------------

def case_opening_outside_host():
    # AISE-side gate: the opening's span must lie within the host wall
    fixture = _mutate(build_fixture(), "create-opening", "offset-x", 20.0)  # wall is 8 m
    compiled, failures = compile_fixture(fixture)
    gate_codes = sorted({f["code"] for f in (failures or [])})
    record(
        "neg-2/opening-outside-host",
        "door opening placed at x=20 m on an 8 m host wall",
        "AISE containment gate refuses (opening must lie within its host)",
        refused=compiled is None and "opening_outside_host" in gate_codes,
        evidence={"gateCodes": gate_codes},
    )

    # D1 divergence probe: the SAME nonsense hand-written into a raw IFC4
    # file — the IFC schema accepts it (schema-valid), the wall keeps its
    # gross volume (no cut) — the round-trip quantity comparison MUST catch it.
    model = ifcopenshell.api.run("project.create_file", version="IFC4")
    ifcopenshell.api.run("root.create_entity", model, ifc_class="IfcProject", name="P")
    ifcopenshell.api.run(
        "unit.assign_unit", model, length={"is_metric": True, "is_si": True, "raw": "metres"}
    )
    ctx = ifcopenshell.api.run("context.add_context", model, context_type="Model")
    body = ifcopenshell.api.run(
        "context.add_context", model, context_type="Model", context_identifier="Body",
        target_view="MODEL_VIEW", parent=ctx,
    )
    wall = ifcopenshell.api.run("root.create_entity", model, ifc_class="IfcWall", name="W")
    rep = ifcopenshell.api.run(
        "geometry.add_wall_representation", model, context=body, length=8.0, height=3.0, thickness=0.2
    )
    ifcopenshell.api.run("geometry.assign_representation", model, product=wall, representation=rep)
    opening = ifcopenshell.api.run("root.create_entity", model, ifc_class="IfcOpeningElement", name="OP")
    orep = ifcopenshell.api.run(
        "geometry.add_wall_representation", model, context=body, length=0.9, height=2.1, thickness=0.22
    )
    ifcopenshell.api.run("geometry.assign_representation", model, product=opening, representation=orep)
    matrix = np.eye(4)
    matrix[0, 3] = 20.0  # 12 m beyond the wall's end
    ifcopenshell.api.run("geometry.edit_object_placement", model, product=opening, matrix=matrix)
    ifcopenshell.api.run("feature.add_feature", model, feature=opening, element=wall)
    path = os.path.join(RESULTS_DIR, "neg-opening-outside-host.ifc")
    model.write(path)
    reopened, failure = safe_open(path)
    schema_accepts = reopened is not None
    wall_metrics = kernel_metrics(reopened.by_type("IfcWall")[0]) if reopened else None
    gross = 4.8
    net_observed = wall_metrics["volume"] if wall_metrics else None
    caught = net_observed is not None and abs(net_observed - gross) < 1e-9
    record(
        "div-1/opening-outside-host-raw-ifc",
        "raw IFC4 with the void placed 12 m outside its host wall",
        "schema accepts the file (no engineering validation); the harness catches the divergence because the wall keeps its gross volume",
        refused=False,  # the SCHEMA accepts — that is the finding
        evidence={
            "ifcSchemaAccepts": schema_accepts,
            "wallVolumeObserved": net_observed,
            "wallVolumeExpectedIfCut": round(gross - 0.9 * 2.1 * 0.2, 6),
            "artifact": "results/neg-opening-outside-host.ifc",
            "interpretation": (
                "IFC4 schema validation is structural, not engineering: a void may "
                "float anywhere. AISE-side containment gates are mandatory before "
                "projection, and round-trip quantity comparison catches any leak."
            ),
        },
        divergence_caught=caught,
    )


# ---------------------------------------------------------------------------
# 3. negative dimensions
# ---------------------------------------------------------------------------

def case_negative_dimensions():
    for op_type, param in (
        ("create-wall", "length"),
        ("create-opening", "width"),
        ("create-slab", "thickness"),
        ("create-column", "height"),
        ("create-beam", "depth"),
        ("create-footing", "length"),
    ):
        fixture = _mutate(build_fixture(), op_type, param, -5)
        compiled, failures = compile_fixture(fixture)
        gate_codes = sorted({f["code"] for f in (failures or [])})
        record(
            f"neg-3/negative-dimension/{op_type}.{param}",
            f"{op_type} {param} = -5 (negative)",
            "AISE-side gate refuses (parameters must be positive)",
            refused=compiled is None and "parameter_not_positive" in gate_codes,
            evidence={"gateCodes": gate_codes},
        )


# ---------------------------------------------------------------------------
# 4. disconnected footing
# ---------------------------------------------------------------------------

def footing_contact_gate(fixture: dict) -> tuple[bool, list]:
    """Spike-level CROSS-operation consistency gate: a footing whose
    'supported-by' dependency targets a column must physically meet that
    column's support chain (XY footprint overlap within the fixture's
    documented tolerance). IFC4 has no mandatory product-level support
    relationship, so this semantic can only live on the AISE side.
    """
    placements = {
        op["operationType"]: op["ifc"]["geometry"]["placement"]
        for op in fixture["operations"]
    }
    footing = placements.get("create-footing")
    column = placements.get("create-column")
    if footing is None or column is None:
        return True, ["missing operands — nothing to check (fail closed on absence)"]
    xy_overlap = abs(footing[0] - column[0]) < 1.0 and abs(footing[1] - column[1]) < 1.0
    if xy_overlap:
        return True, []
    return False, [
        {
            "code": "supported_element_disconnected",
            "detail": (
                f"footing at ({footing[0]}, {footing[1]}) does not meet the column "
                f"at ({column[0]}, {column[1]}) it is declared to support (dependency "
                f"'supported-by') — IFC4 carries no mandatory support relationship, "
                f"so the AISE-side contact gate is the only enforcement"
            ),
        }
    ]


def case_disconnected_footing():
    canonical = build_fixture()
    ok_canonical, _ = footing_contact_gate(canonical)

    fixture = copy.deepcopy(canonical)
    for op in fixture["operations"]:
        if op["operationType"] == "create-footing":
            op["ifc"]["geometry"]["placement"] = [17.7, 15.7, -0.5]  # 10 m away
    ok_moved, reasons = footing_contact_gate(fixture)
    compiled, failures = compile_fixture(fixture)  # per-op gates pass...
    gate_codes = sorted({f["code"] for f in (failures or [])})

    # IFC-side: what relationship types exist in IFC4 for connectivity?
    connective = sorted(
        t for t in dir(ifcopenshell.ifcopenshell_wrapper) if "RelConnects" in t
    )
    record(
        "neg-4/disconnected-footing",
        "footing moved 10 m from the column it supports (dependency 'supported-by')",
        "AISE-side CROSS-operation contact gate refuses (per-op gates alone would pass — IFC4 has no mandatory support relationship)",
        refused=not ok_moved and compiled is not None,
        evidence={
            "crossOperationGate": reasons,
            "perOpGateCodes": gate_codes,
            "perOpGatesPass": compiled is not None,
            "canonicalFixtureContactOk": ok_canonical,
            "ifc4ConnectsRelationships": connective[:8],
            "interpretation": (
                "IfcRelConnects* relationships exist but are optional and carry no "
                "geometric consistency enforcement; the column-footing support "
                "semantic stays in the AISE dependency graph, which is why the "
                "mapping is declared lossy for create-footing."
            ),
        },
    )


# ---------------------------------------------------------------------------
# 5. duplicate operation identity
# ---------------------------------------------------------------------------

def case_duplicate_operation_identity():
    fixture = build_fixture()
    op = fixture["operations"][0]
    deps = [{"dependencyKind": d["dependencyKind"], "operationRef": "resolved"}
            for d in op["dependsOn"]] or []
    op_resolved = {**op, "dependsOn": deps}
    id_a = derive_operation_id(SPIKE_SOLUTION_ID, 1, 1, op_resolved)
    id_b = derive_operation_id(SPIKE_SOLUTION_ID, 1, 1, op_resolved)
    identity_is_content = id_a == id_b

    # IFC-side probe: two elements carrying the SAME Pset_AISE operation id
    model, _ = safe_open(os.path.join(FIXTURE_DIR, "fixture-v1.ifc"))
    beam = next(e for e in model.by_type("IfcBeam"))
    wall = next(e for e in model.by_type("IfcWall") if e.Name == "Wall-South")
    wall_pset_values = {
        p.Name: p.NominalValue.wrappedValue
        for rel in wall.IsDefinedBy
        if rel.is_a("IfcRelDefinesByProperties")
        and rel.RelatingPropertyDefinition.is_a("IfcPropertySet")
        and rel.RelatingPropertyDefinition.Name == "Pset_AISE"
        for p in rel.RelatingPropertyDefinition.HasProperties
    }
    forged = ifcopenshell.api.run("pset.add_pset", model, product=beam, name="Pset_AISE")
    ifcopenshell.api.run(
        "pset.edit_pset", model, pset=forged, properties=wall_pset_values
    )
    path = os.path.join(RESULTS_DIR, "neg-duplicate-operation-id.ifc")
    model.write(path)
    reopened, _ = safe_open(path)
    counts = {}
    for element in reopened.by_type("IfcElement"):
        props = psets_of(reopened, element)
        op_id = props.get("Pset_AISE", {}).get("AISE_OperationId")
        if op_id:
            counts[op_id] = counts.get(op_id, 0) + 1
    duplicates = {k: v for k, v in counts.items() if v > 1}
    record(
        "neg-5/duplicate-operation-identity",
        "the wall's AISE operation id forged onto the beam (two elements, one identity)",
        "identity is content: identical semantic content at the same position derives the same id; the importer flags the duplicated external reference fail-closed",
        refused=bool(duplicates) and identity_is_content,
        evidence={
            "identityIsContent": identity_is_content,
            "duplicateExternalReferencesDetected": duplicates,
            "importerGate": "duplicate-external-reference",
            "artifact": "results/neg-duplicate-operation-id.ifc",
        },
    )


# ---------------------------------------------------------------------------
# 6. unsupported operation
# ---------------------------------------------------------------------------

def case_unsupported_operation():
    fixture = copy.deepcopy(build_fixture())
    fixture["operations"].append({
        "operationType": "create-dome-shell",
        "summary": "not in the fixture catalogue",
        "parameters": [{"name": "radius", "value": 5, "unit": "m"}],
        "target": {
            "selectorKind": "geometry-plane",
            "nodeRefs": ["node-room-shell"],
            "geometryRefs": [],
            "units": {"linear": "m"},
        },
        "dependsOn": [],
        "ifc": {},
    })
    compiled, failures = compile_fixture(fixture)
    gate_codes = sorted({f["code"] for f in (failures or [])})
    record(
        "neg-6/unsupported-operation",
        "operation type 'create-dome-shell' (outside the spike catalogue)",
        "capability gate refuses definitively (never best-efforted)",
        refused=compiled is None and "capability_unsupported" in gate_codes,
        evidence={
            "gateCodes": gate_codes,
            "note": (
                "the canonical AISE type 'excavation' is ALSO refused for the IFC "
                "projection: it is an ACT with a quantity model, not a product with "
                "an IFC4 entity — IFC4x3's IfcEarthworksCut exists but act quantities "
                "(excavated-soil-volume) remain AISE-domain"
            ),
        },
    )

    # excavation probe (canonical AISE type, no IFC4 product mapping)
    fixture2 = copy.deepcopy(build_fixture())
    fixture2["operations"].append({
        "operationType": "excavation",
        "summary": "canonical AISE Phase 1 type without an IFC4 product mapping",
        "parameters": [{"name": "depth", "value": 2, "unit": "m"},
                       {"name": "width", "value": 3, "unit": "m"},
                       {"name": "length", "value": 10, "unit": "m"}],
        "target": {
            "selectorKind": "geometry-plane",
            "nodeRefs": ["node-site"],
            "geometryRefs": [],
            "units": {"linear": "m"},
        },
        "dependsOn": [],
        "ifc": {},
    })
    compiled2, failures2 = compile_fixture(fixture2)
    gate_codes2 = sorted({f["code"] for f in (failures2 or [])})
    record(
        "neg-6/excavation-no-ifc-product",
        "canonical AISE 'excavation' offered to the IFC projection",
        "refused: an act with quantities is not an IFC4 product — the explicit IFC-interop vs AISE-canonical boundary",
        refused=compiled2 is None and "capability_unsupported" in gate_codes2,
        evidence={
            "gateCodes": gate_codes2,
            "aiseQuantityModelExists": "excavated-soil-volume = depth x width x length (Phase 1)",
            "ifc4X3Note": "IfcEarthworksCut (IFC4x3) could carry the void shape, but the act quantity stays AISE-domain",
        },
    )


# ---------------------------------------------------------------------------
# 7. malformed provider response
# ---------------------------------------------------------------------------

def case_malformed_provider_response():
    source = os.path.join(FIXTURE_DIR, "fixture-v1.ifc")
    with open(source, "rb") as fh:
        good = fh.read()

    cases = []

    # (a) garbage bytes
    p = os.path.join(RESULTS_DIR, "neg-garbage.ifc")
    with open(p, "wb") as fh:
        fh.write(b"\x00\x01\xff\xfe not a step file at all " * 64)
    cases.append(("garbage-bytes", p))

    # (b) truncated STEP (cut at 60%)
    p = os.path.join(RESULTS_DIR, "neg-truncated.ifc")
    with open(p, "wb") as fh:
        fh.write(good[: int(len(good) * 0.6)])
    cases.append(("truncated-step", p))

    # (c) invalid STEP syntax inside a valid-looking header
    text = good.decode("utf-8")
    lines = text.split("\n")
    inject_at = len(lines) // 2
    lines.insert(inject_at, "#9999=IFCWALL('broken")
    p = os.path.join(RESULTS_DIR, "neg-invalid-syntax.ifc")
    with open(p, "w") as fh:
        fh.write("\n".join(lines))
    cases.append(("invalid-step-syntax", p))

    # (d) schema header mismatch (claims IFC2X3, body is IFC4)
    p = os.path.join(RESULTS_DIR, "neg-schema-mismatch.ifc")
    with open(p, "w") as fh:
        fh.write(text.replace("FILE_SCHEMA(('IFC4'))", "FILE_SCHEMA(('IFC2X3'))", 1))
    cases.append(("schema-header-mismatch", p))

    for name, path in cases:
        model, failure = safe_open(path)
        record(
            f"neg-7/malformed-ifc/{name}",
            f"malformed IFC artifact: {name}",
            "ifcopenshell refuses to open (typed failure, no fabricated geometry)",
            refused=model is None,
            evidence=failure or {"unexpectedlyOpened": True},
        )

    # (e) schema-VALID but engineering-invalid: negative profile dimensions
    model = ifcopenshell.api.run("project.create_file", version="IFC4")
    ifcopenshell.api.run("root.create_entity", model, ifc_class="IfcProject", name="P")
    ifcopenshell.api.run(
        "unit.assign_unit", model, length={"is_metric": True, "is_si": True, "raw": "metres"}
    )
    ctx = ifcopenshell.api.run("context.add_context", model, context_type="Model")
    body = ifcopenshell.api.run(
        "context.add_context", model, context_type="Model", context_identifier="Body",
        target_view="MODEL_VIEW", parent=ctx,
    )
    wall = ifcopenshell.api.run("root.create_entity", model, ifc_class="IfcWall", name="BadWall")
    profile = model.create_entity("IfcRectangleProfileDef", ProfileType="AREA", XDim=-5.0, YDim=0.2)
    solid = model.create_entity(
        "IfcExtrudedAreaSolid",
        SweptArea=profile,
        Position=model.create_entity(
            "IfcAxis2Placement3D", Location=model.create_entity("IfcCartesianPoint", (0.0, 0.0, 0.0))
        ),
        ExtrudedDirection=model.create_entity("IfcDirection", (0.0, 0.0, 1.0)),
        Depth=3.0,
    )
    shape = model.create_entity(
        "IfcShapeRepresentation", ContextOfItems=body,
        RepresentationIdentifier="Body", RepresentationType="SweptSolid", Items=[solid],
    )
    ifcopenshell.api.run("geometry.assign_representation", model, product=wall, representation=shape)
    p = os.path.join(RESULTS_DIR, "neg-negative-dims.ifc")
    model.write(p)
    reopened, _ = safe_open(p)
    schema_accepts = reopened is not None
    metrics = kernel_metrics(reopened.by_type("IfcWall")[0]) if reopened else None
    refused_by_kernel = metrics is None or metrics.get("error") is not None or (metrics.get("volume", 0) <= 0)
    record(
        "neg-7/schema-valid-negative-dimensions",
        "schema-valid IFC4 wall with XDim=-5.0 (negative profile dimension)",
        "the file OPENS (STEP/schema-valid) — the geometry kernel must fail closed on the nonsense shape (no fabricated geometry)",
        refused=schema_accepts and refused_by_kernel,
        evidence={
            "ifcOpens": schema_accepts,
            "kernelMetrics": metrics,
            "interpretation": (
                "IFC schema validation accepts engineering nonsense; the provider "
                "boundary must treat kernel failures as typed refusals"
            ),
            "artifact": "results/neg-negative-dims.ifc",
        },
    )

    # (f) empty body representation (unsupported geometry case)
    model2 = ifcopenshell.api.run("project.create_file", version="IFC4")
    ifcopenshell.api.run("root.create_entity", model2, ifc_class="IfcProject", name="P")
    ifcopenshell.api.run(
        "unit.assign_unit", model2, length={"is_metric": True, "is_si": True, "raw": "metres"}
    )
    ctx2 = ifcopenshell.api.run("context.add_context", model2, context_type="Model")
    body2 = ifcopenshell.api.run(
        "context.add_context", model2, context_type="Model", context_identifier="Body",
        target_view="MODEL_VIEW", parent=ctx2,
    )
    wall2 = ifcopenshell.api.run("root.create_entity", model2, ifc_class="IfcWall", name="EmptyWall")
    empty_shape = model2.create_entity(
        "IfcShapeRepresentation", ContextOfItems=body2,
        RepresentationIdentifier="Body", RepresentationType="SweptSolid", Items=[],
    )
    ifcopenshell.api.run(
        "geometry.assign_representation", model2, product=wall2, representation=empty_shape
    )
    p = os.path.join(RESULTS_DIR, "neg-empty-representation.ifc")
    model2.write(p)
    reopened2, _ = safe_open(p)
    try:
        settings = ifcopenshell.geom.settings()
        settings.set("use-world-coords", True)
        ifcopenshell.geom.create_shape(settings, reopened2.by_type("IfcWall")[0])
        kernel_outcome = "shape-created-from-nothing"
        refused = False
    except Exception as exc:  # noqa: BLE001
        kernel_outcome = f"{type(exc).__name__}: {str(exc)[:160]}"
        refused = True
    record(
        "neg-7/empty-body-representation",
        "schema-valid wall whose Body representation carries zero items",
        "the geometry kernel refuses (typed failure) — never a fabricated shape",
        refused=refused,
        evidence={
            "ifcOpens": reopened2 is not None,
            "kernelOutcome": kernel_outcome,
            "artifact": "results/neg-empty-representation.ifc",
        },
    )


# ---------------------------------------------------------------------------
# D2. millimetre-default unit hazard
# ---------------------------------------------------------------------------

def case_unit_mismatch_hazard():
    model = ifcopenshell.api.run("project.create_file", version="IFC4")
    ifcopenshell.api.run("root.create_entity", model, ifc_class="IfcProject", name="P")
    ifcopenshell.api.run("unit.assign_unit", model)  # the DEFAULT: LENGTHUNIT = MILLI-metre!
    ctx = ifcopenshell.api.run("context.add_context", model, context_type="Model")
    body = ifcopenshell.api.run(
        "context.add_context", model, context_type="Model", context_identifier="Body",
        target_view="MODEL_VIEW", parent=ctx,
    )
    slab = ifcopenshell.api.run("root.create_entity", model, ifc_class="IfcSlab", name="S")
    profile = model.create_entity("IfcRectangleProfileDef", ProfileType="AREA", XDim=8.0, YDim=6.0)
    solid = model.create_entity(
        "IfcExtrudedAreaSolid",
        SweptArea=profile,
        Position=model.create_entity(
            "IfcAxis2Placement3D", Location=model.create_entity("IfcCartesianPoint", (0.0, 0.0, 0.0))
        ),
        ExtrudedDirection=model.create_entity("IfcDirection", (0.0, 0.0, 1.0)),
        Depth=0.2,
    )
    shape = model.create_entity(
        "IfcShapeRepresentation", ContextOfItems=body,
        RepresentationIdentifier="Body", RepresentationType="SweptSolid", Items=[solid],
    )
    ifcopenshell.api.run("geometry.assign_representation", model, product=slab, representation=shape)
    p = os.path.join(RESULTS_DIR, "neg-unit-hazard.ifc")
    model.write(p)
    reopened, _ = safe_open(p)

    def length_unit_of(m):
        for ua in m.by_type("IfcUnitAssignment"):
            for u in ua.Units:
                if u.is_a("IfcSIUnit") and u.UnitType == "LENGTHUNIT":
                    return f"{u.Prefix or ''}{u.Name}".lower()
        return None

    unit = length_unit_of(reopened)
    metrics = kernel_metrics(reopened.by_type("IfcSlab")[0])
    expected_m3 = 8.0 * 6.0 * 0.2
    caught = (
        unit == "millimetre"
        and metrics["volume"] < expected_m3 / 100.0  # 1000x off in linear => 1e9 off in volume
    )
    record(
        "div-2/millimetre-default-unit-hazard",
        "naive project-unit assignment (IfcOpenShell default) + metre-scale hand-built representation",
        "the schema accepts the file; only quantity comparison against the AISE reference exposes the 1000x scale error",
        refused=False,  # the SCHEMA accepts — that is the finding
        evidence={
            "projectLengthUnit": unit,
            "kernelVolume": metrics["volume"],
            "aiseReferenceVolume": expected_m3,
            "scaleFactor": expected_m3 / metrics["volume"] if metrics["volume"] else None,
            "interpretation": (
                "IfcOpenShell's default IfcProject unit is MILLIMETRE while its "
                "wall/slab helper APIs accept metres and convert; hand-built "
                "representations are NOT converted. The IFC schema carries no "
                "engineering sanity check — AISE must compare quantities, never "
                "trust file-level units."
            ),
            "artifact": "results/neg-unit-hazard.ifc",
        },
        divergence_caught=caught,
    )


# ---------------------------------------------------------------------------
# D3. no constraint propagation (door left 900 mm in the 1000 mm opening)
# ---------------------------------------------------------------------------

def case_no_constraint_propagation():
    model, _ = safe_open(os.path.join(FIXTURE_DIR, "fixture-v1.ifc"))
    door = next(e for e in model.by_type("IfcDoor"))
    opening = next(e for e in model.by_type("IfcOpeningElement") if e.Name == "Opening-Door")
    door_width = door.OverallWidth
    opening_metrics = kernel_metrics(opening)
    opening_width = opening_metrics["bboxMax"][0] - opening_metrics["bboxMin"][0]
    caught = abs(opening_width - door_width) > 1e-6
    record(
        "div-3/no-constraint-propagation",
        "after revise-opening widened the void to 1000 mm, the IfcDoor fill stays 900 mm",
        "IFC has no constraint propagation; the mismatch is a declared divergence the harness must catch (the AISE dependency graph + quantity comparison, not the file, holds the semantics)",
        refused=False,
        evidence={
            "doorOverallWidth": door_width,
            "openingWidth": opening_width,
            "divergence": opening_width - door_width,
            "aiseSideHandling": (
                "the fixture's revise-opening op revises the OPENING only; a "
                "revise-door operation (or a pset-driven rule in the adapter) is "
                "required — the IFC file alone will never enforce it"
            ),
        },
        divergence_caught=caught,
    )


def main() -> int:
    case_impossible_wall_thickness()
    case_opening_outside_host()
    case_negative_dimensions()
    case_disconnected_footing()
    case_duplicate_operation_identity()
    case_unsupported_operation()
    case_malformed_provider_response()
    case_unit_mismatch_hazard()
    case_no_constraint_propagation()

    report = {
        "cases": CASES,
        "summary": {
            "total": len(CASES),
            "refusedFailClosed": sum(1 for c in CASES if c["status"] == "REFUSED-FAIL-CLOSED"),
            "divergenceCaught": sum(1 for c in CASES if c["status"] == "DIVERGENCE-CAUGHT"),
            "divergenceMissed": sum(1 for c in CASES if c["status"] == "DIVERGENCE-MISSED"),
            "unexpectedPasses": sum(1 for c in CASES if c["status"] == "PASSED-UNEXPECTEDLY"),
        },
    }
    with open(os.path.join(RESULTS_DIR, "negatives-report.json"), "w") as fh:
        json.dump(report, fh, indent=1, sort_keys=True)
    print(json.dumps(report["summary"], indent=1))
    ok = (
        report["summary"]["unexpectedPasses"] == 0
        and report["summary"]["divergenceMissed"] == 0
    )
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
