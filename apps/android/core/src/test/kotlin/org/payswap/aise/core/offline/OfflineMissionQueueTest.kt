package org.payswap.aise.core.offline

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.payswap.aise.core.json.JsonParser
import org.payswap.aise.core.json.JsonValue
import org.payswap.aise.core.json.JsonWriter
import org.payswap.aise.core.session.AcquisitionMethod
import org.payswap.aise.core.session.CapabilityDomainKind

/**
 * Offline mission queue tests (AISE-030 work order §2 + §5): lifecycle and
 * dequeue ordering (priority then FIFO), journal replay fidelity, corrupted
 * journal fail-closed behavior naming the index, policy caps as typed
 * refusals, and incompatible missions admitted-but-flagged.
 */
class OfflineMissionQueueTest {

    // -- verdict builders (synthetic admission facts) ---------------------

    private fun verdict(
        missionId: String,
        overall: StepVerdict = StepVerdict.EXECUTABLE,
        incompatible: Boolean = false,
        blockers: List<String> = emptyList(),
    ): CompatibilityVerdict {
        val stepVerdict = if (overall == StepVerdict.NOT_EXECUTABLE && incompatible) {
            StepCompatibility(
                stepId = "s0",
                method = AcquisitionMethod.DEPTH_SENSING,
                mandatory = true,
                requiredDomains = listOf(CapabilityDomainKind.DEPTH),
                verdict = StepVerdict.NOT_EXECUTABLE,
                reason = blockers.firstOrNull() ?: "required capability domain(s) DEPTH=UNAVAILABLE — a needed domain is unavailable on this device",
            )
        } else {
            StepCompatibility(
                stepId = "s0",
                method = AcquisitionMethod.MANUAL_MEASUREMENT,
                mandatory = true,
                requiredDomains = emptyList(),
                verdict = overall,
                reason = null,
            )
        }
        return CompatibilityVerdict(missionId = missionId, overall = overall, steps = listOf(stepVerdict))
    }

    private val incompatibleVerdict: CompatibilityVerdict = verdict(
        missionId = "m-bad",
        overall = StepVerdict.NOT_EXECUTABLE,
        incompatible = true,
        blockers = listOf("required capability domain(s) DEPTH=UNAVAILABLE — a needed domain is unavailable on this device"),
    )

    // ------------------------------------------------------------------
    // Dequeue ordering: priority descending, FIFO tiebreak
    // ------------------------------------------------------------------

    @Test
    fun `dequeue ordering is priority descending with FIFO tiebreak, deterministic`() {
        val queue = OfflineMissionQueue.empty()
            .enqueue(verdict("m-low"), priority = 1, assetCount = 2, atUtcMillis = 1000)
            .enqueue(verdict("m-high"), priority = 5, assetCount = 3, atUtcMillis = 1010)
            .enqueue(verdict("m-mid"), priority = 5, assetCount = 1, atUtcMillis = 1020) // same priority as m-high → FIFO after it
            .enqueue(verdict("m-top"), priority = 10, assetCount = 1, atUtcMillis = 1030)

        assertEquals(listOf("m-top", "m-high", "m-mid", "m-low"), queue.pendingMissions().map { it.missionId })
        assertNull(queue.runningMission())

        val first = queue.dequeue(1100)!!
        assertEquals("m-top", first.mission.missionId)
        assertEquals(QueuedMissionStatus.RUNNING, first.mission.status)

        // While RUNNING, the next dequeue is refused (single active execution).
        val conflict = assertThrows(OfflineQueueException::class.java) { first.queue.dequeue(1110) }
        assertTrue(conflict.message!!.contains("m-top"))

        val second = first.queue.pause("m-top", "battery swap", 1200).dequeue(1210)!!
        assertEquals("m-high", second.mission.missionId) // priority 5, enqueued before m-mid

        val third = second.queue.complete("m-high", 1220).dequeue(1230)!!
        assertEquals("m-mid", third.mission.missionId)

        val fourth = third.queue.fail("m-mid", "storage full", 1240).dequeue(1250)!!
        assertEquals("m-low", fourth.mission.missionId)

        // m-top is PAUSED (non-terminal) — it is NOT re-dequeued; the queue served m-high/m-mid/m-low meanwhile.
        val fifth = fourth.queue.complete("m-low", 1260).start("m-top", 1270) // resume the paused mission
        assertEquals("m-top", fifth.runningMission()!!.missionId)
        assertThrows(OfflineQueueException::class.java) { fifth.dequeue(1280) } // single active execution
        assertNull(fifth.missions().firstOrNull { it.status == QueuedMissionStatus.WAITING })
    }

