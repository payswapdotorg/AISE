package org.payswap.aise.app.capture

import java.io.File
import java.nio.file.Files
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.io.CleanupMode
import org.junit.jupiter.api.io.TempDir
import org.junit.jupiter.api.Test
import org.payswap.aise.core.identity.ContentIdentity
import org.payswap.aise.core.session.AssetCorruptionReason
import org.payswap.aise.core.session.CaptureSessionStatus
import org.payswap.aise.core.session.SessionReplay

/**
 * Recovery tests (AISE-005 work order §5.4, "journal replay: mid-crash
 * journal → recovered session state exactly once"):
 *
 *  - interrupted sessions re-open EXACTLY ONCE (a second pass is a no-op);
 *  - uncommitted `.tmp` files are discarded;
 *  - journaled assets are re-verified cheaply (size + head sample);
 *  - head-sample failure triggers full re-hash (verified when content matches);
 *  - real corruption → `asset.corrupted` → excluded from manifest, recorded;
 *  - crash between journal commit and atomic rename → the tmp is ADOPTED
 *    (rename completed exactly-once);
 *  - finalized sessions get their manifest re-derived when missing;
 *  - eventless session dirs: noise removed / serious anomalies quarantined;
 *  - determinism: same crash fixtures + fixed clock → identical outcomes.
 */
class SessionRecoveryTest {

    @TempDir(cleanup = CleanupMode.ALWAYS)
    lateinit var root: File

    private val clock = MutableTestClock(CaptureRuntimeFixtures.T0)

    private lateinit var sessionsRoot: File
    private lateinit var dir: SessionDirectory
    private lateinit var journal: JsonlSessionJournal

    private fun setupSession(sessionId: String = "0b6f6e2a-9b3d-4a51-8b3e-2f0b8ac21d77") {
        sessionsRoot = File(root, "sessions")
        dir = SessionDirectory.forSession(sessionsRoot, sessionId)
        dir.ensureLayout()
        journal = JsonlSessionJournal(dir.journalFile)
        journal.append(
            org.payswap.aise.core.session.SessionCreated(
                sequence = 1L,
                atUtcMillis = clock.millis(),
                sessionId = sessionId,
                deviceIdentity = CaptureRuntimeFixtures.deviceIdentity(),
                capabilitySnapshot = CaptureRuntimeFixtures.capabilitySnapshot(clock.millis()),
                missionRef = null,
            ),
        )
        clock.advance(1_000)
        journal.append(
            org.payswap.aise.core.session.SessionStateChanged(
                2L, clock.millis(), CaptureSessionStatus.DRAFT, CaptureSessionStatus.CAPTURING,
            ),
        )
        clock.advance(1_000)
    }

    /** Writes a journaled asset COMPLETELY (hash, head, journal, rename) — the pre-crash state. */
    private fun commitAsset(assetId: String, payload: ByteArray): org.payswap.aise.core.session.CapturedAssetRecord {
        val metadata = mapOf(
            "session.id" to dir.sessionId,
            "device.id" to "device-field-007",
            "capture.kind" to "still",
        )
        val contentId = ContentIdentity.contentId(payload, metadata)
        val relativePath = dir.assetRelativePath(assetId, "image/jpeg")
        val asset = org.payswap.aise.core.session.CapturedAssetRecord(
            assetId = assetId,
            relativePath = relativePath,
            contentId = contentId,
            byteSize = payload.size.toLong(),
            headSampleSha256 = org.payswap.aise.core.identity.Digests.sha256HexOfHead(
                payload, org.payswap.aise.core.session.CapturedAssetRecord.HEAD_SAMPLE_BYTES,
            ),
            mediaType = "image/jpeg",
            capturedAtUtcMillis = clock.millis(),
            acquisitionMethod = org.payswap.aise.core.session.AcquisitionMethod.STILL_IMAGERY,
            sensorMetadata = org.payswap.aise.core.capture.AcquisitionMetadata(metadata),
        )
        journal.append(
            org.payswap.aise.core.session.AssetCaptured(journal.nextSequence(), clock.millis(), asset),
        )
        AtomicFiles.commitRename(writeTmp(assetId, payload), dir.assetFile(relativePath))
        clock.advance(1_000)
        return asset
    }

    private fun writeTmp(assetId: String, payload: ByteArray): File {
        val tmp = dir.tmpFile(assetId, "image/jpeg")
        tmp.parentFile?.mkdirs()
        tmp.writeBytes(payload)
        return tmp
    }

    // ------------------------------------------------------------------
    // Exactly-once re-open
    // ------------------------------------------------------------------

