/**
 * WORLD-P3 — the AUTHORING family's two in-memory SUBSTITUTION DOUBLES
 * — THE NL-COMMAND PARSER DOUBLES (the natural-language substrate seam).
 *
 * Both implement the `NlCommandParserAdapter` port WITHOUT any NLU
 * engine, LLM or language runtime — no network, no model, no sampling:
 * the real NL-command lane is BLOCKED pending the natural-language
 * substrate decision (recorded in the item's CAPABILITY-BOUNDARIES with
 * the decision protocol). The doubles prove the parser CONTRACT
 * implementable and — because both resolve through the SAME grammar
 * tables over the authoring scope — they produce BYTE-IDENTICAL
 * `AuthoringCommandDraft` records on the committed utterance corpus:
 *
 *  - `referenceNlCommandParserDouble` — DIRECT grammar match: a
 *    deterministic keyword grammar (the closed grammar families over
 *    the utterance corpus) extracts the command kind, operation type,
 *    target element and parameter overrides directly;
 *  - `alternateNlCommandParserDouble` — ROUND-TRIP grammar match: the
 *    SAME grammar extraction, with every draft serialized to canonical
 *    JSON and parsed back before returning — proving the draft contract
 *    is wire-stable (a future real NLU engine emitting wire-shaped
 *    drafts is substitutable without semantic change).
 *
 * THE BOUNDED EXTRACTION DISCIPLINE (what makes these doubles honest
 * stand-ins for the NL substrate): every draft is constructed ONLY
 * from (utterance × scope × selection context) — the parser extracts
 * numeric parameters WITH their units from the utterance text, resolves
 * the target from the request's selected element, takes the command
 * kind and operation type from the closed grammar family table, and
 * NEVER invents a parameter the utterance did not state or the palette
 * did not declare. Unresolvable utterances are typed refusals
 * (`unsupported-utterance`) — never a guessed command.
 *
 * LAW 2 (the NL-substrate law) is drilled against these doubles AND
 * against rogue parsers in the test suite: the controlled entry point
 * `parseNlCommandThroughPort` re-validates every draft fail-closed, so
 * a rogue parser returning out-of-vocabulary drafts is refused, never
 * passed through.
 */

import { canonicalJsonStringify } from "@aise/shared-contracts";
import { laneRefused, type LaneOutcome, type LaneOperator, type Layer3Family } from "../seam";
import type {
  AuthoringCommandDraft,
  DirectManipulationStream,
  ManipulationGesture,
} from "./contract";
import {
  AUTHORING_COMMAND_KIND,
  AUTHORING_COMMAND_SCHEMA_VERSION,
  NL_COMMAND_PARSE_PORT_ID,
  type NlCommandParseRequest,
  type NlCommandParserAdapter,
  type NlParserCapabilities,
  type SpatialAuthoringCommandKind,
} from "./contract";

const FAMILY: Layer3Family = "authoring";

/** The closed grammar-family vocabulary of the doubles. */
export const NL_GRAMMAR_FAMILIES = [
  "excavation-command",
  "block-wall-command",
  "demolition-command",
  "plaster-command",
] as const;
export type NlGrammarFamily = (typeof NL_GRAMMAR_FAMILIES)[number];

/* ------------------------------------------------------------------ */
/* The shared grammar table (the deterministic extraction core)         */
/* ------------------------------------------------------------------ */

/** One parameter extraction: the name and the numeric pattern. */
interface ParameterPattern {
  readonly name: string;
  readonly capture: string;
}

/** One grammar family: the pattern, the command semantics it maps to. */
interface GrammarEntry {
  readonly family: NlGrammarFamily;
  readonly pattern: RegExp;
  readonly commandKind: SpatialAuthoringCommandKind;
  readonly operationType: string;
  readonly parameters: readonly ParameterPattern[];
}

/**
 * The deterministic grammar table — the closed corpus of utterance
 * shapes the doubles understand. The command kind and operation type
 * come from the TABLE (declared data, never guessed); the numeric
 * parameters come from the utterance's own captures.
 */
