"""
GBIM-002 spike — AISE-side canonical fixture, identity and quantity mirrors.

This module is SPIKE EVIDENCE CODE, not production code. It mirrors the
DISCIPLINE of the AISE solution contract (packages/solution-contract):

  * identity is content: sha-256 over the canonical JSON of a curated
    semantic projection (provenance, timestamps, presentation and
    contractVersion deliberately EXCLUDED — see identity.ts);
  * typed parameters with explicit units; unknown units or dimension
    mismatches are REFUSED, never guessed (see units.ts);
  * deterministic Phase 1 reference quantity formulas (see
    quantity-models.ts): wall-volume = l*h*t, opening-area = w*h,
    footing-volume = l*w*d, slab-volume = l*w*t, block-count =
    ceil(h/0.2) x ceil(l/0.4);
  * fail-closed refusal taxonomy mirroring apply.ts: invalid /
    unsupported / needs-input with machine-readable reasons.

The spike's IDs are SPIKE-INTERNAL AISE references derived with the same
discipline — they do NOT claim to be the contract's byte-exact derivations
(the canonical serializer lives in @aise/shared-contracts and stays the
authority). They exist so the IFC projection can carry AISE operation/state
IDs as EXTERNAL mapping references (charter §2), never as vendor GUIDs.
"""

from __future__ import annotations

import hashlib
import json
import math
import sys
from typing import Any, Optional

SPIKE_SOLUTION_ID = "solution-gbim002-001"
SPIKE_BASELINE_REALITY_VERSION_ID = "rgv-gbim002-base-0001"
SPIKE_VERTICAL = "building"
SPIKE_MATERIALIZED_AT = "2026-09-25T00:00:00.000Z"  # deterministic, caller-injected

# The spike's ten canonical fixture operations (charter §3) with the
# application order chosen so every dependency edge points at an already
# applied operation (completion-before semantics, mirroring apply.ts §4).
OPERATION_CATALOGUE = [
    "create-wall",
    "create-opening",
    "create-door",
    "create-window",
    "create-footing",
    "create-slab",
    "create-column",
    "create-beam",
    "create-partition",
    "revise-opening",
]

# AISE Phase 1 quantity-formula coverage per spike operation type. The
# mapping statuses feed the semantic-mapping evidence: operations with a
# canonical analogue use the reference formulas; the rest are explicit
# canonical gaps (IFC-side capability, AISE catalogue gap).
CANONICAL_ANALOGUE = {
    "create-wall": "block-wall-placement",
    "create-opening": "opening-creation",
    "create-door": None,          # no Phase 1 canonical door operation
    "create-window": None,        # no Phase 1 canonical window operation
    "create-footing": "foundation-placement",
    "create-slab": "slab-placement",
    "create-column": None,        # no Phase 1 canonical column operation
    "create-beam": None,         # no Phase 1 canonical beam operation
    "create-partition": "block-wall-placement",
    "revise-opening": "opening-creation",
}

# The AISE unit vocabulary (mirror of units.ts UNIT_VOCABULARY, linear/area
# subset used by the fixture). Anything else is refused.
UNIT_VOCABULARY = {
    "m": ("linear", 1.0),
    "dm": ("linear", 0.1),
    "cm": ("linear", 0.01),
    "mm": ("linear", 0.001),
    "km": ("linear", 1000.0),
    "m2": ("area", 1.0),
    "cm2": ("area", 0.0001),
    "mm2": ("area", 0.000001),
    "m3": ("volume", 1.0),
    "cm3": ("volume", 0.000001),
    "mm3": ("volume", 0.000000001),
    "l": ("volume", 0.001),
}

# Spike-side engineering sanity gates (documented, deterministic). The AISE
# engine's Phase 1 wall limit (height <= 3 m) is mirrored; the wall-thickness
# bound is a spike gate declared here because the fixture room constrains it.
WALL_HEIGHT_LIMIT_M = 3.0
WALL_THICKNESS_MAX_M = 1.0
DEFAULT_BLOCK_MODULE_LENGTH_M = 0.4   # reference data, mirrors quantity-models.ts
DEFAULT_BLOCK_MODULE_HEIGHT_M = 0.2


def canonical_json(value: Any) -> str:
    """Canonical JSON projection (sorted keys, compact, stable numbers)."""
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def sha256_hex(value: Any) -> str:
    return hashlib.sha256(canonical_json(value).encode("utf-8")).hexdigest()


