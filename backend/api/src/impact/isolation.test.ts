/**
 * AISE-028 — DERIVED-PROJECTION ISOLATION tests (the module's defining
 * constraint).
 *
 * THE CRITICAL MATRIX:
 *  - THE IMPORT TRIPWIRE: no production file of the impact module imports a
 *    sibling DOMAIN module at runtime — the intervention and BOQ
 *    authorities enter ONLY as read-only TYPE imports (intervention/model,
 *    boq/model, boq/mapping/model), plus the PURE first-order uncertainty
 *    propagation helper from geometry/uncertainty (a stateless math
 *    function, the same read-only reuse the projections module practices).
 *    There is structurally no write path from impact computations into the
 *    intervention or BOQ authorities.
 *  - FROZEN INPUTS SURVIVE: deep-frozen scenario/mapping projections pass
 *    through the compute unmutated (strict-mode freezes throw on writes).
 *  - THE AUTHORITIES ARE NEVER WRITTEN: computing an impact over REAL
 *    InterventionService + MappingService instances leaves their on-disk
 *    canonical bytes and record sets untouched — the read-only resolver
 *    seam over the real owning services.
 *  - The server's default wiring follows the AISE-031 leak rule: private
 *    instances over the handler's OWN env data dir, never a memoized
 *    sibling wiring, guarded by the /v1/impacts path check.
 */

import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { canonicalJsonStringify } from "@aise/shared-contracts";
import { sha256Hex } from "../lib/hash";
import { BoqService } from "../boq/service";
import { FsBoqStore } from "../boq/store";
import { NormalizationService } from "../boq/normalization/service";
import { FsNormalizationStore } from "../boq/normalization/store";
import { MappingService } from "../boq/mapping/service";
import { FsMappingStore } from "../boq/mapping/store";
import { InterventionService } from "../intervention/service";
import { FsInterventionStore } from "../intervention/store";
import { buildBaselineStorey, makeBaselineResolver } from "../intervention/testkit";
import { ImpactService, readOnlyImpactBoqMappingResolver, readOnlyImpactScenarioResolver } from "./service";
import { FsImpactStore, InMemoryImpactStore } from "./store";
import { deepFreeze, fixedClock, withTempDir } from "./testkit";
import { buildCanonicalMappingInput, buildCanonicalScenarioInput, CANONICAL_COMPUTE } from "./testkit";

/* ------------------------------------------------------------------ */
/* Import tripwire                                                      */
/* ------------------------------------------------------------------ */

const MODULE_DIR = join(import.meta.dir);
const REPO_API_SRC = join(MODULE_DIR, "..");

/** Extract import statements (specifier + whether the whole import is type-only). */
function importStatements(code: string): { specifier: string; typeOnly: boolean }[] {
  const found: { specifier: string; typeOnly: boolean }[] = [];
  const pattern = /import\s+(type\s+)?[^;]*?from\s*["']([^"']+)["']/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(code)) !== null) {
    found.push({ specifier: match[2] ?? "", typeOnly: (match[1] ?? "").trim() === "type" });
  }
  return found;
}

/** The sanctioned read-only imports (see the module header contract). */
const SANCTIONED_TYPE_ONLY = new Set([
  "../intervention/model",
  "../boq/model",
  "../boq/mapping/model",
]);
const SANCTIONED_RUNTIME = new Set([
  "../lib/hash",
  "../lib/http",
  "../lib/log",
  "../geometry/uncertainty",
]);

