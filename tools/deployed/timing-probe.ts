/**
 * Timing probe: reproduce the accessibility leg's flow N times in fresh
 * contexts, measuring each stage — gate visible, Enter demo click, shell
 * visible. Diagnoses the consistent accessibility-leg timeout on the
 * deployed URL (pass-17 forensics).
 */
import { chromium } from "playwright";

const TARGET = process.env.AISE_DEPLOYED_URL ?? "https://aise-tan.vercel.app";
const RUNS = Number(process.env.RUNS ?? "6");

const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM ?? undefined,
  headless: true,
  args: ["--no-sandbox"],
});

for (let i = 1; i <= RUNS; i++) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const t0 = Date.now();
  try {
    await page.goto(TARGET, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForSelector("h2#gate-title", { state: "visible", timeout: 30_000 });
    const gateAt = Date.now() - t0;
    const btn = page.getByRole("button", { name: "Enter demo", exact: true });
    await btn.click({ timeout: 20_000 });
    const clickAt = Date.now() - t0;
    // measure the shell with a generous 45s window to see the real timing
    const shellStart = Date.now();
    let shellAt: number | null = null;
    try {
      await page.waitForSelector("header.app-header", { state: "visible", timeout: 45_000 });
      shellAt = Date.now() - shellStart;
    } catch {
      shellAt = null;
    }
    const url = page.url();
    const bodyText = (await page.locator("body").textContent())?.slice(0, 120) ?? "";
    console.log(
      `run ${i}: gate=${gateAt}ms click=${clickAt}ms shell=${shellAt === null ? "TIMEOUT>45s" : shellAt + "ms"} url=${url} body="${bodyText.replace(/\s+/g, " ")}"`,
    );
    // cleanup: sign out via the API through the page
    try {
      await page.evaluate(async () => {
        await fetch("/v1/auth/sessions/current", { method: "DELETE", credentials: "include" });
      });
    } catch {
      // best-effort cleanup only; the next fresh context discards the cookie anyway
    }
  } catch (e) {
    console.log(`run ${i}: FAILED at ${Date.now() - t0}ms — ${String(e).slice(0, 150)}`);
  } finally {
    await context.close();
  }
}
await browser.close();
