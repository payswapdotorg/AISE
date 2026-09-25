/**
 * HFX-401 — the provider SCORECARD GATE vocabulary.
 *
 * The cross-layer promotion gate's ten dimensions, VERBATIM from the HFX-401
 * work order (docs/productization-layer-hardening-work-orders.md, "Cross-layer
 * promotion gate" — acceptance criteria): a provider may not become the
 * production default solely because it has better task metrics; promotion
 * requires ALL applicable gates:
 *
 *   contract conformance + semantic equivalence + negative/discrimination
 *   behavior + provenance continuity + uncertainty behavior + failure/
 *   unsupported behavior + dependent-layer regression + license/use clearance
 *   + cost/quota safety + historical interpretability
 *
 * THE EVIDENCE DOCTRINE (binding, from the same work order's evidence
 * requirement): every dimension carries PASS/FAIL/NA plus a committed
 * evidence pointer — a test name, a runner output, a committed benchmark
 * record id or a license declaration. A dimension without an evidence
 * pointer is not recorded; "it looked right" is not evidence.
 *
 * CLOSED + VERSIONED: the ten ids, the four evidence kinds and the three
 * outcome kinds are frozen reference data. Adding, renaming or removing one
 * is a governed vocabulary change (a new GATE_VOCABULARY_VERSION — never an
 * in-place mutation); `validateGateOutcome` refuses every invented id/kind,
 * every outcome without an evidence pointer, and every NA without a reason.
 *
 * The three control-plane gates of HFX-000 (license-use-clearance,
 * benchmark-evidence, provenance-continuity — PROMOTION_GATE_IDS of
 * `@aise/provider-registry`, imported and never modified) are the SEED of
 * this checklist: license-use-clearance and provenance-continuity appear
 * here as first-class dimensions; benchmark-evidence is the scorecard's
 * CONSUMED CORPUS (the committed benchmark records the scorecard digests)
 * rather than a gate row, and the mapping is declared in
 * CONTROL_PLANE_GATE_MAPPING below (documented, versioned — the control
 * plane's own machine stays canonical).
 *
 * DETERMINISM: pure functions + frozen constants; no I/O, no clock, no
 * randomness. Identical constructions are byte-identical.
 */

/* ------------------------------------------------------------------ */
/* The vocabulary (frozen reference data)                               */
/* ------------------------------------------------------------------ */

/** The vocabulary's version (a governed change bumps this, never the ids). */
export const GATE_VOCABULARY_VERSION = "hfx-401/gate-vocabulary/1" as const;

/**
 * The ten promotion-gate ids — the work order's list verbatim (kebab-case).
 * ORDER IS FROZEN (the work order's own order): contract conformance,
 * semantic equivalence, negative/discrimination behavior, provenance
 * continuity, uncertainty behavior, failure/unsupported behavior,
 * dependent-layer regression, license/use clearance, cost/quota safety,
 * historical interpretability.
 */
export const PROMOTION_SCORECARD_GATE_IDS = [
  "contract-conformance",
  "semantic-equivalence",
  "negative-discrimination-behavior",
  "provenance-continuity",
  "uncertainty-behavior",
  "failure-unsupported-behavior",
  "dependent-layer-regression",
  "license-use-clearance",
  "cost-quota-safety",
  "historical-interpretability",
] as const;
export type ScorecardGateId = (typeof PROMOTION_SCORECARD_GATE_IDS)[number];

/** One closed-vocabulary entry: the id plus its work-order title. */
export interface ScorecardGateDefinition {
  readonly id: ScorecardGateId;
  /** The work order's own dimension name (verbatim). */
  readonly title: string;
  /** What the gate proves (one sentence, the work order's demand). */
  readonly requirement: string;
  /** The evidence KINDS this gate accepts (at least one; closed set). */
  readonly evidenceKinds: readonly GateEvidenceKind[];
}

/**
 * The ten gates with their titles, requirements and accepted evidence kinds.
 * Order is the frozen work-order order (mirrors PROMOTION_SCORECARD_GATE_IDS).
 */
