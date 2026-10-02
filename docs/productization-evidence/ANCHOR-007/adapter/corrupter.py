#!/usr/bin/env python3
"""
ANCHOR-007 — the response corrupter (the guard-drill provider wrapper).

The negative ledger's corrupted-response drills run a REAL spike adapter to
completion, then inject a designated defect into its response and emit the
corrupted bytes as if they were the provider's own stdout. The AISE-side
supervised runner must REFUSE the corrupted bytes with its typed guard
violations (or the typed input-digest-mismatch failure) — nothing ungated
becomes anchoring evidence.

The wrapped adapter is selected by ANCHOR007_PROVIDER (a path to
path_a_provider.py or path_b_provider.py — the drills exercise the seam
against BOTH lanes); the corruption class by ANCHOR007_CORRUPT:
  unknown-field   inject a top-level mystery field (provider type crossing)
  handle-leak     inject a provider handle reference into provenance
  nan-matrix      emit a minimal well-formed 'anchored' response whose
                  hypothesis matrix carries a non-finite entry
  refused-hyp     emit 'refused' status while carrying hypotheses
  wrong-input-dig echo a fabricated inputDigest (the supervision audit drill)

This wrapper is a DRILL instrument, never a provider (the ANCHOR-003b
corrupter discipline, carried and parameterized over both spike lanes).
"""

import json
import os
import subprocess
import sys


def main() -> int:
    raw = sys.stdin.buffer.read()
    adapter = os.environ.get("ANCHOR007_PROVIDER", "")
    if not adapter:
        sys.stderr.write("ANCHOR007_PROVIDER must name the wrapped adapter\n")
        return 2
    proc = subprocess.run([sys.executable, adapter], input=raw,
                          capture_output=True, timeout=880)
    if proc.returncode != 0:
        sys.stdout.buffer.write(proc.stdout)
        return proc.returncode
    response = json.loads(proc.stdout.decode("utf8"))
    mode = os.environ.get("ANCHOR007_CORRUPT", "")

    if mode == "unknown-field":
        response["mysteryPoseGraph"] = {"nodes": 17, "edges": 31}
    elif mode == "handle-leak":
        response["provenance"]["siftKeyPointHandle"] = "cv2.KeyPoint@0x7f3a1c0008b0"
    elif mode == "nan-matrix":
        # synthetic minimal well-formed anchored response (declared drill
        # base — the real adapters refuse on real data, so the corrupter
        # must synthesize the shape to corrupt)
        req = json.loads(raw.decode("utf8"))
        cid = req["evidence"][0]["contentId"]
        response = {
            "schemaVersion": 1,
            "portVersion": response["portVersion"],
            "contractVersion": response["contractVersion"],
            "executionId": response["executionId"],
            "status": "anchored",
            "reasonCode": None,
            "provenance": response["provenance"],
            "hypotheses": [{
                "evidenceContentId": cid,
                "representation": "plan-homography",
                "transform": {
                    "frameFrom": "plan-raster-px",
                    "frameTo": "still-px",
                    # a non-finite matrix entry in VALID JSON: the sentinel
                    # string below is replaced textually with the JSON number
                    # literal 1e999, which every strict JSON parser parses to
                    # IEEE Infinity (a raw NaN/Infinity literal is not valid
                    # JSON and would be refused earlier as invalid-json; the
                    # drill targets the guard's finite-number law)
                    "matrix": [["__NONFINITE__", 0.0, 0.0], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0]],
                },
                "inlierCount": 42,
                "matchCount": 99,
                "inlierRatio": 0.42,
                "residualRmsPx": 1.5,
                "uncertainty": {
                    "floorRmsM": 0.05, "budget95M": 0.098, "basis": "drill",
                    "budgetTerms": {"drill": 0.05},
                },
                "confidence": 0.9,
                "epistemicLabel": "INFERRED",
                "crossValidation": [],
            }],
            "executionTimeMs": 1.0,
        }
        out = json.dumps(response, sort_keys=True)
        sys.stdout.write(out.replace('"__NONFINITE__"', "1e999"))
        return 0
    elif mode == "refused-hyp":
        response["status"] = "refused"
        response["reasonCode"] = "registration-unreliable"
        response["refusalDetail"] = "drill: refused status carrying hypotheses"
        if not response.get("hypotheses"):
            req = json.loads(raw.decode("utf8"))
            response["hypotheses"] = [{
                "evidenceContentId": req["evidence"][0]["contentId"],
                "representation": "plan-homography",
                "transform": {"frameFrom": "plan-raster-px", "frameTo": "still-px",
                              "matrix": [[1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0]]},
                "inlierCount": 3, "matchCount": 4, "inlierRatio": 0.75,
                "residualRmsPx": 0.5,
                "uncertainty": {"floorRmsM": 0.05, "budget95M": 0.098, "basis": "drill",
                                "budgetTerms": {"drill": 0.05}},
                "confidence": 0.9, "epistemicLabel": "INFERRED", "crossValidation": [],
            }]
    elif mode == "wrong-input-dig":
        response["provenance"]["inputDigest"] = "sha256:" + "0" * 64
    else:
        sys.stderr.write(f"unknown ANCHOR007_CORRUPT mode {mode!r}\n")
        return 2

    sys.stdout.write(json.dumps(response, sort_keys=True))
    return 0


if __name__ == "__main__":
    sys.exit(main())
