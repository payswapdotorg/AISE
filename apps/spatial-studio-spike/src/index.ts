/**
 * GBIM-003 — Spatial Studio spike sandbox barrel.
 *
 * The spike is mounted by a HOST bundler (the sandbox Next.js app):
 *   - the browser entry is `client/components/SandboxApp`;
 *   - the server entry is `server/workspace` (+ `server/run-checks` as a
 *     standalone bun script for evidence generation).
 *
 * Spike-only code (NOT production engine code); nothing here enters the
 * canonical engine. See docs/productization-evidence/GBIM-003/.
 */

export { SandboxApp } from "./client/components/SandboxApp";
