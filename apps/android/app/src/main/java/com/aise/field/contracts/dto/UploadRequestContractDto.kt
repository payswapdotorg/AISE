package com.aise.field.contracts.dto

import kotlinx.serialization.Serializable

@Serializable
data class UploadRequestContractDto(
    val contractVersion: String = "1.0",
    val sessionId: String,
    val assetId: String,
    val idempotencyKey: String,
    val contentHash: String,
    val byteSize: Long,
    val part: UploadPartDto? = null
)

@Serializable
data class UploadPartDto(
    val index: Int,
    val total: Int
)
