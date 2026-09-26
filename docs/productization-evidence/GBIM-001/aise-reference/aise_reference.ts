/**
 * GBIM-001 — AISE reference comparison lane.
 *
 * Calls the REAL, unmodified AISE solution-engine quantity models
 * (packages/solution-engine/src/quantity-models.ts — the current
 * deterministic geometry/quantity authority) for every canonical fixture
 * operation that has a production counterpart, and records the capability
 * gap for the rest. Output: results/aise-reference.json.
 *
 * Run with: bun docs/productization-evidence/GBIM-001/aise-reference/aise_reference.ts
 */

import {
  referenceBuildingQuantityModels,
  type QuantityModelInput,
} from "../../../../packages/solution-engine/src/quantity-models";
import { BUILDING_OPERATION_TYPES } from "../../../../packages/solution-contract/src/domain";
import type { TypedOperationParameter } from "../../../../packages/solution-contract/src/operation";

const models = referenceBuildingQuantityModels();

// The spike-to-production operation mapping (GBIM-000 fixture -> Phase-1
// BUILDING_OPERATION_TYPES vocabulary). Only these four have production
// counterparts today; the mapping itself is the comparison claim.
const MAPPING: Record<string, { productionType: string; note: string } | { productionType: null; note: string }> = {
  "create-wall": { productionType: "block-wall-placement", note: "wall => block wall placement model" },
  "create-opening": { productionType: "opening-creation", note: "generic opening => opening creation model" },
  "create-door": {
    productionType: null,
    note: "NO production counterpart: BUILDING_OPERATION_TYPES has no door model; door-as-opening would double-count the void the create-opening op already made",
  },
  "create-window": {
    productionType: null,
    note: "NO production counterpart: no window/glazing model in the Phase-1 vocabulary",
  },
  "create-column": { productionType: null, note: "NO production counterpart: no column model" },
  "create-footing": { productionType: "foundation-placement", note: "footing => foundation placement model" },
  "create-slab": { productionType: "slab-placement", note: "slab => slab placement model" },
  "create-beam": { productionType: null, note: "NO production counterpart: no beam model" },
  "create-partition": {
    productionType: null,
    note: "NO production counterpart: partition would reuse block-wall-placement only by re-declaring it as a wall — not a distinct operation",
  },
  "revise-opening": {
    productionType: null,
    note: "NO direct counterpart: revision in production AISE is reviseVersion() — a NEW solution version (packages/solution-engine/src/revise.ts), not a parameter-revise operation; the opening-creation model would be re-applied with new dimensions",
  },
};

function target(): Record<string, unknown> {
  return {
    contractVersion: "1.0.0",
    selectorKind: "element",
    nodeRefs: ["room-001"],
    geometryRefs: [],
    units: { linear: "m", angular: "rad" },
    description: "GBIM-001 comparison lane target",
  };
}

function params(entries: [string, number, string][]): TypedOperationParameter[] {
  return entries.map(([name, value, unit]) => ({ name, value, unit }));
}

// The GBIM-000 fixture's canonical dimensions, in production parameter
// vocabulary (canonical units, exactly as the engine would receive them).
const FIXTURE_INPUTS: Record<string, { parameters: [string, number, string][] }> = {
  "create-wall": { parameters: [["length", 8.0, "m"], ["height", 3.0, "m"], ["thickness", 0.2, "m"]] },
  "create-opening": { parameters: [["width", 0.9, "m"], ["height", 2.1, "m"], ["material", 0, "n/a"]] as [string, number, string][] },
  "create-footing": { parameters: [["length", 0.4, "m"], ["width", 0.4, "m"], ["depth", 0.3, "m"]] },
  "create-slab": { parameters: [["length", 8.0, "m"], ["width", 6.0, "m"], ["thickness", 0.2, "m"]] },
};

// opening-creation requires width/height; material is a string param in the
// capability profile — the model itself only consumes width/height.
(FIXTURE_INPUTS["create-opening"] as { parameters: [string, number, string][] }).parameters = [
  ["width", 0.9, "m"],
  ["height", 2.1, "m"],
];

// The revised window opening (op-010) would re-apply opening-creation with
// the revised dimensions if production semantics supported it:
const REVISED_WINDOW: [string, number, string][] = [["width", 1.5, "m"], ["height", 1.2, "m"]];

const spikeOpOrder = [
  ["op-001", "create-wall"],
  ["op-002", "create-opening"],
  ["op-003", "create-door"],
  ["op-004", "create-window"],
  ["op-005", "create-column"],
  ["op-006", "create-footing"],
  ["op-007", "create-slab"],
  ["op-008", "create-beam"],
  ["op-009", "create-partition"],
  ["op-010", "revise-opening"],
] as const;

const results: Record<string, unknown>[] = [];

for (const [opId, spikeType] of spikeOpOrder) {
  const mapping = MAPPING[spikeType];
  if (!mapping.productionType) {
    results.push({
      operationId: opId,
      spikeOperationType: spikeType,
      productionOperationType: null,
      status: "no-production-counterpart",
      note: mapping.note,
      quantities: [],
    });
    continue;
  }
  const model = models[mapping.productionType];
  const fixtureInput =
    spikeType === "revise-opening"
      ? { parameters: params(REVISED_WINDOW) }
      : FIXTURE_INPUTS[spikeType];
  const input: QuantityModelInput = {
    parameters: params(fixtureInput.parameters),
    target: target() as never,
  };
  const computation = model.compute(input);
  results.push({
    operationId: opId,
    spikeOperationType: spikeType,
    productionOperationType: mapping.productionType,
    status: computation.status,
    quantities:
      computation.status === "computed"
        ? computation.quantities.map((q) => ({
            label: q.label,
            dimension: q.dimension,
            value: q.value,
            unit: q.unit,
            direction: q.direction,
            formula: q.formula,
            calculationRef: q.calculationRef,
            parameterTrace: q.parameterTrace,
          }))
        : computation.reasons,
    note: mapping.note,
  });
}

const out = {
  lane: "aise-reference",
  authority: "packages/solution-engine/src/quantity-models.ts (referenceBuildingQuantityModels, unmodified)",
  engineVersion: "1.0.0",
  productionVocabulary: BUILDING_OPERATION_TYPES,
  spikeToProductionMapping: MAPPING,
  results,
};

const path = import.meta.dir + "/../results/aise-reference.json";
await Bun.write(path, JSON.stringify(out, null, 2) + "\n");

for (const r of results) {
  const res = r as { operationId: string; spikeOperationType: string; productionOperationType: string | null; status: string; quantities: unknown[] };
  if (!res.productionOperationType) {
    console.log(`  ${res.operationId} ${res.spikeOperationType}: NO PRODUCTION COUNTERPART`);
  } else {
    const qline = (res.quantities as { label: string; value: number; unit: string; direction: string }[])
      .map((q) => `${q.label}=${q.value} ${q.unit} [${q.direction}]`)
      .join("; ");
    console.log(`  ${res.operationId} ${res.spikeOperationType} => ${res.productionOperationType}: ${res.status} | ${qline}`);
  }
}
console.log(`written: ${path}`);
