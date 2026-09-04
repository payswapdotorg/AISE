package com.aise.field.capture.session

import com.aise.field.domain.model.CaptureSession
import com.aise.field.domain.model.SessionStatus

object CaptureSessionLifecycleManager {

    fun canTransition(currentStatus: SessionStatus, newStatus: SessionStatus): Boolean {
        if (currentStatus == newStatus) return true
        if (currentStatus == SessionStatus.COMPLETED) return false

        return when (currentStatus) {
            SessionStatus.DRAFT -> newStatus in listOf(SessionStatus.READY, SessionStatus.IN_PROGRESS)
            SessionStatus.READY -> newStatus in listOf(SessionStatus.IN_PROGRESS, SessionStatus.COMPLETED)
            SessionStatus.IN_PROGRESS -> newStatus == SessionStatus.COMPLETED
            SessionStatus.COMPLETED -> false
        }
    }

    fun transition(session: CaptureSession, newStatus: SessionStatus): CaptureSession {
        if (!canTransition(session.status, newStatus)) {
            throw IllegalStateException("Invalid capture session lifecycle transition from ${session.status} to $newStatus")
        }
        return session.copy(
            status = newStatus,
            updatedAt = System.currentTimeMillis()
        )
    }
}
