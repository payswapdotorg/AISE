#!/usr/bin/env python3
"""GBIM-001 — canonical input builder (AISE-owned, provider-neutral).

Lifts the pinned GBIM-000 canonical fixture
(docs/productization-evidence/GBIM-000/canonical-fixture.json) into the
spike geometry-port execution input together with the DECLARED deterministic
placement policy (gbim001-placement-policy/1).

Nothing in this module knows about OCCT/CadQuery/FreeCAD. It emits plain
JSON in SI units with AISE-owned operation identities (op-001..op-010),
mirroring the neutral vocabulary discipline of
backend/api/src/geometry-eval/model.ts (NeutralOperation/NeutralParameter).
"""

from __future__ import annotations

import hashlib
import json
import pathlib

REPO_ROOT = pathlib.Path(__file__).resolve().parents[4]
FIXTURE_PATH = REPO_ROOT / "docs" / "productization-evidence" / "GBIM-000" / "canonical-fixture.json"

PORT_VERSION = "gbim001-geometry-port/1"
PLACEMENT_POLICY_ID = "gbim001-placement-policy/1"

# Declared panel dimensions (the GBIM-000 fixture specifies opening geometry
# but not panel thicknesses; these are DECLARED assumptions of the spike,
# versioned with the placement policy — never silent):
DOOR_LEAF_THICKNESS_M = 0.05
WINDOW_GLAZING_THICKNESS_M = 0.04
COLUMN_HEIGHT_POLICY = "full room height (3.0 m)"
BEAM_LENGTH_POLICY = "spans room width (6.0 m) at x=2.0 center, top at z=3.0"
PARTITION_POLICY = "spans room width (6.0 m) at x=6.0 center, full height"


def canonical_json_bytes(value) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")


def digest_of(value) -> str:
    return "sha256:" + hashlib.sha256(canonical_json_bytes(value)).hexdigest()


def placement_policy() -> dict:
    """The declared deterministic placement policy (fixture under-specifies
    placement; every position below is FIXED by this versioned policy)."""
    return {
        "policyId": PLACEMENT_POLICY_ID,
        "roomId": "room-001",
        "roomBox": {"min": [0.0, 0.0, 0.0], "max": [8.0, 6.0, 3.0]},
        "wall001": {
            "runs": "along +x at south face",
            "box": {"min": [0.0, 0.0, 0.0], "max": [8.0, 0.2, 3.0]},
        },
        "doorOpeningCenterX": 2.0,
        "windowOpeningCenterX": 5.5,
        "doorLeafThicknessM": DOOR_LEAF_THICKNESS_M,
        "windowGlazingThicknessM": WINDOW_GLAZING_THICKNESS_M,
        "column001": {"centerXY": [4.0, 3.0], "zFrom": 0.0, "zTo": 3.0, "heightPolicy": COLUMN_HEIGHT_POLICY},
        "footing001": {"centerXY": [4.0, 3.0], "zFrom": -0.3, "zTo": 0.0, "supports": "column-001"},
        "slab001": {"box": {"min": [0.0, 0.0, 3.0], "max": [8.0, 6.0, 3.2]}},
        "beam001": {"centerX": 2.0, "yFrom": 0.0, "yTo": 6.0, "zFrom": 2.6, "zTo": 3.0, "lengthPolicy": BEAM_LENGTH_POLICY},
        "partition001": {"centerX": 6.0, "yFrom": 0.0, "yTo": 6.0, "zFrom": 0.0, "zTo": 3.0, "thicknessPolicy": PARTITION_POLICY},
        "openingCutMarginM": 0.05,
    }


