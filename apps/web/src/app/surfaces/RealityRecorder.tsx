/**
 * PROD-016 — the reality RECORDER panel (the reality-materialization seam).
 *
 * The parity scorecard's open item #1 (2026-09-29): "a UI path from
 * captured evidence to a first reality version" — the one place a
 * first-time user still needed the API to cross capture → reality →
 * intervention. This panel composes the first (or next) reality version
 * FROM THE UI with evidence provenance:
 *
 *  - ensure the reality project exists (`POST /v1/reality/projects`,
 *    `project_exists` is an honest "already exists", never a failure);
 *  - compose nodes (closed NodeKind + epistemic vocabularies, `key = value
 *    unit` property lines — the append-step parser, reused) and optional
 *    relationships between them;
 *  - every node/relation carries at least one provenance source (live
 *    register evidence via the picker, and/or a derivation note) — the
 *    engine's `missing_provenance` refusal pre-checked client-side;
 *  - submit through the governed changes API (`POST
 *    /v1/reality/projects/:id/changes`) under a brokered `reality:write`
 *    offer — the create-panel chassis (authorization note, demo notice,
 *    named defects, explicit outcomes) is reused, not forked.
 *
 * The panel NEVER invents content: evidence options come from the live
 * register's own records; every typed refusal surfaces verbatim.
 */

import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import {
  CreateField,
  CreateRecordPanel,
  EvidencePicker,
  type CreatePanelOutcome,
  type EvidencePickerStatus,
} from "../components";
import {
  createRecordAction,
  idListFromField,
  resolveCreateActionOffer,
  type CreateActionOffer,
} from "../create-forms";
import { evidenceOptionsFromLive, toggleEvidenceId } from "../evidence-picker";
import {
  applyRealityChangesLive,
  createLiveAuthorizationPort,
  describeApiFailure,
  ensureRealityProjectLive,
  loadEvidenceIndexLive,
} from "../api";
import {
  REALITY_EPISTEMIC_STATUSES,
  REALITY_NODE_KINDS,
  REALITY_RELATIONSHIP_KINDS,
  realitySnapshotRequestBody,
  validateRealitySnapshotDraft,
  type RealitySnapshotDraft,
} from "../reality-recorder";
import { defaultOrganizationId } from "./Projects";

/** One editable node row (raw user input; the pure draft maps it). */
interface NodeRow {
  readonly nodeId: string;
  readonly kind: string;
  readonly epistemicStatus: string;
  readonly propertyLines: string;
  /** Comma-separated evidence ids (the picker's toggle target). */
  readonly evidenceField: string;
  readonly derivationNote: string;
}

/** One editable relationship row. */
interface RelationRow {
  readonly fromNodeId: string;
  readonly toNodeId: string;
  readonly kind: string;
  readonly evidenceField: string;
  readonly derivationNote: string;
}

const EMPTY_NODE: NodeRow = {
  nodeId: "",
  kind: "site",
  epistemicStatus: "OBSERVED",
  propertyLines: "",
  evidenceField: "",
  derivationNote: "",
};

const EMPTY_RELATION: RelationRow = {
  fromNodeId: "",
  toNodeId: "",
  kind: "contains",
  evidenceField: "",
  derivationNote: "",
};

function nodeOptions(): readonly { readonly value: string; readonly label: string }[] {
  return REALITY_NODE_KINDS.map((kind) => ({ value: kind, label: kind }));
}

function epistemicOptions(): readonly { readonly value: string; readonly label: string }[] {
  return REALITY_EPISTEMIC_STATUSES.map((status) => ({ value: status, label: status }));
}

function relationOptions(): readonly { readonly value: string; readonly label: string }[] {
  return REALITY_RELATIONSHIP_KINDS.map((kind) => ({ value: kind, label: kind }));
}

function toNodeDraft(row: NodeRow) {
  return {
    nodeId: row.nodeId.trim(),
    kind: row.kind,
    epistemicStatus: row.epistemicStatus,
    propertyLines: row.propertyLines,
    provenanceEvidenceIds: idListFromField(row.evidenceField),
    provenanceDerivationNote: row.derivationNote,
  };
}

