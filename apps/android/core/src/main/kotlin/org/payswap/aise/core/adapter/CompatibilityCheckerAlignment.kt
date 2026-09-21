package org.payswap.aise.core.adapter

/**
 * A-R3 — the DELIBERATE alignment record between the two capability verdict
 * models that coexist in the Android client (PROD-019, recorded obligation
 * A-R3 of the PROD-016 boundary audit).
 *
 * ## The two models and why both exist
 *
 * 1. **[org.payswap.aise.core.offine.MissionCompatibilityChecker]** (AISE-030,
 *    over the AISE-003 capture contract): judges whether a single MISSION
 *    STEP is executable by the DEVICE's capture hardware. Its subject is the
 *    8-domain `DeviceCapabilityProfile` (DEVICE, CAMERA, DEPTH, IMU,
 *    TRACKING, COMPUTE, CALIBRATION, ENVIRONMENT —
 *    `CapabilityDomainKind`) and its verdict vocabulary is
 *    `executable / degraded_but_executable / unknown_capability /
 *    not_executable` over the 10-value acquisition-method enum.
 *
 * 2. **The shared capability negotiation** (PROD-016,
 *    [negotiateCapabilities]): judges what the CLIENT PLATFORM may honestly
 *    do for a TASK. Its subject is the 7-domain `ClientCapabilityProfile`
 *    (screen, input, sensors, camera, offline-storage, notifications,
 *    deep-links — [ClientCapabilityDomain]) and its verdict vocabulary is
 *    per-domain `satisfied / unsupported / unknown` + overall
 *    `permitted / degraded / unknown / blocked`.
 *
 * These are DIFFERENT subjects (device capture domains vs client platform
 * capability) with DIFFERENT vocabularies — one cannot be replaced by the
 * other, and NEITHER is an authority: both are facts-not-policy. The audit's
 * obligation is that they "cannot silently diverge": this file pins their
 * alignment as CHECKED DATA, and `CompatibilityCheckerAlignmentTest` asserts
 * every invariant below on every test run.
 *
 * ## The alignment invariants (all test-enforced)
 *
 *  - **Vocabulary mapping is TOTAL and ORDER-PRESERVING.** Each step verdict
 *    maps to exactly one negotiation outcome class, and the worst-of
 *    severity orders agree directionally:
 *
 *    | Step verdict (device) | Negotiation analogue (client) | Worst-of severity |
 *    |---|---|---|
 *    | `EXECUTABLE` | `satisfied` / overall `permitted` | 0 (least severe) |
 *    | `DEGRADED_BUT_EXECUTABLE` | overall `degraded` | 1 |
 *    | `UNKNOWN_CAPABILITY` | `unknown` | 2 |
 *    | `NOT_EXECUTABLE` | `unsupported` (+ blocking ⇒ overall `blocked`) | 3 (most severe) |
 *
 *  - **The honest-unknown discipline is IDENTICAL.** `unknown` is never
 *    conflated with `unavailable`/`not_executable` in either model, and an
 *    undetermined fact never grants anything
 *    ([domainFactsUsable] vs the checker's UNKNOWN rule).
 *
 *  - **Impossibility outranks undetermination in both.** A definitively
 *    impossible requirement (`blocked` / `NOT_EXECUTABLE`) outranks an
 *    undetermined one (`unknown` / `UNKNOWN_CAPABILITY`) in the worst-of
 *    order of BOTH models.
 *
 *  - **Neither model can weaken the other.** The checker's verdicts and the
 *    negotiation's domain outcomes are consumed by the field journey as
 *    INDEPENDENT gates: a mission step may be device-executable while the
 *    task is client-blocked (and vice versa — both directions are proven by
 *    `FieldJourneyTest`). A degraded verdict in EITHER model changes
 *    acquisition strategy / operator burden — never an assurance threshold
 *    (the never-lower-the-truth-standard invariant both contracts share).
 *
 *  - **The two domain vocabularies are distinct layers.** The 8 device capture
 *    domains and the 7 client platform domains are different subjects — they
 *    are never merged into one vocabulary. Their one name-level overlap
 *    (`camera`) is a documented related-facts pair: CAMERA the DEVICE domain
 *    is the hardware inventory status, while the `camera` CLIENT domain is
 *    the adapter's capture binding (see [DEVICE_CAPTURE_DOMAINS] and
 *    [CLIENT_PLATFORM_DOMAINS]; asserted by
 *    `CompatibilityCheckerAlignmentTest`).
 */
object CompatibilityCheckerAlignment {

    /** One row of the total, order-preserving vocabulary mapping. */
    data class AlignmentRow(
        /** The device-capture-domain step verdict (AISE-030 checker). */
        val stepVerdict: String,
        /** The client-platform negotiation analogue (PROD-016). */
        val negotiationAnalogue: String,
        /** The shared severity rank (0 least — 3 most severe). */
        val severityRank: Int,
    )

    /** The checked vocabulary mapping (order-preserving by [AlignmentRow.severityRank]). */
    val ALIGNMENT: List<AlignmentRow> = listOf(
        AlignmentRow("executable", "satisfied / permitted", 0),
        AlignmentRow("degraded_but_executable", "degraded", 1),
        AlignmentRow("unknown_capability", "unknown", 2),
        AlignmentRow("not_executable", "unsupported (+ blocking ⇒ blocked)", 3),
    )

    /**
     * The device capture domains (AISE-003) — the checker's subject. Listed
     * so the disjointness from [ClientCapabilityDomain] is visible and
     * testable (no domain name is shared: `camera` the CLIENT domain — the
     * adapter's CameraX binding — is not `CAMERA` the DEVICE domain — the
     * hardware inventory status; they are related facts at different layers).
     */
    val DEVICE_CAPTURE_DOMAINS: List<String> = listOf(
        "DEVICE",
        "CAMERA",
        "DEPTH",
        "IMU",
        "TRACKING",
        "COMPUTE",
        "CALIBRATION",
        "ENVIRONMENT",
    )

    /** The client platform domains (PROD-016) — the negotiation's subject. */
    val CLIENT_PLATFORM_DOMAINS: List<String> = ClientCapabilityDomain.entries.map { it.wireName }
}
