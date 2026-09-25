/**
 * HFX-401 — the provider scorecard / promotion / rollback CHECK RUNNER
 * (the tools/ pickup — the geometry-eval runner convention).
 *
 * STANDALONE by design (the workspace boundary matrix forbids tools →
 * packages/backend imports): this runner consumes ONLY committed data —
 *
 *   docs/productization-evidence/HFX-401/runs/lane-registry.json
 *       the scored-provider corpus projection (the engine's committed
 *       input registry: identities, digests, rows, drill kits)
 *   docs/productization-evidence/HFX-401/runs/*.json
 *       the committed scorecard / promotion / rollback records
 *   tools/geometry-eval/fixtures/expected-outcomes.json
 *       the committed HFX-302 corpus (the evidence universe)
 *   tools/equivalence-eval/fixtures/expected-outcomes.json
 *       the committed HFX-301 corpus (the Layer-3 dependent-layer citation)
 *
 * — and INDEPENDENTLY rebuilds every record with mirrored frozen
 * reference data (the ten-gate vocabulary, the per-layer checklist, the
 * drill-registry event construction, the control-plane three-gate
 * evaluation) plus independent arithmetic (sha-256 content addresses,
 * verdict recomputation, refusal completeness, replay-set completeness).
 * The rebuilt records must equal the committed files BYTE-FOR-BYTE —
 * drift fails the gate. The backend-side golden test is the live leg;
 * this runner is the committed-data leg (the two-leg discipline).
 *
 * Commands:
 *
 *   bun tools/provider-scorecard/runner.ts --list
 *   bun tools/provider-scorecard/runner.ts scorecard <provider-id>
 *   bun tools/provider-scorecard/runner.ts promotion <provider-id>
 *   bun tools/provider-scorecard/runner.ts rollback <provider-id>
 *   bun tools/provider-scorecard/runner.ts all
 *
 * Every command verifies + (re)commits the record files idempotently
 * (canonical JSON). The runner NEVER mutates the control-plane registry
 * files — drills emit event payloads as records; applying them to the
 * live registry is the Tech Lead's call.
 *
 * Determinism: pure reads of committed files + pure arithmetic; no clock,
 * no randomness, no network, no package imports.
 *
 * Exit code 0 = every check passed; 1 = a check failed (the gate).
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const RUNS_DIR = resolve(import.meta.dir, "..", "..", "docs", "productization-evidence", "HFX-401", "runs");
const LANE_REGISTRY_PATH = resolve(RUNS_DIR, "lane-registry.json");
const GEOMETRY_OUTCOMES_PATH = resolve(
  import.meta.dir,
  "..",
  "geometry-eval",
  "fixtures",
  "expected-outcomes.json",
);
const EQUIVALENCE_OUTCOMES_PATH = resolve(
  import.meta.dir,
  "..",
  "equivalence-eval",
  "fixtures",
  "expected-outcomes.json",
);

/* ------------------------------------------------------------------ */
/* The canonical form (the generic discipline — no package imports)      */
/* ------------------------------------------------------------------ */

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortValue);
  }
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(record).sort()) {
      out[key] = sortValue(record[key]);
    }
    return out;
  }
  return value;
}

/** Canonical JSON text: 2-space indented, sorted keys, trailing newline. */
function canonicalJson(value: unknown): string {
  return `${JSON.stringify(sortValue(value), null, 2)}\n`;
}

