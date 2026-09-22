/**
 * HFX-301 — the natural-language / direct-manipulation EQUIVALENCE
 * evaluation model (types + pure validators).
 *
 * THE GOVERNED EQUIVALENCE BENCHMARK the hardening plan demands ("an
 * explicit natural-language/direct-manipulation equivalence test" —
 * docs/huggingface-hardening-execution-plan.md §HF-3, Day-30 artifact
 * list, Day-21 checkpoint "agent/direct-manipulation semantic equivalence
 * are evidenced"): for a committed corpus of PAIRED authoring tasks, the
 * natural-language path (the PROD-023 agent compiler — imported, never
 * modified) and the direct-manipulation path (the interactive authoring
 * input through the contract's `createOperationIntent`) are driven through
 * the SAME deterministic journey (baseline materialization → apply →
 * validate → BOQ derivation) and their CANONICAL results compared on
 * PROD-029's comparison points (operation identity semantics, post-state
 * digest, validation verdict, BOQ delta) — either CANONICALLY IDENTICAL
 * (equivalent) or an HONESTLY DECLARED difference with the closed-vocabulary
 * kind (declared-different).
 *
 * GOVERNING DOCTRINE (packages/solution-contract/src/intent.ts + identity.ts
 * — imported FROZEN): PROVENANCE IS NOT SEMANTICS. "The same semantics
 * authored by direct manipulation or an agent IS THE SAME OPERATION";
 * identity derivations EXCLUDE provenance. This benchmark PROVES that
 * structural fact at the JOURNEY level (compile/author → validate → execute
 * → BOQ), and equally EVIDENCES the honest divergences: where the agent
 * path refuses (the unsafe taxonomy — an authority claim or a determinism
 * bypass) or asks (clarification-needed — a missing required slot), the
 * benchmark records those as DESIGNED outcomes, never as equivalence
 * failures. The direct path may still author in those cells — the engine
 * governs both equally.
 *
 * THE FOUR BEHAVIOR-MATRIX CELLS (the closed `EquivalenceExpectation`
 * vocabulary — the negative-case discipline made first-class):
 *
 *  - `equivalent`          both paths produce intents; the canonical
 *                           results are IDENTICAL on every comparison
 *                           point (identity semantics, post-state digest,
 *                           validation verdict, BOQ delta);
 *  - `declared-different`  both paths produce intents; the results differ
 *                           and the corpus entry DECLARES the expected
 *                           difference kind from PROD-029's closed
 *                           vocabulary (REUSED — never a parallel one);
 *  - `agent-refused`       the NL utterance trips the unsafe taxonomy:
 *                           NO intent on the agent path; the refusal
 *                           reason code is the DESIGNED outcome;
 *  - `agent-clarification` the NL utterance misses a required slot:
 *                           `clarification-needed` with the targeted
 *                           question is the DESIGNED outcome.
 *
 * House discipline (the bim-eval / solution-eval exemplars): pure
 * validators over committed data, typed failures with a frozen closed code
 * registry, no zod, no throws inside validators, no clock, no randomness,
 * no I/O.
 */

import { UNSAFE_REFUSAL_REASON_CODES } from "../reasoning/solution/model";
import type {
  AgentSessionContext,
  UnsafeRefusalReasonCode,
} from "../reasoning/solution/model";
import { isFailureKind } from "@aise/provider-registry";
import type { FailureKind } from "@aise/provider-registry";
import type {
  OperationDependency,
  OperationTarget,
  TypedOperationParameter,
} from "@aise/solution-contract";

/* ------------------------------------------------------------------ */
/* Error codes (transport-level, frozen closed registry)                */
/* ------------------------------------------------------------------ */

export const EQUIVALENCE_EVAL_ERROR_CODES = Object.freeze([
  "invalid_request",
  "invalid_pair",
  "invalid_scene",
] as const);
export type EquivalenceEvalErrorCode = (typeof EQUIVALENCE_EVAL_ERROR_CODES)[number];

/** A typed harness error (caller/wiring bugs — never a benchmark outcome). */
export class EquivalenceEvalError extends Error {
  readonly code: EquivalenceEvalErrorCode;
  readonly detail: string;

  constructor(code: EquivalenceEvalErrorCode, detail: string) {
    super(`${code}: ${detail}`);
    this.name = "EquivalenceEvalError";
    this.code = code;
    this.detail = detail;
  }
}

/* ------------------------------------------------------------------ */
/* The four behavior-matrix cells                                       */
/* ------------------------------------------------------------------ */

