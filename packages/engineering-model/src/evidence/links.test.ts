/**
 * Evidence-link and retraction tests: link construction,
 * deterministic event identity, retraction validation,
 * re-attachment after retraction, instant ordering.
 */
import { describe, expect, it } from "vitest";
import { EvidenceError } from "./errors.js";
import {
  assertRetractionNotBefore,
  deriveLinkId,
  evidenceLink,
  evidenceRetraction,
  linkRetraction,
  validateLink,
} from "./links.js";
import { fixture, link } from "./testing.js";

const EVIDENCE = "ev-cccccccccccccccc";

describe("link construction", () => {
  it("builds a valid link with a deterministic `lnk-<hex16>` identity", () => {
    const linkRecord = link(fixture.doorSubject, EVIDENCE);
    expect(linkRecord.linkId).toMatch(/^lnk-[0-9a-f]{16}$/);
    expect(linkRecord.subject).toEqual(fixture.doorSubject);
    expect(linkRecord.linkedBy).toBe("svc:review-linker");
  });

  it("identity is a function of the full event (idempotent replay)", () => {
    const first = link(fixture.doorSubject, EVIDENCE);
    const replay = link(fixture.doorSubject, EVIDENCE);
    expect(first.linkId).toBe(replay.linkId);
  });

  it("identity changes with subject, evidence, actor, instant, or method", () => {
    const base = link(fixture.doorSubject, EVIDENCE);
    expect(link(fixture.wallSubject, EVIDENCE).linkId).not.toBe(base.linkId);
    expect(link(fixture.doorSubject, "ev-dddddddddddddddd").linkId).not.toBe(base.linkId);
    expect(link(fixture.doorSubject, EVIDENCE, { linkedBy: "user:other" }).linkId).not.toBe(base.linkId);
    expect(link(fixture.doorSubject, EVIDENCE, { linkedAt: "2026-09-04T13:00:00Z" }).linkId).not.toBe(base.linkId);
    expect(link(fixture.doorSubject, EVIDENCE, { method: "review/link-v2" }).linkId).not.toBe(base.linkId);
  });

  it("deep-freezes links", () => {
    const linkRecord = link(fixture.doorSubject, EVIDENCE);
    expect(Object.isFrozen(linkRecord)).toBe(true);
    expect(() => {
      (linkRecord as unknown as Record<string, unknown>).linkedBy = "mutator";
    }).toThrow(TypeError);
  });
});

describe("link validation (fail closed)", () => {
  it("rejects malformed subjects (wrapped SUBJECT_INVALID)", () => {
    expect(
      errorOf(() => evidenceLink({ subject: { kind: "object-property", modelId: "m", version: 1 } as never, evidenceId: EVIDENCE, linkedBy: "svc:x", linkedAt: "2026-09-04T12:00:00Z" })),
    ).toBeInstanceOf(EvidenceError);
  });

  it("rejects malformed actors and instants", () => {
    expect(
      errorOf(() =>
        evidenceLink({ subject: fixture.doorSubject, evidenceId: EVIDENCE, linkedBy: "bad actor!", linkedAt: "2026-09-04T12:00:00Z" }),
      )?.code,
    ).toBe("LINK_INVALID");
    expect(
      errorOf(() =>
        evidenceLink({ subject: fixture.doorSubject, evidenceId: EVIDENCE, linkedBy: "svc:x", linkedAt: "not-a-time" }),
      )?.code,
    ).toBe("LINK_INVALID");
  });

  it("rejects malformed method labels", () => {
    expect(
      errorOf(() =>
        evidenceLink({ subject: fixture.doorSubject, evidenceId: EVIDENCE, linkedBy: "svc:x", linkedAt: "2026-09-04T12:00:00Z", method: "Bad Method" }),
      )?.code,
    ).toBe("LINK_INVALID");
  });

  it("validateLink rejects a forged identity (never trusts the caller)", () => {
    const linkRecord = link(fixture.doorSubject, EVIDENCE);
    const forged = { ...linkRecord, linkId: "lnk-0000000000000000" };
    expect(errorOf(() => validateLink(forged))?.code).toBe("IDENTITY_COLLISION");
  });

  it("validateLink accepts the genuine article", () => {
    expect(() => validateLink(link(fixture.doorSubject, EVIDENCE))).not.toThrow();
  });

  it("deriveLinkId is public and consistent with the constructor", () => {
    const linkRecord = link(fixture.fireRatingSubject, EVIDENCE);
    expect(
      deriveLinkId({
        subject: fixture.fireRatingSubject,
        evidenceId: EVIDENCE,
        linkedBy: "svc:review-linker",
        linkedAt: "2026-09-04T12:00:00Z",
      }),
    ).toBe(linkRecord.linkId);
  });
});

describe("retractions (append-only events)", () => {
  it("builds and validates link retractions", () => {
    const retraction = linkRetraction({
      linkId: "lnk-0123456789abcdef",
      retractedBy: "user:reviewer",
      retractedAt: "2026-09-05T09:00:00Z",
      reason: "wrong evidence for this assertion",
    });
    expect(Object.isFrozen(retraction)).toBe(true);
  });

  it("builds and validates evidence retractions", () => {
    expect(() =>
      evidenceRetraction({
        evidenceId: "ev-0123456789abcdef",
        retractedBy: "user:reviewer",
        retractedAt: "2026-09-05T09:00:00Z",
        reason: "source retracted upstream",
      }),
    ).not.toThrow();
  });

  it("requires a reason (retractions are consequential acts)", () => {
    expect(
      errorOf(() =>
        linkRetraction({
          linkId: "lnk-0123456789abcdef",
          retractedBy: "user:reviewer",
          retractedAt: "2026-09-05T09:00:00Z",
          reason: "",
        }),
      )?.code,
    ).toBe("RETRACTION_INVALID");
  });

  it("rejects malformed retraction instants and actors", () => {
    expect(
      errorOf(() =>
        evidenceRetraction({
          evidenceId: "ev-0123456789abcdef",
          retractedBy: "user:reviewer",
          retractedAt: "not-a-time",
          reason: "r",
        }),
      )?.code,
    ).toBe("RETRACTION_INVALID");
  });

  it("a retraction cannot precede the event it retracts", () => {
    expect(() =>
      assertRetractionNotBefore("2026-09-01T00:00:00Z", "2026-09-04T12:00:00Z", "test"),
    ).toThrow(EvidenceError);
    expect(() =>
      assertRetractionNotBefore("2026-09-04T12:00:00Z", "2026-09-04T12:00:00Z", "test"),
    ).not.toThrow();
    // Different fractional precision still parses correctly.
    expect(() =>
      assertRetractionNotBefore("2026-09-04T12:00:00.500Z", "2026-09-04T12:00:00Z", "test"),
    ).not.toThrow();
    expect(() =>
      assertRetractionNotBefore("2026-09-04T12:00:00Z", "2026-09-04T12:00:00.500Z", "test"),
    ).toThrow(EvidenceError);
  });
});

function errorOf(action: () => unknown): EvidenceError | undefined {
  try {
    action();
    return undefined;
  } catch (error) {
    return error instanceof EvidenceError ? error : undefined;
  }
}
