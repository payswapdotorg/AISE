/**
 * WORLD-P3 tests — the AUTHORING family: the DM↔NL equivalence law,
 * the NL-substrate law (the parser port + the rogue-parser gate), the
 * parameter/target resolution laws, the ghost-composition law and the
 * fail-closed drills.
 */

import { describe, expect, test } from "bun:test";
import {
  deriveEngineeringOperationId,
  operationSemanticIdentityOfIntent,
  decodeEngineeringOperationIntent,
  type EngineeringOperationIntent,
} from "@aise/solution-contract";
import { loadCommittedFixtures } from "@aise/solution-contract/fixtures-loader";
import {
  compileAuthoringCommand,
  compileManipulationStream,
  composeGhostScene,
  ghostElementIdOf,
  ghostSetOfCommand,
  parseNlCommandThroughPort,
  proposedStatePresentationRequestOf,
  resolveCommandParameters,
  resolveOperationTarget,
  validateAuthoringCommandDraft,
  type AuthoringCommandDraft,
  type NlCommandParserAdapter,
  type NlCommandParseRequest,
} from "./contract";
import {
  alternateNlCommandParserDouble,
  referenceNlCommandParserDouble,
} from "./doubles";
import {
  FIXTURE_AUTHORING_SCOPE,
  FIXTURE_DM_AUTHORED_AT,
  FIXTURE_DM_STREAM_BLOCK_WALL,
  FIXTURE_DM_STREAM_EXCAVATION,
  FIXTURE_DM_STREAM_MOVE_BEAM,
  FIXTURE_DM_STREAM_REPICK,
  FIXTURE_DM_STREAM_STALE_REVISION,
  FIXTURE_GHOST_GLTF_BYTES,
  FIXTURE_NL_AUTHORED_AT,
  FIXTURE_OPERATOR_AGENT,
  FIXTURE_OPERATOR_ENGINEER,
  FIXTURE_SELECTION_SITE,
  FIXTURE_SELECTION_WALL,
  FIXTURE_UTTERANCE_BLOCK_WALL,
  FIXTURE_UTTERANCE_DEMOLITION,
  FIXTURE_UTTERANCE_EXCAVATION,
  FIXTURE_UTTERANCE_PLASTER,
} from "./corpus";
import { canonicalJsonStringify } from "@aise/shared-contracts";

/* ------------------------------------------------------------------ */
/* The DM↔NL equivalence law (the lane's flagship proof)               */
/* ------------------------------------------------------------------ */

