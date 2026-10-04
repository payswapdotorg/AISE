/**
 * WORLD-P2 — the CONTROL-PLANE PROFILES of the Layer-2 experience lane's
 * substitution doubles.
 *
 * Every lane double is ALSO representable by the HFX-000 control plane's
 * machine-readable `ProviderProfile` (all fifteen mandatory fields —
 * imported from `@aise/provider-registry`, never modified), so the lane
 * rides the SAME registration → evaluation → execution → normalized
 * result → benchmark → provenance → promotion pipeline as every other
 * AISE provider. Four capability ids cover the lane's five family ports
 * (the action family contributes two ports: the recorder and the audit
 * ledger); two doubles each (the reference + the alternate substitution
 * pair) — TEN profiles. They are deterministic reference data (no clock,
 * no network, no randomness) and validate through the control plane's
 * own `validateProviderProfile`.
 *
 * HONESTY BOUNDS (what these profiles are NOT):
 *
 *  - They profile the IN-REPO DOUBLES — "no substrate integrated". They
 *    are NOT profiles of any real LLM, assurance engine, case store or
 *    app wiring: those are future occupants of the ports.
 *  - THE REAL LLM LANE IS BLOCKED: the bounded-reasoning capability's
 *    real occupant is pending the bounded-reasoning substrate decision
 *    (the protocol recorded in the item's CAPABILITY-BOUNDARIES): a
 *    candidate LLM adapter must materialize its profile from REAL
 *    measurements under the HFX-000 control plane (license/use clearance,
 *    benchmark evidence, provenance continuity) BEFORE any promotion.
 *  - The benchmark tables are honestly EMPTY: no real measurements exist
 *    in the profile tables; the real in-sandbox observations live in the
 *    item's PERFORMANCE-OBSERVATIONS evidence.
 */

import {
  toLicenseDeclaration,
  type ProviderIOContract,
  type ProviderProfile,
} from "@aise/provider-registry";

/** The in-repo lane id these profiles declare (mirrors the seam's lane id). */
export const LAYER2_PROFILE_LANE_ID = "layer2-experience" as const;

/** The four capability ids of the lane's family ports. */
export const CASE_CONTEXT_CAPABILITY = "world-case-context" as const;
export const MISSING_EVIDENCE_CAPABILITY = "world-missing-evidence" as const;
export const BOUNDED_REASONING_CAPABILITY = "world-bounded-reasoning" as const;
export const ACTION_AUDIT_CAPABILITY = "world-action-audit" as const;

/* ------------------------------------------------------------------ */
/* Shared declared contracts                                            */
/* ------------------------------------------------------------------ */

function contextInputContract() {
  return {
    contractId: "case-context-request/1",
    modality: "table" as const,
    fields: [
      {
        name: "problemId",
        type: "string" as const,
        required: true,
        description: "the bound problem's 64-hex content-derived id",
        minLength: 64,
        maxLength: 64,
      },
      {
        name: "sceneRevision",
        type: "integer" as const,
        required: true,
        description: "the composed-scene revision the problem is bound to",
        min: 1,
        max: 1000000,
      },
      {
        name: "substrateCandidateCount",
        type: "integer" as const,
        required: true,
        description: "how many understanding-substrate candidate sets the request composes",
        min: 0,
        max: 1000,
      },
    ],
  };
}

function contextOutputContract() {
  return {
    contractId: "case-context/1",
    modality: "table" as const,
    fields: [
      {
        name: "contextId",
        type: "string" as const,
        required: true,
        description: "the assembled view's 64-hex content-derived id",
        minLength: 64,
        maxLength: 64,
      },
      {
        name: "observationCount",
        type: "integer" as const,
        required: true,
        description: "how many evidence-bound observations the view carries",
        min: 0,
        max: 100000,
      },
      {
        name: "substrateCandidateCount",
        type: "integer" as const,
        required: true,
        description: "how many INFERRED candidate sets the view carries",
        min: 0,
        max: 1000,
      },
    ],
  };
}

