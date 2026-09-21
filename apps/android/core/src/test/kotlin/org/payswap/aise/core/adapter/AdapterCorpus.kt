package org.payswap.aise.core.adapter

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import com.networknt.schema.JsonSchemaFactory
import com.networknt.schema.SpecVersion
import java.io.File
import org.payswap.aise.core.json.JsonParser
import org.payswap.aise.core.json.JsonValue
import org.payswap.aise.core.session.RepoFiles

/**
 * Test-side loader of the COMMITTED PROD-016 corpus (PROD-019, A-R4): reads
 * `packages/adapter-contract/fixtures/` + `schemas/manifest.json` from the
 * repository and builds the pure [ConformanceCorpus] + the networknt-backed
 * [SchemaValidator] the conformance harness consumes.
 *
 * Mirrors the corpus-loader discipline of the TypeScript package
 * (`fixtures-loader.ts` — the only fs-touching helper there; this one is its
 * Kotlin test-side twin). All fixture timestamps/content ids are fixed
 * constants — no clock, no randomness, no network.
 */
object AdapterCorpus {

    private val mapper = ObjectMapper()

    /** The package root of the committed adapter contract. */
    private val packageRoot: File =
        RepoFiles.locate("packages/adapter-contract/README.md").parentFile

    /** The manifest entries: name → (family, contractVersion, schemaFile). */
    data class ManifestEntry(
        val name: String,
        val family: String,
        val contractVersion: String,
        val schemaFile: String,
    )

    val manifest: List<ManifestEntry> by lazy {
        val manifestJson = mapper.readTree(File(packageRoot, "schemas/manifest.json"))
        manifestJson.get("objects").map { entry ->
            ManifestEntry(
                name = entry.get("name").asText(),
                family = entry.get("family").asText(),
                contractVersion = entry.get("contractVersion").asText(),
                schemaFile = entry.get("file").asText(),
            )
        }
    }

    val registeredObjects: List<String> = manifest.map { it.name }.sorted()

    /** The manifest's top-level contractVersion (must equal the mirror). */
    val manifestContractVersion: String =
        mapper.readTree(File(packageRoot, "schemas/manifest.json")).get("contractVersion").asText()

    private fun schemaFor(objectName: String): com.networknt.schema.JsonSchema {
        val entry = manifest.first { it.name == objectName }
        return JsonSchemaFactory.getInstance(SpecVersion.VersionFlag.V7)
            .getSchema(File(packageRoot, entry.schemaFile).inputStream())
    }

    /** The networknt-backed validator over the committed schemas. */
    val schemaValidator: SchemaValidator = SchemaValidator { objectName, payloadText ->
        val errors = schemaFor(objectName).validate(mapper.readTree(payloadText))
        errors.map { it.message }
    }

    /** The schema-required TOP-LEVEL field names of an object (sorted). */
    fun schemaRequiredFields(objectName: String): List<String> {
        val entry = manifest.first { it.name == objectName }
        val schema: JsonNode = mapper.readTree(File(packageRoot, entry.schemaFile))
        val required = schema.get("required") ?: return emptyList()
        return required.map { it.asText() }.sorted()
    }

    /** Loads every committed fixture as a corpus record. */
    fun load(): ConformanceCorpus {
        val fixturesDir = File(packageRoot, "fixtures")
        require(fixturesDir.isDirectory) { "fixtures directory not found: ${fixturesDir.absolutePath}" }
        val records = mutableListOf<AdapterFixtureRecord>()
        for (familyDir in fixturesDir.listFiles()!!.filter { it.isDirectory }.sortedBy { it.name }) {
            for (file in familyDir.listFiles()!!.filter { it.isFile }.sortedBy { it.name }) {
                val objectName = file.name.substringBefore(".")
                val kindSegment = file.name.substringAfter(".").substringBefore(".")
                val kind = when {
                    kindSegment == "valid" || kindSegment.startsWith("valid-") ->
                        AdapterFixtureRecord.FixtureKind.VALID

                    kindSegment.startsWith("invalid-") ->
                        AdapterFixtureRecord.FixtureKind.INVALID

                    kindSegment == "version-mismatch" ->
                        AdapterFixtureRecord.FixtureKind.VERSION_MISMATCH

                    else -> error("unrecognized fixture kind in ${file.name}")
                }
                val text = file.readText(Charsets.UTF_8)
                val payload = JsonParser.parse(text) as JsonValue.JsonObject
                records.add(
                    AdapterFixtureRecord(
                        objectName = objectName,
                        kind = kind,
                        fileName = "${familyDir.name}/${file.name}",
                        payload = payload,
                        schemaRequiredFields = schemaRequiredFields(objectName),
                    ),
                )
            }
        }
        return ConformanceCorpus(
            fixtures = records,
            registeredObjects = registeredObjects,
        )
    }

    /** One fixture's raw text (for direct schema/codec assertions). */
    fun readFixtureText(familyRelativeName: String): String =
        File(fixturesRoot(), familyRelativeName).readText(Charsets.UTF_8)

    private fun fixturesRoot(): File = File(packageRoot, "fixtures")
}
