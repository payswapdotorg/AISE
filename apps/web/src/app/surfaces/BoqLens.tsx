/**
 * PROD-002 — the BOQ Lens surface (the "UNDERSTAND SCOPE" step of the golden
 * journey): the verbatim BOQ rows, their derived interpretation and mapping,
 * honest totals, grounded explanations and per-claim traceability — all
 * computed by the FROZEN boqlens library over its demo fixture.
 *
 * Honesty (the R8 discipline, presentation-only here):
 *  - original text renders VERBATIM (class .verbatim) with its cell refs;
 *  - every normalized/interpreted/mapped value carries a "derived" tag;
 *  - mapping statuses render distinct badges; ambiguous rows list their
 *    competing candidates; unmapped rows state the recorded reason;
 *  - rollups are marked derived aggregation and list what they EXCLUDE
 *    (no amount stated / other currency) — never assume zero, never convert;
 *  - explanation sentences carry the library's own "[inference: …]" markers
 *    verbatim;
 *  - every claim resolves through traceClaim to source cells, records or an
 *    explicit inference marker.
 */

import { useCallback, useState } from "react";
import type { ReactNode } from "react";
import { useResource, type ResourceOutcome } from "../resource";
import { isDemoMode, useAppEnvironment } from "../environment";
import { describeApiFailure, loadBoqImportsLive, loadBoqLensLive } from "../api";
import { demoLensInput } from "../demo";
import { BoqImportPanel } from "./BoqImport";
import type { BoqLensInput, BoqLensItem } from "../../boqlens";
import {
  computeBoqHealth,
  explainBoqItem,
  itemClaimId,
  rollupAmounts,
  searchBoqItems,
  sectionGroups,
  traceClaim,
} from "../../boqlens";
import {
  Card,
  CellRef,
  ConfidenceBadge,
  DataBadge,
  DerivedTag,
  EmptyState,
  ResourceView,
} from "../components";
import { ProjectSurfaceNav } from "../components";
import { TaskFlowStrip } from "../task-first";
import { formatRoute } from "../router";
import { formatMoney, plural } from "../format";
import { BoqLineBridgesCard } from "../../parity/components";
import { BoqLineSolutionTraceBridge } from "../solution-composition";
import { quantityBoundaryLabels } from "../../parity/boundary-labels";
import { demoBoqImport, demoCase, demoWorkspaceInput } from "../demo";

/** What the BOQ Lens surface renders once loaded. */
export interface BoqLensData {
  readonly mode: "demo" | "api";
  readonly projectId: string;
  /** The server-assembled lens input; null = none for this project. */
  readonly lens: BoqLensInput | null;
}

/** The BOQ Lens surface. */
export function BoqLensSurface({ projectId }: { readonly projectId: string }): ReactNode {
  const environment = useAppEnvironment();
  const mode = environment.apiStatus?.mode ?? "probing";
  const [query, setQuery] = useState("");
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const load = useCallback(async (): Promise<ResourceOutcome<BoqLensData>> => {
    if (isDemoMode(environment) || environment.apiStatus === null) {
      return {
        kind: "ready",
        data: { mode: "demo", projectId, lens: demoLensInput(projectId) },
      };
    }
    // Live mode: the joined lens input over the deployment's BOQ imports
    // (GET /v1/boq/imports is deployment-wide — the same honest discipline
    // as the case summaries; the first import in the service's own order is
    // opened and NAMED, never guessed silently).
    const imports = await loadBoqImportsLive(environment.fetchImpl);
    if (!imports.ok) {
      return { kind: "error", message: describeApiFailure(imports.failure) };
    }
    const first = imports.imports[0] ?? null;
    if (first === null) {
      return { kind: "ready", data: { mode: "api", projectId, lens: null } };
    }
    const lens = await loadBoqLensLive(environment.fetchImpl, first.importId);
    if (!lens.ok) {
      return { kind: "error", message: describeApiFailure(lens.failure) };
    }
    return {
      kind: "ready",
      data: {
        mode: "api",
        projectId,
        lens: lens.record as unknown as BoqLensInput,
      },
    };
  }, [environment, projectId]);

  const { state, reload } = useResource(`boq-lens:${projectId}:${mode}`, load);

  return (
    <>
      <div className="page-head">
        <p className="crumbs">
          <a href={formatRoute({ name: "projects" })}>Projects</a> /{" "}
          <a href={formatRoute({ name: "project", projectId })}>{projectId}</a>
        </p>
        <h1>BOQ Lens</h1>
        <p>
          The imported bill of quantities, verbatim — with derived
          interpretation, mapping to reality elements, honest totals and
          claim-level traceability.
        </p>
      </div>
      <TaskFlowStrip projectId={projectId} />
      <ProjectSurfaceNav projectId={projectId} current="boq-lens" />
      <BoqImportPanel projectId={projectId} onImported={reload} />
      <ResourceView
        state={state}
        loadingLabel="Loading the BOQ Lens…"
        onRetry={reload}
        render={(data) => (
          <BoqLensBody
            data={data}
            query={query}
            onQuery={setQuery}
            selectedItemId={selectedItemId}
            onSelectItem={setSelectedItemId}
          />
        )}
      />
    </>
  );
}