def derive_operation_id(
    solution_id: str, version_number: int, operation_index: int, intent: dict
) -> str:
    """Spike mirror of deriveEngineeringOperationId (identity.ts).

    Hashes the SEMANTIC projection only: version context + operation type +
    vertical + typed parameters + spatial target + dependencies. Provenance,
    presentation, effects and timestamps are excluded by design.
    """
    projection = {
        "solutionId": solution_id,
        "versionNumber": 1,
        "operationIndex": operation_index,
        "operationType": intent["operationType"],
        "vertical": intent.get("vertical", SPIKE_VERTICAL),
        "parameters": [
            {"name": p["name"], "value": p["value"], **({"unit": p["unit"]} if p.get("unit") else {})}
            for p in intent["parameters"]
        ],
        "target": {
            "selectorKind": intent["target"]["selectorKind"],
            "nodeRefs": list(intent["target"]["nodeRefs"]),
            "geometryRefs": [
                {"kind": r["kind"], "ref": r["ref"]}
                for r in intent["target"].get("geometryRefs", [])
            ],
            "units": dict(intent["target"].get("units", {})),
        },
        "dependsOn": [
            {"dependencyKind": d["dependencyKind"], "operationRef": d["operationRef"]}
            for d in intent.get("dependsOn", [])
        ],
    }
    return sha256_hex(projection)


def resolve_parameter(param: dict, slot: str) -> tuple[Optional[float], Optional[dict]]:
    """Mirror of units.ts resolution: known unit, right dimension, positive.

    Returns (canonical_value_in_m, None) or (None, typed_failure).
    """
    name = param["name"]
    if not isinstance(param.get("value"), (int, float)) or isinstance(param.get("value"), bool):
        return None, {
            "code": "parameter_not_numeric",
            "detail": f"parameter '{name}' must be numeric; found {param.get('value')!r}",
        }
    unit = param.get("unit")
    if unit is None:
        return None, {
            "code": "missing_unit",
            "detail": f"parameter '{name}' carries no unit — the engine never guesses",
        }
    entry = UNIT_VOCABULARY.get(unit)
    if entry is None:
        return None, {
            "code": "unknown_unit",
            "detail": f"parameter '{name}' carries unit '{unit}', not in the engine unit vocabulary — refuse rather than guess",
        }
    dimension, to_canonical = entry
    if dimension != slot:
        return None, {
            "code": "unit_dimension_mismatch",
            "detail": (
                f"parameter '{name}' carries unit '{unit}' of dimension '{dimension}', "
                f"but the slot expects '{slot}' — dimensionally inconsistent input is refused"
            ),
        }
    value = float(param["value"])
    if value <= 0:
        return None, {
            "code": "parameter_not_positive",
            "detail": f"parameter '{name}' must be positive; found {value} {unit}",
        }
    return value * to_canonical, None


def _num(parameters: list, name: str, slot: str = "linear"):
    for p in parameters:
        if p["name"] == name:
            return resolve_parameter(p, slot)
    return None, {
        "code": "missing_required_parameter",
        "detail": f"required parameter '{name}' is absent — the engine asks, never invents",
    }


