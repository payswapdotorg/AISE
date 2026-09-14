package org.payswap.aise.core.capability

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.payswap.aise.core.session.CapabilityDomainKind
import org.payswap.aise.core.session.CapabilityDomainStatus

/**
 * Contract tests: the factory's output must satisfy the frozen capability
 * contract (the AISE-005 session surface) and the AISE-006 work-order rules:
 *
 *  - exactly the 8 contract domains (enforced by [org.payswap.aise.core.session.CapabilitySnapshot]'s
 *    own init contract — constructing the snapshot is the proof);
 *  - every DEGRADED/UNAVAILABLE domain carries ≥1 material limitation;
 *  - every domain carries structured `details` with the facts that drove the
 *    decision;
 *  - structured facts only — NO opaque score / rating / readiness judgement
 *    anywhere (readiness is AISE-022's authority, a frozen invariant);
 *  - `unknown` is never conflated with `unavailable`.
 */
class CapabilityContractTest {

    // ------------------------------------------------------------------
    // The 8-domain contract
    // ------------------------------------------------------------------

    @Test
    fun `factory output covers exactly the 8 contract domains`() {
        val snapshot = DeviceFactsFixtures.snapshot(DeviceFactsFixtures.flagshipWithLidar())
        assertEquals(CapabilityDomainKind.entries.toSet(), snapshot.domains.keys)
        assertEquals(8, snapshot.domains.size)
        assertEquals(8, CapabilityDomainKind.entries.size, "the contract's domain set is frozen at 8")
    }

    @Test
    fun `the snapshot init contract rejects fewer or extra domains - factory cannot drift`() {
        // A snapshot that misses a domain cannot even be constructed; the factory
        // delegates to that init contract, so this pins the delegation.
        assertThrows(IllegalArgumentException::class.java) {
            org.payswap.aise.core.session.CapabilitySnapshot(
                profileId = "p",
                capturedAtUtcMillis = 0L,
                deviceIdentity = DeviceFactsFixtures.snapshot(DeviceFactsFixtures.unprobed()).deviceIdentity,
                domains = emptyMap(),
            )
        }
    }

    @Test
    fun `profileId, capturedAt and device identity flow through unchanged`() {
        val facts = DeviceFactsFixtures.flagshipWithLidar()
        val snapshot = CapabilityProfileFactory.create(
            facts = facts,
            profileId = "cap-contract-0001",
            capturedAtUtcMillis = 1_767_225_600_123L,
        )
        assertEquals("cap-contract-0001", snapshot.profileId)
        assertEquals(1_767_225_600_123L, snapshot.capturedAtUtcMillis)
        assertEquals(facts.deviceIdentity, snapshot.deviceIdentity)
    }

    @Test
    fun `the snapshot contract bounds are enforced through the factory`() {
        val facts = DeviceFactsFixtures.unprobed()
        assertThrows(IllegalArgumentException::class.java) {
            CapabilityProfileFactory.create(facts, profileId = "", capturedAtUtcMillis = 1L)
        }
        assertThrows(IllegalArgumentException::class.java) {
            CapabilityProfileFactory.create(facts, profileId = "p", capturedAtUtcMillis = -1L)
        }
    }

    // ------------------------------------------------------------------
    // Limitations & details invariants (across ALL representative classes)
    // ------------------------------------------------------------------

    @Test
    fun `every DEGRADED or UNAVAILABLE domain carries at least one material limitation`() {
        for (deviceClass in DeviceFactsFixtures.ALL_CLASSES) {
            val snapshot = DeviceFactsFixtures.snapshot(deviceClass.facts())
            for (kind in CapabilityDomainKind.entries) {
                val descriptor = snapshot.domain(kind)
                if (descriptor.status == CapabilityDomainStatus.DEGRADED ||
                    descriptor.status == CapabilityDomainStatus.UNAVAILABLE
                ) {
                    assertTrue(
                        descriptor.limitations.isNotEmpty(),
                        "${deviceClass.name}/$kind is ${descriptor.status} but has no limitation",
                    )
                }
            }
        }
    }

