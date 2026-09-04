package com.aise.field.contracts.adapter

sealed class ContractVersionResult {
    data class Supported(val major: Int, val minor: Int) : ContractVersionResult()
    data class Unsupported(val requestedVersion: String, val supportedVersions: List<String> = listOf("1.0")) : ContractVersionResult()
}

object ContractVersionValidator {
    const val SUPPORTED_MAJOR = 1

    fun validateVersion(versionStr: String?): ContractVersionResult {
        if (versionStr == null) {
            return ContractVersionResult.Unsupported("null")
        }
        val parts = versionStr.split(".")
        if (parts.size != 2) {
            return ContractVersionResult.Unsupported(versionStr)
        }
        val major = parts[0].toIntOrNull()
        val minor = parts[1].toIntOrNull()
        if (major == null || minor == null) {
            return ContractVersionResult.Unsupported(versionStr)
        }
        if (major != SUPPORTED_MAJOR) {
            return ContractVersionResult.Unsupported(versionStr)
        }
        return ContractVersionResult.Supported(major, minor)
    }
}
