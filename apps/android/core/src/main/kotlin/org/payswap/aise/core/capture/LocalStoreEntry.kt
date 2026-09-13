package org.payswap.aise.core.capture

import org.payswap.aise.core.identity.ContentId
import org.payswap.aise.core.identity.ContentIdentity

/**
 * An immutable entry of the append-only local capture store: raw payload
 * bytes plus acquisition metadata plus a content-addressed id plus a UTC
 * creation instant.
 *
 * This is the local counterpart of a `CaptureAsset` (spec/domain-model.md):
 * every asset carries content identity and acquisition metadata
 * (spec/architecture.md §4).
 *
 * SEMANTICS (frozen by the domain model):
 *  - [id] MUST equal [ContentIdentity.contentId] of (payload, metadata).
 *    Stores verify this on append and reject mismatched entries.
 *  - [createdAtUtcMillis] is UTC epoch milliseconds. Epoch millis are
 *    timezone-free by definition; no conversion to or from any local
 *    timezone ever happens inside this class.
 *  - The entry is deeply immutable: payload bytes are defensively copied on
 *    construction and on every read; the metadata view is unmodifiable.
 *  - `createdAtUtcMillis` is NOT part of content identity. Re-appending the
 *    same content with a different timestamp is an idempotent duplicate, not
 *    a new asset (the first entry wins — append-only stores never rewrite
 *    history).
 */
class LocalStoreEntry(
    /** Content-addressed id; must equal the derived id of (payload, metadata). */
    val id: ContentId,
    payload: ByteArray,
    metadata: AcquisitionMetadata,
    /** Creation instant, UTC epoch milliseconds (non-negative). */
    val createdAtUtcMillis: Long,
) {

    private val payloadBytes: ByteArray = payload.copyOf()

    /** Immutable acquisition metadata (deterministic key order, unmodifiable view). */
    val metadata: AcquisitionMetadata = metadata

    init {
        require(createdAtUtcMillis >= 0L) {
            "createdAtUtcMillis must be non-negative UTC epoch millis, was $createdAtUtcMillis"
        }
    }

    /** Defensive copy of the payload — callers can never mutate stored bytes. */
    fun payload(): ByteArray = payloadBytes.copyOf()

    override fun equals(other: Any?): Boolean {
        if (this === other) return true
        if (other !is LocalStoreEntry) return false
        return id == other.id &&
            payloadBytes.contentEquals(other.payloadBytes) &&
            metadata == other.metadata &&
            createdAtUtcMillis == other.createdAtUtcMillis
    }

    override fun hashCode(): Int {
        var result = id.hashCode()
        result = 31 * result + payloadBytes.contentHashCode()
        result = 31 * result + metadata.hashCode()
        result = 31 * result + createdAtUtcMillis.hashCode()
        return result
    }

    override fun toString(): String =
        "LocalStoreEntry(id=$id, payloadSize=${payloadBytes.size}, " +
            "metadataEntries=${metadata.size}, createdAtUtcMillis=$createdAtUtcMillis)"

    companion object {
        /**
         * The canonical construction path: derives the content id from
         * (payload, metadata) so the entry is verifiable by construction.
         */
        fun create(
            payload: ByteArray,
            metadata: Map<String, String>,
            createdAtUtcMillis: Long,
        ): LocalStoreEntry =
            LocalStoreEntry(
                id = ContentIdentity.contentId(payload, metadata),
                payload = payload,
                metadata = AcquisitionMetadata(metadata),
                createdAtUtcMillis = createdAtUtcMillis,
            )
    }
}
