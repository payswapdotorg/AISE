/**
 * AISE-019 — CLI entry for the golden capture/device benchmark harness.
 *
 * Runnable with (from backend/api): `bun run src/benchmarks/cli.ts`
 * Runs both shipped engines (ideal-geometry sanity anchor + plane-fit
 * baseline) over the full golden fixture set, writes the text report to
 * stdout and exits 1 when the overall verdict is FAIL. No server/router
 * surface is touched (later items wire reporting); the clock is real here —
 * it only feeds `generatedAt`, which is excluded from the digest.
 */

import { GOLDEN_FIXTURES, IDEAL_GEOMETRY_ENGINE, PLANE_FIT_ENGINE } from "./index";
import { runBenchmarks } from "./runner";
import { renderTextReport } from "./report";

if (import.meta.main) {
  const report = runBenchmarks([IDEAL_GEOMETRY_ENGINE, PLANE_FIT_ENGINE], GOLDEN_FIXTURES);
  process.stdout.write(renderTextReport(report));
  process.exitCode = report.overall === "FAIL" ? 1 : 0;
}
