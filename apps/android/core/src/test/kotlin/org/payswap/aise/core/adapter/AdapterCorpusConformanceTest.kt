package org.payswap.aise.core.adapter

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.payswap.aise.core.json.JsonValue

/**
 * THE mobile conformance suite over the committed PROD-016 corpus (PROD-019,
 * obligation A-R4): schema-validates every committed fixture against the
 * committed schemas, then runs the C0–C9 conformance checks with the mobile
 * adapter's binding — the non-TypeScript consumer's mirror of the package's
 * own conformance suite.
 */
class AdapterCorpusConformanceTest {

    private val corpus = AdapterCorpus.load()

    // ------------------------------------------------------------------
    // Schema validation of the committed server records (A-R4)
    // ------------------------------------------------------------------

    @Test
    fun `every valid fixture validates against its committed schema`() {
        val valid = corpus.fixtures.filter { it.kind == AdapterFixtureRecord.FixtureKind.VALID }
        assertTrue(valid.isNotEmpty(), "the corpus must carry valid fixtures")
        for (fixture in valid) {
            val errors = AdapterCorpus.schemaValidator.validate(fixture.objectName, canonicalBytes(fixture.payload))
            assertEquals(
                emptyList<String>(),
                errors,
                "valid fixture ${fixture.fileName} must validate against ${fixture.objectName}.schema.json",
            )
        }
    }

    @Test
    fun `every deliberately-invalid fixture is rejected by its committed schema`() {
        val invalid = corpus.fixtures.filter { it.kind == AdapterFixtureRecord.FixtureKind.INVALID }
        assertTrue(invalid.size >= 2, "the corpus must carry at least two invalid fixtures per family")
        for (fixture in invalid) {
            val errors = AdapterCorpus.schemaValidator.validate(fixture.objectName, canonicalBytes(fixture.payload))
            assertTrue(
                errors.isNotEmpty(),
                "invalid fixture ${fixture.fileName} must be REJECTED by ${fixture.objectName}.schema.json",
            )
        }
    }

    @Test
    fun `every valid fixture round-trips losslessly through the frozen canonical codec`() {
        // The non-TS consumer's C2/C3 substrate: parse → canonical re-render is
        // a stable function of the value (sorted keys, 2-space indent).
        for (fixture in corpus.validFixtures()) {
            val canonical = canonicalBytes(fixture.payload)
            val reparsed = org.payswap.aise.core.json.JsonParser.parse(canonical)
            assertTrue(
                canonicallyEqual(fixture.payload, reparsed),
                "fixture ${fixture.fileName} must survive canonical re-rendering unchanged",
            )
            assertEquals(canonical, canonicalBytes(reparsed))
        }
    }

    // ------------------------------------------------------------------
    // C0 — corpus completeness
    // ------------------------------------------------------------------

    @Test
    fun `C0 every registered adapter wire object has at least one valid fixture`() {
        val objectsWithValid = corpus.validFixtures().map { it.objectName }.toSet()
        for (objectName in corpus.registeredObjects) {
            assertTrue(
                objectName in objectsWithValid,
                "no valid fixture for $objectName — corpus incomplete",
            )
        }
    }

    @Test
    fun `C0 the named denial-failure-blocked scenario fixtures exist`() {
        for (scenario in AdapterContractVersion.REQUIRED_SCENARIO_FIXTURES) {
            assertTrue(corpus.byFileName(scenario) != null, "missing scenario fixture $scenario")
        }
    }

    // ------------------------------------------------------------------
    // C1 — the declared profile is schema-valid
    // ------------------------------------------------------------------

    private fun declaredProfile(): ClientCapabilityProfile {
        val snapshot = org.payswap.aise.core.session.CapabilitySnapshot.baseline(
            profileId = "profile-mobile-field-sandbox",
            capturedAtUtcMillis = 1_767_225_600_000L, // 2026-01-01T00:00:00.000Z (fixed constant)
            deviceIdentity = org.payswap.aise.core.session.SessionDeviceIdentity(
                deviceId = "device-sandbox-01",
                platform = "android",
                model = "sandbox",
                osVersion = "15",
                appVersion = "0.1.0",
            ),
            imuActive = true,
        )
        return MobileFieldAdapterProfile.declare(
            snapshot,
            profileId = "profile-android-mobile-field-declared",
            capturedAtIso = "2026-01-01T00:00:00.000Z",
        )
    }

    @Test
    fun `C1 the declared mobile-field profile validates against the committed schema`() {
        val profile = declaredProfile()
        val errors = AdapterCorpus.schemaValidator.validate(
            "ClientCapabilityProfile",
            canonicalBytes(profile.toJsonObject()),
        )
        assertEquals(emptyList<String>(), errors, "the declared profile must be schema-valid: $errors")
    }

    // ------------------------------------------------------------------
    // C0–C9 — the conformance harness runs (lossless + mobile bindings)
    // ------------------------------------------------------------------

    @Test
    fun `the lossless golden binding passes every C0-C9 check by construction`() {
        val report = runConformance(
            createLosslessBinding(referenceMobileFieldProfile()),
            corpus,
            AdapterCorpus.schemaValidator,
        )
        assertTrue(report.passed, "lossless binding must pass: " + report.checks.filter { !it.passed })
        assertEquals((0..9).map { "C$it" }, report.checks.map { it.checkId })
    }

