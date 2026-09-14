/**
 * AISE-029 — deterministic question resolution over a supplied context.
 *
 * The REFERENCE providers' shared deterministic lookup: which nodes, cases
 * and property keys a question names, computed with WORD-BOUNDARY,
 * case-insensitive matching over the CALLER-SUPPLIED grounding context
 * (never over store data — the gateway is not a store reader).
 *
 * ROUTING CONVENTION (a property of the reference providers, NOT canonical
 * semantics — other providers may route differently; the gateway and the
 * result contract do not care): a question containing the word
 * "finding(s)" asks about verification findings; one containing
 * "case"/"observation(s)"/"observed" asks about case records; anything
 * else is treated as a property question.
 */

import type { GroundedCase, GroundedContext, GroundedNode } from "../model";
import { labelOfNode, questionMentionsPhrase } from "../retrieval";

/** The reference providers' question families (see header). */
export type QuestionFamily = "property" | "findings" | "case";

/** Deterministic question resolution result (all lists id/key-sorted). */
export interface QuestionResolution {
  readonly family: QuestionFamily;
  /** Nodes named by label or nodeId (id-sorted). */
  readonly nodes: readonly GroundedNode[];
  /** Cases named by caseId (id-sorted). */
  readonly cases: readonly GroundedCase[];
  /** Property keys named in the question that ANY context node models (sorted, unique). */
  readonly propertyKeys: readonly string[];
}

function questionFamily(question: string): QuestionFamily {
  const lower = question.toLowerCase();
  if (questionMentionsPhrase(lower, "finding") || questionMentionsPhrase(lower, "findings")) {
    return "findings";
  }
  if (
    questionMentionsPhrase(lower, "case") ||
    questionMentionsPhrase(lower, "observation") ||
    questionMentionsPhrase(lower, "observations") ||
    questionMentionsPhrase(lower, "observed")
  ) {
    return "case";
  }
  return "property";
}

function nodesNamed(context: GroundedContext, question: string): readonly GroundedNode[] {
  const matched = context.graphSnapshot.nodes.filter((node) => {
    if (questionMentionsPhrase(question, node.nodeId)) {
      return true;
    }
    const label = labelOfNode(node);
    return label !== null && questionMentionsPhrase(question, label);
  });
  return [...matched].sort((a, b) => (a.nodeId < b.nodeId ? -1 : a.nodeId > b.nodeId ? 1 : 0));
}

function casesNamed(context: GroundedContext, question: string): readonly GroundedCase[] {
  const matched = context.cases.filter((c) => questionMentionsPhrase(question, c.caseId));
  return [...matched].sort((a, b) => (a.caseId < b.caseId ? -1 : a.caseId > b.caseId ? 1 : 0));
}

function propertyKeysNamed(context: GroundedContext, question: string): readonly string[] {
  const keys = new Set<string>();
  for (const node of context.graphSnapshot.nodes) {
    for (const property of node.properties) {
      if (questionMentionsPhrase(question, property.key)) {
        keys.add(property.key);
      }
    }
  }
  return [...keys].sort();
}

/**
 * Resolve a question against the supplied context (pure, deterministic).
 * For the "case" family with NO case named and exactly one case in the
 * context, that single case is the honest best resolution (documented
 * convention); with several unnamed cases the result is an empty list and
 * the provider refuses UNGROUNDED_QUESTION.
 */
export function resolveQuestion(context: GroundedContext, question: string): QuestionResolution {
  const family = questionFamily(question);
  let cases = casesNamed(context, question);
  if (family === "case" && cases.length === 0 && context.cases.length === 1) {
    cases = [...context.cases];
  }
  return {
    family,
    nodes: nodesNamed(context, question),
    cases,
    propertyKeys: propertyKeysNamed(context, question),
  };
}
