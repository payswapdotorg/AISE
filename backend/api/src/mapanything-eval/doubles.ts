/**
 * HFX-101 — the deterministic MapAnything fixture DOUBLE.
 *
 * In-repo stand-in for the registered candidate model's behavior on the
 * benchmark corpus (the `providerFixture` / reference-provider pattern of
 * the control plane testkit): NO NETWORK, no live MapAnything execution
 * (the binding dataset/model-use rule — the profile is a REGISTERED
 * CANDIDATE whose behavior on this corpus is derived from the INPUT DATA).
 * The double:
 *
 *  - consumes the declared input contract `{ task, sceneTag, captureSetJson,
 *    fixtureId?, deviceClass?, gridWidth?, gridHeight?, samples? }` (a
 *    CLOSED contract — the double invents no input fields) and answers
 *    through the declared output contract `{ planeNormals?, planeOffsets?,
 *    measuredDimensions?, measuredVolumes?, note?, depthMap?, unit?,
 *    uncertaintySigmaM? }` — the normalized Layer-1 canonical shapes;
 *  - derives its behavior from the DATA, never from magic tags: the task
 *    gate (the declared task set), the resource gate (the fused point
 *    total vs the declared 50000-point envelope), the coverage gate (the
 *    frames' union vs the declared 80% minimum) and the inter-pass overlap
 *    gate (the registration passes' shared surfaces vs the declared 30%
 *    minimum) — the corpus metadata (behavior class / matrix cell) steers
 *    NOTHING here;
 *  - NEVER fabricates geometry, depth, poses or registration results when
 *    the provider fails or the evidence is insufficient: every gate answers
 *    an EXPLICIT closed-vocabulary failure whose detail carries the capture
 *    requirement, the bounded uncertainty and (for the resource gate) the
 *    declared fallback — never a partial or silently-downgraded
 *    reconstruction;
 *  - delegates its well-grounded RECONSTRUCTION core to the EXISTING
 *    deterministic reference double (imported from the reality-eval
 *    testkit, never modified): the least-squares plane fits over the
 *    ground-truth-blind capture view — the honest provider-substitution
 *    demonstration (identical canonical outcomes; the reconstruction-lane
 *    metric deltas vs the reference path are exactly 0);
 *  - answers metric depth through the documented deviation profile
 *    (+0.1% scale, +2mm offset over the documented depth truth — the
 *    measurable, threshold-passing non-zero delta of the depth-lane
 *    comparison row) with the declared per-answer measurement uncertainty;
 *  - carries an OPAQUE provider-native payload for provenance ONLY —
 *    carried verbatim, digested, never parsed into any canonical domain
 *    type (the technology-substitution rule).
 *
 * DETERMINISM: pure computation over the declared input — no clock, no
 * randomness, no I/O. Identical executions are byte-identical.
 */

import type { ProviderProfile, RawProviderExecution } from "@aise/provider-registry";
import { fixtureById, captureViewOf } from "../benchmarks";
import {
  executeFixtureReconstructionProvider,
  fixtureDepthTruth,
  fixtureReconstructionProfileV1,
} from "../reality-eval/testkit";
import {
  MAPANYTHING_DECLARED_FALLBACK,
  MAPANYTHING_DEGRADED_BOUND_SIGMA_M,
  MAPANYTHING_DEPTH_OFFSET_M,
  MAPANYTHING_DEPTH_SCALE_DEVIATION,
  MAPANYTHING_DEPTH_SIGMA_M,
  MAPANYTHING_MAX_FUSED_POINTS,
  MAPANYTHING_MIN_COVERAGE_RATIO,
  MAPANYTHING_MIN_INTER_PASS_OVERLAP_RATIO,
  MAPANYTHING_TASKS,
  MapAnythingEvalError,
  parseMapAnythingCaptureSet,
} from "./model";
import type { MapAnythingCaptureSet } from "./model";

/** The engine tag the opaque native payload carries (provenance only). */
export const MAPANYTHING_DOUBLE_ENGINE = "mapanything-eval-double" as const;

/** The media type of the double's opaque provider-native payload. */
export const MAPANYTHING_DOUBLE_NATIVE_MEDIA_TYPE =
  "application/aise-hfx101-mapanything-eval-double+json" as const;

