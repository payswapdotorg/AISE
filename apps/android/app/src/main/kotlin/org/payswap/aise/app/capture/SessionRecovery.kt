package org.payswap.aise.app.capture

import java.io.File
import java.io.IOException
import java.time.Clock
import org.payswap.aise.core.identity.Digests
import org.payswap.aise.core.identity.StreamingContentHasher
import org.payswap.aise.core.session.AssetCorruptionReason
import org.payswap.aise.core.session.AssetCorrupted
import org.payswap.aise.core.session.CapturedAssetRecord
import org.payswap.aise.core.session.CaptureSessionEvent
import org.payswap.aise.core.session.CaptureSessionRecord
import org.payswap.aise.core.session.JournalCorruptionException
import org.payswap.aise.core.session.SessionManifestExporter
import org.payswap.aise.core.session.SessionRecoveryAudit
import org.payswap.aise.core.session.SessionReplay
import org.payswap.aise.core.session.SessionReopened

/**
 * Crash recovery (AISE-005 work order §5.2):
 *
 * > "on process restart, an interrupted session (journal tail without
 * > `finalized`) is re-opened exactly once; partially written `.tmp` files
 * > are discarded; asset identity re-verified by hash where cheap
 * > (size + head sample) — full re-hash only for unverified assets."
 *
 * ## Exactly-once re-open protocol
 *
 * Recovery appends a `session.reopened` event to the journal, and the
 * session is treated as interrupted ONLY when the journal's last event is
 * not already a reopen. So:
 *
 *  - crash → recover (append reopened #1) → crash again before any activity
 *    → second recovery sees the reopen tail and DOES NOT re-open (exactly
 *    once per interruption);
 *  - crash → recover → operator captures/pauses/finalizes (journal tail
 *    moves past the reopen) → crash → next recovery re-opens again — a NEW
 *    interruption, again exactly once.
 *
 * ## Asset integrity ladder (cheap → full → corrupted)
 *
 * For every journaled asset:
 *  1. file present + size matches + sha256(first 64 KiB) matches the
 *     journaled head sample → VERIFIED (one small read);
 *  2. cheap check failed (or the final file is missing but its `.tmp`
 *     exists — a crash between journal commit and atomic rename) →
 *     full re-derivation of the content id over (file bytes, journaled
 *     metadata); match → VERIFIED (via rehash), or for a `.tmp` the rename
 *     is COMPLETED (exactly-once adoption of the interrupted commit);
 *  3. everything failed → `asset.corrupted` appended (FILE_MISSING or
 *     CONTENT_ID_MISMATCH) — the asset is excluded from the manifest and
 *     the loss is recorded explicitly, never silently.
 *
 * `.tmp` files with NO journal entry were never committed evidence —
 * discarded (recorded in the reopened audit).
 *
 * Finalized sessions: the manifest file is re-derived if missing or stale
 * (deterministic function of the journal — self-healing artifact).
 *
 * An eventless journal (crash between dir creation and the first append) is
 * an aborted session creation: if only tmp/noise files are present the whole
 * directory is removed; any FINALIZED-NAME file present is a serious anomaly
 * (journal lost) — reported and left untouched for human inspection
 * (fail closed, no silent data destruction).
 *
 * Determinism: given (session dirs, journal bytes, injected [clock]),
 * recovery output — journal mutations and the report — is a pure function
 * (pinned by tests).
 */
class SessionRecovery(private val clock: Clock) {

    /** Per-session outcome of a recovery pass. */
    data class SessionRecoveryResult(
        val sessionId: String,
        val action: RecoveryAction,
        val record: CaptureSessionRecord?,
        val audit: SessionRecoveryAudit?,
    )

    enum class RecoveryAction {
        /** Interrupted session re-opened (reopened event appended). */
        REOPENED,

        /** Open session whose tail was already a reopen — nothing done (exactly once). */
        ALREADY_REOPENED,

        /** Finalized/synced session checked; manifest re-derived when missing/stale. */
        VERIFIED_CLOSED,

        /** Aborted session creation (eventless journal, only tmp noise) — directory removed. */
        ABORTED_SESSION_REMOVED,

        /** Eventless journal but non-tmp files present — left untouched, reported (fail closed). */
        ANOMALY_EVENTLESS_WITH_FILES,

        /** Hard journal corruption — left untouched, reported (fail closed). */
        CORRUPTED_JOURNAL,
    }

    data class Report(val results: List<SessionRecoveryResult>) {
        val reopened: List<SessionRecoveryResult> get() = results.filter { it.action == RecoveryAction.REOPENED }
    }

    fun recoverAll(sessionsRoot: File): Report {
        val results = SessionDirectory.scan(sessionsRoot).map { dir -> recoverSession(dir) }
        return Report(results)
    }

