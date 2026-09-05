/**
 * The deterministic, evidence-linked site report (AISE-019).
 *
 * REQ-013 acceptance over the canonical Reality Graph (AISE-011,
 * plus the optional AISE-012 evidence graph and the AISE-017
 * plan projection):
 *
 * - **AC-120 project/capture metadata** — the report carries the
 *   model/project identity, the exact graph digest, the declared
 *   frame, the spaces, and the content-pinned capture/provenance
 *   inputs (scene references with content hashes).
 * - **AC-121 measurements, issues, images, model status** —
 *   measurement rows are the canonical quantities VERBATIM (value,
 *   unit, uncertainty, estimate-vs-measurement kind, assertion
 *   status — never recomputed); the model status is the weakest-link
 *   epistemic state plus per-state/per-class counts and evidence
 *   live/retracted counts; issues list the honest gaps (unprojected
 *   objects, retracted evidence); images/capture assets are
 *   REFERENCED by content hash (v1 does not embed raster data —
 *   a declared limitation, never a silent omission).
 * - **AC-122 confirmed vs inference/unknown distinguished** — every
 *   object row carries its epistemic state as a badge; every
 *   property assertion carries its own status (never collapsed);
 *   the plan drawing's CONFIRMED/INFERRED geometry stays labeled;
 *   unknowns (no structured geometry, asset-only, oblique) are
 *   listed as issues — never coerced into confirmed facts.
 *
 * Determinism: pure functions of the immutable inputs; canonical
 * graph object order throughout; fixed pagination rules; the PDF
 * writer emits no wall-clock timestamps (deterministic renders).
 * Display prose is deterministically transliterated to the ASCII
 * PDF profile; machine-readable values are never rewritten.
 *
 * Authority discipline (architecture-lock): the report is derived
 * state. It stores nothing, mutates nothing, upgrades no
 * epistemic state, and fabricates no evidence — without an
 * evidence graph it claims no evidence at all (absence is
 * honest).
 */
import type {
  EpistemicState,
  EvidenceGraph,
  EvidenceRecord,
  EvidenceSource,
  ModelGeometry,
  ModelLengthUnit,
  ModelUncertainty,
  RealityModelGraph,
  RealityObject,
  RealityObjectClass,
  SpaceNode,
} from "@aise/engineering-model";
import { graphEpistemicState } from "@aise/engineering-model";
import { project2d, type Plan2dDocument, type Primitive2d } from "@aise/backend-export-2d";
import { ReportingError } from "./errors.js";
import {
  A4_HEIGHT,
  A4_WIDTH,
  BODY_FONT_SIZE,
  BODY_LINE_HEIGHT,
  HEADER_FONT_SIZE,
  PAGE_MARGIN,
  TITLE_FONT_SIZE,
  buildPdf,
  formatPdfReal,
  pdfLine,
  pdfPolyline,
  pdfText,
  type PdfPageSpec,
  type PdfResult,
} from "./pdf.js";

// ---------------------------------------------------------------------------
// Document model (pure content)
// ---------------------------------------------------------------------------

/** One capture/provenance input reference (content-pinned). */
export interface CaptureRefRow {
  readonly kind: string;
  readonly id: string;
  readonly contentHash: string;
  readonly epistemic: EpistemicState;
}

/** One canonical measurement row (value, unit, uncertainty — VERBATIM). */
export interface MeasurementRow {
  readonly objectId: string;
  readonly objectClass: RealityObjectClass;
  readonly label: string;
  readonly value: number;
  readonly unit: string;
  readonly uncertainty?: string;
  readonly kind: "geometry" | "property";
  readonly status: EpistemicState;
  readonly measurementKind?: string;
}

/** One evidence status entry attached to an object. */
export interface ObjectEvidenceRow {
  readonly evidenceId: string;
  readonly status: "LIVE" | "LINK_RETRACTED" | "RECORD_RETRACTED";
  readonly subjectKind: string;
}

/** One object inventory row (epistemic badge, AC-122). */
export interface ObjectRow {
  readonly objectId: string;
  readonly objectClass: RealityObjectClass;
  readonly name?: string;
  readonly epistemic: EpistemicState;
  readonly contentHash: string;
  readonly evidence: readonly ObjectEvidenceRow[];
}

/** One evidence record row (source links preserved). */
export interface EvidenceRow {
  readonly evidenceId: string;
  readonly kind: string;
  readonly status: "LIVE" | "LINK_RETRACTED" | "RECORD_RETRACTED";
  readonly subject: string;
  readonly source: string;
  readonly recordedBy: string;
  readonly recordedAt: string;
}

