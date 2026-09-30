package org.payswap.aise.core.session

import com.fasterxml.jackson.databind.ObjectMapper
import com.networknt.schema.JsonSchemaFactory
import com.networknt.schema.SpecVersion
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/**
 * VOICE-003 — the voice-note asset's manifest projection is the EXACT 1.1.0
 * `Evidence` document: the `SessionManifestExporterTest` discipline applied
 * to the voice lane. The manifest's voice asset entry VALIDATES against the
 * committed `Evidence.schema.json`, the canonical voice keys ride
 * `acquisitionMetadata` as STRINGS (numeric values string-encoded integers —
 * checked against the committed contract fixture's pattern), and unmeasured
 * keys are ABSENT (never zero, never "unknown", never fabricated).
 */
class SessionManifestVoiceExporterTest {

    private val mapper = ObjectMapper()

    private fun schema(relative: String) =
        JsonSchemaFactory.getInstance(SpecVersion.VersionFlag.V7)
            .getSchema(RepoFiles.locate(relative).inputStream())

    private val envelopeSchema = schema("packages/shared-contracts/schemas/sync/CaptureSessionEnvelope.schema.json")
    private val evidenceSchema = schema("packages/shared-contracts/schemas/evidence/Evidence.schema.json")

    /** A finalized session carrying one voice-note asset with the full honest metadata map. */
    private fun voiceSessionJournal(measuredMetadata: Map<String, String>): List<CaptureSessionEvent> = listOf(
        SessionFixtures.created(missionRef = SessionFixtures.MISSION_REF),
        SessionFixtures.state(2, SessionFixtures.T1, CaptureSessionStatus.DRAFT, CaptureSessionStatus.CAPTURING),
        SessionFixtures.assetCaptured(
            3,
            SessionFixtures.T2,
            SessionFixtures.asset(
                assetId = "a-0001",
                payload = SessionFixtures.bytePayload(7),
                mediaType = "audio/mp4",
                method = AcquisitionMethod.VOICE_NOTE,
                capturedAt = SessionFixtures.T2,
                metadata = mapOf(
                    "mission.id" to SessionFixtures.MISSION_REF,
                    "session.id" to SessionFixtures.SESSION_ID,
                    "device.id" to "device-field-007",
                    "capture.kind" to "voice",
                    "acquisition.sensorId" to "mic",
                ) + measuredMetadata,
                relativePath = "assets/a-0001.m4a",
            ),
        ),
        SessionFixtures.state(4, SessionFixtures.T3, CaptureSessionStatus.CAPTURING, CaptureSessionStatus.FINALIZED),
    )

    private val fullyMeasured = mapOf(
        "voice.codec" to "aac",
        "voice.duration.ms" to "18400",
        "voice.sample.rate.hz" to "48000",
        "voice.language.hint" to "en",
    )

    @Test
    fun `a voice-note manifest validates against the committed envelope and evidence schemas`() {
        val record = SessionReplay.replay(voiceSessionJournal(fullyMeasured))
        val manifest = SessionManifestExporter.export(record)
        val tree = mapper.readTree(manifest)

        assertEquals(emptySet<String>(), envelopeSchema.validate(tree).map { it.message }.toSet(), "envelope errors")

        val voiceAsset = tree.get("assets").get(0)
        assertEquals(emptySet<String>(), evidenceSchema.validate(voiceAsset).map { it.message }.toSet(), "evidence errors")
        assertEquals("VOICE_NOTE", voiceAsset.get("acquisitionMethod").asText())
        assertEquals("audio/mp4", voiceAsset.get("mediaType").asText())
        assertEquals(CaptureContractVersion.CURRENT, voiceAsset.get("contractVersion").asText())
    }

