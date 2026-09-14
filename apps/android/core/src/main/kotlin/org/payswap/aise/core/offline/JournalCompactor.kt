package org.payswap.aise.core.offline

/**
 * THE journal compactor (AISE-030) — a PURE function from journal text to
 * (new journal text + report), bounding offline storage on low-end devices.
 *
 * ## What it drops (and only that)
 *
 * For every TERMINAL mission (completed/failed/escalated) the superseded
 * intermediate transitions are dropped, reducing the mission to its original
 * `mission.enqueued` record plus its final terminal record. ACTIVE missions
 * (waiting/running/paused) keep their FULL history — their intermediate
 * transitions are still resumable state.
 *
 * ## Sequence renumbering
 *
 * The retained events keep their RELATIVE order but are renumbered to a
 * strict 1..n sequence: the fold demands strictly +1 sequences, and dropping
 * events would otherwise leave gaps. Renumbering is safe for the logical
 * queue state because [QueuedMission] carries no journal ordinals — the FIFO
 * tiebreak is the (preserved) enqueue insertion order, and every mission's
 * enqueue event is always retained.
 *
 * ## Safety property (the key invariant, pinned by tests)
 *
 * Rehydrating ([OfflineMissionQueue.rehydrate]) the COMPACTED journal yields
 * the SAME logical queue state as rehydrating the original: identical
 * missions (admission facts + statuses), identical dispatch order, identical
 * running/terminal sets. Journal BYTES differ (that is the point); the state
 * does not.
 *
 * ## Purity
 *
 * The input journal is NEVER rewritten in place: the input string is
 * untouched (strings are immutable; the mandate is pinned by test) and a NEW
 * text is returned. Compaction is idempotent — a compacted journal compacted
 * again is byte-identical with zero entries dropped.
 */
data class CompactionReport(
    val bytesBefore: Long,
    val bytesAfter: Long,
    val entriesBefore: Int,
    val entriesAfter: Int,
    val entriesDropped: Int,
    /** Terminal missions whose intermediate transitions were actually dropped. */
    val missionsCompacted: Int,
) {
    /** Saved bytes (never negative; compaction never grows the journal — pinned by test). */
    val bytesSaved: Long get() = bytesBefore - bytesAfter
}

data class CompactionResult(
    val journal: String,
    val report: CompactionReport,
)

object JournalCompactor {

    fun compact(journalText: String): CompactionResult {
        val events = QueueJournal.parse(journalText)
        val state = QueueFold.fold(events) // validates discipline; corruption propagates typed with index

        val terminalIds = state.missions.values
            .filter { it.status.isTerminal }
            .mapTo(mutableSetOf()) { it.missionId }

        // Retention: terminal missions keep first (enqueue) + last (terminal) event; active keep all.
        val firstIndex = HashMap<String, Int>()
        val lastIndex = HashMap<String, Int>()
        val eventCountByMission = HashMap<String, Int>()
        events.forEachIndexed { index, event ->
            if (event.missionId !in firstIndex) firstIndex[event.missionId] = index
            lastIndex[event.missionId] = index
            eventCountByMission[event.missionId] = (eventCountByMission[event.missionId] ?: 0) + 1
        }
        val retained = events.filterIndexed { index, event ->
            val missionId = event.missionId
            missionId !in terminalIds ||
                index == firstIndex.getValue(missionId) ||
                index == lastIndex.getValue(missionId)
        }

        // Renumber to a strict 1..n sequence (see the file header: gaps would fail the +1 fold).
        val renumbered = retained.mapIndexed { newIndex, event -> renumbered(event, newIndex + 1L) }

        val journal = QueueJournal.render(renumbered)
        val missionsCompacted = terminalIds.count { eventCountByMission.getValue(it) > 2 }
        val report = CompactionReport(
            bytesBefore = utf8ByteLength(journalText),
            bytesAfter = utf8ByteLength(journal),
            entriesBefore = events.size,
            entriesAfter = renumbered.size,
            entriesDropped = events.size - renumbered.size,
            missionsCompacted = missionsCompacted,
        )
        return CompactionResult(journal = journal, report = report)
    }

    private fun renumbered(event: QueueEvent, sequence: Long): QueueEvent = when (event) {
        is MissionEnqueued -> event.copy(sequence = sequence)
        is MissionStarted -> event.copy(sequence = sequence)
        is MissionPaused -> event.copy(sequence = sequence)
        is MissionCompleted -> event.copy(sequence = sequence)
        is MissionFailed -> event.copy(sequence = sequence)
        is MissionEscalated -> event.copy(sequence = sequence)
    }
}