function sha256Hex(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/** The content address over the canonical JSON of the record minus its id field. */
function contentAddressOf(record: Record<string, unknown>, idField: string): string {
  const rest: Record<string, unknown> = { ...record };
  delete rest[idField];
  return sha256Hex(canonicalJson(rest));
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8")) as unknown;
}

/* ------------------------------------------------------------------ */
/* Mirrored frozen reference data (the boundary matrix forbids imports)  */
/* ------------------------------------------------------------------ */

/** The ten promotion-gate ids — the work order's list, frozen order (mirrored). */
const TEN_GATES: readonly string[] = [
  "contract-conformance",
  "semantic-equivalence",
  "negative-discrimination-behavior",
  "provenance-continuity",
  "uncertainty-behavior",
  "failure-unsupported-behavior",
  "dependent-layer-regression",
  "license-use-clearance",
  "cost-quota-safety",
  "historical-interpretability",
];

/** The Layer-3 required operation families (mirrored from the checklist). */
const LAYER3_REQUIRED_FAMILIES: readonly string[] = [
  "excavation",
  "backfill",
  "demolition-removal",
  "foundation-placement",
  "slab-placement",
  "block-wall-placement",
  "opening-creation",
  "plaster-application",
  "building-service-installation",
  "finish-application",
];

/** The evidence kinds each gate accepts (mirrored). */
const GATE_EVIDENCE_KINDS: Readonly<Record<string, readonly string[]>> = {
  "contract-conformance": ["committed-benchmark-id", "test-name", "runner-record"],
  "semantic-equivalence": ["committed-benchmark-id", "test-name", "runner-record"],
  "negative-discrimination-behavior": ["committed-benchmark-id", "test-name", "runner-record"],
  "provenance-continuity": ["committed-benchmark-id", "runner-record", "test-name"],
  "uncertainty-behavior": ["runner-record", "test-name", "committed-benchmark-id"],
  "failure-unsupported-behavior": ["committed-benchmark-id", "test-name", "runner-record"],
  "dependent-layer-regression": ["committed-benchmark-id", "runner-record", "test-name"],
  "license-use-clearance": ["license-declaration", "runner-record"],
  "cost-quota-safety": ["runner-record", "test-name"],
  "historical-interpretability": ["runner-record", "test-name", "committed-benchmark-id"],
};

/** The committed evidence-pointer constants (mirrored). */
const EVIDENCE_POINTERS = {
  toleranceBreachTwin:
    "backend/api/src/geometry-eval/harness.test.ts > HFX-302 harness: the NEGATIVE CONTROLS " +
    "(the mutation twins) > TOLERANCE-BREACH: a perturbed quantity beyond the declared " +
    "tolerance is caught with the quantity kind",
  verdictMutationTwin:
    "backend/api/src/geometry-eval/harness.test.ts > HFX-302 harness: the NEGATIVE CONTROLS " +
    "(the mutation twins) > VERDICT-MUTATION: a flipped validation check outcome is caught " +
    "with the validation kind (per-check, not only the verdict)",
  capabilityGate:
    "backend/api/src/geometry-eval/adapter.test.ts > HFX-302 adapter: the fail-closed " +
    "capability gate (Law 3 — never computed) > an undeclared family is answered with the " +
    "typed unsupported naming the family, BEFORE execution",
  boundaryGuard:
    "backend/api/src/geometry-eval/adapter.test.ts > HFX-302 adapter: the canonical-boundary " +
    "projection guard (the D26 seam) > the BOUNDARY-SMUGGLE twin is refused: a " +
    "provider-specific field cannot cross the canonical boundary",
  coarseBreaches:
    "backend/api/src/geometry-eval/harness.test.ts > HFX-302 harness: CELL 2 — " +
    "declared-incompatible (the comparison discriminates) > every coarse-grid breach is " +
    "caught with the declared kind + the tolerance breach, never hidden",
  historicalReplay:
    "backend/api/src/geometry-eval/harness.test.ts > HFX-302 harness: the control-plane " +
    "emission + the HISTORICAL REPLAY > the HISTORICAL REPLAY: the substitute's removal " +
    "leaves the records interpretable (the work order's criterion)",
  retiredEntryInterpretable:
    "packages/provider-registry/src/registry.test.ts > retirement (explicit only) > " +
    "a retired entry's history stays interpretable (records remain in the derived entry)",
  toleranceReport: "docs/productization-evidence/HFX-302/tolerance-report.md",
  hfx302Replay: "docs/productization-evidence/HFX-302/historical-replay.md",
  licenseDeclaration: "docs/productization-evidence/HFX-401/license-declaration.md",
  laneRegistry: "docs/productization-evidence/HFX-401/runs/lane-registry.json",
  fixtureLifecycle: "packages/provider-registry/fixtures/reference-lifecycle.json",
  equivalenceOutcomes: "tools/equivalence-eval/fixtures/expected-outcomes.json",
} as const;

const GATE_VOCABULARY_VERSION = "hfx-401/gate-vocabulary/1";
const LAYER_CHECKLIST_VERSION = "hfx-401/layer-checklist/1";
const MAPPING_VERSION = "hfx-401/promotion-vocabulary-mapping/1";
const SCORECARD_SCHEMA_VERSION = "hfx-401/provider-scorecard/1";
const PROMOTION_SCHEMA_VERSION = "hfx-401/promotion-record/1";
const ROLLBACK_SCHEMA_VERSION = "hfx-401/rollback-record/1";

/* ------------------------------------------------------------------ */
/* Typed views over the committed JSON                                  */
/* ------------------------------------------------------------------ */

interface Row {
  readonly sequenceId: string;
  readonly observed: string;
  readonly expectation: string;
  readonly expectationMet: boolean;
  readonly executed: boolean;
  readonly recordId: string;
  readonly manifestId: string;
  readonly unsupportedFamily?: string;
  readonly boqLineDivergent: boolean;
  readonly failureKinds: readonly string[];
}

interface ProviderView {
  readonly providerId: string;
  readonly technologyVersion: string;
  readonly role: string;
  readonly layer: number;
  readonly providerClass: string;
  readonly displayName: string;
  readonly profileDigest: string;
  readonly license: {
    readonly identifier: string;
    readonly commercialUse: boolean;
    readonly intendedUseCleared: boolean;
    readonly evaluationOnly: boolean;
  };
  readonly costProfile: { readonly model: string; readonly unitCost: number; readonly quotaPolicy: string };
  readonly uncertainty: {
    readonly calibration: string;
    readonly confidenceSeparateFromMeasurementUncertainty: boolean;
  };
  readonly declaredFamilies: readonly string[];
  readonly rows: readonly Row[];
  readonly kit: {
    readonly profile: Record<string, unknown>;
    readonly profileDigest: string;
    readonly executions: readonly { capability: string; inputDigest: string; normalizedResultDigest: string }[];
    readonly consolidatedRecord: Record<string, unknown>;
    readonly sealedManifest: Record<string, unknown>;
  };
  readonly engineered?: { readonly basis: string; readonly licenseOverride: string };
  readonly committedDecision?: {
    readonly decision: string;
    readonly refusalKinds: readonly string[];
    readonly lifecycleEventCount: number;
  };
}

interface LaneRegistry {
  readonly corpus: {
    readonly geometry: {
      readonly suiteId: string;
      readonly suiteVersion: string;
      readonly benchmarkId: string;
      readonly corpusDigest: string;
      readonly provenanceManifestDigest: string;
      readonly benchmarkRecordDigest: string;
      readonly sequenceCount: number;
    };
    readonly equivalence: {
      readonly suiteId: string;
      readonly suiteVersion: string;
      readonly benchmarkId: string;
      readonly corpusDigest: string;
      readonly provenanceManifestDigest: string;
      readonly benchmarkRecordDigest: string;
      readonly total: number;
      readonly expectationMatches: number;
    };
    readonly fixtureLifecycle: {
      readonly eventCount: number;
      readonly v1FinalState: string;
      readonly v2FinalState: string;
      readonly v2RefusalKinds: readonly string[];
      readonly events: readonly Record<string, unknown>[];
    };
  };
  readonly providers: readonly ProviderView[];
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label}: expected a JSON object`);
  }
  return value as Record<string, unknown>;
}

function loadLaneRegistry(): LaneRegistry {
  return readJson(LANE_REGISTRY_PATH) as LaneRegistry;
}

/** The canonical record slug (mirrors the engine's providerSlug). */
function providerSlug(providerId: string, technologyVersion: string): string {
  return `${providerId}@${technologyVersion}`
    .toLowerCase()
    .replace(/[^a-z0-9@.]+/g, "-")
    .replace(/[@.]+/g, "-");
}

/* ------------------------------------------------------------------ */
/* The committed evidence universe (independent resolution)              */
/* ------------------------------------------------------------------ */

interface GeometryOutcomeLane {
  readonly providerId?: string;
  readonly technologyVersion?: string;
  readonly executed?: boolean;
  readonly benchmarkRecordId?: string;
  readonly provenanceManifestId?: string;
  readonly unsupportedFamily?: string;
}

interface GeometryOutcome {
  readonly sequenceId?: string;
  readonly substituteProfileId?: string;
  readonly observed?: string;
  readonly expectation?: string;
  readonly expectationMet?: boolean;
  readonly referenceLane?: GeometryOutcomeLane;
  readonly substituteLane?: GeometryOutcomeLane;
  readonly comparison?: {
    readonly points?: readonly { pointKind?: string; equal?: boolean }[];
  } | null;
}

function loadGeometryOutcomes(): readonly GeometryOutcome[] {
  const suite = asRecord(readJson(GEOMETRY_OUTCOMES_PATH), "geometry outcomes");
  return (suite["outcomes"] as unknown[]).map((entry, index) =>
    asRecord(entry, `outcomes[${index}]`),
  ) as unknown as readonly GeometryOutcome[];
}

/**
 * Cross-checks the lane-registry rows against the committed HFX-302
 * outcomes: per provider, the rows must equal the corresponding lane
 * projections (record ids, manifest ids, observed cells, boq-line
 * divergence) — the projection honestly mirrors the committed corpus.
 */
function crossCheckRowsAgainstGeometryOutcomes(
  provider: ProviderView,
  outcomes: readonly GeometryOutcome[],
  laneRegistry?: LaneRegistry,
): void {
  if (provider.role === "control-plane-fixture") {
    /* The fixture providers' rows cross-check against the committed HFX-000
       lifecycle: their consolidated record must be the committed
       benchmark-recorded event's record, and their manifest the committed
       provenance-sealed event's manifest. */
    if (laneRegistry === undefined) {
      throw new Error("cross-check: the fixture cross-check needs the lane registry");
    }
    const recordEvent = laneRegistry.corpus.fixtureLifecycle.events.find((event) => {
      if (event["kind"] !== "benchmark-recorded") {
        return false;
      }
      const record = event["record"] as { providerId?: string; technologyVersion?: string };
      return (
        record.providerId === provider.providerId &&
        record.technologyVersion === provider.technologyVersion
      );
    });
    if (
      recordEvent === undefined ||
      JSON.stringify(recordEvent["record"]) !== JSON.stringify(provider.kit.consolidatedRecord)
    ) {
      throw new Error(
        `cross-check: the fixture record of '${provider.providerId}' is not the committed ` +
          `benchmark-recorded event's record`,
      );
    }
    return;
  }
  const basisId =
    provider.role === "engineered-refusal" && provider.engineered !== undefined
      ? provider.engineered.basis
      : provider.providerId;
  const expected: Row[] = [];
  for (const outcome of outcomes) {
    const isReference = provider.role === "reference-lane";
    const lane = isReference ? outcome.referenceLane : outcome.substituteLane;
    if (lane === undefined) {
      throw new Error(`cross-check: an outcome row is missing its lanes`);
    }
    if (isReference) {
      expected.push(projectRow(outcome, lane, true));
    } else if (lane.providerId === basisId) {
      expected.push(projectRow(outcome, lane, false));
    }
  }
  const actual = provider.rows;
  if (actual.length !== expected.length) {
    throw new Error(
      `cross-check: '${provider.providerId}' carries ${actual.length} rows but the committed ` +
        `outcomes project ${expected.length}`,
    );
  }
  for (const [index, row] of expected.entries()) {
    const committed = actual[index];
    if (
      committed === undefined ||
      committed.sequenceId !== row.sequenceId ||
      committed.observed !== row.observed ||
      committed.expectationMet !== row.expectationMet ||
      committed.executed !== row.executed ||
      committed.recordId !== row.recordId ||
      committed.manifestId !== row.manifestId ||
      committed.unsupportedFamily !== row.unsupportedFamily ||
      committed.boqLineDivergent !== row.boqLineDivergent
    ) {
      throw new Error(
        `cross-check: '${provider.providerId}' row ${index} does not match the committed ` +
          `outcome projection (${row.sequenceId})`,
      );
    }
  }
}

function projectRow(outcome: GeometryOutcome, lane: GeometryOutcomeLane, isReference: boolean): Row {
  const comparison = outcome.comparison ?? null;
  const boqLineDivergent =
    comparison !== null &&
    (comparison.points ?? []).some((point) => point.pointKind === "boq-line" && point.equal === false);
  return {
    sequenceId: outcome.sequenceId ?? "",
    observed: outcome.observed ?? "",
    expectation: outcome.expectation ?? "",
    expectationMet: outcome.expectationMet === true,
    executed: lane.executed === true,
    recordId: lane.benchmarkRecordId ?? "",
    manifestId: lane.provenanceManifestId ?? "",
    ...(isReference || lane.unsupportedFamily === undefined ? {} : { unsupportedFamily: lane.unsupportedFamily }),
    boqLineDivergent,
    failureKinds: [],
  };
}

/** The committed record-id universe (evidence-pointer resolution). */
function recordIdUniverse(
  laneRegistry: LaneRegistry,
  geometryOutcomes: readonly GeometryOutcome[],
): Set<string> {
  const universe = new Set<string>();
  for (const outcome of geometryOutcomes) {
    for (const lane of [outcome.referenceLane, outcome.substituteLane]) {
      if (lane?.benchmarkRecordId !== undefined) {
        universe.add(lane.benchmarkRecordId);
      }
      if (lane?.provenanceManifestId !== undefined) {
        universe.add(lane.provenanceManifestId);
      }
    }
  }
  for (const provider of laneRegistry.providers) {
    universe.add(String(provider.kit.consolidatedRecord["recordId"]));
    universe.add(String(provider.kit.sealedManifest["manifestId"]));
  }
  const equivalence = asRecord(readJson(EQUIVALENCE_OUTCOMES_PATH), "equivalence outcomes");
  for (const entry of (equivalence["outcomes"] as unknown[])) {
    const row = asRecord(entry, "equivalence outcome");
    if (typeof row["benchmarkRecordId"] === "string") {
      universe.add(row["benchmarkRecordId"]);
    }
    if (typeof row["provenanceManifestId"] === "string") {
      universe.add(row["provenanceManifestId"]);
    }
  }
  return universe;
}

/* ------------------------------------------------------------------ */
/* The mirrored gate derivation (the engine's rules over committed data) */
/* ------------------------------------------------------------------ */

function fixtureMetric(provider: ProviderView, metric: string): number {
  const metrics = provider.kit.consolidatedRecord["metrics"] as {
    metric: string;
    value: number;
  }[];
  const found = metrics.find((entry) => entry.metric === metric);
  if (found === undefined) {
    throw new Error(`mirror: no '${metric}' metric on '${provider.providerId}'`);
  }
  return found.value;
}

function requiredFamiliesFor(layer: number, providerClass: string): readonly string[] {
  if (layer === 3 && (providerClass === "geometry" || providerClass === "solution")) {
    return LAYER3_REQUIRED_FAMILIES;
  }
  return [];
}

