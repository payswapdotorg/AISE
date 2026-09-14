package org.payswap.aise.core.mission

import org.payswap.aise.core.session.AcquisitionMethod

/**
 * Shared AISE-009 test fixtures.
 *
 * [VALID_MISSION_JSON] is a hand-written document mirroring the STRUCTURE of
 * the committed fixture `packages/shared-contracts/fixtures/mission/CaptureMission.valid.json`
 * (same field names, same nesting, same required-everything shape) with
 * integer-only numbers — the frozen `:core` JSON domain is integer-only, so
 * the committed fixture's fractional knownDimensions (1414.2, 0.5, 0.8) are
 * represented here with integer values, and the fractional case is covered
 * as a typed-rejection test in [MissionPlanParserTest].
 */
object MissionTestFixtures {

    const val EXECUTION_ID = "exec-2026-000042"

    val VALID_MISSION_JSON: String = """
        {
          "contractVersion": "1.0.0",
          "missionId": "mission-2026-000042",
          "state": "active",
          "intent": "Establish as-built room dimensions and wall condition for level 2, room 204 ahead of the partition rework quote.",
          "assurance": {
            "summary": "Room dimensions to 20 mm at 95 percent; wall verticality to 0.5 deg; every dimension traceable to evidence.",
            "assuranceProfileRef": "assurance-profile-interior-asbuilt-v3"
          },
          "requiredEvidence": [
            {
              "requirementId": "req-full-visual-coverage",
              "description": "Full visual coverage of all six room surfaces with overlap for registration.",
              "preferredMethod": "VIDEO_FOOTAGE",
              "fallbackMethods": ["STILL_IMAGERY"]
            },
            {
              "requirementId": "req-room-dimensions",
              "description": "Room length/width/height with stated tolerance.",
              "preferredMethod": "DEPTH_SENSING",
              "fallbackMethods": ["VISUAL_RECONSTRUCTION", "CALIBRATED_REFERENCE", "MANUAL_MEASUREMENT"]
            }
          ],
          "steps": [
            {
              "contractVersion": "1.0.0",
              "stepId": "step-place-reference",
              "sequence": 0,
              "title": "Place the scale bar",
              "instructions": "Place the 1 m scale bar flat on the floor near the room center, clear of furniture shadow.",
              "method": "CALIBRATED_REFERENCE",
              "requirementRefs": ["req-room-dimensions"],
              "mandatory": true
            },
            {
              "contractVersion": "1.0.0",
              "stepId": "step-video-sweep",
              "sequence": 1,
              "title": "Video sweep of the room",
              "instructions": "Walk the room perimeter at a slow, steady pace keeping all surfaces in frame; pause 2 s at each corner.",
              "method": "VIDEO_FOOTAGE",
              "requirementRefs": ["req-full-visual-coverage"],
              "mandatory": true
            },
            {
              "contractVersion": "1.0.0",
              "stepId": "step-wall-material",
              "sequence": 2,
              "title": "Record the wall material",
              "instructions": "State the wall material of every elevation and note visible surface damage.",
              "method": "HUMAN_ANSWER",
              "requirementRefs": [],
              "mandatory": true
            },
            {
              "contractVersion": "1.0.0",
              "stepId": "step-manual-measure",
              "sequence": 3,
              "title": "Tape-measure the room width (fallback)",
              "instructions": "If depth capture quality is insufficient, measure room width at floor level with the tape and photograph the tape reading.",
              "method": "MANUAL_MEASUREMENT",
              "requirementRefs": ["req-room-dimensions"],
              "mandatory": false
            }
          ],
          "referenceControls": [
            {
              "contractVersion": "1.0.0",
              "controlId": "refcontrol-scalebar-001",
              "kind": "scale_bar",
              "description": "Certified 1 m aluminium scale bar with cm graduations.",
              "knownDimensions": [
                {
                  "label": "length",
                  "value": 1000,
                  "unit": "mm",
                  "uncertainty": { "kind": "DIMENSIONAL", "plusMinus": 1 }
                }
              ]
            }
          ],
          "revision": 3,
          "createdAt": "2026-01-15T08:02:11.000Z",
          "updatedAt": "2026-01-15T09:41:07.000Z"
        }
    """.trimIndent()

    fun parseValidPlan(): MissionPlan = MissionPlanParser.parse(VALID_MISSION_JSON)

    // -- direct-construction builders (executor tests) ---------------------

    fun step(
        stepId: String,
        sequence: Long,
        mandatory: Boolean = true,
        method: AcquisitionMethod = AcquisitionMethod.STILL_IMAGERY,
        title: String = "step $stepId",
    ): MissionStep = MissionStep(
        stepId = stepId,
        sequence = sequence,
        title = title,
        instructions = "instructions for $stepId",
        method = method,
        requirementRefs = emptyList(),
        mandatory = mandatory,
    )

    fun plan(
        vararg steps: MissionStep,
        missionId: String = "mission-test",
        state: MissionState = MissionState.ACTIVE,
        referenceControls: List<ReferenceControl> = emptyList(),
    ): MissionPlan = MissionPlan(
        missionId = missionId,
        state = state,
        intent = "test intent",
        steps = steps.toList(),
        referenceControls = referenceControls,
    )

    /** The canonical executor-test plan: s0/s1 mandatory, s2 optional. */
    fun standardPlan(): MissionPlan = plan(
        step("s0", 0),
        step("s1", 1),
        step("s2", 2, mandatory = false),
    )

    fun scaleBarControl(): ReferenceControl = ReferenceControl(
        controlId = "ctrl-scalebar",
        kind = "scale_bar",
        description = "Certified 1 m scale bar.",
        knownDimensions = listOf(
            KnownDimension(label = "length", value = 1000, unit = "mm", uncertainty = null),
        ),
    )
}
