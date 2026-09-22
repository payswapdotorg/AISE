/**
 * HFX-201 — the DETERMINISTIC GROUNDED-REASONING CHECKS.
 *
 * The authority layer of the benchmark lane (HFX-201's "Compare grounded
 * reasoning against deterministic checks and known evidence"): every
 * well-grounded answer's envelope is validated by the Layer-2 harness
 * (parse + integrity rules — consumed from ../reasoning-eval), and THEN
 * its facts are cross-checked against the bundle by THESE deterministic
 * checks, which RECOMPUTE what is recomputable from the structured fixture
 * data and compare:
 *
 *  - `vlm-fact-derivability-check` — every provider-claimed fact must be
 *    derivable from the CITED evidence's ground truth. A claimed fact not
 *    derivable from the bundle is a failure (`unsupported-data`): the
 *    model cannot invent a measurement, material, observation or
 *    validation result when evidence is missing.
 *  - `vlm-spatial-reference-resolution-check` — a spatial reference ("the
 *    element above the door on the north elevation") resolves
 *    deterministically through the bundle's positional grid, never through
 *    world knowledge. The recomputed answer (evidence + element + canonical
 *    finding) is compared with the provider's citation and facts.
 *  - `vlm-field-value-recomputation-check` — a field value (a video-frame
 *    measurement aggregate, an OCR quantity) is recomputed from the
 *    structured fixture data and compared with the provider's claim. The
 *    recomputation is AUTHORITATIVE (deterministic checks remain
 *    authoritative for supported calculations).
 *  - `vlm-conflict-detection-check` — conflicting field assertions across
 *    bundle items are detected by recomputation. A surfaced conflict
 *    (status `conflicted`, all sides cited) passes; a silent resolution is
 *    a retrieval failure (the dropped side is evidence that exists).
 *
 * Every observation uses the CLOSED failure vocabulary of the control
 * plane — this module invents no failure kinds. PURE and DETERMINISTIC:
 * no clock, no randomness, no I/O.
 */

import type { FailureKind } from "@aise/provider-registry";
import type { CanonicalEvidenceEnvelope } from "../reasoning-eval/model";
import {
  VlmEvalError,
  fixtureFactsOf,
} from "./model";
import type {
  VlmDeterministicCheckPlan,
  VlmEvidenceFixture,
  VlmImageElementFixture,
} from "./model";

/* ------------------------------------------------------------------ */
/* The observation + verdict shapes                                     */
/* ------------------------------------------------------------------ */

/** One closed-vocabulary failure observation emitted by the check layer. */
export interface VlmGroundedCheckObservation {
  /** The deterministic check that emitted the observation. */
  readonly check: string;
  /** The CLOSED failure kind (never invented here). */
  readonly kind: FailureKind;
  readonly detail: string;
}

/** The stable verdict vocabulary of the recomputation checks. */
export const VLM_CHECK_VERDICTS = Object.freeze([
  "confirmed",
  "all-derivable",
  "not-derivable",
  "evidence-not-cited",
  "contradicted",
  "conflict-surfaced",
  "conflict-silently-resolved",
  "conflicting-values",
  "unaddressed",
  "no-assertions",
  "no-conflict",
] as const satisfies readonly string[]);
export type VlmCheckVerdict = (typeof VLM_CHECK_VERDICTS)[number];

/** One recomputation verdict (what the deterministic check computed + decided). */
export interface VlmGroundedCheckVerdictEntry {
  readonly check: string;
  readonly verdict: VlmCheckVerdict;
  /** The recomputed canonical fact (when one exists). */
  readonly recomputedFact: string | null;
  /** The evidence ids that deterministically determine the recomputed answer. */
  readonly determiningEvidenceIds: readonly string[];
  readonly detail: string;
}

/** The full deterministic check result of one evaluated envelope. */
export interface VlmGroundedCheckResult {
  readonly verdicts: readonly VlmGroundedCheckVerdictEntry[];
  readonly observations: readonly VlmGroundedCheckObservation[];
  /** Sorted unique closed-vocabulary kinds of the emitted observations. */
  readonly observationKinds: readonly string[];
  /** True iff the check layer emitted NO failure observation. */
  readonly groundedPass: boolean;
}