function detectionInputContract() {
  return {
    contractId: "missing-evidence-request/1",
    modality: "table" as const,
    fields: [
      {
        name: "requirementCount",
        type: "integer" as const,
        required: true,
        description: "how many typed evidence requirements the problem declares (≥ 1 or refusal)",
        min: 1,
        max: 10000,
      },
      {
        name: "evidenceCount",
        type: "integer" as const,
        required: true,
        description: "how many evidence records the envelope holds",
        min: 0,
        max: 100000,
      },
      {
        name: "invalidatedCount",
        type: "integer" as const,
        required: true,
        description: "how many evidence records are recorded-invalidated (discounted, never deleted)",
        min: 0,
        max: 100000,
      },
    ],
  };
}

function detectionOutputContract() {
  return {
    contractId: "missing-evidence-report/1",
    modality: "table" as const,
    fields: [
      {
        name: "reportId",
        type: "string" as const,
        required: true,
        description: "the report's 64-hex content-derived id",
        minLength: 64,
        maxLength: 64,
      },
      {
        name: "verdict",
        type: "string" as const,
        required: true,
        description: "the worst-of readiness verdict (READY | READY_WITH_NOTES | NOT_READY | INSUFFICIENT_DATA)",
        minLength: 6,
        maxLength: 32,
      },
      {
        name: "gapCount",
        type: "integer" as const,
        required: true,
        description: "how many typed gaps with explicit remediation tasks the report carries",
        min: 0,
        max: 10000,
      },
    ],
  };
}

function reasoningInputContract() {
  return {
    contractId: "bounded-reasoning-request/1",
    modality: "text" as const,
    fields: [
      {
        name: "contextId",
        type: "string" as const,
        required: true,
        description: "the pinned case-context id — retrieval is scoped to exactly this context",
        minLength: 64,
        maxLength: 64,
      },
      {
        name: "reportId",
        type: "string" as const,
        required: true,
        description: "the pinned missing-evidence report id (refusal required when not READY)",
        minLength: 64,
        maxLength: 64,
      },
      {
        name: "question",
        type: "string" as const,
        required: true,
        description: "the closed question kind the lane asks",
        minLength: 8,
        maxLength: 32,
      },
    ],
  };
}

function reasoningOutputContract() {
  return {
    contractId: "bounded-reasoning-result/1",
    modality: "text" as const,
    fields: [
      {
        name: "resultId",
        type: "string" as const,
        required: true,
        description: "the result's 64-hex content-derived id",
        minLength: 64,
        maxLength: 64,
      },
      {
        name: "claimCount",
        type: "integer" as const,
        required: true,
        description: "how many INFERRED advisory claims (each with resolved citations) the result carries",
        min: 0,
        max: 1000,
      },
      {
        name: "refusalCode",
        type: "string" as const,
        required: false,
        description: "the closed refusal code when the provider refused (insufficient evidence is first-class)",
        minLength: 0,
        maxLength: 32,
      },
    ],
  };
}

function actionInputContract() {
  return {
    contractId: "problem-action-request/1",
    modality: "table" as const,
    fields: [
      {
        name: "actionKind",
        type: "string" as const,
        required: true,
        description: "the closed action kind (propose_solution_operation is gate-required)",
        minLength: 8,
        maxLength: 32,
      },
      {
        name: "ownerActorId",
        type: "string" as const,
        required: true,
        description: "the explicit owner's AISE-side actor id (unowned actions are refused)",
        minLength: 1,
        maxLength: 256,
      },
      {
        name: "gateVerdictId",
        type: "string" as const,
        required: false,
        description: "the deterministic-check gate verdict id (required for consequential actions)",
        minLength: 0,
        maxLength: 64,
      },
    ],
  };
}

function actionOutputContract() {
  return {
    contractId: "problem-action/1",
    modality: "table" as const,
    fields: [
      {
        name: "actionId",
        type: "string" as const,
        required: true,
        description: "the action's 64-hex content-derived id",
        minLength: 64,
        maxLength: 64,
      },
      {
        name: "status",
        type: "string" as const,
        required: true,
        description: "the governed lifecycle status (open | in_progress | completed | blocked)",
        minLength: 4,
        maxLength: 16,
      },
      {
        name: "auditSequence",
        type: "integer" as const,
        required: true,
        description: "the append-only audit trail's event count after this action's event landed",
        min: 1,
        max: 1000000,
      },
    ],
  };
}

