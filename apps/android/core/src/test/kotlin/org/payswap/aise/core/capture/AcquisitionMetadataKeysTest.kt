package org.payswap.aise.core.capture

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.payswap.aise.core.session.RepoFiles

/**
 * VOICE-003 — the advisory voice-key vocabulary joins `AcquisitionMetadataKeys`
 * (the VOICE-001 §5.4 hand-off: the contract author deliberately did NOT
 * extend the Kotlin vocabulary; the field-capture work order does).
 *
 * Two layers of pinning:
 *  1. the four constants carry the canonical key strings (the contract's
 *     own values — `voice.codec`, `voice.duration.ms`,
 *     `voice.sample.rate.hz`, `voice.language.hint`);
 *  2. the CROSS-CHECK discipline of `CaptureContractVersionTest`: the
 *     committed TypeScript source of the shared contract is parsed and the
 *     `ACQUISITION_METADATA_KEYS` voice values must EQUAL the Kotlin
 *     constants — mirror drift on either side is a CI failure, never a
 *     silent wire incompatibility.
 */
class AcquisitionMetadataKeysTest {

    @Test
    fun `the four voice constants carry the canonical contract key strings`() {
        assertEquals("voice.codec", AcquisitionMetadataKeys.VOICE_CODEC)
        assertEquals("voice.duration.ms", AcquisitionMetadataKeys.VOICE_DURATION_MS)
        assertEquals("voice.sample.rate.hz", AcquisitionMetadataKeys.VOICE_SAMPLE_RATE_HZ)
        assertEquals("voice.language.hint", AcquisitionMetadataKeys.VOICE_LANGUAGE_HINT)
    }

    @Test
    fun `the kotlin voice keys equal the committed shared-contract voice keys`() {
        val source = RepoFiles.readText("packages/shared-contracts/src/evidence.ts")
        fun contractValue(field: String): String {
            val match = Regex("$field\\s*:\\s*\"([^\"]+)\"").find(source)
            assertTrue(match != null, "ACQUISITION_METADATA_KEYS.$field not found in evidence.ts")
            return match!!.groupValues[1]
        }
        assertEquals(contractValue("voiceCodec"), AcquisitionMetadataKeys.VOICE_CODEC)
        assertEquals(contractValue("voiceDurationMs"), AcquisitionMetadataKeys.VOICE_DURATION_MS)
        assertEquals(contractValue("voiceSampleRateHz"), AcquisitionMetadataKeys.VOICE_SAMPLE_RATE_HZ)
        assertEquals(contractValue("voiceLanguageHint"), AcquisitionMetadataKeys.VOICE_LANGUAGE_HINT)
    }

    @Test
    fun `the legacy advisory keys are unchanged - the vocabulary is append-only`() {
        assertEquals("mission.id", AcquisitionMetadataKeys.MISSION_ID)
        assertEquals("session.id", AcquisitionMetadataKeys.SESSION_ID)
        assertEquals("device.id", AcquisitionMetadataKeys.DEVICE_ID)
        assertEquals("capture.kind", AcquisitionMetadataKeys.CAPTURE_KIND)
        assertEquals("acquisition.sensorId", AcquisitionMetadataKeys.SENSOR_ID)
    }
}
