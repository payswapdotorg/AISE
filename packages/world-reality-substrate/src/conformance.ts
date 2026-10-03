/**
 * WORLD-P0-A — the shared lane-conformance harness.
 *
 * One battery, five lanes. Every substrate lane (Babylon scene runtime,
 * CesiumJS geospatial context, OpenUSD composition semantics, glTF/GLB
 * runtime delivery, Assimp ingest) declares a `SubstrateLaneContract`
 * (closed capability list + substrate identity + contract digest) and
 * provides a substitution double that satisfies the SAME port shape:
 * submit → typed outcome, artifact → provenance + opaque handle.
 *
 * `runLaneConformance` then proves, per lane, the substitution laws that
 * apply at this stage (spec/technology-substitution-contract.md §4):
 *
 *  1. contract-shape   — the declared capability list is closed, unique,
 *                        and the digest is the content address of the
 *                        contract (tampering changes the digest);
 *  2. determinism      — the same request through the double produces
 *                        deeply-equal artifacts (byte-level JSON compare);
 *  3. failure-closure  — a poisoned request is answered with a typed
 *                        failure from the CLOSED five-kind vocabulary —
 *                        never a throw, never a silent gap;
 *  4. capability-proof — every DECLARED capability is EXERCISED with real
 *                        behavior (a declared-but-dead capability fails
 *                        the battery);
 *  5. provenance       — every artifact binds its substrate identity,
 *                        contract digest and input digest;
 *  6. quarantine       — artifact addressing goes through opaque
 *                        substrate handles; no canonical AISE id is
 *                        minted by a substrate.
 *
 * The harness is PURE: no network, no clock reads, no randomness. The
 * same subject yields the identical report on every host.
 */

import { digestHex, isSubstrateHandle, SUBSTRATE_HANDLE_PREFIX } from "./identity";
import type { SubstrateLane } from "./identity";
import { isSubstrateFailureKind } from "./outcome";
import type { SubstrateOutcome } from "./outcome";
import { thrownMessage } from "./outcome";

/* ------------------------------------------------------------------ */
/* The lane contract                                                     */
/* ------------------------------------------------------------------ */

/** Who exercises one capability: the substrate, or the AISE adapter. */
export type CapabilityOwner = "substrate" | "adapter-declared";

/** One declared capability of one substrate lane. */
export interface CapabilityStatement {
  /** Closed-vocabulary capability id, unique within the lane. */
  readonly id: string;
  /** One-line statement of what the lane delegates to the substrate. */
  readonly statement: string;
  /** Is the capability's behavior deterministic in the double? */
  readonly determinism: "deterministic" | "declared-nondeterministic";
  /** Who exercises the capability (declared for the real substrate). */
  readonly owner: CapabilityOwner;
}

/**
 * The substrate-neutral adapter contract one lane publishes. The digest
 * is the sha-256 content address over the canonical JSON of the
 * contract's identity+capabilities — the provenance of every artifact
 * binds it, so a contract change is visible in every downstream record.
 */
export interface SubstrateLaneContract {
  readonly lane: SubstrateLane;
  readonly substrateName: string;
  readonly substrateHomepage: string;
  readonly adapterVersion: string;
  readonly capabilities: readonly CapabilityStatement[];
}

/** Canonical JSON of a contract (stable key order — digest input). */
export function contractCanonicalJson(contract: SubstrateLaneContract): string {
  return JSON.stringify({
    adapterVersion: contract.adapterVersion,
    capabilities: [...contract.capabilities]
      .map((capability) => ({
        determinism: capability.determinism,
        id: capability.id,
        owner: capability.owner,
        statement: capability.statement,
      }))
      .sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0)),
    lane: contract.lane,
    substrateHomepage: contract.substrateHomepage,
    substrateName: contract.substrateName,
  });
}

/** The sha-256 content digest of a lane contract. */
export function contractDigest(contract: SubstrateLaneContract): string {
  return digestHex(contractCanonicalJson(contract));
}

