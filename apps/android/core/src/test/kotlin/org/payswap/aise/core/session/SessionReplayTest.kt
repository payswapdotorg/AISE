package org.payswap.aise.core.session

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Test

/**
 * Journal-replay tests (AISE-005 work order §5.4):
 *  - happy-path fold;
 *  - MID-CRASH journal (no finalize) → recovered session state;
 *  - the exactly-once reopen invariant;
 *  - a corruption battery — every journal invariant violation fails closed
 *    with [JournalCorruptionException];
 *  - wire codec round-trips (line → event → line).
 */
class SessionReplayTest {

    // ------------------------------------------------------------------
    // Happy path and mid-crash recovery state
    // ------------------------------------------------------------------

    @Test
    fun `happy path journal folds to a finalized session with assets in order`() {
        val record = SessionReplay.replay(SessionFixtures.happyPathJournal())
        assertEquals(SessionFixtures.SESSION_ID, record.sessionId)
        assertEquals(CaptureSessionStatus.FINALIZED, record.status)
        assertEquals(SessionFixtures.T0, record.startedAtUtcMillis)
        assertEquals(SessionFixtures.T6, record.endedAtUtcMillis)
        assertEquals(listOf("a-0001", "a-0002"), record.assets.map { it.assetId })
        assertTrue(record.manifestAssets.all { !it.corrupted })
        assertNull(record.missionRef)
    }

    @Test
    fun `mid-crash journal folds to the interrupted state the recovery re-opens`() {
        val midCrash = SessionFixtures.happyPathJournal().dropLast(1) // crash before finalize
        val record = SessionReplay.replay(midCrash)
        assertEquals(CaptureSessionStatus.CAPTURING, record.status)
        assertNull(record.endedAtUtcMillis)
        assertEquals(2, record.assets.size)
        assertTrue(record.isOpen)
    }

    @Test
    fun `mission reference flows from the created event`() {
        val events = listOf(
            SessionFixtures.created(missionRef = SessionFixtures.MISSION_REF),
            SessionFixtures.state(2, SessionFixtures.T1, CaptureSessionStatus.DRAFT, CaptureSessionStatus.CAPTURING),
            SessionFixtures.state(3, SessionFixtures.T2, CaptureSessionStatus.CAPTURING, CaptureSessionStatus.PAUSED),
            SessionFixtures.state(4, SessionFixtures.T3, CaptureSessionStatus.PAUSED, CaptureSessionStatus.FINALIZED),
        )
        val record = SessionReplay.replay(events)
        assertEquals(SessionFixtures.MISSION_REF, record.missionRef)
        assertEquals(CaptureSessionStatus.FINALIZED, record.status)
    }

    @Test
    fun `empty abandoned session can be finalized from draft`() {
        val events = listOf(
            SessionFixtures.created(),
            SessionFixtures.state(2, SessionFixtures.T1, CaptureSessionStatus.DRAFT, CaptureSessionStatus.FINALIZED),
        )
        val record = SessionReplay.replay(events)
        assertEquals(CaptureSessionStatus.FINALIZED, record.status)
        assertEquals(0, record.assets.size)
    }

    // ------------------------------------------------------------------
    // Exactly-once reopen
    // ------------------------------------------------------------------

    @Test
    fun `a reopened event after an interruption folds without changing state`() {
        val midCrash = SessionFixtures.happyPathJournal().dropLast(1)
        val audit = SessionRecoveryAudit(
            discardedTmp = listOf("tmp/a-0003.jpg.tmp"),
            completedRenames = emptyList(),
            verifiedAssets = listOf("a-0001", "a-0002"),
            rehashedAssets = emptyList(),
            corruptedAssets = emptyList(),
        )
        val events = midCrash + SessionFixtures.reopened(midCrash.size + 1L, SessionFixtures.T7, audit)
        val record = SessionReplay.replay(events)
        assertEquals(CaptureSessionStatus.CAPTURING, record.status) // state unchanged by recovery
        assertEquals(1, record.reopenAudits.size)
        assertEquals(audit, record.reopenAudits.first())
    }

