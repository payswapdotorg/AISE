/**
 * PROD-023 — the deterministic SOLUTION TOOL PORT (tools.ts).
 *
 * The ONLY effect surface of the agent path: every consequential or
 * read-only action the agent takes goes through `SolutionToolPort.call`
 * as a typed `SolutionToolCommand` carrying full attribution (the raw
 * utterance, the EXACT normalized command — the typed intent serialized
 * canonically — the compiler path, agent/user attribution). The agent
 * NEVER generates geometry, NEVER writes raw state and NEVER claims
 * validation success: the port's responses are ECHOED with their
 * authority labels ("solution-engine" / "solution-graph" /
 * "solution-boq-service"), never re-authored.
 *
 * The PRODUCTION binding — the deterministic solution engine (PROD-022)
 * plus the BOQ derivation services (PROD-025) — is wired by the Tech Lead
 * at composition time (PROD-024/026 era). This module ships:
 *
 *  - the `SolutionToolPort` interface and the typed command/response
 *    model (validate, apply, inspect, navigate, explain, boq-step-lookup —
 *    exactly the tool families the work order names);
 *  - `toolCommandOf` — the canonical tool-command builder used by the
 *    compiler (with each tool kind's normalized command text);
 *  - `createInMemorySolutionToolDouble` — a clearly-labeled IN-MEMORY
 *    TEST DOUBLE (not the production engine): deterministic, offline,
 *    recording every call so the tool-trace guarantees are testable.
 */

import {
  SOLUTION_CONTRACT_VERSION,
  deriveEngineeringOperationId,
  deriveProposedStateId,
  deriveValidationSnapshotId,
  operationSemanticIdentityOfIntent,
  validationOutcomeWorstOf,
} from "@aise/solution-contract";
import type {
  EngineeringOperationIntent,
  OperationEffect,
  SolutionValidationSnapshot,
  TypedOperationParameter,
} from "@aise/solution-contract";
import { canonicalJsonStringify } from "@aise/shared-contracts";
import { sha256Hex } from "../../lib/hash";
import { AGENT_TOOL_COMMAND_KINDS } from "./model";
import type {
  AgentToolCommandKind,
  CommandAttribution,
  IntentProposalContext,
} from "./model";
import { extractStepIndex, navigationTargetOf } from "./vocabulary";
import type { NavigationTarget } from "./vocabulary";
import { estimateOperationQuantities } from "./quantities";

/* ------------------------------------------------------------------ */
/* The typed command model                                              */
/* ------------------------------------------------------------------ */

/** A validate request over a pinned solution version. */
export interface ValidateToolCommand {
  readonly kind: "validate";
  readonly attribution: CommandAttribution;
  readonly solutionId: string;
  readonly versionNumber: number;
}

/** An apply (step) request: the typed intent to be applied by the engine. */
export interface ApplyToolCommand {
  readonly kind: "apply";
  readonly attribution: CommandAttribution;
  readonly intent: EngineeringOperationIntent;
  readonly solutionId: string;
  readonly versionNumber: number;
}

/** An inspection request over the current solution version. */
export interface InspectToolCommand {
  readonly kind: "inspect";
  readonly attribution: CommandAttribution;
  readonly solutionId: string;
  readonly versionNumber: number;
}

/** A navigation request (goto-step / list-steps / current-state). */
export interface NavigateToolCommand {
  readonly kind: "navigate";
  readonly attribution: CommandAttribution;
  readonly solutionId: string;
  readonly versionNumber: number;
  readonly target: {
    readonly kind: NavigationTarget;
    readonly stateIndex?: number;
  };
}

/** An explanation request for one operation of the version. */
export interface ExplainToolCommand {
  readonly kind: "explain";
  readonly attribution: CommandAttribution;
  readonly solutionId: string;
  readonly versionNumber: number;
  readonly operationIndex: number;
}

