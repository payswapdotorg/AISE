"""
GBIM-002 spike — AISE -> IFC4 exporter (provider-neutral projection).

Maps the ten canonical fixture operations into IFC4 through IfcOpenShell
0.8.5's Python API (the same `ifcopenshell.api` core that Bonsai drives).

ARCHITECTURE LAW (charter §2), enforced here:
  * AISE operation/state IDs ride as EXTERNAL references in a Pset_AISE
    property set — they NEVER replace or masquerade as IFC GlobalIds;
  * the IFC GlobalId of each element is derived deterministically from the
    AISE identity (uuid5) under the "deterministic export profile", so the
    projection itself is byte-reproducible — while the RAW profile (random
    GUIDs, wall-clock stamps, exactly what a naive integration produces)
    is also exported to demonstrate that an IFC file digest is NEVER
    identity: AISE IDs are.

Two export profiles:
  deterministic — uuid5 GlobalIds keyed by AISE operation identity, fixed
                  header timestamp, zeroed owner-history stamps.
  raw           — stock random GlobalIds + wall-clock stamps (a naive
                  integration's file), used as divergence evidence.

Outputs (relative to the spike root):
  fixture/fixture-v1.ifc, fixture/fixture-v2.ifc      (deterministic)
  fixture/fixture-v1-raw-a.ifc, fixture-v1-raw-b.ifc  (raw, two runs)
  fixture/aise-ifc-map.json                          (mapping sidecar)
  results/export-report.json
"""

from __future__ import annotations

import json
import os
import sys
import time
import uuid

import ifcopenshell
import ifcopenshell.api
import ifcopenshell.guid
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from aise_canon import (  # noqa: E402
    SPIKE_SOLUTION_ID,
    build_fixture,
    compile_fixture,
    fixture_input_digest,
)

SPIKE_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FIXTURE_DIR = os.path.join(SPIKE_ROOT, "fixture")
RESULTS_DIR = os.path.join(SPIKE_ROOT, "results")
FIXED_HEADER_TIMESTAMP = "1970-01-01T00:00:00"


def sha256_file(path: str) -> str:
    import hashlib

    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def add_box_representation(model, context, profile_x, profile_y, depth):
    """A deterministic IfcExtrudedAreaSolid box (profile centred on the
    placement origin, extruded +Z by depth)."""
    profile = model.create_entity(
        "IfcRectangleProfileDef", ProfileType="AREA", XDim=float(profile_x), YDim=float(profile_y)
    )
    position = model.create_entity(
        "IfcAxis2Placement3D",
        Location=model.create_entity("IfcCartesianPoint", (0.0, 0.0, 0.0)),
    )
    solid = model.create_entity(
        "IfcExtrudedAreaSolid",
        SweptArea=profile,
        Position=position,
        ExtrudedDirection=model.create_entity("IfcDirection", (0.0, 0.0, 1.0)),
        Depth=float(depth),
    )
    return model.create_entity(
        "IfcShapeRepresentation",
        ContextOfItems=context,
        RepresentationIdentifier="Body",
        RepresentationType="SweptSolid",
        Items=[solid],
    )


def place(model, product, xyz):
    matrix = np.eye(4)
    matrix[0, 3], matrix[1, 3], matrix[2, 3] = (float(xyz[0]), float(xyz[1]), float(xyz[2]))
    ifcopenshell.api.run(
        "geometry.edit_object_placement", model, product=product, matrix=matrix, is_si=True
    )