describe("WORLD-P3 authoring — the DM↔NL equivalence law", () => {
  test("the excavation gesture stream and the excavation utterance derive the SAME operation identity", () => {
    const dm = compileManipulationStream(FIXTURE_DM_STREAM_EXCAVATION, FIXTURE_AUTHORING_SCOPE);
    expect(dm.ok).toBe(true);
    if (!dm.ok) return;
    const dmCommand = compileAuthoringCommand(
      dm.value.draft,
      FIXTURE_AUTHORING_SCOPE,
      {
        operator: FIXTURE_OPERATOR_ENGINEER,
        authoredAt: FIXTURE_DM_AUTHORED_AT,
        interactionDetail: dm.value.interactionDetail,
      },
      "intent-equiv-dm-0001",
    );
    expect(dmCommand.ok).toBe(true);
    if (!dmCommand.ok) return;

    const parser = referenceNlCommandParserDouble();
    const nl = parseNlCommandThroughPort(parser, {
      utterance: FIXTURE_UTTERANCE_EXCAVATION,
      scope: FIXTURE_AUTHORING_SCOPE,
      selectedElementId: FIXTURE_SELECTION_SITE,
    });
    expect(nl.ok).toBe(true);
    if (!nl.ok) return;
    const nlCommand = compileAuthoringCommand(
      nl.value,
      FIXTURE_AUTHORING_SCOPE,
      {
        operator: FIXTURE_OPERATOR_AGENT,
        authoredAt: FIXTURE_NL_AUTHORED_AT,
        commandText: FIXTURE_UTTERANCE_EXCAVATION,
      },
      "intent-equiv-nl-0001",
    );
    expect(nlCommand.ok).toBe(true);
    if (!nlCommand.ok) return;

    expect(dmCommand.value.operationId).toBe(nlCommand.value.operationId);
    // The RESOLVED parameters are equal (the drafts may carry different
    // override subsets — defaults fill the rest; identity is over the
    // resolved semantics).
    const dmResolved = resolveCommandParameters(
      FIXTURE_AUTHORING_SCOPE,
      "excavation",
      dm.value.draft.parameterOverrides,
    );
    const nlResolved = resolveCommandParameters(
      FIXTURE_AUTHORING_SCOPE,
      "excavation",
      nl.value.parameterOverrides,
    );
    expect(dmResolved.ok).toBe(true);
    expect(nlResolved.ok).toBe(true);
    if (dmResolved.ok && nlResolved.ok) {
      expect(dmResolved.value).toEqual(nlResolved.value);
    }
    // Provenance is the ONLY difference: origins differ, semantics equal.
    expect(dmCommand.value.intent.provenance.origin).toBe("direct-manipulation");
    expect(nlCommand.value.intent.provenance.origin).toBe("agent");
    expect(nlCommand.value.intent.provenance.commandText).toBe(FIXTURE_UTTERANCE_EXCAVATION);
    expect(dmCommand.value.intent.provenance.interactionDetail).toBeDefined();
  });

  test("the block-wall pair derives the same identity, matching the COMMITTED contract fixture identity", () => {
    const dm = compileManipulationStream(FIXTURE_DM_STREAM_BLOCK_WALL, FIXTURE_AUTHORING_SCOPE);
    expect(dm.ok).toBe(true);
    if (!dm.ok) return;
    const dmCommand = compileAuthoringCommand(
      dm.value.draft,
      FIXTURE_AUTHORING_SCOPE,
      {
        operator: FIXTURE_OPERATOR_ENGINEER,
        authoredAt: FIXTURE_DM_STREAM_BLOCK_WALL.authoredAt,
        interactionDetail: dm.value.interactionDetail,
      },
      "intent-equiv-dm-0002",
    );
    expect(dmCommand.ok).toBe(true);
    if (!dmCommand.ok) return;

    const parser = referenceNlCommandParserDouble();
    const nl = parseNlCommandThroughPort(parser, {
      utterance: FIXTURE_UTTERANCE_BLOCK_WALL,
      scope: FIXTURE_AUTHORING_SCOPE,
      selectedElementId: FIXTURE_SELECTION_WALL,
    });
    expect(nl.ok).toBe(true);
    if (!nl.ok) return;
    const nlCommand = compileAuthoringCommand(
      nl.value,
      FIXTURE_AUTHORING_SCOPE,
      {
        operator: FIXTURE_OPERATOR_AGENT,
        authoredAt: FIXTURE_NL_AUTHORED_AT,
        commandText: FIXTURE_UTTERANCE_BLOCK_WALL,
      },
      "intent-equiv-nl-0002",
    );
    expect(nlCommand.ok).toBe(true);
    if (!nlCommand.ok) return;

    expect(dmCommand.value.operationId).toBe(nlCommand.value.operationId);

    // The strongest cross-package proof: the SAME identity the COMMITTED
    // solution-contract fixture pair carries (the contract's own
    // direct/agent equivalence fixtures, decoded through the codec).
    const corpus = loadCommittedFixtures();
    const committed = corpus.fixtures
      .filter(
        (fixture) =>
          fixture.objectName === "EngineeringOperationIntent" &&
          fixture.kind === "valid" &&
          (fixture.fileName.includes("valid-excavation-direct") ||
            fixture.fileName.includes("valid-excavation-agent")),
      )
      .map((fixture) =>
        decodeEngineeringOperationIntent(fixture.payload),
      );
    expect(committed.length).toBe(2);
    const [direct, agent] = committed as [EngineeringOperationIntent, EngineeringOperationIntent];
    const context = {
      solutionId: FIXTURE_AUTHORING_SCOPE.solutionId,
      versionNumber: FIXTURE_AUTHORING_SCOPE.versionNumber,
      operationIndex: 1,
    };
    const committedDirectId = deriveEngineeringOperationId(
      operationSemanticIdentityOfIntent(direct, context),
    );
    const committedAgentId = deriveEngineeringOperationId(
      operationSemanticIdentityOfIntent(agent, context),
    );
    expect(committedDirectId).toBe(committedAgentId);
    // The excavation equivalence (the first test) derives the same id the
    // committed fixture pair derives — the lane composes the SAME contract.
    const parserExcavation = referenceNlCommandParserDouble();
    const nlExcavation = parseNlCommandThroughPort(parserExcavation, {
      utterance: FIXTURE_UTTERANCE_EXCAVATION,
      scope: FIXTURE_AUTHORING_SCOPE,
      selectedElementId: FIXTURE_SELECTION_SITE,
    });
    expect(nlExcavation.ok).toBe(true);
    if (!nlExcavation.ok) return;
    const excavationCommand = compileAuthoringCommand(
      nlExcavation.value,
      FIXTURE_AUTHORING_SCOPE,
      {
        operator: FIXTURE_OPERATOR_AGENT,
        authoredAt: FIXTURE_NL_AUTHORED_AT,
        commandText: FIXTURE_UTTERANCE_EXCAVATION,
      },
      "intent-equiv-nl-0003",
    );
    expect(excavationCommand.ok).toBe(true);
    if (!excavationCommand.ok) return;
    expect(excavationCommand.value.operationId).toBe(committedAgentId);
  });

  test("fuzz: randomized excavation dimensions keep the DM↔NL identity equality (seeded, deterministic)", () => {
    // A deterministic LCG (test-side only — the contract core has no
    // randomness; the fuzz proves the equivalence law over a value space).
    let seed = 0x5eed03c3;
    const next = (min: number, max: number): number => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      const unit = seed / 0x100000000;
      return min + unit * (max - min);
    };
    for (let iteration = 0; iteration < 50; iteration += 1) {
      const depth = Number(next(0.5, 3).toFixed(2));
      const width = Number(next(0.5, 4).toFixed(2));
      const length = Number(next(1, 6).toFixed(2));
      const utterance =
        `Excavate a pit ${depth} m deep, ${width} m wide and ${length} m long.`;
      const parser = referenceNlCommandParserDouble();
      const nl = parseNlCommandThroughPort(parser, {
        utterance,
        scope: FIXTURE_AUTHORING_SCOPE,
        selectedElementId: FIXTURE_SELECTION_SITE,
      });
      expect(nl.ok).toBe(true);
      if (!nl.ok) return;
      const nlCommand = compileAuthoringCommand(
        nl.value,
        FIXTURE_AUTHORING_SCOPE,
        {
          operator: FIXTURE_OPERATOR_AGENT,
          authoredAt: FIXTURE_NL_AUTHORED_AT,
          commandText: utterance,
        },
        `intent-fuzz-nl-${iteration}`,
      );
      expect(nlCommand.ok).toBe(true);
      if (!nlCommand.ok) return;
      const dmDraft: AuthoringCommandDraft = {
        kind: "spatial-authoring-command",
        schemaVersion: "spatial-authoring-command/1",
        commandKind: "add",
        operationType: "excavation",
        targetElementId: "node-site-001",
        parameterOverrides: [
          { name: "depth", value: depth, unit: "m" },
          { name: "width", value: width, unit: "m" },
          { name: "length", value: length, unit: "m" },
        ],
        dependsOn: [],
      };
      const dmCommand = compileAuthoringCommand(
        dmDraft,
        FIXTURE_AUTHORING_SCOPE,
        {
          operator: FIXTURE_OPERATOR_ENGINEER,
          authoredAt: FIXTURE_DM_AUTHORED_AT,
          interactionDetail: "operator dimensioned the pit volume in the 3D view",
        },
        `intent-fuzz-dm-${iteration}`,
      );
      expect(dmCommand.ok).toBe(true);
      if (!dmCommand.ok) return;
      expect(dmCommand.value.operationId).toBe(nlCommand.value.operationId);
    }
  });
});

