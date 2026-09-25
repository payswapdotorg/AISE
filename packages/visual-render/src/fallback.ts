/**
 * HFX-303 — the HONEST FALLBACK policy of the visual lane.
 *
 * The work order's law: "Missing/failed visual generation falls back to
 * canonical 2D/3D views." A failed provider, a provider that declares the
 * requested class unsupported, or NO provider at all, never leaves a gap
 * and never silently omits the pane: the lane produces a
 * `VisualFallbackRecord` — a POINTER to the canonical deterministic
 * projections (identified by content digest) plus the typed failure (from
 * the control plane's closed vocabulary) or the missing-provider note —
 * and the UI seam renders the canonical panes (which are always rendered
 * from the state anyway) with the fallback notice attached.
 *
 * The fallback record is content-addressed (`fallbackId`) and verifiable
 * — an honest record, not a silent gap.
 *
 * PURE DETERMINISTIC COMPUTATION: no network, no clock, no randomness.
 */

import { isFailureKind } from "@aise/provider-registry";
import { canonicalJsonStringify } from "@aise/shared-contracts";
import { createHash } from "node:crypto";
import type {
  CanonicalProjectionSnapshot,
  CanonicalStateIdentity,
  VisualRenderFailure,
  VisualStateRequest,
} from "./port";
import { isVisualDigest } from "./descriptor";

export const VISUAL_FALLBACK_KIND = "visual-fallback-record" as const;
export const VISUAL_FALLBACK_SCHEMA_VERSION = "visual-fallback/1" as const;

/** The fallback statement every record carries verbatim. */
export const VISUAL_FALLBACK_STATEMENT =
  "visual generation unavailable — the canonical deterministic 2D/3D projections remain the engineering views; the fallback itself is recorded, never a silent gap" as const;

/**
 * Why the lane fell back: a typed provider failure (closed vocabulary) or
 * an absent provider.
 */
export type VisualFallbackReason =
  | { readonly reasonKind: "provider-failure"; readonly failure: VisualRenderFailure }
  | { readonly reasonKind: "provider-absent"; readonly detail: string };

/**
 * The canonical fallback record: the state it presents canonically, the
 * typed reason, and the content digests of the canonical projections the
 * UI renders (the pointer discipline — the projections themselves are the
 * caller's data; the record pins their exact content).
 */
export interface VisualFallbackRecord {
  readonly kind: typeof VISUAL_FALLBACK_KIND;
  readonly schemaVersion: typeof VISUAL_FALLBACK_SCHEMA_VERSION;
  readonly fallbackId: string;
  readonly visualClass: string;
  readonly state: CanonicalStateIdentity;
  readonly reason: VisualFallbackReason;
  /** sha-256 over the canonical JSON of each projection snapshot. */
  readonly canonicalProjectionDigests: {
    readonly plan: string;
    readonly axonometric: string;
  };
  readonly statement: string;
}

/* ------------------------------------------------------------------ */
/* Construction                                                         */
/* ------------------------------------------------------------------ */

/** sha-256 over the canonical JSON of one projection snapshot. */
export function canonicalProjectionDigestOf(
  snapshot: CanonicalProjectionSnapshot,
): string {
  return createHash("sha256")
    .update(canonicalJsonStringify(snapshot), "utf8")
    .digest("hex");
}

function sealFallback(
  request: VisualStateRequest,
  reason: VisualFallbackReason,
): VisualFallbackRecord {
  const preimage: Omit<VisualFallbackRecord, "fallbackId"> = {
    kind: VISUAL_FALLBACK_KIND,
    schemaVersion: VISUAL_FALLBACK_SCHEMA_VERSION,
    visualClass: request.visualClass,
    state: request.state,
    reason,
    canonicalProjectionDigests: {
      plan: canonicalProjectionDigestOf(request.canonicalProjections.plan),
      axonometric: canonicalProjectionDigestOf(request.canonicalProjections.axonometric),
    },
    statement: VISUAL_FALLBACK_STATEMENT,
  };
  const { ...rest } = preimage as Record<string, unknown>;
  delete rest["fallbackId"];
  const fallbackId = createHash("sha256")
    .update(canonicalJsonStringify(rest), "utf8")
    .digest("hex");
  return { ...preimage, fallbackId };
}

