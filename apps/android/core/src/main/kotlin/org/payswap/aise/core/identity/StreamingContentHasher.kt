package org.payswap.aise.core.identity

import java.nio.ByteBuffer
import java.security.MessageDigest

/**
 * Streaming derivation of the frozen AISE-CONTENT-V1 content id — the SAME
 * encoding as [ContentIdentity.contentId], fed in CHUNKS.
 *
 * Purpose (AISE-005 work order): still images are hashed WHILE being written
 * (single pass: every byte chunk that goes to disk also goes to the digest),
 * and video files are hashed by ONE sequential chunked read after the
 * recorder closes them — never by loading a whole video into memory.
 *
 * `StreamingContentHasherTest` pins the equivalence:
 * `streamingHasher(...).contentId(metadata)` == `ContentIdentity.contentId(bytes, metadata)`
 * for arbitrary chunk sizes, so nothing about the FROZEN identity contract
 * changes — only the way the bytes reach the digest.
 *
 * This class never touches a clock, a locale, a filesystem or the network;
 * the caller owns I/O. Thread-safety: single-threaded use per hasher.
 */
class StreamingContentHasher private constructor() {

    private val digest: MessageDigest = MessageDigest.getInstance("SHA-256")

    companion object {
        /** A comfortable streaming chunk size for file reads (1 MiB). */
        const val STREAM_CHUNK_BYTES: Int = 1024 * 1024

        private val TAG_BYTES: ByteArray = ContentIdentity.CANONICAL_VERSION_TAG.toByteArray(Charsets.US_ASCII)

        /** Begins a hasher and consumes the header: TAG | PLEN (8-byte big-endian payload length). */
        fun begin(payloadLength: Long): StreamingContentHasher {
            require(payloadLength >= 0) { "payloadLength must be non-negative, was $payloadLength" }
            val hasher = StreamingContentHasher()
            hasher.digest.update(TAG_BYTES)
            hasher.digest.update(lengthPrefix(payloadLength))
            return hasher
        }

        private fun lengthPrefix(length: Long): ByteArray =
            ByteBuffer.allocate(Long.SIZE_BYTES).putLong(length).array()
    }

    /** Consumes one payload chunk. Call zero or more times; chunks must total exactly `payloadLength` bytes. */
    fun updatePayloadChunk(chunk: ByteArray, offset: Int = 0, length: Int = chunk.size - offset) {
        require(length >= 0) { "chunk length must be non-negative, was $length" }
        require(chunk.size - offset >= length) { "chunk bounds violated (offset=$offset length=$length size=${chunk.size})" }
        if (length > 0) {
            digest.update(chunk, offset, length)
        }
    }

    /**
     * Consumes the metadata trailer (MCOUNT | sorted ENTRY*) and returns the
     * final content id. The hasher is spent afterwards.
     *
     * The trailer encoding is byte-identical to the second half of
     * [ContentIdentity.contentId] — keys sorted by UTF-8 byte sequence, each
     * entry length-prefixed — so a streamed id equals an in-memory id by
     * construction AND by pinned test vectors.
     */
    fun contentId(metadata: Map<String, String>): ContentId {
        val entries = metadata.entries.sortedWith { a, b ->
            java.util.Arrays.compare(a.key.toByteArray(Charsets.UTF_8), b.key.toByteArray(Charsets.UTF_8))
        }
        digest.update(lengthPrefix(entries.size.toLong()))
        for (entry in entries) {
            val keyBytes = entry.key.toByteArray(Charsets.UTF_8)
            val valueBytes = entry.value.toByteArray(Charsets.UTF_8)
            digest.update(lengthPrefix(keyBytes.size.toLong()))
            digest.update(keyBytes)
            digest.update(lengthPrefix(valueBytes.size.toLong()))
            digest.update(valueBytes)
        }
        return ContentId(hex(digest.digest()))
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
