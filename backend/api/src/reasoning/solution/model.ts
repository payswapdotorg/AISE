/**
 * PROD-023 — Agent engineering-operation compiler: the typed MODEL.
 *
 * The natural-language command surface of the interactive engineering
 * solution workflow (ACR-005; docs/productization-work-orders.md §PROD-023):
 * a user utterance plus caller-assembled session context compiles into a
 * typed `CompiledCommand` whose `operation-intent` member is a contract
 * `EngineeringOperationIntent` built ONLY through the PROD-021 single
 * constructor surface `createOperationIntent` (origin `"agent"`).
 *
 * AUTHORITY DISCIPLINE (the loud parts first — the reasoning module's
 * convention):
 *
 *  - THE COMPILER IS NOT AN ENGINEERING AUTHORITY. It translates, clarifies
 *    and proposes. It never declares reality, readiness, validation
 *    success, engineering approval or cost authority; it never writes raw
 *    geometry; it never bypasses the solution engine. Requests that would
 *    claim authority or bypass determinism compile to `unsafe-refusal`
 *    with a typed reason — NO intent object is produced.
 *  - MISSING ENGINEERING FACTS ARE QUESTIONS, NEVER INVENTIONS. A missing
 *    dimension, material, location, sequencing reference or constraint
 *    compiles to `clarification-needed` carrying a targeted question that
 *    names the exact missing slot (ACR-005: "Missing dimensions,
 *    materials, locations, sequencing or evidence must result in questions
 *    or explicit blocked states rather than invented facts").
 *  - THE ONLY EXECUTION SURFACE IS THE TOOL PORT (tools.ts). The compiler
 *    and the interaction loop emit typed commands; deterministic
 *    validation/geometry/quantity outcomes belong to the server solution
 *    engine (PROD-022) behind `SolutionToolPort`. The production binding
 *    is wired by the Tech Lead at composition time (PROD-024/026 era).
 *  - DETERMINISM: no wall clock (the instant is injected), no randomness,
 *    no I/O in the compiler core. The same utterance + the same session
 *    context + the same clock ⇒ byte-identical compilation. The optional
 *    `NlUnderstandingPort` seam (below) records WHICH path produced an
 *    interpretation; its deterministic default never enriches, so every
 *    acceptance criterion passes offline.
 *
 * The PROD-021 contract is imported FROZEN (`@aise/solution-contract`):
 * intents are constructed via `createOperationIntent`, semantic
 * equivalence is proven with the contract's own identity derivations
 * (`deriveEngineeringOperationId`), and nothing here redefines contract
 * vocabulary.
 */

import type {
  EngineeringOperationIntent,
  IntentProposalContext,
  OperationTarget,
  TypedOperationParameter,
} from "@aise/solution-contract";
import type { SolutionToolCommand } from "./tools";

/* ------------------------------------------------------------------ */
/* Frozen registries (as const + Object.freeze — house style)           */
/* ------------------------------------------------------------------ */

/**
 * The frozen clarification-slot-kind vocabulary — the five missing-input
 * families of the PROD-023 work order: dimensions, materials, locations,
 * sequencing and constraints. Every clarification question names its slot
 * kind and the exact slot name.
 */
export const CLARIFICATION_SLOT_KINDS = Object.freeze([
  "dimension",
  "material",
  "location",
  "sequencing",
  "constraint",
] as const satisfies readonly string[]);
export type ClarificationSlotKind = (typeof CLARIFICATION_SLOT_KINDS)[number];

/**
 * The frozen unsafe-refusal reason taxonomy (PROD-023 refusal evidence):
 * five AUTHORITY-CLAIM codes (validation, approval, reality, readiness,
 * cost — the agent may claim none of them) and two DETERMINISM-BYPASS
 * codes (raw geometry writes and solution-engine bypasses). Every refusal
 * names its reason; no refusal ever carries an intent.
 */
export const UNSAFE_REFUSAL_REASON_CODES = Object.freeze([
  "validation-authority-claim",
  "approval-authority-claim",
  "reality-authority-claim",
  "readiness-authority-claim",
  "cost-authority-claim",
  "raw-geometry-write",
  "engine-bypass",
] as const satisfies readonly string[]);
export type UnsafeRefusalReasonCode = (typeof UNSAFE_REFUSAL_REASON_CODES)[number];

