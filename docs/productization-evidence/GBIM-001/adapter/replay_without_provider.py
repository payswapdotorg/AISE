#!/usr/bin/env python3
"""GBIM-001 — historical-replay proof (acceptance: "Historical AISE solution
records remain readable without the spike adapter").

Demonstrates, with exact recorded commands:
  A. the historical record (results/historical-record.json) is read and
     validated with PURE stdlib — no OCCT/CadQuery import anywhere in the
     replay path;
  B. the provider is PHYSICALLY DISABLED (adapter script renamed away) and
     the record is STILL fully interpretable: every canonical operation,
     quantity and validation verdict remains readable; invoking the provider
     fails with a plain 'provider unavailable' — a lawful EXTERNAL-reference
     unavailability, not a canonical-record failure;
  C. the externalReferences block can be deleted outright without affecting
     the canonical core;
  D. canonical quantities cross-check EXACTLY against the AISE reference
     lane (the unmodified production engine) for the four mapped operations.
"""

from __future__ import annotations

import json
import pathlib
import shutil
import subprocess
import sys

HERE = pathlib.Path(__file__).resolve().parent
RESULTS = HERE.parent / "results"
ADAPTER = HERE / "occt_adapter.py"
PYTHON = pathlib.Path("/home/z/my-project/gbim001-venv/bin/python")


def read_record() -> dict:
    return json.loads((RESULTS / "historical-record.json").read_text(encoding="utf-8"))


def validate_canonical_core(record: dict) -> list[str]:
    """Structural interpretation of the canonical core — provider-free."""
    problems = []
    ops = record.get("canonicalOperations")
    if not isinstance(ops, list) or len(ops) != 10:
        problems.append(f"expected 10 canonical operations, found {len(ops) if isinstance(ops, list) else 'none'}")
    ids = [o.get("operationId") for o in ops]
    if ids != [f"op-{i:03d}" for i in range(1, 11)]:
        problems.append(f"canonical operation ids are not op-001..op-010: {ids}")
    for o in ops:
        for p in o.get("parameters", []):
            if not isinstance(p.get("name"), str):
                problems.append(f"{o['operationId']}: parameter without name")
            if isinstance(p.get("value"), (int, float)) and not p.get("unit"):
                problems.append(f"{o['operationId']}.{p['name']}: numeric parameter without unit")
    dims = {"length", "area", "volume", "mass", "count", "duration"}
    directions = {"added", "removed", "changed"}
    for entry in record.get("canonicalQuantities", []):
        for q in entry.get("quantities", []):
            if q.get("dimension") not in dims:
                problems.append(f"{entry['operationId']}: quantity dimension '{q.get('dimension')}' outside AISE vocabulary")
            if q.get("direction") not in directions:
                problems.append(f"{entry['operationId']}: quantity direction outside AISE vocabulary")
            if not q.get("unit"):
                problems.append(f"{entry['operationId']}: quantity without explicit unit")
    if record.get("validationVerdict") not in ("pass", "fail"):
        problems.append("validationVerdict missing")
    return problems


def provider_available() -> bool:
    return ADAPTER.exists()


def try_invoke_provider() -> tuple[bool, str]:
    """Attempt a provider execution with a minimal valid input."""
    payload = json.dumps(
        {
            "schemaVersion": 1,
            "portVersion": "gbim001-geometry-port/1",
            "executionId": "replay-probe",
            "fixtureId": "GBIM-000-building-001",
            "authority": "AISE",
            "units": "SI",
            "scene": {"roomId": "room-001", "roomLengthM": 8.0, "roomWidthM": 6.0, "roomHeightM": 3.0},
            "operations": [],
        }
    )
    proc = subprocess.run(
        [str(PYTHON), str(ADAPTER)], input=payload, capture_output=True, text=True, timeout=120
    )
    return proc.returncode == 0, (proc.stderr or proc.stdout)[-300:]


