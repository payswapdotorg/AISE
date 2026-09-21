/**
 * PROD-025 backend test kit — deterministic test-world builders for the
 * solution-BOQ endpoint tests (mirrors the PROD-022 solution router-test
 * discipline: the contract corpus's intent fixtures + the engine's replay
 * and validation, loaded and run directly — no live server boot).
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  REFERENCE_BUILDING_DOMAIN,
  REFERENCE_BUILDING_OPERATION_PROFILE,
  decodeEngineeringOperationIntent,
  type EngineeringOperationIntent,
  type OperationCapabilityProfile,
  type SolutionValidationSnapshot,
  type SolutionVersion,
} from "@aise/solution-contract";
import {
  TableBaselineGeometryResolver,
  replaySolution,
  validateSolutionVersion,
} from "@aise/solution-engine";
import { deriveSolutionBoq } from "@aise/solution-boq";
import type { SolutionBoq } from "@aise/solution-boq";

const CONTRACT_FIXTURES = join(
  import.meta.dir,
  "..",
  "..",
  "..",
  "..",
  "packages",
  "solution-contract",
  "fixtures",
);
const ENGINE_FIXTURES = join(
  import.meta.dir,
  "..",
  "..",
  "..",
  "..",
  "packages",
  "solution-engine",
  "fixtures",
);

function intentPayload(name: string): Record<string, unknown> {
  return JSON.parse(
    readFileSync(
      join(CONTRACT_FIXTURES, "operation", `EngineeringOperationIntent.${name}.json`),
      "utf8",
    ),
  ) as Record<string, unknown>;
}

function decodedIntent(name: string): EngineeringOperationIntent {
  return decodeEngineeringOperationIntent(intentPayload(name));
}

export const ROUTE_WORLD = {
  solutionId: "solution-demo-001",
  baselineRealityVersionId: "rgv-demo-0007",
  createdAt: "2026-09-16T08:00:00.000Z",
  validatedAt: "2026-09-16T11:00:00.000Z",
} as const;

function baselineGeometry(): TableBaselineGeometryResolver {
  return new TableBaselineGeometryResolver(
    JSON.parse(readFileSync(join(ENGINE_FIXTURES, "baseline-geometry.json"), "utf8")) as Record<
      string,
      { value: number; unit: string }
    >,
  );
}

const WALL_UPGRADE_INTENTS = [
  "valid-demolition-removal",
  "valid-block-wall-placement",
  "valid-plaster-application",
] as const;

/** Replays the canonical wall-upgrade version through the ENGINE. */
export function wallUpgradeVersion(): SolutionVersion {
  const replay = replaySolution({
    solutionId: ROUTE_WORLD.solutionId,
    projectId: "proj-demo-001",
    title: "Ground-floor wall upgrade solution",
    problemStatement: "route test problem statement",
    domain: REFERENCE_BUILDING_DOMAIN,
    baselineRealityVersionId: ROUTE_WORLD.baselineRealityVersionId,
    intents: WALL_UPGRADE_INTENTS.map((name) => decodedIntent(name)),
    capabilityProfile: REFERENCE_BUILDING_OPERATION_PROFILE,
    baselineGeometry: baselineGeometry(),
    materializeClock: (stateIndex: number) =>
      new Date(Date.UTC(2026, 8, 16, 10, stateIndex, 0, 0)).toISOString(),
    createdAt: ROUTE_WORLD.createdAt,
  });
  if (replay.outcome !== "complete") {
    throw new Error("wall-upgrade replay failed");
  }
  return replay.version;
}

/** Validates a version through the ENGINE's deterministic Validate. */
export function validate(
  version: SolutionVersion,
  profile: OperationCapabilityProfile = REFERENCE_BUILDING_OPERATION_PROFILE,
): SolutionValidationSnapshot {
  return validateSolutionVersion({
    version,
    capabilityProfile: profile,
    validatedAt: ROUTE_WORLD.validatedAt,
  });
}

/** The canonical generate-request body over the wall-upgrade world. */
export function generateBody(): { version: SolutionVersion; snapshot: SolutionValidationSnapshot } {
  const version = wallUpgradeVersion();
  return { version, snapshot: validate(version) };
}

/** A generated BOQ over the wall-upgrade world (for navigation requests). */
export function generatedBoq(): SolutionBoq {
  const { version, snapshot } = generateBody();
  return deriveSolutionBoq({ version, snapshot });
}
