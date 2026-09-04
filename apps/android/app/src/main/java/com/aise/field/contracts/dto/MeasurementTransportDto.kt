package com.aise.field.contracts.dto

import kotlinx.serialization.Serializable

@Serializable
data class MeasurementTransportDto(
    val kind: ContractMeasurementKind,
    val value: Double,
    val unit: String,
    val uncertainty: UncertaintyTransportDto? = null,
    val confidence: Double? = null,
    val method: String? = null
)

@Serializable
data class UncertaintyTransportDto(
    val plusMinus: Double,
    val unit: String,
    val type: String? = null,
    val level: Double? = null
)
