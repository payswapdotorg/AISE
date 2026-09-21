package org.payswap.aise.core.adapter

import org.payswap.aise.core.json.JsonValue

/**
 * The capability-negotiation RESULT consumer (PROD-019, obligation A-R2) — a
 * faithful Kotlin mirror of `packages/adapter-contract/src/negotiation.ts`
 * (PROD-016): [negotiateCapabilities] maps an adapter's declared
 * [ClientCapabilityProfile] × a server-owned [TaskCapabilityRequirements] set
 * to an explicit [CapabilityNegotiation].
 *
 * MIRRORED SEMANTICS (byte-pinned against the committed negotiation fixtures
 * by `CapabilityNegotiationTest`):
 *  - per-domain outcomes `satisfied | unsupported | unknown` with the SAME
 *    honest, deterministic reason strings as the TypeScript source
 *    (`unknown` is NEVER conflated with `unsupported`);
 *  - overall outcome `permitted | degraded | unknown | blocked`
 *    (worst-of: a definitively-impossible blocking requirement outranks an
 *    undetermined one);
 *  - the permitted [InteractionMode]s — the honest subset of the
 *    interaction-equivalence vocabulary of `spec/client-adapter-contract.md`
 *    the profile's declared facts support — EMPTY when the task is blocked
 *    (the adapter must render the explicit blocked reason instead of a
 *    pretend-actionable task).
 *
 * NO AUTHORITY INVARIANT: negotiation is platform-honesty math over declared
 * client facts. It changes interaction/capture strategy and operator burden —
 * it can never change, lower or satisfy an assurance/readiness requirement,
 * and the negotiation object deliberately carries no authorization,
 * readiness, verification or sufficiency semantics (asserted by tests).
 * Device capability determines capture method, operator burden, evidence
 * substitutions and escalation — never the truth standard.
 */

/** The platform-neutral interaction-mode vocabulary (declaration order is canonical). */
enum class InteractionMode(val wireName: String) {
    MENU_NAVIGATION("menu-navigation"),
    KEYBOARD_SHORTCUT("keyboard-shortcut"),
    TABLE_REVIEW("table-review"),
    PANEL_INSPECTION("panel-inspection"),
    DRAG_INSPECT("drag-inspect"),
    WINDOW_MANAGEMENT("window-management"),
    FILE_WORKFLOW("file-workflow"),
    CAMERA_CAPTURE("camera-capture"),
    GESTURE("gesture"),
    VOICE_COMMAND("voice-command"),
    SCAN_CONTROL("scan-control"),
    OFFLINE_QUEUE("offline-queue"),
    ;

    companion object {
        fun fromWire(value: String): InteractionMode =
            entries.firstOrNull { it.wireName == value }
                ?: throw IllegalArgumentException(
                    "unknown interaction mode '$value' (expected one of ${entries.map { it.wireName }})",
                )
    }
}

/** Per-domain negotiation outcomes. `unknown` ≠ `unsupported`. */
enum class DomainOutcome(val wireName: String) {
    SATISFIED("satisfied"),
    UNSUPPORTED("unsupported"),
    UNKNOWN("unknown"),
    ;
}

/** Overall negotiation outcomes (worst-of order: blocked > unknown > degraded > permitted). */
enum class NegotiationOutcome(val wireName: String) {
    PERMITTED("permitted"),
    DEGRADED("degraded"),
    UNKNOWN("unknown"),
    BLOCKED("blocked"),
    ;

    /** Worst-of severity: blocked (3) > unknown (2) > degraded (1) > permitted (0). */
    val severity: Int get() = ordinal
}

/** One negotiated domain: requirement verdict + honest reason (null when satisfied). */
data class DomainNegotiation(
    val domain: ClientCapabilityDomain,
    val outcome: DomainOutcome,
    val blocking: Boolean,
    val reason: String?,
) {
    fun toJsonObject(): JsonValue.JsonObject = JsonValue.obj(
        "domain" to JsonValue.str(domain.wireName),
        "outcome" to JsonValue.str(outcome.wireName),
        "blocking" to JsonValue.bool(blocking),
        "reason" to (reason?.let { JsonValue.str(it) } ?: JsonValue.JsonNull),
    )
}

