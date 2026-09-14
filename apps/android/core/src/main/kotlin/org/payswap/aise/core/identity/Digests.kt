package org.payswap.aise.core.identity

import java.security.MessageDigest

/**
 * Pure sha-256 helpers (no I/O, no third-party codecs — same discipline as
 * [ContentIdentity]). The hex rendering is lowercase, 64 chars, exactly the
 * `contentId` wire form.
 *
 * Used for head samples in asset-integrity verification (AISE-005 recovery).
 */
object Digests {

    /** sha-256 over [bytes], rendered as 64 lowercase hex chars. */
    fun sha256Hex(bytes: ByteArray): String {
        val digest = MessageDigest.getInstance("SHA-256").digest(bytes)
        return hex(digest)
    }

    /** sha-256 over the first [length] bytes of [bytes] (head sample; [length] is clamped to the array). */
    fun sha256HexOfHead(bytes: ByteArray, length: Int): String {
        val n = length.coerceIn(0, bytes.size)
        return sha256Hex(bytes.copyOf(n))
    }

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
