package org.payswap.aise.core.capability

import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.databind.node.ObjectNode
import com.networknt.schema.JsonSchemaFactory
import com.networknt.schema.SpecVersion
import java.io.File
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.payswap.aise.core.json.JsonParser
import org.payswap.aise.core.json.JsonWriter
import org.payswap.aise.core.session.CaptureContractVersion
import org.payswap.aise.core.session.CaptureSessionStatus
import org.payswap.aise.core.session.IsoTimestamps
import org.payswap.aise.core.session.RepoFiles
import org.payswap.aise.core.session.SessionCreated
import org.payswap.aise.core.session.SessionFixtures
import org.payswap.aise.core.session.SessionManifestExporter
import org.payswap.aise.core.session.SessionReplay
import org.payswap.aise.core.session.SessionStateChanged

/**
 * Wire-JSON parity and schema validation for the AISE-006 capability profile
 * (SessionManifestExporterTest pattern):
 *
 *  - profiles rendered by [CapabilityProfileRenderer] VALIDATE against the
 *    COMMITTED AISE-003 `DeviceCapabilityProfile.schema.json` for every
 *    representative device class;
 *  - the committed 003 fixture validates (validator wiring sanity);
 *  - the rendered JSON carries exactly the envelope-embedded key set, with
 *    ISO-8601 UTC timestamps via the session package's [IsoTimestamps];
 *  - rendering is DETERMINISTIC (same facts + profileId + capturedAt →
 *    byte-identical JSON);
 *  - the rendered profile is byte/semantically IDENTICAL to what the session
 *    envelope embeds for the same snapshot;
 *  - deliberately-INVALID mutations are rejected by the schema (negative cases).
 */
class CapabilityProfileRendererTest {

    private val mapper = ObjectMapper()

    private fun schema(relative: String) =
        JsonSchemaFactory.getInstance(SpecVersion.VersionFlag.V7)
            .getSchema(RepoFiles.locate(relative).inputStream())

    private val profileSchema =
        schema("packages/shared-contracts/schemas/capability/DeviceCapabilityProfile.schema.json")

    private fun errorsOf(json: String) = profileSchema.validate(mapper.readTree(json)).map { it.message }.toSet()

    // ------------------------------------------------------------------
    // Valid round-trips (every representative device class)
    // ------------------------------------------------------------------

    @Test
    fun `rendered profiles for every representative class validate against the committed schema`() {
        for (deviceClass in DeviceFactsFixtures.ALL_CLASSES) {
            val json = CapabilityProfileRenderer.render(DeviceFactsFixtures.snapshot(deviceClass.facts()))
            assertEquals(emptySet<String>(), errorsOf(json), "${deviceClass.name} profile must validate: $json")
        }
    }

    @Test
    fun `the committed 003 capability fixture validates - validator wiring sanity`() {
        val fixture = RepoFiles.readText("packages/shared-contracts/fixtures/capability/DeviceCapabilityProfile.valid.json")
        assertEquals(emptySet<String>(), errorsOf(fixture))
    }

    @Test
    fun `rendered profile carries exactly the envelope-embedded wire keys`() {
        val snapshot = DeviceFactsFixtures.snapshot(DeviceFactsFixtures.flagshipWithLidar())
        val tree = mapper.readTree(CapabilityProfileRenderer.render(snapshot)) as ObjectNode
        val expectedKeys = setOf(
            "contractVersion", "profileId", "capturedAt", "deviceIdentity",
            "device", "camera", "depth", "imu", "tracking", "compute", "calibration", "environment",
        )
        assertEquals(expectedKeys, tree.fieldNames().asSequence().toSet())
        for (key in listOf("device", "camera", "depth", "imu", "tracking", "compute", "calibration", "environment")) {
            assertEquals(
                setOf("contractVersion", "status", "details", "limitations"),
                tree.get(key).fieldNames().asSequence().toSet(),
                "domain object '$key' wire keys",
            )
        }
    }

