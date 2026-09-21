/**
 * PROD-017 — the browser adapter's CONFORMANCE BINDING (W-R4).
 *
 * The platform binding the browser adapter passes to the shared
 * `runConformance` harness (PROD-016) — the adapter's REAL wire handling
 * and presentation claims, not a mock:
 *
 *  - `emit` IS the seam: every object family decodes through the app's
 *    contract decode seam (task-contract.ts — the same decoders
 *    `app/api.ts` applies to live server payloads). A binding that
 *    drops, mutates or hides authoritative fields fails C2/C3 HERE, in
 *    the app's own pipeline;
 *  - `presentedFields` IS the render registry (contract-objects.tsx —
 *    the same field lists `ContractObjectFields` renders in the
 *    semantic-objects audit card). A required or authoritative field the
 *    UI does not show fails C4/C5 here;
 *  - `supportedInteractionModes` IS the honest implemented-subset claim
 *    (adapter-profile.ts — the modes this application actually
 *    implements). Claiming a mode the profile does not support fails C6;
 *  - `profile` IS the declared browser ClientCapabilityProfile.
 *
 * NO-CLIENT-AUTHORITY: the binding interface has no mutation path; the
 * harness VERIFIES the emission is lossless and the presentation
 * complete. Sabotage variants (a field-dropping emission, a
 * denial-hiding presentation) are discrimination-tested in
 * conformance.test.ts — they must FAIL the explicit checks.
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
} from "./task-contract";
import { presentedFieldsOf } from "./contract-objects";
import { BROWSER_ADAPTER_PROFILE, BROWSER_IMPLEMENTED_INTERACTION_MODES } from "./adapter-profile";

/** The binding id (stable, for the conformance report). */
export const BROWSER_BINDING_ID = "browser-web-adapter";

/**
 * The seam decode registry — every adapter wire object the app consumes,
 * decoded by the SAME seam functions the live API path uses.
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
 * The browser adapter's conformance binding. `emit` returns the DECODED
 * value (what the app actually holds after the seam) — lossless by the
 * open wire schemas; an undecodable payload returns undefined so the
 * harness flags it (never a silent pass-through).
 */
export function createBrowserConformanceBinding(): AdapterConformanceBinding {
  return {
    bindingId: BROWSER_BINDING_ID,
    profile: BROWSER_ADAPTER_PROFILE,
    emit: (objectName: AdapterObjectName, payload: object): unknown => {
      const decode = SEAM_DECODERS[objectName];
      if (decode === undefined) {
        return undefined; // an object the app genuinely never handles — flagged loudly
      }
      const result = decode(payload);
      return result.ok ? result.value : undefined;
    },
    presentedFields: (objectName: AdapterObjectName): readonly string[] =>
      presentedFieldsOf(objectName),
    supportedInteractionModes: (): readonly string[] => BROWSER_IMPLEMENTED_INTERACTION_MODES,
  };
}