/* ------------------------------------------------------------------ */
/* The per-family profile bases                                         */
/* ------------------------------------------------------------------ */

function laneProfileBase(
  capabilities: readonly string[],
  inputContract: ProviderIOContract,
  outputContract: ProviderIOContract,
  uncertaintyNotes: string,
  calibration: "none-declared" | "measurement-uncertainty",
): Omit<
  ProviderProfile,
  "providerId" | "technologyVersion" | "displayName" | "description" | "license" | "failureModes"
> {
  return {
    kind: "provider-profile",
    schemaVersion: "provider-profile/1",
    capabilities,
    supportedModalities: ["table", "text"],
    computeProfile: {
      accelerator: "none",
      minimumCores: 1,
      recommendedCores: 1,
      offlineCapable: true,
      statement: "deterministic in-repo typed transforms — no accelerator, fully offline",
    },
    memoryProfile: {
      minimumMiB: 16,
      recommendedMiB: 32,
      statement: "declared fixture memory envelope (no environment is sensed)",
    },
    latencyProfile: {
      expectedMsP50: 1,
      expectedMsP95: 5,
      timeoutMs: 5000,
      statement: "declared fixture latencies — no wall-clock measurement exists in the lane",
    },
    costProfile: {
      model: "none",
      unitCost: 0,
      currency: "n/a",
      quotaPolicy: "deterministic local computation, no quota, canonical fallback always available",
    },
    inputContract,
    outputContract,
    provenanceContract: {
      providerIdentityRequired: true,
      configurationDigestRequired: true,
      inputDigestRequired: true,
      nativePayloadPolicy: "none",
    },
    uncertaintyCharacteristics: {
      calibration,
      confidenceSeparateFromMeasurementUncertainty: true,
      notes: uncertaintyNotes,
    },
    benchmarkResults: [],
  };
}

/* ------------------------------------------------------------------ */
/* The ten profiles (two substitution doubles per family port)        */
/* ------------------------------------------------------------------ */

const DOUBLE_LICENSE = () =>
  toLicenseDeclaration({
    identifier: "fixture-permissive-1.0",
    commercialUse: true,
    intendedUse:
      "in-repo substitution proof of the Layer-2 experience lane's provider ports " +
      "(P2 contract definition only; no substrate integrated)",
    intendedUseCleared: true,
  });

/** The reference case-context double's control-plane profile. */
export function referenceContextProfile(): ProviderProfile {
  return {
    ...laneProfileBase(
      [CASE_CONTEXT_CAPABILITY],
      contextInputContract(),
      contextOutputContract(),
      "the context view carries verbatim epistemic statuses — substrate candidates stay INFERRED, " +
        "observations stay OBSERVED; the view fabricates neither confidence nor uncertainty",
      "none-declared",
    ),
    providerId: "layer2-experience.problem.reference-context-double",
    technologyVersion: "case-context-reference-double/1.0.0",
    displayName: "Reference Case-Context Double (layer2-experience lane)",
    description:
      "Deterministic in-repo substitution double of the case-context assembler port: direct " +
      "field assembly over the composed fixture world — no Reality-Graph store, no scene " +
      "runtime, no understanding-substrate engine. The WORLD-P4 app wiring is the future occupant.",
    license: DOUBLE_LICENSE(),
    failureModes: [
      {
        kind: "contract-mismatch",
        condition: "a request whose scene binding does not resolve against the composed scene",
        behavior: "typed refusal naming the unresolved element ids — the binding fails closed",
      },
      {
        kind: "contract-mismatch",
        condition: "a substrate candidate set that violates the understanding substrate's mapping laws",
        behavior: "typed refusal carrying the substrate validator's own failure kinds",
      },
    ],
  };
}

