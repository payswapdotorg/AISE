package org.payswap.aise.core.adapter

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.payswap.aise.core.json.JsonParser
import org.payswap.aise.core.json.JsonValue
import org.payswap.aise.core.session.RepoFiles
import java.io.File

/*
 * POST-005 — the deep-link codec mirror tests, byte-pinned against the
 * COMMITTED fixture corpus `packages/adapter-contract/handoff-fixtures/`
 * (each fixture carries the envelope AND its canonical `aise://task` URI —
 * the same corpus the TypeScript subpath tests run against, so wire drift
 * on either side is a test failure).
 *
 * Station classification (honest): this suite is JVM-deterministic — it
 * runs on the E2B/gradle station (`./gradlew :core:test`), never on a
 * device, and never as emulator evidence.
 */

class FieldTaskDeepLinkTest {

    /** One committed fixture: the envelope JSON + the canonical URI. */
    private data class HandoffFixture(val name: String, val envelope: JsonValue.JsonObject, val deepLink: String)

    private fun loadFixtures(): List<HandoffFixture> {
        val directory = RepoFiles.locate("packages/adapter-contract/handoff-fixtures")
        return directory.listFiles { file: File -> file.name.endsWith(".json") }
            .orEmpty()
            .map { it.name }
            .sorted()
            .map { name ->
                val payload = JsonParser.parse(
                    RepoFiles.readText("packages/adapter-contract/handoff-fixtures/$name"),
                ) as JsonValue.JsonObject
                HandoffFixture(
                    name = name,
                    envelope = payload.objectMember("handoff"),
                    deepLink = payload.stringMember("deepLink"),
                )
            }
    }

    /** Build the mirror value from a fixture envelope (typed reads). */
    private fun handoffFromFixture(envelope: JsonValue.JsonObject): FieldTaskHandoffValue {
        val versionContext = envelope.objectMember("versionContext")
        fun optionalString(name: String): String? =
            (versionContext.members[name] as? JsonValue.JsonString)?.value
        fun optionalLong(name: String): Long? =
            (versionContext.members[name] as? JsonValue.JsonLong)?.value
        return FieldTaskHandoffValue(
            contractVersion = envelope.stringMember("contractVersion"),
            handoffId = envelope.stringMember("handoffId"),
            purpose = envelope.stringMember("purpose"),
            projectId = envelope.stringMember("projectId"),
            taskId = envelope.stringMember("taskId"),
            taskType = envelope.stringMember("taskType"),
            intent = envelope.stringMember("intent"),
            targetRefs = envelope.arrayMember("targetRefs").items.map {
                (it as JsonValue.JsonString).value
            },
            origin = envelope.stringMember("origin"),
            originSurface = envelope.stringMember("originSurface"),
            boqImportId = optionalString("boqImportId"),
            boqRevision = optionalLong("boqRevision"),
            realityVersionId = optionalString("realityVersionId"),
            missionId = optionalString("missionId"),
            epistemicState = envelope.stringMember("epistemicState"),
            issuedAt = envelope.stringMember("issuedAt"),
        )
    }

    @Test
    fun `the committed corpus is present and carries the three continuation shapes`() {
        val fixtures = loadFixtures()
        assertEquals(3, fixtures.size)
        assertEquals(
            listOf(
                "FieldTaskHandoff.valid-field-capture-gap.json",
                "FieldTaskHandoff.valid-mobile-return.json",
                "FieldTaskHandoff.valid-post-work-capture.json",
            ),
            fixtures.map { it.name },
        )
    }

    @Test
    fun `format reproduces every committed deep link byte-identically`() {
        for (fixture in loadFixtures()) {
            assertEquals(fixture.deepLink, FieldTaskDeepLink.format(handoffFromFixture(fixture.envelope))) {
                "formatting drifted from the committed URI for ${fixture.name}"
            }
        }
    }

    @Test
    fun `parse reconstructs every committed envelope (round-trip)`() {
        for (fixture in loadFixtures()) {
            val result = FieldTaskDeepLink.parse(fixture.deepLink)
            assertTrue(result is FieldTaskDeepLinkParse.Valid) {
                "the committed URI must parse for ${fixture.name}: " +
                    (result as? FieldTaskDeepLinkParse.Invalid)?.reason
            }
            val valid = result as FieldTaskDeepLinkParse.Valid
            assertEquals(handoffFromFixture(fixture.envelope), valid.handoff) {
                "the parsed envelope must equal the committed envelope for ${fixture.name}"
            }
        }
    }

    @Test
    fun `the parsed handoff projects into the TaskIntent continuation identity`() {
        val fixture = loadFixtures().first { it.name == "FieldTaskHandoff.valid-post-work-capture.json" }
        val parsed = FieldTaskDeepLink.parse(fixture.deepLink) as FieldTaskDeepLinkParse.Valid
        val identity = parsed.handoff.taskIntentValue()
        assertEquals("task-postwork-outcome-77e2", identity.taskId)
        assertEquals("field-capture", identity.taskType)
        assertEquals("proj-7f3a2b", identity.projectRef)
        assertEquals(listOf("outcome-77e2", "scenario-55c1", "case-91ab"), identity.targetRefs)
        assertEquals("post-work-capture", identity.parameters["handoff.purpose"])
        assertEquals("web:outcomes", identity.parameters["handoff.origin"])
        assertEquals("OBSERVED", identity.parameters["handoff.epistemic-state"])
        assertEquals("mission-2026-000042", identity.parameters["handoff.mission"])
        assertEquals("boq-import-33d", identity.parameters["handoff.boq-import"])
        assertEquals("2", identity.parameters["handoff.boq-revision"])
    }

    @Test
    fun `parse rejects the typed defect classes (never a silent fallback)`() {
        val valid = loadFixtures().first().deepLink
        fun reasonFor(uri: String): String {
            val result = FieldTaskDeepLink.parse(uri)
            assertTrue(result is FieldTaskDeepLinkParse.Invalid) { "expected rejection for $uri" }
            return (result as FieldTaskDeepLinkParse.Invalid).reason
        }
        assertTrue(reasonFor(valid.replace("aise://", "other://")).contains("not an aise://task"))
        assertTrue(reasonFor("$valid&extra=x").contains("unknown parameter 'extra'"))
        assertTrue(reasonFor("$valid&purpose=field-capture").contains("duplicate parameter 'purpose'"))
        assertTrue(reasonFor(valid.replace(Regex("&epistemic=[^&]*"), "")).contains("missing required parameter"))
        assertTrue(reasonFor(valid.replace("v=1", "v=2")).contains("unsupported grammar version"))
        assertTrue(reasonFor(valid.replace("%20", "%2 ")).contains("malformed"))
        assertTrue(reasonFor(valid.replace("task=", "tas%6B=")).contains("canonical"))
    }

    @Test
    fun `the percent-encoding primitives mirror the TypeScript codec`() {
        assertEquals("A-z0_9-.~", FieldTaskDeepLink.encodeValue("A-z0_9-.~"))
        assertEquals("a%20b%2Cc%3Bd%3Ae", FieldTaskDeepLink.encodeValue("a b,c;d:e"))
        assertEquals("a b", FieldTaskDeepLink.decodeValue("a%20b"))
        assertEquals(null, FieldTaskDeepLink.decodeValue("a%2"))
        assertEquals(null, FieldTaskDeepLink.decodeValue("a/b"))
        assertEquals(null, FieldTaskDeepLink.decodeValue("a+b"))
    }
}
