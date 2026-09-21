/**
 * PROD-020 — the SHELL POLICY tests: the thin Electron layer's behavior,
 * unit-tested WITHOUT launching the platform binary — argument handling,
 * the URL/loading policy (the thin-shell contract over the existing web
 * app), deep links, the declarative menu and its accelerator wiring
 * (one command surface with the shortcut registry), and the dispatch
 * resolution the menu and keyboard share.
 */

import { describe, expect, test } from "bun:test";
import {
  AISE_DESKTOP_SCHEME,
  DEFAULT_DEV_URL,
  REVIEW_WINDOW_SPEC,
  SHELL_IPC_CHANNELS,
  acceleratorForCommand,
  acceleratorWiringPlan,
  buildMenu,
  checkUrl,
  dispatchForAccelerator,
  parseDeepLinkProject,
  parseShellArguments,
} from "./policy";
import { DESKTOP_SHORTCUTS, shortcutRegistryDefects } from "../adapter/shortcuts";

const NO_ENV: Record<string, string | undefined> = {};

describe("PROD-020 shell argument handling", () => {
  test("no arguments + no env → the default web dev-server target", () => {
    const parsed = parseShellArguments([], NO_ENV);
    expect(parsed).toEqual({ kind: "load-target", target: { kind: "url", url: DEFAULT_DEV_URL } });
    expect(DEFAULT_DEV_URL).toBe("http://localhost:5173");
  });

  test("--dev is the explicit alias for the default dev target", () => {
    const parsed = parseShellArguments(["--dev"], NO_ENV);
    expect(parsed).toEqual({ kind: "load-target", target: { kind: "url", url: DEFAULT_DEV_URL } });
  });

  test("--url=<http url> is accepted (normalized)", () => {
    const parsed = parseShellArguments(["--url=http://localhost:4173/"], NO_ENV);
    expect(parsed).toEqual({
      kind: "load-target",
      target: { kind: "url", url: "http://localhost:4173/" },
    });
  });

  test("--url rejects non-http schemes (file must use --dir)", () => {
    const parsed = parseShellArguments(["--url=file:///etc/passwd"], NO_ENV);
    expect(parsed.kind).toBe("invalid");
    if (parsed.kind === "invalid") {
      expect(parsed.reason).toContain("only http/https");
    }
  });

  test("--url rejects javascript: and malformed URLs", () => {
    expect(parseShellArguments(["--url=javascript:alert(1)"], NO_ENV).kind).toBe("invalid");
    expect(parseShellArguments(["--url=not a url"], NO_ENV).kind).toBe("invalid");
  });

  test("--dir=<existing directory> is accepted; a missing directory is rejected", () => {
    const exists = (path: string) => path === "/srv/aise/web-dist";
    const okParsed = parseShellArguments(["--dir=/srv/aise/web-dist"], NO_ENV, {
      directoryExists: exists,
    });
    expect(okParsed).toEqual({
      kind: "load-target",
      target: { kind: "directory", path: "/srv/aise/web-dist" },
    });
    const missing = parseShellArguments(["--dir=/no/such/dir"], NO_ENV, {
      directoryExists: exists,
    });
    expect(missing.kind).toBe("invalid");
    if (missing.kind === "invalid") {
      expect(missing.reason).toContain("directory not found");
    }
  });

  test("AISE_DESKTOP_TARGET_URL / AISE_DESKTOP_TARGET_DIR env variables are honored", () => {
    expect(
      parseShellArguments([], { AISE_DESKTOP_TARGET_URL: "http://preview.local:4173" }),
    ).toEqual({
      kind: "load-target",
      target: { kind: "url", url: "http://preview.local:4173/" },
    });
    const exists = (path: string) => path === "/srv/dist";
    expect(
      parseShellArguments([], { AISE_DESKTOP_TARGET_DIR: "/srv/dist" }, {
        directoryExists: exists,
      }),
    ).toEqual({ kind: "load-target", target: { kind: "directory", path: "/srv/dist" } });
  });

  test("--url and --dir are mutually exclusive (an ambiguous startup is rejected)", () => {
    const parsed = parseShellArguments(
      ["--url=http://localhost:5173", "--dir=/srv/dist"],
      NO_ENV,
    );
    expect(parsed.kind).toBe("invalid");
    if (parsed.kind === "invalid") {
      expect(parsed.reason).toContain("mutually exclusive");
    }
  });

  test("unknown arguments are rejected loudly (never silently ignored)", () => {
    const parsed = parseShellArguments(["--evil-flag"], NO_ENV);
    expect(parsed.kind).toBe("invalid");
    if (parsed.kind === "invalid") {
      expect(parsed.reason).toContain("unknown argument: --evil-flag");
    }
  });
});

describe("PROD-020 deep links (aise://project/<id>)", () => {
  test("a deep link parses to its project ref and keeps the configured target", () => {
    const parsed = parseShellArguments(
      [`${AISE_DESKTOP_SCHEME}project/proj-7f3a2b`],
      NO_ENV,
    );
    expect(parsed).toEqual({
      kind: "deep-link",
      projectRef: "proj-7f3a2b",
      target: { kind: "url", url: DEFAULT_DEV_URL },
    });
  });

  test("malformed deep links are rejected", () => {
    expect(parseDeepLinkProject("aise://project/")).toBeNull();
    expect(parseDeepLinkProject("aise://projects/x")).toBeNull();
    expect(parseDeepLinkProject("aise://evil/x")).toBeNull();
    expect(parseDeepLinkProject("http://example.com")).toBeNull();
    expect(parseDeepLinkProject("aise://project/ok-id_1.2")).toBe("ok-id_1.2");
  });
});