    @Test
    fun `capturedAt is the session package's ISO-8601 UTC ms format`() {
        val snapshot = DeviceFactsFixtures.snapshot(DeviceFactsFixtures.flagshipWithLidar())
        val tree = mapper.readTree(CapabilityProfileRenderer.render(snapshot))
        val capturedAt = tree.get("capturedAt").asText()
        assertEquals(IsoTimestamps.format(DeviceFactsFixtures.CAPTURED_AT_UTC_MILLIS), capturedAt)
        assertTrue(IsoTimestamps.PATTERN.matches(capturedAt))
        assertEquals(CaptureContractVersion.CURRENT, tree.get("contractVersion").asText())
    }

    @Test
    fun `domain statuses use the four contract wire names and details are a string map`() {
        val snapshot = DeviceFactsFixtures.snapshot(DeviceFactsFixtures.runtimeDegraded())
        val tree = mapper.readTree(CapabilityProfileRenderer.render(snapshot))
        val wireStatuses = setOf("supported", "unavailable", "degraded", "unknown")
        for (key in listOf("device", "camera", "depth", "imu", "tracking", "compute", "calibration", "environment")) {
            val domain = tree.get(key)
            assertTrue(wireStatuses.contains(domain.get("status").asText()), "status of '$key'")
            domain.get("details").fields().asSequence().forEach { (name, value) ->
                assertTrue(value.isTextual, "details.$name of '$key' must be a string value")
            }
        }
    }

    // ------------------------------------------------------------------
    // Determinism
    // ------------------------------------------------------------------

    @Test
    fun `same facts, profileId and capturedAt render byte-identical JSON`() {
        val facts = DeviceFactsFixtures.midrangeNoDepth()
        val first = CapabilityProfileRenderer.render(CapabilityProfileFactory.create(facts, "cap-det-0001", 1_767_225_600_000L))
        val second = CapabilityProfileRenderer.render(CapabilityProfileFactory.create(facts, "cap-det-0001", 1_767_225_600_000L))
        assertEquals(first, second)
        // Also via the fixture helper with the SAME profileId/capturedAt:
        assertEquals(
            first,
            CapabilityProfileRenderer.render(DeviceFactsFixtures.snapshot(facts, profileId = "cap-det-0001")),
        )
    }

    @Test
    fun `different capturedAt or profileId changes the rendering - no hidden caching`() {
        val facts = DeviceFactsFixtures.midrangeNoDepth()
        val a = CapabilityProfileRenderer.render(CapabilityProfileFactory.create(facts, "cap-det-0001", 1_767_225_600_000L))
        val b = CapabilityProfileRenderer.render(CapabilityProfileFactory.create(facts, "cap-det-0002", 1_767_225_600_000L))
        val c = CapabilityProfileRenderer.render(CapabilityProfileFactory.create(facts, "cap-det-0001", 1_767_225_600_001L))
        assertTrue(a != b, "profileId must flow into the rendering")
        assertTrue(a != c, "capturedAt must flow into the rendering")
    }

    // ------------------------------------------------------------------
    // Parity with the session envelope embedding
    // ------------------------------------------------------------------

