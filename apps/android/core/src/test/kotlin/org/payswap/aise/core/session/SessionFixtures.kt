package org.payswap.aise.core.session

import org.payswap.aise.core.identity.ContentId
import org.payswap.aise.core.identity.ContentIdentity
import org.payswap.aise.core.identity.Digests

/** Shared deterministic fixtures for the session-domain tests (no clock, no randomness). */
object SessionFixtures {

    const val SESSION_ID = "0b6f6e2a-9b3d-4a51-8b3e-2f0b8ac21d77"
    const val SESSION_ID_2 = "1c8e7f3b-2c4e-4f62-9c4f-3a1c9bd32e88"
    const val PROFILE_ID = "cap-2026-0142"
    const val MISSION_REF = "mission-2026-000042"

    const val T0 = 1_767_225_600_000L // 2026-01-01T00:00:00.000Z, fixed, injected
    const val T1 = T0 + 1_000
    const val T2 = T0 + 2_000
    const val T3 = T0 + 3_000
    const val T4 = T0 + 4_000
    const val T5 = T0 + 5_000
    const val T6 = T0 + 6_000
    const val T7 = T0 + 7_000

    fun deviceIdentity(): SessionDeviceIdentity = SessionDeviceIdentity(
        deviceId = "device-field-007",
        platform = "android",
        model = "Pixel 8 Pro",
        osVersion = "15",
        appVersion = "0.3.0",
    )

    fun capabilitySnapshot(
        profileId: String = PROFILE_ID,
        capturedAt: Long = T0,
        imuActive: Boolean = true,
    ): CapabilitySnapshot = CapabilitySnapshot.baseline(
        profileId = profileId,
        capturedAtUtcMillis = capturedAt,
        deviceIdentity = deviceIdentity(),
        imuActive = imuActive,
    )

    fun created(
        sequence: Long = 1,
        at: Long = T0,
        sessionId: String = SESSION_ID,
        missionRef: String? = null,
    ): SessionCreated = SessionCreated(
        sequence = sequence,
        atUtcMillis = at,
        sessionId = sessionId,
        deviceIdentity = deviceIdentity(),
        capabilitySnapshot = capabilitySnapshot(),
        missionRef = missionRef,
    )

    fun state(
        sequence: Long,
        at: Long,
        from: CaptureSessionStatus,
        to: CaptureSessionStatus,
    ): SessionStateChanged = SessionStateChanged(sequence = sequence, atUtcMillis = at, from = from, to = to)

    /**
     * Builds a fully journaled asset with payload bytes: derives the REAL
     * content id (AISE-CONTENT-V1) and head sample so recovery logic in
     * :app tests can re-verify against real files.
     */
    fun asset(
        assetId: String,
        payload: ByteArray,
        mediaType: String = "image/jpeg",
        method: AcquisitionMethod = AcquisitionMethod.STILL_IMAGERY,
        capturedAt: Long = T2,
        metadata: Map<String, String> = mapOf(
            "session.id" to SESSION_ID,
            "device.id" to "device-field-007",
            "capture.kind" to "still",
        ),
        relativePath: String? = null,
    ): CapturedAssetRecord {
        val contentId: ContentId = ContentIdentity.contentId(payload, metadata)
        val path = relativePath ?: "assets/$assetId.jpg"
        return CapturedAssetRecord(
            assetId = assetId,
            relativePath = path,
            contentId = contentId,
            byteSize = payload.size.toLong(),
            headSampleSha256 = Digests.sha256HexOfHead(payload, CapturedAssetRecord.HEAD_SAMPLE_BYTES),
            mediaType = mediaType,
            capturedAtUtcMillis = capturedAt,
            acquisitionMethod = method,
            sensorMetadata = org.payswap.aise.core.capture.AcquisitionMetadata(metadata),
        )
    }

    fun assetCaptured(
        sequence: Long,
        at: Long = T3,
        asset: CapturedAssetRecord,
    ): AssetCaptured = AssetCaptured(sequence = sequence, atUtcMillis = at, asset = asset)

    fun reopened(
        sequence: Long,
        at: Long,
        audit: SessionRecoveryAudit = SessionRecoveryAudit.EMPTY,
    ): SessionReopened = SessionReopened(sequence = sequence, atUtcMillis = at, recovery = audit)

    /** A typical happy-path journal: created → begin → asset → pause → resume → asset → finalize. */
    fun happyPathJournal(): List<CaptureSessionEvent> = listOf(
        created(),
        state(2, T1, CaptureSessionStatus.DRAFT, CaptureSessionStatus.CAPTURING),
        assetCaptured(3, T2, asset("a-0001", bytePayload(1))),
        state(4, T3, CaptureSessionStatus.CAPTURING, CaptureSessionStatus.PAUSED),
        state(5, T4, CaptureSessionStatus.PAUSED, CaptureSessionStatus.CAPTURING),
        assetCaptured(6, T5, asset("a-0002", bytePayload(2), mediaType = "video/mp4", method = AcquisitionMethod.VIDEO_FOOTAGE)),
        state(7, T6, CaptureSessionStatus.CAPTURING, CaptureSessionStatus.FINALIZED),
    )

    /** Deterministic pseudo-random-ish payload bytes (fixed seed arithmetic — no java.util.Random). */
    fun bytePayload(seed: Int, size: Int = 2048): ByteArray =
        ByteArray(size) { i -> ((i * 31 + seed * 17) and 0xff).toByte() }
}