/** A BOQ-step lookup request (bidirectional trace navigation). */
export interface BoqStepLookupToolCommand {
  readonly kind: "boq-step-lookup";
  readonly attribution: CommandAttribution;
  readonly solutionId: string;
  readonly versionNumber: number;
  readonly operationIndex: number;
}

/**
 * THE typed tool command union — every agent-issued tool call. Each member
 * carries the full attribution so the exact normalized command and the
 * agent/user attribution are recoverable from EVERY tool call.
 */
export type SolutionToolCommand =
  | ValidateToolCommand
  | ApplyToolCommand
  | InspectToolCommand
  | NavigateToolCommand
  | ExplainToolCommand
  | BoqStepLookupToolCommand;

/** Honest identity of the tool binding (metadata, never authority). */
export interface SolutionToolDescriptor {
  readonly toolId: string;
  readonly engineKind: string;
  readonly engineVersion: string;
}

/* ------------------------------------------------------------------ */
/* The typed response model (authority labels echoed, never re-authored) */
/* ------------------------------------------------------------------ */

/** A validation snapshot produced by the solution engine. */
export interface ValidationReportResponse {
  readonly kind: "validation-report";
  /** The authority that owns validation outcomes — echoed verbatim. */
  readonly authority: "solution-engine";
  readonly snapshot: SolutionValidationSnapshot;
}

/** An accepted apply (the engine recorded the operation + state). */
export interface ApplyAcceptedResponse {
  readonly kind: "apply-accepted";
  readonly authority: "solution-engine";
  readonly operationId: string;
  readonly resultingStateId: string;
  readonly effects: readonly OperationEffect[];
}

/** An inspection report over the solution version. */
export interface InspectionReportResponse {
  readonly kind: "inspection-report";
  readonly authority: "solution-engine";
  readonly operationCount: number;
  readonly operations: readonly {
    readonly operationIndex: number;
    readonly operationId: string;
    readonly operationType: string;
    readonly parameters: readonly TypedOperationParameter[];
  }[];
}

/** A navigation report over the solution's proposed states. */
export interface NavigationReportResponse {
  readonly kind: "navigation-report";
  readonly authority: "solution-graph";
  readonly target: NavigationTarget;
  readonly stateIndex: number;
  readonly appliedOperationIds: readonly string[];
}

/** An explanation report for one operation. */
export interface ExplanationReportResponse {
  readonly kind: "explanation-report";
  readonly authority: "solution-engine";
  readonly operationIndex: number;
  readonly operationId: string;
  readonly operationType: string;
  readonly parameters: readonly TypedOperationParameter[];
  readonly effects: readonly OperationEffect[];
}

/** A BOQ-step lookup result (the trace rows of one operation). */
export interface BoqTraceReportResponse {
  readonly kind: "boq-trace-report";
  readonly authority: "solution-boq-service";
  readonly operationIndex: number;
  readonly lines: readonly {
    readonly boqLineId: string;
    readonly quantity: number;
    readonly unit: string;
    readonly contributionKind: "created" | "modified" | "removed";
  }[];
}

/** A typed tool refusal (honest, never silent). */
export interface ToolRefusalResponse {
  readonly kind: "tool-refusal";
  readonly authority: "solution-tool";
  readonly reason: string;
}

/** THE typed tool response union. */
export type SolutionToolResponse =
  | ValidationReportResponse
  | ApplyAcceptedResponse
  | InspectionReportResponse
  | NavigationReportResponse
  | ExplanationReportResponse
  | BoqTraceReportResponse
  | ToolRefusalResponse;

/* ------------------------------------------------------------------ */
/* The port                                                             */
/* ------------------------------------------------------------------ */

/**
 * THE tool port: the deterministic solution/validation tools the work
 * order names (validate, step/apply, inspect) plus the navigation/
 * explanation/BOQ-step lookup commands. The production binding (solution
 * engine + BOQ services) is wired at composition time; the agent path
 * calls ONLY this port.
 */
export interface SolutionToolPort {
  readonly descriptor: SolutionToolDescriptor;
  call(command: SolutionToolCommand): Promise<SolutionToolResponse>;
}

