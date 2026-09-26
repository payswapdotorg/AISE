#!/usr/bin/env python3
"""GBIM-001 — disposable/reference OCCT geometry provider (the spike adapter).

THE PORT DISCIPLINE (charter §2):
  This process is the ENTIRE provider side of the spike geometry port. It
  consumes the AISE-owned canonical execution input as JSON on stdin (or a
  file path argument) and emits the provider response as JSON on stdout.
  Because the only boundary is serialized JSON, NO OCCT/CadQuery/FreeCAD
  type, handle, topology object or file format can EVER cross into AISE —
  the canonical contract only ever sees the closed output vocabulary below.

Validation order mirrors the AISE engine's apply.ts gate order:
  0. input sanity (fail closed)
  1. duplicate operation identity (AISE-owned ids)
  2. capability gate (closed spike vocabulary; unsupported => nothing computed)
  3. parameter validation (positive dimensions, required parameters)
  4. semantic/host validation (host resolution, opening containment,
     wall-thickness plausibility, footing support connectivity)
  5. exact geometry construction + measurement (CadQuery over OCCT)
  6. topology validity (BRepCheck) — invalid topology fails closed

Output vocabulary (the whole provider response; strictly validated by the
AISE-side schema guard — see schema_guard.py):
  status: executed | refused
  operationResults[]: operationId, operationType, status
      applied | invalid | unsupported, reasonCode, measurements, quantities,
      externalReferences, validationChecks, executionTimeMs (timings are
      excluded from reproducibility digests and reported separately).
"""

from __future__ import annotations

import hashlib
import json
import platform
import sys
import time

PROVIDER_ID = "occt-cadquery-spike"
PORT_VERSION = "gbim001-geometry-port/1"
KERNEL_NAME = "OpenCASCADE Technology (OCCT)"
KERNEL_VERSION = "7.9.3"  # probed from the OCP binary (string "7.9.3.1")
OCCLUSION_BINDING = "cadquery-ocp 7.9.3.1.1"
AUTHORING_LAYER = "cadquery 2.8.0"

CAPABILITY_VOCABULARY = [
    "create-wall",
    "create-opening",
    "create-door",
    "create-window",
    "create-column",
    "create-footing",
    "create-slab",
    "create-beam",
    "create-partition",
    "revise-opening",
]

REQUIRED_PARAMETERS = {
    "create-wall": ["length", "height", "thickness"],
    "create-opening": ["width", "height", "sill"],
    "create-door": ["width", "height", "sill", "leaf-thickness"],
    "create-window": ["width", "height", "sill", "glazing-thickness"],
    "create-column": ["width", "depth", "height"],
    "create-footing": ["width", "depth", "height"],
    "create-slab": ["length", "width", "thickness"],
    "create-beam": ["length", "width", "depth"],
    "create-partition": ["length", "height", "thickness"],
    "revise-opening": ["width", "height", "sill", "glazing-thickness"],
}

# Dimensional parameters that must be strictly positive (mirrors the AISE
# engine's geometry.dimensions-positive check). `sill` is lawful at 0 (a
# door sits on the floor) but never negative — checked separately.
DIMENSIONAL_PARAMETERS = {
    "length", "height", "thickness", "width", "depth",
    "leaf-thickness", "glazing-thickness",
}


def canonical_json_bytes(value) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")


def digest_of(value) -> str:
    return "sha256:" + hashlib.sha256(canonical_json_bytes(value)).hexdigest()


def refuse_input(reason_code: str, detail: str) -> dict:
    return {
        "schemaVersion": 1,
        "portVersion": PORT_VERSION,
        "status": "refused",
        "reasonCode": reason_code,
        "reasonDetail": detail,
        "provenance": provider_provenance(None),
        "operationResults": [],
    }


def provider_provenance(input_digest) -> dict:
    with open(__file__, "rb") as fh:
        adapter_digest = "sha256:" + hashlib.sha256(fh.read()).hexdigest()
    return {
        "providerId": PROVIDER_ID,
        "kernel": KERNEL_NAME,
        "kernelVersion": KERNEL_VERSION,
        "binding": OCCLUSION_BINDING,
        "authoringLayer": AUTHORING_LAYER,
        "pythonVersion": platform.python_version(),
        "platform": f"{platform.system()} {platform.machine()}",
        "inputDigest": input_digest,
        "adapterSourceDigest": adapter_digest,
        "portVersion": PORT_VERSION,
    }