/**
 * The frozen compiler-path vocabulary — WHICH path produced an
 * interpretation. `"deterministic"` is the offline grammar; the optional
 * `NlUnderstandingPort` seam (an LLM provider of the reasoning module's
 * provider stack, wired later) can enrich slot assignment, recorded
 * honestly as `"provider-enriched"`.
 */
export const COMPILER_PATHS = Object.freeze(["deterministic", "provider-enriched"] as const);
export type CompilerPath = (typeof COMPILER_PATHS)[number];

/**
 * The frozen tool-command vocabulary — the read-only/agentic commands the
 * work order names (navigation, explanation, inspection, BOQ-step lookup)
 * plus `validate`, which the agent issues through the SAME port. These are
 * NOT engineering operations; they compile directly to `SolutionToolCommand`
 * calls (tools.ts) and never produce operation intents.
 */
export const AGENT_TOOL_COMMAND_KINDS = Object.freeze([
  "validate",
  "inspect",
  "navigate",
  "explain",
  "boq-step-lookup",
] as const satisfies readonly string[]);
export type AgentToolCommandKind = (typeof AGENT_TOOL_COMMAND_KINDS)[number];

/**
 * Typed compiler errors (thrown, never stringly) — caller/wiring bugs, not
 * compilation outcomes: an empty utterance, a malformed session context or
 * a malformed understanding-port descriptor. Compilation OUTCOMES (unsafe
 * refusals, unsupported, ambiguity, clarification) are first-class values,
 * never throws.
 */
export const SOLUTION_COMPILER_ERROR_CODES = Object.freeze([
  "invalid_utterance",
  "invalid_session",
  "invalid_understanding_descriptor",
] as const satisfies readonly string[]);
export type SolutionCompilerErrorCode = (typeof SOLUTION_COMPILER_ERROR_CODES)[number];

/** Typed rejection carrying a stable code (mirrors ReasoningGatewayError). */
export class SolutionCompilerError extends Error {
  readonly code: SolutionCompilerErrorCode;
  readonly detail: string;

  constructor(code: SolutionCompilerErrorCode, detail: string) {
    super(`${code}: ${detail}`);
    this.name = "SolutionCompilerError";
    this.code = code;
    this.detail = detail;
  }
}

/* ------------------------------------------------------------------ */
/* Session context (caller-assembled, exactly like GroundedContext)     */
/* ------------------------------------------------------------------ */

/**
 * A named spatial focus the CALLER asserts (e.g. the current interactive
 * selection): where an operation may anchor, with the stable read-only
 * references the contract's `OperationTarget` accepts and any parameters
 * the caller already knows for that place (a wall's length, a face set's
 * area). The compiler NEVER fetches these — anchoring data is the caller's
 * to assemble, exactly like the reasoning module's `GroundedContext`.
 */
export interface SessionFocus {
  /** Stable focus id (e.g. "wall", "wall-faces", "pit-area"). */
  readonly focusId: string;
  /** Human-readable place description (presentation; carried verbatim). */
  readonly label: string;
  /** Phrases in an utterance that anchor to this focus (longest match wins). */
  readonly aliases: readonly string[];
  /** The contract selector kind of the anchoring target. */
  readonly selectorKind: OperationTarget["selectorKind"];
  /** Read-only Reality-Graph node references. */
  readonly nodeRefs: readonly string[];
  /** Read-only deterministic geometry references. */
  readonly geometryRefs: OperationTarget["geometryRefs"];
  /** Parameters the caller already knows for this place (wall length…). */
  readonly knownParameters?: readonly TypedOperationParameter[];
}

/**
 * A recent operation of the session (caller-projected summary) — the base
 * for delta commands ("make it deeper by 0.5 m"), material/layer changes
 * ("switch to gypsum plaster") and sequencing references ("after the
 * excavation").
 */
export interface RecentOperationSummary {
  /** Stable operation id (referenced by sequencing dependencies). */
  readonly operationId: string;
  readonly operationType: string;
  readonly parameters: readonly TypedOperationParameter[];
}

/**
 * THE session context: everything the compiler may look at. Assembled by
 * the CALLER (the transport/session owner); the compiler performs no I/O
 * and never mutates it. `proposedTo` mirrors the contract's
 * `IntentProposalContext` — absent while an intent floats unattached.
 */
