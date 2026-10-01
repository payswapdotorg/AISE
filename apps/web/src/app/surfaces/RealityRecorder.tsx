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

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  Card,
  CreateField,
  CreateRecordPanel,
  DataBadge,
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
  loadActivePlanContextLive,
  loadEvidenceIndexLive,
  uploadCaptureAssetLive,
  webCryptoSha256,
  type AssetDigest,
  type CaptureAssetUploadRecord,
  type EvidenceRegistrationRecord,
} from "../api";
import {
  PLAN_CONTEXT_ANNOTATION_NODE_ID,
  PLAN_CONTEXT_KIND_OPTIONS,
  PLAN_IMPORT_ACQUISITION_METHOD,
  REALITY_EPISTEMIC_STATUSES,
  REALITY_NODE_KINDS,
  REALITY_RELATIONSHIP_KINDS,
  activePlanContextChangeRecord,
  planBytesPath,
  planContextRecord,
  planImageUploadDefect,
  planRasterOptionsFromLive,
  realitySnapshotRequestBody,
  validatePlanImportDraft,
  validateRealitySnapshotDraft,
  type PlanImportDraft,
  type PlanRasterOption,
  type RealitySnapshotDraft,
} from "../reality-recorder";
// ANCHOR-003a (read-only consumer): the PlanContext type comes from the
// contract's own request module — never the barrel index (which
// re-exports the supervised runner's node:child_process).
import type { PlanContext } from "../../../../../packages/anchoring-contract/src/request";
import { defaultOrganizationId } from "./Projects";
import { EvidenceRegistrationPanel } from "./CaptureMission";

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
    <>
      {/* ANCHOR-003a: the plan-context seam — the readable plan/floor-context
          surface FIRST (the import lane + the list/select/activate card),
          then the composed snapshot recorder. One surface, one discipline:
          the plan panel writes through the SAME governed changes API. */}
      <PlanContextPanel
        projectId={projectField.trim()}
        mode={mode}
        principalId={principalId}
        fetchImpl={fetchImpl}
        onRecorded={onRecorded}
        withImport={true}
      />
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
    </>
  );
}

/* ================================================================== */
/* ANCHOR-003a — the plan-context seam panels                           */
/*                                                                      */
/* The reality recorder's readable plan/floor-context surface (the      */
/* work order's two legs):                                             */
/*                                                                      */
/*  1. the IMPORT lane (`PlanImportCard`, the recorder surface only):   */
/*     one image file → the PRE-UPLOAD GATE (a non-image media type     */
/*     is refused BY NAME before the bytes are read, hashed or POSTed   */
/*     — fail closed BEFORE side effects) → the EXISTING                */
/*     digest→asset→registration path (`webCryptoSha256` →              */
/*     `uploadCaptureAssetLive` → the single `EvidenceRegistrationPanel`*/
/*     with the plan lane's honest DOCUMENT_REGION prefill — the        */
/*     register stays the authority, never a new storage seam);         */
/*                                                                      */
/*  2. the LIST/SELECT/ACTIVATE card (`PlanContextSelectCard`, the      */
/*     recorder surface AND the Intervention Studio — one component,    */
/*     two mounts, no fork): the imported plan rasters are listed from  */
/*     the live evidence register (uninvalidated image documents),     */
/*     the ACTIVE plan context is read back from the project's latest  */
/*     graph version through the typed reader, and selecting a raster  */
/*     declares its rasterToScene convention (the HANDEDNESS LAW's      */
/*     closed literals east-right/north-up carried from the anchoring  */
/*     contract) and records it through the EXISTING governed changes  */
/*     API as ONE annotation node under the STABLE id                   */
/*     `active-plan-context` — at most one active plan context per     */
/*     version, by construction. NO anchoring execution happens here.  */
/* ================================================================== */

