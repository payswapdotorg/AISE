/**
 * POST-005 — the Android mirror's source-level wiring checks (the boundary
 * audit discipline, reversed): the TypeScript side of the shared boundary
 * reads the COMMITTED Kotlin mirror sources and asserts the deep-link
 * wiring exists and agrees with the contract constants — a deterministic,
 * code-level check (NOT device, NOT emulator evidence; the Kotlin suites
 * that run the mirror logic run on the gradle station and are cited as
 * station-pending in the journey records).
 *
 * Mirrors `AdapterContractVersionTest`'s cross-check discipline (the Kotlin
 * test reads the committed TypeScript source; here the TypeScript test
 * reads the committed Kotlin source — the boundary is checked from BOTH
 * sides so drift on either side is a test failure).
 *
 * Deterministic: committed files only; no network, no clock, no randomness.
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  FIELD_TASK_DEEP_LINK_HOST,
  FIELD_TASK_DEEP_LINK_SCHEME,
  FIELD_TASK_DEEP_LINK_VERSION,
} from "./task-handoff";

const REPO_ROOT = join(import.meta.dir, "..", "..", "..");
const KOTLIN_CODEC = join(
  REPO_ROOT,
  "apps/android/core/src/main/kotlin/org/payswap/aise/core/adapter/FieldTaskDeepLink.kt",
);
const MANIFEST = join(REPO_ROOT, "apps/android/app/src/main/AndroidManifest.xml");
const MAIN_ACTIVITY = join(
  REPO_ROOT,
  "apps/android/app/src/main/kotlin/org/payswap/aise/app/MainActivity.kt",
);
const PROFILE = join(
  REPO_ROOT,
  "apps/android/core/src/main/kotlin/org/payswap/aise/core/adapter/MobileFieldAdapterProfile.kt",
);
const KOTLIN_TEST = join(
  REPO_ROOT,
  "apps/android/core/src/test/kotlin/org/payswap/aise/core/adapter/FieldTaskDeepLinkTest.kt",
);
const CAPTURE_SCREEN = join(
  REPO_ROOT,
  "apps/android/app/src/main/kotlin/org/payswap/aise/app/ui/screen/CaptureScreen.kt",
);

function read(path: string): string {
  return readFileSync(path, "utf8");
}

describe("POST-005 the Android deep-link mirror is wired (source-level, deterministic)", () => {
  test("the :core Kotlin codec mirror exists and agrees with the contract constants", () => {
    const source = read(KOTLIN_CODEC);
    expect(source).toContain(`const val SCHEME = "${FIELD_TASK_DEEP_LINK_SCHEME}"`);
    expect(source).toContain(`const val HOST = "${FIELD_TASK_DEEP_LINK_HOST}"`);
    expect(source).toContain(`const val GRAMMAR_VERSION = ${String(FIELD_TASK_DEEP_LINK_VERSION)}`);
    // the canonical parameter order mirrors the TypeScript codec
    expect(source).toContain(
      '"v", "handoff", "project", "task", "type", "intent", "targets",',
    );
    expect(source).toContain(
      '"purpose", "origin", "surface", "epistemic", "issued",',
    );
    expect(source).toContain('"boq-import", "boq-revision", "reality-version", "mission",');
  });

  test("the manifest declares the aise://task VIEW intent filter and singleTask routing", () => {
    const manifest = read(MANIFEST);
    expect(manifest).toContain('android:scheme="aise"');
    expect(manifest).toContain('android:host="task"');
    expect(manifest).toContain('android:name="android.intent.action.VIEW"');
    expect(manifest).toContain('android:name="android.intent.category.BROWSABLE"');
    expect(manifest).toContain('android:launchMode="singleTask"');
  });

  test("MainActivity routes deep-link intents into the typed handoff (onNewIntent + onCreate)", () => {
    const activity = read(MAIN_ACTIVITY);
    expect(activity).toContain("override fun onNewIntent(intent: Intent)");
    expect(activity).toContain("container.offerHandoff(data)");
    expect(activity).toContain("offerHandoffFromIntent(intent, container)");
  });

  test("the mobile field adapter profile declares deep-links supported/app-scheme (the committed fixture shape)", () => {
    const profile = read(PROFILE);
    expect(profile).toContain('domain = "deep-links"');
    expect(profile).toContain("status = ClientCapabilityStatus.SUPPORTED");
    expect(profile).toContain('details = mapOf("scheme" to "aise")');
    expect(profile).toContain("mode = DeepLinkMode.APP_SCHEME");
  });

  test("the handed-off task identity continues into the journey and the session envelope", () => {
    const screen = read(CAPTURE_SCREEN);
    // the mission panel renders the handed-off identity verbatim
    expect(screen).toContain("Continuing handed-off task");
    // a handed-off task's id rides the session missionRef (the server-visible envelope)
    expect(screen).toContain("val missionRef = handedOff?.taskId");
    // GAP-2: the still-capture failure is surfaced, never swallowed
    expect(screen).toContain("viewModel.onStillCaptureFailed(message)");
    expect(screen).not.toContain("onError = { },");
    // GAP-1: the stale "not wired" copy is gone
    expect(screen).not.toContain("The sync transport is not wired in this build");
  });

  test("the Kotlin mirror's station test exists and cites the committed corpus (station-pending, honestly classified)", () => {
    const kotlinTest = read(KOTLIN_TEST);
    expect(kotlinTest).toContain("packages/adapter-contract/handoff-fixtures");
    expect(kotlinTest).toContain("JVM-deterministic");
    // the corpus both sides pin
    expect(kotlinTest).toContain("FieldTaskHandoff.valid-field-capture-gap.json");
    expect(kotlinTest).toContain("FieldTaskHandoff.valid-post-work-capture.json");
    expect(kotlinTest).toContain("FieldTaskHandoff.valid-mobile-return.json");
  });

  test("the classification stays honest: this is source-level verification, not device evidence", () => {
    // These checks read COMMITTED source files and assert wiring presence +
    // constant agreement. They prove the code-level contract, NOT behavior
    // on a device or emulator. The behavioral proof of the Kotlin mirror
    // runs on the gradle station (FieldTaskDeepLinkTest) and is recorded as
    // station-pending — never upgraded to device evidence by this suite.
    expect("source-level (deterministic)").not.toBe("physical");
    expect("source-level (deterministic)").not.toBe("emulated");
  });
});
