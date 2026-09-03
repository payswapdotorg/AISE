package com.aise.field.contracts.dto

import kotlinx.serialization.Serializable

@Serializable
data class ModelVersionContractDto(
    val contractVersion: String = "1.0",
    val projectId: String,
    val modelId: String,
    val version: Int,
    val parentVersion: Int? = null
)

@Serializable
data class ModelObjectRefContractDto(
    val modelId: String,
    val version: Int,
    val objectId: String
)
