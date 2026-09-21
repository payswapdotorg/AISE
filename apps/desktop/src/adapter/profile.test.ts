/**
 * PROD-020 — the desktop adapter profile tests.
 *
 * The declared `ClientCapabilityProfile` is honest desktop-rich-shell
 * facts (the reference profile as factual template), the implemented
 * interaction modes are a strict subset of the declared modes, and the
 * negotiation is honest platform math: the review-optimized desktop is
 * PERMITTED for BOQ review, BLOCKED for depth/LiDAR capture (capture is
 * delegated to the mobile adapter — never silently downgraded), and
 * DEGRADED for the offline field queue (sensors unsupported,
 * non-blocking).
 */

import { describe, expect, test } from "bun:test";
import {
  ClientCapabilityProfileSchema,
  REFERENCE_DESKTOP_RICH_SHELL_PROFILE,
  REFERENCE_BOQ_REVIEW_REQUIREMENTS,
  REFERENCE_FIELD_DEPTH_CAPTURE_REQUIREMENTS,
  REFERENCE_LIDAR_CAPTURE_REQUIREMENTS,
  REFERENCE_OFFLINE_FIELD_QUEUE_REQUIREMENTS,
  REFERENCE_NOTIFICATION_BROADCAST_REQUIREMENTS,
  deriveInteractionModes,
} from "@aise/adapter-contract";
import {
  DESKTOP_ADAPTER_PROFILE,
  DESKTOP_ADAPTER_PROFILE_ID,
  DESKTOP_IMPLEMENTED_INTERACTION_MODES,
  desktopDeclaredInteractionModes,
  negotiateDesktopTask,
} from "./profile";

describe("PROD-020 desktop capability profile (the honest declaration)", () => {
  test("the declared profile is schema-valid (C1 discipline)", () => {
    const parsed = ClientCapabilityProfileSchema.safeParse(DESKTOP_ADAPTER_PROFILE);
    expect(parsed.success).toBe(true);
  });

  test("the profile facts are the reference desktop-rich-shell facts, verbatim", () => {
    expect(DESKTOP_ADAPTER_PROFILE.adapterKind).toBe("desktop-rich-shell");
    expect(DESKTOP_ADAPTER_PROFILE.screen).toEqual(REFERENCE_DESKTOP_RICH_SHELL_PROFILE.screen);
    expect(DESKTOP_ADAPTER_PROFILE.input).toEqual(REFERENCE_DESKTOP_RICH_SHELL_PROFILE.input);
    expect(DESKTOP_ADAPTER_PROFILE.sensors).toEqual(REFERENCE_DESKTOP_RICH_SHELL_PROFILE.sensors);
    expect(DESKTOP_ADAPTER_PROFILE.camera).toEqual(REFERENCE_DESKTOP_RICH_SHELL_PROFILE.camera);
    expect(DESKTOP_ADAPTER_PROFILE.offlineStorage).toEqual(
      REFERENCE_DESKTOP_RICH_SHELL_PROFILE.offlineStorage,
    );
    expect(DESKTOP_ADAPTER_PROFILE.notifications).toEqual(
      REFERENCE_DESKTOP_RICH_SHELL_PROFILE.notifications,
    );
    expect(DESKTOP_ADAPTER_PROFILE.deepLinks).toEqual(
      REFERENCE_DESKTOP_RICH_SHELL_PROFILE.deepLinks,
    );
  });

  test("the profile id is the adapter's own stable constant (not the reference id)", () => {
    expect(DESKTOP_ADAPTER_PROFILE.profileId).toBe(DESKTOP_ADAPTER_PROFILE_ID);
    expect(DESKTOP_ADAPTER_PROFILE.profileId).not.toBe(
      REFERENCE_DESKTOP_RICH_SHELL_PROFILE.profileId,
    );
  });

  test("the desktop review-optimization facts are honest (no camera, no sensors, multi-window, persistent store)", () => {
    expect(DESKTOP_ADAPTER_PROFILE.camera.descriptor.status).toBe("unavailable");
    expect(DESKTOP_ADAPTER_PROFILE.camera.captureKinds).toEqual([]);
    expect(DESKTOP_ADAPTER_PROFILE.sensors.descriptor.status).toBe("unavailable");
    expect(DESKTOP_ADAPTER_PROFILE.screen.multiWindow).toBe(true);
    expect(DESKTOP_ADAPTER_PROFILE.offlineStorage.mode).toBe("persistent-store");
    expect(DESKTOP_ADAPTER_PROFILE.offlineStorage.queueBoundBytes).toBe(1073741824);
    expect(DESKTOP_ADAPTER_PROFILE.notifications.mode).toBe("system");
    expect(DESKTOP_ADAPTER_PROFILE.input.modes).toEqual(["keyboard", "pointer"]);
  });

  test("the declared modes include the desktop affordances (window management, file workflow, offline queue, keyboard)", () => {
    const declared = desktopDeclaredInteractionModes();
    expect(declared).toEqual([
      "menu-navigation",
      "keyboard-shortcut",
      "table-review",
      "panel-inspection",
      "drag-inspect",
      "window-management",
      "file-workflow",
      "offline-queue",
    ]);
  });

  test("the implemented modes are a STRICT subset of the declared modes (C6 honesty)", () => {
    const declared = new Set<string>(deriveInteractionModes(DESKTOP_ADAPTER_PROFILE));
    for (const mode of DESKTOP_IMPLEMENTED_INTERACTION_MODES) {
      expect(declared.has(mode)).toBe(true);
    }
    // The desktop adapter's own affordances implement 7 of the 8 declared
    // modes; drag-inspect is delegated to the embedded web renderer.
    expect(DESKTOP_IMPLEMENTED_INTERACTION_MODES).toEqual([
      "menu-navigation",
      "keyboard-shortcut",
      "table-review",
      "panel-inspection",
      "window-management",
      "file-workflow",
      "offline-queue",
    ]);
    expect(declared.has("drag-inspect")).toBe(true);
    expect(DESKTOP_IMPLEMENTED_INTERACTION_MODES).not.toContain("drag-inspect");
  });
});