interface DoubleInputPayload {
  readonly task: string;
  readonly sceneTag: string;
  readonly captureSetJson: string;
  readonly fixtureId?: string;
  readonly deviceClass?: string;
  readonly gridWidth?: number;
  readonly gridHeight?: number;
  readonly samples?: readonly number[];
}

/* ------------------------------------------------------------------ */
/* The data-driven gates (the declared capture requirements)            */
/* ------------------------------------------------------------------ */

/** The declared gate readings of one capture set (pure, data-derived). */
export interface CaptureGateReadings {
  readonly captureSetId: string;
  readonly purpose: string;
  readonly frameCount: number;
  readonly fusedPoints: number;
  readonly canonicalSurfaceCount: number;
  readonly coveredSurfaceCount: number;
  readonly coverageRatio: number;
  /** Present for registration capture sets: the inter-pass overlap over the union surfaces. */
  readonly interPassOverlapRatio: number | null;
}

/**
 * Reads the declared gates off a capture set + its fixture (PURE): the
 * fused point total, the union coverage over the fixture's canonical
 * surfaces and (for registration capture sets) the inter-pass overlap.
 */
export function readCaptureGates(
  captureSet: MapAnythingCaptureSet,
  fixtureId: string | undefined,
): CaptureGateReadings {
  const fixture = fixtureId === undefined ? undefined : fixtureById(fixtureId);
  if (fixtureId !== undefined && fixture === undefined) {
    throw new MapAnythingEvalError(
      "invalid_fixture",
      `the capture set references unknown Layer-1 golden fixture '${fixtureId}'`,
    );
  }
  const canonical = fixture === undefined ? [] : fixture.groundTruth.surfaces.map((s) => s.surfaceId);
  const known = new Set(canonical);
  const covered = new Set<string>();
  for (const entry of captureSet.frames) {
    for (const surfaceId of entry.observedSurfaceIds) {
      if (!known.has(surfaceId)) {
        throw new MapAnythingEvalError(
          "invalid_fixture",
          `frame '${entry.frameId}' observes surface '${surfaceId}' which is not a canonical surface of ` +
            `fixture '${fixtureId}' — capture-set fixture references must be coherent`,
        );
      }
      covered.add(surfaceId);
    }
  }
  let interPassOverlapRatio: number | null = null;
  if (captureSet.passes !== undefined) {
    const [passA, passB] = captureSet.passes;
    if (passA === undefined || passB === undefined) {
      throw new MapAnythingEvalError(
        "invalid_fixture",
        "a registration capture set requires exactly two passes",
      );
    }
    const frameById = new Map(captureSet.frames.map((entry) => [entry.frameId, entry]));
    const surfacesOf = (pass: readonly string[]): ReadonlySet<string> => {
      const surfaces = new Set<string>();
      for (const frameId of pass) {
        const entry = frameById.get(frameId);
        if (entry === undefined) {
          throw new MapAnythingEvalError(
            "invalid_fixture",
            `pass references unknown frame '${frameId}'`,
          );
        }
        for (const surfaceId of entry.observedSurfaceIds) {
          surfaces.add(surfaceId);
        }
      }
      return surfaces;
    };
    const a = surfacesOf(passA.frameIds);
    const b = surfacesOf(passB.frameIds);
    const shared = [...a].filter((surfaceId) => b.has(surfaceId)).length;
    const union = new Set([...a, ...b]).size;
    interPassOverlapRatio = union === 0 ? 0 : shared / union;
  }
  return {
    captureSetId: captureSet.captureSetId,
    purpose: captureSet.purpose,
    frameCount: captureSet.frames.length,
    fusedPoints: captureSet.frames.reduce((sum, entry) => sum + entry.pointCount, 0),
    canonicalSurfaceCount: canonical.length,
    coveredSurfaceCount: covered.size,
    coverageRatio: canonical.length === 0 ? 1 : covered.size / canonical.length,
    interPassOverlapRatio,
  };
}

/* ------------------------------------------------------------------ */
/* The double                                                           */
/* ------------------------------------------------------------------ */

