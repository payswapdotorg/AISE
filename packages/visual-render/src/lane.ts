/**
 * HFX-303 — the LANE-SIDE EXECUTION ENTRY of the visual-eval runner.
 *
 * WHY THIS MODULE EXISTS: the workspace boundary matrix forbids tools →
 * packages imports, and tools/ cannot resolve bare `@aise/*` specifiers
 * (only workspace packages get node_modules links). The runner
 * `tools/visual-eval/run.ts` therefore ORCHESTRATES from the tools zone
 * and reaches the lane through THIS entry: a thin, deterministic
 * JSON-in/JSON-out worker executed as `bun packages/visual-render/src/lane.ts
 * <command>` — run from the package's own directory context where the
 * workspace imports resolve. ALL verdict logic, record assembly and file
 * writing live in the tools runner; this module only executes lane-side
 * computations and emits raw materials (bytes, artifacts, outcomes) as
 * one JSON value on stdout.
 *
 * COMMANDS (each prints one JSON value; exit 0 on success, 2 on usage
 * error, 1 on an internal lane error):
 *
 *   corpus                                  — the case inventory (ids,
 *                                             identities, projection digests)
 *   swap --case <id>                        — canonical bytes before/after
 *                                             rendering through the reference
 *                                             AND alternate providers, plus
 *                                             both artifacts
 *   noninterfere --case <id>                — quantities + validation bytes
 *                                             re-derived around renders
 *                                             through EVERY provider
 *   sabotage --case <id>                    — the rogue-provider drill: the
 *                                             lane-defended path (typed
 *                                             refusal, bytes unchanged) and
 *                                             the direct-mutation path (the
 *                                             numeric mutation lands — the
 *                                             runner's comparison must
 *                                             detect it)
 *   fallback --case <id>                    — the failing provider's typed
 *                                             outcome + both fallback
 *                                             records (provider-failure and
 *                                             provider-absent)
 *
 * DETERMINISM: everything below is pure computation over the committed
 * corpus (fixed instants, no clock reads, no network, no randomness);
 * identical commands emit byte-identical JSON.
 */

import { canonicalJsonStringify } from "@aise/shared-contracts";
import { deriveStateQuantities, validateSolutionVersion } from "@aise/solution-engine";
import { REFERENCE_BUILDING_OPERATION_PROFILE } from "@aise/solution-contract";
import type { VisualRenderOutcome, VisualRenderProvider } from "./port";
import { renderThroughLane } from "./port";
import { verifyVisualArtifact } from "./provenance";
import { providerReferenceOf } from "./provenance";
import {
  fallbackForMissingProvider,
  fallbackForProviderFailure,
  canonicalProjectionDigestOf,
} from "./fallback";
import { createReferenceVisualProvider } from "./providers/reference";
import { createAlternateVisualProvider } from "./providers/alternate";
import { createFailingVisualProvider } from "./providers/failing";
import { buildVisualCorpus, demoBaselineGeometryResolver, type VisualCorpusCase } from "./corpus";

/* ------------------------------------------------------------------ */
/* The lane providers                                                   */
/* ------------------------------------------------------------------ */

/** The three in-repo lane providers, deterministically constructed. */
export function laneProviders(): readonly {
  readonly key: "reference" | "alternate" | "failing";
  readonly provider: VisualRenderProvider;
}[] {
  return [
    { key: "reference", provider: createReferenceVisualProvider() },
    { key: "alternate", provider: createAlternateVisualProvider() },
    { key: "failing", provider: createFailingVisualProvider() },
  ];
}

/**
 * The ROGUE provider (the sabotage drill's simulated numeric mutation): it
 * delegates to the reference renderer but FIRST mutates a numeric
 * coordinate of the request's canonical plan projection — the exact
 * interference the lane must defend against and the runner's comparison
 * must detect when the lane is bypassed.
 */
export function createRogueMutatingProvider(): VisualRenderProvider {
  const reference = createReferenceVisualProvider();
  return {
    descriptor: reference.descriptor,
    renderVisual(state): VisualRenderOutcome {
      const shapes = state.canonicalProjections.plan.shapes;
      if (shapes.length > 0 && shapes[0] !== undefined && shapes[0].points[0] !== undefined) {
        const point = shapes[0].points[0] as mutableTuple;
        point[0] = point[0] + 0.5; // the simulated numeric mutation
      }
      return reference.renderVisual(state);
    },
  };
}

type mutableTuple = [number, number];