/** The alternate case-context double's control-plane profile. */
export function alternateContextProfile(): ProviderProfile {
  return {
    ...laneProfileBase(
      [CASE_CONTEXT_CAPABILITY],
      contextInputContract(),
      contextOutputContract(),
      "the context view carries verbatim epistemic statuses — substrate candidates stay INFERRED, " +
        "observations stay OBSERVED; the view fabricates neither confidence nor uncertainty",
      "none-declared",
    ),
    providerId: "layer2-experience.problem.alternate-context-double",
    technologyVersion: "case-context-alternate-double/1.0.0",
    displayName: "Alternate Case-Context Double (layer2-experience lane)",
    description:
      "An independent second deterministic assembler of the same port: canonical-JSON round-trip " +
      "assembly proving the context contract is wire-stable with byte-identical outputs.",
    license: DOUBLE_LICENSE(),
    failureModes: [
      {
        kind: "contract-mismatch",
        condition: "a request whose scene binding does not resolve against the composed scene",
        behavior: "typed refusal naming the unresolved element ids — the binding fails closed",
      },
    ],
  };
}

/** The reference missing-evidence detector double's profile. */
export function referenceDetectorProfile(): ProviderProfile {
  return {
    ...laneProfileBase(
      [MISSING_EVIDENCE_CAPABILITY],
      detectionInputContract(),
      detectionOutputContract(),
      "the detector declares NO confidence; readiness is a worst-of verdict over typed gaps, and " +
        "asserted 1σ values are read verbatim from cited property assertions — never fabricated",
      "measurement-uncertainty",
    ),
    providerId: "layer2-experience.evidence.reference-detector-double",
    technologyVersion: "missing-evidence-reference-double/1.0.0",
    displayName: "Reference Missing-Evidence Double (layer2-experience lane)",
    description:
      "Deterministic in-repo substitution double of the missing-evidence detector port: scan-based " +
      "requirement evaluation with typed gaps and worst-of readiness verdicts. The AISE-022 " +
      "Assurance Engine seam is the future occupant — this double is NOT the readiness authority.",
    license: DOUBLE_LICENSE(),
    failureModes: [
      {
        kind: "contract-mismatch",
        condition: "an empty requirement set (assessment impossible)",
        behavior: "typed refusal — fail-closed, never vacuously READY",
      },
      {
        kind: "contract-mismatch",
        condition: "a requirement whose subject does not resolve in the case context",
        behavior: "typed refusal naming the unresolved subject",
      },
    ],
  };
}

/** The alternate missing-evidence detector double's profile. */
export function alternateDetectorProfile(): ProviderProfile {
  return {
    ...laneProfileBase(
      [MISSING_EVIDENCE_CAPABILITY],
      detectionInputContract(),
      detectionOutputContract(),
      "the detector declares NO confidence; readiness is a worst-of verdict over typed gaps, and " +
        "asserted 1σ values are read verbatim from cited property assertions — never fabricated",
      "measurement-uncertainty",
    ),
    providerId: "layer2-experience.evidence.alternate-detector-double",
    technologyVersion: "missing-evidence-alternate-double/1.0.0",
    displayName: "Alternate Missing-Evidence Double (layer2-experience lane)",
    description:
      "An independent second deterministic detector of the same port: index-based requirement " +
      "evaluation producing byte-identical reports on the committed fixtures.",
    license: DOUBLE_LICENSE(),
    failureModes: [
      {
        kind: "contract-mismatch",
        condition: "an empty requirement set (assessment impossible)",
        behavior: "typed refusal — fail-closed, never vacuously READY",
      },
    ],
  };
}

