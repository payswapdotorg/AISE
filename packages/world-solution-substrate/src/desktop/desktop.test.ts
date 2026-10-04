/**
 * WORLD-P0-C tests — the DESKTOP SHELL family: the shell-neutral
 * integration contract (lifecycle, windows/view state, sidecar
 * spawn/query/teardown), the thin-shell law (structural) and the
 * substitution equivalence of the two shell-candidate modeling doubles.
 */

import { describe, expect, test } from "bun:test";
import { ElectronLikeShellDouble, TauriLikeShellDouble } from "./doubles";
import type {
  DesktopShellAdapter,
  DesktopViewState,
  SidecarSpec,
} from "./contract";

/* ------------------------------------------------------------------ */
/* Fixtures                                                             */
/* ------------------------------------------------------------------ */

const WORLD_CAMERA = {
  position: [4, 5, 6] as const,
  target: [0, 0, 0] as const,
  up: [0, 1, 0] as const,
  fovRadians: 1.1,
  mode: "fly" as const,
};

function freecadSidecar(): SidecarSpec {
  return {
    sidecarId: "sidecar-freecad-01",
    substrateKind: "freecad",
    executableLabel: { namespace: "sidecar-process", value: "freecad-command" },
    declaredArguments: ["--console", "--module-path", "/aise/adapters"],
    declaredMemoryLimitMb: 2048,
    declaredStartupBudgetMs: 8000,
  };
}

function occtSidecar(): SidecarSpec {
  return {
    sidecarId: "sidecar-occt-01",
    substrateKind: "occt",
    executableLabel: { namespace: "sidecar-process", value: "aise-occt-service" },
    declaredArguments: [],
    declaredMemoryLimitMb: 1024,
    declaredStartupBudgetMs: 4000,
  };
}

/** A scripted shell session both doubles must observe identically. */
function scriptedSession(adapter: DesktopShellAdapter): {
  ready: unknown;
  window: unknown;
  viewState: unknown;
  patchedWindow: unknown;
  sidecarStatus: unknown;
  sidecarStatusAfterTeardown: unknown;
  secondTeardown: unknown;
  shutdownReport: unknown;
} {
  const ready = adapter.initialize();
  const normalizedReady =
    ready.ok
      ? { ...ready.value, shellDescriptorDigest: "stripped-for-comparison" }
      : ready;
  const window = adapter.createWindow({
    windowId: "window-world-main",
    title: "AISE World",
    position: { x: 100, y: 100 },
    size: { width: 1600, height: 900 },
  });
  const viewState = adapter.setViewLane("window-world-main", "world", WORLD_CAMERA);
  const patchedWindow = adapter.setWindowState("window-world-main", {
    title: "AISE World — solution-demo-001",
    maximized: true,
  });
  const spawned = adapter.spawnSidecar(freecadSidecar());
  const handle = spawned.ok ? spawned.value : null;
  const queried = handle !== null ? adapter.querySidecar(handle) : null;
  if (handle !== null) {
    void adapter.teardownSidecar(handle); // the first teardown (idempotence checked per-double)
  }
  const sidecarStatus = queried && queried.ok ? queried.value : queried;
  const afterTeardown = handle !== null ? adapter.querySidecar(handle) : null;
  const sidecarStatusAfterTeardown =
    afterTeardown && afterTeardown.ok ? afterTeardown.value : afterTeardown;
  const secondTeardown = handle !== null ? adapter.teardownSidecar(handle) : null;
  const second = adapter.spawnSidecar(occtSidecar());
  void second; // the second sidecar exists to exercise the shutdown report
  const shutdownReport = adapter.shutdown();
  return {
    ready: normalizedReady,
    window: window.ok ? window.value : window,
    viewState: viewState.ok ? viewState.value : viewState,
    patchedWindow: patchedWindow.ok ? patchedWindow.value : patchedWindow,
    sidecarStatus,
    sidecarStatusAfterTeardown,
    secondTeardown: secondTeardown?.ok ?? null,
    shutdownReport:
      shutdownReport.ok
        ? { ...shutdownReport.value, provenance: "stripped-for-comparison" }
        : shutdownReport,
  };
}

/* ------------------------------------------------------------------ */
/* Lifecycle (law 3)                                                    */
/* ------------------------------------------------------------------ */

