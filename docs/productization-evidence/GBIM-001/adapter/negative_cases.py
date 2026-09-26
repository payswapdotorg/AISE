#!/usr/bin/env python3
"""GBIM-001 — the seven mandatory negative/discrimination cases (charter §5).

Every case is engineered as a MUTATION of the canonical execution input (the
fixture's negativeCases declare the change), driven through the REAL
subprocess port, and must FAIL CLOSED: status invalid/unsupported/refused,
NO measurements, NO quantities, NO canonical state mutation.

Cases (fixture docs/productization-evidence/GBIM-000/canonical-fixture.json):
  neg-001 impossible-wall-thickness   (wallThickness 8.1 m in a 6 m room)
  neg-002 opening-outside-host-wall   (openingHost -> 'wall-missing')
  neg-003 negative-dimension          (width -> -0.5)
  neg-004 disconnected-footing        (supportRelation -> 'none')
  neg-005 duplicate-operation-identity (operationId -> 'op-001' duplicate)
  neg-006 unsupported-operation       (type -> 'make-portal')
  neg-007 malformed-provider-response (unknownField injection + guard refusal)

Plus two EXTRA discrimination variants (charter §5 wants the harness to
catch engineered divergences, not just echo expected failures):
  neg-002b opening geometrically outside the host wall run (bbox beyond wall)
  neg-004b footing geometrically disconnected (support resolved but no contact)
"""

from __future__ import annotations

import copy
import json
import pathlib
import subprocess
import sys

HERE = pathlib.Path(__file__).resolve().parent
RESULTS = HERE.parent / "results"
ADAPTER = HERE / "occt_adapter.py"
PYTHON = pathlib.Path("/home/z/my-project/gbim001-venv/bin/python")

sys.path.insert(0, str(HERE))
from canonical_fixture import build_canonical_input  # noqa: E402
from schema_guard import guard  # noqa: E402


def run_provider(input_doc: dict, extra_args: list[str] | None = None) -> dict:
    payload = json.dumps(input_doc, sort_keys=True)
    proc = subprocess.run(
        [str(PYTHON), str(ADAPTER)] + (extra_args or []),
        input=payload, capture_output=True, text=True, timeout=300,
    )
    if proc.returncode != 0:
        raise RuntimeError(f"provider crashed: {proc.stderr[-2000:]}")
    return json.loads(proc.stdout)


def op_of(doc: dict, operation_id: str) -> dict:
    return next(o for o in doc["operations"] if o["operationId"] == operation_id)


def set_param(op: dict, name: str, value) -> None:
    for entry in op["parameters"]:
        if entry["name"] == name:
            entry["value"] = value
            return
    op["parameters"].append({"name": name, "value": value, "unit": "m"})


def fail_closed_check(case_id: str, kind: str, response: dict, expected_fragment: str, target_op: str | None) -> dict:
    """Fail-closed rule: the MUTATED operation must be invalid/unsupported
    with NO measurements/quantities; a whole-input refusal refuses everything.
    Legitimate setup operations (e.g. create-wall) may still apply."""
    results = response.get("operationResults", [])
    refused = response.get("status") == "refused"
    if refused:
        target_invalid = True
        no_geometry = not results  # a refusal carries no executed operations
        target_status = "refused"
    else:
        target = next((r for r in results if r.get("operationId") == target_op), None) if target_op else None
        if target is None:
            target_invalid = False
            no_geometry = False
            target_status = "missing-from-response"
        else:
            target_status = target["status"]
            target_invalid = target["status"] in ("invalid", "unsupported")
            no_geometry = target.get("measurements") is None and target.get("quantities") is None
    blob = json.dumps(response, sort_keys=True)
    reason_hit = expected_fragment in blob
    ok = target_invalid and no_geometry and reason_hit
    return {
        "caseId": case_id,
        "kind": kind,
        "responseStatus": response.get("status"),
        "targetOperation": target_op,
        "targetStatus": target_status,
        "reasonCode": response.get("reasonCode")
        or (
            next((r.get("reasonCode") for r in results if r.get("operationId") == target_op), None)
            if target_op and not refused
            else None
        ),
        "failClosed": ok,
        "noGeometryEmitted": no_geometry,
        "expectedReasonFragmentFound": reason_hit,
        "expectedReasonFragment": expected_fragment,
    }


