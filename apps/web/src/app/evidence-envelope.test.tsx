/**
 * PROD-034 — the EVIDENCE ENVELOPE explainability tests (issue #9 gap 3).
 *
 * The task-first.test.tsx discipline: static renders of pure projections.
 * Every envelope section is pinned — recorded content verbatim AND the
 * explicit not-recorded lines — plus the wiring at the consequential
 * decision points (the case decision on the Engineering Case surface, the
 * readiness decision on the task-first panel) and the calm/compact
 * discipline (a user explanation, never a debug console).
 */

import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import {
  EvidenceEnvelopeCard,
  caseEvidenceEnvelopeFromDetail,
  caseEvidenceEnvelopeFromPane,
  readinessEvidenceEnvelope,
} from "./evidence-envelope";
import { TaskFlowPanelBody, ReadinessEnvelopeCard } from "./task-first";
import { CaseBody } from "./surfaces/EngineeringCase";
import { taskFlowView } from "./task-flow";
import {
  DEMO_TASK_PROJECT_ID,
  demoTaskFlowBundle,
} from "./task-dataset";
import { DEMO_PROJECT_ID, demoCase, demoEvidenceList, demoScenario } from "./demo";
import type { CaseDetailRecord } from "./api";
import type { TaskFlowResourceData } from "./task-first";

/* A live case detail record (the /v1/cases/:id shape, mirrored). */
const CASE_DETAIL: CaseDetailRecord = {
  caseId: "case-91ab",
  title: "Level 2 masonry cracking — diagnosis pending reference dimensions",
  status: "under-review",
  observations: [
    {
      nodeId: "node-wall-2n",
      observedAt: "2026-01-14T09:00:00.000Z",
      evidenceIds: ["f08d256aa75518620f5814c1ab6639876b8d3dc50028bc567ba3c4c39c225712"],
      note: "Stepped cracking pattern observed on the level 2 north wall",
    },
    {
      nodeId: "node-wall-2e",
      observedAt: "2026-01-14T09:10:00.000Z",
      evidenceIds: [],
      note: "Hairline cracks at the east wall base",
    },
  ],
  hypotheses: [
    {
      statement: "Thermal movement differential between the 1998 extension and the original structure",
      status: "supported",
      supportedByEvidenceIds: ["f08d256aa75518620f5814c1ab6639876b8d3dc50028bc567ba3c4c39c225712"],
    },
    {
      statement: "Settlement of the east foundation",
      status: "unverified",
      supportedByEvidenceIds: [],
    },
  ],
  missingEvidence: [
    {
      description: "Calibrated reference dimension for the cracked masonry area",
      status: "open",
    },
  ],
};

const bundle = demoTaskFlowBundle();
const taskData: TaskFlowResourceData = {
  mode: "demo",
  projectId: DEMO_TASK_PROJECT_ID,
  view: taskFlowView(bundle, DEMO_TASK_PROJECT_ID),
  bundle,
};

describe("PROD-034 gap 3 — the case decision's envelope (live detail record)", () => {
  const envelope = caseEvidenceEnvelopeFromDetail(CASE_DETAIL);

  test("composes the sections from the record's separate fact/inference arrays", () => {
    expect(envelope.subjectRef).toBe("case-91ab");
    expect(envelope.question?.text).toBe(CASE_DETAIL.title);
    // Facts = observations (with their evidence basis), never hypotheses.
    expect(envelope.facts).toHaveLength(2);
    expect(envelope.facts[0]!.text).toContain("Stepped cracking pattern");
    expect(envelope.facts[0]!.basis).toContain("observation supported by");
    expect(envelope.facts[1]!.basis).toContain("no evidence id recorded");
    // Assumptions = hypotheses, labeled with support honesty.
    expect(envelope.assumptions).toHaveLength(2);
    expect(envelope.assumptions[0]!.text).toContain("Thermal movement differential");
    expect(envelope.assumptions[1]!.basis).toContain("no supporting evidence recorded");
    // Unknowns = the declared missing evidence, with status.
    expect(envelope.unknowns).toHaveLength(1);
    expect(envelope.unknowns[0]!.text).toContain("Calibrated reference dimension");
    expect(envelope.unknowns[0]!.text).toContain("open");
    // Evidence = the union of cited ids.
    expect(envelope.evidence).toHaveLength(1);
    expect(envelope.result?.status).toBe("under-review");
  });

  test("the card renders every section with content and the honest absences", () => {
    const html = renderToStaticMarkup(
      <EvidenceEnvelopeCard view={envelope} mode="api" title="What is this case based on?" />,
    );
    expect(html).toContain("What is this case based on?");
    expect(html).toContain("Stepped cracking pattern");
    expect(html).toContain("Thermal movement differential");
    expect(html).toContain("Calibrated reference dimension");
    expect(html).toContain("f08d…5712");
    // The honest absences are EXPLICIT — never hidden, never ±0.
    expect(html).toContain("No measurement uncertainty recorded on this record");
    expect(html).toContain("never ±0");
    expect(html).toContain("No deterministic checks recorded on this record");
  });

  test("the result status renders verbatim — an in-review case is never upgraded", () => {
    const html = renderToStaticMarkup(
      <EvidenceEnvelopeCard view={envelope} mode="api" />,
    );
    expect(html).toContain('data-envelope-status="under-review"');
    // The record's OWN status inside the tag — not an epistemic upgrade
    // (an in-review case is never rendered CONFIRMED/OBSERVED).
    expect(html).toContain('<span class="tag">under-review</span>');
    expect(html).not.toContain("epistemic-confirmed");
    expect(html).not.toContain("epistemic-observed");
  });
});