    @Test
    fun `an interrupted session is re-opened exactly once`() {
        setupSession()
        commitAsset("a-0001", CaptureRuntimeFixtures.payload(1))

        val recovery = SessionRecovery(clock)
        val first = recovery.recoverSession(dir)
        assertEquals(SessionRecovery.RecoveryAction.REOPENED, first.action)
        assertEquals(CaptureSessionStatus.CAPTURING, first.record!!.status)
        assertEquals(1, first.record!!.assets.size)

        // SECOND pass on the SAME journal tail (crash again before any activity): no-op.
        val second = recovery.recoverSession(dir)
        assertEquals(SessionRecovery.RecoveryAction.ALREADY_REOPENED, second.action)
        assertEquals(1, second.record!!.assets.size)

        // And a third: still exactly once.
        assertEquals(SessionRecovery.RecoveryAction.ALREADY_REOPENED, recovery.recoverSession(dir).action)

        // The journal holds exactly ONE reopened event for this interruption.
        val reopenedEvents = journal.read().events.filter { it is org.payswap.aise.core.session.SessionReopened }
        assertEquals(1, reopenedEvents.size)
    }

    @Test
    fun `a new interruption after resumed activity is re-opened again - exactly once per interruption`() {
        setupSession()
        commitAsset("a-0001", CaptureRuntimeFixtures.payload(1))
        val recovery = SessionRecovery(clock)
        recovery.recoverSession(dir) // reopened #1

        // Operator resumes and captures more:
        commitAsset("a-0002", CaptureRuntimeFixtures.payload(2))
        // Crash again:
        val second = recovery.recoverSession(dir)
        assertEquals(SessionRecovery.RecoveryAction.REOPENED, second.action)
        assertEquals(2, second.record!!.assets.size)
        assertEquals(2, journal.read().events.count { it is org.payswap.aise.core.session.SessionReopened })
    }

    @Test
    fun `an uncommitted tmp file is discarded and journaled in the audit`() {
        setupSession()
        commitAsset("a-0001", CaptureRuntimeFixtures.payload(1))
        writeTmp("a-0002", CaptureRuntimeFixtures.payload(2)) // in-flight still, never journaled

        val result = SessionRecovery(clock).recoverSession(dir)
        assertEquals(SessionRecovery.RecoveryAction.REOPENED, result.action)
        val audit = result.audit!!
        assertEquals(listOf("tmp/a-0002.jpg.tmp"), audit.discardedTmp)
        assertFalse(dir.tmpFile("a-0002", "image/jpeg").exists())
        // The journaled asset survived and verified:
        assertEquals(listOf("a-0001"), audit.verifiedAssets)
    }

    // ------------------------------------------------------------------
    // Asset verification ladder
    // ------------------------------------------------------------------

    @Test
    fun `an intact asset verifies via the cheap check - one small read, no rehash`() {
        setupSession()
        commitAsset("a-0001", CaptureRuntimeFixtures.payload(1))

        val result = SessionRecovery(clock).recoverSession(dir)
        assertEquals(listOf("a-0001"), result.audit!!.verifiedAssets)
        assertTrue(result.audit!!.rehashedAssets.isEmpty())
    }

    @Test
    fun `a head-sample mismatch with intact content is caught by the full re-hash`() {
        setupSession()
        val asset = commitAsset("a-0001", CaptureRuntimeFixtures.payload(1))
        // Corrupt ONLY the journaled head-sample (simulates index/metadata drift, file intact):
        val tampered = asset.copy(headSampleSha256 = "0".repeat(64))
        val events = journal.read().events.toMutableList()
        val idx = events.indexOfFirst { it is org.payswap.aise.core.session.AssetCaptured }
        val original = events[idx] as org.payswap.aise.core.session.AssetCaptured
        events[idx] = org.payswap.aise.core.session.AssetCaptured(original.sequence, original.atUtcMillis, tampered)
        rewriteJournal(events)

        val result = SessionRecovery(clock).recoverSession(dir)
        val audit = result.audit!!
        assertTrue(audit.verifiedAssets.isEmpty())
        assertEquals(listOf("a-0001"), audit.rehashedAssets) // full re-hash SAVED the asset
        assertTrue(audit.corruptedAssets.isEmpty())
    }