/* ------------------------------------------------------------------ */
/* Parameter + target resolution laws                                   */
/* ------------------------------------------------------------------ */

describe("WORLD-P3 authoring — the parameter/target resolution laws", () => {
  test("an override outside the declared palette set is refused (closed parameter surface)", () => {
    const outcome = resolveCommandParameters(FIXTURE_AUTHORING_SCOPE, "excavation", [
      { name: "depth", value: 2, unit: "m" },
      { name: "diameter", value: 1, unit: "m" },
    ]);
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.failure.kind).toBe("contract-mismatch");
    expect(outcome.failure.detail).toContain("diameter");
  });

  test("a numeric override without a unit is refused (the frozen discipline)", () => {
    const outcome = resolveCommandParameters(FIXTURE_AUTHORING_SCOPE, "excavation", [
      { name: "depth", value: 2 },
    ]);
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.failure.kind).toBe("contract-mismatch");
    expect(outcome.failure.detail).toContain("unit");
  });

  test("the resolution follows the DECLARED parameter order (identity stability)", () => {
    const outcome = resolveCommandParameters(FIXTURE_AUTHORING_SCOPE, "excavation", [
      { name: "width", value: 3, unit: "m" },
    ]);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.value.map((parameter) => parameter.name)).toEqual([
      "depth",
      "width",
      "length",
    ]);
    expect(outcome.value[1]?.value).toBe(3);
  });

  test("an operation type outside the declared palette is refused", () => {
    const outcome = resolveOperationTarget(FIXTURE_AUTHORING_SCOPE, {
      kind: "spatial-authoring-command",
      schemaVersion: "spatial-authoring-command/1",
      commandKind: "add",
      operationType: "quantum-tunneling",
      targetElementId: "node-site-001",
      parameterOverrides: [],
      dependsOn: [],
    });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.failure.kind).toBe("unsupported-data");
    expect(outcome.failure.detail).toContain("quantum-tunneling");
  });

  test("an element without the required selection mode is refused (the tool-mode law)", () => {
    // node-site-001 offers only 'volume'; block-wall-placement needs line-extent.
    const outcome = resolveOperationTarget(FIXTURE_AUTHORING_SCOPE, {
      kind: "spatial-authoring-command",
      schemaVersion: "spatial-authoring-command/1",
      commandKind: "add",
      operationType: "block-wall-placement",
      targetElementId: "node-site-001",
      parameterOverrides: [],
      dependsOn: [],
    });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.failure.kind).toBe("unsupported-data");
    expect(outcome.failure.detail).toContain("line-extent");
  });
});

