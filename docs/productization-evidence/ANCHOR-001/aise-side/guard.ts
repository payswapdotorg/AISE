/**
 * ANCHOR-001 — the AISE-side output guard (the canonical-boundary guard).
 *
 * Validates the provider's JSON response against the CLOSED output
 * vocabulary (contract.ts). Mirrors the GBIM-001 schema-guard discipline:
 * unknown fields are refused with the field named; every numeric field
 * must be a finite canonical scalar; statuses and reason codes must be in
 * the closed vocabulary; a refused response must carry ZERO hypotheses; a
 * matrix must be a normalized 3x3 of finite numbers. Nothing that fails
 * this guard can become anchoring evidence (proven by neg-006, the
 * corrupted-response case).
 *
 * Stdlib-only TypeScript (zero repo coupling — the evidence tree is
 * removable without touching any engine/package file).
 */

import {
  ANCHORING_REASON_CODES,
  ANCHORING_STATUSES,
  HYPOTHESIS_EPISTEMIC_LABELS,
  PORT_VERSION,
  type AnchoringResponse,
} from "./contract";

export type GuardViolation = string;

const HEX64 = /^[0-9a-f]{64}$/;

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

/** Validate a provider response; returns every violation (empty = PASS). */
export function guardAnchoringResponse(response: unknown): GuardViolation[] {
  const v: GuardViolation[] = [];
  if (!isPlainObject(response)) {
    return ["response must be a JSON object"];
  }

  // Top-level fields: closed set, no unknowns.
  const TOP_FIELDS = new Set([
    "schemaVersion", "portVersion", "executionId", "status", "reasonCode",
    "refusalDetail", "provenance", "hypotheses", "executionTimeMs", "stageTimingsMs",
  ]);
  for (const key of Object.keys(response)) {
    if (!TOP_FIELDS.has(key)) {
      v.push(`unknown top-level field '${key}' (provider types may not cross the canonical boundary)`);
    }
  }
  if (response.schemaVersion !== 1) v.push("schemaVersion must be 1");
  if (response.portVersion !== PORT_VERSION) v.push(`portVersion must be '${PORT_VERSION}'`);
  if (typeof response.executionId !== "string") v.push("executionId must be a string");
  if (!(ANCHORING_STATUSES as readonly string[]).includes(response.status as string)) {
    v.push(`status must be one of ${JSON.stringify(ANCHORING_STATUSES)}`);
  }

  // Reason code + refusal discipline.
  const reason = response.reasonCode;
  if (response.status === "refused") {
    if (!(ANCHORING_REASON_CODES as readonly string[]).includes(reason as string)) {
      v.push(`a refused response must carry a reasonCode from the closed vocabulary (got ${JSON.stringify(reason)})`);
    }
    if (typeof response.refusalDetail !== "string" || response.refusalDetail.length === 0) {
      v.push("a refused response must carry a non-empty refusalDetail");
    }
    if (Array.isArray(response.hypotheses) && response.hypotheses.length > 0) {
      v.push("a refused response must carry NO hypotheses (no fabricated anchors)");
    }
  } else if (reason !== null) {
    v.push("an anchored response must carry reasonCode null");
  }

  if (!isFiniteNumber(response.executionTimeMs)) {
    v.push("executionTimeMs must be a finite number");
  }

  // Provenance: closed field set, all mandatory.
  const prov = response.provenance;
  if (!isPlainObject(prov)) {
    v.push("provenance must be an object");
  } else {
    const PROV_FIELDS = [
      "providerId", "providerVersion", "opencvVersion", "numpyVersion", "pythonVersion",
      "platform", "inputDigest", "adapterSourceDigest", "config",
    ];
    for (const key of Object.keys(prov)) {
      if (!PROV_FIELDS.includes(key)) {
        v.push(`unknown provenance field '${key}'`);
      }
    }
    for (const field of PROV_FIELDS) {
      if (!(field in prov)) v.push(`provenance is missing '${field}'`);
    }
    for (const field of ["providerId", "providerVersion", "opencvVersion", "numpyVersion", "pythonVersion", "platform"]) {
      if (field in prov && typeof prov[field] !== "string") {
        v.push(`provenance.${field} must be a string`);
      }
    }
    for (const field of ["inputDigest", "adapterSourceDigest"]) {
      if (field in prov && !/^sha256:[0-9a-f]{64}$/.test(String(prov[field]))) {
        v.push(`provenance.${field} must be 'sha256:<64-hex>'`);
      }
    }
    if ("config" in prov && !isPlainObject(prov.config)) {
      v.push("provenance.config must be an object");
    }
  }

  // Hypotheses: closed field set, canonical scalars, INFERRED candidates.
  const hyps = response.hypotheses;
  if (!Array.isArray(hyps)) {
    v.push("hypotheses must be an array");
  } else {
    const HYP_FIELDS = new Set([
      "evidenceContentId", "representation", "transform", "inlierCount", "matchCount",
      "inlierRatio", "residualRmsPx", "uncertainty", "confidence", "epistemicLabel", "crossValidation",
    ]);
    hyps.forEach((h, i) => {
      const tag = `hypotheses[${i}]`;
      if (!isPlainObject(h)) {
        v.push(`${tag} must be an object`);
        return;
      }
      for (const key of Object.keys(h)) {
        if (!HYP_FIELDS.has(key)) v.push(`${tag}: unknown field '${key}' (provider types may not cross)`);
      }
      if (!HEX64.test(String(h.evidenceContentId))) {
        v.push(`${tag}.evidenceContentId must be a 64-hex content id`);
      }
      if (h.representation !== "plan-homography") {
        v.push(`${tag}.representation must be 'plan-homography'`);
      }
      if (!(HYPOTHESIS_EPISTEMIC_LABELS as readonly string[]).includes(h.epistemicLabel as string)) {
        v.push(`${tag}.epistemicLabel must be INFERRED (anchoring hypotheses are candidates)`);
      }
      for (const field of ["inlierCount", "matchCount", "residualRmsPx", "confidence"]) {
        if (!isFiniteNumber(h[field])) v.push(`${tag}.${field} must be a finite number`);
      }
      if (isFiniteNumber(h.inlierCount) && h.inlierCount < 0) v.push(`${tag}.inlierCount must be >= 0`);
      if (isFiniteNumber(h.matchCount) && h.matchCount < 0) v.push(`${tag}.matchCount must be >= 0`);
      if (isFiniteNumber(h.inlierRatio) && (h.inlierRatio < 0 || h.inlierRatio > 1)) {
        v.push(`${tag}.inlierRatio must be in [0,1]`);
      }
      if (isFiniteNumber(h.confidence) && (h.confidence < 0 || h.confidence > 1)) {
        v.push(`${tag}.confidence must be in [0,1]`);
      }

      // transform: 3x3 normalized matrix of finite numbers.
      const t = h.transform;
      if (!isPlainObject(t)) {
        v.push(`${tag}.transform must be an object`);
      } else {
        for (const key of Object.keys(t)) {
          if (!["frameFrom", "frameTo", "matrix"].includes(key)) {
            v.push(`${tag}.transform: unknown field '${key}'`);
          }
        }
        if (t.frameFrom !== "plan-raster-px" || t.frameTo !== "still-px") {
          v.push(`${tag}.transform frames must be 'plan-raster-px' -> 'still-px'`);
        }
        const m = t.matrix;
        if (!Array.isArray(m) || m.length !== 3 || !m.every((row) => Array.isArray(row) && row.length === 3 && row.every(isFiniteNumber))) {
          v.push(`${tag}.transform.matrix must be a 3x3 matrix of finite numbers`);
        } else if (Math.abs((m as number[][])[2][2] - 1) > 1e-9) {
          v.push(`${tag}.transform.matrix must be normalized (h[2][2] === 1)`);
        }
      }

      // uncertainty: explicit budget, non-negative meters.
      const u = h.uncertainty;
      if (!isPlainObject(u)) {
        v.push(`${tag}.uncertainty must be an object (explicit uncertainty is mandatory)`);
      } else {
        for (const key of Object.keys(u)) {
          if (!["floorRmsM", "budget95M", "basis", "budgetTerms"].includes(key)) {
            v.push(`${tag}.uncertainty: unknown field '${key}'`);
          }
        }
        for (const field of ["floorRmsM", "budget95M"]) {
          if (!isFiniteNumber(u[field]) || (u[field] as number) < 0) {
            v.push(`${tag}.uncertainty.${field} must be a non-negative finite number (meters)`);
          }
        }
        if (isFiniteNumber(u.floorRmsM) && isFiniteNumber(u.budget95M) && (u.budget95M as number) < (u.floorRmsM as number)) {
          v.push(`${tag}.uncertainty.budget95M must cover floorRmsM`);
        }
        if (typeof u.basis !== "string" || u.basis.length === 0) {
          v.push(`${tag}.uncertainty.basis must be a non-empty string`);
        }
      }

      // crossValidation entries.
      if (!Array.isArray(h.crossValidation)) {
        v.push(`${tag}.crossValidation must be an array`);
      } else {
        h.crossValidation.forEach((c, k) => {
          const ctag = `${tag}.crossValidation[${k}]`;
          if (!isPlainObject(c)) {
            v.push(`${ctag} must be an object`);
            return;
          }
          for (const key of Object.keys(c)) {
            if (!["peerContentId", "residualRmsPx", "consistent"].includes(key)) {
              v.push(`${ctag}: unknown field '${key}'`);
            }
          }
          if (!HEX64.test(String(c.peerContentId))) v.push(`${ctag}.peerContentId must be 64-hex`);
          if (!isFiniteNumber(c.residualRmsPx)) v.push(`${ctag}.residualRmsPx must be finite`);
          if (typeof c.consistent !== "boolean") v.push(`${ctag}.consistent must be boolean`);
        });
      }
    });
  }

  return v;
}

/**
 * Deterministic projection for digest comparison: strip the
 * non-deterministic observation fields (executionId is caller-supplied,
 * executionTimeMs/stageTimingsMs are performance observations) and
 * re-serialize with sorted keys — the same discipline as GBIM-001's
 * reproducibility digest.
 */
export function deterministicProjection(response: AnchoringResponse): string {
  const { executionId: _e, executionTimeMs: _t, stageTimingsMs: _s, ...rest } = response;
  return JSON.stringify(rest, Object.keys(rest).sort(), 0);
}