    @Test
    fun `a genuinely corrupted file is marked corrupted and excluded from the manifest`() {
        setupSession()
        val asset = commitAsset("a-0001", CaptureRuntimeFixtures.payload(1))
        // Tamper the payload file itself (content no longer matches the content id):
        dir.assetFile(asset.relativePath).writeBytes(CaptureRuntimeFixtures.payload(99))

        val result = SessionRecovery(clock).recoverSession(dir)
        val audit = result.audit!!
        assertEquals(emptyList<String>(), audit.verifiedAssets)
        assertEquals(listOf("a-0001"), audit.corruptedAssets)
        val record = result.record!!
        assertTrue(record.asset("a-0001")!!.corrupted)
        assertEquals(AssetCorruptionReason.CONTENT_ID_MISMATCH, record.asset("a-0001")!!.corruptionReason)

        // Fail closed: finalize and export — the corrupted asset must be absent from the manifest
        // and the loss must be recorded explicitly.
        journal.append(
            org.payswap.aise.core.session.SessionStateChanged(
                journal.nextSequence(), clock.millis(), CaptureSessionStatus.CAPTURING, CaptureSessionStatus.FINALIZED,
            ),
        )
        val finalized = SessionReplay.replay(journal.read().events)
        val finalManifest = org.payswap.aise.core.session.SessionManifestExporter.export(finalized)
        // The corrupted asset's CONTENT ID must be absent (it is not evidence anymore)…
        assertFalse(finalManifest.contains(asset.contentId.value))
        // …the asset list is empty…
        assertEquals(0, finalized.manifestAssets.size)
        // …and the loss is recorded explicitly in the recovery audit (by asset id):
        assertTrue(finalManifest.contains("\"corruptedAssets\""))
        assertTrue(finalManifest.contains("\"a-0001\""))
    }

    @Test
    fun `a missing asset file is FILE_MISSING corrupted`() {
        setupSession()
        val asset = commitAsset("a-0001", CaptureRuntimeFixtures.payload(1))
        assertTrue(dir.assetFile(asset.relativePath).delete())

        val result = SessionRecovery(clock).recoverSession(dir)
        assertEquals(listOf("a-0001"), result.audit!!.corruptedAssets)
        assertEquals(AssetCorruptionReason.FILE_MISSING, result.record!!.asset("a-0001")!!.corruptionReason)
    }

    @Test
    fun `a crash between journal commit and rename adopts the tmp exactly once`() {
        setupSession()
        // Commit the asset's JOURNAL line but DO NOT rename (crash mid-commit):
        val metadata = mapOf(
            "session.id" to dir.sessionId,
            "device.id" to "device-field-007",
            "capture.kind" to "still",
        )
        val payload = CaptureRuntimeFixtures.payload(7)
        val contentId = ContentIdentity.contentId(payload, metadata)
        val relativePath = dir.assetRelativePath("a-0001", "image/jpeg")
        val asset = org.payswap.aise.core.session.CapturedAssetRecord(
            assetId = "a-0001",
            relativePath = relativePath,
            contentId = contentId,
            byteSize = payload.size.toLong(),
            headSampleSha256 = org.payswap.aise.core.identity.Digests.sha256HexOfHead(
                payload, org.payswap.aise.core.session.CapturedAssetRecord.HEAD_SAMPLE_BYTES,
            ),
            mediaType = "image/jpeg",
            capturedAtUtcMillis = clock.millis(),
            acquisitionMethod = org.payswap.aise.core.session.AcquisitionMethod.STILL_IMAGERY,
            sensorMetadata = org.payswap.aise.core.capture.AcquisitionMetadata(metadata),
        )
        journal.append(org.payswap.aise.core.session.AssetCaptured(journal.nextSequence(), clock.millis(), asset))
        writeTmp("a-0001", payload) // tmp still present, journal already committed

        val result = SessionRecovery(clock).recoverSession(dir)
        val audit = result.audit!!
        // The tmp was NOT discarded — it was adopted (rename completed):
        assertEquals(listOf("a-0001"), audit.completedRenames)
        assertTrue(audit.discardedTmp.isEmpty())
        assertTrue(dir.assetFile(relativePath).isFile)
        assertFalse(dir.tmpFile("a-0001", "image/jpeg").exists())
        // Content identical:
        assertTrue(dir.assetFile(relativePath).readBytes().contentEquals(payload))
    }