describe("PROD-034 gap 3 — the case decision's envelope (demo pane view)", () => {
  test("the recorded counts + evidence ids render with the server-side honesty", () => {
    const caseView = demoCase(DEMO_PROJECT_ID)!;
    const envelope = caseEvidenceEnvelopeFromPane(caseView);
    expect(envelope.subjectRef).toBe(caseView.caseId);
    expect(envelope.question?.text).toBe(caseView.title.value);
    expect(envelope.evidence).toHaveLength(2);
    expect(envelope.facts[0]!.text).toContain("3 observations");
    expect(envelope.facts[0]!.basis).toContain("server-side");
    expect(envelope.assumptions[0]!.text).toContain("2 hypotheses");
    expect(envelope.assumptions[0]!.text).toContain("never facts");
    expect(envelope.unknowns[0]!.text).toContain("1 declared missing evidence");
    expect(envelope.result?.status).toBe("in-review");

    const html = renderToStaticMarkup(
      <EvidenceEnvelopeCard view={envelope} mode="demo" />,
    );
    expect(html).toContain("Fire rating discrepancy");
    expect(html).toContain("3 observations");
    expect(html).toContain("the observation records themselves are server-side");
  });
});

describe("PROD-034 gap 3 — the readiness decision's envelope (task-flow bundle)", () => {
  test("composes the readiness verdict, evidence, declared gaps and the next action", () => {
    const envelope = readinessEvidenceEnvelope(bundle)!;
    expect(envelope.subjectLabel).toBe("readiness decision");
    expect(envelope.evidence).toHaveLength(3);
    expect(envelope.facts[0]!.text).toContain("218 objects");
    expect(envelope.unknowns).toHaveLength(2);
    expect(envelope.unknowns[0]!.text).toContain("MISSING");
    expect(envelope.unknowns[0]!.text).toContain("No calibrated reference dimension");
    expect(envelope.result?.status).toBe("partial");
    expect(envelope.result?.claim).toContain("Level 2 masonry reconstruction is task-ready");
    expect(envelope.nextAction?.text).toContain("Depth capture cannot start");
    expect(envelope.nextAction?.basis).toContain("action-8ba2");
  });

  test("the card renders the readiness verdict with every section explicit", () => {
    const envelope = readinessEvidenceEnvelope(bundle)!;
    const html = renderToStaticMarkup(
      <EvidenceEnvelopeCard view={envelope} mode="demo" title="Why this readiness verdict?" />,
    );
    expect(html).toContain("Why this readiness verdict?");
    expect(html).toContain("readiness decision");
    expect(html).toContain("partial");
    expect(html).toContain("task-ready for crack documentation");
    expect(html).toContain("MISSING — No calibrated reference dimension");
    expect(html).toContain("WEAK — The single oblique photo");
    expect(html).toContain("Depth capture cannot start");
    expect(html).toContain("No inferred assumptions recorded on this record");
    expect(html).toContain("No measurement uncertainty recorded on this record");
    expect(html).toContain("No deterministic checks recorded on this record");
  });

  test("a bundle with no reality summary composes to null (the honest empty)", () => {
    expect(readinessEvidenceEnvelope({ ...bundle, reality: null })).toBeNull();
  });
});

describe("PROD-034 gap 3 — the wiring at the consequential decision points", () => {
  test("the task-first panel renders the readiness envelope card", () => {
    const html = renderToStaticMarkup(<TaskFlowPanelBody data={taskData} />);
    expect(html).toContain("Why this readiness verdict?");
    expect(html).toContain("task-ready for crack documentation");
  });

  test("the ReadinessEnvelopeCard renders null for a bundle-less project (no invention)", () => {
    const html = renderToStaticMarkup(
      <ReadinessEnvelopeCard
        data={{ mode: "demo", projectId: "other", view: null, bundle: null }}
      />,
    );
    expect(html).toBe("");
  });

  test("the Engineering Case surface renders the case envelope (demo world)", () => {
    const html = renderToStaticMarkup(
      <CaseBody
        data={{
          mode: "demo",
          projectId: DEMO_PROJECT_ID,
          demo: {
            caseView: demoCase(DEMO_PROJECT_ID),
            evidence: demoEvidenceList(DEMO_PROJECT_ID),
            scenario: demoScenario(DEMO_PROJECT_ID),
          },
          live: null,
        }}
      />,
    );
    expect(html).toContain("What is this case based on?");
    expect(html).toContain("Fire rating discrepancy");
    expect(html).toContain("3 observations");
  });
});

describe("PROD-034 gap 3 — calm and compact, never a debug console", () => {
  test("the card carries no raw JSON dump and no contract-version noise", () => {
    const envelope = readinessEvidenceEnvelope(bundle)!;
    const html = renderToStaticMarkup(
      <EvidenceEnvelopeCard view={envelope} mode="demo" />,
    );
    expect(html).not.toContain("contractVersion");
    expect(html).not.toContain("JSON");
    expect(html).not.toContain("{");
    expect(html).not.toContain("&quot;");
  });
});