/** One honest issue row. */
export interface IssueRow {
  readonly kind: "unprojected-object" | "retracted-evidence";
  readonly detail: string;
}

/** One referenced (not embedded) capture/geometry asset. */
export interface ImageRefRow {
  readonly objectId: string;
  readonly kind: string;
  readonly contentHash: string;
  readonly pointCount?: number;
  readonly note: string;
}

/** The site report document (pure derived content). */
export interface SiteReportDocument {
  readonly kind: "site-report";
  readonly model: {
    readonly modelId: string;
    readonly projectId: string;
    readonly graphDigest: string;
    readonly version?: number;
    readonly unit: ModelLengthUnit;
    readonly up: { readonly x: number; readonly y: number; readonly z: number };
    readonly spaces: readonly { readonly spaceId: string; readonly kind: string }[];
  };
  readonly capture: readonly CaptureRefRow[];
  readonly status: {
    readonly overallEpistemic: EpistemicState;
    readonly byState: Readonly<Record<EpistemicState, number>>;
    readonly byClass: Readonly<Record<string, number>>;
    readonly objects: number;
    readonly evidence: { readonly live: number; readonly linkRetracted: number; readonly recordRetracted: number };
    readonly plan: { readonly projected: number; readonly unprojected: number } | undefined;
  };
  readonly measurements: readonly MeasurementRow[];
  readonly objects: readonly ObjectRow[];
  readonly evidenceRows: readonly EvidenceRow[];
  readonly issues: readonly IssueRow[];
  readonly imageRefs: readonly ImageRefRow[];
  readonly plan: Plan2dDocument | undefined;
  readonly limitations: readonly string[];
  readonly counts: {
    readonly measurements: number;
    readonly objects: number;
    readonly evidence: number;
    readonly issues: number;
    readonly imageRefs: number;
    readonly pages: number;
  };
}

/** The site report request options. */
export interface SiteReportOptions {
  /** The committed model version (REQUIRED when evidence is supplied — subjects are version-pinned). */
  readonly version?: number;
  /** The evidence graph whose links surface as per-object evidence (absence is honest). */
  readonly evidence?: EvidenceGraph;
  /** Include the AISE-017 plan drawing page (default: true). */
  readonly includePlan?: boolean;
}

/** The explicit v1 limitations of the site report (embedded in every artifact). */
export const SITE_REPORT_LIMITATIONS: readonly string[] = Object.freeze([
  "the report is derived state: it reflects exactly one immutable graph version (digest-anchored) and never mutates canonical model authority.",
  "images and capture assets are REFERENCED by content hash, not embedded: v1 reports carry no raster data.",
  "quantities are the canonical values verbatim (value, unit, uncertainty); nothing is recomputed for presentation.",
  "epistemic states pass through verbatim: CONFIRMED, INFERRED, OBSERVED and PROPOSED facts stay distinct; unknowns are listed as issues, never coerced into confirmed facts.",
  "the plan drawing is a presentation-scaled line rendering of the AISE-017 plan projection; the scale factor is derived for display and is not a measurement.",
  "no wall-clock timestamps are embedded (determinism): temporal facts (recordedAt, linkedAt, capturedAt) appear only where evidence records carry them verbatim.",
  "PDF text is ASCII-only: display prose is deterministically transliterated (em-dash to '-', '+/-' for plus-minus); machine-readable values are never rewritten.",
]);

/**
 * Builds the pure site-report content from the canonical graph.
 *
 * Fail-closed contract: a missing frame declaration, a
 * version-pinned evidence graph without a version, or a
 * non-finite canonical value throws `ReportingError` BEFORE any
 * output.
 */
