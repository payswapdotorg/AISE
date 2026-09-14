/**
 * AISE-021 — typed workspace error (the only error vocabulary of the
 * browser workspace). Stable codes, never bare string errors — mirrors the
 * ProjectionError/RealityGraphError convention of the backend packages.
 */

export const WORKSPACE_ERROR_CODES = ["invalid_input"] as const;
export type WorkspaceErrorCode = (typeof WORKSPACE_ERROR_CODES)[number];

/** Typed rejection carrying a stable code. */
export class WorkspaceError extends Error {
  readonly code: WorkspaceErrorCode;
  readonly detail: string;

  constructor(code: WorkspaceErrorCode, detail: string) {
    super(`${code}: ${detail}`);
    this.name = "WorkspaceError";
    this.code = code;
    this.detail = detail;
  }
}
