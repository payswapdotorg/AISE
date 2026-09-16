/**
 * Demo fixture determinism tests (PROD-009): stable evidence bytes, pinned
 * digests, byte-identical demo outcomes for identical evidence (the free
 * demo path is deterministic by construction), and a full demo execution
 * through the provider-neutral gateway.
 */

import { describe, expect, test } from "bun:test";
import { canonicalJsonStringify } from "@aise/shared-contracts";
import { bytesEqual } from "../../../lib/hash";
import { GENERATED_COMPLETION_LABEL } from "../../gateway/model";
import { makeExecutionRequest, makeGateway } from "../../gateway/testkit";
import { contentIdOf } from "../../testkit";
import { DemoReconstructionProvider } from "./adapter";
import {
  DEMO_FIXTURE_DIGESTS,
  DEMO_FIXTURE_SEEDS,
  demoEvidenceBytes,
  demoEvidenceDigest,
  demoEvidencePayload,
  demoEvidenceReader,
} from "./fixtures";

/* ------------------------------------------------------------------ */
/* Fixtures                                                             */
/* ------------------------------------------------------------------ */

const DEMO_IDS = DEMO_FIXTURE_SEEDS.map((seed) => contentIdOf(seed));

function fixtureEntries(): Record<string, Uint8Array> {
  const entries: Record<string, Uint8Array> = {};
  DEMO_FIXTURE_SEEDS.forEach((seed, index) => {
    entries[DEMO_IDS[index]!] = demoEvidenceBytes(seed);
  });
  return entries;
}

function demoExecutionRequest(requestKey: string) {
  return makeExecutionRequest({
    requestKey,
    providerId: "aise-demo-reconstruction",
    checkpointRef: "demo-fixtures-v1",
    executionConfig: { quality: "demo", cost: "zero" },
    evidenceContentIds: DEMO_IDS,
    requestedRepresentations: ["mesh"],
    declaredInputModalities: ["still_image"],
  });
}

/* ------------------------------------------------------------------ */
/* Stable fixture bytes and digests                                     */
/* ------------------------------------------------------------------ */

describe("demo fixtures: stable bytes and pinned digests", () => {
  test("fixture derivation is pure and repeatable (identical bytes on every call)", () => {
    for (const seed of DEMO_FIXTURE_SEEDS) {
      expect(bytesEqual(demoEvidenceBytes(seed), demoEvidenceBytes(seed))).toBe(true);
      expect(demoEvidencePayload(seed)).toBe(demoEvidencePayload(seed));
    }
  });

  test("distinct seeds derive distinct bytes and digests", () => {
    const digests = new Set(DEMO_FIXTURE_SEEDS.map((seed) => demoEvidenceDigest(seed)));
    expect(digests.size).toBe(DEMO_FIXTURE_SEEDS.length);
    const payloads = new Set(DEMO_FIXTURE_SEEDS.map((seed) => demoEvidencePayload(seed)));
    expect(payloads.size).toBe(DEMO_FIXTURE_SEEDS.length);
  });

  test("DEMO_FIXTURE_DIGESTS pins the exact sha-256 of every fixture's bytes (stability contract)", () => {
    for (const seed of DEMO_FIXTURE_SEEDS) {
      expect(DEMO_FIXTURE_DIGESTS[seed]!).toMatch(/^[0-9a-f]{64}$/);
      expect(demoEvidenceDigest(seed)).toBe(DEMO_FIXTURE_DIGESTS[seed]!);
    }
  });
});

/* ------------------------------------------------------------------ */
/* Byte-identical demo outcomes                                         */
/* ------------------------------------------------------------------ */

