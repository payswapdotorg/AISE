#!/usr/bin/env python3
"""GBIM-001 — spike harness: the AISE side of the geometry port.

Drives the disposable OCCT provider as a SUBPROCESS (the port boundary is
stdio JSON — no kernel type can cross), validates every response through
the schema guard, runs the fixture TWICE for reproducibility (deterministic
digests exclude non-deterministic timings), and emits the AISE-shaped
historical solution record used by the replay-without-provider proof.
"""

from __future__ import annotations

import json
import pathlib
import subprocess
import sys

HERE = pathlib.Path(__file__).resolve().parent
RESULTS = HERE.parent / "results"
ADAPTER = HERE / "occt_adapter.py"
PYTHON = pathlib.Path("/home/z/my-project/gbim001-venv/bin/python")

sys.path.insert(0, str(HERE))
from canonical_fixture import build_canonical_input, digest_of  # noqa: E402
from schema_guard import guard  # noqa: E402


def run_provider(input_doc: dict, extra_args: list[str] | None = None) -> dict:
    """Invoke the provider as an out-of-process subprocess. The ONLY thing
    that crosses is JSON."""
    payload = json.dumps(input_doc, sort_keys=True)
    proc = subprocess.run(
        [str(PYTHON), str(ADAPTER)] + (extra_args or []),
        input=payload,
        capture_output=True,
        text=True,
        timeout=300,
    )
    if proc.returncode != 0:
        raise RuntimeError(f"provider crashed: {proc.stderr[-2000:]}")
    if proc.stderr.strip():
        # kernel-side noise (e.g. font warnings) is recorded, never ignored
        print(f"[provider stderr] {proc.stderr.strip()[:300]}", file=sys.stderr)
    return json.loads(proc.stdout)


def deterministic_projection(output: dict) -> dict:
    """Strip non-deterministic fields (timings) — everything else must be
    bit-identical across runs for PROVEN reproducibility."""
    out = json.loads(json.dumps(output))
    out.pop("executionId", None)  # run-scoped label, not semantics
    for res in out.get("operationResults", []):
        res.pop("executionTimeMs", None)
    return out


def main() -> int:
    RESULTS.mkdir(parents=True, exist_ok=True)

    input_doc = build_canonical_input("gbim001-run-001")
    input_path = RESULTS / "canonical-input.json"
    input_path.write_text(json.dumps(input_doc, indent=2, sort_keys=True) + "\n", encoding="utf-8")

    # ---- run 1 ----------------------------------------------------------
    out1 = run_provider(input_doc)
    ok1, refusals1 = guard(out1)
    (RESULTS / "occt-run-1.json").write_text(json.dumps(out1, indent=2, sort_keys=True) + "\n", encoding="utf-8")

    # ---- run 2 (reproducibility: BYTE-IDENTICAL input, fresh process) ----
    out2 = run_provider(input_doc)
    ok2, refusals2 = guard(out2)
    (RESULTS / "occt-run-2.json").write_text(json.dumps(out2, indent=2, sort_keys=True) + "\n", encoding="utf-8")

    d1 = digest_of(deterministic_projection(out1))
    d2 = digest_of(deterministic_projection(out2))

    repro = {
        "claim": "same canonical input (fixture + placement policy) → identical deterministic provider projection",
        "run1DeterministicDigest": d1,
        "run2DeterministicDigest": d2,
        "reproducible": d1 == d2,
        "inputDigest": digest_of(input_doc),
        "note": "digests exclude executionId and executionTimeMs (performance observations, not semantics)",
        "schemaGuardRun1": {"ok": ok1, "refusals": refusals1},
        "schemaGuardRun2": {"ok": ok2, "refusals": refusals2},
    }
    (RESULTS / "reproducibility.json").write_text(json.dumps(repro, indent=2, sort_keys=True) + "\n", encoding="utf-8")

    # ---- summary --------------------------------------------------------
    print("=== GBIM-001 fixture run ===")
    print(f"schema guard run1: {'PASS' if ok1 else 'REFUSED: ' + str(refusals1)}")
    print(f"schema guard run2: {'PASS' if ok2 else 'REFUSED: ' + str(refusals2)}")
    print(f"reproducible: {d1 == d2}  ({d1})")
    for res in out1["operationResults"]:
        if res["status"] == "applied":
            m = res["measurements"]
            qline = "; ".join(
                f"{x['label']}={x['value']} {x['unit']} [{x['direction']}]"
                + (f" (was {x['previousValue']})" if "previousValue" in x else "")
                for x in res["quantities"]
            )
            print(
                f"  {res['operationId']} {res['operationType']}: APPLIED "
                f"vol={m['solidVolumeM3']} m3 area={m['surfaceAreaM2']} m2 "
                f"bbox={m['boundingBoxM']['min']}..{m['boundingBoxM']['max']} "
                f"valid={m['topology']['isValidBRep']} closed={m['topology']['isClosedManifold']} "
                f"| {qline} | {res['executionTimeMs']} ms"
            )
            if res.get("hostEffect") and res["hostEffect"].get("hostMeasurements"):
                hm = res["hostEffect"]["hostMeasurements"]
                print(
                    f"      hostEffect {res['hostEffect']['hostId']}: net vol={hm['solidVolumeM3']} m3 "
                    f"area={hm['surfaceAreaM2']} m2"
                )
        else:
            print(f"  {res['operationId']} {res['operationType']}: {res['status'].upper()} ({res['reasonCode']})")

    # ---- AISE-shaped historical record (provider-free canonical core) ----
    record = {
        "recordId": "gbim001-historical-record-001",
        "recordSchema": "gbim001-spike-record/1",
        "solutionId": "sol-gbim001-spike",
        "authority": "AISE",
        "fixtureId": input_doc["fixtureId"],
        "placementPolicyId": input_doc["scene"]["placementPolicy"]["policyId"],
        "canonicalOperations": [
            {
                "operationId": op["operationId"],
                "operationType": op["operationType"],
                "targetId": op["targetId"],
                "hostId": op.get("hostId"),
                "parameters": op["parameters"],
                "dependsOn": op["dependsOn"],
            }
            for op in input_doc["operations"]
        ],
        "canonicalQuantities": [
            {
                "operationId": res["operationId"],
                "quantities": res["quantities"],
            }
            for res in out1["operationResults"]
            if res["status"] == "applied"
        ],
        "validationVerdict": "pass" if all(r["status"] == "applied" for r in out1["operationResults"]) else "fail",
        "externalReferences": {
            "note": "provider provenance and measurements are EXTERNAL evidence, never canonical identity; "
                    "this block may be removed without affecting interpretability of the canonical core",
            "providerProvenance": out1["provenance"],
            "providerMeasurements": [
                {"operationId": r["operationId"], "measurements": r["measurements"]}
                for r in out1["operationResults"]
                if r["status"] == "applied"
            ],
            "providerShapeRefs": [
                {"operationId": r["operationId"], "refs": r["externalReferences"]}
                for r in out1["operationResults"]
                if r["status"] == "applied"
            ],
            "sceneStateDigest": out1["sceneStateDigest"],
        },
    }
    (RESULTS / "historical-record.json").write_text(
        json.dumps(record, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )

    print(f"\nhistorical record written: {RESULTS / 'historical-record.json'}")
    return 0 if (ok1 and ok2 and d1 == d2) else 1


if __name__ == "__main__":
    raise SystemExit(main())