    @Test
    fun `two consecutive reopened events are rejected - exactly once per interruption`() {
        val midCrash = SessionFixtures.happyPathJournal().dropLast(1)
        val events = midCrash +
            SessionFixtures.reopened(7L, SessionFixtures.T7) +
            SessionFixtures.reopened(8L, SessionFixtures.T7 + 1)
        val ex = assertThrows(JournalCorruptionException::class.java) { SessionReplay.replay(events) }
        assertTrue(ex.message!!.contains("exactly once"))
    }

    @Test
    fun `a reopened after further capture activity is a NEW interruption and is legal`() {
        val events = SessionFixtures.happyPathJournal().dropLast(1) +
            SessionFixtures.reopened(7L, SessionFixtures.T7) +
            SessionFixtures.assetCaptured(8, SessionFixtures.T7 + 100, SessionFixtures.asset("a-0003", SessionFixtures.bytePayload(3))) +
            SessionFixtures.reopened(9L, SessionFixtures.T7 + 200)
        val record = SessionReplay.replay(events)
        assertEquals(3, record.assets.size)
        assertEquals(2, record.reopenAudits.size)
    }

    @Test
    fun `a reopened event on a finalized session is rejected`() {
        val events = SessionFixtures.happyPathJournal() +
            SessionFixtures.reopened(8L, SessionFixtures.T7)
        assertThrows(JournalCorruptionException::class.java) { SessionReplay.replay(events) }
    }

    // ------------------------------------------------------------------
    // Corruption battery — every invariant violation fails closed
    // ------------------------------------------------------------------

    @Test
    fun `empty journal is rejected`() {
        assertThrows(IllegalArgumentException::class.java) { SessionReplay.replay(emptyList()) }
    }

    @Test
    fun `journal not starting with session dot created is rejected`() {
        val events = listOf(
            SessionFixtures.state(1, SessionFixtures.T0, CaptureSessionStatus.DRAFT, CaptureSessionStatus.CAPTURING),
        )
        assertThrows(JournalCorruptionException::class.java) { SessionReplay.replay(events) }
    }

    @Test
    fun `duplicate session dot created is rejected`() {
        val events = listOf(SessionFixtures.created(), SessionFixtures.created(sequence = 2))
        assertThrows(JournalCorruptionException::class.java) { SessionReplay.replay(events) }
    }

    @Test
    fun `sequence gaps are rejected`() {
        val events = listOf(
            SessionFixtures.created(),
            SessionFixtures.state(3, SessionFixtures.T1, CaptureSessionStatus.DRAFT, CaptureSessionStatus.CAPTURING), // gap: expected 2
        )
        assertThrows(JournalCorruptionException::class.java) { SessionReplay.replay(events) }
    }

    @Test
    fun `duplicate sequence numbers are rejected`() {
        val events = listOf(
            SessionFixtures.created(),
            SessionFixtures.state(2, SessionFixtures.T1, CaptureSessionStatus.DRAFT, CaptureSessionStatus.CAPTURING),
            SessionFixtures.state(2, SessionFixtures.T2, CaptureSessionStatus.CAPTURING, CaptureSessionStatus.PAUSED),
        )
        assertThrows(JournalCorruptionException::class.java) { SessionReplay.replay(events) }
    }

    @Test
    fun `transition source mismatch with current state is rejected`() {
        val events = listOf(
            SessionFixtures.created(),
            SessionFixtures.state(2, SessionFixtures.T1, CaptureSessionStatus.DRAFT, CaptureSessionStatus.CAPTURING),
            // PAUSED->CAPTURING is a legal matrix move, but the journal state is CAPTURING:
            // the fold must reject the source mismatch.
            SessionFixtures.state(3, SessionFixtures.T2, CaptureSessionStatus.PAUSED, CaptureSessionStatus.CAPTURING),
        )
        assertThrows(JournalCorruptionException::class.java) { SessionReplay.replay(events) }
    }

