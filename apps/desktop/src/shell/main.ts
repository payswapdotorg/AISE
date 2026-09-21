/**
 * PROD-020 — the desktop shell's Electron MAIN entry: the thin PLATFORM
 * layer (the only file in this package that imports `electron`).
 *
 * Thin by construction: every decision is a pure function of
 * `src/shell/policy.ts` (argument handling, URL/loading policy, the
 * declarative menu with its accelerator wiring) and every adapter
 * action goes through the ADAPTER layer's real entrypoints
 * (`@aise/desktop` — the client whose actions resolve to the SHARED
 * server/domain actions). This file wires platform events to those pure
 * functions; it contains no adapter logic of its own and no authority
 * of any kind.
 *
 * The shell loads the EXISTING web application (the dev server URL or
 * its built assets — the loading policy), and adds only
 * desktop-appropriate affordances around it: the menu/accelerator
 * surface, the open-local-file dialog (capability-gated, resolving to a
 * typed TaskIntent the server answers), OS notifications for answered
 * operations (informational only), the recent-projects convenience and
 * the offline TaskIntent outbox replay (the same shared endpoint; only
 * the server's OperationResult completes an intent).
 *
 * Unit-tested BEHAVIOR, untestable BINARY: the shell's behavior (the
 * loading policy, menu/accelerator wiring, deep-link dispatch, the
 * outbox replay calculus) is fully covered by policy/adapter tests
 * under plain `bun test` WITHOUT launching Electron; the launch itself
 * needs a display + the platform binary and is run as the launch smoke
 * at the integration station (see the PROD-020 evidence).
 */

import { app, BrowserWindow, dialog, Menu, Notification } from "electron";
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  buildMenu,
  parseShellArguments,
  REVIEW_WINDOW_SPEC,
  SHELL_IPC_CHANNELS,
  type LoadTarget,
  type MenuSpec,
} from "./policy";
import {
  createDesktopClient,
  createFetchTransport,
  enabledLocalAffordances,
  notificationForOperationStatus,
  taskIntentForLocalFile,
  type DesktopConvenienceState,
} from "../adapter";
import { DESKTOP_ADAPTER_PROFILE } from "../adapter/profile";
import { emptyConvenienceState, enqueueIntent, rememberProject } from "../adapter/convenience-store";

/** The API base URL the adapter client talks to (the same API the web app's dev server proxies). */
const API_BASE_URL = process.env.AISE_API_URL ?? "http://127.0.0.1:8080";

/** The shell's runtime convenience state (never a source of record). */
let convenience: DesktopConvenienceState = emptyConvenienceState();
/** The loaded web-app target (set once at startup by the loading policy). */
let loadTarget: LoadTarget | null = null;

const client = createDesktopClient(
  createFetchTransport((input, init) =>
    fetch(input, {
      method: init?.method,
      body: init?.body,
      headers: { "content-type": "application/json" },
    }),
  ),
  { apiBaseUrl: API_BASE_URL },
);

/** Resolve the load URL for the configured target (policy-driven). */
function loadUrlOf(target: LoadTarget): string {
  if (target.kind === "url") {
    return target.url;
  }
  return `file://${join(target.path, "index.html")}`;
}

/** Create the high-density review window. */
function createReviewWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: REVIEW_WINDOW_SPEC.width,
    height: REVIEW_WINDOW_SPEC.height,
    minWidth: REVIEW_WINDOW_SPEC.minWidth,
    minHeight: REVIEW_WINDOW_SPEC.minHeight,
    title: REVIEW_WINDOW_SPEC.title,
  });
  if (loadTarget !== null) {
    void window.loadURL(loadUrlOf(loadTarget));
  }
  return window;
}

/** Broadcast one adapter answer to every open window (main → renderer). */
function broadcast(payload: unknown): void {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send(SHELL_IPC_CHANNELS.adapterAnswer, payload);
  }
}

/**
 * Dispatch one shell command. Commands resolve through the SAME pure
 * policy the accelerators use; shared-action commands go through the
 * adapter client; presentation commands are forwarded to the renderer.
 */
