package org.payswap.aise.core.session

import com.fasterxml.jackson.databind.ObjectMapper
import com.networknt.schema.JsonSchemaFactory
import com.networknt.schema.SpecVersion
import java.io.File
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.assertDoesNotThrow
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Test

/**
 * Manifest schema-validation round-trip (AISE-005 work order §5.3):
 *
 *  - a session manifest produced by [SessionManifestExporter] VALIDATES
 *    against the COMMITTED AISE-003 `CaptureSessionEnvelope.schema.json`
 *    (and its embedded Evidence records against `Evidence.schema.json`);
 *  - the committed 003 fixture validates too (sanity for the validator
 *    wiring — known-good data must pass);
 *  - two deliberately-INVALID mutations are rejected (the negative cases
 *    the work order demands).
 *
 * The validator (networknt json-schema-validator, Jackson) is a TEST-scope
 * dependency — :core's frozen zero-runtime-dependency invariant is
 * untouched (see NoNetworkDependencyTest's documented allowlist extension).
 */
class SessionManifestExporterTest {

    private val mapper = ObjectMapper()

    private fun schema(relative: String) =
        JsonSchemaFactory.getInstance(SpecVersion.VersionFlag.V7)
            .getSchema(RepoFiles.locate(relative).inputStream())

    private val envelopeSchema = schema("packages/shared-contracts/schemas/sync/CaptureSessionEnvelope.schema.json")
    private val evidenceSchema = schema("packages/shared-contracts/schemas/evidence/Evidence.schema.json")

    private fun finalizedRecord(): CaptureSessionRecord {
        val journal = SessionFixtures.happyPathJournal()
        return SessionReplay.replay(journal)
    }

    private fun recordWithRecoveryAndCorruption(): CaptureSessionRecord {
        val journal = SessionFixtures.happyPathJournal().dropLast(1) +
            AssetCorrupted(
                sequence = 7L,
                atUtcMillis = SessionFixtures.T7,
                assetId = "a-0002",
                reason = AssetCorruptionReason.CONTENT_ID_MISMATCH,
            ) +
            SessionFixtures.reopened(
                8,
                SessionFixtures.T7 + 1,
                SessionRecoveryAudit(
                    discardedTmp = listOf("tmp/a-0003.mp4.tmp"),
                    completedRenames = emptyList(),
                    verifiedAssets = listOf("a-0001"),
                    rehashedAssets = emptyList(),
                    corruptedAssets = listOf("a-0002"),
                ),
            ) +
            SessionFixtures.state(9, SessionFixtures.T7 + 2, CaptureSessionStatus.CAPTURING, CaptureSessionStatus.FINALIZED)
        return SessionReplay.replay(journal)
    }

    // ------------------------------------------------------------------
    // Valid round-trips
    // ------------------------------------------------------------------

    @Test
    fun `exported manifest validates against the committed CaptureSessionEnvelope schema`() {
        val manifest = SessionManifestExporter.export(finalizedRecord())
        val errors = envelopeSchema.validate(mapper.readTree(manifest))
        assertEquals(emptySet<String>(), errors.map { it.message }.toSet(), "schema errors: $errors")
    }

    @Test
    fun `every asset in the exported manifest validates against the committed Evidence schema`() {
        val manifest = SessionManifestExporter.export(finalizedRecord())
        val tree = mapper.readTree(manifest)
        val assets = tree.get("assets")
        assertEquals(2, assets.size())
        for (asset in assets) {
            val errors = evidenceSchema.validate(asset)
            assertEquals(emptySet<String>(), errors.map { it.message }.toSet(), "evidence schema errors: $errors")
        }
    }

    @Test
    fun `manifest with recovery audit and corrupted assets still validates (open-object contract)`() {
        val record = recordWithRecoveryAndCorruption()
        val manifest = SessionManifestExporter.export(record)
        val tree = mapper.readTree(manifest)
        // The corrupted asset is excluded from assets…
        assertEquals(1, tree.get("assets").size())
        // …and recorded explicitly in the recovery audit.
        val recovery = tree.get("recovery")
        assertEquals(1, recovery.get("reopenCount").asInt())
        assertEquals(1, recovery.get("discardedTmpFiles").asInt())
        assertEquals("a-0002", recovery.get("corruptedAssets").get(0).asText())
        val errors = envelopeSchema.validate(tree)
        assertEquals(emptySet<String>(), errors.map { it.message }.toSet(), "schema errors: $errors")
    }

    @Test
    fun `the committed 003 fixture validates - validator wiring sanity`() {
        val fixture = RepoFiles.readText("packages/shared-contracts/fixtures/sync/CaptureSessionEnvelope.valid.json")
        val errors = envelopeSchema.validate(mapper.readTree(fixture))
        assertEquals(emptySet<String>(), errors.map { it.message }.toSet(), "fixture must validate: $errors")
    }

    @Test
    fun `manifest is deterministic - same record exports identical bytes`() {
        assertEquals(
            SessionManifestExporter.export(finalizedRecord()),
            SessionManifestExporter.export(finalizedRecord()),
        )
    }