const GRAMMAR_TABLE: readonly GrammarEntry[] = [
  {
    family: "excavation-command",
    pattern: /^Excavate a pit (\d+(?:\.\d+)?) m deep, (\d+(?:\.\d+)?) m wide and (\d+(?:\.\d+)?) m long\.$/,
    commandKind: "add",
    operationType: "excavation",
    parameters: [
      { name: "depth", capture: "m" },
      { name: "width", capture: "m" },
      { name: "length", capture: "m" },
    ],
  },
  {
    family: "block-wall-command",
    pattern: /^Lay blocks to a height of (\d+(?:\.\d+)?) m along this wall\.$/,
    commandKind: "add",
    operationType: "block-wall-placement",
    parameters: [{ name: "height", capture: "m" }],
  },
  {
    family: "demolition-command",
    pattern: /^Remove the damaged wall section\.$/,
    commandKind: "remove",
    operationType: "demolition-removal",
    parameters: [],
  },
  {
    family: "plaster-command",
    pattern: /^Apply (\d+(?:\.\d+)?) mm plaster to the affected wall faces\.$/,
    commandKind: "add",
    operationType: "plaster-application",
    parameters: [{ name: "thickness", capture: "mm" }],
  },
];

/** The capabilities both doubles declare (honest, closed). */
const SHARED_CAPABILITIES: NlParserCapabilities = {
  supportedGrammarFamilies: [...NL_GRAMMAR_FAMILIES],
  maxUtteranceLength: 200,
  blocked: [
    {
      capability: "free-form natural-language understanding",
      reason:
        "in-memory substitution double — deterministic keyword grammar over the committed " +
        "utterance corpus only; the real NLU/LLM occupant is BLOCKED pending the " +
        "natural-language substrate decision (see WORLD-P3 CAPABILITY-BOUNDARIES)",
    },
    {
      capability: "utterance-to-element resolution without selection context",
      reason:
        "the doubles resolve the target element from the request's selectedElementId only — " +
        "deictic reference resolution ('that beam over there') is a future occupant capability",
    },
  ],
};

/* ------------------------------------------------------------------ */
/* The shared extraction (the semantic content both doubles compute)    */
/* ------------------------------------------------------------------ */

function unsupportedUtterance<T>(utterance: string): LaneOutcome<T> {
  return laneRefused<T>(
    FAMILY,
    "unsupported-data",
    `unsupported-utterance: '${utterance.slice(0, 80)}' matches none of the declared ` +
      `grammar families (${NL_GRAMMAR_FAMILIES.join(" | ")}) — the parser never guesses a command`,
  );
}

/**
 * The grammar extraction (shared semantic content): utterance × scope ×
 * selection → the draft object. Returns the DRAFT BODY (unsealed) so
 * the two doubles can construct it through different code paths.
 */
function extractDraftBody(
  request: NlCommandParseRequest,
): LaneOutcome<Record<string, unknown>> {
  const utterance = request.utterance;
  for (const entry of GRAMMAR_TABLE) {
    const match = entry.pattern.exec(utterance);
    if (match === null) {
      continue;
    }
    if (request.selectedElementId === null) {
      return laneRefused<Record<string, unknown>>(
        FAMILY,
        "unsupported-data",
        `the '${entry.family}' utterance requires a selected element context — ` +
          `the operator must have the target element in hand (the parser never invents a target)`,
      );
    }
    const overrides: { name: string; value: number | string; unit?: string }[] = [];
    for (let index = 0; index < entry.parameters.length; index += 1) {
      const parameter = entry.parameters[index];
      const capture = match[index + 1];
      if (parameter === undefined || capture === undefined) {
        continue;
      }
      const value = Number(capture);
      if (!Number.isFinite(value)) {
        return laneRefused<Record<string, unknown>>(
          FAMILY,
          "contract-mismatch",
          `the utterance's '${parameter.name}' capture '${capture}' is not a finite number`,
        );
      }
      overrides.push({ name: parameter.name, value, unit: parameter.capture });
    }
    return {
      ok: true,
      value: {
        kind: AUTHORING_COMMAND_KIND,
        schemaVersion: AUTHORING_COMMAND_SCHEMA_VERSION,
        commandKind: entry.commandKind,
        operationType: entry.operationType,
        targetElementId: request.selectedElementId,
        parameterOverrides: overrides,
        dependsOn: [],
      },
    };
  }
  return unsupportedUtterance<Record<string, unknown>>(utterance);
}