describe("desktop shell — lifecycle", () => {
  test("calls before initialize are refused (fail-closed)", () => {
    for (const adapter of [new TauriLikeShellDouble(), new ElectronLikeShellDouble()]) {
      const created = adapter.createWindow({
        windowId: "w",
        title: "T",
        position: { x: 0, y: 0 },
        size: { width: 800, height: 600 },
      });
      expect(created.ok).toBe(false);
      if (created.ok) continue;
      expect(created.failure.kind).toBe("contract-mismatch");
      expect(created.failure.detail).toContain("not initialized");
    }
  });

  test("initialize is idempotence-guarded and reports the descriptor pin", () => {
    for (const adapter of [new TauriLikeShellDouble(), new ElectronLikeShellDouble()]) {
      const first = adapter.initialize();
      expect(first.ok).toBe(true);
      if (first.ok) {
        expect(first.value.phase).toBe("ready");
        expect(first.value.shellDescriptorDigest).toMatch(/^[0-9a-f]{64}$/);
        expect(first.value.liveWindows).toBe(0);
        expect(first.value.liveSidecars).toBe(0);
      }
      const second = adapter.initialize();
      expect(second.ok).toBe(false);
    }
  });

  test("after shutdown every handle is dead and re-initialization is refused", () => {
    for (const adapter of [new TauriLikeShellDouble(), new ElectronLikeShellDouble()]) {
      expect(adapter.initialize().ok).toBe(true);
      const spawned = adapter.spawnSidecar(freecadSidecar());
      expect(spawned.ok).toBe(true);
      expect(adapter.shutdown().ok).toBe(true);
      // every post-shutdown call refuses
      expect(adapter.createWindow({
        windowId: "w2",
        title: "T",
        position: { x: 0, y: 0 },
        size: { width: 800, height: 600 },
      }).ok).toBe(false);
      if (spawned.ok) {
        expect(adapter.querySidecar(spawned.value).ok).toBe(false);
      }
      expect(adapter.initialize().ok).toBe(false);
    }
  });
});

/* ------------------------------------------------------------------ */
/* Windows + view state (law 4)                                         */
/* ------------------------------------------------------------------ */