/** The negotiation result object (consumed verbatim by the mission UX). */
data class CapabilityNegotiation(
    val contractVersion: String,
    val adapterKind: String,
    val profileRef: String,
    val requirementsRef: String,
    val outcome: NegotiationOutcome,
    /** One entry per domain WITH a requirement, in the fixed domain order. */
    val domainOutcomes: List<DomainNegotiation>,
    /** EMPTY when the overall outcome is BLOCKED. */
    val permittedInteractionModes: List<InteractionMode>,
) {
    /** The explicit blocked reasons (verbatim) — what the UI renders on BLOCKED. */
    val blockedReasons: List<String>
        get() = domainOutcomes
            .filter { it.blocking && it.outcome != DomainOutcome.SATISFIED }
            .map { it.reason ?: "${it.domain.wireName} requirement unmet" }

    fun toJsonObject(): JsonValue.JsonObject = JsonValue.obj(
        "contractVersion" to JsonValue.str(contractVersion),
        "adapterKind" to JsonValue.str(adapterKind),
        "profileRef" to JsonValue.str(profileRef),
        "requirementsRef" to JsonValue.str(requirementsRef),
        "outcome" to JsonValue.str(outcome.wireName),
        "domainOutcomes" to JsonValue.arr(domainOutcomes.map { it.toJsonObject() }),
        "permittedInteractionModes" to JsonValue.arr(permittedInteractionModes.map { JsonValue.str(it.wireName) }),
    )
}

/* ------------------------------------------------------------------ */
/* Orderings (deterministic capability comparisons)                    */
/* ------------------------------------------------------------------ */

private val SIZE_CLASS_ORDER = mapOf(
    ScreenSizeClass.COMPACT to 0L,
    ScreenSizeClass.REGULAR to 1L,
    ScreenSizeClass.EXPANDED to 2L,
)

private val OFFLINE_MODE_ORDER = mapOf(
    OfflineStorageMode.NONE to 0L,
    OfflineStorageMode.SESSION_CACHE to 1L,
    OfflineStorageMode.BOUNDED_QUEUE to 2L,
    OfflineStorageMode.PERSISTENT_STORE to 3L,
)

private val NOTIFICATION_MODE_ORDER = mapOf(
    NotificationMode.NONE to 0L,
    NotificationMode.IN_APP to 1L,
    NotificationMode.SYSTEM to 2L,
)

private val DEEP_LINK_MODE_ORDER = mapOf(
    DeepLinkMode.NONE to 0L,
    DeepLinkMode.APP_SCHEME to 1L,
    DeepLinkMode.UNIVERSAL to 2L,
)

/* ------------------------------------------------------------------ */
/* Mode derivation                                                     */
/* ------------------------------------------------------------------ */

/**
 * Only supported/degraded domains contribute facts. `unknown` grants nothing
 * (granting from undetermined facts would be dishonest) and is never REPORTED
 * as `unsupported` — the domain-outcome vocabulary keeps the distinction;
 * `unavailable` grants nothing and reports unsupported.
 */
private fun domainFactsUsable(status: ClientCapabilityStatus): Boolean =
    status == ClientCapabilityStatus.SUPPORTED || status == ClientCapabilityStatus.DEGRADED

/**
 * Derives the honest interaction modes a client capability profile supports
 * (independent of any task requirement). Pure and deterministic — the exact
 * rule table of `deriveInteractionModes` in `negotiation.ts`.
 */
