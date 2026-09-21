/**
 * The deterministic solution BOQ derivation (PROD-025) — the core.
 *
 * `deriveSolutionBoq(input)` turns ONE validated solution version + its
 * DECLARED validation snapshot into a versioned, derived building BOQ:
 *
 * ```text
 * validated SolutionVersion + SolutionValidationSnapshot
 *   ↓ gates (identity · integrity · outcome · certified bytes · declaration)
 * deriveStateQuantities(version)          ← THE ENGINE — the single quantity
 *   ↓ grouping + labeling                  authority (never recomputed here)
 * work items → building BOQ lines (units, materials, CITED methods)
 *   ↓ assumption propagation               (uncertainty + unresolved checks)
 * contract SolutionBoqLineTrace objects → SolutionBoqTraceSet
 *   ↓ document assembly + deterministic boqId
 * SolutionBoq (the DERIVED PROJECTION — never a source BOQ)
 * ```
 *
 * THE QUANTITY AUTHORITY RULE: every quantity value, unit, dimension,
 * calculation reference, geometry/node reference and net total comes FROM
 * THE ENGINE'S OUTPUTS (`deriveStateQuantities` over the version — the
 * engine's own aggregation of its applied results). This derivation only
 * GROUPS and LABELS them; it NEVER recomputes a quantity from parameters
 * (proven by the tampered-quantity sabotage test: a tampered engine-record
 * value flows through verbatim). The only engine field the inventory does
 * not carry — the optional `uncertainty` on effect quantities — is read
 * from the SAME engine-authored operation records (the version's effects),
 * verbatim.
 *
 * DETERMINISM: pure computation — no network, no clock (the document has
 * NO derivation-time field; the `boqId` content address IS the derivation
 * identity), no randomness, no I/O. Identical version bytes + identical
 * declared snapshot → byte-identical BOQ.
 *
 * FAIL-CLOSED GATES (typed `SolutionBoqError`s, never silent):
 *
 *  1. `snapshot_version_mismatch` — the snapshot must pin THIS solution
 *     version (solutionId + versionNumber);
 *  2. `snapshot_identity_mismatch` — the snapshot's deterministic id must
 *     re-derive from its certified content (the contract's
 *     `deriveValidationSnapshotId`);
 *  3. `snapshot_outcome_fail` — a failed validation is not a BOQ-generatable
 *     state (unknown / review-needed outcomes ARE generatable — their
 *     unresolved checks propagate as explicit assumptions);
 *  4. `snapshot_input_digest_mismatch` — the snapshot must certify these
 *     version bytes: sha-256 of the version's canonical JSON equals
 *     `inputDigest` (the lifecycle-flipped form — status "validated" +
 *     snapshotRef, the post-validation declaration — is accepted against
 *     the pre-flip certified bytes; every other difference is refused);
 *  5. `snapshot_declaration_mismatch` — a version DECLARING a validation
 *     snapshot (validationSnapshotRef) must declare THE generating one;
 *  6. `empty_version` — no quantity-carrying operation exists (the
 *     contract's trace set requires at least one line);
 *  7. `internal_invariant` — defense in depth: the emitted document must
 *     pass the contract's trace invariants AND full self-verification.
 */

import {
  QUANTITY_DIMENSIONS,
  SOLUTION_CONTRACT_VERSION,
  checkSolutionBoqLineTrace,
  checkSolutionBoqTraceSet,
  deriveValidationSnapshotId,
} from "@aise/solution-contract";
import type {
  EngineeringOperation,
  SolutionValidationSnapshot,
  SolutionVersion,
  TargetGeometryRef,
  TypedQuantity,
} from "@aise/solution-contract";
import { canonicalJsonStringify } from "@aise/shared-contracts";
import { createHash } from "node:crypto";
import { deriveStateQuantities, roundFloat } from "@aise/solution-engine";
import type { TracedQuantity } from "@aise/solution-engine";
import { SOLUTION_BOQ_KIND, SOLUTION_BOQ_VERSION } from "./boq-version";
import { SolutionBoqError } from "./errors";
import {
  deriveSolutionBoqId,
  deriveSolutionBoqLineId,
  solutionBoqLineTraceId,
} from "./identity";
import { collectValidationCheckAssumptions, propagateUncertainty } from "./assumptions";
import {
  boqItemDescription,
  buildingElementOfOperationType,
} from "./elements";
import { sectionOfOperationType, sectionOrderIndex, sectionTitle } from "./sections";
import type {
  DeriveSolutionBoqInput,
  SolutionBoq,
  SolutionBoqAssumption,
  SolutionBoqLine,
  SolutionBoqLineContribution,
  SolutionBoqSection,
} from "./model";
import { verifySolutionBoq } from "./verify";

