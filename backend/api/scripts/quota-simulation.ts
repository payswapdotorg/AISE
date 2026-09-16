/**
 * PROD-013 evidence generator — the quota simulation.
 *
 * Drives a REAL bootCostGuards composition (memory ledger twin, tiny caps via
 * the documented env vars) through the three observable regimes of every
 * metered resource: below the warn band, inside the warn band (threshold
 * crossed — ONE structured warn), and at the cap (typed refusal — the
 * operation is refused, never "upgraded", never silent). Prints the ledger
 * outcomes and the /readyz cost section at each step, plus the metered-flag
 * honesty (redis_commands unmetered without the Upstash pair; r2 meters
 * unmetered without the R2 group).
 *
 * Run from the repo root: bun backend/api/scripts/quota-simulation.ts
 * Captured (stdout+stderr) into quota-simulation.txt on 2026-09-16.
 */
import { bootCostGuards } from "../src/cost";
import { createLogger } from "../src/lib/log";

const logger = createLogger("info");

const boot = bootCostGuards({
  env: {
    // Tiny caps so the whole lifecycle fits in one run. These are the
    // DOCUMENTED env knobs — defaults live in cost/quotas.ts.
    AISE_QUOTA_REDIS_COMMANDS: "10",
    AISE_QUOTA_R2_BYTES: "1000",
    AISE_QUOTA_R2_OBJECTS: "5",
    AISE_QUOTA_THRESHOLD_PERCENT: "80",
  },
  logger,
  clock: () => Date.now(),
});

const step = async (label: string, body: () => Promise<void> | void): Promise<void> => {
  logger.info("quota-simulation", { step: `\n=== ${label} ===` });;
  await body();
};

await step("boot: the mode log (memory twin — no Upstash pair configured)", () => {
  // (the boot log line above this step IS the evidence)
});

await step("consume redis_commands 1..7 (below the 80% warn band of cap 10)", async () => {
  for (let i = 1; i <= 7; i++) {
    const outcome = await boot.ledger.consume("redis_commands", 1);
    logger.info("quota-simulation", { step: `  consume #${i}: ${outcome.status}` });;
  }
  logger.info("quota-simulation", { readiness: boot.readiness().meters.find((m) => m.resource === "redis_commands") });;
});

await step("consume redis_commands #8 (crosses 80% — the ONE threshold warn fires)", async () => {
  const outcome = await boot.ledger.consume("redis_commands", 1);
  logger.info("quota-simulation", { step: `  consume #8: ${outcome.status}` });;
  logger.info("quota-simulation", { readiness: boot.readiness().meters.find((m) => m.resource === "redis_commands") });;
});

await step("consume redis_commands #9 (inside the band — warn does NOT repeat)", async () => {
  const outcome = await boot.ledger.consume("redis_commands", 1);
  logger.info("quota-simulation", { step: `  consume #9: ${outcome.status}` });;
});

await step("consume redis_commands #10 (would reach the cap: the typed refusal)", async () => {
  const outcome = await boot.ledger.consume("redis_commands", 1);
  logger.info("quota-simulation", { step: `  consume #10: ${JSON.stringify(outcome)}` });;
  logger.info("quota-simulation", { readiness: boot.readiness().meters.find((m) => m.resource === "redis_commands") });;
  logger.info("quota-simulation", { aggregateStatus: boot.readiness().status });
});

await step("the refusal is stable (a further consume is refused again, counter counts attempts)", async () => {
  const outcome = await boot.ledger.consume("redis_commands", 1);
  logger.info("quota-simulation", { step: `  consume #11: ${JSON.stringify(outcome)}` });;
});

await step("the bytes meter (r2_storage_bytes cap 1000): a 900-byte upload passes, the next 200-byte upload is refused", async () => {
  const first = await boot.ledger.consume("r2_storage_bytes", 900);
  logger.info("quota-simulation", { step: `  900 bytes: ${first.status}` });;
  const second = await boot.ledger.consume("r2_storage_bytes", 200);
  logger.info("quota-simulation", { step: `  +200 bytes: ${JSON.stringify(second)}` });;
  logger.info("quota-simulation", { readiness: boot.readiness().meters.find((m) => m.resource === "r2_storage_bytes") });
});

await step("the honest metered flags (no Upstash pair, no R2 group configured)", () => {
  for (const meter of boot.readiness().meters) {
    logger.info("quota-simulation", { step: `  ${meter.resource}: metered=${meter.metered} status=${meter.status}` });;
  }
  logger.info("quota-simulation", { ledger: boot.readiness().ledger, window: boot.readiness().windowId });
  logger.info("quota-simulation", { aggregateStatus: boot.readiness().status });
});