/**
 * The frozen expectation vocabulary — the four behavior-matrix cells of
 * the equivalence benchmark (see the module header). Corpus entries
 * declare their cell; the harness's observed verdict is checked against
 * the declaration (a flipped or failed expectation is a recorded MISMATCH,
 * never a silent pass).
 */
export const EQUIVALENCE_EXPECTATIONS = Object.freeze([
  "equivalent",
  "declared-different",
  "agent-refused",
  "agent-clarification",
] as const);
export type EquivalenceExpectation = (typeof EQUIVALENCE_EXPECTATIONS)[number];

/** Advisory membership check over the frozen expectation vocabulary. */
export function isEquivalenceExpectation(value: unknown): value is EquivalenceExpectation {
  return (
    typeof value === "string" &&
    (EQUIVALENCE_EXPECTATIONS as readonly string[]).includes(value)
  );
}

/** The refusal reason codes the agent-refused cell may declare (PROD-023's taxonomy). */
export const EQUIVALENCE_REFUSAL_TAXONOMY: readonly UnsafeRefusalReasonCode[] = [
  ...UNSAFE_REFUSAL_REASON_CODES,
];

/* ------------------------------------------------------------------ */
/* The direct-manipulation authoring input (the DM twin)               */
/* ------------------------------------------------------------------ */

/**
 * The interactive authoring input of the direct-manipulation path: the
 * typed semantics an operator asserts in the interactive environment
 * (operation type, typed parameters with units, anchored spatial target,
 * dependency edges) plus the interaction detail the contract's
 * `provenance.interactionDetail` field carries. The harness constructs the
 * DM intent EXCLUSIVELY through the contract's `createOperationIntent`
 * (origin "direct-manipulation") — never a hand-rolled intent object.
 */
export interface DirectAuthoringInput {
  readonly operationType: string;
  readonly parameters: readonly TypedOperationParameter[];
  readonly target: OperationTarget;
  /** Precedence/dependency edges the interactive author asserts. */
  readonly dependsOn?: readonly OperationDependency[];
  /** What the operator did in the interactive environment (provenance). */
  readonly interactionDetail: string;
}

/* ------------------------------------------------------------------ */
/* The equivalence pair (the corpus entry)                              */
/* ------------------------------------------------------------------ */

/**
 * ONE paired authoring task: the NL utterance + the equivalent
 * direct-manipulation authoring input (or the designed-divergent twin) +
 * the baseline scene reference + the session seeds the NL compile runs
 * against + the expectation cell from the closed vocabulary.
 */
export interface EquivalencePair {
  /** Stable corpus id (e.g. "eq-excavation-core"). */
  readonly pairId: string;
  /** The natural-language utterance of the agent path, verbatim. */
  readonly nlUtterance: string;
  /** The direct-manipulation authoring input (the DM twin). */
  readonly direct: DirectAuthoringInput;
  /** The baseline scene the pair runs against (a committed scene id). */
  readonly sceneId: string;
  /**
   * An optional PREREQUISITE direct-manipulation operation BOTH journeys
   * apply BEFORE the pair's operation (the committed journey history): the
   * deterministic way a sequencing pair's dependency edge
   * (`completion-before`) points at an ALREADY-APPLIED operation, exactly
   * as the engine's dependency gating demands. Identical in both paths —
   * the comparison covers the pair's operation and the journey's final
   * canonical results.
   */
  readonly prerequisite?: DirectAuthoringInput;
  /**
   * The caller-assembled session the NL compile runs against (foci,
   * default focus, recent operations — exactly what PROD-023 accepts).
   */
  readonly session: AgentSessionContext;
  /** The declared behavior-matrix cell. */
  readonly expectation: EquivalenceExpectation;
  /**
   * Required iff `expectation` is "declared-different": the closed-vocabulary
   * difference kind the harness MUST record when it catches the divergence
   * (PROD-029's failure vocabulary, reused — never a parallel one).
   */
  readonly declaredDifferenceKind?: FailureKind;
  /** Corpus provenance notes (derived-from citations, coverage rationale). */
  readonly notes?: string;
}

/* ------------------------------------------------------------------ */
/* Pair validation (pure, fail-closed)                                  */
/* ------------------------------------------------------------------ */

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/** One structural validation finding of an equivalence pair. */
export interface EquivalencePairValidationFailure {
  readonly path: string;
  readonly detail: string;
}