/** The honest states of the plan-raster options load (the register read). */
type PlanRasterOptionsStatus =
  | { readonly kind: "loading" }
  | { readonly kind: "failed"; readonly message: string }
  | { readonly kind: "ready"; readonly options: readonly PlanRasterOption[] };

/** The honest states of the active-plan-context read (the graph read). */
type ActivePlanContextStatus =
  | { readonly kind: "loading" }
  | { readonly kind: "failed"; readonly message: string }
  | { readonly kind: "ready"; readonly active: PlanContext | null; readonly versionId: string | null };

/** The upload leg's honest outcome (verbatim gateway fields, or the typed refusal). */
type PlanUploadOutcome =
  | { readonly kind: "stored" | "duplicate"; readonly record: CaptureAssetUploadRecord; readonly endpoint: string }
  | { readonly kind: "refused"; readonly detail: string }
  | { readonly kind: "failed"; readonly detail: string };

/**
 * ANCHOR-003a — the plan-context panel (ONE component, two mounts): the
 * recorder surface mounts it WITH the import lane (`withImport`), the
 * Intervention Studio mounts it WITHOUT (list/select only — importing
 * stays the recorder surface's lane). The registration callback
 * auto-selects the freshly registered raster in the list below, so the
 * import flow ends exactly where the work order's scope ends: at the
 * declared plan-context record.
 */
export function PlanContextPanel({
  projectId,
  mode,
  principalId,
  fetchImpl,
  onRecorded,
  withImport,
}: {
  readonly projectId: string;
  readonly mode: "demo" | "api";
  readonly principalId: string;
  readonly fetchImpl: (input: string, init?: RequestInit) => Promise<Response>;
  readonly onRecorded: () => void;
  /** Render the import lane above the list/select card (the recorder surface). */
  readonly withImport: boolean;
}): ReactNode {
  const [optionsStatus, setOptionsStatus] = useState<PlanRasterOptionsStatus>({ kind: "loading" });
  const [activeStatus, setActiveStatus] = useState<ActivePlanContextStatus>({ kind: "loading" });
  const [autoSelectContentId, setAutoSelectContentId] = useState<string | null>(null);

  const reloadOptions = useCallback(() => {
    if (mode !== "api") {
      setOptionsStatus({ kind: "ready", options: [] });
      return;
    }
    setOptionsStatus({ kind: "loading" });
    void loadEvidenceIndexLive(fetchImpl).then((result) => {
      if (!result.ok) {
        setOptionsStatus({ kind: "failed", message: describeApiFailure(result.failure) });
        return;
      }
      setOptionsStatus({ kind: "ready", options: planRasterOptionsFromLive(result.items) });
    });
  }, [fetchImpl, mode]);

  const reloadActive = useCallback(() => {
    if (mode !== "api") {
      setActiveStatus({ kind: "ready", active: null, versionId: null });
      return;
    }
    setActiveStatus({ kind: "loading" });
    void loadActivePlanContextLive(fetchImpl, projectId).then((result) => {
      if (!result.ok) {
        setActiveStatus({ kind: "failed", message: describeApiFailure(result.failure) });
        return;
      }
      setActiveStatus({ kind: "ready", active: result.active, versionId: result.versionId });
    });
  }, [fetchImpl, mode, projectId]);

  useEffect(() => {
    reloadOptions();
  }, [reloadOptions]);

  useEffect(() => {
    reloadActive();
  }, [reloadActive]);

  return (
    <>
      {withImport ? (
        <PlanImportCard
          projectId={projectId}
          mode={mode}
          fetchImpl={fetchImpl}
          onRegistered={(contentId) => {
            setAutoSelectContentId(contentId);
            reloadOptions();
          }}
        />
      ) : null}
      <PlanContextSelectCard
        projectId={projectId}
        mode={mode}
        principalId={principalId}
        fetchImpl={fetchImpl}
        optionsStatus={optionsStatus}
        activeStatus={activeStatus}
        autoSelectContentId={autoSelectContentId}
        onActivated={() => {
          reloadActive();
          onRecorded();
        }}
      />
    </>
  );
}