/* ------------------------------------------------------------------ */
/* Snapshot gates                                                       */
/* ------------------------------------------------------------------ */

function sha256Hex(value: unknown): string {
  return createHash("sha256").update(canonicalJsonStringify(value), "utf8").digest("hex");
}

/**
 * Whether the snapshot certifies these version bytes. TWO accepted forms:
 * the EXACT certified bytes, or the lifecycle-flipped declaration
 * (status "validated" + validationSnapshotRef added after validation —
 * the two lifecycle fields the flip touches, nothing else). Every other
 * byte difference is a mismatch.
 */
export function snapshotCertifiesVersion(
  snapshot: SolutionValidationSnapshot,
  version: SolutionVersion,
): boolean {
  if (sha256Hex(version) === snapshot.inputDigest) {
    return true;
  }
  const lifecycleNormalized: SolutionVersion = {
    ...version,
    status: "draft",
    validationSnapshotRef: undefined,
  };
  return sha256Hex(lifecycleNormalized) === snapshot.inputDigest;
}

function assertSnapshotGates(snapshot: SolutionValidationSnapshot, version: SolutionVersion): void {
  if (snapshot.solutionId !== version.solutionId || snapshot.versionNumber !== version.versionNumber) {
    throw new SolutionBoqError(
      "snapshot_version_mismatch",
      `the snapshot pins solution '${snapshot.solutionId}' version ` +
        `${snapshot.versionNumber}, but the version is solution ` +
        `'${version.solutionId}' version ${version.versionNumber} — a BOQ is ` +
        `generated only from the snapshot's own version`,
    );
  }
  const expectedSnapshotId = deriveValidationSnapshotId({
    solutionId: snapshot.solutionId,
    versionNumber: snapshot.versionNumber,
    inputDigest: snapshot.inputDigest,
    engineKind: snapshot.engine.kind,
    engineVersion: snapshot.engine.version,
    outcome: snapshot.outcome,
  });
  if (expectedSnapshotId !== snapshot.snapshotId) {
    throw new SolutionBoqError(
      "snapshot_identity_mismatch",
      `the snapshot's deterministic identity does not re-derive from its ` +
        `certified content (expected ${expectedSnapshotId}, found ` +
        `${snapshot.snapshotId}) — a tampered or truncated snapshot is ` +
        `refused, never best-efforted`,
    );
  }
  if (snapshot.outcome === "fail") {
    throw new SolutionBoqError(
      "snapshot_outcome_fail",
      `the declared validation snapshot's worst-of outcome is 'fail' — a ` +
        `failed solution version is not BOQ-generatable; resolve the failed ` +
        `checks and re-validate (unknown / review-needed outcomes are ` +
        `generatable and their findings propagate as explicit assumptions)`,
    );
  }
  if (!snapshotCertifiesVersion(snapshot, version)) {
    throw new SolutionBoqError(
      "snapshot_input_digest_mismatch",
      `the snapshot certifies inputDigest ${snapshot.inputDigest}, which ` +
        `matches neither the version's canonical bytes nor its ` +
        `lifecycle-declared form (status 'validated' + validationSnapshotRef) — ` +
        `a BOQ is generated only from the EXACT bytes the declared snapshot ` +
        `certified`,
    );
  }
  if (
    version.validationSnapshotRef !== undefined &&
    version.validationSnapshotRef !== snapshot.snapshotId
  ) {
    throw new SolutionBoqError(
      "snapshot_declaration_mismatch",
      `the version declares validation snapshot ` +
        `'${version.validationSnapshotRef}', but the generating snapshot is ` +
        `'${snapshot.snapshotId}' — a generated BOQ is tied to the version's ` +
        `declared snapshot only, never an ambiguous second certification`,
    );
  }
}

/* ------------------------------------------------------------------ */
/* Work-item grouping (over the ENGINE's traced quantities)             */
/* ------------------------------------------------------------------ */

/** The semantic work-item key of a line (the grouping projection). */
interface WorkItemKey {
  readonly activity: string;
  readonly dimension: string;
  readonly unit: string;
  readonly direction: string;
  readonly material?: string;
  readonly calculationRef: string;
}