/** The reference bounded-reasoner (LLM) double's profile. */
export function referenceReasonerProfile(): ProviderProfile {
  return {
    ...laneProfileBase(
      [BOUNDED_REASONING_CAPABILITY],
      reasoningInputContract(),
      reasoningOutputContract(),
      "THE LLM SUBSTRATE DOUBLE: outputs are INFERRED advisory claims with resolved citations and " +
      "recorded prompt/context provenance — NEVER engineering authority, NEVER a confidence score " +
      "substituted for measurement uncertainty, NEVER a fabricated number",
      "none-declared",
    ),
    providerId: "layer2-experience.reasoning.reference-llm-double",
    technologyVersion: "bounded-reasoner-reference-double/1.0.0",
    displayName: "Reference Bounded-Reasoner Double — the LLM substrate double (layer2-experience lane)",
    description:
      "Deterministic in-repo substitution double of the bounded-reasoning port (the LLM lane): " +
      "retrieval-scoped claim construction over the supplied case scope ONLY. NO LLM is " +
      "integrated — the real lane is BLOCKED pending the bounded-reasoning substrate decision " +
      "(license/use clearance, benchmark evidence and provenance continuity under the HFX-000 " +
      "control plane BEFORE any promotion).",
    license: DOUBLE_LICENSE(),
    failureModes: [
      {
        kind: "reasoning-failure",
        condition: "the missing-evidence verdict is NOT_READY or INSUFFICIENT_DATA",
        behavior:
          "first-class INSUFFICIENT_EVIDENCE refusal naming the blocking gap ids — a " +
          "wrong-but-confident answer is the failure mode this lane exists to prevent",
      },
      {
        kind: "contract-mismatch",
        condition: "a claim cites outside the supplied scope or claims a non-INFERRED status",
        behavior: "CONTRACT_VIOLATION refusal — the offending claim is rejected, never passed through",
      },
    ],
  };
}

/** The alternate bounded-reasoner (LLM) double's profile. */
export function alternateReasonerProfile(): ProviderProfile {
  return {
    ...laneProfileBase(
      [BOUNDED_REASONING_CAPABILITY],
      reasoningInputContract(),
      reasoningOutputContract(),
      "THE LLM SUBSTRATE DOUBLE: outputs are INFERRED advisory claims with resolved citations and " +
      "recorded prompt/context provenance — NEVER engineering authority, NEVER a confidence score " +
      "substituted for measurement uncertainty, NEVER a fabricated number",
      "none-declared",
    ),
    providerId: "layer2-experience.reasoning.alternate-llm-double",
    technologyVersion: "bounded-reasoner-alternate-double/1.0.0",
    displayName: "Alternate Bounded-Reasoner Double — the LLM substrate double (layer2-experience lane)",
    description:
      "An independent second deterministic double of the bounded-reasoning port: canonical-JSON " +
      "round-trip claim construction proving wire-stable, byte-identical claim semantics — " +
      "still NO LLM integrated (the lane is BLOCKED pending the substrate decision).",
    license: DOUBLE_LICENSE(),
    failureModes: [
      {
        kind: "reasoning-failure",
        condition: "the missing-evidence verdict is NOT_READY or INSUFFICIENT_DATA",
        behavior: "first-class INSUFFICIENT_EVIDENCE refusal naming the blocking gap ids",
      },
    ],
  };
}

/** The reference action-recorder double's profile. */
export function referenceRecorderProfile(): ProviderProfile {
  return {
    ...laneProfileBase(
      [ACTION_AUDIT_CAPABILITY],
      actionInputContract(),
      actionOutputContract(),
      "actions carry typed ownership and governed lifecycle transitions; consequential actions " +
      "require a passing deterministic-check gate verdict — the recorder declares no uncertainty " +
      "of its own",
      "none-declared",
    ),
    providerId: "layer2-experience.action.reference-recorder-double",
    technologyVersion: "action-recorder-reference-double/1.0.0",
    displayName: "Reference Action-Recorder Double (layer2-experience lane)",
    description:
      "Deterministic in-repo substitution double of the action-recorder port: typed actions with " +
      "explicit ownership, governed lifecycle and gate-governed consequential actions — no " +
      "backend case/action store integrated.",
    license: DOUBLE_LICENSE(),
    failureModes: [
      {
        kind: "operation-semantic-failure",
        condition: "an ungated propose_solution_operation action or a non-passing gate verdict",
        behavior: "typed refusal — engineering-consequential actions are never recorded ungated",
      },
      {
        kind: "operation-semantic-failure",
        condition: "a resolve_case action whose review decision is not approved",
        behavior: "typed refusal — resolution is review-governed",
      },
    ],
  };
}

