/**
 * HFX-201 — the DOUBLES tests: the deterministic in-repo stand-ins execute
 * the data-driven scripts faithfully (replay / refuse / empty / malformed),
 * carry the opaque native payload for provenance only, and are
 * byte-deterministic.
 */

import { describe, expect, test } from "bun:test";
import { normalizeResult, inputDigestOf } from "@aise/provider-registry";
import { canonicalJsonText } from "../reasoning-eval/model";
import { executeQwen3VlDouble, qwen3VlRefusalDetail, QWEN3_VL_DOUBLE_ENGINE } from "./doubles";
import { qwen3VlProfileForVariant, validatedQwen3VlProfile } from "./model";
import { VLM_EVAL_RUNS } from "./corpus";
import type { VlmEvalScenario } from "./corpus";

const runOf = (scenarioId: string): VlmEvalScenario => {
  const found = VLM_EVAL_RUNS.find((run) => run.scenarioId === scenarioId);
  if (found === undefined) {
    throw new Error(`no corpus run '${scenarioId}'`);
  }
  return found;
};

describe("HFX-201 doubles: the data-driven behavior table", () => {
  test("a replay script is emitted verbatim through the declared output contract", () => {
    const run = runOf("spatial-ref-lintel@qwen3-vl-8b");
    const profile = qwen3VlProfileForVariant(run.variant);
    const execution = executeQwen3VlDouble(profile, run.scenario.input);
    expect(execution.outputs).toBeDefined();
    const envelopeJson = (execution.outputs ?? {}).envelopeJson;
    expect(typeof envelopeJson).toBe("string");
    const envelope = JSON.parse(envelopeJson as string) as Record<string, unknown>;
    expect(envelope.agentIdentity).toEqual({
      providerId: "qwen3-vl-8b",
      technologyVersion: "8b-eval-doubles-1",
      capability: "multimodal-reasoning",
    });
    // the emitted envelope normalizes cleanly against the profile contract
    const inputDigest = inputDigestOf(run.scenario.input);
    const normalized = normalizeResult(execution, profile, { inputDigest });
    expect(normalized.ok).toBe(true);
  });

  test("a refusal answers the explicit closed-vocabulary unsupported-data failure", () => {
    const run = runOf("unsupported-audio-transcription@qwen3-vl-30b-a3b");
    const profile = qwen3VlProfileForVariant(run.variant);
    const execution = executeQwen3VlDouble(profile, run.scenario.input);
    expect(execution.outputs).toBeUndefined();
    expect(execution.failure?.kind).toBe("unsupported-data");
    expect(execution.failure?.detail).toContain("never a guess");
    expect(execution.failure?.detail).toContain("qwen3-vl-30b-a3b");
    expect(execution.failure?.detail).toContain("image, video, document, text");
  });

  test("the refusal wording is bundle-derived and deterministic", () => {
    const run = runOf("unsupported-code-verification@qwen3-vl-8b");
    const profile = qwen3VlProfileForVariant(run.variant);
    const bundle = JSON.parse(run.scenario.input.payload.bundleJson as string);
    const detail = qwen3VlRefusalDetail(bundle, profile);
    expect(detail).toContain("EC3 bending utilization");
    expect(detail).toBe(qwen3VlRefusalDetail(bundle, profile));
    expect(detail).toContain("8b-eval-doubles-1");
  });

  test("the opaque native payload carries the engine + variant identity for provenance only", () => {
    const run = runOf("nameplate-fields-grounded@qwen3-vl-8b");
    const profile = qwen3VlProfileForVariant(run.variant);
    const execution = executeQwen3VlDouble(profile, run.scenario.input);
    const native = execution.providerNative;
    expect(native?.mediaType).toBe("application/aise-hfx201-vlm-eval-double+json");
    const payload = native?.payload as Record<string, unknown>;
    expect(payload.engine).toBe(QWEN3_VL_DOUBLE_ENGINE);
    expect(payload.providerId).toBe("qwen3-vl-8b");
    expect(payload.behaviorTag).toBe("replay");
  });

  test("the empty and malformed control-channel behaviors produce the Layer-2 negative paths", () => {
    const run = runOf("spatial-ref-lintel@qwen3-vl-8b");
    const profile = qwen3VlProfileForVariant(run.variant);
    const empty = executeQwen3VlDouble(profile, {
      payload: { bundleJson: run.scenario.input.payload.bundleJson as string, behaviorTag: "empty" },
    });
    expect(empty.outputs?.envelopeJson).toContain("unsupported");
    const malformed = executeQwen3VlDouble(profile, {
      payload: { bundleJson: run.scenario.input.payload.bundleJson as string, behaviorTag: "malformed" },
    });
    expect(malformed.outputs?.envelopeJson).toContain("not-a-valid");
    expect(() =>
      executeQwen3VlDouble(profile, {
        payload: { bundleJson: "{}", behaviorTag: "teleport" },
      }),
    ).toThrow(/unknown behavior tag/);
  });

  test("identical executions are byte-identical (determinism)", () => {
    for (const run of VLM_EVAL_RUNS) {
      const profile = validatedQwen3VlProfile(run.variant).profile;
      const first = executeQwen3VlDouble(profile, run.scenario.input);
      const second = executeQwen3VlDouble(profile, run.scenario.input);
      expect(canonicalJsonText(first)).toBe(canonicalJsonText(second));
    }
  });
});