/**
 * The plan lane's IMPORT card: one image file → the pre-upload gate →
 * the EXISTING digest→asset path → the single registration panel with
 * the plan lane's honest DOCUMENT_REGION prefill. The panel never
 * invents content: every prefilled field comes from the upload's own
 * record; the register stays the authority.
 */
function PlanImportCard({
  projectId,
  mode,
  fetchImpl,
  onRegistered,
}: {
  readonly projectId: string;
  readonly mode: "demo" | "api";
  readonly fetchImpl: (input: string, init?: RequestInit) => Promise<Response>;
  /** Reports the register's own content id after a successful registration. */
  readonly onRegistered: (contentId: string) => void;
}): ReactNode {
  const demo = mode !== "api";
  const digest = useMemo<AssetDigest | null>(() => webCryptoSha256(), []);
  const [file, setFile] = useState<{ readonly name: string; readonly byteSize: number; readonly mediaType: string } | null>(null);
  const [bytes, setBytes] = useState<Uint8Array | null>(null);
  const [reading, setReading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [uploadOutcome, setUploadOutcome] = useState<PlanUploadOutcome | null>(null);
  const [registration, setRegistration] = useState<EvidenceRegistrationRecord | null>(null);

  const onFileSelected = useCallback((selected: File | null) => {
    setUploadOutcome(null);
    setRegistration(null);
    if (selected === null) {
      setFile(null);
      setBytes(null);
      return;
    }
    const mediaType = selected.type === "" ? "application/octet-stream" : selected.type;
    // THE PRE-UPLOAD GATE: a non-image media type is refused BY NAME
    // before the bytes are read, hashed or POSTed (fail closed BEFORE
    // side effects — zero bytes move on refusal).
    const defect = planImageUploadDefect(mediaType);
    if (defect !== null) {
      setFile(null);
      setBytes(null);
      setUploadOutcome({ kind: "refused", detail: defect });
      return;
    }
    setReading(true);
    void selected.arrayBuffer().then((buffer) => {
      setBytes(new Uint8Array(buffer));
      setFile({
        name: selected.name,
        byteSize: selected.size,
        mediaType,
      });
      setReading(false);
    });
  }, []);

  const submitUpload = useCallback(async () => {
    if (demo || digest === null || bytes === null || file === null || reading || submitting) {
      return;
    }
    setSubmitting(true);
    setUploadOutcome(null);
    setRegistration(null);
    const result = await uploadCaptureAssetLive(fetchImpl, digest, bytes, file.mediaType);
    setSubmitting(false);
    if (result.ok) {
      setUploadOutcome({
        kind: result.record.outcome === "STORED" ? "stored" : "duplicate",
        record: result.record,
        endpoint: result.endpoint,
      });
      return;
    }
    setUploadOutcome({ kind: "failed", detail: describeApiFailure(result.failure) });
  }, [bytes, demo, digest, fetchImpl, file, reading, submitting]);

  const ready = !demo && digest !== null && file !== null && !reading;

  return (
    <Card
      title="Import a plan image"
      badge={demo ? <DataBadge mode="demo" /> : <DataBadge mode="api" />}
      meta={
        <span>
          one plan image → sha-256 content address → the content-addressed
          store → the evidence register (the PROD-016/016b path, reused —
          never a new storage seam)
        </span>
      }
    >
      <p>
        The anchoring seam consumes plan context of kind{" "}
        <span className="mono">plan-raster</span> — an imported plan drawing
        whose raster convention (scale, world origin and the east-right /
        north-up handedness law) is DECLARED, never assumed. This card walks
        the existing capture path: the bytes are hashed client-side (a
        transport step — the gateway re-verifies server-side), stored in the
        content-addressed store, then registered as an evidence DOCUMENT_REGION
        (an imported drawing, not a photo). The declaration and activation
        happen in the panel below once the raster is registered.
      </p>
      <div className="field">
        <label htmlFor="plan-image-file">Plan image file (raster images only)</label>
        <input
          id="plan-image-file"
          type="file"
          accept="image/*"
          onChange={(event) => {
            onFileSelected(event.target.files?.[0] ?? null);
          }}
        />
        <p className="pane-foot">
          The gate refuses non-image content BY NAME before any upload happens
          (zero side effects on refusal).
        </p>
      </div>
      {reading ? (
        <p className="pane-foot" data-reading="true">
          Reading the selected file…
        </p>
      ) : null}
      {file !== null ? (
        <p className="pane-foot" data-plan-file="true">
          Selected: <span className="mono">{file.name}</span> ·{" "}
          <span className="mono">{file.mediaType}</span> ·{" "}
          {String(file.byteSize)} bytes
        </p>
      ) : null}
      {demo ? (
        <div className="callout callout-warning" data-demo-notice="true">
          Importing requires the live API — this deployment renders the demo
          dataset, and the shell never fabricates writes or evidence.
        </div>
      ) : digest === null ? (
        <div className="callout callout-warning" data-digest-notice="true">
          This platform does not expose a sha-256 digest (Web Crypto is
          absent) — the plan lane cannot compute the content address, so no
          upload is offered (the honest blocked state, never a fallback hash).
        </div>
      ) : null}
      <div className="toolbar">
        <button
          type="button"
          className="button"
          disabled={demo || digest === null || !ready || submitting}
          data-plan-upload-state={demo ? "demo" : digest === null ? "no-digest" : ready ? (submitting ? "submitting" : "ready") : "waiting"}
          onClick={() => {
            void submitUpload();
          }}
        >
          {submitting ? "Uploading…" : "Upload to the content-addressed store"}
        </button>
      </div>
      {uploadOutcome === null ? null : uploadOutcome.kind === "refused" ? (
        <div className="callout callout-warning" data-outcome="refused" role="alert">
          <p>
            <strong>The file was refused before any upload.</strong> {uploadOutcome.detail}
          </p>
        </div>
      ) : uploadOutcome.kind === "failed" ? (
        <div className="callout callout-warning" data-outcome="failed" role="alert">
          <p>
            <strong>The upload was refused.</strong> {uploadOutcome.detail}
          </p>
        </div>
      ) : (
        <div className="callout callout-info" data-outcome="created" role="status">
          <p>
            <strong>{uploadOutcome.kind === "stored" ? "Stored." : "Already stored (duplicate)."}</strong>{" "}
            Content id <span className="mono">{uploadOutcome.record.contentId}</span> ·{" "}
            {uploadOutcome.record.mediaType} · {String(uploadOutcome.record.byteSize)} bytes. The
            gateway re-computed and verified the digest server-side (STORED | DUPLICATE is its own
            idempotent answer).
          </p>
          <p className="mono">{uploadOutcome.endpoint}</p>
        </div>
      )}
      {!demo && uploadOutcome !== null && uploadOutcome.kind !== "failed" && uploadOutcome.kind !== "refused" ? (
        <EvidenceRegistrationPanel
          key={uploadOutcome.record.contentId}
          projectId={projectId}
          fetchImpl={fetchImpl}
          record={uploadOutcome.record}
          capturedAtDefault={new Date().toISOString()}
          initialAcquisitionMethod={PLAN_IMPORT_ACQUISITION_METHOD}
          onRegistered={(record) => {
            setRegistration(record);
            onRegistered(record.contentId);
          }}
        />
      ) : null}
      {registration !== null ? (
        <div className="callout callout-info" data-plan-registered="true" role="status">
          <p>
            <strong>Registered as evidence.</strong> The plan raster{" "}
            <span className="mono">{registration.contentId}</span> is now in the register and is
            auto-selected in the plan-context panel below — declare its raster convention there and
            record it as the active plan context.
          </p>
        </div>
      ) : null}
    </Card>
  );
}

/**
 * The LIST/SELECT/ACTIVATE card: the readable plan-context surface. The
 * imported plan rasters are listed from the live evidence register; the
 * currently active plan context is read back from the project's latest
 * graph version (the typed reader, contract-validated); selecting a
 * raster and declaring its convention records ONE governed change set —
 * the annotation node under the stable id `active-plan-context` —
 * through the same brokered `reality:write` offer the snapshot recorder
 * uses. No anchoring execution happens here (a separate lane).
 */
function PlanContextSelectCard({
  projectId,
  mode,
  principalId,
  fetchImpl,
  optionsStatus,
  activeStatus,
  autoSelectContentId,
  onActivated,
}: {
  readonly projectId: string;
  readonly mode: "demo" | "api";
  readonly principalId: string;
  readonly fetchImpl: (input: string, init?: RequestInit) => Promise<Response>;
  readonly optionsStatus: PlanRasterOptionsStatus;
  readonly activeStatus: ActivePlanContextStatus;
  readonly autoSelectContentId: string | null;
  readonly onActivated: () => void;
}): ReactNode {
  const [organizationId, setOrganizationId] = useState(() => defaultOrganizationId(mode === "demo"));
  const [selectedContentId, setSelectedContentId] = useState("");
  const [planId, setPlanId] = useState("");
  const [pixelsPerMeter, setPixelsPerMeter] = useState("");
  const [worldOriginX, setWorldOriginX] = useState("");
  const [worldOriginY, setWorldOriginY] = useState("");
  const [offer, setOffer] = useState<CreateActionOffer | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [outcome, setOutcome] = useState<CreatePanelOutcome | null>(null);

  // The import lane's registration auto-selects the fresh raster here.
  useEffect(() => {
    if (autoSelectContentId !== null) {
      setSelectedContentId(autoSelectContentId);
    }
  }, [autoSelectContentId]);

  const options =
    optionsStatus.kind === "ready" ? optionsStatus.options : [] as readonly PlanRasterOption[];
  const selectedOption =
    selectedContentId === ""
      ? null
      : options.find((option) => option.contentId === selectedContentId) ?? null;

  const draft: PlanImportDraft = {
    kind: "plan-raster",
    planId,
    imageContentId: selectedContentId,
    imageMediaType: selectedOption === null ? "" : selectedOption.mediaType,
    bytesPath: selectedContentId === "" ? "" : planBytesPath(selectedContentId),
    pixelsPerMeter,
    worldOriginX,
    worldOriginY,
    xDirection: "east-right",
    yDirection: "north-up",
  };
  const selectionDefect =
    selectedContentId === ""
      ? ["select an imported plan raster first — the list reads the live evidence register"]
      : [];
  const defects = [...selectionDefect, ...validatePlanImportDraft(draft)];
  const askable = mode === "api" && organizationId.trim() !== "" && projectId !== "";

  useEffect(() => {
    if (!askable) {
      setOffer(null);
      return;
    }
    let cancelled = false;
    void resolveCreateActionOffer({
      authorization: createLiveAuthorizationPort(fetchImpl),
      descriptor: createRecordAction({
        actionId: "record-plan-context",
        label: "Record the active plan context",
        permission: "reality:write",
        sourceModule: "reality",
      }),
      bindingId: "reality:record-plan-context",
      returnTo: { module: "reality", projectId },
      principalId,
      target: { kind: "project", organizationId, projectId },
    }).then((resolved) => {
      if (!cancelled) {
        setOffer(resolved);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [askable, fetchImpl, organizationId, principalId, projectId]);

  const submit = useCallback(async () => {
    if (mode !== "api" || defects.length > 0 || submitting) {
      return;
    }
    setSubmitting(true);
    setOutcome(null);
    // Leg 1: ensure the reality project exists (project_exists = honest ok).
    const ensured = await ensureRealityProjectLive(fetchImpl, projectId);
    if (!ensured.ok) {
      setSubmitting(false);
      setOutcome({ kind: "failed", detail: describeApiFailure(ensured.failure) });
      return;
    }
    // Leg 2: the contract-validated plan-context record → the annotation
    // change record → the governed changes API.
    const record = planContextRecord(draft);
    if (!record.ok) {
      setSubmitting(false);
      setOutcome({ kind: "failed", detail: record.defects.join("; ") });
      return;
    }
    const change = activePlanContextChangeRecord(record.record, new Date().toISOString());
    const applied = await applyRealityChangesLive(fetchImpl, projectId, [change]);
    setSubmitting(false);
    if (!applied.ok) {
      setOutcome({ kind: "failed", detail: describeApiFailure(applied.failure) });
      return;
    }
    setOutcome({
      kind: "created",
      detail: `Active plan context recorded in version ${applied.record.versionId} — plan ${record.record.planId} (${record.record.kind}, ${String(record.record.rasterToScene.pixelsPerMeter)} px/m, origin [${String(record.record.rasterToScene.worldOriginPx[0])}, ${String(record.record.rasterToScene.worldOriginPx[1])}] px, ${record.record.rasterToScene.xDirection}/${record.record.rasterToScene.yDirection}). The anchoring seam reads it from the graph now.`,
      endpoint: applied.endpoint,
    });
    onActivated();
  }, [defects.length, draft, fetchImpl, mode, onActivated, projectId, submitting]);

  return (
    <CreateRecordPanel
      id="record-plan-context"
      title="Plan context — list & activate"
      intro={`The readable plan-context surface: list the imported plan rasters (the evidence register's image documents), declare the selected raster's convention — the rasterToScene HANDEDNESS LAW is carried from the anchoring contract as closed literals (x east-right · y north-up), never an assumption — and record it as the project's ACTIVE plan context through the governed changes API (one annotation node under the stable id ${PLAN_CONTEXT_ANNOTATION_NODE_ID}). No anchoring execution happens here.`}
      offer={offer}
      mode={mode}
      draftValid={defects.length === 0}
      defects={defects}
      submitting={submitting}
      outcome={outcome}
      onSubmit={() => {
        void submit();
      }}
      submitLabel="Record the active plan context"
    >
      <fieldset className="picker" data-plan-active="true">
        <legend>The active plan context (read back from the reality graph)</legend>
        {activeStatus.kind === "loading" ? (
          <p className="state-guidance" data-plan-active-state="loading">
            Reading the project&apos;s latest version…
          </p>
        ) : activeStatus.kind === "failed" ? (
          <p className="state-guidance" data-plan-active-state="failed">
            The active plan context could not be read back: {activeStatus.message}
          </p>
        ) : activeStatus.active === null ? (
          <p className="state-guidance" data-plan-active-state="none">
            No active plan context recorded for this project yet — the honest empty state (the
            anchoring seam refuses with plan-context-missing until one is recorded).
          </p>
        ) : (
          <ul className="notes-list" data-plan-active-state="ready">
            <li>
              kind <span className="mono">{activeStatus.active.kind}</span> · plan{" "}
              <span className="mono">{activeStatus.active.planId}</span>
            </li>
            <li>
              content id <span className="mono">{activeStatus.active.imageContentId}</span> (
              {activeStatus.active.imageMediaType})
            </li>
            <li>
              convention{" "}
              <span className="mono">
                {String(activeStatus.active.rasterToScene.pixelsPerMeter)} px/m
              </span>{" "}
              · origin{" "}
              <span className="mono">
                [{String(activeStatus.active.rasterToScene.worldOriginPx[0])},{" "}
                {String(activeStatus.active.rasterToScene.worldOriginPx[1])}] px
              </span>{" "}
              ·{" "}
              <span className="mono">
                {activeStatus.active.rasterToScene.xDirection}/{activeStatus.active.rasterToScene.yDirection}
              </span>
            </li>
            <li>
              bytes pinned at <span className="mono">{activeStatus.active.bytesPath}</span>
            </li>
          </ul>
        )}
      </fieldset>
      <div className="field">
        <label htmlFor="field-plan-raster">Imported plan raster (from the live evidence register)</label>
        {optionsStatus.kind === "loading" ? (
          <p className="state-guidance" data-plan-options-state="loading">
            Loading the evidence register…
          </p>
        ) : optionsStatus.kind === "failed" ? (
          <p className="state-guidance" data-plan-options-state="failed">
            The evidence register could not be loaded: {optionsStatus.message}
          </p>
        ) : options.length === 0 ? (
          <p className="state-guidance" data-plan-options-state="empty">
            The register carries no imported plan rasters yet — an image document (DOCUMENT_REGION
            registration) appears here after the import lane above (the reality recorder surface)
            stores and registers one.
          </p>
        ) : (
          <select
            id="field-plan-raster"
            value={selectedContentId}
            onChange={(event) => {
              setSelectedContentId(event.target.value);
            }}
          >
            <option value="">— select a plan raster —</option>
            {options.map((option) => (
              <option key={option.contentId} value={option.contentId}>
                {option.caption}
              </option>
            ))}
          </select>
        )}
        <p className="pane-foot">
          The list filter is honest about what it reads: UNINVALIDATED evidence records whose media
          type is an image and whose acquisition method is DOCUMENT_REGION (an imported drawing —
          the plan lane&apos;s own registration discipline). The register is the authority.
        </p>
      </div>
      <CreateField
        label="Plan id"
        value={planId}
        onChange={setPlanId}
        placeholder="plan-riverside-ground-floor"
        hint="The AISE-owned plan identity (1..256 characters) — echoed by the anchoring contract, never invented."
      />
      <CreateField
        label="Organization id"
        value={organizationId}
        onChange={setOrganizationId}
        hint="The authorization question's target (reality:write); prefilled from the acting context — hand-entry stays."
      />
      <CreateField
        label="Raster scale — pixels per meter"
        value={pixelsPerMeter}
        onChange={setPixelsPerMeter}
        placeholder="200"
        hint="The declared raster scale (strictly positive) — the plan raster's pixels-per-meter."
      />
      <CreateField
        label="World origin x (pixels)"
        value={worldOriginX}
        onChange={setWorldOriginX}
        placeholder="1280"
        hint="The raster pixel whose scene coordinates are the floor origin (x=0, y=0) — x component."
      />
      <CreateField
        label="World origin y (pixels)"
        value={worldOriginY}
        onChange={setWorldOriginY}
        placeholder="720"
        hint="The raster pixel whose scene coordinates are the floor origin — y component."
      />
      {selectedOption !== null ? (
        <p className="pane-foot" data-plan-selected="true">
          Selected raster: <span className="mono">{selectedOption.contentId}</span> ·{" "}
          {selectedOption.mediaType} · bytes pinned at{" "}
          <span className="mono">{planBytesPath(selectedOption.contentId)}</span>
        </p>
      ) : null}
      <p className="pane-foot">
        The rasterToScene HANDEDNESS LAW (closed literals, carried from the anchoring contract —{" "}
        <span className="mono">anchor002-anchoring-contract/1</span>): x{" "}
        <span className="mono">east-right</span> · y <span className="mono">north-up</span>. The
        closed plan-context kind vocabulary is{" "}
        <span className="mono">{PLAN_CONTEXT_KIND_OPTIONS.join("|")}</span> — anything else is
        refused with the kind named. The plan-context record is validated by the contract&apos;s own
        schema before it is recorded — the typed shape is carried from the contract, never
        reinvented here.
      </p>
    </CreateRecordPanel>
  );
}