    fun recoverSession(dir: SessionDirectory): SessionRecoveryResult {
        val read = try {
            JsonlSessionJournal(dir.journalFile).read()
        } catch (e: JournalCorruptionException) {
            return SessionRecoveryResult(
                dir.sessionId, RecoveryAction.CORRUPTED_JOURNAL, record = null, audit = null,
            ).also { warn("session ${dir.sessionId}: corrupt journal — ${e.message}") }
        }

        if (read.events.isEmpty()) {
            return handleEventlessSession(dir)
        }

        val record = SessionReplay.replay(read.events)
        val lastEvent = read.events.last()

        return when {
            record.isOpen && lastEvent is SessionReopened ->
                // Exactly-once: this interruption was already re-opened; nothing to do.
                SessionRecoveryResult(dir.sessionId, RecoveryAction.ALREADY_REOPENED, record, lastEvent.recovery)

            record.isOpen -> reopenInterruptedSession(dir, read.events, record)

            else -> {
                // Closed session: ensure the manifest artifact matches the journal-derived truth.
                ensureManifest(dir, record)
                SessionRecoveryResult(dir.sessionId, RecoveryAction.VERIFIED_CLOSED, record, null)
            }
        }
    }

    // ------------------------------------------------------------------
    // Interrupted-session recovery
    // ------------------------------------------------------------------

    private fun reopenInterruptedSession(
        dir: SessionDirectory,
        events: List<CaptureSessionEvent>,
        record: CaptureSessionRecord,
    ): SessionRecoveryResult {
        val journal = JsonlSessionJournal(dir.journalFile)
        var nextSequence = (events.last().sequence) + 1L

        val discardedTmp = mutableListOf<String>()
        val completedRenames = mutableListOf<String>()
        val verified = mutableListOf<String>()
        val rehashed = mutableListOf<String>()
        val corrupted = mutableListOf<String>()

        // 1. Asset verification ladder (journaled assets only).
        for (asset in record.assets) {
            if (asset.corrupted) continue // already an explicit integrity fact
            when (verifyAsset(dir, asset)) {
                AssetVerification.VERIFIED -> verified.add(asset.assetId)
                AssetVerification.VERIFIED_BY_REHASH -> rehashed.add(asset.assetId)
                AssetVerification.ADOPT_PENDING_RENAME -> {
                    completeRename(dir, asset)
                    completedRenames.add(asset.assetId)
                    verified.add(asset.assetId)
                }
                AssetVerification.FILE_MISSING -> {
                    journal.append(AssetCorrupted(nextSequence++, now(), asset.assetId, AssetCorruptionReason.FILE_MISSING))
                    corrupted.add(asset.assetId)
                }
                AssetVerification.CONTENT_ID_MISMATCH -> {
                    journal.append(
                        AssetCorrupted(nextSequence++, now(), asset.assetId, AssetCorruptionReason.CONTENT_ID_MISMATCH),
                    )
                    corrupted.add(asset.assetId)
                }
            }
        }

        // 2. Discard uncommitted tmp files (no journal entry ⇒ never evidence).
        //    Tmp files whose adoption was just handled are gone (renamed).
        for (tmp in dir.tmpFiles()) {
            if (tmp.delete()) {
                discardedTmp.add(relativeTmpName(dir, tmp))
            }
        }

        // 3. The exactly-once reopen marker (with the audit of everything above).
        val audit = SessionRecoveryAudit(
            discardedTmp = discardedTmp.distinct().sorted(),
            completedRenames = completedRenames.distinct().sorted(),
            verifiedAssets = verified.distinct().sorted(),
            rehashedAssets = rehashed.distinct().sorted(),
            corruptedAssets = corrupted.distinct().sorted(),
        )
        journal.append(SessionReopened(sequence = nextSequence, atUtcMillis = now(), recovery = audit))

        // 4. Clean up an empty tmp dir (keeps the layout tidy; not load-bearing).
        dir.tmpDir.delete()

        val updated = SessionReplay.replay(journal.read().events)
        return SessionRecoveryResult(dir.sessionId, RecoveryAction.REOPENED, updated, audit)
    }

    private enum class AssetVerification {
        VERIFIED,
        VERIFIED_BY_REHASH,
        ADOPT_PENDING_RENAME,
        FILE_MISSING,
        CONTENT_ID_MISMATCH,
    }

