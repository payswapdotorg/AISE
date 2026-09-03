package com.aise.field.domain.model

data class Project(
    val id: String,
    val name: String,
    val description: String,
    val createdAt: Long,
    val updatedAt: Long
)
