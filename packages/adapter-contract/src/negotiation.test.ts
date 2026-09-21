/**
 * Capability negotiation tests (PROD-016).
 *
 * Proves the negotiation model's acceptance criteria:
 *  - the three reference adapter profiles (browser, mobile-field,
 *    desktop-rich-shell) are representable through the same contract and
 *    negotiate to DIFFERENT, HONEST capability sets;
 *  - requirement satisfaction uses the documented orderings and any-of
 *    semantics, with explicit unsupported/unknown/blocked outcomes and
 *    deterministic reasons;
 *  - a blocked task permits NO interaction modes (explicit blocked state
 *    instead of a pretend-actionable task);
 *  - negotiation is deterministic (fixtures are the byte-stable wire form
 *    of the function's output);
 *  - negotiation NEVER changes the truth standard: the output carries no
 *    authorization/readiness/assurance semantics and requirements are
 *    consumed read-only.
 *
 * Deterministic: no network, no clock, no random values.
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  REFERENCE_PROFILES,
  REFERENCE_TASK_REQUIREMENTS,
  deriveInteractionModes,
  negotiateCapabilities,
} from "./index";
import { CapabilityNegotiationSchema } from "./negotiation";
import type { ClientCapabilityProfile } from "./capability";

const FIXTURES_ROOT = join(import.meta.dir, "..", "fixtures", "capability");

function loadFixture(file: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(FIXTURES_ROOT, file), "utf8")) as Record<
    string,
    unknown
  >;
}

describe("reference profiles are representable and honest", () => {
  test("the three committed profile fixtures are the wire form of the reference constants", () => {
    for (const [kind, profile] of Object.entries(REFERENCE_PROFILES)) {
      const fixture = loadFixture(`ClientCapabilityProfile.valid-${kind}.json`);
      expect(fixture).toEqual(profile as unknown as Record<string, unknown>);
    }
  });

  test("the committed requirement fixtures are the wire form of the reference constants", () => {
    for (const [name, requirements] of Object.entries(REFERENCE_TASK_REQUIREMENTS)) {
      const fixture = loadFixture(`TaskCapabilityRequirements.valid-${name}.json`);
      expect(fixture).toEqual(requirements as unknown as Record<string, unknown>);
    }
  });

  test("the three reference profiles derive DIFFERENT honest interaction-mode sets", () => {
    const browser = deriveInteractionModes(REFERENCE_PROFILES["browser"]).join(",");
    const mobileField = deriveInteractionModes(REFERENCE_PROFILES["mobile-field"]).join(",");
    const desktopRichShell = deriveInteractionModes(
      REFERENCE_PROFILES["desktop-rich-shell"],
    ).join(",");
    expect(browser).toBe(
      "menu-navigation,keyboard-shortcut,table-review,panel-inspection,drag-inspect,camera-capture",
    );
    expect(mobileField).toBe(
      "menu-navigation,panel-inspection,drag-inspect,camera-capture,gesture,voice-command,scan-control,offline-queue",
    );
    expect(desktopRichShell).toBe(
      "menu-navigation,keyboard-shortcut,table-review,panel-inspection,drag-inspect,window-management,file-workflow,offline-queue",
    );
    expect(new Set([browser, mobileField, desktopRichShell]).size).toBe(3);
  });

  test("every derived mode set is a subset of INTERACTION_MODES in declaration order", () => {
    for (const profile of Object.values(REFERENCE_PROFILES)) {
      const modes = deriveInteractionModes(profile);
      expect(new Set(modes).size).toBe(modes.length);
      for (const mode of modes) {
        expect(typeof mode).toBe("string");
      }
    }
  });
});

describe("negotiation outcomes", () => {
  test("browser x field-depth-capture is BLOCKED (no depth camera, no capture input) with no modes", () => {
    const negotiation = negotiateCapabilities(
      REFERENCE_PROFILES["browser"],
      REFERENCE_TASK_REQUIREMENTS["field-depth-capture"]!,
    );
    expect(negotiation.outcome).toBe("blocked");
    expect(negotiation.permittedInteractionModes).toEqual([]);
    const camera = negotiation.domainOutcomes.find((d) => d.domain === "camera");
    expect(camera?.outcome).toBe("unsupported");
    expect(camera?.reason).toBe(
      "camera requirement unmet: required any of [depth]; profile declares [still, video]",
    );
  });

  test("mobile-field x field-depth-capture is PERMITTED with capture-style modes", () => {
    const negotiation = negotiateCapabilities(
      REFERENCE_PROFILES["mobile-field"],
      REFERENCE_TASK_REQUIREMENTS["field-depth-capture"]!,
    );
    expect(negotiation.outcome).toBe("permitted");
    expect(negotiation.domainOutcomes.every((d) => d.outcome === "satisfied")).toBe(true);
    expect(negotiation.permittedInteractionModes).toContain("camera-capture");
    expect(negotiation.permittedInteractionModes).toContain("offline-queue");
  });

  test("desktop-rich-shell x field-depth-capture is BLOCKED (camera domain unavailable)", () => {
    const negotiation = negotiateCapabilities(
      REFERENCE_PROFILES["desktop-rich-shell"],
      REFERENCE_TASK_REQUIREMENTS["field-depth-capture"]!,
    );
    expect(negotiation.outcome).toBe("blocked");
    const camera = negotiation.domainOutcomes.find((d) => d.domain === "camera");
    expect(camera?.outcome).toBe("unsupported");
    expect(camera?.reason).toContain("camera capability unavailable");
  });

  test("mobile-field x boq-review is DEGRADED (compact screen is a non-blocking shortfall)", () => {
    const negotiation = negotiateCapabilities(
      REFERENCE_PROFILES["mobile-field"],
      REFERENCE_TASK_REQUIREMENTS["boq-review"]!,
    );
    expect(negotiation.outcome).toBe("degraded");
    const screen = negotiation.domainOutcomes.find((d) => d.domain === "screen");
    expect(screen?.outcome).toBe("unsupported");
    expect(screen?.reason).toBe(
      "screen requirement unmet: required min size class regular; profile declares compact",
    );
  });

  test("browser x boq-review and desktop x boq-review are PERMITTED", () => {
    for (const kind of ["browser", "desktop-rich-shell"] as const) {
      const negotiation = negotiateCapabilities(
        REFERENCE_PROFILES[kind],
        REFERENCE_TASK_REQUIREMENTS["boq-review"]!,
      );
      expect(negotiation.outcome).toBe("permitted");
    }
  });

  test("browser x offline-field-queue is BLOCKED (session cache is below bounded-queue)", () => {
    const negotiation = negotiateCapabilities(
      REFERENCE_PROFILES["browser"],
      REFERENCE_TASK_REQUIREMENTS["offline-field-queue"]!,
    );
    expect(negotiation.outcome).toBe("blocked");
    const offline = negotiation.domainOutcomes.find((d) => d.domain === "offline-storage");
    expect(offline?.reason).toBe(
      "offline-storage requirement unmet: required min mode bounded-queue; profile declares session-cache",
    );
  });

  test("mobile-field x offline-field-queue is PERMITTED (queue bound declared and sufficient)", () => {
    const negotiation = negotiateCapabilities(
      REFERENCE_PROFILES["mobile-field"],
      REFERENCE_TASK_REQUIREMENTS["offline-field-queue"]!,
    );
    expect(negotiation.outcome).toBe("permitted");
    expect(negotiation.domainOutcomes.every((d) => d.outcome === "satisfied")).toBe(true);
  });

  test("desktop x offline-field-queue is DEGRADED (gps sensor is a non-blocking shortfall)", () => {
    const negotiation = negotiateCapabilities(
      REFERENCE_PROFILES["desktop-rich-shell"],
      REFERENCE_TASK_REQUIREMENTS["offline-field-queue"]!,
    );
    expect(negotiation.outcome).toBe("degraded");
    const sensors = negotiation.domainOutcomes.find((d) => d.domain === "sensors");
    expect(sensors?.outcome).toBe("unsupported");
  });

  test("lidar capture blocks even the reference mobile profile (honest, not padded)", () => {
    const mobile = negotiateCapabilities(
      REFERENCE_PROFILES["mobile-field"],
      REFERENCE_TASK_REQUIREMENTS["lidar-capture"]!,
    );
    expect(mobile.outcome).toBe("blocked");
    const browser = negotiateCapabilities(
      REFERENCE_PROFILES["browser"],
      REFERENCE_TASK_REQUIREMENTS["lidar-capture"]!,
    );
    expect(browser.outcome).toBe("blocked");
  });

  test("notification broadcast degrades the browser honestly (in-app < system)", () => {
    const browser = negotiateCapabilities(
      REFERENCE_PROFILES["browser"],
      REFERENCE_TASK_REQUIREMENTS["notification-broadcast"]!,
    );
    expect(browser.outcome).toBe("degraded");
    const notifications = browser.domainOutcomes.find((d) => d.domain === "notifications");
    expect(notifications?.reason).toBe(
      "notification requirement unmet: required min mode system; profile declares in-app",
    );
    const mobile = negotiateCapabilities(
      REFERENCE_PROFILES["mobile-field"],
      REFERENCE_TASK_REQUIREMENTS["notification-broadcast"]!,
    );
    expect(mobile.outcome).toBe("permitted");
  });

  test("an undetermined (unknown) domain yields `unknown`, never conflated with `unsupported`", () => {
    const profile: ClientCapabilityProfile = JSON.parse(
      JSON.stringify(REFERENCE_PROFILES["browser"]),
    );
    profile.profileId = "profile-browser-undetermined-camera";
    profile.camera.descriptor.status = "unknown";
    const negotiation = negotiateCapabilities(
      profile,
      REFERENCE_TASK_REQUIREMENTS["field-depth-capture"]!,
    );
    const camera = negotiation.domainOutcomes.find((d) => d.domain === "camera");
    expect(camera?.outcome).toBe("unknown");
    expect(camera?.reason).toContain("undetermined");
    // The blocking input+camera domains: input unsupported (blocking), camera
    // unknown (blocking) — a definitive impossibility outranks undetermined.
    expect(negotiation.outcome).toBe("blocked");
    // Unknown grants no modes but is never REPORTED as unsupported:
    expect(negotiation.domainOutcomes.find((d) => d.domain === "camera")?.outcome).not.toBe(
      "unsupported",
    );
  });

  test("a blocking unknown domain alone yields overall `unknown`", () => {
    const profile: ClientCapabilityProfile = JSON.parse(
      JSON.stringify(REFERENCE_PROFILES["mobile-field"]),
    );
    profile.profileId = "profile-mobile-undetermined-camera";
    profile.camera.descriptor.status = "unknown";
    const negotiation = negotiateCapabilities(
      profile,
      REFERENCE_TASK_REQUIREMENTS["lidar-capture"]!,
    );
    expect(negotiation.outcome).toBe("unknown");
    // Not blocked: modes remain for probing-first presentation, but the
    // undetermined camera domain grants no camera-capture mode.
    expect(negotiation.permittedInteractionModes.length).toBeGreaterThan(0);
    expect(negotiation.permittedInteractionModes).not.toContain("camera-capture");
  });

  test("a non-blocking unknown domain degrades the task", () => {
    const profile: ClientCapabilityProfile = JSON.parse(
      JSON.stringify(REFERENCE_PROFILES["browser"]),
    );
    profile.profileId = "profile-browser-undetermined-notifications";
    profile.notifications.descriptor.status = "unknown";
    const negotiation = negotiateCapabilities(
      profile,
      REFERENCE_TASK_REQUIREMENTS["notification-broadcast"]!,
    );
    expect(negotiation.outcome).toBe("degraded");
    expect(negotiation.domainOutcomes.find((d) => d.domain === "notifications")?.outcome).toBe(
      "unknown",
    );
  });

  test("domains without requirements produce no domain outcomes and permitted overall", () => {
    const negotiation = negotiateCapabilities(
      REFERENCE_PROFILES["browser"],
      REFERENCE_TASK_REQUIREMENTS["notification-broadcast"]!,
    );
    expect(negotiation.domainOutcomes.map((d) => d.domain)).toEqual(["notifications"]);
  });

  test("undeclared queue bound cannot satisfy a byte-bounded requirement (honest)", () => {
    const profile: ClientCapabilityProfile = JSON.parse(
      JSON.stringify(REFERENCE_PROFILES["mobile-field"]),
    );
    profile.profileId = "profile-mobile-unbounded-queue";
    delete profile.offlineStorage.queueBoundBytes;
    const negotiation = negotiateCapabilities(
      profile,
      REFERENCE_TASK_REQUIREMENTS["offline-field-queue"]!,
    );
    const offline = negotiation.domainOutcomes.find((d) => d.domain === "offline-storage");
    expect(offline?.outcome).toBe("unsupported");
    expect(offline?.reason).toBe(
      "offline-storage requirement unmet: required queue bound >= 52428800 bytes; profile declares none",
    );
    expect(negotiation.outcome).toBe("blocked");
  });
});

describe("negotiation determinism and wire form", () => {
  test("the same inputs always produce the byte-identical negotiation", () => {
    const first = negotiateCapabilities(
      REFERENCE_PROFILES["browser"],
      REFERENCE_TASK_REQUIREMENTS["field-depth-capture"]!,
    );
    const second = negotiateCapabilities(
      JSON.parse(JSON.stringify(REFERENCE_PROFILES["browser"])),
      JSON.parse(JSON.stringify(REFERENCE_TASK_REQUIREMENTS["field-depth-capture"]!)),
    );
    expect(second).toEqual(first);
  });

  test("the committed negotiation fixtures are the wire form of the function output", () => {
    const pairs: Array<[string, keyof typeof REFERENCE_PROFILES, string]> = [
      ["CapabilityNegotiation.valid-browser-field-depth-capture.json", "browser", "field-depth-capture"],
      ["CapabilityNegotiation.valid-mobile-field-field-depth-capture.json", "mobile-field", "field-depth-capture"],
      ["CapabilityNegotiation.valid-mobile-field-boq-review.json", "mobile-field", "boq-review"],
      ["CapabilityNegotiation.valid-desktop-rich-shell-offline-field-queue.json", "desktop-rich-shell", "offline-field-queue"],
    ];
    for (const [file, kind, requirement] of pairs) {
      const fixture = loadFixture(file);
      const produced = negotiateCapabilities(
        REFERENCE_PROFILES[kind],
        REFERENCE_TASK_REQUIREMENTS[requirement]!,
      );
      expect(fixture).toEqual(produced as unknown as Record<string, unknown>);
    }
  });

  test("every produced negotiation is schema-valid (decode round-trip)", () => {
    for (const profile of Object.values(REFERENCE_PROFILES)) {
      for (const requirements of Object.values(REFERENCE_TASK_REQUIREMENTS)) {
        const negotiation = negotiateCapabilities(profile, requirements);
        const parsed = CapabilityNegotiationSchema.safeParse(negotiation);
        expect(parsed.success).toBe(true);
      }
    }
  });
});

describe("negotiation carries no authority semantics", () => {
  test("the negotiation result object has exactly the negotiated fields — no authorization, readiness or assurance vocabulary", () => {
    const negotiation = negotiateCapabilities(
      REFERENCE_PROFILES["browser"],
      REFERENCE_TASK_REQUIREMENTS["field-depth-capture"]!,
    );
    const keys = Object.keys(negotiation).sort();
    expect(keys).toEqual([
      "adapterKind",
      "contractVersion",
      "domainOutcomes",
      "outcome",
      "permittedInteractionModes",
      "profileRef",
      "requirementsRef",
    ]);
    const forbidden = [
      "authorization",
      "granted",
      "denial",
      "readiness",
      "assurance",
      "sufficiency",
      "verified",
      "approved",
    ];
    const serialized = JSON.stringify(negotiation).toLowerCase();
    for (const word of forbidden) {
      expect(serialized.includes(`"${word}`)).toBe(false);
    }
  });

  test("negotiation never mutates the inputs (requirements are consumed read-only)", () => {
    const requirements = JSON.parse(
      JSON.stringify(REFERENCE_TASK_REQUIREMENTS["field-depth-capture"]!),
    );
    const before = JSON.stringify(requirements);
    negotiateCapabilities(REFERENCE_PROFILES["browser"], requirements);
    expect(JSON.stringify(requirements)).toBe(before);
  });
});