def aise_reference_quantities(operation_type: str, parameters: list) -> tuple[Optional[list], Optional[dict]]:
    """The AISE Phase 1 reference formulas for the operation's canonical
    analogue. Returns (quantities, None) or (None, typed_failure), or
    (None, {"code": "no_canonical_quantity_model", ...}) for the operations
    whose AISE catalogue analogue does not exist (an explicit canonical gap).
    """
    analogue = CANONICAL_ANALOGUE.get(operation_type)

    def traced(params_used: list) -> list:
        return [
            {"name": p["name"], "value": p["value"], "unit": p.get("unit")}
            for p in params_used
        ]

    if analogue in ("block-wall-placement",):
        length, fail = _num(parameters, "length")
        if fail is None:
            height, fail = _num(parameters, "height")
        if fail is None:
            thickness, fail = _num(parameters, "thickness")
        if fail is not None:
            return None, fail
        block_count = (
            math.ceil(round(height / DEFAULT_BLOCK_MODULE_HEIGHT_M, 9))
            * math.ceil(round(length / DEFAULT_BLOCK_MODULE_LENGTH_M, 9))
        )
        return [
            {
                "label": "wall-volume",
                "dimension": "volume",
                "value": round(length * height * thickness, 12),
                "unit": "m3",
                "formula": "wall-volume = length x height x thickness",
                "direction": "added",
                "parameterTrace": traced(parameters),
                "calculationRef": "aise-phase1/block-wall-placement/v1 (spike mirror)",
            },
            {
                "label": "wall-face-area",
                "dimension": "area",
                "value": round(length * height, 12),
                "unit": "m2",
                "formula": "wall-face-area = length x height",
                "direction": "added",
                "parameterTrace": traced(parameters),
                "calculationRef": "aise-phase1/block-wall-placement/v1 (spike mirror)",
            },
            {
                "label": "block-count",
                "dimension": "count",
                "value": block_count,
                "unit": "count",
                "formula": "block-count = ceil(height/0.2) x ceil(length/0.4)",
                "direction": "added",
                "parameterTrace": traced(parameters),
                "calculationRef": "aise-phase1/block-wall-placement/v1 (spike mirror)",
            },
        ], None

    if analogue == "opening-creation":
        width, fail = _num(parameters, "width")
        if fail is None:
            height, fail = _num(parameters, "height")
        if fail is not None:
            return None, fail
        return [
            {
                "label": "opening-area",
                "dimension": "area",
                "value": round(width * height, 12),
                "unit": "m2",
                "formula": "opening-area = width x height",
                "direction": "removed",
                "parameterTrace": traced(parameters),
                "calculationRef": "aise-phase1/opening-creation/v1 (spike mirror)",
            },
            {
                "label": "opening-count",
                "dimension": "count",
                "value": 1,
                "unit": "count",
                "formula": "opening-count = 1 per operation",
                "direction": "added",
                "parameterTrace": traced(parameters),
                "calculationRef": "aise-phase1/opening-creation/v1 (spike mirror)",
            },
        ], None

    if analogue == "foundation-placement":
        length, fail = _num(parameters, "length")
        if fail is None:
            width, fail = _num(parameters, "width")
        if fail is None:
            depth, fail = _num(parameters, "depth")
        if fail is not None:
            return None, fail
        return [
            {
                "label": "footing-volume",
                "dimension": "volume",
                "value": round(length * width * depth, 12),
                "unit": "m3",
                "formula": "footing-volume = length x width x depth",
                "direction": "added",
                "parameterTrace": traced(parameters),
                "calculationRef": "aise-phase1/foundation-placement/v1 (spike mirror)",
            },
            {
                "label": "footing-plan-area",
                "dimension": "area",
                "value": round(length * width, 12),
                "unit": "m2",
                "formula": "footing-plan-area = length x width",
                "direction": "added",
                "parameterTrace": traced(parameters),
                "calculationRef": "aise-phase1/foundation-placement/v1 (spike mirror)",
            },
        ], None

    if analogue == "slab-placement":
        length, fail = _num(parameters, "length")
        if fail is None:
            width, fail = _num(parameters, "width")
        if fail is None:
            thickness, fail = _num(parameters, "thickness")
        if fail is not None:
            return None, fail
        return [
            {
                "label": "slab-volume",
                "dimension": "volume",
                "value": round(length * width * thickness, 12),
                "unit": "m3",
                "formula": "slab-volume = length x width x thickness",
                "direction": "added",
                "parameterTrace": traced(parameters),
                "calculationRef": "aise-phase1/slab-placement/v1 (spike mirror)",
            },
            {
                "label": "slab-plan-area",
                "dimension": "area",
                "value": round(length * width, 12),
                "unit": "m2",
                "formula": "slab-plan-area = length x width",
                "direction": "added",
                "parameterTrace": traced(parameters),
                "calculationRef": "aise-phase1/slab-placement/v1 (spike mirror)",
            },
        ], None

    return None, {
        "code": "no_canonical_quantity_model",
        "detail": (
            f"operation type '{operation_type}' has no Phase 1 canonical quantity "
            f"model in the AISE reference catalogue (gap recorded explicitly; "
            f"IFC-side geometry facts are comparison-only, never AISE quantities)"
        ),
    }