    @Test
    fun `every domain in every class carries structured details with the driving facts`() {
        for (deviceClass in DeviceFactsFixtures.ALL_CLASSES) {
            val snapshot = DeviceFactsFixtures.snapshot(deviceClass.facts())
            for (kind in CapabilityDomainKind.entries) {
                val descriptor = snapshot.domain(kind)
                assertTrue(
                    descriptor.details.isNotEmpty(),
                    "${deviceClass.name}/$kind carries no details — the planner needs the driving facts",
                )
                for ((key, value) in descriptor.details) {
                    assertTrue(key.isNotEmpty(), "details keys must be non-empty")
                    assertTrue(value.isNotEmpty(), "details value for '$key' must be non-empty")
                }
            }
        }
    }

    @Test
    fun `no domain carries an opaque score, rating, grade or readiness judgement`() {
        val forbidden = Regex("(?i).*(score|rating|grade|readiness|verdict).*")
        for (deviceClass in DeviceFactsFixtures.ALL_CLASSES) {
            val snapshot = DeviceFactsFixtures.snapshot(deviceClass.facts())
            for (kind in CapabilityDomainKind.entries) {
                val descriptor = snapshot.domain(kind)
                for (key in descriptor.details.keys) {
                    assertTrue(
                        !forbidden.matches(key),
                        "${deviceClass.name}/$kind emits judgement-like key '$key' — facts only (readiness is AISE-022's authority)",
                    )
                }
            }
        }
    }

    @Test
    fun `unknown is never conflated with unavailable across all classes`() {
        // Every UNKNOWN domain must still explain WHY it is undetermined (a missing
        // probe or an ambiguous/virtual source) — never a claim of definitive absence.
        val whyUnknown = Regex("(?i)not (fully )?(probed|determined)|undetermined|unverified")
        for (deviceClass in DeviceFactsFixtures.ALL_CLASSES) {
            val snapshot = DeviceFactsFixtures.snapshot(deviceClass.facts())
            for (kind in CapabilityDomainKind.entries) {
                val descriptor = snapshot.domain(kind)
                if (descriptor.status == CapabilityDomainStatus.UNKNOWN) {
                    assertTrue(
                        descriptor.limitations.any { whyUnknown.containsMatchIn(it) },
                        "${deviceClass.name}/$kind is UNKNOWN but no limitation explains the missing/ambiguous probe",
                    )
                }
            }
        }
    }

    // ------------------------------------------------------------------
    // Facts-model validation (fail closed on impossible inputs)
    // ------------------------------------------------------------------

    @Test
    fun `facts model rejects out-of-range battery, RAM, storage, megapixels and video modes`() {
        assertThrows(IllegalArgumentException::class.java) {
            EnvironmentFacts(batteryPercent = 101)
        }
        assertThrows(IllegalArgumentException::class.java) {
            EnvironmentFacts(availableStorageMb = -1)
        }
        assertThrows(IllegalArgumentException::class.java) {
            ComputeFacts(ramTotalMb = 0)
        }
        assertThrows(IllegalArgumentException::class.java) {
            LensFacts(megapixels = 0.0)
        }
        assertThrows(IllegalArgumentException::class.java) {
            VideoModeFacts(0, 2160, 60)
        }
        assertThrows(IllegalArgumentException::class.java) {
            DepthFacts(tofSensorCount = -1)
        }
    }

    @Test
    fun `adapters are pure - the same facts yield the same snapshot twice`() {
        val facts = DeviceFactsFixtures.runtimeDegraded()
        val first = DeviceFactsFixtures.snapshot(facts)
        val second = DeviceFactsFixtures.snapshot(facts)
        assertEquals(first, second)
        assertEquals(
            DeviceFactsFixtures.statusVector(first),
            DeviceFactsFixtures.statusVector(second),
        )
    }
}
