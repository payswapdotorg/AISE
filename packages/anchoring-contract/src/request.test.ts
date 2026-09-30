/**
 * ANCHOR-002 tests — the AnchoringRequest wire schema: the HANDEDNESS LAW
 * as a first-class typed field, AISE-owned content ids, the closed plan
 * kinds / evidence methods / representations, and the policy floors.
 */

import { describe, expect, test } from "bun:test";
import {
  anchoringRequestSchema,
  requestContentIds,
  requestStillContentIds,
} from "./request";
import {
  contentIdOf,
  fixtureEvidence,
  fixturePlanContext,
  fixtureRequest,
} from "./test-fixtures";

describe("AnchoringRequest schema", () => {
  test("the canonical fixture parses", () => {
    const result = anchoringRequestSchema.safeParse(fixtureRequest());
    expect(result.success).toBe(true);
  });

  test("the port id is pinned by literal — the spike's disposable id is refused", () => {
    const request = {
      ...fixtureRequest(),
      portVersion: "anchor001-anchoring-port/1",
    };
    const result = anchoringRequestSchema.safeParse(request);
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((issue) => issue.path.join("."));
      expect(paths).toContain("portVersion");
    }
  });

  test("authority AISE and units SI are pinned literals", () => {
    for (const mutation of [{ authority: "PROVIDER" }, { units: "IMPERIAL" }]) {
      const result = anchoringRequestSchema.safeParse({ ...fixtureRequest(), ...mutation });
      expect(result.success).toBe(false);
    }
  });

  describe("the HANDEDNESS LAW (rasterToScene, PORT.md §5 carried verbatim)", () => {
    test("the lawful declaration parses (east-right / north-up, origin pixel, positive scale)", () => {
      const result = anchoringRequestSchema.safeParse({
        ...fixtureRequest(),
        planContext: fixturePlanContext("plan"),
      });
      expect(result.success).toBe(true);
    });

    test("a screen-convention raster (y down) is refused — the closed literal", () => {
      const request = fixtureRequest();
      const mutated = {
        ...request,
        planContext: {
          ...request.planContext!,
          rasterToScene: {
            ...request.planContext!.rasterToScene,
            yDirection: "south-down",
          },
        },
      };
      const result = anchoringRequestSchema.safeParse(mutated);
      expect(result.success).toBe(false);
      if (!result.success) {
        const paths = result.error.issues.map((issue) => issue.path.join("."));
        expect(paths.some((path) => path.endsWith("yDirection"))).toBe(true);
      }
    });

    test("a non-positive pixelsPerMeter is refused (the scale is a declared quantity)", () => {
      const request = fixtureRequest();
      const mutated = {
        ...request,
        planContext: {
          ...request.planContext!,
          rasterToScene: { ...request.planContext!.rasterToScene, pixelsPerMeter: 0 },
        },
      };
      expect(anchoringRequestSchema.safeParse(mutated).success).toBe(false);
    });

    test("a missing rasterToScene is refused — the convention is never implicit", () => {
      const request = fixtureRequest();
      const mutated = {
        ...request,
        planContext: { ...request.planContext! },
      };
      delete (mutated.planContext as Record<string, unknown>).rasterToScene;
      expect(anchoringRequestSchema.safeParse(mutated).success).toBe(false);
    });
  });

  test("content ids are AISE-owned 64-hex sha-256 (a malformed id is refused)", () => {
    const request = fixtureRequest();
    const mutated = {
      ...request,
      evidence: [
        { ...request.evidence[0]!, contentId: "not-a-content-id" },
        ...request.evidence.slice(1),
      ],
    };
    const result = anchoringRequestSchema.safeParse(mutated);
    expect(result.success).toBe(false);
  });

  test("the acquisition-method vocabulary is closed (STILL_IMAGERY only today)", () => {
    const request = fixtureRequest();
    const mutated = {
      ...request,
      evidence: [
        { ...request.evidence[0]!, acquisitionMethod: "VIDEO_FOOTAGE" },
        ...request.evidence.slice(1),
      ],
    };
    expect(anchoringRequestSchema.safeParse(mutated).success).toBe(false);
  });

  test("the plan-context kind vocabulary is closed (plan-raster only today)", () => {
    const request = fixtureRequest();
    const mutated = {
      ...request,
      planContext: { ...request.planContext!, kind: "plan-line-art" },
    };
    expect(anchoringRequestSchema.safeParse(mutated).success).toBe(false);
  });

  test("an empty evidence list is refused (a request anchors at least one still)", () => {
    const result = anchoringRequestSchema.safeParse({ ...fixtureRequest(), evidence: [] });
    expect(result.success).toBe(false);
  });

  test("a null planContext is lawful wire shape (the typed refusal is the provider's answer)", () => {
    const result = anchoringRequestSchema.safeParse({ ...fixtureRequest(), planContext: null });
    expect(result.success).toBe(true);
  });

  test("requestContentIds covers plan + stills; requestStillContentIds covers stills only", () => {
    const request = fixtureRequest();
    const plan = fixturePlanContext("plan");
    expect(requestContentIds(request)).toHaveLength(request.evidence.length + 1);
    expect(requestContentIds(request)).toContain(plan.imageContentId);
    expect(requestStillContentIds(request)).toHaveLength(request.evidence.length);
    expect(requestStillContentIds(request)).not.toContain(plan.imageContentId);
  });

  test("contentIdOf is deterministic (the fixture ids are stable)", () => {
    expect(contentIdOf("still-001")).toBe(contentIdOf("still-001"));
    expect(contentIdOf("still-001")).not.toBe(contentIdOf("still-002"));
    expect(contentIdOf("still-001")).toMatch(/^[0-9a-f]{64}$/);
    expect(fixtureEvidence("still-001").contentId).toMatch(/^[0-9a-f]{64}$/);
  });
});
