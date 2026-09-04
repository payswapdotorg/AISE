package com.aise.field.contracts.dto

import kotlinx.serialization.Serializable

@Serializable
data class EpistemicTransportDto(
    val epistemicState: ContractEpistemicState? = null,
    val observationPresence: ContractObservationPresence? = null
)