function nativePayloadOf(
  profile: ProviderProfile,
  payload: DoubleInputPayload,
  captureSetId: string,
): { mediaType: string; payload: Record<string, unknown> } {
  return {
    mediaType: MAPANYTHING_DOUBLE_NATIVE_MEDIA_TYPE,
    payload: {
      engine: MAPANYTHING_DOUBLE_ENGINE,
      providerId: profile.providerId,
      technologyVersion: profile.technologyVersion,
      task: payload.task,
      captureSetId,
      note:
        "opaque provider-native payload — the deterministic double standing in for the registered " +
        "MapAnything candidate; carried for provenance only, never parsed into canonical domain types",
    },
  };
}

/**
 * Executes the MapAnything evaluation double over one scenario input
 * (deterministic, data-driven): the task gate → the resource gate → the
 * coverage gate → the inter-pass overlap gate, then the content paths
 * (the delegated reconstruction core / the documented metric-depth
 * deviation). Every gate answers an EXPLICIT closed-vocabulary failure —
 * never fabricated geometry, depth, poses or registration results.
 */
export function executeMapAnythingDouble(
  profile: ProviderProfile,
  input: { readonly payload: Record<string, unknown> },
): RawProviderExecution {
  const payload = input.payload as unknown as DoubleInputPayload;
  const capability = profile.capabilities[0] ?? "reconstruction";
  const captureSet = parseMapAnythingCaptureSet(JSON.parse(payload.captureSetJson));
  const native = nativePayloadOf(profile, payload, captureSet.captureSetId);

  /* Gate 1 — the task gate: a task outside the declared set is an explicit
     unsupported refusal, never a guess. */
  if (!(MAPANYTHING_TASKS as readonly string[]).includes(payload.task)) {
    return {
      capability,
      failure: {
        kind: "unsupported-data",
        detail:
          `task '${payload.task}' is outside the declared capability set of provider ` +
          `'${profile.providerId}' (${profile.technologyVersion}) — declared tasks: ` +
          `[${MAPANYTHING_TASKS.join(", ")}]; explicit unsupported refusal, never a guess`,
      },
      providerNative: native,
    };
  }

  /* Gate 2 — the resource gate: the fused capture set above the declared
     point envelope is an explicit non-ready state with the declared
     fallback — never a partial reconstruction. */
  const readings = readCaptureGates(captureSet, payload.fixtureId);
  if (readings.fusedPoints > MAPANYTHING_MAX_FUSED_POINTS) {
    return {
      capability,
      failure: {
        kind: "resource-exhaustion",
        detail:
          `the fused capture set '${readings.captureSetId}' totals ${readings.fusedPoints} points ` +
          `across ${readings.frameCount} frames — above the declared ${MAPANYTHING_MAX_FUSED_POINTS}-point ` +
          `resource envelope (the declared memory profile's ceiling); explicit non-ready state: no ` +
          `reconstruction is emitted and the declared fallback is the deterministic reference ` +
          `reconstruction path (${MAPANYTHING_DECLARED_FALLBACK}) until the capture set is reduced below ` +
          `the envelope; never fabricated geometry`,
      },
      providerNative: native,
    };
  }

  /* Gate 3 — the coverage gate: below-minimum coverage answers the capture
     requirement + the bounded uncertainty, never silently-downgraded
     geometry. */
  if (readings.coverageRatio < MAPANYTHING_MIN_COVERAGE_RATIO) {
    const fixture = payload.fixtureId === undefined ? undefined : fixtureById(payload.fixtureId);
    const covered = new Set(
      captureSet.frames.flatMap((entry) => [...entry.observedSurfaceIds]),
    );
    const uncovered =
      fixture === undefined
        ? []
        : fixture.groundTruth.surfaces
            .map((surface) => surface.surfaceId)
            .filter((surfaceId) => !covered.has(surfaceId));
    return {
      capability,
      failure: {
        kind: "unsupported-data",
        detail:
          `the capture set '${readings.captureSetId}' covers ${readings.coveredSurfaceCount} of ` +
          `${readings.canonicalSurfaceCount} canonical surfaces (${(readings.coverageRatio * 100).toFixed(1)}%, ` +
          `below the declared ${(MAPANYTHING_MIN_COVERAGE_RATIO * 100).toFixed(0)}% minimum); capture ` +
          `requirement: re-capture the uncovered surfaces [${uncovered.join(", ")}] with posed frames ` +
          `sharing stations with the existing pass; bounded uncertainty: sigma >= ` +
          `${MAPANYTHING_DEGRADED_BOUND_SIGMA_M} m over the uncovered region (above the declared capture ` +
          `envelope) — explicit refusal, never silently-downgraded geometry`,
      },
      providerNative: native,
    };
  }

  /* Gate 4 — the inter-pass overlap gate (registration tasks): below-minimum
     shared surfaces answer the capture requirement + the bounded
     uncertainty across the registration seam. */
  if (
    payload.task === "registration" &&
    readings.interPassOverlapRatio !== null &&
    readings.interPassOverlapRatio < MAPANYTHING_MIN_INTER_PASS_OVERLAP_RATIO
  ) {
    return {
      capability,
      failure: {
        kind: "unsupported-data",
        detail:
          `the capture passes of '${readings.captureSetId}' share too few of their union surfaces ` +
          `(${(readings.interPassOverlapRatio * 100).toFixed(1)}% overlap, below the declared ` +
          `${(MAPANYTHING_MIN_INTER_PASS_OVERLAP_RATIO * 100).toFixed(0)}% minimum); capture requirement: ` +
          `add shared stations observing surfaces common to both passes so the registration seam is ` +
          `constrained; bounded uncertainty: sigma >= ${MAPANYTHING_DEGRADED_BOUND_SIGMA_M} m across the ` +
          `un-overlapped registration seam (above the declared capture envelope) — explicit refusal, ` +
          `never silently-downgraded geometry`,
      },
      providerNative: native,
    };
  }

  /* The content paths. */

  if (payload.task === "metric-depth") {
    const samples = payload.samples ?? [];
    const truth = fixtureDepthTruth(samples);
    const depthMap = truth.map((value) => value * (1 + MAPANYTHING_DEPTH_SCALE_DEVIATION) + MAPANYTHING_DEPTH_OFFSET_M);
    return {
      capability,
      outputs: {
        depthMap,
        unit: "m",
        note:
          `${MAPANYTHING_DOUBLE_ENGINE} 1: metric depth over the 4x4 wall grid — the documented depth ` +
          `truth with the documented deviation profile (+${(MAPANYTHING_DEPTH_SCALE_DEVIATION * 100).toFixed(1)}% ` +
          `scale, +${MAPANYTHING_DEPTH_OFFSET_M.toFixed(3)} m offset); declared measurement uncertainty ` +
          `sigma=${MAPANYTHING_DEPTH_SIGMA_M} m (the deviation bound)`,
        uncertaintySigmaM: MAPANYTHING_DEPTH_SIGMA_M,
      },
      providerNative: native,
    };
  }

  /* The well-grounded reconstruction core: DELEGATED to the EXISTING
     deterministic reference double over the same ground-truth-blind capture
     view (imported, never modified) — the provider-substitution
     demonstration. The double re-declares the note and the per-answer
     measurement uncertainty propagated from the declared capture noise
     envelope; the native payload is its own. */
  if (payload.fixtureId === undefined || payload.deviceClass === undefined) {
    throw new MapAnythingEvalError(
      "invalid_fixture",
      "a reconstruction task requires the fixtureId and deviceClass input fields",
    );
  }
  const reference = executeFixtureReconstructionProvider(
    fixtureReconstructionProfileV1(),
    {
      kind: "provider-input",
      capability: "reconstruction",
      payload: {
        fixtureId: payload.fixtureId,
        deviceClass: payload.deviceClass,
        sceneTag: payload.sceneTag,
      },
    },
  );
  if (reference.outputs === undefined) {
    throw new MapAnythingEvalError(
      "invalid_fixture",
      "the delegated reconstruction core must carry outputs over a grounded capture set",
    );
  }
  const noiseSigmaM = captureViewOf(fixtureById(payload.fixtureId)!).noise.sigmaM;
  const outputs = { ...reference.outputs } as Record<string, unknown>;
  outputs["note"] =
    `${MAPANYTHING_DOUBLE_ENGINE} 1: multi-image fusion of ${readings.frameCount} frames across ` +
    `${new Set(captureSet.frames.map((entry) => entry.station)).size} stations — least-squares plane ` +
    `fits over the ground-truth-blind capture view (the shared deterministic reconstruction core); ` +
    `declared measurement uncertainty sigma=${noiseSigmaM} m propagated from the declared capture ` +
    `noise envelope`;
  outputs["uncertaintySigmaM"] = noiseSigmaM;
  return {
    capability,
    outputs,
    providerNative: native,
  };
}