    @Test
    fun `asset captured while paused is rejected`() {
        val events = listOf(
            SessionFixtures.created(),
            SessionFixtures.state(2, SessionFixtures.T1, CaptureSessionStatus.DRAFT, CaptureSessionStatus.CAPTURING),
            SessionFixtures.state(3, SessionFixtures.T2, CaptureSessionStatus.CAPTURING, CaptureSessionStatus.PAUSED),
            SessionFixtures.assetCaptured(4, SessionFixtures.T3, SessionFixtures.asset("a-0001", SessionFixtures.bytePayload(1))),
        )
        assertThrows(JournalCorruptionException::class.java) { SessionReplay.replay(events) }
    }

    @Test
    fun `asset captured while draft is rejected`() {
        val events = listOf(
            SessionFixtures.created(),
            SessionFixtures.assetCaptured(2, SessionFixtures.T1, SessionFixtures.asset("a-0001", SessionFixtures.bytePayload(1))),
        )
        assertThrows(JournalCorruptionException::class.java) { SessionReplay.replay(events) }
    }

    @Test
    fun `duplicate asset ids are rejected`() {
        val asset = SessionFixtures.asset("a-0001", SessionFixtures.bytePayload(1))
        val events = listOf(
            SessionFixtures.created(),
            SessionFixtures.state(2, SessionFixtures.T1, CaptureSessionStatus.DRAFT, CaptureSessionStatus.CAPTURING),
            SessionFixtures.assetCaptured(3, SessionFixtures.T2, asset),
            SessionFixtures.assetCaptured(4, SessionFixtures.T3, asset),
        )
        assertThrows(JournalCorruptionException::class.java) { SessionReplay.replay(events) }
    }

    @Test
    fun `timestamp regression is rejected`() {
        val events = listOf(
            SessionFixtures.created(),
            SessionFixtures.state(2, SessionFixtures.T2, CaptureSessionStatus.DRAFT, CaptureSessionStatus.CAPTURING),
            SessionFixtures.state(3, SessionFixtures.T1, CaptureSessionStatus.CAPTURING, CaptureSessionStatus.PAUSED), // backwards
        )
        assertThrows(JournalCorruptionException::class.java) { SessionReplay.replay(events) }
    }

    @Test
    fun `asset corrupted for unknown asset is rejected`() {
        val events = SessionFixtures.happyPathJournal().dropLast(1) +
            AssetCorrupted(sequence = 7L, atUtcMillis = SessionFixtures.T7, assetId = "a-9999", reason = AssetCorruptionReason.FILE_MISSING)
        assertThrows(JournalCorruptionException::class.java) { SessionReplay.replay(events) }
    }

    @Test
    fun `asset corrupted twice is rejected`() {
        val events = SessionFixtures.happyPathJournal().dropLast(1) +
            AssetCorrupted(sequence = 7L, atUtcMillis = SessionFixtures.T7, assetId = "a-0001", reason = AssetCorruptionReason.FILE_MISSING) +
            AssetCorrupted(sequence = 8L, atUtcMillis = SessionFixtures.T7, assetId = "a-0001", reason = AssetCorruptionReason.CONTENT_ID_MISMATCH)
        assertThrows(JournalCorruptionException::class.java) { SessionReplay.replay(events) }
    }

    @Test
    fun `corrupted assets are flagged and excluded from the manifest asset list`() {
        val events = SessionFixtures.happyPathJournal().dropLast(1) +
            AssetCorrupted(sequence = 7L, atUtcMillis = SessionFixtures.T7, assetId = "a-0002", reason = AssetCorruptionReason.CONTENT_ID_MISMATCH) +
            SessionFixtures.state(8, SessionFixtures.T7 + 1, CaptureSessionStatus.CAPTURING, CaptureSessionStatus.FINALIZED)
        val record = SessionReplay.replay(events)
        assertEquals(listOf("a-0001"), record.manifestAssets.map { it.assetId })
        assertEquals(listOf("a-0002"), record.corruptedAssetIds)
        val corrupted = record.asset("a-0002")!!
        assertTrue(corrupted.corrupted)
        assertEquals(AssetCorruptionReason.CONTENT_ID_MISMATCH, corrupted.corruptionReason)
    }