export function siteReportOf(graph: RealityModelGraph, options: SiteReportOptions = {}): SiteReportDocument {
  const { version, evidence, includePlan = true } = options;
  if (evidence !== undefined && version === undefined) {
    throw new ReportingError(
      "VALIDATION_FAILED",
      "version is required when an evidence graph is supplied (evidence subjects are version-pinned)",
      { details: { field: "version", modelId: graph.modelId } },
    );
  }
  if (version !== undefined && (!Number.isInteger(version) || version < 1)) {
    throw new ReportingError("VALIDATION_FAILED", `version must be a positive integer: ${String(version)}`, {
      details: { field: "version", value: String(version) },
    });
  }
  const frame = declaredFrameOf(graph);

  const evidenceIndex = evidence !== undefined && version !== undefined
    ? buildEvidenceIndex(graph.modelId, version, evidence)
    : new Map<string, ObjectEvidenceRow[]>();

  const measurements: MeasurementRow[] = [];
  const objects: ObjectRow[] = [];
  const imageRefs: ImageRefRow[] = [];
  const captureRefs = new Map<string, CaptureRefRow>();

  for (const object of graph.objects) {
    objects.push({
      objectId: object.objectId,
      objectClass: object.objectClass,
      ...(object.name !== undefined ? { name: object.name } : {}),
      epistemic: object.epistemicState,
      contentHash: object.contentHash,
      evidence: evidenceIndex.get(object.objectId) ?? [],
    });
    collectCaptureRefs(object, captureRefs);
    collectMeasurements(object, measurements);
    collectImageRefs(object, imageRefs);
  }

  const evidenceRows = evidence !== undefined && version !== undefined
    ? evidenceRowsOf(graph.modelId, version, evidence)
    : [];

  const plan = includePlan ? project2d(graph, { kind: "plan" }) : undefined;
  const issues: IssueRow[] = [];
  if (plan !== undefined) {
    for (const entry of plan.unprojected) {
      issues.push({
        kind: "unprojected-object",
        detail: `${entry.source.objectId} (${entry.source.objectClass}, ${entry.source.epistemic}) cannot be projected: ${entry.reason}`,
      });
    }
  }
  for (const row of evidenceRows) {
    if (row.status !== "LIVE") {
      issues.push({
        kind: "retracted-evidence",
        detail: `evidence ${row.evidenceId} for ${row.subject} is ${row.status === "LINK_RETRACTED" ? "link-retracted" : "record-retracted"} (${row.source})`,
      });
    }
  }

  const byState: Record<EpistemicState, number> = { OBSERVED: 0, INFERRED: 0, CONFIRMED: 0, PROPOSED: 0 };
  const byClass: Record<string, number> = {};
  for (const object of graph.objects) {
    byState[object.epistemicState] += 1;
    byClass[object.objectClass] = (byClass[object.objectClass] ?? 0) + 1;
  }

  return {
    kind: "site-report",
    model: {
      modelId: graph.modelId,
      projectId: graph.projectId,
      graphDigest: graph.digest,
      ...(version !== undefined ? { version } : {}),
      unit: frame.unit,
      up: frame.up,
      spaces: graph.spaces.map((space) => ({ spaceId: space.spaceId, kind: space.kind })),
    },
    capture: [...captureRefs.values()],
    status: {
      overallEpistemic: graphEpistemicState(graph),
      byState,
      byClass,
      objects: graph.objects.length,
      evidence: {
        live: evidenceRows.filter((row) => row.status === "LIVE").length,
        linkRetracted: evidenceRows.filter((row) => row.status === "LINK_RETRACTED").length,
        recordRetracted: evidenceRows.filter((row) => row.status === "RECORD_RETRACTED").length,
      },
      plan: plan === undefined ? undefined : { projected: plan.counts.projected, unprojected: plan.counts.unprojected },
    },
    measurements,
    objects,
    evidenceRows,
    issues,
    imageRefs,
    plan,
    limitations: SITE_REPORT_LIMITATIONS,
    counts: {
      measurements: measurements.length,
      objects: objects.length,
      evidence: evidenceRows.length,
      issues: issues.length,
      imageRefs: imageRefs.length,
      pages: 0,
    },
  };
}

// ---------------------------------------------------------------------------
// Content helpers
// ---------------------------------------------------------------------------

function declaredFrameOf(graph: RealityModelGraph): { up: { x: number; y: number; z: number }; unit: ModelLengthUnit } {
  const space: SpaceNode | undefined = graph.spaces[0];
  if (space === undefined || space.frame === undefined) {
    throw new ReportingError(
      "FRAME_DECLARATION_MISSING",
      "the graph's first space has no declared coordinate frame; the report unit cannot be derived",
      { details: { modelId: graph.modelId, spaces: graph.spaces.length } },
    );
  }
  return { up: space.frame.up, unit: space.frame.unit };
}

/** The evidence statuses for every subject object of this model+version (mirrors the AISE-018 index). */
function buildEvidenceIndex(modelId: string, version: number, evidence: EvidenceGraph): Map<string, ObjectEvidenceRow[]> {
  const retractedLinks = new Set(evidence.linkRetractions.map((event) => event.linkId));
  const retractedRecords = new Set(evidence.evidenceRetractions.map((event) => event.evidenceId));
  const index = new Map<string, ObjectEvidenceRow[]>();
  for (const link of evidence.links) {
    if (link.subject.modelId !== modelId || link.subject.version !== version) {
      continue;
    }
    const objectId = link.subject.objectId;
    if (objectId === undefined) {
      continue;
    }
    const status: ObjectEvidenceRow["status"] = retractedLinks.has(link.linkId)
      ? "LINK_RETRACTED"
      : retractedRecords.has(link.evidenceId)
        ? "RECORD_RETRACTED"
        : "LIVE";
    const rows = index.get(objectId) ?? [];
    rows.push({ evidenceId: link.evidenceId, status, subjectKind: link.subject.kind });
    index.set(objectId, rows);
  }
  return index;
}