def set_aise_pset(model, element, compiled_op, extra=None):
    """Attaches Pset_AISE — the AISE identity as an EXTERNAL mapping
    reference (never the vendor GlobalId)."""
    pset = ifcopenshell.api.run(
        "pset.add_pset", model, product=element, name="Pset_AISE"
    )
    props = {
        "AISE_OperationId": compiled_op["operationId"],
        "AISE_OperationType": compiled_op["operationType"],
        "AISE_SolutionId": SPIKE_SOLUTION_ID,
        "AISE_VersionNumber": float(compiled_op.get("versionNumber", 1)),
        "AISE_OperationIndex": float(compiled_op["operationIndex"]),
        "AISE_ResultingStateId": compiled_op.get("resultingStateId", ""),
        "AISE_CanonicalAnalogue": compiled_op.get("canonicalAnalogue") or "none",
        "AISE_ParametersJson": json.dumps(
            compiled_op["parameters"], sort_keys=True, separators=(",", ":")
        ),
    }
    if extra:
        props.update(extra)
    ifcopenshell.api.run("pset.edit_pset", model, pset=pset, properties=props)


def set_aise_qto(model, element, compiled_op):
    """Attaches the AISE reference quantities as an IfcElementQuantity —
    an interop PROJECTION of AISE-derived numbers. They are claims inside
    the IFC artifact, re-derivable only from the AISE authority."""
    quantities = compiled_op.get("aiseQuantities")
    if not quantities:
        return None
    qto = ifcopenshell.api.run(
        "pset.add_qto", model, product=element, name="AISE_ReferenceQuantities"
    )
    # NOTE: plain quantity names only — IfcOpenShell 0.8.5's edit_qto name
    # heuristic mangles bracketed suffixes ("label [m3]" -> "label 3]"),
    # itself a recorded provider quirk. Units live in the AISE metadata.
    ifcopenshell.api.run(
        "pset.edit_qto",
        model,
        qto=qto,
        properties={q["label"]: float(q["value"]) for q in quantities},
    )
    # quantity-set provenance rides in Pset_AISE (IfcElementQuantity property
    # values are strictly typed — string metadata is refused by the API,
    # itself a small fail-closed behaviour worth recording)
    pset = ifcopenshell.api.run(
        "pset.add_pset", model, product=element, name="Pset_AISE_QuantityProvenance"
    )
    ifcopenshell.api.run(
        "pset.edit_pset",
        model,
        pset=pset,
        properties={
            "AISE_MethodOfMeasurement": "aise-phase1 reference quantity models v1 (spike mirror)",
            "AISE_QuantityLabelsJson": json.dumps([q["label"] for q in quantities]),
        },
    )
    return qto


def determinize(model, guid_key_map, solution_id, version_number):
    """Deterministic export profile: uuid5 GlobalIds for EVERY IfcRoot
    (fixture elements keyed by AISE identity; structural entities keyed by
    their stable STEP id), fixed header timestamp, zeroed owner-history
    stamps and a stable IfcUnitAssignment order (the unit list order varies
    across processes in IfcOpenShell's default profile — hash-set ordering).
    """
    # 1. GlobalIds: fixture-mapped entities keyed BY AISE identity; every
    #    remaining IfcRoot (project, psets, relationships, spatial tree)
    #    keyed by its stable STEP id (deterministic creation sequence).
    for entity in model.by_type("IfcRoot"):
        derived = guid_key_map.get(id(entity))
        if derived is None:
            derived = ifcopenshell.guid.compress(
                str(
                    uuid.uuid5(
                        uuid.NAMESPACE_URL,
                        f"aise-gbim002|{solution_id}|v{version_number}"
                        f"|{entity.is_a()}|{getattr(entity, 'Name', '') or ''}"
                        f"|step{entity.id()}",
                    )
                )
            )
        entity.GlobalId = derived
    # 2. zero every owner-history timestamp
    for owner in model.by_type("IfcOwnerHistory"):
        owner.CreationDate = 0
        owner.LastModifiedDate = 0
    # 3. stable unit-assignment order (per-process set iteration otherwise)
    for ua in model.by_type("IfcUnitAssignment"):
        ua.Units = sorted(
            ua.Units, key=lambda u: (u.UnitType, str(getattr(u, "Prefix", None) or ""))
        )
    # 3b. stable spatial-containment order (set-iteration inside
    #     spatial.assign_container otherwise)
    for rel in model.by_type("IfcRelContainedInSpatialStructure"):
        rel.RelatedElements = sorted(rel.RelatedElements, key=lambda e: e.id())
    # 4. fixed STEP header timestamp
    try:
        model.header.file_name.time_stamp = FIXED_HEADER_TIMESTAMP
    except Exception:
        pass


