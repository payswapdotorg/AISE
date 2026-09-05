/**
 * @aise/backend-reporting — the AISE-019 deterministic
 * evidence-linked site report.
 *
 * Structured report content + PDF rendering derived from the
 * canonical Reality Graph (AISE-011), the optional evidence
 * graph (AISE-012) and the plan projection (AISE-017, the
 * declared dependency), behind a clean service boundary:
 *
 * - errors  — typed, fail-closed ReportingError (non-retryable
 *             by construction; deterministic input can never
 *             succeed on retry where it failed before)
 * - pdf     — the deterministic PDF 1.4 writer primitives
 *             (catalog/pages tree, base-14 Helvetica fonts,
 *             content streams, xref; NO timestamps; ASCII-only)
 * - report  — the pure composition: project/capture metadata
 *             (AC-120), model status + measurements + issues +
 *             referenced images (AC-121), epistemic distinction
 *             per object/assertion (AC-122), evidence records
 *             with source links preserved, the plan drawing
 *             page, and the explicit v1 limitations — rendered
 *             through a deterministic page-flow layout
 * - runtime — service composition with bounded compute
 *
 * Authority: this package is a pure consumer of the Reality
 * Graph and the evidence graph. It stores nothing, mutates
 * nothing, upgrades no epistemic state, and fabricates no
 * evidence (architecture-lock: the report is derived state).
 */
export {
  ReportingError,
  toReportingError,
  type ReportingErrorCode,
  type ReportingErrorDetails,
} from "./errors.js";
export {
  A4_HEIGHT,
  A4_WIDTH,
  BODY_FONT_SIZE,
  BODY_LINE_HEIGHT,
  HEADER_FONT_SIZE,
  PAGE_MARGIN,
  TITLE_FONT_SIZE,
  buildPdf,
  formatPdfReal,
  pdfEscape,
  pdfLine,
  pdfPolyline,
  pdfText,
  type PdfPageSpec,
  type PdfResult,
} from "./pdf.js";
export {
  siteReportOf,
  renderSiteReportPdf,
  wrapReportText,
  SITE_REPORT_LIMITATIONS,
  type SiteReportDocument,
  type SiteReportOptions,
  type SiteReportPdfResult,
  type CaptureRefRow,
  type MeasurementRow,
  type ObjectRow,
  type ObjectEvidenceRow,
  type EvidenceRow,
  type IssueRow,
  type ImageRefRow,
} from "./report.js";
export {
  buildReportingService,
  DEFAULT_MAX_GRAPH_OBJECTS,
  DEFAULT_MAX_OUTPUT_BYTES,
  type ReportingService,
  type BuildReportingServiceOptions,
} from "./runtime.js";
