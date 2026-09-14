package org.payswap.aise.core.offline

/**
 * Low-end device performance safeguards (AISE-030): configurable caps that
 * keep the persistent queue, its journal and the per-mission upload set
 * bounded on memory-constrained hardware.
 *
 * Enforcement is EXPLICIT, never silent:
 *  - [maxQueuedMissions] — the number of non-terminal missions admitted to
 *    the queue; exceeding it on enqueue is a typed [QueueFullRefusal];
 *  - [maxAssetsPerMission] — pending assets a single mission may hold; a
 *    larger mission is a typed [MissionTooLargeRefusal];
 *  - [maxJournalBytes] — the journal size above which compaction is ADVISED
 *    ([OfflineMissionQueue.compactionDue]); journal growth is bounded by
 *    compacting ([JournalCompactor]) and swapping the journal, NEVER by
 *    refusing or dropping missions (missions are facts).
 *
 * Facts already written to a journal are never rewritten by policy:
 * [OfflineMissionQueue.rehydrate] validates journal DISCIPLINE, not the
 * current caps — a rehydrated over-cap queue simply refuses further
 * admissions until missions drain.
 */
data class QueuePolicy(
    val maxQueuedMissions: Int = DEFAULT_MAX_QUEUED_MISSIONS,
    val maxJournalBytes: Long = DEFAULT_MAX_JOURNAL_BYTES,
    val maxAssetsPerMission: Long = DEFAULT_MAX_ASSETS_PER_MISSION,
) {
    init {
        require(maxQueuedMissions > 0) { "maxQueuedMissions must be > 0, was $maxQueuedMissions" }
        require(maxJournalBytes > 0) { "maxJournalBytes must be > 0, was $maxJournalBytes" }
        require(maxAssetsPerMission > 0) { "maxAssetsPerMission must be > 0, was $maxAssetsPerMission" }
    }

    companion object {
        const val DEFAULT_MAX_QUEUED_MISSIONS: Int = 64
        const val DEFAULT_MAX_JOURNAL_BYTES: Long = 262_144L
        const val DEFAULT_MAX_ASSETS_PER_MISSION: Long = 2_000L

        val DEFAULT: QueuePolicy = QueuePolicy()
    }
}
