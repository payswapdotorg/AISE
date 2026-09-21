/**
 * One-off golden-fixture generator (PROD-022 tooling, NOT shipped in the
 * package's test suite): replays the canonical wall-upgrade world and the
 * full ten-intent building corpus from the CONTRACT's committed fixtures
 * and prints the engine outputs that get pinned into
 * `fixtures/wall-upgrade-expected.json` and
 * `fixtures/engine-quantity-expectations.json`.
 *
 * Run: cd packages/solution-engine && bun scripts/generate-golden.ts
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  REFERENCE_BUILDING_DOMAIN,
  REFERENCE_BUILDING_OPERATION_PROFILE,
  decodeEngineeringOperationIntent,
} from "@aise/solution-contract";
import {
  TableBaselineGeometryResolver,
  applyOperation,
  deriveStateQuantities,
  replaySolution,
  steppedMaterializeClock,
  validateSolutionVersion,
} from "../src/index";

const CONTRACT_FIXTURES = join(import.meta.dir, "../../solution-contract/fixtures");
const ENGINE_FIXTURES = join(import.meta.dir, "../fixtures");

function loadContractIntent(name: string) {
  return decodeEngineeringOperationIntent(
    JSON.parse(
      readFileSync(join(CONTRACT_FIXTURES, "operation", `EngineeringOperationIntent.${name}.json`), "utf8"),
    ),
  );
}

const baselineGeometryTable = JSON.parse(
  readFileSync(join(ENGINE_FIXTURES, "baseline-geometry.json"), "utf8"),
) as Record<string, { value: number; unit: string }>;
const resolver = new TableBaselineGeometryResolver(baselineGeometryTable);

/* ---- The canonical wall-upgrade replay (demolition → block wall → plaster) ---- */

const wallUpgradeIntents = [
  loadContractIntent("valid-demolition-removal"),
  loadContractIntent("valid-block-wall-placement"),
  loadContractIntent("valid-plaster-application"),
];

const replay = replaySolution({
  solutionId: "solution-demo-001",
  projectId: "proj-demo-001",
  title: "Ground-floor wall upgrade solution",
  problemStatement:
    "Rising damp has damaged the ground-floor masonry wall; the damaged section must be removed, rebuilt with concrete blocks and re-plastered.",
  domain: REFERENCE_BUILDING_DOMAIN,
  baselineRealityVersionId: "rgv-demo-0007",
  intents: wallUpgradeIntents,
  capabilityProfile: REFERENCE_BUILDING_OPERATION_PROFILE,
  baselineGeometry: resolver,
  materializeClock: steppedMaterializeClock(Date.UTC(2026, 8, 16, 10, 0, 0, 0), 60_000),
  createdAt: "2026-09-16T08:00:00.000Z",
});

if (replay.outcome !== "complete") {
  process.stderr.write(`wall-upgrade replay failed: ${JSON.stringify(replay.failure)}\n`);
  process.exit(1);
}

const snapshot = validateSolutionVersion({
  version: replay.version,
  capabilityProfile: REFERENCE_BUILDING_OPERATION_PROFILE,
  baselineGeometry: resolver,
  validatedAt: "2026-09-16T10:30:00.000Z",
});

const inventory = deriveStateQuantities(replay.version);

const golden = {
  replay: {
    solutionId: replay.solution.solutionId,
    versionNumber: replay.version.versionNumber,
    status: replay.version.status,
    stateCount: replay.version.states.length,
    operationCount: replay.version.operations.length,
    states: replay.version.states.map((state) => ({
      stateIndex: state.stateIndex,
      stateId: state.stateId,
      contentDigest: state.contentDigest,
      appliedOperationIds: state.appliedOperationIds,
      materializedAt: state.materializedAt,
    })),
    operations: replay.version.operations.map((operation) => ({
      operationIndex: operation.operationIndex,
      operationId: operation.operationId,
      operationType: operation.operationType,
      intentRef: operation.provenance.intentRef,
      effectCount: operation.effects.length,
    })),
    steps: replay.steps.map((step) => ({
      stepIndex: step.stepIndex,
      intentId: step.intentId,
      operationId: step.applied.operation.operationId,
      transitionId: step.applied.lineage.transitionId,
      parentStateId: step.applied.lineage.parentStateId,
      resultingStateId: step.applied.lineage.resultingStateId,
      limitsExceeded: step.applied.limitsExceeded.length,
      quantities: step.applied.quantities.map((quantity) => ({
        label: quantity.label,
        dimension: quantity.dimension,
        value: quantity.value,
        unit: quantity.unit,
        direction: quantity.direction,
        calculationRef: quantity.calculationRef,
        formula: quantity.formula,
      })),
    })),
  },
  validationSnapshot: {
    snapshotId: snapshot.snapshotId,
    outcome: snapshot.outcome,
    inputDigest: snapshot.inputDigest,
    checks: snapshot.checks.map((check) => ({ checkId: check.checkId, result: check.result })),
  },
  quantityInventory: {
    stateIndex: inventory.stateIndex,
    stateId: inventory.stateId,
    perOperation: inventory.perOperation.map((entry) => ({
      operationIndex: entry.operationIndex,
      operationId: entry.operationId,
      dimension: entry.dimension,
      value: entry.value,
      unit: entry.unit,
      direction: entry.direction,
      calculationRef: entry.calculationRef,
      sourceStateId: entry.sourceStateId,
      parameters: entry.parameters,
    })),
    totals: inventory.totals,
  },
};

const goldenText = `${JSON.stringify(golden, null, 2)}\n`;
writeFileSync(join(ENGINE_FIXTURES, "wall-upgrade-expected.json"), goldenText);
process.stdout.write("wrote fixtures/wall-upgrade-expected.json\n");

/* ---- The ten-intent building quantity expectations ---- */

const intentNames = [
  "valid-excavation-direct",
  "valid-backfill",
  "valid-demolition-removal",
  "valid-foundation-placement",
  "valid-slab-placement",
  "valid-block-wall-placement",
  "valid-opening-creation",
  "valid-plaster-application",
  "valid-building-service-installation",
  "valid-finish-application",
];

const expectations: unknown[] = [];
for (const name of intentNames) {
  const intent = loadContractIntent(name);
  const result = applyOperation({
    baseline: {
      contractVersion: "1.0.0",
      stateId: "state-quantity-probe-baseline",
      solutionId: "solution-demo-001",
      versionNumber: 1,
      stateIndex: 0,
      baselineRealityVersionId: "rgv-demo-0007",
      epistemicStatus: "PROPOSED",
      appliedOperationIds: [],
      materializedAt: "2026-09-16T00:00:00.000Z",
    },
    intent,
    capabilityProfile: REFERENCE_BUILDING_OPERATION_PROFILE,
    materializedAt: "2026-09-16T00:01:00.000Z",
    baselineGeometry: resolver,
  });
  if (result.outcome !== "applied") {
    process.stderr.write(`intent ${name} failed: ${JSON.stringify(result.reasons)}\n`);
    process.exit(1);
  }
  expectations.push({
    intentFixture: name,
    operationType: intent.operationType,
    quantities: result.quantities.map((quantity) => ({
      label: quantity.label,
      dimension: quantity.dimension,
      value: quantity.value,
      unit: quantity.unit,
      direction: quantity.direction,
      calculationRef: quantity.calculationRef,
    })),
  });
}

const expectationsText = `${JSON.stringify(expectations, null, 2)}\n`;
writeFileSync(join(ENGINE_FIXTURES, "engine-quantity-expectations.json"), expectationsText);
process.stdout.write("wrote fixtures/engine-quantity-expectations.json\n");
