package org.payswap.aise.core.capture

import org.payswap.aise.core.identity.ContentId

/**
 * Append-only local capture store — the persistence ABSTRACTION that
 * AISE-005 will implement on-device (SQLite/file-backed) and that tests and
 * the debug app shell use in memory.
 *
 * ## Append-only contract
 *
 *  - Entries are never updated, mutated or deleted once appended. There are
 *    NO update/delete/remove methods on this interface — enforced by
 *    reflection-level contract tests (`AppendOnlyContractTest`).
 *  - Duplicate appends of byte-identical content are idempotent no-ops that
 *    report [AppendOutcome.Duplicate]; the first appended entry is always
 *    retained verbatim (append-only stores never rewrite history).
 *  - [acknowledge] is NOT a mutation: it appends a fact to a separate,
 *    append-only sync ledger so [pending] can exclude already-synced
 *    entries. Raw evidence itself stays untouched forever
 *    (spec/architecture-lock.md: "Raw field evidence is immutable").
 *
 * ## Persistence semantics only — never authority
 *
 * This interface stores bytes + acquisition metadata. Nothing here computes,
 * asserts or declares engineering truth, readiness or verification results.
 * The client is a mission executor; mission policy is server-authoritative
 * (spec/architecture.md §4). There is deliberately no "mark complete",
 * "set verified" or similar call.
 *
 * ## Implementations
 *
 *  - Must be safe for use from a single mission-execution context
 *    (implementations may synchronize internally; [InMemoryLocalCaptureStore] does).
 *  - Must verify content ids on append (reject [RejectionReason.CONTENT_ID_MISMATCH]).
 *  - Perform I/O only inside implementation boundaries — this abstraction
 *    itself mandates none.
 */
interface LocalCaptureStore {

    /**
     * Appends [entry] to the store. The entry's id is re-derived and checked
     * against its payload+metadata; entries with a self-inconsistent id are
     * rejected (never stored).
     *
     * Duplicate semantics: appending byte-identical content again (id,
     * payload and metadata all equal — the creation timestamp MAY differ) is
     * an idempotent no-op that returns [AppendOutcome.Duplicate] with the
     * originally stored entry.
     */
    fun append(entry: LocalStoreEntry): AppendOutcome

    /** Returns the entry with [id], or null if never appended. */
    fun get(id: ContentId): LocalStoreEntry?

    /**
     * All entries, in append (insertion) order. The returned list and its
     * elements are immutable snapshots.
     */
    fun list(): List<LocalStoreEntry>

    /**
     * Entries that have NOT yet been acknowledged by sync, in append order.
     * With no acknowledgements ever recorded, `pending() == list()`.
     */
    fun pending(): List<LocalStoreEntry>

    /**
     * Records that the entry with [id] has been consumed by synchronization.
     *
     * This appends to a side ledger of sync facts — it does not mutate the
     * entry, the payload, or the metadata. Idempotent: acknowledging an
     * already-acknowledged id succeeds again. Unknown ids yield
     * [AckOutcome.UnknownEntry] (the ledger never invents entries).
     */
    fun acknowledge(id: ContentId): AckOutcome
}

/** Result of [LocalCaptureStore.append]. */
sealed interface AppendOutcome {

    /** The entry was appended (first time this content id was seen). */
    data class Appended(val entry: LocalStoreEntry) : AppendOutcome

    /**
     * Byte-identical content was already stored: idempotent no-op. [existing]
     * is the originally appended entry (with its original timestamp).
     */
    data class Duplicate(val existing: LocalStoreEntry) : AppendOutcome

    /** The entry was rejected and NOT stored. */
    data class Rejected(val id: ContentId, val reason: RejectionReason) : AppendOutcome
}

/** Why an append was rejected. */
enum class RejectionReason {
    /** entry.id does not equal the derived content id of (payload, metadata). */
    CONTENT_ID_MISMATCH,

    /**
     * The id was already stored with DIFFERENT payload/metadata — a sha-256
     * collision or store corruption. Defensive: unreachable without a hash
     * collision, but the store refuses to silently rewrite history.
     */
    CONTENT_COLLISION,
}

/** Result of [LocalCaptureStore.acknowledge]. */
sealed interface AckOutcome {

    /** The sync fact was recorded (or was already recorded — idempotent). */
    data class Acknowledged(val id: ContentId) : AckOutcome

    /** No entry with this id was ever appended; nothing was recorded. */
    data class UnknownEntry(val id: ContentId) : AckOutcome
}