    // ------------------------------------------------------------------
    // Wire codec round-trips
    // ------------------------------------------------------------------

    @Test
    fun `every event type round-trips through the journal-line codec`() {
        val audit = SessionRecoveryAudit(
            discardedTmp = listOf("tmp/x.tmp"),
            completedRenames = emptyList(),
            verifiedAssets = listOf("a-0001"),
            rehashedAssets = listOf("a-0002"),
            corruptedAssets = emptyList(),
        )
        val events: List<CaptureSessionEvent> = listOf(
            SessionFixtures.created(missionRef = SessionFixtures.MISSION_REF),
            SessionFixtures.state(2, SessionFixtures.T1, CaptureSessionStatus.DRAFT, CaptureSessionStatus.CAPTURING),
            SessionFixtures.assetCaptured(3, SessionFixtures.T2, SessionFixtures.asset("a-0001", SessionFixtures.bytePayload(1))),
            AssetCorrupted(sequence = 4, atUtcMillis = SessionFixtures.T3, assetId = "a-0001", reason = AssetCorruptionReason.FILE_MISSING),
            SessionFixtures.reopened(5, SessionFixtures.T4, audit),
        )
        // Note: the asset.corrupted at seq 4 while CAPTURING is legal only for interrupted sessions — it is here.
        for (event in events) {
            val line = event.toJournalLine()
            assertEquals(event, CaptureSessionEvent.parseLine(line), "round-trip failed for ${event.type}")
        }
    }

    @Test
    fun `journal lines are single-line compact json with sorted keys`() {
        val line = SessionFixtures.state(2, SessionFixtures.T1, CaptureSessionStatus.DRAFT, CaptureSessionStatus.CAPTURING).toJournalLine()
        assertTrue(!line.contains("\n"))
        assertEquals("""{"at":${SessionFixtures.T1},"from":"DRAFT","sequence":2,"to":"CAPTURING","type":"session.state"}""", line)
    }

    @Test
    fun `a full journal round-trips through lines`() {
        val journal = SessionFixtures.happyPathJournal()
        val lines = journal.joinToString("\n") { it.toJournalLine() }
        val reparsed = lines.split("\n").map { CaptureSessionEvent.parseLine(it) }
        assertEquals(journal, reparsed)
    }

    @Test
    fun `unknown journal event type is rejected`() {
        assertThrows(JournalCorruptionException::class.java) {
            CaptureSessionEvent.parseLine("""{"at":1,"sequence":1,"type":"session.exploded"}""")
        }
    }

    @Test
    fun `unknown journal version is rejected`() {
        val line = SessionFixtures.created().toJournalLine().replace("\"journalVersion\":1", "\"journalVersion\":2")
        val ex = assertThrows(JournalCorruptionException::class.java) { CaptureSessionEvent.parseLine(line) }
        assertTrue(ex.message!!.contains("journalVersion"))
    }

    @Test
    fun `missing and unknown fields are rejected`() {
        val line = SessionFixtures.created().toJournalLine()
        val missing = line.replace("\"sessionId\":\"${SessionFixtures.SESSION_ID}\",", "")
        assertThrows(JournalCorruptionException::class.java) { CaptureSessionEvent.parseLine(missing) }
        val unknown = line.dropLast(1) + ",\"extra\":1}"
        assertThrows(JournalCorruptionException::class.java) { CaptureSessionEvent.parseLine(unknown) }
    }

    @Test
    fun `non-json lines are wrapped as journal corruption`() {
        assertThrows(JournalCorruptionException::class.java) { CaptureSessionEvent.parseLine("not json at all") }
        assertThrows(JournalCorruptionException::class.java) { CaptureSessionEvent.parseLine("") }
    }
}