    @Test
    fun `a tmp for a journaled asset that fails verification is not adopted`() {
        setupSession()
        val metadata = mapOf("session.id" to dir.sessionId, "device.id" to "device-field-007")
        val payload = CaptureRuntimeFixtures.payload(7)
        val contentId = ContentIdentity.contentId(payload, metadata)
        val relativePath = dir.assetRelativePath("a-0001", "image/jpeg")
        val asset = org.payswap.aise.core.session.CapturedAssetRecord(
            assetId = "a-0001",
            relativePath = relativePath,
            contentId = contentId,
            byteSize = payload.size.toLong(),
            headSampleSha256 = org.payswap.aise.core.identity.Digests.sha256HexOfHead(
                payload, org.payswap.aise.core.session.CapturedAssetRecord.HEAD_SAMPLE_BYTES,
            ),
            mediaType = "image/jpeg",
            capturedAtUtcMillis = clock.millis(),
            acquisitionMethod = org.payswap.aise.core.session.AcquisitionMethod.STILL_IMAGERY,
            sensorMetadata = org.payswap.aise.core.capture.AcquisitionMetadata(metadata),
        )
        journal.append(org.payswap.aise.core.session.AssetCaptured(journal.nextSequence(), clock.millis(), asset))
        writeTmp("a-0001", CaptureRuntimeFixtures.payload(8)) // WRONG content in tmp

        val result = SessionRecovery(clock).recoverSession(dir)
        val audit = result.audit!!
        assertTrue(audit.completedRenames.isEmpty())
        assertEquals(listOf("a-0001"), audit.corruptedAssets)
        assertFalse(dir.assetFile(relativePath).exists())
        assertFalse(dir.tmpFile("a-0001", "image/jpeg").exists()) // deleted as junk (failed verification)
        assertTrue(dir.tmpFiles().isEmpty())
    }

    // ------------------------------------------------------------------
    // Closed sessions & eventless dirs
    // ------------------------------------------------------------------

    @Test
    fun `a finalized session with a missing manifest gets it re-derived deterministically`() {
        setupSession()
        commitAsset("a-0001", CaptureRuntimeFixtures.payload(1))
        journal.append(
            org.payswap.aise.core.session.SessionStateChanged(
                journal.nextSequence(), clock.millis(), CaptureSessionStatus.CAPTURING, CaptureSessionStatus.FINALIZED,
            ),
        )
        val expected = org.payswap.aise.core.session.SessionManifestExporter.export(
            SessionReplay.replay(journal.read().events),
        )
        // Manifest missing (crash between finalize and manifest write):
        assertFalse(dir.manifestFile.isFile)

        val result = SessionRecovery(clock).recoverSession(dir)
        assertEquals(SessionRecovery.RecoveryAction.VERIFIED_CLOSED, result.action)
        assertEquals(expected, dir.manifestFile.readText(Charsets.UTF_8))
    }

    @Test
    fun `a stale manifest is rewritten to the journal-derived truth`() {
        setupSession()
        commitAsset("a-0001", CaptureRuntimeFixtures.payload(1))
        journal.append(
            org.payswap.aise.core.session.SessionStateChanged(
                journal.nextSequence(), clock.millis(), CaptureSessionStatus.CAPTURING, CaptureSessionStatus.FINALIZED,
            ),
        )
        val expected = org.payswap.aise.core.session.SessionManifestExporter.export(
            SessionReplay.replay(journal.read().events),
        )
        dir.manifestFile.writeText("{\"tampered\":true}\n")

        SessionRecovery(clock).recoverSession(dir)
        assertEquals(expected, dir.manifestFile.readText(Charsets.UTF_8))
    }

    @Test
    fun `an eventless session dir with only tmp noise is removed`() {
        sessionsRoot = File(root, "sessions")
        dir = SessionDirectory.forSession(sessionsRoot, "0b6f6e2a-9b3d-4a51-8b3e-2f0b8ac21d77")
        dir.ensureLayout()
        writeTmp("a-0001", CaptureRuntimeFixtures.payload(1))

        val result = SessionRecovery(clock).recoverSession(dir)
        assertEquals(SessionRecovery.RecoveryAction.ABORTED_SESSION_REMOVED, result.action)
        assertFalse(dir.root.exists())
    }

    @Test
    fun `an eventless session dir with finalized files is quarantined - nothing destroyed`() {
        sessionsRoot = File(root, "sessions")
        dir = SessionDirectory.forSession(sessionsRoot, "0b6f6e2a-9b3d-4a51-8b3e-2f0b8ac21d77")
        dir.ensureLayout()
        val assetFile = dir.assetFile(dir.assetRelativePath("a-0001", "image/jpeg"))
        assetFile.writeBytes(CaptureRuntimeFixtures.payload(1))

        val result = SessionRecovery(clock).recoverSession(dir)
        assertEquals(SessionRecovery.RecoveryAction.ANOMALY_EVENTLESS_WITH_FILES, result.action)
        assertTrue(assetFile.isFile) // untouched
        assertNull(result.record)
    }

