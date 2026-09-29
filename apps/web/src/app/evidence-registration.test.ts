/**
 * PROD-016b — the evidence REGISTRATION draft's pure-logic tests +
 * `registerEvidenceLive` adapter tests (injected stubs; deterministic).
 *
 * Pinned:
 *  - the acquisition-method mirror is the shared contract's closed list
 *    (no second-enum drift);
 *  - the wire body is the EXACT family-`evidence` document
 *    (contractVersion from the shared constant, never a literal);
 *  - the named defects (bad hex id, negative byte size, non-ISO instant,
 *    out-of-vocabulary method);
 *  - the live adapter: REGISTERED/IDEMPOTENT envelopes, the typed 422
 *    conflict surfacing code+reason, the invalid-envelope refusal.
 */

import { describe, expect, test } from "bun:test";
import {
  defaultAcquisitionMethod,
  EVIDENCE_ACQUISITION_METHODS,
  evidenceRegistrationRequestBody,
  validateEvidenceRegistrationDraft,
} from "./evidence-registration";
import { registerEvidenceLive, type FetchLike } from "./api";
import { CONTRACT_VERSION } from "../../../../packages/shared-contracts/src/index";

const CONTENT_ID = "196761c267380b565e88cd02f57475ae65c5c6ffcc2fc5d029899452a6f5b39c";

function validDraft() {
  return {
    contentId: CONTENT_ID,
    byteSize: "2693684",
    mediaType: "image/jpeg",
    capturedAt: "2026-09-29T12:27:31.000Z",
    acquisitionMethod: "STILL_IMAGERY",
    sessionId: "session-browser-1",
  };
}

describe("PROD-016b the acquisition-method mirror", () => {
  test("mirrors the shared contract's EVIDENCE_METHODS closed list exactly", () => {
    expect([...EVIDENCE_ACQUISITION_METHODS]).toEqual([
      "DEPTH_SENSING",
      "VISUAL_RECONSTRUCTION",
      "CALIBRATED_REFERENCE",
      "MANUAL_MEASUREMENT",
      "SPECIALIST_INSTRUMENT",
      "VIDEO_FOOTAGE",
      "STILL_IMAGERY",
      "INSTRUMENT_READING",
      "HUMAN_ANSWER",
      "DOCUMENT_REGION",
      "VOICE_NOTE",
    ]);
  });

  test("defaultAcquisitionMethod maps media-type families honestly", () => {
    expect(defaultAcquisitionMethod("image/jpeg")).toBe("STILL_IMAGERY");
    expect(defaultAcquisitionMethod("video/mp4")).toBe("VIDEO_FOOTAGE");
    expect(defaultAcquisitionMethod("audio/ogg")).toBe("VOICE_NOTE");
    expect(defaultAcquisitionMethod("application/pdf")).toBe("DOCUMENT_REGION");
  });
});

describe("PROD-016b validateEvidenceRegistrationDraft (defects NAMED)", () => {
  test("the valid draft produces zero defects", () => {
    expect(validateEvidenceRegistrationDraft(validDraft())).toEqual([]);
  });

  test("a non-hex content id is refused by name", () => {
    const defects = validateEvidenceRegistrationDraft({ ...validDraft(), contentId: "NOT-HEX" });
    expect(defects.some((defect) => defect.includes("64-hex content address"))).toBe(true);
  });

  test("a non-integer byte size is refused by name", () => {
    const defects = validateEvidenceRegistrationDraft({ ...validDraft(), byteSize: "-12" });
    expect(defects.some((defect) => defect.includes("non-negative integer"))).toBe(true);
  });

  test("a captured instant without millisecond precision is refused by name (the shared contract's exact rule)", () => {
    const defects = validateEvidenceRegistrationDraft({
      ...validDraft(),
      capturedAt: "2026-01-01T00:00:00Z",
    });
    expect(defects.some((defect) => defect.includes("millisecond precision"))).toBe(true);
  });

  test("an out-of-vocabulary method is refused with the closed list", () => {
    const defects = validateEvidenceRegistrationDraft({
      ...validDraft(),
      acquisitionMethod: "GUESSED",
    });
    expect(
      defects.some((defect) => defect.includes('method "GUESSED" is not in the closed vocabulary')),
    ).toBe(true);
  });
});