/* ------------------------------------------------------------------ */
/* The two provider descriptors + doubles                               */
/* ------------------------------------------------------------------ */

export const REFERENCE_NL_PARSER_NOTE =
  "in-memory substitution double — direct deterministic keyword-grammar extraction over the " +
  "authoring scope; NO NLU engine, NO LLM integrated (the real lane is BLOCKED pending the " +
  "natural-language substrate decision)";

export const ALTERNATE_NL_PARSER_NOTE =
  "in-memory substitution double — the same deterministic grammar extraction, with every draft " +
  "canonical-JSON round-tripped (wire-stability proof); NO NLU engine, NO LLM integrated";

/**
 * The REFERENCE double: direct grammar match — the draft is constructed
 * directly from the extraction and returned as-is.
 */
export class ReferenceNlCommandParserDouble implements NlCommandParserAdapter {
  readonly portId = NL_COMMAND_PARSE_PORT_ID;
  readonly capabilities: NlParserCapabilities = SHARED_CAPABILITIES;

  parseCommand(request: NlCommandParseRequest): LaneOutcome<AuthoringCommandDraft> {
    const extraction = extractDraftBody(request);
    if (!extraction.ok) {
      return extraction;
    }
    return { ok: true, value: extraction.value as unknown as AuthoringCommandDraft };
  }
}

/**
 * The ALTERNATE double: the same grammar extraction, with the draft
 * canonical-JSON round-tripped — an independent construction path that
 * must produce the byte-identical draft (the wire-stability proof).
 */
export class AlternateNlCommandParserDouble implements NlCommandParserAdapter {
  readonly portId = NL_COMMAND_PARSE_PORT_ID;
  readonly capabilities: NlParserCapabilities = SHARED_CAPABILITIES;

  parseCommand(request: NlCommandParseRequest): LaneOutcome<AuthoringCommandDraft> {
    const extraction = extractDraftBody(request);
    if (!extraction.ok) {
      return extraction;
    }
    const roundTripped: unknown = JSON.parse(
      canonicalJsonStringify(extraction.value),
    );
    return { ok: true, value: roundTripped as AuthoringCommandDraft };
  }
}

/** Construct the reference double. */
export function referenceNlCommandParserDouble(): NlCommandParserAdapter {
  return new ReferenceNlCommandParserDouble();
}

/** Construct the alternate double. */
export function alternateNlCommandParserDouble(): NlCommandParserAdapter {
  return new AlternateNlCommandParserDouble();
}

/* ------------------------------------------------------------------ */
/* The gesture-stream canonicalizer (shared DM double surface)           */
/* ------------------------------------------------------------------ */

/**
 * The canonical DM-stream builder for the direct-manipulation modality
 * double surface: given the stream identity, the operator, the world
 * revision, the picked element, optional parameter edits, the commit
 * and the declared instant — the canonical well-formed stream shape
 * (used by the corpus and the property tests as the stream generator).
 */
export function canonicalManipulationStream(
  streamId: string,
  operator: LaneOperator,
  sceneRevision: number,
  pickedElementId: string,
  parameterEdits: readonly { readonly name: string; readonly value: number | string; readonly unit?: string }[],
  commit: { readonly commandKind: SpatialAuthoringCommandKind; readonly operationType: string },
  authoredAt: string,
): DirectManipulationStream {
  const gestures: ManipulationGesture[] = [
    { gesture: "pick-element", elementId: pickedElementId },
  ];
  for (const edit of parameterEdits) {
    gestures.push({
      gesture: "edit-parameter",
      parameter:
        edit.unit === undefined
          ? { name: edit.name, value: edit.value }
          : { name: edit.name, value: edit.value, unit: edit.unit },
    });
  }
  gestures.push({
    gesture: "commit",
    commandKind: commit.commandKind,
    operationType: commit.operationType,
  });
  return {
    streamId,
    operator,
    sceneRevision,
    gestures,
    authoredAt,
  };
}