    @Test
    fun `dequeue on an empty queue returns null`() {
        assertNull(OfflineMissionQueue.empty().dequeue(1000))
    }

    // ------------------------------------------------------------------
    // Journal replay fidelity
    // ------------------------------------------------------------------

    @Test
    fun `journal replay reconstructs the exact queue state`() {
        val final = OfflineMissionQueue.empty()
            .enqueue(verdict("m1"), priority = 5, assetCount = 2, atUtcMillis = 1000)
            .enqueue(verdict("m2"), priority = 3, assetCount = 1, atUtcMillis = 1010)
            .enqueue(verdict("m3"), priority = 1, assetCount = 0, atUtcMillis = 1020)
            .enqueue(verdict("m4"), priority = 0, assetCount = 4, atUtcMillis = 1030)
            .dequeue(1100)!!.queue // m1 RUNNING
            .pause("m1", "thermal throttling", 1200)
            .start("m1", 1300) // resume
            .complete("m1", 1400)
            .dequeue(1410)!!.queue // m2 RUNNING
            .pause("m2", "operator break", 1500)
            .escalate("m4", "depth steps cannot run on this device", 1600)

        val rehydrated = OfflineMissionQueue.rehydrate(final.journalText)

        assertEquals(final.missions(), rehydrated.missions(), "missions() (admission facts + statuses) must be identical")
        assertEquals(final.pendingMissions(), rehydrated.pendingMissions())
        assertEquals(final.runningMission(), rehydrated.runningMission())
        assertEquals(final.terminalMissions(), rehydrated.terminalMissions())
        assertEquals(final.journalText, rehydrated.journalText)

        assertEquals(listOf("m1", "m4"), rehydrated.terminalMissions().map { it.missionId })
        assertEquals(QueuedMissionStatus.PAUSED, rehydrated.mission("m2")!!.status)
        assertEquals(QueuedMissionStatus.WAITING, rehydrated.mission("m3")!!.status)
        assertEquals(QueuedMissionStatus.COMPLETED, rehydrated.mission("m1")!!.status)
        assertEquals(QueuedMissionStatus.ESCALATED, rehydrated.mission("m4")!!.status)

        // The rehydrated queue keeps working: dequeue the waiting mission and append further.
        val continued = rehydrated.start("m2", 1700)
        assertEquals(continued.journalText, OfflineMissionQueue.rehydrate(continued.journalText).journalText)
    }

    @Test
    fun `the empty journal is the valid empty queue and round-trips`() {
        val empty = OfflineMissionQueue.empty()
        assertEquals("", empty.journalText)
        val rehydrated = OfflineMissionQueue.rehydrate("")
        assertEquals(empty.missions(), rehydrated.missions())
        assertEquals(0, rehydrated.journalBytes())
    }

    // ------------------------------------------------------------------
    // Corrupted journal → typed error naming the index
    // ------------------------------------------------------------------

    private fun enqueuedLine(missionId: String, sequence: Long, at: Long, verdict: StepVerdict = StepVerdict.EXECUTABLE): String =
        MissionEnqueued(
            sequence = sequence, atUtcMillis = at, missionId = missionId, priority = 1,
            verdict = verdict, incompatible = false, assetCount = 1, blockers = emptyList(),
            journalVersion = QueueEvent.JOURNAL_VERSION,
        ).toJournalLine()

    private fun startedLine(missionId: String, sequence: Long, at: Long): String =
        MissionStarted(sequence = sequence, atUtcMillis = at, missionId = missionId).toJournalLine()

    private fun completedLine(missionId: String, sequence: Long, at: Long): String =
        MissionCompleted(sequence = sequence, atUtcMillis = at, missionId = missionId).toJournalLine()

    private fun journalOf(vararg lines: String): String = lines.joinToString(separator = "\n", postfix = "\n")