export interface AgentSessionContext {
  readonly sessionId: string;
  /** The agent identity stamped as `provenance.authoredBy` for agent intents. */
  readonly agentId: string;
  /** The user on whose behalf the agent acts (attribution; optional). */
  readonly userId?: string;
  /** The solution/version the compiled intent proposes into, when attached. */
  readonly proposedTo?: IntentProposalContext;
  /** Named spatial foci available for anchoring. */
  readonly foci?: readonly SessionFocus[];
  /** Which focus anchors utterances that name no place (caller-declared). */
  readonly defaultFocusId?: string;
  /** Recent operations of this session (deltas, changes, sequencing). */
  readonly recentOperations?: readonly RecentOperationSummary[];
}

/* ------------------------------------------------------------------ */
/* Clarification questions                                              */
/* ------------------------------------------------------------------ */

/**
 * One targeted clarification question: names the exact missing slot (kind +
 * name) and, where inferable, the offered choices (e.g. the material
 * vocabulary of the operation type). Never a guess, never a default.
 */
export interface ClarificationQuestion {
  readonly slotKind: ClarificationSlotKind;
  /** The exact slot name (e.g. "depth", "material", "target location"). */
  readonly slot: string;
  /** The targeted question naming the slot. */
  readonly question: string;
  /** Offered choices where inferable (materials, selector kinds…). */
  readonly offeredChoices?: readonly string[];
}

/* ------------------------------------------------------------------ */
/* Ambiguity readings                                                   */
/* ------------------------------------------------------------------ */

/**
 * One reading of an ambiguous utterance: what the request would mean under
 * that reading. Ambiguous outcomes list ≥2 readings and produce NO intent —
 * the user must discriminate, never the compiler.
 */
export interface AmbiguityReading {
  /** Short rendering of the reading (e.g. "excavation with depth 2 m"). */
  readonly description: string;
  /** The operation type the reading would compile to, when determined. */
  readonly operationType?: string;
  /** The slot assignment the reading differs on (dimension/material…). */
  readonly differingSlot?: string;
}

/* ------------------------------------------------------------------ */
/* Attribution + normalized command                                     */
/* ------------------------------------------------------------------ */

/**
 * The attribution record of every executed command: the RAW utterance, the
 * EXACT normalized command (the typed intent — or tool command — actually
 * executed, serialized canonically), the canonical normalized command TEXT
 * (carried verbatim in the intent's provenance.commandText), the compiler
 * path that produced the interpretation, and agent/user attribution per
 * the contract's provenance shapes. Recoverable from every tool call.
 */
export interface CommandAttribution {
  /** The raw natural-language utterance, verbatim. */
  readonly rawUtterance: string;
  /** Canonical JSON serialization of the exact typed command executed. */
  readonly normalizedCommand: string;
  /** The canonical normalized command text (provenance.commandText). */
  readonly normalizedCommandText: string;
  /** Which path produced the interpretation. */
  readonly compilerPath: CompilerPath;
  /** Agent attribution (provenance.authoredBy of the compiled intent). */
  readonly agentId: string;
  /** User attribution (the principal the agent acted for; optional). */
  readonly userId?: string;
  readonly sessionId: string;
  /** Injected-clock instant of the compilation (provenance.authoredAt). */
  readonly compiledAt: string;
}

/* ------------------------------------------------------------------ */
/* The CompiledCommand union                                            */
/* ------------------------------------------------------------------ */

/** A fully-resolved operation intent compiled from the utterance. */
export interface OperationIntentCompiledCommand {
  readonly kind: "operation-intent";
  readonly intent: EngineeringOperationIntent;
  readonly attribution: CommandAttribution;
}

/** Missing dimensions/materials/locations/sequencing/constraints. */
export interface ClarificationNeededCompiledCommand {
  readonly kind: "clarification-needed";
  /** Every missing slot, each with its targeted question (≥1). */
  readonly questions: readonly [ClarificationQuestion, ...ClarificationQuestion[]];
  /** What was resolved so far, for the loop to merge answers against. */
  readonly partialOperationType?: string;
  readonly attribution: CommandAttribution;
}

/** Outside the building operation vocabulary — explicit, never a guess. */
export interface UnsupportedCompiledCommand {
  readonly kind: "unsupported";
  /** The vertical the request belongs to, when inferable (e.g. civil-works). */
  readonly vertical?: string;
  /** Honest reason naming what is outside and what IS supported. */
  readonly reason: string;
  readonly attribution: CommandAttribution;
}