describe("impact isolation: the import tripwire", () => {
  test("NO production module file imports a sibling domain module at runtime", () => {
    const files = readdirSync(MODULE_DIR)
      .filter((entry) => entry.endsWith(".ts") && !entry.endsWith(".test.ts"))
      .sort();
    expect(files).toEqual(["index.ts", "model.ts", "router.ts", "service.ts", "store.ts", "testkit.ts"]);
    for (const file of files) {
      const code = readFileSync(join(MODULE_DIR, file), "utf8");
      for (const entry of importStatements(code)) {
        if (!entry.specifier.startsWith("../") || entry.specifier.startsWith("../lib/")) {
          continue; // bare packages (bun:test / @aise/shared-contracts) and lib
        }
        // The ONLY sanctioned sibling imports: read-only TYPE imports from
        // the owning authorities' models, and the PURE uncertainty helper.
        if (SANCTIONED_TYPE_ONLY.has(entry.specifier)) {
          expect(entry.typeOnly).toBe(true);
          continue;
        }
        if (SANCTIONED_RUNTIME.has(entry.specifier)) {
          continue;
        }
        // Anything else into a sibling domain module is a violation.
        expect(`${file} imports ${entry.specifier}`).toBe("never reached");
      }
    }
  });

  test("the server's default impact wiring is read-only and leak-free (the AISE-031 rule)", () => {
    const serverSource = readFileSync(join(REPO_API_SRC, "server.ts"), "utf8");
    // The delegation block carries the path guard.
    expect(serverSource).toContain('url.pathname === "/v1/impacts"');
    expect(serverSource).toContain('url.pathname.startsWith("/v1/impacts/")');
    // The default wiring function constructs PRIVATE instances over the
    // handler's OWN env data dir — it never reads a memoized sibling
    // wiring (no defaultInterventionRoutes/defaultBoqRoutes references).
    const wiring = /function impactRoutesOrDefault\([\s\S]*?\n\}/.exec(serverSource);
    expect(wiring).not.toBeNull();
    expect(wiring![0]).not.toContain("interventionRoutesOrDefault(");
    expect(wiring![0]).not.toContain("boqRoutesOrDefault(");
    expect(wiring![0]).not.toContain("executionRoutesOrDefault(");
    expect(wiring![0]).toContain("readOnlyImpactScenarioResolver");
    expect(wiring![0]).toContain("readOnlyImpactBoqMappingResolver");
    // The AISE-028 block sits immediately after the AISE-031 delegation.
    const executionBlock = serverSource.indexOf(
      'url.pathname === "/v1/executions"',
    );
    const impactBlock = serverSource.indexOf('url.pathname === "/v1/impacts"');
    expect(executionBlock).toBeGreaterThan(0);
    expect(impactBlock).toBeGreaterThan(executionBlock);
    const executionWiring = serverSource.indexOf("function executionRoutesOrDefault");
    const impactWiring = serverSource.indexOf("function impactRoutesOrDefault");
    expect(impactWiring).toBeGreaterThan(executionWiring);
  });
});

/* ------------------------------------------------------------------ */
/* Frozen inputs survive the computation                                */
/* ------------------------------------------------------------------ */

describe("impact isolation: frozen projections survive unmutated", () => {
  test("deep-frozen scenario + mapping inputs pass through compute without a single write", async () => {
    const scenario = deepFreeze(buildCanonicalScenarioInput());
    const mapping = deepFreeze(buildCanonicalMappingInput());
    const service = new ImpactService({
      store: new InMemoryImpactStore(),
      clock: fixedClock,
      scenarioResolver: {
        resolveImpactScenario: async (scenarioId) =>
          scenarioId === scenario.scenarioId ? scenario : null,
      },
      mappingResolver: {
        resolveImpactBoqMapping: async (importId) =>
          importId === mapping.importId ? mapping : null,
      },
    });
    const record = await service.computeImpact(CANONICAL_COMPUTE);
    expect(record.report.summary.lineCount).toBe(9);
    // Strict-mode deep freezes throw on ANY write attempt; the computation
    // completed, so the projections were never mutated.
    expect(canonicalJsonStringify(buildCanonicalScenarioInput())).toBe(
      canonicalJsonStringify(scenario),
    );
    expect(canonicalJsonStringify(buildCanonicalMappingInput())).toBe(
      canonicalJsonStringify(mapping),
    );
  });
});

/* ------------------------------------------------------------------ */
/* The authorities are never written (real services behind the seam)    */
/* ------------------------------------------------------------------ */

/** Recursively list all files under a directory (deterministic order). */
function listFilesRecursive(root: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      out.push(...listFilesRecursive(path));
    } else {
      out.push(path);
    }
  }
  return out.sort();
}