describe("PROD-020 checkUrl (the loading policy's acceptance check)", () => {
  test("http and https are accepted; everything else is rejected with the reason", () => {
    expect(checkUrl("http://localhost:5173").kind).toBe("ok");
    expect(checkUrl("https://aise.example.com").kind).toBe("ok");
    expect(checkUrl("ftp://example.com").kind).toBe("invalid");
    expect(checkUrl("file:///x").kind).toBe("invalid");
    expect(checkUrl("aise://project/x").kind).toBe("invalid");
  });
});

describe("PROD-020 the declarative menu (one command surface with the registry)", () => {
  const menu = buildMenu();

  test("the menu holds the four top-level sections (File, View, Review, Help)", () => {
    expect(menu.map((section) => section.id)).toEqual([
      "menu.file",
      "menu.view",
      "menu.review",
      "menu.help",
    ]);
  });

  test("every menu accelerator exists in the shortcut registry (no unbound menu claim)", () => {
    const registryAccelerators = new Set(DESKTOP_SHORTCUTS.map((s) => s.accelerator));
    const walk = (items: readonly ReturnType<typeof buildMenu>[number][]): void => {
      for (const item of items) {
        if (item.accelerator !== undefined) {
          expect(registryAccelerators.has(item.accelerator)).toBe(true);
        }
        if (item.submenu !== undefined) {
          walk(item.submenu);
        }
      }
    };
    walk(menu);
  });

  test("every registry shortcut with inMenu=true has a menu entry (no invisible binding)", () => {
    const menuAccelerators = new Set<string>();
    const walk = (items: readonly ReturnType<typeof buildMenu>[number][]): void => {
      for (const item of items) {
        if (item.accelerator !== undefined) {
          menuAccelerators.add(item.accelerator);
        }
        if (item.submenu !== undefined) {
          walk(item.submenu);
        }
      }
    };
    walk(menu);
    for (const shortcut of DESKTOP_SHORTCUTS.filter((s) => s.inMenu)) {
      expect(menuAccelerators.has(shortcut.accelerator)).toBe(true);
    }
  });

  test("the recent-projects submenu is the honest empty state when no recents exist", () => {
    const file = menu.find((section) => section.id === "menu.file");
    const recent = file?.submenu?.find((item) => item.id === "file.recent");
    expect(recent?.submenu).toEqual([{ id: "file.recent.none", label: "No Recent Projects", role: "separator" }]);
  });

  test("the recent-projects submenu carries the convenience entries (display only)", () => {
    const withRecents = buildMenu({
      recentProjects: [{ projectId: "proj-7f3a2b", projectName: "Riverside Block B Refurbishment" }],
    });
    const file = withRecents.find((section) => section.id === "menu.file");
    const recent = file?.submenu?.find((item) => item.id === "file.recent");
    expect(recent?.submenu).toEqual([
      {
        id: "file.recent.proj-7f3a2b",
        label: "Riverside Block B Refurbishment",
        command: "open-project",
      },
    ]);
  });

  test("the Review menu binds the focus path and the submit-intent command", () => {
    const review = menu.find((section) => section.id === "menu.review");
    const labels = review?.submenu?.map((item) => item.label);
    expect(labels).toEqual([
      "Focus Context Column",
      "Focus Review Column",
      "Focus Action Column",
      "Focus Next Pane",
      "Submit Task Intent",
    ]);
  });
});

describe("PROD-020 the accelerator wiring plan + dispatch resolution", () => {
  test("the wiring plan covers every menu-visible registry shortcut", () => {
    const plan = acceleratorWiringPlan();
    const expected = DESKTOP_SHORTCUTS.filter((shortcut) => shortcut.inMenu);
    expect(plan).toHaveLength(expected.length);
    for (const entry of plan) {
      expect(entry.command).toBeDefined();
    }
  });

  test("dispatchForAccelerator resolves the command the menu would trigger", () => {
    expect(dispatchForAccelerator("CommandOrControl+O")).toEqual({
      command: "open-project",
    });
    expect(dispatchForAccelerator("CommandOrControl+1")).toEqual({
      command: "focus-pane",
      targetPane: "pane:project-context",
    });
    expect(dispatchForAccelerator("CommandOrControl+Enter")).toEqual({
      command: "submit-task-intent",
    });
    expect(dispatchForAccelerator("CommandOrControl+Shift+Q")).toBeNull();
  });

  test("acceleratorForCommand returns the command's first binding (or null)", () => {
    expect(acceleratorForCommand("open-project")).toBe("CommandOrControl+O");
    expect(acceleratorForCommand("show-shortcuts")).toBe("CommandOrControl+/");
    expect(acceleratorForCommand("cycle-density")).toBe("CommandOrControl+D");
  });

  test("the registry itself is defect-free (the wiring plan builds on a clean registry)", () => {
    expect(shortcutRegistryDefects()).toEqual([]);
  });
});

describe("PROD-020 the window policy and the IPC channel vocabulary", () => {
  test("the review window is high-density by default (>= 1200x720, defaulting 1680x1000)", () => {
    expect(REVIEW_WINDOW_SPEC.minWidth).toBeGreaterThanOrEqual(1200);
    expect(REVIEW_WINDOW_SPEC.minHeight).toBeGreaterThanOrEqual(720);
    expect(REVIEW_WINDOW_SPEC.width).toBe(1680);
    expect(REVIEW_WINDOW_SPEC.height).toBe(1000);
  });

  test("the IPC channels are the explicit desktop bridge vocabulary (thin bridges, no side channel)", () => {
    expect(Object.keys(SHELL_IPC_CHANNELS).sort()).toEqual([
      "adapterAnswer",
      "notify",
      "openLocalFile",
      "openProject",
      "submitIntent",
    ]);
    expect(SHELL_IPC_CHANNELS.submitIntent).toBe("desktop:submit-intent");
  });
});
