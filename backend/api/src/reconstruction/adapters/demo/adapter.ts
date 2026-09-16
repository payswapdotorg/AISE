/**
 * Deterministic zero-cost demo reconstruction provider (PROD-009) — the FREE
 * FALLBACK PATH behind the frozen AISE-012 contract.
 *
 * Contract (work order §PROD-009: "Add a deterministic demo provider/fixture
 * path that runs without paid GPU/model APIs"):
 *
 *  - HONEST READY: the descriptor's `availability: "READY"` is honest — the
 *    provider performs REAL deterministic in-process computation (digest
 *    derivation), exactly like the depth/LiDAR fusion adapter. What it does
 *    NOT do is reconstruct a site: every output region is labeled
 *    GENERATED_COMPLETION and the descriptor carries the constraint
 *    (`DEMO_GENERATED_COMPLETION_CONSTRAINT`) so no consumer can mistake
 *    demo output for observed or reconstructed geometry.
 *  - DETERMINISM: identical evidence → byte-identical outcomes. With an
 *    evidence bytes reader wired, outputs derive from the sha-256 of the
 *    evidence BYTES; without one, from the content ids (content-addressed
 *    digests of the bytes). Either way the same evidence yields the same
 *    artifacts — no clock, no randomness, no network.
 *  - ZERO NETWORK, ZERO COST: no inference endpoint, no model weights, no
 *    credentials, no paid API. The demo journey runs on the free tier.
 *  - EXPLICIT FAILURES: unsupported requested representations, an
 *    operator-disabled provider and unreadable evidence bytes are typed
 *    contract failures naming exactly what is wrong — never silent.
 */

import { parameterDigestOf } from "../../contract";
import type {
  InputModality,
  ProviderArtifactOutput,
  ProviderDescriptor,
  ProviderAvailability,
  ReconstructionOutcome,
  ReconstructionProvider,
  ReconstructionRequest,
  RepresentationType,
} from "../../contract";
import { canonicalizeJson } from "@aise/shared-contracts";
import { sha256Hex } from "../../../lib/hash";
import type { EvidenceBytesReader } from "../worldsculpt/backend";

export const DEMO_PROVIDER_ID = "aise-demo-reconstruction";
export const DEMO_PROVIDER_VERSION = "1.0.0";
export const DEMO_ADAPTER_VERSION = "1.0.0";
export const DEMO_COORDINATE_FRAME = "demo-scene-y-up-metric";
export const DEMO_SCALE_DECLARATION = "metric-meters";

/**
 * The honesty constraint carried verbatim in the descriptor and in every
 * output region note: demo output is GENERATED completion, never a real
 * capture or a reconstruction from observed evidence.
 */
export const DEMO_GENERATED_COMPLETION_CONSTRAINT =
  "demo output is GENERATED_COMPLETION-labeled synthetic geometry derived deterministically from evidence digests — never directly observed or reconstructed site geometry";

/** Output types the demo path can synthesize (bounded, honest set). */
export const DEMO_SUPPORTED_OUTPUTS: readonly RepresentationType[] = [
  "mesh",
  "point_cloud",
  "novel_view_images",
  "semantic_candidates",
];

const DEMO_INPUT_MODALITIES: readonly InputModality[] = [
  "still_image",
  "video",
  "depth_map",
  "point_cloud",
  "camera_poses",
  "imu",
  "reference_measurements",
];

const DEMO_LIMITATIONS: readonly string[] = [
  "demo fallback: synthetic placeholder geometry, not a reconstruction of the site",
  "all regions are labeled GENERATED_COMPLETION — downstream assurance must not treat demo output as observed evidence",
  "deterministic digest derivation: identical evidence yields identical output, by construction",
];

export interface DemoReconstructionProviderConfig {
  /**
   * Evidence bytes reader. Wired → outputs derive from the sha-256 of the
   * evidence bytes; absent → outputs derive from the content ids (which are
   * content-addressed digests of the bytes). Both modes are deterministic.
   */
  readonly evidenceReader?: EvidenceBytesReader;
  /**
   * Availability override for operators who need to disable the demo path
   * (or tests that need an explicit unavailable provider). The descriptor
   * always reflects the ACTUAL configured state — default READY, honestly.
   */
  readonly availability?: ProviderAvailability;
}

/** One entry of the deterministic derivation input. */
interface EvidenceDerivationEntry {
  readonly contentId: string;
  readonly bytesDigest: string | null;
}

export class DemoReconstructionProvider implements ReconstructionProvider {
  readonly descriptor: ProviderDescriptor;
  private readonly evidenceReader: EvidenceBytesReader | undefined;

