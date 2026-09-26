# GBIM-001 — The Smallest Provider-Neutral Geometry Port

**Status:** spike proposal (nothing here enters the canonical engine)  
**Relationship to existing seams:** this port is the MINIMAL spike-scoped
projection of the existing governed Layer-3 substitution surface
(`backend/api/src/geometry-eval/adapter.ts` — `GeometryProvider` +
`executeSequence`), reduced to what the GBIM shared fixture needs. The
existing port is NOT modified; the spike port is disposable evidence for
what a production "Geometry Port" Work Item would have to carry.

## 1. The boundary

```
AISE DOMAIN CORE (TypeScript, canonical authority — UNCHANGED by this spike)
  canonical EngineeringOperation (AISE-owned ids, spike fixture vocabulary)
        |
        |  SpikeGeometryExecutionInput  (JSON, SI units, AISE-owned ids)
        v
  =========================== PROCESS BOUNDARY ===========================
        |  (stdio: the ONLY thing that crosses is serialized JSON)
        v
  DISPOSABLE PROVIDER (Python process: OCCT 7.9.3 via OCP + CadQuery 2.8.0)
        |
        |  SpikeGeometryExecutionOutput (JSON, closed output vocabulary)
        v
  AISE-side schema guard (schema_guard.py — the D26 projection discipline)
        |
        v  comparison records, external references — NEVER canonical identity
```

The port is deliberately a PROCESS boundary, not an in-process interface: a
kernel type physically cannot cross it. This is a stronger guarantee than
the existing in-process `GeometryProvider` interface can make, and it is
the shape we recommend for any production OCCT adoption (see
recommendation.md).

## 2. Input contract (`SpikeGeometryExecutionInput`)

Built exclusively by AISE-owned code (`adapter/canonical_fixture.py`) from
the pinned GBIM-000 fixture plus the declared placement policy:

```jsonc
{
  "schemaVersion": 1,
  "portVersion": "gbim001-geometry-port/1",
  "executionId": "gbim001-run-001",
  "fixtureId": "GBIM-000-building-001",
  "authority": "AISE",          // the fixture is stored in AISE semantics first (charter §3)
  "units": "SI",
  "scene": {
    "roomId": "room-001", "roomLengthM": 8.0, "roomWidthM": 6.0, "roomHeightM": 3.0,
    "elements": { /* GBIM-000 geometry elements, verbatim */ },
    "placementPolicy": { /* gbim001-placement-policy/1 — declared, versioned */ }
  },
  "operations": [
    {
      "operationId": "op-001",          // AISE-owned identity (never provider-invented)
      "operationType": "create-wall",   // closed spike vocabulary (charter §3)
      "targetId": "wall-001",
      "hostId": "room-001",
      "parameters": [ { "name": "length", "value": 8.0, "unit": "m" } ],  // explicit units
      "dependsOn": []                    // AISE-owned ordering edges
    }
  ]
}
```

Mirrors of the existing neutral vocabulary (`NeutralOperation`,
`NeutralParameter` in `backend/api/src/geometry-eval/model.ts`): numeric
parameters REQUIRE explicit units; targets are AISE-owned ids, never
provider geometry handles.

## 3. Output contract (`SpikeGeometryExecutionOutput`)

Closed vocabulary, strictly validated by the AISE-side guard:

```jsonc
{
  "schemaVersion": 1,
  "portVersion": "gbim001-geometry-port/1",
  "executionId": "…",
  "status": "executed" | "refused",
  "reasonCode": null | "duplicate-operation-identity" | "input-contract-violation" | …,
  "provenance": {
    "providerId": "occt-cadquery-spike",
    "kernel": "OpenCASCADE Technology (OCCT)",
    "kernelVersion": "7.9.3",
    "binding": "cadquery-ocp 7.9.3.1.1",
    "authoringLayer": "cadquery 2.8.0",
    "pythonVersion": "3.12.14",
    "platform": "Linux x86_64",
    "inputDigest": "sha256:…",            // digest of the exact input JSON
    "adapterSourceDigest": "sha256:…"     // digest of the adapter source itself
  },
  "operationResults": [
    {
      "operationId": "op-001",
      "operationType": "create-wall",
      "status": "applied" | "invalid" | "unsupported",
      "reasonCode": null | "wall-thickness-impossible" | …,
      "measurements": {                    // ONLY on "applied"
        "solidVolumeM3": 4.8,
        "surfaceAreaM2": 52.4,
        "boundingBoxM": { "min": [0,0,0], "max": [8,0.2,3] },
        "topology": { "isValidBRep": true, "isClosedManifold": true,
                       "solids": 1, "shells": 1, "faces": 6, "edges": 12, "vertices": 8 }
      },
      "quantities": [                      // AISE dimension/direction vocabulary
        { "label": "wall-volume", "dimension": "volume", "value": 4.8, "unit": "m3",
          "direction": "added", "basis": "occt-brep-exact" }
      ],
      "hostEffect": { "hostId": "wall-001", "relation": "boolean-cut-void-in-host",
                      "hostMeasurements": { … } },   // opening/wall relationship
      "externalReferences": [              // opaque, deletable, non-canonical
        { "kind": "provider-shape", "ref": "occt-brep:wall-001#op-001",
          "note": "OCCT TopoDS_Shape handle — external reference only" }
      ],
      "validationChecks": [ { "checkId": "topology-validity", "outcome": "pass" } ],
      "executionTimeMs": 2.031             // performance observation, excluded from digests
    }
  ],
  "sceneStateDigest": "sha256:…"
}
```

### The three laws this port enforces (charter §2)

1. **No kernel type crosses.** The provider is a subprocess; the output is
   JSON validated against a closed schema. Unknown fields (e.g. a
   `mysteryTopologyHandle: "TopoDS_Shape@0x…"`) are refused with the typed
   `contract-mismatch` (proven by neg-007).
2. **AISE owns identity.** `operationId`s come from the fixture (op-001 …
   op-010) and are echoed; the provider never invents canonical ids.
   Provider shape handles appear ONLY inside `externalReferences`, which are
   deletable without affecting the canonical core (proven by replay step C).
3. **Fail closed before geometry.** The provider's gate order mirrors the
   AISE engine's `apply.ts`: input sanity → duplicate identity → capability
   (unsupported family named BEFORE any computation) → parameters →
   semantic/host validation → geometry → topology validity. Invalid and
   unsupported operations carry NO measurements and NO quantities.

## 4. What the port does NOT carry (the "smallest" discipline)

- No material semantics, no BOQ derivation (that stays in
  `packages/solution-boq` behind the engine).
- No Reality Graph / Solution Graph types — the port returns comparison
  records only; proposed-state authority stays in AISE.
- No IFC, meshes, or scene graphs (GBIM-002/003 surfaces).
- No in-process handle passing, no shared memory, no callbacks.

## 5. Production path (if adopted)

A production Geometry Port Work Item would: lift this JSON contract into
`packages/` as a typed zod schema (the same codec discipline as
`solution-contract`), implement the AISE side of the process boundary as a
supervised subprocess runner (input digest, timeout, output guard), and
register the provider in `packages/provider-registry` with the promotion
gates. The spike evidence (semantic-comparison.md, SCORECARD.md) is the
input to that decision.
