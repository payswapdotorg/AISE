/**
 * Contract version constants and compatibility rules.
 *
 * The contract version is MAJOR.MINOR (for example "1.0"). Every
 * interchange payload carries its version in the `contractVersion`
 * field so any consumer can dispatch before parsing deeply.
 *
 * Compatibility rules (the authoritative text lives in the package
 * README; these functions implement it):
 *
 * - A MAJOR increment is breaking: removing or renaming a field,
 *   adding a required field, changing a type, removing an enum
 *   value, tightening a constraint, or changing field semantics.
 * - A MINOR increment is additive: new optional fields, new enum
 *   values, new error codes, or loosened constraints.
 * - Readers inside one MAJOR version MUST tolerate newer MINOR
 *   payloads: ignore unrecognized fields and treat unrecognized enum
 *   values as unknown (never map them onto an existing value).
 * - Readers MUST NOT consume payloads from a different MAJOR
 *   version; they reject with CONTRACT_VERSION_UNSUPPORTED.
 * - Writers MUST emit only fields defined by the version they
 *   declare in `contractVersion`.
 */

/** The contract version implemented by this package. */
export const CONTRACT_VERSION = "1.0" as const;

/** All contract versions this package can validate and read. */
export const SUPPORTED_CONTRACT_VERSIONS: readonly string[] = ["1.0"];

/** True when `version` is exactly implemented by this package. */
export function isSupportedContractVersion(version: string): boolean {
  return SUPPORTED_CONTRACT_VERSIONS.includes(version);
}

/** True when `version` is syntactically a MAJOR.MINOR string. */
export function isContractVersionFormat(version: string): boolean {
  return /^[0-9]+\.[0-9]+$/.test(version);
}

/** The MAJOR component of a MAJOR.MINOR version string. */
export function majorOf(version: string): number {
  const match = /^([0-9]+)\.[0-9]+$/.exec(version);
  if (match === null) {
    throw new Error(`not a contract version: ${version}`);
  }
  return Number(match[1]);
}

/**
 * True when a reader implementing `readerVersion` can consume a
 * payload declared as `payloadVersion`: same MAJOR (tolerant read of
 * newer MINOR payloads), never across MAJOR versions.
 */
export function isCompatibleReader(readerVersion: string, payloadVersion: string): boolean {
  return majorOf(readerVersion) === majorOf(payloadVersion);
}
