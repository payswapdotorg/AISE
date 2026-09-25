/**
 * HFX-401 — the PER-LAYER PROMOTION CHECKLIST (versioned applicability).
 *
 * The work order's demand: "Add a promotion checklist for each layer" — the
 * three AISE capability layers (spec/architecture-lock.md) each declare
 * WHICH of the ten scorecard gates are MANDATORY for a production-default
 * promotion at that layer, and where a justified NA is permitted:
 *
 *   Layer 1 — REALITY    perception / reconstruction
 *   Layer 2 — UNDERSTANDING   document / retrieval / BIM
 *   Layer 3 — SOLUTION   solution / geometry / visual
 *
 * THE LAYER-REGRESSION REQUIREMENT (the work order's dependent-layer gate):
 * a promotion at layer N must cite regression evidence for the dependent
 * layers that consume layer-N outputs. The checklist declares each layer's
 * dependent-layer citation requirement:
 *
 *   Layer 1 → Layer 2 consumes Layer-1 reconstruction/evidence outputs
 *             (readiness + Evidence Envelope consumers);
 *   Layer 2 → Layer 3 consumes Layer-2 Evidence Envelopes (solution
 *             authoring journeys);
 *   Layer 3 → the solution BOQ derivation + the interactive solution
 *             surface consume Layer-3 geometry/validation outputs — the
 *             committed HFX-301 equivalence corpus and the HFX-302 geometry
 *             substitution corpus ARE those regression records.
 *
 * NA DISCIPLINE (machine-checked): a mandatory gate can never be NA — an NA
 * on a mandatory gate blocks eligibility and is named in the refusal. A
 * gate declared na-permitted may be NA ONLY with the layer's declared
 * allowance code, and (where the entry restricts classes) only for the
 * declared provider classes. The one na-permitted cell of the committed
 * checklist: Layer 3's semantic-equivalence is NA-able for BOUNDED VISUAL
 * providers only (HFX-303's doctrine: generated visuals can never change
 * quantities, validation or canonical Solution Graph state — presentation
 * only, so semantic equivalence to canonical geometry is definitionally
 * inapplicable). A Layer-3 GEOMETRY provider can never take that NA.
 *
 * VERSIONED: the checklist is frozen reference data
 * (LAYER_CHECKLIST_VERSION); a change is a governed bump, never an in-place
 * mutation.
 *
 * DETERMINISM: pure functions + frozen constants; no I/O, no clock.
 */

import {
  GATE_VOCABULARY_VERSION,
  PROMOTION_SCORECARD_GATE_IDS,
  SCORECARD_GATES,
  isScorecardGateId,
} from "./gates";
import type { ScorecardGateId, GateOutcome } from "./gates";

/* ------------------------------------------------------------------ */
/* The layers                                                           */
/* ------------------------------------------------------------------ */

/** The three AISE capability layers (spec/architecture-lock.md). */
export const SCORECARD_LAYERS = [1, 2, 3] as const;
export type ScorecardLayer = (typeof SCORECARD_LAYERS)[number];

/** The provider classes each layer governs (the work order's own scope). */
export const LAYER_PROVIDER_CLASSES: Readonly<Record<ScorecardLayer, readonly string[]>> = {
  1: ["perception", "reconstruction"],
  2: ["document", "retrieval", "bim"],
  3: ["solution", "geometry", "visual"],
};

/** The layer's title (the work order's own parenthetical). */
export const LAYER_TITLES: Readonly<Record<ScorecardLayer, string>> = {
  1: "Layer 1 — Reality (perception/reconstruction)",
  2: "Layer 2 — Understanding (document/retrieval/BIM)",
  3: "Layer 3 — Solution (solution/geometry/visual)",
};

/* ------------------------------------------------------------------ */
/* The allowance codes (the machine-checked NA justifications)           */
/* ------------------------------------------------------------------ */

/**
 * The closed NA-allowance vocabulary. An NA on an na-permitted gate MUST
 * carry the layer's declared allowance code — the checklist's own reason,
 * never ad-hoc text.
 */
export const NA_ALLOWANCE_CODES = [
  "layer3-visual-presentation-only",
] as const;
export type NaAllowanceCode = (typeof NA_ALLOWANCE_CODES)[number];