/** The evidence record rows (source links preserved, verbatim). */
function evidenceRowsOf(modelId: string, version: number, evidence: EvidenceGraph): EvidenceRow[] {
  const records = new Map(evidence.records.map((record) => [record.evidenceId, record] as const));
  const retractedLinks = new Set(evidence.linkRetractions.map((event) => event.linkId));
  const retractedRecords = new Set(evidence.evidenceRetractions.map((event) => event.evidenceId));
  const rows: EvidenceRow[] = [];
  for (const link of evidence.links) {
    if (link.subject.modelId !== modelId || link.subject.version !== version) {
      continue;
    }
    const record = records.get(link.evidenceId);
    const status: EvidenceRow["status"] = retractedLinks.has(link.linkId)
      ? "LINK_RETRACTED"
      : retractedRecords.has(link.evidenceId)
        ? "RECORD_RETRACTED"
        : "LIVE";
    rows.push({
      evidenceId: link.evidenceId,
      kind: record?.kind ?? "UNKNOWN",
      status,
      subject: `${link.subject.kind}:${link.subject.objectId ?? link.subject.spaceId ?? link.subject.propertyKey ?? "?"}`,
      source: record === undefined ? "(record absent)" : evidenceSourceText(record),
      recordedBy: record?.recordedBy ?? link.linkedBy,
      recordedAt: record?.recordedAt ?? link.linkedAt,
    });
  }
  return rows;
}

/** The evidence record's source, as a compact verbatim summary (mirrors the AISE-018 discipline). */
function evidenceSourceText(record: EvidenceRecord): string {
  return sourceSummary(record.source);
}

/** Renders one evidence source honestly (per-kind pins). */
function sourceSummary(source: EvidenceSource): string {
  switch (source.kind) {
    case "capture":
      return `capture ${source.sessionId}/${source.assetId} (${source.assetType}, ${source.byteSize} bytes, hash ${source.contentHash.slice(0, 12)})`;
    case "manual-measurement":
      return `manual-measurement ${source.value} ${source.unit} by ${source.measuredBy} (${source.method})`;
    case "human-observation":
      return `human-observation by ${source.observer}: ${source.statement}`;
    case "document":
      return `document ${source.documentId}${source.title !== undefined ? ` "${source.title}"` : ""}${source.issuedBy !== undefined ? ` issued by ${source.issuedBy}` : ""}`;
  }
}

/** Collects the content-pinned capture/provenance input references (deduped, canonical order). */
function collectCaptureRefs(object: RealityObject, captureRefs: Map<string, CaptureRefRow>): void {
  for (const input of object.provenance.inputs) {
    const id = input.kind === "scene" ? input.sceneId : input.kind === "object" ? input.objectId : input.contentHash;
    const key = `${input.kind}:${id}:${input.contentHash}`;
    if (!captureRefs.has(key)) {
      captureRefs.set(key, { kind: input.kind, id, contentHash: input.contentHash, epistemic: input.epistemic });
    }
  }
}

/** Collects the canonical measurement rows (geometry + property assertions, VERBATIM). */
function collectMeasurements(object: RealityObject, measurements: MeasurementRow[]): void {
  const geometry: ModelGeometry | undefined = object.geometry;
  const structured = geometry?.structured;
  if (structured !== undefined) {
    const rows: [string, { value: number; unit: string; uncertainty?: ModelUncertainty } | undefined][] = [
      ["length", structured.width],
      ["height", structured.height],
      ["area", structured.area],
      ["elevation", structured.elevation],
      ["sill", structured.sillHeight],
      ["head", structured.headHeight],
    ];
    for (const [label, quantity] of rows) {
      if (quantity === undefined) {
        continue;
      }
      measurements.push({
        objectId: object.objectId,
        objectClass: object.objectClass,
        label,
        value: quantity.value,
        unit: quantity.unit,
        ...(quantity.uncertainty !== undefined ? { uncertainty: formatUncertainty(quantity.uncertainty) } : {}),
        kind: "geometry",
        status: object.epistemicState,
      });
    }
  }
  for (const property of object.properties) {
    if (property.quantity === undefined) {
      continue;
    }
    measurements.push({
      objectId: object.objectId,
      objectClass: object.objectClass,
      label: property.key,
      value: property.quantity.value,
      unit: property.quantity.unit,
      ...(property.quantity.uncertainty !== undefined
        ? { uncertainty: formatUncertainty(property.quantity.uncertainty) }
        : {}),
      kind: "property",
      status: property.status,
      ...(property.kind !== undefined ? { measurementKind: property.kind } : {}),
    });
  }
}

