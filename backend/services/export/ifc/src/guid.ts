/**
 * Deterministic IFC globally unique identifiers (AISE-018).
 *
 * `IfcGloballyUniqueId` is the 22-character compressed base-64
 * encoding of a 128-bit value over the alphabet
 * `0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$`
 * (the IFC GUID alphabet). The first character encodes the top 2
 * bits; the remaining 21 characters encode 6 bits each
 * (2 + 21·6 = 128 bits, hence the alphabet index of the first
 * character is always < 4).
 *
 * Determinism (AC-100): GUIDs derive from a SHA-256 hash of a
 * stable, model-scoped seed (`canonicalContentHash` from the
 * engineering-model package — the same content-pinning authority
 * used for object identity). The same object in the same model
 * therefore receives the SAME IFC GUID on every export, across
 * processes and machines — stable identifiers for round-trip
 * mapping (AC-102), with no random generation anywhere.
 *
 * The seed namespace is explicit and collision-freighted:
 * `${modelId}:object:${objectId}`, `${modelId}:space:${spaceId}`,
 * `${modelId}:opening:${objectId}` and `${modelId}:spine:site|…`
 * — distinct namespaces for distinct entity kinds.
 */
import { sha256Hex } from "@aise/engineering-model";

/** The IFC GUID alphabet (compressed base 64). */
const GUID_ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$";

/** The IFC GUID shape: exactly 22 characters over the alphabet. */
const GUID_PATTERN = /^[0-9A-Za-z_$]{22}$/;

/** Number of characters in an IfcGloballyUniqueId. */
export const IFC_GUID_LENGTH = 22;

/**
 * Derives the deterministic 22-character IFC GUID of a stable seed.
 *
 * The first 128 bits of SHA-256(seed) are encoded in the IFC GUID
 * base-64 compression scheme. Fail-closed: the seed must be a
 * non-empty string.
 */
export function ifcGuidOf(seed: string): string {
  if (typeof seed !== "string" || seed.length === 0) {
    throw new Error(`IFC GUID seed must be a non-empty string: ${String(seed)}`);
  }
  const hash = sha256Hex(seed);
  // 128 bits = the first 32 hex characters of the content hash.
  let value = 0n;
  for (let index = 0; index < 32; index += 1) {
    const digit = Number.parseInt(hash[index]!, 16);
    value = (value << 4n) | BigInt(digit);
  }
  const characters: string[] = [];
  // First character: the top 2 bits (alphabet index < 4).
  characters.push(GUID_ALPHABET[Number(value >> 126n)]!);
  // Remaining 21 characters: 6 bits each, most-significant first.
  for (let index = 0; index < 21; index += 1) {
    const shift = BigInt(120 - 6 * index);
    characters.push(GUID_ALPHABET[Number((value >> shift) & 63n)]!);
  }
  const guid = characters.join("");
  if (!isValidIfcGuid(guid)) {
    // Unreachable by construction; guards the encoder contract.
    throw new Error(`derived IFC GUID is not well-formed: ${guid}`);
  }
  return guid;
}

/** Validates the 22-character IFC GUID shape (syntax level). */
export function isValidIfcGuid(guid: string): boolean {
  return typeof guid === "string" && GUID_PATTERN.test(guid);
}

/**
 * Validates the full IFC GUID discipline: 22 characters over the
 * alphabet AND the first character's alphabet index < 4 (the
 * 2-bit head of the compression scheme).
 */
export function isWellFormedIfcGuid(guid: string): boolean {
  return isValidIfcGuid(guid) && GUID_ALPHABET.indexOf(guid[0]!) < 4;
}

export { GUID_ALPHABET };