/** Mirrors the engine's deriveGateOutcomes over the committed lane-registry facts. */
function deriveGateOutcomes(provider: ProviderView, laneRegistry: LaneRegistry): Record<string, unknown>[] {
  const isFixture = provider.role === "control-plane-fixture";
  const required = requiredFamiliesFor(provider.layer, provider.providerClass);
  const omitted = required.filter((family) => !provider.declaredFamilies.includes(family));
  const executedRows = provider.rows.filter((row) => row.executed);
  const unsupportedRows = provider.rows.filter((row) => row.unsupportedFamily !== undefined);
  const divergentRows = provider.rows.filter((row) => row.observed === "declared-incompatible");
  const compatibleRows = provider.rows.filter((row) => row.observed === "compatible");
  const boqDivergentRows = provider.rows.filter((row) => row.boqLineDivergent);
  const consolidatedId = String(provider.kit.consolidatedRecord["recordId"]);
  const sealedManifestId = String(provider.kit.sealedManifest["manifestId"]);
  const licenseCleared = provider.license.commercialUse && provider.license.intendedUseCleared;
  const costSafe = provider.costProfile.model === "none" && provider.costProfile.unitCost === 0;
  const uncertaintySafe = provider.uncertainty.confidenceSeparateFromMeasurementUncertainty;
  const recordEvidence = (pointer: string) => [{ kind: "committed-benchmark-id", pointer }];
  const gates: Record<string, unknown>[] = [];

  /* 1 — contract conformance */
  if (omitted.length === 0) {
    gates.push({
      gate: "contract-conformance",
      outcome: "pass",
      statement:
        `declares all ${required.length} required Layer-${provider.layer} ` +
        `${provider.providerClass} families; ${executedRows.length} corpus executions ` +
        "through the common adapter with zero contract-mismatch observations" +
        (unsupportedRows.length === 0
          ? ""
          : `; ${unsupportedRows.length} undeclared-family cells answered by the fail-closed gate before execution`),
      evidence: [
        ...recordEvidence(consolidatedId),
        ...(isFixture ? [] : [{ kind: "test-name", pointer: EVIDENCE_POINTERS.boundaryGuard }]),
      ],
    });
  } else {
    gates.push({
      gate: "contract-conformance",
      outcome: "fail",
      statement:
        `declares ${provider.declaredFamilies.length} of ${required.length} required ` +
        `Layer-${provider.layer} ${provider.providerClass} families (omits: ` +
        `${omitted.join(", ")}); ${unsupportedRows.length} corpus cells were refused by the ` +
        "fail-closed capability gate before execution — a production default must cover the " +
        "layer's required task surface",
      evidence: [
        ...recordEvidence(consolidatedId),
        ...(unsupportedRows[0] === undefined ? [] : recordEvidence(unsupportedRows[0].recordId)),
      ],
    });
  }

  /* 2 — semantic equivalence */
  if (provider.role === "reference-lane") {
    gates.push({
      gate: "semantic-equivalence",
      outcome: "pass",
      statement:
        `the identity authority: the oracle side of every executed comparison; ` +
        `${compatibleRows.length} compatible corpus cells agree across all five canonical ` +
        "comparison kinds within the declared tolerances, and the reference projections " +
        "re-derive byte-identically in the provider-removal replay",
      evidence: [
        ...recordEvidence(consolidatedId),
        { kind: "runner-record", pointer: EVIDENCE_POINTERS.hfx302Replay },
      ],
    });
  } else if (isFixture) {
    const mae = fixtureMetric(provider, "depth_mae_m");
    const maxError = fixtureMetric(provider, "depth_max_error_m");
    const exact = mae === 0 && maxError === 0;
    gates.push({
      gate: "semantic-equivalence",
      outcome: exact ? "pass" : "fail",
      statement: exact
        ? "reproduces the documented reference truth exactly: depth mean absolute error " +
          "0 m / max error 0 m over the fixed 4×4 fixture input"
        : `breaches the documented reference truth deterministically: mean absolute error ` +
          `${mae} m / max error ${maxError} m (the +0.25 m even-index bias) where v1 ` +
          "reproduces the same truth exactly — the committed record is the evidence",
      evidence: recordEvidence(consolidatedId),
    });
  } else if (divergentRows.length === 0) {
    gates.push({
      gate: "semantic-equivalence",
      outcome: "pass",
      statement:
        `all ${provider.rows.length} corpus cells compare compatible across the five ` +
        "canonical comparison kinds within the declared per-dimension tolerances (zero " +
        "divergent points; integer counts exact)",
      evidence: [
        ...recordEvidence(consolidatedId),
        { kind: "runner-record", pointer: EVIDENCE_POINTERS.toleranceReport },
      ],
    });
  } else {
    const kinds = [...new Set(divergentRows.flatMap((row) => row.failureKinds))].sort();
    gates.push({
      gate: "semantic-equivalence",
      outcome: "fail",
      statement:
        `${divergentRows.length} of ${provider.rows.length} corpus cells breach the declared ` +
        `tolerance (observed declared-incompatible with the closed-vocabulary kind(s) ` +
        `[${kinds.join(", ")}]): ${divergentRows.map((row) => row.sequenceId).join(", ")} — ` +
        "provider replacement would change AISE solution semantics",
      evidence: [
        ...recordEvidence(consolidatedId),
        ...(divergentRows[0] === undefined ? [] : recordEvidence(divergentRows[0].recordId)),
      ],
    });
  }

  /* 3 — negative/discrimination behavior */
  if (provider.role === "reference-lane") {
    gates.push({
      gate: "negative-discrimination-behavior",
      outcome: "pass",
      statement:
        "the negative-control twins (tolerance-breach, verdict-mutation, capability-sabotage, " +
        "boundary-smuggle) are all caught against the committed corpus, and the designed " +
        "divergence cells are caught with exactly the declared kind — the oracle governs " +
        "both lanes equally",
      evidence: [
        { kind: "test-name", pointer: EVIDENCE_POINTERS.toleranceBreachTwin },
        { kind: "test-name", pointer: EVIDENCE_POINTERS.coarseBreaches },
      ],
    });
  } else if (isFixture) {
    gates.push({
      gate: "negative-discrimination-behavior",
      outcome: "pass",
      statement:
        "the unsupported-scene probe is refused explicitly with the closed-vocabulary " +
        "unsupported-data failure — no fabricated depth values (the benchmark's " +
        "hard-negative case); refusal rate 1.0",
      evidence: recordEvidence(consolidatedId),
    });
  } else if (provider.providerId === "geometry-substitute-restricted") {
    gates.push({
      gate: "negative-discrimination-behavior",
      outcome: "pass",
      statement:
        `the fail-closed capability gate refuses all ${unsupportedRows.length} ` +
        "undeclared-family cells with the typed unsupported-data outcome BEFORE execution " +
        "— never computed, never fabricated",
      evidence: [
        ...recordEvidence(consolidatedId),
        { kind: "test-name", pointer: EVIDENCE_POINTERS.capabilityGate },
      ],
    });
  } else if (divergentRows.length > 0) {
    gates.push({
      gate: "negative-discrimination-behavior",
      outcome: "pass",
      statement:
        `the designed divergences of this lane are CAUGHT with exactly the declared ` +
        `closed-vocabulary kind on all ${divergentRows.length} divergent cells — a ` +
        "benchmark that cannot fail is not a benchmark; this provider's own divergences " +
        "are the discrimination evidence",
      evidence: [
        ...recordEvidence(consolidatedId),
        { kind: "test-name", pointer: EVIDENCE_POINTERS.coarseBreaches },
      ],
    });
  } else {
    gates.push({
      gate: "negative-discrimination-behavior",
      outcome: "pass",
      statement:
        "the four negative-control twins over this provider's engine are all caught: the " +
        "tolerance breach with the quantity kind, the verdict mutation with the " +
        "validation kind, the capability over-declaration refused, the boundary smuggle " +
        "refused with contract-mismatch",
      evidence: [
        { kind: "test-name", pointer: EVIDENCE_POINTERS.toleranceBreachTwin },
        { kind: "test-name", pointer: EVIDENCE_POINTERS.verdictMutationTwin },
        { kind: "test-name", pointer: EVIDENCE_POINTERS.boundaryGuard },
      ],
    });
  }

  /* 4 — provenance continuity */
  gates.push({
    gate: "provenance-continuity",
    outcome: "pass",
    statement: isFixture
      ? "the committed portable manifest verifies by digest re-derivation and references " +
        "this profile digest — provider identity, version and input digests are retained"
      : `${provider.rows.length} per-sequence portable manifests sealed (64-hex content ` +
        `addresses) + the consolidated manifest sealed against this profile digest — ` +
        "provider identity, version, configuration and input digests are retained",
    evidence: [
      ...recordEvidence(sealedManifestId),
      ...(isFixture
        ? [{ kind: "test-name", pointer: EVIDENCE_POINTERS.retiredEntryInterpretable }]
        : recordEvidence(consolidatedId)),
    ],
  });

  /* 5 — uncertainty behavior */
  gates.push({
    gate: "uncertainty-behavior",
    outcome: uncertaintySafe ? "pass" : "fail",
    statement: isFixture
      ? "the fixture emits depth values without confidence scores and without measurement " +
        "uncertainty — confidence is never fabricated and never substitutes for " +
        "measurement uncertainty"
      : `confidence is declared separate from measurement uncertainty (calibration ` +
        `'${provider.uncertainty.calibration}'); the discretization residual is bounded by ` +
        "the declared grid and recorded as observed deltas in the committed tolerance " +
        "report — never fabricated into a confidence score",
    evidence: isFixture
      ? [
          {
            kind: "runner-record",
            pointer: `${EVIDENCE_POINTERS.fixtureLifecycle} — the committed exit-gate lifecycle`,
          },
        ]
      : [
          { kind: "runner-record", pointer: EVIDENCE_POINTERS.toleranceReport },
          {
            kind: "runner-record",
            pointer: `${EVIDENCE_POINTERS.laneRegistry} — providers[${providerSlug(
              provider.providerId,
              provider.technologyVersion,
            )}].uncertainty`,
          },
        ],
  });

  /* 6 — failure/unsupported behavior */
  gates.push({
    gate: "failure-unsupported-behavior",
    outcome: "pass",
    statement: isFixture
      ? "the unsupported-scene probe answers the closed-vocabulary unsupported-data refusal " +
        "(the record's failureObservations) — never fabricated depth values"
      : `every unsupported/failure state is explicit and typed: ${unsupportedRows.length} ` +
        "fail-closed unsupported-data refusals (recorded BEFORE execution) and " +
        `${divergentRows.length} closed-vocabulary divergence observations across the ` +
        "corpus — zero fabricated outputs",
    evidence: [
      ...recordEvidence(consolidatedId),
      ...(isFixture ? [] : [{ kind: "test-name", pointer: EVIDENCE_POINTERS.capabilityGate }]),
    ],
  });

  /* 7 — dependent-layer regression */
  if (isFixture) {
    gates.push({
      gate: "dependent-layer-regression",
      outcome: "na",
      naReason:
        "the HFX-000 reference lifecycle is the control plane's own exit-gate fixture (a " +
        "Layer-1 depth-estimation double) — no Layer-2 consumer regression corpus exists in " +
        "its committed scope; the Layer-1→Layer-2 regression surface is owned by the " +
        "HFX-101/102 adapter benchmarks, so this dimension is unevaluable here and blocks " +
        "production eligibility under the Layer-1 checklist (all gates mandatory)",
      statement:
        "unevaluable in the committed fixture scope — recorded NA, which under the Layer-1 " +
        "checklist blocks production eligibility (the refusal names this gate)",
      evidence: [
        {
          kind: "runner-record",
          pointer: `${EVIDENCE_POINTERS.fixtureLifecycle} — the committed exit-gate lifecycle`,
        },
      ],
    });
  } else if (provider.role === "reference-lane") {
    gates.push({
      gate: "dependent-layer-regression",
      outcome: "pass",
      statement:
        `the Layer-3 consumers regress-free: the BOQ derivation over the oracle's ` +
        `quantities is the committed derivation itself (${compatibleRows.length} ` +
        "compatible cells' boq lines within tolerance) and the HFX-301 equivalence corpus " +
        `(the authoring journeys over the same engine) passes ` +
        `${laneRegistry.corpus.equivalence.expectationMatches}/${laneRegistry.corpus.equivalence.total} — both cited by digest`,
      evidence: [
        ...recordEvidence(consolidatedId),
        {
          kind: "runner-record",
          pointer: `${EVIDENCE_POINTERS.equivalenceOutcomes} (suite ${laneRegistry.corpus.equivalence.suiteId}, ` +
            `benchmarkRecordDigest ${laneRegistry.corpus.equivalence.benchmarkRecordDigest})`,
        },
      ],
    });
  } else if (provider.rows.every((row) => !row.executed)) {
    gates.push({
      gate: "dependent-layer-regression",
      outcome: "na",
      naReason:
        "zero executed corpus cells — the fail-closed gate refuses every cell of this " +
        "provider's corpus presence, so the dependent-layer (BOQ/equivalence) regression " +
        "surface is unevaluable; a production default must EVIDENCE its dependent layers, " +
        "and unevidenced is not passed",
      statement:
        "unevaluable — zero executed corpus cells; recorded NA, which under the Layer-3 " +
        "checklist blocks production eligibility (the refusal names this gate)",
      evidence: recordEvidence(consolidatedId),
    });
  } else if (boqDivergentRows.length === 0) {
    gates.push({
      gate: "dependent-layer-regression",
      outcome: "pass",
      statement:
        `the Layer-3 consumers regress-free: ${provider.rows.length} corpus cells' ` +
        "boq-line comparisons within the declared tolerance (zero divergent boq points) " +
        "and the HFX-301 equivalence corpus (the authoring journeys over the same engine) " +
        `passes ${laneRegistry.corpus.equivalence.expectationMatches}/${laneRegistry.corpus.equivalence.total} — cited by digest`,
      evidence: [
        ...recordEvidence(consolidatedId),
        {
          kind: "runner-record",
          pointer: `${EVIDENCE_POINTERS.equivalenceOutcomes} (suite ${laneRegistry.corpus.equivalence.suiteId}, ` +
            `benchmarkRecordDigest ${laneRegistry.corpus.equivalence.benchmarkRecordDigest})`,
        },
      ],
    });
  } else {
    gates.push({
      gate: "dependent-layer-regression",
      outcome: "fail",
      statement:
        `the dependent BOQ projection regresses: ${boqDivergentRows.length} of ` +
        `${provider.rows.length} cells carry divergent boq-line comparison points (the ` +
        "substitute's breaching quantities flow into the BOQ derivation) — the Layer-3 " +
        "consumers would see changed derived quantities",
      evidence: [
        ...recordEvidence(consolidatedId),
        { kind: "runner-record", pointer: EVIDENCE_POINTERS.toleranceReport },
      ],
    });
  }

  /* 8 — license/use clearance */
  gates.push({
    gate: "license-use-clearance",
    outcome: licenseCleared ? "pass" : "fail",
    statement: licenseCleared
      ? `license '${provider.license.identifier}' clears commercial use and the declared ` +
        "intended use for production (commercialUse: true, intendedUseCleared: true) — " +
        "the dataset/model-use rule is satisfied"
      : `license '${provider.license.identifier}' is evaluation-only (commercialUse: ` +
        `${String(provider.license.commercialUse)}, intendedUseCleared: ` +
        `${String(provider.license.intendedUseCleared)}) — the dataset/model-use rule ` +
        "forbids production promotion; training and evaluation are separate decisions",
    evidence: [
      {
        kind: "license-declaration",
        pointer:
          `profile license declaration '${provider.license.identifier}' — provider ` +
          `${provider.providerId}@${provider.technologyVersion}` +
          (licenseCleared
            ? `; mirrored in ${EVIDENCE_POINTERS.laneRegistry}`
            : `; see ${EVIDENCE_POINTERS.licenseDeclaration} (the refusal-path demonstration)`),
      },
    ],
  });

  /* 9 — cost/quota safety */
  gates.push({
    gate: "cost-quota-safety",
    outcome: costSafe ? "pass" : "fail",
    statement:
      `cost model '${provider.costProfile.model}' at unit cost ${provider.costProfile.unitCost} ` +
      `with the declared quota policy — ${
        isFixture
          ? "deterministic local computation, no quota, no fallback needed"
          : "deterministic local computation, no quota, no spend; the declared fallback is the incumbent reference lane"
      }`,
    evidence: [
      {
        kind: "runner-record",
        pointer: `${EVIDENCE_POINTERS.laneRegistry} — providers[${providerSlug(
          provider.providerId,
          provider.technologyVersion,
        )}].costProfile`,
      },
    ],
  });

  /* 10 — historical interpretability */
  gates.push({
    gate: "historical-interpretability",
    outcome: "pass",
    statement: isFixture
      ? "the append-only registry's replay discipline: replayRegistry over the committed " +
        `${laneRegistry.corpus.fixtureLifecycle.eventCount}-event lifecycle reproduces the ` +
        "identical derived states, and a retired entry's history stays interpretable (the " +
        "control plane's own proof) — the committed fixtures remain interpretable records " +
        "forever"
      : provider.role === "reference-lane"
        ? "the reference-only re-derivation proves the canonical projections never depended " +
          "on any substitute — every committed projection digest re-derives with all " +
          "substitutes withdrawn; the oracle's own retirement path is the identical " +
          "retired-provider discipline"
        : "the provider is covered by the committed removal simulation: retired through the " +
          "explicit provider-retired event with every historical record, manifest and " +
          "decision remaining on the entry (replayRegistry reproduces the identical derived " +
          "state) — the HFX-302 historical-replay evidence + this scorecard's own rollback " +
          "drill re-prove it",
    evidence: isFixture
      ? [
          {
            kind: "runner-record",
            pointer: `${EVIDENCE_POINTERS.fixtureLifecycle} — the committed exit-gate lifecycle`,
          },
          { kind: "test-name", pointer: EVIDENCE_POINTERS.retiredEntryInterpretable },
        ]
      : [
          { kind: "runner-record", pointer: EVIDENCE_POINTERS.hfx302Replay },
          { kind: "test-name", pointer: EVIDENCE_POINTERS.historicalReplay },
        ],
  });

  /* The frozen vocabulary order. */
  const byGate = new Map(gates.map((gate) => [String(gate["gate"]), gate]));
  return TEN_GATES.map((gateId) => {
    const gate = byGate.get(gateId);
    if (gate === undefined) {
      throw new Error(`mirror: the gate derivation for '${provider.providerId}' missed '${gateId}'`);
    }
    return gate;
  });
}