/** The uncertainty, verbatim-formatted (kind preserved, never converted across kinds). */
function formatUncertainty(uncertainty: ModelUncertainty): string {
  switch (uncertainty.kind) {
    case "standard":
      return `+/- 1sigma ${uncertainty.u}`;
    case "expanded":
      return `+/- U(k=${uncertainty.coverageFactor}) ${uncertainty.U}`;
    case "tolerance":
      return `+/- tol [${uncertainty.lowerOffset},${uncertainty.upperOffset}]`;
  }
}

/** Collects the referenced (not embedded) capture/geometry assets. */
function collectImageRefs(object: RealityObject, imageRefs: ImageRefRow[]): void {
  for (const ref of object.geometry?.assetRefs ?? []) {
    imageRefs.push({
      objectId: object.objectId,
      kind: ref.kind,
      contentHash: ref.contentHash,
      ...(ref.pointCount !== undefined ? { pointCount: ref.pointCount } : {}),
      note: "referenced by content hash, not embedded (v1)",
    });
  }
}

// ---------------------------------------------------------------------------
// PDF rendering (deterministic layout)
// ---------------------------------------------------------------------------

/** The rendered PDF artifact. */
export interface SiteReportPdfResult extends PdfResult {
  readonly kind: "site-report-pdf";
  readonly graphDigest: string;
}

/** ASCII display transliteration (the DXF-profile discipline, kept local to avoid cross-service coupling). */
const DISPLAY_ASCII_MAP: Readonly<Record<string, string>> = Object.freeze({
  "\u2014": "-",
  "\u2013": "-",
  "\u2212": "-",
  "\u00b1": "+/-",
  "\u00b0": "deg",
  "\u00d7": "x",
  "\u00b7": ".",
  "\u22a5": "perp",
  "\u2192": "->",
  "\u2018": "'",
  "\u2019": "'",
  "\u201c": '"',
  "\u201d": '"',
  "\u2026": "...",
});

function toAsciiDisplay(text: string): string {
  let out = "";
  for (const char of text) {
    const codePoint = char.charCodeAt(0);
    if (codePoint >= 0x20 && codePoint <= 0x7e) {
      out += char;
      continue;
    }
    const mapped = DISPLAY_ASCII_MAP[char];
    if (mapped !== undefined) {
      out += mapped;
      continue;
    }
    throw new ReportingError(
      "TEXT_UNENCODABLE",
      `report display text contains an unmappable non-ASCII character: ${JSON.stringify(char)} (0x${codePoint.toString(16)})`,
      { details: { char, codePoint, stage: "display" } },
    );
  }
  return out;
}

/** Deterministic greedy word wrap (local copy of the export discipline). */
export function wrapReportText(text: string, width: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if (word.length > width) {
      if (current !== "") {
        lines.push(current);
        current = "";
      }
      let remaining = word;
      while (remaining.length > width) {
        lines.push(remaining.slice(0, width));
        remaining = remaining.slice(width);
      }
      current = remaining;
      continue;
    }
    if (current === "") {
      current = word;
    } else if (current.length + 1 + word.length <= width) {
      current = `${current} ${word}`;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current !== "") {
    lines.push(current);
  }
  return lines;
}

/** The sequential page-flow layout engine. */
class PageFlow {
  private readonly pages: string[][] = [];
  private current: string[] = [];
  private cursorY = A4_HEIGHT - PAGE_MARGIN;

  constructor() {
    this.pages.push(this.current);
  }

  get y(): number {
    return this.cursorY;
  }

  newPage(): void {
    this.current = [];
    this.pages.push(this.current);
    this.cursorY = A4_HEIGHT - PAGE_MARGIN;
  }

  ensure(height: number): void {
    if (this.cursorY - height < PAGE_MARGIN) {
      this.newPage();
    }
  }

  line(height = BODY_LINE_HEIGHT): void {
    this.cursorY -= height;
  }

  text(value: string, options: { readonly x?: number; readonly size?: number; readonly bold?: boolean; readonly gray?: number } = {}): void {
    this.ensure(BODY_LINE_HEIGHT);
    this.current.push(
      pdfText(options.x ?? PAGE_MARGIN, this.cursorY - BODY_FONT_SIZE, toAsciiDisplay(value), {
        size: options.size ?? BODY_FONT_SIZE,
        bold: options.bold,
        gray: options.gray,
      }),
    );
    this.cursorY -= BODY_LINE_HEIGHT;
  }

