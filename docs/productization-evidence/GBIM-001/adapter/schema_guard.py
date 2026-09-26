#!/usr/bin/env python3
"""GBIM-001 — the AISE-side schema guard (the port's projection discipline).

Mirrors the D26 canonical-boundary guard of
backend/api/src/geometry-eval/adapter.ts: a provider response is NEVER
trusted as canonical — it must validate against the CLOSED output schema of
the spike geometry port before any of its values may be recorded as
comparison evidence. Unknown fields, wrong vocabularies, non-finite numbers
or non-numeric measurements are refused with the typed `contract-mismatch`
refusal (fail closed; neg-007).

This module is deliberately provider-free (stdlib json only) so it also
serves the historical-replay-without-provider proof.
"""

from __future__ import annotations

import math

PORT_VERSION = "gbim001-geometry-port/1"
OPERATION_STATUSES = {"applied", "invalid", "unsupported"}
RESPONSE_STATUSES = {"executed", "refused"}
DIMENSIONS = {"length", "area", "volume", "mass", "count", "duration"}
DIRECTIONS = {"added", "removed", "changed"}

TOP_LEVEL_FIELDS = {
    "schemaVersion", "portVersion", "executionId", "status", "reasonCode",
    "reasonDetail", "provenance", "operationResults", "sceneStateDigest",
}
RESULT_FIELDS = {
    "operationId", "operationType", "status", "reasonCode", "reasonDetail",
    "measurements", "quantities", "hostEffect", "externalReferences",
    "validationChecks", "executionTimeMs",
}
MEASUREMENT_FIELDS = {"solidVolumeM3", "surfaceAreaM2", "boundingBoxM", "topology"}
QUANTITY_FIELDS = {"label", "dimension", "value", "unit", "direction", "basis", "previousValue"}


def _is_number(v) -> bool:
    return isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v)


def guard(response: dict) -> tuple[bool, list[str]]:
    """Validate one provider response. Returns (ok, refusals)."""
    refusals: list[str] = []

    if not isinstance(response, dict):
        return False, ["response is not a JSON object"]

    unknown = set(response.keys()) - TOP_LEVEL_FIELDS
    if unknown:
        refusals.append(f"unknown top-level fields: {sorted(unknown)}")

    if response.get("portVersion") != PORT_VERSION:
        refusals.append(f"portVersion must be '{PORT_VERSION}'")
    if response.get("status") not in RESPONSE_STATUSES:
        refusals.append(f"status must be one of {sorted(RESPONSE_STATUSES)}")

    prov = response.get("provenance")
    if not isinstance(prov, dict):
        refusals.append("provenance must be an object")
    else:
        for field in ("providerId", "kernel", "kernelVersion", "inputDigest", "adapterSourceDigest"):
            if not isinstance(prov.get(field), str) or not prov.get(field):
                refusals.append(f"provenance.{field} must be a non-empty string")

    results = response.get("operationResults")
    if not isinstance(results, list):
        refusals.append("operationResults must be a list")
        return (not refusals), refusals

    for i, res in enumerate(results):
        where = f"operationResults[{i}]"
        if not isinstance(res, dict):
            refusals.append(f"{where}: not an object")
            continue
        unknown = set(res.keys()) - RESULT_FIELDS
        if unknown:
            refusals.append(f"{where}: unknown fields {sorted(unknown)} (provider types/handles may not cross the canonical boundary)")
        if res.get("status") not in OPERATION_STATUSES:
            refusals.append(f"{where}: status must be one of {sorted(OPERATION_STATUSES)}")
        if not isinstance(res.get("operationId"), str) or not res.get("operationId"):
            refusals.append(f"{where}: operationId must be a non-empty AISE-owned id")
        if not _is_number(res.get("executionTimeMs")):
            refusals.append(f"{where}: executionTimeMs must be a finite number")

        if res.get("status") == "applied":
            m = res.get("measurements")
            if not isinstance(m, dict):
                refusals.append(f"{where}: applied operations must carry measurements")
            else:
                unknown = set(m.keys()) - MEASUREMENT_FIELDS
                if unknown:
                    refusals.append(f"{where}.measurements: unknown fields {sorted(unknown)}")
                for field in ("solidVolumeM3", "surfaceAreaM2"):
                    if not _is_number(m.get(field)):
                        refusals.append(f"{where}.measurements.{field}: must be a finite number (got {m.get(field)!r})")
                bb = m.get("boundingBoxM")
                if not isinstance(bb, dict) or set(bb.keys()) != {"min", "max"}:
                    refusals.append(f"{where}.measurements.boundingBoxM: must be {{min,max}}")
                else:
                    for k in ("min", "max"):
                        if not isinstance(bb[k], list) or len(bb[k]) != 3 or not all(_is_number(v) for v in bb[k]):
                            refusals.append(f"{where}.measurements.boundingBoxM.{k}: must be 3 finite numbers")
                topo = m.get("topology")
                if not isinstance(topo, dict) or not isinstance(topo.get("isValidBRep"), bool):
                    refusals.append(f"{where}.measurements.topology.isValidBRep: must be boolean")

            quants = res.get("quantities")
            if not isinstance(quants, list) or not quants:
                refusals.append(f"{where}: applied operations must carry quantities")
            else:
                for j, quant in enumerate(quants):
                    qw = f"{where}.quantities[{j}]"
                    if not isinstance(quant, dict):
                        refusals.append(f"{qw}: not an object")
                        continue
                    unknown = set(quant.keys()) - QUANTITY_FIELDS
                    if unknown:
                        refusals.append(f"{qw}: unknown fields {sorted(unknown)}")
                    if quant.get("dimension") not in DIMENSIONS:
                        refusals.append(f"{qw}: dimension must be one of {sorted(DIMENSIONS)}")
                    if quant.get("direction") not in DIRECTIONS:
                        refusals.append(f"{qw}: direction must be one of {sorted(DIRECTIONS)}")
                    if not _is_number(quant.get("value")):
                        refusals.append(f"{qw}: value must be a finite number")
                    if not isinstance(quant.get("unit"), str) or not quant.get("unit"):
                        refusals.append(f"{qw}: unit is required (a quantity is never a bare number)")

        else:
            if res.get("measurements") is not None or res.get("quantities") is not None:
                refusals.append(
                    f"{where}: {res.get('status')} operations must carry NO measurements/quantities (fail closed)"
                )
            if not isinstance(res.get("reasonCode"), str) or not res.get("reasonCode"):
                refusals.append(f"{where}: {res.get('status')} operations must carry a reasonCode")

    return (not refusals), refusals