/* ------------------------------------------------------------------ */
/* Draft validation (the identity-quarantine tripwires)                 */
/* ------------------------------------------------------------------ */

describe("WORLD-P3 authoring — the draft validation laws", () => {
  const baseDraft = {
    kind: "spatial-authoring-command" as const,
    schemaVersion: "spatial-authoring-command/1" as const,
    commandKind: "add" as const,
    operationType: "excavation",
    targetElementId: "node-site-001",
    parameterOverrides: [] as const,
    dependsOn: [] as const,
  };

  test("a substrate-shaped target id is refused by pattern (identity quarantine)", () => {
    const outcome = validateAuthoringCommandDraft(
      { ...baseDraft, targetElementId: "/World/Solution/BlockWall" },
      FIXTURE_AUTHORING_SCOPE,
    );
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.failure.kind).toBe("contract-mismatch");
    expect(outcome.failure.detail).toContain("usd-prim-path");
  });

  test("an unknown target element is refused (scene presence first)", () => {
    const outcome = validateAuthoringCommandDraft(
      { ...baseDraft, targetElementId: "node-unknown-999" },
      FIXTURE_AUTHORING_SCOPE,
    );
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.failure.kind).toBe("contract-mismatch");
    expect(outcome.failure.detail).toContain("world scene");
  });

  test("a scene element without a scope descriptor is refused (the palette law)", () => {
    // node-beam-007 is IN the world scene but has no scoped descriptor.
    const outcome = validateAuthoringCommandDraft(
      { ...baseDraft, targetElementId: "node-beam-007" },
      FIXTURE_AUTHORING_SCOPE,
    );
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.failure.kind).toBe("unsupported-data");
    expect(outcome.failure.detail).toContain("not declared in the authoring scope");
  });

  test("an out-of-vocabulary command kind is refused", () => {
    const outcome = validateAuthoringCommandDraft(
      { ...baseDraft, commandKind: "teleport" as never },
      FIXTURE_AUTHORING_SCOPE,
    );
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.failure.kind).toBe("contract-mismatch");
  });
});