/** Multiple readings that cannot be discriminated — listed, never guessed. */
export interface AmbiguousCompiledCommand {
  readonly kind: "ambiguous";
  readonly readings: readonly [AmbiguityReading, ...AmbiguityReading[]];
  readonly attribution: CommandAttribution;
}

/** The request would bypass determinism or claim authority — refused. */
export interface UnsafeRefusalCompiledCommand {
  readonly kind: "unsafe-refusal";
  readonly reasonCode: UnsafeRefusalReasonCode;
  /** Deterministic refusal reason naming the refused authority/bypass. */
  readonly reason: string;
  readonly attribution: CommandAttribution;
}

/**
 * A read-only/agentic tool command (navigation, explanation, inspection,
 * BOQ-step lookup, validate) — the work-order command family that is NOT an
 * operation authoring request. Compiles directly to a typed
 * `SolutionToolCommand` (tools.ts); never produces an operation intent.
 */
export interface ToolCommandCompiledCommand {
  readonly kind: "tool-command";
  readonly toolCommandKind: AgentToolCommandKind;
  /** The typed tool command ready for the port (with full attribution). */
  readonly command: SolutionToolCommand;
  readonly attribution: CommandAttribution;
}

/**
 * THE typed outcome of compiling one user utterance (plus session context).
 * The five operation-authoring outcomes of the work order
 * (operation-intent / clarification-needed / unsupported / ambiguous /
 * unsafe-refusal) plus the read-only `tool-command` member that carries the
 * navigation/explanation/inspection/BOQ-step-lookup commands the work-order
 * scope mandates. Every member carries full attribution.
 */
export type CompiledCommand =
  | OperationIntentCompiledCommand
  | ClarificationNeededCompiledCommand
  | UnsupportedCompiledCommand
  | AmbiguousCompiledCommand
  | UnsafeRefusalCompiledCommand
  | ToolCommandCompiledCommand;

/** Narrow a compiled command to its operation-intent member. */
export function isOperationIntentCommand(
  command: CompiledCommand,
): command is OperationIntentCompiledCommand {
  return command.kind === "operation-intent";
}

/* ------------------------------------------------------------------ */
/* The NLU enrichment seam (deterministic default, provider later)      */
/* ------------------------------------------------------------------ */

/** Honest identity of an understanding port (metadata, never authority). */
export interface NlUnderstandingDescriptor {
  readonly understandingId: string;
  readonly kind: "deterministic-grammar" | "llm-adapter";
}

/** One bare measurement the deterministic grammar could not assign. */
export interface UnassignedMeasurement {
  /** The extracted numeric value in its ORIGINAL unit (verbatim). */
  readonly value: number;
  /** The original unit token (e.g. "mm", "cm", "m"). */
  readonly unit: string;
}

/** The enrichment request: assign bare measurements to missing slots. */
export interface NlSlotResolutionRequest {
  readonly utterance: string;
  readonly operationType: string;
  readonly unassignedMeasurements: readonly UnassignedMeasurement[];
  /** Missing dimension slot names the assignments may fill. */
  readonly eligibleSlots: readonly string[];
}

/** One proposed slot assignment (value MUST come from the utterance). */
export interface NlSlotAssignment {
  readonly slot: string;
  readonly value: number;
  readonly unit: string;
}

/**
 * The seam where an LLM provider (the reasoning module's provider stack)
 * could later enrich parsing: resolving which missing dimension slot a
 * bare measurement ("excavate a pit 2 m") belongs to. The port may ONLY
 * propose slot assignments for measurements ALREADY EXTRACTED from the
 * utterance — never new values; the compiler validates every assignment
 * against the extracted candidates and the eligible slots (a port that
 * invents values is deterministically ignored, tested). The DETERMINISTIC
 * default implementation never assigns anything, so the whole acceptance
 * corpus passes with the offline path alone.
 */
export interface NlUnderstandingPort {
  readonly descriptor: NlUnderstandingDescriptor;
  resolveSlotAssignments(
    request: NlSlotResolutionRequest,
  ): Promise<readonly NlSlotAssignment[]>;
}

/* ------------------------------------------------------------------ */
/* The compiler port                                                    */
/* ------------------------------------------------------------------ */

