package org.payswap.aise.core.identity

import java.nio.ByteBuffer
import java.security.MessageDigest
import java.util.Arrays

/**
 * Deterministic content identity for local capture entries — the ONE serious
 * algorithm of the AISE-002 foundation.
 *
 * The whole platform (client store, AISE-004 ingestion gateway, Evidence
 * Graph pinning) will re-derive this identity, so the encoding below is
 * NORMATIVE and FROZEN. It is pure (no I/O, no clock, no locale, no
 * timezone), and identical on every JVM/Android device.
 *
 * ## Canonical encoding — version `AISE-CONTENT-V1`
 *
 * The content id is `sha256(canonicalBytes)` rendered as 64 lowercase hex
 * characters, where `canonicalBytes` is the following byte stream:
 *
 * ```text
 * canonicalBytes :=
 *     TAG                  // 15 bytes: ASCII "AISE-CONTENT-V1", verbatim,
 *                          // NOT length-prefixed (constant domain separator)
 *   | PLEN                 // 8-byte big-endian length of PAYLOAD
 *   | PAYLOAD              // raw payload bytes (may be empty)
 *   | MCOUNT               // 8-byte big-endian count of metadata entries
 *   | ENTRY*               // one ENTRY per metadata key, keys sorted
 *                          // ascending by UTF-8 byte sequence
 *
 * ENTRY := KLEN | KEY | VLEN | VALUE
 *   KLEN  // 8-byte big-endian length of KEY bytes
 *   KEY   // UTF-8 bytes of the metadata key (no BOM, no normalization)
 *   VLEN  // 8-byte big-endian length of VALUE bytes
 *   VALUE // UTF-8 bytes of the metadata value (no BOM, no normalization)
 * ```
 *
 * Notes that pin the semantics exactly:
 *  - All multi-byte integers are 8-byte big-endian two's-complement values
 *    (lengths are in practice far below 2^63, so signed/unsigned renderings
 *    are bit-identical).
 *  - Keys are sorted by their **UTF-8 byte sequences** (byte-wise
 *    lexicographic, ascending). NOTE: this is *not* identical to Java's
 *    `String.compareTo` (UTF-16 code-unit order) for keys containing
 *    supplementary characters — e.g. `"\uFFFD"` sorts BEFORE `"\uD800\uDC00"`
 *    under UTF-8 byte order but AFTER it under UTF-16 order. Implementations
 *    must sort on the encoded bytes, never on `String` order.
 *  - No Unicode normalization is applied to keys or values; the caller owns
 *    string form. (AISE-003's shared contracts may pin normalization rules;
 *    until then, byte-level purity is the only safe rule.)
 *  - Empty payload and empty metadata are both legal.
 *  - Inputs must be non-null (Kotlin types enforce this within Kotlin; JVM
 *    callers bypassing null checks get an immediate failure — behavior for
 *    null inputs is intentionally undefined and never hashed).
 *
 * ## Reference test vectors (independently derived, see
 * ## `ContentIdentityTest`)
 *
 * ```text
 * contentId("abc".utf8, {})                  = e2b85b152a1d9025f692a6720f795991238fa63ef14660d9d0aa7ab787255956
 * contentId("AISE field client foundation".utf8,
 *           {"capture.kind"="photo","device.id"="d-7","session.id"="s-042"})
 *                                            = 0083e6832f8b95c3102706f1ebf58ab5d83201ac86c7bb796e1a7e2f22c0e4d2
 * contentId(empty, {})                       = b12dc3b3ff8b706acae3183c95469f8192c9ed0739a29683e62165a8eb77ab98
 * ```
 */
object ContentIdentity {

    /** The canonical encoding version tag (ASCII, 15 bytes). */
    const val CANONICAL_VERSION_TAG: String = "AISE-CONTENT-V1"

    private val TAG_BYTES: ByteArray = CANONICAL_VERSION_TAG.toByteArray(Charsets.US_ASCII)

    /**
     * Derives the deterministic content id for a payload + metadata pair.
     *
     * The result depends on nothing but the arguments: not the map's
     * iteration order, not the clock, not the timezone, not the locale.
     */
    fun contentId(payload: ByteArray, metadata: Map<String, String>): ContentId {
        val digest = MessageDigest.getInstance("SHA-256")

        digest.update(TAG_BYTES)
        digest.update(lengthPrefix(payload.size))
        digest.update(payload)

        val entries = metadata.entries.sortedWith { a, b ->
            Arrays.compare(a.key.toByteArray(Charsets.UTF_8), b.key.toByteArray(Charsets.UTF_8))
        }
        digest.update(lengthPrefix(entries.size))
        for (entry in entries) {
            val keyBytes = entry.key.toByteArray(Charsets.UTF_8)
            val valueBytes = entry.value.toByteArray(Charsets.UTF_8)
            digest.update(lengthPrefix(keyBytes.size))
            digest.update(keyBytes)
            digest.update(lengthPrefix(valueBytes.size))
            digest.update(valueBytes)
        }

        return ContentId(hex(digest.digest()))
    }

    /** 8-byte big-endian length prefix. */
    private fun lengthPrefix(length: Int): ByteArray =
        ByteBuffer.allocate(Long.SIZE_BYTES).putLong(length.toLong()).array()

    /** Lowercase hex rendering (no third-party codecs). */
    private fun hex(bytes: ByteArray): String {
        val digits = "0123456789abcdef"
        val out = CharArray(bytes.size * 2)
        var index = 0
        for (byte in bytes) {
            val value = byte.toInt() and 0xff
            out[index++] = digits[value ushr 4]
            out[index++] = digits[value and 0x0f]
        }
        return String(out)
    }
}