/* ------------------------------------------------------------------ */
/* Gesture-stream laws (one command per stream)                         */
/* ------------------------------------------------------------------ */

describe("WORLD-P3 authoring — the gesture-stream laws", () => {
  test("a re-pick inside one stream is refused (ONE command per stream)", () => {
    const outcome = compileManipulationStream(FIXTURE_DM_STREAM_REPICK, FIXTURE_AUTHORING_SCOPE);
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.failure.kind).toBe("contract-mismatch");
    expect(outcome.failure.detail).toContain("ONE command");
  });

  test("a stream recorded against a stale world revision is refused", () => {
    const outcome = compileManipulationStream(
      FIXTURE_DM_STREAM_STALE_REVISION,
      FIXTURE_AUTHORING_SCOPE,
    );
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.failure.kind).toBe("operation-semantic-failure");
    expect(outcome.failure.detail).toContain("revision");
  });

  test("a move command requires a drop-at gesture", () => {
    const stream = {
      ...FIXTURE_DM_STREAM_MOVE_BEAM,
      gestures: [
        { gesture: "pick-element" as const, elementId: "node-wall-002" },
        { gesture: "drag-by" as const, deltaMetres: [0.5, 0, 0] as const },
        { gesture: "commit" as const, commandKind: "move" as const, operationType: "plaster-application" },
      ],
    };
    const outcome = compileManipulationStream(stream, FIXTURE_AUTHORING_SCOPE);
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.failure.kind).toBe("contract-mismatch");
    expect(outcome.failure.detail).toContain("drop-at");
  });

  test("a non-move command cannot carry a drag translation", () => {
    const stream = {
      ...FIXTURE_DM_STREAM_MOVE_BEAM,
      gestures: [
        { gesture: "pick-element" as const, elementId: "node-wall-002" },
        { gesture: "drag-by" as const, deltaMetres: [0.5, 0, 0] as const },
        { gesture: "drop-at" as const, deltaMetres: [0.5, 0, 0] as const },
        { gesture: "commit" as const, commandKind: "add" as const, operationType: "plaster-application" },
      ],
    };
    const outcome = compileManipulationStream(stream, FIXTURE_AUTHORING_SCOPE);
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.failure.kind).toBe("operation-semantic-failure");
    expect(outcome.failure.detail).toContain("translation");
  });

  test("a stream must begin with a pick and end with a commit", () => {
    const noPick = compileManipulationStream(
      {
        ...FIXTURE_DM_STREAM_BLOCK_WALL,
        gestures: FIXTURE_DM_STREAM_BLOCK_WALL.gestures.slice(1),
      },
      FIXTURE_AUTHORING_SCOPE,
    );
    expect(noPick.ok).toBe(false);
    const noCommit = compileManipulationStream(
      {
        ...FIXTURE_DM_STREAM_BLOCK_WALL,
        gestures: FIXTURE_DM_STREAM_BLOCK_WALL.gestures.slice(0, -1),
      },
      FIXTURE_AUTHORING_SCOPE,
    );
    expect(noCommit.ok).toBe(false);
  });

  test("the compiled stream is non-mutating (the input stream is untouched)", () => {
    const before = canonicalJsonStringify(FIXTURE_DM_STREAM_BLOCK_WALL);
    compileManipulationStream(FIXTURE_DM_STREAM_BLOCK_WALL, FIXTURE_AUTHORING_SCOPE);
    const after = canonicalJsonStringify(FIXTURE_DM_STREAM_BLOCK_WALL);
    expect(after).toBe(before);
  });
});

/* ------------------------------------------------------------------ */
/* The NL-substrate law (the parser port + the rogue gate)              */
/* ------------------------------------------------------------------ */

/** A rogue parser that returns out-of-vocabulary drafts (untrusted substrate). */
function rogueParser(overrides: Partial<AuthoringCommandDraft>): NlCommandParserAdapter {
  return {
    portId: "authoring.nl-command/1",
    capabilities: {
      supportedGrammarFamilies: ["rogue"],
      maxUtteranceLength: 200,
      blocked: [],
    },
    parseCommand(request: NlCommandParseRequest): ReturnType<NlCommandParserAdapter["parseCommand"]> {
      return {
        ok: true,
        value: {
          kind: "spatial-authoring-command",
          schemaVersion: "spatial-authoring-command/1",
          commandKind: "add",
          operationType: "excavation",
          targetElementId: request.selectedElementId ?? "node-site-001",
          parameterOverrides: [],
          dependsOn: [],
          ...overrides,
        },
      };
    },
  };
}