def build_model(compiled: dict, deterministic: bool) -> tuple[object, list]:
    """Builds the IFC4 projection of the compiled AISE fixture."""
    model = ifcopenshell.api.run("project.create_file", version="IFC4")
    project = ifcopenshell.api.run(
        "root.create_entity", model, ifc_class="IfcProject", name="AISE GBIM-002 Fixture"
    )
    ifcopenshell.api.run(
        "pset.edit_pset",
        model,
        pset=ifcopenshell.api.run(
            "pset.add_pset", model, product=project, name="Pset_AISE_Project"
        ),
        properties={
            "AISE_SolutionId": compiled["solutionId"],
            "AISE_VersionNumber": float(compiled["versionNumber"]),
            "AISE_FinalStateId": compiled["finalStateId"],
            "AISE_FixtureInputDigest": fixture_input_digest(compiled),
        },
    )
    # SI METRE project length unit, assigned EXPLICITLY: IfcOpenShell's
    # default (no-argument) assignment is LENGTHUNIT = MILLI-metre — a BIM
    # convention that silently rescales any hand-built representation by
    # 1000x (recorded as a discrimination case in the negatives evidence).
    ifcopenshell.api.run(
        "unit.assign_unit", model, length={"is_metric": True, "is_si": True, "raw": "metres"}
    )
    ctx = ifcopenshell.api.run("context.add_context", model, context_type="Model")
    body = ifcopenshell.api.run(
        "context.add_context",
        model,
        context_type="Model",
        context_identifier="Body",
        target_view="MODEL_VIEW",
        parent=ctx,
    )
    site = ifcopenshell.api.run("root.create_entity", model, ifc_class="IfcSite", name="Site")
    building = ifcopenshell.api.run("root.create_entity", model, ifc_class="IfcBuilding", name="Building")
    storey = ifcopenshell.api.run(
        "root.create_entity", model, ifc_class="IfcBuildingStorey", name="Storey 0"
    )
    ifcopenshell.api.run("aggregate.assign_object", model, relating_object=site, products=[building])
    ifcopenshell.api.run("aggregate.assign_object", model, relating_object=building, products=[storey])

    elements: dict = {}   # name -> entity
    guid_key_map: dict = {}
    mapping_rows: list = []

    def aise_guid(compiled_op, ifc_class, name):
        """Deterministic GlobalId derived from the AISE identity (never the
        other way around — the AISE ID is the authority, the GUID is an
        external reference keyed BY it)."""
        return ifcopenshell.guid.compress(
            str(
                uuid.uuid5(
                    uuid.NAMESPACE_URL,
                    f"aise-gbim002|{compiled['solutionId']}|v{compiled['versionNumber']}"
                    f"|{compiled_op['operationId']}|{ifc_class}|{name}",
                )
            )
        )

    for op in compiled["operations"]:
        ifc_spec = op["ifc"]
        if op["operationType"] == "revise-opening":
            # revision semantics: the SAME opening element carries the new
            # geometry + the revision's AISE identity (IFC has no append-only
            # version graph — mapped as "edit + re-export", see the report).
            # The ORIGINAL create-opening reference is preserved in its own
            # Pset_AISE; the revision rides in Pset_AISE_Revision (never an
            # overwrite — both AISE identities stay recoverable).
            target = elements.get(ifc_spec["name"])
            if target is not None:
                # re-represent the revised geometry (replace, not append)
                for shape_rep in list(target.Representation.Representations):
                    ifcopenshell.api.run(
                        "geometry.unassign_representation",
                        model,
                        product=target,
                        representation=shape_rep,
                    )
                geo = ifc_spec["geometry"]
                rep = add_box_representation(model, body, geo["profile"][0], geo["profile"][1], geo["depth"])
                ifcopenshell.api.run("geometry.assign_representation", model, product=target, representation=rep)
                place(model, target, geo["placement"])
                revision_pset = ifcopenshell.api.run(
                    "pset.add_pset", model, product=target, name="Pset_AISE_Revision"
                )
                ifcopenshell.api.run(
                    "pset.edit_pset",
                    model,
                    pset=revision_pset,
                    properties={
                        "AISE_OperationId": op["operationId"],
                        "AISE_OperationType": op["operationType"],
                        "AISE_SolutionId": SPIKE_SOLUTION_ID,
                        "AISE_VersionNumber": float(op.get("versionNumber", 2)),
                        "AISE_OperationIndex": float(op["operationIndex"]),
                        "AISE_ResultingStateId": op.get("resultingStateId", ""),
                        "AISE_RevisionOf": "the 900 mm door opening created by create-opening",
                        "AISE_ParametersJson": json.dumps(
                            op["parameters"], sort_keys=True, separators=(",", ":")
                        ),
                    },
                )
                # the adapter's revision obligation: re-project the CURRENT
                # state's quantities (the pre-revision values are historical
                # AISE records — IFC keeps final state only)
                for rel in getattr(target, "IsDefinedBy", []) or []:
                    if not rel.is_a("IfcRelDefinesByProperties"):
                        continue
                    definition = rel.RelatingPropertyDefinition
                    if definition.is_a("IfcElementQuantity") and definition.Name == "AISE_ReferenceQuantities":
                        ifcopenshell.api.run(
                            "pset.edit_qto",
                            model,
                            qto=definition,
                            properties={
                                q["label"]: float(q["value"])
                                for q in (op.get("aiseQuantities") or [])
                            },
                        )
                mapping_rows.append({
                    "aiseOperationId": op["operationId"],
                    "operationType": op["operationType"],
                    "ifcClass": "IfcOpeningElement",
                    "ifcName": ifc_spec["name"],
                    "ifcGuid": target.GlobalId,
                    "mapping": "edit-and-re-export (in-place geometry edit; history is AISE-domain)",
                    "status": "lossy",
                    "lossNotes": "IFC4 has no append-only revision graph; the AISE version chain remains the only record of the 900->1000 mm revision; the original create-opening reference is preserved in Pset_AISE while the revision rides in Pset_AISE_Revision",
                })
            continue

        ifc_class = ifc_spec["class"]
        name = ifc_spec["name"]
        entity = ifcopenshell.api.run(
            "root.create_entity", model, ifc_class=ifc_class, name=name
        )
        if ifc_spec.get("predefinedType") and hasattr(entity, "PredefinedType"):
            try:
                entity.PredefinedType = ifc_spec["predefinedType"]
            except Exception:
                pass  # IFC2X3-style class without the attribute — recorded in the report
        elements[name] = entity
        if deterministic:
            guid_key_map[id(entity)] = aise_guid(op, ifc_class, name)

        geo = ifc_spec["geometry"]
        if geo["representation"] == "wall-api":
            rep = ifcopenshell.api.run(
                "geometry.add_wall_representation",
                model,
                context=body,
                length=geo["length"],
                height=geo["height"],
                thickness=geo["thickness"],
            )
            ifcopenshell.api.run("geometry.assign_representation", model, product=entity, representation=rep)
        else:
            rep = add_box_representation(model, body, geo["profile"][0], geo["profile"][1], geo["depth"])
            ifcopenshell.api.run("geometry.assign_representation", model, product=entity, representation=rep)
        place(model, entity, geo["placement"])

        if "overallHeight" in ifc_spec and hasattr(entity, "OverallHeight"):
            entity.OverallHeight = ifc_spec["overallHeight"]
            entity.OverallWidth = ifc_spec["overallWidth"]

        if ifc_class == "IfcOpeningElement":
            host = elements[ifc_spec["voids"]]
            ifcopenshell.api.run("feature.add_feature", model, feature=entity, element=host)
        if ifc_class == "IfcWindow":
            # fenestration op creates its own opening then fills it
            opening = ifcopenshell.api.run(
                "root.create_entity", model, ifc_class="IfcOpeningElement", name="Opening-Window"
            )
            ogeo = ifc_spec["openingGeometry"]
            orep = add_box_representation(model, body, ogeo["profile"][0], ogeo["profile"][1], ogeo["depth"])
            ifcopenshell.api.run("geometry.assign_representation", model, product=opening, representation=orep)
            place(model, opening, ogeo["placement"])
            ifcopenshell.api.run("feature.add_feature", model, feature=opening, element=elements[ifc_spec["opens"]])
            ifcopenshell.api.run("feature.add_filling", model, opening=opening, element=entity)
            if deterministic:
                guid_key_map[id(opening)] = aise_guid(op, "IfcOpeningElement", "Opening-Window")
            elements["Opening-Window"] = opening
        if ifc_spec.get("fills"):
            opening = elements[ifc_spec["fills"]]
            ifcopenshell.api.run("feature.add_filling", model, opening=opening, element=entity)

        ifcopenshell.api.run("spatial.assign_container", model, products=[entity], relating_structure=storey)
        if ifc_class == "IfcOpeningElement":
            # openings sit in the spatial structure via their host; keep them
            # in the storey for visibility, mapped explicitly below.
            mapping_rows.append({
                "aiseOperationId": op["operationId"],
                "operationType": op["operationType"],
                "ifcClass": ifc_class,
                "ifcName": name,
                "ifcGuid": None,  # filled after determinize
                "mapping": "IfcOpeningElement + IfcRelVoidsElement -> host wall",
                "status": "mapped",
                "lossNotes": "void relationship is standard IFC; the AISE 'host' dependency edge round-trips as IfcRelVoidsElement",
            })
        else:
            mapping_rows.append({
                "aiseOperationId": op["operationId"],
                "operationType": op["operationType"],
                "ifcClass": ifc_class,
                "ifcName": name,
                "ifcGuid": None,
                "mapping": {
                    "create-door": "IfcDoor + IfcRelFillsElement; OverallHeight/OverallWidth attributes",
                    "create-window": "IfcWindow + self-created opening + IfcRelFillsElement",
                    "create-column": "IfcColumn (no canonical AISE op — IFC-side capability)",
                    "create-beam": "IfcBeam (no canonical AISE op — IFC-side capability)",
                    "create-footing": "IfcFooting (AISE dependency 'supported-by' has NO IFC4 product relationship — lossy)",
                    "create-slab": "IfcSlab FLOOR",
                    "create-wall": "IfcWall SOLIDWALL via add_wall_representation",
                    "create-partition": "IfcWall PARTITIONINGWALL",
                }.get(op["operationType"], "direct"),
                "status": {
                    "create-door": "mapped",
                    "create-window": "mapped",
                    "create-column": "mapped-ifc-only",
                    "create-beam": "mapped-ifc-only",
                    "create-footing": "mapped",
                    "create-slab": "mapped",
                    "create-wall": "mapped",
                    "create-partition": "mapped",
                }[op["operationType"]],
                "lossNotes": {
                    "create-door": "door leaf geometry simplified to a panel box; no canonical AISE quantity model (gap)",
                    "create-window": "fenestration op folds opening+filling into one AISE operation (documented mapping decision); no canonical quantity model (gap)",
                    "create-column": "AISE Phase 1 catalogue gap — element is an IFC-side capability, not an AISE canonical operation",
                    "create-beam": "AISE Phase 1 catalogue gap — element is an IFC-side capability, not an AISE canonical operation",
                    "create-footing": "IFC4 expresses no mandatory column-footing support relationship; the AISE dependency graph stays authoritative",
                    "create-slab": "exact",
                    "create-wall": "exact via wall API representation",
                    "create-partition": "exact; partition semantics ride on PredefinedType=PARTITIONINGWALL",
                }[op["operationType"]],
            })

        set_aise_pset(model, entity, op)
        set_aise_qto(model, entity, op)

    if deterministic:
        determinize(model, guid_key_map, compiled["solutionId"], compiled["versionNumber"])

    # finalize mapping rows with real GUIDs
    by_name = {getattr(e, "Name", ""): e for e in model.by_type("IfcRoot")}
    for row in mapping_rows:
        entity = by_name.get(row["ifcName"])
        if entity is not None and row["ifcGuid"] is None:
            row["ifcGuid"] = entity.GlobalId

    return model, mapping_rows


