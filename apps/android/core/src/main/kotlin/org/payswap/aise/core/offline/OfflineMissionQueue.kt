package org.payswap.aise.core.offline

/**
 * THE persistent offline mission queue (AISE-030) — a PURE, event-sourced
 * state machine over the journaled queue ([QueueJournal]): enqueue missions
 * (with their compatibility verdicts), dequeue in priority order, journal
 * every lifecycle transition, and rehydrate the exact queue state from the
 * journal text alone.
 *
 * ## Purity and the single-writer model
 *
 * NO I/O, no clock, no randomness: every timestamp is INJECTED by the caller;
 * sequences are queue-assigned (strict 1..n +1). The instance is IMMUTABLE —
 * every operation returns a NEW queue with exactly ONE journal event
 * appended (atomic-in-sequence). Persisting each journal line is the :app
 * layer's job (this class never touches a filesystem); the queue assumes a
 * SINGLE WRITER, and at most ONE mission RUNNING at a time (one device, one
 * guided executor — enforced by the fold in [QueueFold]).
 *
 * ## Dequeue ordering (deterministic)
 *
 * The next mission is dequeued from the WAITING missions by PRIORITY
 * DESCENDING (higher integer = more urgent) with FIFO as the tiebreak
 * (enqueue insertion order — a stable sort). PAUSED missions are NOT
 * re-dequeued — an interrupted mission is resumed EXPLICITLY via [start];
 * the queue keeps serving waiting missions meanwhile.
 *
 * ## Facts, not policy
 *
 * Incompatible missions (any NOT_EXECUTABLE mandatory step per
 * [CompatibilityVerdict]) are ADMITTED and flagged `incompatible` — never
 * silently dropped; the offline queue holds facts. Policy violations against
 * [QueuePolicy] are typed [QueueRefusal]s. Completion truth belongs to the
 * mission executor (AISE-009); mission-state authority to the server
 * (AISE-007/022) — this queue only sequences and journals.
 */
class OfflineQueueException(message: String) : IllegalStateException(message)

/** Typed, explicit admission refusals — a mission is never dropped silently. */
sealed class QueueRefusal(message: String) : IllegalStateException(message)

class QueueFullRefusal(
    val pendingMissions: Int,
    val maxQueuedMissions: Int,
) : QueueRefusal(
    "offline queue is full: $pendingMissions pending mission(s) already admitted (cap $maxQueuedMissions) " +
        "— drain or complete missions before admitting more",
)

class MissionTooLargeRefusal(
    val assetCount: Long,
    val maxAssetsPerMission: Long,
) : QueueRefusal(
    "mission too large for this device profile: $assetCount pending asset(s) exceed the per-mission cap " +
        "$maxAssetsPerMission",
)

class DuplicateMissionRefusal(
    val missionId: String,
) : QueueRefusal("mission '$missionId' is already in this queue — enqueue is once per mission")

/** The result of [OfflineMissionQueue.dequeue]: the next queue plus the started mission. */
data class DequeuedMission(
    val queue: OfflineMissionQueue,
    val mission: QueuedMission,
)

