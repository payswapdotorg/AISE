package com.aise.field.contracts.dto

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject

@Serializable
data class SyncErrorContractDto(
    val contractVersion: String = "1.0",
    val code: ContractSyncErrorCode,
    val message: String,
    val retryable: Boolean,
    val retryAfterMs: Long? = null,
    val details: JsonObject? = null
)