def main() -> int:
    RESULTS.mkdir(parents=True, exist_ok=True)
    outcomes = []

    # ---- neg-001: impossible wall thickness ------------------------------
    doc = build_canonical_input("neg-001")
    set_param(op_of(doc, "op-001"), "thickness", 8.1)
    # downstream ops would fail on the missing wall — keep only op-001 to
    # isolate the discrimination (the wall op itself must refuse)
    doc["operations"] = [op_of(doc, "op-001")]
    resp = run_provider(doc)
    outcomes.append(fail_closed_check("neg-001", "impossible-wall-thickness", resp, "wall-thickness-impossible", "op-001"))

    # ---- neg-002: opening outside host wall (unresolved host) -------------
    doc = build_canonical_input("neg-002")
    op = op_of(doc, "op-002")
    op["hostId"] = "wall-missing"
    doc["operations"] = [op_of(doc, "op-001"), op]
    resp = run_provider(doc)
    outcomes.append(fail_closed_check("neg-002", "opening-outside-host-wall", resp, "opening-host-unresolved", "op-002"))

    # ---- neg-002b: opening geometrically outside the host wall run --------
    doc = build_canonical_input("neg-002b")
    doc["scene"]["placementPolicy"]["doorOpeningCenterX"] = 12.0  # beyond the 8 m wall run
    doc["operations"] = [op_of(doc, "op-001"), op_of(doc, "op-002")]
    resp = run_provider(doc)
    outcomes.append(fail_closed_check("neg-002b", "opening-outside-host-wall-geometric", resp, "opening-outside-host-wall", "op-002"))

    # ---- neg-003: negative dimension --------------------------------------
    doc = build_canonical_input("neg-003")
    set_param(op_of(doc, "op-002"), "width", -0.5)
    doc["operations"] = [op_of(doc, "op-001"), op_of(doc, "op-002")]
    resp = run_provider(doc)
    outcomes.append(fail_closed_check("neg-003", "negative-dimension", resp, "dimension-not-positive", "op-002"))

    # ---- neg-004: disconnected footing (support relation removed) ---------
    doc = build_canonical_input("neg-004")
    set_param(op_of(doc, "op-006"), "supports", "none")
    doc["operations"] = [op_of(doc, "op-005"), op_of(doc, "op-006")]
    resp = run_provider(doc)
    outcomes.append(fail_closed_check("neg-004", "disconnected-footing", resp, "footing-disconnected", "op-006"))

    # ---- neg-004b: footing geometrically disconnected (no face contact) ---
    doc = build_canonical_input("neg-004b")
    # keep the declared support (column-001) but move the footing away:
    # support RESOLVES, geometry does not touch
    doc["scene"]["placementPolicy"]["footing001"]["centerXY"] = [1.0, 1.0]
    doc["operations"] = [op_of(doc, "op-005"), op_of(doc, "op-006")]
    resp = run_provider(doc)
    outcomes.append(fail_closed_check("neg-004b", "disconnected-footing-geometric", resp, "footing-disconnected", "op-006"))

    # ---- neg-005: duplicate operation identity ----------------------------
    doc = build_canonical_input("neg-005")
    dup = copy.deepcopy(op_of(doc, "op-002"))
    dup["operationId"] = "op-001"  # collides with the wall op
    doc["operations"] = [op_of(doc, "op-001"), dup]
    resp = run_provider(doc)
    outcomes.append(fail_closed_check("neg-005", "duplicate-operation-identity", resp, "duplicate-operation-identity", None))

    # ---- neg-006: unsupported operation ------------------------------------
    doc = build_canonical_input("neg-006")
    op = op_of(doc, "op-001")
    op["operationType"] = "make-portal"
    doc["operations"] = [op]
    resp = run_provider(doc)
    outcomes.append(fail_closed_check("neg-006", "unsupported-operation", resp, "unsupported-operation", "op-001"))

    # ---- neg-007: malformed provider response ------------------------------
    # The provider is asked to CORRUPT its own response (engineered divergence
    # injection, --self-corrupt); the AISE-side schema guard must refuse it.
    doc = build_canonical_input("neg-007")
    resp = run_provider(doc, extra_args=["--self-corrupt"])
    ok7, refusals7 = guard(resp)
    outcomes.append(
        {
            "caseId": "neg-007",
            "kind": "malformed-provider-response",
            "responseStatus": resp.get("status"),
            "guardRefused": not ok7,
            "refusals": refusals7,
            "failClosed": (not ok7)
            and any("unknown" in r or "must be a finite number" in r for r in refusals7),
        }
    )

    (RESULTS / "negative-cases.json").write_text(
        json.dumps(outcomes, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )

    print("=== GBIM-001 negative/discrimination cases ===")
    all_ok = True
    for o in outcomes:
        status = "FAIL-CLOSED OK" if o["failClosed"] else "!!! DID NOT FAIL CLOSED"
        all_ok &= o["failClosed"]
        print(f"  {o['caseId']} ({o['kind']}): {status}")
        if o["caseId"] == "neg-007":
            for r in o["refusals"][:4]:
                print(f"      guard refusal: {r}")
        else:
            print(f"      reason: {o['reasonCode']}")
    return 0 if all_ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
