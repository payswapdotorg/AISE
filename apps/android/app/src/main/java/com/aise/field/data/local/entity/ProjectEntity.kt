package com.aise.field.data.local.entity

import androidx.room.Entity
import androidx.room.PrimaryKey
import com.aise.field.domain.model.Project

@Entity(tableName = "projects")
data class ProjectEntity(
    @PrimaryKey val id: String,
    val name: String,
    val description: String,
    val createdAt: Long,
    val updatedAt: Long
) {
    fun toDomain(): Project = Project(
        id = id,
        name = name,
        description = description,
        createdAt = createdAt,
        updatedAt = updatedAt
    )

    companion object {
        fun fromDomain(project: Project): ProjectEntity = ProjectEntity(
            id = project.id,
            name = project.name,
            description = project.description,
            createdAt = project.createdAt,
            updatedAt = project.updatedAt
        )
    }
}