function workItemKeyOf(quantity: TracedQuantity): WorkItemKey {
  return {
    activity: quantity.operationType,
    dimension: quantity.dimension,
    unit: quantity.unit,
    direction: quantity.direction,
    ...(materialOf(quantity.parameters) === undefined
      ? {}
      : { material: materialOf(quantity.parameters) }),
    calculationRef: quantity.calculationRef ?? "",
  };
}

function materialOf(
  parameters: readonly { name: string; value: unknown }[],
): string | undefined {
  const material = parameters.find(
    (parameter) => parameter.name === "material" && typeof parameter.value === "string",
  );
  return material === undefined ? undefined : (material.value as string);
}

interface WorkItemGroup {
  readonly key: WorkItemKey;
  /** The engine's traced quantities of this work item, in operation order. */
  readonly quantities: TracedQuantity[];
  /** Engine quantity value summed per contributing operation. */
  readonly perOperationValue: Map<string, number>;
}

function groupEngineQuantities(
  perOperation: readonly TracedQuantity[],
): readonly WorkItemGroup[] {
  const groups = new Map<string, WorkItemGroup>();
  for (const quantity of perOperation) {
    const key = workItemKeyOf(quantity);
    const keyText = canonicalJsonStringify(key);
    const group = groups.get(keyText) ?? {
      key,
      quantities: [],
      perOperationValue: new Map<string, number>(),
    };
    group.quantities.push(quantity);
    group.perOperationValue.set(
      quantity.operationId,
      roundFloat((group.perOperationValue.get(quantity.operationId) ?? 0) + quantity.value),
    );
    groups.set(keyText, group);
  }
  return [...groups.values()];
}

/* ------------------------------------------------------------------ */
/* Uncertainty statements of a work item (from the engine records)      */
/* ------------------------------------------------------------------ */

/**
 * The stated uncertainty statements of one work item's contributions, in
 * operation order — read VERBATIM from the engine-authored operation
 * records' effect quantities (the inventory drops the optional field; the
 * operation records are the same engine outputs). NEVER fabricated.
 */
function statedUncertaintiesOf(
  group: WorkItemGroup,
  operationsByld: ReadonlyMap<string, EngineeringOperation>,
): readonly { operationId: string; operationIndex: number; activity: string; uncertainty: NonNullable<TypedQuantity["uncertainty"]> }[] {
  const stated: {
    operationId: string;
    operationIndex: number;
    activity: string;
    uncertainty: NonNullable<TypedQuantity["uncertainty"]>;
  }[] = [];
  for (const quantity of group.quantities) {
    const operation = operationsByld.get(quantity.operationId);
    if (operation === undefined) {
      continue;
    }
    for (const effect of operation.effects) {
      if (effect.effectKind !== "quantity-impact" || effect.quantity === undefined) {
        continue;
      }
      const effectQuantity = effect.quantity;
      const matches =
        effectQuantity.dimension === group.key.dimension &&
        effectQuantity.unit === group.key.unit &&
        effectQuantity.calculationRef === group.key.calculationRef &&
        (effect.direction ?? "changed") === group.key.direction;
      if (!matches || effectQuantity.uncertainty === undefined) {
        continue;
      }
      stated.push({
        operationId: operation.operationId,
        operationIndex: operation.operationIndex,
        activity: operation.operationType,
        uncertainty: effectQuantity.uncertainty,
      });
    }
  }
  return stated;
}

/* ------------------------------------------------------------------ */
/* Line building                                                        */
/* ------------------------------------------------------------------ */

/** Where the engine's documented quantity formulas live (CITED, never restated). */
export const QUANTITY_METHOD_SOURCE =
  "packages/solution-engine/src/quantity-models.ts (documented formula table; " +
  "see also packages/solution-engine/README.md §The quantity models)";

function dimensionRank(dimension: string): number {
  const index = QUANTITY_DIMENSIONS.indexOf(dimension as (typeof QUANTITY_DIMENSIONS)[number]);
  return index === -1 ? QUANTITY_DIMENSIONS.length : index;
}

function compareStrings(a: string, b: string): number {
  return a === b ? 0 : a < b ? -1 : 1;
}

