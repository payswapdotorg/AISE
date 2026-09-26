/**
 * POST-005 — the cross-device field task handoff contract tests.
 *
 * Pins the `@aise/adapter-contract/task-handoff` subpath (the ADDITIVE
 * surface of the POST-005 work order):
 *
 *  - every committed `handoff-fixtures/` payload round-trips BYTE-IDENTICALLY
 *    through the deep-link codec (format == the committed URI; parse == the
 *    committed envelope) — this is the corpus the Android `:core` Kotlin
 *    mirror (`FieldTaskDeepLink.kt`) is byte-pinned against too;
 *  - the codec rejects, with TYPED reasons, every defect class: wrong
 *    scheme/host, unknown/duplicate/missing/misordered parameters, malformed
 *    percent-escapes, non-canonical formatting, unsupported grammar version,
 *    empty targets, schema-invalid envelopes — never a silent fallback;
 *  - {@link continuedTaskIdentity} projects the envelope into the TaskIntent
 *    wire identity (task id, type, intent, project, target refs verbatim;
 *    provenance/version/epistemic context in the open parameter map) — the
 *    web→android task-identity continuation the plan §5 bridge requires;
 *  - the frozen-barrel rule: the public barrel does NOT re-export this
 *    subpath (the POST-005 additive-surface law, mirroring the PROD-030
 *    fixtures-loader seam discipline).
 *
 * Deterministic: committed files only; no network, no clock, no randomness.
 */

import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  FIELD_TASK_DEEP_LINK_HOST,
  FIELD_TASK_DEEP_LINK_SCHEME,
  FIELD_TASK_DEEP_LINK_VERSION,
  FieldTaskHandoffSchema,
  continuedTaskIdentity,
  decodeDeepLinkValue,
  encodeDeepLinkValue,
  formatFieldTaskDeepLink,
  parseFieldTaskDeepLink,
  type FieldTaskHandoff,
} from "./task-handoff";

interface HandoffFixture {
  readonly handoff: FieldTaskHandoff;
  readonly deepLink: string;
}

const FIXTURES_ROOT = join(import.meta.dir, "..", "handoff-fixtures");

/** The committed corpus (sorted, existence-verified). */
function loadHandoffFixtures(): { readonly name: string; readonly payload: HandoffFixture }[] {
  expect(existsSync(FIXTURES_ROOT)).toBe(true);
  return readdirSync(FIXTURES_ROOT)
    .filter((file) => file.endsWith(".json"))
    .sort()
    .map((name) => ({
      name,
      payload: JSON.parse(readFileSync(join(FIXTURES_ROOT, name), "utf8")) as HandoffFixture,
    }));
}

describe("POST-005 the committed handoff corpus round-trips byte-identically", () => {
  const fixtures = loadHandoffFixtures();

  test("the corpus exists and carries the three continuation shapes", () => {
    expect(fixtures.length).toBe(3);
    expect(fixtures.map((entry) => entry.name)).toEqual([
      "FieldTaskHandoff.valid-field-capture-gap.json",
      "FieldTaskHandoff.valid-mobile-return.json",
      "FieldTaskHandoff.valid-post-work-capture.json",
    ]);
  });

  test("every committed envelope validates against the handoff schema", () => {
    for (const entry of fixtures) {
      const parsed = FieldTaskHandoffSchema.safeParse(entry.payload.handoff);
      expect(parsed.success).toBe(true);
    }
  });

  test("format(handoff) reproduces the committed deep link byte-identically", () => {
    for (const entry of fixtures) {
      expect(formatFieldTaskDeepLink(entry.payload.handoff)).toBe(entry.payload.deepLink);
    }
  });

  test("parse(deepLink) reconstructs the committed envelope (round-trip)", () => {
    for (const entry of fixtures) {
      const result = parseFieldTaskDeepLink(entry.payload.deepLink);
      expect(result.kind).toBe("valid");
      if (result.kind === "valid") {
        expect(result.handoff).toEqual(entry.payload.handoff);
        expect(result.uri).toBe(entry.payload.deepLink);
      }
    }
  });
});

