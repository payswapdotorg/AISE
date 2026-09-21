/**
 * PROD-023 — the DETERMINISTIC compiler core (compiler.ts).
 *
 * Natural language → typed `EngineeringOperationIntent` compilation for
 * the interactive engineering solution workflow. `compile({utterance,
 * session})` returns a typed `CompiledCommand` (model.ts):
 *
 *   1. UNSAFE SCAN (raw utterance): authority claims (validation success,
 *      approval, observed reality, readiness, cost) and determinism
 *      bypasses (raw geometry writes, engine bypasses) compile to
 *      `unsafe-refusal` with a taxonomy reason — NO intent is produced.
 *   2. TOOL SCAN: navigation / explanation / inspection / BOQ-step lookup /
 *      validate requests compile directly to typed `SolutionToolCommand`s.
 *   3. CLAUSE STRIP: sequencing clauses ("after the excavation") and
 *      replacement clauses ("instead of 30 mm") leave the main text and
 *      become dependency references / removed old values.
 *   4. TYPE DETECTION: strong construction verbs first (multiple strong
 *      matches = `ambiguous` — a compound request, never first-match-silent),
 *      then noun-only hints, else `unsupported` with an honest vertical
 *      hint where inferable.
 *   5. PARAMETER EXTRACTION: measurements with dimension-word adjacency
 *      (postfix "1.5 m deep", prefix "depth of 1.5 m", delta "deeper by
 *      0.5 m" / "increase the depth by 50 cm" / verb-dimension "deepen the
 *      pit by 500 mm"), unit canonicalization (mm/cm/m mixes → the
 *      parameter's canonical unit — the semantic-equivalence enabler),
 *      material vocabulary normalization, coat/layer counts.
 *   6. SLOT COMPLETION: utterance values > recent-operation seeds (change
 *      requests) > focus-known parameter seeds (caller-known reality
 *      facts). Missing dimensions/materials/locations/sequencing/
 *      constraints compile to `clarification-needed` with targeted
 *      questions — NEVER invented values. Bare measurements that could
 *      fill ≥2 missing slots compile to `ambiguous` (readings listed),
 *      optionally resolved through the `NlUnderstandingPort` seam.
 *   7. INTENT CONSTRUCTION: ONLY via the contract's `createOperationIntent`
 *      (origin "agent", provenance carrying the exact normalized command
 *      text, the compiler path, agent attribution) — never a hand-rolled
 *      intent object.
 *
 * DETERMINISM: no I/O, no randomness, injected clock. The optional
 * `NlUnderstandingPort` (LLM seam) may only reassign measurements ALREADY
 * extracted from the utterance; its assignments are validated against the
 * extracted candidates (an inventing port is deterministically ignored)
 * and the interpretation is recorded honestly as `provider-enriched`. The
 * DEFAULT port never enriches — every acceptance criterion passes offline.
 */

import {
  REFERENCE_BUILDING_DOMAIN,
  REFERENCE_BUILDING_OPERATION_PROFILE,
  createOperationIntent,
  encodeEngineeringOperationIntent,
} from "@aise/solution-contract";
import type {
  EngineeringOperationIntent,
  OperationDependency,
  OperationTarget,
  TypedOperationParameter,
} from "@aise/solution-contract";
import { canonicalJsonStringify } from "@aise/shared-contracts";
import { sha256Hex } from "../../lib/hash";
import { SolutionCompilerError, validateAgentSessionContext, CLARIFICATION_SLOT_KINDS, AGENT_TOOL_COMMAND_KINDS } from "./model";
import type {
  AgentSessionContext,
  AgentToolCommandKind,
  AmbiguityReading,
  AmbiguousCompiledCommand,
  ClarificationNeededCompiledCommand,
  ClarificationQuestion,
  CommandAttribution,
  CompiledCommand,
  CompilerPath,
  NlSlotAssignment,
  NlUnderstandingDescriptor,
  NlUnderstandingPort,
  OperationIntentCompiledCommand,
  RecentOperationSummary,
  SessionFocus,
  SolutionCommandCompiler,
  SolutionCommandCompilerOptions,
  ToolCommandCompiledCommand,
  UnsafeRefusalCompiledCommand,
  UnsafeRefusalReasonCode,
  UnsupportedCompiledCommand,
} from "./model";
import {
  ADD_COAT_PATTERN,
  CANONICAL_UNITS,
  CHANGE_VERBS,
  COAT_COUNT_PATTERN,
  COAT_ORDINALS,
  COAT_WORD_NUMBERS,
  COMPARATIVE_WORDS,
  DIMENSION_WORDS,
  MATERIAL_CHANGE_VERBS,
  MATERIAL_VOCABULARIES,
  MEASUREMENT_PATTERN,
  SUPPORTED_OPERATION_TYPES,
  TOOL_COMMAND_PATTERNS,
  UNSAFE_REQUEST_PATTERNS,
  VERTICAL_HINT_PATTERNS,
  WEAK_OPERATION_HINTS,
  STRONG_OPERATION_PATTERNS,
  canonicalUnitFor,
  extractChangedMaterial,
  extractMaterials,
  isFutureVertical,
  toCanonicalUnit,
} from "./vocabulary";
import { numericParameterOf, textParameterOf } from "./quantities";
import { toolCommandOf } from "./tools";
import type { SolutionToolCommand } from "./tools";

/* ------------------------------------------------------------------ */
/* Internal extraction types                                            */
/* ------------------------------------------------------------------ */

/** One extracted measurement with its position and "by"-delta context. */
interface ExtractedMeasurement {
  readonly value: number;
  readonly rawUnit: string;
  readonly start: number;
  readonly end: number;
  readonly precededByBy: boolean;
}

/** One resolved dimension binding (absolute or delta). */
interface DimensionBinding {
  readonly parameter: string;
  readonly value: number;
  readonly rawUnit: string;
  readonly isDelta: boolean;
  readonly direction: 1 | -1;
}

/** One dimension/comparative word hit with its span. */
interface DimensionHit {
  readonly parameter: string;
  readonly start: number;
  readonly end: number;
  readonly kind: "dimension" | "comparative";
  readonly direction: 1 | -1;
}

/** Verb → dimension semantics ("deepen" → depth, positive direction). */
const VERB_DIMENSION_WORDS: readonly {
  readonly word: RegExp;
  readonly parameter: string;
  readonly direction: 1 | -1;
}[] = [
  { word: /\bdeepen(?:s|ed|ing)?\b/i, parameter: "depth", direction: 1 },
  { word: /\bwiden(?:s|ed|ing)?\b/i, parameter: "width", direction: 1 },
  { word: /\bnarrow(?:s|ed|ing)?\b/i, parameter: "width", direction: -1 },
  { word: /\blengthen(?:s|ed|ing)?\b/i, parameter: "length", direction: 1 },
  { word: /\bshorten(?:s|ed|ing)?\b/i, parameter: "length", direction: -1 },
  { word: /\bextend(?:s|ed|ing)?\b/i, parameter: "length", direction: 1 },
  { word: /\braise(?:s|d)?\b/i, parameter: "height", direction: 1 },
  { word: /\blower(?:s|ed)?\b/i, parameter: "height", direction: -1 },
  { word: /\bthicken(?:s|ed|ing)?\b/i, parameter: "thickness", direction: 1 },
];

