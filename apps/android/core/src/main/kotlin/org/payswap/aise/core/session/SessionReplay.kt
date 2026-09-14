package org.payswap.aise.core.session

/**
 * The event-sourced fold: journal events → [CaptureSessionRecord].
 *
 * PURE — no I/O, no clock, no randomness. The same event list always folds
 * to an equal record (pinned by tests), which is the determinism requirement
 * of the AISE-005 work order. Every rule below is a corruption detector that
 * fails closed with [JournalCorruptionException]:
 *
 *  1. the first event MUST be `session.created` with sequence 1;
 *  2. sequence numbers strictly increase by exactly 1 (no gaps, no repeats);
 *  3. `session.state`: `from` must equal the current status and the
 *     transition must be legal ([SessionTransitions]);
 *  4. `asset.captured`: only while CAPTURING; assetId must be unique;
 *  5. `asset.corrupted`: the asset must exist and not already be corrupted,
 *     and the session must be interrupted (recovery context);
 *  6. `session.reopened`: only for interrupted sessions AND only when the
 *     previous event is not itself a reopen — the exactly-once invariant;
 *  7. timestamps must be non-decreasing (a journal written by one injected
 *     clock never goes backwards; a backwards step is tampering/corruption).
 */
object SessionReplay {

    fun replay(events: List<CaptureSessionEvent>): CaptureSessionRecord {
        require(events.isNotEmpty()) { "cannot replay an empty journal (no session.created event)" }
        return ReplayFold().fold(events)
    }

    private class ReplayFold {
        private var record: CaptureSessionRecord? = null
        private var lastAt: Long = -1L
        private var lastWasReopen = false

        fun fold(events: List<CaptureSessionEvent>): CaptureSessionRecord {
            events.forEachIndexed { index, event -> apply(event, index) }
            return record ?: throw JournalCorruptionException("journal produced no state (impossible after validation)")
        }

        private fun apply(event: CaptureSessionEvent, index: Int) {
            // Rule 1: the first event must be session.created.
            if (index == 0) {
                if (event !is SessionCreated) {
                    throw JournalCorruptionException(
                        "first journal event must be session.created, was ${event.type}",
                    )
                }
            } else if (event is SessionCreated) {
                throw JournalCorruptionException("duplicate session.created at sequence ${event.sequence}")
            }

            // Rule 2: strict +1 sequencing.
            if (event.sequence != index + 1L) {
                throw JournalCorruptionException(
                    "sequence gap/duplicate: expected ${index + 1}, was ${event.sequence} (${event.type})",
                )
            }

            // Rule 7: monotonic time.
            if (event.atUtcMillis < lastAt) {
                throw JournalCorruptionException(
                    "timestamp regression at sequence ${event.sequence}: ${event.atUtcMillis} < $lastAt",
                )
            }
            lastAt = event.atUtcMillis

            // session.created establishes the fold's initial state — everything else needs it.
            if (event is SessionCreated) {
                record = CaptureSessionRecord.initial(event)
                lastWasReopen = false
                return
            }

            val current = record
                ?: throw JournalCorruptionException("journal state missing before sequence ${event.sequence}")

            when (event) {
                is SessionStateChanged -> {
                    // Rule 3: from must match current status; legality is already enforced by the event type.
                    if (event.from != current.status) {
                        throw JournalCorruptionException(
                            "transition source mismatch at sequence ${event.sequence}: " +
                                "event says ${event.from.name}, journal state is ${current.status.name}",
                        )
                    }
                    record = current.copy(
                        status = event.to,
                        endedAtUtcMillis = if (event.to == CaptureSessionStatus.FINALIZED) event.atUtcMillis else current.endedAtUtcMillis,
                    )
                    lastWasReopen = false
                }
                is AssetCaptured -> {
                    // Rule 4: assets only while actively capturing; unique asset ids.
                    if (current.status != CaptureSessionStatus.CAPTURING) {
                        throw JournalCorruptionException(
                            "asset.captured at sequence ${event.sequence} while status is ${current.status.name} " +
                                "(assets are only captured while CAPTURING)",
                        )
                    }
                    if (current.assets.any { it.assetId == event.asset.assetId }) {
                        throw JournalCorruptionException(
                            "duplicate assetId ${event.asset.assetId} at sequence ${event.sequence}",
                        )
                    }
                    record = current.copy(assets = current.assets + event.asset)
                    lastWasReopen = false
                }
                is AssetCorrupted -> {
                    // Rule 5: known, not-already-corrupted asset, in an interrupted session.
                    val target = current.asset(event.assetId)
                        ?: throw JournalCorruptionException(
                            "asset.corrupted for unknown assetId ${event.assetId} at sequence ${event.sequence}",
                        )
                    if (target.corrupted) {
                        throw JournalCorruptionException(
                            "asset.corrupted already recorded for ${event.assetId} at sequence ${event.sequence}",
                        )
                    }
                    if (!current.isOpen) {
                        throw JournalCorruptionException(
                            "asset.corrupted at sequence ${event.sequence} while status is ${current.status.name} " +
                                "(corruption is discovered by recovery on interrupted sessions only)",
                        )
                    }
                    record = current.copy(
                        assets = current.assets.map {
                            if (it.assetId == event.assetId) {
                                it.copy(corrupted = true, corruptionReason = event.reason)
                            } else {
                                it
                            }
                        },
                    )
                    lastWasReopen = false
                }
                is SessionReopened -> {
                    // Rule 6: exactly-once reopen — interrupted session, and not immediately after another reopen.
                    if (!current.isOpen) {
                        throw JournalCorruptionException(
                            "session.reopened at sequence ${event.sequence} while status is ${current.status.name} " +
                                "(only interrupted sessions are re-opened)",
                        )
                    }
                    if (lastWasReopen) {
                        throw JournalCorruptionException(
                            "double session.reopened at sequence ${event.sequence} — " +
                                "recovery must re-open each interruption exactly once",
                        )
                    }
                    record = current.copy(reopenAudits = current.reopenAudits + event.recovery)
                    lastWasReopen = true
                }
                is SessionCreated ->
                    // Unreachable: handled (and returned) above; the branch keeps `when` exhaustive.
                    throw JournalCorruptionException("session.created out of place at sequence ${event.sequence}")
            }
        }
    }
}