    /** Structural JSON surgery on one rendered line (deterministic, no string guessing). */
    private fun withFieldRemoved(line: String, field: String): String {
        val obj = JsonParser.parse(line) as JsonValue.JsonObject
        val members = obj.members.toMutableMap()
        members.remove(field)
        return JsonWriter.compact(JsonValue.JsonObject(members))
    }

    private fun withFieldAdded(line: String, field: String, value: JsonValue): String {
        val obj = JsonParser.parse(line) as JsonValue.JsonObject
        val members = obj.members.toMutableMap()
        members[field] = value
        return JsonWriter.compact(JsonValue.JsonObject(members))
    }

    private data class CorruptionCase(
        val name: String,
        val journal: String,
        val expectedIndex: Int,
        val expectedFragment: String? = null,
    ) {
        override fun toString(): String = name
    }

    private fun corruptionCases(): List<CorruptionCase> {
        val valid = journalOf(enqueuedLine("m1", 1, 1000), startedLine("m1", 2, 1100), completedLine("m1", 3, 1200))
        return listOf(
            CorruptionCase("unparsable line", "{not json at all\n" + startedLine("m1", 2, 1100) + "\n", 0),
            CorruptionCase(
                "entry is not a JSON object",
                journalOf("[1,2]"),
                0,
            ),
            CorruptionCase(
                "unknown event type",
                withFieldRemoved(enqueuedLine("m1", 1, 1000), "type")
                    .let { withFieldAdded(it, "type", JsonValue.str("mission.exploded")) },
                0,
                "unknown queue journal entry type",
            ),
            CorruptionCase(
                "missing required field",
                withFieldRemoved(enqueuedLine("m1", 1, 1000), "missionId"),
                0,
                "missionId: expected a string, was absent",
            ),
            CorruptionCase(
                "unknown extra field",
                withFieldAdded(enqueuedLine("m1", 1, 1000), "urgency", JsonValue.num(3)),
                0,
                "unknown field(s)",
            ),
            CorruptionCase(
                "unsupported journal version",
                withFieldRemoved(enqueuedLine("m1", 1, 1000), "journalVersion")
                    .let { withFieldAdded(it, "journalVersion", JsonValue.num(2)) },
                0,
                "unsupported queue journalVersion 2",
            ),
            CorruptionCase(
                "unknown verdict wire name",
                withFieldRemoved(enqueuedLine("m1", 1, 1000), "verdict")
                    .let { withFieldAdded(it, "verdict", JsonValue.str("perhaps")) },
                0,
            ),
            CorruptionCase(
                "blank interior line",
                enqueuedLine("m1", 1, 1000) + "\n\n" + startedLine("m1", 2, 1100) + "\n",
                1,
                "blank queue journal line",
            ),
            CorruptionCase(
                "sequence gap",
                journalOf(enqueuedLine("m1", 1, 1000), startedLine("m1", 3, 1100)),
                1,
                "expected 2, was 3",
            ),
            CorruptionCase(
                "decreasing timestamps",
                journalOf(enqueuedLine("m1", 1, 2000), startedLine("m1", 2, 1000)),
                1,
                "non-decreasing",
            ),
            CorruptionCase(
                "duplicate enqueue",
                journalOf(enqueuedLine("m1", 1, 1000), enqueuedLine("m1", 2, 1100)),
                1,
                "enqueued twice",
            ),
            CorruptionCase(
                "unknown mission started",
                journalOf(enqueuedLine("m1", 1, 1000), startedLine("m2", 2, 1100)),
                1,
                "unknown mission 'm2'",
            ),
            CorruptionCase(
                "event after terminal state",
                valid + startedLine("m1", 4, 1300),
                3,
                "cannot start mission 'm1' in status COMPLETED",
            ),
            CorruptionCase(
                "pause of a waiting mission",
                journalOf(enqueuedLine("m1", 1, 1000), enqueuedLine("m2", 2, 1100)) +
                    MissionPaused(sequence = 3, atUtcMillis = 1200, missionId = "m2", reason = "not running").toJournalLine() + "\n",
                2,
                "cannot pause mission 'm2' in status WAITING",
            ),
            CorruptionCase(
                "second mission started while one runs",
                journalOf(enqueuedLine("m1", 1, 1000), enqueuedLine("m2", 2, 1100), startedLine("m1", 3, 1200), startedLine("m2", 4, 1300)),
                3,
                "single active execution",
            ),
        )
    }