/**
 * The Layer-3 bounded-visual allowance (HFX-303's doctrine): generated
 * visuals are presentation-only — they can never change quantities,
 * validation or canonical Solution Graph state, so semantic equivalence to
 * canonical geometry is definitionally inapplicable FOR VISUAL PROVIDERS
 * ONLY. A geometry or solution provider can never take this NA.
 */
export const LAYER3_VISUAL_PRESENTATION_ONLY: NaAllowanceCode = "layer3-visual-presentation-only";

/* ------------------------------------------------------------------ */
/* The per-gate applicability declaration                               */
/* ------------------------------------------------------------------ */

/**
 * One gate's applicability at one layer:
 *
 *  - mandatory:     must PASS. An NA blocks eligibility (named in the
 *                   refusal); a FAIL blocks eligibility.
 *  - na-permitted:  must PASS or carry a justified NA (the allowance code,
 *                   restricted to the declared provider classes). A FAIL
 *                   still blocks eligibility.
 */
export interface GateApplicability {
  readonly gate: ScorecardGateId;
  readonly applicability: "mandatory" | "na-permitted";
  /** Present for na-permitted: the allowance code a valid NA must carry. */
  readonly naAllowanceCode?: NaAllowanceCode;
  /** Present for na-permitted: the provider classes that may take the NA. */
  readonly naAllowedClasses?: readonly string[];
}

/** One layer's full checklist: the ten gates + the dependent-layer citation. */
export interface LayerChecklist {
  readonly layer: ScorecardLayer;
  readonly title: string;
  readonly providerClasses: readonly string[];
  readonly gates: readonly GateApplicability[];
  /**
   * The dependent-layer regression citation requirement: which committed
   * corpora a promotion at this layer must cite as its dependent-layer
   * regression evidence.
   */
  readonly dependentLayerRegression: {
    readonly statement: string;
    readonly requiredCitationKinds: readonly ("geometry-eval" | "equivalence-eval" | "solution-eval")[];
  };
}

const ALL_MANDATORY: readonly GateApplicability[] = PROMOTION_SCORECARD_GATE_IDS.map(
  (gate) => ({ gate, applicability: "mandatory" as const }),
);

/** The committed per-layer checklists (frozen reference data). */
export const LAYER_CHECKLISTS: Readonly<Record<ScorecardLayer, LayerChecklist>> = {
  1: {
    layer: 1,
    title: LAYER_TITLES[1],
    providerClasses: LAYER_PROVIDER_CLASSES[1],
    gates: ALL_MANDATORY,
    dependentLayerRegression: {
      statement:
        "a Layer-1 production promotion must cite regression evidence for the Layer-2 " +
        "consumers of Layer-1 outputs (readiness + Evidence Envelope consumers) — the " +
        "reconstruction/depth adapter benchmarks (HFX-101/102 discipline)",
      requiredCitationKinds: ["solution-eval"],
    },
  },
  2: {
    layer: 2,
    title: LAYER_TITLES[2],
    providerClasses: LAYER_PROVIDER_CLASSES[2],
    gates: ALL_MANDATORY,
    dependentLayerRegression: {
      statement:
        "a Layer-2 production promotion must cite regression evidence for the Layer-3 " +
        "consumers of Layer-2 Evidence Envelopes (the solution authoring journeys)",
      requiredCitationKinds: ["solution-eval"],
    },
  },
  3: {
    layer: 3,
    title: LAYER_TITLES[3],
    providerClasses: LAYER_PROVIDER_CLASSES[3],
    gates: PROMOTION_SCORECARD_GATE_IDS.map((gate) =>
      gate === "semantic-equivalence"
        ? {
            gate,
            applicability: "na-permitted" as const,
            naAllowanceCode: LAYER3_VISUAL_PRESENTATION_ONLY,
            naAllowedClasses: ["visual"],
          }
        : { gate, applicability: "mandatory" as const },
    ),
    dependentLayerRegression: {
      statement:
        "a Layer-3 production promotion must cite regression evidence for the consumers " +
        "of Layer-3 geometry/validation outputs: the committed HFX-301 equivalence corpus " +
        "(the authoring journeys over the same engine) and the committed HFX-302 geometry " +
        "substitution corpus (the dual-lane quantities/BOQ comparisons)",
      requiredCitationKinds: ["geometry-eval", "equivalence-eval"],
    },
  },
};

/** The checklist's version (a governed change bumps this, never the cells). */
export const LAYER_CHECKLIST_VERSION = "hfx-401/layer-checklist/1" as const;

