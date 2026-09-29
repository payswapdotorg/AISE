/**
 * POST-008 — the element_addition target-semantics defect's targeted
 * assertions (the app's established static-render convention:
 * renderToStaticMarkup projections of pure components with hand-constructed
 * fixtures — no network, no clock, no randomness).
 *
 * DEFECT (live-reproduced 2026-09-29, scenario-cfrp-repro): the append-step
 * panel offered the CURRENT STATE'S EXISTING node ids as the target for
 * EVERY step kind — but `element_addition`'s wire `targetNodeId` is the NEW
 * node's identity (backend/api projection: "an element_addition target must
 * NOT already exist, live or tombstoned" → typed `duplicate_node_ref` 422).
 * Any picked existing id was a guaranteed 422.
 *
 * The fix's three layers, each asserted here:
 *  1. the pure panel-level collision check (`appendStepTargetDefects`) with
 *     the same wording family as the server's rejection;
 *  2. the wire mapping (`appendStepRequestBody`) keeps carrying the draft's
 *     targetNodeId VERBATIM as the new node's identity — the backend contract
 *     is untouched;
 *  3. the per-kind target control (`StepTargetPicker`): element_addition
 *     renders a "New node id" free-entry field and offers the state's nodes
 *     ONLY as the optional parent host; the other four kinds keep the
 *     existing-node target picker.
 */
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import {
  appendStepRequestBody,
  appendStepTargetDefects,
  type AppendStepDraft,
  type StateNodeOption,
} from "./create-forms";
import { StepTargetPicker } from "./surfaces/InterventionStudio";
import type { StepKindValue } from "./create-forms";

const EV_ID = "34867d9a0db6be51a7cbc73d62d424c61b5563c7549e914fc42881c283abe157";

const NODE_OPTIONS: readonly StateNodeOption[] = [
  { nodeId: "slab-l2", label: "slab-l2 — element" },
  { nodeId: "bldg-1", label: "bldg-1 — building" },
];

function renderPicker(kind: StepKindValue, nodeOptions: readonly StateNodeOption[] = NODE_OPTIONS): string {
  return renderToStaticMarkup(
    <StepTargetPicker
      kind={kind}
      targetNodeId=""
      nodeOptions={nodeOptions}
      stateIndex={0}
      onTargetChange={() => {}}
      onParentChange={() => {}}
    />,
  );
}

describe("POST-008 appendStepTargetDefects (the client-side duplicate_node_ref pre-check)", () => {
  test("element_addition with an id that is LIVE in the current state is one typed defect", () => {
    const defects = appendStepTargetDefects("element_addition", "slab-l2", ["slab-l2", "bldg-1"]);
    expect(defects.length).toBe(1);
    const defect = defects[0];
    if (defect === undefined) {
      throw new Error("unreachable: exactly one defect expected");
    }
    expect(defect.includes("duplicate_node_ref")).toBe(true);
    expect(defect.includes("NEW node")).toBe(true);
  });

  test("element_addition with a fresh id passes (the new node's identity)", () => {
    expect(appendStepTargetDefects("element_addition", "cfrp-band-1", ["slab-l2", "bldg-1"]).length).toBe(0);
  });

  test("an empty target stays deferred to the draft validator (no double rejection)", () => {
    expect(appendStepTargetDefects("element_addition", "  ", ["slab-l2"]).length).toBe(0);
  });

  test("the other four kinds target an EXISTING node — a live id is valid, never a defect", () => {
    for (const kind of ["property_change", "element_modification", "proposed_removal", "note"] as const) {
      expect(appendStepTargetDefects(kind, "slab-l2", ["slab-l2"]).length).toBe(0);
    }
  });
});

describe("POST-008 appendStepRequestBody element_addition (the wire contract is untouched)", () => {
  test("the draft's targetNodeId lands VERBATIM as the new node's identity, node payload intact", () => {
    const draft: AppendStepDraft = {
      kind: "element_addition",
      targetNodeId: "cfrp-band-1",
      propertyLines: "length = 24 m",
      nodeKind: "element",
      provenanceEvidenceIds: [EV_ID],
    };
    const result = appendStepRequestBody(draft);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("unreachable");
    }
    expect(result.body.kind).toBe("element_addition");
    if (result.body.kind !== "element_addition") {
      throw new Error("unreachable");
    }
    expect(result.body.targetNodeId).toBe("cfrp-band-1");
    expect(result.body.node.kind).toBe("element");
    expect(result.body.node.properties.length).toBe(1);
    expect(result.body.node.properties[0]).toEqual({ key: "length", value: 24, unit: "m" });
    expect("parentNodeId" in result.body).toBe(false);
    expect(result.body.provenance.evidenceIds).toEqual([EV_ID]);
  });

  test("an optional parent host is carried when provided", () => {
    const draft: AppendStepDraft = {
      kind: "element_addition",
      targetNodeId: "cfrp-band-1",
      nodeKind: "element",
      parentNodeId: "bldg-1",
      provenanceEvidenceIds: [EV_ID],
    };
    const result = appendStepRequestBody(draft);
    expect(result.ok).toBe(true);
    if (!result.ok || result.body.kind !== "element_addition") {
      throw new Error("unreachable");
    }
    expect(result.body.parentNodeId).toBe("bldg-1");
  });
});

describe("POST-008 StepTargetPicker (per-kind target semantics)", () => {
  test("element_addition: a NEW-node-id field; the state's nodes are offered only as the parent host", () => {
    const markup = renderPicker("element_addition");
    expect(markup.includes("New node id")).toBe(true);
    expect(markup.includes('data-picker="parent-node"')).toBe(true);
    expect(markup.includes("Host under")).toBe(true);
    expect(markup.includes("duplicate_node_ref")).toBe(true);
    expect(markup.includes('data-picker="target-node"')).toBe(false);
    expect(markup.includes("New node kind")).toBe(false);
  });

  test("property_change (and the other existing-node kinds): the target picker is unchanged", () => {
    for (const kind of ["property_change", "element_modification", "proposed_removal", "note"] as const) {
      const markup = renderPicker(kind);
      expect(markup.includes("Target node id")).toBe(true);
      expect(markup.includes('data-picker="target-node"')).toBe(true);
      expect(markup.includes("Use ")).toBe(true);
      expect(markup.includes('data-picker="parent-node"')).toBe(false);
    }
  });

  test("element_addition on a node-less state: the honest unhosted note", () => {
    const markup = renderPicker("element_addition", []);
    expect(markup.includes("unhosted")).toBe(true);
    expect(markup.includes('data-picker="parent-node"')).toBe(false);
  });
});
