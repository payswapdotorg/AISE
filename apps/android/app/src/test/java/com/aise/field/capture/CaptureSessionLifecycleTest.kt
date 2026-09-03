package com.aise.field.capture

import com.aise.field.capture.session.CaptureSessionLifecycleManager
import com.aise.field.domain.model.AssuranceProfile
import com.aise.field.domain.model.CaptureIntent
import com.aise.field.domain.model.CaptureSession
import com.aise.field.domain.model.SessionStatus
import org.junit.Assert.*
import org.junit.Test

class CaptureSessionLifecycleTest {

    private val baseSession = CaptureSession(
        id = "session-001",
        projectId = "project-001",
        intent = CaptureIntent.AS_BUILT,
        assuranceProfile = AssuranceProfile.HIGH_ASSURANCE,
        status = SessionStatus.DRAFT,
        createdAt = System.currentTimeMillis()
    )

    @Test
    fun validLifecycleTransitions_succeed() {
        val readySession = CaptureSessionLifecycleManager.transition(baseSession, SessionStatus.READY)
        assertEquals(SessionStatus.READY, readySession.status)

        val inProgressSession = CaptureSessionLifecycleManager.transition(readySession, SessionStatus.IN_PROGRESS)
        assertEquals(SessionStatus.IN_PROGRESS, inProgressSession.status)

        val completedSession = CaptureSessionLifecycleManager.transition(inProgressSession, SessionStatus.COMPLETED)
        assertEquals(SessionStatus.COMPLETED, completedSession.status)
    }

    @Test(expected = IllegalStateException::class)
    fun invalidTransition_completedToDraft_throwsException() {
        val completedSession = baseSession.copy(status = SessionStatus.COMPLETED)
        CaptureSessionLifecycleManager.transition(completedSession, SessionStatus.DRAFT)
    }

    @Test(expected = IllegalStateException::class)
    fun invalidTransition_inProgressToDraft_throwsException() {
        val inProgressSession = baseSession.copy(status = SessionStatus.IN_PROGRESS)
        CaptureSessionLifecycleManager.transition(inProgressSession, SessionStatus.DRAFT)
    }
}