    @Test
    fun `a corrupt journal is reported and left untouched - fail closed`() {
        setupSession()
        // A COMPLETE garbage line (with newline) anywhere is hard corruption — not a torn tail:
        val lines = journal.read().events.map { it.toJournalLine() }.toMutableList()
        lines[1] = "garbage not json"
        dir.journalFile.writeText(lines.joinToString("\n", postfix = "\n"))

        val result = SessionRecovery(clock).recoverSession(dir)
        assertEquals(SessionRecovery.RecoveryAction.CORRUPTED_JOURNAL, result.action)
        assertNull(result.record)
        // Left untouched (byte-identical):
        assertEquals(lines.joinToString("\n", postfix = "\n"), dir.journalFile.readText(Charsets.UTF_8))
    }

    // ------------------------------------------------------------------
    // Determinism
    // ------------------------------------------------------------------

    @Test
    fun `recovery is deterministic - identical fixtures and clock produce identical journals`() {
        // Two identical crash fixtures:
        val outputs = (1..2).map { index ->
            val subRoot = File(root, "run$index")
            val sessions = File(subRoot, "sessions")
            val sessionDir = SessionDirectory.forSession(sessions, "0b6f6e2a-9b3d-4a51-8b3e-2f0b8ac21d77")
            sessionDir.ensureLayout()
            val j = JsonlSessionJournal(sessionDir.journalFile)
            j.append(
                org.payswap.aise.core.session.SessionCreated(
                    sequence = 1L,
                    atUtcMillis = CaptureRuntimeFixtures.T0,
                    sessionId = "0b6f6e2a-9b3d-4a51-8b3e-2f0b8ac21d77",
                    deviceIdentity = CaptureRuntimeFixtures.deviceIdentity(),
                    capabilitySnapshot = CaptureRuntimeFixtures.capabilitySnapshot(CaptureRuntimeFixtures.T0),
                    missionRef = null,
                ),
            )
            j.append(
                org.payswap.aise.core.session.SessionStateChanged(
                    2L, CaptureRuntimeFixtures.T0 + 1, CaptureSessionStatus.DRAFT, CaptureSessionStatus.CAPTURING,
                ),
            )
            val payload = CaptureRuntimeFixtures.payload(1)
            val metadata = mapOf("session.id" to "0b6f6e2a-9b3d-4a51-8b3e-2f0b8ac21d77", "device.id" to "device-field-007")
            val contentId = ContentIdentity.contentId(payload, metadata)
            val asset = org.payswap.aise.core.session.CapturedAssetRecord(
                assetId = "a-0001",
                relativePath = sessionDir.assetRelativePath("a-0001", "image/jpeg"),
                contentId = contentId,
                byteSize = payload.size.toLong(),
                headSampleSha256 = org.payswap.aise.core.identity.Digests.sha256HexOfHead(
                    payload, org.payswap.aise.core.session.CapturedAssetRecord.HEAD_SAMPLE_BYTES,
                ),
                mediaType = "image/jpeg",
                capturedAtUtcMillis = CaptureRuntimeFixtures.T0 + 2,
                acquisitionMethod = org.payswap.aise.core.session.AcquisitionMethod.STILL_IMAGERY,
                sensorMetadata = org.payswap.aise.core.capture.AcquisitionMetadata(metadata),
            )
            j.append(org.payswap.aise.core.session.AssetCaptured(3L, CaptureRuntimeFixtures.T0 + 2, asset))
            AtomicFiles.commitRename(
                sessionDir.tmpFile("a-0001", "image/jpeg").apply { parentFile?.mkdirs(); writeBytes(payload) },
                sessionDir.assetFile(asset.relativePath),
            )
            sessionDir.tmpFile("a-0002", "image/jpeg").apply { parentFile?.mkdirs(); writeBytes(CaptureRuntimeFixtures.payload(2)) }

            // SAME fixed clock for both recoveries:
            val fixedClock = MutableTestClock(CaptureRuntimeFixtures.T0 + 100_000)
            val result = SessionRecovery(fixedClock).recoverSession(sessionDir)
            Triple(result.action, result.audit, sessionDir.journalFile.readText(Charsets.UTF_8))
        }
        assertEquals(outputs[0], outputs[1])
        assertEquals(SessionRecovery.RecoveryAction.REOPENED, outputs[0].first)
    }

    // ------------------------------------------------------------------

    private fun rewriteJournal(events: List<org.payswap.aise.core.session.CaptureSessionEvent>) {
        dir.journalFile.writeText(events.joinToString("\n", postfix = "\n") { it.toJournalLine() })
    }
}