export const SCORECARD_GATES: readonly ScorecardGateDefinition[] = [
  {
    id: "contract-conformance",
    title: "contract conformance",
    requirement:
      "the provider's exchanged payloads conform to the AISE-side declared input/output " +
      "contracts through the normalized boundary (no provider-specific field ever crosses " +
      "the canonical boundary), and its declared capabilities cover the layer's required " +
      "task surface for a production default",
    evidenceKinds: ["committed-benchmark-id", "test-name", "runner-record"],
  },
  {
    id: "semantic-equivalence",
    title: "semantic equivalence",
    requirement:
      "equivalent supported inputs produce semantically compatible proposed states, " +
      "quantities, validation decisions and derived projections within the provider's " +
      "DECLARED tolerances — provider replacement does not change AISE solution semantics",
    evidenceKinds: ["committed-benchmark-id", "test-name", "runner-record"],
  },
  {
    id: "negative-discrimination-behavior",
    title: "negative/discrimination behavior",
    requirement:
      "hard negatives and designed divergences are CAUGHT (a benchmark that cannot fail " +
      "is not a benchmark): unsupported inputs answer with explicit typed refusal, never " +
      "fabricated output; discrimination cases are measurably distinguished",
    evidenceKinds: ["committed-benchmark-id", "test-name", "runner-record"],
  },
  {
    id: "provenance-continuity",
    title: "provenance continuity",
    requirement:
      "provider identity, version, configuration and input digests are retained in " +
      "portable, digest-verifiable provenance sealed against the provider's profile " +
      "digest — a provider swap preserves provenance",
    evidenceKinds: ["committed-benchmark-id", "runner-record", "test-name"],
  },
  {
    id: "uncertainty-behavior",
    title: "uncertainty behavior",
    requirement:
      "confidence is kept SEPARATE from measurement uncertainty; declared residuals are " +
      "recorded as observed deltas, never fabricated into confidence scores; drift and " +
      "instability surface as explicit uncertainty or evidence-gap results",
    evidenceKinds: ["runner-record", "test-name", "committed-benchmark-id"],
  },
  {
    id: "failure-unsupported-behavior",
    title: "failure/unsupported behavior",
    requirement:
      "unknown, unsupported and failure states are EXPLICIT and safe (the closed failure " +
      "vocabulary), answered before execution by the fail-closed gate — never a silent " +
      "coercion, never a fabricated result",
    evidenceKinds: ["committed-benchmark-id", "test-name", "runner-record"],
  },
  {
    id: "dependent-layer-regression",
    title: "dependent-layer regression",
    requirement:
      "a promotion at layer N cites regression evidence for the dependent layers that " +
      "consume layer-N outputs (e.g. a Layer-3 geometry provider cites the solution-eval " +
      "/ geometry-eval regression records)",
    evidenceKinds: ["committed-benchmark-id", "runner-record", "test-name"],
  },
  {
    id: "license-use-clearance",
    title: "license/use clearance",
    requirement:
      "licensing AND intended-use terms are explicitly cleared for the intended " +
      "production use (the dataset/model-use rule: training and evaluation are separate " +
      "decisions; nothing evaluation-only enters a commercial pipeline silently)",
    evidenceKinds: ["license-declaration", "runner-record"],
  },
  {
    id: "cost-quota-safety",
    title: "cost/quota safety",
    requirement:
      "the cost envelope is declared (cost model, unit cost, quota policy) with a safe " +
      "fallback when the provider is unavailable or too expensive — no unbounded spend, " +
      "no silent quota exhaustion",
    evidenceKinds: ["runner-record", "test-name"],
  },
  {
    id: "historical-interpretability",
    title: "historical interpretability",
    requirement:
      "the provider can be retired while every historical record naming it remains " +
      "interpretable (the append-only registry's retired-provider discipline: records, " +
      "manifests and decisions stay replayable after retirement)",
    evidenceKinds: ["runner-record", "test-name", "committed-benchmark-id"],
  },
];

/* ------------------------------------------------------------------ */
/* Evidence + outcome types                                             */
/* ------------------------------------------------------------------ */

/**
 * The closed evidence-kind vocabulary — the evidence doctrine's four pointer
 * kinds: a committed test name, a runner output record, a committed
 * benchmark record id, or a license declaration.
 */