export type EquivalencePairValidation =
  | { readonly ok: true; readonly pair: EquivalencePair }
  | { readonly ok: false; readonly failures: readonly EquivalencePairValidationFailure[] };

/**
 * Validates one committed pair (fail-closed; the corpus and any ad-hoc pair
 * pass through THIS validator before evaluation). Checks: unique non-empty
 * ids, a non-empty utterance, a structurally present direct input with ≥1
 * typed parameter and an anchored target, a non-empty session, the closed
 * expectation vocabulary, and the declared-difference consistency rule
 * (declared-different REQUIRES a closed-vocabulary kind; every other cell
 * must NOT declare one).
 */
export function validateEquivalencePair(pair: unknown): EquivalencePairValidation {
  const failures: EquivalencePairValidationFailure[] = [];
  const fail = (path: string, detail: string): void => {
    failures.push({ path, detail });
  };

  if (!isRecord(pair)) {
    return {
      ok: false,
      failures: [{ path: "$", detail: "an equivalence pair must be a JSON object" }],
    };
  }
  if (!isNonEmptyString(pair["pairId"])) {
    fail("pairId", "must be a non-empty string");
  }
  if (!isNonEmptyString(pair["nlUtterance"])) {
    fail("nlUtterance", "must be a non-empty string (the NL path compiles it verbatim)");
  }

  const direct = pair["direct"];
  if (!isRecord(direct)) {
    fail("direct", "must be an object (the direct-manipulation authoring input)");
  } else {
    if (!isNonEmptyString(direct["operationType"])) {
      fail("direct.operationType", "must be a non-empty string");
    }
    if (
      !Array.isArray(direct["parameters"]) ||
      (direct["parameters"] as unknown[]).length === 0
    ) {
      fail(
        "direct.parameters",
        "must be a non-empty array of typed parameters (the contract requires ≥1)",
      );
    }
    const target = direct["target"];
    if (!isRecord(target)) {
      fail("direct.target", "must be an object (the anchored spatial target)");
    } else {
      const nodeRefs = target["nodeRefs"];
      const geometryRefs = target["geometryRefs"];
      if (
        !Array.isArray(nodeRefs) ||
        (nodeRefs as unknown[]).length === 0 ||
        !Array.isArray(geometryRefs) ||
        (geometryRefs as unknown[]).length === 0
      ) {
        fail(
          "direct.target",
          "must anchor to reality (≥1 nodeRef and ≥1 geometryRef — the contract's anchoring invariant)",
        );
      }
    }
    if (!isNonEmptyString(direct["interactionDetail"])) {
      fail(
        "direct.interactionDetail",
        "must be a non-empty string (the provenance the contract carries for direct-manipulation origin)",
      );
    }
  }

  if (!isRecord(pair["session"]) || !isNonEmptyString(pair["session"]["sessionId"])) {
    fail("session", "must be an object carrying a non-empty sessionId");
  }

  const expectation = pair["expectation"];
  if (!isEquivalenceExpectation(expectation)) {
    fail(
      "expectation",
      `must be one of the closed behavior-matrix cells [${EQUIVALENCE_EXPECTATIONS.join(", ")}]`,
    );
  } else if (expectation === "declared-different") {
    if (!isFailureKind(pair["declaredDifferenceKind"])) {
      fail(
        "declaredDifferenceKind",
        "a 'declared-different' pair MUST declare its difference kind from the CLOSED failure vocabulary (PROD-029's) — the honest difference is declared up front, never discovered silently",
      );
    }
  } else if (pair["declaredDifferenceKind"] !== undefined) {
    fail(
      "declaredDifferenceKind",
      `only a 'declared-different' pair may declare a difference kind (this pair expects '${expectation}')`,
    );
  }

  if (failures.length > 0) {
    return { ok: false, failures };
  }
  return { ok: true, pair: pair as unknown as EquivalencePair };
}

/* ------------------------------------------------------------------ */
/* The comparison points (PROD-029's, reused)                          */
/* ------------------------------------------------------------------ */

/**
 * The canonical comparison points of the equivalence journey — REUSED from
 * PROD-029's `COMPARISON_POINT_KINDS` (backend/api/src/solution-eval —
 * imported, never modified): operation identity semantics, post-state
 * digest, validation verdict and BOQ line. `quantity-value` (the engine's
 * traced quantity rows) rides the boq-line comparison through the derived
 * BOQ's cited calculation references — the four journey-level points the
 * plan names are the pinned set.
 */
