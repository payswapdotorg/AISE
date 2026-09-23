/**
 * PROD-031 — browser-safety tests: the `@aise/solution-contract/browser`
 * subpath is the crypto-free cut of the package's public API.
 *
 * The defect class (PROD-030 documented it for node:fs/node:path, PROD-031
 * closes it for node:crypto): the BARREL re-exports `src/identity.ts`,
 * whose module scope imports `node:crypto`'s `createHash` — a plain
 * browser bundle externalizes the builtin (the empty-exports stub whose
 * namespace call throws at call time), so any browser graph importing the
 * barrel carries the crypto stub and the identity derivations crash at
 * call time. The seam fix: a documented additive subpath
 * (`@aise/solution-contract/browser`) that re-exports every crypto-FREE
 * family from the SAME modules as the barrel, and NOTHING that
 * transitively needs `createHash`.
 *
 * These tests pin BOTH sides of the seam:
 *
 *  - the subpath's module source references NO `./identity` (or
 *    fixtures-loader) specifier — crypto-freeness BY CONSTRUCTION, the
 *    only module of this package that imports `node:crypto` is identity.ts;
 *  - the identity module is (and stays) the ONLY crypto importer of the
 *    package — the cut's premise is verified, never assumed;
 *  - the subpath's RUNTIME namespace carries the browser graph's sentinel
 *    values (the intent constructor, the reference capability profile, the
 *    bidirectional BOQ trace resolvers) and does NOT carry the identity
 *    derivations;
 *  - the package's exports map declares the subpath (the public contract
 *    that makes it resolvable for every consumer).
 *
 * The BUILD-side proof (the browser mount's chunk carries no Node-builtin
 * externalization marker at all) lives in the PROD-031 web-bundle gate
 * (tools/web-bundle) — these tests pin the package-side seam.
 *
 * Deterministic: committed files only; no network, no clock, no randomness.
 */

import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import * as browserApi from "./browser";

/** Every non-test module of this package (the crypto-freeness premise). */
function sourceModules(): string[] {
  return readdirSync(import.meta.dir)
    .filter((name) => name.endsWith(".ts") && !name.endsWith(".test.ts"))
    .sort();
}

describe("PROD-031 the browser subpath is the crypto-free cut (by construction)", () => {
  test("the browser module's source references no identity or fixtures-loader specifier", () => {
    const source = readFileSync(join(import.meta.dir, "browser.ts"), "utf8");
    // The module SPECIFIER (not prose): the header comment may honestly
    // NAME ./identity, but no import/export statement may reference it.
    const statements = source.split("\n").filter((line) => /^\s*(import|export)\b/.test(line));
    for (const line of statements) {
      expect(line.includes('"./identity"')).toBe(false);
      expect(line.includes('"./fixtures-loader"')).toBe(false);
    }
  });

  test("identity.ts is (and stays) the ONLY module importing node:crypto here", () => {
    const cryptoImporters = sourceModules().filter((name) => {
      const source = readFileSync(join(import.meta.dir, name), "utf8");
      return /from\s*["']node:crypto["']|require\(["']node:crypto["']\)/.test(source);
    });
    expect(cryptoImporters).toEqual(["identity.ts"]);
  });

  test("no module the browser cut re-exports transitively imports identity", () => {
    // The cut's premise verified mechanically: every module the browser
    // module references, and every module THOSE reference (one hop deep is
    // enough for this package's flat graph), must be crypto-free files.
    const browserSource = readFileSync(join(import.meta.dir, "browser.ts"), "utf8");
    const referenced = [
      ...browserSource.matchAll(/from\s*"(\.\/[A-Za-z0-9.-]+)"/g),
    ].map((match) => match[1]!.slice("./".length).concat(".ts"));
    expect(referenced.length).toBeGreaterThan(10);
    for (const module of referenced) {
      const source = readFileSync(join(import.meta.dir, module), "utf8");
      expect(source.includes("node:crypto")).toBe(false);
      // One hop deeper: the module's own relative imports must also be
      // crypto-free modules of this package.
      for (const inner of source.matchAll(/from\s*"(\.\/[A-Za-z0-9.-]+)"/g)) {
        const innerSource = readFileSync(
          join(import.meta.dir, inner[1]!.slice("./".length).concat(".ts")),
          "utf8",
        );
        expect(innerSource.includes("node:crypto")).toBe(false);
      }
    }
  });
});

describe("PROD-031 the browser subpath's runtime namespace (the sentinels + the exclusions)", () => {
  test("carries the browser graph's sentinel values (constructor, profile, resolvers)", () => {
    const exportedNames = new Set(Object.keys(browserApi));
    for (const sentinel of [
      "SOLUTION_CONTRACT_VERSION",
      "createOperationIntent",
      "REFERENCE_BUILDING_DOMAIN",
      "REFERENCE_BUILDING_OPERATION_PROFILE",
      "resolveLinesForOperation",
      "resolveOperationsForLine",
      "decodeSolutionVersionStrict",
      "encodeSolutionBoqTraceSet",
      "checkSolutionContractObject",
    ]) {
      expect(exportedNames.has(sentinel)).toBe(true);
    }
  });

  test("does NOT carry the crypto-dependent identity derivations", () => {
    const exportedNames = new Set(Object.keys(browserApi));
    for (const excluded of [
      "deriveEngineeringOperationId",
      "deriveProposedStateId",
      "deriveValidationSnapshotId",
      "deriveSolutionBoqLineTraceId",
      "operationSemanticIdentityOfIntent",
      "operationSemanticIdentityOfOperation",
    ]) {
      expect(exportedNames.has(excluded)).toBe(false);
    }
  });

  test("the sentinel values are the SAME objects as the barrel's (one contract, two entry points)", async () => {
    const barrel = await import("./index");
    expect(browserApi.createOperationIntent).toBe(barrel.createOperationIntent);
    expect(browserApi.REFERENCE_BUILDING_OPERATION_PROFILE).toBe(
      barrel.REFERENCE_BUILDING_OPERATION_PROFILE,
    );
    expect(browserApi.resolveLinesForOperation).toBe(barrel.resolveLinesForOperation);
    expect(browserApi.resolveOperationsForLine).toBe(barrel.resolveOperationsForLine);
  });
});

describe("PROD-031 the documented browser subpath is resolvable (the exports map)", () => {
  test("the package exports map declares the subpath beside the barrel", () => {
    const packageJson = JSON.parse(
      readFileSync(join(import.meta.dir, "..", "package.json"), "utf8"),
    ) as { exports?: Record<string, string> };
    expect(packageJson.exports?.["."]).toBe("./src/index.ts");
    expect(packageJson.exports?.["./browser"]).toBe("./src/browser.ts");
    expect(packageJson.exports?.["./fixtures-loader"]).toBe("./src/fixtures-loader.ts");
  });
});