/** The deterministic document order comparator (section → step → dimension → …). */
function compareLines(a: SolutionBoqLine, b: SolutionBoqLine): number {
  const sectionDelta = sectionOrderIndex(a.sectionId) - sectionOrderIndex(b.sectionId);
  if (sectionDelta !== 0) {
    return sectionDelta;
  }
  const aStep = a.contributions[0]?.operationIndex ?? 0;
  const bStep = b.contributions[0]?.operationIndex ?? 0;
  if (aStep !== bStep) {
    return aStep - bStep;
  }
  const dimensionDelta = dimensionRank(a.quantity.dimension) - dimensionRank(b.quantity.dimension);
  if (dimensionDelta !== 0) {
    return dimensionDelta;
  }
  const unitDelta = compareStrings(a.unit, b.unit);
  if (unitDelta !== 0) {
    return unitDelta;
  }
  const activityDelta = compareStrings(a.activity, b.activity);
  if (activityDelta !== 0) {
    return activityDelta;
  }
  return compareStrings(a.boqLineId, b.boqLineId);
}

function buildContributions(
  group: WorkItemGroup,
  operationsById: ReadonlyMap<string, EngineeringOperation>,
  version: SolutionVersion,
): readonly SolutionBoqLineContribution[] {
  const seenOperations = new Set<string>();
  const contributions: SolutionBoqLineContribution[] = [];
  let firstAdditive = true;
  const ordered = [...group.quantities].sort(
    (a, b) => a.operationIndex - b.operationIndex || compareStrings(a.operationId, b.operationId),
  );
  for (const quantity of ordered) {
    if (seenOperations.has(quantity.operationId)) {
      continue;
    }
    seenOperations.add(quantity.operationId);
    const operation = operationsById.get(quantity.operationId);
    if (operation === undefined) {
      continue;
    }
    const contributionKind =
      group.key.direction === "removed"
        ? "removed"
        : firstAdditive
          ? "created"
          : "modified";
    if (group.key.direction !== "removed") {
      firstAdditive = false;
    }
    contributions.push({
      operationId: operation.operationId,
      operationIndex: operation.operationIndex,
      contributionKind,
      operationValue: roundFloat(group.perOperationValue.get(operation.operationId) ?? 0),
      geometryRefs: operation.target.geometryRefs.map((ref) => ({ ...ref })),
      nodeRefs: [...operation.target.nodeRefs],
      resultingStateRef: version.states[operation.operationIndex]?.stateId ?? "",
    });
  }
  return contributions;
}

/** The union of the group's engine geometry refs, deduped, first-appearance order. */
function traceGeometryRefsOf(group: WorkItemGroup): TargetGeometryRef[] {
  const seen = new Set<string>();
  const refs: TargetGeometryRef[] = [];
  for (const quantity of group.quantities) {
    for (const ref of quantity.geometryRefs) {
      const key = `${ref.kind}\u0000${ref.ref}`;
      if (!seen.has(key)) {
        seen.add(key);
        refs.push({ kind: ref.kind as TargetGeometryRef["kind"], ref: ref.ref });
      }
    }
  }
  return refs;
}

/* ------------------------------------------------------------------ */
/* The derivation                                                       */
/* ------------------------------------------------------------------ */

/**
 * Derives the solution BOQ of one validated solution version from its
 * DECLARED validation snapshot. PURE and DETERMINISTIC: identical inputs →
 * byte-identical BOQ (identical boqId, line ids, trace ids, assumptions).
 * Fail closed with typed `SolutionBoqError`s on any gate violation.
 */