fun deriveInteractionModes(profile: ClientCapabilityProfile): List<InteractionMode> {
    val granted = LinkedHashSet<InteractionMode>()

    val inputUsable = domainFactsUsable(profile.input.descriptor.status)
    val pointerOrTouch = inputUsable && profile.input.modes.any {
        it == InputMode.POINTER || it == InputMode.TOUCH
    }
    if (pointerOrTouch) {
        granted.add(InteractionMode.MENU_NAVIGATION)
        granted.add(InteractionMode.PANEL_INSPECTION)
        granted.add(InteractionMode.DRAG_INSPECT)
        if (domainFactsUsable(profile.screen.descriptor.status) &&
            (SIZE_CLASS_ORDER[profile.screen.sizeClass] ?: -1L) >= (SIZE_CLASS_ORDER[ScreenSizeClass.REGULAR] ?: 1L)
        ) {
            granted.add(InteractionMode.TABLE_REVIEW)
        }
    }
    if (inputUsable && profile.input.modes.contains(InputMode.KEYBOARD)) {
        granted.add(InteractionMode.KEYBOARD_SHORTCUT)
    }
    if (inputUsable && profile.input.modes.contains(InputMode.GESTURE)) {
        granted.add(InteractionMode.GESTURE)
    }
    if (inputUsable && profile.input.modes.contains(InputMode.VOICE)) {
        granted.add(InteractionMode.VOICE_COMMAND)
    }
    if (inputUsable && profile.input.modes.contains(InputMode.CAMERA_SCAN)) {
        granted.add(InteractionMode.SCAN_CONTROL)
    }
    if (domainFactsUsable(profile.camera.descriptor.status) && profile.camera.captureKinds.isNotEmpty()) {
        granted.add(InteractionMode.CAMERA_CAPTURE)
    }
    if (domainFactsUsable(profile.screen.descriptor.status) && profile.screen.multiWindow) {
        granted.add(InteractionMode.WINDOW_MANAGEMENT)
    }
    val offlineUsable = domainFactsUsable(profile.offlineStorage.descriptor.status)
    if (offlineUsable && (
            profile.offlineStorage.mode == OfflineStorageMode.BOUNDED_QUEUE ||
                profile.offlineStorage.mode == OfflineStorageMode.PERSISTENT_STORE
            )
    ) {
        granted.add(InteractionMode.OFFLINE_QUEUE)
    }
    if (offlineUsable && profile.offlineStorage.mode == OfflineStorageMode.PERSISTENT_STORE) {
        granted.add(InteractionMode.FILE_WORKFLOW)
    }

    // Canonical order = InteractionMode declaration order.
    return InteractionMode.entries.filter { it in granted }
}

/* ------------------------------------------------------------------ */
/* Negotiation                                                         */
/* ------------------------------------------------------------------ */

private fun renderList(values: List<String>): String = "[${values.joinToString(", ")}]"

private data class DomainEvaluation(
    val domain: ClientCapabilityDomain,
    val outcome: DomainOutcome,
    val blocking: Boolean,
    val reason: String?,
)

private fun evaluateScreen(
    profile: ClientCapabilityProfile,
    requirements: TaskCapabilityRequirements,
): DomainEvaluation? {
    val requirement = requirements.screen ?: return null
    val status = profile.screen.descriptor.status
    if (status == ClientCapabilityStatus.UNKNOWN) {
        return DomainEvaluation(
            ClientCapabilityDomain.SCREEN, DomainOutcome.UNKNOWN, requirement.blocking,
            "screen capability undetermined: profile status is unknown; probing required",
        )
    }
    if (status == ClientCapabilityStatus.UNAVAILABLE) {
        return DomainEvaluation(
            ClientCapabilityDomain.SCREEN, DomainOutcome.UNSUPPORTED, requirement.blocking,
            "screen capability unavailable on this client",
        )
    }
    if (requirement.minSizeClass != null &&
        (SIZE_CLASS_ORDER[profile.screen.sizeClass] ?: -1L) < (SIZE_CLASS_ORDER[requirement.minSizeClass] ?: 0L)
    ) {
        return DomainEvaluation(
            ClientCapabilityDomain.SCREEN, DomainOutcome.UNSUPPORTED, requirement.blocking,
            "screen requirement unmet: required min size class ${requirement.minSizeClass.wireName}; " +
                "profile declares ${profile.screen.sizeClass.wireName}",
        )
    }
    if (requirement.multiWindow == true && !profile.screen.multiWindow) {
        return DomainEvaluation(
            ClientCapabilityDomain.SCREEN, DomainOutcome.UNSUPPORTED, requirement.blocking,
            "screen requirement unmet: multi-window presentation required; profile declares single-window",
        )
    }
    return DomainEvaluation(ClientCapabilityDomain.SCREEN, DomainOutcome.SATISFIED, requirement.blocking, null)
}