    @Test
    fun `manifest carries the required wire fields with correct shapes`() {
        val tree = mapper.readTree(SessionManifestExporter.export(finalizedRecord()))
        assertEquals("1.0.0", tree.get("contractVersion").asText())
        assertEquals(SessionFixtures.SESSION_ID, tree.get("sessionId").asText())
        assertEquals("2026-01-01T00:00:00.000Z", tree.get("startedAt").asText())
        assertEquals("2026-01-01T00:00:06.000Z", tree.get("endedAt").asText())
        assertTrue(tree.get("capabilityProfile").get("profileId").asText().isNotEmpty())
        assertEquals(8, tree.get("capabilityProfile").let { p ->
            listOf("device", "camera", "depth", "imu", "tracking", "compute", "calibration", "environment")
                .count { p.has(it) }
        })
        val asset0 = tree.get("assets").get(0)
        assertEquals("image/jpeg", asset0.get("mediaType").asText())
        assertEquals("STILL_IMAGERY", asset0.get("acquisitionMethod").asText())
        assertEquals(64, asset0.get("contentId").asText().length)
        // Verbatim sensor metadata is preserved into acquisitionMetadata:
        assertEquals("still", asset0.get("acquisitionMetadata").get("capture.kind").asText())
        assertEquals(SessionFixtures.SESSION_ID, asset0.get("acquisitionMetadata").get("session.id").asText())
        assertEquals("device-field-007", asset0.get("acquisitionMetadata").get("device.id").asText())
    }

    @Test
    fun `mission ref flows into the manifest and asset metadata when present`() {
        val journal = listOf(
            SessionFixtures.created(missionRef = SessionFixtures.MISSION_REF),
            SessionFixtures.state(2, SessionFixtures.T1, CaptureSessionStatus.DRAFT, CaptureSessionStatus.CAPTURING),
            SessionFixtures.state(3, SessionFixtures.T2, CaptureSessionStatus.CAPTURING, CaptureSessionStatus.FINALIZED),
        )
        val tree = mapper.readTree(SessionManifestExporter.export(SessionReplay.replay(journal)))
        assertEquals(SessionFixtures.MISSION_REF, tree.get("missionRef").asText())
        assertEquals(0, tree.get("assets").size())
        val errors = envelopeSchema.validate(tree)
        assertEquals(emptySet<String>(), errors.map { it.message }.toSet())
    }

    // ------------------------------------------------------------------
    // Negative cases — deliberately invalid manifests are rejected
    // ------------------------------------------------------------------

    @Test
    fun `invalid case 1 - a required field removed is rejected by the schema`() {
        val manifest = SessionManifestExporter.export(finalizedRecord())
        val tree = mapper.readTree(manifest) as com.fasterxml.jackson.databind.node.ObjectNode
        // Remove the REQUIRED deviceIdentity:
        tree.remove("deviceIdentity")
        val errors = envelopeSchema.validate(tree)
        assertTrue(errors.isNotEmpty(), "removing required deviceIdentity must fail schema validation")
    }

    @Test
    fun `invalid case 2 - a malformed contentId is rejected by the schema`() {
        val manifest = SessionManifestExporter.export(finalizedRecord())
        val tree = mapper.readTree(manifest)
        // Uppercase/truncated content id violates ^[0-9a-f]{64}$:
        (tree.get("assets").get(0) as com.fasterxml.jackson.databind.node.ObjectNode).put("contentId", "ABCDEF0123")
        val errors = envelopeSchema.validate(tree)
        assertTrue(errors.isNotEmpty(), "malformed contentId must fail schema validation")
    }

    @Test
    fun `invalid case 3 - a wrong acquisitionMethod enum value is rejected`() {
        val manifest = SessionManifestExporter.export(finalizedRecord())
        val tree = mapper.readTree(manifest)
        (tree.get("assets").get(0) as com.fasterxml.jackson.databind.node.ObjectNode).put("acquisitionMethod", "SELFIE")
        val errors = envelopeSchema.validate(tree)
        assertTrue(errors.isNotEmpty(), "unknown acquisitionMethod must fail schema validation")
    }

    @Test
    fun `invalid case 4 - a timestamp without millisecond precision is rejected`() {
        val manifest = SessionManifestExporter.export(finalizedRecord())
        val tree = mapper.readTree(manifest) as com.fasterxml.jackson.databind.node.ObjectNode
        tree.put("startedAt", "2026-01-01T00:00:00Z")
        val errors = envelopeSchema.validate(tree)
        assertTrue(errors.isNotEmpty(), "non-ms-precision timestamp must fail schema validation")
    }

    // ------------------------------------------------------------------
    // Export refusals — fail closed
    // ------------------------------------------------------------------

    @Test
    fun `exporting an open session is refused`() {
        val record = SessionReplay.replay(SessionFixtures.happyPathJournal().dropLast(1))
        assertThrows(SessionManifestExporter.ManifestExportRefusedException::class.java) {
            SessionManifestExporter.export(record)
        }
    }

    @Test
    fun `exporting a draft session is refused`() {
        val record = SessionReplay.replay(listOf(SessionFixtures.created()))
        assertThrows(SessionManifestExporter.ManifestExportRefusedException::class.java) {
            SessionManifestExporter.export(record)
        }
    }

    @Test
    fun `a synced session still exports (synced is a transport fact, not an export blocker)`() {
        val journal = SessionFixtures.happyPathJournal() +
            SessionFixtures.state(8, SessionFixtures.T7, CaptureSessionStatus.FINALIZED, CaptureSessionStatus.SYNCED)
        val record = SessionReplay.replay(journal)
        assertDoesNotThrow { SessionManifestExporter.export(record) }
    }

    @Test
    fun `manifest parses back with the core json parser - closed loop with no jackson on main`() {
        // The MANIFEST is produced by :core main code without Jackson; this proves the
        // bytes are consumable by the module's own strict parser (journal/recovery reads).
        val manifest = SessionManifestExporter.export(finalizedRecord())
        val parsed = org.payswap.aise.core.json.JsonParser.parse(manifest.trim())
        assertTrue(parsed is org.payswap.aise.core.json.JsonValue.JsonObject)
    }
}