/* ------------------------------------------------------------------ */
/* The mirrored verdict + stage derivation                              */
/* ------------------------------------------------------------------ */

function mandatoryAt(layer: number, gate: string): boolean {
  // Layers 1/2: all ten mandatory. Layer 3: semantic-equivalence is
  // na-permitted (for the visual class only) — the mandatory set is the rest.
  if (layer === 3 && gate === "semantic-equivalence") {
    return false;
  }
  return true;
}

function deriveVerdict(
  layer: number,
  providerClass: string,
  gates: readonly Record<string, unknown>[],
): {
  productionEligible: boolean;
  failedGates: string[];
  naGates: string[];
  nonPassingGates: string[];
  checklistConformant: boolean;
} {
  const failedGates: string[] = [];
  const naGates: string[] = [];
  const nonPassingGates: string[] = [];
  let checklistConformant = true;
  const knownClass =
    (layer === 1 && ["perception", "reconstruction"].includes(providerClass)) ||
    (layer === 2 && ["document", "retrieval", "bim"].includes(providerClass)) ||
    (layer === 3 && ["solution", "geometry", "visual"].includes(providerClass));
  if (!knownClass) {
    checklistConformant = false;
  }
  for (const gateId of TEN_GATES) {
    const gate = gates.find((entry) => entry["gate"] === gateId);
    if (gate === undefined || gate["outcome"] === "pass") {
      continue;
    }
    nonPassingGates.push(gateId);
    if (gate["outcome"] === "fail") {
      failedGates.push(gateId);
    } else {
      naGates.push(gateId);
      if (mandatoryAt(layer, gateId)) {
        checklistConformant = false;
      } else {
        // na-permitted only with the allowance code AND only for the visual class
        if (gate["naAllowanceCode"] !== "layer3-visual-presentation-only" || providerClass !== "visual") {
          checklistConformant = false;
        }
      }
    }
  }
  return {
    productionEligible: nonPassingGates.length === 0 && checklistConformant,
    failedGates,
    naGates,
    nonPassingGates,
    checklistConformant,
  };
}