    @Test
    fun `the mobile adapter binding passes every C0-C9 check`() {
        val report = runConformance(
            MobileAdapterBinding.create(declaredProfile()),
            corpus,
            AdapterCorpus.schemaValidator,
        )
        assertTrue(
            report.passed,
            "the mobile adapter binding must pass contract conformance: " +
                report.checks.filter { !it.passed }.joinToString { "${it.checkId}: ${it.detail}" },
        )
    }

    // ------------------------------------------------------------------
    // Discrimination (sabotage bindings fail explicit checks)
    // ------------------------------------------------------------------

    @Test
    fun `a binding that drops an authoritative field fails C5`() {
        val base = MobileAdapterBinding.create(declaredProfile())
        val sabotaged = object : AdapterConformanceBinding by base {
            override fun presentedFields(objectName: String, payload: JsonValue.JsonObject): List<String> =
                base.presentedFields(objectName, payload) - "readinessStatus"
        }
        val report = runConformance(sabotaged, corpus, AdapterCorpus.schemaValidator)
        val c5 = report.checks.first { it.checkId == "C5" }
        assertTrue(!c5.passed, "dropping an authoritative field must fail C5")
        assertTrue(c5.detail.contains("readinessStatus"))
    }

    @Test
    fun `a binding that hides denials fails C7`() {
        val base = MobileAdapterBinding.create(declaredProfile())
        val sabotaged = object : AdapterConformanceBinding by base {
            override fun presentedFields(objectName: String, payload: JsonValue.JsonObject): List<String> =
                base.presentedFields(objectName, payload) - "denials"
        }
        val report = runConformance(sabotaged, corpus, AdapterCorpus.schemaValidator)
        assertTrue(!report.checks.first { it.checkId == "C7" }.passed, "hiding denials must fail C7")
    }

    @Test
    fun `a binding that hides the typed operation failure fails C8`() {
        val base = MobileAdapterBinding.create(declaredProfile())
        val sabotaged = object : AdapterConformanceBinding by base {
            override fun presentedFields(objectName: String, payload: JsonValue.JsonObject): List<String> =
                base.presentedFields(objectName, payload) - "failure"
        }
        val report = runConformance(sabotaged, corpus, AdapterCorpus.schemaValidator)
        assertTrue(!report.checks.first { it.checkId == "C8" }.passed, "hiding the typed failure must fail C8")
    }

    @Test
    fun `a binding that hides next-best-action blockers fails C9`() {
        val base = MobileAdapterBinding.create(declaredProfile())
        val sabotaged = object : AdapterConformanceBinding by base {
            override fun presentedFields(objectName: String, payload: JsonValue.JsonObject): List<String> =
                base.presentedFields(objectName, payload) - "blockers"
        }
        val report = runConformance(sabotaged, corpus, AdapterCorpus.schemaValidator)
        assertTrue(!report.checks.first { it.checkId == "C9" }.passed, "hiding blockers must fail C9")
    }

    @Test
    fun `a binding that mutates an authoritative field fails C2 and C3`() {
        val base = MobileAdapterBinding.create(declaredProfile())
        val sabotaged = object : AdapterConformanceBinding by base {
            override fun emit(objectName: String, payload: JsonValue.JsonObject): JsonValue.JsonObject {
                val emitted = base.emit(objectName, payload)
                if (objectName == "RealitySummary") {
                    // Mutate an authoritative field (weaken a readiness statement).
                    return JsonValue.JsonObject(emitted.members + ("readinessStatus" to JsonValue.str("READY")))
                }
                return emitted
            }
        }
        val report = runConformance(sabotaged, corpus, AdapterCorpus.schemaValidator)
        assertTrue(!report.checks.first { it.checkId == "C2" }.passed, "mutating an authoritative field must fail C2")
        assertTrue(!report.checks.first { it.checkId == "C3" }.passed, "mutating an authoritative field must fail C3")
    }

    @Test
    fun `a binding claiming a mode its profile does not support fails C6`() {
        val base = MobileAdapterBinding.create(declaredProfile())
        val sabotaged = object : AdapterConformanceBinding by base {
            override fun supportedInteractionModes(): List<String> =
                base.supportedInteractionModes() + "table-review" // compact screen — not honest
        }
        val report = runConformance(sabotaged, corpus, AdapterCorpus.schemaValidator)
        val c6 = report.checks.first { it.checkId == "C6" }
        assertTrue(!c6.passed, "claiming an unsupported mode must fail C6")
        assertTrue(c6.detail.contains("table-review"))
    }

    // ------------------------------------------------------------------
    // Helpers
    // ------------------------------------------------------------------

    private fun referenceMobileFieldProfile(): ClientCapabilityProfile =
        ClientCapabilityProfile.fromJson(
            org.payswap.aise.core.json.JsonParser.parse(
                AdapterCorpus.readFixtureText("capability/ClientCapabilityProfile.valid-mobile-field.json"),
            ) as JsonValue.JsonObject,
        )
}