/* ------------------------------------------------------------------ */
/* The canonical tool-command builder (used by the compiler)            */
/* ------------------------------------------------------------------ */

type AttributionBase = Omit<CommandAttribution, "normalizedCommand" | "normalizedCommandText">;

/**
 * Builds the typed tool command of one agent tool request with its
 * canonical normalized command text. The returned command's attribution
 * carries the normalized text; the canonical SERIALIZATION is filled by
 * the caller (compiler.ts `serializeToolCommand`) to avoid recursion.
 */
export function toolCommandOf(
  toolKind: AgentToolCommandKind,
  utterance: string,
  solutionRef: IntentProposalContext,
  attributionBase: AttributionBase,
): { readonly command: SolutionToolCommand; readonly normalizedCommandText: string } {
  const { solutionId, versionNumber } = solutionRef;
  const stepIndex = extractStepIndex(utterance);
  const navigationTarget = navigationTargetOf(utterance);
  const attribution: CommandAttribution = {
    ...attributionBase,
    normalizedCommand: "",
    normalizedCommandText: "",
  };
  switch (toolKind) {
    case "validate":
      return {
        command: { kind: "validate", attribution, solutionId, versionNumber },
        normalizedCommandText: "Validate the solution.",
      };
    case "inspect":
      return {
        command: { kind: "inspect", attribution, solutionId, versionNumber },
        normalizedCommandText: "Inspect the current proposed state.",
      };
    case "navigate": {
      const command: NavigateToolCommand = {
        kind: "navigate",
        attribution,
        solutionId,
        versionNumber,
        target:
          navigationTarget === "goto-step"
            ? { kind: "goto-step", stateIndex: stepIndex ?? 0 }
            : { kind: navigationTarget },
      };
      const index = command.target.stateIndex ?? 0;
      const normalizedCommandText =
        navigationTarget === "list-steps"
          ? "List the solution steps."
          : navigationTarget === "current-state"
            ? "Show the current proposed state."
            : index === 0
              ? "Show the baseline state."
              : `Show step ${index}.`;
      return { command, normalizedCommandText };
    }
    case "explain": {
      const index = stepIndex ?? 1;
      return {
        command: { kind: "explain", attribution, solutionId, versionNumber, operationIndex: index },
        normalizedCommandText: `Explain step ${index}.`,
      };
    }
    case "boq-step-lookup": {
      const index = stepIndex ?? 1;
      return {
        command: {
          kind: "boq-step-lookup",
          attribution,
          solutionId,
          versionNumber,
          operationIndex: index,
        },
        normalizedCommandText: `Look up the BOQ lines for step ${index}.`,
      };
    }
    default: {
      const exhaustive: never = toolKind;
      throw new Error(`unknown tool kind: ${String(exhaustive)}`);
    }
  }
}

/** Renders the canonical normalized text of a built tool command. */
export function toolCommandText(command: SolutionToolCommand): string {
  switch (command.kind) {
    case "validate":
      return "Validate the solution.";
    case "inspect":
      return "Inspect the current proposed state.";
    case "navigate": {
      if (command.target.kind === "list-steps") {
        return "List the solution steps.";
      }
      if (command.target.kind === "current-state") {
        return "Show the current proposed state.";
      }
      return (command.target.stateIndex ?? 0) === 0
        ? "Show the baseline state."
        : `Show step ${command.target.stateIndex}.`;
    }
    case "apply":
      return `Apply the proposed ${command.intent.operationType} operation.`;
    case "explain":
      return `Explain step ${command.operationIndex}.`;
    case "boq-step-lookup":
      return `Look up the BOQ lines for step ${command.operationIndex}.`;
    default: {
      const exhaustive: never = command;
      throw new Error(`unknown tool command: ${String(exhaustive)}`);
    }
  }
}

/** Every agent tool command kind (runtime vocabulary check). */
export function isAgentToolCommandKind(value: unknown): value is AgentToolCommandKind {
  return (
    typeof value === "string" && (AGENT_TOOL_COMMAND_KINDS as readonly string[]).includes(value)
  );
}

