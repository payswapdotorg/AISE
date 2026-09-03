package com.aise.field.contracts.dto

import kotlinx.serialization.Serializable

@Serializable
data class CaptureSessionContractDto(
    val contractVersion: String = "1.0",
    val sessionId: String,
    val projectId: String,
    val intent: ContractCaptureIntent,
    val assuranceProfile: ContractAssuranceProfile,
    val status: ContractSessionStatus,
    val createdAt: String,
    val updatedAt: String? = null,
    val operatorRef: String? = null,
    val notes: String? = null
)
