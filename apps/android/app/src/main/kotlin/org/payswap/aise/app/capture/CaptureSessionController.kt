package org.payswap.aise.app.capture

import java.io.File
import java.io.IOException
import java.time.Clock
import kotlin.coroutines.coroutineContext
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import org.payswap.aise.core.capture.LocalCaptureStore
import org.payswap.aise.core.capture.LocalStoreEntry
import org.payswap.aise.core.identity.Digests
import org.payswap.aise.core.identity.StreamingContentHasher
import org.payswap.aise.core.session.AcquisitionMethod
import org.payswap.aise.core.session.CapturedAssetRecord
import org.payswap.aise.core.session.CaptureSessionEvent
import org.payswap.aise.core.session.CaptureSessionRecord
import org.payswap.aise.core.session.CaptureSessionStatus
import org.payswap.aise.core.session.CapabilitySnapshot
import org.payswap.aise.core.session.SessionDeviceIdentity
import org.payswap.aise.core.session.SessionManifestExporter
import org.payswap.aise.core.session.SessionStateChanged

/**
 * THE capture-session runtime (AISE-005 §5.2) — a plain controller, NOT a
 * foreground service. Decision & rationale: CameraX use cases are
 * lifecycle-aware and bound to the Activity/Compose lifecycle, which keeps
 * 005's runtime a JVM-testable coordinator plus thin Android glue; a
 * foreground service is an operational/policy concern for long-running
 * mission execution (AISE-009) and offline hardening (AISE-030) to own.
 * Documented in apps/android/README.md.
 *
 * ## Architecture
 *
 *  - The JOURNAL is the truth ([JsonlSessionJournal] — append-only, fsynced);
 *    the [StateFlow] UI state and the manifest file are DERIVED state,
 *    re-derived by replay. Nothing here keeps a parallel authoritative model.
 *  - Still images are hashed WHILE being written (single pass: every chunk
 *    written also feeds the digest); video segments are hashed by ONE
 *    sequential chunked read after the recorder closes the file — never a
 *    whole-file in-memory copy.
 *  - Asset commit protocol: write `tmp/<assetId>.<ext>.tmp` → journal
 *    `asset.captured` (fsync — the commit point) → atomic rename → (stills)
 *    append to the [LocalCaptureStore]. A crash between journal and rename
 *    is healed by recovery (tmp adoption, exactly-once).
 *  - Recovery runs at startup via [recoverOnStartup]; [openSessionRecord]
 *    exposes the single open session (one active session per device).
 *
 * The controller never judges capture quality: no scoring, no "good enough"
 * logic — capture produces evidence; assurance is server-side
 * (spec/architecture-lock.md).
 */