    @Test
    fun `corrupted journals fail closed with a typed error naming the index`() {
        for (case in corruptionCases()) {
            val thrown = runCatching { OfflineMissionQueue.rehydrate(case.journal) }.exceptionOrNull()
            assertTrue(
                thrown is QueueJournalCorruptionException,
                "case '${case.name}' must be rejected (was $thrown)",
            )
            val error = thrown as QueueJournalCorruptionException
            assertEquals(case.expectedIndex, error.index, "case '${case.name}'")
            if (case.expectedFragment != null) {
                assertTrue(error.message!!.contains(case.expectedFragment), "case '${case.name}': ${error.message}")
            }
        }
    }

    @Test
    fun `a lone newline is corruption, not an empty queue`() {
        val error = assertThrows(QueueJournalCorruptionException::class.java) {
            OfflineMissionQueue.rehydrate("\n")
        }
        assertEquals(0, error.index)
    }

    // ------------------------------------------------------------------
    // Policy caps: typed refusals, never silent drops
    // ------------------------------------------------------------------

    @Test
    fun `enqueue over the mission cap is a typed QueueFullRefusal`() {
        val policy = QueuePolicy(maxQueuedMissions = 2, maxJournalBytes = 1_000_000, maxAssetsPerMission = 100)
        val queue = OfflineMissionQueue.empty(policy)
            .enqueue(verdict("m1"), priority = 1, assetCount = 1, atUtcMillis = 1000)
            .enqueue(verdict("m2"), priority = 1, assetCount = 1, atUtcMillis = 1010)

        val refusal = assertThrows(QueueFullRefusal::class.java) {
            queue.enqueue(verdict("m3"), priority = 9, assetCount = 1, atUtcMillis = 1020)
        }
        assertEquals(2, refusal.pendingMissions)
        assertEquals(2, refusal.maxQueuedMissions)
        assertEquals(2, queue.missions().size, "the refused mission was NOT admitted")

        // Completing a mission frees capacity.
        val drained = queue.dequeue(1100)!!.queue.complete("m1", 1200)
        assertEquals(1, drained.missions().count { !it.status.isTerminal })
        drained.enqueue(verdict("m3"), priority = 9, assetCount = 1, atUtcMillis = 1300)
    }

    @Test
    fun `a mission exceeding the asset cap is a typed MissionTooLargeRefusal`() {
        val policy = QueuePolicy(maxQueuedMissions = 10, maxJournalBytes = 1_000_000, maxAssetsPerMission = 10)
        val refusal = assertThrows(MissionTooLargeRefusal::class.java) {
            OfflineMissionQueue.empty(policy).enqueue(verdict("m1"), priority = 1, assetCount = 11, atUtcMillis = 1000)
        }
        assertEquals(11, refusal.assetCount)
        assertEquals(10, refusal.maxAssetsPerMission)
    }

    @Test
    fun `duplicate enqueue is a typed DuplicateMissionRefusal, terminal missions may not re-enqueue`() {
        val queue = OfflineMissionQueue.empty()
            .enqueue(verdict("m1"), priority = 1, assetCount = 1, atUtcMillis = 1000)
        assertThrows(DuplicateMissionRefusal::class.java) {
            queue.enqueue(verdict("m1"), priority = 5, assetCount = 1, atUtcMillis = 1100)
        }
        val finished = queue.dequeue(1200)!!.queue.complete("m1", 1300)
        assertThrows(DuplicateMissionRefusal::class.java) {
            finished.enqueue(verdict("m1"), priority = 5, assetCount = 1, atUtcMillis = 1400)
        }
    }

    @Test
    fun `compactionDue flags journal growth against the byte cap`() {
        val tight = QueuePolicy(maxQueuedMissions = 10, maxJournalBytes = 100, maxAssetsPerMission = 10)
        val queue = OfflineMissionQueue.empty(tight)
        assertFalse(queue.compactionDue())
        val grown = queue.enqueue(verdict("m1"), priority = 1, assetCount = 1, atUtcMillis = 1000)
        assertTrue(grown.compactionDue(), "one enqueued line already exceeds 100 bytes")
        assertTrue(grown.journalBytes() > 100)
        // An honest refusal never happens for journal growth — missions are facts.
        assertEquals(1, grown.missions().size)
    }