/* ------------------------------------------------------------------ */
/* The required task-surface (capability coverage per layer)            */
/* ------------------------------------------------------------------ */

/**
 * The Layer-3 required operation-family vocabulary — the documented v1
 * family catalogue a Layer-3 GEOMETRY/SOLUTION provider must cover to be a
 * production default (the contract-conformance gate's coverage leg). The
 * ten families, mirrored from the HFX-302 corpus's committed vocabulary.
 */
export const LAYER3_REQUIRED_OPERATION_FAMILIES: readonly string[] = [
  "excavation",
  "backfill",
  "demolition-removal",
  "foundation-placement",
  "slab-placement",
  "block-wall-placement",
  "opening-creation",
  "plaster-application",
  "building-service-installation",
  "finish-application",
];

/**
 * The required capability coverage per layer + provider class (the
 * contract-conformance gate's coverage leg — what "covers the layer's
 * required task surface" means, machine-checkable). Classes not listed
 * carry no committed coverage requirement in this checklist version.
 */
export const REQUIRED_CAPABILITY_COVERAGE: Readonly<
  Record<ScorecardLayer, Readonly<Record<string, readonly string[]>>>
> = {
  1: {},
  2: {},
  3: {
    geometry: LAYER3_REQUIRED_OPERATION_FAMILIES,
    solution: LAYER3_REQUIRED_OPERATION_FAMILIES,
  },
};

/* ------------------------------------------------------------------ */
/* Pure lookups + validation                                            */
/* ------------------------------------------------------------------ */

/** The checklist of one layer (fail-closed on unknown layers). */
export function layerChecklistOf(layer: number): LayerChecklist {
  if (!(SCORECARD_LAYERS as readonly number[]).includes(layer)) {
    throw new Error(
      `provider-scorecard layers: unknown layer ${layer} (the AISE capability layers are 1, 2, 3)`,
    );
  }
  return LAYER_CHECKLISTS[layer as ScorecardLayer];
}

/** The applicability of one gate at one layer. */
export function gateApplicabilityOf(layer: ScorecardLayer, gate: ScorecardGateId): GateApplicability {
  const checklist = LAYER_CHECKLISTS[layer];
  const found = checklist.gates.find((entry) => entry.gate === gate);
  if (found === undefined) {
    throw new Error(
      `provider-scorecard layers: gate '${gate}' has no applicability cell at layer ${layer} (fixture bug)`,
    );
  }
  return found;
}

/** Closed vocabulary of checklist-conformance failure kinds. */
export const CHECKLIST_FAILURE_KINDS = [
  "unknown-layer",
  "unknown-provider-class",
  "unknown-gate",
  "na-on-mandatory-gate",
  "na-without-allowance-code",
  "na-allowance-not-permitted",
  "na-class-not-permitted",
  "gate-not-in-checklist",
  "missing-dependent-citation",
] as const;
export type ChecklistFailureKind = (typeof CHECKLIST_FAILURE_KINDS)[number];

/** One typed checklist-conformance failure. */
export interface ChecklistFailure {
  readonly kind: ChecklistFailureKind;
  readonly detail: string;
}

/**
 * Checks one provider's recorded gate outcomes against its layer's
 * checklist. PURE, typed failures, no throws:
 *
 *  - an NA on a MANDATORY gate → `na-on-mandatory-gate` (blocks eligibility;
 *    the promotion engine names it in the refusal);
 *  - an NA on an na-permitted gate without the declared allowance code →
 *    `na-without-allowance-code`;
 *  - an NA whose provider class is not permitted the allowance →
 *    `na-class-not-permitted`;
 *  - an unknown layer/class → typed refusal.
 */