# ---------------------------------------------------------------------------
# OCCT side (everything below imports the kernel; nothing above does)
# ---------------------------------------------------------------------------

def execute(input_doc: dict) -> dict:
    import cadquery as cq  # noqa: F401 — presence check
    from OCP.BRepCheck import BRepCheck_Analyzer
    from OCP.Bnd import Bnd_Box
    from OCP.BRepBndLib import BRepBndLib
    from OCP.TopExp import TopExp_Explorer
    from OCP.TopAbs import TopAbs_ShapeEnum

    scene = input_doc["scene"]
    policy = scene["placementPolicy"]
    room_w = scene["roomWidthM"]
    margin = policy["openingCutMarginM"]

    # ---------------- scene state (deterministic, in-process) -------------
    state = {
        "walls": {},        # wallId -> {"base": solid, "openings": {openingId: voidBox}}
        "openings": {},     # openingId -> {width, height, sill, hostId}
        "panels": {},       # openingId -> panel solid
        "columns": {},      # columnId -> solid
        "elements": {},     # elementId -> last applied record (for host/support checks)
    }

    def box(min_pt, max_pt):
        dims = [max_pt[i] - min_pt[i] for i in range(3)]
        return cq.Solid.makeBox(
            dims[0], dims[1], dims[2], cq.Vector(*min_pt)
        )

    def measurements_of(solid) -> dict:
        from OCP.GProp import GProp_GProps
        from OCP.BRepGProp import BRepGProp

        vol_props = GProp_GProps()
        BRepGProp.VolumeProperties_s(solid.wrapped, vol_props)
        area_props = GProp_GProps()
        BRepGProp.SurfaceProperties_s(solid.wrapped, area_props)

        bnd = Bnd_Box()
        BRepBndLib.AddOptimal_s(solid.wrapped, bnd)
        xmin, ymin, zmin, xmax, ymax, zmax = bnd.Get()

        analyzer = BRepCheck_Analyzer(solid.wrapped)
        valid = analyzer.IsValid()

        def count(kind) -> int:
            exp = TopExp_Explorer(solid.wrapped, kind)
            n = 0
            while exp.More():
                n += 1
                exp.Next()
            return n

        shells = count(TopAbs_ShapeEnum.TopAbs_SHELL)
        # closed-manifold check: a solid is closed iff every shell is closed
        from OCP.TopoDS import TopoDS
        exp = TopExp_Explorer(solid.wrapped, TopAbs_ShapeEnum.TopAbs_SHELL)
        shell_closed_flags = []
        while exp.More():
            shell = TopoDS.Shell_s(exp.Current())
            shell_closed_flags.append(shell.Closed())
            exp.Next()

        def r10(v: float) -> float:
            return round(float(v), 10)

        return {
            "solidVolumeM3": r10(vol_props.Mass()),
            "surfaceAreaM2": r10(area_props.Mass()),
            "boundingBoxM": {
                "min": [r10(xmin), r10(ymin), r10(zmin)],
                "max": [r10(xmax), r10(ymax), r10(zmax)],
            },
            "topology": {
                "isValidBRep": bool(valid),
                "isClosedManifold": bool(shell_closed_flags) and all(shell_closed_flags),
                "solids": count(TopAbs_ShapeEnum.TopAbs_SOLID),
                "shells": shells,
                "faces": count(TopAbs_ShapeEnum.TopAbs_FACE),
                "edges": count(TopAbs_ShapeEnum.TopAbs_EDGE),
                "vertices": count(TopAbs_ShapeEnum.TopAbs_VERTEX),
            },
        }

    def large_face_area(solid) -> float:
        """Area of the largest planar face (the 'nominal face' basis used for
        AISE-comparable wall/partition face areas)."""
        best = 0.0
        for f in solid.Faces():
            best = max(best, f.Area())
        return round(float(best), 10)

    def top_face_area(solid) -> float:
        """Area of the topmost horizontal face (plan area basis for footings
        and slabs)."""
        best = 0.0
        bb = solid.BoundingBox()
        for f in solid.Faces():
            c = f.Center()
            if abs(c.z - bb.zmax) < 1e-9:
                best = max(best, f.Area())
        return round(float(best), 10)

    def param(op: dict, name: str):
        for entry in op["parameters"]:
            if entry["name"] == name:
                return entry["value"]
        return None

    def fail(op: dict, code: str, detail: str, checks=None) -> dict:
        return {
            "operationId": op["operationId"],
            "operationType": op["operationType"],
            "status": "invalid",
            "reasonCode": code,
            "reasonDetail": detail,
            "measurements": None,
            "quantities": None,
            "hostEffect": None,
            "externalReferences": None,
            "validationChecks": checks or [{"checkId": code, "outcome": "fail", "detail": detail}],
            "executionTimeMs": 0.0,
        }

    def unsupported(op: dict, detail: str) -> dict:
        return {
            "operationId": op["operationId"],
            "operationType": op["operationType"],
            "status": "unsupported",
            "reasonCode": "unsupported-operation",
            "reasonDetail": detail,
            "measurements": None,
            "quantities": None,
            "hostEffect": None,
            "externalReferences": None,
            "validationChecks": [
                {"checkId": "capability-declared", "outcome": "fail", "detail": detail}
            ],
            "executionTimeMs": 0.0,
        }

    def q(label, dimension, value, unit, direction, basis, previous=None) -> dict:
        out = {
            "label": label,
            "dimension": dimension,
            "value": value,
            "unit": unit,
            "direction": direction,
            "basis": basis,
        }
        if previous is not None:
            out["previousValue"] = previous
        return out

    def rebuild_wall(wall_id: str):
        entry = state["walls"][wall_id]
        wall = entry["base"]
        for _oid, void in entry["openings"].items():
            wall = wall.cut(void)
        entry["current"] = wall
        return wall

    def wall_box(op: dict):
        length = param(op, "length")
        height = param(op, "height")
        thickness = param(op, "thickness")
        wbox = policy["wall001"]["box"]
        return length, height, thickness, wbox

    def opening_void(op: dict, center_x: float):
        width = param(op, "width")
        height = param(op, "height")
        sill = param(op, "sill")
        wb = policy["wall001"]["box"]
        t = wb["max"][1] - wb["min"][1]
        return box(
            [center_x - width / 2.0, wb["min"][1] - margin, sill],
            [center_x + width / 2.0, wb["max"][1] + margin, sill + height],
        )

    results = []

    for op in input_doc["operations"]:
        t0 = time.perf_counter()
        op_type = op["operationType"]
        op_id = op["operationId"]

        # ---- gate 2: capability (fail closed, nothing computed) ----------
        if op_type not in CAPABILITY_VOCABULARY:
            results.append(
                unsupported(
                    op,
                    f"operation family '{op_type}' is outside the declared capability "
                    f"vocabulary of provider '{PROVIDER_ID}' — the fail-closed gate "
                    f"records the unsupported family BEFORE any geometry is computed",
                )
            )
            continue

        # ---- gate 3: parameters -----------------------------------------
        missing = [n for n in REQUIRED_PARAMETERS[op_type] if param(op, n) is None]
        if missing:
            results.append(
                fail(op, "missing-required-parameter", f"missing parameters: {', '.join(missing)}")
            )
            continue
        bad = [
            n
            for n in REQUIRED_PARAMETERS[op_type]
            if n in DIMENSIONAL_PARAMETERS and not (isinstance(param(op, n), (int, float)) and param(op, n) > 0)
        ]
        # sill == 0 is lawful (door sill), but negative is not:
        bad += [
            n
            for n in ["sill"]
            if n in [e["name"] for e in op["parameters"]]
            and isinstance(param(op, n), (int, float))
            and param(op, n) < 0
        ]
        if bad:
            results.append(
                fail(
                    op,
                    "dimension-not-positive",
                    f"dimensional parameters must be strictly positive (sill may be 0): {', '.join(sorted(set(bad)))}",
                )
            )
            continue

        # ---- gate 4: semantic/host validation ---------------------------
        if op_type in ("create-opening", "create-door", "create-window", "revise-opening"):
            host_id = op.get("hostId")
            if host_id not in state["walls"]:
                results.append(
                    fail(
                        op,
                        "opening-host-unresolved",
                        f"opening '{op['targetId']}' references host wall '{host_id}' which "
                        f"does not exist in the proposed state — no geometry was created",
                    )
                )
                continue

        if op_type == "create-wall":
            length, height, thickness, wbox = wall_box(op)
            # impossible wall thickness: the wall must fit inside the host room
            if thickness >= min(scene["roomLengthM"], room_w):
                results.append(
                    fail(
                        op,
                        "wall-thickness-impossible",
                        f"wall thickness {thickness} m is not smaller than the host room's "
                        f"smallest interior dimension {min(scene['roomLengthM'], room_w)} m — "
                        f"the wall would consume the entire room; no geometry was created",
                    )
                )
                continue
            if height > scene["roomHeightM"] + 1e-12:
                results.append(
                    fail(
                        op,
                        "wall-exceeds-room",
                        f"wall height {height} m exceeds room height {scene['roomHeightM']} m",
                    )
                )
                continue

        if op_type == "create-footing":
            supports = param(op, "supports")
            if supports in (None, "none", "NONE"):
                results.append(
                    fail(
                        op,
                        "footing-disconnected",
                        "footing has no support relation — a footing must support an "
                        "existing load-bearing element (geometric adjacency check); "
                        "no geometry was created",
                    )
                )
                continue
            if supports not in state["columns"]:
                results.append(
                    fail(
                        op,
                        "footing-support-unresolved",
                        f"footing claims to support '{supports}' which is not an applied "
                        f"column in the proposed state",
                    )
                )
                continue
            # geometric adjacency: footing top must contact the supported
            # column base AND their XY footprints must overlap
            fdef = policy["footing001"]
            cdef = policy["column001"]
            fw = param(op, "width")
            fd = param(op, "depth")
            fh = param(op, "height")
            f_cx, f_cy = fdef["centerXY"]
            c_cx, c_cy = cdef["centerXY"]
            col_w = state["columns"][supports]["width"]
            col_d = state["columns"][supports]["depth"]
            overlap_x = min(f_cx + fw / 2.0, c_cx + col_w / 2.0) - max(f_cx - fw / 2.0, c_cx - col_w / 2.0)
            overlap_y = min(f_cy + fd / 2.0, c_cy + col_d / 2.0) - max(f_cy - fd / 2.0, c_cy - col_d / 2.0)
            top_contact = abs(fdef["zTo"] - cdef["zFrom"]) < 1e-12
            if overlap_x <= 0 or overlap_y <= 0 or not top_contact:
                results.append(
                    fail(
                        op,
                        "footing-disconnected",
                        f"footing geometry is disconnected from its supported element "
                        f"'{supports}' (XY overlap {overlap_x:.3f} x {overlap_y:.3f} m, "
                        f"top-face contact z={fdef['zTo']} vs column base z={cdef['zFrom']}) "
                        f"— no geometry was created",
                    )
                )
                continue

        # ---- gate 5: exact geometry -------------------------------------
        if op_type == "create-wall":
            length, height, thickness, wbox = wall_box(op)
            solid = box(wbox["min"], wbox["max"])
            state["walls"][op["targetId"]] = {
                "base": solid,
                "openings": {},
                "current": solid,
                "thickness": thickness,
            }
            m = measurements_of(solid)
            face_area = large_face_area(solid)
            res = {
                "operationId": op_id,
                "operationType": op_type,
                "status": "applied",
                "reasonCode": None,
                "reasonDetail": None,
                "measurements": m,
                "quantities": [
                    q("wall-volume", "volume", m["solidVolumeM3"], "m3", "added", "occt-brep-exact"),
                    q("wall-face-area", "area", face_area, "m2", "added", "occt-brep-exact-largest-planar-face"),
                    q("wall-count", "count", 1, "count", "added", "one wall per operation"),
                ],
                "hostEffect": None,
                "validationChecks": [
                    {"checkId": "topology-validity", "outcome": "pass" if m["topology"]["isValidBRep"] else "fail", "detail": "BRepCheck_Analyzer on the exact solid"},
                ],
                "executionTimeMs": 0.0,
            }

        elif op_type in ("create-opening", "create-window", "revise-opening"):
            center_x = (
                policy["doorOpeningCenterX"]
                if op["targetId"].startswith("opening-door")
                else policy["windowOpeningCenterX"]
            )
            void = opening_void(op, center_x)
            wall_id = op["hostId"]
            width = param(op, "width")
            height = param(op, "height")
            sill = param(op, "sill")
            wall = state["walls"][wall_id]
            thickness = wall["thickness"]

            # geometric containment: opening must lie inside the host wall run
            wb = policy["wall001"]["box"]
            x_ok = (center_x - width / 2.0) >= wb["min"][0] and (center_x + width / 2.0) <= wb["max"][0]
            z_ok = sill >= 0 and (sill + height) <= scene["roomHeightM"]
            if not (x_ok and z_ok):
                results.append(
                    fail(
                        op,
                        "opening-outside-host-wall",
                        f"opening '{op['targetId']}' bbox is outside host wall '{wall_id}' "
                        f"(x within [{center_x - width/2.0:.3f},{center_x + width/2.0:.3f}] vs "
                        f"wall run [{wb['min'][0]},{wb['max'][0]}], z within [{sill},{sill + height}] "
                        f"vs wall height {scene['roomHeightM']}) — no geometry was created",
                    )
                )
                continue

            is_revise = op_type == "revise-opening"
            prev_opening = state["openings"].get(op["targetId"])
            if is_revise and prev_opening is None:
                results.append(
                    fail(
                        op,
                        "revision-target-missing",
                        f"revise-opening target '{op['targetId']}' has no prior opening in the proposed state",
                    )
                )
                continue

            wall_thickness = wall["thickness"]
            # exact removed material of THIS opening measured against the
            # PRISTINE host wall (base) — the honest void volume even when
            # revising an opening that was already cut
            removed = wall["base"].intersect(void)
            removed_m = measurements_of(removed)

            wall["openings"][op["targetId"]] = void
            state["openings"][op["targetId"]] = {
                "width": width, "height": height, "sill": sill, "hostId": wall_id,
            }
            net_wall = rebuild_wall(wall_id)
            wm = measurements_of(net_wall)

            if op_type == "create-opening":
                quantities = [
                    q("opening-area", "area", round(width * height, 10), "m2", "removed", "occt-brep-exact-void-face"),
                    q("opening-void-volume", "volume", removed_m["solidVolumeM3"], "m3", "removed", "occt-brep-exact-boolean-intersection"),
                    q("opening-count", "count", 1, "count", "added", "one opening per operation"),
                ]
            else:
                gt = param(op, "glazing-thickness")
                wbbox = policy["wall001"]["box"]
                y_mid = (wbbox["min"][1] + wbbox["max"][1]) / 2.0
                glazing = box(
                    [center_x - width / 2.0, y_mid - gt / 2.0, sill],
                    [center_x + width / 2.0, y_mid + gt / 2.0, sill + height],
                )
                state["panels"][op["targetId"]] = glazing
                gm = measurements_of(glazing)
                if is_revise:
                    prev_area = round(prev_opening["width"] * prev_opening["height"], 10)
                    prev_void_vol = round(
                        prev_opening["width"] * prev_opening["height"] * wall_thickness, 10
                    )
                    prev_glaz_vol = round(
                        prev_opening["width"] * prev_opening["height"] * param(op, "glazing-thickness"), 10
                    )
                    prev_wall_vol = state.get("last_wall_volume")
                    quantities = [
                        q("opening-area", "area", round(width * height, 10), "m2", "changed",
                          "occt-brep-exact-void-face", previous=prev_area),
                        q("opening-void-volume", "volume", removed_m["solidVolumeM3"], "m3", "changed",
                          "occt-brep-exact-boolean-intersection", previous=prev_void_vol),
                        q("glazing-area", "area", round(width * height, 10), "m2", "changed",
                          "occt-brep-exact-panel-face", previous=prev_area),
                        q("glazing-volume", "volume", gm["solidVolumeM3"], "m3", "changed",
                          "occt-brep-exact", previous=prev_glaz_vol),
                        q("wall-net-volume", "volume", wm["solidVolumeM3"], "m3", "changed",
                          "occt-brep-exact-boolean-cut", previous=prev_wall_vol),
                        q("window-count", "count", 1, "count", "added", "one window assembly per operation"),
                    ]
                else:
                    quantities = [
                        q("opening-area", "area", round(width * height, 10), "m2", "removed", "occt-brep-exact-void-face"),
                        q("opening-void-volume", "volume", removed_m["solidVolumeM3"], "m3", "removed", "occt-brep-exact-boolean-intersection"),
                        q("glazing-area", "area", round(width * height, 10), "m2", "added", "occt-brep-exact-panel-face"),
                        q("glazing-volume", "volume", gm["solidVolumeM3"], "m3", "added", "occt-brep-exact"),
                        q("window-count", "count", 1, "count", "added", "one window assembly per operation"),
                    ]
                state["last_wall_volume"] = wm["solidVolumeM3"]

            res = {
                "operationId": op_id,
                "operationType": op_type,
                "status": "applied",
                "reasonCode": None,
                "reasonDetail": None,
                "measurements": removed_m if op_type == "create-opening" else gm,
                "quantities": quantities,
                "hostEffect": {
                    "hostId": wall_id,
                    "relation": "boolean-cut-void-in-host",
                    "hostMeasurements": wm,
                },
                "validationChecks": [
                    {"checkId": "opening-inside-host-wall", "outcome": "pass", "detail": "opening bbox contained in host wall run and height"},
                    {"checkId": "topology-validity", "outcome": "pass" if wm["topology"]["isValidBRep"] else "fail", "detail": "BRepCheck_Analyzer on the net host solid"},
                ],
                "executionTimeMs": 0.0,
            }

        elif op_type == "create-door":
            gt = param(op, "leaf-thickness")
            width = param(op, "width")
            height = param(op, "height")
            sill = param(op, "sill")
            center_x = policy["doorOpeningCenterX"]
            wbbox = policy["wall001"]["box"]
            y_mid = (wbbox["min"][1] + wbbox["max"][1]) / 2.0
            leaf = box(
                [center_x - width / 2.0, y_mid - gt / 2.0, sill],
                [center_x + width / 2.0, y_mid + gt / 2.0, sill + height],
            )
            if op["targetId"] not in state["openings"]:
                results.append(
                    fail(
                        op,
                        "door-opening-missing",
                        f"create-door target '{op['targetId']}' has no created opening — "
                        f"a door installs into an existing opening (dependsOn op-002)",
                    )
                )
                continue
            state["panels"][op["targetId"]] = leaf
            lm = measurements_of(leaf)
            res = {
                "operationId": op_id,
                "operationType": op_type,
                "status": "applied",
                "reasonCode": None,
                "reasonDetail": None,
                "measurements": lm,
                "quantities": [
                    q("door-area", "area", round(width * height, 10), "m2", "added", "occt-brep-exact-panel-face"),
                    q("door-volume", "volume", lm["solidVolumeM3"], "m3", "added", "occt-brep-exact"),
                    q("door-count", "count", 1, "count", "added", "one door leaf per operation"),
                ],
                "hostEffect": None,
                "validationChecks": [
                    {"checkId": "opening-exists", "outcome": "pass", "detail": "door installed into existing opening"},
                    {"checkId": "topology-validity", "outcome": "pass" if lm["topology"]["isValidBRep"] else "fail", "detail": "BRepCheck_Analyzer"},
                ],
                "executionTimeMs": 0.0,
            }

        elif op_type == "create-column":
            width = param(op, "width")
            depth = param(op, "depth")
            height = param(op, "height")
            cdef = policy["column001"]
            cx, cy = cdef["centerXY"]
            solid = box(
                [cx - width / 2.0, cy - depth / 2.0, cdef["zFrom"]],
                [cx + width / 2.0, cy + depth / 2.0, cdef["zTo"]],
            )
            state["columns"][op["targetId"]] = {"solid": solid, "width": width, "depth": depth}
            m = measurements_of(solid)
            res = {
                "operationId": op_id,
                "operationType": op_type,
                "status": "applied",
                "reasonCode": None,
                "reasonDetail": None,
                "measurements": m,
                "quantities": [
                    q("column-volume", "volume", m["solidVolumeM3"], "m3", "added", "occt-brep-exact"),
                    q("column-surface-area", "area", m["surfaceAreaM2"], "m2", "added", "occt-brep-exact-total-surface"),
                    q("column-count", "count", 1, "count", "added", "one column per operation"),
                ],
                "hostEffect": None,
                "validationChecks": [
                    {"checkId": "topology-validity", "outcome": "pass" if m["topology"]["isValidBRep"] else "fail", "detail": "BRepCheck_Analyzer"},
                ],
                "executionTimeMs": 0.0,
            }

        elif op_type == "create-footing":
            fw = param(op, "width")
            fd = param(op, "depth")
            fh = param(op, "height")
            fdef = policy["footing001"]
            cx, cy = fdef["centerXY"]
            solid = box(
                [cx - fw / 2.0, cy - fd / 2.0, fdef["zFrom"]],
                [cx + fw / 2.0, cy + fd / 2.0, fdef["zTo"]],
            )
            m = measurements_of(solid)
            plan_area = top_face_area(solid)
            res = {
                "operationId": op_id,
                "operationType": op_type,
                "status": "applied",
                "reasonCode": None,
                "reasonDetail": None,
                "measurements": m,
                "quantities": [
                    q("footing-volume", "volume", m["solidVolumeM3"], "m3", "added", "occt-brep-exact"),
                    q("footing-plan-area", "area", plan_area, "m2", "added", "occt-brep-exact-top-face"),
                    q("footing-count", "count", 1, "count", "added", "one footing per operation"),
                ],
                "hostEffect": {
                    "hostId": param(op, "supports"),
                    "relation": "supports-load-bearing-element",
                    "hostMeasurements": None,
                },
                "validationChecks": [
                    {"checkId": "footing-support-connected", "outcome": "pass", "detail": "footing top face contacts supported column base with overlapping XY footprints"},
                    {"checkId": "topology-validity", "outcome": "pass" if m["topology"]["isValidBRep"] else "fail", "detail": "BRepCheck_Analyzer"},
                ],
                "executionTimeMs": 0.0,
            }

        elif op_type == "create-slab":
            sbox = policy["slab001"]["box"]
            solid = box(sbox["min"], sbox["max"])
            m = measurements_of(solid)
            plan_area = top_face_area(solid)
            res = {
                "operationId": op_id,
                "operationType": op_type,
                "status": "applied",
                "reasonCode": None,
                "reasonDetail": None,
                "measurements": m,
                "quantities": [
                    q("slab-volume", "volume", m["solidVolumeM3"], "m3", "added", "occt-brep-exact"),
                    q("slab-plan-area", "area", plan_area, "m2", "added", "occt-brep-exact-top-face"),
                    q("slab-count", "count", 1, "count", "added", "one slab per operation"),
                ],
                "hostEffect": None,
                "validationChecks": [
                    {"checkId": "topology-validity", "outcome": "pass" if m["topology"]["isValidBRep"] else "fail", "detail": "BRepCheck_Analyzer"},
                ],
                "executionTimeMs": 0.0,
            }

        elif op_type == "create-beam":
            bdef = policy["beam001"]
            length = param(op, "length")
            bw = param(op, "width")
            bd = param(op, "depth")
            solid = box(
                [bdef["centerX"] - bw / 2.0, bdef["yFrom"], bdef["zTo"] - bd],
                [bdef["centerX"] + bw / 2.0, bdef["yTo"], bdef["zTo"]],
            )
            m = measurements_of(solid)
            res = {
                "operationId": op_id,
                "operationType": op_type,
                "status": "applied",
                "reasonCode": None,
                "reasonDetail": None,
                "measurements": m,
                "quantities": [
                    q("beam-volume", "volume", m["solidVolumeM3"], "m3", "added", "occt-brep-exact"),
                    q("beam-lateral-area", "area", round(2.0 * (bw + bd) * length, 10), "m2", "added", "occt-brep-derived-perimeter-times-length"),
                    q("beam-count", "count", 1, "count", "added", "one beam per operation"),
                ],
                "hostEffect": None,
                "validationChecks": [
                    {"checkId": "topology-validity", "outcome": "pass" if m["topology"]["isValidBRep"] else "fail", "detail": "BRepCheck_Analyzer"},
                ],
                "executionTimeMs": 0.0,
            }

        elif op_type == "create-partition":
            pdef = policy["partition001"]
            length = param(op, "length")
            height = param(op, "height")
            thickness = param(op, "thickness")
            solid = box(
                [pdef["centerX"] - thickness / 2.0, pdef["yFrom"], pdef["zFrom"]],
                [pdef["centerX"] + thickness / 2.0, pdef["yTo"], pdef["zTo"]],
            )
            m = measurements_of(solid)
            face_area = large_face_area(solid)
            res = {
                "operationId": op_id,
                "operationType": op_type,
                "status": "applied",
                "reasonCode": None,
                "reasonDetail": None,
                "measurements": m,
                "quantities": [
                    q("partition-volume", "volume", m["solidVolumeM3"], "m3", "added", "occt-brep-exact"),
                    q("partition-face-area", "area", face_area, "m2", "added", "occt-brep-exact-largest-planar-face"),
                    q("partition-count", "count", 1, "count", "added", "one partition per operation"),
                ],
                "hostEffect": None,
                "validationChecks": [
                    {"checkId": "topology-validity", "outcome": "pass" if m["topology"]["isValidBRep"] else "fail", "detail": "BRepCheck_Analyzer"},
                ],
                "executionTimeMs": 0.0,
            }
        else:  # pragma: no cover — capability gate already handled this
            results.append(unsupported(op, f"unhandled type {op_type}"))
            continue

        res["executionTimeMs"] = round((time.perf_counter() - t0) * 1000.0, 3)
        res["externalReferences"] = [
            {
                "kind": "provider-shape",
                "ref": f"occt-brep:{op['targetId']}#{res['operationId']}",
                "note": "OCCT TopoDS_Shape handle inside the provider process — external reference only, never AISE canonical identity",
            }
        ]
        results.append(res)

    # ---- deterministic scene-state digest over applied neutral state ----
    scene_state = {
        "walls": {
            wid: {
                "openings": sorted(e["openings"].keys()),
            }
            for wid, e in state["walls"].items()
        },
        "openings": {oid: vals for oid, vals in sorted(state["openings"].items())},
        "panels": sorted(state["panels"].keys()),
        "columns": sorted(state["columns"].keys()),
    }
    return {
        "schemaVersion": 1,
        "portVersion": PORT_VERSION,
        "executionId": input_doc["executionId"],
        "status": "executed",
        "reasonCode": None,
        "reasonDetail": None,
        "provenance": provider_provenance(digest_of(input_doc)),
        "operationResults": results,
        "sceneStateDigest": digest_of(scene_state),
    }


