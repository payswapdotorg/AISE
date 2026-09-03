package com.aise.field.data.local.entity

import androidx.room.Entity
import androidx.room.PrimaryKey
import com.aise.field.domain.model.AssuranceProfile
import com.aise.field.domain.model.CaptureIntent
import com.aise.field.domain.model.CaptureSession
import com.aise.field.domain.model.SessionStatus

@Entity(tableName = "capture_sessions")
data class CaptureSessionEntity(
    @PrimaryKey val id: String,
    val projectId: String,
    val intent: String,
    val assuranceProfile: String,
    val status: String,
    val createdAt: Long
) {
    fun toDomain(): CaptureSession = CaptureSession(
        id = id,
        projectId = projectId,
        intent = CaptureIntent.valueOf(intent),
        assuranceProfile = AssuranceProfile.valueOf(assuranceProfile),
        status = SessionStatus.valueOf(status),
        createdAt = createdAt
    )

    companion object {
        fun fromDomain(session: CaptureSession): CaptureSessionEntity = CaptureSessionEntity(
            id = session.id,
            projectId = session.projectId,
            intent = session.intent.name,
            assuranceProfile = session.assuranceProfile.name,
            status = session.status.name,
            createdAt = session.createdAt
        )
    }
}