# --------------------------------------------------------------------------
# The canonical fixture (charter §3): 8 x 6 x 3 m room, 200 mm host wall,
# 900x2100 door opening, 1200x1200 window opening, 300x300 column,
# 200 mm slab, 400x400x300 footing, 250x400 beam, 150 mm partition,
# one roof/floor plane (the slab envelope), revise-opening widens the door
# opening 900 -> 1000 mm in version 2.
# --------------------------------------------------------------------------

HOST_WALL_GEOMETRY = {
    # The host wall the exporter places deterministically: IfcWall running
    # +X 0..8 m, thickness +Y 0..0.2 m, height +Z 0..3 m (the south edge
    # of the 8 x 6 x 3 m room).
    "placement": [0.0, 0.0, 0.0],
    "extents": {"x": [0.0, 8.0], "y": [0.0, 0.2], "z": [0.0, 3.0]},
}


def build_fixture() -> dict:
    """The pinned canonical fixture in AISE-owned provider-neutral
    semantics: the ten charter operations, applied in dependency order,
    with revise-opening widening the door opening 900 -> 1000 mm as the
    final operation (an INTRA-version operation sequence — the fixture's
    final state carries the 1000 mm opening; the intermediate 900 mm
    state remains a historical AISE record)."""

    def param(name, value, unit):
        if unit is None:
            return {"name": name, "value": value}
        return {"name": name, "value": value, "unit": unit}

    def target(selector_kind, node_refs, geometry_refs):
        return {
            "selectorKind": selector_kind,
            "nodeRefs": node_refs,
            "geometryRefs": geometry_refs,
            "units": {"linear": "m"},
        }

    ops: list[dict] = []

    ops.append({
        "operationType": "create-wall",
        "summary": "200 mm host wall, south edge of the 8x6x3 room",
        "parameters": [
            param("length", 8000, "mm"),
            param("height", 3000, "mm"),
            param("thickness", 200, "mm"),
            param("material", "concrete-block", None),
        ],
        "target": target(
            "geometry-plane",
            ["node-room-shell", "node-wall-south"],
            [{"kind": "plane", "ref": "geo-wall-line-south"}],
        ),
        "dependsOn": [],
        "ifc": {
            "class": "IfcWall",
            "predefinedType": "SOLIDWALL",
            "name": "Wall-South",
            "geometry": {
                "representation": "wall-api",
                "length": 8.0, "height": 3.0, "thickness": 0.2,
                "placement": [0.0, 0.0, 0.0],
            },
        },
    })

    ops.append({
        "operationType": "create-opening",
        "summary": "900x2100 door opening in the host wall (x 1.0..1.9 m)",
        "parameters": [
            param("width", 900, "mm"),
            param("height", 2100, "mm"),
            param("offset-x", 1.0, "m"),
        ],
        "target": target(
            "geometry-plane",
            ["node-wall-south"],
            [{"kind": "plane", "ref": "geo-wall-line-south"}, {"kind": "void", "ref": "geo-opening-door-001"}],
        ),
        "dependsOn": [{"dependencyKind": "host", "operationRef": "PENDING"}],
        "ifc": {
            "class": "IfcOpeningElement",
            "name": "Opening-Door",
            "voids": "Wall-South",
            "geometry": {
                "representation": "box",
                "profile": [0.9, 0.22],   # width x through-thickness (+1 cm each side)
                "depth": 2.1,             # height
                "placement": [1.45, 0.1, 0.0],  # box profiles are centred
            },
        },
    })

    ops.append({
        "operationType": "create-door",
        "summary": "900x2100 door filling the door opening",
        "parameters": [
            param("width", 900, "mm"),
            param("height", 2100, "mm"),
            param("material", "timber-panel", None),
        ],
        "target": target(
            "geometry-plane",
            ["node-wall-south"],
            [{"kind": "void", "ref": "geo-opening-door-001"}],
        ),
        "dependsOn": [{"dependencyKind": "fills", "operationRef": "PENDING"}],
        "ifc": {
            "class": "IfcDoor",
            "name": "Door-001",
            "fills": "Opening-Door",
            "overallHeight": 2.1,
            "overallWidth": 0.9,
            "geometry": {
                "representation": "box",
                "profile": [0.9, 0.05],
                "depth": 2.1,
                "placement": [1.45, 0.1, 0.0],
            },
        },
    })

    ops.append({
        "operationType": "create-window",
        "summary": "1200x1200 window opening (sill 1.0 m) + window filling it",
        "parameters": [
            param("width", 1200, "mm"),
            param("height", 1200, "mm"),
            param("sill", 1.0, "m"),
            param("material", "glazing", None),
        ],
        "target": target(
            "geometry-plane",
            ["node-wall-south"],
            [{"kind": "void", "ref": "geo-opening-window-001"}],
        ),
        "dependsOn": [{"dependencyKind": "host", "operationRef": "PENDING"}],
        "ifc": {
            "class": "IfcWindow",
            "name": "Window-001",
            "opens": "Wall-South",   # the fenestration op creates its own opening
            "overallHeight": 1.2,
            "overallWidth": 1.2,
            "geometry": {
                "representation": "box",
                "profile": [1.2, 0.05],
                "depth": 1.2,
                "placement": [5.6, 0.1, 1.0],
            },
            "openingGeometry": {
                "representation": "box",
                "profile": [1.2, 0.22],
                "depth": 1.2,
                "placement": [5.6, 0.1, 1.0],
            },
        },
    })

    ops.append({
        "operationType": "create-footing",
        "summary": "400x400x300 footing below the column position",
        "parameters": [
            param("length", 400, "mm"),
            param("width", 400, "mm"),
            param("depth", 300, "mm"),
            param("material", "reinforced-concrete", None),
        ],
        "target": target(
            "geometry-plane",
            ["node-foundation"],
            [{"kind": "plane", "ref": "geo-footprint-column-001"}],
        ),
        "dependsOn": [],
        "ifc": {
            "class": "IfcFooting",
            "name": "Footing-001",
            "geometry": {
                "representation": "box",
                "profile": [0.4, 0.4],
                "depth": 0.3,
                "placement": [7.7, 5.7, -0.5],
            },
        },
    })

    ops.append({
        "operationType": "create-slab",
        "summary": "8x6 m floor slab, 200 mm thick (top at z=0)",
        "parameters": [
            param("length", 8000, "mm"),
            param("width", 6000, "mm"),
            param("thickness", 200, "mm"),
            param("material", "reinforced-concrete", None),
        ],
        "target": target(
            "geometry-plane",
            ["node-room-shell"],
            [{"kind": "plane", "ref": "geo-floor-envelope"}],
        ),
        "dependsOn": [],
        "ifc": {
            "class": "IfcSlab",
            "predefinedType": "FLOOR",
            "name": "Slab-Floor",
            "geometry": {
                "representation": "box",
                "profile": [8.0, 6.0],
                "depth": 0.2,
                "placement": [4.0, 3.0, -0.2],
            },
        },
    })

    ops.append({
        "operationType": "create-column",
        "summary": "300x300 column, full storey height, on the footing axis",
        "parameters": [
            param("width", 300, "mm"),
            param("height", 3000, "mm"),
            param("material", "reinforced-concrete", None),
        ],
        "target": target(
            "geometry-plane",
            ["node-structure"],
            [{"kind": "plane", "ref": "geo-footprint-column-001"}],
        ),
        "dependsOn": [
            {"dependencyKind": "supported-by", "operationRef": "PENDING"},  # create-footing
            {"dependencyKind": "bears-on", "operationRef": "PENDING"},     # create-slab
        ],
        "ifc": {
            "class": "IfcColumn",
            "name": "Column-001",
            "geometry": {
                "representation": "box",
                "profile": [0.3, 0.3],
                "depth": 3.0,
                "placement": [7.7, 5.7, 0.0],
            },
        },
    })

    ops.append({
        "operationType": "create-beam",
        "summary": "250x400 beam spanning 6 m at x=4.0, top at z=3.0",
        "parameters": [
            param("length", 6000, "mm"),
            param("width", 250, "mm"),
            param("depth", 400, "mm"),
            param("material", "reinforced-concrete", None),
        ],
        "target": target(
            "geometry-plane",
            ["node-structure"],
            [{"kind": "plane", "ref": "geo-beam-axis-001"}],
        ),
        "dependsOn": [{"dependencyKind": "bears-on", "operationRef": "PENDING"}],  # create-wall
        "ifc": {
            "class": "IfcBeam",
            "name": "Beam-001",
            "geometry": {
                "representation": "box",
                "profile": [0.25, 6.0],
                "depth": 0.4,
                "placement": [4.125, 3.0, 2.6],
            },
        },
    })

    ops.append({
        "operationType": "create-partition",
        "summary": "150 mm partition wall, 3 m long, inside the room",
        "parameters": [
            param("length", 3000, "mm"),
            param("height", 3000, "mm"),
            param("thickness", 150, "mm"),
            param("material", "concrete-block", None),
        ],
        "target": target(
            "geometry-plane",
            ["node-room-interior"],
            [{"kind": "plane", "ref": "geo-partition-line-001"}],
        ),
        "dependsOn": [{"dependencyKind": "bears-on", "operationRef": "PENDING"}],  # create-slab
        "ifc": {
            "class": "IfcWall",
            "predefinedType": "PARTITIONINGWALL",
            "name": "Wall-Partition",
            "geometry": {
                "representation": "box",
                "profile": [0.15, 3.0],
                "depth": 3.0,
                "placement": [2.075, 2.5, 0.0],
            },
        },
    })

    revised_width_mm = 1000  # revise-opening: the door opening widens 900 -> 1000 mm
    ops.append({
        "operationType": "revise-opening",
        "summary": (
            "revise the door opening width 900 -> 1000 mm (an intra-version "
            "operation in the fixture; the IFC projection carries the final "
            "state only — the 900 mm intermediate is a historical AISE record)"
        ),
        "parameters": [
            param("width", revised_width_mm, "mm"),
            param("height", 2100, "mm"),
            param("offset-x", 1.0, "m"),
        ],
        "target": target(
            "geometry-plane",
            ["node-wall-south"],
            [{"kind": "void", "ref": "geo-opening-door-001"}],
        ),
        "dependsOn": [{"dependencyKind": "revises", "operationRef": "PENDING"}],  # create-opening
        "ifc": {
            "class": "IfcOpeningElement",
            "name": "Opening-Door",
            "voids": "Wall-South",
            "revises": "Opening-Door",
            "geometry": {
                "representation": "box",
                "profile": [revised_width_mm / 1000.0, 0.22],
                "depth": 2.1,
                "placement": [1.0 + revised_width_mm / 2000.0, 0.1, 0.0],
            },
        },
    })

    return {
        "fixtureKind": "aise-gbim002-canonical-fixture",
        "fixtureVersion": "1.0.0",
        "solutionId": SPIKE_SOLUTION_ID,
        "versionNumber": 1,
        "baselineRealityVersionId": SPIKE_BASELINE_REALITY_VERSION_ID,
        "roomEnvelope": {"length": 8.0, "width": 6.0, "height": 3.0},
        "materializedAt": SPIKE_MATERIALIZED_AT,
        "operations": ops,
    }