describe("demo execution determinism: identical evidence → byte-identical outcomes", () => {
  test("two fresh demo providers over the same evidence bytes answer byte-identically", async () => {
    const request = makeExecutionRequest({
      providerId: "aise-demo-reconstruction",
      evidenceContentIds: DEMO_IDS,
      requestedRepresentations: ["mesh", "point_cloud"],
      declaredInputModalities: ["still_image"],
    }).request;
    const first = await new DemoReconstructionProvider({
      evidenceReader: demoEvidenceReader(fixtureEntries()),
    }).execute(request);
    const second = await new DemoReconstructionProvider({
      evidenceReader: demoEvidenceReader(fixtureEntries()),
    }).execute(request);
    expect(canonicalJsonStringify(first)).toBe(canonicalJsonStringify(second));
  });

  test("the derivation is keyed by the evidence BYTES: same ids, different bytes → different outcomes", async () => {
    const request = makeExecutionRequest({
      providerId: "aise-demo-reconstruction",
      evidenceContentIds: [DEMO_IDS[0]!],
      requestedRepresentations: ["mesh"],
      declaredInputModalities: ["still_image"],
    }).request;
    const original = await new DemoReconstructionProvider({
      evidenceReader: demoEvidenceReader({ [DEMO_IDS[0]!]: demoEvidenceBytes("facade-north") }),
    }).execute(request);
    const altered = await new DemoReconstructionProvider({
      evidenceReader: demoEvidenceReader({ [DEMO_IDS[0]!]: demoEvidenceBytes("facade-east") }),
    }).execute(request);
    expect(canonicalJsonStringify(original)).not.toBe(canonicalJsonStringify(altered));
  });

  test("without a reader the content-id mode is deterministic too (content ids are content digests)", async () => {
    const request = makeExecutionRequest({
      providerId: "aise-demo-reconstruction",
      evidenceContentIds: DEMO_IDS,
      requestedRepresentations: ["mesh"],
      declaredInputModalities: ["still_image"],
    }).request;
    const first = await new DemoReconstructionProvider().execute(request);
    const second = await new DemoReconstructionProvider().execute(request);
    expect(canonicalJsonStringify(first)).toBe(canonicalJsonStringify(second));
  });

  test("different evidence yields different demo output (the derivation is keyed by the evidence)", async () => {
    const provider = new DemoReconstructionProvider();
    const fewer = makeExecutionRequest({
      providerId: "aise-demo-reconstruction",
      evidenceContentIds: DEMO_IDS.slice(0, 2),
      requestedRepresentations: ["mesh"],
      declaredInputModalities: ["still_image"],
    }).request;
    const all = makeExecutionRequest({
      providerId: "aise-demo-reconstruction",
      evidenceContentIds: DEMO_IDS,
      requestedRepresentations: ["mesh"],
      declaredInputModalities: ["still_image"],
    }).request;
    const fewerOutcome = await provider.execute(fewer);
    const allOutcome = await provider.execute(all);
    expect(canonicalJsonStringify(fewerOutcome)).not.toBe(canonicalJsonStringify(allOutcome));
  });
});

/* ------------------------------------------------------------------ */
/* Demo execution through the neutral gateway (free path, end to end)   */
/* ------------------------------------------------------------------ */

describe("demo path through the provider-neutral gateway", () => {
  test("submit → collect returns GENERATED_COMPLETION-labeled artifacts with zero paid compute", async () => {
    const provider = new DemoReconstructionProvider({
      evidenceReader: demoEvidenceReader(fixtureEntries()),
    });
    const { gateway } = makeGateway({ providers: [provider] });
    const record = await gateway.submit(demoExecutionRequest("demo-key-0001"));
    expect(record.status).toBe("succeeded");
    const outcome = await gateway.collect(record.executionId);
    expect(outcome.kind).toBe("succeeded");
    if (outcome.kind !== "succeeded") {
      return;
    }
    expect(outcome.artifacts.length).toBe(1);
    for (const region of outcome.artifacts[0]!.regions ?? []) {
      expect(region.epistemicLabel).toBe(GENERATED_COMPLETION_LABEL);
    }
    expect(outcome.provenance.providerId).toBe("aise-demo-reconstruction");
  });

  test("two fresh gateways over the same demo evidence produce byte-identical records and outcomes", async () => {
    const run = async (requestKey: string) => {
      const provider = new DemoReconstructionProvider({
        evidenceReader: demoEvidenceReader(fixtureEntries()),
      });
      const { gateway } = makeGateway({ providers: [provider] });
      const record = await gateway.submit(demoExecutionRequest(requestKey));
      const outcome = await gateway.collect(record.executionId);
      return { record, outcome };
    };
    // Same request key on both runs → byte-identical records and outcomes.
    const first = await run("demo-key-0002");
    const second = await run("demo-key-0002");
    expect(canonicalJsonStringify(first.record)).toBe(canonicalJsonStringify(second.record));
    expect(canonicalJsonStringify(first.outcome)).toBe(canonicalJsonStringify(second.outcome));
  });
});
