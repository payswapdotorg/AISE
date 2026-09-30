/**
 * ANCHOR-002 tests — the codec discipline (solution-contract, verbatim):
 * open decode preserves unknown keys; strict decode refuses them at any
 * nesting level WITH THE KEY NAMED; encode emits canonical bytes and
 * rejects foreign versions; round-trips are lossless.
 */

import { describe, expect, test } from "bun:test";
import { anchoringRequestCodec, anchoringResponseCodec } from "./codecs.instance";
import {
  AnchoringContractDecodeError,
  AnchoringContractVersionMismatchError,
} from "./errors";
import {
  fixtureAnchoredResponse,
  fixtureRequest,
} from "./test-fixtures";
import { buildPartialResponse, refuseStill } from "./laws";
import { fixtureHypothesis, fixtureProvenance } from "./test-fixtures";

describe("the anchoring wire codecs", () => {
  test("the request decodes and re-encodes losslessly (canonical bytes are deterministic)", () => {
    const request = fixtureRequest();
    const encoded = anchoringRequestCodec.encode(request);
    const decoded = anchoringRequestCodec.decode(JSON.parse(encoded));
    expect(anchoringRequestCodec.encode(decoded)).toBe(encoded);
  });

  test("the response decodes and re-encodes losslessly", () => {
    const response = fixtureAnchoredResponse(fixtureRequest());
    const encoded = anchoringResponseCodec.encode(response);
    const decoded = anchoringResponseCodec.decode(JSON.parse(encoded));
    expect(anchoringResponseCodec.encode(decoded)).toBe(encoded);
  });

  test("open decode PRESERVES unknown keys (same-major forward compatibility)", () => {
    const payload = {
      ...fixtureRequest(),
      futureMinorField: { note: "added by a newer minor of the same major" },
    };
    const decoded = anchoringRequestCodec.decode(payload);
    expect((decoded as Record<string, unknown>)["futureMinorField"]).toBeDefined();
  });

  test("strict decode refuses an unknown top-level key WITH THE KEY NAMED", () => {
    const payload = {
      ...fixtureRequest(),
      mysteryPoseGraph: { nodes: 17 },
    };
    expect(() => anchoringRequestCodec.decodeStrict(payload)).toThrow(
      AnchoringContractDecodeError,
    );
    try {
      anchoringRequestCodec.decodeStrict(payload);
    } catch (error) {
      const issues = (error as AnchoringContractDecodeError).issues;
      expect(issues.some((issue) => issue.code === "unrecognized_keys" && issue.path.join(".") === "mysteryPoseGraph")).toBe(true);
    }
  });

  test("strict decode refuses an unknown NESTED key with its full path named", () => {
    const payload = {
      ...fixtureRequest(),
      evidence: fixtureRequest().evidence.map((evidence, index) =>
        index === 0 ? { ...evidence, siftKeyPointHandle: 0x1f } : evidence,
      ),
    };
    try {
      anchoringRequestCodec.decodeStrict(payload);
      throw new Error("expected decodeStrict to refuse the provider handle leak");
    } catch (error) {
      if (!(error instanceof AnchoringContractDecodeError)) {
        throw error;
      }
      expect(
        error.issues.some(
          (issue) =>
            issue.code === "unrecognized_keys" &&
            issue.path.join(".") === "evidence.0.siftKeyPointHandle",
        ),
      ).toBe(true);
    }
  });

  test("a cross-major version is refused with the typed mismatch error (never silent)", () => {
    const payload = { ...fixtureRequest(), contractVersion: "2.0.0" };
    expect(() => anchoringRequestCodec.decode(payload)).toThrow(
      AnchoringContractVersionMismatchError,
    );
    try {
      anchoringRequestCodec.decode(payload);
    } catch (error) {
      expect((error as AnchoringContractVersionMismatchError).expected).toBe("1.0.0");
      expect((error as AnchoringContractVersionMismatchError).received).toBe("2.0.0");
    }
  });

  test("a same-major minor difference decodes (forward compatibility within the major)", () => {
    const payload = { ...fixtureRequest(), contractVersion: "1.1.0" };
    expect(() => anchoringRequestCodec.decode(payload)).not.toThrow();
  });

  test("encode stamps the family version when absent and rejects a foreign one", () => {
    const request = fixtureRequest();
    const { contractVersion, ...withoutVersion } = request;
    expect(typeof contractVersion).toBe("string");
    const stamped = anchoringRequestCodec.decode(
      JSON.parse(anchoringRequestCodec.encode(withoutVersion as typeof request)),
    );
    expect(stamped.contractVersion).toBe("1.0.0");

    expect(() =>
      anchoringRequestCodec.encode({ ...request, contractVersion: "0.9.0" } as typeof request),
    ).toThrow(AnchoringContractVersionMismatchError);
  });

  test("encode emits canonical JSON (sorted keys, 2-space indent, trailing newline)", () => {
    const requestEncoded = anchoringRequestCodec.encode(fixtureRequest());
    expect(requestEncoded.endsWith("\n")).toBe(true);
    expect(requestEncoded).toContain('  "authority"');
    // sorted key order: authority before contractVersion before executionId
    const authorityAt = requestEncoded.indexOf('"authority"');
    const contractVersionAt = requestEncoded.indexOf('"contractVersion"');
    const executionIdAt = requestEncoded.indexOf('"executionId"');
    expect(authorityAt).toBeGreaterThan(-1);
    expect(authorityAt).toBeLessThan(contractVersionAt);
    expect(contractVersionAt).toBeLessThan(executionIdAt);
    const responseEncoded = anchoringResponseCodec.encode(
      fixtureAnchoredResponse(fixtureRequest()),
    );
    expect(responseEncoded.endsWith("\n")).toBe(true);
    expect(responseEncoded).toContain('  "status"');
  });

  test("the PARTIAL outcome round-trips through the codec end to end", () => {
    const request = fixtureRequest();
    const partial = buildPartialResponse(request, {
      anchoredHypotheses: [fixtureHypothesis(request, 0)],
      refusedStills: [
        refuseStill(request.evidence[1]!.contentId, "insufficient-features", "still-002"),
        refuseStill(request.evidence[2]!.contentId, "registration-unreliable", "still-003"),
      ],
      provenance: fixtureProvenance(request),
      executionTimeMs: 7000.0,
    });
    const encoded = anchoringResponseCodec.encode(partial);
    const decoded = anchoringResponseCodec.decodeStrict(JSON.parse(encoded));
    expect(decoded.status).toBe("partial");
    expect(decoded.partialSummary).toEqual({ anchoredStills: 1, refusedStills: 2 });
    expect(decoded.hypotheses).toHaveLength(1);
    expect(decoded.refusedStills).toHaveLength(2);
  });
});
