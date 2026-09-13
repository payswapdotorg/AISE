/**
 * Contract versioning (AISE-003).
 *
 * Every wire object in `@aise/shared-contracts` carries a `contractVersion`
 * string (strict semver). The package version IS the contract version: the
 * two are asserted equal by tests, and every contract family currently ships
 * the single program-wide `CONTRACT_VERSION`.
 *
 * Compatibility rules (encoded in `sameMajorVersion` and the codec layer,
 * documented in README.md):
 *
 *  - decode accepts any payload whose major version equals the family's
 *    current major version (same-major forward/backward compatibility within
 *    a major); minor/patch differences are additive-only by policy;
 *  - a missing, malformed or cross-major `contractVersion` is rejected with a
 *    typed error (`ContractVersionMismatchError`) — never silently coerced;
 *  - encode emits exactly the family version and rejects values carrying a
 *    different version.
 */

/**
 * The program-wide contract version. Bump rules:
 *  - MAJOR: any removal, rename, type narrowing, enum-value removal or
 *    semantic change to an existing field;
 *  - MINOR: additive changes only (new optional fields, new enum values,
 *    new wire objects, relaxed constraints);
 *  - PATCH: documentation/description-only changes.
 */
export const CONTRACT_VERSION = "1.0.0";

/** The contract families owned by this package (one module each). */
export const CONTRACT_FAMILIES = [
  "capability",
  "mission",
  "evidence",
  "model",
  "sync",
] as const;

export type ContractFamily = (typeof CONTRACT_FAMILIES)[number];

/**
 * Per-family contract versions. Families may diverge in minor/patch over
 * time; they all start at the program-wide version and must stay within the
 * same major while this package is the single contract authority.
 */
export const FAMILY_VERSIONS: Readonly<Record<ContractFamily, string>> = {
  capability: CONTRACT_VERSION,
  mission: CONTRACT_VERSION,
  evidence: CONTRACT_VERSION,
  model: CONTRACT_VERSION,
  sync: CONTRACT_VERSION,
};

/** The current contract version of a family. */
export function familyVersion(family: ContractFamily): string {
  return FAMILY_VERSIONS[family];
}

/**
 * Parses the major segment of a strict-semver string (full grammar,
 * including prerelease/build metadata; no leading zeros).
 * Returns `null` when the string is not strict semver.
 */
export function parseMajorVersion(version: string): number | null {
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.exec(
    version,
  );
  if (match === null || match[1] === undefined) {
    return null;
  }
  const major = Number.parseInt(match[1], 10);
  return Number.isSafeInteger(major) ? major : null;
}

/**
 * Two versions are wire-compatible when their MAJOR segments are equal.
 * Malformed versions are never compatible with anything.
 */
export function sameMajorVersion(a: string, b: string): boolean {
  const majorA = parseMajorVersion(a);
  const majorB = parseMajorVersion(b);
  return majorA !== null && majorA === majorB;
}