function toRelationDraft(row: RelationRow) {
  return {
    fromNodeId: row.fromNodeId.trim(),
    toNodeId: row.toNodeId.trim(),
    kind: row.kind,
    provenanceEvidenceIds: idListFromField(row.evidenceField),
    provenanceDerivationNote: row.derivationNote,
  };
}

/**
 * The reality recorder panel. Rendered by the SiteTwin when the project
 * has no reality snapshot yet (or the user chooses to record another
 * version); `onRecorded` fires after a successful write so the surface
 * reloads its live state.
 */
export function RealityRecorderPanel({
  projectId,
  mode,
  principalId,
  fetchImpl,
  onRecorded,
}: {
  readonly projectId: string;
  readonly mode: "demo" | "api";
  readonly principalId: string;
  readonly fetchImpl: (input: string, init?: RequestInit) => Promise<Response>;
  readonly onRecorded: () => void;
}): ReactNode {
  const [projectField, setProjectField] = useState(projectId);
  const [organizationId, setOrganizationId] = useState(() => defaultOrganizationId(mode === "demo"));
  const [nodeRows, setNodeRows] = useState<readonly NodeRow[]>([{ ...EMPTY_NODE }]);
  const [relationRows, setRelationRows] = useState<readonly RelationRow[]>([]);
  const [evidenceStatus, setEvidenceStatus] = useState<EvidencePickerStatus>({ kind: "loading" });
  const [offer, setOffer] = useState<CreateActionOffer | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [outcome, setOutcome] = useState<CreatePanelOutcome | null>(null);

  // The live evidence register feeds every node/relation picker (the same
  // loader the Intervention Studio uses — one register, one discipline).
  useEffect(() => {
    if (mode !== "api") {
      return;
    }
    let cancelled = false;
    setEvidenceStatus({ kind: "loading" });
    void loadEvidenceIndexLive(fetchImpl).then((result) => {
      if (cancelled) {
        return;
      }
      if (!result.ok) {
        setEvidenceStatus({ kind: "failed", message: describeApiFailure(result.failure) });
        return;
      }
      setEvidenceStatus({ kind: "ready", options: evidenceOptionsFromLive(result.items) });
    });
    return () => {
      cancelled = true;
    };
  }, [fetchImpl, mode]);

  const draft: RealitySnapshotDraft = {
    projectId: projectField.trim(),
    nodes: nodeRows.map(toNodeDraft),
    relations: relationRows.map(toRelationDraft),
  };
  const defects = validateRealitySnapshotDraft(draft);
  const askable = mode === "api" && organizationId.trim() !== "" && projectField.trim() !== "";

  useEffect(() => {
    if (!askable) {
      setOffer(null);
      return;
    }
    let cancelled = false;
    void resolveCreateActionOffer({
      authorization: createLiveAuthorizationPort(fetchImpl),
      descriptor: createRecordAction({
        actionId: "record-reality-snapshot",
        label: "Record a reality snapshot",
        permission: "reality:write",
        sourceModule: "reality",
      }),
      bindingId: "reality:record-snapshot",
      returnTo: { module: "reality", projectId: projectField.trim() },
      principalId,
      target: { kind: "project", organizationId, projectId: projectField.trim() },
    }).then((resolved) => {
      if (!cancelled) {
        setOffer(resolved);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [askable, fetchImpl, organizationId, principalId, projectField]);

  const updateNode = useCallback((index: number, patch: Partial<NodeRow>) => {
    setNodeRows((rows) =>
      rows.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)),
    );
  }, []);

  const updateRelation = useCallback((index: number, patch: Partial<RelationRow>) => {
    setRelationRows((rows) =>
      rows.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)),
    );
  }, []);

  const submit = useCallback(async () => {
    if (mode !== "api" || defects.length > 0 || submitting) {
      return;
    }
    setSubmitting(true);
    setOutcome(null);
    // Leg 1: ensure the reality project exists (project_exists = honest ok).
    const ensured = await ensureRealityProjectLive(fetchImpl, draft.projectId);
    if (!ensured.ok) {
      setSubmitting(false);
      setOutcome({ kind: "failed", detail: describeApiFailure(ensured.failure) });
      return;
    }
    // Leg 2: apply the change set through the governed changes API.
    const body = realitySnapshotRequestBody(draft, new Date().toISOString());
    if (!body.ok) {
      setSubmitting(false);
      setOutcome({ kind: "failed", detail: body.defects.join("; ") });
      return;
    }
    const applied = await applyRealityChangesLive(fetchImpl, draft.projectId, body.body.changes);
    setSubmitting(false);
    if (!applied.ok) {
      setOutcome({ kind: "failed", detail: describeApiFailure(applied.failure) });
      return;
    }
    setOutcome({
      kind: "created",
      detail: `Reality version ${applied.record.versionId} recorded over ${applied.record.parentVersionId} — ${String(applied.record.nodeCount)} nodes, ${String(applied.record.relationshipCount)} relationships, ${String(applied.record.changeCount)} change records. The snapshot below is live; the Intervention Studio's baseline picker sees it now.`,
      endpoint: applied.endpoint,
    });
    onRecorded();
  }, [defects.length, draft, fetchImpl, mode, onRecorded, submitting]);

  return (
    <CreateRecordPanel
      id="record-reality-snapshot"
      title="Record a reality snapshot"
      intro="The composed materialization path: assert the site's nodes (closed vocabularies, `key = value unit` property lines) with evidence provenance from the live register, then apply them as one governed change set — the deterministic versioning engine validates and versions it server-side. This is the seam that lets a first-time user cross from captures to a first reality version without developer tools."
      offer={offer}
      mode={mode}
      draftValid={defects.length === 0}
      defects={defects}
      submitting={submitting}
      outcome={outcome}
      onSubmit={() => {
        void submit();
      }}
      submitLabel="Record snapshot"
    >
      <CreateField
        label="Reality project id"
        value={projectField}
        onChange={setProjectField}
        hint="Created first when unknown (POST /v1/reality/projects — an empty v001); an existing project's change set applies onto its latest version."
      />
      <CreateField
        label="Organization id"
        value={organizationId}
        onChange={setOrganizationId}
        hint="The authorization question's target (reality:write); prefilled from the acting context — hand-entry stays."
      />
      {nodeRows.map((row, index) => (
        <fieldset className="picker" data-node-row={String(index + 1)} key={`node-${String(index)}`}>
          <legend>Node {String(index + 1)}</legend>
          <CreateField
            label={`Node ${String(index + 1)} id`}
            value={row.nodeId}
            onChange={(value) => {
              updateNode(index, { nodeId: value });
            }}
            placeholder="site-riverside-01"
            hint="Caller-supplied stable id (1..256 chars, unique in this snapshot)."
          />
          <CreateField
            label={`Node ${String(index + 1)} kind`}
            value={row.kind}
            onChange={(value) => {
              updateNode(index, { kind: value });
            }}
            options={nodeOptions()}
            hint="The closed NodeKind vocabulary, verbatim."
          />
          <CreateField
            label={`Node ${String(index + 1)} epistemic status`}
            value={row.epistemicStatus}
            onChange={(value) => {
              updateNode(index, { epistemicStatus: value });
            }}
            options={epistemicOptions()}
            hint="The engine's no-silent-downgrade ladder: CONFIRMED > OBSERVED > INFERRED > PROPOSED."
          />
          <CreateField
            label={"Node " + String(index + 1) + " property lines (one `key = value unit` per line)"}
            value={row.propertyLines}
            onChange={(value) => {
              updateNode(index, { propertyLines: value });
            }}
            multiline
            placeholder={"name = Riverside site\nlength = 24 m"}
            hint="Numeric values REQUIRE a typed unit (the engine refuses unitless numbers)."
          />
          <EvidencePicker
            status={evidenceStatus}
            value={row.evidenceField}
            onToggle={(evidenceId) => {
              updateNode(index, {
                evidenceField: toggleEvidenceId(row.evidenceField, evidenceId),
              });
            }}
          />
          <CreateField
            label={`Node ${String(index + 1)} evidence ids (comma-separated)`}
            value={row.evidenceField}
            onChange={(value) => {
              updateNode(index, { evidenceField: value });
            }}
            hint="64-hex content addresses from the register — the picker above toggles them."
          />
          <CreateField
            label={`Node ${String(index + 1)} derivation note (optional)`}
            value={row.derivationNote}
            onChange={(value) => {
              updateNode(index, { derivationNote: value });
            }}
            mono={false}
            hint="Evidence OR a derivation note — at least one provenance source is required per node."
          />
        </fieldset>
      ))}
      <div className="toolbar">
        <button
          type="button"
          className="button"
          onClick={() => {
            setNodeRows((rows) => [...rows, { ...EMPTY_NODE, kind: "element" }]);
          }}
        >
          Add a node
        </button>
        {nodeRows.length > 1 ? (
          <button
            type="button"
            className="button"
            onClick={() => {
              setNodeRows((rows) => rows.slice(0, -1));
            }}
          >
            Remove the last node
          </button>
        ) : null}
      </div>
      {relationRows.map((row, index) => (
        <fieldset
          className="picker"
          data-relation-row={String(index + 1)}
          key={`relation-${String(index)}`}
        >
          <legend>Relationship {String(index + 1)}</legend>
          <CreateField
            label={`Relationship ${String(index + 1)} from node id`}
            value={row.fromNodeId}
            onChange={(value) => {
              updateRelation(index, { fromNodeId: value });
            }}
            hint="Must be a node composed above (dangling endpoints are refused)."
          />
          <CreateField
            label={`Relationship ${String(index + 1)} to node id`}
            value={row.toNodeId}
            onChange={(value) => {
              updateRelation(index, { toNodeId: value });
            }}
            hint="Must be a node composed above (dangling endpoints are refused)."
          />
          <CreateField
            label={`Relationship ${String(index + 1)} kind`}
            value={row.kind}
            onChange={(value) => {
              updateRelation(index, { kind: value });
            }}
            options={relationOptions()}
            hint="The closed relationship vocabulary, verbatim."
          />
          <EvidencePicker
            status={evidenceStatus}
            value={row.evidenceField}
            onToggle={(evidenceId) => {
              updateRelation(index, {
                evidenceField: toggleEvidenceId(row.evidenceField, evidenceId),
              });
            }}
          />
          <CreateField
            label={`Relationship ${String(index + 1)} evidence ids (comma-separated)`}
            value={row.evidenceField}
            onChange={(value) => {
              updateRelation(index, { evidenceField: value });
            }}
          />
          <CreateField
            label={`Relationship ${String(index + 1)} derivation note (optional)`}
            value={row.derivationNote}
            onChange={(value) => {
              updateRelation(index, { derivationNote: value });
            }}
            mono={false}
          />
        </fieldset>
      ))}
      <div className="toolbar">
        <button
          type="button"
          className="button"
          onClick={() => {
            setRelationRows((rows) => [...rows, { ...EMPTY_RELATION }]);
          }}
        >
          Add a relationship
        </button>
        {relationRows.length > 0 ? (
          <button
            type="button"
            className="button"
            onClick={() => {
              setRelationRows((rows) => rows.slice(0, -1));
            }}
          >
            Remove the last relationship
          </button>
        ) : null}
      </div>
      <p className="pane-foot">
        The change set applies as ONE version transition: node upserts first,
        relationship upserts after (the engine checks final-state referential
        integrity). The node&apos;s evidence provenance is stamped on the node
        and every property you list for it.
      </p>
    </CreateRecordPanel>
  );
}
