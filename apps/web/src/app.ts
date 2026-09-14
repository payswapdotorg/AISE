/**
 * AISE web workspace app surface.
 *
 * The foundation label (AISE-001) is kept verbatim for the bootstrap shell;
 * the browser ENGINEERING WORKSPACE (AISE-021) lives in `./workspace` and the
 * BOQ LENS workspace (AISE-024) lives in `./boqlens`; both are re-exported
 * here as the app's public surface. Rendering is deterministic server-side
 * HTML/SVG strings — no browser APIs, no client state, no fetches (see the
 * no-browser-authority invariants in workspace/model.ts and
 * boqlens/model.ts).
 */

export * from "./workspace/index";
export * from "./boqlens/index";

export const PAGE_LABEL = "AISE web workspace — foundation";

export function pageLabel(): string {
  return PAGE_LABEL;
}