/** The revision-binding verification of one evaluated envelope. */
export interface VlmRevisionBinding {
  /** True iff every cited evidence id is bound to the fixture's exact revision. */
  readonly ok: boolean;
  readonly mismatches: readonly {
    readonly evidenceId: string;
    readonly expectedRevision: string;
    readonly recordedRevision: string;
  }[];
}

/* ------------------------------------------------------------------ */
/* Field assertions (the recomputable value layer)                      */
/* ------------------------------------------------------------------ */

/** One structured field assertion extracted from the fixtures. */
export interface VlmFieldAssertion {
  readonly evidenceId: string;
  /** The asserting element / region / frame id. */
  readonly sourceRef: string;
  readonly field: string;
  readonly value: string;
  readonly source: "image-attribute" | "ocr-region" | "video-frame";
}

/**
 * Extracts every LEGIBLE field assertion from the structured fixtures:
 * image element attributes, OCR text regions (legible only — an illegible
 * region is an honest absence, never an assertion) and video frame
 * observations. The deterministic recomputation layer runs over these.
 */
export function resolveFieldAssertions(
  fixtures: readonly VlmEvidenceFixture[],
  field: string,
): readonly VlmFieldAssertion[] {
  const assertions: VlmFieldAssertion[] = [];
  for (const fixture of fixtures) {
    switch (fixture.kind) {
      case "image":
        for (const element of fixture.elements) {
          for (const attribute of element.attributes ?? []) {
            if (attribute.field === field) {
              assertions.push({
                evidenceId: fixture.evidenceId,
                sourceRef: element.elementId,
                field,
                value: attribute.value,
                source: "image-attribute",
              });
            }
          }
        }
        break;
      case "ocr":
        for (const region of fixture.regions) {
          if (region.field === field && region.legible && region.value !== null) {
            assertions.push({
              evidenceId: fixture.evidenceId,
              sourceRef: region.regionId,
              field,
              value: region.value,
              source: "ocr-region",
            });
          }
        }
        break;
      case "video":
        for (const frame of fixture.frames) {
          for (const observation of frame.observations) {
            if (observation.field === field) {
              assertions.push({
                evidenceId: fixture.evidenceId,
                sourceRef: frame.frameId,
                field,
                value: observation.value,
                source: "video-frame",
              });
            }
          }
        }
        break;
    }
  }
  return assertions;
}

/** The illegible-region ids asserting a field (the honest-absence sources). */
function illegibleSourcesOf(
  fixtures: readonly VlmEvidenceFixture[],
  field: string,
): readonly { evidenceId: string; sourceRef: string }[] {
  const sources: { evidenceId: string; sourceRef: string }[] = [];
  for (const fixture of fixtures) {
    if (fixture.kind !== "ocr") {
      continue;
    }
    for (const region of fixture.regions) {
      if (region.field === field && !region.legible) {
        sources.push({ evidenceId: fixture.evidenceId, sourceRef: region.regionId });
      }
    }
  }
  return sources;
}

/* ------------------------------------------------------------------ */
/* The spatial-reference resolver (positional, never world knowledge)   */
/* ------------------------------------------------------------------ */

/** The deterministic resolution of one spatial reference. */
export interface VlmSpatialResolution {
  readonly evidenceId: string;
  readonly elementId: string;
  readonly findingFact: string;
}

function spansOverlap(
  a: { readonly columnStart: number; readonly columnEnd: number },
  b: { readonly columnStart: number; readonly columnEnd: number },
): boolean {
  return a.columnStart <= b.columnEnd && a.columnEnd >= b.columnStart;
}

/**
 * Resolves one spatial reference deterministically over the image
 * fixtures' positional grids: `directly-above` = the element one row above
 * an anchor with an overlapping column span; `between` = the element on
 * the anchors' row whose span lies strictly between the two anchors'
 * spans. The reference resolves WITHIN the image fixture that contains
 * the anchors (positional grids of different captures are independent);
 * exactly one element must satisfy it. Ambiguous or unresolvable
 * references are CORPUS AUTHORING BUGS — fail closed (the reference must
 * resolve through the bundle).
 */