def main() -> int:
    os.makedirs(FIXTURE_DIR, exist_ok=True)
    os.makedirs(RESULTS_DIR, exist_ok=True)
    report = {"exports": [], "toolchain": {"ifcopenshell": ifcopenshell.version}}

    for version, out_name in ((1, "fixture-v1.ifc"),):
        raw = build_fixture()
        compiled, failures = compile_fixture(raw)
        if compiled is None:
            print(f"v{version}: fixture REFUSED by AISE gates — not exported")
            report["exports"].append({"version": version, "status": "refused", "failures": failures})
            continue
        t0 = time.perf_counter()
        model, rows = build_model(compiled, deterministic=True)
        out_path = os.path.join(FIXTURE_DIR, out_name)
        model.write(out_path)
        elapsed = time.perf_counter() - t0
        digest = sha256_file(out_path)

        # reproducibility: build the SAME projection again, compare digests
        model2, _ = build_model(compiled, deterministic=True)
        out2 = os.path.join(RESULTS_DIR, "repro-" + out_name)
        model2.write(out2)
        digest2 = sha256_file(out2)
        report["exports"].append({
            "version": version,
            "status": "exported",
            "path": out_name,
            "sha256": digest,
            "rebuildSha256": digest2,
            "byteDeterministic": digest == digest2,
            "seconds": round(elapsed, 4),
            "entities": len(model.by_type("IfcRoot")),
        })

        if version == 1:
            # raw profile (naive integration): random GUIDs, wall-clock stamps
            ra, _ = build_model(compiled, deterministic=False)
            pa = os.path.join(FIXTURE_DIR, "fixture-v1-raw-a.ifc")
            ra.write(pa)
            rb, _ = build_model(compiled, deterministic=False)
            pb = os.path.join(FIXTURE_DIR, "fixture-v1-raw-b.ifc")
            rb.write(pb)
            report["exports"].append({
                "version": "raw-profile-a/b",
                "status": "exported",
                "paths": ["fixture-v1-raw-a.ifc", "fixture-v1-raw-b.ifc"],
                "sha256A": sha256_file(pa),
                "sha256B": sha256_file(pb),
                "byteDeterministic": False,
                "note": (
                    "stock random GlobalIds + wall-clock stamps: two exports of the "
                    "SAME semantic content differ at byte level — an IFC file digest "
                    "is never identity; AISE operation/state IDs are"
                ),
            })
            mapping = {
                "solutionId": compiled["solutionId"],
                "versionNumber": compiled["versionNumber"],
                "finalStateId": compiled["finalStateId"],
                "fixtureInputDigest": fixture_input_digest(raw),
                "projection": {
                    "schema": model.schema,
                    "provider": f"IfcOpenShell {ifcopenshell.version}",
                    "lengthUnit": "SI metre (IfcProject assignment)",
                    "rule": "AISE IDs are external references in Pset_AISE; IFC GUIDs are keyed BY AISE identity under the deterministic profile",
                },
                "operations": rows,
            }
            with open(os.path.join(FIXTURE_DIR, "aise-ifc-map.json"), "w") as fh:
                json.dump(mapping, fh, indent=1, sort_keys=True)
            with open(os.path.join(FIXTURE_DIR, "aise-fixture-v1.json"), "w") as fh:
                json.dump(compiled, fh, indent=1, sort_keys=True)

    with open(os.path.join(RESULTS_DIR, "export-report.json"), "w") as fh:
        json.dump(report, fh, indent=1, sort_keys=True)
    print(json.dumps(report, indent=1, sort_keys=True))
    return 0


if __name__ == "__main__":
    sys.exit(main())
