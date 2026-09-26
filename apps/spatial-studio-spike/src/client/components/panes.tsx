/**
 * GBIM-003 — the sandbox panes: inspector, component library, consequence
 * HUD, operation timeline, BOQ, agent, evidence, fallback and IFC lanes.
 *
 * Every pane renders ENGINE OUTPUTS VERBATIM (quantities, validation,
 * negotiation, identities). The Atelier-inspired patterns live here as
 * UI patterns only — NO hard-coded fire/cost/compliance semantics: every
 * engineering consequence displayed comes from AISE quantities/verification.
 *
 * Spike-only code (NOT production engine code).
 */

"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  AgentCompileDto,
  BoqLineDto,
  OperationRecordDto,
  PreviewDto,
  SceneElementSeed,
  WorkspaceDto,
} from "../../types";
import { badgeStyle, layout, THEME } from "../styles";
import { COMPONENT_LIBRARY, componentOf, type ComponentSpec } from "../intent-builder";

/* ------------------------------------------------------------------ */
/* Component library (Atelier pattern: component library + templates)   */
/* ------------------------------------------------------------------ */

export interface LibraryPaneProps {
  readonly activeKind: string | null;
  readonly onArm: (spec: ComponentSpec) => void;
  readonly onCancel: () => void;
  readonly onResetWorkspace: () => void;
  readonly busy: boolean;
}