export function resolveSpatialReference(
  fixtures: readonly VlmEvidenceFixture[],
  reference: {
    readonly relation: "directly-above" | "between";
    readonly anchorElementIds: readonly string[];
  },
): VlmSpatialResolution {
  const imageFixtures = fixtures.filter(
    (fixture): fixture is Extract<VlmEvidenceFixture, { kind: "image" }> => fixture.kind === "image",
  );
  // Only the fixtures that contain EVERY anchor element participate in the
  // resolution (the reference lives in one capture's positional grid).
  const anchorIds = new Set(reference.anchorElementIds);
  const candidates: {
    fixture: Extract<VlmEvidenceFixture, { kind: "image" }>;
    element: VlmImageElementFixture;
  }[] = [];
  for (const fixture of imageFixtures) {
    const anchors = reference.anchorElementIds
      .map((elementId) => fixture.elements.find((element) => element.elementId === elementId))
      .filter((element): element is VlmImageElementFixture => element !== undefined);
    if (anchors.length !== anchorIds.size) {
      continue; // this fixture does not contain every anchor
    }
    const local: VlmImageElementFixture[] = [];
    if (reference.relation === "directly-above") {
      const anchor = anchors[0];
      if (anchor === undefined) {
        continue;
      }
      for (const element of fixture.elements) {
        if (element.row === anchor.row - 1 && spansOverlap(element, anchor)) {
          local.push(element);
        }
      }
    } else {
      const first = anchors[0];
      const second = anchors[1];
      if (first === undefined || second === undefined) {
        continue;
      }
      if (first.row !== second.row) {
        throw new VlmEvalError(
          "invalid_corpus",
          "a 'between' reference requires both anchors on one row of the positional grid",
        );
      }
      const west = first.columnEnd <= second.columnEnd ? first : second;
      const east = first.columnEnd <= second.columnEnd ? second : first;
      for (const element of fixture.elements) {
        if (
          element.row === first.row &&
          element.columnStart > west.columnEnd &&
          element.columnEnd < east.columnStart
        ) {
          local.push(element);
        }
      }
    }
    if (local.length > 1) {
      throw new VlmEvalError(
        "invalid_corpus",
        `the spatial reference (relation '${reference.relation}', anchors [${reference.anchorElementIds.join(", ")}]) ` +
          `resolved to ${local.length} elements within one fixture — exactly one element must satisfy a corpus reference`,
      );
    }
    const resolved = local[0];
    if (resolved !== undefined) {
      candidates.push({ fixture, element: resolved });
    }
  }
  if (candidates.length !== 1) {
    throw new VlmEvalError(
      "invalid_corpus",
      `the spatial reference (relation '${reference.relation}', anchors [${reference.anchorElementIds.join(", ")}]) ` +
        `resolved to ${candidates.length} elements across the fixtures — exactly one element must satisfy a corpus reference`,
    );
  }
  const resolution = candidates[0];
  if (resolution === undefined) {
    throw new VlmEvalError("invalid_corpus", "unreachable: the unique candidate is missing");
  }
  const findingFact = resolution.element.facts[0];
  if (findingFact === undefined) {
    throw new VlmEvalError(
      "invalid_corpus",
      `element '${resolution.element.elementId}' carries no canonical finding fact`,
    );
  }
  return {
    evidenceId: resolution.fixture.evidenceId,
    elementId: resolution.element.elementId,
    findingFact,
  };
}

/* ------------------------------------------------------------------ */
/* The engine                                                           */
/* ------------------------------------------------------------------ */

function factTemplateRender(
  template: string,
  values: { readonly value?: string; readonly source?: string },
): string {
  return template.replaceAll("{value}", values.value ?? "").replaceAll("{source}", values.source ?? "");
}

/**
 * Runs the deterministic grounded-reasoning checks of one scenario over
 * one evaluated canonical envelope: recomputes every planned check from
 * the structured fixtures and compares with the provider's citations and
 * claimed facts. PURE; every failure is a closed-vocabulary observation.
 */
