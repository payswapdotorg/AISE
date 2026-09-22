/**
 * HFX-201 — the deterministic Qwen3-VL fixture DOUBLES.
 *
 * In-repo stand-ins for the registered candidate models' behavior on the
 * benchmark corpus (the `providerFixture` / reference-provider pattern of
 * the control plane testkit): NO NETWORK, no live Qwen3-VL execution (the
 * binding dataset/model-use rule — the profiles are REGISTERED CANDIDATES
 * whose behavior on this corpus is scripted as data). Every double:
 *
 *  - consumes the declared input contract `{ bundleJson, behaviorTag,
 *    variantScript? }` (a CLOSED contract — the double invents no input
 *    fields) and answers through the declared output contract
 *    `{ envelopeJson }` — the canonical Layer-2 Evidence Envelope schema
 *    as JSON text (provider replacement never changes the schema);
 *  - is steered per scenario per variant by the corpus's data-driven
 *    scripts (the THREE behavior classes: well-grounded, hallucinating,
 *    refusing — see model.ts);
 *  - carries an OPAQUE provider-native payload for provenance ONLY —
 *    carried verbatim, digested, never parsed into any canonical domain
 *    type (the technology-substitution rule).
 *
 * DETERMINISM: pure computation over the scripted input — no clock, no
 * randomness, no I/O. Identical executions are byte-identical.
 */

import type { ProviderProfile, RawProviderExecution } from "@aise/provider-registry";
import type { EvidenceQuestionBundle } from "../reasoning-eval/model";

/** The engine tag the opaque native payload carries (provenance only). */
export const QWEN3_VL_DOUBLE_ENGINE = "qwen3-vl-eval-double" as const;

/** The media type of the double's opaque provider-native payload. */
export const QWEN3_VL_DOUBLE_NATIVE_MEDIA_TYPE =
  "application/aise-hfx201-vlm-eval-double+json" as const;

interface DoubleInputPayload {
  readonly bundleJson: string;
  readonly behaviorTag: string;
  readonly variantScript?: string;
}

/**
 * The fixed deterministic wording of the explicit unsupported refusal (the
 * `refuse` behavior): derived from the bundle's question and the evaluated
 * profile's own identity — the same inputs always yield the same refusal
 * text (the golden's expected unknowns re-derive it verbatim).
 */
export function qwen3VlRefusalDetail(
  bundle: EvidenceQuestionBundle,
  profile: ProviderProfile,
): string {
  return (
    `question '${bundle.question}' requires capability or data outside the declared capability and ` +
    `modality set of provider '${profile.providerId}' (${profile.technologyVersion}) — declared modalities: ` +
    `${profile.supportedModalities.join(", ")}; explicit unsupported refusal, never a guess`
  );
}

/**
 * Executes the Qwen3-VL evaluation double for one variant over one
 * scenario input (deterministic):
 *
 *  - `replay` → the scripted Evidence Envelope verbatim (the well-grounded
 *    OR defective answer script; the Layer-2 harness parses and evaluates
 *    it — the double never self-assesses);
 *  - `refuse` → the explicit closed-vocabulary `unsupported-data` provider
 *    refusal with the deterministic bundle-derived wording (the honest
 *    out-of-capability / out-of-scope answer — never a guess);
 *  - `empty` / `malformed` → the Layer-2 control-channel negative paths
 *    (an empty unsupported envelope / an unparseable payload).
 */
export function executeQwen3VlDouble(
  profile: ProviderProfile,
  input: { readonly payload: Record<string, unknown> },
): RawProviderExecution {
  const payload = input.payload as unknown as DoubleInputPayload;
  const capability = profile.capabilities[0] ?? "";
  const native = {
    mediaType: QWEN3_VL_DOUBLE_NATIVE_MEDIA_TYPE,
    payload: {
      engine: QWEN3_VL_DOUBLE_ENGINE,
      providerId: profile.providerId,
      technologyVersion: profile.technologyVersion,
      behaviorTag: payload.behaviorTag,
      note:
        "opaque provider-native payload — the deterministic double standing in for the registered " +
        "Qwen3-VL candidate; carried for provenance only, never parsed into canonical domain types",
    },
  };
  switch (payload.behaviorTag) {
    case "replay": {
      if (payload.variantScript === undefined) {
        throw new Error(
          "qwen3-vl eval double: the replay behavior requires the variantScript (the scripted envelope)",
        );
      }
      return {
        capability,
        outputs: { envelopeJson: payload.variantScript },
        providerNative: native,
      };
    }
    case "refuse": {
      const bundle = JSON.parse(payload.bundleJson) as EvidenceQuestionBundle;
      return {
        capability,
        failure: {
          kind: "unsupported-data",
          detail: qwen3VlRefusalDetail(bundle, profile),
        },
        providerNative: native,
      };
    }
    case "empty": {
      return {
        capability,
        outputs: {
          envelopeJson:
            `{"evidenceIds":[],"facts":[],"assumptions":[],"unknowns":["no authorized evidence answered ` +
            `the question"],"deterministicChecks":[],"resultClaim":null,"resultStatus":"unsupported",` +
            `"invalidationConditions":[],"agentIdentity":{"providerId":"${profile.providerId}",` +
            `"technologyVersion":"${profile.technologyVersion}","capability":"${capability}"},` +
            `"proposedOperation":null}`,
        },
        providerNative: native,
      };
    }
    case "malformed": {
      return {
        capability,
        outputs: { envelopeJson: "{not-a-valid-qwen3-vl-envelope" },
        providerNative: native,
      };
    }
    default:
      throw new Error(`qwen3-vl eval double: unknown behavior tag '${payload.behaviorTag}'`);
  }
}