function dispatchCommand(command: string, targetPane?: string): void {
  const active = BrowserWindow.getAllWindows()[0];
  switch (command) {
    case "open-project": {
      // The project list is SERVER-owned: the command navigates the
      // embedded web app to its own Projects surface (the web app's
      // picker); the desktop shell adds no parallel project database.
      active?.webContents.send(SHELL_IPC_CHANNELS.adapterAnswer, {
        kind: "command",
        command,
        targetPane,
      });
      break;
    }
    case "open-local-file": {
      // Capability-gated: only when the declared profile supports the
      // file-workflow affordance (enabledLocalAffordances is the gate).
      const gated = enabledLocalAffordances(DESKTOP_ADAPTER_PROFILE).some(
        (affordance) => affordance.id === "open-local-file",
      );
      if (!gated) {
        return;
      }
      void (async () => {
        const choice = await dialog.showOpenDialog({ properties: ["openFile"] });
        if (choice.canceled || choice.filePaths.length === 0) {
          return;
        }
        const filePath = choice.filePaths[0];
        if (filePath === undefined) {
          return;
        }
        // The consequential leg is a SHARED server action: a typed
        // TaskIntent the server validates and answers. The local file
        // never becomes evidence or a source of record by being opened.
        const fileName = filePath.split(/[\\/]/).pop() ?? filePath;
        const intent = taskIntentForLocalFile(
          { fileName, byteSize: 0 },
          "proj-current",
          { taskId: `task-local-${Date.now()}`, createdAt: new Date().toISOString() },
        );
        const outcome = await client.submitIntent(intent);
        if (outcome.kind === "unreachable") {
          convenience = enqueueIntent(convenience, intent, new Date().toISOString());
        }
        if (outcome.kind === "answered" && Notification.isSupported()) {
          // The OS notification is INFORMATIONAL ONLY: it restates the
          // server-answered status verbatim (local-integrations.ts).
          const content = notificationForOperationStatus({
            operationId: outcome.answer.result.operationId,
            status: outcome.answer.result.status,
          });
          new Notification({ title: content.title, body: content.body }).show();
        }
        broadcast({ kind: "submit-outcome", outcome });
      })();
      break;
    }
    case "refresh-task-flow":
    case "submit-task-intent":
    case "focus-pane":
    case "focus-next-pane":
    case "cycle-density":
    case "toggle-multi-window-review":
    case "show-shortcuts": {
      // Presentation commands and renderer-state commands flow to the
      // web app's window; the accelerators are bound through the menu.
      active?.webContents.send(SHELL_IPC_CHANNELS.adapterAnswer, {
        kind: "command",
        command,
        targetPane,
      });
      break;
    }
    default:
      break;
  }
}

/** Wire one deep link: open a project through the ADAPTER client. */
async function openProjectDeepLink(projectRef: string): Promise<void> {
  const opened = await client.openProject(projectRef, { convenience });
  if (opened.ok && opened.value.context !== null) {
    // Remember the SERVER-answered context in the recents convenience
    // (display fields only; resolveProjectIdentity always prefers the
    // server — see convenience-store.ts).
    convenience = rememberProject(
      convenience,
      opened.value.context,
      new Date().toISOString(),
    );
  }
  broadcast({ kind: "open-project", projectRef, opened });
}

/** Compile the declarative menu spec into Electron's menu template. */
function compileMenu(items: readonly MenuSpec[]): Electron.MenuItemConstructorOptions[] {
  return items.map((item) => {
    const command = item.command;
    return {
      label: item.label,
      accelerator: item.accelerator,
      click:
        command !== undefined
          ? () => {
              dispatchCommand(command, item.targetPane);
            }
          : undefined,
      submenu: item.submenu !== undefined ? compileMenu(item.submenu) : undefined,
      enabled: item.role !== "separator",
    };
  });
}

/** The offline queue replay tick: the same shared endpoint, server answers only. */
function replayTick(): void {
  void client.replayOutbox(convenience, (state: DesktopConvenienceState) => {
    convenience = state;
  });
}

/* ------------------------------------------------------------------ */
/* The shell lifecycle                                                  */
/* ------------------------------------------------------------------ */

void app.whenReady().then(() => {
  const parsed = parseShellArguments(process.argv.slice(1), process.env, {
    directoryExists: (path: string) => existsSync(path),
  });

  if (parsed.kind === "invalid") {
    dialog.showErrorBox("AISE Desktop — startup rejected", parsed.reason);
    app.quit();
    return;
  }

  loadTarget = parsed.target;

  Menu.setApplicationMenu(
    Menu.buildFromTemplate(
      compileMenu(
        buildMenu({
          recentProjects: convenience.recentProjects.map((entry) => ({
            projectId: entry.projectId,
            projectName: entry.projectName,
          })),
        }),
      ),
    ),
  );

  createReviewWindow();

  if (parsed.kind === "deep-link") {
    void openProjectDeepLink(parsed.projectRef);
  }

  setInterval(replayTick, 30_000);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createReviewWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