private fun evaluateInput(
    profile: ClientCapabilityProfile,
    requirements: TaskCapabilityRequirements,
): DomainEvaluation? {
    val requirement = requirements.input ?: return null
    val status = profile.input.descriptor.status
    if (status == ClientCapabilityStatus.UNKNOWN) {
        return DomainEvaluation(
            ClientCapabilityDomain.INPUT, DomainOutcome.UNKNOWN, requirement.blocking,
            "input capability undetermined: profile status is unknown; probing required",
        )
    }
    if (status == ClientCapabilityStatus.UNAVAILABLE) {
        return DomainEvaluation(
            ClientCapabilityDomain.INPUT, DomainOutcome.UNSUPPORTED, requirement.blocking,
            "input capability unavailable on this client",
        )
    }
    val declared = profile.input.modes.map { it.wireName }
    val satisfied = requirement.requireAny.any { it.wireName in declared }
    if (!satisfied) {
        return DomainEvaluation(
            ClientCapabilityDomain.INPUT, DomainOutcome.UNSUPPORTED, requirement.blocking,
            "input requirement unmet: required any of ${renderList(requirement.requireAny.map { it.wireName })}; " +
                "profile declares ${renderList(declared)}",
        )
    }
    return DomainEvaluation(ClientCapabilityDomain.INPUT, DomainOutcome.SATISFIED, requirement.blocking, null)
}

private fun evaluateSensors(
    profile: ClientCapabilityProfile,
    requirements: TaskCapabilityRequirements,
): DomainEvaluation? {
    val requirement = requirements.sensors ?: return null
    val status = profile.sensors.descriptor.status
    if (status == ClientCapabilityStatus.UNKNOWN) {
        return DomainEvaluation(
            ClientCapabilityDomain.SENSORS, DomainOutcome.UNKNOWN, requirement.blocking,
            "sensor capability undetermined: profile status is unknown; probing required",
        )
    }
    if (status == ClientCapabilityStatus.UNAVAILABLE) {
        return DomainEvaluation(
            ClientCapabilityDomain.SENSORS, DomainOutcome.UNSUPPORTED, requirement.blocking,
            "sensor capability unavailable on this client",
        )
    }
    val declared = profile.sensors.kinds
    val satisfied = requirement.requireAny.any { it in declared }
    if (!satisfied) {
        return DomainEvaluation(
            ClientCapabilityDomain.SENSORS, DomainOutcome.UNSUPPORTED, requirement.blocking,
            "sensor requirement unmet: required any of ${renderList(requirement.requireAny)}; " +
                "profile declares ${renderList(declared)}",
        )
    }
    return DomainEvaluation(ClientCapabilityDomain.SENSORS, DomainOutcome.SATISFIED, requirement.blocking, null)
}

private fun evaluateCamera(
    profile: ClientCapabilityProfile,
    requirements: TaskCapabilityRequirements,
): DomainEvaluation? {
    val requirement = requirements.camera ?: return null
    val status = profile.camera.descriptor.status
    if (status == ClientCapabilityStatus.UNKNOWN) {
        return DomainEvaluation(
            ClientCapabilityDomain.CAMERA, DomainOutcome.UNKNOWN, requirement.blocking,
            "camera capability undetermined: profile status is unknown; probing required",
        )
    }
    if (status == ClientCapabilityStatus.UNAVAILABLE) {
        return DomainEvaluation(
            ClientCapabilityDomain.CAMERA, DomainOutcome.UNSUPPORTED, requirement.blocking,
            "camera capability unavailable on this client; profile declares " +
                renderList(profile.camera.captureKinds.map { it.wireName }),
        )
    }
    val declared = profile.camera.captureKinds.map { it.wireName }
    val satisfied = requirement.requireAny.any { it.wireName in declared }
    if (!satisfied) {
        return DomainEvaluation(
            ClientCapabilityDomain.CAMERA, DomainOutcome.UNSUPPORTED, requirement.blocking,
            "camera requirement unmet: required any of ${renderList(requirement.requireAny.map { it.wireName })}; " +
                "profile declares ${renderList(declared)}",
        )
    }
    return DomainEvaluation(ClientCapabilityDomain.CAMERA, DomainOutcome.SATISFIED, requirement.blocking, null)
}