export function deriveSolutionBoq(input: DeriveSolutionBoqInput): SolutionBoq {
  const { version, snapshot, sourceBoqRef } = input;

  /* 1. The snapshot gates (identity · integrity · outcome · bytes · declaration). */
  assertSnapshotGates(snapshot, version);

  /* 2. The ENGINE's quantity inventory — the single quantity authority. */
  const inventory = deriveStateQuantities(version);
  if (inventory.perOperation.length === 0) {
    throw new SolutionBoqError(
      "empty_version",
      `version ${version.versionNumber} of solution '${version.solutionId}' carries ` +
        `no quantity-carrying applied operation — a BOQ of zero lines is not ` +
        `generatable (the contract's trace set requires at least one line)`,
    );
  }

  const operationsById = new Map(
    version.operations.map((operation) => [operation.operationId, operation] as const),
  );

  /* 3. Assumptions: the snapshot's unresolved checks (BOQ-wide). */
  const assumptions: SolutionBoqAssumption[] = [
    ...collectValidationCheckAssumptions(snapshot),
  ];
  const boqWideAssumptionIds = assumptions.map((assumption) => assumption.assumptionId);

  /* 4. Group the ENGINE's traced quantities into work items; propagate
        uncertainty (conflicts become their own assumption entries). */
  const groups = groupEngineQuantities(inventory.perOperation);
  const lineAssumptionIds = new Map<string, readonly string[]>();
  const uncertaintyByGroup = new Map<
    string,
    { uncertainty?: NonNullable<TypedQuantity["uncertainty"]>; conflictId?: string }
  >();
  for (const group of groups) {
    const keyText = canonicalJsonStringify(group.key);
    const propagation = propagateUncertainty(
      statedUncertaintiesOf(group, operationsById),
    );
    if (propagation.conflictAssumption !== undefined) {
      assumptions.push(propagation.conflictAssumption);
      lineAssumptionIds.set(keyText, [
        ...boqWideAssumptionIds,
        propagation.conflictAssumption.assumptionId,
      ]);
    } else {
      lineAssumptionIds.set(keyText, [...boqWideAssumptionIds]);
    }
    uncertaintyByGroup.set(keyText, {
      ...(propagation.uncertainty === undefined
        ? {}
        : { uncertainty: propagation.uncertainty }),
      ...(propagation.conflictAssumption === undefined
        ? {}
        : { conflictId: propagation.conflictAssumption.assumptionId }),
    });
  }

  /* 5. Build the lines (identity last: assumption inventory is hashed in). */
  const lines: SolutionBoqLine[] = groups.map((group) => {
    const keyText = canonicalJsonStringify(group.key);
    const assumptionRefs = lineAssumptionIds.get(keyText) ?? [];
    const sectionId = sectionOfOperationType(group.key.activity);
    const buildingElement = buildingElementOfOperationType(group.key.activity);
    const value = roundFloat(
      group.quantities.reduce((sum, quantity) => sum + quantity.value, 0),
    );
    const contributions = buildContributions(group, operationsById, version);
    const boqLineId = deriveSolutionBoqLineId({
      solutionId: version.solutionId,
      versionNumber: version.versionNumber,
      sectionId,
      buildingElement,
      activity: group.key.activity,
      dimension: group.key.dimension,
      unit: group.key.unit,
      direction: group.key.direction,
      ...(group.key.material === undefined ? {} : { material: group.key.material }),
      calculationRef: group.key.calculationRef,
      assumptionRefs,
    });
    const traceId = solutionBoqLineTraceId({
      solutionId: version.solutionId,
      versionNumber: version.versionNumber,
      boqLineId,
    });
    const uncertainty = uncertaintyByGroup.get(keyText)?.uncertainty;
    const line: SolutionBoqLine = {
      boqLineId,
      traceId,
      sectionId,
      buildingElement,
      activity: group.key.activity,
      direction: group.key.direction as SolutionBoqLine["direction"],
      itemDescription: boqItemDescription({
        activity: group.key.activity,
        ...(group.key.material === undefined ? {} : { material: group.key.material }),
        dimension: group.key.dimension,
        unit: group.key.unit,
      }),
      ...(group.key.material === undefined ? {} : { material: group.key.material }),
      unit: group.key.unit,
      quantity: {
        dimension: group.key.dimension as SolutionBoqLine["quantity"]["dimension"],
        value,
        unit: group.key.unit,
        calculationRef: group.key.calculationRef,
        ...(uncertainty === undefined ? {} : { uncertainty }),
      },
      calculationMethod: {
        calculationRef: group.key.calculationRef,
        methodSource: QUANTITY_METHOD_SOURCE,
      },
      contributions,
      assumptionRefs,
      trace: {
        contractVersion: SOLUTION_CONTRACT_VERSION,
        boqLineId,
        traceId,
        solutionId: version.solutionId,
        versionNumber: version.versionNumber,
        validationSnapshotRef: snapshot.snapshotId,
        itemDescription: boqItemDescription({
          activity: group.key.activity,
          ...(group.key.material === undefined ? {} : { material: group.key.material }),
          dimension: group.key.dimension,
          unit: group.key.unit,
        }),
        contributingOperations: contributions.map((contribution) => ({
          operationId: contribution.operationId,
          operationIndex: contribution.operationIndex,
          contributionKind: contribution.contributionKind,
        })),
        quantity: {
          dimension: group.key.dimension as SolutionBoqLine["quantity"]["dimension"],
          value,
          unit: group.key.unit,
          calculationRef: group.key.calculationRef,
          ...(uncertainty === undefined ? {} : { uncertainty }),
        },
        geometryRefs: traceGeometryRefsOf(group),
      },
    };
    return line;
  });

  /* 6. Deterministic document order + sections. */
  lines.sort(compareLines);
  const sectionLineIds = new Map<string, string[]>();
  for (const line of lines) {
    const lineIds = sectionLineIds.get(line.sectionId) ?? [];
    lineIds.push(line.boqLineId);
    sectionLineIds.set(line.sectionId, lineIds);
  }
  const sections: SolutionBoqSection[] = [...sectionLineIds.entries()]
    .map(([sectionId, lineIds]) => ({
      sectionId,
      title: sectionTitle(sectionId),
      lineIds,
    }))
    .sort((a, b) => sectionOrderIndex(a.sectionId) - sectionOrderIndex(b.sectionId));

  /* 7. The document + deterministic derivation identity. */
  const boq: SolutionBoq = {
    artifactKind: "solution-generated-boq",
    boqId: deriveSolutionBoqId({
      solutionId: version.solutionId,
      versionNumber: version.versionNumber,
      validationSnapshotRef: snapshot.snapshotId,
      lineIds: lines.map((line) => line.boqLineId),
      assumptionIds: assumptions.map((assumption) => assumption.assumptionId),
      ...(sourceBoqRef === undefined
        ? {}
        : { sourceBoqImportId: sourceBoqRef.importId }),
    }),
    derivation: { kind: SOLUTION_BOQ_KIND, version: SOLUTION_BOQ_VERSION },
    contractVersion: SOLUTION_CONTRACT_VERSION,
    solutionId: version.solutionId,
    versionNumber: version.versionNumber,
    ...(version.parentVersionNumber === undefined
      ? {}
      : { parentVersionNumber: version.parentVersionNumber }),
    baselineRealityVersionId: version.states[0]?.baselineRealityVersionId ?? "",
    epistemicClass: "PROPOSED",
    validationSnapshotRef: snapshot.snapshotId,
    validationSnapshot: {
      snapshotId: snapshot.snapshotId,
      outcome: snapshot.outcome,
      inputDigest: snapshot.inputDigest,
      engine: { kind: snapshot.engine.kind, version: snapshot.engine.version },
      checkSummary: snapshot.checks.map((check) => ({
        checkId: check.checkId,
        result: check.result,
      })),
    },
    ...(sourceBoqRef === undefined ? {} : { sourceBoqRef }),
    ...elementTaxonomyOf(version),
    operationIds: version.operations.map((operation) => operation.operationId),
    sections,
    lines,
    assumptions,
    totals: inventory.totals.map((total) => ({ ...total })),
    traceSet: {
      contractVersion: SOLUTION_CONTRACT_VERSION,
      solutionId: version.solutionId,
      versionNumber: version.versionNumber,
      validationSnapshotRef: snapshot.snapshotId,
      lineTraces: lines.map((line) => line.trace),
    },
  };

  /* 8. Defense in depth: the contract's trace invariants + full self-verification. */
  const traceSetFindings = checkSolutionBoqTraceSet(boq.traceSet);
  const firstTraceFinding = traceSetFindings[0];
  if (firstTraceFinding !== undefined) {
    throw new SolutionBoqError(
      "internal_invariant",
      `internal guard: emitted trace set failed contract invariant ` +
        `${firstTraceFinding.code} (${firstTraceFinding.detail}) at ` +
        `${firstTraceFinding.path.join(".")}`,
    );
  }
  for (const line of boq.lines) {
    const lineFindings = checkSolutionBoqLineTrace(line.trace);
    const firstLineFinding = lineFindings[0];
    if (firstLineFinding !== undefined) {
      throw new SolutionBoqError(
        "internal_invariant",
        `internal guard: emitted line '${line.boqLineId}' failed contract ` +
          `invariant ${firstLineFinding.code} (${firstLineFinding.detail})`,
      );
    }
  }
  const verification = verifySolutionBoq(boq);
  if (!verification.ok) {
    throw new SolutionBoqError(
      "internal_invariant",
      `internal guard: emitted BOQ failed self-verification: ` +
        `${verification.findings.join("; ")}`,
    );
  }
  return boq;
}

/** The building-element-taxonomy extension declared by the version's domain. */
function elementTaxonomyOf(
  version: SolutionVersion,
): { elementTaxonomy: { kind: string; ref: string; version: string } } | Record<string, never> {
  const extension = version.operations[0]?.domain.extensions.find(
    (entry) => entry.kind === "building-element-taxonomy",
  );
  return extension === undefined
    ? {}
    : {
        elementTaxonomy: {
          kind: extension.kind,
          ref: extension.ref,
          version: extension.version,
        },
      };
}