export const GATE_EVIDENCE_KINDS = [
  "test-name",
  "runner-record",
  "committed-benchmark-id",
  "license-declaration",
] as const;
export type GateEvidenceKind = (typeof GATE_EVIDENCE_KINDS)[number];

/** One evidence pointer (kind + the committed pointer itself). */
export interface GateEvidence {
  readonly kind: GateEvidenceKind;
  /**
   * The committed pointer: a test name (e.g. "harness.test.ts > the
   * tolerance-breach twin is caught"), a runner record id/path, a 64-hex
   * committed benchmark record id, or a license declaration reference.
   */
  readonly pointer: string;
}

/** The closed outcome vocabulary: pass | fail | na (never free text). */
export const GATE_OUTCOMES = ["pass", "fail", "na"] as const;
export type GateOutcomeKind = (typeof GATE_OUTCOMES)[number];

/**
 * One recorded gate outcome. PASS/FAIL/NA plus the committed evidence
 * pointer — a dimension without an evidence pointer is not recorded.
 */
export interface GateOutcome {
  readonly gate: ScorecardGateId;
  readonly outcome: GateOutcomeKind;
  /** REQUIRED for "na": the machine-checked justification. */
  readonly naReason?: string;
  /** The allowance code the layer checklist permits for this NA (layers.ts). */
  readonly naAllowanceCode?: string;
  /** The human-auditable statement of what the evidence shows. */
  readonly statement: string;
  /** The committed evidence pointer(s) — at least one, always. */
  readonly evidence: readonly GateEvidence[];
}

/* ------------------------------------------------------------------ */
/* The control-plane gate mapping (documented, versioned)               */
/* ------------------------------------------------------------------ */

/**
 * How the control plane's own three promotion gates (HFX-000's
 * PROMOTION_GATE_IDS — imported, never modified) map onto this checklist.
 * The control plane's machine stays CANONICAL; this mapping is a declared
 * projection, not a second machine.
 */
export const CONTROL_PLANE_GATE_MAPPING_VERSION =
  "hfx-401/control-plane-gate-mapping/1" as const;

/** One control-plane gate → scorecard dimension mapping entry. */
export interface ControlPlaneGateMappingEntry {
  /** The control plane's own gate id (HFX-000 PROMOTION_GATE_IDS). */
  readonly controlPlaneGateId: "license-use-clearance" | "benchmark-evidence" | "provenance-continuity";
  /** Where it lives on the HFX-401 scorecard. */
  readonly scorecardDimension:
    | "license-use-clearance"
    | "provenance-continuity"
    | "benchmark-corpus";
  readonly statement: string;
}

export const CONTROL_PLANE_GATE_MAPPING: readonly ControlPlaneGateMappingEntry[] = [
  {
    controlPlaneGateId: "license-use-clearance",
    scorecardDimension: "license-use-clearance",
    statement:
      "the control plane's license/use gate IS the scorecard's license-use-clearance " +
      "dimension: the profile's license declaration (commercialUse AND intendedUseCleared) " +
      "decides both identically — an evaluation-only provider can pass neither",
  },
  {
    controlPlaneGateId: "provenance-continuity",
    scorecardDimension: "provenance-continuity",
    statement:
      "the control plane's provenance gate IS the scorecard's provenance-continuity " +
      "dimension: at least one portable manifest sealed against the profile digest",
  },
  {
    controlPlaneGateId: "benchmark-evidence",
    scorecardDimension: "benchmark-corpus",
    statement:
      "the control plane's benchmark gate (at least one attached benchmark record for " +
      "THIS provider+version) is the scorecard's CONSUMED CORPUS precondition — a " +
      "scorecard is only built over providers with committed benchmark records; the " +
      "task-metric dimensions themselves (semantic equivalence, negative/discrimination, " +
      "dependent-layer regression) are HFX-401 additions the control plane does not check",
  },
];

/* ------------------------------------------------------------------ */
/* Pure lookups                                                         */
/* ------------------------------------------------------------------ */

const GATE_ID_SET: ReadonlySet<string> = new Set(PROMOTION_SCORECARD_GATE_IDS);
const EVIDENCE_KIND_SET: ReadonlySet<string> = new Set(GATE_EVIDENCE_KINDS);
const OUTCOME_SET: ReadonlySet<string> = new Set(GATE_OUTCOMES);

