package com.aise.field.data.store

import com.aise.field.domain.model.Project
import kotlinx.coroutines.flow.Flow

interface LocalProjectStore {
    fun getProjects(): Flow<List<Project>>
    fun getProjectById(id: String): Flow<Project?>
    suspend fun saveProject(project: Project)
}