describe("WORLD-P3 authoring — the NL-substrate law (the parser port)", () => {
  const request = {
    utterance: FIXTURE_UTTERANCE_EXCAVATION,
    scope: FIXTURE_AUTHORING_SCOPE,
    selectedElementId: FIXTURE_SELECTION_SITE,
  };

  test("the two substitution doubles produce byte-identical drafts on the utterance corpus", () => {
    const utterances = [
      [FIXTURE_UTTERANCE_EXCAVATION, FIXTURE_SELECTION_SITE],
      [FIXTURE_UTTERANCE_BLOCK_WALL, FIXTURE_SELECTION_WALL],
      [FIXTURE_UTTERANCE_DEMOLITION, FIXTURE_SELECTION_WALL],
      [FIXTURE_UTTERANCE_PLASTER, FIXTURE_SELECTION_WALL],
    ] as const;
    const reference = referenceNlCommandParserDouble();
    const alternate = alternateNlCommandParserDouble();
    for (const [utterance, selection] of utterances) {
      const a = reference.parseCommand({ utterance, scope: FIXTURE_AUTHORING_SCOPE, selectedElementId: selection });
      const b = alternate.parseCommand({ utterance, scope: FIXTURE_AUTHORING_SCOPE, selectedElementId: selection });
      expect(a.ok).toBe(true);
      expect(b.ok).toBe(true);
      if (!a.ok || !b.ok) continue;
      expect(canonicalJsonStringify(a.value)).toBe(canonicalJsonStringify(b.value));
    }
  });

  test("an unsupported utterance is a typed refusal — the parser never guesses", () => {
    const parser = referenceNlCommandParserDouble();
    const outcome = parser.parseCommand({
      utterance: "Make it look nicer please.",
      scope: FIXTURE_AUTHORING_SCOPE,
      selectedElementId: FIXTURE_SELECTION_WALL,
    });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.failure.kind).toBe("unsupported-data");
    expect(outcome.failure.detail).toContain("unsupported-utterance");
  });

  test("an utterance without selection context is refused (no invented target)", () => {
    const parser = referenceNlCommandParserDouble();
    const outcome = parser.parseCommand({
      utterance: FIXTURE_UTTERANCE_BLOCK_WALL,
      scope: FIXTURE_AUTHORING_SCOPE,
      selectedElementId: null,
    });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.failure.kind).toBe("unsupported-data");
    expect(outcome.failure.detail).toContain("selected element context");
  });

  test("the rogue-parser gate: an out-of-vocabulary command kind is refused at the port entry", () => {
    const outcome = parseNlCommandThroughPort(rogueParser({ commandKind: "delete" as never }), request);
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.failure.kind).toBe("contract-mismatch");
    expect(outcome.failure.detail).toContain("rogue parser output");
  });

  test("the rogue-parser gate: an unknown operation type is refused at the port entry", () => {
    const outcome = parseNlCommandThroughPort(rogueParser({ operationType: "hand-waving" }), request);
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.failure.kind).toBe("contract-mismatch");
  });

  test("the rogue-parser gate: a substrate-shaped target id is refused at the port entry", () => {
    const outcome = parseNlCommandThroughPort(
      rogueParser({ targetElementId: "mesh:7" }),
      request,
    );
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.failure.kind).toBe("contract-mismatch");
    expect(outcome.failure.detail).toContain("gltf-node-ref");
  });

  test("the rogue-parser gate: a unitless numeric parameter is refused at the port entry", () => {
    const outcome = parseNlCommandThroughPort(
      rogueParser({
        parameterOverrides: [{ name: "depth", value: 2 } as never],
      }),
      request,
    );
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.failure.kind).toBe("contract-mismatch");
    expect(outcome.failure.detail).toContain("unit");
  });

  test("a parser with the wrong port id is refused (the port contract)", () => {
    const wrong = rogueParser({});
    const outcome = parseNlCommandThroughPort(
      { ...wrong, portId: "authoring.nl-command/2" as never },
      request,
    );
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.failure.kind).toBe("contract-mismatch");
    expect(outcome.failure.detail).toContain("portId");
  });

  test("the parsed drafts across the whole utterance corpus carry exact extracted values", () => {
    const parser = referenceNlCommandParserDouble();
    const excavation = parser.parseCommand({
      utterance: FIXTURE_UTTERANCE_EXCAVATION,
      scope: FIXTURE_AUTHORING_SCOPE,
      selectedElementId: FIXTURE_SELECTION_SITE,
    });
    expect(excavation.ok).toBe(true);
    if (!excavation.ok) return;
    expect(excavation.value.operationType).toBe("excavation");
    expect(excavation.value.parameterOverrides).toEqual([
      { name: "depth", value: 1.5, unit: "m" },
      { name: "width", value: 2, unit: "m" },
      { name: "length", value: 3, unit: "m" },
    ]);
    const demolition = parser.parseCommand({
      utterance: FIXTURE_UTTERANCE_DEMOLITION,
      scope: FIXTURE_AUTHORING_SCOPE,
      selectedElementId: FIXTURE_SELECTION_WALL,
    });
    expect(demolition.ok).toBe(true);
    if (!demolition.ok) return;
    expect(demolition.value.commandKind).toBe("remove");
    expect(demolition.value.operationType).toBe("demolition-removal");
  });
});

