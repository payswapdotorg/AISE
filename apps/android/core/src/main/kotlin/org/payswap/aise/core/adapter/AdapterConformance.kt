package org.payswap.aise.core.adapter

import org.payswap.aise.core.json.JsonValue
import org.payswap.aise.core.json.JsonWriter

/**
 * The adapter conformance harness — the Kotlin (non-TypeScript consumer)
 * mirror of `runConformance` in `packages/adapter-contract/src/conformance.ts`
 * (PROD-019, obligation A-R4): the mobile adapter proves contract conformance
 * by running its PLATFORM BINDING against the committed PROD-016 fixture
 * corpus, checking C0–C9.
 *
 * PURITY: [runConformance] is deterministic and I/O-free — the corpus and the
 * schema validator arrive as data/functions. The test side loads the
 * committed corpus (every file under `packages/adapter-contract/fixtures/`)
 * and injects the networknt draft-07 validator (TEST scope) backed by the
 * committed `packages/adapter-contract/schemas/` JSON-Schema files; main
 * scope stays dependency-free.
 *
 * NO-CLIENT-AUTHORITY: the binding interface has NO method that can mutate
 * authoritative state — only an emission the harness VERIFIES is lossless.
 * Sabotage bindings that drop, mutate or hide authoritative fields FAIL
 * explicit checks (discrimination-tested, mirroring the package's tests).
 */

/** One fixture record of the committed corpus (data form). */
data class AdapterFixtureRecord(
    val objectName: String,
    val kind: FixtureKind,
    /** Family-relative file name, e.g. `authorization/AuthorizationContext.valid-denial.json`. */
    val fileName: String,
    val payload: JsonValue.JsonObject,
    /** The schema-required TOP-LEVEL field names (derived from the committed schema by the loader). */
    val schemaRequiredFields: List<String>,
) {
    enum class FixtureKind { VALID, INVALID, VERSION_MISMATCH }
}

/** The platform-neutral fixture corpus the harness consumes. */
data class ConformanceCorpus(
    val fixtures: List<AdapterFixtureRecord>,
    /** The registered adapter wire objects (from the committed `schemas/manifest.json`). */
    val registeredObjects: List<String>,
    /** The scenario fixture names the corpus must contain (family-relative). */
    val requiredScenarioFixtures: List<String> = AdapterContractVersion.REQUIRED_SCENARIO_FIXTURES,
) {
    fun byFileName(name: String): AdapterFixtureRecord? = fixtures.firstOrNull { it.fileName == name }
    fun validFixtures(): List<AdapterFixtureRecord> = fixtures.filter { it.kind == AdapterFixtureRecord.FixtureKind.VALID }
}

/**
 * The injected draft-07 schema validator: validates a payload's canonical
 * text against the committed schema of the named object; returns the error
 * messages (empty = valid). The TEST side binds this to networknt + the
 * committed `.schema.json` files.
 */
fun interface SchemaValidator {
    fun validate(objectName: String, payloadText: String): List<String>
}

/**
 * The platform binding an adapter implements to run contract conformance.
 * There is deliberately NO method that can mutate authoritative state.
 */
interface AdapterConformanceBinding {
    /** Stable id of this binding (for the report). */
    val bindingId: String

    /** The adapter's declared client capability profile (honest facts). */
    val profile: ClientCapabilityProfile

    /**
     * The binding's emission of one semantic object after its internal
     * handling (serialization/caching/replay). Must return a JSON object —
     * the harness verifies losslessness against the fixture.
     */
    fun emit(objectName: String, payload: JsonValue.JsonObject): JsonValue.JsonObject

    /**
     * The top-level field names of this payload the binding actually renders
     * / presents to the user (used to prove authoritative fields are
     * surfaced, not hidden).
     */
    fun presentedFields(objectName: String, payload: JsonValue.JsonObject): List<String>

    /**
     * The interaction modes this binding actually implements. Must be a
     * subset of the modes its profile honestly supports.
     */
    fun supportedInteractionModes(): List<String>
}

/** One check result. */
data class ConformanceCheckResult(
    val checkId: String,
    val description: String,
    val passed: Boolean,
    val detail: String,
)

/** The conformance report. */
data class ConformanceReport(
    val bindingId: String,
    val passed: Boolean,
    val checks: List<ConformanceCheckResult>,
)

/** Canonical wire bytes of a payload (sorted keys, 2-space indent, trailing newline). */
internal fun canonicalBytes(payload: JsonValue): String = JsonWriter.pretty(payload)

/**
 * Deep equality via canonical bytes — the same discipline as the TypeScript
 * codec comparison (same value ⇒ identical bytes).
 */
internal fun canonicallyEqual(left: JsonValue, right: JsonValue): Boolean =
    canonicalBytes(left) == canonicalBytes(right)

/**
 * Runs contract-level conformance (C0–C9) for one adapter binding against a
 * fixture corpus. DETERMINISTIC and PURE. An adapter passes contract
 * conformance only when [ConformanceReport.passed] is true.
 */