    @Test
    fun `rendered profile is identical to what the session envelope embeds`() {
        val snapshot = DeviceFactsFixtures.snapshot(DeviceFactsFixtures.flagshipWithLidar(), profileId = "cap-parity-0001")
        val journal = listOf(
            SessionCreated(
                sequence = 1L,
                atUtcMillis = DeviceFactsFixtures.CAPTURED_AT_UTC_MILLIS,
                sessionId = SessionFixtures.SESSION_ID,
                deviceIdentity = snapshot.deviceIdentity,
                capabilitySnapshot = snapshot,
                missionRef = null,
            ),
            SessionStateChanged(
                sequence = 2L,
                atUtcMillis = DeviceFactsFixtures.CAPTURED_AT_UTC_MILLIS + 1_000,
                from = CaptureSessionStatus.DRAFT,
                to = CaptureSessionStatus.CAPTURING,
            ),
            SessionStateChanged(
                sequence = 3L,
                atUtcMillis = DeviceFactsFixtures.CAPTURED_AT_UTC_MILLIS + 2_000,
                from = CaptureSessionStatus.CAPTURING,
                to = CaptureSessionStatus.FINALIZED,
            ),
        )
        val record = SessionReplay.replay(journal)
        val manifestTree = mapper.readTree(SessionManifestExporter.export(record))
        val embedded = manifestTree.get("capabilityProfile")
        assertEquals(snapshot.profileId, embedded.get("profileId").asText())

        // Semantic parity (Jackson value equality)…
        val mine = mapper.readTree(CapabilityProfileRenderer.render(snapshot))
        assertEquals(embedded, mine, "renderer output must match the envelope's embedded capabilityProfile")

        // …and byte-level parity via the core JSON codec (both sides canonically sorted).
        val embeddedCompact = mapper.writeValueAsString(embedded)
        val reparsedEmbedded = JsonParser.parse(embeddedCompact)
        assertEquals(
            JsonWriter.compact(CapabilityProfileRenderer.toJsonObject(snapshot)),
            JsonWriter.compact(reparsedEmbedded),
        )
    }

    @Test
    fun `rendered profile parses back with the core json parser - no jackson on main`() {
        val json = CapabilityProfileRenderer.render(DeviceFactsFixtures.snapshot(DeviceFactsFixtures.emulatorLike()))
        val parsed = JsonParser.parse(json.trim())
        assertTrue(parsed is org.payswap.aise.core.json.JsonValue.JsonObject)
    }

    // ------------------------------------------------------------------
    // Negative cases — deliberately invalid profiles are rejected by the schema
    // ------------------------------------------------------------------

    private fun renderedTree(): ObjectNode =
        mapper.readTree(CapabilityProfileRenderer.render(DeviceFactsFixtures.snapshot(DeviceFactsFixtures.flagshipWithLidar()))) as ObjectNode

    @Test
    fun `invalid case 1 - removing a required domain object is rejected`() {
        val tree = renderedTree()
        tree.remove("depth")
        assertTrue(errorsOf(mapper.writeValueAsString(tree)).isNotEmpty(), "missing required 'depth' must fail")
    }

    @Test
    fun `invalid case 2 - a non-contract status value is rejected`() {
        val tree = renderedTree()
        (tree.get("camera") as ObjectNode).put("status", "excellent")
        assertTrue(errorsOf(mapper.writeValueAsString(tree)).isNotEmpty(), "unknown status must fail")
    }

    @Test
    fun `invalid case 3 - a timestamp without millisecond precision is rejected`() {
        val tree = renderedTree()
        tree.put("capturedAt", "2026-01-01T00:00:00Z")
        assertTrue(errorsOf(mapper.writeValueAsString(tree)).isNotEmpty(), "non-ms-precision capturedAt must fail")
    }

    @Test
    fun `invalid case 4 - an empty profileId is rejected`() {
        val tree = renderedTree()
        tree.put("profileId", "")
        assertTrue(errorsOf(mapper.writeValueAsString(tree)).isNotEmpty(), "empty profileId must fail")
    }

    @Test
    fun `invalid case 5 - a non-string details map is rejected`() {
        val tree = renderedTree()
        (tree.get("imu") as ObjectNode).putObject("details").put("imu.accelerometer", 42)
        assertTrue(errorsOf(mapper.writeValueAsString(tree)).isNotEmpty(), "non-string details value must fail")
    }

    // ------------------------------------------------------------------
    // Repo file sanity (schema path resolution)
    // ------------------------------------------------------------------

    @Test
    fun `the committed schema file is located from the test working directory`() {
        val file: File = RepoFiles.locate("packages/shared-contracts/schemas/capability/DeviceCapabilityProfile.schema.json")
        assertTrue(file.isFile && file.length() > 0)
    }
}