export const EQUIVALENCE_COMPARISON_POINTS = Object.freeze([
  "operation-identity",
  "state-digest",
  "validation-verdict",
  "boq-line",
] as const);
export type EquivalenceComparisonPoint = (typeof EQUIVALENCE_COMPARISON_POINTS)[number];

/* ------------------------------------------------------------------ */
/* The per-path journey record                                          */
/* ------------------------------------------------------------------ */

/** What the NL compile produced on the agent path (the typed union echo). */
export type AgentPathCompile =
  | {
      readonly kind: "operation-intent";
      readonly compilerPath: string;
    }
  | {
      readonly kind: "unsafe-refusal";
      readonly reasonCode: UnsafeRefusalReasonCode;
      readonly reason: string;
    }
  | {
      readonly kind: "clarification-needed";
      readonly questions: readonly {
        readonly slotKind: string;
        readonly slot: string;
        readonly question: string;
      }[];
    };

/** The engine journey outcome of ONE authored intent (either path). */
export interface JourneyOutcome {
  /** The authored intent that entered the journey (when one was produced). */
  readonly intentId: string | null;
  readonly application:
    | { readonly outcome: "applied"; readonly operationId: string }
    | { readonly outcome: "refused"; readonly reasonCodes: readonly string[] }
    | { readonly outcome: "not-run" };
  /** The derived post-state digest of the journey's final state (applied only). */
  readonly stateDigest: string | null;
  /** The deterministic validation verdict of the journey's version. */
  readonly validationOutcome: string | null;
  /** The BOQ delta lines (canonical projection), null when not derivable. */
  readonly boqLines: readonly unknown[] | null;
  /** The canonical digest of the BOQ delta lines (null when not derivable). */
  readonly boqDigest: string | null;
}

/** The per-path record of one equivalence evaluation. */
export interface EquivalencePathRecord {
  /** What the agent path compiled (the typed command outcome). */
  readonly agentCompile: AgentPathCompile;
  /** The direct path's authored intent id (always authored). */
  readonly directIntentId: string;
  /** The engine journey of the AGENT path (run iff the compile produced an intent). */
  readonly agentJourney: JourneyOutcome;
  /** The engine journey of the DIRECT path (always run). */
  readonly directJourney: JourneyOutcome;
}

/* ------------------------------------------------------------------ */
/* The evaluation outcome                                               */
/* ------------------------------------------------------------------ */

/** One typed per-point result of the equivalence comparison. */
export interface EquivalencePointResult {
  readonly pointKind: EquivalenceComparisonPoint;
  readonly agentValue: string;
  readonly directValue: string;
  readonly equal: boolean;
  /** Present iff unequal: the closed-vocabulary kind for THIS point. */
  readonly differenceKind?: FailureKind;
  readonly detail: string;
}

/**
 * The typed comparison verdict of an evaluated pair:
 *
 *  - `equivalent` — every comparison point equal across both journeys;
 *  - `declared-different` — ≥1 divergent point, carrying the FIRST
 *    divergent point's closed-vocabulary kind (PROD-029's
 *    DIVERGENCE_KIND_BY_POINT mapping — reused) plus the distinct kinds of
 *    all divergent points (deterministic order);
 *  - `agent-refused` / `agent-clarification` — the designed agent-path
 *    outcomes (no cross-path comparison exists: the agent path produced no
 *    intent; the direct journey's results are recorded alongside).
 */
export interface EquivalenceComparison {
  readonly verdict: EquivalenceExpectation;
  /** The per-point results (present iff both paths ran the journey). */
  readonly points: readonly EquivalencePointResult[];
  /** Present iff verdict is declared-different: the first divergent kind. */
  readonly differenceKind?: FailureKind;
  /** The distinct difference kinds of all divergent points (deterministic order). */
  readonly differenceKinds: readonly FailureKind[];
}

/** The full deterministic outcome of ONE equivalence-pair evaluation. */
export interface EquivalenceOutcome {
  readonly pairId: string;
  readonly expectation: EquivalenceExpectation;
  /** The observed behavior-matrix cell (the harness's verdict). */
  readonly observed: EquivalenceExpectation;
  /** True iff the observed cell + divergence kind satisfy the declaration. */
  readonly expectationMet: boolean;
  readonly paths: EquivalencePathRecord;
  readonly comparison: EquivalenceComparison | null;
  readonly benchmarkRecordId: string;
  readonly provenanceManifestId: string;
}