private fun evaluateOfflineStorage(
    profile: ClientCapabilityProfile,
    requirements: TaskCapabilityRequirements,
): DomainEvaluation? {
    val requirement = requirements.offlineStorage ?: return null
    val status = profile.offlineStorage.descriptor.status
    if (status == ClientCapabilityStatus.UNKNOWN) {
        return DomainEvaluation(
            ClientCapabilityDomain.OFFLINE_STORAGE, DomainOutcome.UNKNOWN, requirement.blocking,
            "offline-storage capability undetermined: profile status is unknown; probing required",
        )
    }
    if (status == ClientCapabilityStatus.UNAVAILABLE) {
        return DomainEvaluation(
            ClientCapabilityDomain.OFFLINE_STORAGE, DomainOutcome.UNSUPPORTED, requirement.blocking,
            "offline-storage capability unavailable on this client",
        )
    }
    if (requirement.minMode != null &&
        (OFFLINE_MODE_ORDER[profile.offlineStorage.mode] ?: -1L) < (OFFLINE_MODE_ORDER[requirement.minMode] ?: 0L)
    ) {
        return DomainEvaluation(
            ClientCapabilityDomain.OFFLINE_STORAGE, DomainOutcome.UNSUPPORTED, requirement.blocking,
            "offline-storage requirement unmet: required min mode ${requirement.minMode.wireName}; " +
                "profile declares ${profile.offlineStorage.mode.wireName}",
        )
    }
    if (requirement.minQueueBoundBytes != null &&
        (profile.offlineStorage.queueBoundBytes == null ||
            profile.offlineStorage.queueBoundBytes < requirement.minQueueBoundBytes)
    ) {
        val declared = profile.offlineStorage.queueBoundBytes?.toString() ?: "none"
        return DomainEvaluation(
            ClientCapabilityDomain.OFFLINE_STORAGE, DomainOutcome.UNSUPPORTED, requirement.blocking,
            "offline-storage requirement unmet: required queue bound >= ${requirement.minQueueBoundBytes} bytes; " +
                "profile declares $declared",
        )
    }
    return DomainEvaluation(ClientCapabilityDomain.OFFLINE_STORAGE, DomainOutcome.SATISFIED, requirement.blocking, null)
}

private fun evaluateNotifications(
    profile: ClientCapabilityProfile,
    requirements: TaskCapabilityRequirements,
): DomainEvaluation? {
    val requirement = requirements.notifications ?: return null
    val status = profile.notifications.descriptor.status
    if (status == ClientCapabilityStatus.UNKNOWN) {
        return DomainEvaluation(
            ClientCapabilityDomain.NOTIFICATIONS, DomainOutcome.UNKNOWN, requirement.blocking,
            "notification capability undetermined: profile status is unknown; probing required",
        )
    }
    if (status == ClientCapabilityStatus.UNAVAILABLE) {
        return DomainEvaluation(
            ClientCapabilityDomain.NOTIFICATIONS, DomainOutcome.UNSUPPORTED, requirement.blocking,
            "notification capability unavailable on this client",
        )
    }
    if (requirement.minMode != null &&
        (NOTIFICATION_MODE_ORDER[profile.notifications.mode] ?: -1L) < (NOTIFICATION_MODE_ORDER[requirement.minMode] ?: 0L)
    ) {
        return DomainEvaluation(
            ClientCapabilityDomain.NOTIFICATIONS, DomainOutcome.UNSUPPORTED, requirement.blocking,
            "notification requirement unmet: required min mode ${requirement.minMode.wireName}; " +
                "profile declares ${profile.notifications.mode.wireName}",
        )
    }
    return DomainEvaluation(ClientCapabilityDomain.NOTIFICATIONS, DomainOutcome.SATISFIED, requirement.blocking, null)
}

