/**
 * Reporting service composition (AISE-019).
 *
 * Binds the deterministic site-report composition into a
 * service object with the production discipline of the sibling
 * export services (AISE-017/AISE-018):
 *
 * - the reporting surface is the package's public pure API —
 *   the service adds NO authority of its own: it reads the
 *   canonical graph (plus the optional evidence graph), emits
 *   derived documents, stores nothing (architecture-lock);
 * - bounded compute: reports are capped at `maxGraphObjects`
 *   (default 100,000) and `maxOutputBytes` (default 64 MiB) —
 *   unbounded work is rejected fail-closed;
 * - every call is logged at debug level with the graph digest
 *   and page count (observability without payload logging).
 */
import type { AiseConfig } from "@aise/backend-config";
import type { Logger } from "@aise/backend-logging";
import type { EvidenceGraph, RealityModelGraph } from "@aise/engineering-model";
import { siteReportOf, renderSiteReportPdf, type SiteReportDocument, type SiteReportOptions, type SiteReportPdfResult } from "./report.js";
import { ReportingError } from "./errors.js";

/** Default bound on graph objects per report. */
export const DEFAULT_MAX_GRAPH_OBJECTS = 100_000;

/** Default bound on the produced PDF byte length. */
export const DEFAULT_MAX_OUTPUT_BYTES = 64 * 1024 * 1024;

/** The deterministic site-report surface of the reporting service. */
export interface ReportingService {
  /** Builds the pure report content (identity, status, measurements, evidence, plan). */
  readonly buildReport: (graph: RealityModelGraph, options?: SiteReportOptions) => SiteReportDocument;
  /** Renders one report document into a deterministic PDF. */
  readonly renderPdf: (report: SiteReportDocument) => SiteReportPdfResult;
  /** Builds and renders in one call (the composition surface). */
  readonly report: (graph: RealityModelGraph, options?: SiteReportOptions) => SiteReportPdfResult;
  readonly limits: {
    readonly maxGraphObjects: number;
    readonly maxOutputBytes: number;
  };
}

export interface BuildReportingServiceOptions {
  /** Upper bound on graph objects per report (default 100,000). */
  readonly maxGraphObjects?: number;
  /** Upper bound on the produced PDF byte length (default 64 MiB). */
  readonly maxOutputBytes?: number;
}

export function buildReportingService(
  config: AiseConfig,
  logger: Logger,
  options: BuildReportingServiceOptions = {},
): ReportingService {
  const maxGraphObjects = options.maxGraphObjects ?? DEFAULT_MAX_GRAPH_OBJECTS;
  const maxOutputBytes = options.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES;
  if (!Number.isInteger(maxGraphObjects) || maxGraphObjects < 1) {
    throw new ReportingError(
      "VALIDATION_FAILED",
      `maxGraphObjects must be a positive integer: ${String(maxGraphObjects)}`,
      { details: { maxGraphObjects: String(maxGraphObjects) } },
    );
  }
  if (!Number.isInteger(maxOutputBytes) || maxOutputBytes < 1) {
    throw new ReportingError(
      "VALIDATION_FAILED",
      `maxOutputBytes must be a positive integer: ${String(maxOutputBytes)}`,
      { details: { maxOutputBytes: String(maxOutputBytes) } },
    );
  }
  const module = config.env;

  return {
    limits: { maxGraphObjects, maxOutputBytes },
    buildReport: (graph, reportOptions = {}) => {
      if (graph.objects.length > maxGraphObjects) {
        throw new ReportingError(
          "VALIDATION_FAILED",
          `graph exceeds the report object cap: ${graph.objects.length} > ${maxGraphObjects}`,
          { details: { objects: graph.objects.length, cap: maxGraphObjects } },
        );
      }
      return siteReportOf(graph, reportOptions);
    },
    renderPdf: (report) => {
      const pdf = renderSiteReportPdf(report);
      if (pdf.byteLength > maxOutputBytes) {
        throw new ReportingError(
          "VALIDATION_FAILED",
          `PDF output exceeds the byte cap: ${pdf.byteLength} > ${maxOutputBytes}`,
          { details: { byteLength: pdf.byteLength, cap: maxOutputBytes } },
        );
      }
      return pdf;
    },
    report: (graph, reportOptions = {}) => {
      const reportDocument = siteReportOf(graph, reportOptions);
      if (graph.objects.length > maxGraphObjects) {
        throw new ReportingError(
          "VALIDATION_FAILED",
          `graph exceeds the report object cap: ${graph.objects.length} > ${maxGraphObjects}`,
          { details: { objects: graph.objects.length, cap: maxGraphObjects } },
        );
      }
      const pdf = renderSiteReportPdf(reportDocument);
      if (pdf.byteLength > maxOutputBytes) {
        throw new ReportingError(
          "VALIDATION_FAILED",
          `PDF output exceeds the byte cap: ${pdf.byteLength} > ${maxOutputBytes}`,
          { details: { byteLength: pdf.byteLength, cap: maxOutputBytes } },
        );
      }
      logger.debug("reporting.reported", {
        module,
        modelId: reportDocument.model.modelId,
        graphDigest: reportDocument.model.graphDigest,
        objects: reportDocument.counts.objects,
        measurements: reportDocument.counts.measurements,
        pages: pdf.pageCount,
        bytes: pdf.byteLength,
      });
      return pdf;
    },
  };
}

/** Re-exported for the composition surface consumers. */
export type { EvidenceGraph };
