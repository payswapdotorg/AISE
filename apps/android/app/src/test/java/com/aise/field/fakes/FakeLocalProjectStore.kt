package com.aise.field.fakes

import com.aise.field.data.store.LocalProjectStore
import com.aise.field.domain.model.Project
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.map

class FakeLocalProjectStore(
    initialProjects: List<Project> = emptyList()
) : LocalProjectStore {

    private val projectsState = MutableStateFlow(initialProjects)

    override fun getProjects(): Flow<List<Project>> = projectsState

    override fun getProjectById(id: String): Flow<Project?> {
        return projectsState.map { projects ->
            projects.find { it.id == id }
        }
    }

    override suspend fun saveProject(project: Project) {
        val current = projectsState.value.toMutableList()
        val index = current.indexOfFirst { it.id == project.id }
        if (index >= 0) {
            current[index] = project
        } else {
            current.add(0, project)
        }
        projectsState.value = current
    }
}