  constructor(config: DemoReconstructionProviderConfig = {}) {
    this.evidenceReader = config.evidenceReader;
    this.descriptor = {
      providerId: DEMO_PROVIDER_ID,
      providerVersion: DEMO_PROVIDER_VERSION,
      adapterVersion: DEMO_ADAPTER_VERSION,
      supportedInputModalities: [...DEMO_INPUT_MODALITIES],
      supportedOutputModalities: [...DEMO_SUPPORTED_OUTPUTS],
      // Honest: real deterministic local computation (digest derivation).
      availability: config.availability ?? "READY",
      requiredInputMetadata: ["contentId"],
      coordinateFrames: [DEMO_COORDINATE_FRAME, "site-grid-metric"],
      scaleModes: [DEMO_SCALE_DECLARATION],
      sceneCapabilities: ["deterministic-synthetic-completion"],
      objectCapabilities: ["synthetic-placeholder-geometry"],
      uncertaintyCapabilities: ["epistemic-label-per-region"],
      executionRequirements: {
        gpu: "false",
        runtime: "deterministic-in-process",
        network: "none",
        cost: "zero",
        constraint: DEMO_GENERATED_COMPLETION_CONSTRAINT,
      },
      networkAccessRequirements: { inference: "none", paidApis: "none" },
      licenseTerms: {
        name: "AISE-internal",
        gatedWeights: "false",
        termsRef: "repository:backend/api/src/reconstruction/adapters/demo",
        note: "first-party deterministic demo implementation — no third-party model dependencies",
      },
      costLatencyCharacteristics: { status: "zero-cost-demo", qualification: "not-benchmarked" },
      benchmarkProfile: { status: "not-qualified", owner: "AISE-019" },
    };
  }

  async execute(request: ReconstructionRequest): Promise<ReconstructionOutcome> {
    // Operator-disabled provider: explicit typed failure, never silent.
    if (this.descriptor.availability !== "READY") {
      return {
        kind: "failure",
        code: "UNAVAILABLE",
        detail:
          `the demo reconstruction provider is configured '${this.descriptor.availability}' — ` +
          `demo execution is disabled; no computation was performed`,
      };
    }

    // Only synthesize what the demo path honestly supports.
    const unsupported = request.requestedRepresentations.filter(
      (representation) => !(DEMO_SUPPORTED_OUTPUTS as readonly string[]).includes(representation),
    );
    if (unsupported.length > 0) {
      return {
        kind: "failure",
        code: "INPUT_INCOMPATIBLE",
        detail:
          `the demo reconstruction provider does not produce representation type(s): ${unsupported.join(", ")} — ` +
          `supported outputs are ${DEMO_SUPPORTED_OUTPUTS.join(", ")}`,
      };
    }

    // Deterministic derivation input: evidence bytes digests when a reader is
    // wired, content ids (themselves content digests) otherwise.
    const evidence: EvidenceDerivationEntry[] = [];
    const unreadableIds: string[] = [];
    if (this.evidenceReader !== undefined) {
      for (const contentId of request.evidenceContentIds) {
        const bytes = await this.evidenceReader.read(contentId);
        if (bytes === null) {
          unreadableIds.push(contentId);
        } else {
          evidence.push({ contentId, bytesDigest: sha256Hex(bytes) });
        }
      }
      if (unreadableIds.length > 0) {
        return {
          kind: "failure",
          code: "INPUT_INCOMPATIBLE",
          detail:
            `evidence bytes are not readable for ${unreadableIds.length} content id(s): ` +
            `${unreadableIds.join(", ")} — wire an evidence bytes reader over the capture store`,
          missingEvidenceIds: unreadableIds,
        };
      }
    } else {
      for (const contentId of request.evidenceContentIds) {
        evidence.push({ contentId, bytesDigest: null });
      }
    }

    const mode = this.evidenceReader !== undefined ? "evidence-bytes" : "content-ids";
    const derivationDigest = sha256Hex(
      JSON.stringify(canonicalizeJson({ derivation: "aise-demo-deterministic-v1", mode, evidence })),
    );

    const artifacts = request.requestedRepresentations.map((representationType) =>
      this.artifactFor(representationType, request, derivationDigest, mode, evidence),
    );
    return { kind: "success", artifacts };
  }

  /** One fully-labeled synthetic candidate artifact (deterministic). */
  private artifactFor(
    representationType: RepresentationType,
    request: ReconstructionRequest,
    derivationDigest: string,
    mode: "evidence-bytes" | "content-ids",
    evidence: readonly EvidenceDerivationEntry[],
  ): ProviderArtifactOutput {
    const parameters = {
      derivation: "aise-demo-deterministic-v1",
      representationType,
      evidenceCount: evidence.length,
    };
    return {
      representationType,
      sourceEvidenceIds: [...request.evidenceContentIds],
      modelIdentity: `${DEMO_PROVIDER_ID}@${DEMO_PROVIDER_VERSION}`,
      parameters,
      parameterDigest: parameterDigestOf(parameters),
      coordinateFrame: DEMO_COORDINATE_FRAME,
      transforms: [],
      scaleDeclaration: DEMO_SCALE_DECLARATION,
      regions: [
        {
          regionId: `demo-${representationType}-completion`,
          epistemicLabel: "GENERATED_COMPLETION",
          note: DEMO_GENERATED_COMPLETION_CONSTRAINT,
        },
      ],
      qualityDiagnostics: {
        derivationDigest,
        derivationMode: mode,
        evidence: evidence.map((entry) => ({
          contentId: entry.contentId,
          bytesDigest: entry.bytesDigest,
        })),
      },
      limitations: [...DEMO_LIMITATIONS],
    };
  }
}
