/**
 * AISE-024 — BOQ Lens typed error (the only error vocabulary of the BOQ Lens
 * workspace). Stable codes, never bare string errors — mirrors the
 * WorkspaceError convention of AISE-021.
 */

export const BOQ_LENS_ERROR_CODES = ["invalid_input", "unknown_claim"] as const;
export type BoqLensErrorCode = (typeof BOQ_LENS_ERROR_CODES)[number];

/** Typed rejection carrying a stable code. */
export class BoqLensError extends Error {
  readonly code: BoqLensErrorCode;
  readonly detail: string;

  constructor(code: BoqLensErrorCode, detail: string) {
    super(`${code}: ${detail}`);
    this.name = "BoqLensError";
    this.code = code;
    this.detail = detail;
  }
}
