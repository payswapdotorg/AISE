/**
 * GBIM-003 host-side agent trace recorder: compiles the canonical
 * equivalence utterance through the REAL deterministic PROD-023 compiler
 * (backend/api/src/reasoning/solution/compiler.ts in the AISE clone) and
 * records the compiled intent + its derived operation identity into
 * AISE/docs/productization-evidence/GBIM-003/results/agent-trace.json
 * (consumed by the clone's check runner: check `direct-nl-equivalence`).
 *
 * Run from /home/z/my-project: bun src/scripts/record-agent-trace.ts
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { createSolutionCommandCompiler } from "@aise/solution-compiler";
import {
  createOperationIntent,
  deriveEngineeringOperationId,
  operationSemanticIdentityOfIntent,
  REFERENCE_BUILDING_DOMAIN,
} from "@aise/solution-contract";
import { SPIKE_SOLUTION_ID, fixtureGeometryRef, fixtureNodeRef, currentWorkspace } from "@spike/server/workspace";

const UTTERANCE =
  "Build a new block wall 8 m long, 3 m high and 200 mm thick from concrete blocks in the wall.";

const compiler = createSolutionCommandCompiler({ clock: () => "2026-09-25T00:00:00.000Z" });
const workspace = currentWorkspace();

const command = await compiler.compile({
  utterance: UTTERANCE,
  session: {
    sessionId: "session-gbim003-sandbox",
    agentId: "agent-gbim003-sandbox",
    userId: "operator-gbim003",
    proposedTo: { solutionId: SPIKE_SOLUTION_ID, versionNumber: workspace.version.versionNumber },
    foci: [
      {
        focusId: "wall",
        label: "the wall",
        aliases: ["wall", "the wall", "wall-001", "perimeter wall"],
        selectorKind: "element" as const,
        nodeRefs: [fixtureNodeRef("wall-001")],
        geometryRefs: [fixtureGeometryRef("wall-001")],
        knownParameters: [],
      },
    ],
    defaultFocusId: "wall",
    recentOperations: workspace.version.operations.map((operation) => ({
      operationId: operation.operationId,
      operationType: operation.operationType,
      parameters: operation.parameters,
    })),
  },
});

if (command.kind !== "operation-intent") {
  console.error(`compiler produced '${command.kind}' — expected operation-intent`);
  process.exit(1);
}

const operationIndex = workspace.version.operations.length;
const agentOperationId = deriveEngineeringOperationId(
  operationSemanticIdentityOfIntent(command.intent, {
    solutionId: SPIKE_SOLUTION_ID,
    versionNumber: workspace.version.versionNumber,
    operationIndex,
  }),
);

// The direct-manipulation side: the SAME semantics authored through the
// constructor (origin direct-manipulation) — parameters in the engine
// profile's required order (length, height, thickness, material).
const directIntent = createOperationIntent({
  intentId: "intent-equivalence-direct",
  operationType: "block-wall-placement",
  domain: REFERENCE_BUILDING_DOMAIN,
  parameters: [
    { name: "length", value: 8, unit: "m" },
    { name: "height", value: 3, unit: "m" },
    { name: "thickness", value: 0.2, unit: "m" },
    { name: "material", value: "concrete-block" },
  ],
  target: {
    contractVersion: "1.0.0",
    selectorKind: "element",
    nodeRefs: [fixtureNodeRef("wall-001")],
    geometryRefs: [fixtureGeometryRef("wall-001")],
    units: { linear: "m", angular: "rad" },
    description: "the wall-001 perimeter wall of room-001",
  },
  provenance: {
    origin: "direct-manipulation",
    authoredBy: "gbim003-spike:operator",
    authoredAt: "2026-09-25T00:00:00.000Z",
    evidenceIds: [],
    derivationNote: "equivalence trace: direct side",
    interactionDetail: "operator dimensioned the wall in the plan view",
  },
});
const directOperationId = deriveEngineeringOperationId(
  operationSemanticIdentityOfIntent(directIntent, {
    solutionId: SPIKE_SOLUTION_ID,
    versionNumber: workspace.version.versionNumber,
    operationIndex,
  }),
);

const outDir = join(process.cwd(), "AISE", "docs", "productization-evidence", "GBIM-003", "results");
mkdirSync(outDir, { recursive: true });
const trace = {
  generatedAt: "2026-09-25T00:00:00.000Z",
  utterance: UTTERANCE,
  compiledKind: command.kind,
  normalizedCommandText: command.attribution.normalizedCommandText,
  intent: command.intent,
  derivedOperationId: agentOperationId,
  directOperationId,
  identical: agentOperationId === directOperationId,
  compiledParameters: command.intent.parameters,
};
writeFileSync(join(outDir, "agent-trace.json"), `${JSON.stringify(trace, null, 2)}\n`);
console.log(`agent intent id:   ${agentOperationId}`);
console.log(`direct intent id:  ${directOperationId}`);
console.log(`identical: ${trace.identical}`);
console.log(`compiled params: ${JSON.stringify(command.intent.parameters)}`);
console.log(`wrote ${join(outDir, "agent-trace.json")}`);