export function BoqLensBody({
  data,
  query,
  onQuery,
  selectedItemId,
  onSelectItem,
}: {
  readonly data: BoqLensData;
  readonly query: string;
  readonly onQuery: (query: string) => void;
  readonly selectedItemId: string | null;
  readonly onSelectItem: (itemId: string) => void;
}): ReactNode {
  if (data.lens === null) {
    return (
      <Card title="BOQ Lens" badge={<DataBadge mode={data.mode} />}>
        {data.mode === "demo" ? (
          <EmptyState
            title="No BOQ import recorded for this project"
            guidance="The lens renders one imported BOQ document per project. The demo dataset holds an import only for the pilot project; this project has none — an honest empty state, not missing data."
            action={
              <a
                className="button"
                href={formatRoute({ name: "boq-lens", projectId: "proj-riverside-refit" })}
              >
                Open the pilot project&apos;s lens
              </a>
            }
          />
        ) : (
          <EmptyState
            title="No BOQ import recorded on this deployment"
            guidance="The lens renders one imported BOQ document (its verbatim rows, the derived normalization view and the mapping join — GET /v1/boq/imports/:id/lens). This deployment carries no imports yet; import a SOURCE BOQ with the panel above — once one is ingested its lens renders here."
          />
        )}
      </Card>
    );
  }
  const lens = data.lens;
  const health = computeBoqHealth(lens);
  const results = query.trim() === "" ? null : searchBoqItems(query, lens);
  const visibleItems =
    results === null
      ? lens.items
      : lens.items.filter((item) => results.some((result) => result.itemId === item.itemId));
  const selectedItem =
    selectedItemId === null
      ? null
      : (lens.items.find((item) => item.itemId === selectedItemId) ?? null);

  return (
    <>
      <Card
        title="BOQ import"
        badge={<DataBadge mode={data.mode} />}
        meta={
          <span>
            import <span className="mono">{lens.importId}</span> · source{" "}
            <span className="mono">{lens.sourceName}</span> · dictionary{" "}
            {lens.dictionaryVersion ?? "none recorded"} · mapping version{" "}
            {lens.mappingVersion === null ? "none recorded" : String(lens.mappingVersion)}
          </span>
        }
      >
        <div className="stat-row">
          <div className="stat">
            <div className="stat-value">{String(health.totalItems)}</div>
            <div className="stat-label">item rows</div>
          </div>
          <div className="stat">
            <div className="stat-value">{String(health.mapped)}</div>
            <div className="stat-label">mapped</div>
          </div>
          <div className="stat">
            <div className="stat-value">{String(health.ambiguous)}</div>
            <div className="stat-label">ambiguous</div>
          </div>
          <div className="stat">
            <div className="stat-value">{String(health.unmapped)}</div>
            <div className="stat-label">unmapped</div>
          </div>
        </div>
        <ul className="notes-list">
          <li>
            Mapping confidence: {String(health.byMappingConfidence.high)} high ·{" "}
            {String(health.byMappingConfidence.medium)} medium ·{" "}
            {String(health.byMappingConfidence.low)} low ·{" "}
            {String(health.byMappingConfidence.uncertain)} uncertain.
          </li>
          <li>
            Concepts: {String(health.conceptsResolved)} resolved ·{" "}
            {String(health.conceptsUnresolved)} unresolved ·{" "}
            {String(health.uncertainInterpretations)} uncertain interpretations stay marked.
          </li>
          <li>
            Claims without provenance: {String(health.claimsWithoutProvenance)} — the
            provenance invariant must hold (zero).
          </li>
        </ul>
      </Card>

      <Card
        title="Item rows"
        meta={
          <span>
            original text is verbatim; interpretation and mapping are derived
            records — every derived value is marked
          </span>
        }
      >
        <div className="search-box">
          <input
            type="search"
            value={query}
            onChange={(event) => {
              onQuery(event.target.value);
            }}
            placeholder="Search rows, concepts, units, target locations…"
            aria-label="Search BOQ rows"
          />
          {results === null ? null : (
            <span className="inline-label" role="status">
              {plural(results.length, "matching row")}
            </span>
          )}
        </div>
        {visibleItems.length === 0 ? (
          <EmptyState
            title={results === null ? "No item rows in this import" : "No rows match this search"}
            guidance={
              results === null
                ? "The import carries no item rows — nothing to interpret or map yet."
                : "Search matches original text, normalized concepts and units, and mapping target locations. Try a different term."
            }
          />
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Row</th>
                  <th>Original text (verbatim)</th>
                  <th>Cells</th>
                  <th>Quantity</th>
                  <th>Rate</th>
                  <th>Amount</th>
                  <th>Interpretation</th>
                  <th>Mapping</th>
                </tr>
              </thead>
              <tbody>
                {visibleItems.map((item) => (
                  <ItemRow
                    key={item.itemId}
                    item={item}
                    selected={item.itemId === selectedItemId}
                    onSelect={() => {
                      onSelectItem(item.itemId);
                    }}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <RollupCard lens={lens} />
      <ExplanationCard items={visibleItems} />
      {selectedItem === null ? (
        <Card title="Claim trace">
          <EmptyState
            title="No row selected"
            guidance="Select a row above to resolve its claims back to source cells, interpretation records, mapping records — or to an explicit inference marker."
          />
        </Card>
      ) : (
        <>
          <BoqLineBridgesCard
            projectId={data.projectId}
            item={selectedItem}
            boqImport={data.mode === "demo" ? demoBoqImport(data.projectId) : null}
            workspace={data.mode === "demo" ? demoWorkspaceInput(data.projectId) : null}
            caseViews={
              data.mode === "demo" && demoCase(data.projectId) !== null
                ? [demoCase(data.projectId)!]
                : []
            }
            boundaryLabels={quantityBoundaryLabels(selectedItem, null)}
            mode={data.mode}
          />
          {/* PROD-026: the solution-trace bridge — the demo dataset holds no
              solution-generated BOQ for any project with lens rows, so the
              join input is honestly null (the unresolved state states the
              recorded reason; a live wiring passes the generated BOQ's
              identity-only source reference when the deployment holds one). */}
          <BoqLineSolutionTraceBridge
            projectId={data.projectId}
            item={selectedItem}
            boqImport={data.mode === "demo" ? demoBoqImport(data.projectId) : null}
            solutionBoq={null}
            mode={data.mode}
          />
          <TraceCard lens={lens} item={selectedItem} />
        </>
      )}
    </>
  );
}

function ItemRow({
  item,
  selected,
  onSelect,
}: {
  readonly item: BoqLensItem;
  readonly selected: boolean;
  readonly onSelect: () => void;
}): ReactNode {
  const interpretation = item.interpretation?.description ?? null;
  const mapping = item.mapping ?? null;
  return (
    <tr
      data-node-id={item.itemId}
      data-selected={selected ? "true" : undefined}
      onClick={onSelect}
    >
      <td>
        <button type="button" className="row-select" onClick={onSelect} aria-label={`Trace row ${item.originalText}`}>
          {item.sectionTitle ?? "—"}!{String(item.rowNumber)}
        </button>
      </td>
      <td>
        <span className="verbatim">{item.originalText}</span>
        {item.unitText === null ? null : (
          <span>
            {" "}
            (unit <span className="verbatim">{item.unitText}</span>)
          </span>
        )}
      </td>
      <td>
        <CellRef cellRef={item.descriptionCellRef} />{" "}
        <CellRef cellRef={item.unitCellRef} />
      </td>
      <td>{numericCell(item.quantity, item.unitText)}</td>
      <td>{numericCell(item.rate, item.currency)}</td>
      <td>{numericCell(item.amount, item.currency)}</td>
      <td>
        {interpretation === null ? (
          "no interpretation record"
        ) : (
          <>
            {interpretation.conceptCode === undefined ? (
              <span>
                not interpreted <ConfidenceBadge confidence={interpretation.confidence} />{" "}
                <DerivedTag>interpretation</DerivedTag>
                {interpretation.alternatives === undefined ? null : (
                  <ul className="notes-list">
                    {interpretation.alternatives.map((alternative, index) => (
                      <li key={index}>
                        competing reading {alternative.code ?? "(unnamed)"} —{" "}
                        {alternative.reason}
                      </li>
                    ))}
                  </ul>
                )}
              </span>
            ) : (
              <span>
                {interpretation.conceptCode} <DerivedTag>interpretation</DerivedTag>{" "}
                <ConfidenceBadge confidence={interpretation.confidence} />
                <span className="pane-foot"> method {interpretation.method}</span>
              </span>
            )}
          </>
        )}
      </td>
      <td>
        {mapping === null ? (
          "no mapping record"
        ) : mapping.status === "mapped" ? (
          <span>
            <MappingBadge status="mapped" /> {plural(mapping.targets.length, "target element")}{" "}
            <ConfidenceBadge confidence={mapping.confidence} /> <DerivedTag>mapping</DerivedTag>
            <ul className="notes-list">
              {mapping.targets.slice(0, 5).map((target) => (
                <li key={target.nodeId}>
                  <span className="mono">{target.nodeId}</span>
                  {target.spacePath === undefined || target.spacePath.length === 0
                    ? ""
                    : ` — ${target.spacePath.join(" / ")}`}
                </li>
              ))}
              {mapping.targets.length > 5 ? (
                <li>… {String(mapping.targets.length - 5)} more targets</li>
              ) : null}
            </ul>
          </span>
        ) : mapping.status === "ambiguous" ? (
          <span>
            <MappingBadge status="ambiguous" /> <ConfidenceBadge confidence={mapping.confidence} />{" "}
            <DerivedTag>mapping</DerivedTag>
            <ul className="notes-list">
              {(mapping.alternatives ?? []).map((alternative, index) => (
                <li key={index}>
                  candidate <span className="mono">{alternative.targetNodeId}</span> —{" "}
                  {alternative.reason}
                </li>
              ))}
            </ul>
          </span>
        ) : (
          <span>
            <MappingBadge status="unmapped" /> <ConfidenceBadge confidence={mapping.confidence} />{" "}
            <DerivedTag>mapping</DerivedTag>
            {mapping.reason === undefined ? null : (
              <span className="pane-foot"> {mapping.reason}</span>
            )}
          </span>
        )}
      </td>
    </tr>
  );
}

/** One numeric cell: value + its source cell ref (or the honest absence). */
function numericCell(
  numeric: { readonly cellRef: string | null; readonly value: number } | null,
  unit: string | null,
): ReactNode {
  if (numeric === null) {
    return <span className="sigma-unknown">not stated</span>;
  }
  return (
    <span>
      {String(numeric.value)}
      {unit === null ? "" : ` ${unit}`} <CellRef cellRef={numeric.cellRef} />
    </span>
  );
}

function MappingBadge({ status }: { readonly status: "mapped" | "ambiguous" | "unmapped" }): ReactNode {
  return <span className={`tag tag-mapping-${status}`}>{status}</span>;
}

function RollupCard({ lens }: { readonly lens: BoqLensInput }): ReactNode {
  const groups = sectionGroups(lens.items);
  const grand = rollupAmounts(lens.items);
  return (
    <Card
      title="Cost hierarchy"
      badge={<DerivedTag>aggregation</DerivedTag>}
      meta={
        <span>
          stated amounts only — rows without a stated amount or in another
          currency are excluded and counted, never assumed zero
        </span>
      }
    >
      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>Section</th>
              <th>Rows</th>
              <th>Total (stated amounts)</th>
              <th>Excluded</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((group) => {
              const rollup = rollupAmounts(group.items);
              return (
                <tr key={group.index}>
                  <td>{group.title ?? "(no section title)"}</td>
                  <td>{String(group.items.length)}</td>
                  <td>
                    {rollup.currency === null
                      ? "no stated amounts"
                      : formatMoney(rollup.total, rollup.currency)}
                  </td>
                  <td>
                    {rollup.excludedNoAmount.length === 0 && rollup.excludedCurrency.length === 0
                      ? "—"
                      : [
                          rollup.excludedNoAmount.length === 0
                            ? null
                            : `${plural(rollup.excludedNoAmount.length, "row")} without a stated amount`,
                          rollup.excludedCurrency.length === 0
                            ? null
                            : `${plural(rollup.excludedCurrency.length, "row")} in another currency`,
                        ]
                          .filter((entry) => entry !== null)
                          .join("; ")}
                  </td>
                </tr>
              );
            })}
            <tr data-selected="true">
              <td>
                Grand total <DerivedTag>aggregation</DerivedTag>
              </td>
              <td>{String(lens.items.length)}</td>
              <td>
                {grand.currency === null
                  ? "no stated amounts"
                  : formatMoney(grand.total, grand.currency)}
              </td>
              <td>
                {grand.excludedNoAmount.length === 0
                  ? "—"
                  : `${plural(grand.excludedNoAmount.length, "row")} without a stated amount (e.g. preliminary items)`}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function ExplanationCard({ items }: { readonly items: readonly BoqLensItem[] }): ReactNode {
  return (
    <Card
      title="Grounded explanations"
      meta={
        <span>
          deterministic sentence assembly — factual fragments trace to source
          cells and records; the rest is marked [inference: …] verbatim
        </span>
      }
    >
      {items.length === 0 ? (
        <EmptyState
          title="Nothing to explain"
          guidance="No rows are in view — clear the search to see the grounded explanations."
        />
      ) : (
        <ul className="notes-list">
          {items.map((item) => (
            <li key={item.itemId} data-claim-id={itemClaimId(item.itemId)}>
              {explainBoqItem(item, item.interpretation ?? null, item.mapping ?? null)}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function TraceCard({ lens, item }: { readonly lens: BoqLensInput; readonly item: BoqLensItem }): ReactNode {
  const chain = traceClaim(itemClaimId(item.itemId), lens);
  return (
    <Card
      title={`Claim trace — row ${String(item.rowNumber)}`}
      meta={<span className="mono">{chain.claimId}</span>}
    >
      <p className="pane-foot">
        {chain.summary} — {chain.grounded ? "grounded in BOQ evidence" : "carries inference markers"}.
      </p>
      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>Step kind</th>
              <th>Reference</th>
              <th>Detail</th>
            </tr>
          </thead>
          <tbody>
            {chain.steps.map((step, index) => (
              <tr key={index} data-step-kind={step.kind}>
                <td>
                  {step.kind === "source-cell" ? (
                    <span className="tag">source cell</span>
                  ) : step.kind === "interpretation-record" ? (
                    <span className="tag tag-derived">interpretation record</span>
                  ) : step.kind === "mapping-record" ? (
                    <span className="tag tag-derived">mapping record</span>
                  ) : (
                    <span className="tag tag-inference">inference</span>
                  )}
                </td>
                <td>
                  <code className="cell-ref">{step.ref}</code>
                </td>
                <td>{step.detail}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