/**
 * The fallback for a FAILED provider execution: the typed failure (from
 * the closed vocabulary — validated) rides the record verbatim.
 */
export function fallbackForProviderFailure(
  request: VisualStateRequest,
  failure: VisualRenderFailure,
): VisualFallbackRecord {
  if (!isFailureKind(failure.kind)) {
    // Fail closed on a non-closed-vocabulary failure kind — the record
    // itself refuses to carry an invented kind.
    return sealFallback(request, {
      reasonKind: "provider-failure",
      failure: {
        kind: "contract-mismatch",
        detail:
          `the provider reported the non-closed-vocabulary failure kind '${String(failure.kind)}' — ` +
          `refused verbatim carry; original detail: ${failure.detail}`,
      },
    });
  }
  return sealFallback(request, {
    reasonKind: "provider-failure",
    failure,
  });
}

/**
 * The fallback for a MISSING provider (no visual-generation provider
 * configured/available at all): the canonical views with the absence
 * noted — never a silent gap.
 */
export function fallbackForMissingProvider(
  request: VisualStateRequest,
  detail = "no visual-generation provider is configured for this request — the canonical deterministic views are shown",
): VisualFallbackRecord {
  return sealFallback(request, { reasonKind: "provider-absent", detail });
}

/* ------------------------------------------------------------------ */
/* Verification                                                         */
/* ------------------------------------------------------------------ */

export const FALLBACK_VALIDATION_FAILURE_KINDS = [
  "not-an-object",
  "type-mismatch",
  "digest-format",
  "vocabulary-violation",
  "fallback-id-mismatch",
  "projection-binding-mismatch",
] as const;
export type FallbackValidationFailureKind =
  (typeof FALLBACK_VALIDATION_FAILURE_KINDS)[number];

export interface FallbackValidationFailure {
  readonly kind: FallbackValidationFailureKind;
  readonly path: string;
  readonly detail: string;
}

