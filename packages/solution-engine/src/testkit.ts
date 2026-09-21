/**
 * Engine test kit (PROD-022) — shared deterministic test-world builders.
 *
 * Loads the CONTRACT's committed fixture corpus BY REFERENCE (the intent
 * fixtures of `packages/solution-contract/fixtures/operation/`) plus this
 * package's own fixtures (baseline geometry, golden expected outputs), and
 * exposes the canonical wall-upgrade world used across the suite. No
 * clock, no network, no randomness.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  REFERENCE_BUILDING_DOMAIN,
  REFERENCE_BUILDING_OPERATION_PROFILE,
  createOperationIntent,
  decodeEngineeringOperationIntent,
  type EngineeringOperationIntent,
  type OperationCapabilityProfile,
} from "@aise/solution-contract";
import {
  TableBaselineGeometryResolver,
  fixedMaterializeClock,
  type BaselineGeometryResolver,
} from "./index";
import type { OperationTarget } from "@aise/solution-contract";

const CONTRACT_FIXTURES = join(import.meta.dir, "..", "..", "solution-contract", "fixtures");
const ENGINE_FIXTURES = join(import.meta.dir, "..", "fixtures");

/** Loads one committed CONTRACT intent fixture (by reference). */
export function contractIntent(name: string): EngineeringOperationIntent {
  return decodeEngineeringOperationIntent(
    JSON.parse(
      readFileSync(
        join(CONTRACT_FIXTURES, "operation", `EngineeringOperationIntent.${name}.json`),
        "utf8",
      ),
    ),
  );
}

/** Loads one committed ENGINE fixture as JSON. */
export function engineFixture<T>(name: string): T {
  return JSON.parse(readFileSync(join(ENGINE_FIXTURES, name), "utf8")) as T;
}

/** The read-only demo baseline geometry resolver (the wall world). */
export function demoBaselineGeometry(): BaselineGeometryResolver {
  return new TableBaselineGeometryResolver(engineFixture("baseline-geometry.json"));
}

/** The canonical wall-upgrade intent sequence (contract corpus, by reference). */
export function wallUpgradeIntents(): EngineeringOperationIntent[] {
  return [
    contractIntent("valid-demolition-removal"),
    contractIntent("valid-block-wall-placement"),
    contractIntent("valid-plaster-application"),
  ];
}

/** The reference capability profile (the engine-owned contract constant). */
export const REFERENCE_PROFILE: OperationCapabilityProfile =
  REFERENCE_BUILDING_OPERATION_PROFILE;

/** Fixed canonical instants of the demo world (deterministic). */
export const WALL_WORLD = {
  solutionId: "solution-demo-001",
  projectId: "proj-demo-001",
  title: "Ground-floor wall upgrade solution",
  problemStatement:
    "Rising damp has damaged the ground-floor masonry wall; the damaged section must be removed, rebuilt with concrete blocks and re-plastered.",
  baselineRealityVersionId: "rgv-demo-0007",
  createdAt: "2026-09-16T08:00:00.000Z",
  clockStartMs: Date.UTC(2026, 8, 16, 10, 0, 0, 0),
  clockStepMs: 60_000,
  domain: REFERENCE_BUILDING_DOMAIN,
} as const;

/** The demo world's stepped materialization clock (layer N → +N minutes). */
export function wallClock(): (stateIndex: number) => string {
  return fixedMaterializeClock("2026-09-16T10:00:00.000Z");
}

/** A volume target anchored to the demo site (for ad-hoc intents). */
export function volumeTarget(): OperationTarget {
  return {
    contractVersion: "1.0.0",
    selectorKind: "volume",
    nodeRefs: ["node-site-001"],
    geometryRefs: [{ kind: "polygon", ref: "geo-pit-outline-001", contractVersion: "1.0.0" }],
    units: { linear: "m", angular: "rad" },
    description: "the demo site volume",
  };
}

/** A face-set target anchored to the demo wall (for coated intents). */
export function faceSetTarget(): OperationTarget {
  return {
    contractVersion: "1.0.0",
    selectorKind: "face-set",
    nodeRefs: ["node-wall-002"],
    geometryRefs: [{ kind: "polygon", ref: "geo-wall-faces-002", contractVersion: "1.0.0" }],
    units: { linear: "m", angular: "rad" },
    description: "the demo wall faces",
  };
}

/** The direct-manipulation provenance of the demo world. */
export function directProvenance(
  authoredBy = "user-demo-engineer",
  authoredAt = "2026-09-16T09:00:00.000Z",
) {
  return {
    origin: "direct-manipulation" as const,
    authoredBy,
    authoredAt,
    evidenceIds: [],
    derivationNote: "operator dimensioned the operation in the interactive 3D view",
  };
}

/** The agent provenance of the demo world (the exact command). */
export function agentProvenance(commandText: string) {
  return {
    origin: "agent" as const,
    authoredBy: "agent-demo-assistant",
    authoredAt: "2026-09-16T09:05:00.000Z",
    evidenceIds: [],
    commandText,
  };
}

/** Builds a contract-valid intent through the ONE constructor surface. */
export function intent(input: {
  intentId: string;
  operationType: string;
  parameters: { name: string; value: number | string | boolean; unit?: string }[];
  target: OperationTarget;
  provenance: ReturnType<typeof directProvenance> | ReturnType<typeof agentProvenance>;
  dependsOn?: { operationRef: string; dependencyKind: "completion-before" | "state-precondition" }[];
  proposedTo?: { solutionId: string; versionNumber: number };
}) {
  return createOperationIntent({
    intentId: input.intentId,
    operationType: input.operationType,
    domain: REFERENCE_BUILDING_DOMAIN,
    parameters: input.parameters,
    target: input.target,
    provenance: input.provenance,
    ...(input.dependsOn === undefined
      ? {}
      : { dependsOn: input.dependsOn.map((d) => ({ ...d, contractVersion: "1.0.0" })) }),
    ...(input.proposedTo === undefined ? {} : { proposedTo: input.proposedTo }),
  });
}

/** Deep structural clone (for input-mutation snapshot checks). */
export function deepClone<T>(value: T): T {
  return structuredClone(value);
}

/** A hostile resolver that RECORDS every call (the sabotage test seam). */
export class RecordingResolver {
  readonly calls: { ref: string }[] = [];
  readonly resolveSurfaceArea = (target: OperationTarget) => {
    for (const ref of target.geometryRefs) {
      this.calls.push({ ref: ref.ref });
    }
    const table = engineFixture<Record<string, { value: number; unit: string }>>(
      "baseline-geometry.json",
    );
    for (const ref of target.geometryRefs) {
      if (table[ref.ref] !== undefined) {
        return table[ref.ref];
      }
    }
    return null;
  };
}