export function LibraryPane(props: LibraryPaneProps): React.JSX.Element {
  return (
    <div style={layout.section}>
      <p style={layout.sectionTitle}>Component library</p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
        {COMPONENT_LIBRARY.map((spec) => (
          <button
            key={spec.kind}
            type="button"
            style={spec.kind === props.activeKind ? layout.buttonActive : layout.button}
            onClick={() => {
              if (spec.kind === props.activeKind) {
                props.onCancel();
              } else {
                props.onArm(spec);
              }
            }}
          >
            {spec.label}
            {spec.engineType === null ? " ⚠" : ""}
          </button>
        ))}
      </div>
      <p style={{ ...layout.small, ...layout.dim, marginTop: 8 }}>
        ⚠ = no Phase 1 engine type: the engine will refuse honestly (unsupported). Component
        parameters come from the engine capability profile / fixture defaults — never invented.
      </p>
      <p style={{ ...layout.sectionTitle, marginTop: 12 }}>
        Project starter
      </p>
      <p style={{ ...layout.small, ...layout.dim }}>
        The workspace was opened from the GBIM-000 fixture template (the pinned canonical room,
        sha-256 recorded below) replayed through the engine.
      </p>
      <button type="button" style={layout.button} onClick={props.onResetWorkspace} disabled={props.busy}>
        Reset to fixture template
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Inspector (object inspection + external renderer references)         */
/* ------------------------------------------------------------------ */

export interface InspectorPaneProps {
  readonly workspace: WorkspaceDto | null;
  readonly seeds: readonly SceneElementSeed[];
  readonly selectedAiseId: string | null;
  readonly externalRendererRef: string | null;
  readonly onReviseOpening: () => void;
  readonly busy: boolean;
}

export function InspectorPane(props: InspectorPaneProps): React.JSX.Element {
  const { workspace, seeds, selectedAiseId } = props;
  const seed = seeds.find((candidate) => candidate.aiseId === selectedAiseId) ?? null;
  const record =
    workspace === null
      ? null
      : workspace.operationRecords.find((candidate) => {
          if (seed === null) {
            return false;
          }
          if (seed.engineOp !== null && candidate.operationId === seed.engineOp.operationId) {
            return true;
          }
          return candidate.targetElementId === selectedAiseId;
        }) ?? null;

  if (seed === null) {
    return (
      <div style={layout.section}>
        <p style={layout.sectionTitle}>Inspector</p>
        <p style={{ ...layout.small, ...layout.dim }}>
          Select an element in the 3D or plan view (or an operation/BOQ line) to inspect its AISE
          semantics. Selection is presentation state — it never mutates canonical reality.
        </p>
      </div>
    );
  }

  return (
    <div style={layout.section}>
      <p style={layout.sectionTitle}>Inspector</p>
      <div style={layout.card}>
        <div style={{ fontWeight: 700, fontSize: 13 }}>{seed.label}</div>
        <table style={layout.table}>
          <tbody>
            <tr>
              <td style={{ ...layout.td, ...layout.dim, width: 128 }}>AISE reference</td>
              <td style={{ ...layout.td, ...layout.mono }}>{seed.aiseId}</td>
            </tr>
            <tr>
              <td style={{ ...layout.td, ...layout.dim }}>Source</td>
              <td style={layout.td}>
                {seed.source === "fixture-baseline"
                  ? "GBIM-000 fixture baseline (reality)"
                  : "engine proposed state (overlay)"}
              </td>
            </tr>
            <tr>
              <td style={{ ...layout.td, ...layout.dim }}>Renderer object ref</td>
              <td style={{ ...layout.td, ...layout.mono, ...layout.dim }}>
                {props.externalRendererRef ?? "(scene not built)"}
                <div style={{ fontSize: 10 }}>
                  external reference (Three.js mesh uuid) — NOT AISE identity
                </div>
              </td>
            </tr>
            {seed.engineOp !== null ? (
              <>
                <tr>
                  <td style={{ ...layout.td, ...layout.dim }}>Engine operation</td>
                  <td style={{ ...layout.td, ...layout.mono }}>
                    {seed.engineOp.engineType}
                    <div style={{ fontSize: 10 }}>op {seed.engineOp.operationId.slice(0, 16)}…</div>
                  </td>
                </tr>
                <tr>
                  <td style={{ ...layout.td, ...layout.dim }}>State layer</td>
                  <td style={layout.td}>{record?.stateIndex ?? "—"}</td>
                </tr>
              </>
            ) : (
              <tr>
                <td style={{ ...layout.td, ...layout.dim }}>Engine operation</td>
                <td style={{ ...layout.td, ...layout.dim }}>
                  none — fixture element with no Phase 1 engine type (see Operations)
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {record !== null ? <OperationQuantities record={record} /> : null}
      {record !== null && record.outcome === "applied" && record.fixtureOpId === "op-004" ? (
        <button type="button" style={layout.buttonPrimary} onClick={props.onReviseOpening} disabled={props.busy}>
          Revise opening (op-010: 1.5 × 1.2 m, new version)
        </button>
      ) : null}
    </div>
  );
}

export function OperationQuantities(props: { readonly record: OperationRecordDto }): React.JSX.Element {
  const { record } = props;
  return (
    <div style={layout.card}>
      <div style={layout.row}>
        <span style={badgeStyle(record.outcome)}>{record.outcome}</span>
        <span style={{ ...layout.small, ...layout.dim }}>
          negotiation: {record.negotiationOutcome}
          {record.engineType === null ? ` · engine type: none` : ""}
        </span>
      </div>
      {record.quantities.length > 0 ? (
        <table style={{ ...layout.table, marginTop: 6 }}>
          <thead>
            <tr>
              <th style={layout.th}>Engine quantity</th>
              <th style={layout.th}>Value</th>
              <th style={layout.th}>Calculation (cited)</th>
            </tr>
          </thead>
          <tbody>
            {record.quantities.map((quantity) => (
              <tr key={quantity.name}>
                <td style={layout.td}>
                  {quantity.name}
                  <span style={{ ...layout.small, ...layout.dim }}> ({quantity.direction})</span>
                </td>
                <td style={{ ...layout.td, ...layout.mono }}>
                  {quantity.value.toFixed(3)} {quantity.unit}
                </td>
                <td style={{ ...layout.td, ...layout.mono, fontSize: 10 }}>
                  {quantity.calculation}
                  <div style={{ color: THEME.textDim }}>{quantity.formula}</div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p style={{ ...layout.small, ...layout.dim, marginTop: 6 }}>
          No engine quantities: {record.reasons.length > 0 ? record.reasons.join("; ") : "not applicable"}
        </p>
      )}
      {record.limitsExceeded.length > 0 ? (
        <p style={{ ...layout.small, color: THEME.warn, marginTop: 6 }}>
          Phase 1 limits exceeded: {record.limitsExceeded.map((limit) => `${limit.limitId} (${limit.parameterName})`).join(", ")}
        </p>
      ) : null}
      <p style={{ ...layout.small, ...layout.dim, marginTop: 6 }}>{record.mappingNote}</p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Live consequence HUD (Atelier pattern; AISE quantities only)         */
/* ------------------------------------------------------------------ */

export interface ConsequenceHudProps {
  readonly preview: PreviewDto | null;
  readonly stagedSpec: ComponentSpec | null;
  readonly busy: boolean;
  readonly onApply: () => void;
  readonly onDiscard: () => void;
}

export function ConsequenceHud(props: ConsequenceHudProps): React.JSX.Element {
  const { preview, stagedSpec } = props;
  if (stagedSpec === null || preview === null) {
    return (
      <div style={layout.section}>
        <p style={layout.sectionTitle}>Live consequence HUD</p>
        <p style={{ ...layout.small, ...layout.dim }}>
          Stage a component to see its consequences BEFORE anything is recorded. Consequences are
          computed by the AISE solution engine (dry-run applyOperation) — the renderer holds no
          quantity authority and adds no cost/fire/compliance semantics of its own.
        </p>
      </div>
    );
  }
  return (
    <div style={layout.section}>
      <p style={layout.sectionTitle}>Live consequence HUD — {stagedSpec.label} (staged)</p>
      <div style={layout.hud}>
        <div style={layout.row}>
          <span style={badgeStyle(preview.outcome)}>{preview.outcome}</span>
          <span style={layout.small}>engine negotiation: {preview.negotiationOutcome}</span>
        </div>
        {preview.quantities.length > 0 ? (
          <table style={{ ...layout.table, marginTop: 6 }}>
            <thead>
              <tr>
                <th style={layout.th}>Quantity (engine)</th>
                <th style={layout.th}>Value</th>
                <th style={layout.th}>Calculation</th>
              </tr>
            </thead>
            <tbody>
              {preview.quantities.map((quantity) => (
                <tr key={quantity.name}>
                  <td style={layout.td}>{quantity.name}</td>
                  <td style={{ ...layout.td, ...layout.mono }}>
                    {quantity.value.toFixed(3)} {quantity.unit}
                  </td>
                  <td style={{ ...layout.td, ...layout.mono, fontSize: 10 }}>{quantity.formula}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
        {preview.refusalReasons.length > 0 ? (
          <p style={{ ...layout.small, color: THEME.bad, marginTop: 6 }}>
            Engine refusal (fail closed): {preview.refusalReasons.join("; ")}
          </p>
        ) : null}
        {preview.negotiationReasons.length > 0 ? (
          <p style={{ ...layout.small, ...layout.dim, marginTop: 6 }}>
            {preview.negotiationReasons.join("; ")}
          </p>
        ) : null}
        {preview.limitsExceeded.length > 0 ? (
          <p style={{ ...layout.small, color: THEME.warn, marginTop: 6 }}>
            Limits exceeded: {preview.limitsExceeded.map((limit) => `${limit.limitId} (${limit.parameterName})`).join(", ")}
          </p>
        ) : null}
        <p style={{ ...layout.small, ...layout.dim, marginTop: 6 }}>{preview.note}</p>
        <div style={{ ...layout.row, marginTop: 8 }}>
          {preview.outcome === "applied" ? (
            <button type="button" style={layout.buttonPrimary} onClick={props.onApply} disabled={props.busy}>
              Apply through the engine
            </button>
          ) : null}
          <button type="button" style={layout.button} onClick={props.onDiscard} disabled={props.busy}>
            Discard
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Operation timeline (calm staged workflow + stable references)        */
/* ------------------------------------------------------------------ */

export interface OperationsPaneProps {
  readonly workspace: WorkspaceDto | null;
  readonly selectedAiseId: string | null;
  readonly onSelectOperation: (record: OperationRecordDto) => void;
}

export function OperationsPane(props: OperationsPaneProps): React.JSX.Element {
  const { workspace } = props;
  if (workspace === null) {
    return (
      <div style={layout.section}>
        <p style={layout.sectionTitle}>Operations</p>
        <p style={{ ...layout.small, ...layout.dim }}>loading…</p>
      </div>
    );
  }
  return (
    <div style={layout.section}>
      <p style={layout.sectionTitle}>
        Operations — fixture ops + authored ops (v{workspace.versionNumber}, {workspace.versionStatus})
      </p>
      <div style={layout.listScroll}>
        <table style={layout.table}>
          <thead>
            <tr>
              <th style={layout.th}>Fixture</th>
              <th style={layout.th}>Engine type</th>
              <th style={layout.th}>Outcome</th>
              <th style={layout.th}>Operation id (AISE)</th>
            </tr>
          </thead>
          <tbody>
            {workspace.operationRecords.map((record) => (
              <tr
                key={`${record.fixtureOpId}-${record.operationId ?? record.negotiationOutcome}`}
                style={{ cursor: "pointer", background: record.operationId !== null && record.operationId === props.selectedAiseId?.replace("op:", "") ? THEME.accentSoft : undefined }}
                onClick={() => {
                  props.onSelectOperation(record);
                }}
              >
                <td style={layout.td}>
                  {record.fixtureOpId}
                  <div style={{ ...layout.small, ...layout.dim }}>{record.fixtureType}</div>
                </td>
                <td style={{ ...layout.td, ...layout.mono, fontSize: 10 }}>{record.engineType ?? "—"}</td>
                <td style={layout.td}>
                  <span style={badgeStyle(record.outcome)}>{record.outcome}</span>
                  <div style={{ ...layout.small, ...layout.dim }}>{record.origin}</div>
                </td>
                <td style={{ ...layout.td, ...layout.mono, fontSize: 10 }}>
                  {record.operationId !== null ? `${record.operationId.slice(0, 18)}…` : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* BOQ pane (engine-derived BOQ + export entry points)                  */
/* ------------------------------------------------------------------ */

export interface BoqPaneProps {
  readonly workspace: WorkspaceDto | null;
  readonly onSelectOperation: (record: OperationRecordDto) => void;
}

export function BoqPane(props: BoqPaneProps): React.JSX.Element {
  const { workspace } = props;
  const [selectedLine, setSelectedLine] = useState<string | null>(null);
  if (workspace === null) {
    return <p style={{ ...layout.small, ...layout.dim, padding: 12 }}>loading…</p>;
  }
  const download = (name: string, content: string, type: string): void => {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = name;
    anchor.click();
    URL.revokeObjectURL(url);
  };
  const csvOf = (lines: readonly BoqLineDto[]): string => {
    const header = "section,item,activity,direction,material,quantity,unit,calculation";
    const rows = lines.map((line) =>
      [
        line.sectionTitle,
        line.itemDescription.replace(/,/g, ";"),
        line.activity,
        line.direction,
        line.material ?? "",
        String(line.quantityValue),
        line.unit,
        line.calculationRef,
      ].join(","),
    );
    return [header, ...rows].join("\n");
  };
  return (
    <div style={{ ...layout.pane, background: THEME.panel }}>
      <div style={layout.row}>
        <p style={{ ...layout.title, flex: 1 }}>
          BOQ — derived from engine quantities (v{workspace.boq.versionNumber}, {workspace.boq.lines.length} lines)
        </p>
        <button type="button" style={layout.button} onClick={() => download("aise-spike-boq.csv", csvOf(workspace.boq.lines), "text/csv")}>
          Export CSV
        </button>
        <button
          type="button"
          style={layout.button}
          onClick={() => download("aise-spike-boq.json", JSON.stringify(workspace.boq, null, 2), "application/json")}
        >
          Export JSON
        </button>
      </div>
      <p style={{ ...layout.small, ...layout.dim, marginTop: 4 }}>
        The BOQ never recomputes quantities — engine outputs are grouped and labeled only. Clicking
        a line selects the contributing operation (stable AISE references shared with 2D/3D views).
      </p>
      <table style={{ ...layout.table, marginTop: 8 }}>
        <thead>
          <tr>
            <th style={layout.th}>Section</th>
            <th style={layout.th}>Item</th>
            <th style={layout.th}>Qty</th>
            <th style={layout.th}>Calculation (cited)</th>
            <th style={layout.th}>Ops</th>
          </tr>
        </thead>
        <tbody>
          {workspace.boq.lines.map((line) => (
            <tr
              key={line.boqLineId}
              style={{ cursor: "pointer", background: line.boqLineId === selectedLine ? THEME.accentSoft : undefined }}
              onClick={() => {
                setSelectedLine(line.boqLineId);
                const record =
                  workspace.operationRecords.find((candidate) => candidate.operationId !== null && line.operationRefs.includes(candidate.operationId)) ?? null;
                if (record !== null) {
                  props.onSelectOperation(record);
                }
              }}
            >
              <td style={layout.td}>{line.sectionTitle}</td>
              <td style={layout.td}>
                {line.itemDescription}
                <div style={{ ...layout.small, ...layout.dim }}>
                  {line.material ?? ""} · {line.direction}
                </div>
              </td>
              <td style={{ ...layout.td, ...layout.mono }}>
                {line.quantityValue.toFixed(2)} {line.unit}
              </td>
              <td style={{ ...layout.td, ...layout.mono, fontSize: 10 }}>
                {line.calculationRef}
                <div style={{ color: THEME.textDim }}>{line.methodSource}</div>
              </td>
              <td style={{ ...layout.td, ...layout.mono, fontSize: 10 }}>
                {line.operationRefs.map((ref) => ref.slice(0, 10)).join(", ")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {workspace.boq.assumptions.length > 0 ? (
        <div style={{ ...layout.card, marginTop: 10 }}>
          <p style={layout.sectionTitle}>Assumptions carried from validation</p>
          {workspace.boq.assumptions.map((assumption) => (
            <p key={assumption.assumptionId} style={{ ...layout.small, marginBottom: 4 }}>
              <span style={badgeStyle("review-needed")}>{assumption.originKind}</span> {assumption.statement}
            </p>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Agent pane (the REAL compiler via the server; same apply path)       */
/* ------------------------------------------------------------------ */

export interface AgentPaneProps {
  readonly workspace: WorkspaceDto | null;
  readonly busy: boolean;
  readonly onCompile: (utterance: string) => Promise<AgentCompileDto | null>;
  readonly onApplyIntent: (intent: unknown, origin: string) => void;
  readonly onRunEquivalence: () => void;
  readonly equivalence: EquivalenceState | null;
}

export interface EquivalenceState {
  readonly directOperationId: string;
  readonly agentOperationId: string;
  readonly equal: boolean;
  readonly utterance: string;
  readonly detail: string;
}

const EXAMPLE_UTTERANCES = [
  "Build a new block wall 8 m long, 3 m high and 200 mm thick from concrete blocks in the wall.",
  "Cut a new opening in the wall 1.2 m wide and 1.2 m high with a window.",
  "Pour a new floor slab 8 m long, 6 m wide and 200 mm thick from plain concrete.",
  "Approve the wall and mark it verified.",
];

export function AgentPane(props: AgentPaneProps): React.JSX.Element {
  const [utterance, setUtterance] = useState(EXAMPLE_UTTERANCES[0] ?? "");
  const [compiled, setCompiled] = useState<AgentCompileDto | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const runCompile = async (): Promise<void> => {
    setNote(null);
    const result = await props.onCompile(utterance);
    setCompiled(result);
  };

  return (
    <div style={{ ...layout.pane, background: THEME.panel }}>
      <p style={layout.title}>Agent command lane — the deterministic NL compiler (server-side)</p>
      <p style={{ ...layout.small, ...layout.dim }}>
        Utterances compile through AISE&apos;s real solution compiler (PROD-023, deterministic grammar —
        no LLM needed) into the SAME typed EngineeringOperationIntent the direct-manipulation lane
        produces; confirmed proposals flow through the SAME apply path.
      </p>
      <div style={{ ...layout.row, marginTop: 8 }}>
        <input
          style={layout.inputWide}
          value={utterance}
          onChange={(event) => {
            setUtterance(event.target.value);
          }}
          placeholder="Type an engineering instruction…"
        />
        <button type="button" style={layout.buttonPrimary} onClick={() => void runCompile()} disabled={props.busy}>
          Compile
        </button>
      </div>
      <div style={{ ...layout.row, marginTop: 6 }}>
        {EXAMPLE_UTTERANCES.map((example) => (
          <button
            key={example}
            type="button"
            style={{ ...layout.button, fontSize: 10 }}
            onClick={() => {
              setUtterance(example);
            }}
          >
            {example.slice(0, 42)}…
          </button>
        ))}
      </div>
      {note !== null ? <p style={{ ...layout.small, marginTop: 8 }}>{note}</p> : null}
      {compiled !== null ? (
        <div style={{ ...layout.card, marginTop: 10 }}>
          <div style={layout.row}>
            <span style={badgeStyle(compiled.kind === "operation-intent" ? "applied" : "invalid")}>{compiled.kind}</span>
            {compiled.normalizedCommandText !== null ? (
              <span style={{ ...layout.small, ...layout.dim }}>normalized: “{compiled.normalizedCommandText}”</span>
            ) : null}
          </div>
          <p style={{ ...layout.small, marginTop: 6 }}>{compiled.detail}</p>
          {compiled.questions.length > 0 ? (
            <ul style={{ ...layout.small, margin: "6px 0", paddingLeft: 18 }}>
              {compiled.questions.map((question) => (
                <li key={question}>{question}</li>
              ))}
            </ul>
          ) : null}
          {compiled.reasonCode !== null ? (
            <p style={{ ...layout.small, color: THEME.bad }}>reason: {compiled.reasonCode}</p>
          ) : null}
          {compiled.kind === "operation-intent" && compiled.intent !== null ? (
            <button
              type="button"
              style={layout.buttonPrimary}
              disabled={props.busy}
              onClick={() => {
                setNote("proposal confirmed — applying through the same engine path…");
                props.onApplyIntent(compiled.intent, "agent");
              }}
            >
              Confirm &amp; apply through the engine
            </button>
          ) : null}
        </div>
      ) : null}

      <div style={{ ...layout.card, marginTop: 12 }}>
        <p style={layout.sectionTitle}>Direct ⇄ agent equivalence proof (live)</p>
        <p style={{ ...layout.small, ...layout.dim }}>
          Builds the direct-manipulation intent for an 8 × 3 × 0.2 m concrete-block wall, compiles
          the utterance “…8 m long, 3 m high and <b>200 mm</b> thick…” through the real compiler
          (unit canonicalization mm → m), and derives both operation identities server-side.
          Identity excludes provenance — equal semantics MUST yield the same id.
        </p>
        <button type="button" style={layout.button} disabled={props.busy} onClick={() => void props.onRunEquivalence()}>
          Run equivalence proof
        </button>
        {props.equivalence !== null ? (
          <div style={{ marginTop: 8 }}>
            <p
              style={{
                ...layout.small,
                fontWeight: 700,
                color: props.equivalence.equal ? THEME.good : THEME.bad,
              }}
            >
              {props.equivalence.equal ? "✓ SAME operation identity" : "✗ DIVERGED"} — {props.equivalence.detail}
            </p>
            <table style={layout.table}>
              <tbody>
                <tr>
                  <td style={{ ...layout.td, ...layout.dim }}>direct-manipulation intent</td>
                  <td style={{ ...layout.td, ...layout.mono, fontSize: 10 }}>{props.equivalence.directOperationId}</td>
                </tr>
                <tr>
                  <td style={{ ...layout.td, ...layout.dim }}>agent-compiled intent</td>
                  <td style={{ ...layout.td, ...layout.mono, fontSize: 10 }}>{props.equivalence.agentOperationId}</td>
                </tr>
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Evidence pane (scorecard + negative results, from the committed JSON) */
/* ------------------------------------------------------------------ */

export interface EvidenceCheckEntry {
  readonly id: string;
  readonly title: string;
  readonly verdict: string;
  readonly evidence: string;
}

export interface EvidenceFile {
  readonly generatedAt: string;
  readonly fixtureSha256: string;
  readonly checks: readonly EvidenceCheckEntry[];
  readonly scorecard: readonly { readonly dimension: string; readonly verdict: string; readonly evidence: string }[];
}

export function EvidencePane(props: { readonly evidence: EvidenceFile | null }): React.JSX.Element {
  const evidence = props.evidence;
  if (evidence === null) {
    return <p style={{ ...layout.small, ...layout.dim, padding: 12 }}>loading evidence…</p>;
  }
  return (
    <div style={{ ...layout.pane, background: THEME.panel }}>
      <p style={layout.title}>Spike evidence — scorecard &amp; negative/discrimination results</p>
      <p style={{ ...layout.small, ...layout.dim }}>
        Generated deterministically by{" "}
        <span style={layout.mono}>apps/spatial-studio-spike/src/server/run-checks.ts</span> (bun) —
        results committed at <span style={layout.mono}>docs/productization-evidence/GBIM-003/results/</span>.
        Fixture sha-256: <span style={layout.mono}>{evidence.fixtureSha256.slice(0, 16)}…</span>
      </p>
      <h3 style={{ fontSize: 13, marginTop: 14 }}>Scorecard (gate record)</h3>
      <table style={layout.table}>
        <thead>
          <tr>
            <th style={layout.th}>Dimension</th>
            <th style={layout.th}>Verdict</th>
            <th style={layout.th}>Evidence</th>
          </tr>
        </thead>
        <tbody>
          {evidence.scorecard.map((row) => (
            <tr key={row.dimension}>
              <td style={layout.td}>{row.dimension}</td>
              <td style={layout.td}>
                <span style={badgeStyle(row.verdict)}>{row.verdict}</span>
              </td>
              <td style={{ ...layout.td, fontSize: 11 }}>{row.evidence}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <h3 style={{ fontSize: 13, marginTop: 14 }}>Checks (incl. negative/discrimination cases)</h3>
      <table style={layout.table}>
        <thead>
          <tr>
            <th style={layout.th}>Check</th>
            <th style={layout.th}>Verdict</th>
            <th style={layout.th}>Evidence</th>
          </tr>
        </thead>
        <tbody>
          {evidence.checks.map((check) => (
            <tr key={check.id}>
              <td style={layout.td}>
                {check.id}
                <div style={{ ...layout.small, ...layout.dim }}>{check.title}</div>
              </td>
              <td style={layout.td}>
                <span style={badgeStyle(check.verdict)}>{check.verdict}</span>
              </td>
              <td style={{ ...layout.td, fontSize: 11 }}>{check.evidence}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Fallback pane (renderer-unavailable: full function, zero geometry)   */
/* ------------------------------------------------------------------ */

export interface FallbackPaneProps {
  readonly workspace: WorkspaceDto | null;
  readonly reason: string;
  readonly seeds: readonly SceneElementSeed[];
  readonly onSelectOperation: (record: OperationRecordDto) => void;
}

export function FallbackPane(props: FallbackPaneProps): React.JSX.Element {
  const { workspace } = props;
  return (
    <div style={{ ...layout.pane, background: THEME.panel }}>
      <p style={layout.title}>Accessible fallback — full canonical function without any renderer</p>
      <p style={{ ...layout.small, ...layout.dim }}>
        Renderer unavailable: {props.reason}. The canonical record remains fully interpretable:
        every operation, quantity, validation check and BOQ line below is rendered from the
        engine&apos;s JSON outputs alone (the AISE record carries no renderer fields — proven by
        check <span style={layout.mono}>historical-replay</span>). Staging/applying still works
        through the component forms in the sidebar.
      </p>
      {workspace === null ? (
        <p style={{ ...layout.small, ...layout.dim }}>loading…</p>
      ) : (
        <>
          <h3 style={{ fontSize: 13, marginTop: 12 }}>
            Solution {workspace.solutionId} — version {workspace.versionNumber} ({workspace.versionStatus})
          </h3>
          <table style={layout.table}>
            <tbody>
              <tr>
                <td style={{ ...layout.td, ...layout.dim }}>baseline reality version</td>
                <td style={{ ...layout.td, ...layout.mono }}>{workspace.baselineRealityVersionId}</td>
              </tr>
              <tr>
                <td style={{ ...layout.td, ...layout.dim }}>validation snapshot</td>
                <td style={{ ...layout.td }}>
                  <span style={badgeStyle(workspace.validation.outcome)}>{workspace.validation.outcome}</span>{" "}
                  <span style={{ ...layout.mono, fontSize: 10 }}>{workspace.validation.snapshotId.slice(0, 24)}…</span>
                </td>
              </tr>
              <tr>
                <td style={{ ...layout.td, ...layout.dim }}>state layers</td>
                <td style={{ ...layout.td }}>{workspace.stateLayers.length}</td>
              </tr>
              <tr>
                <td style={{ ...layout.td, ...layout.dim }}>fixture digest</td>
                <td style={{ ...layout.td, ...layout.mono, fontSize: 10 }}>{workspace.fixtureSha256}</td>
              </tr>
            </tbody>
          </table>
          <h3 style={{ fontSize: 13, marginTop: 12 }}>Operations (text projection)</h3>
          <table style={layout.table}>
            <tbody>
              {workspace.operationRecords.map((record) => (
                <tr key={`${record.fixtureOpId}-${record.operationId ?? "none"}`}>
                  <td style={{ ...layout.td, ...layout.mono, fontSize: 10 }}>{record.fixtureOpId}</td>
                  <td style={layout.td}>
                    <button type="button" style={{ ...layout.button, fontSize: 10, padding: "2px 6px" }} onClick={() => props.onSelectOperation(record)}>
                      {record.fixtureType}
                    </button>
                    <div style={{ ...layout.small, ...layout.dim }}>
                      {record.engineType ?? "no engine type"} · {record.quantities
                        .map((quantity) => `${quantity.name} ${quantity.value.toFixed(2)} ${quantity.unit}`)
                        .join(", ")}
                    </div>
                  </td>
                  <td style={layout.td}>
                    <span style={badgeStyle(record.outcome)}>{record.outcome}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <h3 style={{ fontSize: 13, marginTop: 12 }}>Quantities (BOQ text projection, {workspace.boq.lines.length} lines)</h3>
          <table style={layout.table}>
            <tbody>
              {workspace.boq.lines.map((line) => (
                <tr key={line.boqLineId}>
                  <td style={{ ...layout.td }}>{line.itemDescription}</td>
                  <td style={{ ...layout.td, ...layout.mono }}>
                    {line.quantityValue.toFixed(2)} {line.unit}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <h3 style={{ fontSize: 13, marginTop: 12 }}>Scene elements (text projection)</h3>
          <ul style={{ ...layout.small, paddingLeft: 18 }}>
            {props.seeds.map((seed) => (
              <li key={seed.aiseId}>
                <span style={layout.mono}>{seed.aiseId}</span> — {seed.label}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* IFC lane (web-ifc parse — external interop projection)              */
/* ------------------------------------------------------------------ */

interface IfcElementRow {
  readonly ifcType: string;
  readonly globalId: string;
  readonly name: string;
}

export function IfcPane(props: { readonly aiseIds: readonly string[] }): React.JSX.Element {
  const [status, setStatus] = useState<string>("idle");
  const [elements, setElements] = useState<readonly IfcElementRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async (): Promise<void> => {
    setStatus("loading web-ifc (That Open wasm)…");
    setError(null);
    try {
      const WebIfc = await import("web-ifc");
      setStatus("initializing wasm…");
      const api = new WebIfc.IfcAPI();
      api.SetWasmPath("/", true);
      await api.Init();
      setStatus("fetching + parsing fixture IFC…");
      const response = await fetch("/api/spike/ifc");
      const buffer = new Uint8Array(await response.arrayBuffer());
      const modelID = api.OpenModel(buffer, { COORDINATE_TO_ORIGIN: false });
      const rows: IfcElementRow[] = [];
      const wanted = [
        { type: WebIfc.IFCWALL, label: "IfcWall" },
        { type: WebIfc.IFCWALLSTANDARDCASE, label: "IfcWallStandardCase" },
        { type: WebIfc.IFCOPENINGELEMENT, label: "IfcOpeningElement" },
        { type: WebIfc.IFCDOOR, label: "IfcDoor" },
        { type: WebIfc.IFCWINDOW, label: "IfcWindow" },
        { type: WebIfc.IFCCOLUMN, label: "IfcColumn" },
        { type: WebIfc.IFCSLAB, label: "IfcSlab" },
        { type: WebIfc.IFCFOOTING, label: "IfcFooting" },
        { type: WebIfc.IFCBEAM, label: "IfcBeam" },
      ];
      for (const entry of wanted) {
        const ids = api.GetLineIDsWithType(modelID, entry.type);
        for (let index = 0; index < ids.size(); index += 1) {
          const lineID = ids.get(index);
          const line = api.GetLine(modelID, lineID) as { GlobalId?: { value: string }; Name?: { value: string } };
          rows.push({
            ifcType: entry.label,
            globalId: line.GlobalId?.value ?? "?",
            name: line.Name?.value ?? "",
          });
        }
      }
      api.CloseModel(modelID);
      setElements(rows);
      setStatus(`parsed ${rows.length} IFC elements`);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
      setStatus("web-ifc unavailable — lane degraded (honest verdict, see evidence)");
    }
  };

  return (
    <div style={{ ...layout.pane, background: THEME.panel }}>
      <p style={layout.title}>IFC interop lane — web-ifc (That Open) parse</p>
      <p style={{ ...layout.small, ...layout.dim }}>
        Loads the spike-authored IFC4 projection of the same fixture through web-ifc&apos;s wasm
        parser in the browser. IFC GUIDs are EXTERNAL references — the AISE ids below are the
        canonical join keys (charter §2). This lane is presentation/interop only: nothing parsed
        here enters the Reality Graph or Solution Graph.
      </p>
      <div style={layout.row}>
        <button type="button" style={layout.buttonPrimary} onClick={() => void load()}>
          Load fixture IFC with web-ifc
        </button>
        <span style={{ ...layout.small, ...layout.dim }}>status: {status}</span>
      </div>
      {error !== null ? (
        <p style={{ ...layout.small, color: THEME.bad, marginTop: 8 }}>
          web-ifc error: {error} — the sandbox continues to function without this lane (renderer
          fallback demonstrated).
        </p>
      ) : null}
      {elements !== null ? (
        <table style={{ ...layout.table, marginTop: 10 }}>
          <thead>
            <tr>
              <th style={layout.th}>IFC entity</th>
              <th style={layout.th}>GlobalId (external ref)</th>
              <th style={layout.th}>Name</th>
              <th style={layout.th}>AISE reference (canonical)</th>
            </tr>
          </thead>
          <tbody>
            {elements.map((element) => (
              <tr key={element.globalId + element.ifcType}>
                <td style={layout.td}>{element.ifcType}</td>
                <td style={{ ...layout.td, ...layout.mono, fontSize: 10 }}>{element.globalId}</td>
                <td style={layout.td}>{element.name}</td>
                <td style={{ ...layout.td, ...layout.mono, fontSize: 10 }}>
                  {props.aiseIds.find((id) => element.name.toLowerCase().includes(id)) ?? "— (interop-only entity)"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Staging form (parameter fields driven by the engine profile)         */
/* ------------------------------------------------------------------ */

export interface StagingFormProps {
  readonly spec: ComponentSpec;
  readonly points: readonly { readonly x: number; readonly z: number }[];
  readonly values: Record<string, string>;
  readonly busy: boolean;
  readonly onValueChange: (name: string, value: string) => void;
  readonly onStage: () => void;
  readonly onCancel: () => void;
}

export function StagingForm(props: StagingFormProps): React.JSX.Element {
  const pointsNeeded = props.spec.pointsRequired;
  const placed = props.points.length;
  const complete = placed >= pointsNeeded;
  return (
    <div style={layout.section}>
      <p style={layout.sectionTitle}>Staging — {props.spec.label}</p>
      <p style={{ ...layout.small, ...layout.dim }}>{props.spec.note}</p>
      {pointsNeeded > 0 ? (
        <p style={{ ...layout.small, marginTop: 4 }}>
          Placement points: {placed}/{pointsNeeded}
          {complete ? " ✓ (click Stage to preview)" : " — click in the plan or 3D view"}
        </p>
      ) : null}
      <div style={{ ...layout.row, marginTop: 6 }}>
        {props.spec.fields.map((field) => (
          <label key={field.name} style={{ fontSize: 11, color: THEME.textDim }}>
            {field.label}
            <input
              style={layout.input}
              value={props.values[field.name] ?? ""}
              onChange={(event) => {
                props.onValueChange(field.name, event.target.value);
              }}
            />
            {field.unit !== "" ? ` ${field.unit}` : ""}
          </label>
        ))}
      </div>
      <div style={{ ...layout.row, marginTop: 8 }}>
        <button type="button" style={layout.buttonPrimary} onClick={props.onStage} disabled={props.busy || !complete}>
          Stage &amp; preview (engine dry-run)
        </button>
        <button type="button" style={layout.button} onClick={props.onCancel} disabled={props.busy}>
          Cancel
        </button>
      </div>
      <p style={{ ...layout.small, ...layout.dim, marginTop: 6 }}>
        Calm staged workflow: stage → engine preview → review consequences → apply. Nothing is
        recorded until Apply.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Status strip                                                        */
/* ------------------------------------------------------------------ */

export function StatusStrip(props: { readonly message: string | null; readonly workspace: WorkspaceDto | null }): React.JSX.Element {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    setVisible(true);
    const timer = setTimeout(() => {
      setVisible(false);
    }, 12000);
    return () => {
      clearTimeout(timer);
    };
  }, [props.message]);
  if (props.message === null || !visible) {
    return (
      <div style={{ padding: "6px 16px", background: THEME.panelAlt, borderTop: `1px solid ${THEME.border}`, fontSize: 11, color: THEME.textDim }}>
        {props.workspace === null
          ? "loading workspace…"
          : `fixture ${props.workspace.fixtureId} · ${props.workspace.solutionId} v${props.workspace.versionNumber} · validation: ${props.workspace.validation.outcome} · ${props.workspace.boq.lines.length} BOQ lines`}
      </div>
    );
  }
  return (
    <div style={{ padding: "6px 16px", background: THEME.accentSoft, borderTop: `1px solid ${THEME.accent}`, fontSize: 12 }}>
      {props.message}
    </div>
  );
}

export function useMemoSeedSignature(seeds: readonly SceneElementSeed[]): string {
  return useMemo(() => seeds.map((seed) => seed.aiseId).join(","), [seeds]);
}

export { componentOf };