    @Test
    fun `rehydrate validates discipline, not current caps - over-cap facts stay readable`() {
        val policy = QueuePolicy(maxQueuedMissions = 2, maxJournalBytes = 1_000_000, maxAssetsPerMission = 100)
        val journal = OfflineMissionQueue.empty(policy)
            .enqueue(verdict("m1"), priority = 1, assetCount = 1, atUtcMillis = 1000)
            .enqueue(verdict("m2"), priority = 1, assetCount = 1, atUtcMillis = 1010)
            .journalText

        val stricter = QueuePolicy(maxQueuedMissions = 1, maxJournalBytes = 1_000_000, maxAssetsPerMission = 100)
        val rehydrated = OfflineMissionQueue.rehydrate(journal, stricter)
        assertEquals(2, rehydrated.missions().size, "facts on disk are not rewritten by policy")
        assertThrows(QueueFullRefusal::class.java) {
            rehydrated.enqueue(verdict("m3"), priority = 1, assetCount = 1, atUtcMillis = 1100)
        }
    }

    // ------------------------------------------------------------------
    // Incompatible missions: admitted and flagged, never silently dropped
    // ------------------------------------------------------------------

    @Test
    fun `incompatible missions are admitted, flagged and retained with their blockers`() {
        val queue = OfflineMissionQueue.empty()
            .enqueue(verdict("m-ok"), priority = 1, assetCount = 1, atUtcMillis = 1000)
            .enqueue(incompatibleVerdict, priority = 5, assetCount = 2, atUtcMillis = 1010)

        assertEquals(2, queue.missions().size)
        val bad = queue.mission("m-bad")!!
        assertTrue(bad.incompatible)
        assertEquals(StepVerdict.NOT_EXECUTABLE, bad.overallVerdict)
        assertEquals(1, bad.blockers.size)
        assertTrue(bad.blockers[0].contains("DEPTH=UNAVAILABLE"))
        assertFalse(queue.mission("m-ok")!!.incompatible)

        // Distinct admission: the journal records compatible vs incompatible differently.
        val lines = queue.journalText.split('\n').filter { it.isNotBlank() }
        assertEquals(2, lines.size)
        assertTrue(lines[0].contains("\"incompatible\":false"))
        assertTrue(lines[1].contains("\"incompatible\":true"))
        assertTrue(lines[1].contains("\"verdict\":\"not_executable\""))

        // The flagged mission is still dequeued in priority order and can be escalated without starting.
        val dequeued = queue.dequeue(1100)!!
        assertEquals("m-bad", dequeued.mission.missionId)
        val escalated = dequeued.queue.escalate("m-bad", "cannot execute depth steps on this device", 1200)
        assertEquals(QueuedMissionStatus.ESCALATED, escalated.mission("m-bad")!!.status)
    }

    @Test
    fun `live misuse of lifecycle operations is a typed OfflineQueueException`() {
        val queue = OfflineMissionQueue.empty()
            .enqueue(verdict("m1"), priority = 1, assetCount = 1, atUtcMillis = 1000)

        assertThrows(OfflineQueueException::class.java) { queue.pause("m1", "not running yet", 1100) }
        assertThrows(OfflineQueueException::class.java) { queue.start("m-unknown", 1100) }
        assertThrows(OfflineQueueException::class.java) { queue.fail("m-unknown", "no such mission", 1100) }
        assertThrows(OfflineQueueException::class.java) { queue.complete("m-unknown", 1100) }

        // Multi-device: a WAITING mission may complete (or fail/escalate) without ever locally
        // starting — it finished on another device; the local queue records the fact.
        val completedElsewhere = queue.complete("m1", 1200)
        assertEquals(QueuedMissionStatus.COMPLETED, completedElsewhere.mission("m1")!!.status)

        val running = OfflineMissionQueue.empty()
            .enqueue(verdict("m2"), priority = 1, assetCount = 1, atUtcMillis = 1000)
            .start("m2", 1100)
        val done = running.complete("m2", 1200)
        assertThrows(OfflineQueueException::class.java) { done.start("m2", 1300) } // terminal is final
        assertThrows(OfflineQueueException::class.java) { done.pause("m2", "terminal", 1300) }
        assertThrows(OfflineQueueException::class.java) {
            done.enqueue(verdict("m3"), 1, 1, 1000) // decreasing timestamp vs the journal's last event (1200)
        }
    }
}