/* ------------------------------------------------------------------ */
/* Drill material builders                                              */
/* ------------------------------------------------------------------ */

function caseOrThrow(caseId: string): VisualCorpusCase {
  const found = buildVisualCorpus().find((entry) => entry.caseId === caseId);
  if (found === undefined) {
    throw new Error(`unknown corpus case '${caseId}'`);
  }
  return found;
}

/** The canonical projection bytes of a case's request (both modes). */
function projectionBytesOf(corpusCase: VisualCorpusCase): {
  readonly plan: string;
  readonly axonometric: string;
} {
  return {
    plan: canonicalJsonStringify(corpusCase.request.canonicalProjections.plan),
    axonometric: canonicalJsonStringify(corpusCase.request.canonicalProjections.axonometric),
  };
}

/** The swap drill material: canonical bytes before/after BOTH providers. */
export function swapMaterial(caseId: string): Record<string, unknown> {
  const corpusCase = caseOrThrow(caseId);
  const before = {
    stateBytes: corpusCase.canonicalStateBytes,
    versionBytes: corpusCase.canonicalVersionBytes,
    projections: projectionBytesOf(corpusCase),
  };
  const reference = renderThroughLane(
    createReferenceVisualProvider(),
    corpusCase.request,
  );
  const alternate = renderThroughLane(
    createAlternateVisualProvider(),
    corpusCase.request,
  );
  const after = {
    stateBytes: canonicalJsonStringify(corpusCase.state),
    versionBytes: canonicalJsonStringify(corpusCase.version),
    projections: projectionBytesOf(corpusCase),
  };
  return {
    command: "swap",
    caseId,
    stateIdentity: corpusCase.request.state,
    visualClass: corpusCase.request.visualClass,
    before,
    after,
    reference,
    alternate,
  };
}

/** The non-interference drill material: engine outputs around ALL renders. */
export function noninterferenceMaterial(caseId: string): Record<string, unknown> {
  const corpusCase = caseOrThrow(caseId);
  const baseline = {
    stateBytes: corpusCase.canonicalStateBytes,
    versionBytes: corpusCase.canonicalVersionBytes,
    quantitiesBytes: corpusCase.canonicalQuantitiesBytes,
    validationBytes: corpusCase.canonicalValidationBytes,
    projections: projectionBytesOf(corpusCase),
  };
  const renders = laneProviders().map(({ key, provider }) => {
    const outcome = renderThroughLane(provider, corpusCase.request);
    return {
      providerKey: key,
      providerId: provider.descriptor.providerId,
      technologyVersion: provider.descriptor.technologyVersion,
      descriptorDigest: providerReferenceOf(provider.descriptor).descriptorDigest,
      outcome,
    };
  });
  // Re-derive the engine outputs AFTER every render — fresh computation
  // through the engine's public surface over the same in-memory version:
  // any interference a provider could have exerted would surface here.
  const post = {
    stateBytes: canonicalJsonStringify(corpusCase.state),
    versionBytes: canonicalJsonStringify(corpusCase.version),
    quantitiesBytes: canonicalJsonStringify(
      deriveStateQuantities(corpusCase.version, corpusCase.state.stateIndex),
    ),
    validationBytes: canonicalJsonStringify(
      validateSolutionVersion({
        version: corpusCase.version,
        capabilityProfile: REFERENCE_BUILDING_OPERATION_PROFILE,
        validatedAt: "2026-09-16T12:00:00.000Z",
        baselineGeometry: demoBaselineGeometryResolver(),
      }),
    ),
    projections: projectionBytesOf(corpusCase),
  };
  return {
    command: "noninterfere",
    caseId,
    stateIdentity: corpusCase.request.state,
    baseline,
    post,
    renders,
  };
}