class OfflineMissionQueue private constructor(
    val policy: QueuePolicy,
    private val events: List<QueueEvent>,
    private val state: QueueStateData,
) {
    companion object {

        fun empty(policy: QueuePolicy = QueuePolicy.DEFAULT): OfflineMissionQueue =
            OfflineMissionQueue(policy, emptyList(), QueueFold.emptyState())

        /**
         * Reconstructs the exact queue from journal text alone. Validates
         * journal DISCIPLINE only (see [QueuePolicy] — facts on disk are
         * never rewritten to satisfy current caps). Every deviation fails
         * closed with [QueueJournalCorruptionException] naming the bad line
         * index. The empty string is the valid empty queue.
         */
        fun rehydrate(journalText: String, policy: QueuePolicy = QueuePolicy.DEFAULT): OfflineMissionQueue {
            val events = QueueJournal.parse(journalText)
            return OfflineMissionQueue(policy, events, QueueFold.fold(events))
        }
    }

    /** Deterministic journal text (JSONL, one event per line, trailing newline; empty queue → ""). */
    val journalText: String get() = QueueJournal.render(events)

    /** Honest UTF-8 byte size of the current journal. */
    fun journalBytes(): Long = utf8ByteLength(journalText)

    /** All missions ever admitted, in enqueue order. */
    fun missions(): List<QueuedMission> = state.missions.values.toList()

    /** Non-terminal missions in dispatch order: priority descending, then FIFO (stable sort keeps enqueue order). */
    fun pendingMissions(): List<QueuedMission> =
        missions()
            .filter { !it.status.isTerminal }
            .sortedByDescending { it.priority }

    /** The single RUNNING mission, if any (single-active-execution device model). */
    fun runningMission(): QueuedMission? = missions().firstOrNull { it.status == QueuedMissionStatus.RUNNING }

    /** Missions that reached a terminal state, in enqueue order. */
    fun terminalMissions(): List<QueuedMission> = missions().filter { it.status.isTerminal }

    fun mission(missionId: String): QueuedMission? = state.missions[missionId]

    /** True when the journal exceeds [QueuePolicy.maxJournalBytes] — compact, never refuse or drop. */
    fun compactionDue(): Boolean = journalBytes() > policy.maxJournalBytes

    // ------------------------------------------------------------------
    // Admission
    // ------------------------------------------------------------------

    /**
     * Admits a mission with its compatibility verdict (facts recorded in the
     * journal). Incompatible missions are admitted and flagged. Refusals are
     * typed: [DuplicateMissionRefusal], [QueueFullRefusal],
     * [MissionTooLargeRefusal].
     */
    fun enqueue(
        verdict: CompatibilityVerdict,
        priority: Int,
        assetCount: Long,
        atUtcMillis: Long,
    ): OfflineMissionQueue {
        if (state.missions.containsKey(verdict.missionId)) {
            throw DuplicateMissionRefusal(verdict.missionId)
        }
        val pendingCount = state.missions.values.count { !it.status.isTerminal }
        if (pendingCount >= policy.maxQueuedMissions) {
            throw QueueFullRefusal(pendingCount, policy.maxQueuedMissions)
        }
        if (assetCount > policy.maxAssetsPerMission) {
            throw MissionTooLargeRefusal(assetCount, policy.maxAssetsPerMission)
        }
        return append(
            MissionEnqueued(
                sequence = nextSequence(),
                atUtcMillis = atUtcMillis,
                missionId = verdict.missionId,
                priority = priority,
                verdict = verdict.overall,
                incompatible = verdict.incompatible,
                assetCount = assetCount,
                blockers = verdict.blockers,
                journalVersion = QueueEvent.JOURNAL_VERSION,
            ),
        )
    }

    // ------------------------------------------------------------------
    // Dispatch + lifecycle
    // ------------------------------------------------------------------

    /**
     * Starts (and returns) the next WAITING mission in dispatch order
     * (priority descending, FIFO tiebreak; PAUSED missions are resumed via
     * [start], never re-dequeued). Null when no mission is waiting. Refuses
     * via [OfflineQueueException] while another mission is RUNNING.
     */
    fun dequeue(atUtcMillis: Long): DequeuedMission? {
        val current = runningMission()
        if (current != null) {
            throw OfflineQueueException(
                "single active execution: mission '${current.missionId}' is RUNNING — " +
                    "finish or pause it before dequeuing the next mission",
            )
        }
        val next = pendingMissions().firstOrNull { it.status == QueuedMissionStatus.WAITING } ?: return null
        val queue = append(MissionStarted(nextSequence(), atUtcMillis, next.missionId))
        return DequeuedMission(queue = queue, mission = queue.mission(next.missionId)!!)
    }

    /** Starts a WAITING mission, or RESUMES a PAUSED one (interruption recovery). */
    fun start(missionId: String, atUtcMillis: Long): OfflineMissionQueue =
        append(MissionStarted(nextSequence(), atUtcMillis, missionId))

    fun pause(missionId: String, reason: String, atUtcMillis: Long): OfflineMissionQueue =
        append(MissionPaused(nextSequence(), atUtcMillis, missionId, reason))

    fun complete(missionId: String, atUtcMillis: Long): OfflineMissionQueue =
        append(MissionCompleted(nextSequence(), atUtcMillis, missionId))

    fun fail(missionId: String, reason: String, atUtcMillis: Long): OfflineMissionQueue =
        append(MissionFailed(nextSequence(), atUtcMillis, missionId, reason))

    fun escalate(missionId: String, reason: String, atUtcMillis: Long): OfflineMissionQueue =
        append(MissionEscalated(nextSequence(), atUtcMillis, missionId, reason))

    // ------------------------------------------------------------------
    // Internals
    // ------------------------------------------------------------------

    private fun nextSequence(): Long = state.lastSequence + 1

    /** ONE event, validated by the normative fold, then immutably applied. */
    private fun append(event: QueueEvent): OfflineMissionQueue {
        val nextState = QueueFold.apply(state, event) { message -> throw OfflineQueueException(message) }
        return OfflineMissionQueue(policy, events + event, nextState)
    }
}
