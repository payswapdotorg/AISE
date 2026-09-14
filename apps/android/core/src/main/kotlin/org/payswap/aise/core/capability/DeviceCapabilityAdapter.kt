package org.payswap.aise.core.capability

import org.payswap.aise.core.session.CapabilityDomainDescriptor
import org.payswap.aise.core.session.CapabilityDomainStatus
import org.payswap.aise.core.session.SessionDeviceIdentity

/**
 * DEVICE domain adapter — device-level capability facts.
 *
 * The DEVICE domain's function within the profile is to carry the advisory
 * platform identity (platform, OS, app version, model, device id) that every
 * downstream consumer needs for telemetry and compatibility decisions. The
 * identity is REQUIRED (non-null [SessionDeviceIdentity] in [DeviceFacts]), so
 * the domain's core function — recording who is capturing — is always present
 * and the status is [CapabilityDomainStatus.SUPPORTED].
 *
 * Advisory means advisory: identity is metadata, never an authority
 * (see [SessionDeviceIdentity]); and no device "class" judgement is made here.
 */
object DeviceCapabilityAdapter {

    fun evaluate(deviceIdentity: SessionDeviceIdentity): CapabilityDomainDescriptor =
        CapabilityDomainDescriptor(
            status = CapabilityDomainStatus.SUPPORTED,
            details = linkedMapOf(
                "device.id" to deviceIdentity.deviceId,
                "device.platform" to deviceIdentity.platform,
                "device.model" to deviceIdentity.model,
                "device.os_version" to deviceIdentity.osVersion,
                "device.app_version" to deviceIdentity.appVersion,
            ),
            limitations = emptyList(),
        )
}