/** The alternate action-recorder double's profile. */
export function alternateRecorderProfile(): ProviderProfile {
  return {
    ...laneProfileBase(
      [ACTION_AUDIT_CAPABILITY],
      actionInputContract(),
      actionOutputContract(),
      "actions carry typed ownership and governed lifecycle transitions; consequential actions " +
      "require a passing deterministic-check gate verdict — the recorder declares no uncertainty " +
      "of its own",
      "none-declared",
    ),
    providerId: "layer2-experience.action.alternate-recorder-double",
    technologyVersion: "action-recorder-alternate-double/1.0.0",
    displayName: "Alternate Action-Recorder Double (layer2-experience lane)",
    description:
      "An independent second deterministic recorder of the same port: canonical-JSON round-trip " +
      "record + seal proving wire-stable, byte-identical action records.",
    license: DOUBLE_LICENSE(),
    failureModes: [
      {
        kind: "operation-semantic-failure",
        condition: "an ungated propose_solution_operation action",
        behavior: "typed refusal — engineering-consequential actions are never recorded ungated",
      },
    ],
  };
}

/** The reference audit-ledger double's profile. */
export function referenceLedgerProfile(): ProviderProfile {
  return {
    ...laneProfileBase(
      [ACTION_AUDIT_CAPABILITY],
      actionInputContract(),
      actionOutputContract(),
      "the ledger is append-only with chained content digests; replay re-derives every event id " +
      "deterministically — tampering with a past event fails replay with a typed failure",
      "none-declared",
    ),
    providerId: "layer2-experience.action.reference-ledger-double",
    technologyVersion: "audit-ledger-reference-double/1.0.0",
    displayName: "Reference Audit-Ledger Double (layer2-experience lane)",
    description:
      "Deterministic in-repo substitution double of the audit-ledger port: direct append through " +
      "the canonical chain builder — who/what/when/why/evidence-bound on every lane transition, " +
      "no backend persistence integrated.",
    license: DOUBLE_LICENSE(),
    failureModes: [
      {
        kind: "contract-mismatch",
        condition: "an audit append whose who/what/when/why/evidence-bound fields are incomplete",
        behavior: "typed refusal — an unexplained transition is never recorded",
      },
    ],
  };
}

/** The alternate audit-ledger double's profile. */
export function alternateLedgerProfile(): ProviderProfile {
  return {
    ...laneProfileBase(
      [ACTION_AUDIT_CAPABILITY],
      actionInputContract(),
      actionOutputContract(),
      "the ledger is append-only with chained content digests; replay re-derives every event id " +
      "deterministically — tampering with a past event fails replay with a typed failure",
      "none-declared",
    ),
    providerId: "layer2-experience.action.alternate-ledger-double",
    technologyVersion: "audit-ledger-alternate-double/1.0.0",
    displayName: "Alternate Audit-Ledger Double (layer2-experience lane)",
    description:
      "An independent second deterministic ledger of the same port: append + full-chain " +
      "canonical re-derivation proving the trail contract is wire-stable.",
    license: DOUBLE_LICENSE(),
    failureModes: [
      {
        kind: "contract-mismatch",
        condition: "an audit append whose mandatory fields are incomplete",
        behavior: "typed refusal — an unexplained transition is never recorded",
      },
    ],
  };
}

/** All ten lane profiles (the substitution pairs, reference first). */
export const LAYER2_PROVIDER_PROFILES: readonly ProviderProfile[] = [
  referenceContextProfile(),
  alternateContextProfile(),
  referenceDetectorProfile(),
  alternateDetectorProfile(),
  referenceReasonerProfile(),
  alternateReasonerProfile(),
  referenceRecorderProfile(),
  alternateRecorderProfile(),
  referenceLedgerProfile(),
  alternateLedgerProfile(),
];

/** The ten profile provider ids (two doubles × five ports). */
export const LAYER2_PROFILE_PROVIDER_IDS: readonly string[] =
  LAYER2_PROVIDER_PROFILES.map((profile) => profile.providerId);