    @Test
    fun `measured voice keys ride acquisitionMetadata as string-encoded integers - the fixture pattern`() {
        val manifest = SessionManifestExporter.export(SessionReplay.replay(voiceSessionJournal(fullyMeasured)))
        val metadata = mapper.readTree(manifest).get("assets").get(0).get("acquisitionMetadata")

        // All values are strings; the numeric keys are string-encoded integers
        // exactly like the committed contract fixture's pattern.
        assertEquals("aac", metadata.get("voice.codec").asText())
        assertTrue(metadata.get("voice.codec").isTextual)
        assertEquals("18400", metadata.get("voice.duration.ms").asText())
        assertTrue(metadata.get("voice.duration.ms").isTextual, "duration must be a string-encoded integer")
        assertEquals("48000", metadata.get("voice.sample.rate.hz").asText())
        assertTrue(metadata.get("voice.sample.rate.hz").isTextual, "sample rate must be a string-encoded integer")
        assertEquals("en", metadata.get("voice.language.hint").asText())
        // The lane fact + base identity keys ride verbatim.
        assertEquals("voice", metadata.get("capture.kind").asText())
        assertEquals("mic", metadata.get("acquisition.sensorId").asText())
        assertEquals(SessionFixtures.SESSION_ID, metadata.get("session.id").asText())
    }

    @Test
    fun `unmeasured voice keys are absent - never zero, never unknown, never fabricated`() {
        // The device could measure ONLY the codec (the configured encoder —
        // a fact) and the operator entered no language hint: duration and
        // sample rate are honestly absent.
        val partial = mapOf("voice.codec" to "aac")
        val manifest = SessionManifestExporter.export(SessionReplay.replay(voiceSessionJournal(partial)))
        val metadata = mapper.readTree(manifest).get("assets").get(0).get("acquisitionMetadata")

        assertFalse(metadata.has("voice.duration.ms"), "an unmeasured duration must be absent, not defaulted")
        assertFalse(metadata.has("voice.sample.rate.hz"), "an unmeasured sample rate must be absent, not defaulted")
        assertFalse(metadata.has("voice.language.hint"), "no user-entered hint means the key is absent")
        // No value anywhere in the metadata is a zero default or an
        // "unknown" placeholder — absence is the only honest absent state.
        val values = metadata.fieldNames().asSequence().map { metadata.get(it).asText() }.toList()
        assertFalse(values.any { it == "0" || it.equals("unknown", ignoreCase = true) }, "never zero, never 'unknown': $values")
        // The manifest with absent keys STILL validates (the open-map contract).
        val tree = mapper.readTree(manifest)
        assertEquals(
            emptySet<String>(),
            evidenceSchema.validate(tree.get("assets").get(0)).map { it.message }.toSet(),
        )
    }

    @Test
    fun `the committed valid-voice-note fixture validates and carries the canonical key set`() {
        // The contract fixture is the pattern authority: its voice keys must
        // be exactly the keys the Android lane's vocabulary names.
        val fixture = RepoFiles.readText("packages/shared-contracts/fixtures/evidence/Evidence.valid-voice-note.json")
        val tree = mapper.readTree(fixture)
        assertEquals(emptySet<String>(), evidenceSchema.validate(tree).map { it.message }.toSet(), "fixture must validate")

        val fixtureKeys = tree.get("acquisitionMetadata").fieldNames().asSequence().toList()
        val canonicalVoiceKeys = listOf(
            "voice.codec",
            "voice.duration.ms",
            "voice.sample.rate.hz",
            "voice.language.hint",
        )
        assertTrue(
            canonicalVoiceKeys.all { it in fixtureKeys },
            "the fixture's voice keys must be the canonical four: $fixtureKeys",
        )
        // The Android lane's fully-measured asset asserts the same key shapes.
        val manifest = SessionManifestExporter.export(SessionReplay.replay(voiceSessionJournal(fullyMeasured)))
        val laneKeys = mapper.readTree(manifest).get("assets").get(0).get("acquisitionMetadata").fieldNames().asSequence().toList()
        assertTrue(canonicalVoiceKeys.all { it in laneKeys }, "the lane's voice keys must be the canonical four: $laneKeys")
    }

    @Test
    fun `the voice-note export is deterministic - same journal exports identical bytes`() {
        val a = SessionManifestExporter.export(SessionReplay.replay(voiceSessionJournal(fullyMeasured)))
        val b = SessionManifestExporter.export(SessionReplay.replay(voiceSessionJournal(fullyMeasured)))
        assertEquals(a, b)
    }
}
