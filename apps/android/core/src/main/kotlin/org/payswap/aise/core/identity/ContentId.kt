package org.payswap.aise.core.identity

import kotlin.jvm.JvmInline

/**
 * A stable, content-addressed identifier: lowercase hexadecimal SHA-256
 * (exactly 64 characters, `[0-9a-f]{64}`).
 *
 * Ids are derived deterministically from payload bytes plus acquisition
 * metadata by [ContentIdentity.contentId]; they are never random and never
 * time-dependent. The same payload + metadata always yields the same id on
 * every device, offline or online — this is what lets the server (AISE-004
 * capture ingestion) re-derive and verify identity without trusting the
 * client.
 *
 * THIS TYPE CARRIES NO ENGINEERING MEANING. It is a storage/persistence
 * identity only. Readiness, verification or truth assertions are
 * server-side authorities (spec/architecture.md §4) and are out of scope
 * for the client.
 */
@JvmInline
value class ContentId(val value: String) : Comparable<ContentId> {

    init {
        require(isValid(value)) {
            "ContentId must be 64 lowercase hex characters (sha-256), was: '$value'"
        }
    }

    override fun toString(): String = value

    override fun compareTo(other: ContentId): Int = value.compareTo(other.value)

    companion object {
        private val CONTENT_ID_PATTERN = Regex("^[0-9a-f]{64}$")

        fun isValid(value: String): Boolean = CONTENT_ID_PATTERN.matches(value)

        /** Parses and validates an externally supplied id (e.g. from a manifest). */
        fun of(value: String): ContentId = ContentId(value)
    }
}