fun runConformance(
    binding: AdapterConformanceBinding,
    corpus: ConformanceCorpus,
    schemaValidator: SchemaValidator,
): ConformanceReport {
    val validFixtures = corpus.validFixtures()
    val results = mutableListOf<ConformanceCheckResult>()
    val catalogue = ConformanceChecks.CATALOGUE.associateBy { it.checkId }

    fun begin(checkId: String) = mutableListOf<String>() to (catalogue[checkId] ?: ConformanceCheckSpec(checkId, "unknown check $checkId"))

    fun add(checkId: String, failures: MutableList<String>, spec: ConformanceCheckSpec) {
        results.add(
            ConformanceCheckResult(
                checkId = spec.checkId,
                description = spec.description,
                passed = failures.isEmpty(),
                detail = if (failures.isEmpty()) "ok" else failures.joinToString("; "),
            ),
        )
    }

    /* C0 — corpus completeness ------------------------------------------ */
    run {
        val (failures, spec) = begin("C0")
        for (objectName in corpus.registeredObjects) {
            val count = validFixtures.count { it.objectName == objectName }
            if (count == 0) failures.add("no valid fixture for $objectName")
        }
        for (scenario in corpus.requiredScenarioFixtures) {
            if (corpus.byFileName(scenario) == null) failures.add("missing scenario fixture $scenario")
        }
        add("C0", failures, spec)
    }

    /* C1 — profile validity ---------------------------------------------- */
    run {
        val (failures, spec) = begin("C1")
        val errors = schemaValidator.validate("ClientCapabilityProfile", canonicalBytes(binding.profile.toJsonObject()))
        if (errors.isNotEmpty()) failures.addAll(errors)
        add("C1", failures, spec)
    }

    /* C2 + C3 — lossless round-trip / canonical bytes ---------------------- */
    run {
        val (c2, spec2) = begin("C2")
        val (c3, spec3) = begin("C3")
        for (fixture in validFixtures) {
            val emitted = try {
                binding.emit(fixture.objectName, fixture.payload)
            } catch (t: Throwable) {
                c2.add("${fixture.fileName}: emission failed (${t.message})")
                c3.add("${fixture.fileName}: emission failed (${t.message})")
                continue
            }
            if (!canonicallyEqual(fixture.payload, emitted)) {
                c2.add("${fixture.fileName}: emission is not deep-equal to the fixture")
                c3.add("${fixture.fileName}: emission wire bytes differ from the fixture")
            }
        }
        add("C2", c2, spec2)
        add("C3", c3, spec3)
    }

    /* C4 + C5 — presented fields ------------------------------------------ */
    run {
        val (c4, spec4) = begin("C4")
        val (c5, spec5) = begin("C5")
        for (fixture in validFixtures) {
            val presented = binding.presentedFields(fixture.objectName, fixture.payload).toSet()
            for (field in fixture.schemaRequiredFields) {
                if (field !in presented) {
                    c4.add("${fixture.fileName}: required field '$field' is not presented")
                }
            }
            for (field in AuthoritativeFields.of(fixture.objectName)) {
                val required = field in fixture.schemaRequiredFields
                val presentInPayload = field in fixture.payload.members
                if ((required || presentInPayload) && field !in presented) {
                    c5.add("${fixture.fileName}: authoritative field '$field' is not presented")
                }
            }
        }
        add("C4", c4, spec4)
        add("C5", c5, spec5)
    }

    /* C6 — honest interaction modes --------------------------------------- */
    run {
        val (failures, spec) = begin("C6")
        val honestModes = deriveInteractionModes(binding.profile).map { it.wireName }.toSet()
        for (mode in binding.supportedInteractionModes()) {
            if (mode !in honestModes) {
                failures.add("mode '$mode' is claimed but not supported by the declared profile")
            }
        }
        add("C6", failures, spec)
    }

    /* C7 — denial surfacing ------------------------------------------------ */
    run {
        val (failures, spec) = begin("C7")
        val denialFixture = corpus.byFileName("authorization/AuthorizationContext.valid-denial.json")
        if (denialFixture != null) {
            val presented = binding.presentedFields("AuthorizationContext", denialFixture.payload).toSet()
            if ("denials" !in presented) {
                failures.add("the authorization-denial scenario does not surface 'denials'")
            }
        }
        add("C7", failures, spec)
    }

    /* C8 — failure surfacing ------------------------------------------------ */
    run {
        val (failures, spec) = begin("C8")
        val failureFixture = corpus.byFileName("result/OperationResult.valid-failed.json")
        if (failureFixture != null) {
            val presented = binding.presentedFields("OperationResult", failureFixture.payload).toSet()
            if ("status" !in presented) failures.add("the operation-failure scenario does not surface 'status'")
            if ("failure" !in presented) failures.add("the operation-failure scenario does not surface 'failure'")
        }
        add("C8", failures, spec)
    }

    /* C9 — blocked action surfacing ------------------------------------------ */
    run {
        val (failures, spec) = begin("C9")
        val blockedFixture = corpus.byFileName("action/NextBestAction.valid-blocked.json")
        if (blockedFixture != null) {
            val presented = binding.presentedFields("NextBestAction", blockedFixture.payload).toSet()
            if ("status" !in presented) failures.add("the blocked-action scenario does not surface 'status'")
            if ("blockers" !in presented) failures.add("the blocked-action scenario does not surface 'blockers'")
        }
        add("C9", failures, spec)
    }

    return ConformanceReport(
        bindingId = binding.bindingId,
        passed = results.all { it.passed },
        checks = results,
    )
}

/**
 * Creates the LOSSLESS REFERENCE binding for a profile — the golden template
 * (the Kotlin twin of `createLosslessBinding`): it presents every field,
 * emits values losslessly and claims exactly the modes its profile supports.
 * It passes every conformance check BY CONSTRUCTION (asserted by tests).
 */
fun createLosslessBinding(
    profile: ClientCapabilityProfile,
    bindingId: String = "lossless-mirror",
): AdapterConformanceBinding = object : AdapterConformanceBinding {
    override val bindingId: String = bindingId
    override val profile: ClientCapabilityProfile = profile

    override fun emit(objectName: String, payload: JsonValue.JsonObject): JsonValue.JsonObject = payload

    override fun presentedFields(objectName: String, payload: JsonValue.JsonObject): List<String> =
        payload.members.keys.toList()

    override fun supportedInteractionModes(): List<String> =
        deriveInteractionModes(profile).map { it.wireName }
}