def compile_fixture(fixture: dict) -> tuple[Optional[dict], Optional[list]]:
    """Compiles the fixture the way apply.ts compiles intents: derives
    operation IDs (dependency-corrected), refuses on any violation, and
    computes the state chain + AISE reference quantities.

    Returns (compiled, None) or (None, failures) — fail closed.
    """
    failures: list = []
    solution_id = fixture["solutionId"]
    version_number = fixture["versionNumber"]

    seen_ids: set = set()
    applied_ids: list = []
    compiled_ops: list = []
    parent_digest: Optional[str] = None
    states: list = []

    def state_digest(parent: Optional[str], index: int, operation_id: str, effects: list) -> str:
        return sha256_hex({
            "parentContentDigest": parent,
            "stateIndex": index,
            "operationId": operation_id,
            "operationEffects": effects,
        })

    baseline_digest = state_digest(None, 0, "", [])
    baseline_state_id = sha256_hex({
        "solutionId": solution_id,
        "versionNumber": 1,
        "stateIndex": 0,
        "baselineRealityVersionId": fixture["baselineRealityVersionId"],
        "appliedOperationIds": [],
        "contentDigest": baseline_digest,
    })
    states.append({
        "stateIndex": 0,
        "stateId": baseline_state_id,
        "contentDigest": baseline_digest,
        "appliedOperationIds": [],
        "epistemicStatus": "PROPOSED",
    })
    parent_digest = baseline_digest

    for index, op in enumerate(fixture["operations"], start=1):
        # 0. catalogue gate (unsupported operation types are refused)
        if op["operationType"] not in OPERATION_CATALOGUE:
            failures.append({
                "operationIndex": index,
                "code": "capability_unsupported",
                "detail": (
                    f"operation type '{op['operationType']}' is not in the spike's "
                    f"canonical fixture catalogue — refused, never best-efforted"
                ),
            })
            continue

        # 1. resolve PENDING dependency refs against already-applied operations
        deps = []
        dep_failed = False
        for dep in op.get("dependsOn", []):
            if dep["operationRef"] != "PENDING":
                deps.append({**dep})
                continue
            kind = dep["dependencyKind"]
            resolved = None
            if kind == "host":
                resolved = next((o for o in compiled_ops if o["operationType"] == "create-wall"), None)
            elif kind == "fills":
                resolved = next((o for o in compiled_ops if o["operationType"] == "create-opening"), None)
            elif kind == "revises":
                resolved = next((o for o in compiled_ops if o["operationType"] == "create-opening"), None)
            elif kind == "supported-by":
                resolved = next((o for o in compiled_ops if o["operationType"] == "create-footing"), None)
            elif kind == "bears-on":
                if op["operationType"] == "create-beam":
                    resolved = next((o for o in compiled_ops if o["operationType"] == "create-wall"), None)
                else:
                    resolved = next((o for o in compiled_ops if o["operationType"] == "create-slab"), None)
            if resolved is None:
                failures.append({
                    "operationIndex": index,
                    "code": "dependency_not_applied",
                    "detail": (
                        f"dependency '{kind}' of operation '{op['operationType']}' has no "
                        f"applied target — operations apply in dependency order, never ahead of it"
                    ),
                })
                dep_failed = True
                continue
            deps.append({**dep, "operationRef": resolved["operationId"]})
        if dep_failed:
            continue

        # 2. derive identity (the mirrored contract discipline)
        op_with_deps = {**op, "dependsOn": deps}
        operation_id = derive_operation_id(solution_id, version_number, index, op_with_deps)

        # 3. duplicate identity gate (mirrors duplicate_operation_in_state)
        if operation_id in seen_ids:
            failures.append({
                "operationIndex": index,
                "code": "duplicate_operation_in_state",
                "detail": (
                    f"operation '{operation_id}' is already applied in this version "
                    f"(index {index} collides with the applied sequence)"
                ),
            })
            continue
        seen_ids.add(operation_id)

        # 4. engineering validation gates (spike-side, fail closed)
        gate_failures = validate_operation(op)
        if gate_failures:
            failures.extend(gate_failures)
            continue

        # 5. AISE reference quantities (or the explicit canonical gap)
        quantities, q_fail = aise_reference_quantities(op["operationType"], op["parameters"])
        if q_fail is not None and q_fail["code"] != "no_canonical_quantity_model":
            failures.append({"operationIndex": index, **q_fail})
            continue

        # 6. state chain append (mirrors states.ts hash-chain materialization)
        effects = [
            {
                "effectKind": "state-transition",
                "affectedNodeRefs": list(op["target"]["nodeRefs"]),
                "geometryRefs": [
                    {"kind": r["kind"], "ref": r["ref"]}
                    for r in op["target"].get("geometryRefs", [])
                ],
            }
        ] + [
            {
                "effectKind": "quantity-impact",
                "affectedNodeRefs": list(op["target"]["nodeRefs"]),
                "quantity": {
                    "dimension": q["dimension"],
                    "value": q["value"],
                    "unit": q["unit"],
                    "calculationRef": q["calculationRef"],
                },
                "direction": q["direction"],
            }
            for q in (quantities or [])
        ]
        content_digest = state_digest(parent_digest, index, operation_id, effects)
        applied_ids = applied_ids + [operation_id]
        state_id = sha256_hex({
            "solutionId": solution_id,
            "versionNumber": 1,
            "stateIndex": index,
            "baselineRealityVersionId": fixture["baselineRealityVersionId"],
            "appliedOperationIds": applied_ids,
            "contentDigest": content_digest,
        })
        states.append({
            "stateIndex": index,
            "stateId": state_id,
            "contentDigest": content_digest,
            "appliedOperationIds": list(applied_ids),
            "epistemicStatus": "PROPOSED",
        })
        parent_digest = content_digest

        compiled_ops.append({
            "operationIndex": index,
            "operationId": operation_id,
            **op_with_deps,
            "canonicalAnalogue": CANONICAL_ANALOGUE.get(op["operationType"]),
            "aiseQuantities": quantities,
            "canonicalQuantityStatus": "mapped" if quantities is not None else "no-canonical-model",
            "resultingStateId": state_id,
        })

    if failures:
        return None, failures

    return {
        **{k: v for k, v in fixture.items() if k != "operations"},
        "operations": compiled_ops,
        "states": states,
        "finalStateId": states[-1]["stateId"] if states else None,
    }, None