/** Type guard: is this unknown value one of the ten closed gate ids? */
export function isScorecardGateId(value: unknown): value is ScorecardGateId {
  return typeof value === "string" && GATE_ID_SET.has(value);
}

/** Type guard: is this unknown value one of the four closed evidence kinds? */
export function isGateEvidenceKind(value: unknown): value is GateEvidenceKind {
  return typeof value === "string" && EVIDENCE_KIND_SET.has(value);
}

/** Type guard: is this unknown value one of the three closed outcomes? */
export function isGateOutcomeKind(value: unknown): value is GateOutcomeKind {
  return typeof value === "string" && OUTCOME_SET.has(value);
}

/** The definition of one closed gate id (fail-closed: throws on invented ids). */
export function gateDefinitionOf(id: ScorecardGateId): ScorecardGateDefinition {
  const found = SCORECARD_GATES.find((gate) => gate.id === id);
  if (found === undefined) {
    throw new Error(`provider-scorecard gates: unknown gate id '${id}' (fixture bug)`);
  }
  return found;
}

/* ------------------------------------------------------------------ */
/* Typed validation failures                                            */
/* ------------------------------------------------------------------ */

/** Closed vocabulary of gate-outcome validation failure kinds. */
export const GATE_OUTCOME_FAILURE_KINDS = [
  "not-an-object",
  "unknown-gate",
  "unknown-outcome",
  "unknown-evidence-kind",
  "missing-evidence",
  "na-without-reason",
  "empty-statement",
  "evidence-kind-not-accepted",
  "not-a-list",
] as const;
export type GateOutcomeFailureKind = (typeof GATE_OUTCOME_FAILURE_KINDS)[number];

/** One typed gate-outcome validation failure (stable kind + path + detail). */
export interface GateOutcomeFailure {
  readonly kind: GateOutcomeFailureKind;
  readonly path: string;
  readonly detail: string;
}

