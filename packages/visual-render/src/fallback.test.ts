/**
 * HFX-303 tests — the HONEST FALLBACK: failed and missing visual
 * generation produce the canonical fallback record (canonical projections
 * + typed failure note), never a gap, never a silent omission.
 */

import { describe, expect, test } from "bun:test";
import {
  VISUAL_FALLBACK_STATEMENT,
  canonicalProjectionDigestOf,
  fallbackForMissingProvider,
  fallbackForOutcome,
  fallbackForProviderFailure,
  verifyVisualFallbackRecord,
} from "./fallback";
import { renderThroughLane } from "./port";
import { buildVisualCorpus } from "./corpus";
import { createFailingVisualProvider, DEFAULT_FAILING_KIND } from "./providers/failing";

const corpus = buildVisualCorpus();
const multiOpCase = corpus.find((entry) => entry.caseId === "demo-world-multi-operation");
if (multiOpCase === undefined) {
  throw new Error("the visual corpus is missing the multi-operation case");
}

/** Re-resolves one corpus case inside test closures (narrowing helper). */
function requireCase(caseId: string): (typeof corpus)[number] {
  const found = corpus.find((entry) => entry.caseId === caseId);
  if (found === undefined) {
    throw new Error(`the visual corpus is missing the '${caseId}' case`);
  }
  return found;
}

describe("the fallback records", () => {
  test("a FAILED provider execution yields the canonical fallback record with the typed failure note", () => {
    const outcome = renderThroughLane(createFailingVisualProvider(), multiOpCase.request);
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    const record = fallbackForProviderFailure(multiOpCase.request, outcome.failure);
    expect(record.kind).toBe("visual-fallback-record");
    expect(record.reason.reasonKind).toBe("provider-failure");
    if (record.reason.reasonKind !== "provider-failure") return;
    expect(record.reason.failure.kind).toBe(DEFAULT_FAILING_KIND);
    expect(record.reason.failure.detail.length).toBeGreaterThan(0);
    // The record POINTS at the canonical projections by content digest.
    expect(record.canonicalProjectionDigests.plan).toBe(
      canonicalProjectionDigestOf(multiOpCase.request.canonicalProjections.plan),
    );
    expect(record.canonicalProjectionDigests.axonometric).toBe(
      canonicalProjectionDigestOf(multiOpCase.request.canonicalProjections.axonometric),
    );
    expect(record.statement).toBe(VISUAL_FALLBACK_STATEMENT);
    // Verifiable + bound to the originating request.
    expect(verifyVisualFallbackRecord(record).ok).toBe(true);
    expect(verifyVisualFallbackRecord(record, multiOpCase.request).ok).toBe(true);
  });

  test("a MISSING provider yields the provider-absent fallback record — never a gap", () => {
    const record = fallbackForMissingProvider(multiOpCase.request);
    expect(record.reason.reasonKind).toBe("provider-absent");
    if (record.reason.reasonKind !== "provider-absent") return;
    expect(record.reason.detail).toContain("no visual-generation provider");
    expect(verifyVisualFallbackRecord(record, multiOpCase.request).ok).toBe(true);
  });

  test("the fallback policy maps outcomes: failure → record, success → no fallback", () => {
    const failed = renderThroughLane(createFailingVisualProvider(), multiOpCase.request);
    expect(failed.ok).toBe(false);
    if (failed.ok) return;
    expect(fallbackForOutcome(multiOpCase.request, failed)).toBeDefined();
    expect(fallbackForOutcome(multiOpCase.request, { ok: true })).toBeUndefined();
  });

  test("a non-closed-vocabulary failure kind is refused verbatim carry (fail-closed record)", () => {
    const invented: unknown = {
      kind: "made-up-failure",
      detail: "a rogue provider invented a failure kind",
    };
    const record = fallbackForProviderFailure(multiOpCase.request, invented as never);
    if (record.reason.reasonKind !== "provider-failure") {
      throw new Error("expected a provider-failure record");
    }
    expect(record.reason.failure.kind).toBe("contract-mismatch");
    expect(record.reason.failure.detail).toContain("made-up-failure");
    expect(verifyVisualFallbackRecord(record).ok).toBe(true);
  });
});

describe("fallback record verification (the negative cases)", () => {
  function fallbackOfCase() {
    const corpusCase = requireCase("demo-world-multi-operation");
    const outcome = renderThroughLane(createFailingVisualProvider(), corpusCase.request);
    if (outcome.ok) throw new Error("the failing fixture unexpectedly rendered");
    return fallbackForProviderFailure(corpusCase.request, outcome.failure);
  }

  test("a TAMPERED fallback record is rejected (fallbackId re-derivation)", () => {
    const record = fallbackOfCase();
    const tampered = structuredClone(record) as unknown as {
      reason: { failure: { detail: string } };
    };
    tampered.reason.failure.detail = "quietly changed detail";
    const validation = verifyVisualFallbackRecord(tampered);
    expect(validation.ok).toBe(false);
    if (validation.ok) return;
    expect(validation.failures[0]?.kind).toBe("fallback-id-mismatch");
  });

  test("a record whose projection digests do NOT bind to the originating request is rejected", () => {
    const record = fallbackOfCase();
    const otherCase = corpus.find((entry) => entry.caseId === "demo-world-baseline");
    if (otherCase === undefined) throw new Error("missing baseline case");
    const validation = verifyVisualFallbackRecord(record, otherCase.request);
    expect(validation.ok).toBe(false);
    if (validation.ok) return;
    expect(
      validation.failures.every(
        (failure) => failure.kind === "projection-binding-mismatch",
      ),
    ).toBe(true);
  });

  test("shape violations are collected as typed failures (never throws)", () => {
    expect(verifyVisualFallbackRecord(null).ok).toBe(false);
    expect(
      verifyVisualFallbackRecord({
        ...fallbackOfCase(),
        reason: { reasonKind: "mystery" },
      }).ok,
    ).toBe(false);
    expect(
      verifyVisualFallbackRecord({
        ...fallbackOfCase(),
        statement: "a friendlier statement",
      }).ok,
    ).toBe(false);
  });
});