/** The "X or Y unit" alternative-measurement pattern ("20 or 30 mm"). */
const ALTERNATIVE_MEASUREMENT_PATTERN =
  /(\d+(?:\.\d+)?|\d+,\d+)\s+or\s+(\d+(?:\.\d+)?|\d+,\d+)\s*(mm|cm|m|meters?|metres?)/gi;

/** Proximity constraint markers requiring an explicit clearance value. */
const CONSTRAINT_MARKER_PATTERN =
  /\b(?:near|adjacent\s+to|next\s+to|beside|close\s+to)\b/i;
const CONSTRAINT_SUBJECT_PATTERN =
  /\b(?:foundation|footing|structure|structural\s+wall|neighbou?r(?:ing)?|boundary|property\s+line)\b/i;
const CONSTRAINT_VALUE_PATTERN =
  /(\d+(?:\.\d+)?|\d+,\d+)\s*(mm|cm|m|meters?|metres?)\s*(?:of\s+)?(?:clearance|offset)\b/i;
const CONSTRAINT_VALUE_PATTERN_REVERSE =
  /\bclearance\s+(?:of\s+)?(\d+(?:\.\d+)?|\d+,\d+)\s*(mm|cm|m|meters?|metres?)\b/i;

/**
 * How far after a measurement its dimension word may sit ("1.5 m deep" —
 * the word must be the IMMEDIATE next word, never across a conjunction
 * that belongs to another measurement).
 */
const POSTFIX_WINDOW = 3;
/**
 * How far before a measurement its dimension word may sit ("depth of
 * 1.5 m", "the depth is 2 m", "deeper by 0.5 m" — a short connector).
 */
const PREFIX_WINDOW = 8;

/**
 * Focus-seedable parameters per operation type: which caller-known focus
 * parameters may complete a request that did not state them. Deliberately
 * narrow — a block wall's LENGTH and THICKNESS follow the referenced wall
 * ("along this wall"), but its HEIGHT is new work and must be stated; an
 * excavation's dimensions are always the request's own.
 */
const FOCUS_SEEDABLE_PARAMETERS: Readonly<Record<string, readonly string[]>> = {
  excavation: [],
  backfill: [],
  "demolition-removal": ["length", "height", "thickness"],
  "block-wall-placement": ["length", "thickness"],
  "foundation-placement": ["length"],
  "slab-placement": [],
  "opening-creation": [],
  "plaster-application": [],
  "finish-application": [],
  "building-service-installation": [],
};

/** The honest refusal prose per reason code (patterns live in vocabulary.ts). */
const UNSAFE_REFUSAL_PROSE: Readonly<
  Record<UnsafeRefusalReasonCode, { readonly family: string; readonly honesty: string }>
> = {
  "validation-authority-claim": {
    family: "claim validation success",
    honesty:
      "validation outcomes belong to the deterministic server solution engine's validation snapshots",
  },
  "approval-authority-claim": {
    family: "claim engineering approval",
    honesty: "approving an intervention is an Engineering Case domain act, never an agent act",
  },
  "reality-authority-claim": {
    family: "declare observed reality",
    honesty:
      "observed/confirmed status belongs to the Reality Graph through evidence and governed review",
  },
  "readiness-authority-claim": {
    family: "declare readiness",
    honesty: "task readiness belongs to the Assurance Engine",
  },
  "cost-authority-claim": {
    family: "claim cost authority",
    honesty:
      "costs are derived by the deterministic BOQ services and remain reviewable projections",
  },
  "raw-geometry-write": {
    family: "write raw geometry",
    honesty: "geometry is owned by the deterministic solution engine behind the tool port",
  },
  "engine-bypass": {
    family: "bypass the deterministic solution engine",
    honesty:
      "every consequential action must compile to a typed operation applied by the engine",
  },
};

/* ------------------------------------------------------------------ */
/* The deterministic default understanding port                         */
/* ------------------------------------------------------------------ */

/**
 * The DETERMINISTIC default of the NLU seam: a rule-based grammar marker
 * that NEVER enriches (it resolves nothing the grammar left open), so the
 * offline path is the default compiler path. An LLM adapter behind the
 * same port (the reasoning module's provider stack, wired later) may
 * propose slot assignments for already-extracted measurements only.
 */
export function createDeterministicGrammarUnderstanding(): NlUnderstandingPort {
  return {
    descriptor: {
      understandingId: "reasoning-deterministic-grammar",
      kind: "deterministic-grammar",
    },
    resolveSlotAssignments: async () => [],
  };
}

/* ------------------------------------------------------------------ */
/* Construction                                                         */
/* ------------------------------------------------------------------ */

/**
 * Creates the solution command compiler. Throws typed
 * `SolutionCompilerError`s for wiring bugs (missing clock, malformed
 * understanding descriptor) — wiring is not a compilation outcome.
 */