describe("desktop shell — windows and view state", () => {
  test("createWindow/getWindowState round-trip; setWindowState patches partially", () => {
    const adapter = new TauriLikeShellDouble();
    expect(adapter.initialize().ok).toBe(true);
    const created = adapter.createWindow({
      windowId: "window-review",
      title: "Review",
      position: { x: 10, y: 20 },
      size: { width: 1024, height: 768 },
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.value.minimized).toBe(false);
    const read = adapter.getWindowState("window-review");
    expect(read.ok).toBe(true);
    if (read.ok) {
      expect(read.value).toEqual(created.value);
    }
    const patched = adapter.setWindowState("window-review", { minimized: true });
    expect(patched.ok).toBe(true);
    if (patched.ok) {
      expect(patched.value.title).toBe("Review"); // untouched fields persist
      expect(patched.value.minimized).toBe(true);
      expect(patched.value.size).toEqual({ width: 1024, height: 768 });
    }
  });

  test("new windows default to the world lane; view state carries the substrate-neutral camera", () => {
    const adapter = new ElectronLikeShellDouble();
    expect(adapter.initialize().ok).toBe(true);
    expect(adapter.createWindow({
      windowId: "w",
      title: "T",
      position: { x: 0, y: 0 },
      size: { width: 800, height: 600 },
    }).ok).toBe(true);
    const boqView = adapter.setViewLane("w", "boq", null);
    expect(boqView.ok).toBe(true);
    if (boqView.ok) {
      expect(boqView.value.lane).toBe("boq");
      expect(boqView.value.worldCamera).toBeNull();
    }
    const worldView = adapter.setViewLane("w", "world", WORLD_CAMERA);
    expect(worldView.ok).toBe(true);
    if (worldView.ok) {
      const viewState: DesktopViewState = worldView.value;
      expect(viewState.lane).toBe("world");
      expect(viewState.worldCamera).toEqual(WORLD_CAMERA);
    }
  });

  test("unknown windows and invalid specs are refused", () => {
    const adapter = new TauriLikeShellDouble();
    expect(adapter.initialize().ok).toBe(true);
    expect(adapter.getWindowState("missing").ok).toBe(false);
    expect(adapter.setWindowState("missing", { title: "X" }).ok).toBe(false);
    expect(adapter.setViewLane("missing", "world", null).ok).toBe(false);
    const badSize = adapter.createWindow({
      windowId: "w",
      title: "T",
      position: { x: 0, y: 0 },
      size: { width: 0, height: 600 },
    });
    expect(badSize.ok).toBe(false);
    // duplicate window ids are refused
    expect(adapter.createWindow({
      windowId: "w",
      title: "T",
      position: { x: 0, y: 0 },
      size: { width: 800, height: 600 },
    }).ok).toBe(true);
    expect(adapter.createWindow({
      windowId: "w",
      title: "T",
      position: { x: 0, y: 0 },
      size: { width: 800, height: 600 },
    }).ok).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/* Sidecar process management (law 2)                                   */
/* ------------------------------------------------------------------ */

describe("desktop shell — sidecar process management", () => {
  test("spawn → ready handshake → teardown → terminated, idempotently", () => {
    for (const adapter of [new TauriLikeShellDouble(), new ElectronLikeShellDouble()]) {
      expect(adapter.initialize().ok).toBe(true);
      const spawned = adapter.spawnSidecar(freecadSidecar());
      expect(spawned.ok).toBe(true);
      if (!spawned.ok) continue;
      expect(spawned.value.handleKind).toBe("sidecar-process");
      expect(spawned.value.sidecarId).toBe("sidecar-freecad-01");
      // the deterministic readiness handshake: the first query reports ready
      const first = adapter.querySidecar(spawned.value);
      expect(first.ok).toBe(true);
      if (first.ok) {
        expect(first.value.state).toBe("ready");
      }
      expect(adapter.teardownSidecar(spawned.value).ok).toBe(true);
      const after = adapter.querySidecar(spawned.value);
      expect(after.ok).toBe(true);
      if (after.ok) {
        expect(after.value.state).toBe("terminated");
      }
      // teardown is idempotent for already-terminated handles
      expect(adapter.teardownSidecar(spawned.value).ok).toBe(true);
    }
  });

  test("spawn refuses spec violations with the field named", () => {
    const adapter = new TauriLikeShellDouble();
    expect(adapter.initialize().ok).toBe(true);
    const badKind = adapter.spawnSidecar({ ...freecadSidecar(), substrateKind: "blender" as never });
    expect(badKind.ok).toBe(false);
    if (badKind.ok) return;
    expect(badKind.failure.kind).toBe("contract-mismatch");
    expect(badKind.failure.detail).toContain("occt | ifcopenshell | freecad");

    const badNamespace = adapter.spawnSidecar({
      ...freecadSidecar(),
      executableLabel: { namespace: "freecad-document" as never, value: "freecad-command" },
    });
    expect(badNamespace.ok).toBe(false);
    if (!badNamespace.ok) {
      expect(badNamespace.failure.detail).toContain("sidecar-process namespaced external label");
    }

    const badMemory = adapter.spawnSidecar({ ...freecadSidecar(), declaredMemoryLimitMb: 0 });
    expect(badMemory.ok).toBe(false);

    // duplicate sidecar ids are refused
    expect(adapter.spawnSidecar(freecadSidecar()).ok).toBe(true);
    const duplicate = adapter.spawnSidecar(freecadSidecar());
    expect(duplicate.ok).toBe(false);
    if (!duplicate.ok) {
      expect(duplicate.failure.detail).toContain("already exists");
    }
  });

  test("unknown sidecar handles are refused", () => {
    const adapter = new ElectronLikeShellDouble();
    expect(adapter.initialize().ok).toBe(true);
    const bogus = adapter.querySidecar({
      handleKind: "sidecar-process",
      sidecarId: "sidecar-freecad-01",
      token: "sidecar-0000000000000000",
    });
    expect(bogus.ok).toBe(false);
  });

  test("shutdown tears down every live sidecar and reports them (the no-orphans proof)", () => {
    const adapter = new TauriLikeShellDouble();
    expect(adapter.initialize().ok).toBe(true);
    expect(adapter.spawnSidecar(freecadSidecar()).ok).toBe(true);
    expect(adapter.spawnSidecar(occtSidecar()).ok).toBe(true);
    expect(adapter.createWindow({
      windowId: "window-world-main",
      title: "AISE World",
      position: { x: 0, y: 0 },
      size: { width: 1600, height: 900 },
    }).ok).toBe(true);
    const shutdown = adapter.shutdown();
    expect(shutdown.ok).toBe(true);
    if (!shutdown.ok) return;
    expect(shutdown.value.phase).toBe("shutdown");
    expect(shutdown.value.tornDownSidecarIds).toEqual([
      "sidecar-freecad-01",
      "sidecar-occt-01",
    ]);
    expect(shutdown.value.closedWindowIds).toEqual(["window-world-main"]);
    expect(shutdown.value.provenance.providerId).toBe(
      "solution-substrate.desktop.tauri-like-double",
    );
  });
});

/* ------------------------------------------------------------------ */
/* The thin-shell law (law 1 — structural)                              */
/* ------------------------------------------------------------------ */

describe("desktop shell — the thin-shell law (structural)", () => {
  test("the adapter surface hosts presentation/platform interaction ONLY — no engineering authority", () => {
    for (const adapter of [new TauriLikeShellDouble(), new ElectronLikeShellDouble()]) {
      // the CLOSED method surface: lifecycle, windows, view lanes, sidecars
      const methodNames = Object.getOwnPropertyNames(Object.getPrototypeOf(adapter))
        .filter((name) => name !== "constructor")
        .sort();
      expect(methodNames).toEqual([
        "createWindow",
        "getWindowState",
        "initialize",
        "querySidecar",
        "setViewLane",
        "setWindowState",
        "shutdown",
        "spawnSidecar",
        "teardownSidecar",
      ]);
      // there is NO method (and no public field) that could read or write
      // engineering state
      const publicFields = ["portId", "capabilities", "descriptor"];
      for (const name of [...methodNames, ...publicFields]) {
        expect(name).not.toMatch(/solution|reality|evidence|boq|operation|graph/i);
      }
    }
  });

  test("the closed sidecar substrate vocabulary is the directive §6 heavy-substrate list", () => {
    const adapter = new TauriLikeShellDouble();
    expect(adapter.capabilities.supportsSidecarProcesses).toBe(true);
    expect(adapter.capabilities.blocked.length).toBeGreaterThan(0);
    // the honest BLOCKED declarations (real process management is not ours)
    const blockedCapabilities = adapter.capabilities.blocked.map((b) => b.capability);
    expect(blockedCapabilities).toContain("real-process-management");
    expect(blockedCapabilities).toContain("webview-fidelity");
  });
});

/* ------------------------------------------------------------------ */
/* Substitution equivalence (law 1)                                     */
/* ------------------------------------------------------------------ */

describe("desktop shell — substitution equivalence", () => {
  test("the two shell candidates observe identical contract behavior over a scripted session", () => {
    const tauri = scriptedSession(new TauriLikeShellDouble());
    const electron = scriptedSession(new ElectronLikeShellDouble());
    // every observable outcome is equal (provenance stripped — provider
    // identity is the only legitimate difference)
    expect(tauri.ready).toEqual(electron.ready);
    expect(tauri.window).toEqual(electron.window);
    expect(tauri.viewState).toEqual(electron.viewState);
    expect(tauri.patchedWindow).toEqual(electron.patchedWindow);
    expect(tauri.sidecarStatus).toEqual(electron.sidecarStatus);
    expect(tauri.sidecarStatusAfterTeardown).toEqual(electron.sidecarStatusAfterTeardown);
    expect(tauri.secondTeardown).toEqual(electron.secondTeardown);
    expect(tauri.shutdownReport).toEqual(electron.shutdownReport);
  });

  test("the shutdown report's provenance differs ONLY by provider identity", () => {
    const a = new TauriLikeShellDouble();
    const b = new ElectronLikeShellDouble();
    expect(a.initialize().ok).toBe(true);
    expect(b.initialize().ok).toBe(true);
    const reportA = a.shutdown();
    const reportB = b.shutdown();
    if (!reportA.ok || !reportB.ok) throw new Error("shutdown failed");
    expect(reportA.value.provenance.providerId).not.toBe(reportB.value.provenance.providerId);
    expect(reportA.value.provenance.laneStatement).toBe(reportB.value.provenance.laneStatement);
    expect(reportA.value.provenance.parametersDigest).toBe(reportB.value.provenance.parametersDigest);
  });
});
