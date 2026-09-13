import { describe, expect, test } from "bun:test";
import {
  evaluateBoundaries,
  parseImports,
  zoneOf,
  type SourceFile,
} from "./boundaries";

describe("parseImports", () => {
  test("collects static, side-effect, dynamic and re-export specifiers", () => {
    const code = [
      'import { a } from "bun:test";',
      'import type { B } from "./types";',
      'import c from "node:path";',
      'import "./side-effect";',
      'const m = await import("vite");',
      'export { d } from "node:fs";',
    ].join("\n");
    expect(parseImports(code)).toEqual([
      "./side-effect",
      "./types",
      "bun:test",
      "node:fs",
      "node:path",
      "vite",
    ]);
  });

  test("deduplicates and sorts specifiers", () => {
    const code = 'import { x } from "./b"; import { y } from "./a"; import { z } from "./a";';
    expect(parseImports(code)).toEqual(["./a", "./b"]);
  });
});

describe("zoneOf", () => {
  test("classifies files by their top-level directory", () => {
    expect(zoneOf("apps/web/src/main.ts")).toBe("apps");
    expect(zoneOf("apps/android/src/Main.kt")).toBe("apps");
    expect(zoneOf("backend/api/src/main.ts")).toBe("backend");
    expect(zoneOf("packages/shared-contracts/src/index.ts")).toBe("packages");
    expect(zoneOf("tools/verify.ts")).toBe("tools");
    expect(zoneOf("eslint.config.js")).toBe("root");
  });
});

describe("evaluateBoundaries", () => {
  const file = (path: string, imports: string[]): SourceFile => ({ path, imports });

  test("allows same-zone, packages-zone, bare and builtin imports", () => {
    expect(
      evaluateBoundaries([
        file("apps/web/src/main.ts", [
          "./app",
          "../../../packages/shared-contracts/src/index.ts",
          "bun:test",
        ]),
        file("backend/api/src/main.ts", [
          "./lib/config",
          "../../package.json",
          "node:fs",
        ]),
        file("tools/verify.ts", ["./lib/boundaries", "node:path"]),
      ]),
    ).toEqual([]);
  });

  test("rejects cross-zone relative imports from every zone", () => {
    const violations = evaluateBoundaries([
      file("apps/web/src/main.ts", ["../../../backend/api/src/server.ts"]),
      file("backend/api/src/main.ts", ["../../../apps/web/src/app.ts"]),
      file("packages/shared-contracts/src/index.ts", ["../../../backend/api/src/lib/config.ts"]),
      file("tools/verify.ts", ["../apps/web/src/app.ts"]),
      file("eslint.config.js", ["./backend/api/src/server.ts"]),
    ]);
    expect(violations).toHaveLength(5);
    const pairs = violations.map((violation) => [violation.sourceZone, violation.targetZone]);
    expect(pairs).toContainEqual(["apps", "backend"]);
    expect(pairs).toContainEqual(["backend", "apps"]);
    expect(pairs).toContainEqual(["packages", "backend"]);
    expect(pairs).toContainEqual(["tools", "apps"]);
    expect(pairs).toContainEqual(["root", "backend"]);
  });

  test("rejects imports that escape the repository root", () => {
    const violations = evaluateBoundaries([
      file("tools/verify.ts", ["../../../../outside/lib.ts"]),
    ]);
    expect(violations).toHaveLength(1);
    expect(violations[0]?.targetZone).toBe("outside");
    expect(violations[0]?.reason).toContain("escapes the repository root");
  });

  test("reports violations in deterministic file order", () => {
    const violations = evaluateBoundaries([
      file("tools/verify.ts", ["../apps/web/src/app.ts"]),
      file("backend/api/src/main.ts", ["../../../apps/web/src/app.ts"]),
    ]);
    expect(violations.map((violation) => violation.file)).toEqual([
      "backend/api/src/main.ts",
      "tools/verify.ts",
    ]);
  });
});
