#!/usr/bin/env python3
"""
ANCHOR-003b — the response corrupter (the guard-drill provider wrapper).

The negative ledger's corrupted-response drills (neg-006a..d, neg-008) run
the REAL adapter to completion, then inject a designated defect into its
response and emit the corrupted bytes as if they were the provider's own
stdout. The AISE-side supervised runner must REFUSE the corrupted bytes with
its typed guard violations (or the typed input-digest-mismatch failure) —
nothing ungated becomes anchoring evidence.

The corruption class is selected by the ANCHOR003B_CORRUPT environment
variable:
  unknown-field   inject a top-level mystery field (provider type crossing)
  handle-leak     inject a provider handle reference into provenance
  nan-matrix      emit a minimal well-formed 'anchored' response whose
                  hypothesis matrix carries a NaN (synthetic drill base —
                  the real adapter never anchors on this photoset)
  refused-hyp     emit 'refused' status while carrying hypotheses
  wrong-input-dig echo a fabricated inputDigest (the supervision audit drill)

This wrapper is a DRILL instrument, never a provider: it exists so the
runner's guard can be exercised against realistic corrupted bytes derived
from the real adapter's actual output.
"""

import json
import os
import subprocess
import sys

ADAPTER = os.path.join(os.path.dirname(os.path.abspath(__file__)), "anchor_provider.py")


def main() -> int:
    raw = sys.stdin.buffer.read()
    proc = subprocess.run([sys.executable, ADAPTER], input=raw,
                          capture_output=True, timeout=280)
    if proc.returncode != 0:
        sys.stdout.buffer.write(proc.stdout)
        return proc.returncode
    response = json.loads(proc.stdout.decode("utf8"))
    mode = os.environ.get("ANCHOR003B_CORRUPT", "")

    if mode == "unknown-field":
        response["mysteryPoseGraph"] = {"nodes": 17, "edges": 31}
    elif mode == "handle-leak":
        response["provenance"]["siftKeyPointHandle"] = "cv2.KeyPoint@0x7f3a1c0008b0"
    elif mode == "nan-matrix":
        # synthetic minimal well-formed anchored response (declared drill
        # base — the real adapter refuses on this photoset, so the corrupter
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
                    "floorRmsM": 0.01,
                    "budget95M": 0.02,
                    "basis": "drill",
                },
                "confidence": 0.9,
                "epistemicLabel": "INFERRED",
                "crossValidation": [],
            }],
            "executionTimeMs": 1.0,
        }
    elif mode == "refused-hyp":
        req = json.loads(raw.decode("utf8"))
        cid = req["evidence"][0]["contentId"]
        response["hypotheses"] = [{
            "evidenceContentId": cid,
            "representation": "plan-homography",
            "transform": {
                "frameFrom": "plan-raster-px",
                "frameTo": "still-px",
                "matrix": [[1.0, 0.0, 5.0], [0.0, 1.0, 5.0], [0.0, 0.0, 1.0]],
            },
            "inlierCount": 42,
            "matchCount": 99,
            "inlierRatio": 0.42,
            "residualRmsPx": 1.5,
            "uncertainty": {"floorRmsM": 0.01, "budget95M": 0.02, "basis": "drill"},
            "confidence": 0.9,
            "epistemicLabel": "INFERRED",
            "crossValidation": [],
        }]
    elif mode == "wrong-input-dig":
        response["provenance"]["inputDigest"] = (
            "sha256:0000000000000000000000000000000000000000000000000000000000000000")
    else:
        print(f"corrupter: unknown ANCHOR003B_CORRUPT={mode!r}", file=sys.stderr)
        return 2

    payload = json.dumps(response, sort_keys=True).replace('"__NONFINITE__"', "1e999")
    sys.stdout.buffer.write(payload.encode("utf8"))
    return 0


if __name__ == "__main__":
    sys.exit(main())