export function runGroundedReasoningChecks(
  envelope: CanonicalEvidenceEnvelope,
  fixtures: readonly VlmEvidenceFixture[],
  checkPlan: readonly VlmDeterministicCheckPlan[],
): VlmGroundedCheckResult {
  const verdicts: VlmGroundedCheckVerdictEntry[] = [];
  const observations: VlmGroundedCheckObservation[] = [];
  const cited = new Set(envelope.evidenceIds);

  /* Fact derivability (always planned first — the hallucination catch). */

  const derivable = new Set<string>();
  for (const fixture of fixtures) {
    if (cited.has(fixture.evidenceId)) {
      for (const fact of fixtureFactsOf(fixture)) {
        derivable.add(fact);
      }
    }
  }
  const underivableFacts = envelope.facts.filter((fact) => !derivable.has(fact));
  if (underivableFacts.length === 0) {
    verdicts.push({
      check: "vlm-fact-derivability-check",
      verdict: "all-derivable",
      recomputedFact: null,
      determiningEvidenceIds: [...cited],
      detail: `every one of the ${envelope.facts.length} claimed fact(s) is derivable from the cited evidence's ground truth`,
    });
  } else {
    verdicts.push({
      check: "vlm-fact-derivability-check",
      verdict: "not-derivable",
      recomputedFact: null,
      determiningEvidenceIds: [...cited],
      detail: `${underivableFacts.length} claimed fact(s) are not derivable from the authorized bundle`,
    });
    for (const fact of underivableFacts) {
      observations.push({
        check: "vlm-fact-derivability-check",
        kind: "unsupported-data",
        detail:
          `provider-claimed fact '${fact}' is not derivable from the authorized bundle — the model cannot ` +
          `invent a measurement, material, observation or validation result when evidence is missing`,
      });
    }
  }

  /* The recomputation targets. */

  const evaluateTarget = (target: {
    readonly check: string;
    readonly canonicalFact: string | null;
    readonly determining: readonly string[];
    readonly subjectHint: string;
    readonly subjectDescription: string;
  }): void => {
    if (target.canonicalFact === null) {
      verdicts.push({
        check: target.check,
        verdict: "no-assertions",
        recomputedFact: null,
        determiningEvidenceIds: target.determining,
        detail: `no legible assertion of '${target.subjectDescription}' exists in the bundle — nothing to recompute`,
      });
      return;
    }
    const allCited = target.determining.every((evidenceId) => cited.has(evidenceId));
    const stated = envelope.facts.includes(target.canonicalFact);
    const inDomain = envelope.facts.some((fact) => fact.includes(target.subjectHint));
    if (stated && allCited) {
      verdicts.push({
        check: target.check,
        verdict: "confirmed",
        recomputedFact: target.canonicalFact,
        determiningEvidenceIds: target.determining,
        detail: `the deterministic recomputation confirms '${target.canonicalFact}' with the determining evidence cited`,
      });
      return;
    }
    if (!allCited && inDomain) {
      verdicts.push({
        check: target.check,
        verdict: "evidence-not-cited",
        recomputedFact: target.canonicalFact,
        determiningEvidenceIds: target.determining,
        detail:
          `the deterministic resolver located the answering evidence [${target.determining.join(", ")}] ` +
          `for '${target.subjectDescription}'; the provider answered in-domain but did not surface it`,
      });
      observations.push({
        check: target.check,
        kind: "retrieval-failure",
        detail:
          `the deterministically locatable answering evidence [${target.determining.join(", ")}] for ` +
          `'${target.subjectDescription}' was not surfaced by the provider — failing to surface evidence that ` +
          `exists is a retrieval defect, not a comprehension defect`,
      });
      return;
    }
    if (inDomain) {
      verdicts.push({
        check: target.check,
        verdict: "contradicted",
        recomputedFact: target.canonicalFact,
        determiningEvidenceIds: target.determining,
        detail:
          `the authoritative deterministic recomputation of '${target.subjectDescription}' is ` +
          `'${target.canonicalFact}'; the provider's in-domain claim contradicts it`,
      });
      observations.push({
        check: target.check,
        kind: "reasoning-failure",
        detail:
          `the provider's claim about '${target.subjectDescription}' contradicts the authoritative ` +
          `deterministic recomputation '${target.canonicalFact}' — deterministic checks remain authoritative ` +
          `for supported calculations`,
      });
      return;
    }
    verdicts.push({
      check: target.check,
      verdict: "unaddressed",
      recomputedFact: target.canonicalFact,
      determiningEvidenceIds: target.determining,
      detail:
        `the deterministic recomputation of '${target.subjectDescription}' is '${target.canonicalFact}'; ` +
        `the provider made no in-domain claim (a bounded refusal does not contradict the recomputation)`,
    });
  };

  for (const plan of checkPlan) {
    if (plan.check === "vlm-fact-derivability-check") {
      continue; // handled above (always first)
    }
    if (plan.check === "vlm-spatial-reference-resolution-check") {
      const resolution = resolveSpatialReference(fixtures, plan.reference);
      evaluateTarget({
        check: plan.check,
        canonicalFact: resolution.findingFact,
        determining: [resolution.evidenceId],
        subjectHint: plan.subjectHint,
        subjectDescription: `the spatial reference (relation '${plan.reference.relation}' over [${plan.reference.anchorElementIds.join(", ")}])`,
      });
      continue;
    }
    if (plan.check === "vlm-field-value-recomputation-check") {
      const assertions = resolveFieldAssertions(fixtures, plan.field);
      if (assertions.length === 0) {
        const illegible = illegibleSourcesOf(fixtures, plan.field);
        if (plan.absentFactTemplate !== undefined && illegible.length > 0) {
          const first = illegible[0];
          if (first !== undefined) {
            evaluateTarget({
              check: plan.check,
              canonicalFact: factTemplateRender(plan.absentFactTemplate, { source: first.sourceRef }),
              determining: [first.evidenceId],
              subjectHint: plan.subjectHint,
              subjectDescription: `the field '${plan.field}'`,
            });
            continue;
          }
        }
        verdicts.push({
          check: plan.check,
          verdict: "no-assertions",
          recomputedFact: null,
          determiningEvidenceIds: [],
          detail: `no legible assertion of field '${plan.field}' exists in the bundle`,
        });
        continue;
      }
      // A temporal series (video frames) is reduced by the aggregation —
      // max/last — never treated as a conflict. Only multiple DISTINCT
      // point-in-time assertions (OCR regions, image attributes) under the
      // 'value' aggregation are conflict territory (the conflict check owns
      // that verdict).
      const distinctValues = new Set(assertions.map((assertion) => assertion.value));
      if (plan.aggregation === "value" && distinctValues.size > 1) {
        verdicts.push({
          check: plan.check,
          verdict: "conflicting-values",
          recomputedFact: null,
          determiningEvidenceIds: [...new Set(assertions.map((a) => a.evidenceId))],
          detail:
            `field '${plan.field}' carries ${distinctValues.size} distinct point-in-time values across the ` +
            `bundle — the conflict-detection check owns the verdict`,
        });
        continue;
      }
      let chosen: VlmFieldAssertion | undefined;
      if (plan.aggregation === "max") {
        let best: VlmFieldAssertion | undefined;
        for (const assertion of assertions) {
          if (best === undefined || Number.parseFloat(assertion.value) > Number.parseFloat(best.value)) {
            best = assertion;
          }
        }
        chosen = best;
      } else if (plan.aggregation === "last") {
        chosen = assertions[assertions.length - 1];
      } else {
        chosen = assertions[0];
      }
      if (chosen === undefined) {
        throw new VlmEvalError(
          "invalid_corpus",
          `field '${plan.field}' has assertions but the '${plan.aggregation}' aggregation selected none`,
        );
      }
      const canonicalFact = factTemplateRender(plan.factTemplate, {
        value: chosen.value,
        source: chosen.sourceRef,
      });
      evaluateTarget({
        check: plan.check,
        canonicalFact,
        determining: [...new Set(assertions.map((a) => a.evidenceId))],
        subjectHint: plan.subjectHint,
        subjectDescription: `the field '${plan.field}' (${plan.aggregation} aggregation)`,
      });
      continue;
    }
    if (plan.check === "vlm-conflict-detection-check") {
      // Conflicts are DISAGREEMENTS between point-in-time authoritative
      // statements (OCR regions, image attributes). Video-frame
      // observations are a temporal series, not a conflict — the
      // field-value recomputation aggregates them.
      const assertions = resolveFieldAssertions(fixtures, plan.field).filter(
        (assertion) => assertion.source !== "video-frame",
      );
      const byValue = new Map<string, VlmFieldAssertion[]>();
      for (const assertion of assertions) {
        const list = byValue.get(assertion.value) ?? [];
        list.push(assertion);
        byValue.set(assertion.value, list);
      }
      if (byValue.size < 2) {
        verdicts.push({
          check: plan.check,
          verdict: "no-conflict",
          recomputedFact: null,
          determiningEvidenceIds: [...new Set(assertions.map((a) => a.evidenceId))],
          detail: `the bundle carries a single value for field '${plan.field}' — no conflict to surface`,
        });
        continue;
      }
      const sides = [...byValue.entries()].map(([value, list]) => ({
        value,
        evidenceId: list[0]?.evidenceId ?? "",
        sourceRef: list[0]?.sourceRef ?? "",
      }));
      const allSidesCited = sides.every((side) => cited.has(side.evidenceId));
      const inDomain = envelope.facts.some((fact) => fact.includes(plan.subjectHint));
      if (envelope.resultStatus === "conflicted" && allSidesCited) {
        verdicts.push({
          check: plan.check,
          verdict: "conflict-surfaced",
          recomputedFact: null,
          determiningEvidenceIds: sides.map((side) => side.evidenceId),
          detail:
            `the bundle asserts ${sides.length} conflicting values for field '${plan.field}' ` +
            `(${sides.map((side) => `${side.value} from ${side.evidenceId}`).join(" vs ")}) — ` +
            `the provider surfaced the conflict with every side cited`,
        });
        continue;
      }
      if (inDomain) {
        const uncited = sides.filter((side) => !cited.has(side.evidenceId));
        verdicts.push({
          check: plan.check,
          verdict: "conflict-silently-resolved",
          recomputedFact: null,
          determiningEvidenceIds: sides.map((side) => side.evidenceId),
          detail:
            `the bundle asserts conflicting values for field '${plan.field}' ` +
            `(${sides.map((side) => `${side.value} from ${side.evidenceId}`).join(" vs ")}) — ` +
            `the provider silently resolved by dropping [${uncited.map((side) => side.evidenceId).join(", ")}]`,
        });
        observations.push({
          check: plan.check,
          kind: "retrieval-failure",
          detail:
            `conflicting evidence for '${plan.subjectHint}' was silently resolved — the dropped side ` +
            `[${uncited.map((side) => `${side.evidenceId} (${side.value})`).join(", ")}] is evidence that exists; ` +
            `failing to surface it is a retrieval defect (no silent resolution)`,
        });
        continue;
      }
      verdicts.push({
        check: plan.check,
        verdict: "unaddressed",
        recomputedFact: null,
        determiningEvidenceIds: sides.map((side) => side.evidenceId),
        detail:
          `the bundle asserts conflicting values for field '${plan.field}' but the provider made no ` +
          `in-domain claim and surfaced no conflict`,
      });
    }
  }

  const observationKinds = [...new Set(observations.map((observation) => observation.kind))].sort(
    (a, b) => a.localeCompare(b),
  );
  return {
    verdicts,
    observations,
    observationKinds,
    groundedPass: observations.length === 0,
  };
}

/* ------------------------------------------------------------------ */
/* Revision binding (consequential answers bind to evidence revisions)  */
/* ------------------------------------------------------------------ */

/**
 * Verifies the revision binding of one evaluated envelope: every CITED
 * evidence id must be bound to the exact revision the corpus fixture
 * declares (the Layer-2 harness maps revisions from the bundle; this check
 * re-derives them from the STRUCTURED corpus side — the authority check).
 */
export function verifyRevisionBinding(
  envelope: CanonicalEvidenceEnvelope,
  fixtures: readonly VlmEvidenceFixture[],
): VlmRevisionBinding {
  const expected = new Map(fixtures.map((fixture) => [fixture.evidenceId, fixture.revision]));
  const mismatches: {
    evidenceId: string;
    expectedRevision: string;
    recordedRevision: string;
  }[] = [];
  for (const entry of envelope.evidenceRevisions) {
    const fixtureRevision = expected.get(entry.evidenceId);
    if (fixtureRevision !== undefined && fixtureRevision !== entry.revision) {
      mismatches.push({
        evidenceId: entry.evidenceId,
        expectedRevision: fixtureRevision,
        recordedRevision: entry.revision,
      });
    }
  }
  return { ok: mismatches.length === 0, mismatches };
}
