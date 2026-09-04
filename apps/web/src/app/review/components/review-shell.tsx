"use client";

/**
 * The evidence-aware review workspace shell (AISE-016, HIGH_ASSURANCE).
 *
 * Client-side interaction over the server-composed read view:
 * entity selection, property/evidence inspection, readiness
 * browsing — all UI state only. The ONE write affordance is the
 * governed decision form: it POSTs to `/review/api/decide`,
 * which commits a NEW version through the canonical
 * constructors (a governed model change — never a UI-only
 * mutation); on success the workspace navigates to the new
 * version's authoritative re-composition.
 *
 * Traceability (the acceptance core): every displayed property
 * shows its epistemic state, quantity, uncertainty, confidence,
 * method, cited evidence identities, and the authoritative
 * per-citation verdict (VALID / UNMAPPED_CITATION) — a
 * consequential assertion never appears without its evidence
 * trace.
 */
import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import styles from "../review.module.css";
import type {
  ReviewPropertyView,
  ReviewWorkspaceView,
} from "../server/review-view";

/** The governed decision outcome the server returns. */
interface DecisionOutcomeView {
  readonly status: "committed";
  readonly modelId: string;
  readonly newVersion: number;
  readonly parentVersion: number;
  readonly digest: string;
  readonly decision: "CONFIRM" | "PROPOSE";
  readonly entityDescription: string;
  readonly propertyKey?: string;
  readonly evidenceId?: string;
  readonly verifiedBy: string;
  readonly verifiedAt: string;
}

const LENGTH_UNITS = ["meter", "millimeter", "centimeter", "inch", "foot"] as const;

export interface ReviewShellProps {
  readonly view: ReviewWorkspaceView;
}