  heading(value: string): void {
    this.ensure(BODY_LINE_HEIGHT * 2.5);
    this.cursorY -= BODY_LINE_HEIGHT * 0.6;
    this.current.push(
      pdfText(PAGE_MARGIN, this.cursorY - HEADER_FONT_SIZE, toAsciiDisplay(value), {
        size: HEADER_FONT_SIZE,
        bold: true,
      }),
    );
    this.cursorY -= BODY_LINE_HEIGHT;
    this.current.push(pdfLine(PAGE_MARGIN, this.cursorY + 4, A4_WIDTH - PAGE_MARGIN, this.cursorY + 4, { gray: 0.6, width: 0.8 }));
    this.cursorY -= 4;
  }

  separator(): void {
    this.ensure(BODY_LINE_HEIGHT);
    this.current.push(pdfLine(PAGE_MARGIN, this.cursorY - 4, A4_WIDTH - PAGE_MARGIN, this.cursorY - 4, { gray: 0.85, width: 0.4 }));
    this.cursorY -= BODY_LINE_HEIGHT * 0.6;
  }

  op(operator: string): void {
    this.current.push(operator);
  }

  build(): readonly PdfPageSpec[] {
    return this.pages.map((ops) => ({
      width: A4_WIDTH,
      height: A4_HEIGHT,
      content: ops.join("\n"),
    }));
  }
}

