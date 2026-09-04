"use client";

/**
 * The 2D plan/elevation workspace shell (AISE-017, HIGH_ASSURANCE).
 *
 * Client-side interaction over the server-composed read-only
 * document: vector primitive selection, source/dimension/provenance
 * inspection, view + version navigation — all UI state only.
 * There is NO write affordance on this surface (the governed
 * decision path is the review workspace's); the browser renders
 * the vector geometry, it never computes it.
 *
 * The displayed DIMENSIONS are the canonical quantity values
 * (value, unit, uncertainty — verbatim from the model), never
 * recomputed from the drawing: AC-091's no-second-authority rule,
 * visible in the interface itself.
 */
import { useMemo, useState } from "react";
import Link from "next/link";
import styles from "../2d.module.css";
import type { Plan2dWorkspaceView } from "../server/plan-view";
import type { Primitive2d, Quantity2dView } from "@aise/backend-export-2d";
import { EpistemicBadge } from "@/components/epistemic-badge";

export interface PlanShellProps {
  readonly view: Plan2dWorkspaceView;
}

const CANVAS_PADDING = 0.5;

export function PlanShell({ view }: PlanShellProps) {
  const [selectedId, setSelectedId] = useState<string | undefined>(
    view.document.primitives[0]?.primitiveId,
  );

  const selected = useMemo(
    () => view.document.primitives.find((primitive) => primitive.primitiveId === selectedId),
    [view.document.primitives, selectedId],
  );

  // The SVG viewBox: the document's drawing bounds (display-derived)
  // with padding, in the model's declared unit. The Y axis flips so
  // image-up is +Y (the plan basis convention).
  const viewBox = useMemo(() => {
    const { minX, minY, maxX, maxY } = view.drawing;
    return `${minX - CANVAS_PADDING} ${-maxY - CANVAS_PADDING} ${maxX - minX + 2 * CANVAS_PADDING} ${maxY - minY + 2 * CANVAS_PADDING}`;
  }, [view.drawing]);

  return (
    <div className={styles.shell}>
      <aside className={styles.panel} aria-label="Views and primitives">
        <h2>Views</h2>
        <ul className={styles.viewList}>
          {view.availableViews.map((option) => (
            <li key={option.key}>
              <Link
                href={`/2d?v=${view.version}&view=${option.key}`}
                className={`${styles.viewLink} ${option.key === view.viewKey ? styles.current : ""}`}
              >
                {option.label}
              </Link>
            </li>
          ))}
        </ul>
        <h2>Versions</h2>
        <ul className={styles.versionBar}>
          {[...view.versions].reverse().map((version) => (
            <li key={version}>
              <Link
                href={`/2d?v=${version}&view=${view.viewKey}`}
                className={`${styles.versionLink} ${version === view.version ? styles.current : ""}`}
              >
                v{version}
              </Link>
            </li>
          ))}
        </ul>
        <h2>Primitives ({view.document.counts.projected})</h2>
        <ul className={styles.primitiveList}>
          {view.document.primitives.map((primitive) => (
            <li key={primitive.primitiveId}>
              <button
                type="button"
                className={styles.primitiveRow}
                data-class={primitive.source.objectClass}
                data-selected={primitive.primitiveId === selectedId}
                onClick={() => setSelectedId(primitive.primitiveId)}
              >
                <span className={styles.primitiveLabel}>
                  {primitive.source.objectClass}
                  <span className={styles.primitiveSub}>
                    {primitive.source.name ?? primitive.source.objectId}
                  </span>
                </span>
                <EpistemicBadge state={primitive.source.epistemic} />
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <section className={styles.canvas} aria-label="Plan drawing">
        <header className={styles.canvasHeader}>
          <h2 className={styles.canvasTitle}>{view.viewLabel}</h2>
          <span className={`${styles.canvasMeta} mono`}>
            {view.document.counts.polygons} polygons · {view.document.counts.segments} segments ·
            unit {view.document.unit}
          </span>
        </header>
        <svg
          className={styles.svg}
          viewBox={viewBox}
          role="img"
          aria-label={`${view.viewLabel} of ${view.modelId} v${view.version} — vector projection with ${view.document.counts.projected} primitives`}
        >
          {view.document.primitives.map((primitive) =>
            primitive.kind === "polygon" ? (
              <polygon
                key={primitive.primitiveId}
                data-epistemic={primitive.source.epistemic}
                data-selected={primitive.primitiveId === selectedId}
                points={primitive.points.map(([x, y]) => `${x},${-y}`).join(" ")}
                fill="rgba(20, 184, 166, 0.08)"
                strokeWidth={0.04}
                onClick={() => setSelectedId(primitive.primitiveId)}
              />
            ) : (
              <line
                key={primitive.primitiveId}
                data-epistemic={primitive.source.epistemic}
                data-selected={primitive.primitiveId === selectedId}
                x1={primitive.start[0]}
                y1={-primitive.start[1]}
                x2={primitive.end[0]}
                y2={-primitive.end[1]}
                strokeWidth={0.09}
                strokeLinecap="round"
                onClick={() => setSelectedId(primitive.primitiveId)}
              />
            ),
          )}
        </svg>
        <p className={styles.readonlyNote}>
          Read-only derived projection — the browser renders vector geometry; every dimension is
          the canonical model quantity (never recomputed here). Graph {view.graphDigest.slice(0, 16)}
          … · v{view.version}.
        </p>
      </section>

      <aside className={styles.panel} aria-label="Primitive trace">
        {selected !== undefined ? (
          <PrimitiveDetail primitive={selected} />
        ) : (
          <p className={styles.emptyNote}>No primitives in this view.</p>
        )}

        <h3>Limitations (explicit, v1)</h3>
        <ul className={styles.limitationList}>
          {view.document.limitations.map((limitation, index) => (
            <li key={index} className={styles.limitationItem}>
              {limitation}
            </li>
          ))}
        </ul>

        {view.document.unprojected.length > 0 ? (
          <>
            <h3>Unprojected ({view.document.unprojected.length})</h3>
            <ul className={styles.unprojectedList}>
              {view.document.unprojected.map((entry) => (
                <li key={entry.source.objectId} className={styles.unprojectedRow}>
                  <span className="mono">{entry.source.objectId}</span> — {entry.reason}
                </li>
              ))}
            </ul>
          </>
        ) : undefined}
      </aside>
    </div>
  );
}

/** The selected primitive's full trace: source, dimensions, provenance. */
function PrimitiveDetail({ primitive }: { readonly primitive: Primitive2d }) {
  const { source, dimensions } = primitive;
  const dimensionRows: readonly { key: string; quantity: Quantity2dView }[] = [
    ...(dimensions.length !== undefined ? [{ key: "length", quantity: dimensions.length }] : []),
    ...(dimensions.height !== undefined ? [{ key: "height", quantity: dimensions.height }] : []),
    ...(dimensions.area !== undefined ? [{ key: "area", quantity: dimensions.area }] : []),
    ...(dimensions.elevation !== undefined ? [{ key: "elevation", quantity: dimensions.elevation }] : []),
    ...(dimensions.sill !== undefined ? [{ key: "sill", quantity: dimensions.sill }] : []),
    ...(dimensions.head !== undefined ? [{ key: "head", quantity: dimensions.head }] : []),
  ];

  return (
    <div>
      <h2>{source.objectClass}</h2>
      <ul className={styles.traceList}>
        <li className={styles.traceRow}>
          <span className={styles.traceKey}>source ID</span>
          <span className={`${styles.traceValue} mono`}>{source.objectId}</span>
        </li>
        <li className={styles.traceRow}>
          <span className={styles.traceKey}>epistemic</span>
          <span className={styles.traceValue}>
            <EpistemicBadge state={source.epistemic} />
          </span>
        </li>
        <li className={styles.traceRow}>
          <span className={styles.traceKey}>content hash</span>
          <span className={`${styles.traceValue} mono`}>{source.contentHash.slice(0, 32)}…</span>
        </li>
        <li className={styles.traceRow}>
          <span className={styles.traceKey}>primitive</span>
          <span className={styles.traceValue}>
            {primitive.kind} ({primitive.kind === "polygon" ? `${primitive.points.length} points` : "2 points"})
          </span>
        </li>
      </ul>

      <h3>Dimensions (canonical quantities)</h3>
      <ul className={styles.dimensionList}>
        {dimensionRows.map((row) => (
          <li key={row.key} className={styles.dimensionRow}>
            <span className={styles.dimensionKey}>{row.key}</span>
            <span className={styles.dimensionValue}>
              {row.quantity.value} {row.quantity.unit}
              {row.quantity.uncertainty !== undefined
                ? ` (uncertainty: ${describeUncertainty(row.quantity.uncertainty)})`
                : ""}
              {row.quantity.unit !== "meter" && !row.quantity.unit.startsWith("square_")
                ? `  =  ${row.quantity.si} m`
                : ""}
              {row.quantity.unit.startsWith("square_") && row.quantity.unit !== "square_meter"
                ? `  =  ${row.quantity.si} m²`
                : ""}
            </span>
          </li>
        ))}
        {dimensionRows.length === 0 ? (
          <li className={styles.dimensionRow}>
            <span className={styles.dimensionKey}>none</span>
            <span className={styles.dimensionValue}>—</span>
          </li>
        ) : undefined}
      </ul>

      <h3>Provenance</h3>
      <ul className={styles.traceList}>
        <li className={styles.traceRow}>
          <span className={styles.traceKey}>method</span>
          <span className={`${styles.traceValue} mono`}>
            {source.provenance.serviceId} · {source.provenance.method} (v{source.provenance.methodVersion})
          </span>
        </li>
        {source.provenance.inputs.map((input) => (
          <li key={`${input.kind}-${input.id}`} className={styles.traceRow}>
            <span className={styles.traceKey}>{input.kind}</span>
            <span className={`${styles.traceValue} mono`}>
              {input.id}
              <br />
              {input.contentHash.slice(0, 24)}… · {input.epistemic}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Renders an uncertainty as a human-readable, honest string (never converted across kinds). */
function describeUncertainty(uncertainty: {
  kind: string;
  u?: number;
  U?: number;
  coverageFactor?: number;
  lowerOffset?: number;
  upperOffset?: number;
}): string {
  switch (uncertainty.kind) {
    case "standard":
      return `± ${uncertainty.u} (1σ)`;
    case "expanded":
      return `± ${uncertainty.U} (k=${uncertainty.coverageFactor})`;
    case "tolerance":
      return `[${uncertainty.lowerOffset}, +${uncertainty.upperOffset}] (tolerance)`;
    default:
      return uncertainty.kind;
  }
}
