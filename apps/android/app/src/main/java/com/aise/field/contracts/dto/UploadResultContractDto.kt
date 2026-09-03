package com.aise.field.contracts.dto

import kotlinx.serialization.Serializable

@Serializable
data class UploadResultContractDto(
    val contractVersion: String = "1.0",
    val assetId: String,
    val outcome: ContractUploadOutcome,
    val receivedHash: String,
    val duplicateOf: String? = null,
    val note: String? = null
)
