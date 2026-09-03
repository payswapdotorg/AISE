/**
 * Evidence-subject tests: shape validation per kind, canonical
 * subject keys, resolution against committed graph content.
 */
import { describe, expect, it } from "vitest";
import { EvidenceError } from "./errors.js";
import {
  describeSubject,
  evidenceSubject,
  resolveSubject,
  subjectKey,
  validateSubject,
} from "./subjects.js";
import { smallGraph } from "./testing.js";

const fixture = smallGraph("ev-aaaaaaaaaaaaaaaa", "ev-bbbbbbbbbbbbbbbb");

describe("subject validation (fail closed)", () => {
  it("accepts well-formed subjects of every kind", () => {
    expect(() => validateSubject(fixture.doorSubject)).not.toThrow();
    expect(() => validateSubject(fixture.fireRatingSubject)).not.toThrow();
    expect(() => validateSubject(fixture.roomHeightSubject)).not.toThrow();
  });

  it("rejects object-existence with a propertyKey", () => {
    expect(
      errorOf(() =>
        validateSubject({ ...fixture.doorSubject, propertyKey: "width" }),
      )?.code,
    ).toBe("SUBJECT_INVALID");
  });

  it("rejects object-property without a propertyKey", () => {
    expect(
      errorOf(() => {
        const { propertyKey: _unused, ...subject } = fixture.fireRatingSubject;
        validateSubject(subject);
      }),
    ).toBeInstanceOf(EvidenceError);
  });

  it("rejects space-property with an objectId", () => {
    expect(
      errorOf(() =>
        validateSubject({ ...fixture.roomHeightSubject, objectId: fixture.wallId }),
      )?.code,
    ).toBe("SUBJECT_INVALID");
  });

  it("rejects non-positive versions", () => {
    expect(
      errorOf(() => validateSubject({ ...fixture.doorSubject, version: 0 }))?.code,
    ).toBe("SUBJECT_INVALID");
    expect(
      errorOf(() => validateSubject({ ...fixture.doorSubject, version: 1.5 }))?.code,
    ).toBe("SUBJECT_INVALID");
  });

  it("rejects malformed model ids", () => {
    expect(
      errorOf(() => validateSubject({ ...fixture.doorSubject, modelId: "bad model" }))?.code,
    ).toBe("SUBJECT_INVALID");
  });

  it("evidenceSubject validates on construction", () => {
    expect(() => evidenceSubject({ kind: "object-property", modelId: "m", version: 1 } as never)).toThrow(
      EvidenceError,
    );
  });
});

describe("canonical subject keys", () => {
  it("is deterministic and collision-free", () => {
    expect(subjectKey(fixture.doorSubject)).toBe(subjectKey({ ...fixture.doorSubject }));
    expect(subjectKey(fixture.doorSubject)).not.toBe(subjectKey(fixture.wallSubject));
    expect(subjectKey(fixture.fireRatingSubject)).not.toBe(
      subjectKey({ ...fixture.fireRatingSubject, propertyKey: "otherKey" }),
    );
  });

  it("distinguishes versions of the same assertion", () => {
    expect(subjectKey(fixture.doorSubject)).not.toBe(
      subjectKey({ ...fixture.doorSubject, version: 2 }),
    );
  });

  it("format is model@version::kind:entity[/property]", () => {
    expect(subjectKey(fixture.roomHeightSubject)).toBe(
      `model-evidence@1::space-property:room-evidence/roomHeight`,
    );
  });
});

describe("resolution against committed graph content", () => {
  it("resolves object-existence to the object", () => {
    const resolved = resolveSubject(fixture.doorSubject, fixture.graph);
    expect(resolved?.kind).toBe("object-existence");
    if (resolved?.kind === "object-existence") {
      expect(resolved.object.objectId).toBe(fixture.doorId);
      expect(resolved.object.epistemicState).toBe("CONFIRMED");
    }
  });

  it("resolves object-property to the assertion", () => {
    const resolved = resolveSubject(fixture.fireRatingSubject, fixture.graph);
    expect(resolved?.kind).toBe("object-property");
    if (resolved?.kind === "object-property") {
      expect(resolved.assertion.key).toBe("fireRating");
      expect(resolved.assertion.status).toBe("CONFIRMED");
    }
  });

  it("resolves space-property to the assertion", () => {
    const resolved = resolveSubject(fixture.roomHeightSubject, fixture.graph);
    expect(resolved?.kind).toBe("space-property");
    if (resolved?.kind === "space-property") {
      expect(resolved.space.spaceId).toBe("room-evidence");
      expect(resolved.assertion.status).toBe("CONFIRMED");
    }
  });

  it("does not resolve unknown objects, properties, or spaces", () => {
    expect(resolveSubject({ ...fixture.doorSubject, objectId: "ro-doesnotexist" }, fixture.graph)).toBeUndefined();
    expect(
      resolveSubject({ ...fixture.fireRatingSubject, propertyKey: "unknown" }, fixture.graph),
    ).toBeUndefined();
    expect(
      resolveSubject({ ...fixture.roomHeightSubject, spaceId: "space-unknown" }, fixture.graph),
    ).toBeUndefined();
  });

  it("does not resolve across models", () => {
    expect(
      resolveSubject({ ...fixture.doorSubject, modelId: "model-other" }, fixture.graph),
    ).toBeUndefined();
  });
});

describe("descriptions", () => {
  it("describes each subject kind for reports", () => {
    expect(describeSubject(fixture.doorSubject)).toContain("existence");
    expect(describeSubject(fixture.fireRatingSubject)).toContain("fireRating");
    expect(describeSubject(fixture.roomHeightSubject)).toContain("roomHeight");
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
