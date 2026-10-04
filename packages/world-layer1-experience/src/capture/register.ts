/**
 * `@aise/world-layer1-experience` — the REGISTER transform
 * (WORLD-P1, `src/capture/register.ts`).
 *
 * The typed registration of a spatialized fragment into the site's
 * GEOSPATIAL context, expressed through the P0-A geospatial port
 * vocabulary (`SiteGeoreference` / `GeoreferenceVerdict` shapes) which
 * itself reuses the anchoring-contract vocabulary VERBATIM.
 *
 * THE REGISTRATION LAWS (fail-closed, zero fabrication):
 *
 *  1. ECHO LAW: every hypothesis must name evidence that EXISTS in the
 *     fragment (its `evidenceContentId` must be one of the fragment's
 *     asset content ids). A hypothesis naming foreign evidence is an
 *     ECHO FAILURE — recorded, never smuggled in.
 *  2. HYPOTHESIS QUALITY: hypotheses are consumed VERBATIM (the
 *     anchoring-contract owns their shape and laws); the lane checks
 *     only the minimal consistency the registration decision needs:
 *     the uncertainty budget law (`budget95M >= floorRmsM`) and a
 *     positive inlier count. A hypothesis failing these is a typed
 *     per-hypothesis refusal — recorded, never averaged away.
 *  3. INSUFFICIENT EVIDENCE FAILS CLOSED: fewer than
 *     `MIN_REGISTRATION_HYPOTHESES` admissible hypotheses → the whole
 *     registration is REFUSED (`insufficient-stills`, the
 *     anchoring-contract whole-request vocabulary) — ZERO georeference
 *     is fabricated, exactly as ANCHOR-003b refused 28/28 real stills
 *     rather than fabricate one anchor.
 *  4. PARTIAL IS TYPED: when some hypotheses are admissible and some
 *     refused, the outcome is `partial` (the anchoring vocabulary) and
 *     the georeference is the PARTIAL one — anchored on the admissible
 *     subset, with the refused per-asset reasons carried.
 *  5. THE GEOREFERENCE PRESERVES ITS DERIVATION: the established
 *     `SiteGeoreference.derivedFrom` carries the ADMITTED hypotheses
 *     verbatim (the P0-A law), never the refused ones.
 */

import { laneOk, laneRefuse, type LaneOutcome } from "../failures";
import type {
  CaptureRegistrationRequest,
  CaptureRegistrationResult,
  SpatializedWorldFragment,
} from "./contract";
import { CAPTURE_PORTS } from "./contract";
import type { AnchoringHypothesis } from "@aise/anchoring-contract";
import type { SiteGeoreference } from "@aise/world-reality-substrate";

/**
 * The minimum number of ADMITTED hypotheses a site registration
 * requires (the ANCHOR-002 policy floor `minStills: 2`, mirrored — the
 * anchoring-contract stays the owner; this is the lane's consumption
 * of that floor, declared and testable).
 */
export const MIN_REGISTRATION_HYPOTHESES = 2;

/** One hypothesis's admission verdict (typed, per-hypothesis). */
interface HypothesisAdmission {
  readonly hypothesis: AnchoringHypothesis;
  readonly admitted: boolean;
  readonly reason: string | null;
}

/**
 * Admit/refuse ONE hypothesis against the fragment (the echo law + the
 * minimal quality laws). PURE.
 */
function admitHypothesis(
  fragment: SpatializedWorldFragment,
  hypothesis: AnchoringHypothesis,
): HypothesisAdmission {
  const known = new Set(fragment.evidenceContentIds);
  if (!known.has(hypothesis.evidenceContentId)) {
    return {
      hypothesis,
      admitted: false,
      reason: "echo-failure: hypothesis names evidence outside this fragment",
    };
  }
  if (hypothesis.inlierCount <= 0) {
    return {
      hypothesis,
      admitted: false,
      reason: "zero-inlier hypothesis carries no admissible registration signal",
    };
  }
  const { uncertainty } = hypothesis;
  if (uncertainty.budget95M < uncertainty.floorRmsM) {
    return {
      hypothesis,
      admitted: false,
      reason: "uncertainty-budget violation: budget95M < floorRmsM",
    };
  }
  return { hypothesis, admitted: true, reason: null };
}