describe("PROD-016b evidenceRegistrationRequestBody (the EXACT wire document)", () => {
  test("maps to the family-evidence document with the shared CONTRACT_VERSION", () => {
    const result = evidenceRegistrationRequestBody(validDraft());
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.body).toEqual({
      contractVersion: CONTRACT_VERSION,
      contentId: CONTENT_ID,
      byteSize: 2693684,
      mediaType: "image/jpeg",
      capturedAt: "2026-09-29T12:27:31.000Z",
      acquisitionMethod: "STILL_IMAGERY",
      acquisitionMetadata: { "session.id": "session-browser-1" },
    });
    // The version is the shared constant, never a local literal.
    expect(CONTRACT_VERSION).toBe("1.1.0");
  });

  test("an empty session id maps to an empty (honest) metadata map", () => {
    const result = evidenceRegistrationRequestBody({ ...validDraft(), sessionId: "   " });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.body.acquisitionMetadata).toEqual({});
    }
  });

  test("a draft with defects refuses the mapping", () => {
    const result = evidenceRegistrationRequestBody({ ...validDraft(), contentId: "" });
    expect(result.ok).toBe(false);
  });
});

describe("PROD-016b registerEvidenceLive (the live adapter)", () => {
  function stubFetch(
    routes: Readonly<
      Record<string, { readonly status?: number; readonly body?: unknown } | "throw">
    >,
  ): FetchLike {
    return async (input: string) => {
      const route = routes[input];
      if (route === undefined) {
        return new Response("not stubbed", { status: 404 });
      }
      if (route === "throw") {
        throw new TypeError("network is down");
      }
      return new Response(JSON.stringify(route.body ?? { ok: true }), {
        status: route.status ?? 200,
        headers: { "content-type": "application/json" },
      });
    };
  }

  const evidence = {
    contractVersion: CONTRACT_VERSION,
    contentId: CONTENT_ID,
    byteSize: 2693684,
    mediaType: "image/jpeg",
    capturedAt: "2026-09-29T12:27:31.000Z",
    acquisitionMethod: "STILL_IMAGERY",
    acquisitionMetadata: {},
  };

  test("a REGISTERED envelope answers the record fields", async () => {
    const result = await registerEvidenceLive(
      stubFetch({
        "/v1/evidence": { body: { ok: true, outcome: "REGISTERED", evidence, invalidation: null } },
      }),
      evidence,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.record.outcome).toBe("REGISTERED");
      expect(result.record.contentId).toBe(CONTENT_ID);
      expect(result.record.acquisitionMethod).toBe("STILL_IMAGERY");
    }
  });

  test("an IDEMPOTENT envelope answers outcome idempotent", async () => {
    const result = await registerEvidenceLive(
      stubFetch({
        "/v1/evidence": { body: { ok: true, outcome: "IDEMPOTENT", evidence, invalidation: null } },
      }),
      evidence,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.record.outcome).toBe("IDEMPOTENT");
    }
  });

  test("a typed evidence_conflict 422 surfaces code + reason verbatim", async () => {
    const result = await registerEvidenceLive(
      stubFetch({
        "/v1/evidence": {
          status: 422,
          body: {
            ok: false,
            error: "evidence_conflict",
            detail: "content 196761c2… is registered with different fields",
          },
        },
      }),
      evidence,
    );
    expect(result.ok).toBe(false);
    if (!result.ok && result.failure.kind === "http") {
      expect(result.failure.status).toBe(422);
      expect(result.failure.code).toBe("evidence_conflict");
    }
  });

  test("a 200 without the registration envelope is an invalid failure", async () => {
    const result = await registerEvidenceLive(
      stubFetch({ "/v1/evidence": { body: { ok: true } } }),
      evidence,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure.kind).toBe("invalid");
    }
  });
});
