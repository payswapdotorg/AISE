/**
 * AISE product web shell — public surface.
 *
 * The browser product (PROD-002) is the React application in `./app/`
 * (mounted by `./main.tsx`). The frozen server-side rendering libraries —
 * the AISE-021 engineering workspace, the AISE-024 BOQ Lens, the AISE-027
 * intervention viewer and the AISE-040 adoption shell — remain re-exported
 * here as the app's library surface; the product application CONSUMES them
 * and adds presentation only (no browser-side engineering authority).
 */

export * from "./workspace/index";
export * from "./boqlens/index";
export { App } from "./app/App";
export { parseHash, formatRoute } from "./app/router";

export const PAGE_LABEL = "AISE — AI Site Engineer product shell";

export function pageLabel(): string {
  return PAGE_LABEL;
}
