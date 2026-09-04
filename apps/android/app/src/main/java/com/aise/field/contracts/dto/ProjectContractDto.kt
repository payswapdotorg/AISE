package com.aise.field.contracts.dto

import kotlinx.serialization.Serializable

@Serializable
data class ProjectContractDto(
    val contractVersion: String = "1.0",
    val projectId: String,
    val name: String,
    val description: String? = null,
    val createdAt: String,
    val updatedAt: String? = null
)