export function checkChecklistConformance(
  layer: number,
  providerClass: string,
  outcomes: readonly GateOutcome[],
): { readonly ok: true } | { readonly ok: false; readonly failures: readonly ChecklistFailure[] } {
  const failures: ChecklistFailure[] = [];
  if (!(SCORECARD_LAYERS as readonly number[]).includes(layer)) {
    return {
      ok: false,
      failures: [
        {
          kind: "unknown-layer",
          detail: `layer ${layer} is not one of the AISE capability layers (1, 2, 3)`,
        },
      ],
    };
  }
  const checklist = LAYER_CHECKLISTS[layer as ScorecardLayer];
  if (!checklist.providerClasses.includes(providerClass)) {
    failures.push({
      kind: "unknown-provider-class",
      detail:
        `provider class '${providerClass}' is not governed at layer ${layer} ` +
        `(classes: [${checklist.providerClasses.join(", ")}])`,
    });
  }
  for (const outcome of outcomes) {
    if (!isScorecardGateId(outcome.gate)) {
      failures.push({
        kind: "unknown-gate",
        detail: `gate '${String(outcome.gate)}' is not in the closed ten-gate vocabulary`,
      });
      continue;
    }
    const applicability = gateApplicabilityOf(layer as ScorecardLayer, outcome.gate);
    if (outcome.outcome !== "na") {
      continue;
    }
    if (applicability.applicability === "mandatory") {
      failures.push({
        kind: "na-on-mandatory-gate",
        detail:
          `gate '${outcome.gate}' is MANDATORY at layer ${layer} — an NA blocks production ` +
          `eligibility and is named in the refusal`,
      });
      continue;
    }
    if (outcome.naAllowanceCode !== applicability.naAllowanceCode) {
      failures.push({
        kind: "na-without-allowance-code",
        detail:
          `the NA on '${outcome.gate}' must carry the layer-${layer} allowance code ` +
          `'${String(applicability.naAllowanceCode)}'`,
      });
    }
    if (
      applicability.naAllowedClasses !== undefined &&
      !applicability.naAllowedClasses.includes(providerClass)
    ) {
      failures.push({
        kind: "na-class-not-permitted",
        detail:
          `the NA allowance on '${outcome.gate}' at layer ${layer} is reserved for ` +
          `[${applicability.naAllowedClasses.join(", ")}] providers — '${providerClass}' cannot take it`,
      });
    }
  }
  if (failures.length > 0) {
    return { ok: false, failures };
  }
  return { ok: true };
}

/**
 * The machine-checkable coverage requirement for one provider (the
 * contract-conformance gate's coverage leg): the required family list for
 * its layer+class, or an empty list when none is declared.
 */
export function requiredCapabilityCoverageOf(layer: number, providerClass: string): readonly string[] {
  if (!(SCORECARD_LAYERS as readonly number[]).includes(layer)) {
    throw new Error(`provider-scorecard layers: unknown layer ${layer}`);
  }
  return REQUIRED_CAPABILITY_COVERAGE[layer as ScorecardLayer][providerClass] ?? [];
}

/** The dependent-layer citation requirement of one layer. */
export function dependentLayerRegressionOf(
  layer: number,
): LayerChecklist["dependentLayerRegression"] {
  if (!(SCORECARD_LAYERS as readonly number[]).includes(layer)) {
    throw new Error(`provider-scorecard layers: unknown layer ${layer}`);
  }
  return LAYER_CHECKLISTS[layer as ScorecardLayer].dependentLayerRegression;
}

/**
 * The canonical projection of the whole committed checklist (the committed
 * `layer-checklist.json` content — presentation of the frozen reference
 * data; the constants above stay the authority).
 */
export function layerChecklistProjectionJson(): unknown {
  return {
    checklistVersion: LAYER_CHECKLIST_VERSION,
    gateVocabularyVersion: GATE_VOCABULARY_VERSION,
    layers: SCORECARD_LAYERS.map((layer) => {
      const checklist = LAYER_CHECKLISTS[layer];
      return {
        layer,
        title: checklist.title,
        providerClasses: [...checklist.providerClasses],
        gates: checklist.gates.map((entry) => ({
          gate: entry.gate,
          title: SCORECARD_GATES.find((gate) => gate.id === entry.gate)?.title ?? "",
          applicability: entry.applicability,
          ...(entry.naAllowanceCode === undefined ? {} : { naAllowanceCode: entry.naAllowanceCode }),
          ...(entry.naAllowedClasses === undefined
            ? {}
            : { naAllowedClasses: [...entry.naAllowedClasses] }),
        })),
        dependentLayerRegression: {
          statement: checklist.dependentLayerRegression.statement,
          requiredCitationKinds: [...checklist.dependentLayerRegression.requiredCitationKinds],
        },
        requiredCapabilityCoverage: Object.fromEntries(
          Object.entries(REQUIRED_CAPABILITY_COVERAGE[layer]).map(
            ([providerClass, families]) => [providerClass, [...families]],
          ),
        ),
      };
    }),
  };
}