/** The declared-capability ids of a lane (sorted, for stable compare). */
export function capabilityIds(contract: SubstrateLaneContract): string[] {
  return [...contract.capabilities].map((capability) => capability.id).sort();
}

/* ------------------------------------------------------------------ */
/* Artifacts and provenance                                              */
/* ------------------------------------------------------------------ */

/**
 * The provenance every substrate artifact carries: which substrate lane
 * produced it, under which contract revision, over which input digest.
 */
export interface SubstrateProvenance {
  readonly lane: SubstrateLane;
  readonly substrateName: string;
  readonly adapterVersion: string;
  readonly contractDigest: string;
  readonly inputDigest: string;
}

/** The base shape of every artifact a substrate lane returns. */
export interface SubstrateArtifact {
  readonly lane: SubstrateLane;
  /** Opaque substrate handle (never a canonical AISE id). */
  readonly handle: string;
  readonly provenance: SubstrateProvenance;
}

/* ------------------------------------------------------------------ */
/* The conformance subject + battery                                     */
/* ------------------------------------------------------------------ */

/** Real-behavior evidence for one declared capability. */
export interface CapabilityExercise {
  readonly capabilityId: string;
  readonly ok: boolean;
  readonly evidence: string;
}

/**
 * What a lane must provide to run the battery: a canonical supported
 * request, a request the lane MUST refuse, the typed submit entry, and a
 * real exercise of every declared capability.
 */
export interface LaneConformanceSubject {
  readonly contract: SubstrateLaneContract;
  /** A known-supported canonical request (fresh instance each call). */
  readonly canonicalRequest: () => unknown;
  /** A request the lane must refuse with a closed-vocabulary failure. */
  readonly refusingRequest: () => unknown;
  /** The typed lane entry point. */
  readonly submit: (request: unknown) => SubstrateOutcome<SubstrateArtifact>;
  /** Exercise every declared capability with REAL behavior. */
  readonly exerciseCapabilities: () => readonly CapabilityExercise[];
}

/** One battery check result. */
export interface ConformanceCheckResult {
  readonly check: string;
  readonly ok: boolean;
  readonly detail: string;
}

/** The full battery report for one lane. */
export interface LaneConformanceReport {
  readonly lane: SubstrateLane;
  readonly checks: readonly ConformanceCheckResult[];
  readonly allPassed: boolean;
}

function check(
  name: string,
  ok: boolean,
  detail: string,
): ConformanceCheckResult {
  return { check: name, ok, detail };
}

/** Run one battery check body with fail-closed throw capture. */
function guardedCheck(
  name: string,
  body: () => ConformanceCheckResult,
): ConformanceCheckResult {
  try {
    return body();
  } catch (error) {
    return check(name, false, `the double threw during the ${name} check: ${thrownMessage(error)}`);
  }
}

function deepEqualJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

