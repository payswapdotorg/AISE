package org.payswap.aise.core.session

/**
 * The wire contract version emitted by the capture client.
 *
 * Authority: `packages/shared-contracts` (AISE-003) — the package version IS
 * the contract version and every family ships the program-wide value. This
 * constant mirrors it; `CaptureContractVersionTest` cross-checks the mirror
 * against the COMMITTED TypeScript source on every test run, so drift is a
 * CI failure, never a silent wire incompatibility.
 *
 * Compatibility rule (003): decoders accept the same MAJOR version; anything
 * else is a typed error. Bumping this value is a governed contract change.
 */
object CaptureContractVersion {
    const val V1: String = "1.0.0"

    /** The version every wire object produced by the capture domain carries. */
    val CURRENT: String get() = V1
}
