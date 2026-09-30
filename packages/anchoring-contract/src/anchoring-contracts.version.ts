/**
 * Anchoring contract versioning (ANCHOR-002).
 *
 * The ANCHOR-001 spike proved the port shape with a DISPOSABLE, self-contained
 * evidence-tree contract (`anchor001-anchoring-port/1`,
 * `docs/productization-evidence/ANCHOR-001/aise-side/contract.ts` — frozen,
 * read-only). This package lifts that shape into the canonical `packages/`
 * tree under a NEW versioned port id — `anchor002-anchoring-contract/1` —
 * NEVER the spike's disposable id (the authorization's own words:
 * "portVersion (a NEW versioned id … never the spike's disposable id)").
 *
 * The package follows the `@aise/solution-contract` codec discipline: the
 * package version IS the contract version (asserted equal by tests); every
 * wire object carries `contractVersion` (strict semver, the shared primitive
 * schema); decode accepts same-major payloads and preserves unknown keys;
 * decodeStrict rejects unknown keys at any nesting level with the key named;
 * encode emits exactly the family version over canonical JSON.
 *
 * The port id is carried VERBATIM in every wire object's `portVersion` field
 * and is pinned by the guard: a response answering any other port id (for
 * example the spike's `anchor001-anchoring-port/1`) is refused — the spike
 * contract and the canonical contract are physically distinct lanes.
 */

/**
 * The program-wide anchoring contract version. Bump rules (identical
 * discipline to `@aise/shared-contracts` / `@aise/solution-contract`):
 *  - MAJOR: any removal, rename, type narrowing, enum-value removal or
 *    semantic change to an existing field;
 *  - MINOR: additive changes only (new optional fields, new enum values in
 *    the closed vocabularies, new wire objects, relaxed constraints);
 *  - PATCH: documentation/description-only changes.
 */
export const ANCHORING_CONTRACT_VERSION = "1.0.0";

/** The versioned PORT id of this contract (the process-boundary identity). */
export const ANCHORING_PORT_VERSION = "anchor002-anchoring-contract/1" as const;

/** The wire `schemaVersion` of both AnchoringRequest and AnchoringResponse. */
export const ANCHORING_WIRE_SCHEMA_VERSION = 1 as const;

/** The contract families owned by this package. */
export const ANCHORING_CONTRACT_FAMILIES = ["request", "response"] as const;
export type AnchoringContractFamily = (typeof ANCHORING_CONTRACT_FAMILIES)[number];

export const ANCHORING_FAMILY_VERSIONS: Readonly<
  Record<AnchoringContractFamily, string>
> = {
  request: ANCHORING_CONTRACT_VERSION,
  response: ANCHORING_CONTRACT_VERSION,
};

/** The current contract version of a family. */
export function anchoringFamilyVersion(family: AnchoringContractFamily): string {
  return ANCHORING_FAMILY_VERSIONS[family];
}

/** The wire objects this contract owns (the lifted pair, plus the partial satellite). */
export const ANCHORING_OBJECT_NAMES = [
  "AnchoringRequest",
  "AnchoringResponse",
  "AnchoringRefusedStill",
] as const;
export type AnchoringObjectName = (typeof ANCHORING_OBJECT_NAMES)[number];