describe("impact isolation: the intervention and BOQ authorities are never written", () => {
  test("computing over REAL services leaves their stores byte-identical and record sets unchanged", async () => {
    await withTempDir(async (root) => {
      const dataDir = join(root, "data");

      // A real intervention scenario over the real store (3 steps).
      const intervention = new InterventionService({
        store: new FsInterventionStore(dataDir),
        clock: fixedClock,
        baselineResolver: makeBaselineResolver("project-zurich-hq", [buildBaselineStorey()]),
      });
      await intervention.createScenario({
        scenarioId: "scenario-isolation",
        projectId: "project-zurich-hq",
        title: "Isolation lifecycle",
        baselineVersionId: "v001",
      });
      await intervention.addStep("scenario-isolation", {
        kind: "property_change",
        targetNodeId: "wall-north",
        change: {
          kind: "property_change",
          property: { key: "thickness", value: 300, unit: "mm" },
        },
        rationale: "Thickening per option B.",
        provenance: { evidenceIds: [sha256Hex("isolation-impact-evidence")] },
      });
      await intervention.addStep("scenario-isolation", {
        kind: "proposed_removal",
        targetNodeId: "wall-east",
        change: { kind: "proposed_removal", reason: "Demolish the obsolete wall." },
        provenance: { evidenceIds: [], derivationNote: "Layout change per option B." },
      });

      // A real BOQ pipeline over the real stores: import CSV -> normalize ->
      // map (the matcher maps the plaster row to wall-north).
      const boq = new BoqService({ store: new FsBoqStore(dataDir), clock: fixedClock });
      const normalization = new NormalizationService({
        store: new FsNormalizationStore(dataDir),
        clock: fixedClock,
        boq,
      });
      const mappingService = new MappingService({
        store: new FsMappingStore(dataDir),
        clock: fixedClock,
        normalization,
        boq,
      });
      const csv = new TextEncoder().encode(
        ["Item,Description,Unit,Qty,Rate", "1,Plaster to internal walls,m2,100,5", "TOTAL,,,200,10", ""].join("\n"),
      );
      const imported = await boq.importSource(csv, "text/csv", "csv");
      await normalization.normalizeImport(imported.importId);
      await mappingService.runMatcher(imported.importId, {
        nodes: [
          {
            nodeId: "wall-north",
            kind: "element",
            properties: [{ key: "semantic.kind", value: "wall" }],
          },
        ],
      });

      // Snapshot EVERY authority tree before the impact computation.
      const trees = ["interventions", "boq"] as const;
      const before = new Map<string, string>();
      for (const tree of trees) {
        for (const path of listFilesRecursive(join(dataDir, tree))) {
          before.set(path, readFileSync(path, "utf8"));
        }
      }

      // THE COMPUTATION over the production read-only adapters backed by the
      // REAL owning services (same instances the server's default wiring
      // would build privately over this data dir).
      const impact = new ImpactService({
        store: new FsImpactStore(dataDir),
        clock: fixedClock,
        scenarioResolver: readOnlyImpactScenarioResolver(intervention),
        mappingResolver: readOnlyImpactBoqMappingResolver(mappingService, boq),
      });
      const record = await impact.computeImpact({
        scenarioId: "scenario-isolation",
        stateIndex: 2,
        importId: imported.importId,
      });

      // The computed impact is real and traced (R11 traceability over the
      // REAL authorities): wall-north thickness +60mm mapped to the plaster
      // BOQ item; wall-east thickness -180mm (the proposed demolition).
      expect(record.report.summary.lineCount).toBeGreaterThan(0);
      const thickness = record.report.lines.find(
        (line) => line.targetNodeId === "wall-north" && line.basis.propertyKey === "thickness",
      )!;
      expect(thickness.quantity!.value).toBe(60);
      expect(thickness.boqMappings.length).toBe(1);
      expect(thickness.boqMappings[0]!.originalText).toContain("Plaster");
      const demolition = record.report.lines.find(
        (line) => line.targetNodeId === "wall-east" && line.basis.propertyKey === "thickness",
      )!;
      expect(demolition.quantity!.value).toBe(-180);

      // THE ISOLATION ACCEPTANCE: every authority byte is untouched, and no
      // new file appeared inside the authorities' trees (the impact record
      // lives in its OWN impacts/ tree).
      for (const tree of trees) {
        const after = listFilesRecursive(join(dataDir, tree));
        expect(after).toEqual([...before.keys()].filter((path) => path.includes(join(dataDir, tree))));
        for (const path of after) {
          const beforeText = before.get(path);
          if (beforeText === undefined) {
            throw new Error(`authority file ${path} appeared during the impact computation`);
          }
          expect(readFileSync(path, "utf8")).toBe(beforeText);
        }
      }
      expect(listFilesRecursive(join(dataDir, "impacts"))).toHaveLength(1);
    });
  });
});
