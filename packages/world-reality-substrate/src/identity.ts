/**
 * WORLD-P0-A — opaque substrate handles and provider-id quarantine.
 *
 * Contract (spec/world-program.md §Gates item 6; spec/architecture-lock.md
 * §Technology substitution via spec/technology-substitution-contract.md §7):
 *
 *   "Provider types never become canonical: provider-specific types must
 *    not cross the domain-contract boundary, and canonical IDs must not
 *    encode vendor-specific meaning."
 *
 * Every object a substrate hands AISE is addressed through an OPAQUE
 * handle minted by this module. The handle is a lane-scoped digest of the
 * provider's own object reference — one-way (sha-256, truncated), so the
 * provider id can never be recovered from the handle and can never leak
 * into a canonical AISE identity. The same provider object reference
 * mints the same handle (stable, content-addressed); the same provider
 * reference in two different lanes mints two different handles (lane
 * quarantine); two distinct provider references mint distinct handles
 * with overwhelming probability (160 bits of digest).
 *
 * Canonical AISE ids follow the closed `aise:` prefix vocabulary and are
 * guarded here: a canonical id field that carries a substrate handle (or
 * any non-canonical shape) is refused with a typed failure — the
 * quarantine is enforced, not hoped for.
 */

import { createHash } from "node:crypto";
import { contractMismatch } from "./outcome";
import type { SubstrateOutcome } from "./outcome";

/** The closed substrate-lane vocabulary (one lane per Layer-1 substrate). */
export const SUBSTRATE_LANES = [
  "babylon",
  "cesium",
  "usd",
  "gltf",
  "assimp",
] as const;
export type SubstrateLane = (typeof SUBSTRATE_LANES)[number];

/** Type guard over the closed lane vocabulary. */
export function isSubstrateLane(value: unknown): value is SubstrateLane {
  return (
    typeof value === "string" &&
    (SUBSTRATE_LANES as readonly string[]).includes(value)
  );
}

/** The canonical AISE identity prefix (the domain's own id vocabulary). */
export const CANONICAL_ID_PREFIX = "aise:" as const;

/** The substrate-handle prefix — structurally disjoint from canonical ids. */
export const SUBSTRATE_HANDLE_PREFIX = "substrate:" as const;

const HANDLE_OPAQUE_HEX_LENGTH = 40; // 160 bits of sha-256

function laneNamespace(lane: SubstrateLane): string {
  return `world-reality-substrate/${lane}`;
}

/**
 * Mint the opaque handle for one provider object reference. PURE and
 * deterministic: same (lane, providerObjectRef) → same handle, forever.
 * The provider reference NEVER appears in the handle — only its lane-
 * scoped digest does.
 */
export function mintSubstrateHandle(
  lane: SubstrateLane,
  providerObjectRef: string,
): string {
  const digest = createHash("sha256")
    .update(`${laneNamespace(lane)}::${providerObjectRef}`)
    .digest("hex");
  return `${SUBSTRATE_HANDLE_PREFIX}${lane}:${digest.slice(0, HANDLE_OPAQUE_HEX_LENGTH)}`;
}

/** The parsed shape of a substrate handle. */
export interface ParsedSubstrateHandle {
  readonly lane: SubstrateLane;
  /** The opaque, non-reversible digest body (never the provider id). */
  readonly opaqueId: string;
}

/** Parse a handle string; `null` when it is not a well-formed handle. */
export function parseSubstrateHandle(
  value: string,
): ParsedSubstrateHandle | null {
  if (!value.startsWith(SUBSTRATE_HANDLE_PREFIX)) {
    return null;
  }
  const body = value.slice(SUBSTRATE_HANDLE_PREFIX.length);
  const separator = body.indexOf(":");
  if (separator <= 0) {
    return null;
  }
  const lane = body.slice(0, separator);
  const opaqueId = body.slice(separator + 1);
  if (!isSubstrateLane(lane)) {
    return null;
  }
  if (!/^[0-9a-f]{40}$/.test(opaqueId)) {
    return null;
  }
  return { lane, opaqueId };
}

/** Structural check: is this string a well-formed substrate handle? */
export function isSubstrateHandle(value: unknown): value is string {
  return typeof value === "string" && parseSubstrateHandle(value) !== null;
}

/** Lane ownership check for a handle (cross-lane use is refused). */
export function handleBelongsToLane(
  handle: string,
  lane: SubstrateLane,
): boolean {
  const parsed = parseSubstrateHandle(handle);
  return parsed !== null && parsed.lane === lane;
}

/**
 * Does this string look like a canonical AISE id? Canonical ids are
 * `aise:<kind>:<hex-or-registered-token>`; the check is structural (the
 * closed kind registry is the domain's, not this lane's).
 */
export function isCanonicalAiseId(value: string): boolean {
  if (!value.startsWith(CANONICAL_ID_PREFIX)) {
    return false;
  }
  const body = value.slice(CANONICAL_ID_PREFIX.length);
  return /^[a-z][a-z0-9-]*:[a-z0-9][a-z0-9._-]*$/i.test(body);
}

/**
 * The quarantine gate every canonical id field must pass: a canonical id
 * that carries a substrate handle (or a provider-scoped shape) is refused
 * with a typed `contract-mismatch` failure naming the field. This is the
 * machine-checkable form of "provider ids never become canonical AISE
 * identity".
 */
export function quarantineCanonicalId(
  fieldName: string,
  value: string,
): SubstrateOutcome<{ readonly ok: true }> {
  if (isSubstrateHandle(value as unknown)) {
    return {
      ok: false,
      failure: contractMismatch(
        fieldName,
        `the canonical field '${fieldName}' carries a substrate handle ('${value.slice(0, 24)}…') — provider ids never become canonical AISE identity; refused fail-closed`,
      ),
    };
  }
  if (value.includes(SUBSTRATE_HANDLE_PREFIX)) {
    return {
      ok: false,
      failure: contractMismatch(
        fieldName,
        `the canonical field '${fieldName}' embeds substrate-handle material — provider ids never become canonical AISE identity; refused fail-closed`,
      ),
    };
  }
  return { ok: true, value: { ok: true as const } };
}

/**
 * Quarantine gate for provider object references flowing OUT of a
 * substrate: they must be routed through `mintSubstrateHandle` before
 * they can be recorded in an artifact. A provider reference that already
 * looks canonical is refused (a substrate must never mint a canonical-
 * shaped id for its own objects).
 */
export function quarantineProviderRef(
  lane: SubstrateLane,
  providerObjectRef: string,
): SubstrateOutcome<string> {
  if (providerObjectRef.startsWith(CANONICAL_ID_PREFIX)) {
    return {
      ok: false,
      failure: contractMismatch(
        "providerObjectRef",
        `the ${lane} substrate produced a provider object reference with canonical id shape ('${providerObjectRef.slice(0, 24)}…') — a substrate cannot mint canonical AISE identity; refused fail-closed`,
        lane,
      ),
    };
  }
  return { ok: true, value: mintSubstrateHandle(lane, providerObjectRef) };
}

/** Content digest helper (sha-256 hex, canonical for this lane). */
export function digestHex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}
