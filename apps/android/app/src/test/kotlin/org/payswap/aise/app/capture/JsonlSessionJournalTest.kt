package org.payswap.aise.app.capture

import java.io.File
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.io.CleanupMode
import org.junit.jupiter.api.io.TempDir
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.Assertions.assertThrows
import org.payswap.aise.core.session.CaptureSessionEvent
import org.payswap.aise.core.session.CaptureSessionStatus
import org.payswap.aise.core.session.JournalCorruptionException
import org.payswap.aise.core.session.SessionReplay

/**
 * Journal FILE tests: append → read round-trips, the torn-tail WAL rule,
 * mid-file corruption (fail closed), and journal-derived sequencing.
 */
class JsonlSessionJournalTest {

    @TempDir(cleanup = CleanupMode.ALWAYS)
    lateinit var root: File

    private fun journal(): JsonlSessionJournal = JsonlSessionJournal(File(root, "journal.jsonl"))

    private fun sampleJournal(): List<CaptureSessionEvent> {
        var seq = 0L
        val events = mutableListOf<CaptureSessionEvent>()
        fun add(event: CaptureSessionEvent) {
            events.add(event)
        }
        add(
            org.payswap.aise.core.session.SessionCreated(
                sequence = ++seq,
                atUtcMillis = CaptureRuntimeFixtures.T0,
                sessionId = "0b6f6e2a-9b3d-4a51-8b3e-2f0b8ac21d77",
                deviceIdentity = CaptureRuntimeFixtures.deviceIdentity(),
                capabilitySnapshot = CaptureRuntimeFixtures.capabilitySnapshot(CaptureRuntimeFixtures.T0),
                missionRef = null,
            ),
        )
        add(
            org.payswap.aise.core.session.SessionStateChanged(
                ++seq, CaptureRuntimeFixtures.T0 + 1, CaptureSessionStatus.DRAFT, CaptureSessionStatus.CAPTURING,
            ),
        )
        add(
            org.payswap.aise.core.session.SessionStateChanged(
                ++seq, CaptureRuntimeFixtures.T0 + 2, CaptureSessionStatus.CAPTURING, CaptureSessionStatus.PAUSED,
            ),
        )
        return events
    }

    @Test
    fun `append then read round-trips the events`() {
        val journal = journal()
        sampleJournal().forEach { journal.append(it) }
        val read = journal.read()
        assertEquals(sampleJournal(), read.events)
        assertEquals(false, read.tailDiscarded)
    }

    @Test
    fun `journal file is one jsonl line per event with trailing newlines`() {
        val journal = journal()
        sampleJournal().forEach { journal.append(it) }
        val lines = File(root, "journal.jsonl").readText(Charsets.UTF_8).trim().split("\n")
        assertEquals(3, lines.size)
        assertTrue(lines.all { it.startsWith("{") && it.endsWith("}") })
    }

    @Test
    fun `nextSequence is journal-derived`() {
        val journal = journal()
        assertEquals(1L, journal.nextSequence())
        sampleJournal().forEach { journal.append(it) }
        assertEquals(4L, journal.nextSequence())
    }

    @Test
    fun `append refuses out-of-order sequence numbers`() {
        val journal = journal()
        sampleJournal().forEach { journal.append(it) }
        assertThrows(IllegalStateException::class.java) {
            journal.append(
                org.payswap.aise.core.session.SessionStateChanged(
                    6L, CaptureRuntimeFixtures.T0 + 3, CaptureSessionStatus.PAUSED, CaptureSessionStatus.CAPTURING,
                ),
            )
        }
    }

    @Test
    fun `a torn tail line is discarded exactly once and reported`() {
        val journal = journal()
        sampleJournal().forEach { journal.append(it) }
        // Simulate a crash mid-append: append raw PARTIAL bytes with no newline.
        File(root, "journal.jsonl").appendText("""{"at":123,"seq""")

        val read = journal.read()
        assertEquals(sampleJournal(), read.events)
        assertTrue(read.tailDiscarded)

        // Self-heal: the next append truncates the torn tail and rewrites sequence 4.
        journal.append(
            org.payswap.aise.core.session.SessionStateChanged(
                4L, CaptureRuntimeFixtures.T0 + 3, CaptureSessionStatus.PAUSED, CaptureSessionStatus.CAPTURING,
            ),
        )
        val healed = journal.read()
        assertEquals(4, healed.events.size)
        assertEquals(false, healed.tailDiscarded)
        // The healed journal still folds:
        assertEquals(CaptureSessionStatus.CAPTURING, SessionReplay.replay(healed.events).status)
    }

    @Test
    fun `an unterminated final line is uncommitted - discarded even when parsable`() {
        val journal = journal()
        sampleJournal().forEach { journal.append(it) }
        // Crash between writing the line bytes and the newline: the 3rd line parses
        // but was never COMMITTED (WAL: a line is committed with its newline).
        val raw = File(root, "journal.jsonl")
        raw.writeText(raw.readText(Charsets.UTF_8).dropLast(1))

        val read = journal.read()
        assertEquals(2, read.events.size) // the 3rd line is torn — gone
        assertTrue(read.tailDiscarded)

        // The next append self-heals: truncates the torn line, rewrites sequence 3.
        journal.append(
            org.payswap.aise.core.session.SessionStateChanged(
                3L, CaptureRuntimeFixtures.T0 + 2, CaptureSessionStatus.CAPTURING, CaptureSessionStatus.PAUSED,
            ),
        )
        val healed = journal.read()
        assertEquals(3, healed.events.size)
        assertEquals(false, healed.tailDiscarded)
    }

    @Test
    fun `mid-file corruption fails closed`() {
        val journal = journal()
        sampleJournal().forEach { journal.append(it) }
        val lines = File(root, "journal.jsonl").readText(Charsets.UTF_8).trim().split("\n").toMutableList()
        lines[1] = "this is not json"
        File(root, "journal.jsonl").writeText(lines.joinToString("\n", postfix = "\n"))
        assertThrows(JournalCorruptionException::class.java) { journal.read() }
    }

    @Test
    fun `a missing journal file reads as empty`() {
        val read = journal().read()
        assertTrue(read.events.isEmpty())
        assertEquals(false, read.tailDiscarded)
    }
}