/** Run the full six-check battery against one lane's subject. PURE. */
export function runLaneConformance(
  subject: LaneConformanceSubject,
): LaneConformanceReport {
  const { contract } = subject;
  const checks: ConformanceCheckResult[] = [];

  /* 1 — contract shape ------------------------------------------------ */
  {
    const ids = contract.capabilities.map((capability) => capability.id);
    const unique = new Set(ids).size === ids.length;
    const nonEmpty = ids.length > 0 && ids.every((id) => id.length > 0);
    const closedVocab = contract.capabilities.every(
      (capability) =>
        (capability.determinism === "deterministic" ||
          capability.determinism === "declared-nondeterministic") &&
        (capability.owner === "substrate" || capability.owner === "adapter-declared"),
    );
    checks.push(
      check(
        "contract-shape",
        unique && nonEmpty && closedVocab,
        `${ids.length} declared capabilities, unique=${unique}, closed-vocab=${closedVocab}, digest=${contractDigest(contract).slice(0, 16)}…`,
      ),
    );
  }

  /* 2 — determinism ---------------------------------------------------- */
  checks.push(
    guardedCheck("determinism", () => {
      const first = subject.submit(subject.canonicalRequest());
      const second = subject.submit(subject.canonicalRequest());
      const ok =
        first.ok &&
        second.ok &&
        deepEqualJson(
          first.ok ? first.value : null,
          second.ok ? second.value : null,
        );
      return check(
        "determinism",
        ok,
        ok
          ? "two submissions of the canonical request produced identical artifacts (canonical JSON equal)"
          : "the double is non-deterministic — the same request produced different artifacts",
      );
    }),
  );

  /* 3 — failure closure ------------------------------------------------ */
  checks.push(
    guardedCheck("failure-closure", () => {
      const outcome = subject.submit(subject.refusingRequest());
      if (!outcome.ok) {
        const kindClosed = isSubstrateFailureKind(outcome.failure.kind);
        const detailPresent = outcome.failure.detail.length > 0;
        const ok = kindClosed && detailPresent;
        return check(
          "failure-closure",
          ok,
          ok
            ? `refused with closed-vocabulary kind '${outcome.failure.kind}'`
            : `refusal was not closed-vocabulary or not detailed (kind=${String(outcome.failure.kind)})`,
        );
      }
      return check(
        "failure-closure",
        false,
        "the poisoned request was ACCEPTED — failure-closure violated",
      );
    }),
  );

  /* 4 — capability proof ------------------------------------------------ */
  {
    const exercises = subject.exerciseCapabilities();
    const declared = new Set(contract.capabilities.map((capability) => capability.id));
    const exercised = new Set(exercises.map((exercise) => exercise.capabilityId));
    const allOk = exercises.length > 0 && exercises.every((exercise) => exercise.ok);
    const covers = [...declared].every((id) => exercised.has(id));
    const extra = [...exercised].filter((id) => !declared.has(id));
    checks.push(
      check(
        "capability-proof",
        allOk && covers && extra.length === 0,
        `${exercises.length}/${declared.size} declared capabilities exercised with real behavior${extra.length > 0 ? `, undeclared exercised: ${extra.join(",")}` : ""}`,
      ),
    );
  }

  /* 5 — provenance ------------------------------------------------------ */
  checks.push(
    guardedCheck("provenance", () => {
      const outcome = subject.submit(subject.canonicalRequest());
      if (outcome.ok) {
        const artifact = outcome.value;
        const provenance = artifact.provenance;
        const ok =
          provenance.lane === contract.lane &&
          provenance.substrateName === contract.substrateName &&
          provenance.adapterVersion === contract.adapterVersion &&
          provenance.contractDigest === contractDigest(contract) &&
          /^[0-9a-f]{64}$/.test(provenance.inputDigest);
        return check(
          "provenance",
          ok,
          ok
            ? `artifact provenance binds lane=${provenance.lane}, contract digest ${provenance.contractDigest.slice(0, 16)}…, input digest ${provenance.inputDigest.slice(0, 16)}…`
            : "artifact provenance does not bind the lane contract identity",
        );
      }
      return check(
        "provenance",
        false,
        "the canonical request was refused — provenance not observable",
      );
    }),
  );

  /* 6 — quarantine ------------------------------------------------------ */
  checks.push(
    guardedCheck("quarantine", () => {
      const outcome = subject.submit(subject.canonicalRequest());
      if (outcome.ok) {
        const artifact = outcome.value;
        const handleOpaque = isSubstrateHandle(artifact.handle);
        const laneMatch = artifact.handle.startsWith(`${SUBSTRATE_HANDLE_PREFIX}${contract.lane}:`);
        const noCanonicalMint =
          !artifact.handle.startsWith("aise:") &&
          !JSON.stringify(artifact.provenance).includes('"aise:');
        const ok = handleOpaque && laneMatch && noCanonicalMint;
        return check(
          "quarantine",
          ok,
          ok
            ? `artifact addressed by an opaque ${contract.lane} handle; no canonical AISE id minted by the substrate`
            : "artifact addressing violated the quarantine (non-opaque handle or canonical id minted)",
        );
      }
      return check(
        "quarantine",
        false,
        "the canonical request was refused — quarantine not observable",
      );
    }),
  );

  return {
    lane: contract.lane,
    checks,
    allPassed: checks.every((result) => result.ok),
  };
}