describe("POST-005 the deep-link codec rejects defects with typed reasons", () => {
  const valid = loadHandoffFixtures()[0]!.payload;
  const validLink = valid.deepLink;

  test("rejects a URI with the wrong scheme", () => {
    const result = parseFieldTaskDeepLink(validLink.replace("aise://", "other://"));
    expect(result.kind).toBe("invalid");
    if (result.kind === "invalid") {
      expect(result.reason).toContain("not an aise://task deep link");
    }
  });

  test("rejects an unknown parameter", () => {
    const result = parseFieldTaskDeepLink(`${validLink}&extra=x`);
    expect(result.kind).toBe("invalid");
    if (result.kind === "invalid") {
      expect(result.reason).toContain("unknown parameter 'extra'");
    }
  });

  test("rejects a duplicate parameter", () => {
    const result = parseFieldTaskDeepLink(`${validLink}&purpose=field-capture`);
    expect(result.kind).toBe("invalid");
    if (result.kind === "invalid") {
      expect(result.reason).toContain("duplicate parameter 'purpose'");
    }
  });

  test("rejects a missing required parameter", () => {
    const result = parseFieldTaskDeepLink(validLink.replace(/&epistemic=[^&]*/, ""));
    expect(result.kind).toBe("invalid");
    if (result.kind === "invalid") {
      expect(result.reason).toContain("missing required parameter 'epistemic'");
    }
  });

  test("rejects parameters outside the canonical order", () => {
    const head = validLink.slice(0, validLink.indexOf("&purpose="));
    const tail = validLink.slice(validLink.indexOf("&purpose=") + 1);
    const [purpose, ...rest] = tail.split("&");
    const reordered = `${head}&${rest.join("&")}&${purpose}`;
    const result = parseFieldTaskDeepLink(reordered);
    expect(result.kind).toBe("invalid");
    if (result.kind === "invalid") {
      expect(result.reason).toContain("not in the canonical order");
    }
  });

  test("rejects a malformed percent-escape", () => {
    const result = parseFieldTaskDeepLink(validLink.replace("%20", "%2 "));
    expect(result.kind).toBe("invalid");
    if (result.kind === "invalid") {
      expect(result.reason).toContain("malformed");
    }
  });

  test("rejects a non-canonical percent-encoding of an unreserved byte", () => {
    const result = parseFieldTaskDeepLink(validLink.replace("task=", "tas%6B="));
    expect(result.kind).toBe("invalid");
  });

  test("rejects an unsupported grammar version", () => {
    const result = parseFieldTaskDeepLink(validLink.replace("v=1", "v=2"));
    expect(result.kind).toBe("invalid");
    if (result.kind === "invalid") {
      expect(result.reason).toContain("unsupported grammar version");
    }
  });

  test("rejects an empty targets list (a handoff needs its target identity)", () => {
    const result = parseFieldTaskDeepLink(validLink.replace(/targets=[^&]*/, "targets="));
    expect(result.kind).toBe("invalid");
    if (result.kind === "invalid") {
      expect(result.reason).toContain("malformed or empty value for parameter 'targets'");
    }
  });

  test("rejects a schema-invalid envelope (bad issuedAt)", () => {
    const result = parseFieldTaskDeepLink(validLink.replace(/issued=[^&]*/, "issued=not-a-time"));
    expect(result.kind).toBe("invalid");
    if (result.kind === "invalid") {
      expect(result.reason).toContain("schema validation");
    }
  });
});