describe("PROD-020 desktop capability negotiation (honest platform math, never authority)", () => {
  test("BOQ review is PERMITTED on the desktop (the review-optimized profile)", () => {
    const negotiation = negotiateDesktopTask(REFERENCE_BOQ_REVIEW_REQUIREMENTS);
    expect(negotiation.outcome).toBe("permitted");
    expect(negotiation.permittedInteractionModes).toContain("table-review");
    expect(negotiation.permittedInteractionModes).toContain("keyboard-shortcut");
    expect(negotiation.profileRef).toBe(DESKTOP_ADAPTER_PROFILE_ID);
  });

  test("depth capture is BLOCKED on the desktop — capture is delegated, never silently downgraded", () => {
    const negotiation = negotiateDesktopTask(REFERENCE_FIELD_DEPTH_CAPTURE_REQUIREMENTS);
    expect(negotiation.outcome).toBe("blocked");
    expect(negotiation.permittedInteractionModes).toEqual([]);
    const camera = negotiation.domainOutcomes.find((domain) => domain.domain === "camera");
    expect(camera?.outcome).toBe("unsupported");
    expect(camera?.reason).toContain("camera capability unavailable on this client");
  });

  test("LiDAR capture is BLOCKED on the desktop too (honest for every client)", () => {
    const negotiation = negotiateDesktopTask(REFERENCE_LIDAR_CAPTURE_REQUIREMENTS);
    expect(negotiation.outcome).toBe("blocked");
    expect(negotiation.permittedInteractionModes).toEqual([]);
  });

  test("the offline field queue is DEGRADED, not blocked (sensors unsupported but non-blocking)", () => {
    const negotiation = negotiateDesktopTask(REFERENCE_OFFLINE_FIELD_QUEUE_REQUIREMENTS);
    expect(negotiation.outcome).toBe("degraded");
    const sensors = negotiation.domainOutcomes.find((domain) => domain.domain === "sensors");
    expect(sensors?.outcome).toBe("unsupported");
    expect(sensors?.blocking).toBe(false);
    const offline = negotiation.domainOutcomes.find(
      (domain) => domain.domain === "offline-storage",
    );
    expect(offline?.outcome).toBe("satisfied");
  });

  test("notification broadcast is PERMITTED (system notifications declared)", () => {
    const negotiation = negotiateDesktopTask(REFERENCE_NOTIFICATION_BROADCAST_REQUIREMENTS);
    expect(negotiation.outcome).toBe("permitted");
  });

  test("the negotiation carries NO authorization, readiness or sufficiency semantics (frozen invariant)", () => {
    const negotiation = negotiateDesktopTask(REFERENCE_BOQ_REVIEW_REQUIREMENTS);
    const keys = Object.keys(negotiation);
    expect(keys).toContain("outcome");
    expect(keys).toContain("domainOutcomes");
    expect(keys).toContain("permittedInteractionModes");
    for (const forbidden of ["authorized", "readiness", "sufficient", "approved", "verified"]) {
      expect(keys.some((key) => key.toLowerCase().includes(forbidden))).toBe(false);
    }
  });
});