/** The sabotage drill material (the rogue numeric mutation, both paths). */
export function sabotageMaterial(caseId: string): Record<string, unknown> {
  const corpusCase = caseOrThrow(caseId);
  const before = projectionBytesOf(corpusCase);

  // Path 1 — THROUGH the governed lane: the request is cloned + frozen, so
  // the rogue's mutation throws and the lane answers a typed refusal;
  // the caller's canonical projections stay untouched.
  const laneOutcome = renderThroughLane(createRogueMutatingProvider(), corpusCase.request);
  const afterLane = projectionBytesOf(corpusCase);

  // Path 2 — DIRECT (the lane bypassed, an unfrozen working copy): the
  // rogue's numeric mutation LANDS on the working copy — the runner's
  // byte-comparison must DETECT the inequality (the check has teeth).
  const working = structuredClone(corpusCase.request);
  const rogue = createRogueMutatingProvider();
  rogue.renderVisual(working);
  const afterDirect = {
    plan: canonicalJsonStringify(working.canonicalProjections.plan),
    axonometric: canonicalJsonStringify(working.canonicalProjections.axonometric),
  };

  return {
    command: "sabotage",
    caseId,
    stateIdentity: corpusCase.request.state,
    before,
    laneDefended: {
      outcome: laneOutcome,
      projectionsAfter: afterLane,
    },
    directMutation: {
      projectionsAfter: afterDirect,
      note:
        "the rogue provider mutated the numeric coordinate of the working copy's plan projection " +
        "BECAUSE the governed lane was bypassed — the runner's before/after comparison must record " +
        "this as a DETECTED divergence (the non-interference check has teeth)",
    },
  };
}

/** The fallback drill material: the failing provider + missing provider. */
export function fallbackMaterial(caseId: string): Record<string, unknown> {
  const corpusCase = caseOrThrow(caseId);
  const failingOutcome = renderThroughLane(
    createFailingVisualProvider(),
    corpusCase.request,
  );
  if (failingOutcome.ok) {
    throw new Error("the failing fixture provider unexpectedly produced an artifact");
  }
  const failingFallback = fallbackForProviderFailure(corpusCase.request, failingOutcome.failure);
  const missingFallback = fallbackForMissingProvider(corpusCase.request);
  return {
    command: "fallback",
    caseId,
    stateIdentity: corpusCase.request.state,
    visualClass: corpusCase.request.visualClass,
    canonicalProjectionDigests: {
      plan: canonicalProjectionDigestOf(corpusCase.request.canonicalProjections.plan),
      axonometric: canonicalProjectionDigestOf(
        corpusCase.request.canonicalProjections.axonometric,
      ),
    },
    failingOutcome,
    failingFallbackRecord: failingFallback,
    missingFallbackRecord: missingFallback,
  };
}

/** The corpus inventory. */
export function corpusInventory(): Record<string, unknown> {
  return {
    command: "corpus",
    cases: buildVisualCorpus().map((corpusCase) => ({
      caseId: corpusCase.caseId,
      description: corpusCase.description,
      visualClass: corpusCase.visualClass,
      stateIdentity: corpusCase.request.state,
      canonicalShapeCount: corpusCase.request.canonicalProjections.plan.shapes.length,
      canonicalOmissionCount: corpusCase.request.canonicalProjections.plan.omissions.length,
      canonicalProjectionDigests: {
        plan: canonicalProjectionDigestOf(corpusCase.request.canonicalProjections.plan),
        axonometric: canonicalProjectionDigestOf(
          corpusCase.request.canonicalProjections.axonometric,
        ),
      },
      stateContentDigest: corpusCase.request.state.stateContentDigest,
    })),
  };
}

/* ------------------------------------------------------------------ */
/* The CLI                                                              */
/* ------------------------------------------------------------------ */

function usage(): never {
  process.stderr.write(
    "usage: bun packages/visual-render/src/lane.ts <corpus|swap|noninterfere|sabotage|fallback> [--case <id>]\n",
  );
  process.exit(2);
}

function emit(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

if (import.meta.main) {
  const [command, ...rest] = process.argv.slice(2);
  let caseId = "";
  for (let index = 0; index < rest.length; index += 1) {
    if (rest[index] === "--case" && rest[index + 1] !== undefined) {
      caseId = rest[index + 1] ?? "";
      index += 1;
    }
  }
  try {
    switch (command) {
      case "corpus":
        emit(corpusInventory());
        break;
      case "swap":
        if (caseId === "") usage();
        emit(swapMaterial(caseId));
        break;
      case "noninterfere":
        if (caseId === "") usage();
        emit(noninterferenceMaterial(caseId));
        break;
      case "sabotage":
        if (caseId === "") usage();
        emit(sabotageMaterial(caseId));
        break;
      case "fallback":
        if (caseId === "") usage();
        emit(fallbackMaterial(caseId));
        break;
      default:
        usage();
    }
  } catch (error) {
    process.stderr.write(
      `lane error: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exit(1);
  }
}

// Re-export the artifact verifier for drill consumers (the runner's
// records embed verification outcomes).
export { verifyVisualArtifact };
