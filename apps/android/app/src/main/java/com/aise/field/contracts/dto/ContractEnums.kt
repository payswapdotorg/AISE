package com.aise.field.contracts.dto

import com.aise.field.contracts.adapter.SafeEnumSerializer
import kotlinx.serialization.Serializable

@Serializable(with = ContractCaptureIntentSerializer::class)
enum class ContractCaptureIntent {
    AS_BUILT,
    MAINTENANCE,
    INSPECTION,
    UNKNOWN
}
object ContractCaptureIntentSerializer : SafeEnumSerializer<ContractCaptureIntent>(ContractCaptureIntent.entries.toTypedArray(), ContractCaptureIntent.UNKNOWN)

@Serializable(with = ContractAssuranceProfileSerializer::class)
enum class ContractAssuranceProfile {
    LIGHT,
    STANDARD,
    HIGH_ASSURANCE,
    CRITICAL,
    UNKNOWN
}
object ContractAssuranceProfileSerializer : SafeEnumSerializer<ContractAssuranceProfile>(ContractAssuranceProfile.entries.toTypedArray(), ContractAssuranceProfile.UNKNOWN)

@Serializable(with = ContractSessionStatusSerializer::class)
enum class ContractSessionStatus {
    DRAFT,
    READY,
    IN_PROGRESS,
    COMPLETED,
    UNKNOWN
}
object ContractSessionStatusSerializer : SafeEnumSerializer<ContractSessionStatus>(ContractSessionStatus.entries.toTypedArray(), ContractSessionStatus.UNKNOWN)

@Serializable(with = ContractAssetTypeSerializer::class)
enum class ContractAssetType {
    PHOTO,
    VIDEO,
    DEPTH,
    METADATA,
    SKETCH,
    VOICE,
    DOCUMENT,
    UNKNOWN
}
object ContractAssetTypeSerializer : SafeEnumSerializer<ContractAssetType>(ContractAssetType.entries.toTypedArray(), ContractAssetType.UNKNOWN)

@Serializable(with = ContractUploadOutcomeSerializer::class)
enum class ContractUploadOutcome {
    ACCEPTED,
    DUPLICATE,
    UNKNOWN
}
object ContractUploadOutcomeSerializer : SafeEnumSerializer<ContractUploadOutcome>(ContractUploadOutcome.entries.toTypedArray(), ContractUploadOutcome.UNKNOWN)

@Serializable(with = ContractSyncErrorCodeSerializer::class)
enum class ContractSyncErrorCode {
    AUTH_REQUIRED,
    FORBIDDEN,
    PROJECT_NOT_FOUND,
    SESSION_NOT_FOUND,
    ASSET_NOT_FOUND,
    VALIDATION_FAILED,
    CHECKSUM_MISMATCH,
    PAYLOAD_TOO_LARGE,
    IDEMPOTENCY_CONFLICT,
    RATE_LIMITED,
    SERVER_ERROR,
    SERVICE_UNAVAILABLE,
    CONTRACT_VERSION_UNSUPPORTED,
    UNKNOWN
}
object ContractSyncErrorCodeSerializer : SafeEnumSerializer<ContractSyncErrorCode>(ContractSyncErrorCode.entries.toTypedArray(), ContractSyncErrorCode.UNKNOWN)

@Serializable(with = ContractMeasurementKindSerializer::class)
enum class ContractMeasurementKind {
    measurement,
    estimate,
    UNKNOWN
}
object ContractMeasurementKindSerializer : SafeEnumSerializer<ContractMeasurementKind>(ContractMeasurementKind.entries.toTypedArray(), ContractMeasurementKind.UNKNOWN)

@Serializable(with = ContractEpistemicStateSerializer::class)
enum class ContractEpistemicState {
    OBSERVED,
    INFERRED,
    CONFIRMED,
    PROPOSED,
    UNKNOWN
}
object ContractEpistemicStateSerializer : SafeEnumSerializer<ContractEpistemicState>(ContractEpistemicState.entries.toTypedArray(), ContractEpistemicState.UNKNOWN)

@Serializable(with = ContractObservationPresenceSerializer::class)
enum class ContractObservationPresence {
    UNKNOWN,
    NOT_OBSERVED,
    OCCLUDED
}
object ContractObservationPresenceSerializer : SafeEnumSerializer<ContractObservationPresence>(ContractObservationPresence.entries.toTypedArray(), ContractObservationPresence.UNKNOWN)