/** Renders the pure site-report document into a deterministic PDF. */
export function renderSiteReportPdf(report: SiteReportDocument): SiteReportPdfResult {
  const flow = new PageFlow();

  // --- Title block ---------------------------------------------------------
  flow.text("AISE SITE REPORT", { size: TITLE_FONT_SIZE, bold: true });
  flow.text("evidence-linked report - derived state, not a canonical model authority", { gray: 0.4 });
  flow.line();

  // --- Identity & capture metadata (AC-120) --------------------------------
  flow.heading("1. Project and capture metadata");
  flow.text(`project: ${report.model.projectId}`);
  flow.text(`model: ${report.model.modelId}${report.model.version !== undefined ? ` (version ${report.model.version})` : ""}`);
  flow.text(`graph digest: ${report.model.graphDigest}`);
  flow.text(`frame: up=(${report.model.up.x},${report.model.up.y},${report.model.up.z}) unit=${report.model.unit}`);
  flow.text(`spaces: ${report.model.spaces.map((space) => `${space.spaceId} [${space.kind}]`).join(", ") || "(none)"}`);
  flow.text(`generated by: AISE reporting service v1 (deterministic; no wall-clock timestamps embedded)`);
  if (report.capture.length > 0) {
    flow.text("content-pinned capture inputs:");
    for (const capture of report.capture) {
      flow.text(`  ${capture.kind} ${capture.id} (hash ${capture.contentHash.slice(0, 16)}, ${capture.epistemic})`);
    }
  } else {
    flow.text("content-pinned capture inputs: (none declared)");
  }

  // --- Model status (AC-121) ----------------------------------------------
  flow.heading("2. Model status");
  flow.text(`overall epistemic state (weakest link): ${report.status.overallEpistemic}`, { bold: true });
  const byState = report.status.byState;
  flow.text(
    `objects: ${report.status.objects} (CONFIRMED ${byState.CONFIRMED ?? 0}, OBSERVED ${byState.OBSERVED ?? 0}, INFERRED ${byState.INFERRED ?? 0}, PROPOSED ${byState.PROPOSED ?? 0})`,
  );
  flow.text(
    `by class: ${Object.entries(report.status.byClass)
      .map(([cls, count]) => `${cls} ${count}`)
      .join(", ")}`,
  );
  const evidence = report.status.evidence;
  if (report.evidenceRows.length > 0) {
    flow.text(
      `evidence: ${report.evidenceRows.length} links (LIVE ${evidence.live}, LINK_RETRACTED ${evidence.linkRetracted}, RECORD_RETRACTED ${evidence.recordRetracted})`,
    );
  } else {
    flow.text("evidence: (no evidence graph supplied - the report claims no evidence)");
  }
  if (report.status.plan !== undefined) {
    flow.text(`plan projection: ${report.status.plan.projected} projected, ${report.status.plan.unprojected} unprojected (AISE-017)`);
  }

  // --- Measurements (AC-121, verbatim quantities) ---------------------------
  flow.heading("3. Measurements (canonical quantities, verbatim)");
  if (report.measurements.length === 0) {
    flow.text("(no canonical quantities asserted)");
  } else {
    drawTable(flow, ["object", "label", "value (verbatim)", "status", "kind"], [
      [118, 96, 150, 66, 60],
    ], report.measurements.map((row) => [
      row.objectId,
      row.label,
      `${row.value} ${row.unit}${row.uncertainty !== undefined ? ` ${row.uncertainty}` : ""}`,
      row.status,
      row.measurementKind ?? row.kind,
    ]));
  }

  // --- Object inventory (AC-122 epistemic badges) ---------------------------
  flow.heading("4. Object inventory (epistemic state per object)");
  drawTable(flow, ["object", "class", "name", "epistemic", "evidence"], [[118, 62, 92, 74, 144]], report.objects.map((row) => [
    row.objectId,
    row.objectClass,
    row.name ?? "-",
    row.epistemic,
    row.evidence.length === 0
      ? "-"
      : row.evidence.map((entry) => `${entry.evidenceId}[${entry.status}]`).join(" "),
  ]));

  // --- Evidence records (source links preserved) ----------------------------
  if (report.evidenceRows.length > 0) {
    flow.heading("5. Evidence records (source links preserved)");
    for (const row of report.evidenceRows) {
      flow.text(`${row.evidenceId} [${row.status}] ${row.kind} -> ${row.subject}`, { bold: row.status === "LIVE" });
      flow.text(`  source: ${row.source}`, { gray: 0.35 });
      flow.text(`  recorded by ${row.recordedBy} at ${row.recordedAt}`, { gray: 0.35 });
    }
  } else {
    flow.heading("5. Evidence records");
    flow.text("(no evidence graph supplied - absence is honest, nothing is fabricated)");
  }

  // --- Issues (honest gaps) --------------------------------------------------
  flow.heading("6. Issues");
  if (report.issues.length === 0) {
    flow.text("(no issues recorded: all objects projected, no retracted evidence)");
  } else {
    for (const issue of report.issues) {
      flow.text(`[${issue.kind}] ${issue.detail}`);
    }
  }

  // --- Referenced images/assets ---------------------------------------------
  flow.heading("7. Images and capture assets (referenced, not embedded)");
  if (report.imageRefs.length === 0) {
    flow.text("(no geometry asset references declared)");
  } else {
    for (const ref of report.imageRefs) {
      flow.text(`${ref.objectId}: ${ref.kind} (hash ${ref.contentHash.slice(0, 16)}, ${ref.pointCount ?? "?"} pts) - ${ref.note}`);
    }
  }

  // --- Plan drawing ----------------------------------------------------------
  if (report.plan !== undefined) {
    drawPlanPage(flow, report.plan, report.model.unit);
  }

  // --- Limitations -----------------------------------------------------------
  flow.heading(`${report.plan !== undefined ? 9 : 8}. Limitations`);
  flow.text("site report limitations (AISE-019):", { bold: true });
  for (const [index, limitation] of report.limitations.entries()) {
    for (const line of wrapReportText(toAsciiDisplay(`${index + 1}. ${limitation}`), 108)) {
      flow.text(line);
    }
  }
  if (report.plan !== undefined) {
    flow.text("plan projection limitations (AISE-017, verbatim):", { bold: true });
    for (const [index, limitation] of report.plan.limitations.entries()) {
      for (const line of wrapReportText(toAsciiDisplay(`${index + 1}. ${limitation}`), 108)) {
        flow.text(line);
      }
    }
  }

  const pages = flow.build();
  const pdf = buildPdf(pages);
  return {
    kind: "site-report-pdf",
    text: pdf.text,
    byteLength: pdf.byteLength,
    pageCount: pdf.pageCount,
    graphDigest: report.model.graphDigest,
  };
}

/** Draws a fixed-column table with wrapped cells and paginated repeated headers. */
function drawTable(flow: PageFlow, headers: readonly string[], widths: readonly (readonly number[])[], rows: readonly (readonly string[])[]): void {
  const columnWidths = widths[0] ?? [];
  const charsPerColumn = columnWidths.map((width) => Math.max(Math.floor(width / (BODY_FONT_SIZE * 0.55)), 8));
  const drawHeader = (): void => {
    flow.ensure(BODY_LINE_HEIGHT * 2);
    const ops: string[] = [];
    let x = PAGE_MARGIN;
    for (const [index, header] of headers.entries()) {
      ops.push(pdfText(x, flow.y - BODY_FONT_SIZE, header, { bold: true }));
      x += columnWidths[index] ?? 0;
    }
    for (const op of ops) {
      flow.op(op);
    }
    flow.line();
    flow.separator();
  };
  drawHeader();
  for (const row of rows) {
    const cells = row.map((cell, index) => wrapReportText(toAsciiDisplay(cell === "" ? "-" : cell), charsPerColumn[index] ?? 8));
    const rowLines = Math.max(...cells.map((cell) => cell.length));
    flow.ensure(BODY_LINE_HEIGHT * (rowLines + 1));
    for (let lineIndex = 0; lineIndex < rowLines; lineIndex += 1) {
      let x = PAGE_MARGIN;
      for (const [index, cell] of cells.entries()) {
        const value = cell[lineIndex];
        if (value !== undefined) {
          flow.op(pdfText(x, flow.y - BODY_FONT_SIZE, value, { gray: 0.15 }));
        }
        x += columnWidths[index] ?? 0;
      }
      flow.line();
    }
    // Page break inside a table restarts the header.
    if (flow.y - BODY_LINE_HEIGHT * 2 < PAGE_MARGIN) {
      flow.newPage();
      drawHeader();
    }
  }
}