def validate_operation(op: dict) -> list:
    """Spike-side engineering gates (fail closed, machine-readable).

    These gates mirror the AISE discipline that provider-side (IFC)
    validation is NEVER assumed: the IFC schema accepts engineering
    nonsense; AISE semantics must refuse it before any projection.
    """
    failures = []
    op_type = op["operationType"]
    params = op["parameters"]

    def numeric(name, slot="linear"):
        for p in params:
            if p["name"] == name:
                return resolve_parameter(p, slot)
        return None, None

    if op_type in ("create-wall", "create-partition"):
        length, fail = numeric("length")
        if fail is None:
            height, fail = numeric("height")
        if fail is None:
            thickness, fail = numeric("thickness")
        if fail is not None:
            failures.append(fail)
            return failures
        if height > WALL_HEIGHT_LIMIT_M + 1e-12:
            failures.append({
                "code": "quantitative_limit",
                "detail": f"wall height {height} m exceeds the Phase 1 limit of {WALL_HEIGHT_LIMIT_M} m per operation",
            })
        if thickness > WALL_THICKNESS_MAX_M:
            failures.append({
                "code": "impossible_wall_thickness",
                "detail": (
                    f"wall thickness {thickness} m exceeds the spike's declared sanity "
                    f"bound of {WALL_THICKNESS_MAX_M} m for this fixture — impossible for the room envelope"
                ),
            })

    if op_type in ("create-opening", "create-door", "create-window", "revise-opening"):
        for name in ("width", "height"):
            _, fail = numeric(name)
            if fail is not None:
                failures.append(fail)
        if op_type in ("create-opening", "revise-opening"):
            # opening containment inside the host wall (the AISE gate the raw
            # IFC schema will NOT enforce — engineered divergence evidence)
            width, _ = numeric("width")
            height, _ = numeric("height")
            offset, _ = numeric("offset-x")
            if None not in (width, height, offset):
                wall = HOST_WALL_GEOMETRY["extents"]
                x0, x1 = offset, offset + width
                z1 = height
                tol = 1e-9
                if x0 < wall["x"][0] - tol or x1 > wall["x"][1] + tol or z1 > wall["z"][1] + tol:
                    failures.append({
                        "code": "opening_outside_host",
                        "detail": (
                            f"opening spans x [{x0}, {x1}] m, z [0, {z1}] m but the host wall "
                            f"spans x {wall['x']} m, z {wall['z']} m — the opening must lie within its host"
                        ),
                    })

    if op_type in ("create-footing", "create-slab", "create-beam", "create-column"):
        for name in [p["name"] for p in params if p.get("unit")]:
            _, fail = numeric(name)
            if fail is not None:
                failures.append(fail)

    return failures


def fixture_input_digest(fixture: dict) -> str:
    """Configuration/input digest for provenance (charter §4)."""
    return sha256_hex({
        "fixtureKind": fixture["fixtureKind"],
        "fixtureVersion": fixture["fixtureVersion"],
        "solutionId": fixture["solutionId"],
        "versionNumber": fixture["versionNumber"],
        "operations": [
            {"operationType": o["operationType"], "parameters": o["parameters"]}
            for o in fixture["operations"]
        ],
    })


if __name__ == "__main__":
    # Self-check: compile the canonical fixture and print the identity chain.
    raw = build_fixture()
    compiled, failures = compile_fixture(raw)
    if compiled is None:
        print(f"fixture REFUSED — {json.dumps(failures, indent=1)}")
        sys.exit(1)
    print(f"{len(compiled['operations'])} ops, final state {compiled['finalStateId'][:16]}..., "
          f"input digest {fixture_input_digest(raw)[:16]}...")
    for op in compiled["operations"]:
        q = op["aiseQuantities"]
        print(f"  [{op['operationIndex']:>2}] {op['operationType']:<16} "
              f"id={op['operationId'][:12]}... "
              f"quantities={len(q) if q else 'GAP'}")
