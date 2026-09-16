import { describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  evaluateBoundaries,
  parseImports,
  scanTree,
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

describe("scanTree", () => {
  test("skips tool-output directories (.vercel, node_modules, dist, build, .cache, .git) and non-source extensions", () => {
    const root = mkdtempSync(join(tmpdir(), "aise-boundaries-"));
    try {
      mkdirSync(join(root, "tools", "lib"), { recursive: true });
      writeFileSync(join(root, "tools", "lib", "kept.ts"), "export {};\n");

      // The real-world regression: `vercel build` output under .vercel/ contains
      // copied workspace sources whose relative imports look like root -> root
      // violations to the zone rules. The scanner must never descend into it.
      const vercelFunction = join(root, ".vercel", "output", "functions", "api");
      mkdirSync(vercelFunction, { recursive: true });
      writeFileSync(
        join(vercelFunction, "serverless.mjs"),
        "import { x } from './chunk.js';\n",
      );

      for (const skipped of ["node_modules", "dist", "build", ".cache", ".git"]) {
        mkdirSync(join(root, skipped), { recursive: true });
        writeFileSync(join(root, skipped, "hidden.ts"), "export {};\n");
      }

      // Non-scanned extensions are ignored even in scanned directories.
      writeFileSync(join(root, "tools", "lib", "notes.md"), "import './x';\n");
      writeFileSync(join(root, "tools", "lib", "data.json"), "{}\n");

      const files = scanTree(root);
      expect(files.map((scanned) => scanned.path)).toEqual([
        "tools/lib/kept.ts",
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
