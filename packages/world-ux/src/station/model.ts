/**
 * WORLD-P4 — the station family: the committed world-station scenario
 * — the ONE deterministic composition context both the package's
 * substitution tests and the `apps/web/src/app/world/` route render
 * (law #9: no network, no clock reads, no randomness — the station is
 * seeded only by composed lane state).
 *
 * The station scenario carries:
 *   - the scope label + the declared composition instant (the wiring
 *     doubles' committed constants);
 *   - the INITIAL CAMERA: the typed P0-A camera the station opens
 *     with (an orbit framing of the fixture world's site frame —
 *     declared values, never sensed);
 *   - the `openWorldStation` controlled entry: sources + context →
 *     the complete bound `WorldStationModel` (the wiring family's
 *     `bindWorldStation`, re-exported as the station family's face).
 */

import type { CameraState } from "@aise/world-reality-substrate";
import { deepFreeze, worldUxRefused, type WorldUxOutcome } from "../seam";
import type { WorldStationModel, WorldStationSources } from "../wiring/contract";
import { bindWorldStation } from "../wiring/contract";
import {
  STATION_COMPOSED_AT,
  STATION_SCOPE_LABEL,
  referenceWorldStationSources,
} from "../wiring/doubles";

/* ------------------------------------------------------------------ */
/* The committed station scenario                                       */
/* ------------------------------------------------------------------ */

/**
 * The station's INITIAL CAMERA: an orbit view framing the fixture
 * world's site (declared site-frame values over the P1 fixture
 * geometry — presentation data, never authoritative geometry).
 */
export const STATION_INITIAL_CAMERA: CameraState = deepFreeze({
  position: [8, -8, 6],
  target: [0, 0, 1],
  up: [0, 0, 1],
  fovRadians: 0.9,
  mode: "orbit",
});

/**
 * The committed station binding context (the deterministic seeds):
 * the scope label, the declared composition instant and the initial
 * camera. This is the ONE context the route and the tests compose.
 */
export const STATION_BINDING_CONTEXT = deepFreeze({
  scopeLabel: STATION_SCOPE_LABEL,
  composedAt: STATION_COMPOSED_AT,
  initialCamera: STATION_INITIAL_CAMERA,
});

/**
 * Open the world station over the REFERENCE source double (the
 * committed station scenario): the controlled entry the world route
 * calls. Deterministic: the same committed fixtures produce the
 * byte-identical station model.
 */
export function openReferenceWorldStation(): WorldUxOutcome<WorldStationModel> {
  return bindWorldStation(referenceWorldStationSources(), STATION_BINDING_CONTEXT);
}

/**
 * Open a world station over caller-supplied sources (the generic
 * controlled entry — the substitution tests call this with the
 * alternate kit; the route may bind its own adapters).
 */
export function openWorldStation(
  sources: WorldStationSources,
  context: {
    readonly scopeLabel: string;
    readonly composedAt: string;
    readonly initialCamera: CameraState;
  },
): WorldUxOutcome<WorldStationModel> {
  if (typeof context.initialCamera?.position?.[0] !== "number") {
    return worldUxRefused<WorldStationModel>(
      "station",
      "contract-mismatch",
      "station: the initial camera must be a typed P0-A CameraState",
    );
  }
  return bindWorldStation(sources, context);
}
