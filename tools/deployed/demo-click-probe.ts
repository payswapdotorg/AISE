/**
 * Forensic probe: capture the network + full gate body after the Enter-demo
 * click in fresh contexts, to see WHY the click does nothing in ~50% of runs.
 */
import { chromium } from "playwright";

const TARGET = process.env.AISE_DEPLOYED_URL ?? "https://aise-tan.vercel.app";
const RUNS = Number(process.env.RUNS ?? "4");

const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });

for (let i = 1; i <= RUNS; i++) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const events: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("/v1/")) events.push(`REQ ${r.method()} ${r.url().replace(TARGET, "")}`);
  });
  page.on("response", (r) => {
    if (r.url().includes("/v1/")) events.push(`RES ${r.status()} ${r.url().replace(TARGET, "")}`);
  });
  page.on("requestfailed", (r) => {
    if (r.url().includes("/v1/")) events.push(`FAILED ${r.url().replace(TARGET, "")} ${r.failure()?.errorText}`);
  });
  page.on("console", (m) => {
    if (m.type() === "error") events.push(`CONSOLE-ERR ${m.text().slice(0, 100)}`);
  });
  page.on("pageerror", (e) => events.push(`PAGE-ERR ${String(e).slice(0, 100)}`));

  const t0 = Date.now();
  try {
    await page.goto(TARGET, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForSelector("h2#gate-title", { state: "visible", timeout: 30_000 });
    const btn = page.getByRole("button", { name: "Enter demo", exact: true });
    // wait a moment for any late hydration
    await page.waitForTimeout(1500);
    await btn.click({ timeout: 20_000 });
    events.push(`CLICKED @${Date.now() - t0}ms`);
    // watch up to 25s for either the shell or an error
    const shellOk = await page
      .waitForSelector("header.app-header", { state: "visible", timeout: 25_000 })
      .then(() => true)
      .catch(() => false);
    events.push(`SHELL ${shellOk ? "VISIBLE" : "NEVER"} @${Date.now() - t0}ms`);
    const body = (await page.locator("body").textContent()) ?? "";
    events.push(`BODY[600]="${body.replace(/\s+/g, " ").slice(0, 600)}"`);
  } catch (e) {
    events.push(`PROBE-FAIL ${String(e).slice(0, 120)}`);
  }
  console.log(`\n=== run ${i} ===`);
  for (const ev of events) console.log("  " + ev);
  try {
    await page.evaluate(async () => {
      await fetch("/v1/auth/sessions/current", { method: "DELETE", credentials: "include" });
    });
  } catch {
    // best-effort cleanup only; the next fresh context discards the cookie anyway
  }
  await context.close();
}
await browser.close();
