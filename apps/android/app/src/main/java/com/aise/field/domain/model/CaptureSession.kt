package com.aise.field.domain.model

enum class SessionStatus {
    DRAFT,
    READY,
    IN_PROGRESS,
    COMPLETED
}

data class CaptureSession(
    val id: String,
    val projectId: String,
    val intent: CaptureIntent,
    val assuranceProfile: AssuranceProfile,
    val status: SessionStatus = SessionStatus.DRAFT,
    val createdAt: Long
)
