package org.payswap.aise.core.session

/**
 * The folded state of a capture session — the deterministic result of
 * replaying a journal ([SessionReplay]). The journal is the truth; THIS
 * record (and any UI derived from it) is derived state
 * (spec/architecture-lock.md: UI/mobile state is never canonical).
 */
data class CaptureSessionRecord(
    val sessionId: String,
    val status: CaptureSessionStatus,
    /** Session start instant (= the `session.created` event's `at`). */
    val startedAtUtcMillis: Long,
    /** Session end instant (= the FINALIZED state event's `at`), null while open. */
    val endedAtUtcMillis: Long?,
    val missionRef: String?,
    val deviceIdentity: SessionDeviceIdentity,
    val capabilitySnapshot: CapabilitySnapshot,
    /** Assets in capture order, INCLUDING corrupted ones (flagged — lost evidence stays explicit). */
    val assets: List<CapturedAssetRecord>,
    /** Recovery audit trail in journal order. */
    val reopenAudits: List<SessionRecoveryAudit>,
) {
    /** Assets eligible for the manifest (corrupted assets are excluded — never silently, see the exporter). */
    val manifestAssets: List<CapturedAssetRecord> get() = assets.filterNot { it.corrupted }

    /** Corrupted asset ids — exported into the manifest's explicit recovery audit. */
    val corruptedAssetIds: List<String> get() = assets.filter { it.corrupted }.map { it.assetId }

    fun asset(assetId: String): CapturedAssetRecord? = assets.firstOrNull { it.assetId == assetId }

    /** True while the session can still capture (the only states an operator resumes). */
    val isOpen: Boolean
        get() = status == CaptureSessionStatus.DRAFT ||
            status == CaptureSessionStatus.CAPTURING ||
            status == CaptureSessionStatus.PAUSED

    companion object {
        /** Fold helper: an interrupted session's tail state is what recovery re-opens. */
        fun initial(event: SessionCreated): CaptureSessionRecord = CaptureSessionRecord(
            sessionId = event.sessionId,
            status = CaptureSessionStatus.DRAFT,
            startedAtUtcMillis = event.atUtcMillis,
            endedAtUtcMillis = null,
            missionRef = event.missionRef,
            deviceIdentity = event.deviceIdentity,
            capabilitySnapshot = event.capabilitySnapshot,
            assets = emptyList(),
            reopenAudits = emptyList(),
        )
    }
}
