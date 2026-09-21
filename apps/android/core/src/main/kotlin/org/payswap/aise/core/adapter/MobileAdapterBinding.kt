package org.payswap.aise.core.adapter

import org.payswap.aise.core.json.JsonValue

/**
 * The MOBILE adapter's contract-conformance binding (PROD-019) — the platform
 * binding the Android adapter runs against the committed PROD-016 corpus.
 *
 * EMISSION (what C2/C3 verify): the four objects the adapter structurally
 * mirrors in Kotlin ([TaskIntentValue], [ClientCapabilityProfile],
 * [TaskCapabilityRequirements], [CapabilityNegotiation]) round-trip through
 * the domain types (parse → value → render); every other semantic object is
 * carried OPAQUE AND READ-ONLY — the emission is the verbatim payload, the
 * exact discipline the PROD-016 boundary audit records for the existing
 * Android mirrors ("carried verbatim in locally-defined structural mirrors —
 * never re-derived, never re-validated semantically, never mutated").
 *
 * PRESENTATION (what C4/C5/C7/C8/C9 verify): the mission UX renders every
 * top-level field of the objects it presents — including every authoritative
 * field, the authorization DENIALS, the operation status + typed FAILURE, and
 * the next-best-action status + BLOCKERS. Nothing is dropped or hidden.
 *
 * INTERACTION MODES (what C6 verifies): only the modes this build actually
 * implements are claimed — a strict subset of what the declared profile
 * honestly supports (e.g. `file-workflow` is NOT claimed: the durable store
 * exists as a fact, but no file-picker/export affordance is implemented in
 * this build; `table-review` is not claimed on a compact screen).
 */
object MobileAdapterBinding {

    /** The interaction modes this build implements (subset of the profile's honest modes). */
    val IMPLEMENTED_INTERACTION_MODES: List<String> = listOf(
        "menu-navigation",
        "panel-inspection",
        "drag-inspect",
        "camera-capture",
        "gesture",
        "scan-control",
        "offline-queue",
    )

    /** The object names the adapter structurally mirrors in Kotlin. */
    val MIRRORED_OBJECTS: Set<String> = setOf(
        "TaskIntent",
        "ClientCapabilityProfile",
        "TaskCapabilityRequirements",
        "CapabilityNegotiation",
    )

    fun create(profile: ClientCapabilityProfile): AdapterConformanceBinding =
        object : AdapterConformanceBinding {
            override val bindingId: String = "android-mobile-field"
            override val profile: ClientCapabilityProfile = profile

            override fun emit(objectName: String, payload: JsonValue.JsonObject): JsonValue.JsonObject =
                when (objectName) {
                    "TaskIntent" -> TaskIntentValue.fromJson(payload).toJsonObject()
                    "ClientCapabilityProfile" -> ClientCapabilityProfile.fromJson(payload).toJsonObject()
                    "TaskCapabilityRequirements" -> TaskCapabilityRequirements.fromJson(payload).toJsonObject()
                    "CapabilityNegotiation" -> parseNegotiation(payload).toJsonObject()
                    // Everything else: opaque, read-only, verbatim.
                    else -> payload
                }

            override fun presentedFields(objectName: String, payload: JsonValue.JsonObject): List<String> =
                payload.members.keys.toList()

            override fun supportedInteractionModes(): List<String> = IMPLEMENTED_INTERACTION_MODES.toList()
        }

    /** Parses a [CapabilityNegotiation] wire object (used by the emission round-trip). */
    internal fun parseNegotiation(value: JsonValue.JsonObject): CapabilityNegotiation {
        val negotiation = CapabilityNegotiation(
            contractVersion = value.stringMember("contractVersion"),
            adapterKind = value.stringMember("adapterKind"),
            profileRef = value.stringMember("profileRef"),
            requirementsRef = value.stringMember("requirementsRef"),
            outcome = NegotiationOutcome.entries.firstOrNull { it.wireName == value.stringMember("outcome") }
                ?: throw IllegalArgumentException("unknown negotiation outcome '${value.stringMember("outcome")}'"),
            domainOutcomes = value.arrayMember("domainOutcomes").items.map { entry ->
                val obj = entry as? JsonValue.JsonObject
                    ?: throw IllegalArgumentException("domainOutcomes entries must be objects")
                DomainNegotiation(
                    domain = ClientCapabilityDomain.fromWire(obj.stringMember("domain")),
                    outcome = DomainOutcome.entries.firstOrNull { it.wireName == obj.stringMember("outcome") }
                        ?: throw IllegalArgumentException("unknown domain outcome '${obj.stringMember("outcome")}'"),
                    blocking = obj.boolMember("blocking"),
                    reason = (obj.members["reason"] as? JsonValue.JsonString)?.value,
                )
            },
            permittedInteractionModes = value.arrayMember("permittedInteractionModes").items.map {
                InteractionMode.fromWire((it as? JsonValue.JsonString)?.value ?: throw IllegalArgumentException("modes must be strings"))
            },
        )
        AdapterContractVersion.requireCompatible(negotiation.contractVersion)
        return negotiation
    }
}
