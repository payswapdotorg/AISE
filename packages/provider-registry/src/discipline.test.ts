/**
 * HFX-000 — the control-plane discipline test (the doctrine preserved
 * lexically, mirroring the solution-boq "no-write-path scan" discipline).
 *
 * Proves, by scanning this package's own sources:
 *
 *   1. NO canonical-domain import: the package never imports
 *      `@aise/solution-contract`, `@aise/solution-engine`,
 *      `@aise/solution-boq` or anything from `backend/**`/`apps/**` —
 *      provider-specific types cannot cross the canonical AISE domain
 *      boundary because the boundary is never even reached. The ONLY
 *      shared-contracts import is the canonical-JSON serializer in
 *      digest.ts (a pure text helper, asserted below).
 *   2. PURE DETERMINISTIC CORE: the core modules (everything except the
 *      TEST-ONLY testkit.ts and the test files) contain NO filesystem
 *      access, NO network access, NO clock reads, NO randomness — the
 *      lexical markers of the determinism contract.
 *   3. No `any` escapes the package (typed surfaces only).
 */

import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const SRC = join(import.meta.dir);
const CORE_EXCLUDE = new Set(["testkit.ts", "testkit.test.ts", "lifecycle.test.ts"]);
const files = readdirSync(SRC)
  .filter((name) => name.endsWith(".ts"))
  .sort();
const nonTestFiles = files.filter((name) => !name.endsWith(".test.ts"));
const coreFiles = files.filter((name) => !CORE_EXCLUDE.has(name) && !name.endsWith(".test.ts"));

function sourceOf(name: string): string {
  return readFileSync(join(SRC, name), "utf8");
}

describe("the canonical-domain boundary (never crossed)", () => {
  test("no source imports any canonical AISE domain package", () => {
    const forbidden = /from\s+["']@aise\/(solution-contract|solution-engine|solution-boq|api)["']/;
    for (const name of files) {
      expect(`${name}: ${forbidden.exec(sourceOf(name))?.[0] ?? "clean"}`).toBe(`${name}: clean`);
    }
  });

  test("no source reaches into backend/ or apps/ (the zone gate's lexical mirror)", () => {
    const forbidden = /from\s+["']\.\.\/\.\.\/(backend|apps)\//;
    for (const name of files) {
      expect(forbidden.test(sourceOf(name))).toBe(false);
    }
  });

  test("the ONLY non-test shared-contracts import is the canonical-JSON serializer in digest.ts", () => {
    for (const name of nonTestFiles) {
      const source = sourceOf(name);
      const matches = source.match(/from\s+["']@aise\/shared-contracts["']/g) ?? [];
      if (name === "digest.ts") {
        expect(matches).toHaveLength(1);
        expect(source).toContain("canonicalJsonStringify");
      } else {
        expect(matches, `${name} imports shared-contracts`).toHaveLength(0);
      }
    }
  });
});

describe("the pure deterministic core (no fs / net / clock / randomness)", () => {
  test("the core module inventory is exactly the control-plane surface", () => {
    expect(coreFiles).toEqual([
      "benchmark.ts",
      "digest.ts",
      "failures.ts",
      "index.ts",
      "io.ts",
      "profile.ts",
      "provenance.ts",
      "registry.ts",
    ]);
  });

  test("no core module touches the filesystem, the network, the clock or randomness", () => {
    const forbidden = [
      /node:fs/,
      /node:net/,
      /node:http/,
      /node:https/,
      /\bfetch\s*\(/,
      /\bDate\.now\b/,
      /new\s+Date\b/,
      /Math\.random/,
      /performance\.now/,
      /\bsetTimeout\b/,
      /\bsetInterval\b/,
      /process\.env/,
      /process\.platform/,
      /process\.version/,
    ];
    for (const name of coreFiles) {
      const source = sourceOf(name);
      for (const pattern of forbidden) {
        expect(`${name} contains ${pattern}: ${pattern.exec(source)?.[0] ?? "clean"}`).toBe(
          `${name} contains ${pattern}: clean`,
        );
      }
    }
  });

  test("the TEST-ONLY testkit is the sole non-test fs user and says so", () => {
    const fsUsers = nonTestFiles.filter((name) => /node:fs/.test(sourceOf(name)));
    expect(fsUsers).toEqual(["testkit.ts"]);
    expect(sourceOf("testkit.ts")).toContain("TEST-ONLY");
  });
});

describe("typed surfaces only", () => {
  test("no explicit any TYPE appears in the core module sources", () => {
    // matches type positions only (`: any`, `as any`, `<any>`, `any[]`) —
    // the word "any" in documentation prose is not a type escape
    const anyType = /(?::\s*any\b|as\s+any\b|<any>|any\[\]|Record<[^>]*,\s*any>)/;
    for (const name of coreFiles) {
      const source = sourceOf(name);
      expect(`${name}: ${anyType.exec(source)?.[0] ?? "clean"}`).toBe(`${name}: clean`);
    }
  });
});