/** Construction options of the compiler (injected clock, optional NLU). */
export interface SolutionCommandCompilerOptions {
  /** UTC instant supplier — REQUIRED (the compiler owns no clock). */
  readonly clock: () => string;
  /**
   * The NLU enrichment seam. Defaults to the deterministic no-op
   * understanding port (offline, no enrichment).
   */
  readonly understanding?: NlUnderstandingPort;
}

/** One compilation request: the utterance plus its session context. */
export interface CompileAgentCommandInput {
  readonly utterance: string;
  readonly session: AgentSessionContext;
}

/** The compiler port (compiler.ts constructs it). */
export interface SolutionCommandCompiler {
  compile(input: CompileAgentCommandInput): Promise<CompiledCommand>;
}

/* ------------------------------------------------------------------ */
/* Operation proposals (the pre-execution review surface)               */
/* ------------------------------------------------------------------ */

/** A quantity estimated from parameters alone (never authoritative). */
export interface EstimatedQuantity {
  readonly label: string;
  readonly dimension: "length" | "area" | "volume" | "count";
  readonly value: number;
  readonly unit: string;
  /** Honest basis: computed from parameters (+ known focus values) only. */
  readonly basis: string;
}

/**
 * The proposed operation shown to the user BEFORE execution whenever
 * ambiguity or material consequences exist (every typed operation): the
 * typed intent rendered for review, its affected target, the quantities
 * computable from parameters alone, and the irreversible/review flags.
 */
export interface OperationProposal {
  readonly intent: EngineeringOperationIntent;
  readonly attribution: CommandAttribution;
  /** The canonical normalized command text of the intent. */
  readonly renderedCommand: string;
  /** The affected target (read-only references + description). */
  readonly target: {
    readonly description: string;
    readonly selectorKind: OperationTarget["selectorKind"];
    readonly nodeRefs: readonly string[];
    readonly geometryRefs: OperationTarget["geometryRefs"];
  };
  /** Quantities computable from parameters alone (engine owns the rest). */
  readonly estimatedQuantities: readonly EstimatedQuantity[];
  /** Irreversible-in-reality steps are flagged (e.g. demolition-removal). */
  readonly irreversible: boolean;
  /** Honest review requirements surfaced before execution, when declared. */
  readonly reviewRequirements: readonly string[];
}

/* ------------------------------------------------------------------ */
/* Session context validation                                           */
/* ------------------------------------------------------------------ */

/**
 * Structural validation of the caller-assembled session context (wiring
 * bugs throw typed errors — mirroring the gateway's validateQuery). Checks
 * ids, focus shapes and the default-focus reference.
 */
export function validateAgentSessionContext(session: AgentSessionContext): void {
  if (session.sessionId.trim().length === 0) {
    throw new SolutionCompilerError("invalid_session", "sessionId must be a non-empty string");
  }
  if (session.agentId.trim().length === 0) {
    throw new SolutionCompilerError("invalid_session", "agentId must be a non-empty string");
  }
  const foci = session.foci ?? [];
  const focusIds = new Set<string>();
  for (const focus of foci) {
    if (focus.focusId.trim().length === 0) {
      throw new SolutionCompilerError("invalid_session", "every focus must carry a focusId");
    }
    if (focusIds.has(focus.focusId)) {
      throw new SolutionCompilerError(
        "invalid_session",
        `focus id '${focus.focusId}' is declared more than once`,
      );
    }
    focusIds.add(focus.focusId);
    if (focus.nodeRefs.length === 0 && focus.geometryRefs.length === 0) {
      throw new SolutionCompilerError(
        "invalid_session",
        `focus '${focus.focusId}' must anchor to reality (≥1 nodeRef or geometryRef)`,
      );
    }
  }
  if (
    session.defaultFocusId !== undefined &&
    !focusIds.has(session.defaultFocusId)
  ) {
    throw new SolutionCompilerError(
      "invalid_session",
      `defaultFocusId '${session.defaultFocusId}' names no declared focus`,
    );
  }
}

/** The advisory Phase 1 building domain used by compiled intents. */
export type { SolutionDomainDescriptor } from "@aise/solution-contract";
/** The solution/version an intent proposes into (contract type re-export). */
export type { IntentProposalContext } from "@aise/solution-contract";