def main() -> int:
    outcomes = []

    # ---- A: pure-stdlib read + validate ---------------------------------
    record = read_record()
    problems_a = validate_canonical_core(record)
    occt_imported = any(
        mod in sys.modules for mod in ("OCP", "cadquery")
    )
    outcomes.append(
        {
            "step": "A",
            "claim": "historical record is readable and validatable with pure stdlib (no provider imports)",
            "command": "gbim001-venv/bin/python adapter/replay_without_provider.py",
            "canonicalCoreReadable": not problems_a,
            "providerModulesImported": occt_imported,
            "problems": problems_a,
            "ok": not problems_a and not occt_imported,
        }
    )

    # ---- D: cross-check canonical quantities vs AISE reference lane ------
    ref = json.loads((RESULTS / "aise-reference.json").read_text(encoding="utf-8"))
    by_label = {}
    for r in ref["results"]:
        if r["productionOperationType"]:
            for q in r["quantities"]:
                by_label[(r["operationId"], q["label"])] = q["value"]
    occt = {}
    for r in record["canonicalQuantities"]:
        for q in r["quantities"]:
            occt[(r["operationId"], q["label"])] = q["value"]
    comparisons = []
    for (op_id, label), aise_value in sorted(by_label.items()):
        spike_label = {
            "wall-volume": "wall-volume",
            "wall-face-area": "wall-face-area",
            "block-count": None,  # parametric quantity — no BRep counterpart (declared divergence)
            "opening-area": "opening-area",
            "opening-count": "opening-count",
            "footing-volume": "footing-volume",
            "footing-plan-area": "footing-plan-area",
            "slab-volume": "slab-volume",
            "slab-plan-area": "slab-plan-area",
        }.get(label)
        if spike_label is None:
            comparisons.append(
                {"operationId": op_id, "aiseLabel": label, "occtLabel": None,
                 "aiseValue": aise_value, "occtValue": None, "relation": "no-occt-counterpart (parametric block-module count)"}
            )
            continue
        occt_value = occt.get((op_id, spike_label))
        comparisons.append(
            {
                "operationId": op_id,
                "aiseLabel": label,
                "occtLabel": spike_label,
                "aiseValue": aise_value,
                "occtValue": occt_value,
                "relation": "exact-equality" if occt_value == aise_value else "divergent",
            }
        )
    all_exact = all(c["relation"] in ("exact-equality", "no-occt-counterpart (parametric block-module count)") for c in comparisons)
    outcomes.append(
        {
            "step": "D",
            "claim": "canonical quantities cross-check against the unmodified AISE engine lane",
            "comparisons": comparisons,
            "allSharedQuantitiesExact": all_exact,
            "ok": all_exact,
        }
    )

    # ---- B: physically disable the provider, re-read the record ----------
    disabled_path = ADAPTER.with_suffix(".py.disabled")
    shutil.move(str(ADAPTER), str(disabled_path))
    try:
        available = provider_available()
        invoke_ok, invoke_detail = try_invoke_provider()  # must fail (file gone)
        record_b = read_record()
        problems_b = validate_canonical_core(record_b)
        outcomes.append(
            {
                "step": "B",
                "claim": "with the provider physically removed, the historical record remains fully interpretable",
                "command": f"mv adapter/occt_adapter.py adapter/occt_adapter.py.disabled (provider removed)",
                "providerPresent": available,
                "providerInvocationFailed": not invoke_ok,
                "providerInvocationDetail": f"subprocess exit != 0: {invoke_detail[:120]}",
                "canonicalCoreStillReadable": not problems_b,
                "problems": problems_b,
                "ok": (not available) and (not invoke_ok) and (not problems_b),
            }
        )
    finally:
        shutil.move(str(disabled_path), str(ADAPTER))

    # ---- C: delete the externalReferences block outright ------------------
    record_c = read_record()
    external = record_c.pop("externalReferences")
    problems_c = validate_canonical_core(record_c)
    outcomes.append(
        {
            "step": "C",
            "claim": "the externalReferences block is deletable without affecting the canonical core",
            "externalBlockRemoved": True,
            "canonicalCoreStillValid": not problems_c,
            "problems": problems_c,
            "ok": not problems_c,
        }
    )

    (RESULTS / "replay-without-provider.json").write_text(
        json.dumps(outcomes, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )

    print("=== GBIM-001 historical replay without provider ===")
    all_ok = True
    for o in outcomes:
        all_ok &= o["ok"]
        print(f"  step {o['step']}: {'OK' if o['ok'] else 'FAILED'} — {o['claim']}")
    if not all_ok:
        for o in outcomes:
            if not o["ok"]:
                print(f"    step {o['step']} problems: {o.get('problems') or o}")
    return 0 if all_ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