def build_canonical_input(execution_id: str) -> dict:
    fixture = json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))
    geo = fixture["geometry"]
    policy = placement_policy()

    def p(name: str, value, unit: str) -> dict:
        return {"name": name, "value": value, "unit": unit}

    room = geo["room"]
    wall = geo["wall"]
    door = geo["doorOpening"]
    window = geo["windowOpening"]
    column = geo["column"]
    slab = geo["slab"]
    footing = geo["footing"]
    beam = geo["beam"]
    partition = geo["partition"]

    operations = [
        {
            "operationId": "op-001",
            "operationType": "create-wall",
            "targetId": wall["id"],
            "hostId": room["id"],
            "parameters": [
                p("length", room["length_m"], "m"),
                p("height", room["height_m"], "m"),
                p("thickness", wall["thickness_m"], "m"),
            ],
            "dependsOn": [],
        },
        {
            "operationId": "op-002",
            "operationType": "create-opening",
            "targetId": door["id"],
            "hostId": wall["id"],
            "parameters": [
                p("width", door["width_m"], "m"),
                p("height", door["height_m"], "m"),
                p("sill", door["sill_m"], "m"),
            ],
            "dependsOn": ["op-001"],
        },
        {
            "operationId": "op-003",
            "operationType": "create-door",
            "targetId": door["id"],
            "hostId": wall["id"],
            "parameters": [
                p("width", door["width_m"], "m"),
                p("height", door["height_m"], "m"),
                p("sill", door["sill_m"], "m"),
                p("leaf-thickness", DOOR_LEAF_THICKNESS_M, "m"),
            ],
            "dependsOn": ["op-002"],
        },
        {
            "operationId": "op-004",
            "operationType": "create-window",
            "targetId": window["id"],
            "hostId": wall["id"],
            "parameters": [
                p("width", window["width_m"], "m"),
                p("height", window["height_m"], "m"),
                p("sill", window["sill_m"], "m"),
                p("glazing-thickness", WINDOW_GLAZING_THICKNESS_M, "m"),
            ],
            "dependsOn": ["op-001"],
        },
        {
            "operationId": "op-005",
            "operationType": "create-column",
            "targetId": column["id"],
            "hostId": room["id"],
            "parameters": [
                p("width", column["width_m"], "m"),
                p("depth", column["depth_m"], "m"),
                p("height", room["height_m"], "m"),
            ],
            "dependsOn": [],
        },
        {
            "operationId": "op-006",
            "operationType": "create-footing",
            "targetId": footing["id"],
            "hostId": room["id"],
            "parameters": [
                p("width", footing["width_m"], "m"),
                p("depth", footing["depth_m"], "m"),
                p("height", footing["height_m"], "m"),
                p("supports", "column-001", "n/a"),
            ],
            "dependsOn": ["op-005"],
        },
        {
            "operationId": "op-007",
            "operationType": "create-slab",
            "targetId": slab["id"],
            "hostId": room["id"],
            "parameters": [
                p("length", room["length_m"], "m"),
                p("width", room["width_m"], "m"),
                p("thickness", slab["thickness_m"], "m"),
            ],
            "dependsOn": [],
        },
        {
            "operationId": "op-008",
            "operationType": "create-beam",
            "targetId": beam["id"],
            "hostId": room["id"],
            "parameters": [
                p("length", 6.0, "m"),
                p("width", beam["width_m"], "m"),
                p("depth", beam["depth_m"], "m"),
            ],
            "dependsOn": ["op-005"],
        },
        {
            "operationId": "op-009",
            "operationType": "create-partition",
            "targetId": partition["id"],
            "hostId": room["id"],
            "parameters": [
                p("length", 6.0, "m"),
                p("height", room["height_m"], "m"),
                p("thickness", partition["thickness_m"], "m"),
            ],
            "dependsOn": [],
        },
        {
            "operationId": "op-010",
            "operationType": "revise-opening",
            "targetId": window["id"],
            "hostId": wall["id"],
            "parameters": [
                p("width", 1.5, "m"),
                p("height", 1.2, "m"),
                p("sill", window["sill_m"], "m"),
                p("glazing-thickness", WINDOW_GLAZING_THICKNESS_M, "m"),
            ],
            "dependsOn": ["op-004"],
        },
    ]

    return {
        "schemaVersion": 1,
        "portVersion": PORT_VERSION,
        "executionId": execution_id,
        "fixtureId": fixture["fixtureId"],
        "authority": "AISE",
        "units": "SI",
        "scene": {
            "roomId": room["id"],
            "roomLengthM": room["length_m"],
            "roomWidthM": room["width_m"],
            "roomHeightM": room["height_m"],
            "elements": {
                "wall": wall,
                "doorOpening": door,
                "windowOpening": window,
                "column": column,
                "slab": slab,
                "footing": footing,
                "beam": beam,
                "partition": partition,
                "roof": geo["roof"],
            },
            "placementPolicy": policy,
        },
        "operations": operations,
    }


if __name__ == "__main__":
    import sys

    exec_id = sys.argv[1] if len(sys.argv) > 1 else "gbim001-run-001"
    doc = build_canonical_input(exec_id)
    sys.stdout.write(json.dumps(doc, indent=2, sort_keys=True) + "\n")
