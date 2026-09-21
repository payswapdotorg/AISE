# PROD-023 Tool Trace — The Port Interface and the Attribution Guarantee

**Evidence module:** `backend/api/src/reasoning/solution/tools.ts`
(+ `tools.test.ts` tool-trace and sabotage suites)

## The port interface (the ONLY effect surface of the agent path)

```ts
interface SolutionToolPort {
  readonly descriptor: SolutionToolDescriptor;   // toolId, engineKind, engineVersion — honest identity
  call(command: SolutionToolCommand): Promise<SolutionToolResponse>;
}

type SolutionToolCommand =
  | { kind: "validate";              attribution; solutionId; versionNumber }
  | { kind: "apply";                 attribution; intent: EngineeringOperationIntent; solutionId; versionNumber }
  | { kind: "inspect";               attribution; solutionId; versionNumber }
  | { kind: "navigate";              attribution; solutionId; versionNumber;
      target: { kind: "goto-step" | "list-steps" | "current-state"; stateIndex? } }
  | { kind: "explain";               attribution; solutionId; versionNumber; operationIndex }
  | { kind: "boq-step-lookup";       attribution; solutionId; versionNumber; operationIndex };
```

These are exactly the deterministic tool calls the work order names:
**validate**, **step (apply)**, **inspect**, and the
navigation/explanation/BOQ-step lookup commands. The responses carry their
AUTHORITY LABELS and are echoed verbatim, never re-authored:

```ts
type SolutionToolResponse =
  | { kind: "validation-report";   authority: "solution-engine";       snapshot: SolutionValidationSnapshot }
  | { kind: "apply-accepted";      authority: "solution-engine";       operationId; resultingStateId; effects }
  | { kind: "inspection-report";   authority: "solution-engine";       operations; stateCount }
  | { kind: "navigation-report";   authority: "solution-graph";        target; stateIndex; appliedOperationIds }
  | { kind: "explanation-report";  authority: "solution-engine";       operationId; operationType; parameters; effects }
  | { kind: "boq-trace-report";    authority: "solution-boq-service";  operationIndex; lines }
  | { kind: "tool-refusal";        authority: "solution-tool";         reason };
```

The agent never generates geometry, never writes raw state and never claims
validation success: the loop's `executeDecision` calls ONLY this port and
returns the response untouched.

## The attribution + exact-normalized-command guarantee

Every `SolutionToolCommand` carries a full `CommandAttribution`:

```ts
interface CommandAttribution {
  rawUtterance: string;          // the raw natural-language utterance, verbatim
  normalizedCommand: string;     // canonical JSON of the EXACT typed command executed
                                 //   (apply: encodeEngineeringOperationIntent(intent);
                                 //    tool commands: canonical JSON minus the attribution)
  normalizedCommandText: string; // the canonical normalized command text
                                 //   (carried verbatim in provenance.commandText)
  compilerPath: "deterministic" | "provider-enriched";
  agentId: string;               // provenance.authoredBy of the compiled intent
  userId?: string;               // the principal the agent acted for
  sessionId: string;
  compiledAt: string;            // injected-clock instant (provenance.authoredAt)
}
```

Proven by tests:

- an apply call's `attribution.normalizedCommand` decodes back to the exact
  intent object that was dispatched (intentId, parameters,
  provenance.commandText all recoverable from EVERY tool call);
- read-only tool commands carry their own normalized command text
  ("Show step 3.", "Validate the solution.", …);
- every command kind reaches the port through the same typed call surface,
  each with a non-empty normalized command;
- the intent handed to the port by the loop is byte-equal to the compiled
  intent (never re-authored or paraphrased);
- the intent's provenance records agent attribution (`origin: "agent"`,
  `authoredBy`, `commandText`) plus a derivation note stating the compiler
  path and that application goes through the deterministic tool port only.

## The sabotage-style proof (no direct geometry writes)

`tools.test.ts` plants write-traps everywhere the loop could possibly
touch — a deep-frozen session, a deep-frozen pending proposal, and a
Proxy "world" object (`geometry`, `realityGraph`, `proposedStates`) that
records any property write — then runs the full four-turn cycle
(clarify → user answers → proposed operation → confirm → execute) and
asserts:

1. the ONLY calls received went through the typed port (exactly one apply
   call, zero before confirmation);
2. no trap fired (the world object untouched; frozen inputs unmutated);
3. the dispatched intent equals the compiled one byte-for-byte.

Additionally, source-level guarantees are tested: the module contains no
network primitives (`fetch(`, `node:http`, `WebSocket`, …) and never
imports the solution-engine path it must not own
(`backend/api/src/solution/**` / `@aise/solution-engine` do not exist at
this base and are not referenced). Executing a non-dispatchable decision
("ask", "propose") is a typed `TurnExecutionError` — never a silent effect.

## The TEST DOUBLE (clearly labeled — not the engine)

`createInMemorySolutionToolDouble({clock, solutionId, versionNumber,
baselineRealityVersionId})` is a deterministic, offline, clearly-labeled
IN-MEMORY TEST DOUBLE:

- it records every call (`calls`) and every applied intent
  (`appliedIntents`) — the trace the guarantees are tested against;
- its `validate` response builds a REAL contract
  `SolutionValidationSnapshot` (deterministic snapshot id via
  `deriveValidationSnapshotId`, worst-of outcome) whose engine-owned checks
  honestly report `unknown` — the double never claims validation authority;
- its `apply` response derives the REAL contract operation identity
  (`deriveEngineeringOperationId`) and proposed-state identity
  (`deriveProposedStateId`) with quantity-impact effects computed by the
  parameter-arithmetic estimator;
- its BOQ rows and explanations are deterministic placeholders over the
  applied operations; unknown steps refuse honestly (`tool-refusal`).

## Where the production engine binding will be wired

The production binding — the deterministic solution engine (PROD-022,
`packages/solution-engine` + `backend/api/src/solution/**`) and the BOQ
derivation/tracing services (PROD-025) — is wired by the Tech Lead at
composition time (PROD-024/026 era) by implementing `SolutionToolPort`
over the engine's apply/validate/inspect services and the BOQ trace
services, and by mounting `createSolutionAgentRoutes({compiler, logger})`
in `server.ts`. Nothing in this module anticipates those paths: the port
interface, the typed command/response model and the attribution record are
the complete contract the engine binding must satisfy. The capability
negotiation the engine performs at apply-time uses the PROD-021 contract's
`negotiateOperationCapability` (the compiler's required-parameter table
mirrors the contract's `REFERENCE_BUILDING_OPERATION_PROFILE` advisory
data; the authoritative negotiation remains engine-side).