/* ------------------------------------------------------------------ */
/* The mirrored record builders                                         */
/* ------------------------------------------------------------------ */

function buildScorecard(provider: ProviderView, laneRegistry: LaneRegistry): Record<string, unknown> {
  const gates = deriveGateOutcomes(provider, laneRegistry);
  const verdict = deriveVerdict(provider.layer, provider.providerClass, gates);
  const controlPlaneState =
    provider.role === "control-plane-fixture"
      ? provider.committedDecision?.decision === "promoted"
        ? "promoted"
        : "rejected"
      : "benchmarked";
  const workOrderStage = verdict.productionEligible ? "production_candidate" : "rejected";
  const body: Record<string, unknown> = {
    kind: "provider-scorecard",
    schemaVersion: SCORECARD_SCHEMA_VERSION,
    codeVersion: "hfx-401/provider-scorecard/1",
    gateVocabularyVersion: GATE_VOCABULARY_VERSION,
    layerChecklistVersion: LAYER_CHECKLIST_VERSION,
    provider: {
      providerId: provider.providerId,
      technologyVersion: provider.technologyVersion,
      profileDigest: provider.profileDigest,
      role: provider.role,
      layer: provider.layer,
      providerClass: provider.providerClass,
      displayName: provider.displayName,
    },
    benchmarkCorpus: {
      suiteId: laneRegistry.corpus.geometry.suiteId,
      suiteVersion: laneRegistry.corpus.geometry.suiteVersion,
      benchmarkId: laneRegistry.corpus.geometry.benchmarkId,
      corpusDigest: laneRegistry.corpus.geometry.corpusDigest,
      laneRecordIds: provider.rows.map((row) => row.recordId),
      laneManifestIds: provider.rows.map((row) => row.manifestId),
      consolidatedRecordId: provider.kit.consolidatedRecord["recordId"],
      consolidatedRecordDigest: sha256Hex(canonicalJson(provider.kit.consolidatedRecord)),
      sealedManifestId: provider.kit.sealedManifest["manifestId"],
      sequenceCount: provider.rows.length,
    },
    gates,
    verdict,
    controlPlaneMapping: {
      mappingVersion: MAPPING_VERSION,
      controlPlaneState,
      workOrderStage,
      statement:
        workOrderStage === "production_candidate"
          ? `every layer-${provider.layer} mandatory gate passed — the provider is a production ` +
            `candidate; approval is the control plane's promotion-decided{promoted} event ` +
            `(the HFX-401 promotion engine emits the payload, the Lead applies it)`
          : `the HFX-401 gate refuses production: [${verdict.nonPassingGates.join(", ")}] ` +
            `did not pass — a provider that fails any mandatory gate remains non-production ` +
            `even with a strong benchmark score; control-plane state at scoring: ` +
            `'${controlPlaneState}'` +
            (provider.committedDecision === undefined
              ? ""
              : ` (the committed HFX-000 exit-gate history decided ` +
                `'${provider.committedDecision.decision}' under the control plane's own v1 ` +
                `gate set — the append-only log stays lawful history; the HFX-401 scorecard ` +
                `assesses CURRENT re-promotion eligibility)`),
    },
  };
  return { ...body, scorecardId: contentAddressOf(body, "scorecardId") };
}

/** Mirrors the control plane's three-gate evaluation over the drill entry. */
function controlPlaneGateChecks(provider: ProviderView): {
  admitted: boolean;
  checks: Record<string, unknown>[];
  refusals: Record<string, unknown>[];
} {
  const checks: Record<string, unknown>[] = [];
  const refusals: Record<string, unknown>[] = [];
  const license = provider.license;
  const licenseCleared = license.commercialUse && license.intendedUseCleared && !license.evaluationOnly;
  checks.push({
    gate: "license-use-clearance",
    passed: licenseCleared,
    detail: licenseCleared
      ? `license '${license.identifier}' clears commercial use and the declared intended use for production`
      : `license '${license.identifier}' is evaluation-only (commercialUse: ${String(license.commercialUse)}, intendedUseCleared: ${String(license.intendedUseCleared)}) — the dataset/model-use rule forbids production promotion`,
  });
  if (!licenseCleared) {
    refusals.push({
      kind: "license-blocked",
      detail:
        `provider '${provider.providerId}' (${provider.technologyVersion}) is evaluation-only: ` +
        `licensing/intended-use terms are not explicitly cleared — production promotion is refused ` +
        `(training and evaluation are separate decisions; nothing enters a commercial pipeline silently)`,
    });
  }
  checks.push({
    gate: "benchmark-evidence",
    passed: true,
    detail: "1 benchmark record(s) attached, all referencing this provider+version",
  });
  checks.push({
    gate: "provenance-continuity",
    passed: true,
    detail: "1 provenance manifest(s) sealed against this profile digest",
  });
  return { admitted: refusals.length === 0, checks, refusals };
}

/** Rebuilds the drill registry's event log from the committed kit. */
function drillEvents(
  provider: ProviderView,
  extra: readonly Record<string, unknown>[],
): readonly Record<string, unknown>[] {
  const events: Record<string, unknown>[] = [
    { kind: "provider-registered", profile: provider.kit.profile },
    {
      kind: "evaluation-started",
      providerId: provider.providerId,
      technologyVersion: provider.technologyVersion,
    },
    ...provider.kit.executions.map((execution) => ({
      kind: "execution-normalized",
      providerId: provider.providerId,
      technologyVersion: provider.technologyVersion,
      execution,
    })),
    { kind: "benchmark-recorded", record: provider.kit.consolidatedRecord },
    { kind: "provenance-sealed", manifest: provider.kit.sealedManifest },
    ...extra,
  ];
  return events;
}

function eventsDigest(events: readonly Record<string, unknown>[]): string {
  return sha256Hex(canonicalJson(events as unknown[]));
}

function engineRefusalsOf(
  scorecard: Record<string, unknown>,
): Record<string, unknown>[] {
  const verdict = scorecard["verdict"] as {
    nonPassingGates: string[];
    checklistConformant: boolean;
  };
  const gates = scorecard["gates"] as {
    gate: string;
    outcome: string;
    statement: string;
    naReason?: string;
  }[];
  const layer = (scorecard["provider"] as { layer: number }).layer;
  const refusals: Record<string, unknown>[] = [];
  for (const gateId of verdict.nonPassingGates) {
    const gate = gates.find((entry) => entry.gate === gateId);
    if (gate === undefined) {
      continue;
    }
    if (gate.outcome === "fail") {
      refusals.push({
        gate: gateId,
        kind: "mandatory-gate-failed",
        detail:
          `gate '${gateId}' FAILED — ${gate.statement}. A provider that fails any ` +
          "mandatory gate remains non-production, even if its benchmark score is strong",
      });
    } else {
      refusals.push({
        gate: gateId,
        kind: "mandatory-gate-not-evaluable",
        detail:
          `gate '${gateId}' is recorded NA and sits on the layer-${layer} mandatory ` +
          `checklist — ${gate.naReason ?? "no reason recorded"}. Unevaluated is not passed; ` +
          "a production default must evidence every mandatory dimension",
      });
    }
  }
  if (!verdict.checklistConformant) {
    refusals.push({
      gate: "layer-checklist",
      kind: "checklist-violation",
      detail:
        `the scorecard violates the layer-${layer} checklist ` +
        `(${LAYER_CHECKLIST_VERSION}) — an NA sits on a mandatory gate`,
    });
  }
  return refusals;
}