/**
 * REGISTER: hypotheses + candidate anchor → the typed registration
 * verdict. `anchored` (>= MIN admissible, ALL hypotheses admitted),
 * `partial` (>= MIN admissible, some refused), `refused` (fail closed
 * — zero bindings). The returned fragment carries the moved-forward
 * registration state and the georeference when established.
 */
export function registerCaptureFragment(
  request: CaptureRegistrationRequest,
): LaneOutcome<CaptureRegistrationResult> {
  const port = CAPTURE_PORTS.register;
  const { fragment } = request;

  // Gate 1: the fragment must be spatialized and unregistered (the
  // stage machine — registering a registered fragment is a semantic
  // error, never a silent overwrite).
  if (fragment.registrationState !== "unregistered") {
    return laneRefuse(
      "operation-semantic-failure",
      port,
      `fragment registrationState is ${fragment.registrationState}, not "unregistered" — ` +
        "re-registration requires a fresh spatialization",
      fragment.fragmentId,
    );
  }

  // Gate 2: the declared instant.
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(request.declaredAt)) {
    return laneRefuse(
      "contract-mismatch",
      port,
      `declaredAt is not an ISO-8601 UTC instant: ${String(request.declaredAt)}`,
    );
  }

  // Gate 3: the declared accuracy must be positive finite.
  if (!Number.isFinite(request.declaredAccuracyMetres) || request.declaredAccuracyMetres <= 0) {
    return laneRefuse(
      "contract-mismatch",
      port,
      "declaredAccuracyMetres must be a positive finite number (metres)",
    );
  }

  // Gate 4: the echo + quality admission of every hypothesis.
  const echoFailures: { evidenceContentId: string; reason: string }[] = [];
  const admitted: AnchoringHypothesis[] = [];
  for (const hypothesis of request.hypotheses) {
    const verdict = admitHypothesis(fragment, hypothesis);
    if (verdict.admitted) {
      admitted.push(hypothesis);
    } else {
      echoFailures.push({
        evidenceContentId: hypothesis.evidenceContentId,
        reason: verdict.reason ?? "refused",
      });
    }
  }

  // Gate 5: insufficient admissible evidence fails CLOSED (zero
  // fabricated georeferences — the ANCHOR-003b discipline).
  if (admitted.length < MIN_REGISTRATION_HYPOTHESES) {
    const result: CaptureRegistrationResult = {
      outcome: "refused",
      registrationState: "registration-refused",
      georeference: null,
      reason:
        `insufficient-stills: ${admitted.length} admissible hypothesis(es), ` +
        `${MIN_REGISTRATION_HYPOTHESES} required`,
      echoFailures,
      fragment: { ...fragment, registrationState: "registration-refused" },
    };
    return laneOk(result);
  }

  // The established georeference (P0-A SiteGeoreference shape — the
  // ADMITTED hypotheses verbatim in derivedFrom, never the refused).
  const georeference: SiteGeoreference = {
    anchor: request.candidateAnchor,
    accuracyMetres: request.declaredAccuracyMetres,
    derivedFrom: admitted,
  };

  // Gate 6: the partial/anchored split — ALL admissible + zero
  // refused = anchored; some refused = partial (typed, honest).
  const outcome = echoFailures.length === 0 ? "anchored" : "partial";
  const registrationState = outcome === "anchored" ? "site-registered" : "partially-registered";

  const registeredFragment: SpatializedWorldFragment = {
    ...fragment,
    registrationState,
  };

  const result: CaptureRegistrationResult = {
    outcome,
    registrationState,
    georeference,
    reason: outcome === "partial" ? "partial: some hypotheses refused (see echoFailures)" : null,
    echoFailures,
    fragment: registeredFragment,
  };
  return laneOk(result);
}
