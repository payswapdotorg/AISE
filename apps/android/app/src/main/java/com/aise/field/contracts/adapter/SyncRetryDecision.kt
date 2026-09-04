package com.aise.field.contracts.adapter

import com.aise.field.contracts.dto.SyncErrorContractDto

data class SyncRetryDecision(
    val retryable: Boolean,
    val retryAfterMs: Long?
)

object SyncRetryPolicy {
    fun evaluateRetry(syncError: SyncErrorContractDto): SyncRetryDecision {
        return SyncRetryDecision(
            retryable = syncError.retryable,
            retryAfterMs = syncError.retryAfterMs
        )
    }
}