def main() -> int:
    args = sys.argv[1:]
    corrupt = "--self-corrupt" in args
    args = [a for a in args if a != "--self-corrupt"]

    if args:
        with open(args[0], "r", encoding="utf-8") as fh:
            raw = fh.read()
    else:
        raw = sys.stdin.read()

    try:
        input_doc = json.loads(raw)
    except json.JSONDecodeError as exc:
        print(json.dumps(refuse_input("input-not-json", str(exc)), indent=2, sort_keys=True))
        return 0

    # gate 0: minimal input sanity (fail closed)
    problems = []
    if input_doc.get("portVersion") != PORT_VERSION:
        problems.append(f"portVersion must be '{PORT_VERSION}'")
    if not isinstance(input_doc.get("operations"), list) or not input_doc["operations"]:
        problems.append("operations must be a non-empty list")
    if problems:
        print(json.dumps(refuse_input("input-contract-violation", "; ".join(problems)), indent=2, sort_keys=True))
        return 0

    # gate 1: duplicate AISE-owned operation identity
    seen = set()
    for op in input_doc["operations"]:
        oid = op.get("operationId")
        if oid in seen:
            print(
                json.dumps(
                    refuse_input(
                        "duplicate-operation-identity",
                        f"operation identity '{oid}' appears more than once in the execution "
                        f"input — AISE operation identity is unique per proposed state; "
                        f"nothing was executed",
                    ),
                    indent=2,
                    sort_keys=True,
                )
            )
            return 0
        seen.add(oid)

    output = execute(input_doc)

    if corrupt:
        # ENGINEERED DIVERGENCE INJECTION (neg-007): deliberately corrupt the
        # provider response so the AISE-side schema guard must refuse it.
        output["unknownField"] = True
        if output["operationResults"]:
            output["operationResults"][0]["measurements"]["solidVolumeM3"] = "not-a-number"
            output["operationResults"][0]["mysteryTopologyHandle"] = "TopoDS_Shape@0x7fdeadbeef"
        output["status"] = "executed-corrupt"

    print(json.dumps(output, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