class CaptureSessionController(
    private val sessionsRoot: File,
    private val store: LocalCaptureStore,
    private val clock: Clock,
    private val sessionIds: () -> String,
    /** Injectable for tests (synchronous dispatcher); Dispatchers.IO in production. */
    private val ioDispatcher: CoroutineDispatcher = Dispatchers.IO,
) {

    private val mutex = Mutex()

    private val _activeSession = MutableStateFlow<CaptureSessionRecord?>(null)
    /** Derived UI state: the open session's folded record (null when none). */
    val activeSession: StateFlow<CaptureSessionRecord?> = _activeSession.asStateFlow()

    // ------------------------------------------------------------------
    // Startup
    // ------------------------------------------------------------------

    /** Runs crash recovery over ALL sessions; publishes the open session. Returns the report. */
    suspend fun recoverOnStartup(): SessionRecovery.Report = withIo {
        mutex.withLock {
            val report = SessionRecovery(clock).recoverAll(sessionsRoot)
            _activeSession.value = openRecord()
            report
        }
    }

    /** The single open (non-finalized) session, re-derived from the journal — null when none. */
    suspend fun openSessionRecord(): CaptureSessionRecord? = withIo {
        mutex.withLock { openRecord() }
    }

    private fun openRecord(): CaptureSessionRecord? =
        SessionDirectory.scan(sessionsRoot)
            .mapNotNull { dir ->
                val read = JsonlSessionJournal(dir.journalFile).read()
                if (read.events.isEmpty()) return@mapNotNull null
                runCatching { SessionReplaySession(read.events) }.getOrNull()
            }
            .firstOrNull { it.isOpen }

    // ------------------------------------------------------------------
    // Session lifecycle
    // ------------------------------------------------------------------

    /**
     * Creates a session (DRAFT) and immediately begins capture (CAPTURING).
     * Refuses when another open session exists — one active session per
     * device; resume or finalize it first.
     */
    suspend fun startSession(
        deviceIdentity: SessionDeviceIdentity,
        capabilitySnapshot: CapabilitySnapshot,
        missionRef: String? = null,
    ): CaptureSessionRecord = withIo {
        mutex.withLock {
            if (openRecord() != null) {
                throw IllegalStateException("an open capture session already exists — resume or finalize it first")
            }
            val sessionId = sessionIds()
            val dir = SessionDirectory.forSession(sessionsRoot, sessionId)
            dir.ensureLayout()
            val journal = JsonlSessionJournal(dir.journalFile)
            journal.append(
                org.payswap.aise.core.session.SessionCreated(
                    sequence = 1L,
                    atUtcMillis = clock.millis(),
                    sessionId = sessionId,
                    deviceIdentity = deviceIdentity,
                    capabilitySnapshot = capabilitySnapshot,
                    missionRef = missionRef,
                ),
            )
            journal.append(SessionStateChanged(2L, clock.millis(), CaptureSessionStatus.DRAFT, CaptureSessionStatus.CAPTURING))
            val record = SessionReplaySession(journal.read().events)
            _activeSession.value = record
            record
        }
    }

    /**
     * Convenience: begins a session with the honest AISE-005 baseline
     * capability snapshot (camera exercised by the capture runtime, IMU when
     * [imuActive], every other domain UNKNOWN — "not yet determined", never
     * conflated with unavailable). AISE-006's adapters will replace the
     * baseline with real structured facts.
     */
    suspend fun startSession(
        deviceIdentity: SessionDeviceIdentity,
        imuActive: Boolean,
        missionRef: String? = null,
    ): CaptureSessionRecord = startSession(
        deviceIdentity = deviceIdentity,
        capabilitySnapshot = CapabilitySnapshot.baseline(
            profileId = "cap-" + sessionIds(),
            capturedAtUtcMillis = clock.millis(),
            deviceIdentity = deviceIdentity,
            imuActive = imuActive,
        ),
        missionRef = missionRef,
    )

    suspend fun pause(): CaptureSessionRecord = transition(CaptureSessionStatus.CAPTURING, CaptureSessionStatus.PAUSED)

    suspend fun resume(): CaptureSessionRecord = transition(CaptureSessionStatus.PAUSED, CaptureSessionStatus.CAPTURING)

    /**
     * Finalizes the open session and writes the offline manifest (atomic,
     * deterministic derivation of the journal). Returns the manifest file.
     * Also refuses while a video writer is open (stop the recording first).
     */
    suspend fun finalizeSession(): File = withIo {
        mutex.withLock {
            val record = requireOpenSession()
            check(videoWriter == null) { "cannot finalize while a video segment is open — stop recording first" }
            when (record.status) {
                CaptureSessionStatus.CAPTURING, CaptureSessionStatus.PAUSED, CaptureSessionStatus.DRAFT -> Unit
                else -> throw IllegalStateException("session is ${record.status.name}, cannot finalize")
            }
            val journal = journalOf(record)
            journal.append(
                SessionStateChanged(journal.nextSequence(), clock.millis(), record.status, CaptureSessionStatus.FINALIZED),
            )
            val finalized = SessionReplaySession(journal.read().events)
            val manifestFile = SessionDirectory.forSession(sessionsRoot, finalized.sessionId).manifestFile
            AtomicFiles.atomicWrite(manifestFile, SessionManifestExporter.export(finalized).toByteArray(Charsets.UTF_8))
            _activeSession.value = null
            manifestFile
        }
    }

    private suspend fun transition(from: CaptureSessionStatus, to: CaptureSessionStatus): CaptureSessionRecord = withIo {
        mutex.withLock {
            val record = requireOpenSession()
            if (record.status != from) {
                throw IllegalStateException("session is ${record.status.name}, expected $from for the $to transition")
            }
            if (to == CaptureSessionStatus.PAUSED && videoWriter != null) {
                throw IllegalStateException("cannot pause while a video segment is open — stop recording first")
            }
            val journal = journalOf(record)
            journal.append(SessionStateChanged(journal.nextSequence(), clock.millis(), from, to))
            val updated = SessionReplaySession(journal.read().events)
            _activeSession.value = updated
            updated
        }
    }

    // ------------------------------------------------------------------
    // Assets
    // ------------------------------------------------------------------

    /**
     * Ingests a still image: bytes are written to the session's tmp file
     * WHILE feeding the streaming digest (single pass), then the asset is
     * journaled (commit point) and atomically renamed, then appended to the
     * [LocalCaptureStore] (small payloads only — see the store's docs).
     */
    suspend fun captureStill(
        jpegBytes: ByteArray,
        sensorMetadata: Map<String, String>,
    ): CapturedAssetRecord = withIo {
        mutex.withLock {
            val record = requireCapturing()
            val dir = dirOf(record)
            val journal = journalOf(record)
            val assetId = nextAssetId(record)
            val relativePath = dir.assetRelativePath(assetId, "image/jpeg")
            val tmp = dir.tmpFile(assetId, "image/jpeg")
            tmp.parentFile?.mkdirs() // recovery may have cleaned the tmp dir; recreate before writing

            // Single pass: hash while writing.
            val hasher = StreamingContentHasher.begin(jpegBytes.size.toLong())
            java.io.RandomAccessFile(tmp, "rw").use { raf ->
                hasher.updatePayloadChunk(jpegBytes)
                raf.setLength(0)
                raf.write(jpegBytes)
                raf.channel.force(true)
            }
            val metadata = baseMetadata(record) + sensorMetadata
            val contentId = hasher.contentId(metadata)

            val asset = CapturedAssetRecord(
                assetId = assetId,
                relativePath = relativePath,
                contentId = contentId,
                byteSize = jpegBytes.size.toLong(),
                headSampleSha256 = Digests.sha256HexOfHead(jpegBytes, CapturedAssetRecord.HEAD_SAMPLE_BYTES),
                mediaType = "image/jpeg",
                capturedAtUtcMillis = clock.millis(),
                acquisitionMethod = AcquisitionMethod.STILL_IMAGERY,
                sensorMetadata = org.payswap.aise.core.capture.AcquisitionMetadata(metadata),
            )

            // Commit: journal FIRST (truth), then the atomic rename.
            journal.append(AssetCapturedEvent(journal.nextSequence(), clock.millis(), asset))
            AtomicFiles.commitRename(tmp, dir.assetFile(relativePath))

            // Store ledger (stills are small enough for the ByteArray-based 002 interface).
            store.append(
                LocalStoreEntry.create(
                    payload = jpegBytes,
                    metadata = metadata,
                    createdAtUtcMillis = asset.capturedAtUtcMillis,
                ),
            )

            _activeSession.value = SessionReplaySession(journal.read().events)
            asset
        }
    }

    /**
     * Opens a video-segment writer: the recorder writes into the writer's
     * tmp file; [VideoAssetWriter.close] hashes (one sequential chunked
     * read), journals and atomically commits the segment.
     */
    suspend fun beginVideoAsset(): VideoAssetWriter = withIo {
        mutex.withLock {
            val record = requireCapturing()
            check(videoWriter == null) { "a video segment is already open — close it first" }
            val dir = dirOf(record)
            val journal = journalOf(record)
            val assetId = nextAssetId(record)
            val tmp = dir.tmpFile(assetId, "video/mp4")
            tmp.parentFile?.mkdirs() // the recorder writes here; ensure the dir exists
            val writer = VideoAssetWriter(this, dir, journal, assetId, tmp)
            videoWriter = writer
            writer
        }
    }

    /** Internal: closes the open video writer (called by [VideoAssetWriter.close]). */
    internal suspend fun closeVideoAsset(
        writer: VideoAssetWriter,
        sensorMetadata: Map<String, String>,
    ): CapturedAssetRecord = withIo {
        mutex.withLock {
            check(videoWriter === writer) { "the video writer being closed is not the open one" }
            videoWriter = null
            val record = requireCapturing()
            val dir = dirOf(record)
            val journal = journalOf(record)
            val relativePath = dir.assetRelativePath(writer.assetId, "video/mp4")

            require(writer.tmpFile.isFile) { "video tmp file missing — nothing recorded?" }
            val byteSize = writer.tmpFile.length()

            // One sequential chunked read: hash without a whole-file in-memory copy.
            val hasher = StreamingContentHasher.begin(byteSize)
            val buffer = ByteArray(StreamingContentHasher.STREAM_CHUNK_BYTES)
            java.io.FileInputStream(writer.tmpFile).use { input ->
                while (true) {
                    val read = input.read(buffer)
                    if (read < 0) break
                    if (read > 0) hasher.updatePayloadChunk(buffer, 0, read)
                }
            }
            val metadata = baseMetadata(record) + sensorMetadata
            val contentId = hasher.contentId(metadata)

            val head = ByteArray(minOf(CapturedAssetRecord.HEAD_SAMPLE_BYTES.toLong(), byteSize).toInt())
            java.io.FileInputStream(writer.tmpFile).use { input ->
                var offset = 0
                while (offset < head.size) {
                    val read = input.read(head, offset, head.size - offset)
                    if (read < 0) break
                    offset += read
                }
            }

            val asset = CapturedAssetRecord(
                assetId = writer.assetId,
                relativePath = relativePath,
                contentId = contentId,
                byteSize = byteSize,
                headSampleSha256 = Digests.sha256Hex(head),
                mediaType = "video/mp4",
                capturedAtUtcMillis = clock.millis(),
                acquisitionMethod = AcquisitionMethod.VIDEO_FOOTAGE,
                sensorMetadata = org.payswap.aise.core.capture.AcquisitionMetadata(metadata),
            )

            journal.append(AssetCapturedEvent(journal.nextSequence(), clock.millis(), asset))
            AtomicFiles.commitRename(writer.tmpFile, dir.assetFile(relativePath))

            _activeSession.value = SessionReplaySession(journal.read().events)
            asset
        }
    }

    /** Internal: discards the open video writer's tmp file (recording failed / cancelled). */
    internal suspend fun discardVideoAsset(writer: VideoAssetWriter) = withIo {
        mutex.withLock {
            check(videoWriter === writer) { "the video writer being discarded is not the open one" }
            videoWriter = null
            writer.tmpFile.delete()
        }
    }

    // ------------------------------------------------------------------
    // Internals
    // ------------------------------------------------------------------

    private var videoWriter: VideoAssetWriter? = null

    private fun requireOpenSession(): CaptureSessionRecord {
        val record = openRecord() ?: throw IllegalStateException("no open capture session")
        return record
    }

    private fun requireCapturing(): CaptureSessionRecord {
        val record = requireOpenSession()
        check(record.status == CaptureSessionStatus.CAPTURING) {
            "session is ${record.status.name} — assets are only captured while CAPTURING"
        }
        return record
    }

    private fun nextAssetId(record: CaptureSessionRecord): String {
        val n = record.assets.size + 1
        return "a-%04d".format(n)
    }

    private fun baseMetadata(record: CaptureSessionRecord): Map<String, String> = buildMap {
        record.missionRef?.let { put("mission.id", it) }
        put("session.id", record.sessionId)
        put("device.id", record.deviceIdentity.deviceId)
    }

    private fun dirOf(record: CaptureSessionRecord): SessionDirectory =
        SessionDirectory.forSession(sessionsRoot, record.sessionId)

    private fun journalOf(record: CaptureSessionRecord): JsonlSessionJournal =
        JsonlSessionJournal(dirOf(record).journalFile)

    private suspend fun <T> withIo(block: suspend () -> T): T = withContext(ioDispatcher) { block() }

    // Thin local aliases so the controller reads like the domain language.
    private fun SessionReplaySession(events: List<CaptureSessionEvent>): CaptureSessionRecord =
        org.payswap.aise.core.session.SessionReplay.replay(events)

    private fun AssetCapturedEvent(sequence: Long, at: Long, asset: CapturedAssetRecord) =
        org.payswap.aise.core.session.AssetCaptured(sequence = sequence, atUtcMillis = at, asset = asset)
}

/**
 * Handle for one in-flight video segment. The recorder (CameraX in the UI
 * layer) writes into [tmpFile]; the segment becomes evidence only through
 * [close] (hash → journal → atomic rename), or is discarded via [discard].
 */
class VideoAssetWriter internal constructor(
    private val controller: CaptureSessionController,
    internal val dir: SessionDirectory,
    internal val journal: JsonlSessionJournal,
    internal val assetId: String,
    internal val tmpFile: File,
) {
    /** The file the recorder must write into (the tmp path; NOT the final asset path). */
    val targetFile: File get() = tmpFile

    /** Commits the segment: streaming hash → journal → atomic rename. */
    suspend fun close(sensorMetadata: Map<String, String>): CapturedAssetRecord =
        controller.closeVideoAsset(this, sensorMetadata)

    /** Discards the segment — it was never evidence, nothing is journaled. */
    suspend fun discard() = controller.discardVideoAsset(this)
}
