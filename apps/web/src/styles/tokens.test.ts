/**
 * PROD-012-R — design-token WCAG contrast tests (pure, deterministic, no DOM).
 *
 * The remediation contract for the PROD-012 accessibility FAIL (serious,
 * WCAG 1.4.3 AA): every TEXT token must clear 4.5:1 on every surface it
 * actually renders on. The pre-remediation `--ink-faint: #7a8894` sat at
 * 3.64:1 on `--surface` (the Dashboard `.journey-hint` elements — the
 * deployed axe-core run's blocking finding; the token also colors crumbs,
 * field labels, source notes, state detail, task-strip notes and the gate
 * divider).
 *
 * The ratios here are COMPUTED from the committed stylesheet itself
 * (apps/web/src/styles/app.css — the same file the browser loads), using
 * the WCAG 2.x relative-luminance definition, so:
 *
 *   - the assertion is the shipped truth, not a hand-copied constant;
 *   - a future token change that re-breaks contrast fails this gate
 *     deterministically (no network, no clock, no randomness — the bun
 *     test doctrine) instead of waiting for the next deployed axe run.
 *
 * Scope note (deliberate): the pairs asserted are the text tokens on the
 * light surfaces their consumers render on — the ink scale (the faint tone
 * is asserted on the FULL light-surface set, because it is a shared
 * utility tone any surface may borrow) plus the header's `--brand-ink` on
 * `--brand`. Non-token literal colors (the API chips) and interactive
 * states (e.g. links on hovered table rows) stay under the axe-core
 * browser check, which measures the rendered page.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

/** The committed stylesheet this suite pins (same dir, the app's ONE CSS). */
const STYLESHEET_PATH = join(import.meta.dir, "app.css");

/** Strip block comments so token parsing never matches commented text. */
function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

/** Extract the :root custom properties as name → value (hex or otherwise). */
function parseRootTokens(css: string): Map<string, string> {
  const rootMatch = /:root\s*\{([^}]*)\}/.exec(stripComments(css));
  const tokens = new Map<string, string>();
  if (rootMatch === null || rootMatch[1] === undefined) {
    return tokens;
  }
  for (const declaration of rootMatch[1].matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    const name = declaration[1];
    const value = declaration[2];
    if (name !== undefined && value !== undefined) {
      tokens.set(name, value.trim());
    }
  }
  return tokens;
}

/** One #rrggbb channel linearized per WCAG 2.x (sRGB → relative luminance). */
function linearChannel(value: number): number {
  const srgb = value / 255;
  return srgb <= 0.03928 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
}

/** WCAG 2.x relative luminance of an #rrggbb color. */
function relativeLuminance(hex: string): number {
  const clean = hex.replace("#", "");
  const red = Number.parseInt(clean.slice(0, 2), 16);
  const green = Number.parseInt(clean.slice(2, 4), 16);
  const blue = Number.parseInt(clean.slice(4, 6), 16);
  return (
    0.2126 * linearChannel(red) + 0.7152 * linearChannel(green) + 0.0722 * linearChannel(blue)
  );
}

/** WCAG 2.x contrast ratio between two #rrggbb colors (>= 1, symmetric). */
function contrastRatio(foreground: string, background: string): number {
  const lighter = Math.max(relativeLuminance(foreground), relativeLuminance(background));
  const darker = Math.min(relativeLuminance(foreground), relativeLuminance(background));
  return (lighter + 0.05) / (darker + 0.05);
}

/** The WCAG 1.4.3 AA threshold for normal-size text (the remediation bar). */
const AA_NORMAL_TEXT = 4.5;

const TOKENS = parseRootTokens(readFileSync(STYLESHEET_PATH, "utf8"));

/** Resolve a token name to its hex value, failing loudly when absent. */
function token(name: string): string {
  const value = TOKENS.get(name);
  expect(value, `the token ${name} must exist in app.css :root`).toMatch(/^#[0-9a-fA-F]{6}$/);
  return value ?? "#000000";
}

/** Assert one token clears AA on one surface, with the computed ratio in the message. */
function expectAa(foregroundToken: string, backgroundToken: string): void {
  const foreground = token(foregroundToken);
  const background = token(backgroundToken);
  const ratio = contrastRatio(foreground, background);
  expect(
    ratio,
    `${foregroundToken} (${foreground}) on ${backgroundToken} (${background}) must be >= ${AA_NORMAL_TEXT}:1 — computed ${ratio.toFixed(3)}:1`,
  ).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
}

describe("PROD-012-R design-token WCAG contrast (apps/web/src/styles/app.css)", () => {
  test("the stylesheet's :root block parses with the expected token vocabulary", () => {
    // A restructured or renamed palette must fail HERE (loudly), never let
    // the ratio assertions below vacuously pass over a missing token.
    const expected = [
      "--bg",
      "--surface",
      "--surface-2",
      "--ink",
      "--ink-soft",
      "--ink-faint",
      "--line",
      "--brand",
      "--brand-ink",
      "--accent",
      "--focus",
      "--epistemic-observed-bg",
      "--epistemic-confirmed-bg",
      "--epistemic-inferred-bg",
      "--epistemic-other-bg",
      "--epistemic-proposed-bg",
      "--derived-bg",
      "--error-bg",
      "--warn-bg",
    ];
    for (const name of expected) {
      expect(TOKENS.has(name), `the token ${name} must exist in app.css :root`).toBe(true);
    }
  });

  test("the remediated pair: --ink-faint on --surface clears AA (was 3.635:1 as #7a8894)", () => {
    // The exact pair of the PROD-012 serious axe finding (the Dashboard
    // .journey-hint elements). The old value #7a8894 computed 3.635:1
    // here — this assertion is the regression pin for the remediation.
    expectAa("--ink-faint", "--surface");
    const ratio = contrastRatio(token("--ink-faint"), token("--surface"));
    expect(ratio).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
    expect(ratio).toBeLessThan(7); // still the FAINT tone, not a second --ink
  });

  test("--ink-faint clears AA on EVERY light surface of the palette (shared utility tone)", () => {
    // The faint tone is borrowed across surfaces: crumbs on --bg, field
    // labels and hints on --surface, source notes on hovered/selected
    // table rows (--surface-2 / --warn-bg), state detail on error panels
    // (--error-bg), plus the tinted chip backgrounds. Asserting the full
    // light set guards FUTURE consumers, not just today's.
    const lightSurfaces = [
      "--bg",
      "--surface",
      "--surface-2",
      "--warn-bg",
      "--error-bg",
      "--derived-bg",
      "--epistemic-observed-bg",
      "--epistemic-confirmed-bg",
      "--epistemic-inferred-bg",
      "--epistemic-other-bg",
      "--epistemic-proposed-bg",
    ];
    for (const surface of lightSurfaces) {
      expectAa("--ink-faint", surface);
    }
  });

  test("--ink (the body tone) clears AA on the page and card surfaces", () => {
    for (const surface of ["--bg", "--surface", "--surface-2"]) {
      expectAa("--ink", surface);
    }
  });

  test("--ink-soft (the secondary tone) clears AA on its surfaces", () => {
    // Consumers: callouts and table headers on --surface-2, sigma notes on
    // white and selected rows (--warn-bg), guidance on --surface, notes on
    // --bg, plus error panels (--error-bg).
    for (const surface of ["--bg", "--surface", "--surface-2", "--warn-bg", "--error-bg"]) {
      expectAa("--ink-soft", surface);
    }
  });

  test("--brand-ink on --brand (the header chrome) clears AA", () => {
    expectAa("--brand-ink", "--brand");
  });
});