export type GateOutcomeValidation =
  | { readonly ok: true; readonly outcome: GateOutcome }
  | { readonly ok: false; readonly failures: readonly GateOutcomeFailure[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Validates one unknown payload as a `GateOutcome`. PURE, typed failures, no
 * throws. THE EVIDENCE DOCTRINE IS ENFORCED HERE: an outcome without at
 * least one evidence pointer of an ACCEPTED kind is refused
 * (`missing-evidence` / `evidence-kind-not-accepted`), and an NA without a
 * reason is refused (`na-without-reason`) — "it looked right" is not
 * evidence.
 */
export function validateGateOutcome(input: unknown): GateOutcomeValidation {
  if (!isRecord(input)) {
    return {
      ok: false,
      failures: [
        {
          kind: "not-an-object",
          path: "",
          detail: "a gate outcome must be a JSON object",
        },
      ],
    };
  }
  const failures: GateOutcomeFailure[] = [];
  const fail = (kind: GateOutcomeFailureKind, path: string, detail: string): void => {
    failures.push({ kind, path, detail });
  };

  const gate = input["gate"];
  if (!isScorecardGateId(gate)) {
    fail(
      "unknown-gate",
      "gate",
      `'${String(gate)}' is not in the CLOSED ten-gate vocabulary (${GATE_VOCABULARY_VERSION}) — ` +
        `scorecards cannot invent gate dimensions`,
    );
  }

  const outcome = input["outcome"];
  if (!isGateOutcomeKind(outcome)) {
    fail(
      "unknown-outcome",
      "outcome",
      `'${String(outcome)}' is not one of pass | fail | na — no free-text gate outcomes`,
    );
  }

  const naReason = input["naReason"];
  if (outcome === "na") {
    if (!isNonEmptyString(naReason)) {
      fail(
        "na-without-reason",
        "naReason",
        "an NA outcome REQUIRES a non-empty reason — an inapplicable dimension must say why",
      );
    }
  } else if (naReason !== undefined) {
    fail(
      "na-without-reason",
      "naReason",
      "naReason may only be present on an 'na' outcome",
    );
  }

  if (!isNonEmptyString(input["statement"])) {
    fail(
      "empty-statement",
      "statement",
      "every gate outcome carries an auditable statement of what its evidence shows",
    );
  }

  const evidence = input["evidence"];
  if (!Array.isArray(evidence)) {
    fail("not-a-list", "evidence", "evidence must be an array of evidence pointers");
  } else if (evidence.length === 0) {
    fail(
      "missing-evidence",
      "evidence",
      "THE EVIDENCE DOCTRINE: a dimension without an evidence pointer is not recorded — " +
        "cite a test name, a runner record, a committed benchmark record id or a license declaration",
    );
  } else {
    const accepted = isScorecardGateId(gate) ? new Set(gateDefinitionOf(gate).evidenceKinds) : null;
    for (const [index, entry] of evidence.entries()) {
      const path = `evidence[${index}]`;
      if (!isRecord(entry)) {
        fail("not-an-object", path, "an evidence pointer must be a { kind, pointer } object");
        continue;
      }
      const kind = entry["kind"];
      if (!isGateEvidenceKind(kind)) {
        fail(
          "unknown-evidence-kind",
          `${path}.kind`,
          `'${String(kind)}' is not in the CLOSED evidence-kind vocabulary ` +
            `(test-name | runner-record | committed-benchmark-id | license-declaration)`,
        );
      } else if (accepted !== null && !accepted.has(kind)) {
        fail(
          "evidence-kind-not-accepted",
          `${path}.kind`,
          `gate '${String(gate)}' accepts evidence kinds [${[...accepted].join(", ")}] — '${kind}' is not among them`,
        );
      }
      if (!isNonEmptyString(entry["pointer"]) || (entry["pointer"] as string).length > 2048) {
        fail(
          "missing-evidence",
          `${path}.pointer`,
          "an evidence pointer must be a non-empty committed reference (max 2048)",
        );
      }
    }
  }

  if (failures.length > 0) {
    return { ok: false, failures };
  }
  return { ok: true, outcome: input as unknown as GateOutcome };
}

/**
 * Validates the COMPLETE ten-gate outcome set of one scorecard: exactly the
 * ten closed ids, each individually valid, no duplicates, nothing missing.
 */
export function validateGateOutcomeSet(
  inputs: readonly unknown[],
):
  | { readonly ok: true; readonly outcomes: readonly GateOutcome[] }
  | { readonly ok: false; readonly failures: readonly GateOutcomeFailure[] } {
  const failures: GateOutcomeFailure[] = [];
  if (!Array.isArray(inputs)) {
    return {
      ok: false,
      failures: [
        { kind: "not-a-list", path: "gates", detail: "the gate outcomes must be an array" },
      ],
    };
  }
  if (inputs.length !== PROMOTION_SCORECARD_GATE_IDS.length) {
    failures.push({
      kind: "unknown-gate",
      path: "gates",
      detail:
        `a scorecard records EXACTLY the ten closed gates (${inputs.length} given) — ` +
        `dimensions cannot be added, dropped or invented`,
    });
  }
  const seen = new Set<string>();
  const outcomes: GateOutcome[] = [];
  for (const [index, input] of inputs.entries()) {
    const validation = validateGateOutcome(input);
    if (!validation.ok) {
      for (const failure of validation.failures) {
        failures.push({
          ...failure,
          path: `gates[${index}].${failure.path}`.replace(/\.$/, ""),
        });
      }
      continue;
    }
    if (seen.has(validation.outcome.gate)) {
      failures.push({
        kind: "unknown-gate",
        path: `gates[${index}].gate`,
        detail: `gate '${validation.outcome.gate}' is recorded more than once`,
      });
      continue;
    }
    seen.add(validation.outcome.gate);
    outcomes.push(validation.outcome);
  }
  for (const id of PROMOTION_SCORECARD_GATE_IDS) {
    if (!seen.has(id)) {
      failures.push({
        kind: "unknown-gate",
        path: "gates",
        detail: `gate '${id}' is MISSING — every one of the ten closed dimensions must be recorded`,
      });
    }
  }
  if (failures.length > 0) {
    return { ok: false, failures };
  }
  return { ok: true, outcomes };
}
