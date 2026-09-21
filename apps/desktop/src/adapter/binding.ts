/**
 * PROD-020 — the desktop adapter's CONFORMANCE BINDING.
 *
 * The platform binding the desktop adapter passes to the shared
 * `runConformance` harness (PROD-016) — the adapter's REAL wire handling
 * and presentation claims, not a mock:
 *
 *  - `emit` IS the seam: every object family decodes through the adapter's
 *    contract decode seam (seam.ts — the same decoders client.ts applies
 *    to live server payloads). A binding that drops, mutates or hides
 *    authoritative fields fails C2/C3 HERE, in the adapter's own pipeline;
 *  - `presentedFields` IS the render registry (render-registry.ts — the
 *    same field lists the high-density review surface renders). A required
 *    or authoritative field the viewport does not show fails C4/C5 here;
 *  - `supportedInteractionModes` IS the honest implemented-subset claim
 *    (profile.ts — the modes this adapter actually implements). Claiming a
 *    mode the profile does not support fails C6;
 *  - `profile` IS the declared desktop-rich-shell ClientCapabilityProfile.
 *
 * NO-CLIENT-AUTHORITY: the binding interface has no mutation path; the
 * harness VERIFIES the emission is lossless and the presentation
 * complete. Sabotage variants (a field-dropping emission, a
 * denial-hiding presentation, a dishonest mode claim) are
 * discrimination-tested in conformance.test.ts — they must FAIL the
 * explicit checks.
 */

import type {
  AdapterConformanceBinding,
  AdapterObjectName,
} from "@aise/adapter-contract";
import {
  decodeAuthorizationContextAtSeam,
  decodeBOQContextAtSeam,
  decodeCapabilityDescriptorAtSeam,
  decodeCapabilityNegotiationAtSeam,
  decodeClientCapabilityProfileAtSeam,
  decodeEngineeringCaseSummaryAtSeam,
  decodeEvidenceSummaryAtSeam,
  decodeInterventionScenarioSummaryAtSeam,
  decodeNextBestActionAtSeam,
  decodeOperationResultAtSeam,
  decodeOutcomeSummaryAtSeam,
  decodeProjectContextAtSeam,
  decodeRealitySummaryAtSeam,
  decodeTaskIntentAtSeam,
  decodeTaskRequirementsAtSeam,
  type ContractDecode,
} from "./seam";
import { presentedFieldsOf } from "./render-registry";
import {
  DESKTOP_ADAPTER_PROFILE,
  DESKTOP_IMPLEMENTED_INTERACTION_MODES,
} from "./profile";

/** The binding id (stable, for the conformance report). */
export const DESKTOP_BINDING_ID = "desktop-rich-shell-adapter";

/**
 * The seam decode registry — every adapter wire object the desktop
 * adapter consumes, decoded by the SAME seam functions the live client
 * path uses (client.ts).
 */
const SEAM_DECODERS: Readonly<Record<string, (payload: unknown) => ContractDecode<unknown>>> =
  Object.freeze({
    AuthorizationContext: decodeAuthorizationContextAtSeam,
    BOQContext: decodeBOQContextAtSeam,
    CapabilityDescriptor: decodeCapabilityDescriptorAtSeam,
    CapabilityNegotiation: decodeCapabilityNegotiationAtSeam,
    ClientCapabilityProfile: decodeClientCapabilityProfileAtSeam,
    EngineeringCaseSummary: decodeEngineeringCaseSummaryAtSeam,
    EvidenceSummary: decodeEvidenceSummaryAtSeam,
    InterventionScenarioSummary: decodeInterventionScenarioSummaryAtSeam,
    NextBestAction: decodeNextBestActionAtSeam,
    OperationResult: decodeOperationResultAtSeam,
    OutcomeSummary: decodeOutcomeSummaryAtSeam,
    ProjectContext: decodeProjectContextAtSeam,
    RealitySummary: decodeRealitySummaryAtSeam,
    TaskCapabilityRequirements: decodeTaskRequirementsAtSeam,
    TaskIntent: decodeTaskIntentAtSeam,
  });

/**
 * The desktop adapter's conformance binding. `emit` returns the DECODED
 * value (what the adapter actually holds after the seam) — lossless by the
 * open wire schemas; an undecodable payload returns undefined so the
 * harness flags it (never a silent pass-through).
 */
export function createDesktopConformanceBinding(): AdapterConformanceBinding {
  return {
    bindingId: DESKTOP_BINDING_ID,
    profile: DESKTOP_ADAPTER_PROFILE,
    emit: (objectName: AdapterObjectName, payload: object): unknown => {
      const decode = SEAM_DECODERS[objectName];
      if (decode === undefined) {
        return undefined; // an object the adapter genuinely never handles — flagged loudly
      }
      const result = decode(payload);
      return result.ok ? result.value : undefined;
    },
    presentedFields: (objectName: AdapterObjectName): readonly string[] =>
      presentedFieldsOf(objectName),
    supportedInteractionModes: (): readonly string[] => DESKTOP_IMPLEMENTED_INTERACTION_MODES,
  };
}