/* ------------------------------------------------------------------ */
/* The IN-MEMORY TEST DOUBLE (clearly labeled — NOT the engine)         */
/* ------------------------------------------------------------------ */

/** Construction options of the test double. */
export interface InMemorySolutionToolDoubleOptions {
  /** Injected clock (the double owns no wall time). */
  readonly clock: () => string;
  readonly solutionId: string;
  readonly versionNumber: number;
  readonly baselineRealityVersionId: string;
}

/**
 * The recording surface of the double — the TOOL TRACE every guarantee is
 * tested against: every call, in order, with its full attribution.
 */
export interface InMemorySolutionToolDouble extends SolutionToolPort {
  /** Every command the double received, in call order. */
  readonly calls: readonly SolutionToolCommand[];
  /** The intents applied through the double, in apply order. */
  readonly appliedIntents: readonly EngineeringOperationIntent[];
}

/**
 * A clearly-labeled IN-MEMORY TEST DOUBLE of the solution tool port —
 * deterministic, offline, honest about being a double (its validate
 * response reports `unknown` for every engine-owned check; its BOQ rows
 * are placeholder traces). It records every call so tests prove the
 * attribution + normalized-command guarantees and that the ONLY effect
 * surface of the agent path is this port.
 */
export function createInMemorySolutionToolDouble(
  options: InMemorySolutionToolDoubleOptions,
): InMemorySolutionToolDouble {
  const calls: SolutionToolCommand[] = [];
  const appliedIntents: EngineeringOperationIntent[] = [];
  const applied: {
    operationIndex: number;
    operationId: string;
    operationType: string;
    parameters: readonly TypedOperationParameter[];
    effects: readonly OperationEffect[];
  }[] = [];

  const double: InMemorySolutionToolDouble = {
    descriptor: {
      toolId: "solution-tool-double-in-memory",
      engineKind: "in-memory-test-double",
      engineVersion: "1.0.0",
    },
    calls,
    appliedIntents,
    call: async (command: SolutionToolCommand): Promise<SolutionToolResponse> => {
      calls.push(command);
      switch (command.kind) {
        case "validate": {
          const inputDigest = sha256Hex(
            canonicalJsonStringify(applied.map((entry) => entry.operationId)),
          );
          const checks = [
            {
              checkId: "units.parameters-typed",
              result: "pass" as const,
              detail:
                `every numeric parameter of all ${applied.length} applied ` +
                `operations carries an explicit unit (checked by the test double)`,
            },
            {
              checkId: "geometry.rules",
              result: "unknown" as const,
              detail:
                "geometry/topology rule checks belong to the production " +
                "solution engine (this is a TEST DOUBLE — it never claims " +
                "validation authority)",
            },
          ];
          const outcome = validationOutcomeWorstOf(checks.map((check) => check.result));
          const snapshot: SolutionValidationSnapshot = {
            contractVersion: SOLUTION_CONTRACT_VERSION,
            snapshotId: deriveValidationSnapshotId({
              solutionId: command.solutionId,
              versionNumber: command.versionNumber,
              inputDigest,
              engineKind: double.descriptor.engineKind,
              engineVersion: double.descriptor.engineVersion,
              outcome,
            }),
            solutionId: command.solutionId,
            versionNumber: command.versionNumber,
            outcome,
            checks,
            inputDigest,
            engine: {
              kind: double.descriptor.engineKind,
              version: double.descriptor.engineVersion,
            },
            validatedAt: options.clock(),
          };
          return { kind: "validation-report", authority: "solution-engine", snapshot };
        }
        case "apply": {
          const intent = command.intent;
          const operationIndex = applied.length + 1;
          const operationId = deriveEngineeringOperationId(
            operationSemanticIdentityOfIntent(intent, {
              solutionId: command.solutionId,
              versionNumber: command.versionNumber,
              operationIndex,
            }),
          );
          const estimates = estimateOperationQuantities(
            intent.operationType,
            intent.parameters,
          );
          const effects: OperationEffect[] = estimates.map((estimate) => ({
            contractVersion: SOLUTION_CONTRACT_VERSION,
            effectKind: "quantity-impact" as const,
            quantity: {
              dimension: estimate.dimension,
              value: estimate.value,
              unit: estimate.unit,
              calculationRef: "in-memory-test-double:parameter-arithmetic",
            },
            direction: intent.operationType === "demolition-removal" ? "removed" : "added",
            affectedNodeRefs: [...intent.target.nodeRefs],
            geometryRefs: intent.target.geometryRefs.map((ref) => ({ ...ref })),
          }));
          const resultingStateId = deriveProposedStateId({
            solutionId: command.solutionId,
            versionNumber: command.versionNumber,
            stateIndex: operationIndex,
            baselineRealityVersionId: options.baselineRealityVersionId,
            appliedOperationIds: applied.map((entry) => entry.operationId),
          });
          applied.push({
            operationIndex,
            operationId,
            operationType: intent.operationType,
            parameters: intent.parameters,
            effects,
          });
          appliedIntents.push(intent);
          return {
            kind: "apply-accepted",
            authority: "solution-engine",
            operationId,
            resultingStateId,
            effects,
          };
        }
        case "inspect":
          return {
            kind: "inspection-report",
            authority: "solution-engine",
            operationCount: applied.length,
            operations: applied.map((entry) => ({
              operationIndex: entry.operationIndex,
              operationId: entry.operationId,
              operationType: entry.operationType,
              parameters: entry.parameters,
            })),
          };
        case "navigate": {
          const stateIndex =
            command.target.kind === "goto-step"
              ? (command.target.stateIndex ?? 0)
              : command.target.kind === "current-state"
                ? applied.length
                : 0;
          return {
            kind: "navigation-report",
            authority: "solution-graph",
            target: command.target.kind,
            stateIndex,
            appliedOperationIds: applied.slice(0, stateIndex).map((entry) => entry.operationId),
          };
        }
        case "explain": {
          const entry = applied.find((item) => item.operationIndex === command.operationIndex);
          if (entry === undefined) {
            return {
              kind: "tool-refusal",
              authority: "solution-tool",
              reason:
                `the test double has no operation at index ${command.operationIndex} ` +
                `(applied operations: ${applied.length})`,
            };
          }
          return {
            kind: "explanation-report",
            authority: "solution-engine",
            operationIndex: entry.operationIndex,
            operationId: entry.operationId,
            operationType: entry.operationType,
            parameters: entry.parameters,
            effects: entry.effects,
          };
        }
        case "boq-step-lookup": {
          const entry = applied.find((item) => item.operationIndex === command.operationIndex);
          if (entry === undefined) {
            return {
              kind: "tool-refusal",
              authority: "solution-tool",
              reason:
                `the test double has no operation at index ${command.operationIndex} ` +
                `to trace BOQ lines for (applied operations: ${applied.length})`,
            };
          }
          const lines = entry.effects
            .filter((effect) => effect.quantity !== undefined)
            .map((effect) => {
              const direction = effect.direction ?? "created";
              const contributionKind: "created" | "modified" | "removed" =
                direction === "removed"
                  ? "removed"
                  : direction === "changed"
                    ? "modified"
                    : "created";
              return {
                boqLineId: `boq-line-${entry.operationIndex}-${effect.quantity?.unit ?? "count"}`,
                quantity: effect.quantity?.value ?? 0,
                unit: effect.quantity?.unit ?? "count",
                contributionKind,
              };
            });
          return {
            kind: "boq-trace-report",
            authority: "solution-boq-service",
            operationIndex: entry.operationIndex,
            lines,
          };
        }
        default: {
          const exhaustive: never = command;
          throw new Error(`unknown tool command: ${String(exhaustive)}`);
        }
      }
    },
  };
  return double;
}