export function createSolutionCommandCompiler(
  options: SolutionCommandCompilerOptions,
): SolutionCommandCompiler {
  if (typeof options.clock !== "function") {
    throw new SolutionCompilerError("invalid_session", "clock must be an injected function");
  }
  const understanding = options.understanding ?? createDeterministicGrammarUnderstanding();
  const descriptor: NlUnderstandingDescriptor = understanding.descriptor;
  if (
    typeof descriptor.understandingId !== "string" ||
    descriptor.understandingId.length === 0 ||
    (descriptor.kind !== "deterministic-grammar" && descriptor.kind !== "llm-adapter")
  ) {
    throw new SolutionCompilerError(
      "invalid_understanding_descriptor",
      "the understanding port must carry a well-formed descriptor",
    );
  }
  const clock = options.clock;

  return {
    compile: async (input): Promise<CompiledCommand> => {
      const utterance = input.utterance;
      if (typeof utterance !== "string" || utterance.trim().length === 0) {
        throw new SolutionCompilerError(
          "invalid_utterance",
          "the utterance must be a non-empty string",
        );
      }
      const session = input.session;
      validateAgentSessionContext(session);
      const compiledAt = clock();
      const attributionBase = {
        rawUtterance: utterance,
        compilerPath: "deterministic" as CompilerPath,
        agentId: session.agentId,
        sessionId: session.sessionId,
        compiledAt,
        ...(session.userId !== undefined ? { userId: session.userId } : {}),
      };

      /* 1. Unsafe scan (authority claims / determinism bypasses). */
      const unsafe = matchUnsafeRequest(utterance);
      if (unsafe !== null) {
        const command: UnsafeRefusalCompiledCommand = {
          kind: "unsafe-refusal",
          reasonCode: unsafe.reasonCode,
          reason: unsafe.reason,
          attribution: {
            ...attributionBase,
            normalizedCommand: "",
            normalizedCommandText: "",
          },
        };
        return command;
      }

      /* 2. Tool-command scan (read-only agent commands). */
      const toolKind = matchToolCommand(utterance);
      if (toolKind !== null) {
        const solutionRef = session.proposedTo ?? null;
        if (solutionRef === null) {
          return clarificationCommand(
            [
              {
                slotKind: "location",
                slot: "solution context",
                question:
                  `Which solution context does this ${toolKind} command ` +
                  `address? The session is not attached to a solution (no ` +
                  `solutionId and versionNumber to operate on).`,
              },
            ],
            undefined,
            attributionBase,
          );
        }
        const { command, normalizedCommandText } = toolCommandOf(
          toolKind,
          utterance,
          solutionRef,
          attributionBase,
        );
        const normalizedCommand = serializeToolCommand(command);
        const fullAttribution: CommandAttribution = {
          ...attributionBase,
          normalizedCommand,
          normalizedCommandText,
        };
        const fullCommand: SolutionToolCommand = {
          ...command,
          attribution: fullAttribution,
        };
        const outcome: ToolCommandCompiledCommand = {
          kind: "tool-command",
          toolCommandKind: toolKind,
          command: fullCommand,
          attribution: fullAttribution,
        };
        return outcome;
      }

      /* 3. Clause stripping (sequencing + replacement). */
      const sequenced = stripClauses(
        utterance,
        /\b(?:after|once|following)\s+([^.,;!?]+?)(?=\s+(?:on|to|in|for|at|with|along|across|after)\b|[.,;!?]|$)/gi,
      );
      const replaced = stripClauses(
        sequenced.main,
        /\b(?:instead\s+of|rather\s+than)\s+([^.,;!?]+?)(?=\s+(?:on|to|in|for|at|with|along|across|after)\b|[.,;!?]|$)/gi,
      );
      const main = replaced.main;

      /* 4. Operation-type detection. */
      const strongMatches = STRONG_OPERATION_PATTERNS.filter((entry) =>
        entry.patterns.some((pattern) => pattern.test(main)),
      ).map((entry) => entry.operationType);
      let operationType: string | undefined;
      if (strongMatches.length > 1) {
        return ambiguousCommand(
          strongMatches.map((type) => ({
            description: `${type} operation as requested`,
            operationType: type,
          })),
          attributionBase,
        );
      }
      if (strongMatches.length === 1) {
        operationType = strongMatches[0];
      } else {
        const weakMatches = WEAK_OPERATION_HINTS.filter((entry) =>
          entry.patterns.some((pattern) => pattern.test(main)),
        ).map((entry) => entry.operationType);
        if (weakMatches.length > 1) {
          return ambiguousCommand(
            weakMatches.map((type) => ({
              description: `${type} operation as requested`,
              operationType: type,
            })),
            attributionBase,
          );
        }
        if (weakMatches.length === 1) {
          operationType = weakMatches[0];
        }
      }
      if (operationType === undefined) {
        return unsupportedCommand(main, attributionBase);
      }
      const type = operationType;

      /* 5. Change-mode + parameter extraction. */
      const changeMode =
        CHANGE_VERBS.some((pattern) => pattern.test(main)) ||
        MATERIAL_CHANGE_VERBS.some((pattern) => pattern.test(main)) ||
        ADD_COAT_PATTERN.test(main);
      const extraction = extractMeasurements(main);
      const { bindings, unassigned } = extraction;
      /* Parameters the utterance asks to CHANGE without (yet) a delta value
       * ("make it deeper", "raise the wall") — never silently restated from
       * session seeds; they demand an amount or resulting value. */
      const deltaRequested = new Set<string>([
        ...scanDimensionHits(main)
          .filter((hit) => hit.kind === "comparative")
          .map((hit) => hit.parameter),
        ...VERB_DIMENSION_WORDS.filter((entry) => entry.word.test(main)).map(
          (entry) => entry.parameter,
        ),
      ]);

      /* 6. Materials. */
      const materialRequired = requiredParametersOf(type).includes("material");
      let materials: readonly string[] = [];
      let materialAmbiguous = false;
      if (materialRequired) {
        materials = changeMode
          ? extractChangedMaterial(main, type)
          : extractMaterials(main, type);
        const asksForDifferent =
          /\b(?:different|another|other|alternative)\b/i.test(main) && /\bmaterial\b/i.test(main);
        if (asksForDifferent) {
          materials = [];
        } else if (materials.length > 1) {
          materialAmbiguous = true;
        }
      }

      /* 7. Coats/layers. */
      const coats = extractCoatCount(main, session, type, changeMode);

      /* 8. Focus resolution (location). */
      const focus = resolveFocus(main, session);

      /* 9. Seeds: recent operation (change mode) + focus-known facts. */
      const recent = changeMode ? recentOperationOf(session, type) : undefined;
      const seeds = new Map<string, TypedOperationParameter>();
      if (recent !== undefined) {
        for (const parameter of recent.parameters) {
          seeds.set(parameter.name, parameter);
        }
      }
      if (focus !== null) {
        const seedable = FOCUS_SEEDABLE_PARAMETERS[type] ?? [];
        for (const parameter of focus.knownParameters ?? []) {
          if (seedable.includes(parameter.name) && !seeds.has(parameter.name)) {
            seeds.set(parameter.name, parameter);
          }
        }
      }

      /* 10. Required parameters and dimension bindings. */
      const required = requiredParametersOf(type);
      const numericRequired = required.filter((name) => name !== "material");
      const bound = new Map<string, DimensionBinding>();
      const conflictingValues: {
        parameter: string;
        values: { value: number; unit: string }[];
      }[] = [];
      for (const binding of bindings) {
        if (!numericRequired.includes(binding.parameter)) {
          continue;
        }
        const existing = bound.get(binding.parameter);
        if (existing === undefined) {
          bound.set(binding.parameter, binding);
        } else if (
          existing.value !== binding.value &&
          !binding.isDelta &&
          !existing.isDelta
        ) {
          const conflict = conflictingValues.find(
            (entry) => entry.parameter === binding.parameter,
          );
          if (conflict === undefined) {
            conflictingValues.push({
              parameter: binding.parameter,
              values: [
                { value: existing.value, unit: existing.rawUnit },
                { value: binding.value, unit: binding.rawUnit },
              ],
            });
          } else if (
            !conflict.values.some(
              (candidate) => candidate.value === binding.value && candidate.unit === binding.rawUnit,
            )
          ) {
            conflict.values.push({ value: binding.value, unit: binding.rawUnit });
          }
        }
      }

      /* 11. Ambiguity: conflicting same-slot absolute bindings. */
      if (conflictingValues.length > 0) {
        const readings: AmbiguityReading[] = [];
        for (const conflict of conflictingValues) {
          for (const candidate of conflict.values) {
            readings.push({
              description: `${type} with ${conflict.parameter} ${formatCanonicalNumber(
                toCanonicalUnit(candidate.value, candidate.unit, type, conflict.parameter),
              )} ${canonicalUnitFor(type, conflict.parameter)}`,
              operationType: type,
              differingSlot: conflict.parameter,
            });
          }
        }
        return ambiguousCommand(readings, attributionBase);
      }

      /* 12. Ambiguity/enrichment: bare measurements over open slots. */
      let compilerPath: CompilerPath = "deterministic";
      let openUnassigned = [...unassigned];
      const eligibleSlots = (): readonly string[] => {
        const eligible: string[] = [];
        for (const name of numericRequired) {
          if (bound.has(name)) {
            continue;
          }
          if (!changeMode && seeds.has(name)) {
            continue;
          }
          eligible.push(name);
        }
        return eligible;
      };
      if (openUnassigned.length > 0 && eligibleSlots().length >= 2) {
        const proposed = await understanding.resolveSlotAssignments({
          utterance,
          operationType: type,
          unassignedMeasurements: openUnassigned.map((measurement) => ({
            value: measurement.value,
            unit: measurement.rawUnit,
          })),
          eligibleSlots: eligibleSlots(),
        });
        for (const assignment of proposed) {
          const accepted = acceptAssignment(assignment, openUnassigned, eligibleSlots());
          if (accepted === null) {
            continue;
          }
          bound.set(accepted.parameter, accepted.binding);
          openUnassigned = openUnassigned.filter(
            (measurement) => measurement !== accepted.measurement,
          );
          compilerPath = "provider-enriched";
        }
      }
      if (openUnassigned.length === 1 && eligibleSlots().length === 1) {
        const measurement = openUnassigned[0];
        const slot = eligibleSlots()[0];
        if (measurement !== undefined && slot !== undefined) {
          bound.set(slot, {
            parameter: slot,
            value: measurement.value,
            rawUnit: measurement.rawUnit,
            isDelta: false,
            direction: 1,
          });
          openUnassigned = [];
        }
      }

      /* 13. Parameter assembly + missing-slot questions. */
      const parameters: TypedOperationParameter[] = [];
      const missing: ClarificationQuestion[] = [];
      for (const name of required) {
        if (name === "material") {
          if (materials.length === 1) {
            parameters.push({ name, value: materials[0] as string });
          } else {
            const seeded = seeds.get(name);
            const keepCurrent =
              changeMode &&
              seeded !== undefined &&
              typeof seeded.value === "string" &&
              !/\b(?:different|another|other|alternative)\b/i.test(main);
            if (keepCurrent && seeded !== undefined && typeof seeded.value === "string") {
              parameters.push({ name, value: seeded.value });
            } else {
              missing.push(materialQuestion(type, changeMode, seeds));
            }
          }
          continue;
        }
        const binding = bound.get(name);
        if (binding !== undefined && !binding.isDelta) {
          parameters.push({
            name,
            value: toCanonicalUnit(binding.value, binding.rawUnit, type, name),
            unit: canonicalUnitFor(type, name),
          });
          continue;
        }
        if (binding !== undefined && binding.isDelta) {
          const base = seeds.get(name);
          if (base === undefined || typeof base.value !== "number") {
            missing.push(dimensionQuestion(type, name, "delta-base"));
            continue;
          }
          const delta = toCanonicalUnit(binding.value, binding.rawUnit, type, name);
          const baseCanonical = toCanonicalUnit(base.value, base.unit ?? "m", type, name);
          const result = Math.round((baseCanonical + delta * binding.direction) * 1e9) / 1e9;
          parameters.push({ name, value: result, unit: canonicalUnitFor(type, name) });
          continue;
        }
        if (deltaRequested.has(name)) {
          // A requested change with no amount: ask, never restate the seed.
          missing.push(dimensionQuestion(type, name, "delta-amount"));
          continue;
        }
        const seed = seeds.get(name);
        if (seed !== undefined && typeof seed.value === "number") {
          parameters.push({
            name,
            value: toCanonicalUnit(seed.value, seed.unit ?? "m", type, name),
            unit: canonicalUnitFor(type, name),
          });
          continue;
        }
        missing.push(dimensionQuestion(type, name, "value"));
      }
      if (coats !== undefined) {
        parameters.push({ name: "coats", value: coats, unit: "count" });
      }
      const clearanceBinding = bindings.find(
        (binding) => binding.parameter === "clearance" && !binding.isDelta,
      );
      if (clearanceBinding !== undefined) {
        parameters.push({
          name: "clearance",
          value: toCanonicalUnit(
            clearanceBinding.value,
            clearanceBinding.rawUnit,
            "clearance",
            "clearance",
          ),
          unit: "m",
        });
      }

      /* 14. Leftover bare measurements never drop silently. */
      if (openUnassigned.length > 0) {
        const eligible = eligibleSlots();
        let readings: readonly AmbiguityReading[];
        if (eligible.length >= 2) {
          readings = dimensionAmbiguityReadings(type, openUnassigned, eligible);
        } else if (eligible.length === 1) {
          const slot = eligible[0] as string;
          readings = openUnassigned.map((measurement) => ({
            description: `${type} with ${slot} ${formatCanonicalNumber(
              toCanonicalUnit(measurement.value, measurement.rawUnit, type, slot),
            )} ${canonicalUnitFor(type, slot)}`,
            operationType: type,
            differingSlot: slot,
          }));
        } else {
          const first = openUnassigned[0];
          if (first !== undefined) {
            missing.push({
              slotKind: "dimension",
              slot: "value assignment",
              question:
                `The value assignment is unclear: ${formatCanonicalNumber(first.value)} ` +
                `${first.rawUnit} could not be assigned to a parameter of the ` +
                `${type}. Which parameter does it specify?`,
            });
          }
          readings = [];
        }
        if (readings.length >= 2) {
          return ambiguousCommand(readings, attributionBase);
        }
      }

      /* 15. Material ambiguity (or-constructions). */
      if (materialAmbiguous && materials.length > 1) {
        return ambiguousCommand(
          materials.map((material) => ({
            description: `${type} with material ${material}`,
            operationType: type,
            differingSlot: "material",
          })),
          attributionBase,
        );
      }

      /* 16. Location. */
      const target: OperationTarget | undefined =
        focus !== null ? targetOfFocus(focus) : undefined;

      /* 17. Sequencing dependencies. */
      const dependencies: OperationDependency[] = [];
      for (const clause of sequenced.clauses) {
        const referenced = referencedOperationOf(clause, session);
        if (referenced === null) {
          missing.push(sequencingQuestion(type, clause));
        } else {
          dependencies.push({
            contractVersion: "1.0.0",
            operationRef: referenced.operationId,
            dependencyKind: "completion-before",
            rationale: `sequenced after '${clause}' per the user's request`,
          });
        }
      }

      /* 18. Constraint proximity (a bound clearance parameter satisfies it). */
      if (
        CONSTRAINT_MARKER_PATTERN.test(main) &&
        CONSTRAINT_SUBJECT_PATTERN.test(main) &&
        !parameters.some((parameter) => parameter.name === "clearance")
      ) {
        const subjectMatch = CONSTRAINT_SUBJECT_PATTERN.exec(main);
        const subject = subjectMatch?.[0] ?? "the referenced structure";
        missing.push({
          slotKind: "constraint",
          slot: "clearance",
          question:
            `What clearance must be kept from the ${subject}? Provide the ` +
            `distance with an explicit unit (e.g. 0.5 m).`,
        });
      }

      /* 19. Missing slots → targeted clarification questions (canonical
       * order: dimensions/material from assembly, sequencing, constraint,
       * then the location fallback). */
      if (target === undefined) {
        missing.push(locationQuestion(type, session));
      }
      if (missing.length > 0) {
        return clarificationCommand(missing, type, { ...attributionBase, compilerPath });
      }
      if (parameters.length === 0) {
        return clarificationCommand(
          [dimensionQuestion(type, numericRequired[0] ?? "depth", "value")],
          type,
          { ...attributionBase, compilerPath },
        );
      }
      if (target === undefined) {
        // Unreachable after the location clarification above; the typed
        // guard keeps the constructor input provably anchored.
        throw new SolutionCompilerError(
          "invalid_session",
          "the compiled intent has no anchored target (a focus is required)",
        );
      }

      /* 20. The intent — ONLY through the contract constructor. */
      const intentId = deriveIntentId(utterance, session, compiledAt, type, parameters);
      const normalizedCommandText = renderNormalizedCommandText(type, parameters);
      let intent: EngineeringOperationIntent;
      try {
        intent = createOperationIntent({
          intentId,
          operationType: type,
          domain: REFERENCE_BUILDING_DOMAIN,
          parameters,
          target,
          dependsOn: dependencies,
          provenance: {
            origin: "agent",
            authoredBy: session.agentId,
            authoredAt: compiledAt,
            commandText: normalizedCommandText,
            evidenceIds: [],
            derivationNote:
              `compiled from the user's natural-language request by the ` +
              `${compilerPath} path of the agent operation compiler (PROD-023); ` +
              `applied through the deterministic solution tool port only`,
          },
          ...(session.proposedTo !== undefined ? { proposedTo: session.proposedTo } : {}),
        });
      } catch (error) {
        // The constructor is the authoring boundary: a throw here is a
        // COMPILER BUG (the compiler produced contract-invalid semantics),
        // surfaced as a typed error — never a silent fallback intent.
        const name = error instanceof Error ? error.name : "Error";
        throw new SolutionCompilerError(
          "invalid_utterance",
          `the compiled semantics failed the contract constructor (${name}); ` +
            `this is a compiler defect, not a user error`,
        );
      }

      const attribution: CommandAttribution = {
        ...attributionBase,
        compilerPath,
        normalizedCommand: encodeEngineeringOperationIntent(intent),
        normalizedCommandText,
      };
      const outcome: OperationIntentCompiledCommand = {
        kind: "operation-intent",
        intent,
        attribution,
      };
      return outcome;
    },
  };
}

