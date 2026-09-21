/**
 * PROD-020 — the local integration affordances tests: every affordance
 * is gated behind an explicit capability declaration, every affordance
 * is non-authoritative, the open-local-file consequential leg authors a
 * typed TaskIntent (the server validates and answers), and the OS
 * notification is informational only.
 */

import { describe, expect, test } from "bun:test";
import {
  REFERENCE_BROWSER_PROFILE,
  REFERENCE_DESKTOP_RICH_SHELL_PROFILE,
  REFERENCE_MOBILE_FIELD_PROFILE,
  decodeTaskIntent,
} from "@aise/adapter-contract";
import { DESKTOP_ADAPTER_PROFILE } from "./profile";
import {
  LOCAL_AFFORDANCES,
  LOCAL_AFFORDANCE_IDS,
  enabledLocalAffordances,
  localAffordanceById,
  notificationForOperationStatus,
  taskIntentForLocalFile,
} from "./local-integrations";

describe("PROD-020 the affordance catalogue (optional, capability-gated)", () => {
  test("the catalogue declares exactly the four desktop affordances", () => {
    expect(LOCAL_AFFORDANCE_IDS).toEqual([
      "open-local-file",
      "os-notification",
      "recent-projects",
      "task-intent-outbox",
    ]);
    expect(LOCAL_AFFORDANCES).toHaveLength(4);
  });

  test("NO affordance is authoritative (the frozen discipline, in data)", () => {
    for (const affordance of LOCAL_AFFORDANCES) {
      expect(affordance.authoritative).toBe(false);
    }
  });

  test("every affordance names its required capability declaration", () => {
    for (const affordance of LOCAL_AFFORDANCES) {
      expect(affordance.requires.length).toBeGreaterThan(0);
      expect(affordance.requires[0]).toMatch(/^(offline-storage|notifications): /);
    }
  });

  test("localAffordanceById resolves catalogue entries", () => {
    expect(localAffordanceById("os-notification")?.resolvesTo).toBe("informational-only");
    expect(localAffordanceById("open-local-file")?.resolvesTo).toBe("shared-action");
    expect(localAffordanceById("no-such-affordance")).toBeNull();
  });
});

describe("PROD-020 the capability gate (an unsupported affordance is not wired)", () => {
  test("the declared desktop profile enables ALL FOUR affordances (persistent store + system notifications)", () => {
    const enabled = enabledLocalAffordances(DESKTOP_ADAPTER_PROFILE);
    expect(enabled.map((affordance) => affordance.id)).toEqual([
      "open-local-file",
      "os-notification",
      "recent-projects",
      "task-intent-outbox",
    ]);
  });

  test("the reference browser profile (session cache, in-app notifications) enables NONE", () => {
    expect(enabledLocalAffordances(REFERENCE_BROWSER_PROFILE)).toEqual([]);
  });

  test("the reference mobile profile (bounded queue, system notifications) enables only the OS notification", () => {
    const enabled = enabledLocalAffordances(REFERENCE_MOBILE_FIELD_PROFILE);
    expect(enabled.map((affordance) => affordance.id)).toEqual(["os-notification"]);
  });

  test("the reference desktop-rich-shell profile (the factual template) enables all four", () => {
    expect(enabledLocalAffordances(REFERENCE_DESKTOP_RICH_SHELL_PROFILE)).toHaveLength(4);
  });
});

describe("PROD-020 the open-local-file consequential leg (a shared server action)", () => {
  test("opening a local file authors a typed TaskIntent the contract decodes", () => {
    const intent = taskIntentForLocalFile(
      { fileName: "site-boq-rev2.xlsx", byteSize: 48213 },
      "proj-7f3a2b",
      { taskId: "task-local-1", createdAt: "2026-01-15T13:00:00.000Z" },
    );
    const decoded = decodeTaskIntent(intent);
    expect(decoded.taskId).toBe("task-local-1");
    expect(decoded.taskType).toBe("project-administration");
    expect(decoded.projectRef).toBe("proj-7f3a2b");
    expect(decoded.parameters.fileName).toBe("site-boq-rev2.xlsx");
    expect(decoded.parameters.byteSize).toBe("48213");
    expect(decoded.parameters.channel).toBe("desktop-local-file");
    expect(decoded.intent).toContain("site-boq-rev2.xlsx");
  });

  test("the intent states the INGESTION semantics (the file is considered, never ingested by the client)", () => {
    const intent = taskIntentForLocalFile(
      { fileName: "drawing-l2.pdf", byteSize: 1048576 },
      "proj-7f3a2b",
      { taskId: "task-local-2", createdAt: "2026-01-15T13:05:00.000Z" },
    );
    expect(intent.intent).toContain("through the shared ingestion contracts");
    expect(intent.intent).toContain("proj-7f3a2b");
  });

  test("opening a file changes nothing by itself — the local file selection is inert data", () => {
    // The selection is plain data; the ONLY consequential path is the
    // authored TaskIntent (above) submitted through the shared endpoint
    // (exercised in client.test.ts / the journey test).
    const selection = { fileName: "x.ifc", byteSize: 1 };
    expect(selection.fileName).toBe("x.ifc");
    expect(taskIntentForLocalFile(selection, "p", {
      taskId: "t",
      createdAt: "2026-01-01T00:00:00.000Z",
    }).targetRefs).toEqual(["p"]);
  });
});

describe("PROD-020 the OS notification affordance (informational only)", () => {
  test("a notification restates the SERVER-answered status verbatim", () => {
    const content = notificationForOperationStatus({
      operationId: "operation-3fa9",
      status: "failed",
    });
    expect(content.title).toBe("AISE operation failed");
    expect(content.body).toContain("operation-3fa9");
    expect(content.body).toContain("failed");
    expect(content.body).toContain("server-authoritative");
  });

  test("the notification vocabulary never approves, verifies or records", () => {
    for (const status of ["succeeded", "failed", "unknown"]) {
      const content = notificationForOperationStatus({
        operationId: "operation-3fa9",
        status,
      });
      expect(/approv|verif|record|authoriz/i.test(`${content.title} ${content.body}`)).toBe(
        false,
      );
    }
  });
});