    private fun verifyAsset(dir: SessionDirectory, asset: CapturedAssetRecord): AssetVerification {
        val finalFile = dir.assetFile(asset.relativePath)
        val tmpCandidate = File(dir.tmpDir, "${asset.assetId}.${extensionOf(asset.relativePath)}.tmp")

        val target: File = when {
            finalFile.isFile -> finalFile
            tmpCandidate.isFile -> tmpCandidate // interrupted commit — verify the tmp, maybe adopt
            else -> return AssetVerification.FILE_MISSING
        }

        // Cheap check: size + head sample.
        if (target.length() == asset.byteSize && headSampleMatches(target, asset)) {
            return if (target === finalFile) {
                AssetVerification.VERIFIED
            } else {
                AssetVerification.ADOPT_PENDING_RENAME // tmp content is intact; complete the rename
            }
        }

        // Full re-hash: re-derive the content id over (file bytes, journaled metadata).
        val derived = deriveContentId(target, asset)
        return if (derived == asset.contentId.value) {
            if (target === finalFile) {
                AssetVerification.VERIFIED_BY_REHASH
            } else {
                AssetVerification.ADOPT_PENDING_RENAME
            }
        } else {
            // A tmp that cannot be verified is NOT adopted; it is discarded as junk
            // (handled by the tmp sweep below) and the asset is corrupted.
            if (target !== finalFile) target.delete()
            AssetVerification.CONTENT_ID_MISMATCH
        }
    }

    private fun completeRename(dir: SessionDirectory, asset: CapturedAssetRecord) {
        val tmp = File(dir.tmpDir, "${asset.assetId}.${extensionOf(asset.relativePath)}.tmp")
        val target = dir.assetFile(asset.relativePath)
        AtomicFiles.commitRename(tmp, target)
    }

    private fun headSampleMatches(file: File, asset: CapturedAssetRecord): Boolean {
        val sampleLength = minOf(CapturedAssetRecord.HEAD_SAMPLE_BYTES.toLong(), asset.byteSize).toInt()
        val head = ByteArray(sampleLength)
        file.inputStream().use { input ->
            var offset = 0
            while (offset < sampleLength) {
                val read = input.read(head, offset, sampleLength - offset)
                if (read < 0) return false // shorter than the recorded size
                offset += read
            }
        }
        return Digests.sha256Hex(head) == asset.headSampleSha256
    }

    /** Full content-id re-derivation: AISE-CONTENT-V1 over (file bytes, journaled metadata), streamed. */
    private fun deriveContentId(file: File, asset: CapturedAssetRecord): String {
        val hasher = StreamingContentHasher.begin(file.length())
        val buffer = ByteArray(StreamingContentHasher.STREAM_CHUNK_BYTES)
        file.inputStream().use { input ->
            while (true) {
                val read = input.read(buffer)
                if (read < 0) break
                if (read > 0) hasher.updatePayloadChunk(buffer, 0, read)
            }
        }
        return hasher.contentId(asset.sensorMetadata).value
    }

    // ------------------------------------------------------------------
    // Closed sessions & eventless sessions
    // ------------------------------------------------------------------

    private fun ensureManifest(dir: SessionDirectory, record: CaptureSessionRecord) {
        val manifest = SessionManifestExporter.export(record)
        if (!dir.manifestFile.isFile || dir.manifestFile.readText(Charsets.UTF_8) != manifest) {
            AtomicFiles.atomicWrite(dir.manifestFile, manifest.toByteArray(Charsets.UTF_8))
        }
    }

    private fun handleEventlessSession(dir: SessionDirectory): SessionRecoveryResult {
        val hasFinalFiles = dir.assetFiles().isNotEmpty() || dir.manifestFile.isFile
        return if (hasFinalFiles) {
            // Journal lost but finalized artifacts exist — DO NOT destroy anything. Report.
            SessionRecoveryResult(
                dir.sessionId, RecoveryAction.ANOMALY_EVENTLESS_WITH_FILES, record = null, audit = null,
            ).also { warn("session ${dir.sessionId}: eventless journal with finalized files — quarantined for inspection") }
        } else {
            // Aborted session creation: the directory never became a session.
            dir.tmpFiles().forEach { it.delete() }
            dir.tmpDir.delete()
            dir.assetsDir.delete()
            val removed = dir.root.delete()
            SessionRecoveryResult(
                dir.sessionId, RecoveryAction.ABORTED_SESSION_REMOVED, record = null, audit = null,
            ).also { info("session ${dir.sessionId}: aborted session creation removed=$removed") }
        }
    }

    // ------------------------------------------------------------------

    private fun now(): Long = clock.millis()

    private fun relativeTmpName(dir: SessionDirectory, tmp: File): String =
        "${SessionDirectory.TMP_DIR}/${tmp.name}"

    private fun extensionOf(relativePath: String): String = relativePath.substringAfterLast('.', "bin")

    private fun warn(message: String) { println("[SessionRecovery] WARN $message") }

    private fun info(message: String) { println("[SessionRecovery] INFO $message") }
}