export function ReviewShell({ view }: ReviewShellProps) {
  const router = useRouter();

  // --- selection state (UI only) -------------------------------------------
  const [selectedEntityId, setSelectedEntityId] = useState<string | undefined>(view.entities[0]?.entityId);
  const [selectedPropertyKey, setSelectedPropertyKey] = useState<string | undefined>(undefined);

  const entity = useMemo(
    () => view.entities.find((candidate) => candidate.entityId === selectedEntityId),
    [view.entities, selectedEntityId],
  );

  // --- decision form state --------------------------------------------------
  const [decisionKind, setDecisionKind] = useState<"CONFIRM" | "PROPOSE">("CONFIRM");
  const [targetExistence, setTargetExistence] = useState(false);
  const [evidenceMode, setEvidenceMode] = useState<"registered" | "measurement">("measurement");
  const [evidenceId, setEvidenceId] = useState<string>("");
  const [measurementValue, setMeasurementValue] = useState("");
  const [measurementUnit, setMeasurementUnit] = useState<string>("meter");
  const [measurementMethod, setMeasurementMethod] = useState("survey/laser-tape");
  const [measurementBy, setMeasurementBy] = useState("");
  const [measurementAt, setMeasurementAt] = useState("");
  const [measurementU, setMeasurementU] = useState("");
  const [measurementConfidence, setMeasurementConfidence] = useState("");
  const [proposeValue, setProposeValue] = useState("");
  const [proposeUnit, setProposeUnit] = useState<string>("meter");
  const [proposeU, setProposeU] = useState("");
  const [proposeConfidence, setProposeConfidence] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [formErrors, setFormErrors] = useState<readonly string[]>([]);
  const [outcome, setOutcome] = useState<DecisionOutcomeView | undefined>(undefined);

  const liveEvidence = useMemo(() => view.evidence.filter((entry) => !entry.retracted), [view.evidence]);

  // Prefill the measurement clock + actor once (the form's honest defaults).
  const measuredAtDefault = useMemo(() => new Date().toISOString(), []);

  function selectEntity(entityId: string): void {
    setSelectedEntityId(entityId);
    setSelectedPropertyKey(undefined);
    setTargetExistence(false);
    setOutcome(undefined);
    setFormErrors([]);
  }

  function selectProperty(propertyKey: string): void {
    setSelectedPropertyKey(propertyKey);
    setTargetExistence(false);
    const property = entity?.properties.find((candidate) => candidate.key === propertyKey);
    if (property !== undefined) {
      if (property.value !== undefined) {
        setProposeValue(String(property.value));
        setMeasurementValue(String(property.value));
      }
      if (property.unit !== undefined && (LENGTH_UNITS as readonly string[]).includes(property.unit)) {
        setProposeUnit(property.unit);
        setMeasurementUnit(property.unit);
      }
    }
  }

  async function submitDecision(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (entity === undefined) {
      return;
    }
    setSubmitting(true);
    setFormErrors([]);
    setOutcome(undefined);
    try {
      const body: Record<string, unknown> = {
        modelId: view.modelId,
        version: view.version,
        entityId: entity.entityId,
        decision: decisionKind,
      };
      if (!targetExistence) {
        body.propertyKey = selectedPropertyKey ?? "";
      }
      if (decisionKind === "CONFIRM") {
        if (evidenceMode === "registered") {
          body.evidenceId = evidenceId;
        } else {
          body.measurement = {
            value: Number(measurementValue),
            unit: measurementUnit,
            method: measurementMethod,
            measuredBy: measurementBy,
            measuredAt: measurementAt || measuredAtDefault,
            ...(measurementU !== "" ? { uncertaintyU: Number(measurementU) } : {}),
            ...(measurementConfidence !== "" ? { confidence: Number(measurementConfidence) } : {}),
          };
        }
      } else {
        body.proposal = {
          value: Number(proposeValue),
          unit: proposeUnit,
          ...(proposeU !== "" ? { uncertaintyU: Number(proposeU) } : {}),
          ...(proposeConfidence !== "" ? { confidence: Number(proposeConfidence) } : {}),
        };
      }

      const response = await fetch("/review/api/decide", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const responseBody = (await response.json().catch(() => ({}))) as {
        outcome?: DecisionOutcomeView;
        errors?: readonly string[];
        message?: string;
        error?: string;
      };
      if (response.ok && responseBody.outcome !== undefined) {
        setOutcome(responseBody.outcome);
        // Navigate to the new committed version (the authoritative
        // re-composition) — a governed model change, re-read from source.
        router.push(`/review?v=${responseBody.outcome.newVersion}`);
        router.refresh();
        return;
      }
      if (response.status === 400 && responseBody.errors !== undefined) {
        setFormErrors(responseBody.errors);
      } else if (responseBody.message !== undefined) {
        setFormErrors([responseBody.message]);
      } else if (responseBody.error !== undefined) {
        setFormErrors([describeErrorCode(responseBody.error)]);
      } else {
        setFormErrors(["The decision could not be applied."]);
      }
    } catch {
      setFormErrors(["The decision request failed."]);
    } finally {
      setSubmitting(false);
    }
  }

  const epistemicStates = Object.keys(view.epistemicSummary.objects);

  return (
    <div className={styles.shell}>
      {/* --- entity selection ------------------------------------------------ */}
      <aside className={styles.panel} aria-label="Entities">
        <h2>Entities</h2>
        <ul className={styles.entityList}>
          {view.entities.map((candidate) => (
            <li key={candidate.entityId}>
              <button
                type="button"
                className={styles.entityRow}
                data-entity-kind={candidate.entityKind}
                data-selected={candidate.entityId === selectedEntityId ? "true" : "false"}
                aria-pressed={candidate.entityId === selectedEntityId}
                onClick={() => selectEntity(candidate.entityId)}
              >
                <span className={styles.entityLabel}>
                  {candidate.label}
                  <span className={styles.entitySub}>{candidate.sublabel}</span>
                </span>
                {candidate.epistemicState !== undefined ? (
                  <span className={styles.badge} data-state={candidate.epistemicState}>
                    {candidate.epistemicState}
                  </span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
        <h2>Epistemic composition</h2>
        <ul className={styles.epistemicLegend}>
          {epistemicStates.map((state) => (
            <li key={state}>
              <span className={styles.badge} data-state={state}>
                {state}
              </span>
              <span>
                {view.epistemicSummary.objects[state]} object
                {view.epistemicSummary.objects[state] === 1 ? "" : "s"}
              </span>
            </li>
          ))}
        </ul>
      </aside>

      {/* --- the review detail + governed decision --------------------------- */}
      <section className={styles.panel} aria-label="Review detail">
        <h2>Version</h2>
        <div className={styles.versionBar}>
          {view.versions.map((version) => (
            <Link
              key={version}
              href={`/review?v=${version}`}
              className={version === view.version ? `${styles.versionLink} ${styles.current}` : styles.versionLink}
            >
              v{version}
            </Link>
          ))}
        </div>

        <div className={styles.validityBanner} data-invalidated={view.validitySummary.invalidatedCount > 0 ? "true" : "false"}>
          <span className={styles.validityStat}>
            <b>{view.validitySummary.validCount}</b>
            <span className="dim">valid</span>
          </span>
          <span className={styles.validityStat}>
            <b>{view.validitySummary.invalidatedCount}</b>
            <span className="dim">invalidated</span>
          </span>
          <span className={styles.validityStat}>
            <b>{view.validitySummary.confirmedAssertionCount}</b>
            <span className="dim">confirmed assertions</span>
          </span>
          {view.validitySummary.invalidatedCount > 0 ? (
            <span className={styles.validityWarn}>
              {view.validitySummary.invalidatedCount} verification state
              {view.validitySummary.invalidatedCount === 1 ? "" : "s"} invalidated — citations the evidence mapping does
              not attest.
            </span>
          ) : null}
        </div>

        {entity === undefined ? (
          <p className={styles.emptyState}>Select an entity to review.</p>
        ) : (
          <>
            <h2>{entity.label}</h2>
            <p className="dim" style={{ margin: "0 0 8px", fontSize: 13 }}>
              {entity.sublabel}
              {entity.epistemicState !== undefined ? " · epistemic " + entity.epistemicState : ""}
            </p>

            {entity.entityKind === "object" ? (
              <div className={styles.supportRow}>
                Existence support:{" "}
                {entity.existenceSupport.length > 0 ? (
                  entity.existenceSupport.map((id) => (
                    <code key={id} className="mono">
                      {id}
                    </code>
                  ))
                ) : (
                  <span className={styles.traceState} data-state="UNSUPPORTED">
                    UNSUPPORTED
                  </span>
                )}
              </div>
            ) : null}

            <h3>Properties — every assertion with its evidence trace</h3>
            {entity.properties.length === 0 ? (
              <p className={styles.emptyState}>No properties on this entity.</p>
            ) : (
              <ul className={styles.propertyList}>
                {entity.properties.map((property) => (
                  <li key={property.key}>
                    <PropertyCard
                      property={property}
                      selected={property.key === selectedPropertyKey && !targetExistence}
                      onSelect={() => selectProperty(property.key)}
                    />
                  </li>
                ))}
              </ul>
            )}

            <h3>Review decision — the governed write</h3>
            <form className={styles.decisionForm} onSubmit={submitDecision}>
              <h2>Decision</h2>
              <p className={styles.decisionTarget}>
                Target: <code>{entity.entityId}</code>
                {targetExistence ? (
                  " · object existence"
                ) : selectedPropertyKey !== undefined ? (
                  <>
                    {" · property "}
                    <code>{selectedPropertyKey}</code>
                  </>
                ) : (
                  " · select a property (or object existence) below"
                )}
                {" · derived from v"}
                {view.version}
              </p>

              <div className={styles.radioRow}>
                <label>
                  <input
                    type="radio"
                    name="decision-kind"
                    checked={decisionKind === "CONFIRM"}
                    onChange={() => setDecisionKind("CONFIRM")}
                  />
                  CONFIRM (needs evidence)
                </label>
                <label>
                  <input
                    type="radio"
                    name="decision-kind"
                    checked={decisionKind === "PROPOSE"}
                    onChange={() => setDecisionKind("PROPOSE")}
                  />
                  PROPOSE (estimate)
                </label>
              </div>

              {decisionKind === "CONFIRM" && entity.entityKind === "object" ? (
                <div className={styles.radioRow}>
                  <label>
                    <input
                      type="radio"
                      name="confirm-target"
                      checked={!targetExistence}
                      onChange={() => setTargetExistence(false)}
                    />
                    Property
                  </label>
                  <label>
                    <input
                      type="radio"
                      name="confirm-target"
                      checked={targetExistence}
                      onChange={() => setTargetExistence(true)}
                    />
                    Object existence
                  </label>
                </div>
              ) : null}

              {decisionKind === "CONFIRM" ? (
                <>
                  {!targetExistence ? (
                    <>
                      {selectedPropertyKey === undefined ? (
                        <p className={styles.emptyState}>
                          Select a property above to confirm it (existence cannot confirm a value).
                        </p>
                      ) : null}
                      <div className={styles.radioRow}>
                        <label>
                          <input
                            type="radio"
                            name="evidence-mode"
                            checked={evidenceMode === "registered"}
                            onChange={() => setEvidenceMode("registered")}
                          />
                          Cite registered evidence
                        </label>
                        <label>
                          <input
                            type="radio"
                            name="evidence-mode"
                            checked={evidenceMode === "measurement"}
                            onChange={() => setEvidenceMode("measurement")}
                          />
                          New manual measurement
                        </label>
                      </div>
                      {evidenceMode === "registered" ? (
                        <div className={styles.fieldRow}>
                          <label htmlFor="decide-evidence">Registered evidence identity</label>
                          <select
                            id="decide-evidence"
                            value={evidenceId}
                            onChange={(event) => setEvidenceId(event.target.value)}
                          >
                            <option value="">— select evidence —</option>
                            {liveEvidence.map((entry) => (
                              <option key={entry.evidenceId} value={entry.evidenceId}>
                                {entry.evidenceId} · {entry.kind} · {entry.sourceSummary}
                              </option>
                            ))}
                          </select>
                        </div>
                      ) : (
                        <MeasurementFields
                          value={measurementValue}
                          setValue={setMeasurementValue}
                          unit={measurementUnit}
                          setUnit={setMeasurementUnit}
                          method={measurementMethod}
                          setMethod={setMeasurementMethod}
                          measuredBy={measurementBy}
                          setMeasuredBy={setMeasurementBy}
                          measuredAt={measurementAt || measuredAtDefault}
                          setMeasuredAt={setMeasurementAt}
                          uncertaintyU={measurementU}
                          setUncertaintyU={setMeasurementU}
                          confidence={measurementConfidence}
                          setConfidence={setMeasurementConfidence}
                        />
                      )}
                    </>
                  ) : (
                    <div className={styles.fieldRow}>
                      <label htmlFor="decide-existence-evidence">Registered evidence identity</label>
                      <select
                        id="decide-existence-evidence"
                        value={evidenceId}
                        onChange={(event) => setEvidenceId(event.target.value)}
                      >
                        <option value="">— select evidence —</option>
                        {liveEvidence.map((entry) => (
                          <option key={entry.evidenceId} value={entry.evidenceId}>
                            {entry.evidenceId} · {entry.kind} · {entry.sourceSummary}
                          </option>
                        ))}
                      </select>
                      <span className="dim" style={{ fontSize: 12 }}>
                        Existence confirmation cites registered evidence (a capture).
                      </span>
                    </div>
                  )}
                </>
              ) : (
                <>
                  {selectedPropertyKey === undefined ? (
                    <p className={styles.emptyState}>Select a property above to propose a replacement value.</p>
                  ) : null}
                  <ProposalFields
                    value={proposeValue}
                    setValue={setProposeValue}
                    unit={proposeUnit}
                    setUnit={setProposeUnit}
                    uncertaintyU={proposeU}
                    setUncertaintyU={setProposeU}
                    confidence={proposeConfidence}
                    setConfidence={setProposeConfidence}
                  />
                </>
              )}

              {formErrors.length > 0 ? (
                <ul className={styles.formErrors} role="alert">
                  {formErrors.map((error) => (
                    <li key={error}>{error}</li>
                  ))}
                </ul>
              ) : null}

              {outcome !== undefined ? (
                <div className={styles.outcomeBanner} role="status">
                  <span>
                    Committed <b>v{outcome.newVersion}</b> (from v{outcome.parentVersion}) — {outcome.decision}{" "}
                    {outcome.entityDescription}
                    {outcome.propertyKey !== undefined ? ` · ${outcome.propertyKey}` : ""}
                    {outcome.evidenceId !== undefined ? ` · evidence ${outcome.evidenceId}` : ""}.
                  </span>
                  <span className="mono dim">digest {outcome.digest.slice(0, 32)}…</span>
                  <span>
                    Reviewing the new version — <Link href={`/review?v=${outcome.newVersion}`}>v{outcome.newVersion}</Link>
                  </span>
                </div>
              ) : null}

              <button
                type="submit"
                className={styles.submitButton}
                disabled={submitting || (decisionKind === "PROPOSE" && selectedPropertyKey === undefined)}
              >
                {submitting ? "Committing governed version…" : `Submit ${decisionKind} decision`}
              </button>
            </form>
          </>
        )}
      </section>

      {/* --- readiness + evidence inventory ---------------------------------- */}
      <aside className={styles.panel} aria-label="Readiness and evidence">
        <h2>Task readiness</h2>
        <ul className={styles.readinessList}>
          {view.readiness.map((report) => (
            <li key={report.taskId} className={styles.readinessCard}>
              <div className={styles.readinessHead}>
                <span className={styles.readinessTask}>{report.taskId}</span>
                <span className={styles.badge} data-state={report.verdict}>
                  {report.verdict}
                </span>
              </div>
              <span className="dim" style={{ fontSize: 12 }}>
                {report.intent} · {report.profile}
              </span>
              <ul className={styles.dimensionList}>
                {report.dimensions.map((dimension) => (
                  <li key={dimension.dimension}>
                    <span>{dimension.dimension}</span>
                    <span className={styles.dimensionVerdict} data-verdict={dimension.verdict}>
                      {dimension.verdict}
                    </span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>

        <h2>Evidence inventory</h2>
        <ul className={styles.evidenceList}>
          {view.evidence.map((entry) => (
            <li key={entry.evidenceId} className={styles.evidenceCard} data-retracted={entry.retracted ? "true" : "false"}>
              <div className={styles.evidenceHead}>
                <span className={styles.evidenceId}>{entry.evidenceId}</span>
                <span className={styles.evidenceKind}>{entry.kind}</span>
                {entry.retracted ? (
                  <span className={styles.traceState} data-state="UNSUPPORTED">
                    RETRACTED
                  </span>
                ) : null}
              </div>
              <p className={styles.evidenceSummary}>{entry.sourceSummary}</p>
              <p className={styles.evidenceMeta}>
                recorded by <span className="mono">{entry.recordedBy}</span> · {entry.recordedAt} · content{" "}
                <span className="mono">{entry.contentHash.slice(0, 16)}…</span>
              </p>
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}

/** One property card: the assertion + its complete evidence trace. */
function PropertyCard({
  property,
  selected,
  onSelect,
}: {
  property: ReviewPropertyView;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      className={styles.propertyCard}
      data-selected={selected ? "true" : "false"}
      onClick={onSelect}
      aria-pressed={selected}
    >
      <span className={styles.propertyHead}>
        <span className={styles.badge} data-state={property.status}>
          {property.status}
        </span>
        <span className={styles.propertyKey}>{property.key}</span>
        {property.value !== undefined ? (
          <span className={styles.propertyValue}>
            {property.value} {property.unit ?? ""}
          </span>
        ) : null}
        {property.presence !== undefined ? <span className="dim">{property.presence}</span> : null}
      </span>
      <span className={styles.propertyMeta}>
        {property.kind !== undefined ? <span>kind: {property.kind}</span> : null}
        {property.uncertainty !== undefined ? <span>uncertainty: {property.uncertainty}</span> : null}
        {property.confidence !== undefined ? <span>confidence: {property.confidence}</span> : null}
        {property.method !== undefined ? <span>method: {property.method}</span> : null}
      </span>
      <span className={styles.traceList}>
        {(property.evidenceRefs ?? []).map((evidenceId) => {
          const trace = property.citationTraces.find((candidate) => candidate.evidenceId === evidenceId);
          return (
            <span key={evidenceId} className={styles.traceRow}>
              <span className={styles.traceId}>cites {evidenceId}</span>
              <span className={styles.traceState} data-state={trace?.status ?? "UNMAPPED_CITATION"}>
                {trace?.status ?? "UNMAPPED_CITATION"}
              </span>
            </span>
          );
        })}
        {property.liveSupportCount > 0 ? (
          <span className={styles.traceRow}>
            <span className={styles.traceId}>
              live support: {property.supportingEvidence.join(", ")}
            </span>
          </span>
        ) : (
          <span className={styles.traceRow}>
            <span className={styles.traceState} data-state="UNSUPPORTED">
              NO LIVE EVIDENCE
            </span>
          </span>
        )}
      </span>
    </button>
  );
}

/** The new-measurement fields (CONFIRM with a fresh manual measurement). */
function MeasurementFields(props: {
  value: string;
  setValue: (value: string) => void;
  unit: string;
  setUnit: (unit: string) => void;
  method: string;
  setMethod: (method: string) => void;
  measuredBy: string;
  setMeasuredBy: (value: string) => void;
  measuredAt: string;
  setMeasuredAt: (value: string) => void;
  uncertaintyU: string;
  setUncertaintyU: (value: string) => void;
  confidence: string;
  setConfidence: (value: string) => void;
}) {
  return (
    <>
      <div className={styles.fieldRow}>
        <label htmlFor="measure-value">Measured value</label>
        <input
          id="measure-value"
          type="number"
          step="any"
          required
          value={props.value}
          onChange={(event) => props.setValue(event.target.value)}
        />
      </div>
      <div className={styles.fieldRow}>
        <label htmlFor="measure-unit">Unit</label>
        <select id="measure-unit" value={props.unit} onChange={(event) => props.setUnit(event.target.value)}>
          {LENGTH_UNITS.map((unit) => (
            <option key={unit} value={unit}>
              {unit}
            </option>
          ))}
        </select>
      </div>
      <div className={styles.fieldRow}>
        <label htmlFor="measure-method">Method</label>
        <input
          id="measure-method"
          type="text"
          required
          value={props.method}
          onChange={(event) => props.setMethod(event.target.value)}
        />
      </div>
      <div className={styles.fieldRow}>
        <label htmlFor="measure-by">Measured by</label>
        <input
          id="measure-by"
          type="text"
          required
          placeholder="surveyor name"
          value={props.measuredBy}
          onChange={(event) => props.setMeasuredBy(event.target.value)}
        />
      </div>
      <div className={styles.fieldRow}>
        <label htmlFor="measure-at">Measured at (RFC 3339 UTC)</label>
        <input
          id="measure-at"
          type="text"
          required
          className="mono"
          value={props.measuredAt}
          onChange={(event) => props.setMeasuredAt(event.target.value)}
        />
      </div>
      <div className={styles.fieldRow}>
        <label htmlFor="measure-u">Standard uncertainty (1σ, same unit — optional)</label>
        <input
          id="measure-u"
          type="number"
          step="any"
          min="0"
          value={props.uncertaintyU}
          onChange={(event) => props.setUncertaintyU(event.target.value)}
        />
      </div>
      <div className={styles.fieldRow}>
        <label htmlFor="measure-confidence">Confidence [0–1] (optional)</label>
        <input
          id="measure-confidence"
          type="number"
          step="any"
          min="0"
          max="1"
          value={props.confidence}
          onChange={(event) => props.setConfidence(event.target.value)}
        />
      </div>
    </>
  );
}

/** The proposal fields (PROPOSE — an estimate by construction). */
function ProposalFields(props: {
  value: string;
  setValue: (value: string) => void;
  unit: string;
  setUnit: (unit: string) => void;
  uncertaintyU: string;
  setUncertaintyU: (value: string) => void;
  confidence: string;
  setConfidence: (value: string) => void;
}) {
  return (
    <>
      <div className={styles.fieldRow}>
        <label htmlFor="propose-value">Proposed value</label>
        <input
          id="propose-value"
          type="number"
          step="any"
          required
          value={props.value}
          onChange={(event) => props.setValue(event.target.value)}
        />
      </div>
      <div className={styles.fieldRow}>
        <label htmlFor="propose-unit">Unit</label>
        <select id="propose-unit" value={props.unit} onChange={(event) => props.setUnit(event.target.value)}>
          {LENGTH_UNITS.map((unit) => (
            <option key={unit} value={unit}>
              {unit}
            </option>
          ))}
        </select>
      </div>
      <div className={styles.fieldRow}>
        <label htmlFor="propose-u">Standard uncertainty (1σ, same unit — optional)</label>
        <input
          id="propose-u"
          type="number"
          step="any"
          min="0"
          value={props.uncertaintyU}
          onChange={(event) => props.setUncertaintyU(event.target.value)}
        />
      </div>
      <div className={styles.fieldRow}>
        <label htmlFor="propose-confidence">Confidence [0–1] (optional)</label>
        <input
          id="propose-confidence"
          type="number"
          step="any"
          min="0"
          max="1"
          value={props.confidence}
          onChange={(event) => props.setConfidence(event.target.value)}
        />
      </div>
    </>
  );
}

/** Honest error descriptions (machine codes stay in the response body). */
function describeErrorCode(code: string): string {
  switch (code) {
    case "unauthenticated":
      return "Sign-in expired — sign in again to make review decisions.";
    case "unknown_model":
      return "The model is not served by this workspace.";
    case "unknown_version":
      return "The parent version is not committed.";
    case "unknown_entity":
      return "The selected entity does not exist in the parent version.";
    case "unknown_property":
      return "The selected property does not exist on the entity.";
    case "unknown_evidence":
      return "The cited evidence identity is not registered.";
    case "invalid_decision":
      return "The decision is not valid for its target.";
    default:
      return `The decision failed (${code}).`;
  }
}