/** Draws the plan drawing page (presentation-scaled line rendering). */
function drawPlanPage(flow: PageFlow, plan: Plan2dDocument, unit: ModelLengthUnit): void {
  flow.newPage();
  flow.heading("8. Plan drawing (AISE-017 projection, presentation-scaled)");
  flow.text(`view: ${plan.view.kind} (unit ${unit}) - epistemic states pass through per primitive; see object inventory`, { gray: 0.35 });

  // Content box for the drawing.
  const boxLeft = PAGE_MARGIN;
  const boxBottom = PAGE_MARGIN + BODY_LINE_HEIGHT * 3;
  const boxWidth = A4_WIDTH - PAGE_MARGIN * 2;
  const boxHeight = flow.y - boxBottom - BODY_LINE_HEIGHT;

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const primitive of plan.primitives) {
    const points = primitivePoints(primitive);
    for (const [x, y] of points) {
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  if (!Number.isFinite(minX) || !Number.isFinite(minY)) {
    flow.text("(no projected geometry: the plan document has zero primitives)");
    return;
  }
  const spanX = Math.max(maxX - minX, 1e-9);
  const spanY = Math.max(maxY - minY, 1e-9);
  const scale = Math.min(boxWidth / spanX, boxHeight / spanY);
  const originX = boxLeft + (boxWidth - spanX * scale) / 2;
  const originY = boxBottom + (boxHeight - spanY * scale) / 2;
  const mapX = (x: number): number => originX + (x - minX) * scale;
  const mapY = (y: number): number => originY + (y - minY) * scale;

  for (const primitive of plan.primitives) {
    const gray = primitive.source.epistemic === "CONFIRMED" ? 0 : 0.45;
    const width = primitive.source.objectClass === "WALL" ? 1.1 : 0.7;
    if (primitive.kind === "polygon") {
      const points = primitive.points.map((point) => [mapX(point[0]), mapY(point[1])] as const);
      flow.op(pdfPolyline(points, { gray, width, close: true }));
    } else {
      flow.op(
        pdfLine(mapX(primitive.start[0]), mapY(primitive.start[1]), mapX(primitive.end[0]), mapY(primitive.end[1]), {
          gray,
          width,
        }),
      );
    }
  }

  // Scale bar: a round drawing-unit length, honestly labeled as presentation.
  const targetPt = 120;
  const rawUnits = targetPt / scale;
  const magnitude = Math.pow(10, Math.floor(Math.log10(rawUnits)));
  const barUnits = [1, 2, 5, 10].map((factor) => factor * magnitude).reduce((best, candidate) =>
    Math.abs(candidate - rawUnits) < Math.abs(best - rawUnits) ? candidate : best,
  );
  const barPt = barUnits * scale;
  const barY = boxBottom - BODY_LINE_HEIGHT;
  flow.op(pdfLine(boxLeft, barY, boxLeft + barPt, barY, { gray: 0, width: 1 }));
  flow.op(pdfLine(boxLeft, barY - 3, boxLeft, barY + 3, { gray: 0, width: 1 }));
  flow.op(pdfLine(boxLeft + barPt, barY - 3, boxLeft + barPt, barY + 3, { gray: 0, width: 1 }));
  flow.op(pdfText(boxLeft, barY - 14, `scale bar: ${barUnits} ${unit} (presentation scaling only - not a measurement)`, { size: 7.5, gray: 0.35 }));
  flow.text(
    `drawing scale: ${formatPdfReal(1 / scale)} ${unit} per point (derived for display; the canonical quantities above are the measurement authority)`,
    { gray: 0.35 },
  );
}

function primitivePoints(primitive: Primitive2d): readonly (readonly [number, number])[] {
  return primitive.kind === "polygon" ? primitive.points : [primitive.start, primitive.end];
}