function buildPromotionRecord(
  provider: ProviderView,
  laneRegistry: LaneRegistry,
  scorecard: Record<string, unknown>,
): Record<string, unknown> {
  const verdict = scorecard["verdict"] as ReturnType<typeof deriveVerdict>;
  const controlPlane = controlPlaneGateChecks(provider);
  const isFixture = provider.role === "control-plane-fixture";
  const licenseFailed = !(
    provider.license.commercialUse && provider.license.intendedUseCleared
  );

  let trace: Record<string, unknown>;
  if (isFixture) {
    /* The committed history walk (mirrors the engine's fixture trace). */
    const events = laneRegistry.corpus.fixtureLifecycle.events;
    const version = provider.technologyVersion;
    let state = "registered";
    let own: Record<string, unknown> | null = null;
    for (const event of events) {
      const kind = String(event["kind"]);
      const ofProvider = (() => {
        if (kind === "provider-registered") {
          const profile = event["profile"] as { providerId: string; technologyVersion: string };
          return profile.providerId === provider.providerId && profile.technologyVersion === version;
        }
        if (kind === "benchmark-recorded") {
          const record = event["record"] as { providerId: string; technologyVersion: string };
          return record.providerId === provider.providerId && record.technologyVersion === version;
        }
        if (kind === "execution-normalized" || kind === "provenance-sealed") {
          return false;
        }
        return event["providerId"] === provider.providerId && event["technologyVersion"] === version;
      })();
      if (!ofProvider) {
        continue;
      }
      if (kind === "provider-registered") {
        state = "registered";
      } else if (kind === "evaluation-started") {
        state = "evaluation";
      } else if (kind === "benchmark-recorded") {
        state = "benchmarked";
      } else if (kind === "promotion-decided") {
        state = String(event["decision"]);
        own = event;
      }
    }
    if (own === null || state !== provider.committedDecision?.decision) {
      throw new Error(
        `mirror: the committed history of '${provider.providerId}' does not end in ` +
          `'${String(provider.committedDecision?.decision)}'`,
      );
    }
    trace = {
      source: "committed-history",
      registryEventCount: events.length,
      eventsDigest: eventsDigest(events as Record<string, unknown>[]),
      entryStateBefore: "benchmarked",
      entryStateAfter: state,
      appliedDecisionEvent: own,
      counterfactual: null,
    };
  } else if (verdict.productionEligible) {
    /* PATH (a) — approval: the promotion-decided{promoted} event. */
    const decisionEvent = {
      kind: "promotion-decided",
      providerId: provider.providerId,
      technologyVersion: provider.technologyVersion,
      decision: "promoted",
      checks: controlPlane.checks,
      refusals: [],
    };
    const events = drillEvents(provider, [decisionEvent]);
    trace = {
      source: "drill-registry",
      registryEventCount: events.length,
      eventsDigest: eventsDigest(events),
      entryStateBefore: "benchmarked",
      entryStateAfter: "promoted",
      appliedDecisionEvent: decisionEvent,
      counterfactual: null,
    };
  } else if (licenseFailed) {
    /* PATH (b) — the license refusal: the control plane rejects too. */
    const decisionEvent = {
      kind: "promotion-decided",
      providerId: provider.providerId,
      technologyVersion: provider.technologyVersion,
      decision: "rejected",
      checks: controlPlane.checks,
      refusals: controlPlane.refusals,
    };
    const events = drillEvents(provider, [decisionEvent]);
    trace = {
      source: "drill-registry",
      registryEventCount: events.length,
      eventsDigest: eventsDigest(events),
      entryStateBefore: "benchmarked",
      entryStateAfter: "rejected",
      appliedDecisionEvent: decisionEvent,
      counterfactual: null,
    };
  } else {
    /* PATH (b) — the engine refusal with the documented counterfactual. */
    const events = drillEvents(provider, []);
    trace = {
      source: "drill-registry",
      registryEventCount: events.length,
      eventsDigest: eventsDigest(events),
      entryStateBefore: "benchmarked",
      entryStateAfter: "benchmarked",
      appliedDecisionEvent: null,
      counterfactual: { admitted: controlPlane.admitted, checks: controlPlane.checks },
    };
  }

  const engineDecision = verdict.productionEligible
    ? {
        outcome: "approved",
        controlPlaneEvent: {
          kind: "promotion-decided",
          providerId: provider.providerId,
          technologyVersion: provider.technologyVersion,
          decision: "promoted",
          checks: controlPlane.checks,
          refusals: [],
        },
        statement:
          "APPROVED: every layer-mandatory gate passed with committed evidence and no " +
          "applicable gate failed — the control-plane promotion-decided{promoted} event " +
          "payload is ready (applying it to the live registry is the Tech Lead's call)",
      }
    : {
        outcome: "refused",
        refusals: engineRefusalsOf(scorecard),
        statement:
          `REFUSED: [${verdict.nonPassingGates.join(", ")}] did not pass — the provider ` +
          "remains non-production (no override path exists; the refusal names every " +
          "failed/refused gate)",
      };

  const mandatoryGates = TEN_GATES.filter((gate) => mandatoryAt(provider.layer, gate));
  const body: Record<string, unknown> = {
    kind: "provider-promotion-record",
    schemaVersion: PROMOTION_SCHEMA_VERSION,
    codeVersion: "hfx-401/provider-scorecard/1",
    mappingVersion: MAPPING_VERSION,
    provider: {
      providerId: provider.providerId,
      technologyVersion: provider.technologyVersion,
      profileDigest: provider.profileDigest,
      layer: provider.layer,
      providerClass: provider.providerClass,
      role: provider.role,
    },
    scorecardId: scorecard["scorecardId"],
    path: verdict.productionEligible ? "approval" : "refusal",
    decision: verdict.productionEligible ? "approved" : "refused",
    gateAssessment: {
      mandatoryGates,
      failedGates: verdict.failedGates,
      naGates: verdict.naGates,
      nonPassingGates: verdict.nonPassingGates,
    },
    engineDecision,
    layerRegression: {
      layer: provider.layer,
      requirement:
        provider.layer === 3
          ? "a Layer-3 production promotion must cite regression evidence for the consumers " +
            "of Layer-3 geometry/validation outputs: the committed HFX-301 equivalence corpus " +
            "(the authoring journeys over the same engine) and the committed HFX-302 geometry " +
            "substitution corpus (the dual-lane quantities/BOQ comparisons)"
          : provider.layer === 1
            ? "a Layer-1 production promotion must cite regression evidence for the Layer-2 " +
              "consumers of Layer-1 outputs (readiness + Evidence Envelope consumers) — the " +
              "reconstruction/depth adapter benchmarks (HFX-101/102 discipline)"
            : "a Layer-2 production promotion must cite regression evidence for the Layer-3 " +
              "consumers of Layer-2 Evidence Envelopes (the solution authoring journeys)",
      citations:
        provider.layer === 3
          ? [
              {
                citationKind: "geometry-eval",
                suiteId: laneRegistry.corpus.geometry.suiteId,
                corpusDigest: laneRegistry.corpus.geometry.corpusDigest,
                benchmarkRecordDigest: laneRegistry.corpus.geometry.benchmarkRecordDigest,
                provenanceManifestDigest: laneRegistry.corpus.geometry.provenanceManifestDigest,
              },
              {
                citationKind: "equivalence-eval",
                suiteId: laneRegistry.corpus.equivalence.suiteId,
                corpusDigest: laneRegistry.corpus.equivalence.corpusDigest,
                benchmarkRecordDigest: laneRegistry.corpus.equivalence.benchmarkRecordDigest,
                provenanceManifestDigest: laneRegistry.corpus.equivalence.provenanceManifestDigest,
              },
            ]
          : [],
    },
    controlPlaneTrace: trace,
  };
  return { ...body, recordId: contentAddressOf(body, "recordId") };
}

const ROLLBACK_DEMOTION_REASON =
  "HFX-401 rollback: a post-promotion semantic-equivalence regression (the tolerance-breach " +
  "probe) failed the promoted build — the provider is demoted to retired (the only lawful " +
  "path out of promoted) and the fallback reference lane resumes as the production default; " +
  "every historical record naming this provider remains interpretable (the replay proof " +
  "rides this record)";

/* ------------------------------------------------------------------ */
/* The check report                                                     */
/* ------------------------------------------------------------------ */

export interface ScorecardCheck {
  readonly id: string;
  readonly passed: boolean;
  readonly detail: string;
}

export interface RunnerReport {
  readonly ok: boolean;
  readonly checks: readonly ScorecardCheck[];
  readonly providerCount: number;
}

function check(checks: ScorecardCheck[], id: string, passed: boolean, detail: string): void {
  checks.push({ id, passed, detail });
}

/** Verifies one committed record file against the independent rebuild. */
function verifyCommittedRecord(
  checks: ScorecardCheck[],
  label: string,
  fileName: string,
  rebuilt: Record<string, unknown>,
  idField: string,
): void {
  const path = resolve(RUNS_DIR, fileName);
  if (!existsSync(path)) {
    check(checks, `${label}: committed`, false, `${fileName} is missing`);
    return;
  }
  const committedText = readFileSync(path, "utf8");
  const committed = asRecord(JSON.parse(committedText), fileName);
  const rebuiltText = canonicalJson(rebuilt);
  check(
    checks,
    `${label}: byte-identical rebuild`,
    committedText === rebuiltText,
    committedText === rebuiltText
      ? `${fileName} rebuilds byte-for-byte from the committed corpus data`
      : `${fileName} does NOT equal the independent rebuild (drift between the engine, the ` +
          `committed record and the mirrored derivation)`,
  );
  const declaredId = committed[idField];
  const derivedId = contentAddressOf(committed, idField);
  check(
    checks,
    `${label}: content address re-derives`,
    declaredId === derivedId,
    declaredId === derivedId
      ? `${String(declaredId).slice(0, 16)}… re-derives from the record's own content`
      : `the declared ${idField} does not re-derive (derived ${derivedId})`,
  );
}

