/**
 * AISE web workspace app surface.
 *
 * The foundation label (AISE-001) is kept verbatim for the bootstrap shell;
 * the browser ENGINEERING WORKSPACE (AISE-021) lives in `./workspace` and is
 * re-exported here as the app's public surface. Rendering is deterministic
 * server-side HTML/SVG strings — no browser APIs, no client state, no
 * fetches (see workspace/model.ts for the no-browser-authority invariant).
 */

export * from "./workspace/index";

export const PAGE_LABEL = "AISE web workspace — foundation";

export function pageLabel(): string {
  return PAGE_LABEL;
}