private fun evaluateDeepLinks(
    profile: ClientCapabilityProfile,
    requirements: TaskCapabilityRequirements,
): DomainEvaluation? {
    val requirement = requirements.deepLinks ?: return null
    val status = profile.deepLinks.descriptor.status
    if (status == ClientCapabilityStatus.UNKNOWN) {
        return DomainEvaluation(
            ClientCapabilityDomain.DEEP_LINKS, DomainOutcome.UNKNOWN, requirement.blocking,
            "deep-link capability undetermined: profile status is unknown; probing required",
        )
    }
    if (status == ClientCapabilityStatus.UNAVAILABLE) {
        return DomainEvaluation(
            ClientCapabilityDomain.DEEP_LINKS, DomainOutcome.UNSUPPORTED, requirement.blocking,
            "deep-link capability unavailable on this client",
        )
    }
    if (requirement.minMode != null &&
        (DEEP_LINK_MODE_ORDER[profile.deepLinks.mode] ?: -1L) < (DEEP_LINK_MODE_ORDER[requirement.minMode] ?: 0L)
    ) {
        return DomainEvaluation(
            ClientCapabilityDomain.DEEP_LINKS, DomainOutcome.UNSUPPORTED, requirement.blocking,
            "deep-link requirement unmet: required min mode ${requirement.minMode.wireName}; " +
                "profile declares ${profile.deepLinks.mode.wireName}",
        )
    }
    return DomainEvaluation(ClientCapabilityDomain.DEEP_LINKS, DomainOutcome.SATISFIED, requirement.blocking, null)
}

/**
 * Negotiates what a client platform may honestly do for a task — the exact
 * mirror of `negotiateCapabilities` in `negotiation.ts`.
 *
 * PURE and DETERMINISTIC: the same profile + requirements always produce the
 * same negotiation (pinned against the committed fixtures). No I/O, no clock,
 * no randomness, no authorization and no assurance semantics.
 */
fun negotiateCapabilities(
    profile: ClientCapabilityProfile,
    requirements: TaskCapabilityRequirements,
): CapabilityNegotiation {
    val evaluations = listOf(
        evaluateScreen(profile, requirements),
        evaluateInput(profile, requirements),
        evaluateSensors(profile, requirements),
        evaluateCamera(profile, requirements),
        evaluateOfflineStorage(profile, requirements),
        evaluateNotifications(profile, requirements),
        evaluateDeepLinks(profile, requirements),
    ).filterNotNull()

    var overall = NegotiationOutcome.PERMITTED
    for (evaluation in evaluations) {
        var candidate = NegotiationOutcome.PERMITTED
        if (evaluation.outcome == DomainOutcome.UNSUPPORTED && evaluation.blocking) {
            candidate = NegotiationOutcome.BLOCKED
        } else if (evaluation.outcome == DomainOutcome.UNKNOWN && evaluation.blocking) {
            candidate = NegotiationOutcome.UNKNOWN
        } else if (evaluation.outcome == DomainOutcome.UNSUPPORTED || evaluation.outcome == DomainOutcome.UNKNOWN) {
            candidate = NegotiationOutcome.DEGRADED
        }
        if (candidate.severity > overall.severity) {
            overall = candidate
        }
    }

    val permittedInteractionModes =
        if (overall == NegotiationOutcome.BLOCKED) emptyList() else deriveInteractionModes(profile)

    return CapabilityNegotiation(
        contractVersion = AdapterContractVersion.CURRENT,
        adapterKind = profile.adapterKind,
        profileRef = profile.profileId,
        requirementsRef = requirements.requirementsId,
        outcome = overall,
        domainOutcomes = evaluations.map {
            DomainNegotiation(it.domain, it.outcome, it.blocking, it.reason)
        },
        permittedInteractionModes = permittedInteractionModes,
    )
}
