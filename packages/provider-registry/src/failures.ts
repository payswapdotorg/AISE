/**
 * HFX-000 — the CLOSED provider failure vocabulary.
 *
 * Contract (docs/productization-layer-hardening-work-orders.md governing rule;
 * docs/huggingface-hardening-execution-plan.md §HF-2 exit gate):
 *
 * A provider — model, dataset, Space, renderer, reconstruction engine or
 * agent framework — is an implementation candidate, NEVER canonical
 * engineering truth. Every failure a provider (or the control plane itself)
 * can produce must be named by THIS closed vocabulary: profiles cannot
 * invent failure kinds (`failureModes` entries are validated against it),
 * benchmark records record failure observations from it, and normalized
 * provider results carry explicit failures from it. The vocabulary is the
 * hook the layer-hardening items consume: HFX-202/203/204's benchmark
 * suites must be able to DISTINGUISH perception, retrieval, reasoning,
 * unsupported-data and operation-semantic failures — which is exactly the
 * discrimination this closed list makes machine-checkable.
 *
 * FROZEN reference data: adding or renaming a kind is a schema change that
 * requires re-goldening the committed fixtures. Definitions are mirrored in
 * the package README (one line each) and in
 * docs/productization-evidence/HFX-000/failure-vocabulary.md.
 */

export const FAILURE_KINDS = [
  "perception-failure",
  "retrieval-failure",
  "reasoning-failure",
  "unsupported-data",
  "operation-semantic-failure",
  "resource-exhaustion",
  "timeout",
  "license-blocked",
  "contract-mismatch",
] as const;
export type FailureKind = (typeof FAILURE_KINDS)[number];

/** One closed-vocabulary entry: the kind plus its one-line definition. */
export interface FailureDefinition {
  readonly kind: FailureKind;
  readonly definition: string;
}

/**
 * The vocabulary with one-line definitions (the README mirror). Order is
 * part of the frozen reference data.
 */
export const FAILURE_VOCABULARY: readonly FailureDefinition[] = [
  {
    kind: "perception-failure",
    definition:
      "The provider misread or failed to read the physical/visual content of its input (bad segmentation, wrong depth, misread text) — the data was processed, the perception was wrong.",
  },
  {
    kind: "retrieval-failure",
    definition:
      "The provider failed to surface evidence that exists (or surfaced the wrong evidence) — a retrieval/indexing defect, not a comprehension defect.",
  },
  {
    kind: "reasoning-failure",
    definition:
      "The provider produced an incorrect inference, comparison or derivation over correctly perceived and retrieved inputs.",
  },
  {
    kind: "unsupported-data",
    definition:
      "The input is well-formed but outside the provider's declared support (unsupported modality, scene class, language or capability combination) — answered by explicit refusal, never by fabricated output.",
  },
  {
    kind: "operation-semantic-failure",
    definition:
      "The provider produced a result whose ENGINEERING semantics are wrong or ill-typed for the requested operation (wrong units, wrong target, non-executable command) even though parsing and perception succeeded.",
  },
  {
    kind: "resource-exhaustion",
    definition:
      "The provider exceeded its declared compute/memory/cost envelope before completing — an explicit resource ceiling event, not a silent degradation.",
  },
  {
    kind: "timeout",
    definition:
      "The provider did not answer within its declared latency budget — surfaced as an explicit timeout observation, never as a fabricated or partial result.",
  },
  {
    kind: "license-blocked",
    definition:
      "Licensing or intended-use terms forbid the requested use (typically production/commercial use of an evaluation-only provider) — the license/use gate refuses, the provider is not invoked or not promoted.",
  },
  {
    kind: "contract-mismatch",
    definition:
      "The exchanged payload violates the provider's declared input/output contract (missing field, wrong type, out-of-range value, unknown field) — a typed normalization refusal, never a silent coercion.",
  },
];

const FAILURE_KIND_SET: ReadonlySet<string> = new Set(FAILURE_KINDS);

/** Type guard: is this unknown value one of the closed failure kinds? */
export function isFailureKind(value: unknown): value is FailureKind {
  return typeof value === "string" && FAILURE_KIND_SET.has(value);
}

/** The one-line definition of a closed-vocabulary kind (reference data). */
export function failureDefinitionOf(kind: FailureKind): string {
  const found = FAILURE_VOCABULARY.find((entry) => entry.kind === kind);
  return found === undefined ? "" : found.definition;
}