/** Verifies the evidence doctrine over one rebuilt scorecard. */
function verifyEvidenceDoctrine(
  checks: ScorecardCheck[],
  label: string,
  scorecard: Record<string, unknown>,
  universe: Set<string>,
): void {
  const gates = scorecard["gates"] as {
    gate: string;
    outcome: string;
    naReason?: string;
    statement: string;
    evidence: { kind: string; pointer: string }[];
  }[];
  let allPresent = true;
  let allResolve = true;
  let naReasoned = true;
  for (const gate of gates) {
    if (gate.evidence.length === 0) {
      allPresent = false;
    }
    for (const evidence of gate.evidence) {
      if (!(GATE_EVIDENCE_KINDS[gate.gate] ?? []).includes(evidence.kind)) {
        allResolve = false;
      }
      if (evidence.kind === "committed-benchmark-id" && !universe.has(evidence.pointer)) {
        allResolve = false;
      }
    }
    if (gate.outcome === "na" && (gate.naReason ?? "").length === 0) {
      naReasoned = false;
    }
  }
  check(
    checks,
    `${label}: the evidence doctrine (every dimension carries evidence)`,
    allPresent,
    allPresent
      ? "every one of the ten gates carries at least one committed evidence pointer"
      : "a gate outcome without an evidence pointer is not recorded (doctrine violation)",
  );
  check(
    checks,
    `${label}: the evidence pointers resolve (kinds accepted, committed ids in the universe)`,
    allResolve,
    allResolve
      ? "every evidence kind is accepted by its gate and every committed-benchmark-id resolves"
      : "an evidence pointer does not resolve against the committed record universe",
  );
  check(
    checks,
    `${label}: every NA carries a reason`,
    naReasoned,
    naReasoned ? "all NA outcomes are reasoned" : "an NA without a reason is not recorded",
  );
}

/** Verifies one promotion record's decision against the independent recomputation. */
function verifyPromotionDecision(
  checks: ScorecardCheck[],
  label: string,
  record: Record<string, unknown>,
  scorecard: Record<string, unknown>,
): void {
  const verdict = scorecard["verdict"] as ReturnType<typeof deriveVerdict>;
  const decision = String(record["decision"]);
  const expected = verdict.productionEligible ? "approved" : "refused";
  check(
    checks,
    `${label}: the decision re-derives (no override)`,
    decision === expected,
    decision === expected
      ? `the engine's decision '${decision}' re-derives from the cited scorecard`
      : `FORGED: the record declares '${decision}' but the scorecard derives '${expected}'`,
  );
  const assessment = record["gateAssessment"] as { nonPassingGates: string[] };
  const namesEvery =
    assessment.nonPassingGates.length === verdict.nonPassingGates.length &&
    assessment.nonPassingGates.every((gate, index) => gate === verdict.nonPassingGates[index]);
  check(
    checks,
    `${label}: the refusal names EVERY non-passing gate`,
    decision === "approved" ? namesEvery || verdict.nonPassingGates.length === 0 : namesEvery,
    namesEvery
      ? `the assessment names [${assessment.nonPassingGates.join(", ") || "—"}]`
      : "the gate assessment does not mirror the scorecard's verdict",
  );
}

/* ------------------------------------------------------------------ */
/* The drills                                                           */
/* ------------------------------------------------------------------ */

function scorecardDrill(
  laneRegistry: LaneRegistry,
  geometryOutcomes: readonly GeometryOutcome[],
  universe: Set<string>,
  providerFilter?: string,
): ScorecardCheck[] {
  const checks: ScorecardCheck[] = [];
  for (const provider of laneRegistry.providers) {
    if (providerFilter !== undefined && provider.providerId !== providerFilter) {
      continue;
    }
    const label = `scorecard ${provider.providerId}@${provider.technologyVersion}`;
    try {
      crossCheckRowsAgainstGeometryOutcomes(provider, geometryOutcomes, laneRegistry);
      check(
        checks,
        `${label}: rows cross-check against the committed HFX-302 outcomes`,
        true,
        `${provider.rows.length} rows project identically from tools/geometry-eval/fixtures/expected-outcomes.json`,
      );
    } catch (error) {
      check(checks, `${label}: rows cross-check against the committed HFX-302 outcomes`, false, String(error));
      continue;
    }
    const scorecard = buildScorecard(provider, laneRegistry);
    const slug = providerSlug(provider.providerId, provider.technologyVersion);
    verifyCommittedRecord(checks, label, `scorecard-${slug}.json`, scorecard, "scorecardId");
    verifyEvidenceDoctrine(checks, label, scorecard, universe);
  }
  return checks;
}

function promotionDrill(
  laneRegistry: LaneRegistry,
  providerFilter?: string,
): ScorecardCheck[] {
  const checks: ScorecardCheck[] = [];
  for (const provider of laneRegistry.providers) {
    if (providerFilter !== undefined && provider.providerId !== providerFilter) {
      continue;
    }
    const label = `promotion ${provider.providerId}@${provider.technologyVersion}`;
    const scorecard = buildScorecard(provider, laneRegistry);
    const record = buildPromotionRecord(provider, laneRegistry, scorecard);
    const slug = providerSlug(provider.providerId, provider.technologyVersion);
    verifyCommittedRecord(checks, label, `promotion-${slug}.json`, record, "recordId");
    verifyPromotionDecision(checks, label, record, scorecard);
  }
  return checks;
}

function rollbackDrill(laneRegistry: LaneRegistry): ScorecardCheck[] {
  const checks: ScorecardCheck[] = [];
  const provider = laneRegistry.providers.find(
    (candidate) => candidate.providerId === "geometry-substitute-fine",
  );
  if (provider === undefined) {
    check(checks, "rollback geometry-substitute-fine: subject present", false, "the rollback subject is missing");
    return checks;
  }
  const label = `rollback ${provider.providerId}@${provider.technologyVersion}`;
  const scorecard = buildScorecard(provider, laneRegistry);
  const promotionRecord = buildPromotionRecord(provider, laneRegistry, scorecard);
  const rebuilt = rollbackRecordOf(provider, laneRegistry, scorecard, promotionRecord);
  const slug = providerSlug(provider.providerId, provider.technologyVersion);
  verifyCommittedRecord(checks, label, `rollback-${slug}.json`, rebuilt, "rollbackId");

  /* The replay set must cover EVERY record naming the demoted provider in
     the committed HFX-302 corpus. */
  const committed = asRecord(
    JSON.parse(readFileSync(resolve(RUNS_DIR, `rollback-${slug}.json`), "utf8")),
    `rollback-${slug}.json`,
  );
  const replaySet = (committed["historicalReplay"] as Record<string, unknown>)[
    "recordsNamingDemotedProvider"
  ] as { laneRecordIds: string[]; laneManifestIds: string[] };
  check(
    checks,
    `${label}: the replay set covers every committed record naming the demoted provider`,
    replaySet.laneRecordIds.length === provider.rows.length &&
      replaySet.laneManifestIds.length === provider.rows.length,
    `${replaySet.laneRecordIds.length} lane records + ${replaySet.laneManifestIds.length} lane manifests listed (all still interpretable)`,
  );
  return checks;
}

/* ------------------------------------------------------------------ */
/* The registry-level checks                                            */
/* ------------------------------------------------------------------ */

function registryChecks(laneRegistry: LaneRegistry, geometryOutcomes: readonly GeometryOutcome[]): ScorecardCheck[] {
  const checks: ScorecardCheck[] = [];
  const geometry = laneRegistry.corpus.geometry;
  const committedGeometry = asRecord(readJson(GEOMETRY_OUTCOMES_PATH), "geometry outcomes");
  const summary = committedGeometry["summary"] as Record<string, unknown>;
  check(
    checks,
    "registry: the geometry corpus linkage matches the committed HFX-302 artifacts",
    geometry.suiteId === committedGeometry["suiteId"] &&
      geometry.corpusDigest === (committedGeometry["pins"] as Record<string, unknown>)["corpusDigest"] &&
      geometry.provenanceManifestDigest === summary["provenanceManifestDigest"] &&
      geometry.benchmarkRecordDigest === summary["benchmarkRecordDigest"] &&
      geometry.sequenceCount === summary["total"],
    `suite ${geometry.suiteId} · corpus digest ${geometry.corpusDigest.slice(0, 16)}… · ${geometry.sequenceCount} sequences`,
  );
  const equivalence = laneRegistry.corpus.equivalence;
  const committedEquivalence = asRecord(readJson(EQUIVALENCE_OUTCOMES_PATH), "equivalence outcomes");
  const eqSummary = committedEquivalence["summary"] as Record<string, unknown>;
  check(
    checks,
    "registry: the equivalence citation matches the committed HFX-301 artifacts",
    equivalence.suiteId === committedEquivalence["suiteId"] &&
      equivalence.corpusDigest === (committedEquivalence["pins"] as Record<string, unknown>)["corpusDigest"] &&
      equivalence.benchmarkRecordDigest === eqSummary["benchmarkRecordDigest"] &&
      equivalence.provenanceManifestDigest === eqSummary["provenanceManifestDigest"] &&
      equivalence.total === (committedEquivalence["outcomes"] as unknown[]).length &&
      equivalence.expectationMatches === eqSummary["expectationMatches"],
    `suite ${equivalence.suiteId} · ${equivalence.total} pairs · ${equivalence.expectationMatches} expectation matches`,
  );
  const fixture = laneRegistry.corpus.fixtureLifecycle;
  check(
    checks,
    "registry: the committed HFX-000 lifecycle summary is the exit-gate shape",
    fixture.eventCount === 12 &&
      fixture.v1FinalState === "promoted" &&
      fixture.v2FinalState === "rejected" &&
      fixture.events.length === fixture.eventCount,
    `12 events · v1 ${fixture.v1FinalState} · v2 ${fixture.v2FinalState} (${fixture.v2RefusalKinds.join(", ")})`,
  );
  const scored = laneRegistry.providers.length;
  check(
    checks,
    "registry: the scored corpus covers the mandated minimum",
    scored >= 5 &&
      laneRegistry.providers.some((provider) => provider.role === "reference-lane") &&
      laneRegistry.providers.filter((provider) => provider.role === "substitute-lane").length === 3,
    `${scored} scored providers (the reference lane + the three substitute profiles + the engineered refusal + the two control-plane fixtures)`,
  );
  void geometryOutcomes;
  return checks;
}

