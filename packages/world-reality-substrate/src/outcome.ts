/**
 * WORLD-P0-A — the CLOSED substrate failure vocabulary (five kinds).
 *
 * Contract (spec/technology-substitution-contract.md §4 law 5 and §2 law 3;
 * spec/world-program.md §Gates item 4):
 *
 * A reality substrate — scene runtime, geospatial context, composition
 * engine, asset-delivery format parser or ingest mapper — is an
 * implementation component, never canonical AISE truth. Every failure a
 * substrate adapter (or its substitution double) can produce is named by
 * THIS closed vocabulary: a double cannot invent failure kinds, an
 * evidence record cannot carry a kind outside the list, and an
 * unsupported or malformed input is answered by an explicit typed refusal
 * — never a fabricated output, never a throw, never a silent gap
 * ("unsupported is recorded, never computed").
 *
 * FROZEN reference data: adding or renaming a kind is a contract change
 * that requires re-running the full conformance battery. The vocabulary
 * is mirrored in the package README and in
 * docs/world-program-evidence/WORLD-P0-A/CAPABILITY-BOUNDARIES.md.
 */

export const SUBSTRATE_FAILURE_KINDS = [
  "malformed-input",
  "unsupported-format",
  "contract-mismatch",
  "capability-unavailable",
  "resource-limit-exceeded",
] as const;
export type SubstrateFailureKind = (typeof SUBSTRATE_FAILURE_KINDS)[number];

/** One closed-vocabulary entry: the kind plus its one-line definition. */
export interface SubstrateFailureDefinition {
  readonly kind: SubstrateFailureKind;
  readonly definition: string;
}

/**
 * The vocabulary with one-line definitions (the README mirror). Order is
 * part of the frozen reference data.
 */
export const SUBSTRATE_FAILURE_VOCABULARY: readonly SubstrateFailureDefinition[] =
  [
    {
      kind: "malformed-input",
      definition:
        "The input bytes/structure violate the format contract the adapter declares (bad magic, out-of-range index, misaligned offset, cyclic graph) — refused fail-closed with the offending path named.",
    },
    {
      kind: "unsupported-format",
      definition:
        "The input is well-formed but outside the adapter's declared support (unknown format family, unknown required extension, undeclared capability combination) — answered by explicit refusal, never by fabricated output.",
    },
    {
      kind: "contract-mismatch",
      definition:
        "A payload crossed the adapter boundary with a shape outside the closed AISE wire contract (unknown fields, wrong types, non-canonical ids) — refused with the field named.",
    },
    {
      kind: "capability-unavailable",
      definition:
        "A declared capability is not available in this build/adapter configuration — an honest declaration, not an error to retry or paper over.",
    },
    {
      kind: "resource-limit-exceeded",
      definition:
        "The input exceeds a declared, bounded adapter limit (byte length, node count, graph depth) — refused before unbounded work, with the limit and the actual value recorded.",
    },
  ];

/** Type guard over the closed vocabulary. */
export function isSubstrateFailureKind(
  value: unknown,
): value is SubstrateFailureKind {
  return (
    typeof value === "string" &&
    (SUBSTRATE_FAILURE_KINDS as readonly string[]).includes(value)
  );
}

/**
 * A typed substrate failure. `path` is the adapter-internal, format-shaped
 * location of the offense (e.g. "accessors[2].componentType") — it is
 * diagnostic text, never a canonical AISE id. `lane`, when present, names
 * the substrate lane that refused.
 */
export interface SubstrateFailure {
  readonly kind: SubstrateFailureKind;
  readonly detail: string;
  readonly path?: string;
  readonly lane?: string;
  /** The declared limit and the observed actual, for resource-limit-exceeded. */
  readonly limit?: { readonly declared: number; readonly actual: number };
}

/** The discriminated outcome of every substrate adapter call. */
export type SubstrateOutcome<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly failure: SubstrateFailure };

/* ------------------------------------------------------------------ */
/* Typed constructors (the only sanctioned ways to build failures)      */
/* ------------------------------------------------------------------ */

export function malformedInput(
  path: string,
  detail: string,
  lane?: string,
): SubstrateFailure {
  return { kind: "malformed-input", path, detail, ...(lane ? { lane } : {}) };
}

export function unsupportedFormat(
  detail: string,
  lane?: string,
): SubstrateFailure {
  return { kind: "unsupported-format", detail, ...(lane ? { lane } : {}) };
}

export function contractMismatch(
  path: string,
  detail: string,
  lane?: string,
): SubstrateFailure {
  return { kind: "contract-mismatch", path, detail, ...(lane ? { lane } : {}) };
}

export function capabilityUnavailable(
  capabilityId: string,
  detail: string,
  lane?: string,
): SubstrateFailure {
  return {
    kind: "capability-unavailable",
    path: capabilityId,
    detail,
    ...(lane ? { lane } : {}),
  };
}

export function resourceLimitExceeded(
  path: string,
  declared: number,
  actual: number,
  lane?: string,
): SubstrateFailure {
  return {
    kind: "resource-limit-exceeded",
    path,
    detail: `the input exceeds the declared limit at ${path}: declared ${declared}, actual ${actual} — refused before unbounded work`,
    limit: { declared, actual },
    ...(lane ? { lane } : {}),
  };
}

/** Fail-closed helper: wrap a throwing callback into a typed failure. */
export function failClosed<T>(
  lane: string,
  operation: () => T,
): SubstrateOutcome<T> {
  try {
    return { ok: true, value: operation() };
  } catch (error) {
    return {
      ok: false,
      failure: contractMismatch(
        "operation",
        `the adapter operation threw instead of answering (fail-closed): ${
          error instanceof Error ? error.message : String(error)
        }`,
        lane,
      ),
    };
  }
}

/** Narrow an unknown thrown value into an honest message string. */
export function thrownMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