/* ------------------------------------------------------------------ */
/* Unsafe / tool matching                                               */
/* ------------------------------------------------------------------ */

function matchUnsafeRequest(
  utterance: string,
): { readonly reasonCode: UnsafeRefusalReasonCode; readonly reason: string } | null {
  for (const entry of UNSAFE_REQUEST_PATTERNS) {
    for (const pattern of entry.patterns) {
      if (pattern.test(utterance)) {
        const prose = UNSAFE_REFUSAL_PROSE[entry.reasonCode as UnsafeRefusalReasonCode];
        const family = prose?.family ?? "claim an authority it does not own";
        const honesty =
          prose?.honesty ?? "the agent is a translator, clarifier and proposer only";
        return {
          reasonCode: entry.reasonCode as UnsafeRefusalReasonCode,
          reason:
            `the request would ${family} — the agent is a translator, clarifier ` +
            `and proposer only: ${honesty}. Refused with NO operation intent produced.`,
        };
      }
    }
  }
  return null;
}

function matchToolCommand(utterance: string): AgentToolCommandKind | null {
  for (const entry of TOOL_COMMAND_PATTERNS) {
    if (entry.patterns.some((pattern) => pattern.test(utterance))) {
      const kind = entry.toolKind;
      if ((AGENT_TOOL_COMMAND_KINDS as readonly string[]).includes(kind)) {
        return kind as AgentToolCommandKind;
      }
      return null;
    }
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Measurement extraction                                               */
/* ------------------------------------------------------------------ */

function extractMeasurements(
  text: string,
): {
  readonly bindings: readonly DimensionBinding[];
  readonly unassigned: readonly ExtractedMeasurement[];
} {
  // Constraint-clearance spans are pre-computed so their measurements bind
  // to the clearance parameter directly (never bare/unassigned leftovers).
  const clearanceSpans: { start: number; end: number; value: number; unit: string }[] = [];
  for (const pattern of [CONSTRAINT_VALUE_PATTERN, CONSTRAINT_VALUE_PATTERN_REVERSE]) {
    const scanner = new RegExp(pattern.source, pattern.flags);
    const match = scanner.exec(text);
    if (
      match !== null &&
      match[1] !== undefined &&
      match[2] !== undefined &&
      Number.isFinite(Number(match[1].replace(",", ".")))
    ) {
      clearanceSpans.push({
        start: match.index,
        end: match.index + match[0].length,
        value: Number(match[1].replace(",", ".")),
        unit: match[2].toLowerCase(),
      });
    }
  }
  const measurements: ExtractedMeasurement[] = [];
  const alternative = new RegExp(ALTERNATIVE_MEASUREMENT_PATTERN.source, "gi");
  let altMatch = alternative.exec(text);
  while (altMatch !== null) {
    const unit = (altMatch[3] ?? "m").toLowerCase();
    for (const group of [altMatch[1], altMatch[2]]) {
      if (group === undefined) {
        continue;
      }
      const value = Number(group.replace(",", "."));
      if (Number.isFinite(value)) {
        measurements.push({
          value,
          rawUnit: unit,
          start: altMatch.index,
          end: altMatch.index + altMatch[0].length,
          precededByBy: false,
        });
      }
    }
    altMatch = alternative.exec(text);
  }
  const pattern = new RegExp(MEASUREMENT_PATTERN.source, "gi");
  let match = pattern.exec(text);
  while (match !== null) {
    const valueText = (match[1] ?? "").replace(",", ".");
    const value = Number(valueText);
    const unit = (match[2] ?? "m").toLowerCase();
    const start = match.index;
    const end = start + match[0].length;
    const overlaps = measurements.some(
      (existing) => start < existing.end && end > existing.start,
    );
    if (Number.isFinite(value) && !overlaps) {
      measurements.push({
        value,
        rawUnit: unit,
        start,
        end,
        precededByBy: /\bby\s*$/i.test(text.slice(0, start)),
      });
    }
    match = pattern.exec(text);
  }
  measurements.sort((a, b) => a.start - b.start);

  const hits = scanDimensionHits(text);
  const usedHits = new Set<DimensionHit>();
  const bindings: DimensionBinding[] = [];
  const unassigned: ExtractedMeasurement[] = [];
  const boundSpans: { start: number; end: number; binding: DimensionBinding }[] = [];
  const verbSign = /\b(?:decrease|reduce|lower|shorten|narrow)\b/i.test(text) ? -1 : 1;

  for (const measurement of measurements) {
    const clearanceSpan = clearanceSpans.find(
      (span) => measurement.start < span.end && measurement.end > span.start,
    );
    if (clearanceSpan !== undefined) {
      bindings.push({
        parameter: "clearance",
        value: clearanceSpan.value,
        rawUnit: clearanceSpan.unit,
        isDelta: false,
        direction: 1,
      });
      continue;
    }
    const postHit = nearestHit(hits, measurement.end, POSTFIX_WINDOW, usedHits, "after");
    const preHit = nearestHit(hits, measurement.start, PREFIX_WINDOW, usedHits, "before");
    if (postHit !== null) {
      usedHits.add(postHit);
      const binding = bindingOf(measurement, postHit, verbSign);
      bindings.push(binding);
      boundSpans.push({ start: measurement.start, end: measurement.end, binding });
      continue;
    }
    if (preHit !== null) {
      usedHits.add(preHit);
      const binding = bindingOf(measurement, preHit, verbSign);
      bindings.push(binding);
      boundSpans.push({ start: measurement.start, end: measurement.end, binding });
      continue;
    }
    if (measurement.precededByBy) {
      const verbDimension = VERB_DIMENSION_WORDS.find((entry) => entry.word.test(text));
      if (verbDimension !== undefined) {
        bindings.push({
          parameter: verbDimension.parameter,
          value: measurement.value,
          rawUnit: measurement.rawUnit,
          isDelta: true,
          direction: verbDimension.direction,
        });
        continue;
      }
      const anyHit = hits.find((hit) => !usedHits.has(hit));
      if (anyHit !== undefined) {
        usedHits.add(anyHit);
        bindings.push(bindingOf(measurement, anyHit, verbSign));
        continue;
      }
    }
    // An alternative-measurement sibling ("20 or 30 mm") shares its span:
    // bind it to the sibling's parameter — the two absolute values then
    // conflict and compile to an explicit ambiguity, never a silent pick.
    const sibling = boundSpans.find(
      (entry) => entry.start === measurement.start && entry.end === measurement.end,
    );
    if (sibling !== undefined && !sibling.binding.isDelta) {
      bindings.push({
        parameter: sibling.binding.parameter,
        value: measurement.value,
        rawUnit: measurement.rawUnit,
        isDelta: false,
        direction: 1,
      });
      continue;
    }
    unassigned.push(measurement);
  }
  return { bindings, unassigned };
}

function bindingOf(
  measurement: ExtractedMeasurement,
  hit: DimensionHit,
  verbSign: 1 | -1,
): DimensionBinding {
  if (hit.kind === "comparative") {
    return {
      parameter: hit.parameter,
      value: measurement.value,
      rawUnit: measurement.rawUnit,
      isDelta: true,
      direction: hit.direction,
    };
  }
  return {
    parameter: hit.parameter,
    value: measurement.value,
    rawUnit: measurement.rawUnit,
    isDelta: measurement.precededByBy,
    direction: verbSign,
  };
}

function scanDimensionHits(text: string): DimensionHit[] {
  const hits: DimensionHit[] = [];
  for (const entry of DIMENSION_WORDS) {
    const pattern = new RegExp(entry.word.source, "gi");
    let match = pattern.exec(text);
    while (match !== null) {
      hits.push({
        parameter: entry.parameter,
        start: match.index,
        end: match.index + match[0].length,
        kind: "dimension",
        direction: 1,
      });
      match = pattern.exec(text);
    }
  }
  for (const entry of COMPARATIVE_WORDS) {
    const pattern = new RegExp(entry.word.source, "gi");
    let match = pattern.exec(text);
    while (match !== null) {
      hits.push({
        parameter: entry.parameter,
        start: match.index,
        end: match.index + match[0].length,
        kind: "comparative",
        direction: entry.direction,
      });
      match = pattern.exec(text);
    }
  }
  hits.sort((a, b) => a.start - b.start);
  return hits;
}

/** The nearest unused dimension hit in the requested direction. */
function nearestHit(
  hits: readonly DimensionHit[],
  from: number,
  window: number,
  used: ReadonlySet<DimensionHit>,
  direction: "after" | "before",
): DimensionHit | null {
  let best: DimensionHit | null = null;
  for (const hit of hits) {
    if (used.has(hit)) {
      continue;
    }
    if (direction === "after") {
      const gap = hit.start - from;
      if (gap >= 0 && gap <= window && (best === null || hit.start < best.start)) {
        best = hit;
      }
    } else {
      const gap = from - hit.end;
      if (gap >= 0 && gap <= window && (best === null || hit.end > best.end)) {
        best = hit;
      }
    }
  }
  return best;
}

/* ------------------------------------------------------------------ */
/* Coats, focus, seeds, sequencing, constraints                         */
/* ------------------------------------------------------------------ */

function extractCoatCount(
  text: string,
  session: AgentSessionContext,
  type: string,
  changeMode: boolean,
): number | undefined {
  const addMatch = ADD_COAT_PATTERN.exec(text);
  if (addMatch !== null) {
    const ordinal = addMatch[1]?.toLowerCase();
    if (ordinal !== undefined && ordinal !== "another") {
      const mapped = COAT_ORDINALS[ordinal];
      if (mapped !== undefined) {
        return mapped;
      }
    }
    const recent = changeMode ? recentOperationOf(session, type) : undefined;
    const current =
      recent === undefined ? undefined : numericParameterOf(recent.parameters, "coats");
    return (current ?? 1) + 1;
  }
  const countMatch = COAT_COUNT_PATTERN.exec(text);
  if (countMatch !== null) {
    const token = countMatch[0]?.trim().split(/[\s-]+/)[0]?.toLowerCase();
    if (token === undefined) {
      return undefined;
    }
    const word = COAT_WORD_NUMBERS[token];
    if (word !== undefined) {
      return word;
    }
    const numeric = Number(token);
    return Number.isInteger(numeric) && numeric > 0 ? numeric : undefined;
  }
  return undefined;
}

function resolveFocus(main: string, session: AgentSessionContext): SessionFocus | null {
  const foci = session.foci ?? [];
  let best: { readonly focus: SessionFocus; readonly alias: string } | null = null;
  for (const focus of foci) {
    for (const alias of focus.aliases) {
      const pattern = new RegExp(`\\b${escapeRegExp(alias)}\\b`, "i");
      if (pattern.test(main)) {
        if (best === null || alias.length > best.alias.length) {
          best = { focus, alias };
        }
      }
    }
  }
  if (best !== null) {
    return best.focus;
  }
  if (session.defaultFocusId !== undefined) {
    const declared = foci.find((focus) => focus.focusId === session.defaultFocusId);
    if (declared !== undefined) {
      return declared;
    }
  }
  return null;
}

function targetOfFocus(focus: SessionFocus): OperationTarget {
  return {
    contractVersion: "1.0.0",
    selectorKind: focus.selectorKind,
    nodeRefs: [...focus.nodeRefs],
    geometryRefs: focus.geometryRefs.map((ref) => ({ ...ref })),
    units: { linear: "m", angular: "rad" },
    description: focus.label,
  };
}

function recentOperationOf(
  session: AgentSessionContext,
  type: string,
): RecentOperationSummary | undefined {
  const recents = [...(session.recentOperations ?? [])].reverse();
  return recents.find((operation) => operation.operationType === type);
}

function referencedOperationOf(
  clause: string,
  session: AgentSessionContext,
): RecentOperationSummary | null {
  const strong = STRONG_OPERATION_PATTERNS.filter((entry) =>
    entry.patterns.some((pattern) => pattern.test(clause)),
  ).map((entry) => entry.operationType);
  const weak = WEAK_OPERATION_HINTS.filter((entry) =>
    entry.patterns.some((pattern) => pattern.test(clause)),
  ).map((entry) => entry.operationType);
  const candidates = strong.length > 0 ? strong : weak;
  if (candidates.length !== 1) {
    return null;
  }
  const referencedType = candidates[0];
  if (referencedType === undefined) {
    return null;
  }
  return recentOperationOf(session, referencedType) ?? null;
}

/* ------------------------------------------------------------------ */
/* Required parameters (contract reference data)                        */
/* ------------------------------------------------------------------ */

/**
 * The required parameter names of an operation type, from the contract's
 * REFERENCE Phase 1 capability profile (advisory reference data — the
 * AUTHORITATIVE negotiation happens engine-side at composition time).
 * Falls back to the compiler's canonical-unit table for undeclared types.
 */
export function requiredParametersOf(operationType: string): readonly string[] {
  const domain = REFERENCE_BUILDING_OPERATION_PROFILE.domains.find(
    (entry) => entry.domain.vertical === "building",
  );
  const operation = domain?.operations.find((entry) => entry.operationType === operationType);
  if (operation !== undefined) {
    return [...operation.requiredParameters];
  }
  const canonical = CANONICAL_UNITS[operationType];
  if (canonical !== undefined) {
    const names = Object.keys(canonical);
    return MATERIAL_VOCABULARIES[operationType] !== undefined
      ? [...names, "material"]
      : [...names];
  }
  return [];
}

/* ------------------------------------------------------------------ */
/* Ambiguity readings                                                   */
/* ------------------------------------------------------------------ */

function dimensionAmbiguityReadings(
  type: string,
  unassigned: readonly ExtractedMeasurement[],
  eligibleSlots: readonly string[],
): readonly AmbiguityReading[] {
  const readings: AmbiguityReading[] = [];
  const first = unassigned[0];
  if (first === undefined) {
    return readings;
  }
  for (const slot of eligibleSlots) {
    const canonicalValue = toCanonicalUnit(first.value, first.rawUnit, type, slot);
    readings.push({
      description: `${type} with ${slot} ${formatCanonicalNumber(canonicalValue)} ${canonicalUnitFor(type, slot)}`,
      operationType: type,
      differingSlot: slot,
    });
    if (readings.length >= 6) {
      break;
    }
  }
  return readings;
}

function acceptAssignment(
  assignment: NlSlotAssignment,
  unassigned: readonly ExtractedMeasurement[],
  eligibleSlots: readonly string[],
): {
  readonly parameter: string;
  readonly binding: DimensionBinding;
  readonly measurement: ExtractedMeasurement;
} | null {
  if (!eligibleSlots.includes(assignment.slot)) {
    return null;
  }
  const measurement = unassigned.find(
    (candidate) =>
      candidate.value === assignment.value &&
      candidate.rawUnit === assignment.unit.toLowerCase(),
  );
  if (measurement === undefined) {
    return null;
  }
  return {
    parameter: assignment.slot,
    measurement,
    binding: {
      parameter: assignment.slot,
      value: measurement.value,
      rawUnit: measurement.rawUnit,
      isDelta: false,
      direction: 1,
    },
  };
}

/* ------------------------------------------------------------------ */
/* Outcome builders                                                     */
/* ------------------------------------------------------------------ */

type AttributionBase = Omit<CommandAttribution, "normalizedCommand" | "normalizedCommandText">;

function ambiguousCommand(
  readings: readonly AmbiguityReading[],
  attribution: AttributionBase,
): AmbiguousCompiledCommand {
  if (readings.length === 0) {
    throw new SolutionCompilerError("invalid_utterance", "ambiguous outcome requires readings");
  }
  return {
    kind: "ambiguous",
    readings: [readings[0] as AmbiguityReading, ...readings.slice(1)],
    attribution: { ...attribution, normalizedCommand: "", normalizedCommandText: "" },
  };
}

function unsupportedCommand(
  main: string,
  attribution: AttributionBase,
): UnsupportedCompiledCommand {
  const hint = VERTICAL_HINT_PATTERNS.find((entry) =>
    entry.patterns.some((pattern) => pattern.test(main)),
  );
  const vertical = hint?.vertical;
  const verticalNote =
    vertical !== undefined && isFutureVertical(vertical)
      ? ` It reads as the '${vertical}' vertical — addable by the engine without contract changes, but not supported in Phase 1.`
      : "";
  return {
    kind: "unsupported",
    ...(vertical !== undefined ? { vertical } : {}),
    reason:
      `the request is outside the Phase 1 building operation vocabulary.${verticalNote} ` +
      `Supported operation types: [${SUPPORTED_OPERATION_TYPES.join(", ")}]. ` +
      `This is an explicit, honest state — never a guessed operation.`,
    attribution: { ...attribution, normalizedCommand: "", normalizedCommandText: "" },
  };
}

function clarificationCommand(
  questions: readonly ClarificationQuestion[],
  partialOperationType: string | undefined,
  attribution: AttributionBase,
): ClarificationNeededCompiledCommand {
  const valid = questions.filter(
    (question) =>
      (CLARIFICATION_SLOT_KINDS as readonly string[]).includes(question.slotKind) &&
      question.question.trim().length > 0,
  );
  if (valid.length === 0) {
    throw new SolutionCompilerError(
      "invalid_utterance",
      "clarification outcome requires at least one targeted question",
    );
  }
  return {
    kind: "clarification-needed",
    questions: [valid[0] as ClarificationQuestion, ...valid.slice(1)],
    ...(partialOperationType !== undefined ? { partialOperationType } : {}),
    attribution: { ...attribution, normalizedCommand: "", normalizedCommandText: "" },
  };
}

function dimensionQuestion(
  type: string,
  name: string,
  flavor: "value" | "delta-base" | "delta-amount",
): ClarificationQuestion {
  const unit = canonicalUnitFor(type, name);
  if (flavor === "delta-base") {
    return {
      slotKind: "dimension",
      slot: name,
      question:
        `The ${name} change has no current value to apply against: no recent ` +
        `${type} operation or caller-known ${name} is available in the session. ` +
        `What should the resulting ${name} be? Provide the value with an ` +
        `explicit unit (the canonical unit is ${unit}).`,
    };
  }
  if (flavor === "delta-amount") {
    return {
      slotKind: "dimension",
      slot: name,
      question:
        `The ${name} should change, but by how much? Provide the delta or the ` +
        `resulting ${name} with an explicit unit (the canonical unit is ${unit}) ` +
        `— the amount is never invented.`,
    };
  }
  return {
    slotKind: "dimension",
    slot: name,
    question:
      `What is the ${name} of the ${type}? Provide the value with an explicit ` +
      `unit (the canonical unit is ${unit}).`,
  };
}

function materialQuestion(
  type: string,
  changeMode: boolean,
  seeds: ReadonlyMap<string, TypedOperationParameter>,
): ClarificationQuestion {
  const vocabulary = MATERIAL_VOCABULARIES[type] ?? [];
  const current = seeds.get("material");
  let choices = vocabulary.map((entry) => entry.material);
  if (changeMode && current !== undefined && typeof current.value === "string") {
    choices = choices.filter((material) => material !== current.value);
  }
  const currentNote =
    current !== undefined && typeof current.value === "string"
      ? ` The current material is '${current.value}'.`
      : "";
  return {
    slotKind: "material",
    slot: "material",
    question:
      `Which material should the ${type} use?${currentNote} The material is ` +
      `never invented.${choices.length > 0 ? ` Offered choices: [${choices.join(", ")}].` : ""}`,
    ...(choices.length > 0 ? { offeredChoices: choices } : {}),
  };
}

function locationQuestion(type: string, session: AgentSessionContext): ClarificationQuestion {
  const labels = (session.foci ?? []).map((focus) => focus.label);
  return {
    slotKind: "location",
    slot: "target location",
    question:
      `Which target location should the ${type} apply to? The request ` +
      `names no place and the session declares no default focus.`,
    ...(labels.length > 0 ? { offeredChoices: labels } : {}),
  };
}

function sequencingQuestion(type: string, clause: string): ClarificationQuestion {
  return {
    slotKind: "sequencing",
    slot: "sequencing reference",
    question:
      `The sequencing reference is missing: which operation should the ` +
      `${type} run after? The clause '${clause}' does not resolve to a ` +
      `recent operation of this session (sequencing references support ` +
      `'after/once/following' a known operation).`,
  };
}

/* ------------------------------------------------------------------ */
/* Normalized command rendering                                         */
/* ------------------------------------------------------------------ */

/** Formats a canonical number minimally (1.5 → "1.5", 2 → "2", 0.1 → "0.1"). */
export function formatCanonicalNumber(value: number): string {
  return String(Math.round(value * 1e6) / 1e6);
}

/**
 * Renders the CANONICAL normalized command text of an operation — the
 * deterministic template over its typed parameters. This exact text is
 * carried verbatim in the intent's provenance.commandText (the contract's
 * "EXACT normalized natural-language command"), so the canonical corpus
 * command "Excavate a pit 1.5 m deep, 2 m wide and 3 m long." round-trips
 * byte-identically.
 */
export function renderNormalizedCommandText(
  operationType: string,
  parameters: readonly TypedOperationParameter[],
): string {
  const num = (name: string): string => {
    const value = numericParameterOf(parameters, name);
    return value === undefined ? "?" : formatCanonicalNumber(value);
  };
  const mat = textParameterOf(parameters, "material") ?? "";
  const coats = numericParameterOf(parameters, "coats");
  const coatSuffix = coats !== undefined ? ` in ${coats} coats` : "";
  switch (operationType) {
    case "excavation":
      return `Excavate a pit ${num("depth")} m deep, ${num("width")} m wide and ${num("length")} m long.`;
    case "backfill":
      return `Backfill the excavation ${num("depth")} m deep, ${num("width")} m wide and ${num("length")} m long.`;
    case "demolition-removal":
      return `Demolish and remove ${num("length")} m long, ${num("height")} m high and ${num("thickness")} m thick.`;
    case "block-wall-placement":
      return `Lay a ${mat} wall ${num("length")} m long, ${num("height")} m high and ${num("thickness")} m thick.`;
    case "plaster-application":
      return `Apply ${num("thickness")} mm ${mat}${coatSuffix} to the affected wall faces.`;
    case "finish-application":
      return `Apply ${num("thickness")} mm ${mat} finish${coatSuffix} to the affected wall faces.`;
    case "foundation-placement":
      return `Place a ${mat} foundation ${num("length")} m long, ${num("width")} m wide and ${num("depth")} m deep.`;
    case "slab-placement":
      return `Place a ${mat} slab ${num("length")} m long, ${num("width")} m wide and ${num("thickness")} m thick.`;
    case "opening-creation":
      return `Create a ${mat} opening ${num("width")} m wide and ${num("height")} m high.`;
    case "building-service-installation":
      return `Install a ${mat} run ${num("length")} m long with ${num("diameter")} mm diameter.`;
    default:
      return `${operationType} ${parameters
        .map((parameter) =>
          typeof parameter.value === "number"
            ? `${parameter.name} ${formatCanonicalNumber(parameter.value)} ${parameter.unit ?? ""}`.trim()
            : `${parameter.name} ${parameter.value}`,
        )
        .join(", ")}.`;
  }
}

/* ------------------------------------------------------------------ */
/* Deterministic intent id + tool command serialization                 */
/* ------------------------------------------------------------------ */

function deriveIntentId(
  utterance: string,
  session: AgentSessionContext,
  compiledAt: string,
  operationType: string,
  parameters: readonly TypedOperationParameter[],
): string {
  const fingerprint = sha256Hex(
    canonicalJsonStringify({
      utterance,
      sessionId: session.sessionId,
      compiledAt,
      operationType,
      parameters,
    }),
  );
  return `intent-${fingerprint.slice(0, 16)}`;
}

/** Serializes a tool command canonically (minus its attribution field). */
export function serializeToolCommand(command: SolutionToolCommand): string {
  const rest: Record<string, unknown> = { ...command };
  delete rest.attribution;
  return canonicalJsonStringify(rest);
}

/* ------------------------------------------------------------------ */
/* Internals                                                            */
/* ------------------------------------------------------------------ */

function stripClauses(
  utterance: string,
  pattern: RegExp,
): { readonly main: string; readonly clauses: readonly string[] } {
  const clauses: string[] = [];
  const scanner = new RegExp(pattern.source, pattern.flags);
  let match = scanner.exec(utterance);
  while (match !== null) {
    if (match[1] !== undefined) {
      clauses.push(match[1].trim());
    }
    match = scanner.exec(utterance);
  }
  const main = utterance.replace(new RegExp(pattern.source, pattern.flags), " ");
  return { main: main.replace(/\s{2,}/g, " ").trim(), clauses };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