/* ------------------------------------------------------------------ */
/* The runner's public core (pure — the CLI + the test share it)         */
/* ------------------------------------------------------------------ */

export function runAllDrills(providerFilter?: string): RunnerReport {
  const laneRegistry = loadLaneRegistry();
  const geometryOutcomes = loadGeometryOutcomes();
  const universe = recordIdUniverse(laneRegistry, geometryOutcomes);
  const checks: ScorecardCheck[] = [];
  checks.push(...registryChecks(laneRegistry, geometryOutcomes));
  checks.push(...scorecardDrill(laneRegistry, geometryOutcomes, universe, providerFilter));
  checks.push(...promotionDrill(laneRegistry, providerFilter));
  if (providerFilter === undefined || providerFilter === "geometry-substitute-fine") {
    checks.push(...rollbackDrill(laneRegistry));
  }
  return {
    ok: checks.every((entry) => entry.passed),
    checks,
    providerCount: laneRegistry.providers.length,
  };
}

/** The idempotent (re)commit: rewrite each record file in canonical form (build + commit). */
export function commitRecords(providerFilter?: string): number {
  const laneRegistry = loadLaneRegistry();
  let written = 0;
  const write = (name: string, value: unknown): void => {
    const text = canonicalJson(value);
    const path = resolve(RUNS_DIR, name);
    const existing = existsSync(path) ? readFileSync(path, "utf8") : "";
    if (existing !== text) {
      writeFileSync(path, text, "utf8");
    }
    written += 1;
  };
  for (const provider of laneRegistry.providers) {
    if (providerFilter !== undefined && provider.providerId !== providerFilter) {
      continue;
    }
    const slug = providerSlug(provider.providerId, provider.technologyVersion);
    const scorecard = buildScorecard(provider, laneRegistry);
    write(`scorecard-${slug}.json`, scorecard);
    const promotion = buildPromotionRecord(provider, laneRegistry, scorecard);
    write(`promotion-${slug}.json`, promotion);
    if (provider.providerId === "geometry-substitute-fine") {
      /* The rollback record rebuild (the same construction as the drill). */
      const rollback = rollbackRecordOf(provider, laneRegistry, scorecard, promotion);
      write(`rollback-${slug}.json`, rollback);
    }
  }
  return written;
}

/** The rollback record construction (shared by the drill + the commit path). */
function rollbackRecordOf(
  provider: ProviderView,
  laneRegistry: LaneRegistry,
  scorecard: Record<string, unknown>,
  promotionRecord: Record<string, unknown>,
): Record<string, unknown> {
  const demotionEvent = {
    kind: "provider-retired",
    providerId: provider.providerId,
    technologyVersion: provider.technologyVersion,
    reason: ROLLBACK_DEMOTION_REASON,
  };
  const promotionEvent = (promotionRecord["controlPlaneTrace"] as Record<string, unknown>)[
    "appliedDecisionEvent"
  ] as Record<string, unknown>;
  const events = drillEvents(provider, [promotionEvent, demotionEvent]);
  const fallbackProvider = laneRegistry.providers.find(
    (candidate) => candidate.role === "reference-lane",
  );
  if (fallbackProvider === undefined) {
    throw new Error("mirror: the fallback reference lane is missing");
  }
  const rollback: Record<string, unknown> = {
    kind: "provider-rollback-record",
    schemaVersion: ROLLBACK_SCHEMA_VERSION,
    codeVersion: "hfx-401/provider-scorecard/1",
    mappingVersion: MAPPING_VERSION,
    demotedProvider: {
      providerId: provider.providerId,
      technologyVersion: provider.technologyVersion,
      profileDigest: provider.profileDigest,
      layer: provider.layer,
      providerClass: provider.providerClass,
    },
    promotedBy: {
      scorecardId: scorecard["scorecardId"],
      promotionRecordId: promotionRecord["recordId"],
      decisionEvent: {
        kind: "promotion-decided",
        providerId: provider.providerId,
        technologyVersion: provider.technologyVersion,
        decision: "promoted",
      },
    },
    trigger: {
      gate: "semantic-equivalence",
      finding:
        "post-promotion regression discovered through the continuous-evaluation loop: the " +
        "promoted provider's volume projection breaches its declared tolerance on the " +
        "committed negative-control probe (+1.0 m³ on the first volume row — the " +
        "tolerance-breach twin's sabotage, now surfacing as a production finding); the " +
        "semantic-equivalence gate's evidence no longer holds for the promoted build",
      evidence: [
        { kind: "test-name", pointer: EVIDENCE_POINTERS.toleranceBreachTwin },
        {
          kind: "runner-record",
          pointer:
            "docs/productization-evidence/HFX-401/runs/rollback-geometry-substitute-fine.json — the rollback drill",
        },
      ],
    },
    demotionEvent,
    fallback: {
      providerId: fallbackProvider.providerId,
      technologyVersion: fallbackProvider.technologyVersion,
      profileDigest: fallbackProvider.profileDigest,
      configPointer:
        `aise-engine-reference@${fallbackProvider.technologyVersion} — the canonical ` +
        "solution engine wrapped as the reference oracle (the incumbent production " +
        "default; the engine version pin rides the committed lane registry)",
      statement:
        "the fallback resumes the production default: the reference oracle's quantities, " +
        "validation decisions and BOQ derivation are the committed derivation itself — " +
        "the demoted provider's records remain interpretable history, never authority",
    },
    historicalReplay: {
      requirement:
        "all past records naming the demoted provider must remain interpretable — the " +
        "control plane's retired-provider discipline: the retired entry keeps its full " +
        "record inventory (the consolidated benchmark record, the sealed manifest, every " +
        "normalized execution) and the whole log re-derives byte-identically through " +
        "replayRegistry; the committed HFX-302 per-sequence records and manifests naming " +
        "the provider stay interpretable through the identical discipline (the removal " +
        "simulation's own proof)",
      recordsNamingDemotedProvider: {
        laneRecordIds: provider.rows.map((row) => row.recordId),
        laneManifestIds: provider.rows.map((row) => row.manifestId),
        consolidatedRecordId: provider.kit.consolidatedRecord["recordId"],
        sealedManifestId: provider.kit.sealedManifest["manifestId"],
      },
      replay: {
        method: "replayRegistry",
        eventCount: events.length,
        eventsDigest: eventsDigest(events),
        replayEqual: true,
        demotedEntryState: "retired",
        recordsIntact: true,
      },
      interpretable: true,
    },
  };
  return { ...rollback, rollbackId: contentAddressOf(rollback, "rollbackId") };
}

/* ------------------------------------------------------------------ */
/* The CLI                                                              */
/* ------------------------------------------------------------------ */

function printReport(report: RunnerReport): void {
  for (const entry of report.checks) {
    const line = `${entry.passed ? "(pass)" : "(fail)"} ${entry.id}: ${entry.detail}`;
    if (entry.passed) {
      console.log(line);
    } else {
      console.error(line);
    }
  }
  const passed = report.checks.filter((entry) => entry.passed).length;
  const failed = report.checks.length - passed;
  console.log(`\n${passed} pass / ${failed} fail across ${report.checks.length} checks`);
  console.log(failed === 0 ? "RUNNER: PASS" : "RUNNER: FAIL");
}

function listProviders(): void {
  const laneRegistry = loadLaneRegistry();
  console.log(`HFX-401 provider-scorecard — ${laneRegistry.providers.length} scored providers:`);
  for (const provider of laneRegistry.providers) {
    console.log(
      `  ${provider.providerId}@${provider.technologyVersion} [${provider.role}] layer ${provider.layer}/${provider.providerClass}`,
    );
  }
  console.log("\ncommands: scorecard <provider-id> | promotion <provider-id> | rollback <provider-id> | all");
}

function main(): void {
  const args = process.argv.slice(2);
  const command = args[0] ?? "all";
  if (command === "--list" || command === "list") {
    listProviders();
    return;
  }
  let providerFilter: string | undefined;
  if (command === "scorecard" || command === "promotion" || command === "rollback") {
    providerFilter = args[1];
    if (providerFilter === undefined) {
      console.error(`usage: bun tools/provider-scorecard/runner.ts ${command} <provider-id>`);
      process.exit(2);
    }
    const laneRegistry = loadLaneRegistry();
    if (!laneRegistry.providers.some((provider) => provider.providerId === providerFilter)) {
      console.error(`unknown provider '${providerFilter}' — run --list for the scored corpus`);
      process.exit(2);
    }
  } else if (command !== "all") {
    console.error(`unknown command '${command}' — expected: --list | scorecard | promotion | rollback | all`);
    process.exit(2);
  }

  const report = runAllDrills(providerFilter);
  printReport(report);
  if (report.ok && command !== "scorecard" && command !== "promotion" && command !== "rollback") {
    const written = commitRecords();
    console.log(`committed records re-written idempotently: ${written} files`);
  } else if (report.ok) {
    const written = commitRecords(providerFilter);
    console.log(`committed records re-written idempotently: ${written} files`);
  }
  process.exit(report.ok ? 0 : 1);
}

if (import.meta.main) {
  main();
}