describe("POST-005 the percent-encoding primitives are canonical RFC 3986", () => {
  test("unreserved bytes pass through; every other byte is percent-encoded uppercase", () => {
    expect(encodeDeepLinkValue("A-z0_9-.~")).toBe("A-z0_9-.~");
    expect(encodeDeepLinkValue("a b,c;d:e")).toBe("a%20b%2Cc%3Bd%3Ae");
  });

  test("decode is strict (malformed escapes and reserved bytes are rejected)", () => {
    expect(decodeDeepLinkValue("a%20b")).toBe("a b");
    expect(decodeDeepLinkValue("a%2")).toBeNull();
    expect(decodeDeepLinkValue("a/b")).toBeNull();
    expect(decodeDeepLinkValue("a+b")).toBeNull();
  });

  test("non-ASCII intent text round-trips through the codec", () => {
    const handoff: FieldTaskHandoff = {
      ...loadHandoffFixtures()[0]!.payload.handoff,
      intent: "Measurement needed — métré mural, ≥ 2 reference points.",
    };
    const link = formatFieldTaskDeepLink(handoff);
    const result = parseFieldTaskDeepLink(link);
    expect(result.kind).toBe("valid");
    if (result.kind === "valid") {
      expect(result.handoff.intent).toBe(handoff.intent);
    }
  });
});

describe("POST-005 continuedTaskIdentity carries the identity across the boundary", () => {
  test("task identity fields ride verbatim; provenance/version/epistemic context rides the parameter map", () => {
    const handoff = loadHandoffFixtures().find(
      (entry) => entry.name === "FieldTaskHandoff.valid-post-work-capture.json",
    )!.payload.handoff;
    const identity = continuedTaskIdentity(handoff);
    expect(identity.taskId).toBe(handoff.taskId);
    expect(identity.taskType).toBe(handoff.taskType);
    expect(identity.intent).toBe(handoff.intent);
    expect(identity.projectRef).toBe(handoff.projectId);
    expect(identity.targetRefs).toEqual(handoff.targetRefs);
    expect(identity.parameters["handoff.purpose"]).toBe("post-work-capture");
    expect(identity.parameters["handoff.id"]).toBe(handoff.handoffId);
    expect(identity.parameters["handoff.origin"]).toBe("web:outcomes");
    expect(identity.parameters["handoff.epistemic-state"]).toBe("OBSERVED");
    expect(identity.parameters["handoff.mission"]).toBe("mission-2026-000042");
    expect(identity.parameters["handoff.boq-import"]).toBe("boq-import-33d");
    expect(identity.parameters["handoff.boq-revision"]).toBe("2");
  });

  test("the web→deep-link→identity round-trip preserves the task id (the continuation key)", () => {
    for (const entry of loadHandoffFixtures()) {
      const parsed = parseFieldTaskDeepLink(entry.payload.deepLink);
      expect(parsed.kind).toBe("valid");
      if (parsed.kind === "valid") {
        expect(continuedTaskIdentity(parsed.handoff).taskId).toBe(
          entry.payload.handoff.taskId,
        );
      }
    }
  });
});

describe("POST-005 the frozen-barrel law for the additive subpath", () => {
  test("the public barrel does not import/re-export the task-handoff module", () => {
    const barrelSource = readFileSync(join(import.meta.dir, "index.ts"), "utf8");
    expect(barrelSource.includes('"./task-handoff"')).toBe(false);
  });

  test("the package exports map declares the subpath (the public resolvable surface)", () => {
    const pkg = JSON.parse(readFileSync(join(import.meta.dir, "..", "package.json"), "utf8")) as {
      readonly exports: Record<string, string>;
    };
    expect(pkg.exports["./task-handoff"]).toBe("./src/task-handoff.ts");
  });

  test("the deep-link constants match the committed capability vocabulary", () => {
    expect(FIELD_TASK_DEEP_LINK_SCHEME).toBe("aise");
    expect(FIELD_TASK_DEEP_LINK_HOST).toBe("task");
    expect(FIELD_TASK_DEEP_LINK_VERSION).toBe(1);
  });
});