export type VisualFallbackValidation =
  | { readonly ok: true; readonly record: VisualFallbackRecord }
  | { readonly ok: false; readonly failures: readonly FallbackValidationFailure[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Verifies a visual fallback record: shape, the closed reason vocabulary,
 * the projection digests, the fallbackId re-derivation and — when the
 * originating request is provided — that the record's projection digests
 * BIND to that request's exact canonical projections.
 */
export function verifyVisualFallbackRecord(
  input: unknown,
  originRequest?: VisualStateRequest,
): VisualFallbackValidation {
  if (!isRecord(input)) {
    return {
      ok: false,
      failures: [
        { kind: "not-an-object", path: "", detail: "a visual fallback record must be a JSON object" },
      ],
    };
  }
  const failures: FallbackValidationFailure[] = [];
  const fail = (kind: FallbackValidationFailureKind, path: string, detail: string): void => {
    failures.push({ kind, path, detail });
  };

  if (input["kind"] !== VISUAL_FALLBACK_KIND) {
    fail("type-mismatch", "kind", `expected the typed seal '${VISUAL_FALLBACK_KIND}'`);
  }
  if (input["schemaVersion"] !== VISUAL_FALLBACK_SCHEMA_VERSION) {
    fail("type-mismatch", "schemaVersion", `expected the schema version '${VISUAL_FALLBACK_SCHEMA_VERSION}'`);
  }
  if (!isVisualDigest(input["fallbackId"])) {
    fail("digest-format", "fallbackId", "expected the 64-hex fallback content address");
  }
  if (!isNonEmptyString(input["visualClass"])) {
    fail("type-mismatch", "visualClass", "expected a non-empty visual class string");
  }
  if (!isRecord(input["state"])) {
    fail("type-mismatch", "state", "expected the canonical state identity object");
  }
  const reason = input["reason"];
  if (isRecord(reason)) {
    if (reason["reasonKind"] === "provider-failure") {
      const failure = reason["failure"];
      if (isRecord(failure)) {
        if (!isFailureKind(failure["kind"])) {
          fail("vocabulary-violation", "reason.failure.kind", "not in the CLOSED provider failure vocabulary");
        }
        if (!isNonEmptyString(failure["detail"])) {
          fail("type-mismatch", "reason.failure.detail", "expected a non-empty failure detail");
        }
      } else {
        fail("type-mismatch", "reason.failure", "expected the typed failure object");
      }
    } else if (reason["reasonKind"] === "provider-absent") {
      if (!isNonEmptyString(reason["detail"])) {
        fail("type-mismatch", "reason.detail", "expected a non-empty absence detail");
      }
    } else {
      fail("vocabulary-violation", "reason.reasonKind", "expected 'provider-failure' or 'provider-absent'");
    }
  } else {
    fail("type-mismatch", "reason", "expected the fallback reason object");
  }
  const digests = input["canonicalProjectionDigests"];
  if (isRecord(digests)) {
    for (const field of ["plan", "axonometric"] as const) {
      if (!isVisualDigest(digests[field])) {
        fail("digest-format", `canonicalProjectionDigests.${field}`, "expected the 64-hex canonical projection digest");
      }
    }
  } else {
    fail("type-mismatch", "canonicalProjectionDigests", "expected the projection digest pair");
  }
  if (input["statement"] !== VISUAL_FALLBACK_STATEMENT) {
    fail("vocabulary-violation", "statement", "the record must carry the fallback statement VERBATIM");
  }

  if (failures.length > 0) {
    return { ok: false, failures };
  }

  const record = input as unknown as VisualFallbackRecord;

  // The tamper proof: the fallbackId re-derives from the record's content.
  const { ...rest } = record as unknown as Record<string, unknown>;
  delete rest["fallbackId"];
  const derived = createHash("sha256")
    .update(canonicalJsonStringify(rest), "utf8")
    .digest("hex");
  if (record.fallbackId !== derived) {
    return {
      ok: false,
      failures: [
        {
          kind: "fallback-id-mismatch",
          path: "fallbackId",
          detail: `the fallbackId does not re-derive from the record content (derived ${derived})`,
        },
      ],
    };
  }

  // The binding proof: the record points at the ORIGIN request's projections.
  if (originRequest !== undefined) {
    const bindingFailures: FallbackValidationFailure[] = [];
    const expectedPlan = canonicalProjectionDigestOf(originRequest.canonicalProjections.plan);
    const expectedAxonometric = canonicalProjectionDigestOf(
      originRequest.canonicalProjections.axonometric,
    );
    if (record.canonicalProjectionDigests.plan !== expectedPlan) {
      bindingFailures.push({
        kind: "projection-binding-mismatch",
        path: "canonicalProjectionDigests.plan",
        detail: "the record's plan projection digest does not bind to the originating request's canonical plan projection",
      });
    }
    if (record.canonicalProjectionDigests.axonometric !== expectedAxonometric) {
      bindingFailures.push({
        kind: "projection-binding-mismatch",
        path: "canonicalProjectionDigests.axonometric",
        detail: "the record's axonometric projection digest does not bind to the originating request's canonical axonometric projection",
      });
    }
    if (bindingFailures.length > 0) {
      return { ok: false, failures: bindingFailures };
    }
  }

  return { ok: true, record };
}

/**
 * The fallback POLICY itself: given a render outcome that did not produce
 * an artifact, produce the canonical fallback record. This is the one
 * function the UI seam's orchestration calls — the canonical panes are
 * always rendered from the state; the record explains why no generated
 * pane exists and pins the canonical projections it fell back to.
 */
export function fallbackForOutcome(
  request: VisualStateRequest,
  outcome: { readonly ok: false; readonly failure: VisualRenderFailure } | { readonly ok: true },
): VisualFallbackRecord | undefined {
  if (outcome.ok) {
    return undefined;
  }
  return fallbackForProviderFailure(request, outcome.failure);
}