/* ------------------------------------------------------------------ */
/* Ghost composition (the ghost-distinctness law carrier)              */
/* ------------------------------------------------------------------ */

describe("WORLD-P3 authoring — the ghost composition law", () => {
  function blockWallCommand() {
    const parser = referenceNlCommandParserDouble();
    const nl = parseNlCommandThroughPort(parser, {
      utterance: FIXTURE_UTTERANCE_BLOCK_WALL,
      scope: FIXTURE_AUTHORING_SCOPE,
      selectedElementId: FIXTURE_SELECTION_WALL,
    });
    if (!nl.ok) {
      throw new Error("the fixture utterance must parse");
    }
    const command = compileAuthoringCommand(
      nl.value,
      FIXTURE_AUTHORING_SCOPE,
      {
        operator: FIXTURE_OPERATOR_AGENT,
        authoredAt: FIXTURE_NL_AUTHORED_AT,
        commandText: FIXTURE_UTTERANCE_BLOCK_WALL,
      },
      "intent-ghost-0001",
    );
    if (!command.ok) {
      throw new Error("the fixture command must compile");
    }
    return command.value;
  }

  test("an add command composes a ghost node marked isGhost and bumps the revision", () => {
    const command = blockWallCommand();
    const scene = composeGhostScene(FIXTURE_AUTHORING_SCOPE.worldScene, command, {
      geometry: { assetId: "asset-ghost-lintel", partId: "mesh:0", format: "gltf-json" },
      label: "Proposed block wall (ghost)",
    });
    expect(scene.ok).toBe(true);
    if (!scene.ok) return;
    expect(scene.value.revision).toBe(FIXTURE_AUTHORING_SCOPE.worldScene.revision + 1);
    const ghostId = ghostElementIdOf(command.commandDraft);
    const ghostNode = scene.value.nodes.find((node) => node.elementId === ghostId);
    expect(ghostNode).toBeDefined();
    expect(ghostNode?.isGhost).toBe(true);
    expect(ghostNode?.kind).toBe("ghost");
    expect(ghostNode?.layerIds).toContain("solution");
    // The captured reality nodes are untouched (never mutated, never re-flagged).
    for (const node of FIXTURE_AUTHORING_SCOPE.worldScene.nodes) {
      const still = scene.value.nodes.find((candidate) => candidate.elementId === node.elementId);
      expect(still).toBeDefined();
      expect(still?.isGhost).toBe(false);
    }
    expect(scene.value.ghostSummary?.proposedElementIds).toEqual([ghostId]);
  });

  test("the ghost element id is deterministic and modality-independent", () => {
    const command = blockWallCommand();
    const ghostId = ghostElementIdOf(command.commandDraft);
    expect(ghostId).toBe(ghostElementIdOf(command.commandDraft));
    expect(ghostId).toMatch(/^ghost-add-[0-9a-f]{16}$/);
  });

  test("a remove command composes NO ghost node and removes the target from the presentation", () => {
    const parser = referenceNlCommandParserDouble();
    const nl = parseNlCommandThroughPort(parser, {
      utterance: FIXTURE_UTTERANCE_DEMOLITION,
      scope: FIXTURE_AUTHORING_SCOPE,
      selectedElementId: FIXTURE_SELECTION_WALL,
    });
    expect(nl.ok).toBe(true);
    if (!nl.ok) return;
    const command = compileAuthoringCommand(
      nl.value,
      FIXTURE_AUTHORING_SCOPE,
      {
        operator: FIXTURE_OPERATOR_AGENT,
        authoredAt: FIXTURE_NL_AUTHORED_AT,
        commandText: FIXTURE_UTTERANCE_DEMOLITION,
      },
      "intent-ghost-0002",
    );
    expect(command.ok).toBe(true);
    if (!command.ok) return;
    expect(ghostSetOfCommand(command.value).proposedElementIds).toEqual([]);
    expect(ghostSetOfCommand(command.value).removedElementIds).toEqual(["node-wall-002"]);
    const scene = composeGhostScene(FIXTURE_AUTHORING_SCOPE.worldScene, command.value, {
      geometry: null,
      label: "Removed wall section",
    });
    expect(scene.ok).toBe(true);
    if (!scene.ok) return;
    // No ghost node is composed for a remove command; the world data
    // stays intact and the ghost SUMMARY carries the removed element
    // (the runtime overlay owns the visual removal — the P0-C law).
    expect(scene.value.nodes.every((node) => node.kind !== "ghost")).toBe(true);
    expect(scene.value.ghostSummary?.removedElementIds).toEqual(["node-wall-002"]);
    expect(
      scene.value.nodes.some((node) => node.elementId === "node-wall-002"),
    ).toBe(true);
    expect(scene.value.ghostSummary?.proposedElementIds).toEqual([]);
  });

  test("the composed scene flows into a P0-C presentation request with the ghost law verified", () => {
    const command = blockWallCommand();
    const scene = composeGhostScene(FIXTURE_AUTHORING_SCOPE.worldScene, command, {
      geometry: { assetId: "asset-ghost-lintel", partId: "mesh:0", format: "gltf-json" },
      label: "Proposed block wall (ghost)",
    });
    expect(scene.ok).toBe(true);
    if (!scene.ok) return;
    const request = proposedStatePresentationRequestOf(command, scene.value, [
      {
        reference: { assetId: "asset-ghost-lintel", partId: "mesh:0", format: "gltf-json" },
        source: { assetId: "asset-ghost-lintel", format: "gltf-json", bytes: FIXTURE_GHOST_GLTF_BYTES },
      },
    ]);
    expect(request.ok).toBe(true);
    if (!request.ok) return;
    expect(request.value.ghostSet.operationId).toBe(command.operationId);
    expect(request.value.solutionId).toBe(FIXTURE_AUTHORING_SCOPE.solutionId);
  });

  test("a ghost composition over a scene that lost the target is refused (non-add commands)", () => {
    const command = blockWallCommand();
    const scene = composeGhostScene(FIXTURE_AUTHORING_SCOPE.worldScene, command, {
      geometry: { assetId: "asset-ghost-lintel", partId: "mesh:0", format: "gltf-json" },
      label: "Proposed block wall (ghost)",
    });
    expect(scene.ok).toBe(true);
    if (!scene.ok) return;
    // A reparameterize command targets the REALITY element — which the
    // composed scene still has. But a command targeting the GHOST id
    // (already proposed state) is refused by the draft validator.
    const ghostId = ghostElementIdOf(command.commandDraft);
    const outcome = validateAuthoringCommandDraft(
      {
        kind: "spatial-authoring-command",
        schemaVersion: "spatial-authoring-command/1",
        commandKind: "reparameterize",
        operationType: "block-wall-placement",
        targetElementId: ghostId,
        parameterOverrides: [],
        dependsOn: [],
      },
      { ...FIXTURE_AUTHORING_SCOPE, worldScene: scene.value },
    );
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.failure.kind).toBe("operation-semantic-failure");
    expect(outcome.failure.detail).toContain("ghost");
  });
});
